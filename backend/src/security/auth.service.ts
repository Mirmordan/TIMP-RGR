import { createAccessToken, createRefreshToken, verifyRefreshToken } from './tokens';
import { hashPassword, verifyPassword } from './password';
import { invalidateUser } from './acl';
import { userRepository } from '../repositories/user.repository';
import { pool } from '../database/connection';
import type { Role } from './types';

const ROLE_FALLBACK: Role = 'viewer';

// Общие правила полей для профиля/пароля (username/email/password).
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

/** Ошибка с HTTP-статусом (для /auth/profile и /auth/change-password). */
export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function assertUsername(username: unknown): asserts username is string {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new AuthError(400, 'username: 3-32 символа, латиница/цифры/._-, начинается с буквы или цифры');
  }
}

function assertEmail(email: unknown): asserts email is string {
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    throw new AuthError(400, 'некорректный email');
  }
}

function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw new AuthError(400, `пароль минимум ${PASSWORD_MIN} символов`);
  }
}

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

  /** Профиль: обновление своих username/email (пароль не трогаем). */
  async updateProfile(userId: string, patch: { username?: string; email?: string }): Promise<void> {
    if (patch.username === undefined && patch.email === undefined) {
      throw new AuthError(400, 'укажите username или email');
    }
    if (patch.username !== undefined) assertUsername(patch.username);
    if (patch.email !== undefined) assertEmail(patch.email);
    if (patch.username !== undefined) {
      const clash = await userRepository.findByUsername(patch.username);
      if (clash && clash.id !== userId) throw new AuthError(409, 'username уже занят');
    }
    if (patch.email !== undefined) {
      const clash = await userRepository.findByEmail(patch.email);
      if (clash && clash.id !== userId) throw new AuthError(409, 'email уже занят');
    }
    const updated = await userRepository.patch(userId, {
      ...(patch.username !== undefined ? { username: patch.username } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
    });
    if (!updated) throw new AuthError(404, 'пользователь не найден');
  },

  /** Смена пароля: проверка текущего, новый хэш + перевыпуск пары токенов. */
  async changePassword(userId: string, currentPassword: unknown, newPassword: unknown) {
    const user = await userRepository.findAuthById(userId);
    if (!user || !user.passwordHash) throw new AuthError(401, 'неверный текущий пароль');
    if (typeof currentPassword !== 'string' || currentPassword === '') {
      throw new AuthError(400, 'currentPassword обязателен');
    }
    const currentOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentOk) throw new AuthError(401, 'неверный текущий пароль');
    assertPassword(newPassword);
    const sameAsOld = await verifyPassword(newPassword, user.passwordHash);
    if (sameAsOld) throw new AuthError(400, 'новый пароль совпадает с текущим');
    const passwordHash = await hashPassword(newPassword);
    const updated = await userRepository.patch(userId, { passwordHash });
    if (!updated) throw new AuthError(404, 'пользователь не найден');
    const role = await getRole(userId);
    return {
      accessToken: createAccessToken(user.id, user.username, role),
      refreshToken: createRefreshToken(user.id),
    };
  },

  /** Сброс ACL-кеша юзера после изменения его ролей/прав. */
  invalidate(userId: string): void {
    invalidateUser(userId);
  },
};
