import type { RecordingProcess } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { invalidateObjectHierarchy } from '../security/acl';
import { processQueries } from '../database/queries/process.queries';
import type { EntityMeta, EntityMetaPatch } from '../services/entityMeta';

/** Процесс записи со статусом running + URL источника (для стартовой реконсиляции). */
export interface RunningProcessWithStream {
  id: string;
  streamId: string;
  startedAt: Date;
  status: string;
  streamUrl: string;
}

export const processRepository = {
  async findById(id: string): Promise<RecordingProcess | null> {
    const { rows } = await queryAs<RecordingProcess>(processQueries.findById, [id]);
    return rows[0] ?? null;
  },

  async findAll(limit: number, offset: number, q?: string): Promise<RecordingProcess[]> {
    const { rows } = await queryAs<RecordingProcess>(processQueries.findAll, [limit, offset, q ?? null]);
    return rows;
  },

  async count(q?: string): Promise<number> {
    const { rows } = await queryAs<{ total: number }>(processQueries.count, [q ?? null]);
    return rows[0]?.total ?? 0;
  },

  /** Процессы со статусом running вместе с URL их recording_streams (для reconcile). */
  async findRunningWithStream(): Promise<RunningProcessWithStream[]> {
    const { rows } = await queryAs<RunningProcessWithStream>(processQueries.findRunningWithStream);
    return rows;
  },

  /** Самый ранний running-процесс потока (для выбора process/view пути в view-сессии). */
  async findRunningByStreamId(streamId: string): Promise<RunningProcessWithStream | null> {
    const { rows } = await queryAs<RunningProcessWithStream>(processQueries.findRunningByStreamId, [streamId]);
    return rows[0] ?? null;
  },

  async create(streamId: string, startedAt: Date, status: string, meta: EntityMeta = { name: null, description: null }): Promise<RecordingProcess> {
    return inUserContext(async (client) => {
      // Супертип процесса: type='process', parent_id = поток.
      // Название/описание — собственные метаданные, пишутся в сам INSERT.
      const { rows: objRows } = await client.query<{ objectId: string }>(processQueries.insert, [
        streamId, meta.name, meta.description,
      ]);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingProcess>(processQueries.insertProcess, [
        objectId, streamId, startedAt.toISOString(), status,
      ]);
      return rows[0]!;
    });
  },

  async put(id: string, streamId: string, startedAt: Date, endedAt: Date | null, status: string, meta: EntityMeta = { name: null, description: null }): Promise<RecordingProcess | null> {
    const process = await inUserContext(async (client) => {
      const { rows } = await client.query<RecordingProcess>(processQueries.putProcess, [
        streamId, startedAt.toISOString(), endedAt?.toISOString() ?? null, status, id,
      ]);
      if (!rows[0]) return null;
      // Синхронизируем родителя в супертипе при смене потока.
      await client.query(processQueries.setParent, [streamId, id]);
      // PUT = полная замена: перезаписываем и общие метаданные (name обязателен).
      await client.query(processQueries.setMeta, [meta.name, meta.description, id]);
      return rows[0];
    });
    if (process) invalidateObjectHierarchy(id);
    return process;
  },

  async patch(id: string, patch: { streamId?: string; startedAt?: Date; endedAt?: Date; endedAtClear?: boolean; status?: string } & EntityMetaPatch): Promise<RecordingProcess | null> {
    const process = await inUserContext(async (client) => {
      const { rows } = await client.query<RecordingProcess>(
        processQueries.patchProcess,
        [
          patch.streamId ?? null,
          patch.startedAt?.toISOString() ?? null,
          patch.endedAtClear ?? false,
          patch.endedAt?.toISOString() ?? null,
          patch.status ?? null,
          id,
        ],
      );
      if (!rows[0]) return null;
      if (patch.streamId !== undefined) {
        await client.query(processQueries.setParent, [patch.streamId ?? null, id]);
      }
      // Метаданные трогаем точечно: undefined — не менять, null — очистить.
      if (patch.name !== undefined) {
        await client.query(processQueries.setMetaName, [patch.name ?? null, id]);
      }
      if (patch.description !== undefined) {
        await client.query(processQueries.setMetaDescription, [patch.description ?? null, id]);
      }
      return rows[0];
    });
    if (process) invalidateObjectHierarchy(id);
    return process;
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(processQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
