import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const procRepo = vi.hoisted(() => ({
  create: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  findById: vi.fn(),
}));

const streamRepo = vi.hoisted(() => ({
  findById: vi.fn(),
}));

const segRepo = vi.hoisted(() => ({
  findByProcess: vi.fn(),
}));

vi.mock('../repositories/process.repository', () => ({ processRepository: procRepo }));
vi.mock('../repositories/stream.repository', () => ({ streamRepository: streamRepo }));
vi.mock('../repositories/segment.repository', () => ({ segmentRepository: segRepo }));
vi.mock('./segment.service', () => ({ segmentService: {} }));
vi.mock('../media/mediaManager', () => ({
  mediaManager: {
    createPath: vi.fn().mockResolvedValue(undefined),
    removePath: vi.fn().mockResolvedValue(undefined),
  },
}));

import { processService } from './process.service';

const create = procRepo.create as unknown as Mock;
const put = procRepo.put as unknown as Mock;
const patch = procRepo.patch as unknown as Mock;
const findById = procRepo.findById as unknown as Mock;

const FULL = { id: 'p1', streamId: 'st-2', status: 'stopped', name: null, description: null };

beforeEach(() => {
  create.mockReset();
  put.mockReset();
  patch.mockReset();
  findById.mockReset();
  create.mockResolvedValue({ id: 'p1' });
  put.mockResolvedValue({ id: 'p1' });
  patch.mockResolvedValue({ id: 'p1' });
  findById.mockResolvedValue(FULL); // patch: current + финальный перечитываемый объект
  streamRepo.findById.mockResolvedValue({ id: 'st-2', url: 'rtsp://x' });
  segRepo.findByProcess.mockResolvedValue([]);
});

describe('processService: наследование/override name + description', () => {
  it('create без name/description → meta {name: null, description: null} (наследование)', async () => {
    const d = new Date('2026-01-01T00:00:00Z');
    await processService.create('st-1', d, 'stopped');
    expect(create).toHaveBeenCalledWith('st-1', d, 'stopped', { name: null, description: null });
  });

  it('create с name/description → trimmed, пустое name → null', async () => {
    const d = new Date('2026-01-01T00:00:00Z');
    await processService.create('st-1', d, 'stopped', ' Реконструкция ', '  ');
    expect(create).toHaveBeenCalledWith('st-1', d, 'stopped', { name: 'Реконструкция', description: null });
  });

  it('put: name опущено → override сбрасывается (null)', async () => {
    const d = new Date('2026-01-01T00:00:00Z');
    await processService.put('p1', 'st-2', d, null, 'stopped');
    expect(put).toHaveBeenCalledWith('p1', 'st-2', d, null, 'stopped', { name: null, description: null });
  });

  it('patch: name/description undefined → в репозиторий уходят только переданные поля', async () => {
    await processService.patch('p1', { streamId: 'st-2' });
    expect(patch).toHaveBeenCalledWith('p1', { streamId: 'st-2' });
  });

  it('patch: name null → сброс override (null), явный name → trimmed', async () => {
    await processService.patch('p1', { name: null });
    expect(patch).toHaveBeenCalledWith('p1', { name: null });
    await processService.patch('p1', { name: ' Ночная запись ', description: '' });
    expect(patch).toHaveBeenLastCalledWith('p1', { name: 'Ночная запись', description: null });
  });
});
