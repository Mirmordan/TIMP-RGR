export const processQueries = {
  findById: `SELECT p.object_id AS "id", p.stream_id AS "streamId",
                    p.started_at AS "startedAt", p.ended_at AS "endedAt", p.status,
                    o.created_at AS "createdAt"
             FROM recording_processes p
             JOIN objects o ON o.id = p.object_id
             WHERE p.object_id = $1`,

  findAll: `SELECT p.object_id AS "id", p.stream_id AS "streamId",
                   p.started_at AS "startedAt", p.ended_at AS "endedAt", p.status,
                   o.created_at AS "createdAt"
            FROM recording_processes p
            JOIN objects o ON o.id = p.object_id
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total" FROM recording_processes`,

  insert: `INSERT INTO objects DEFAULT VALUES
           RETURNING id AS "objectId"`,

  insertProcess: `INSERT INTO recording_processes (object_id, stream_id, started_at, status)
                  VALUES ($1, $2, $3, $4)
                  RETURNING object_id AS "id", stream_id AS "streamId",
                           started_at AS "startedAt", ended_at AS "endedAt", status`,

  put: `UPDATE recording_processes
        SET stream_id  = $1, started_at = $2, ended_at = $3, status = $4
        WHERE object_id = $5
        RETURNING object_id AS "id", stream_id AS "streamId",
                  started_at AS "startedAt", ended_at AS "endedAt", status`,

  patch: `UPDATE recording_processes
          SET stream_id  = COALESCE($1, stream_id),
              started_at = COALESCE($2, started_at),
              ended_at   = CASE WHEN $3::bool THEN NULL ELSE COALESCE($4, ended_at) END,
              status     = COALESCE($5, status)
          WHERE object_id = $6
          RETURNING object_id AS "id", stream_id AS "streamId",
                    started_at AS "startedAt", ended_at AS "endedAt", status`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
