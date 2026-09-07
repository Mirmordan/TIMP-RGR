import { Router } from 'express';
import type { Request, Response } from 'express';
import { incidentRepository } from '../repositories/incident.repository';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const incidentRouter = Router();

incidentRouter.use(authenticate);

/**
 * @openapi
 * /incidents/process/{processId}:
 *   get:
 *     tags: [Incidents]
 *     operationId: listProcessIncidents
 *     summary: Инциденты процесса записи
 *     description: Список инцидентов процесса записи, отсортированных по timeOffsetS. Требуется право read на процесс.
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
 *         description: Список инцидентов
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [incidents]
 *               properties:
 *                 incidents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Incident'
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
incidentRouter.get('/process/:processId', requirePermission('read', {
  idFrom: (req) => req.params.processId as string,
}), async (req: Request, res: Response) => {
  const processId = req.params.processId as string;
  const incidents = await incidentRepository.findByProcess(processId);
  res.json({ incidents });
});

/**
 * @openapi
 * /incidents:
 *   post:
 *     tags: [Incidents]
 *     operationId: createIncident
 *     summary: Создание инцидента
 *     description: Создаёт инцидент на процессе записи. processId, name и timeOffsetS обязательны; title — устаревший алиас name. createdBy проставляется из текущего пользователя. Требуется право write на процесс.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IncidentCreate'
 *     responses:
 *       '201':
 *         description: Инцидент создан
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Incident'
 *       '400':
 *         description: Не указаны processId, name или timeOffsetS
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
 *         description: Нет доступа к процессу
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
incidentRouter.post('/', requirePermission('write', {
  idFrom: (req) => req.body.processId,
}), async (req: Request, res: Response) => {
  const { processId, segmentId, name, title, description, timeOffsetS, severity } = req.body;
  const incidentName = (name ?? title ?? '').toString().trim();
  if (!processId || !incidentName || timeOffsetS === undefined) {
    return res.status(400).json({ error: 'processId, name и timeOffsetS обязательны' });
  }
  const createdBy = (req as any).user?.id as string;
  const incident = await incidentRepository.create({
    processId, segmentId, name: incidentName, description,
    timeOffsetS, severity: severity || 'info', createdBy,
  });
  res.status(201).json(incident);
});

/**
 * @openapi
 * /incidents/{id}:
 *   delete:
 *     tags: [Incidents]
 *     operationId: deleteIncident
 *     summary: Удаление инцидента
 *     description: Удаляет инцидент. Требуется право delete на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID инцидента.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '204':
 *         description: Инцидент удалён
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
 *         description: Инцидент не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
incidentRouter.delete('/:id', requirePermission('delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await incidentRepository.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'инцидент не найден' });
  res.status(204).send();
});

/**
 * @openapi
 * /incidents/{id}:
 *   patch:
 *     tags: [Incidents]
 *     operationId: patchIncident
 *     summary: Частичное обновление инцидента
 *     description: Обновляет только переданные поля (name/description/severity/timeOffsetS; title — устаревший алиас name). Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID инцидента.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IncidentPatch'
 *     responses:
 *       '200':
 *         description: Инцидент обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Incident'
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
 *         description: Инцидент не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
incidentRouter.patch('/:id', requirePermission('write'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, title, description, severity, timeOffsetS } = req.body;
  // Если передан только устаревший title — используем его как name.
  const resolvedName = name !== undefined ? name : title;
  const updated = await incidentRepository.updateById(id, {
    ...(resolvedName !== undefined ? { name: resolvedName } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(severity !== undefined ? { severity } : {}),
    ...(timeOffsetS !== undefined ? { timeOffsetS } : {}),
  });
  if (!updated) return res.status(404).json({ error: 'инцидент не найден' });
  res.json(updated);
});
