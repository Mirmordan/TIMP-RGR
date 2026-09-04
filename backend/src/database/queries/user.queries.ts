export const userQueries = {
  findById: `SELECT id, username, email, created_at AS "createdAt" FROM users WHERE id = $1`,

  findByUsername: `SELECT id, username, email, created_at AS "createdAt" FROM users WHERE username = $1`,

  findAuthByUsername: `SELECT id, username, email, password_hash AS "passwordHash", created_at AS "createdAt" FROM users WHERE username = $1`,

  findAll: `SELECT id, username, email, created_at AS "createdAt" FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,

  insert: `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
           RETURNING id, username, email, password_hash AS "passwordHash", created_at AS "createdAt"`,

  put: `UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4
        RETURNING id, username, email, password_hash AS "passwordHash", created_at AS "createdAt"`,

  // NULL = не менять поле; передаём null для тех, что без изменений.
  // password_hash: null = не трогать; любое значение = перезаписать.
  patch: `UPDATE users
          SET username      = COALESCE($1, username),
              email         = COALESCE($2, email),
              password_hash = COALESCE($3, password_hash)
          WHERE id = $4
          RETURNING id, username, email, password_hash AS "passwordHash", created_at AS "createdAt"`,

  deleteById: `DELETE FROM users WHERE id = $1`,
};