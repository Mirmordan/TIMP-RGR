import { Router } from 'express';
import type { Request, Response } from 'express';
import { deviceRouter } from './device.routes';
import { streamRouter } from './stream.routes';
import { processRouter } from './process.routes';
import { chunkRouter } from './chunk.routes';
import { segmentRouter } from './segment.routes';
import { recordingRouter } from './recording.routes';
import { userRouter } from './user.routes';
import { incidentRouter } from './incident.routes';
import { adminRouter } from './admin.routes';
import { statsRouter } from './stats.routes';
import { exportRouter } from './export.routes';
import { authRouter } from '../security/auth.routes';

export const apiRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     operationId: getHealth
 *     summary: Проверка доступности API
 *     description: Публичный эндпоинт без авторизации.
 *     security: []
 *     responses:
 *       '200':
 *         description: Сервис работает
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status]
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
apiRouter.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/devices', deviceRouter);
apiRouter.use('/streams', streamRouter);
apiRouter.use('/processes', processRouter);
apiRouter.use('/processes', exportRouter);
apiRouter.use('/chunks', chunkRouter);
apiRouter.use('/segments', segmentRouter);
apiRouter.use('/recordings', recordingRouter);
apiRouter.use('/incidents', incidentRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/stats', statsRouter);
