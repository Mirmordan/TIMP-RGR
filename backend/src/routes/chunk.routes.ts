import { Router } from 'express';
import type { Request, Response } from 'express';
import { chunkService } from '../services/chunk.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';
import { requireCapability } from '../security/middleware/requireCapability';
import { replyError } from '../http/errors';

export const chunkRouter = Router();

chunkRouter.use(authenticate);

/**
 * @openapi
 * /chunks:
 *   get:
 *     tags: [Chunks]
 *     operationId: listChunks
 *     summary: Список чанков
 *     description: Пагинированный список чанков записей с общим количеством.
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
 *         description: Список чанков и общее количество
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [chunks, total]
 *               properties:
 *                 chunks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Chunk'
 *                 total:
 *                   type: integer
 *                   description: Общее количество чанков.
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
chunkRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await chunkService.getAll(limit, offset);
  res.json(result);
});

/**
 * @openapi
 * /chunks/{id}:
 *   get:
 *     tags: [Chunks]
 *     operationId: getChunk
 *     summary: Чанк по ID
 *     description: Возвращает чанк записи по UUID. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID чанка.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Данные чанка
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chunk'
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
 *         description: Чанк не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
chunkRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const chunk = await chunkService.getById(id);
  if (!chunk) return res.status(404).json({ error: 'кусок не найден' });
  res.json(chunk);
});

/**
 * @openapi
 * /chunks:
 *   post:
 *     tags: [Chunks]
 *     operationId: createChunk
 *     summary: Создание чанка
 *     description: Создаёт чанк записи. Требуется capability chunk:create.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChunkPut'
 *     responses:
 *       '201':
 *         description: Чанк создан
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chunk'
 *       '400':
 *         description: processId/url не указаны или endedAt меньше startedAt
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
 *         description: Недостаточно прав (нужна capability chunk:create)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
chunkRouter.post('/', requireCapability('chunk:create'), async (req: Request, res: Response) => {
  try {
    const { processId, startedAt, endedAt, url } = req.body;
    const chunk = await chunkService.create(
      processId,
      new Date(startedAt),
      new Date(endedAt),
      url,
    );
    res.status(201).json(chunk);
  } catch (e: any) {
    replyError(res, e, 'chunk.1');
  }
});

/**
 * @openapi
 * /chunks/{id}:
 *   put:
 *     tags: [Chunks]
 *     operationId: updateChunk
 *     summary: Полная замена чанка
 *     description: Перезаписывает чанк полным телом (processId, startedAt, endedAt, url) с той же валидацией, что и при создании. Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID чанка.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChunkPut'
 *     responses:
 *       '200':
 *         description: Чанк обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chunk'
 *       '400':
 *         description: processId/url не указаны или endedAt меньше startedAt
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
 *         description: Чанк не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
chunkRouter.put('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { processId, startedAt, endedAt, url } = req.body;
    const chunk = await chunkService.put(
      id,
      processId,
      new Date(startedAt),
      new Date(endedAt),
      url,
    );
    if (!chunk) return res.status(404).json({ error: 'кусок не найден' });
    res.json(chunk);
  } catch (e: any) {
    replyError(res, e, 'chunk.2');
  }
});

/**
 * @openapi
 * /chunks/{id}:
 *   patch:
 *     tags: [Chunks]
 *     operationId: patchChunk
 *     summary: Частичное обновление чанка
 *     description: Обновляет только переданные поля (processId/startedAt/endedAt/url). url не может быть пустым. Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID чанка.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChunkPatch'
 *     responses:
 *       '200':
 *         description: Чанк обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chunk'
 *       '400':
 *         description: url пуст или некорректные даты
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
 *         description: Чанк не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
chunkRouter.patch('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const body = req.body as Record<string, any>;
    const patch: Record<string, any> = {};
    if (body.processId !== undefined) patch.processId = body.processId;
    if (body.startedAt !== undefined) patch.startedAt = new Date(body.startedAt);
    if (body.endedAt !== undefined) patch.endedAt = new Date(body.endedAt);
    if (body.url !== undefined) patch.url = body.url;
    const chunk = await chunkService.patch(id, patch);
    if (!chunk) return res.status(404).json({ error: 'кусок не найден' });
    res.json(chunk);
  } catch (e: any) {
    replyError(res, e, 'chunk.3');
  }
});

/**
 * @openapi
 * /chunks/{id}:
 *   delete:
 *     tags: [Chunks]
 *     operationId: deleteChunk
 *     summary: Удаление чанка
 *     description: Удаляет метаданные чанка; файлы на диске не затрагиваются. Требуется право delete на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID чанка.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Чанк удалён
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
 *         description: Чанк не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
chunkRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await chunkService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'кусок не найден' });
  res.status(204).send();
});
