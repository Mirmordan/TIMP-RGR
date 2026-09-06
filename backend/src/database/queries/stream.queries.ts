/**
 * SELECT потока с общими метаданными супертипа. Резолюция name/description
 * fail-closed: собственное — objects потока; унаследованное — только из
 * RLS-таблицы recording_devices (невидимое устройство не отдаёт название).
 * parentObjectId = s.device_id (уже видимое поле потока).
 */
const streamSelect = `
  s.object_id AS "id",
  s.url,
  s.device_id AS "deviceId",
  s.source_fingerprint AS "sourceFingerprint",
  COALESCE(NULLIF(o.name, ''), d.name) AS "name",
  o.description AS "description",
  s.device_id AS "parentObjectId",
  o.created_at AS "createdAt"
`;

export const streamQueries = {
  findById: `SELECT ${streamSelect}
             FROM recording_streams s
             JOIN objects o ON o.id = s.object_id
             LEFT JOIN recording_devices d ON d.object_id = s.device_id
             WHERE s.object_id = $1`,

  findAll: `SELECT ${streamSelect}
            FROM recording_streams s
            JOIN objects o ON o.id = s.object_id
            LEFT JOIN recording_devices d ON d.object_id = s.device_id
            WHERE ($3::text IS NULL
                   OR s.url ILIKE '%' || $3 || '%'
                   OR COALESCE(NULLIF(o.name, ''), d.name) ILIKE '%' || $3 || '%'
                   OR o.description ILIKE '%' || $3 || '%')
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total"
          FROM recording_streams s
          JOIN objects o ON o.id = s.object_id
          LEFT JOIN recording_devices d ON d.object_id = s.device_id
          WHERE ($1::text IS NULL
                 OR s.url ILIKE '%' || $1 || '%'
                 OR COALESCE(NULLIF(o.name, ''), d.name) ILIKE '%' || $1 || '%'
                 OR o.description ILIKE '%' || $1 || '%')`,

  // Супертип потока: parent_id = объект устройства (device_id потока).
  insert: `INSERT INTO objects (type, parent_id) VALUES ('stream', $1)
           RETURNING id AS "objectId"`,

  insertStream: `INSERT INTO recording_streams (object_id, url, device_id, source_fingerprint) VALUES ($1, $2, $3, $4)
                 RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  setParent: `UPDATE objects SET parent_id = $1 WHERE id = $2`,

  putStream: `UPDATE recording_streams SET url = $1, device_id = $2, source_fingerprint = $3 WHERE object_id = $4
              RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  patchStream: `UPDATE recording_streams
                SET url              = COALESCE($1, url),
                    device_id        = COALESCE($2, device_id),
                    source_fingerprint = COALESCE($3, source_fingerprint)
                WHERE object_id = $4
                RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
