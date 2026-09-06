import type { RecordingChunk } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { chunkQueries } from '../database/queries/chunk.queries';

export const chunkRepository = {
  async findById(id: string): Promise<RecordingChunk | null> {
    const { rows } = await queryAs<RecordingChunk>(chunkQueries.findById, [id]);
    return rows[0] ?? null;
  },

  async findAll(limit: number, offset: number): Promise<RecordingChunk[]> {
    const { rows } = await queryAs<RecordingChunk>(chunkQueries.findAll, [limit, offset]);
    return rows;
  },

  async count(): Promise<number> {
    const { rows } = await queryAs<{ total: number }>(chunkQueries.count);
    return rows[0]?.total ?? 0;
  },

  async create(processId: string, startedAt: Date, endedAt: Date, url: string): Promise<RecordingChunk> {
    return inUserContext(async (client) => {
      // Супертип чанка: type='chunk', parent_id = процесс.
      const { rows: objRows } = await client.query<{ objectId: string }>(chunkQueries.insert, [processId]);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingChunk>(chunkQueries.insertChunk, [
        objectId, processId, startedAt.toISOString(), endedAt.toISOString(), url,
      ]);
      return rows[0]!;
    });
  },

  async put(id: string, processId: string, startedAt: Date, endedAt: Date, url: string): Promise<RecordingChunk | null> {
    return inUserContext(async (client) => {
      const { rows } = await client.query<RecordingChunk>(chunkQueries.put, [
        processId, startedAt.toISOString(), endedAt.toISOString(), url, id,
      ]);
      const chunk = rows[0];
      if (!chunk) return null;
      await client.query(chunkQueries.setParent, [processId, id]);
      return chunk;
    });
  },

  async patch(id: string, patch: { processId?: string; startedAt?: Date; endedAt?: Date; url?: string }): Promise<RecordingChunk | null> {
    return inUserContext(async (client) => {
      const { rows } = await client.query<RecordingChunk>(
        chunkQueries.patch,
        [
          patch.processId ?? null,
          patch.startedAt?.toISOString() ?? null,
          patch.endedAt?.toISOString() ?? null,
          patch.url ?? null,
          id,
        ],
      );
      const chunk = rows[0];
      if (!chunk) return null;
      if (patch.processId !== undefined) {
        await client.query(chunkQueries.setParent, [patch.processId, id]);
      }
      return chunk;
    });
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(chunkQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
