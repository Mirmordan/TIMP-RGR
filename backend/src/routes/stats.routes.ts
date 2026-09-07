import { Router } from 'express';
import type { Request, Response } from 'express';
import { statsService } from '../services/stats.service';
import { authenticate } from '../security/middleware/authenticate';
import { requireCapability } from '../security/middleware/requireCapability';

export const statsRouter = Router();

statsRouter.use(authenticate);

function parseDays(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 365);
}

/**
 * @openapi
 * /stats/overview:
 *   get:
 *     tags: [Stats]
 *     operationId: getOverview
 *     summary: Сводная статистика
 *     description: Агрегированная статистика по процессам, сегментам, инцидентам, устройствам и записи за сегодня (в пределах видимости пользователя). Требуется capability admin:read.
 *     responses:
 *       '200':
 *         description: Сводная статистика
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OverviewStats'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability admin:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
statsRouter.get('/overview', requireCapability('admin:read'), async (_req: Request, res: Response) => {
  const overview = await statsService.getOverview();
  res.json(overview);
});

/**
 * @openapi
 * /stats/timeline:
 *   get:
 *     tags: [Stats]
 *     operationId: getTimeline
 *     summary: Таймлайн записей по дням и устройствам
 *     description: Бакеты «день × устройство» с длительностью записей за последние N дней. Ответ — массив строк. Требуется capability admin:read.
 *     parameters:
 *       - name: days
 *         in: query
 *         description: За сколько последних календарных дней (целое, от 1 до 365).
 *         required: false
 *         schema:
 *           type: integer
 *           default: 14
 *           maximum: 365
 *     responses:
 *       '200':
 *         description: Массив записей таймлайна
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TimelineRow'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability admin:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
statsRouter.get('/timeline', requireCapability('admin:read'), async (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 14);
  const rows = await statsService.getTimeline(days);
  res.json(rows);
});

/**
 * @openapi
 * /stats/incidents:
 *   get:
 *     tags: [Stats]
 *     operationId: getIncidentTimeline
 *     summary: Инциденты по дням и важности
 *     description: Бакеты «день × severity» с количеством инцидентов за последние N дней. Ответ — массив строк. Требуется capability admin:read.
 *     parameters:
 *       - name: days
 *         in: query
 *         description: За сколько последних календарных дней (целое, от 1 до 365).
 *         required: false
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 365
 *     responses:
 *       '200':
 *         description: Массив записей таймлайна инцидентов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/IncidentTimelineRow'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability admin:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
statsRouter.get('/incidents', requireCapability('admin:read'), async (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 30);
  const rows = await statsService.getIncidentsTimeline(days);
  res.json(rows);
});

/**
 * @openapi
 * /stats/disk:
 *   get:
 *     tags: [Stats]
 *     operationId: getDisk
 *     summary: Статистика по диску
 *     description: Размер чанков записей и свободное/общее место на разделе (кэшируется на 60 секунд). Не ограничено RLS. Требуется capability admin:read.
 *     responses:
 *       '200':
 *         description: Данные о диске
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DiskStats'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Недостаточно прав (нужна capability admin:read)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
statsRouter.get('/disk', requireCapability('admin:read'), async (_req: Request, res: Response) => {
  const disk = await statsService.getDisk();
  res.json(disk);
});
