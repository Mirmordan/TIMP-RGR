/**
 * SELECT чанка с общими метаданными супертипа. Резолюция name/description
 * fail-closed: собственное — objects чанка; унаследованное — только через
 * RLS-доменные таблицы (recording_processes → recording_streams →
 * recording_devices). Невидимый пользователю родитель не отдаёт метаданных.
 * parentObjectId = c.process_id (уже видимое поле чанка).
 */
const chunkNameExpr = "COALESCE(NULLIF(o.name, ''), NULLIF(po.name, ''), NULLIF(so.name, ''), d.name)";
const chunkDescExpr = "COALESCE(NULLIF(o.description, ''), po.description)";

const chunkJoins = `
  JOIN objects o ON o.id = c.object_id
  LEFT JOIN recording_processes p ON p.object_id = c.process_id
  LEFT JOIN objects po ON po.id = p.object_id
  LEFT JOIN recording_streams st ON st.object_id = p.stream_id
  LEFT JOIN objects so ON so.id = st.object_id
  LEFT JOIN recording_devices d ON d.object_id = st.device_id
`;

export const chunkQueries = {
  findById: `SELECT c.object_id AS "id", c.process_id AS "processId",
                    c.started_at AS "startedAt", c.ended_at AS "endedAt", c.url,
                    ${chunkNameExpr} AS "name",
                    ${chunkDescExpr} AS "description",
                    c.process_id AS "parentObjectId",
                    o.created_at AS "createdAt"
             FROM recording_chunks c
             ${chunkJoins}
             WHERE c.object_id = $1`,

  findAll: `SELECT c.object_id AS "id", c.process_id AS "processId",
                   c.started_at AS "startedAt", c.ended_at AS "endedAt", c.url,
                   ${chunkNameExpr} AS "name",
                   ${chunkDescExpr} AS "description",
                   c.process_id AS "parentObjectId",
                   o.created_at AS "createdAt"
            FROM recording_chunks c
            ${chunkJoins}
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total" FROM recording_chunks`,

  // Супертип чанка: type='chunk', parent_id = процесс.
  insert: `INSERT INTO objects (type, parent_id, owner_id) VALUES ('chunk', $1, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertChunk: `INSERT INTO recording_chunks (object_id, process_id, started_at, ended_at, url)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING object_id AS "id", process_id AS "processId",
                          started_at AS "startedAt", ended_at AS "endedAt", url`,

  setParent: `UPDATE objects SET parent_id = $1 WHERE id = $2`,

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
