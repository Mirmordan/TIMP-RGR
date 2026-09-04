import { Router } from 'express';
import type { Request, Response } from 'express';
import { statsService } from '../services/stats.service';
import { authenticate } from '../security/middleware/authenticate';

export const statsRouter = Router();

statsRouter.use(authenticate);

function parseDays(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 365);
}

statsRouter.get('/overview', async (_req: Request, res: Response) => {
  const overview = await statsService.getOverview();
  res.json(overview);
});

statsRouter.get('/timeline', async (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 14);
  const rows = await statsService.getTimeline(days);
  res.json(rows);
});

statsRouter.get('/incidents', async (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 30);
  const rows = await statsService.getIncidentsTimeline(days);
  res.json(rows);
});

statsRouter.get('/disk', async (_req: Request, res: Response) => {
  const disk = await statsService.getDisk();
  res.json(disk);
});
