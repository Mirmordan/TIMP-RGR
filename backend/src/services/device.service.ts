import type { RecordingDevice } from '../types';
import { deviceRepository } from '../repositories/device.repository';

export const deviceService = {
  async getById(id: string): Promise<RecordingDevice | null> {
    return deviceRepository.findById(id);
  },

  async getAll(limit: number, offset: number): Promise<{ devices: RecordingDevice[]; total: number }> {
    const [devices, total] = await Promise.all([
      deviceRepository.findAll(limit, offset),
      deviceRepository.count(),
    ]);
    return { devices, total };
  },

  async create(name: string, type: string): Promise<RecordingDevice> {
    if (!name) throw new Error('имя обязательно');
    return deviceRepository.create(name, type);
  },

  async put(id: string, name: string, type: string): Promise<RecordingDevice | null> {
    if (!name) throw new Error('имя обязательно');
    return deviceRepository.put(id, name, type);
  },

  async patch(id: string, patch: { name?: string; type?: string }): Promise<RecordingDevice | null> {
    if (patch.name === '') throw new Error('имя не может быть пустым');
    return deviceRepository.patch(id, patch);
  },

  async deleteById(id: string): Promise<boolean> {
    return deviceRepository.deleteById(id);
  },
};