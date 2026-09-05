import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('../config', () => ({
  config: {
    ffmpegManager: { apiUrl: 'http://ffm.test:9999' },
    mediaMTX: { apiUrl: 'http://mtx.test:9997' },
    watchdog: { stallGraceS: 180, tickS: 60 },
  },
}));

vi.mock('../database/connection', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../security/dbBridge', () => ({
  runWithUser: vi.fn((_userId: string, fn: () => unknown) => fn()),
}));

vi.mock('../repositories/process.repository', () => ({
  processRepository: { findRunningWithStream: vi.fn() },
}));

vi.mock('../repositories/segment.repository', () => ({
  segmentRepository: { findByProcess: vi.fn() },
}));

vi.mock('./process.service', () => ({
  processService: { patch: vi.fn() },
}));

vi.mock('./segment.service', () => ({
  segmentService: { lastFileTs: vi.fn() },
}));

vi.mock('./audit.service', () => ({
  auditService: { logAudit: vi.fn() },
}));

import { pool } from '../database/connection';
import { processRepository } from '../repositories/process.repository';
import { segmentRepository } from '../repositories/segment.repository';
import { processService } from './process.service';
import { segmentService } from './segment.service';
import { auditService } from './audit.service';
import { recoveryService, STALL_GRACE_S } from './recovery.service';

const poolQuery = pool.query as unknown as Mock;
const findRunning = processRepository.findRunningWithStream as unknown as Mock;
const findByProcess = segmentRepository.findByProcess as unknown as Mock;
const patchProcess = processService.patch as unknown as Mock;
const lastFileTs = segmentService.lastFileTs as unknown as Mock;
const logAudit = auditService.logAudit as unknown as Mock;

const STARTED = new Date(Date.now() - 6 * 60 * 60 * 1000); // заведомо старше STALL_GRACE_S

function runningProcess(id: string, streamUrl = 'ivideon://server/cam'): { id: string; streamUrl: string } {
  return { id, streamUrl };
}

function openSegment(processId: string, startedAt: Date): { path: string; startedAt: Date; endedAt: null } {
  return { path: `process_${processId}`, startedAt, endedAt: null };
}

beforeEach(() => {
  poolQuery.mockReset();
  findRunning.mockReset();
  findByProcess.mockReset();
  patchProcess.mockReset();
  lastFileTs.mockReset();
  logAudit.mockReset();
  // Системный админ для RLS-контекста.
  poolQuery.mockResolvedValue({ rows: [{ id: 'admin-1', username: 'admin-1' }] });
  patchProcess.mockResolvedValue({ id: 'proc-1' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('watchdog.checkStalledRecordings', () => {
  it('running-процесс с давно «пустым» открытым сегментом (нет файлов) → failed + audit + финализация через патч', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    findRunning.mockResolvedValue([runningProcess('proc-1')]);
    findByProcess.mockResolvedValue([openSegment('proc-1', STARTED)]);
    lastFileTs.mockReturnValue(null);

    await recoveryService.checkStalledRecordings();

    expect(patchProcess).toHaveBeenCalledTimes(1);
    expect(patchProcess).toHaveBeenCalledWith('proc-1', { status: 'failed' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      actorName: 'admin-1',
      action: 'recording.watchdog.stalled',
      targetType: 'recording_process',
      targetId: 'proc-1',
      details: expect.objectContaining({ processId: 'proc-1', lastTs: STARTED.toISOString() }),
    }));
    expect(String(warn.mock.calls[0]?.[0])).toContain('[watchdog]');
    expect(String(warn.mock.calls[0]?.[0])).toContain('proc-1');
  });

  it('свежие .ts в директории (последний файл моложе grace) → бездействие', async () => {
    findRunning.mockResolvedValue([runningProcess('proc-1')]);
    findByProcess.mockResolvedValue([openSegment('proc-1', STARTED)]);
    lastFileTs.mockReturnValue(new Date()); // чанки пишутся прямо сейчас

    await recoveryService.checkStalledRecordings();

    expect(patchProcess).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('сегмент создан недавно и файлов ещё нет (старт подключения Ivideon) → бездействие', async () => {
    findRunning.mockResolvedValue([runningProcess('proc-1')]);
    findByProcess.mockResolvedValue([openSegment('proc-1', new Date())]);
    lastFileTs.mockReturnValue(null);

    await recoveryService.checkStalledRecordings();

    expect(patchProcess).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('исключение при проверке одного процесса не мешает остальным', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    findRunning.mockResolvedValue([runningProcess('proc-1'), runningProcess('proc-2')]);
    findByProcess.mockImplementation(async (processId: string) => {
      if (processId === 'proc-1') throw new Error('БД недоступна');
      return [openSegment('proc-2', STARTED)];
    });
    lastFileTs.mockReturnValue(null);
    patchProcess.mockResolvedValue({ id: 'proc-2' });

    await recoveryService.checkStalledRecordings();

    expect(patchProcess).toHaveBeenCalledTimes(1);
    expect(patchProcess).toHaveBeenCalledWith('proc-2', { status: 'failed' });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0]?.[0]).toMatchObject({ targetId: 'proc-2' });
    expect(String(error.mock.calls[0]?.[0])).toContain('[watchdog]');
    expect(String(error.mock.calls[0]?.[0])).toContain('proc-1');
  });

  it('grace-константа экспортирована и равна конфиг-значению (для env-override оркестратора)', () => {
    expect(STALL_GRACE_S).toBe(180);
  });
});
