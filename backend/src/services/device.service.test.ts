import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const deviceRepo = vi.hoisted(() => ({
  create: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('../repositories/device.repository', () => ({ deviceRepository: deviceRepo }));

import { deviceService } from './device.service';

const create = deviceRepo.create as unknown as Mock;
const put = deviceRepo.put as unknown as Mock;
const patch = deviceRepo.patch as unknown as Mock;

beforeEach(() => {
  create.mockReset();
  put.mockReset();
  patch.mockReset();
  deviceRepo.findById.mockReset();
  create.mockResolvedValue({ id: 'd1' });
  put.mockResolvedValue({ id: 'd1' });
  patch.mockResolvedValue({ id: 'd1' });
  deviceRepo.findById.mockResolvedValue({ id: 'd1', name: 'Камера 1', description: null, type: 'camera' });
});

describe('deviceService: name/description', () => {
  it('create: name обязателен, description срезается/пустое → null', async () => {
    await deviceService.create('  Камера 1  ', 'camera', '  вход  ');
    expect(create).toHaveBeenCalledWith('Камера 1', 'camera', 'вход');

    await deviceService.create('Камера 2', 'camera', '   ');
    expect(create).toHaveBeenLastCalledWith('Камера 2', 'camera', null);
  });

  it('create без name → ошибка', async () => {
    await expect(deviceService.create('', 'camera')).rejects.toThrow('имя обязательно');
    await expect(deviceService.create('   ', 'camera')).rejects.toThrow('имя обязательно');
  });

  it('put: description опущено → null (полная замена), name trimmed', async () => {
    await deviceService.put('d1', '  Камера 1  ', 'camera');
    expect(put).toHaveBeenCalledWith('d1', 'Камера 1', 'camera', null);
  });

  it("patch: description null/'' → очистка, name пустое → ошибка", async () => {
    await deviceService.patch('d1', { description: null });
    expect(patch).toHaveBeenCalledWith('d1', { description: null });
    await deviceService.patch('d1', { description: '  ' });
    expect(patch).toHaveBeenLastCalledWith('d1', { description: null });

    await expect(deviceService.patch('d1', { name: ' ' })).rejects.toThrow('имя не может быть пустым');
  });
});
