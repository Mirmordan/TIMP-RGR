import type { RecordingProcess } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { processQueries } from '../database/queries/process.queries';

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

  async create(streamId: string, startedAt: Date, status: string): Promise<RecordingProcess> {
    return inUserContext(async (client) => {
      // Супертип процесса: type='process', parent_id = поток.
      const { rows: objRows } = await client.query<{ objectId: string }>(processQueries.insert, [streamId]);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingProcess>(processQueries.insertProcess, [
        objectId, streamId, startedAt.toISOString(), status,
      ]);
      return rows[0]!;
    });
  },

  async put(id: string, streamId: string, startedAt: Date, endedAt: Date | null, status: string): Promise<RecordingProcess | null> {
    return inUserContext(async (client) => {
      const { rows } = await client.query<RecordingProcess>(processQueries.putProcess, [
        streamId, startedAt.toISOString(), endedAt?.toISOString() ?? null, status, id,
      ]);
      const process = rows[0];
      if (!process) return null;
      // Синхронизируем родителя в супертипе при смене потока.
      await client.query(processQueries.setParent, [streamId, id]);
      return process;
    });
  },

  async patch(id: string, patch: { streamId?: string; startedAt?: Date; endedAt?: Date; endedAtClear?: boolean; status?: string }): Promise<RecordingProcess | null> {
    return inUserContext(async (client) => {
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
      const process = rows[0];
      if (!process) return null;
      if (patch.streamId !== undefined) {
        await client.query(processQueries.setParent, [patch.streamId ?? null, id]);
      }
      return process;
    });
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(processQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
