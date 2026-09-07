/**
 * SELECT чанка с общими метаданными супертипа. Резолюция name/description
 * fail-closed через общую иерархию objects.parent_id
 * (device ← stream ← process ← chunk): objects_effective_name(o.id) —
 * собственный objects.name чанка или имя читаемого родителя.
 * parentObjectId = objects.parent_id; parentType — тип родителя.
 */
const chunkNameExpr = "objects_effective_name(o.id)";
// Описание чанка: собственное или унаследованное через objects-иерархию
// (fail-closed: нечитаемый родитель не отдаёт описание).
const chunkDescExpr = "objects_effective_description(o.id)";
const chunkJoins = `
  JOIN objects o ON o.id = c.object_id
  LEFT JOIN objects parent ON parent.id = o.parent_id
`;

const chunkSelect = `
  c.object_id AS "id", c.process_id AS "processId",
  c.started_at AS "startedAt", c.ended_at AS "endedAt", c.url,
  ${chunkNameExpr} AS "name",
  ${chunkDescExpr} AS "description",
  o.parent_id AS "parentObjectId",
  parent.type AS "parentType",
  o.created_at AS "createdAt"
`;

export const chunkQueries = {
  findById: `SELECT ${chunkSelect}
             FROM recording_chunks c
             ${chunkJoins}
             WHERE c.object_id = $1`,

  findAll: `SELECT ${chunkSelect}
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
