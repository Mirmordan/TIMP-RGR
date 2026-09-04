import { Router } from 'express';
import type { Request, Response } from 'express';
import { segmentService } from '../services/segment.service';
import { processRepository } from '../repositories/process.repository';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const segmentRouter = Router();

segmentRouter.use(authenticate);

segmentRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await segmentService.getAll(limit, offset);
  res.json(result);
});

segmentRouter.get('/range', requirePermission('read'), async (req: Request, res: Response) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from и to обязательны' });
  const segments = await segmentService.getByTimeRange(from as string, to as string);
  res.json({ segments });
});

// --- Таймлайн и объединённый плейлист для процесса ---

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

segmentRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });
  res.json(segment);
});

segmentRouter.get('/:id/playlist', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });

  // start — смещение внутри сегмента в секундах (окно плейлиста)
  const rawStart = Number(req.query.start);
  const startOffsetS = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 0;

  const m3u8 = segmentService.getSegmentWindowM3u8(segment, startOffsetS);
  if (!m3u8) return res.status(404).json({ error: 'файлы не найдены' });

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(m3u8);
});

segmentRouter.get('/:id/files', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });

  const files = segmentService.listFiles(segment.path);
  res.json({ files, basePath: `/api/v1/recordings/${segment.path}` });
});

// Serve segment as MP4 video stream (concatenates .ts files → fMP4)
segmentRouter.get('/:id/video', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const segment = await segmentService.getById(id);
  if (!segment) return res.status(404).json({ error: 'сегмент не найден' });

  const ffmpeg = segmentService.createSegmentVideoStream(segment.path);
  if (!ffmpeg) return res.status(404).json({ error: 'файлы не найдены' });

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Transfer-Encoding', 'chunked');

  if (ffmpeg.stdout) ffmpeg.stdout.pipe(res);

  ffmpeg.stderr?.on('data', () => {});

  req.on('close', () => {
    ffmpeg.kill('SIGTERM');
  });
});

segmentRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await segmentService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'сегмент не найден' });
  res.status(204).send();
});
