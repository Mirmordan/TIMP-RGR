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
      // Common metadata инцидента (title/description/parent-process) пишем в objects.
      const { rows: objRows } = await client.query<{ objectId: string }>(incidentQueries.insert, [
        data.title, data.description ?? null, data.processId,
      ]);
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
    return inUserContext(async (client) => {
      // recording_incidents.object_id не FK на objects: удаляем и доменную строку,
      // и супертип — иначе остаётся orphan (инцидент без объекта / объект без строки).
      const del = await client.query(incidentQueries.deleteIncident, [id]);
      if ((del.rowCount ?? 0) === 0) return false;
      await client.query(incidentQueries.deleteObject, [id]);
      return true;
    });
  },

  async updateById(id: string, patch: { title?: string; description?: string | null; severity?: string; timeOffsetS?: number }): Promise<RecordingIncident | null> {
    return inUserContext(async (client) => {
      // Текущее эффективное значение (из objects, с fallback на зеркальные столбцы).
      const cur = (await client.query<RecordingIncident>(incidentQueries.findById, [id])).rows[0];
      if (!cur) return null;
      // Итоговые значения общих полей (семантика PATCH как у recording_incidents:
      // description не задан — сброс в NULL; title не задан — остаётся прежним).
      const title = patch.title ?? cur.title;
      const description = patch.description !== undefined ? patch.description : null;
      const { rows } = await client.query<RecordingIncident>(incidentQueries.updateById, [
        id, patch.title ?? null, patch.description ?? null, patch.severity ?? null, patch.timeOffsetS ?? null,
      ]);
      const updated = rows[0] ?? null;
      if (updated) {
        await client.query(incidentQueries.setMeta, [title, description, id]);
      }
      return updated;
    });
  },
};
