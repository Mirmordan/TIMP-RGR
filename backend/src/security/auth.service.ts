import { createAccessToken, createRefreshToken, verifyRefreshToken } from './tokens';
import { hashPassword, verifyPassword } from './password';
import { invalidateUser } from './acl';
import { userRepository } from '../repositories/user.repository';
import { pool } from '../database/connection';
import type { Role } from './types';

const ROLE_FALLBACK: Role = 'viewer';

async function getRole(userId: string): Promise<Role> {
  const { rows } = await pool.query<{ role: string | null }>(
    `SELECT (SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id ORDER BY CASE r.name WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1) AS "role"
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  return (rows[0]?.role as Role) || ROLE_FALLBACK;
}

export const authService = {
  /** Хэширование пароля — единая точка для всех операций над юзерами (create/put/patch). */
  hashPassword(plain: string): Promise<string> {
    return hashPassword(plain);
  },

  async register(username: string, email: string, password: string) {
    const existing = await userRepository.findAuthByUsername(username);
    if (existing) throw new Error('пользователь уже существует');
    const passwordHash = await hashPassword(password);
    const user = await userRepository.create({ username, email, passwordHash });
    // Выдаём роль viewer по умолчанию.
    const role = 'viewer' as const;
    return {
      accessToken: createAccessToken(user.id, user.username, role),
      refreshToken: createRefreshToken(user.id),
      user: { id: user.id, username: user.username, role },
    };
  },

  async login(username: string, password: string) {
    const user = await userRepository.findAuthByUsername(username);
    if (!user) throw new Error('неверный логин или пароль');
    if (!user.passwordHash) throw new Error('неверный логин или пароль');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new Error('неверный логин или пароль');

    const role = await getRole(user.id);
    return {
      accessToken: createAccessToken(user.id, user.username, role),
      refreshToken: createRefreshToken(user.id),
      user: { id: user.id, username: user.username, role },
    };
  },

  async refresh(token: string) {
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new Error('некорректный refresh-токен');
    }
    const user = await userRepository.findById(payload.sub);
    if (!user) throw new Error('пользователь не найден');
    const role = await getRole(user.id);
    return {
      accessToken: createAccessToken(user.id, user.username, role),
      refreshToken: createRefreshToken(user.id),
      user: { id: user.id, username: user.username, role },
    };
  },

  /** Сброс ACL-кеша юзера после изменения его ролей/прав. */
  invalidate(userId: string): void {
    invalidateUser(userId);
  },
};
