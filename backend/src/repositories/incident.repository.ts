import type { RecordingIncident } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { incidentQueries } from '../database/queries/incident.queries';

/** Нормализация общих метаданных инцидента. */
function normalizeName(name: string | null | undefined): string | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed === '' ? null : trimmed;
}
function normalizeDescription(description: string | null | undefined): string | null {
  const trimmed = typeof description === 'string' ? description.trim() : '';
  return trimmed === '' ? null : trimmed;
}

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
    name: string;
    description?: string;
    timeOffsetS: number;
    severity: string;
    createdBy: string;
  }): Promise<RecordingIncident> {
    return inUserContext(async (client) => {
      // Общие метаданные инцидента живут в супертипе objects; recording_incidents
      // получает только доменные поля.
      const { rows: objRows } = await client.query<{ objectId: string }>(incidentQueries.insert, [
        normalizeName(data.name), normalizeDescription(data.description), data.processId,
      ]);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingIncident>(incidentQueries.insertIncident, [
        objectId, data.processId, data.segmentId ?? null,
        data.timeOffsetS, data.severity, data.createdBy,
      ]);
      const inserted = rows[0];
      if (!inserted) throw new Error('инцидент не создан');
      const full = (await client.query<RecordingIncident>(incidentQueries.findById, [inserted.id])).rows[0];
      return full ?? inserted;
    });
  },

  async deleteById(id: string): Promise<boolean> {
    // recording_incidents удаляется каскадом по FK object_id -> objects(id).
    const result = await queryAs(incidentQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async updateById(id: string, patch: { name?: string | null; description?: string | null; severity?: string; timeOffsetS?: number }): Promise<RecordingIncident | null> {
    return inUserContext(async (client) => {
      const cur = (await client.query<RecordingIncident>(incidentQueries.findById, [id])).rows[0];
      if (!cur) return null;

      // name/description — общие метаданные супертипа.
      if (patch.name !== undefined) {
        await client.query(incidentQueries.setMetaName, [normalizeName(patch.name), id]);
      }
      if (patch.description !== undefined) {
        await client.query(incidentQueries.setMetaDescription, [normalizeDescription(patch.description), id]);
      }

      // Доменные поля.
      await client.query(incidentQueries.updateIncident, [
        id, patch.severity ?? null, patch.timeOffsetS ?? null,
      ]);

      const full = (await client.query<RecordingIncident>(incidentQueries.findById, [id])).rows[0];
      return full ?? null;
    });
  },
};
