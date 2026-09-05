import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

const state = vi.hoisted(() => ({
  ffmApi: 'http://ffm.test:9999',
  mtxApi: 'http://mtx.test:9997',
}));

vi.mock('../config', () => ({
  config: {
    ffmpegManager: { apiUrl: state.ffmApi },
    mediaMTX: { apiUrl: state.mtxApi },
    watchdog: { stallGraceS: 180, tickS: 60 },
  },
}));

vi.mock('../database/connection', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
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
  segmentService: { createOpen: vi.fn() },
}));

vi.mock('../media/mediaManager', () => ({
  mediaManager: { removePath: vi.fn() },
}));

import { pool } from '../database/connection';
import { processRepository } from '../repositories/process.repository';
import { segmentRepository } from '../repositories/segment.repository';
import { processService } from './process.service';
import { segmentService } from './segment.service';
import { mediaManager } from '../media/mediaManager';
import { recoveryService } from './recovery.service';

const poolQuery = pool.query as unknown as Mock;
const findRunning = processRepository.findRunningWithStream as unknown as Mock;
const findByProcess = segmentRepository.findByProcess as unknown as Mock;
const patchProcess = processService.patch as unknown as Mock;
const createOpen = segmentService.createOpen as unknown as Mock;
const removePath = mediaManager.removePath as unknown as Mock;

function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Замокать fetch: ответы по URL медиа-сервисов. */
function seedFetch(ffmReply: Response | Promise<never>, mtxReply: Response): void {
  const fetchMock = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.startsWith(state.ffmApi)) return ffmReply;
    if (u.startsWith(state.mtxApi)) return mtxReply;
    throw new Error(`неожиданный url: ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function runningProcess(id: string, streamUrl = 'ivideon://server/cam'): {
  id: string; streamId: string; startedAt: Date; status: string; streamUrl: string;
} {
  return { id, streamId: `stream-${id}`, startedAt: new Date('2026-09-05T10:00:00.000Z'), status: 'running', streamUrl };
}

beforeEach(() => {
  poolQuery.mockReset();
  findRunning.mockReset();
  findByProcess.mockReset();
  patchProcess.mockReset();
  createOpen.mockReset();
  removePath.mockReset();
  // Системный админ для RLS-контекста реконсиляции.
  poolQuery.mockResolvedValue({ rows: [{ id: 'admin-1' }] });
  patchProcess.mockResolvedValue({ status: 'stopped' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recoveryService.reconcileOnStartup', () => {
  it('running-процесс + путь есть в ffmpeg-manager list → статус и БД не меняются', async () => {
    findRunning.mockResolvedValue([runningProcess('proc-1')]);
    findByProcess.mockResolvedValue([{
      id: 'seg-1', processId: 'proc-1', streamId: 'stream-proc-1', path: 'process_proc-1',
      startedAt: new Date('2026-09-05T10:00:00.000Z'), endedAt: null,
      fileCount: 0, durationS: 0, sizeBytes: 0, createdAt: new Date('2026-09-05T10:00:00.000Z'),
    }]);
    seedFetch(jsonRes({ itemCount: 1, items: [{ name: 'process_proc-1' }] }), jsonRes({ itemCount: 0, items: [] }));

    await recoveryService.reconcileOnStartup();

    expect(patchProcess).not.toHaveBeenCalled();
    expect(createOpen).not.toHaveBeenCalled();
    expect(removePath).not.toHaveBeenCalled();
    expect(findByProcess).toHaveBeenCalledWith('proc-1');
  });

  it('running-процесс + сервис жив, но пути нет → экстренный stop через patch({status:"stopped"})', async () => {
    findRunning.mockResolvedValue([runningProcess('proc-1')]);
    seedFetch(jsonRes({ itemCount: 0, items: [] }), jsonRes({ itemCount: 0, items: [] }));

    await recoveryService.reconcileOnStartup();

    expect(patchProcess).toHaveBeenCalledTimes(1);
    expect(patchProcess).toHaveBeenCalledWith('proc-1', { status: 'stopped' });
    expect(removePath).not.toHaveBeenCalled();
  });

  it('fetch упал сетевой ошибкой → процесс НЕ стопится, только warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    findRunning.mockResolvedValue([runningProcess('proc-1')]);
    seedFetch(Promise.reject(new TypeError('fetch failed')), jsonRes({ itemCount: 0, items: [] }));

    await recoveryService.reconcileOnStartup();

    expect(patchProcess).not.toHaveBeenCalled();
    expect(removePath).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('[reconcile]');
  });

  it('орфанный process_ путь без running-процесса → removePath вызван, живой путь не тронут', async () => {
    findRunning.mockResolvedValue([runningProcess('proc-1')]);
    findByProcess.mockResolvedValue([{
      id: 'seg-1', processId: 'proc-1', streamId: 'stream-proc-1', path: 'process_proc-1',
      startedAt: new Date('2026-09-05T10:00:00.000Z'), endedAt: null,
      fileCount: 0, durationS: 0, sizeBytes: 0, createdAt: new Date('2026-09-05T10:00:00.000Z'),
    }]);
    seedFetch(
      jsonRes({ itemCount: 2, items: [{ name: 'process_proc-1' }, { name: 'process_ghost' }] }),
      jsonRes({ itemCount: 0, items: [] }),
    );

    await recoveryService.reconcileOnStartup();

    expect(patchProcess).not.toHaveBeenCalled();
    expect(removePath).toHaveBeenCalledTimes(1);
    expect(removePath).toHaveBeenCalledWith('process_ghost', undefined, state.ffmApi);
  });
});
