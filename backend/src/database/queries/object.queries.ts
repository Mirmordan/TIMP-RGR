/**
 * Объект как сущность: общие метаданные (name/description) из objects + тип,
 * родитель (parentObjectId/parentType) и эффективное наследуемое имя.
 * Используется общими эндпоинтами /objects/:id и PATCH /objects/:id/metadata.
 */
const objectSelect = `
  o.id AS "id",
  o.type AS "type",
  objects_effective_name(o.id) AS "name",
  NULLIF(o.name, '') AS "rawName",
  objects_effective_name(parent.id) AS "inheritedName",
  o.description AS "description",
  o.parent_id AS "parentObjectId",
  parent.type AS "parentType",
  o.created_at AS "createdAt"
`;

const objectFrom = `
  FROM objects o
  LEFT JOIN objects parent ON parent.id = o.parent_id
`;

export const objectQueries = {
  findById: `SELECT ${objectSelect}
             ${objectFrom}
             WHERE o.id = $1`,

  updateName: `UPDATE objects SET name = $1 WHERE id = $2`,
  updateDescription: `UPDATE objects SET description = $1 WHERE id = $2`,
  deleteById: `DELETE FROM objects WHERE id = $1`,
};
