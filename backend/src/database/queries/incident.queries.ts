/**
 * Инциденты: title/description внутренне опираются на общие поля супертипа
 * (objects.name/description), столбцы recording_incidents остаются зеркалом
 * для обратной совместимости API. Наследуемый родитель — процесс.
 * parentObjectId = i.process_id (уже видимое поле инцидента).
 */
export const incidentQueries = {
  findById: `SELECT i.object_id AS "id", i.process_id AS "processId",
                    i.segment_id AS "segmentId",
                    COALESCE(NULLIF(o.name, ''), i.title) AS "title",
                    COALESCE(NULLIF(o.description, ''), i.description) AS "description",
                    i.time_offset_s AS "timeOffsetS", i.severity,
                    i.process_id AS "parentObjectId",
                    i.created_at AS "createdAt",
                    u.username AS "createdBy"
             FROM recording_incidents i
             LEFT JOIN objects o ON o.id = i.object_id
             LEFT JOIN users u ON u.id = i.created_by
             WHERE i.object_id = $1`,

  findByProcess: `SELECT i.object_id AS "id", i.process_id AS "processId",
                         i.segment_id AS "segmentId",
                         COALESCE(NULLIF(o.name, ''), i.title) AS "title",
                         COALESCE(NULLIF(o.description, ''), i.description) AS "description",
                         i.time_offset_s AS "timeOffsetS", i.severity,
                         i.process_id AS "parentObjectId",
                         i.created_at AS "createdAt",
                         u.username AS "createdBy"
                  FROM recording_incidents i
                  LEFT JOIN objects o ON o.id = i.object_id
                  LEFT JOIN users u ON u.id = i.created_by
                  WHERE i.process_id = $1
                  ORDER BY i.time_offset_s`,

  // Супертип инцидента: type='incident', name/description = title/description,
  // parent_id = процесс. Столбцы recording_incidents.title/description остаются зеркалом.
  insert: `INSERT INTO objects (type, name, description, parent_id) VALUES ('incident', $1, $2, $3)
           RETURNING id AS "objectId"`,

  insertIncident: `INSERT INTO recording_incidents
                   (object_id, process_id, segment_id, title, description, time_offset_s, severity, created_by)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   RETURNING object_id AS "id", process_id AS "processId",
                             segment_id AS "segmentId", title, description,
                             time_offset_s AS "timeOffsetS", severity,
                             created_at AS "createdAt"`,

  // Удаление инцидента: recording_incidents.object_id НЕ имеет FK на objects —
  // строку удаляем явно (вместе с её супертипом), иначе остаётся orphan-строка.
  deleteIncident: `DELETE FROM recording_incidents WHERE object_id = $1`,

  deleteObject: `DELETE FROM objects WHERE id = $1`,

  setMeta: `UPDATE objects SET name = $1, description = $2 WHERE id = $3`,

  updateById: `UPDATE recording_incidents
               SET title = COALESCE($2, title),
                   description = $3,
                   severity = COALESCE($4, severity),
                   time_offset_s = COALESCE($5, time_offset_s)
               WHERE object_id = $1
               RETURNING object_id AS "id", process_id AS "processId",
                         segment_id AS "segmentId", title, description,
                         time_offset_s AS "timeOffsetS", severity,
                         created_at AS "createdAt"`,
};
