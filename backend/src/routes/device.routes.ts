import { Router } from 'express';
import type { Request, Response } from 'express';
import { deviceService } from '../services/device.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';
import { requireCapability } from '../security/middleware/requireCapability';
import { replyError } from '../http/errors';

export const deviceRouter = Router();

deviceRouter.use(authenticate);

/**
 * @openapi
 * /devices:
 *   get:
 *     tags: [Devices]
 *     operationId: listDevices
 *     summary: Список устройств
 *     description: Пагинированный список устройств с общим количеством.
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
 *       - name: q
 *         in: query
 *         description: Поиск по названию (подстрока, регистронезависимо).
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Список устройств и общее количество
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [devices, total]
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Device'
 *                 total:
 *                   type: integer
 *                   description: Общее количество устройств.
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
deviceRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const result = await deviceService.getAll(limit, offset, q);
  res.json(result);
});

/**
 * @openapi
 * /devices/{id}:
 *   get:
 *     tags: [Devices]
 *     operationId: getDevice
 *     summary: Устройство по ID
 *     description: Возвращает устройство по UUID. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID устройства.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Данные устройства
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Нет доступа к объекту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Устройство не найдено
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
deviceRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const device = await deviceService.getById(id);
  if (!device) return res.status(404).json({ error: 'устройство не найдено' });
  res.json(device);
});

/**
 * @openapi
 * /devices:
 *   post:
 *     tags: [Devices]
 *     operationId: createDevice
 *     summary: Создание устройства
 *     description: Создаёт новое устройство записи (name, type, необязательное description). Требуется capability camera:create.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeviceCreate'
 *     responses:
 *       '201':
 *         description: Устройство создано
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device'
 *       '400':
 *         description: Не указано name
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
 *         description: Недостаточно прав (нужна capability camera:create)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
deviceRouter.post('/', requireCapability('camera:create'), async (req: Request, res: Response) => {
  try {
    const { name, type, description } = req.body;
    const device = await deviceService.create(name, type, description);
    res.status(201).json(device);
  } catch (e: any) {
    replyError(res, e, 'device.1');
  }
});

/**
 * @openapi
 * /devices/{id}:
 *   put:
 *     tags: [Devices]
 *     operationId: updateDevice
 *     summary: Полная замена устройства
 *     description: Перезаписывает устройство полным телом (name, type, необязательное description; description опущено — очищается). Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID устройства.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeviceCreate'
 *     responses:
 *       '200':
 *         description: Устройство обновлено
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device'
 *       '400':
 *         description: Не указано name
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
 *         description: Нет доступа к объекту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Устройство не найдено
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
deviceRouter.put('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, type, description } = req.body;
    const device = await deviceService.put(id, name, type, description);
    if (!device) return res.status(404).json({ error: 'устройство не найдено' });
    res.json(device);
  } catch (e: any) {
    replyError(res, e, 'device.2');
  }
});

/**
 * @openapi
 * /devices/{id}:
 *   patch:
 *     tags: [Devices]
 *     operationId: patchDevice
 *     summary: Частичное обновление устройства
 *     description: Обновляет только переданные поля (name/type/description; description null — очистить). Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID устройства.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DevicePatch'
 *     responses:
 *       '200':
 *         description: Устройство обновлено
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device'
 *       '400':
 *         description: name не может быть пустым
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
 *         description: Нет доступа к объекту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Устройство не найдено
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
deviceRouter.patch('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const device = await deviceService.patch(id, req.body);
    if (!device) return res.status(404).json({ error: 'устройство не найдено' });
    res.json(device);
  } catch (e: any) {
    replyError(res, e, 'device.3');
  }
});

/**
 * @openapi
 * /devices/{id}:
 *   delete:
 *     tags: [Devices]
 *     operationId: deleteDevice
 *     summary: Удаление устройства
 *     description: Удаляет устройство вместе со связанными объектами. Требуется право delete на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID устройства.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Устройство удалено
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Нет доступа к объекту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Устройство не найдено
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
deviceRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await deviceService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'устройство не найдено' });
  res.status(204).send();
});
