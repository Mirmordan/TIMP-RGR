import { Router } from 'express';
import type { Request, Response } from 'express';
import { streamService } from '../services/stream.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const streamRouter = Router();

streamRouter.use(authenticate);

streamRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await streamService.getAll(limit, offset);
  res.json(result);
});

streamRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const stream = await streamService.getById(id);
  if (!stream) return res.status(404).json({ error: 'поток не найден' });
  res.json(stream);
});

streamRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { url, deviceId, sourceFingerprint } = req.body;
    const stream = await streamService.create(url, deviceId, sourceFingerprint);
    res.status(201).json(stream);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

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

streamRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await streamService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'поток не найден' });
  res.status(204).send();
});
