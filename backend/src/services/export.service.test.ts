import { describe, it, expect, vi, beforeEach, afterAll, type Mock } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import type { RecordingSegment, RecordingProcess } from '../types';

const state = vi.hoisted(() => ({ tmpBase: '' }));

vi.mock('../config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-svc-'));
  state.tmpBase = dir;
  return {
    config: {
      port: 3000,
      appAddress: 'localhost',
      apiPrefix: '/api/v1',
      docs: { enabled: false },
      security: {},
      db: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
      mediaMTX: { apiUrl: '', recordRoot: path.join(dir, 'container'), recordRootHost: path.join(dir, 'rootA') },
      ffmpegManager: { apiUrl: '', recordRoot: path.join(dir, 'rootB') },
      watchdog: { stallGraceS: 180, tickS: 60 },
    },
  };
});

vi.mock('../repositories/process.repository', () => ({
  processRepository: { findById: vi.fn() },
}));

vi.mock('../repositories/segment.repository', () => ({
  segmentRepository: { findByProcess: vi.fn() },
}));

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { processRepository } from '../repositories/process.repository';
import { segmentRepository } from '../repositories/segment.repository';
import { spawn } from 'child_process';
import { exportService, ExportError, selectChunksInRange } from './export.service';

const findById = processRepository.findById as unknown as Mock;
const findByProcess = segmentRepository.findByProcess as unknown as Mock;
const spawnMock = spawn as unknown as Mock;

const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/** Фейковый ffmpeg-процесс: EventEmitter + kill/stderr, эмитим close вручную. */
const childProcs: (EventEmitter & { kill: Mock; stderr: EventEmitter })[] = [];
function fakeSpawn(): EventEmitter & { kill: Mock; stderr: EventEmitter } {
  const proc = new EventEmitter() as EventEmitter & { kill: Mock; stderr: EventEmitter };
  proc.kill = vi.fn();
  proc.stderr = new EventEmitter();
  childProcs.push(proc);
  return proc;
}

/** Чанк-файл с UTC-таймстампом в имени (секунды от base), формат 2026-09-05_10-00-00-000000.ts. */
function tsName(base: Date, secFromBase: number): string {
  const iso = new Date(base.getTime() + secFromBase * 1000).toISOString(); // 2026-09-05T10:00:00.000Z
  return `${iso.replace('T', '_').replace(/:/g, '-').replace('.000Z', '-000000.ts')}`;
}

function writeChunks(dirName: string, names: string[]): void {
  const dir = path.join(state.tmpBase, 'rootA', dirName);
  fs.mkdirSync(dir, { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(dir, n), 'chunk');
}

function makeSeg(overrides: Partial<RecordingSegment> = {}): RecordingSegment {
  return {
    id: 'seg-1',
    processId: 'proc-1',
    streamId: 'stream-1',
    path: 'process_proc-1',
    startedAt: new Date('2026-09-05T10:00:00.000Z'),
    endedAt: new Date('2026-09-05T10:00:10.000Z'),
    fileCount: 0,
    durationS: 0,
    sizeBytes: 0,
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
    ...overrides,
  };
}

function makeProcess(status = 'stopped'): RecordingProcess {
  return {
    id: 'proc-1',
    streamId: 'stream-1',
    startedAt: new Date('2026-09-05T10:00:00.000Z'),
    status: status as RecordingProcess['status'],
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
}

beforeEach(() => {
  childProcs.length = 0;
  findById.mockReset();
  findByProcess.mockReset();
  spawnMock.mockReset();
  spawnMock.mockImplementation(fakeSpawn);
});

afterAll(() => {
  if (state.tmpBase) fs.rmSync(state.tmpBase, { recursive: true, force: true });
});

function dumpListFile(listFile: string): string[] {
  return fs.readFileSync(listFile, 'utf8').trim().split('\n');
}

describe('exportService.selectChunksInRange', () => {
  const T0 = new Date('2026-09-05T10:00:00.000Z');
  const chunks = (secs: number[]) => secs.map(s => ({ file: tsName(T0, s), tsMs: T0.getTime() + s * 1000, absPath: `/x/${s}.ts` }));

  it('окно за границей данных (после последнего чанка) → пусто', () => {
    const picked = selectChunksInRange(chunks([0, 2, 4, 6, 8]), T0.getTime() + 200 * 1000, T0.getTime() + 300 * 1000);
    expect(picked).toHaveLength(0);
  });

  it('пустой список чанков → пусто', () => {
    const picked = selectChunksInRange([], T0.getTime(), T0.getTime() + 10 * 1000);
    expect(picked).toHaveLength(0);
  });

  it('окно накрывает хвост первого и начало второго сегмента (склейка через gap) — чанки обоих собраны', () => {
    // Сегмент 1: 10:00:00..08, сегмент 2: через 120 секунд (10:02:00..08).
    const c = chunks([0, 2, 4, 6, 8, 120, 122, 124, 126, 128]);
    const picked = selectChunksInRange(c, T0.getTime() + 4 * 1000, T0.getTime() + 125 * 1000);
    expect(picked.length).toBe(6);
    expect(picked[0]!.tsMs).toBe(T0.getTime() + 4000); // начинаем с накрывающего чанка
    expect(picked.map(p => p.tsMs)).toContain(T0.getTime() + 120 * 1000);
    expect(picked.map(p => p.tsMs)).toContain(T0.getTime() + 124 * 1000);
  });

  it('окно целиком в gap (между сегментами) → пусто', () => {
    const c = chunks([0, 2, 4, 6, 8, 120, 122, 124]);
    const picked = selectChunksInRange(c, T0.getTime() + 60 * 1000, T0.getTime() + 90 * 1000);
    expect(picked).toHaveLength(0);
  });
});

describe('exportService.exportSegment', () => {
  const T0 = new Date('2026-09-05T10:00:00.000Z');
  const n = (s: number) => tsName(T0, s);
  const segAt = (startSec: number, endSec: number): RecordingSegment => makeSeg({
    startedAt: new Date(T0.getTime() + startSec * 1000),
    endedAt: new Date(T0.getTime() + endSec * 1000),
  });

  it('невалидный диапазон (to-from > 900) → 400, ffmpeg не дёргается', async () => {
    await expect(exportService.exportSegment('proc-1', 10, 1000)).rejects.toMatchObject({ status: 400 });
    expect(findById).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('диапазон за границей данных → 404, ffmpeg не дёргается', async () => {
    writeChunks('process_proc-1', [n(0), n(2), n(4), n(6), n(8)]);
    findById.mockResolvedValue(makeProcess());
    findByProcess.mockResolvedValue([segAt(0, 10)]);

    const err = await exportService.exportSegment('proc-1', 200, 300).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ExportError);
    expect((err as ExportError).status).toBe(404);
    expect((err as ExportError).message).toContain('нет данных');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('процесс не найден → 404', async () => {
    findById.mockResolvedValue(null);
    findByProcess.mockResolvedValue([]);

    const err = await exportService.exportSegment('proc-1', 0, 10).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ExportError);
    expect((err as ExportError).status).toBe(404);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('склейка через gap: чанки двух сегментов процесса попадают в один concat-list', async () => {
    // Сегмент 1: 10:00:00..08, сегмент 2: 10:02:00..08 (окно 4..124 с).
    const seg1Files = [n(0), n(2), n(4), n(6), n(8)];
    const seg2Files = [n(120), n(122), n(124), n(126), n(128)];
    writeChunks('process_proc-1', [...seg1Files, ...seg2Files]);
    findById.mockResolvedValue(makeProcess());
    findByProcess.mockResolvedValue([segAt(0, 10), segAt(120, 130)]);

    const promise = exportService.exportSegment('proc-1', 4, 125);
    await flush();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(findByProcess).toHaveBeenCalledWith('proc-1');
    const args = spawnMock.mock.calls[0]![1] as string[];
    expect(args[0]).toBe('-f');
    const i = args.indexOf('-i');
    const y = args.indexOf('-y');
    const listFile = args[i + 1]!;
    const outFile = args[y + 1]!;

    const listed = dumpListFile(listFile);
    expect(listed).toHaveLength(6);
    expect(listed.some(l => l.includes(seg1Files[2]!))).toBe(true); // чанк из сегмента 1
    expect(listed.some(l => l.includes(seg1Files[4]!))).toBe(true);
    expect(listed.some(l => l.includes(seg2Files[0]!))).toBe(true); // чанк из сегмента 2
    expect(listed.some(l => l.includes(seg2Files[2]!))).toBe(true);
    expect(outFile).toMatch(/fragment_proc-1_4-125\.mp4$/);
    expect(path.dirname(outFile)).toContain('timprgr-export-');

    // Фейковый результат ffmpeg.
    fs.writeFileSync(outFile, 'FAKEMP4');
    childProcs[0]!.emit('close', 0);

    const result = await promise;
    expect(result.files).toBe(6);
    expect(result.size).toBe(7);
    expect(fs.existsSync(result.mp4Path)).toBe(true);
    expect(fs.existsSync(listFile)).toBe(false); // list удалён, каталог живёт до отдачи
    fs.rmSync(path.dirname(result.mp4Path), { recursive: true, force: true });
  });

  it('ffmpeg упал с ненулевым кодом → 500, временный каталог вычищен', async () => {
    writeChunks('process_proc-1', [n(0), n(2), n(4), n(6), n(8)]);
    findById.mockResolvedValue(makeProcess());
    findByProcess.mockResolvedValue([segAt(0, 10)]);

    const promise = exportService.exportSegment('proc-1', 0, 10);
    await flush();
    const args = spawnMock.mock.calls[0]![1] as string[];
    const y = args.indexOf('-y');
    const outFile = args[y + 1]!;
    expect(fs.existsSync(path.dirname(outFile))).toBe(true);

    childProcs[0]!.emit('close', 1);
    const err = await promise.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ExportError);
    expect((err as ExportError).status).toBe(500);
    expect(fs.existsSync(path.dirname(outFile))).toBe(false);
  });
});
