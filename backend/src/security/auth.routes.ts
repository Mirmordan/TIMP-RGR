import { Router } from 'express';
import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { authenticate } from './middleware/authenticate';

export const authRouter = Router();

const isProd = process.env.NODE_ENV === 'production';

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60 * 1000, // 30 минут
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

/** Регистрация: создаёт пользователя + выдаёт сессию. */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      res.status(400).json({ error: 'username, email и password обязательны' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'пароль минимум 6 символов' });
      return;
    }
    const result = await authService.register(username, email, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json({ user: result.user });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Логин: аутентификация + выдача сессии в cookies. */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'username и password обязательны' });
      return;
    }
    const result = await authService.login(username, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ user: result.user });
  } catch (e: any) {
    res.status(401).json({ error: e.message });
  }
});

/** Обновление сессии: читает refresh_token из cookie, выдаёт новую пару. */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) {
      res.status(401).json({ error: 'сессия не найдена' });
      return;
    }
    const result = await authService.refresh(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ user: result.user });
  } catch (e: any) {
    clearAuthCookies(res);
    res.status(401).json({ error: e.message });
  }
});

/** Выход: очистка cookies. */
authRouter.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

/** Текущий пользователь: читает access_token из cookie или Authorization header. */
authRouter.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});
