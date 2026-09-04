import type { User, UserAuth } from '../types';
import { pool } from '../database/connection';
import { userQueries } from '../database/queries/user.queries';

interface UserRow {
  id: string;
  username: string;
  email: string;
  passwordHash: string | null;
  createdAt: string;
}

function toUserAuth(row: UserRow): UserAuth {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function toUser(row: UserRow): User {
  const { passwordHash: _ph, ...user } = toUserAuth(row);
  void _ph;
  return user;
}

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    const { rows } = await pool.query<UserRow>(userQueries.findById, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  },

  async findByUsername(username: string): Promise<User | null> {
    const { rows } = await pool.query<UserRow>(userQueries.findByUsername, [username]);
    return rows[0] ? toUser(rows[0]) : null;
  },

  /** Внутренний: вернуть пользователя с хэшем пароля (только для auth). */
  async findAuthByUsername(username: string): Promise<UserAuth | null> {
    const { rows } = await pool.query<UserRow>(userQueries.findAuthByUsername, [username]);
    return rows[0] ? toUserAuth(rows[0]) : null;
  },

  async findAll(limit: number, offset: number): Promise<User[]> {
    const { rows } = await pool.query<UserRow>(userQueries.findAll, [limit, offset]);
    return rows.map(toUser);
  },

  async create(data: { username: string; email: string; passwordHash: string }): Promise<User> {
    const { rows } = await pool.query<UserRow>(userQueries.insert, [
      data.username,
      data.email,
      data.passwordHash,
    ]);
    const row = rows[0];
    if (!row) throw new Error('user not created');
    return toUser(row);
  },

  async put(id: string, data: { username: string; email: string; passwordHash: string }): Promise<User | null> {
    const { rows } = await pool.query<UserRow>(userQueries.put, [
      data.username,
      data.email,
      data.passwordHash,
      id,
    ]);
    return rows[0] ? toUser(rows[0]) : null;
  },

  async patch(id: string, patch: { username?: string; email?: string; passwordHash?: string }): Promise<User | null> {
    const { rows } = await pool.query<UserRow>(
      userQueries.patch,
      [patch.username ?? null, patch.email ?? null, patch.passwordHash ?? null, id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  },

  async deleteById(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(userQueries.deleteById, [id]);
    return (rowCount ?? 0) > 0;
  },
};
