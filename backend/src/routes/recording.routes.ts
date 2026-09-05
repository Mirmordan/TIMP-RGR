import { Router } from 'express';
import type { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { authenticate } from '../security/middleware/authenticate';
import { processRepository } from '../repositories/process.repository';
import { config } from '../config';

const recordRoots = [
  config.mediaMTX.recordRootHost,
  config.ffmpegManager.recordRoot,
];

function findRecordFile(processDir: string, filename: string): string | null {
  for (const root of recordRoots) {
    const fp = path.join(root, processDir, filename);
    if (fs.existsSync(fp)) return fp;
  }
  return null;
}

export const recordingRouter = Router();

// Auth endpoint для nginx auth_request — только проверка аутентификации
/**
 * @openapi
 * /recordings/auth:
 *   get:
 *     tags: [Recordings]
 *     operationId: checkRecordingAuth
 *     summary: Проверка аутентификации (nginx auth_request)
 *     description: Служебный эндпоинт для nginx auth_request при раздаче .ts файлов. Проверяет валидность access_token из cookie или Bearer-заголовка, тело не возвращает.
 *     responses:
 *       '200':
 *         description: Токен валиден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
recordingRouter.get('/auth', authenticate, (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// Раздача .ts файлов с проверкой доступа
/**
 * @openapi
 * /recordings/{processDir}/{filename}:
 *   get:
 *     tags: [Recordings]
 *     operationId: getRecordingFile
 *     summary: Раздача .ts файла записи
 *     description: Отдаёт .ts чанк из каталога процесса (используется как источник HLS-плейлистов). Проверяет доступность процесса и существование файла.
 *     parameters:
 *       - name: processDir
 *         in: path
 *         required: true
 *         description: Каталог записи, имя которого равно process_ + uuid процесса записи (например, process_xxx).
 *         schema:
 *           type: string
 *           example: 'process_00000000-0000-0000-0000-000000000001'
 *       - name: filename
 *         in: path
 *         required: true
 *         description: Имя .ts файла внутри каталога записи.
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Содержимое .ts файла
 *         content:
 *           video/mp2t:
 *             schema:
 *               type: string
 *               format: binary
 *       '400':
 *         description: Невалидное имя файла (содержит ../ или не .ts) либо невалидный processDir
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
 *       '404':
 *         description: Процесс или файл не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
recordingRouter.get('/:processDir/:filename', authenticate, async (req: Request, res: Response) => {
  const processDir = req.params.processDir as string;
  const filename = req.params.filename as string;

  if (filename.includes('..') || !filename.endsWith('.ts')) {
    return res.status(400).json({ error: 'невалидное имя файла' });
  }

  const processIdMatch = processDir.match(/^process_(.+)$/);
  if (!processIdMatch) {
    return res.status(400).json({ error: 'невалидный путь' });
  }
  const processId = processIdMatch[1]!;

  const process = await processRepository.findById(processId);
  if (!process) {
    return res.status(404).json({ error: 'процесс не найден' });
  }

  const filePath = findRecordFile(processDir, filename);
  if (!filePath) {
    return res.status(404).json({ error: 'файл не найден' });
  }

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(filePath);
});
