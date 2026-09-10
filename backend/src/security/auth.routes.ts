import { Router } from 'express';
import type { Request, Response } from 'express';
import { authService, AuthError } from './auth.service';
import { authenticate } from './middleware/authenticate';
import { userRepository } from '../repositories/user.repository';
import { rbacRepository } from '../repositories/rbac.repository';
import { pool } from '../database/connection';
import { auditService } from '../services/audit.service';
import { config } from '../config';
import { isOwnerUsername } from '../services/owner.service';
import type { Role, Capability } from './types';
import { replyError } from '../http/errors';

export const authRouter = Router();

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: config.security.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60 * 1000, // 30 минут
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: config.security.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

/** Роль из БД: приоритет admin, иначе первый из выданных, fallback viewer. */
async function fetchRole(userId: string): Promise<Role> {
  const { rows } = await pool.query<{ role: string | null }>(
    `SELECT (SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id ORDER BY CASE r.name WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1) AS "role"
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  return (rows[0]?.role as Role) || 'viewer';
}

/** Единая форма сессионного ответа: полный user из БД + актуальные capabilities (union по ролям). */
async function authPayload(userId: string): Promise<{
  user: { id: string; username: string; email: string; createdAt: string; role: Role; isOwner: boolean };
  capabilities: Capability[];
}> {
  const [user, role, capabilities] = await Promise.all([
    userRepository.findById(userId),
    fetchRole(userId),
    rbacRepository.findCapabilitiesByUser(userId),
  ]);
  if (!user) throw new Error('пользователь не найден');
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      role,
      isOwner: isOwnerUsername(user.username),
    },
    capabilities,
  };
}

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     operationId: login
 *     summary: Вход по логину и паролю
 *     description: Аутентификация + выдача сессии. Ставит httpOnly cookies access_token/refresh_token.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       '200':
 *         description: Успешный вход; cookies access_token/refresh_token установлены
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthPayload'
 *       '400':
 *         description: Не указаны username или password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Неверный логин или пароль
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'username и password обязательны' });
      return;
    }
    const result = await authService.login(username, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(await authPayload(result.user.id));
  } catch (e: any) {
    const raw = (req.body ?? {})?.username;
    await auditService.logAudit({
      actorId: null,
      actorName: null,
      action: 'auth.login.failed',
      details: {
        username: (typeof raw === 'string' ? raw : '').slice(0, 64),
        ip: req.ip,
      },
    });
    replyError(res, e, 'auth.login', 401);
  }
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     operationId: refreshSession
 *     summary: Обновление сессии
 *     description: Читает refresh_token из cookie и выдаёт новую пару access_token/refresh_token.
 *     security: []
 *     responses:
 *       '200':
 *         description: Новая пара токенов установлена в cookies
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthPayload'
 *       '401':
 *         description: Сессия не найдена или refresh-токен некорректен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) {
      res.status(401).json({ error: 'сессия не найдена' });
      return;
    }
    const result = await authService.refresh(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(await authPayload(result.user.id));
  } catch (e: any) {
    clearAuthCookies(res);
    replyError(res, e, 'auth.refresh', 401);
  }
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     operationId: logout
 *     summary: Выход из системы
 *     description: Очищает httpOnly cookies access_token/refresh_token.
 *     security: []
 *     responses:
 *       '200':
 *         description: Cookies очищены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     operationId: getMe
 *     summary: Текущий пользователь
 *     description: Читает access_token из cookie access_token или заголовка Authorization Bearer.
 *     responses:
 *       '200':
 *         description: Данные текущего пользователя и его capabilities
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthPayload'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'требуется авторизация' });
      return;
    }
    res.json(await authPayload(req.user.id));
  } catch (e: any) {
    replyError(res, e, 'auth.me', 401);
  }
});

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     operationId: changePassword
 *     summary: Смена пароля
 *     description: Проверяет текущий пароль, меняет на новый и перевыпускает пару токенов в cookies.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       '200':
 *         description: Пароль изменён, новая пара токенов установлена в cookies
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   required: [ok]
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                       example: true
 *                 - $ref: '#/components/schemas/AuthPayload'
 *       '400':
 *         description: currentPassword не указан, новый пароль короче 12 символов или совпадает с текущим
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация или неверный текущий пароль
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Пользователь не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'требуется авторизация' });
      return;
    }
    const { currentPassword, newPassword } = req.body ?? {};
    const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    await auditService.logAudit({
      actorId: req.user.id,
      actorName: req.user.username,
      action: 'auth.password.change',
      targetType: 'user',
      targetId: req.user.id,
    });
    res.json({ ok: true, user: await authPayload(req.user.id) });
  } catch (e: any) {
    replyError(res, e, 'auth.password.change', 400);
  }
});
