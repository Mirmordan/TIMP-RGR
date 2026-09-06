import { Router } from 'express';
import type { Request, Response } from 'express';
import { streamService } from '../services/stream.service';
import { streamViewService } from '../services/streamView.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const streamRouter = Router();

streamRouter.use(authenticate);

/**
 * @openapi
 * /streams:
 *   get:
 *     tags: [Streams]
 *     operationId: listStreams
 *     summary: Список потоков
 *     description: Пагинированный список потоков с общим количеством.
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
 *         description: Список потоков и общее количество
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [streams, total]
 *               properties:
 *                 streams:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Stream'
 *                 total:
 *                   type: integer
 *                   description: Общее количество потоков.
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
streamRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await streamService.getAll(limit, offset);
  res.json(result);
});

/**
 * @openapi
 * /streams/{id}:
 *   get:
 *     tags: [Streams]
 *     operationId: getStream
 *     summary: Поток по ID
 *     description: Возвращает поток-источник по UUID. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID потока.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Данные потока
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stream'
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
 *         description: Поток не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
streamRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const stream = await streamService.getById(id);
  if (!stream) return res.status(404).json({ error: 'поток не найден' });
  res.json(stream);
});

/**
 * @openapi
 * /streams/{id}/view:
 *   post:
 *     tags: [Streams]
 *     operationId: viewStream
 *     summary: Просмотр live-потока без записи (view-сессия)
 *     description: Возвращает HLS-URL «что сейчас на камере». Если по потоку идёт живая запись и её путь онлайн — отдаётся HLS живого process-пути; иначе поднимается выделенный view-путь без записи (view_<id>, TTL продлевается каждым вызовом). Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID потока.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: HLS-URL для просмотра
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StreamView'
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
 *         description: Поток не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
streamRouter.post('/:id/view', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await streamViewService.openView(id);
  if (!result) return res.status(404).json({ error: 'поток не найден' });
  res.json(result);
});

/**
 * @openapi
 * /streams/{id}/view:
 *   delete:
 *     tags: [Streams]
 *     operationId: stopStreamView
 *     summary: Остановить view-сессию потока
 *     description: Немедленно останавливает view-путь потока (если он был поднят). Если просмотр шёл по живому process-пути записи — ничего не делает. Идемпотентна. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID потока.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: View-сессия остановлена
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
 */
streamRouter.delete('/:id/view', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await streamViewService.stopView(id);
  res.status(204).send();
});

/**
 * @openapi
 * /streams:
 *   post:
 *     tags: [Streams]
 *     operationId: createStream
 *     summary: Создание потока
 *     description: Создаёт новый поток-источник записи.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StreamCreate'
 *     responses:
 *       '201':
 *         description: Поток создан
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stream'
 *       '400':
 *         description: Не указан url или некорректен deviceId
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
 */
streamRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { url, deviceId, sourceFingerprint } = req.body;
    const stream = await streamService.create(url, deviceId, sourceFingerprint);
    res.status(201).json(stream);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /streams/{id}:
 *   put:
 *     tags: [Streams]
 *     operationId: updateStream
 *     summary: Полная замена потока
 *     description: Перезаписывает поток полным телом (url, deviceId, sourceFingerprint). Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID потока.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StreamCreate'
 *     responses:
 *       '200':
 *         description: Поток обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stream'
 *       '400':
 *         description: Не указан url или некорректен deviceId
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
 *         description: Поток не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
streamRouter.put('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { url, deviceId, sourceFingerprint } = req.body;
    const stream = await streamService.put(id, url, deviceId, sourceFingerprint);
    if (!stream) return res.status(404).json({ error: 'поток не найден' });
    res.json(stream);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /streams/{id}:
 *   patch:
 *     tags: [Streams]
 *     operationId: patchStream
 *     summary: Частичное обновление потока
 *     description: Обновляет только переданные поля (url/deviceId/sourceFingerprint). Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID потока.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StreamPatch'
 *     responses:
 *       '200':
 *         description: Поток обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stream'
 *       '400':
 *         description: url не может быть пустым
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
 *         description: Поток не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
streamRouter.patch('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const stream = await streamService.patch(id, req.body);
    if (!stream) return res.status(404).json({ error: 'поток не найден' });
    res.json(stream);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /streams/{id}:
 *   delete:
 *     tags: [Streams]
 *     operationId: deleteStream
 *     summary: Удаление потока
 *     description: Удаляет поток вместе со связанными объектами. Требуется право delete на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID потока.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Поток удалён
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
 *         description: Поток не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
streamRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await streamService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'поток не найден' });
  res.status(204).send();
});
