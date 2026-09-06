import { Router } from 'express';
import type { Request, Response } from 'express';
import { rbacRepository } from '../repositories/rbac.repository';
import { rbacService, HttpError } from '../services/rbac.service';
import { auditService } from '../services/audit.service';
import type { AuditActor } from '../services/audit.service';
import { AuthError } from '../security/auth.service';
import { authenticate } from '../security/middleware/authenticate';
import { requireCapability } from '../security/middleware/requireCapability';
import { CAPABILITY_CATALOG } from '../security/capabilities';

/**
 * Эндпоинты /admin для панели RBAC.
 * Чтение/мутации защищены гранулярными спец-правами (user:read, role:create,
 * group:update, permission:manage, audit:read, ...); admin:write остаётся
 * на чувствительных выдачах (роли пользователям, спец-права ролям).
 * GET /admin/capabilities и просмотр спец-прав ролей — под role:read.
 */
export const adminRouter = Router();

/** Актор (req.user) для аудит-записей: authenticate уже гарантирует наличие. */
function actorOf(req: Request): AuditActor {
  const user = req.user;
  if (!user) throw new HttpError(401, 'требуется авторизация');
  return { id: user.id, username: user.username };
}

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

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     operationId: listAdminUsers
 *     summary: Список пользователей (RBAC-панель)
 *     description: Пагинированный список пользователей с их ролями. Требуется capability user:read.
 *     parameters:
 *       - name: limit
 *         in: query
 *         description: Максимум записей в ответе.
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: offset
 *         in: query
 *         description: Сдвиг от начала списка.
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       '200':
 *         description: Массив пользователей с ролями
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacUserWithRoles'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability user:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/users', requireCapability('user:read'), async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const users = await rbacRepository.findUsersWithRoles(limit, offset);
  res.json(users);
});

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     operationId: getAdminUser
 *     summary: Пользователь с ролями по ID
 *     description: Возвращает пользователя с его ролями. Требуется capability user:read.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID пользователя.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Данные пользователя
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacUserWithRoles'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability user:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Пользователь не найден (в т.ч. неверный uuid)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/users/:id', requireCapability('user:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await rbacRepository.findUserWithRoles(id);
    if (!user) return res.status(404).json({ error: 'пользователь не найден' });
    res.json(user);
  } catch {
    res.status(404).json({ error: 'пользователь не найден' });
  }
});

/**
 * @openapi
 * /admin/roles:
 *   get:
 *     tags: [Admin]
 *     operationId: listAdminRoles
 *     summary: Список ролей
 *     description: Все роли системы и кастомные, отсортированные по имени. Требуется capability role:read.
 *     responses:
 *       '200':
 *         description: Массив ролей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacRole'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability role:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/roles', requireCapability('role:read'), async (_req: Request, res: Response) => {
  const roles = await rbacRepository.findRoles();
  res.json(roles);
});

/**
 * @openapi
 * /admin/roles/{id}:
 *   get:
 *     tags: [Admin]
 *     operationId: getAdminRole
 *     summary: Роль по ID
 *     description: Возвращает роль по UUID. Требуется capability role:read.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Данные роли
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacRole'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability role:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена (в т.ч. неверный uuid)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/roles/:id', requireCapability('role:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const role = await rbacRepository.findRoleById(id);
    if (!role) return res.status(404).json({ error: 'роль не найдена' });
    res.json(role);
  } catch {
    res.status(404).json({ error: 'роль не найдена' });
  }
});

/**
 * @openapi
 * /admin/groups:
 *   get:
 *     tags: [Admin]
 *     operationId: listAdminGroups
 *     summary: Список групп объектов
 *     description: Все группы объектов с количеством входящих в них объектов. Требуется capability group:read.
 *     responses:
 *       '200':
 *         description: Массив групп
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacGroup'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability group:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/groups', requireCapability('group:read'), async (_req: Request, res: Response) => {
  const groups = await rbacRepository.findGroups();
  res.json(groups);
});

/**
 * @openapi
 * /admin/groups/{id}/objects:
 *   get:
 *     tags: [Admin]
 *     operationId: getAdminGroupObjects
 *     summary: Объекты группы
 *     description: Список объектов, входящих в группу. Требуется capability group:read.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID группы.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Массив объектов группы
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacGroupObject'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability group:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Группа не найдена (в т.ч. неверный uuid)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/groups/:id/objects', requireCapability('group:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await rbacRepository.findGroupObjects(id);
    if (!result.exists) return res.status(404).json({ error: 'группа не найдена' });
    res.json(result.objects);
  } catch {
    res.status(404).json({ error: 'группа не найдена' });
  }
});

/**
 * @openapi
 * /admin/permissions:
 *   get:
 *     tags: [Admin]
 *     operationId: listAdminPermissions
 *     summary: Список прав
 *     description: Все права ролей на группы объектов. Требуется capability permission:read.
 *     responses:
 *       '200':
 *         description: Массив прав
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacPermission'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability permission:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/permissions', requireCapability('permission:read'), async (_req: Request, res: Response) => {
  const permissions = await rbacRepository.findPermissions();
  res.json(permissions);
});

// --- Мутации (Э3) ---

/**
 * @openapi
 * /admin/users/{id}/roles:
 *   put:
 *     tags: [Admin]
 *     operationId: setAdminUserRoles
 *     summary: Замена ролей пользователя
 *     description: Полностью заменяет набор ролей пользователя по именам. Себе роли менять нельзя, последнюю роль admin снять нельзя. Требуется capability admin:write.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID пользователя.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoleAssign'
 *     responses:
 *       '200':
 *         description: Обновлённый пользователь с ролями
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacUserWithRoles'
 *       '400':
 *         description: roleNames не массив строк, неизвестная роль, нельзя менять свои роли или снять последнюю роль admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability admin:write)
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
adminRouter.put('/users/:id/roles', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { roleNames } = req.body ?? {};
    if (!Array.isArray(roleNames) || roleNames.some((n: unknown) => typeof n !== 'string')) {
      return res.status(400).json({ error: 'roleNames должен быть массивом строк' });
    }
    const user = await rbacService.setUserRoles(id, actorOf(req), roleNames);
    res.json(user);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/roles:
 *   post:
 *     tags: [Admin]
 *     operationId: createAdminRole
 *     summary: Создание кастомной роли
 *     description: Создаёт роль с проверкой имени по шаблону. Имя системных ролей (admin/operator/viewer) использовать нельзя. Требуется capability role:create.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NameInput'
 *     responses:
 *       '201':
 *         description: Роль создана
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacRole'
 *       '400':
 *         description: Имя не соответствует шаблону или занято системной ролью
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability role:create)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: Роль с таким именем уже существует
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.post('/roles', requireCapability('role:create'), async (req: Request, res: Response) => {
  try {
    const role = await rbacService.createRole((req.body ?? {}).name, actorOf(req));
    res.status(201).json(role);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/roles/{id}:
 *   patch:
 *     tags: [Admin]
 *     operationId: patchAdminRole
 *     summary: Переименование роли
 *     description: Меняет имя кастомной роли. Системные роли переименовывать нельзя. Требуется capability role:update.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NameInput'
 *     responses:
 *       '200':
 *         description: Обновлённая роль
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacRole'
 *       '400':
 *         description: Системную роль менять нельзя или имя не соответствует шаблону
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability role:update)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: Роль с таким именем уже существует
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.patch('/roles/:id', requireCapability('role:update'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const role = await rbacService.renameRole(id, actorOf(req), (req.body ?? {}).name);
    res.json(role);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/roles/{id}:
 *   delete:
 *     tags: [Admin]
 *     operationId: deleteAdminRole
 *     summary: Удаление роли
 *     description: Удаляет кастомную роль (связи с пользователями и правами сносятся каскадно). Системные роли удалять нельзя. Требуется capability role:delete.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Роль удалена
 *       '400':
 *         description: Системную роль удалять нельзя
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability role:delete)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.delete('/roles/:id', requireCapability('role:delete'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await rbacService.deleteRole(id, actorOf(req));
    res.status(204).send();
  } catch (e) {
    sendRbacError(res, e);
  }
});

// --- Мутации (Э5): права ролей и группы объектов ---

/**
 * @openapi
 * /admin/roles/{id}/permissions:
 *   put:
 *     tags: [Admin]
 *     operationId: setAdminRolePermissions
 *     summary: Замена прав роли
 *     description: Полностью заменяет набор прав роли на группы объектов. Действия валидируются по чек-листу (read/write/delete/stream/list), все группы должны существовать. Требуется capability permission:manage.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PermissionEntries'
 *     responses:
 *       '200':
 *         description: Актуальный список прав роли
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacPermission'
 *       '400':
 *         description: entries не массив объектов { groupId, action }, неизвестное действие или нет указанной группы
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability permission:manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.put('/roles/:id/permissions', requireCapability('permission:manage'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const permissions = await rbacService.replaceRolePermissions(id, actorOf(req), (req.body ?? {}).entries);
    res.json(permissions);
  } catch (e) {
    sendRbacError(res, e);
  }
});

// --- Спец-права (system capabilities) ролей ---

/**
 * @openapi
 * /admin/capabilities:
 *   get:
 *     tags: [Admin]
 *     operationId: listCapabilities
 *     summary: Каталог спец-прав системы
 *     description: Статический каталог доступных system capabilities (код + человекочитаемая подпись). Требуется capability role:read.
 *     responses:
 *       '200':
 *         description: Массив записей каталога спец-прав
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CapabilityInfo'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability role:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/capabilities', requireCapability('role:read'), (_req: Request, res: Response) => {
  res.json(CAPABILITY_CATALOG);
});

/**
 * @openapi
 * /admin/roles/{id}/capabilities:
 *   get:
 *     tags: [Admin]
 *     operationId: getRoleCapabilities
 *     summary: Спец-права роли
 *     description: Возвращает коды system capabilities, выданные роли. Требуется capability role:read.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Массив кодов спец-прав роли
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 enum: [admin:read, admin:write, user:create, user:read, user:update, user:delete, user:password:reset, role:read, role:create, role:update, role:delete, group:read, group:create, group:update, group:delete, permission:read, permission:manage, audit:read, audit:delete, camera:create, stream:create, process:create, chunk:create, media:export]
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability role:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена (в т.ч. неверный uuid)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/roles/:id/capabilities', requireCapability('role:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const role = await rbacRepository.findRoleById(id);
    if (!role) return res.status(404).json({ error: 'роль не найдена' });
    const capabilities = await rbacRepository.findRoleCapabilities(id);
    res.json(capabilities);
  } catch {
    res.status(404).json({ error: 'роль не найдена' });
  }
});

/**
 * @openapi
 * /admin/roles/{id}/capabilities:
 *   put:
 *     tags: [Admin]
 *     operationId: setRoleCapabilities
 *     summary: Замена спец-прав роли
 *     description: Полностью заменяет набор system capabilities кастомной роли. Системные роли (admin/operator/viewer) неизменяемы — это защищает систему от понижения последнего активного администратора. Коды валидируются по каталогу спец-прав. Требуется capability admin:write.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CapabilityCodes'
 *     responses:
 *       '200':
 *         description: Актуальный список спец-прав роли
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 enum: [admin:read, admin:write, user:create, user:read, user:update, user:delete, user:password:reset, role:read, role:create, role:update, role:delete, group:read, group:create, group:update, group:delete, permission:read, permission:manage, audit:read, audit:delete, camera:create, stream:create, process:create, chunk:create, media:export]
 *       '400':
 *         description: capabilities не массив строк, неизвестный код или системную роль менять нельзя
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability admin:write)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.put('/roles/:id/capabilities', requireCapability('admin:write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const capabilities = await rbacService.replaceRoleCapabilities(
      id,
      actorOf(req),
      (req.body ?? {}).capabilities,
    );
    res.json(capabilities);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/groups:
 *   post:
 *     tags: [Admin]
 *     operationId: createAdminGroup
 *     summary: Создание группы объектов
 *     description: Создаёт группу объектов с проверкой имени по шаблону (как у ролей). Требуется capability group:create.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NameInput'
 *     responses:
 *       '201':
 *         description: Группа создана
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacGroup'
 *       '400':
 *         description: Имя не соответствует шаблону
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability group:create)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: Группа с таким именем уже существует
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.post('/groups', requireCapability('group:create'), async (req: Request, res: Response) => {
  try {
    const group = await rbacService.createGroup((req.body ?? {}).name, actorOf(req));
    res.status(201).json(group);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/groups/{id}:
 *   patch:
 *     tags: [Admin]
 *     operationId: patchAdminGroup
 *     summary: Переименование группы объектов
 *     description: Меняет имя группы объектов с проверкой по шаблону. Требуется capability group:update.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID группы.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NameInput'
 *     responses:
 *       '200':
 *         description: Обновлённая группа
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacGroup'
 *       '400':
 *         description: Имя не соответствует шаблону
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability group:update)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Группа не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: Группа с таким именем уже существует
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.patch('/groups/:id', requireCapability('group:update'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const group = await rbacService.renameGroup(id, actorOf(req), (req.body ?? {}).name);
    res.json(group);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/groups/{id}:
 *   delete:
 *     tags: [Admin]
 *     operationId: deleteAdminGroup
 *     summary: Удаление группы объектов
 *     description: Удаляет группу только если на ней не висит ни прав, ни объектов. Требуется capability group:delete.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID группы.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Группа удалена
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability group:delete)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Группа не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: Группа используется (на ней висят права или объекты)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.delete('/groups/:id', requireCapability('group:delete'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await rbacService.deleteGroup(id, actorOf(req));
    res.status(204).send();
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/groups/{id}/objects:
 *   put:
 *     tags: [Admin]
 *     operationId: setAdminGroupObjects
 *     summary: Замена состава объектов группы
 *     description: Полностью заменяет набор объектов группы. Все objectIds должны существовать. Требуется capability permission:manage.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID группы.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ObjectIds'
 *     responses:
 *       '200':
 *         description: Актуальный состав объектов группы
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacGroupObject'
 *       '400':
 *         description: objectIds не массив uuid-строк или среди них есть несуществующие объекты
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability permission:manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Группа не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.put('/groups/:id/objects', requireCapability('permission:manage'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const objects = await rbacService.replaceGroupObjects(id, actorOf(req), (req.body ?? {}).objectIds);
    res.json(objects);
  } catch (e) {
    sendRbacError(res, e);
  }
});

// --- Мутации (P4): CRUD пользователей ---

/**
 * @openapi
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     operationId: createAdminUser
 *     summary: Создание пользователя
 *     description: Создаёт пользователя и выдаёт ему роль viewer. Если password не передан — генерируется временный и возвращается один раз в initialPassword. Требуется capability user:create.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminUserCreate'
 *     responses:
 *       '201':
 *         description: Пользователь создан (initialPassword присутствует, только если пароль был сгенерирован)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [user]
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/RbacUserWithRoles'
 *                 initialPassword:
 *                   type: string
 *                   description: Временный пароль (возвращается только при генерации).
 *       '400':
 *         description: Невалидные username/email или password не является строкой
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability user:create)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: username или email уже занят
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.post('/users', requireCapability('user:create'), async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { username?: unknown; email?: unknown; password?: unknown };
    const result = await rbacService.createUser(body, actorOf(req));
    res.status(201).json(result);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/users/{id}/password:
 *   put:
 *     tags: [Admin]
 *     operationId: setAdminUserPassword
 *     summary: Сброс/установка пароля пользователя
 *     description: Задаёт пользователю новый пароль. Если password не передан — генерируется временный и возвращается один раз в initialPassword. Требуется capability user:password:reset.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID пользователя.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordSet'
 *     responses:
 *       '200':
 *         description: Пароль установлен (initialPassword присутствует, только если пароль был сгенерирован)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 initialPassword:
 *                   type: string
 *                   description: Временный пароль (возвращается только при генерации).
 *       '400':
 *         description: password не является строкой или не проходит проверку сложности
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability user:password:reset)
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
adminRouter.put('/users/:id/password', requireCapability('user:password:reset'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await rbacService.resetUserPassword(id, actorOf(req), (req.body ?? {}).password);
    res.json(result);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     operationId: patchAdminUser
 *     summary: Редактирование пользователя
 *     description: Обновляет username/email пользователя. Пароль через этот эндпоинт менять нельзя (отдельный эндпоинт). Требуется capability user:update.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID пользователя.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminUserPatch'
 *     responses:
 *       '200':
 *         description: Обновлённый пользователь с ролями
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RbacUserWithRoles'
 *       '400':
 *         description: password в теле, не указаны username/email или невалидные значения
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability user:update)
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
 *       '409':
 *         description: username или email уже занят другим пользователем
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.patch('/users/:id', requireCapability('user:update'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await rbacService.patchUser(id, actorOf(req), (req.body ?? {}) as Record<string, unknown>);
    res.json(user);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     operationId: deleteAdminUser
 *     summary: Удаление пользователя
 *     description: Удаляет пользователя. Удалить себя нельзя, удалить последнего администратора нельзя. Требуется capability user:delete.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID пользователя.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Пользователь удалён
 *       '400':
 *         description: Нельзя удалить себя или последнего администратора
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability user:delete)
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
adminRouter.delete('/users/:id', requireCapability('user:delete'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await rbacService.deleteUser(id, actorOf(req));
    res.status(204).send();
  } catch (e) {
    sendRbacError(res, e);
  }
});

// --- U1: аудит-лог (чтение под audit:read, очистка под audit:delete) ---

/**
 * @openapi
 * /admin/audit:
 *   get:
 *     tags: [Admin]
 *     operationId: listAudit
 *     summary: Аудит-лог
 *     description: Пагинированный список записей аудита (сортировка по дате убывания) с фильтрами. Требуется capability audit:read.
 *     parameters:
 *       - name: limit
 *         in: query
 *         description: Максимум записей в ответе (до 200).
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: offset
 *         in: query
 *         description: Сдвиг от начала списка.
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *       - name: actor
 *         in: query
 *         description: Подстрока имени актора (частичное совпадение).
 *         required: false
 *         schema:
 *           type: string
 *       - name: action
 *         in: query
 *         description: Точное имя действия (например, role.delete).
 *         required: false
 *         schema:
 *           type: string
 *       - name: from
 *         in: query
 *         description: Нижняя граница created_at (ISO-дата/время).
 *         required: false
 *         schema:
 *           type: string
 *       - name: to
 *         in: query
 *         description: Верхняя граница created_at (ISO-дата/время, записи строго раньше).
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Массив записей аудита
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AuditEntry'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability audit:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/audit', requireCapability('audit:read'), async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const query: Parameters<typeof auditService.findAudit>[0] = { limit, offset };
    if (typeof req.query.actor === 'string' && req.query.actor !== '') query.actor = req.query.actor;
    if (typeof req.query.action === 'string' && req.query.action !== '') query.action = req.query.action;
    if (typeof req.query.from === 'string' && req.query.from !== '') query.from = req.query.from;
    if (typeof req.query.to === 'string' && req.query.to !== '') query.to = req.query.to;
    const entries = await auditService.findAudit(query);
    res.json(entries);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/audit:
 *   delete:
 *     tags: [Admin]
 *     operationId: deleteAudit
 *     summary: Очистка аудит-лога
 *     description: Удаляет записи аудита старше указанного момента (before). Требуется capability audit:delete.
 *     parameters:
 *       - name: before
 *         in: query
 *         required: true
 *         description: Удаляются записи с created_at строго раньше этой ISO-даты.
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Лог очищен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok, deleted]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 deleted:
 *                   type: integer
 *                   description: Количество удалённых записей.
 *       '400':
 *         description: before не указан или не является ISO-датой
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability audit:delete)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.delete('/audit', requireCapability('audit:delete'), async (req: Request, res: Response) => {
  try {
    const before = req.query.before;
    if (typeof before !== 'string' || !before || Number.isNaN(Date.parse(before))) {
      res.status(400).json({ error: 'before обязателен и должен быть ISO-датой' });
      return;
    }
    const result = await auditService.deleteAuditBefore(before);
    res.json(result);
  } catch (e) {
    sendRbacError(res, e);
  }
});

// --- Прямые grants ролей на объекты + унифицированный список объектов ---

/**
 * @openapi
 * /admin/roles/{id}/users:
 *   get:
 *     tags: [Admin]
 *     operationId: listRoleUsers
 *     summary: Пользователи роли
 *     description: Пагинированный список пользователей (с их ролями), которым выдана роль. Требуется capability user:read.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: offset
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       '200':
 *         description: Массив пользователей роли
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacUserWithRoles'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability user:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/roles/:id/users', requireCapability('user:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const role = await rbacRepository.findRoleById(id);
    if (!role) return res.status(404).json({ error: 'роль не найдена' });
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const users = await rbacRepository.findUsersInRole(id, limit, offset);
    res.json(users);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/roles/{id}/grants:
 *   get:
 *     tags: [Admin]
 *     operationId: listRoleObjectGrants
 *     summary: Прямые grants роли на объекты
 *     description: Список прямых выдач роли (role × object × action) с метаданными объектов. Требуется capability permission:read.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Массив grants роли
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacObjectGrant'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability permission:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/roles/:id/grants', requireCapability('permission:read'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const role = await rbacRepository.findRoleById(id);
    if (!role) return res.status(404).json({ error: 'роль не найдена' });
    const grants = await rbacRepository.findRoleObjectGrants(id);
    res.json(grants);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/roles/{id}/grants:
 *   put:
 *     tags: [Admin]
 *     operationId: setRoleObjectGrants
 *     summary: Замена прямых grants роли
 *     description: Полностью заменяет набор прямых выдач роли на объекты (валидация как у прав на группы — действия read/write/delete/stream/list, все objectId должны существовать). Требуется capability permission:manage.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID роли.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ObjectGrantEntries'
 *     responses:
 *       '200':
 *         description: Актуальный список grants роли
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RbacObjectGrant'
 *       '400':
 *         description: grants не массив { objectId, action }, неизвестное действие или нет объекта
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability permission:manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Роль не найдена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.put('/roles/:id/grants', requireCapability('permission:manage'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const grants = await rbacService.replaceRoleObjectGrants(id, actorOf(req), (req.body ?? {}).grants);
    res.json(grants);
  } catch (e) {
    sendRbacError(res, e);
  }
});

/**
 * @openapi
 * /admin/objects:
 *   get:
 *     tags: [Admin]
 *     operationId: listAdminObjects
 *     summary: Унифицированный список объектов (для permission-UI)
 *     description: >-
 *       Поиск объектов всех типов (device, stream, process, segment, chunk, incident)
 *       по общим метаданным objects (name/description/type). Панель /admin (permission:read)
 *       должна видеть ВСЕ объекты-кандидаты независимо от прав текущего юзера на них,
 *       поэтому выборка идёт напрямую из objects БЕЗ RLS-фильтрации (objects RLS не имеет).
 *       Каждый поиск фиксируется в аудит-логе (action=admin.objects.query). Требуется capability permission:read.
 *     parameters:
 *       - name: q
 *         in: query
 *         required: false
 *         description: Подстрока для поиска по имени/описанию/id объекта.
 *         schema:
 *           type: string
 *       - name: type
 *         in: query
 *         required: false
 *         description: Тип объекта (device, stream, process, segment, chunk, incident).
 *         schema:
 *           type: string
 *       - name: groupId
 *         in: query
 *         required: false
 *         description: Если задан — только объекты этой группы.
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: offset
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       '200':
 *         description: Объекты и общее количество
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [objects, total]
 *               properties:
 *                 objects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RbacObject'
 *                 total:
 *                   type: integer
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability permission:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adminRouter.get('/objects', requireCapability('permission:read'), async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const q = typeof req.query.q === 'string' && req.query.q !== '' ? req.query.q : undefined;
  const type = typeof req.query.type === 'string' && req.query.type !== '' ? req.query.type : undefined;
  const groupId = typeof req.query.groupId === 'string' && req.query.groupId !== '' ? req.query.groupId : undefined;
  const objects = await rbacRepository.findAdminObjects({
    ...(q !== undefined ? { q } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(groupId !== undefined ? { groupId } : {}),
    limit,
    offset,
  });
  // RLS-bypass-выборка объектов-кандидатов фиксируется в аудит-логе (best-effort).
  try {
    await auditService.logAudit({
      actorId: actorOf(req).id,
      actorName: actorOf(req).username,
      action: 'admin.objects.query',
      targetType: 'admin',
      details: {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
        groupId: typeof req.query.groupId === 'string' ? req.query.groupId : undefined,
        total: objects.total,
      },
    });
  } catch {
    /* аудит best-effort */
  }
  res.json(objects);
});
