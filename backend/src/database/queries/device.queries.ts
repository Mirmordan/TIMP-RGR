/**
 * Название и описание устройства живут только в objects(name/description).
 * Доменная таблица recording_devices хранит технические поля (тип), не имя.
 */
const deviceSelect = `
  d.object_id AS "id",
  objects_effective_name(o.id) AS "name",
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
                    OR objects_effective_name(o.id) ILIKE '%' || $3 || '%'
                   OR o.description ILIKE '%' || $3 || '%'
                   OR o.id::text ILIKE '%' || $3 || '%')
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total"
          FROM recording_devices d
          JOIN objects o ON o.id = d.object_id
          WHERE ($1::text IS NULL
                  OR objects_effective_name(o.id) ILIKE '%' || $1 || '%'
                 OR o.description ILIKE '%' || $1 || '%'
                 OR o.id::text ILIKE '%' || $1 || '%')`,

  // Общие метаданные устройства — единственный носитель: objects(name/description).
  // owner_id проставляется из контекста запроса (кто создал — тот видит).
  insert: `INSERT INTO objects (type, name, description, owner_id)
           VALUES ('device', $1, $2, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertDevice: `INSERT INTO recording_devices (object_id, type) VALUES ($1, $2)
                 RETURNING object_id AS "id", type`,

  putDevice: `UPDATE recording_devices SET type = $1 WHERE object_id = $2
              RETURNING object_id AS "id", type`,

  patchDevice: `UPDATE recording_devices SET type = COALESCE($1, type)
                WHERE object_id = $2
                RETURNING object_id AS "id", type`,

  // Точная перезапись общих метаданных устройства (PUT и осознанный PATCH).
  setMeta: `UPDATE objects SET name = $1, description = $2 WHERE id = $3`,

  // Точечные апдейты общих метаданных (PATCH по отдельному полю).
  setMetaName: `UPDATE objects SET name = $1 WHERE id = $2`,
  setMetaDescription: `UPDATE objects SET description = $1 WHERE id = $2`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
