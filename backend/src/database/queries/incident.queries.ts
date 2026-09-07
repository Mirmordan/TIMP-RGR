/**
 * Инциденты: name/description хранятся ТОЛЬКО в объекте-супертипе
 * (objects.name/description). recording_incidents хранит доменные поля
 * (process/segment/время/severity/автор) и связан с objects FK ON DELETE CASCADE.
 * parentObjectId = objects.parent_id; parentType — тип родителя.
 * title — устаревший алиас name для обратной совместимости.
 */
const incidentSelect = `
  i.object_id AS "id", i.process_id AS "processId",
  i.segment_id AS "segmentId",
  o.name AS "name",
  o.name AS "title",
  o.description AS "description",
  i.time_offset_s AS "timeOffsetS", i.severity,
  o.parent_id AS "parentObjectId",
  parent.type AS "parentType",
  i.created_at AS "createdAt",
  u.username AS "createdBy"
`;

const incidentFrom = `
  FROM recording_incidents i
  JOIN objects o ON o.id = i.object_id
  LEFT JOIN objects parent ON parent.id = o.parent_id
  LEFT JOIN users u ON u.id = i.created_by
`;

export const incidentQueries = {
  findById: `SELECT ${incidentSelect}
             ${incidentFrom}
             WHERE i.object_id = $1`,

  findByProcess: `SELECT ${incidentSelect}
                  ${incidentFrom}
                  WHERE i.process_id = $1
                  ORDER BY i.time_offset_s`,

  // Супертип инцидента: type='incident', name/description = общие метаданные,
  // parent_id = процесс. Столбцов title/description в recording_incidents больше нет.
  insert: `INSERT INTO objects (type, name, description, parent_id, owner_id)
           VALUES ('incident', $1, $2, $3, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertIncident: `INSERT INTO recording_incidents
                   (object_id, process_id, segment_id, time_offset_s, severity, created_by)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   RETURNING object_id AS "id", process_id AS "processId",
                             segment_id AS "segmentId",
                             time_offset_s AS "timeOffsetS", severity,
                             created_at AS "createdAt"`,

  // Удаление инцидента: достаточно удалить супертип — recording_incidents
  // удаляется каскадом по FK object_id -> objects(id).
  deleteById: `DELETE FROM objects WHERE id = $1`,

  setMetaName: `UPDATE objects SET name = $1 WHERE id = $2`,
  setMetaDescription: `UPDATE objects SET description = $1 WHERE id = $2`,

  updateIncident: `UPDATE recording_incidents
                   SET severity = COALESCE($2, severity),
                       time_offset_s = COALESCE($3, time_offset_s)
                   WHERE object_id = $1
                   RETURNING object_id AS "id"`,
};
