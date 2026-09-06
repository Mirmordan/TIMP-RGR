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

function makeClient(sequence: unknown[]) {
  const query = vi.fn();
  for (const res of sequence) {
    query.mockResolvedValueOnce(res);
  }
  return { query };
}

beforeEach(() => {
  queryAs.mockReset();
  inUserContext.mockReset();
});

describe('incidentRepository.deleteById', () => {
  it('удаляет строку recording_incidents и её супертип objects (нет FK — удаляем явно)', async () => {
    const client = makeClient([
      { rows: [], rowCount: 1 }, // DELETE recording_incidents
      { rows: [], rowCount: 1 }, // DELETE objects
    ]);
    inUserContext.mockImplementation(async (fn: (c: typeof client) => unknown) => fn(client));

    const deleted = await incidentRepository.deleteById('inc-1');

    expect(deleted).toBe(true);
    expect(client.query).toHaveBeenNthCalledWith(1, incidentQueries.deleteIncident, ['inc-1']);
    expect(client.query).toHaveBeenNthCalledWith(2, incidentQueries.deleteObject, ['inc-1']);
  });

  it('не трогает objects, если доменной строки инцидента нет (rowCount 0)', async () => {
    const client = makeClient([
      { rows: [], rowCount: 0 }, // DELETE recording_incidents → ничего
    ]);
    inUserContext.mockImplementation(async (fn: (c: typeof client) => unknown) => fn(client));

    const deleted = await incidentRepository.deleteById('missing');

    expect(deleted).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(incidentQueries.deleteIncident, ['missing']);
  });
});
