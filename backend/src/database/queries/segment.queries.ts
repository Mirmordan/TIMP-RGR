/**
 * SELECT сегмента с общими метаданными супертипа. Резолюция name/description
 * fail-closed: собственное — objects сегмента; унаследованное — только через
 * RLS-доменные таблицы (recording_processes → recording_streams →
 * recording_devices). Невидимый пользователю родитель не отдаёт метаданных.
 * parentObjectId = s.process_id (уже видимое поле сегмента).
 */
const segmentNameExpr = "COALESCE(NULLIF(o.name, ''), NULLIF(po.name, ''), d.name)";
const segmentDescExpr = "COALESCE(NULLIF(o.description, ''), po.description)";

const segmentJoins = `
  JOIN objects o ON o.id = s.object_id
  LEFT JOIN recording_processes p ON p.object_id = s.process_id
  LEFT JOIN objects po ON po.id = p.object_id
  LEFT JOIN recording_streams st ON st.object_id = p.stream_id
  LEFT JOIN recording_devices d ON d.object_id = st.device_id
`;

const segmentSelect = `
  s.object_id AS "id", s.process_id AS "processId",
  s.stream_id AS "streamId", s.path,
  s.started_at AS "startedAt", s.ended_at AS "endedAt",
  s.file_count AS "fileCount", s.duration_s AS "durationS",
  s.size_bytes AS "sizeBytes",
  ${segmentNameExpr} AS "name",
  ${segmentDescExpr} AS "description",
  s.process_id AS "parentObjectId",
  o.created_at AS "createdAt"
`;

export const segmentQueries = {
  findById: `SELECT ${segmentSelect}
             FROM recording_segments s
             ${segmentJoins}
             WHERE s.object_id = $1`,

  findAll: `SELECT ${segmentSelect}
            FROM recording_segments s
            ${segmentJoins}
            ORDER BY s.started_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total" FROM recording_segments`,

  findByTimeRange: `SELECT ${segmentSelect}
                    FROM recording_segments s
                    ${segmentJoins}
                    WHERE s.started_at <= $2 AND s.ended_at >= $1
                    ORDER BY s.started_at`,

  findByProcess: `SELECT ${segmentSelect}
                  FROM recording_segments s
                  ${segmentJoins}
                  WHERE s.process_id = $1`,

  findByStream: `SELECT ${segmentSelect}
                 FROM recording_segments s
                 ${segmentJoins}
                 WHERE s.stream_id = $1
                 ORDER BY s.started_at DESC`,

  // Супертип сегмента: type='segment', parent_id = процесс.
  insert: `INSERT INTO objects (type, parent_id, owner_id) VALUES ('segment', $1, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertSegment: `INSERT INTO recording_segments
                  (object_id, process_id, stream_id, path, started_at, ended_at, file_count, duration_s, size_bytes)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                  RETURNING object_id AS "id", process_id AS "processId",
                            stream_id AS "streamId", path,
                            started_at AS "startedAt", ended_at AS "endedAt",
                            file_count AS "fileCount", duration_s AS "durationS",
                            size_bytes AS "sizeBytes"`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
