import { Router } from 'express';
import type { Request, Response } from 'express';
import { deviceService } from '../services/device.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const deviceRouter = Router();

deviceRouter.use(authenticate);

deviceRouter.get('/', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const result = await deviceService.getAll(limit, offset);
  res.json(result);
});

deviceRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const device = await deviceService.getById(id);
  if (!device) return res.status(404).json({ error: 'устройство не найдено' });
  res.json(device);
});

deviceRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, type } = req.body;
    const device = await deviceService.create(name, type);
    res.status(201).json(device);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

deviceRouter.put('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, type } = req.body;
    const device = await deviceService.put(id, name, type);
    if (!device) return res.status(404).json({ error: 'устройство не найдено' });
    res.json(device);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

deviceRouter.patch('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const device = await deviceService.patch(id, req.body);
    if (!device) return res.status(404).json({ error: 'устройство не найдено' });
    res.json(device);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

deviceRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await deviceService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'устройство не найдено' });
  res.status(204).send();
});
