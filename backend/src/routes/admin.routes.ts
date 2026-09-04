import { Router } from 'express';
import type { Request, Response } from 'express';
import { rbacRepository } from '../repositories/rbac.repository';
import { rbacService, HttpError } from '../services/rbac.service';
import { AuthError } from '../security/auth.service';
import { authenticate } from '../security/middleware/authenticate';
import { requireCapability } from '../security/middleware/requireCapability';

/**
 * Эндпоинты /admin для панели RBAC.
 * Чтение — GET под authenticate + requireCapability('admin:read');
 * мутации (роли пользователей, CRUD кастомных ролей) — под 'admin:write'.
 */
export const adminRouter = Router();

/** Разложить ошибку мутации в { error } с нужным статусом (uuid/unique → не 500). */
function sendRbacError(res: Response, e: unknown): void {
  if (e instanceof HttpError || e instanceof AuthError) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  const code = (e as { code?: string })?.code;
  if (code === '22P02') {
    res.status(404).json({ error: 'запись не найдена' });
    return;
  }
  if (code === '23505') {
    const constraint = (e as { constraint?: string })?.constraint;
    if (constraint === 'users_username_key') {
      res.status(409).json({ error: 'username уже занят' });
      return;
    }
    if (constraint === 'users_email_key') {
      res.status(409).json({ error: 'email уже занят' });
      return;
    }
    res.status(409).json({ error: 'роль с таким именем уже существует' });
    return;
  }
  res.status(400).json({ error: e instanceof Error ? e.message : 'ошибка запроса' });
}

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

adminRouter.get('/roles/:id', requireCapability('admin:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const role = await rbacRepository.findRoleById(id);
    if (!role) return res.status(404).json({ error: 'роль не найдена' });
    res.json(role);
  } catch {
    res.status(404).json({ error: 'роль не найдена' });
  }
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

// --- Мутации (Э3) ---

adminRouter.put('/users/:id/roles', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const actor = req.user as { id: string };
    const { roleNames } = req.body ?? {};
    if (!Array.isArray(roleNames) || roleNames.some((n: unknown) => typeof n !== 'string')) {
      return res.status(400).json({ error: 'roleNames должен быть массивом строк' });
    }
    const user = await rbacService.setUserRoles(id, actor.id, roleNames);
    res.json(user);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.post('/roles', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const role = await rbacService.createRole((req.body ?? {}).name);
    res.status(201).json(role);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.patch('/roles/:id', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const role = await rbacService.renameRole(id, (req.body ?? {}).name);
    res.json(role);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.delete('/roles/:id', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await rbacService.deleteRole(id);
    res.status(204).send();
  } catch (e) {
    sendRbacError(res, e);
  }
});

// --- Мутации (Э5): права ролей и группы объектов ---

adminRouter.put('/roles/:id/permissions', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const permissions = await rbacService.replaceRolePermissions(id, (req.body ?? {}).entries);
    res.json(permissions);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.post('/groups', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const group = await rbacService.createGroup((req.body ?? {}).name);
    res.status(201).json(group);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.patch('/groups/:id', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const group = await rbacService.renameGroup(id, (req.body ?? {}).name);
    res.json(group);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.delete('/groups/:id', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await rbacService.deleteGroup(id);
    res.status(204).send();
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.put('/groups/:id/objects', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const objects = await rbacService.replaceGroupObjects(id, (req.body ?? {}).objectIds);
    res.json(objects);
  } catch (e) {
    sendRbacError(res, e);
  }
});

// --- Мутации (P4): CRUD пользователей ---

adminRouter.post('/users', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { username?: unknown; email?: unknown; password?: unknown };
    const result = await rbacService.createUser(body);
    res.status(201).json(result);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.put('/users/:id/password', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await rbacService.resetUserPassword(id, (req.body ?? {}).password);
    res.json(result);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.patch('/users/:id', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await rbacService.patchUser(id, (req.body ?? {}) as Record<string, unknown>);
    res.json(user);
  } catch (e) {
    sendRbacError(res, e);
  }
});

adminRouter.delete('/users/:id', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const actor = req.user as { id: string };
    await rbacService.deleteUser(id, actor.id);
    res.status(204).send();
  } catch (e) {
    sendRbacError(res, e);
  }
});
