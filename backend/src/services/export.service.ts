import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { processRepository } from '../repositories/process.repository';
import { segmentRepository } from '../repositories/segment.repository';
import { segmentService } from './segment.service';

/** Бинарь ffmpeg (резолвится из PATH; в проде без ffmpeg spawn упадёт с ENOENT). */
const FFMPEG_BIN = 'ffmpeg';

/** Максимальная длительность экспортируемого фрагмента, секунд. */
const MAX_EXPORT_S = 900;

/** Таймаут нарезки (экспорт синхронный, без job-очереди), мс. */
const FFMPEG_TIMEOUT_MS = 30_000;

/** Номинальная длительность изолированного .ts чанка (без соседей в записи), мс. */
const DEFAULT_CHUNK_MS = 2000;

/** Ошибка экспорта с HTTP-статусом для ответа роута. */
export class ExportError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ExportResult {
  mp4Path: string;
  size: number;
  files: number;
}

interface ExportChunk {
  file: string;
  tsMs: number;
  absPath: string;
}

/**
 * Покрытие чанка [tsMs, tsMs+dur): дельта до следующего чанка (плотная запись,
 * контейнер ротирует ~2-13с), для последнего/перед разрывом — дельта до
 * предыдущего. Нереалистичные значения (>60с разрыв между сегментами) заменяются
 * номинальной длительностью чанка.
 */
function chunkCoverage(sorted: ExportChunk[], i: number): number {
  const ts = sorted[i]!.tsMs;
  let dur = DEFAULT_CHUNK_MS;
  if (i + 1 < sorted.length) {
    dur = sorted[i + 1]!.tsMs - ts;
  } else if (i > 0) {
    dur = ts - sorted[i - 1]!.tsMs;
  }
  if (!(dur >= 500 && dur <= 60000)) dur = DEFAULT_CHUNK_MS;
  return dur;
}

/**
 * Чанки, чьё покрытие [ts, ts+dur) пересекает окно [fromMs, toMs).
 * Вход обязан быть отсортирован по tsMs (имена .ts монотонно растут во времени).
 * Срез по гранулярности чанка: чанк, накрывающий from, включается целиком —
 * при конкатенации с -c copy подрезать его нельзя.
 */
export function selectChunksInRange(sorted: ExportChunk[], fromMs: number, toMs: number): ExportChunk[] {
  const picked: ExportChunk[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const chunk = sorted[i]!;
    const endMs = chunk.tsMs + chunkCoverage(sorted, i);
    if (chunk.tsMs < toMs && endMs > fromMs) picked.push(chunk);
  }
  return picked;
}

/** Запустить ffmpeg concat в mp4-файл. stderr пишется в лог только при ошибке. */
function runFfmpeg(args: string[], outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new ExportError(500, 'экспорт прерван по таймауту'));
    }, FFMPEG_TIMEOUT_MS);

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new ExportError(500, `ffmpeg не запустился: ${err.message}`));
    });

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      console.error(`[export] ffmpeg не смог нарезать ${outFile}: exit=${code} signal=${signal}\n${stderr}`);
      reject(new ExportError(500, 'ошибка экспорта видео'));
    });
  });
}

/**
 * Экспорт фрагмента записи процесса: .ts чанки, пересекающие окно
 * [anchor + fromS*1000, anchor + toS*1000], склеиваются ffmpeg (-c copy) в mp4.
 * Возвращает путь к готовому файлу во временном каталоге — каталог удаляет роут
 * после отдачи файла; при ошибке каталог чистится здесь.
 */
export async function exportSegment(processId: string, fromS: number, toS: number): Promise<ExportResult> {
  if (!Number.isFinite(fromS) || !Number.isFinite(toS)) {
    throw new ExportError(400, 'from и to должны быть числами (секунды)');
  }
  if (fromS < 0) throw new ExportError(400, 'from не может быть отрицательным');
  if (toS <= fromS) throw new ExportError(400, 'to должно быть больше from');
  if (toS - fromS > MAX_EXPORT_S) {
    throw new ExportError(400, `максимальная длительность экспорта — ${MAX_EXPORT_S} секунд`);
  }

  const [process, segments] = await Promise.all([
    processRepository.findById(processId),
    segmentRepository.findByProcess(processId),
  ]);
  if (!process) throw new ExportError(404, 'процесс не найден');
  if (segments.length === 0) throw new ExportError(404, 'нет записей для процесса');

  // Anchor окна = timeline.start, как его считает getTimeline (start первого сегмента) —
  // та же ось, что у timeOffsetS инцидентов и startOffsetS сегментов.
  const timeline = segmentService.getTimeline(segments, process.status === 'running', process.startedAt);
  if (!timeline.start) throw new ExportError(404, 'нет записей для процесса');
  const anchorMs = new Date(timeline.start).getTime();
  const fromMs = anchorMs + fromS * 1000;
  const toMs = anchorMs + toS * 1000;

  // Кандидаты: .ts чанки всех сегментов процесса (окно покрытия сегмента, оба record-root).
  const byAbsPath = new Map<string, ExportChunk>();
  for (const seg of segments) {
    const dirPath = segmentService.findDirPath(seg.path);
    for (const f of segmentService.segmentFilesOf(seg)) {
      const absPath = path.join(dirPath, f.file);
      if (!byAbsPath.has(absPath)) {
        byAbsPath.set(absPath, { file: f.file, tsMs: f.tsMs, absPath });
      }
    }
  }
  const sorted = [...byAbsPath.values()].sort((a, b) => a.tsMs - b.tsMs);
  const picked = selectChunksInRange(sorted, fromMs, toMs);
  if (picked.length === 0) throw new ExportError(404, 'нет данных в запрошенном диапазоне');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timprgr-export-'));
  const cleanupDir = (): void => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  const listFile = path.join(tmpDir, 'concat.txt');
  const fileName = `fragment_${processId.slice(0, 8)}_${Math.round(fromS)}-${Math.round(toS)}.mp4`;
  const outFile = path.join(tmpDir, fileName);

  try {
    fs.writeFileSync(listFile, picked.map(c => `file '${c.absPath}'`).join('\n') + '\n');

    await runFfmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-protocol_whitelist', 'file,concat',
      '-i', listFile,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', outFile,
    ], outFile);

    // list-файл больше не нужен; сам каталог с mp4 оставляем — его удалит роут.
    try { fs.unlinkSync(listFile); } catch { /* ignore */ }

    if (!fs.existsSync(outFile)) {
      throw new ExportError(500, 'файл экспорта не создан');
    }
    return { mp4Path: outFile, size: fs.statSync(outFile).size, files: picked.length };
  } catch (e) {
    cleanupDir();
    throw e;
  }
}

export const exportService = {
  exportSegment,
};
