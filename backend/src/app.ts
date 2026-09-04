import express from 'express';
import type { Application } from 'express';
import cookieParser from 'cookie-parser';
import { apiRouter } from './routes';
import { config } from './config';

const app: Application = express();

// Подключаем middleware
app.use(express.json());
app.use(cookieParser());

// Маршруты API
app.use(config.apiPrefix, apiRouter);

export default app;
