import express from 'express';
import type { Application, NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import { apiRouter } from './routes';
import { config } from './config';

const app: Application = express();

// Подключаем middleware
app.use(express.json());
app.use(cookieParser());

// Маршруты API
app.use(config.apiPrefix, apiRouter);

// Прод-статика (all-in-one образ): фронтенд собран в backend/public.
// В dev-режиме папки нет (vite dev на 5173) — блок не активен.
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  // SPA-fallback: GET без расширения вне API-prefix отдают index.html
  // (роуты React — бесрасширенные; отсутствующие .js/.ts/.m3u8 → обычный 404).
  // Express 5 (path-to-regexp v8): app.get('*') не поддерживается — middleware-подход.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith(config.apiPrefix) || path.extname(req.path)) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

export default app;
