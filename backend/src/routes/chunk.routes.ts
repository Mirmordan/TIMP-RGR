import { Router } from 'express';
import type { Request, Response } from 'express';
import { chunkService } from '../services/chunk.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const chunkRouter = Router();

chunkRouter.use(authenticate);

chunkRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await chunkService.getAll(limit, offset);
  res.json(result);
});

chunkRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const chunk = await chunkService.getById(id);
  if (!chunk) return res.status(404).json({ error: 'кусок не найден' });
  res.json(chunk);
});

chunkRouter.post('/', async (req: Request, res: Response) => {
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
    res.status(400).json({ error: e.message });
  }
});

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
    res.status(400).json({ error: e.message });
  }
});

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
    res.status(400).json({ error: e.message });
  }
});

chunkRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await chunkService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'кусок не найден' });
  res.status(204).send();
});
