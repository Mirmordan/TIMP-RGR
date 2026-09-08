import express from 'express';
import type { Application, NextFunction, Request, RequestHandler, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import swaggerUi from 'swagger-ui-express';
import { apiRouter } from './routes';
import { config } from './config';
import { openapiSpec } from './openapi';

const app: Application = express();

// Security-заголовки (helmet): X-Content-Type-Options: nosniff, X-Frame-Options: DENY,
// Referrer-Policy, убирает X-Powered-By и т.п. Плюс CSP (см. директивы ниже).
// useDefaults: false — набор директив фиксирован ниже: дефолтный helmet добавляет
// upgrade-insecure-requests, что ломает plain-HTTP деплой (nginx :80 без TLS).
// CSP_REPORT_ONLY=1 — только логировать нарушения (Content-Security-Policy-Report-Only).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'blob:', 'data:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
      reportOnly: process.env.CSP_REPORT_ONLY === '1',
    },
  }),
);

// Подключаем middleware
app.use(express.json());
app.use(cookieParser());

// Маршруты API
app.use(config.apiPrefix, apiRouter);

// Swagger: JSON-спека + UI (только когда docs включены в конфиге).
if (config.docs.enabled) {
  app.get(`${config.apiPrefix}/docs.json`, (_req: Request, res: Response) => {
    res.json(openapiSpec);
  });
  // Swagger UI отдаёт HTML с инлайн-скриптами/стилями, которые строгий CSP блокирует.
  // /docs — внутренний инструмент (включается только env-флагом SWAGGER_ENABLED/docs config),
  // поэтому снимаем CSP-заголовки только с этого маршрута (helmet ставит заголовки
  // синхронно при обработке запроса, removeHeader здесь срабатывает до ответа).
  const stripCspForDocs: RequestHandler = (_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    next();
  };
  app.use(`${config.apiPrefix}/docs`, stripCspForDocs, swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));
}

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
