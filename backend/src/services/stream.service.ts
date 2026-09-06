import type { RecordingStream } from '../types';
import { streamRepository } from '../repositories/stream.repository';

export const streamService = {
  async getById(id: string): Promise<RecordingStream | null> {
    return streamRepository.findById(id);
  },

  async getAll(limit: number, offset: number, q?: string): Promise<{ streams: RecordingStream[]; total: number }> {
    const search = q?.trim() || undefined;
    const [streams, total] = await Promise.all([
      streamRepository.findAll(limit, offset, search),
      streamRepository.count(search),
    ]);
    return { streams, total };
  },

  async create(url: string, deviceId?: string, sourceFingerprint?: string): Promise<RecordingStream> {
    if (!url) throw new Error('url обязателен');
    return streamRepository.create(url, deviceId, sourceFingerprint);
  },

  async put(id: string, url: string, deviceId?: string, sourceFingerprint?: string): Promise<RecordingStream | null> {
    if (!url) throw new Error('url обязателен');
    return streamRepository.put(id, url, deviceId, sourceFingerprint);
  },

  async patch(id: string, patch: { url?: string; deviceId?: string; sourceFingerprint?: string }): Promise<RecordingStream | null> {
    if (patch.url === '') throw new Error('url не может быть пустым');
    return streamRepository.patch(id, patch);
  },

  async deleteById(id: string): Promise<boolean> {
    return streamRepository.deleteById(id);
  },
};
