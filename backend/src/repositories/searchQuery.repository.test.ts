import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const db = vi.hoisted(() => ({
  queryAs: vi.fn(),
  inUserContext: vi.fn(),
}));

vi.mock('../security/dbBridge', () => db);

import { deviceRepository } from './device.repository';
import { streamRepository } from './stream.repository';
import { processRepository } from './process.repository';
import { deviceQueries } from '../database/queries/device.queries';
import { streamQueries } from '../database/queries/stream.queries';
import { processQueries } from '../database/queries/process.queries';

const queryAs = db.queryAs as unknown as Mock;

beforeEach(() => {
  queryAs.mockReset();
  queryAs.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('поиск q: SQL-параметры списочных репозиториев', () => {
  it('device: q уходит параметром $3/$1, без q — NULL (фильтр отключён)', async () => {
    await deviceRepository.findAll(20, 40, 'Вход');
    expect(queryAs).toHaveBeenCalledWith(deviceQueries.findAll, [20, 40, 'Вход']);
    await deviceRepository.count('Вход');
    expect(queryAs).toHaveBeenCalledWith(deviceQueries.count, ['Вход']);

    expect(deviceQueries.findAll).toContain("d.name ILIKE '%' || $3 || '%'");
    expect(deviceQueries.count).toContain("d.name ILIKE '%' || $1 || '%'");

    await deviceRepository.findAll(20, 0);
    expect(queryAs).toHaveBeenCalledWith(deviceQueries.findAll, [20, 0, null]);
    await deviceRepository.count();
    expect(queryAs).toHaveBeenCalledWith(deviceQueries.count, [null]);
  });

  it('stream: q ищет по s.url ИЛИ имени устройства (LEFT JOIN recording_devices)', async () => {
    await streamRepository.findAll(10, 0, 'камера');
    expect(queryAs).toHaveBeenCalledWith(streamQueries.findAll, [10, 0, 'камера']);
    await streamRepository.count('камера');
    expect(queryAs).toHaveBeenCalledWith(streamQueries.count, ['камера']);

    expect(streamQueries.findAll).toContain('LEFT JOIN recording_devices d ON d.object_id = s.device_id');
    expect(streamQueries.findAll).toContain("s.url ILIKE '%' || $3 || '%'");
    expect(streamQueries.findAll).toContain("d.name ILIKE '%' || $3 || '%'");
    expect(streamQueries.count).toContain("s.url ILIKE '%' || $1 || '%'");

    await streamRepository.findAll(10, 0);
    expect(queryAs).toHaveBeenCalledWith(streamQueries.findAll, [10, 0, null]);
    await streamRepository.count();
    expect(queryAs).toHaveBeenCalledWith(streamQueries.count, [null]);
  });

  it('process: q ищет по id процесса, url потока и имени устройства', async () => {
    await processRepository.findAll(10, 0, 'ivideon');
    expect(queryAs).toHaveBeenCalledWith(processQueries.findAll, [10, 0, 'ivideon']);
    await processRepository.count('ivideon');
    expect(queryAs).toHaveBeenCalledWith(processQueries.count, ['ivideon']);

    expect(processQueries.findAll).toContain('LEFT JOIN recording_streams s ON s.object_id = p.stream_id');
    expect(processQueries.findAll).toContain('LEFT JOIN recording_devices d ON d.object_id = s.device_id');
    expect(processQueries.findAll).toContain("p.object_id::text ILIKE '%' || $3 || '%'");
    expect(processQueries.findAll).toContain("s.url ILIKE '%' || $3 || '%'");
    expect(processQueries.count).toContain("d.name ILIKE '%' || $1 || '%'");

    await processRepository.findAll(10, 0);
    expect(queryAs).toHaveBeenCalledWith(processQueries.findAll, [10, 0, null]);
    await processRepository.count();
    expect(queryAs).toHaveBeenCalledWith(processQueries.count, [null]);
  });
});
