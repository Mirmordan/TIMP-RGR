import type { CommonObjectMeta } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { objectQueries } from '../database/queries/object.queries';

/** Ответ общих объектных эндпоинтов: тип + метаданные + родитель. */
export interface ObjectMetaView extends CommonObjectMeta {
  id: string;
  type: string | null;
  rawName: string | null;
  inheritedName: string | null;
  createdAt: Date;
}

export const objectRepository = {
  async findById(id: string): Promise<ObjectMetaView | null> {
    const { rows } = await queryAs<ObjectMetaView>(objectQueries.findById, [id]);
    return rows[0] ?? null;
  },

  /**
   * Запись общих метаданных объекта (name/description).
   * - name ''/null = очистить override (для потоков/процессов — наследование),
   *   для device — очистка запрещена (у зеркала recording_devices.name NOT NULL);
   * - description ''/null = очистить.
   * Возвращает обновлённый объект.
   */
  async patchMetadata(id: string, patch: { name?: string | null; description?: string | null }): Promise<ObjectMetaView | null> {
    return inUserContext(async (client) => {
      const cur = (await client.query<{ id: string; type: string }>(
        'SELECT id, type FROM objects WHERE id = $1', [id],
      )).rows[0];
      if (!cur) return null;

      const name = patch.name !== undefined
        ? (patch.name ?? '').trim() || null
        : undefined;
      const description = patch.description !== undefined
        ? (patch.description ?? '').trim() || null
        : undefined;

      if (cur.type === 'device') {
        if (name === null) {
          throw new Error('имя устройства обязательно');
        }
        if (name !== undefined) {
          // Зеркало recording_devices.name NOT NULL держим в синхроне.
          await client.query('UPDATE recording_devices SET name = $1 WHERE object_id = $2', [name, id]);
        }
      }

      if (name !== undefined) {
        await client.query(objectQueries.updateName, [name, id]);
      }
      if (description !== undefined) {
        await client.query(objectQueries.updateDescription, [description, id]);
      }

      const { rows } = await client.query<ObjectMetaView>(objectQueries.findById, [id]);
      return rows[0] ?? null;
    });
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(objectQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
