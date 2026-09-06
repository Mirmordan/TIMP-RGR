import { Router } from 'express';
import type { Request, Response } from 'express';
import { processService } from '../services/process.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';
import { requireCapability } from '../security/middleware/requireCapability';

export const processRouter = Router();

processRouter.use(authenticate);

/**
 * @openapi
 * /processes:
 *   get:
 *     tags: [Processes]
 *     operationId: listProcesses
 *     summary: Список процессов записи
 *     description: Пагинированный список процессов записи с общим количеством.
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
 *         description: Поиск по url потока, названию связанного устройства или id процесса (подстрока, регистронезависимо).
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Список процессов и общее количество
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [processes, total]
 *               properties:
 *                 processes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Process'
 *                 total:
 *                   type: integer
 *                   description: Общее количество процессов.
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
processRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const result = await processService.getAll(limit, offset, q);
  res.json(result);
});

/**
 * @openapi
 * /processes/{id}:
 *   get:
 *     tags: [Processes]
 *     operationId: getProcess
 *     summary: Процесс записи по ID
 *     description: Возвращает процесс записи по UUID. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Данные процесса записи
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Process'
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
 *         description: Процесс не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
processRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const process = await processService.getById(id);
  if (!process) return res.status(404).json({ error: 'процесс не найден' });
  res.json(process);
});

/**
 * @openapi
 * /processes:
 *   post:
 *     tags: [Processes]
 *     operationId: createProcess
 *     summary: Создание процесса записи
 *     description: Создаёт процесс записи. Если status=running (по умолчанию) — поднимает поток-источник в mediaMTX и открывает сегмент записи без endedAt. Требуется capability process:create.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessCreate'
 *     responses:
 *       '201':
 *         description: Процесс записи создан
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Process'
 *       '400':
 *         description: streamId не указан, status некорректен или не удалось поднять поток
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
 *         description: Недостаточно прав (нужна capability process:create)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
processRouter.post('/', requireCapability('process:create'), async (req: Request, res: Response) => {
  try {
    const { streamId, status, startedAt } = req.body;
    const finalStatus = status || 'running';
    const finalStartedAt = startedAt ? new Date(startedAt) : new Date();
    const process = await processService.create(streamId, finalStartedAt, finalStatus);
    res.status(201).json(process);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /processes/{id}:
 *   put:
 *     tags: [Processes]
 *     operationId: updateProcess
 *     summary: Полная замена процесса записи
 *     description: Перезаписывает процесс полным телом (streamId, startedAt, endedAt, status) и приводит mediaMTX в соответствие со статусом (running — поднимает поток и открывает новый сегмент, stopped/failed — останавливает поток; stopped дополнительно финализирует открытый сегмент). Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessPut'
 *     responses:
 *       '200':
 *         description: Процесс записи обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Process'
 *       '400':
 *         description: Невалидное тело (streamId/status) или некорректные даты
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
 *         description: Процесс не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
processRouter.put('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { streamId, startedAt, endedAt, status } = req.body;
    const process = await processService.put(
      id,
      streamId,
      new Date(startedAt),
      endedAt != null ? new Date(endedAt) : null,
      status,
    );
    if (!process) return res.status(404).json({ error: 'процесс не найден' });
    res.json(process);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /processes/{id}:
 *   patch:
 *     tags: [Processes]
 *     operationId: patchProcess
 *     summary: Частичное обновление процесса записи
 *     description: Обновляет только переданные поля. При смене status на running возобновляет запись (сбрасывает endedAt, поднимает поток в mediaMTX, открывает новый сегмент); при остановке (stopped/failed) фиксирует endedAt и останавливает поток, а stopped финализирует сегменты с endedAt из последних .ts. Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessPatch'
 *     responses:
 *       '200':
 *         description: Процесс записи обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Process'
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
 *         description: Нет доступа к объекту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Процесс не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
processRouter.patch('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const body = req.body as Record<string, any>;
    const patch: Record<string, any> = {};
    if (body.streamId !== undefined) patch.streamId = body.streamId;
    if (body.startedAt !== undefined) patch.startedAt = new Date(body.startedAt);
    if (body.endedAt !== undefined) patch.endedAt = body.endedAt != null ? new Date(body.endedAt) : undefined;
    if (body.status !== undefined) patch.status = body.status;
    const process = await processService.patch(id, patch);
    if (!process) return res.status(404).json({ error: 'процесс не найден' });
    res.json(process);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /processes/{id}:
 *   delete:
 *     tags: [Processes]
 *     operationId: deleteProcess
 *     summary: Удаление процесса записи
 *     description: Удаляет процесс записи, останавливает поток в mediaMTX, каскадно удаляет связанные сегменты/инциденты и физически удаляет файлы записей (.ts) с диска. Необратимая операция. Требуется право delete на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Процесс записи удалён
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
 *         description: Процесс не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
processRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await processService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'процесс не найден' });
  res.status(204).send();
});
