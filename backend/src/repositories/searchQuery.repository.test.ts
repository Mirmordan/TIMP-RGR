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

    // q ищет по эффективному названию (objects-иерархия) и описанию устройства.
    expect(deviceQueries.findAll).toContain('JOIN objects o ON o.id = d.object_id');
    expect(deviceQueries.findAll).toContain("objects_effective_name(o.id) ILIKE '%' || $3 || '%'");
    expect(deviceQueries.findAll).toContain("o.description ILIKE '%' || $3 || '%'");
    expect(deviceQueries.count).toContain("objects_effective_name(o.id) ILIKE '%' || $1 || '%'");

    await deviceRepository.findAll(20, 0);
    expect(queryAs).toHaveBeenCalledWith(deviceQueries.findAll, [20, 0, null]);
    await deviceRepository.count();
    expect(queryAs).toHaveBeenCalledWith(deviceQueries.count, [null]);
  });

  it('stream: q ищет по url ИЛИ эффективному названию через objects-иерархию', async () => {
    await streamRepository.findAll(10, 0, 'камера');
    expect(queryAs).toHaveBeenCalledWith(streamQueries.findAll, [10, 0, 'камера']);
    await streamRepository.count('камера');
    expect(queryAs).toHaveBeenCalledWith(streamQueries.count, ['камера']);

    expect(streamQueries.findAll).toContain('JOIN objects o ON o.id = s.object_id');
    expect(streamQueries.findAll).toContain("s.url ILIKE '%' || $3 || '%'");
    expect(streamQueries.findAll).toContain("objects_effective_name(o.id) ILIKE '%' || $3 || '%'");
    expect(streamQueries.findAll).toContain("o.description ILIKE '%' || $3 || '%'");
    expect(streamQueries.findAll).toContain('objects_effective_name(o.id) AS "name"');
    expect(streamQueries.count).toContain("s.url ILIKE '%' || $1 || '%'");

    await streamRepository.findAll(10, 0);
    expect(queryAs).toHaveBeenCalledWith(streamQueries.findAll, [10, 0, null]);
    await streamRepository.count();
    expect(queryAs).toHaveBeenCalledWith(streamQueries.count, [null]);
  });

  it('process: q ищет по id процесса, url потока и эффективному названию через objects-иерархию', async () => {
    await processRepository.findAll(10, 0, 'ivideon');
    expect(queryAs).toHaveBeenCalledWith(processQueries.findAll, [10, 0, 'ivideon']);
    await processRepository.count('ivideon');
    expect(queryAs).toHaveBeenCalledWith(processQueries.count, ['ivideon']);

    expect(processQueries.findAll).toContain('JOIN objects po ON po.id = p.object_id');
    expect(processQueries.findAll).toContain('LEFT JOIN recording_streams s ON s.object_id = p.stream_id');
    expect(processQueries.findAll).toContain('LEFT JOIN objects parent ON parent.id = po.parent_id');
    expect(processQueries.findAll).toContain("p.object_id::text ILIKE '%' || $3 || '%'");
    expect(processQueries.findAll).toContain("s.url ILIKE '%' || $3 || '%'");
    expect(processQueries.findAll).toContain("objects_effective_name(po.id) ILIKE '%' || $3 || '%'");
    expect(processQueries.findAll).toContain("po.description ILIKE '%' || $3 || '%'");
    expect(processQueries.findAll).toContain('objects_effective_name(po.id) AS "name"');
    expect(processQueries.count).toContain("objects_effective_name(po.id) ILIKE '%' || $1 || '%'");

    await processRepository.findAll(10, 0);
    expect(queryAs).toHaveBeenCalledWith(processQueries.findAll, [10, 0, null]);
    await processRepository.count();
    expect(queryAs).toHaveBeenCalledWith(processQueries.count, [null]);
  });

  it('SELECT отдаёт единое эффективное name и parentType (собственного raw-поля нет)', () => {
    // stream/process используют только objects-иерархию; name уже резолвится helper-ем.
    expect(streamQueries.findById).toContain('objects_effective_name(o.id) AS "name"');
    expect(streamQueries.findById).toContain('parent.type AS "parentType"');
    expect(streamQueries.findById).not.toContain('rawName');
    expect(streamQueries.findById).not.toContain('inheritedName');

    expect(processQueries.findById).toContain('objects_effective_name(po.id) AS "name"');
    expect(processQueries.findById).toContain('parent.type AS "parentType"');
    expect(processQueries.findById).not.toContain('rawName');
    expect(processQueries.findById).not.toContain('inheritedName');
  });
});
