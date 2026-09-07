import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const db = vi.hoisted(() => ({
  queryAs: vi.fn(),
  inUserContext: vi.fn(),
}));

vi.mock('../security/dbBridge', () => db);

import { incidentRepository } from './incident.repository';
import { incidentQueries } from '../database/queries/incident.queries';

const inUserContext = db.inUserContext as unknown as Mock;
const queryAs = db.queryAs as unknown as Mock;

beforeEach(() => {
  queryAs.mockReset();
  inUserContext.mockReset();
});

describe('incidentRepository.deleteById', () => {
  it('удаляет супертип objects — recording_incidents удаляется каскадом по FK', async () => {
    queryAs.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const deleted = await incidentRepository.deleteById('inc-1');

    expect(deleted).toBe(true);
    expect(queryAs).toHaveBeenCalledTimes(1);
    expect(queryAs).toHaveBeenCalledWith(incidentQueries.deleteById, ['inc-1']);
  });

  it('возвращает false, если объекта инцидента нет', async () => {
    queryAs.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const deleted = await incidentRepository.deleteById('missing');

    expect(deleted).toBe(false);
    expect(queryAs).toHaveBeenCalledTimes(1);
    expect(queryAs).toHaveBeenCalledWith(incidentQueries.deleteById, ['missing']);
  });
});
