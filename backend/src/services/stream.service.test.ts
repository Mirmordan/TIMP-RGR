import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const streamRepo = vi.hoisted(() => ({
  create: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('../repositories/stream.repository', () => ({ streamRepository: streamRepo }));

import { streamService } from './stream.service';

const create = streamRepo.create as unknown as Mock;
const put = streamRepo.put as unknown as Mock;
const patch = streamRepo.patch as unknown as Mock;

beforeEach(() => {
  create.mockReset();
  put.mockReset();
  patch.mockReset();
  streamRepo.findById.mockReset();
  create.mockResolvedValue({ id: 's1' });
  put.mockResolvedValue({ id: 's1' });
  patch.mockResolvedValue({ id: 's1' });
  // Сервис после записи перечитывает полную сущность.
  streamRepo.findById.mockResolvedValue({ id: 's1', name: 'Склад', description: null, url: 'rtsp://x' });
});

describe('streamService: собственные name/description (без наследования)', () => {
  it('create без name → ошибка «название обязательно»', async () => {
    await expect(streamService.create('rtsp://x', 'dev-1')).rejects.toThrow('название обязательно');
    await expect(streamService.create('rtsp://x', 'dev-1', undefined, '   ')).rejects.toThrow('название обязательно');
  });

  it('create с name/description → пробелы срезаны, имя пишется в объект', async () => {
    await streamService.create('rtsp://x', 'dev-1', undefined, '  Камера 2  ', '  описание  ');
    expect(create).toHaveBeenCalledWith('rtsp://x', 'dev-1', undefined, { name: 'Камера 2', description: 'описание' });
  });

  it('put = полная замена: name обязателен', async () => {
    await expect(streamService.put('s1', 'rtsp://y', 'dev-2')).rejects.toThrow('название обязательно');
    await streamService.put('s1', 'rtsp://y', 'dev-2', undefined, '  описанье  ');
    expect(put).toHaveBeenCalledWith('s1', 'rtsp://y', 'dev-2', undefined, { name: 'описанье', description: null });
  });

  it('patch: name/description undefined → не передаются в репозиторий', async () => {
    await streamService.patch('s1', { url: 'rtsp://z' });
    expect(patch).toHaveBeenCalledWith('s1', { url: 'rtsp://z' });
  });

  it('patch: name null/пусто → ошибка (имя обязательно)', async () => {
    await expect(streamService.patch('s1', { name: null })).rejects.toThrow('название обязательно');
    await expect(streamService.patch('s1', { name: '  ' })).rejects.toThrow('название обязательно');
  });

  it('patch: явный name/description → trimmed значение', async () => {
    await streamService.patch('s1', { name: '  Склад  ', description: '  ' });
    expect(patch).toHaveBeenCalledWith('s1', { name: 'Склад', description: null });
  });
});
