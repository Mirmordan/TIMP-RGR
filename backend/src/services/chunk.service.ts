import type { RecordingChunk } from '../types';
import { chunkRepository } from '../repositories/chunk.repository';

export const chunkService = {
  async getById(id: string): Promise<RecordingChunk | null> {
    return chunkRepository.findById(id);
  },

  async getAll(limit: number, offset: number): Promise<{ chunks: RecordingChunk[]; total: number }> {
    const [chunks, total] = await Promise.all([
      chunkRepository.findAll(limit, offset),
      chunkRepository.count(),
    ]);
    return { chunks, total };
  },

  async create(processId: string, startedAt: Date, endedAt: Date, url: string): Promise<RecordingChunk> {
    if (!processId) throw new Error('processId обязателен');
    if (!url) throw new Error('url обязателен');
    if (endedAt < startedAt) throw new Error('endedAt не может быть меньше startedAt');
    return chunkRepository.create(processId, startedAt, endedAt, url);
  },

  async put(id: string, processId: string, startedAt: Date, endedAt: Date, url: string): Promise<RecordingChunk | null> {
    if (!processId) throw new Error('processId обязателен');
    if (!url) throw new Error('url обязателен');
    if (endedAt < startedAt) throw new Error('endedAt не может быть меньше startedAt');
    return chunkRepository.put(id, processId, startedAt, endedAt, url);
  },

  async patch(id: string, patch: { processId?: string; startedAt?: Date; endedAt?: Date; url?: string }): Promise<RecordingChunk | null> {
    if (patch.url === '') throw new Error('url не может быть пустым');
    return chunkRepository.patch(id, patch);
  },

  async deleteById(id: string): Promise<boolean> {
    return chunkRepository.deleteById(id);
  },
};
