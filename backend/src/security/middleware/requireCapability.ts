import type { Request, Response, NextFunction } from 'express';
import { hasCapability } from '../acl';
import type { Capability } from '../types';

/**
 * Проверяет глобальную capability (системную операцию управления,
 * напр. admin:read, admin:write, user:create).
 * Должен идти ПОСЛЕ authenticate.
 */
export function requireCapability(capability: Capability) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'требуется авторизация' });
      return;
    }
    const allowed = await hasCapability(user.id, capability);
    if (!allowed) {
      res.status(403).json({ error: 'недостаточно прав для операции' });
      return;
    }
    next();
  };
}
