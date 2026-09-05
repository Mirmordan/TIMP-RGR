import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { exportService, ExportError } from '../services/export.service';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const exportRouter = Router();

exportRouter.use(authenticate);

/**
 * @openapi
 * /processes/{id}/export:
 *   get:
 *     tags: [Processes]
 *     operationId: exportProcessFragment
 *     summary: Экспорт фрагмента записи процесса в MP4
 *     description: Синхронно склеивает .ts чанки процесса, пересекающие окно [from, to] (секунды от начала таймлайна процесса), в один mp4-файл и отдаёт его на скачивание. Окно не должно превышать 900 секунд. Требуется право read на процесс.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID процесса записи.
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: from
 *         in: query
 *         required: true
 *         description: Начало фрагмента в секундах от начала таймлайна процесса (та же ось, что у timeOffsetS инцидентов).
 *         schema:
 *           type: number
 *           minimum: 0
 *       - name: to
 *         in: query
 *         required: true
 *         description: Конец фрагмента в секундах от начала таймлайна процесса.
 *         schema:
 *           type: number
 *     responses:
 *       '200':
 *         description: MP4-файл фрагмента записи
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 *       '400':
 *         description: Некорректный диапазон (from/to не числа, from<0, to<=from или to-from>900)
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
 *       '404':
 *         description: Процесс не найден или в запрошенном диапазоне нет данных
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: Ошибка нарезки (ffmpeg недоступен/упал, таймаут)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exportRouter.get('/:id/export', requirePermission('read'), async (req: Request, res: Response) => {
  const processId = req.params.id as string;
  const fromS = Number(req.query.from);
  const toS = Number(req.query.to);

  let result;
  try {
    result = await exportService.exportSegment(processId, fromS, toS);
  } catch (e: any) {
    if (e instanceof ExportError) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error(`[export] ошибка экспорта процесса ${processId}:`, e);
    return res.status(500).json({ error: 'ошибка экспорта видео' });
  }

  // Временный каталог с mp4 удаляем после завершения передачи (finish/close).
  const tmpDir = path.dirname(result.mp4Path);
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(result.mp4Path)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.on('finish', cleanup);
  res.on('close', cleanup);
  res.sendFile(result.mp4Path, (err) => {
    if (err) {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: 'ошибка отправки файла' });
      }
    }
  });
});
