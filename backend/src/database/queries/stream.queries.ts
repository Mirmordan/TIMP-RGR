/**
 * SELECT потока с общими метаданными супертипа. Название и описание —
 * собственные поля objects (device/stream), наследование по parent_id убрано.
 * parentObjectId = objects.parent_id; parentType — тип родительского объекта.
 */
const streamSelect = `
  s.object_id AS "id",
  s.url,
  s.device_id AS "deviceId",
  s.source_fingerprint AS "sourceFingerprint",
  NULLIF(o.name, '') AS "name",
  o.description AS "description",
  o.parent_id AS "parentObjectId",
  parent.type AS "parentType",
  o.created_at AS "createdAt"
`;

// Поиск потоков по собственному имени objects.name.
const streamNameExpr = "NULLIF(o.name, '')";

export const streamQueries = {
  findById: `SELECT ${streamSelect}
             FROM recording_streams s
             JOIN objects o ON o.id = s.object_id
             LEFT JOIN objects parent ON parent.id = o.parent_id
             WHERE s.object_id = $1`,

  findAll: `SELECT ${streamSelect}
            FROM recording_streams s
            JOIN objects o ON o.id = s.object_id
            LEFT JOIN objects parent ON parent.id = o.parent_id
            WHERE ($3::text IS NULL
                   OR s.url ILIKE '%' || $3 || '%'
                   OR ${streamNameExpr} ILIKE '%' || $3 || '%'
                   OR o.description ILIKE '%' || $3 || '%'
                   OR o.id::text ILIKE '%' || $3 || '%')
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total"
          FROM recording_streams s
          JOIN objects o ON o.id = s.object_id
          LEFT JOIN objects parent ON parent.id = o.parent_id
          WHERE ($1::text IS NULL
                 OR s.url ILIKE '%' || $1 || '%'
                 OR ${streamNameExpr} ILIKE '%' || $1 || '%'
                 OR o.description ILIKE '%' || $1 || '%'
                 OR o.id::text ILIKE '%' || $1 || '%')`,

  // Супертип потока: parent_id = объект устройства (device_id потока).
  // Название/описание — собственные метаданные объекта, пишутся сразу при create.
  insert: `INSERT INTO objects (type, name, description, parent_id, owner_id)
           VALUES ('stream', $2, $3, $1, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertStream: `INSERT INTO recording_streams (object_id, url, device_id, source_fingerprint) VALUES ($1, $2, $3, $4)
                 RETURNING object_id AS "id", url, device_id AS "deviceId", source_fingerprint AS "sourceFingerprint"`,

  // Общие метаданные потока: собственные objects.name/objects.description.
  // Название обязательно (проверяется сервисом).
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
