/** Общие метаданные устройства: name/description из супертипа objects. */
const deviceSelect = `
  d.object_id AS "id",
  COALESCE(NULLIF(o.name, ''), d.name) AS "name",
  d.type,
  o.description AS "description",
  o.created_at AS "createdAt"
`;

export const deviceQueries = {
  findById: `SELECT ${deviceSelect}
             FROM recording_devices d
             JOIN objects o ON o.id = d.object_id
             WHERE d.object_id = $1`,

  findAll: `SELECT ${deviceSelect}
            FROM recording_devices d
            JOIN objects o ON o.id = d.object_id
            WHERE ($3::text IS NULL
                   OR COALESCE(NULLIF(o.name, ''), d.name) ILIKE '%' || $3 || '%'
                   OR o.description ILIKE '%' || $3 || '%')
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total"
          FROM recording_devices d
          JOIN objects o ON o.id = d.object_id
          WHERE ($1::text IS NULL
                 OR COALESCE(NULLIF(o.name, ''), d.name) ILIKE '%' || $1 || '%'
                 OR o.description ILIKE '%' || $1 || '%')`,

  // Общие метаданные (name/description) — полный владелец objects; recording_devices.name
  // остаётся синхронным зеркалом (для RLS-наследования и столбца NOT NULL):
  // пишется одновременно с objects.name в одном репозитории/транзакции.
  // owner_id проставляется из контекста запроса (кто создал — тот видит).
  insert: `INSERT INTO objects (type, name, description, owner_id)
           VALUES ('device', $1, $2, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertDevice: `INSERT INTO recording_devices (object_id, name, type) VALUES ($1, $2, $3)
                 RETURNING object_id AS "id", name, type`,

  putDevice: `UPDATE recording_devices SET name = $1, type = $2 WHERE object_id = $3
              RETURNING object_id AS "id", name, type`,

  // NULL = не менять поле; передаём null для тех, что без изменений
  patchDevice: `UPDATE recording_devices
                SET name = COALESCE($1, name),
                    type = COALESCE($2, type)
                WHERE object_id = $3
                RETURNING object_id AS "id", name, type`,

  // Точная перезапись общих метаданных устройства (PUT и осознанный PATCH).
  setMeta: `UPDATE objects SET name = $1, description = $2 WHERE id = $3`,

  // Точечные апдейты общих метаданных (PATCH по отдельному полю).
  setMetaName: `UPDATE objects SET name = $1 WHERE id = $2`,
  setMetaDescription: `UPDATE objects SET description = $1 WHERE id = $2`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
