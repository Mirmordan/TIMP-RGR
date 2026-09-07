import type { RecordingStream } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { streamQueries } from '../database/queries/stream.queries';
import type { EntityMeta, EntityMetaPatch } from '../services/entityMeta';

export const streamRepository = {
  async findById(id: string): Promise<RecordingStream | null> {
    const { rows } = await queryAs<RecordingStream>(streamQueries.findById, [id]);
    return rows[0] ?? null;
  },

  async findAll(limit: number, offset: number, q?: string): Promise<RecordingStream[]> {
    const { rows } = await queryAs<RecordingStream>(streamQueries.findAll, [limit, offset, q ?? null]);
    return rows;
  },

  async count(q?: string): Promise<number> {
    const { rows } = await queryAs<{ total: number }>(streamQueries.count, [q ?? null]);
    return rows[0]?.total ?? 0;
  },

  async create(url: string, deviceId?: string, sourceFingerprint?: string, meta: EntityMeta = { name: null, description: null }): Promise<RecordingStream> {
    return inUserContext(async (client) => {
      // Супертип потока: type='stream', parent_id = устройство (если привязано).
      const { rows: objRows } = await client.query<{ objectId: string }>(streamQueries.insert, [deviceId ?? null]);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingStream>(streamQueries.insertStream, [objectId, url, deviceId ?? null, sourceFingerprint ?? null]);
      await client.query(streamQueries.setMeta, [meta.name, meta.description, objectId]);
      return rows[0]!;
    });
  },

  async put(id: string, url: string, deviceId?: string, sourceFingerprint?: string, meta: EntityMeta = { name: null, description: null }): Promise<RecordingStream | null> {
    return inUserContext(async (client) => {
      const { rows } = await client.query<RecordingStream>(streamQueries.putStream, [url, deviceId ?? null, sourceFingerprint ?? null, id]);
      const stream = rows[0];
      if (!stream) return null;
      // Синхронизируем родителя в супертипе при смене устройства потока.
      await client.query(streamQueries.setParent, [deviceId ?? null, id]);
      // PUT = полная замена: перезаписываем и общие метаданные (null name = наследование).
      await client.query(streamQueries.setMeta, [meta.name, meta.description, id]);
      return stream;
    });
  },

  async patch(id: string, patch: { url?: string; deviceId?: string; sourceFingerprint?: string } & EntityMetaPatch): Promise<RecordingStream | null> {
    return inUserContext(async (client) => {
      const { rows } = await client.query<RecordingStream>(
        streamQueries.patchStream,
        [patch.url ?? null, patch.deviceId ?? null, patch.sourceFingerprint ?? null, id],
      );
      const stream = rows[0];
      if (!stream) return null;
      if (patch.deviceId !== undefined) {
        await client.query(streamQueries.setParent, [patch.deviceId ?? null, id]);
      }
      // Метаданные трогаем точечно: undefined — не менять, null — очистить.
      if (patch.name !== undefined) {
        await client.query(streamQueries.setMetaName, [patch.name ?? null, id]);
      }
      if (patch.description !== undefined) {
        await client.query(streamQueries.setMetaDescription, [patch.description ?? null, id]);
      }
      return stream;
    });
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(streamQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
