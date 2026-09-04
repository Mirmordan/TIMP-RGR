import type { Request, Response, NextFunction } from 'express';
import { can } from '../acl';
import type { ObjectAction } from '../types';

interface Options {
  /** где взять objectId из запроса (default: req.params.id) */
  idFrom?: (req: Request) => string | undefined;
}

/**
 * Проверяет право action на объект из req.params.id (через ACL/кеш).
 * 403 — рано, до бизнес-логики.
 */
export function requirePermission(action: ObjectAction, options: Options = {}) {
  const idFrom = options.idFrom ?? ((req: Request) => req.params.id as string);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'требуется авторизация' });
      return;
    }
    const objectId = idFrom(req);
    if (!objectId) {
      res.status(400).json({ error: 'не указан идентификатор объекта' });
      return;
    }
    const allowed = await can(user.id, objectId, action);
    if (!allowed) {
      res.status(403).json({ error: 'нет доступа к объекту' });
      return;
    }
    next();
  };
}
