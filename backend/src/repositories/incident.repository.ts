import type { RecordingIncident } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { incidentQueries } from '../database/queries/incident.queries';

export const incidentRepository = {
  async findById(id: string): Promise<RecordingIncident | null> {
    const { rows } = await queryAs<RecordingIncident>(incidentQueries.findById, [id]);
    return rows[0] ?? null;
  },

  async findByProcess(processId: string): Promise<RecordingIncident[]> {
    const { rows } = await queryAs<RecordingIncident>(incidentQueries.findByProcess, [processId]);
    return rows;
  },

  async create(data: {
    processId: string;
    segmentId?: string;
    title: string;
    description?: string;
    timeOffsetS: number;
    severity: string;
    createdBy: string;
  }): Promise<RecordingIncident> {
    return inUserContext(async (client) => {
      const { rows: objRows } = await client.query<{ objectId: string }>(incidentQueries.insert);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingIncident>(incidentQueries.insertIncident, [
        objectId, data.processId, data.segmentId ?? null,
        data.title, data.description ?? null,
        data.timeOffsetS, data.severity, data.createdBy,
      ]);
      return rows[0]!;
    });
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(incidentQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async updateById(id: string, patch: { title?: string; description?: string | null; severity?: string; timeOffsetS?: number }): Promise<RecordingIncident | null> {
    const { rows } = await queryAs<RecordingIncident>(incidentQueries.updateById, [
      id, patch.title ?? null, patch.description ?? null, patch.severity ?? null, patch.timeOffsetS ?? null,
    ]);
    return rows[0] ?? null;
  },
};
