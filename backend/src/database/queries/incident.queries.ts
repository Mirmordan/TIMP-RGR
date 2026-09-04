export const incidentQueries = {
  findById: `SELECT i.object_id AS "id", i.process_id AS "processId",
                    i.segment_id AS "segmentId", i.title, i.description,
                    i.time_offset_s AS "timeOffsetS", i.severity,
                    i.created_at AS "createdAt",
                    u.username AS "createdBy"
             FROM recording_incidents i
             LEFT JOIN users u ON u.id = i.created_by
             WHERE i.object_id = $1`,

  findByProcess: `SELECT i.object_id AS "id", i.process_id AS "processId",
                         i.segment_id AS "segmentId", i.title, i.description,
                         i.time_offset_s AS "timeOffsetS", i.severity,
                         i.created_at AS "createdAt",
                         u.username AS "createdBy"
                  FROM recording_incidents i
                  LEFT JOIN users u ON u.id = i.created_by
                  WHERE i.process_id = $1
                  ORDER BY i.time_offset_s`,

  insert: `INSERT INTO objects DEFAULT VALUES RETURNING id AS "objectId"`,

  insertIncident: `INSERT INTO recording_incidents
                   (object_id, process_id, segment_id, title, description, time_offset_s, severity, created_by)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   RETURNING object_id AS "id", process_id AS "processId",
                             segment_id AS "segmentId", title, description,
                             time_offset_s AS "timeOffsetS", severity,
                             created_at AS "createdAt"`,

  deleteById: `DELETE FROM objects WHERE id = $1`,

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
