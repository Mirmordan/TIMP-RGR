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

  async create(name: string, type: string, description: string | null = null): Promise<RecordingDevice> {
    return inUserContext(async (client) => {
      // Common metadata (name/description) пишем в objects — супертип устройства.
      const { rows: objRows } = await client.query<{ objectId: string }>(deviceQueries.insert, [name, description]);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      // recording_devices.name — синхронное зеркало (RLS-домен, legacy API).
      const { rows } = await client.query<RecordingDevice>(deviceQueries.insertDevice, [objectId, name, type]);
      return rows[0]!;
    });
  },

  async put(id: string, name: string, type: string, description: string | null = null): Promise<RecordingDevice | null> {
    return inUserContext(async (client) => {
      const { rows } = await client.query<RecordingDevice>(deviceQueries.putDevice, [name, type, id]);
      const device = rows[0];
      if (!device) return null;
      // PUT = полная замена: перезаписываем и name, и description (null — очистить).
      await client.query(deviceQueries.setMeta, [name, description, id]);
      return device;
    });
  },

  async patch(id: string, patch: { name?: string; type?: string; description?: string | null }): Promise<RecordingDevice | null> {
    return inUserContext(async (client) => {
      const { rows } = await client.query<RecordingDevice>(
        deviceQueries.patchDevice,
        [patch.name ?? null, patch.type ?? null, id],
      );
      const device = rows[0];
      if (!device) return null;
      // name зеркалим в objects (супертип), description — точечно в objects.
      if (patch.name !== undefined) {
        await client.query(deviceQueries.setMetaName, [patch.name, id]);
      }
      if (patch.description !== undefined) {
        await client.query(deviceQueries.setMetaDescription, [patch.description, id]);
      }
      return device;
    });
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(deviceQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
