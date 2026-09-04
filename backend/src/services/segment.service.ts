import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { RecordingSegment } from '../types';
import { segmentRepository } from '../repositories/segment.repository';
import { config } from '../config';

const recordRoots = [
  config.mediaMTX.recordRootHost,
  config.ffmpegManager.recordRoot,
];

/** Find the actual directory path by checking both mediaMTX and ffmpeg-manager roots */
function findDirPath(dirName: string): string {
  for (const root of recordRoots) {
    const candidate = path.join(root, dirName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(recordRoots[0]!, dirName);
}

/**
 * Сканирует директорию чанков и возвращает список .ts файлов,
 * отсортированных по имени (имя содержит timestamp).
 */
function scanTsFiles(dirPath: string): string[] {
  try {
    const files = fs.readdirSync(dirPath);
    return files
      .filter(f => f.endsWith('.ts'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Извлекает timestamp из имени файла вида 2026-09-02_00-29-02-325706.ts
 * Возвращает Date или null.
 */
function timestampFromFilename(filename: string): Date | null {
  // Формат: YYYY-MM-DD_HH-MM-SS-microseconds.ts
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-\d+\.ts$/);
  if (!match) return null;
  const [, y, m, d, h, min, s] = match;
  return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
}

/**
 * Создаёт сегмент из файлов на диске.
 * Вызывается после остановки записи.
 * Берёт файлы, попадающие в окно [recordStart, recordEnd].
 * excludeFiles — список имён файлов, которые уже используются в других сегментах.
 */
async function createFromFs(
  processId: string,
  streamId: string,
  dirName: string,
  _recordStart: Date,
  _recordEnd: Date,
  excludeFiles: string[] = [],
): Promise<RecordingSegment | null> {
  const dirPath = findDirPath(dirName);
  if (!fs.existsSync(dirPath)) return null;
  
  const allFiles = scanTsFiles(dirPath);
  if (allFiles.length === 0) return null;

  const excludeSet = new Set(excludeFiles);

  // Берём ВСЕ файлы из директории, кроме уже использованных в предыдущих сегментах.
  // Временной фильтр не нужен — каждая запись в своей директории process_<id>.
  const files = allFiles.filter(f => !excludeSet.has(f));

  if (files.length === 0) return null;

  const firstTs = timestampFromFilename(files[0]!);
  const lastTs = timestampFromFilename(files[files.length - 1]!);
  if (!firstTs || !lastTs) return null;

  // Длительность = разница между первым и последним +~10с (один чанк ~10с)
  const durationS = (lastTs.getTime() - firstTs.getTime()) / 1000 + 10;

  // Суммарный размер
  let sizeBytes = 0;
  for (const f of files) {
    try {
      const stat = fs.statSync(path.join(dirPath, f));
      sizeBytes += stat.size;
    } catch { /* ignore */ }
  }

  return segmentRepository.create({
    processId,
    streamId,
    path: dirName,
    startedAt: firstTs,
    endedAt: new Date(lastTs.getTime() + 10000),
    fileCount: files.length,
    durationS,
    sizeBytes,
  });
}

/**
 * Генерирует m3u8 плейлист для сегмента.
 * Берёт файлы из dir, попадающие в [startedAt, endedAt] сегмента.
 */
function generateM3u8(segmentPath: string, startedAt: string, endedAt: string): string {
  const dirPath = findDirPath(segmentPath);
  const allFiles = scanTsFiles(dirPath);
  if (allFiles.length === 0) return '';

  // Берём все .ts файлы из директории (без временного фильтра)
  const files = allFiles;

  if (files.length === 0) return '';

  // Compute actual EXTINF for each file from timestamps
  const fileDurations: { file: string; dur: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const ts = timestampFromFilename(files[i]!)!;
    let dur = 2.0;
    if (i + 1 < files.length) {
      const nextTs = timestampFromFilename(files[i + 1]!)!;
      dur = (nextTs.getTime() - ts.getTime()) / 1000;
      if (dur <= 0 || dur > 60) dur = 13.0;
    } else if (files.length > 1) {
      const prevTs = timestampFromFilename(files[i - 1]!)!;
      dur = (ts.getTime() - prevTs.getTime()) / 1000;
      if (dur <= 0 || dur > 60) dur = 13.0;
    }
    fileDurations.push({ file: files[i]!, dur: Math.round(dur * 10) / 10 });
  }

  const maxDur = Math.max(...fileDurations.map(f => f.dur));

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(maxDur)}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
  ];

  for (const { file, dur } of fileDurations) {
    lines.push(`#EXTINF:${dur},`);
    lines.push(`/api/v1/recordings/${segmentPath}/${file}`);
  }

  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n');
}

/**
 * Возвращает список .ts файлов сегмента.
 */
function listFiles(segmentPath: string): string[] {
  const dirPath = findDirPath(segmentPath);
  return scanTsFiles(dirPath);
}

/**
 * Файлы, относящиеся к сегменту: .ts чанки из директории сегмента,
 * попадающие в окно покрытия [startedAt, endedAt].
 * В одной директории могут лежать чанки нескольких сегментов процесса
 * (перезапуск записи), поэтому фильтруем по таймстампам сегмента.
 */
function segmentFilesOf(seg: RecordingSegment): { file: string; tsMs: number }[] {
  const dirPath = findDirPath(seg.path);
  const allFiles = scanTsFiles(dirPath);
  if (allFiles.length === 0) return [];

  const startMs = new Date(seg.startedAt).getTime();
  const endMs = seg.endedAt ? new Date(seg.endedAt).getTime() : Infinity;

  const files: { file: string; tsMs: number }[] = [];
  for (const f of allFiles) {
    const d = timestampFromFilename(f);
    if (!d) continue;
    const t = d.getTime();
    if (t >= startMs - 2000 && t <= endMs + 2000) {
      files.push({ file: f, tsMs: t });
    }
  }
  return files;
}

/**
 * Длительности чанков (дельта таймстампов, как в generateM3u8).
 * Индекс соответствует индексу в отсортированном списке файлов.
 */
function chunkDurations(files: { file: string; tsMs: number }[]): number[] {
  const durations: number[] = [];
  for (let i = 0; i < files.length; i++) {
    const ts = files[i]!.tsMs;
    let dur = 2.0;
    if (i + 1 < files.length) {
      const nextTs = files[i + 1]!.tsMs;
      dur = (nextTs - ts) / 1000;
      if (dur <= 0 || dur > 60) dur = 13.0;
    } else if (files.length > 1) {
      const prevTs = files[i - 1]!.tsMs;
      dur = (ts - prevTs) / 1000;
      if (dur <= 0 || dur > 60) dur = 13.0;
    }
    durations.push(Math.round(dur * 10) / 10);
  }
  return durations;
}

/**
 * Оконный HLS-плейлист сегмента: единица передачи видео = .ts чанк.
 * startOffsetS — смещение (в секундах) от startedAt сегмента, с которого начать окно.
 *
 * Закрытый сегмент (endedAt != null): VOD c ENDLIST, чанки от startOffsetS до конца.
 * Открытый сегмент (endedAt == null): EVENT-плейлист без ENDLIST — hls.js
 * перезапрашивает URL и подхватывает дописанные .ts (живой DVR-хвост).
 */
function getSegmentWindowM3u8(seg: RecordingSegment, startOffsetS: number): string {
  const files = segmentFilesOf(seg);
  if (files.length === 0) return '';

  const isOpen = seg.endedAt === null;
  const offsetMs = Math.max(0, startOffsetS) * 1000;
  const startTsMs = new Date(seg.startedAt).getTime() + offsetMs;

  const durations = chunkDurations(files);

  // Первый включаемый чанк — накрывающий startTs (последний чанк с ts <= startTs).
  let firstIndex = 0;
  for (let i = 0; i < files.length; i++) {
    if (files[i]!.tsMs <= startTsMs) firstIndex = i;
    else break;
  }

  const maxDur = Math.max(...durations);

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(maxDur)}`,
    isOpen ? '#EXT-X-PLAYLIST-TYPE:EVENT' : '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-MEDIA-SEQUENCE:${firstIndex}`,
  ];

  for (let i = firstIndex; i < files.length; i++) {
    // PTS пересобирается на ~0 в каждом .ts; hls.js ремапит по PDT с DISCONTINUITY.
    if (i > firstIndex) lines.push('#EXT-X-DISCONTINUITY');
    const pdt = new Date(files[i]!.tsMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    lines.push(`#EXT-X-PROGRAM-DATE-TIME:${pdt}`);
    lines.push(`#EXTINF:${durations[i]},`);
    lines.push(`/api/v1/recordings/${seg.path}/${files[i]!.file}`);
  }

  if (!isOpen) lines.push('#EXT-X-ENDLIST');
  return lines.join('\n');
}

/**
 * Creates a temporary concat file for ffmpeg and returns a readable stream of fMP4 output.
 * Caller must consume the stream. The temp concat file is cleaned up after ffmpeg finishes.
 */
function createSegmentVideoStream(segmentPath: string): ReturnType<typeof spawn> | null {
  const dirPath = findDirPath(segmentPath);
  const files = scanTsFiles(dirPath);
  if (files.length === 0) return null;

  // Create concat list file
  const concatContent = files.map(f => `file '${path.join(dirPath, f)}'`).join('\n');
  const concatFile = path.join(dirPath, `.concat_${Date.now()}.txt`);
  fs.writeFileSync(concatFile, concatContent);

  const ffmpeg = spawn('ffmpeg', [
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+faststart',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Clean up concat file when ffmpeg finishes
  ffmpeg.on('close', () => {
    try { fs.unlinkSync(concatFile); } catch { /* ignore */ }
  });

  ffmpeg.on('error', () => {
    try { fs.unlinkSync(concatFile); } catch { /* ignore */ }
  });

  return ffmpeg;
}

export const segmentService = {
  findDirPath,
  createSegmentVideoStream,

  async getById(id: string): Promise<RecordingSegment | null> {
    return segmentRepository.findById(id);
  },

  async getAll(limit: number, offset: number): Promise<{ segments: RecordingSegment[]; total: number }> {
    const [segments, total] = await Promise.all([
      segmentRepository.findAll(limit, offset),
      segmentRepository.count(),
    ]);
    return { segments, total };
  },

  async getByTimeRange(from: string, to: string): Promise<RecordingSegment[]> {
    return segmentRepository.findByTimeRange(from, to);
  },

  async getByProcess(processId: string): Promise<RecordingSegment[]> {
    return segmentRepository.findByProcess(processId);
  },

  async getByStream(streamId: string): Promise<RecordingSegment[]> {
    return segmentRepository.findByStream(streamId);
  },

  /** Создать открытый сегмент при старте записи (endedAt = null). */
  async createOpen(
    processId: string,
    streamId: string,
    dirName: string,
    startedAt: Date,
  ): Promise<RecordingSegment> {
    return segmentRepository.create({
      processId,
      streamId,
      path: dirName,
      startedAt,
      endedAt: null,
      fileCount: 0,
      durationS: 0,
      sizeBytes: 0,
    });
  },

  /** Создать сегмент из файлов на диске (вызывается при остановке процесса). */
  async createFromFs(
    processId: string,
    streamId: string,
    dirName: string,
    recordStart: Date,
    recordEnd: Date,
    excludeFiles: string[] = [],
  ): Promise<RecordingSegment | null> {
    return createFromFs(processId, streamId, dirName, recordStart, recordEnd, excludeFiles);
  },

  /** m3u8 плейлист для одного сегмента. */
  getM3u8(segmentPath: string, startedAt: string, endedAt: string): string {
    return generateM3u8(segmentPath, startedAt, endedAt);
  },

  /** Оконный HLS-плейлист сегмента, начиная со смещения startOffsetS (сек). */
  getSegmentWindowM3u8(seg: RecordingSegment, startOffsetS: number): string {
    return getSegmentWindowM3u8(seg, startOffsetS);
  },

  /** Объединённый m3u8 для всех сегментов процесса (непрерывное воспроизведение). */
  getCombinedM3u8(segments: RecordingSegment[]): string {
    if (segments.length === 0) return '';

    const sorted = [...segments].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    // Собираем файлы по сегментам, фильтруя по timestamps
    const segmentFiles: { seg: RecordingSegment; files: { file: string; dur: number }[] }[] = [];
    let maxDur = 0;

    for (const seg of sorted) {
      const allDirFiles = scanTsFiles(findDirPath(seg.path));
      if (allDirFiles.length === 0) continue;

      const segStartMs = new Date(seg.startedAt).getTime();
      const segEndMs = seg.endedAt ? new Date(seg.endedAt).getTime() : Date.now();

      // Фильтруем файлы по таймстампам сегмента
      const files = allDirFiles.filter(f => {
        const ts = timestampFromFilename(f);
        if (!ts) return false;
        const t = ts.getTime();
        return t >= segStartMs - 2000 && t <= segEndMs + 2000;
      });

      if (files.length === 0) continue;

      const entries: { file: string; dur: number }[] = [];
      for (let i = 0; i < files.length; i++) {
        const ts = timestampFromFilename(files[i]!)!;
        let dur = 10.0;
        if (i + 1 < files.length) {
          const nextTs = timestampFromFilename(files[i + 1]!)!;
          dur = (nextTs.getTime() - ts.getTime()) / 1000;
          if (dur <= 0 || dur > 60) dur = 10.0;
        }
        dur = Math.round(dur * 10) / 10;
        entries.push({ file: files[i]!, dur });
        if (dur > maxDur) maxDur = dur;
      }
      segmentFiles.push({ seg, files: entries });
    }

    if (segmentFiles.length === 0) return '';

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${Math.ceil(maxDur || 10)}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
    ];

    for (let si = 0; si < segmentFiles.length; si++) {
      const { seg, files } = segmentFiles[si]!;

      // Дисконтинуитет перед каждым сегментом (разные записи)
      lines.push('#EXT-X-DISCONTINUITY');

      for (const { file, dur } of files) {
        lines.push(`#EXTINF:${dur},`);
        lines.push(`/api/v1/recordings/${seg.path}/${file}`);
      }
    }

    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n');
  },

  /** Метаданные таймлайна для фронтенда. */
  getTimeline(segments: RecordingSegment[], running = false, processStartedAt?: Date) {
    if (segments.length === 0 && !running) {
      return { segments: [], totalDurationS: 0, start: null, end: null, live: false };
    }

    const sorted = [...segments].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    // Общий диапазон: от начала первого сегмента (или процесса) до now (если есть открытый сегмент или running)
    const rangeStart = sorted.length > 0
      ? new Date(sorted[0]!.startedAt).getTime()
      : (processStartedAt ? new Date(processStartedAt).getTime() : Date.now());

    const hasOpenSegment = sorted.some(s => s.endedAt === null);
    const rangeEnd = (running || hasOpenSegment) ? Date.now() : (sorted.length > 0 ? new Date(sorted[sorted.length - 1]!.endedAt!).getTime() : Date.now());
    const totalDurationS = Math.max(1, (rangeEnd - rangeStart) / 1000);

    const timeline = sorted.map(seg => {
      const segStart = new Date(seg.startedAt).getTime();
      const segEnd = seg.endedAt ? new Date(seg.endedAt).getTime() : Date.now();
      const segDur = (segEnd - segStart) / 1000;
      return {
        id: seg.id,
        startOffsetS: (segStart - rangeStart) / 1000,
        durationS: segDur,
        fileCount: seg.fileCount,
        sizeBytes: seg.sizeBytes,
        startedAt: seg.startedAt,
        endedAt: seg.endedAt,
        live: seg.endedAt === null,
      };
    });

    return {
      segments: timeline,
      totalDurationS,
      start: sorted.length > 0 ? sorted[0]!.startedAt : new Date().toISOString(),
      end: running ? new Date().toISOString() : (sorted.length > 0 ? sorted[sorted.length - 1]!.endedAt : new Date().toISOString()),
      live: running,
    };
  },

  /** URL прямой трансляции (HLS из mediaMTX через nginx proxy). */
  getLiveUrl(mtxPath: string): string {
    return `/live/${mtxPath}/index.m3u8`;
  },

  /** Список .ts файлов сегмента. */
  listFiles(segmentPath: string): string[] {
    return listFiles(segmentPath);
  },

  async deleteById(id: string): Promise<boolean> {
    return segmentRepository.deleteById(id);
  },
};
