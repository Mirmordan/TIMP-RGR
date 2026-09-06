import type { RecordingProcess } from '../types';
import { processRepository } from '../repositories/process.repository';
import { streamRepository } from '../repositories/stream.repository';
import { segmentRepository } from '../repositories/segment.repository';
import { segmentService } from './segment.service';
import { mediaManager } from '../media/mediaManager';
import * as fs from 'fs';
import * as pathMod from 'path';

const VALID_STATUSES = ['running', 'stopped', 'failed'];

/** Имя пути mediaMTX для записи (производное от id записи). */
function mtxPathForProcess(processId: string): string {
  return `process_${processId}`;
}

/** Поднять поток в mediaMTX по источнику потока (recording_stream.url). */
async function startStream(streamId: string, processId: string): Promise<void> {
  const stream = await streamRepository.findById(streamId);
  if (!stream) throw new Error('поток (источник) не найден');
  if (!stream.url) throw new Error('у потока нет URL источника');
  await mediaManager.createPath(mtxPathForProcess(processId), {
    source: stream.url,
    ...(stream.sourceFingerprint ? { sourceFingerprint: stream.sourceFingerprint } : {}),
  });
}

/** Остановить поток (удалить путь). */
async function stopStream(processId: string, source?: string): Promise<void> {
  await mediaManager.removePath(mtxPathForProcess(processId), source);
}

export const processService = {
  async getById(id: string): Promise<RecordingProcess | null> {
    return processRepository.findById(id);
  },

  async getAll(limit: number, offset: number, q?: string): Promise<{ processes: RecordingProcess[]; total: number }> {
    const search = q?.trim() || undefined;
    const [processes, total] = await Promise.all([
      processRepository.findAll(limit, offset, search),
      processRepository.count(search),
    ]);
    return { processes, total };
  },

  async create(streamId: string, startedAt: Date, status: string): Promise<RecordingProcess> {
    if (!streamId) throw new Error('streamId обязателен');
    if (!VALID_STATUSES.includes(status)) throw new Error(`status должен быть одним из: ${VALID_STATUSES.join(', ')}`);
    const process = await processRepository.create(streamId, startedAt, status);
    // Поднимаем поток в mediaMTX, если запись стартует сразу.
    if (status === 'running') {
      try {
        await startStream(streamId, process.id);
      } catch (e: any) {
        // path already exists — mediaMTX уже имеет этот путь, это нормально
        if (!e.message?.includes('already exists')) {
          await processRepository.patch(process.id, { status: 'failed' });
          throw new Error(`не удалось поднять поток: ${e.message}`);
        }
      }
      // Создаём открытый сегмент (без endedAt)
      const dirName = mtxPathForProcess(process.id);
      try {
        await segmentService.createOpen(process.id, streamId, dirName, startedAt);
      } catch {
        /* не удалось создать сегмент — логируем, но не падаем */
      }
    }
    return processRepository.findById(process.id) as Promise<RecordingProcess>;
  },

  async put(id: string, streamId: string, startedAt: Date, endedAt: Date | null, status: string): Promise<RecordingProcess | null> {
    if (!streamId) throw new Error('streamId обязателен');
    if (!VALID_STATUSES.includes(status)) throw new Error(`status должен быть одним из: ${VALID_STATUSES.join(', ')}`);
    const updated = await processRepository.put(id, streamId, startedAt, endedAt, status);
    if (updated) await this.syncMediaStatus(id, streamId, status);
    return updated;
  },

  async patch(id: string, patch: { streamId?: string; startedAt?: Date; endedAt?: Date; status?: string }): Promise<RecordingProcess | null> {
    if (patch.status !== undefined && !VALID_STATUSES.includes(patch.status)) {
      throw new Error(`status должен быть одним из: ${VALID_STATUSES.join(', ')}`);
    }
    const current = await processRepository.findById(id);
    if (!current) return null;

    const dbPatch: { streamId?: string; startedAt?: Date; endedAt?: Date; endedAtClear?: boolean; status?: string } = { ...patch };

    // Автоматическое управление endedAt при смене статуса.
    if (patch.status && patch.status !== current.status) {
      if (patch.status === 'running') {
        // Возобновление — сбрасываем endedAt.
        dbPatch.endedAtClear = true;
      } else if (patch.status === 'stopped' || patch.status === 'failed') {
        // Остановка — фиксируем момент остановки.
        dbPatch.endedAt = new Date();
      }
    }

    const updated = await processRepository.patch(id, dbPatch);
    if (updated && patch.status) {
      await this.syncMediaStatus(id, patch.streamId ?? updated.streamId, patch.status);
    }
    return updated;
  },

  async deleteById(id: string): Promise<boolean> {
    // Останавливаем поток перед удалением записи.
    try {
      const process = await processRepository.findById(id);
      if (process) {
        const stream = await streamRepository.findById(process.streamId);
        await stopStream(id, stream?.url ?? undefined);
      }
    } catch {
      /* поток мог не существовать — игнорируем */
    }
    // Удаляем чанки (файлы на диске) для всех сегментов процесса.
    try {
      const segments = await segmentRepository.findByProcess(id);
      for (const seg of segments) {
        const dirPath = segmentService.findDirPath(seg.path);
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      }
    } catch {
      /* не удалось удалить файлы — ок */
    }
    return processRepository.deleteById(id);
  },

  /** Приведение статуса mediaMTX в соответствие со статусом записи. */
  async syncMediaStatus(processId: string, streamId: string, status: string): Promise<void> {
    if (status === 'running') {
      await startStream(streamId, processId);
      // Создаём открытый сегмент (без endedAt)
      const dirName = mtxPathForProcess(processId);
      const now = new Date();
      try {
        await segmentService.createOpen(processId, streamId, dirName, now);
      } catch {
        /* не удалось создать сегмент — логируем, но не падаем */
      }
    } else {
      try {
        const stream = await streamRepository.findById(streamId);
        await stopStream(processId, stream?.url ?? undefined);
      } catch {
        /* нет пути — ок */
      }
      // Финализируем открытый сегмент при остановке/сбое (данные в него уже не пойдут)
      if (status === 'stopped' || status === 'failed') {
        const segments = await segmentRepository.findByProcess(processId);
        const openSeg = segments.find(s => s.endedAt === null);
        if (openSeg) {
          const dirName = mtxPathForProcess(processId);
          const files = segmentService.listFiles(dirName);
          // Считаем размер и количество файлов
          let sizeBytes = 0;
          for (const f of files) {
            try {
              const stat = fs.statSync(pathMod.join(segmentService.findDirPath(dirName), f));
              sizeBytes += stat.size;
            } catch { /* ignore */ }
          }
          // Фактический конец данных — timestamp последнего .ts файла (запись могла
          // оборваться задолго до остановки процесса); файлов нет — момент остановки.
          const startedAtMs = new Date(openSeg.startedAt).getTime();
          const lastFile = segmentService.lastFileTs(dirName);
          const endedAt = lastFile
            ? new Date(Math.max(lastFile.getTime(), startedAtMs))
            : new Date();
          const durationS = (endedAt.getTime() - startedAtMs) / 1000;
          try {
            await segmentRepository.finalizeById(openSeg.id, endedAt, files.length, Math.max(1, durationS), sizeBytes);
          } catch {
            /* не удалось финализировать — ок */
          }
        }
      }
    }
  },
};
