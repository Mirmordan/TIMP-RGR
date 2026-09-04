import { Router } from 'express';
import type { Request, Response } from 'express';
import { incidentRepository } from '../repositories/incident.repository';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const incidentRouter = Router();

incidentRouter.use(authenticate);

incidentRouter.get('/process/:processId', requirePermission('read', {
  idFrom: (req) => req.params.processId as string,
}), async (req: Request, res: Response) => {
  const processId = req.params.processId as string;
  const incidents = await incidentRepository.findByProcess(processId);
  res.json({ incidents });
});

incidentRouter.post('/', requirePermission('write', {
  idFrom: (req) => req.body.processId,
}), async (req: Request, res: Response) => {
  const { processId, segmentId, title, description, timeOffsetS, severity } = req.body;
  if (!processId || !title || timeOffsetS === undefined) {
    return res.status(400).json({ error: 'processId, title и timeOffsetS обязательны' });
  }
  const createdBy = (req as any).user?.id as string;
  const incident = await incidentRepository.create({
    processId, segmentId, title, description,
    timeOffsetS, severity: severity || 'info', createdBy,
  });
  res.status(201).json(incident);
});

incidentRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await incidentRepository.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'инцидент не найден' });
  res.status(204).send();
});

incidentRouter.patch('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { title, description, severity, timeOffsetS } = req.body;
  const updated = await incidentRepository.updateById(id, { title, description, severity, timeOffsetS });
  if (!updated) return res.status(404).json({ error: 'инцидент не найден' });
  res.json(updated);
});
