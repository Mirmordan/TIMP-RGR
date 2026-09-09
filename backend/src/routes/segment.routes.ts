import { Router } from 'express';
import type { Request, Response } from 'express';
import { segmentService } from '../services/segment.service';
import { processRepository } from '../repositories/process.repository';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';
import { replyError } from '../http/errors';

export const segmentRouter = Router();

segmentRouter.use(authenticate);

/**
 * @openapi
 * /segments:
 *   get:
 *     tags: [Segments]
 *     operationId: listSegments
 *     summary: Список сегментов записи
 *     description: Пагинированный список сегментов записи с общим количеством.
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
 *         description: Список сегментов и общее количество
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [segments, total]
 *               properties:
 *                 segments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Segment'
 *                 total:
 *                   type: integer
 *                   description: Общее количество сегментов.
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await segmentService.getAll(limit, offset);
  res.json(result);
});

/**
 * @openapi
 * /segments/range:
 *   get:
 *     tags: [Segments]
 *     operationId: getSegmentsByRange
 *     summary: Сегменты по временному диапазону
 *     description: Возвращает сегменты, пересекающиеся с окном [from, to], в пределах видимости пользователя (доступ ограничен RLS, как и у списка сегментов). from и to обязательны.
 *     parameters:
 *       - name: from
 *         in: query
 *         description: Начало диапазона (ISO-дата/время).
 *         required: true
 *         schema:
 *           type: string
 *       - name: to
 *         in: query
 *         description: Конец диапазона (ISO-дата/время).
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Список сегментов в диапазоне
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [segments]
 *               properties:
 *                 segments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Segment'
 *       '400':
 *         description: Не указаны from или to
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
segmentRouter.get('/range', async (req: Request, res: Response) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from и to обязательны' });
  const segments = await segmentService.getByTimeRange(from as string, to as string);
  res.json({ segments });
});

// --- Таймлайн и объединённый плейлист для процесса ---

/**
 * @openapi
 * /segments/process/{processId}/timeline:
 *   get:
 *     tags: [Segments]
 *     operationId: getSegmentTimeline
 *     summary: Таймлайн записей процесса
 *     description: Сегменты процесса, разложенные на общем таймлайне записи (для шкалы времени плеера). Требуется право read на процесс.
 *     parameters:
 *       - name: processId
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Таймлайн записей процесса
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SegmentTimeline'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Нет доступа к процессу
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.get('/process/:processId/timeline', requirePermission('read', {
  idFrom: (req) => req.params.processId as string,
}), async (req: Request, res: Response) => {
  const processId = req.params.processId as string;
  const [segments, process] = await Promise.all([
    segmentService.getByProcess(processId),
    processRepository.findById(processId),
  ]);
  const running = process?.status === 'running';
  const timeline = segmentService.getTimeline(segments, running, process?.startedAt);
  res.json(timeline);
});

/**
 * @openapi
 * /segments/process/{processId}/playlist:
 *   get:
 *     tags: [Segments]
 *     operationId: getProcessCombinedPlaylist
 *     summary: Объединённый HLS-плейлист процесса
 *     description: Непрерывный m3u8 по всем сегментам процесса (без GAP-меток, с DISCONTINUITY между сегментами). Требуется право read на процесс.
 *     parameters:
 *       - name: processId
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Текст m3u8-плейлиста
 *         content:
 *           application/vnd.apple.mpegurl:
 *             schema:
 *               type: string
 *               example: '#EXTM3U'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Нет доступа к процессу
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Нет записей для процесса
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.get('/process/:processId/playlist', requirePermission('read', {
  idFrom: (req) => req.params.processId as string,
}), async (req: Request, res: Response) => {
  const processId = req.params.processId as string;
  const segments = await segmentService.getByProcess(processId);
  const m3u8 = segmentService.getCombinedM3u8(segments);
  if (!m3u8) return res.status(404).json({ error: 'нет записей' });

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(m3u8);
});

/**
 * @openapi
 * /segments/process/{processId}/live:
 *   get:
 *     tags: [Segments]
 *     operationId: getProcessLive
 *     summary: Live-плейлист процесса
 *     description: URL прямой трансляции процесса (HLS из mediaMTX через nginx) и текущий статус. Требуется право read на процесс.
 *     parameters:
 *       - name: processId
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Параметры live-трансляции процесса
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [liveUrl, mtxPath, status]
 *               properties:
 *                 liveUrl:
 *                   type: string
 *                   description: Относительный URL HLS-плейлиста mediaMTX (например, /live/process_xxx/index.m3u8).
 *                 mtxPath:
 *                   type: string
 *                   description: Путь mediaMTX (например, process_xxx).
 *                 status:
 *                   type: string
 *                   enum: [running, stopped, failed]
 *                   description: Текущий статус процесса.
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Нет доступа к процессу
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
segmentRouter.get('/process/:processId/live', requirePermission('read', {
  idFrom: (req) => req.params.processId as string,
}), async (req: Request, res: Response) => {
  const processId = req.params.processId as string;
  const process = await processRepository.findById(processId);
  if (!process) return res.status(404).json({ error: 'процесс не найден' });

  // live URL = mediaMTX HLS путь process_<id>
  const mtxPath = `process_${processId}`;
  const liveUrl = segmentService.getLiveUrl(mtxPath);
  res.json({ liveUrl, mtxPath, status: process.status });
});

// --- Одиночный сегмент ---

/**
 * @openapi
 * /segments/{id}:
 *   get:
 *     tags: [Segments]
 *     operationId: getSegment
 *     summary: Сегмент по ID
 *     description: Возвращает сегмент записи по UUID. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID сегмента.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Данные сегмента
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Segment'
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
 *         description: Сегмент не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });
  res.json(segment);
});

/**
 * @openapi
 * /segments/{id}/playlist:
 *   get:
 *     tags: [Segments]
 *     operationId: getSegmentPlaylist
 *     summary: HLS-плейлист сегмента
 *     description: Оконный m3u8-плейлист сегмента (VOD c ENDLIST для закрытого, EVENT для открытого). С параметром snapshot=1 открытый сегмент отдаётся как конечный VOD-снимок файлов, лежащих на диске на момент запроса (для архивного плеера «Сегменты»); для закрытого сегмента параметр игнорируется. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID сегмента.
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: start
 *         in: query
 *         description: Смещение внутри сегмента в секундах, с которого начинается окно (отрицательное/нечисловое значение трактуется как 0).
 *         required: false
 *         schema:
 *           type: number
 *           default: 0
 *       - name: snapshot
 *         in: query
 *         description: Для открытого сегмента вернуть конечный VOD-снимок текущих файлов на диске вместо EVENT-плейлиста (без дописывания хвоста).
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       '200':
 *         description: Текст m3u8-плейлиста
 *         content:
 *           application/vnd.apple.mpegurl:
 *             schema:
 *               type: string
 *               example: '#EXTM3U'
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
 *         description: Сегмент не найден или файлы отсутствуют
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.get('/:id/playlist', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });

  // start — смещение внутри сегмента в секундах (окно плейлиста)
  const rawStart = Number(req.query.start);
  const startOffsetS = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 0;
  // snapshot=1 — открытый сегмент отдаём конечным VOD-снимком (архивный плеер).
  const snapshot = req.query.snapshot === '1' || req.query.snapshot === 'true';

  const m3u8 = segmentService.getSegmentWindowM3u8(segment, startOffsetS, snapshot);
  // '' возвращается для закрытого сегмента без файлов на диске и для пустого
  // VOD-снимка открытого сегмента (файлов ещё нет — снапшот смотреть нечего).
  // Открытый без snapshot отдаёт пустой EVENT-плейлист → 200, hls.js поллит его.
  // Поэтому 404 здесь означает: данных для воспроизведения нет.
  if (!m3u8) return res.status(404).json({ error: 'файлы не найдены' });

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(m3u8);
});

/**
 * @openapi
 * /segments/{id}/files:
 *   get:
 *     tags: [Segments]
 *     operationId: getSegmentFiles
 *     summary: Файлы сегмента
 *     description: Список .ts файлов сегмента и базовый путь для их загрузки через /recordings. Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID сегмента.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Список файлов сегмента
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [files, basePath]
 *               properties:
 *                 files:
 *                   type: array
 *                   description: Имена .ts файлов сегмента.
 *                   items:
 *                     type: string
 *                 basePath:
 *                   type: string
 *                   description: Базовый путь для загрузки файлов (до /recordings/...).
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
 *         description: Сегмент не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.get('/:id/files', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });

  const files = segmentService.listFiles(segment.path);
  res.json({ files, basePath: `/api/v1/recordings/${segment.path}` });
});

// Serve segment as MP4 video stream (concatenates .ts files → fMP4)
/**
 * @openapi
 * /segments/{id}/video:
 *   get:
 *     tags: [Segments]
 *     operationId: getSegmentVideo
 *     summary: Видео сегмента (MP4-стрим)
 *     description: Отдаёт сегмент как потоковый fMP4 (.ts чанки конкатенируются через ffmpeg на лету, chunked transfer). Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID сегмента.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Видеопоток video/mp4
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
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
 *         description: Сегмент не найден или файлы отсутствуют
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.get('/:id/video', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });

  const ffmpeg = segmentService.createSegmentVideoStream(segment.path);
  if (!ffmpeg) return res.status(404).json({ error: 'файлы не найдены' });

  // Ответ начинаем отдавать только после успешного запуска процесса: при
  // системной ошибке спавна (например ffmpeg не установлен — ENOENT) у нас ещё
  // нет заголовков и можно вернуть аккуратный 500-generic вместо 200-пустышки.
  let started = false;
  ffmpeg.on('spawn', () => {
    started = true;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Transfer-Encoding', 'chunked');
    if (ffmpeg.stdout) ffmpeg.stdout.pipe(res);
    // Дренаж stderr: при stdio 'pipe' непрочитанный буфер (~64KB) блокирует ffmpeg.
    ffmpeg.stderr?.resume();
  });
  ffmpeg.on('error', (e: unknown) => {
    if (!started) replyError(res, e, 'segments.video', 500);
    else if (!res.headersSent) replyError(res, new Error('ffmpeg error after spawn'), 'segments.video', 500);
    else {
      try { res.end(); } catch { /* ignore */ }
    }
  });

  req.on('close', () => {
    ffmpeg.kill('SIGTERM');
  });
});

/**
 * @openapi
 * /segments/{id}:
 *   delete:
 *     tags: [Segments]
 *     operationId: deleteSegment
 *     summary: Удаление сегмента
 *     description: Удаляет сегмент (метаданные); файлы .ts на диске не затрагиваются. Требуется право delete на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID сегмента.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Сегмент удалён
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
 *         description: Сегмент не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
segmentRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await segmentService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'сегмент не найден' });
  res.status(204).send();
});
