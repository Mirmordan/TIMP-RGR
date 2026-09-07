/**
 * SELECT потока с общими метаданными супертипа. Резолюция name/description
 * fail-closed: собственное — objects потока; унаследованное — только из
 * RLS-таблицы recording_devices (невидимое устройство не отдаёт название).
 * parentObjectId = s.device_id (уже видимое поле потока).
 * name — эффективное (для UI): явный override потока или название устройства.
 * rawName — собственный objects.name потока (NULL = нет override).
 * inheritedName — название родителя (устройства), которое видно при отсутствии override.
 */
const streamSelect = `
  s.object_id AS "id",
  s.url,
  s.device_id AS "deviceId",
  s.source_fingerprint AS "sourceFingerprint",
  COALESCE(NULLIF(o.name, ''), d.name) AS "name",
  NULLIF(o.name, '') AS "rawName",
  d.name AS "inheritedName",
  o.description AS "description",
  s.device_id AS "parentObjectId",
  o.created_at AS "createdAt"
`;

// Поток наследует название от устройства: objects.name потока хранит только
// ЯВНЫЙ override (NULL/'' = наследование от родителя).
const streamNameExpr = "COALESCE(NULLIF(o.name, ''), d.name)";

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
                   OR ${streamNameExpr} ILIKE '%' || $3 || '%'
                   OR o.description ILIKE '%' || $3 || '%')
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total"
          FROM recording_streams s
          JOIN objects o ON o.id = s.object_id
          LEFT JOIN recording_devices d ON d.object_id = s.device_id
          WHERE ($1::text IS NULL
                 OR s.url ILIKE '%' || $1 || '%'
                 OR ${streamNameExpr} ILIKE '%' || $1 || '%'
                 OR o.description ILIKE '%' || $1 || '%')`,

  // Супертип потока: parent_id = объект устройства (device_id потока).
  insert: `INSERT INTO objects (type, parent_id, owner_id) VALUES ('stream', $1, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertStream: `INSERT INTO recording_streams (object_id, url, device_id, source_fingerprint) VALUES ($1, $2, $3, $4)
                 RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  // Общие метаданные потока: name хранит ЯВНЫЙ override (NULL = наследовать
  // название устройства), description — собственное описание потока.
  setMeta: `UPDATE objects SET name = $1, description = $2 WHERE id = $3`,
  setMetaName: `UPDATE objects SET name = $1 WHERE id = $2`,
  setMetaDescription: `UPDATE objects SET description = $1 WHERE id = $2`,

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
