import { Router } from 'express';
import type { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { rbacRepository } from '../repositories/rbac.repository';
import { rbacService, assertCanModifyUser, HttpError } from '../services/rbac.service';
import type { AuditActor } from '../services/audit.service';
import { authenticate } from '../security/middleware/authenticate';
import { requireCapability } from '../security/middleware/requireCapability';
import { replyError } from '../http/errors';

export const userRouter = Router();

userRouter.use(authenticate);

/** Актор (req.user) для guard-проверок и аудита. */
function actorOf(req: Request): AuditActor {
  const user = req.user;
  if (!user) throw new HttpError(401, 'требуется авторизация');
  return { id: user.id, username: user.username };
}

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     operationId: listUsers
 *     summary: Список пользователей
 *     description: Пагинированный список пользователей. Требуется capability user:read.
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
 *         description: Список пользователей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [users]
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
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
userRouter.get('/', requireCapability('user:read'), async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const users = await userService.getAll(limit, offset);
  res.json({ users });
});

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     operationId: getUser
 *     summary: Пользователь по ID
 *     description: Возвращает одного пользователя по UUID. Требуется capability user:read.
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
 *               $ref: '#/components/schemas/User'
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
 *         description: Пользователь не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userRouter.get('/:id', requireCapability('user:read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = await userService.getById(id);
  if (!user) return res.status(404).json({ error: 'пользователь не найден' });
  res.json(user);
});

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     operationId: createUser
 *     summary: Создание пользователя
 *     description: Создаёт нового пользователя. Требуется capability user:create.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserCreate'
 *     responses:
 *       '201':
 *         description: Пользователь создан
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '400':
 *         description: Не указаны username/email/password или username уже занят
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
 */
userRouter.post('/', requireCapability('user:create'), async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const user = await userService.create({ username, email, password });
    res.status(201).json(user);
  } catch (e: any) {
    replyError(res, e, 'user.1');
  }
});

/**
 * @openapi
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     operationId: updateUser
 *     summary: Полная замена пользователя
 *     description: Перезаписывает пользователя полным телом (username, email, password). Требуется capability user:update.
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
 *             $ref: '#/components/schemas/UserCreate'
 *     responses:
 *       '200':
 *         description: Пользователь обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '400':
 *         description: Не указаны username/email/password
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
 */
userRouter.put('/:id', requireCapability('user:update'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const target = await rbacRepository.findUserWithRoles(id);
    if (!target) return res.status(404).json({ error: 'пользователь не найден' });
    assertCanModifyUser(target, actorOf(req), { allowSelfAdmin: true });
    const { username, email, password } = req.body;
    const user = await userService.put(id, { username, email, password });
    if (!user) return res.status(404).json({ error: 'пользователь не найден' });
    res.json(user);
  } catch (e: any) {
    replyError(res, e, 'user.2');
  }
});

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     tags: [Users]
 *     operationId: patchUser
 *     summary: Частичное обновление пользователя
 *     description: Обновляет только переданные поля (username/email/password). Требуется capability user:update.
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
 *             $ref: '#/components/schemas/UserPatch'
 *     responses:
 *       '200':
 *         description: Пользователь обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '400':
 *         description: Пустое/некорректное значение поля
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
 */
userRouter.patch('/:id', requireCapability('user:update'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const target = await rbacRepository.findUserWithRoles(id);
    if (!target) return res.status(404).json({ error: 'пользователь не найден' });
    assertCanModifyUser(target, actorOf(req), { allowSelfAdmin: true });
    const user = await userService.patch(id, req.body);
    if (!user) return res.status(404).json({ error: 'пользователь не найден' });
    res.json(user);
  } catch (e: any) {
    replyError(res, e, 'user.3');
  }
});

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags: [Users]
 *     operationId: deleteUser
 *     summary: Удаление пользователя
 *     description: Удаляет пользователя. Требуется capability user:delete.
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
userRouter.delete('/:id', requireCapability('user:delete'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await rbacService.deleteUser(id, actorOf(req));
    res.status(204).send();
  } catch (e: any) {
    replyError(res, e, 'user.4');
  }
});
