export const chunkQueries = {
  findById: `SELECT c.object_id AS "id", c.process_id AS "processId",
                    c.started_at AS "startedAt", c.ended_at AS "endedAt", c.url,
                    o.created_at AS "createdAt"
             FROM recording_chunks c
             JOIN objects o ON o.id = c.object_id
             WHERE c.object_id = $1`,

  findAll: `SELECT c.object_id AS "id", c.process_id AS "processId",
                   c.started_at AS "startedAt", c.ended_at AS "endedAt", c.url,
                   o.created_at AS "createdAt"
            FROM recording_chunks c
            JOIN objects o ON o.id = c.object_id
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total" FROM recording_chunks`,

  insert: `INSERT INTO objects DEFAULT VALUES
           RETURNING id AS "objectId"`,

  insertChunk: `INSERT INTO recording_chunks (object_id, process_id, started_at, ended_at, url)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING object_id AS "id", process_id AS "processId",
                          started_at AS "startedAt", ended_at AS "endedAt", url`,

  put: `UPDATE recording_chunks
        SET process_id = $1, started_at = $2, ended_at = $3, url = $4
        WHERE object_id = $5
        RETURNING object_id AS "id", process_id AS "processId",
                  started_at AS "startedAt", ended_at AS "endedAt", url`,

  patch: `UPDATE recording_chunks
          SET process_id = COALESCE($1, process_id),
              started_at = COALESCE($2, started_at),
              ended_at   = COALESCE($3, ended_at),
              url        = COALESCE($4, url)
          WHERE object_id = $5
          RETURNING object_id AS "id", process_id AS "processId",
                    started_at AS "startedAt", ended_at AS "endedAt", url`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
