import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../tokens';
import { runWithUser } from '../dbBridge';
import type { AuthUser } from '../types';

/**
 * Валидирует Access-токен из cookie (`access_token`) или `Authorization: Bearer <token>`.
 * Приоритет: cookie → header.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  // 1. Пробуем cookie
  if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  }

  // 2. Fallback на Authorization header
  if (!token) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      token = header.slice('Bearer '.length).trim();
    }
  }

  if (!token) {
    res.status(401).json({ error: 'требуется авторизация' });
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: 'некорректный или просроченный токен' });
    return;
  }

  const user: AuthUser = {
    id: payload.sub,
    username: payload.username,
    role: payload.role,
  };
  req.user = user;
  runWithUser(user.id, next);
}
