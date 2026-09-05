import { describe, it, expect, vi, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RecordingSegment } from '../types';

// Изолируем recordRoots от реальных каталогов записи: направляем их во временную папку.
// (vi.hoisted выполняется до инициализации импортов, поэтому fs/os/path трогаем только
// в factory — она вызывается позже, при импорте ../config.)
const state = vi.hoisted(() => ({ tmpBase: '' }));

vi.mock('../config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'segwindow-m3u8-'));
  state.tmpBase = dir;
  return {
    config: {
      port: 3000,
      appAddress: 'localhost',
      apiPrefix: '/api/v1',
      docs: { enabled: false },
      security: {},
      db: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
      mediaMTX: { apiUrl: '', recordRoot: path.join(dir, 'container'), recordRootHost: dir },
      ffmpegManager: { apiUrl: '', recordRoot: path.join(dir, 'recordings') },
    },
  };
});

import { segmentService } from './segment.service';

afterAll(() => {
  if (state.tmpBase) fs.rmSync(state.tmpBase, { recursive: true, force: true });
});

function makeSeg(overrides: Partial<RecordingSegment> = {}): RecordingSegment {
  return {
    id: 'seg-1',
    processId: 'proc-1',
    streamId: 'stream-1',
    path: 'process_proc-1',
    startedAt: new Date('2026-09-05T10:00:00.000Z'),
    endedAt: null,
    fileCount: 0,
    durationS: 0,
    sizeBytes: 0,
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
    ...overrides,
  };
}

describe('segmentService.getSegmentWindowM3u8', () => {
  it('открытый сегмент (endedAt === null) без файлов → пустой EVENT-плейлист без ENDLIST и .ts', () => {
    fs.mkdirSync(path.join(state.tmpBase, 'process_proc-1'), { recursive: true });

    const m3u8 = segmentService.getSegmentWindowM3u8(makeSeg(), 0);

    expect(m3u8).toBeTruthy();
    expect(m3u8).toContain('#EXTM3U');
    expect(m3u8).toContain('#EXT-X-VERSION:3');
    expect(m3u8).toContain('#EXT-X-TARGETDURATION:2');
    expect(m3u8).toContain('#EXT-X-PLAYLIST-TYPE:EVENT');
    expect(m3u8).toContain('#EXT-X-MEDIA-SEQUENCE:0');
    expect(m3u8).toContain('#EXT-X-PROGRAM-DATE-TIME:2026-09-05T10:00:00Z');
    expect(m3u8).not.toContain('#EXT-X-ENDLIST');
    expect(m3u8).not.toContain('.ts');
  });

  it('закрытый сегмент (endedAt !== null) без файлов → пустая строка', () => {
    const m3u8 = segmentService.getSegmentWindowM3u8(
      makeSeg({ endedAt: new Date('2026-09-05T10:01:00.000Z') }),
      0,
    );
    expect(m3u8).toBe('');
  });

  it('закрытый сегмент, окно за последним файлом → пустая строка (данные кончились раньше endedAt)', () => {
    const dir = path.join(state.tmpBase, 'process_proc-2');
    fs.mkdirSync(dir, { recursive: true });
    for (const n of [
      '2026-09-05_10-00-00-000000.ts',
      '2026-09-05_10-00-10-000000.ts',
      '2026-09-05_10-00-20-000000.ts',
      '2026-09-05_10-00-30-000000.ts',
    ]) {
      fs.writeFileSync(path.join(dir, n), 'chunk');
    }

    const seg = makeSeg({
      path: 'process_proc-2',
      startedAt: new Date('2026-09-05T10:00:00.000Z'),
      endedAt: new Date('2026-09-05T10:00:40.000Z'),
    });
    // Старт окна (10:00:41) — внутри endedAt, но позже последнего чанка (10:00:30).
    const m3u8 = segmentService.getSegmentWindowM3u8(seg, 41);
    expect(m3u8).toBe('');
  });

  it('закрытый сегмент, старт внутри данных → обычное VOD-окно от накрывающего чанка', () => {
    const seg = makeSeg({
      path: 'process_proc-2',
      startedAt: new Date('2026-09-05T10:00:00.000Z'),
      endedAt: new Date('2026-09-05T10:00:40.000Z'),
    });
    // Старт 10:00:15 → окно с чанка 10:00:10 до конца.
    const m3u8 = segmentService.getSegmentWindowM3u8(seg, 15);
    expect(m3u8).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(m3u8).toContain('#EXT-X-MEDIA-SEQUENCE:1');
    expect(m3u8).toContain('#EXT-X-ENDLIST');
    expect(m3u8).toContain('/api/v1/recordings/process_proc-2/2026-09-05_10-00-10-000000.ts');
    expect(m3u8).toContain('/api/v1/recordings/process_proc-2/2026-09-05_10-00-30-000000.ts');
    expect(m3u8).not.toContain('/api/v1/recordings/process_proc-2/2026-09-05_10-00-00-000000.ts');
  });
});
