import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../repositories/device.repository', () => ({
  deviceRepository: { findAll: vi.fn(), count: vi.fn() },
}));

vi.mock('../repositories/stream.repository', () => ({
  streamRepository: { findAll: vi.fn(), count: vi.fn() },
}));

vi.mock('../repositories/process.repository', () => ({
  processRepository: { findAll: vi.fn(), count: vi.fn() },
}));

import { deviceService } from './device.service';
import { streamService } from './stream.service';
import { processService } from './process.service';
import { deviceRepository } from '../repositories/device.repository';
import { streamRepository } from '../repositories/stream.repository';
import { processRepository } from '../repositories/process.repository';

const deviceFindAll = deviceRepository.findAll as unknown as Mock;
const deviceCount = deviceRepository.count as unknown as Mock;
const streamFindAll = streamRepository.findAll as unknown as Mock;
const processFindAll = processRepository.findAll as unknown as Mock;
const processCount = processRepository.count as unknown as Mock;

beforeEach(() => {
  for (const m of [deviceFindAll, deviceCount, streamFindAll, processFindAll, processCount]) m.mockReset();
  deviceFindAll.mockResolvedValue([]);
  deviceCount.mockResolvedValue(0);
  streamFindAll.mockResolvedValue([]);
  processFindAll.mockResolvedValue([]);
  processCount.mockResolvedValue(0);
});

describe('getAll: q пробрасывается в репозиторий и учитывается в total', () => {
  it('device.getAll(limit, offset, q): q уходит в findAll и count', async () => {
    deviceFindAll.mockResolvedValue([{ id: 'd1' }]);
    deviceCount.mockResolvedValue(1);

    const result = await deviceService.getAll(20, 0, 'Вход');

    expect(deviceFindAll).toHaveBeenCalledWith(20, 0, 'Вход');
    expect(deviceCount).toHaveBeenCalledWith('Вход');
    expect(result).toEqual({ devices: [{ id: 'd1' }], total: 1 });
  });

  it('device.getAll: пробелы вокруг q срезаются', async () => {
    await deviceService.getAll(20, 0, '  Вход  ');
    expect(deviceFindAll).toHaveBeenCalledWith(20, 0, 'Вход');
  });

  it('device.getAll: пустая/пробельная q и её отсутствие — вызовы без фильтра (undefined)', async () => {
    await deviceService.getAll(20, 0, '   ');
    expect(deviceFindAll).toHaveBeenCalledWith(20, 0, undefined);
    expect(deviceCount).toHaveBeenCalledWith(undefined);

    deviceFindAll.mockClear();
    deviceCount.mockClear();
    await deviceService.getAll(20, 0);
    expect(deviceFindAll).toHaveBeenCalledWith(20, 0, undefined);
    expect(deviceCount).toHaveBeenCalledWith(undefined);
  });

  it('stream.getAll: q уходит в findAll и count', async () => {
    streamFindAll.mockResolvedValue([{ id: 's1' }]);
    await streamService.getAll(20, 0, 'камера');

    expect(streamFindAll).toHaveBeenCalledWith(20, 0, 'камера');
  });

  it('process.getAll: q уходит в findAll и count', async () => {
    processFindAll.mockResolvedValue([{ id: 'p1' }]);
    processCount.mockResolvedValue(1);

    const result = await processService.getAll(20, 0, 'ivideon');

    expect(processFindAll).toHaveBeenCalledWith(20, 0, 'ivideon');
    expect(processCount).toHaveBeenCalledWith('ivideon');
    expect(result).toEqual({ processes: [{ id: 'p1' }], total: 1 });
  });
});
