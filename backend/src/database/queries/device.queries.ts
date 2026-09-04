export const deviceQueries = {
  findById: `SELECT d.object_id AS "id", d.name, d.type, o.created_at AS "createdAt"
             FROM recording_devices d
             JOIN objects o ON o.id = d.object_id
             WHERE d.object_id = $1`,

  findAll: `SELECT d.object_id AS "id", d.name, d.type, o.created_at AS "createdAt"
            FROM recording_devices d
            JOIN objects o ON o.id = d.object_id
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total" FROM recording_devices`,

  insert: `INSERT INTO objects DEFAULT VALUES
           RETURNING id AS "objectId"`,

  insertDevice: `INSERT INTO recording_devices (object_id, name, type) VALUES ($1, $2, $3)
                 RETURNING object_id AS "id", name, type`,

  put: `UPDATE recording_devices SET name = $1, type = $2 WHERE object_id = $3
        RETURNING object_id AS "id", name, type`,

  // NULL = не менять поле; передаём null для тех, что без изменений
  patch: `UPDATE recording_devices
          SET name = COALESCE($1, name),
              type = COALESCE($2, type)
          WHERE object_id = $3
          RETURNING object_id AS "id", name, type`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};