export const streamQueries = {
  findById: `SELECT s.object_id AS "id", s.url, s.device_id AS "deviceId", s.source_fingerprint AS "sourceFingerprint", o.created_at AS "createdAt"
             FROM recording_streams s
             JOIN objects o ON o.id = s.object_id
             WHERE s.object_id = $1`,

  findAll: `SELECT s.object_id AS "id", s.url, s.device_id AS "deviceId", s.source_fingerprint AS "sourceFingerprint", o.created_at AS "createdAt"
            FROM recording_streams s
            JOIN objects o ON o.id = s.object_id
            LEFT JOIN recording_devices d ON d.object_id = s.device_id
            WHERE ($3::text IS NULL OR s.url ILIKE '%' || $3 || '%' OR d.name ILIKE '%' || $3 || '%')
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total"
          FROM recording_streams s
          LEFT JOIN recording_devices d ON d.object_id = s.device_id
          WHERE ($1::text IS NULL OR s.url ILIKE '%' || $1 || '%' OR d.name ILIKE '%' || $1 || '%')`,

  insert: `INSERT INTO objects DEFAULT VALUES
           RETURNING id AS "objectId"`,

  insertStream: `INSERT INTO recording_streams (object_id, url, device_id, source_fingerprint) VALUES ($1, $2, $3, $4)
                 RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  put: `UPDATE recording_streams SET url = $1, device_id = $2, source_fingerprint = $3 WHERE object_id = $4
        RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  patch: `UPDATE recording_streams
          SET url              = COALESCE($1, url),
              device_id        = COALESCE($2, device_id),
              source_fingerprint = COALESCE($3, source_fingerprint)
          WHERE object_id = $4
          RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
