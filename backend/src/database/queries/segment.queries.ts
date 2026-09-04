export const segmentQueries = {
  findById: `SELECT s.object_id AS "id", s.process_id AS "processId",
                    s.stream_id AS "streamId", s.path,
                    s.started_at AS "startedAt", s.ended_at AS "endedAt",
                    s.file_count AS "fileCount", s.duration_s AS "durationS",
                    s.size_bytes AS "sizeBytes",
                    o.created_at AS "createdAt"
             FROM recording_segments s
             JOIN objects o ON o.id = s.object_id
             WHERE s.object_id = $1`,

  findAll: `SELECT s.object_id AS "id", s.process_id AS "processId",
                   s.stream_id AS "streamId", s.path,
                   s.started_at AS "startedAt", s.ended_at AS "endedAt",
                   s.file_count AS "fileCount", s.duration_s AS "durationS",
                   s.size_bytes AS "sizeBytes",
                   o.created_at AS "createdAt"
            FROM recording_segments s
            JOIN objects o ON o.id = s.object_id
            ORDER BY s.started_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total" FROM recording_segments`,

  findByTimeRange: `SELECT s.object_id AS "id", s.process_id AS "processId",
                           s.stream_id AS "streamId", s.path,
                           s.started_at AS "startedAt", s.ended_at AS "endedAt",
                           s.file_count AS "fileCount", s.duration_s AS "durationS",
                           s.size_bytes AS "sizeBytes",
                           o.created_at AS "createdAt"
                    FROM recording_segments s
                    JOIN objects o ON o.id = s.object_id
                    WHERE s.started_at <= $2 AND s.ended_at >= $1
                    ORDER BY s.started_at`,

  findByProcess: `SELECT s.object_id AS "id", s.process_id AS "processId",
                         s.stream_id AS "streamId", s.path,
                         s.started_at AS "startedAt", s.ended_at AS "endedAt",
                         s.file_count AS "fileCount", s.duration_s AS "durationS",
                         s.size_bytes AS "sizeBytes",
                         o.created_at AS "createdAt"
                  FROM recording_segments s
                  JOIN objects o ON o.id = s.object_id
                  WHERE s.process_id = $1`,

  findByStream: `SELECT s.object_id AS "id", s.process_id AS "processId",
                        s.stream_id AS "streamId", s.path,
                        s.started_at AS "startedAt", s.ended_at AS "endedAt",
                        s.file_count AS "fileCount", s.duration_s AS "durationS",
                        s.size_bytes AS "sizeBytes",
                        o.created_at AS "createdAt"
                 FROM recording_segments s
                 JOIN objects o ON o.id = s.object_id
                 WHERE s.stream_id = $1
                 ORDER BY s.started_at DESC`,

  insert: `INSERT INTO objects DEFAULT VALUES RETURNING id AS "objectId"`,

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
