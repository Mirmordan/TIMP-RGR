import { Router } from 'express';
import type { Request, Response } from 'express';
import { processService } from '../services/process.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const processRouter = Router();

processRouter.use(authenticate);

processRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await processService.getAll(limit, offset);
  res.json(result);
});

processRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const process = await processService.getById(id);
  if (!process) return res.status(404).json({ error: 'процесс не найден' });
  res.json(process);
});

processRouter.post('/', async (req: Request, res: Response) => {
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

processRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await processService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'процесс не найден' });
  res.status(204).send();
});
