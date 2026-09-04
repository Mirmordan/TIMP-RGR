import { Router } from 'express';
import type { Request, Response } from 'express';
import { rbacRepository } from '../repositories/rbac.repository';
import { authenticate } from '../security/middleware/authenticate';
import { requireCapability } from '../security/middleware/requireCapability';

/**
 * Read-only эндпоинты /admin для панели RBAC.
 * Все маршруты — GET под authenticate + requireCapability('admin:read').
 * Мутации (POST/PUT/PATCH/DELETE) добавятся отдельной задачей (Э3).
 */
export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get('/users', requireCapability('admin:read'), async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const users = await rbacRepository.findUsersWithRoles(limit, offset);
  res.json(users);
});

adminRouter.get('/users/:id', requireCapability('admin:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await rbacRepository.findUserWithRoles(id);
    if (!user) return res.status(404).json({ error: 'пользователь не найден' });
    res.json(user);
  } catch {
    res.status(404).json({ error: 'пользователь не найден' });
  }
});

adminRouter.get('/roles', requireCapability('admin:read'), async (_req: Request, res: Response) => {
  const roles = await rbacRepository.findRoles();
  res.json(roles);
});

adminRouter.get('/groups', requireCapability('admin:read'), async (_req: Request, res: Response) => {
  const groups = await rbacRepository.findGroups();
  res.json(groups);
});

adminRouter.get('/groups/:id/objects', requireCapability('admin:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await rbacRepository.findGroupObjects(id);
    if (!result.exists) return res.status(404).json({ error: 'группа не найдена' });
    res.json(result.objects);
  } catch {
    res.status(404).json({ error: 'группа не найдена' });
  }
});

adminRouter.get('/permissions', requireCapability('admin:read'), async (_req: Request, res: Response) => {
  const permissions = await rbacRepository.findPermissions();
  res.json(permissions);
});
