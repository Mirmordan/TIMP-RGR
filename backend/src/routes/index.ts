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
import { authRouter } from '../security/auth.routes';

export const apiRouter = Router();

apiRouter.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/devices', deviceRouter);
apiRouter.use('/streams', streamRouter);
apiRouter.use('/processes', processRouter);
apiRouter.use('/chunks', chunkRouter);
apiRouter.use('/segments', segmentRouter);
apiRouter.use('/recordings', recordingRouter);
apiRouter.use('/incidents', incidentRouter);
apiRouter.use('/admin', adminRouter);
