/**
 * SELECT сегмента с общими метаданными супертипа. Резолюция name/description
 * fail-closed через общую иерархию objects.parent_id
 * (device ← stream ← process ← segment): objects_effective_name(o.id) —
 * собственный objects.name сегмента или имя читаемого родителя.
 * parentObjectId = objects.parent_id; parentType — тип родителя.
 */
const segmentNameExpr = "objects_effective_name(o.id)";
// Описание сегмента: собственное или унаследованное через objects-иерархию
// (fail-closed: нечитаемый родитель не отдаёт описание).
const segmentDescExpr = "objects_effective_description(o.id)";
const segmentRawNameExpr = "NULLIF(o.name, '')";

const segmentJoins = `
  JOIN objects o ON o.id = s.object_id
  LEFT JOIN objects parent ON parent.id = o.parent_id
`;

const segmentSelect = `
  s.object_id AS "id", s.process_id AS "processId",
  s.stream_id AS "streamId", s.path,
  s.started_at AS "startedAt", s.ended_at AS "endedAt",
  s.file_count AS "fileCount", s.duration_s AS "durationS",
  s.size_bytes AS "sizeBytes",
  ${segmentNameExpr} AS "name",
  ${segmentRawNameExpr} AS "rawName",
  objects_effective_name(parent.id) AS "inheritedName",
  ${segmentDescExpr} AS "description",
  o.parent_id AS "parentObjectId",
  parent.type AS "parentType",
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
