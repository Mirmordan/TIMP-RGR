import { Router } from 'express';
import type { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { authenticate } from '../security/middleware/authenticate';
import { Cache } from '../security/permissionCache';
import { processRepository } from '../repositories/process.repository';
import { streamRepository } from '../repositories/stream.repository';
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

const MEDIA_PATH_RE = /^\/(?:hls|live)\/(process|view)_([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\//i;
const UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

interface MediaAccess {
  allowed: boolean;
}

const mediaAccessCache = new Cache<MediaAccess>(5000, 10_000);

function parseMediaPath(rawPath: string): { kind: 'process' | 'stream'; id: string } | null {
  let pathname = rawPath;
  const queryIndex = pathname.indexOf('?');
  if (queryIndex >= 0) pathname = pathname.slice(0, queryIndex);

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const match = pathname.match(MEDIA_PATH_RE);
  if (!match) return null;

  const kind = match[1]?.toLowerCase() === 'process' ? 'process' : 'stream';
  const id = match[2]?.toLowerCase();
  if (!id || !UUID_RE.test(id)) return null;
  return { kind, id };
}

async function canAccessMediaPath(kind: 'process' | 'stream', id: string): Promise<boolean> {
  try {
    return kind === 'process'
      ? Boolean(await processRepository.findById(id))
      : Boolean(await streamRepository.findById(id));
  } catch {
    return false;
  }
}

// Auth endpoint для nginx auth_request — проверка доступа к медиа-пути
/**
 * @openapi
 * /recordings/auth:
 *   get:
 *     tags: [Recordings]
 *     operationId: checkRecordingAuth
 *     summary: Проверка доступа к медиа-объекту (nginx auth_request)
 *     description: Служебный эндпоинт для nginx auth_request. Проверяет аутентификацию и соответствие X-Original-URI медиа-объекту, доступному текущему пользователю через RLS (read).
 *     parameters:
 *       - name: X-Original-URI
 *         in: header
 *         required: false
 *         schema:
 *           type: string
 *         description: Исходный nginx-путь вида /hls/process_<id>/... или /live/view_<id>/....
 *     responses:
 *       '200':
 *         description: Токен валиден и пользователь может читать медиа-объект
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
 *       '403':
 *         description: Путь неизвестен или пользователю не доступен соответствующий процесс/поток
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
recordingRouter.get('/auth', authenticate, async (req: Request, res: Response) => {
  const originalUri = req.header('x-original-uri') ?? req.originalUrl ?? '';
  const mediaPath = parseMediaPath(originalUri);
  if (!mediaPath) {
    res.status(403).json({ error: 'неизвестный медиа-путь' });
    return;
  }

  const user = req.user!;
  const cacheKey = `${user.id}:${mediaPath.kind}:${mediaPath.id}`;
  let access = mediaAccessCache.get(cacheKey);
  if (!access) {
    access = { allowed: await canAccessMediaPath(mediaPath.kind, mediaPath.id) };
    mediaAccessCache.set(cacheKey, access);
  }

  if (!access.allowed) {
    res.status(403).json({ error: 'нет доступа к медиа-объекту' });
    return;
  }

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
  const processId = processIdMatch[1]!.toLowerCase();
  if (!UUID_RE.test(processId)) {
    return res.status(404).json({ error: 'процесс не найден' });
  }

  const user = req.user!;
  const cacheKey = `${user.id}:process:${processId}`;
  let access = mediaAccessCache.get(cacheKey);
  if (!access) {
    access = { allowed: Boolean(await processRepository.findById(processId)) };
    mediaAccessCache.set(cacheKey, access);
  }
  if (!access.allowed) {
    return res.status(404).json({ error: 'процесс не найден' });
  }

  const filePath = findRecordFile(processDir, filename);
  if (!filePath) {
    return res.status(404).json({ error: 'файл не найден' });
  }

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.sendFile(filePath);
});
