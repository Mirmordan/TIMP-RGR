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
recordingRouter.get('/auth', authenticate, (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// Раздача .ts файлов с проверкой доступа
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
