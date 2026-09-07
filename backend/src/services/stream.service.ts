import type { RecordingStream } from '../types';
import { streamRepository } from '../repositories/stream.repository';
import { normalizeMetaName, normalizeMetaDescription } from './entityMeta';

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

  /**
   * Создание потока. name не задан/пуст → наследуется от устройства (override не пишем);
   * непустой name — явный override, переживающий переименование устройства.
   */
  async create(url: string, deviceId?: string, sourceFingerprint?: string, name?: string | null, description?: string | null): Promise<RecordingStream> {
    if (!url) throw new Error('url обязателен');
    const created = await streamRepository.create(url, deviceId, sourceFingerprint, {
      name: normalizeMetaName(name),
      description: normalizeMetaDescription(description),
    });
    return (await streamRepository.findById(created.id)) ?? created;
  },

  /** PUT = полная замена. name не задан/пуст → сброс override (наследование). */
  async put(id: string, url: string, deviceId?: string, sourceFingerprint?: string, name?: string | null, description?: string | null): Promise<RecordingStream | null> {
    if (!url) throw new Error('url обязателен');
    const updated = await streamRepository.put(id, url, deviceId, sourceFingerprint, {
      name: normalizeMetaName(name),
      description: normalizeMetaDescription(description),
    });
    if (!updated) return null;
    return (await streamRepository.findById(id)) ?? updated;
  },

  /**
   * PATCH: undefined — поле не трогаем; null/'' — очистить (name → наследование);
   * непустой name/description — записать.
   */
  async patch(id: string, patch: { url?: string; deviceId?: string; sourceFingerprint?: string; name?: string | null; description?: string | null }): Promise<RecordingStream | null> {
    if (patch.url === '') throw new Error('url не может быть пустым');
    const dbPatch: { url?: string; deviceId?: string; sourceFingerprint?: string; name?: string | null; description?: string | null } = {};
    if (patch.url !== undefined) dbPatch.url = patch.url;
    if (patch.deviceId !== undefined) dbPatch.deviceId = patch.deviceId;
    if (patch.sourceFingerprint !== undefined) dbPatch.sourceFingerprint = patch.sourceFingerprint;
    if (patch.name !== undefined) dbPatch.name = normalizeMetaName(patch.name);
    if (patch.description !== undefined) dbPatch.description = normalizeMetaDescription(patch.description);
    const updated = await streamRepository.patch(id, dbPatch);
    if (!updated) return null;
    return (await streamRepository.findById(id)) ?? updated;
  },

  async deleteById(id: string): Promise<boolean> {
    return streamRepository.deleteById(id);
  },
};
