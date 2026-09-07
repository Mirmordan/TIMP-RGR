/**
 * SELECT процесса с общими метаданными супертипа. Название и описание —
 * собственные поля objects. Наследование от потока/устройства по parent_id
 * убрано (device ← stream ← process: каждый объект сам себе имя).
 * parentObjectId = objects.parent_id; parentType — тип родительского объекта.
 */
const processNameExpr = "NULLIF(po.name, '')";

const processSelect = `
  p.object_id AS "id",
  p.stream_id AS "streamId",
  p.started_at AS "startedAt",
  p.ended_at AS "endedAt",
  p.status,
  ${processNameExpr} AS "name",
  po.description AS "description",
  po.parent_id AS "parentObjectId",
  parent.type AS "parentType",
  po.created_at AS "createdAt"
`;

const processFrom = `
  FROM recording_processes p
  JOIN objects po ON po.id = p.object_id
  LEFT JOIN recording_streams s ON s.object_id = p.stream_id
  LEFT JOIN objects parent ON parent.id = po.parent_id
`;

export const processQueries = {
  findById: `SELECT ${processSelect}
             ${processFrom}
             WHERE p.object_id = $1`,

  findAll: `SELECT ${processSelect}
            ${processFrom}
            WHERE ($3::text IS NULL
                   OR p.object_id::text ILIKE '%' || $3 || '%'
                   OR s.url ILIKE '%' || $3 || '%'
                   OR ${processNameExpr} ILIKE '%' || $3 || '%'
                   OR po.description ILIKE '%' || $3 || '%')
            ORDER BY po.created_at DESC
            LIMIT $1 OFFSET $2`,

  count: `SELECT COUNT(*)::int AS "total"
          ${processFrom}
          WHERE ($1::text IS NULL
                 OR p.object_id::text ILIKE '%' || $1 || '%'
                 OR s.url ILIKE '%' || $1 || '%'
                 OR ${processNameExpr} ILIKE '%' || $1 || '%'
                 OR po.description ILIKE '%' || $1 || '%')`,

  /** Все процессы со статусом running + URL источника (recording_streams.url). */
  findRunningWithStream: `SELECT p.object_id AS "id", p.stream_id AS "streamId",
                                 p.started_at AS "startedAt", p.status,
                                 s.url AS "streamUrl"
                          FROM recording_processes p
                          JOIN recording_streams s ON s.object_id = p.stream_id
                          WHERE p.status = 'running'
                          ORDER BY p.started_at`,

  /** Самый ранний running-процесс потока (для выбора process/view пути). */
  findRunningByStreamId: `SELECT p.object_id AS "id", p.stream_id AS "streamId",
                                 p.started_at AS "startedAt", p.status,
                                 s.url AS "streamUrl"
                          FROM recording_processes p
                          JOIN recording_streams s ON s.object_id = p.stream_id
                          WHERE p.status = 'running' AND p.stream_id = $1
                          ORDER BY p.started_at
                          LIMIT 1`,

  // Супертип процесса: type='process', parent_id = поток (объект).
  // Название/описание — собственные метаданные, пишутся сразу при create.
  insert: `INSERT INTO objects (type, name, description, parent_id, owner_id)
           VALUES ('process', $2, $3, $1, NULLIF(current_setting('app.user_id', true), '')::UUID)
           RETURNING id AS "objectId"`,

  insertProcess: `INSERT INTO recording_processes (object_id, stream_id, started_at, status)
                  VALUES ($1, $2, $3, $4)
                  RETURNING object_id AS "id", stream_id AS "streamId",
                           started_at AS "startedAt", ended_at AS "endedAt", status`,

  setParent: `UPDATE objects SET parent_id = $1 WHERE id = $2`,

  // Общие метаданные процесса: собственные objects.name/objects.description.
  // Название обязательно (проверяется сервисом).
  setMeta: `UPDATE objects SET name = $1, description = $2 WHERE id = $3`,
  setMetaName: `UPDATE objects SET name = $1 WHERE id = $2`,
  setMetaDescription: `UPDATE objects SET description = $1 WHERE id = $2`,

  putProcess: `UPDATE recording_processes
               SET stream_id  = $1, started_at = $2, ended_at = $3, status = $4
               WHERE object_id = $5
               RETURNING object_id AS "id", stream_id AS "streamId",
                         started_at AS "startedAt", ended_at AS "endedAt", status`,

  patchProcess: `UPDATE recording_processes
                 SET stream_id  = COALESCE($1, stream_id),
                     started_at = COALESCE($2, started_at),
                     ended_at   = CASE WHEN $3::bool THEN NULL ELSE COALESCE($4, ended_at) END,
                     status     = COALESCE($5, status)
                 WHERE object_id = $6
                 RETURNING object_id AS "id", stream_id AS "streamId",
                           started_at AS "startedAt", ended_at AS "endedAt", status`,

  deleteById: `DELETE FROM objects WHERE id = $1`,
};
