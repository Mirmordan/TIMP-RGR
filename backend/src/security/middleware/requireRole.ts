import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../types';

/**
 * Запрещает доступ, если роль юзера не входит в список разрешённых.
 * Должен идти ПОСЛЕ authenticate (использует req.user).
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'требуется авторизация' });
      return;
    }
    if (!allowed.includes(user.role)) {
      res.status(403).json({ error: 'недостаточно прав' });
      return;
    }
    next();
  };
}
