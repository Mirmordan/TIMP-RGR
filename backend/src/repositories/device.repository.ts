import type { RecordingDevice } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { deviceQueries } from '../database/queries/device.queries';

export const deviceRepository = {
  async findById(id: string): Promise<RecordingDevice | null> {
    const { rows } = await queryAs<RecordingDevice>(deviceQueries.findById, [id]);
    return rows[0] ?? null;
  },

  async findAll(limit: number, offset: number, q?: string): Promise<RecordingDevice[]> {
    const { rows } = await queryAs<RecordingDevice>(deviceQueries.findAll, [limit, offset, q ?? null]);
    return rows;
  },

  async count(q?: string): Promise<number> {
    const { rows } = await queryAs<{ total: number }>(deviceQueries.count, [q ?? null]);
    return rows[0]?.total ?? 0;
  },

  async create(name: string, type: string): Promise<RecordingDevice> {
    return inUserContext(async (client) => {
      const { rows: objRows } = await client.query<{ objectId: string }>(deviceQueries.insert);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingDevice>(deviceQueries.insertDevice, [objectId, name, type]);
      return rows[0]!;
    });
  },

  async put(id: string, name: string, type: string): Promise<RecordingDevice | null> {
    const { rows } = await queryAs<RecordingDevice>(deviceQueries.put, [name, type, id]);
    return rows[0] ?? null;
  },

  async patch(id: string, patch: { name?: string; type?: string }): Promise<RecordingDevice | null> {
    const { rows } = await queryAs<RecordingDevice>(
      deviceQueries.patch,
      [patch.name ?? null, patch.type ?? null, id],
    );
    return rows[0] ?? null;
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(deviceQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};