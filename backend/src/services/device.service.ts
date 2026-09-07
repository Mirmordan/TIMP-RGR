import type { RecordingDevice } from '../types';
import { deviceRepository } from '../repositories/device.repository';

/** Пустое/пробельное значение описания → null (очистить). */
function normalizeDescription(description: string | null | undefined): string | null {
  const trimmed = typeof description === 'string' ? description.trim() : '';
  return trimmed === '' ? null : trimmed;
}

export const deviceService = {
  async getById(id: string): Promise<RecordingDevice | null> {
    return deviceRepository.findById(id);
  },

  async getAll(limit: number, offset: number, q?: string): Promise<{ devices: RecordingDevice[]; total: number }> {
    const search = q?.trim() || undefined;
    const [devices, total] = await Promise.all([
      deviceRepository.findAll(limit, offset, search),
      deviceRepository.count(search),
    ]);
    return { devices, total };
  },

  async create(name: string, type: string, description?: string | null): Promise<RecordingDevice> {
    if (!name?.trim()) throw new Error('имя обязательно');
    const created = await deviceRepository.create(name.trim(), type, normalizeDescription(description));
    return (await this.getById(created.id)) ?? created;
  },

  async put(id: string, name: string, type: string, description?: string | null): Promise<RecordingDevice | null> {
    if (!name?.trim()) throw new Error('имя обязательно');
    const updated = await deviceRepository.put(id, name.trim(), type, normalizeDescription(description));
    if (!updated) return null;
    return (await this.getById(id)) ?? updated;
  },

  async patch(id: string, patch: { name?: string; type?: string; description?: string | null }): Promise<RecordingDevice | null> {
    if (patch.name !== undefined && typeof patch.name !== 'string') throw new Error('имя не может быть пустым');
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('имя не может быть пустым');
    const dbPatch: { name?: string; type?: string; description?: string | null } = {};
    if (patch.name !== undefined) dbPatch.name = patch.name.trim();
    if (patch.type !== undefined) dbPatch.type = patch.type;
    if (patch.description !== undefined) dbPatch.description = normalizeDescription(patch.description);
    const updated = await deviceRepository.patch(id, dbPatch);
    if (!updated) return null;
    return (await this.getById(id)) ?? updated;
  },

  async deleteById(id: string): Promise<boolean> {
    return deviceRepository.deleteById(id);
  },
};
