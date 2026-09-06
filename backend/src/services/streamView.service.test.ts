import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

const state = vi.hoisted(() => ({
  ffmApi: 'http://ffm.test:9999',
  mtxApi: 'http://mtx.test:9997',
}));

vi.mock('../config', () => ({
  config: {
    ffmpegManager: { apiUrl: state.ffmApi },
    mediaMTX: { apiUrl: state.mtxApi, recordRoot: '/data/chunks' },
  },
}));

vi.mock('../repositories/stream.repository', () => ({
  streamRepository: { findById: vi.fn() },
}));

vi.mock('../repositories/process.repository', () => ({
  processRepository: { findRunningByStreamId: vi.fn() },
}));

import { streamRepository } from '../repositories/stream.repository';
import { processRepository } from '../repositories/process.repository';
import { streamViewService, viewName, VIEW_TTL_S } from './streamView.service';

const findStream = streamRepository.findById as unknown as Mock;
const findRunning = processRepository.findRunningByStreamId as unknown as Mock;

interface CapturedRequest {
  method?: string;
  url: string;
  body?: Record<string, unknown> | undefined;
}

const requests: CapturedRequest[] = [];
let usedStreamIds: string[] = [];
let onlinePaths = new Set<string>();

function okRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Замокать fetch на оба медиа-сервиса: add/delete/get отвечают ok и логируются. */
function seedFetch(): void {
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    let body: Record<string, unknown> | undefined;
    if (init?.body) {
      try { body = JSON.parse(String(init.body)) as Record<string, unknown>; } catch { /* ignore */ }
    }
    requests.push({ method, url: u, body });
    if (u.includes('/v3/paths/get/')) {
      const name = u.slice(u.lastIndexOf('/') + 1);
      return okRes({ online: onlinePaths.has(name) });
    }
    return okRes({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function ivideonStream(id: string): { id: string; url: string; createdAt: Date } {
  return { id, url: 'ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0', createdAt: new Date('2026-09-05T10:00:00.000Z') };
}

function hlsStream(id: string): { id: string; url: string; sourceFingerprint: string; createdAt: Date } {
  return {
    id,
    url: 'https://cameras.smarty.kz/rtplive/camera1.stream/playlist.m3u8',
    sourceFingerprint: 'fe63f54416d93e5a654c8fdbd4095e62b55115e627d920ea4065977082be9fd9',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
}

function runningProcess(id: string, streamId: string): {
  id: string; streamId: string; startedAt: Date; status: string; streamUrl: string;
} {
  return { id, streamId, startedAt: new Date('2026-09-05T10:00:00.000Z'), status: 'running', streamUrl: 'ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0' };
}

function countAdds(): number {
  return requests.filter(r => r.url.includes('/v3/config/paths/add/')).length;
}

function countDeletes(): number {
  return requests.filter(r => r.url.includes('/v3/config/paths/delete/')).length;
}

beforeEach(() => {
  requests.length = 0;
  usedStreamIds = [];
  onlinePaths = new Set();
  findStream.mockReset();
  findRunning.mockReset();
  vi.useFakeTimers();
  seedFetch();
});

afterEach(async () => {
  for (const sid of usedStreamIds) {
    try { await streamViewService.stopView(sid); } catch { /* ignore */ }
  }
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('streamViewService.openView', () => {
  it('running-процесс онлайн → hlsUrl process_..., addPath не вызывается', async () => {
    const sid = 'stream-1';
    usedStreamIds.push(sid);
    findStream.mockResolvedValue(ivideonStream(sid));
    findRunning.mockResolvedValue(runningProcess('proc-1', sid));
    onlinePaths.add('process_proc-1');

    const result = await streamViewService.openView(sid);

    expect(result).not.toBeNull();
    expect(result!.hlsUrl).toBe('/hls/process_proc-1/index.m3u8');
    expect(result!.source).toBe('process');
    expect(result!.ttlS).toBe(VIEW_TTL_S);
    expect(countAdds()).toBe(0);
    expect(streamViewService.activeSessions()).toBe(0);
  });

  it('ivideon-стрим без записи → ffm addPath c _ivideon + _view:true в теле', async () => {
    const sid = 'stream-2';
    usedStreamIds.push(sid);
    findStream.mockResolvedValue(ivideonStream(sid));
    findRunning.mockResolvedValue(null);

    const result = await streamViewService.openView(sid);

    expect(result).not.toBeNull();
    expect(result!.hlsUrl).toBe(`/hls/${viewName(sid)}/index.m3u8`);
    expect(result!.source).toBe('view');
    expect(countAdds()).toBe(1);
    const add = requests.find(r => r.url.includes('/v3/config/paths/add/'))!;
    expect(add.url).toBe(`${state.ffmApi}/v3/config/paths/add/${viewName(sid)}`);
    expect(add.body).toEqual({ _ivideon: { server: '100-Ud6bCsaaUqAkdBaDisGWup', camera: '0' }, _view: true });
    expect(streamViewService.activeSessions()).toBe(1);
  });

  it('HLS-стрим без записи → mtx addPath record:false sourceOnDemand:true (+fingerprint), без record-конфига', async () => {
    const sid = 'stream-3';
    usedStreamIds.push(sid);
    findStream.mockResolvedValue(hlsStream(sid));
    findRunning.mockResolvedValue(null);

    const result = await streamViewService.openView(sid);

    expect(result).not.toBeNull();
    expect(result!.hlsUrl).toBe(`/live/${viewName(sid)}/index.m3u8`);
    expect(result!.source).toBe('view');
    expect(countAdds()).toBe(1);
    const add = requests.find(r => r.url.includes('/v3/config/paths/add/'))!;
    expect(add.url).toBe(`${state.mtxApi}/v3/config/paths/add/${viewName(sid)}`);
    expect(add.body).toMatchObject({
      source: hlsStream(sid).url,
      sourceFingerprint: hlsStream(sid).sourceFingerprint,
      sourceOnDemand: true,
      record: false,
    });
    expect(add.body!.recordPath).toBeUndefined();
    expect(add.body!.recordFormat).toBeUndefined();
  });

  it('повторный POST → addPath не дублируется, TTL продлевается (переживает старый дедлайн)', async () => {
    const sid = 'stream-4';
    usedStreamIds.push(sid);
    findStream.mockResolvedValue(ivideonStream(sid));
    findRunning.mockResolvedValue(null);

    await streamViewService.openView(sid);
    expect(countAdds()).toBe(1);

    // heartbeat через 60с: путь жив, второй add не нужен, TTL перезапущен.
    await vi.advanceTimersByTimeAsync(60_000);
    await streamViewService.openView(sid);
    expect(countAdds()).toBe(1);

    // 100с с первого POST: старый TTL (90с) уже истёк бы — продлённый ещё жив.
    await vi.advanceTimersByTimeAsync(40_000);
    expect(countDeletes()).toBe(0);

    // 150с: TTL от второго POST истекает → removePath.
    await vi.advanceTimersByTimeAsync(50_000);
    expect(countDeletes()).toBe(1);
    expect(requests.find(r => r.url.includes('/v3/config/paths/delete/'))!.url)
      .toBe(`${state.ffmApi}/v3/config/paths/delete/${viewName(sid)}`);
    expect(streamViewService.activeSessions()).toBe(0);
  });

  it('DELETE (stopView) → немедленный removePath, Map пуста, повторного TTL-удаления нет', async () => {
    const sid = 'stream-5';
    usedStreamIds.push(sid);
    findStream.mockResolvedValue(hlsStream(sid));
    findRunning.mockResolvedValue(null);

    await streamViewService.openView(sid);
    expect(streamViewService.activeSessions()).toBe(1);

    await streamViewService.stopView(sid);

    expect(countDeletes()).toBe(1);
    expect(requests.find(r => r.url.includes('/v3/config/paths/delete/'))!.url)
      .toBe(`${state.mtxApi}/v3/config/paths/delete/${viewName(sid)}`);
    expect(streamViewService.activeSessions()).toBe(0);

    // таймер снят — по истечении TTL удаления не будет.
    await vi.advanceTimersByTimeAsync((VIEW_TTL_S + 10) * 1000);
    expect(countDeletes()).toBe(1);
  });

  it('TTL истёк (fake timers) → removePath вызван, Map пуста', async () => {
    const sid = 'stream-6';
    usedStreamIds.push(sid);
    findStream.mockResolvedValue(ivideonStream(sid));
    findRunning.mockResolvedValue(null);

    await streamViewService.openView(sid);
    expect(streamViewService.activeSessions()).toBe(1);
    expect(countDeletes()).toBe(0);

    await vi.advanceTimersByTimeAsync((VIEW_TTL_S + 1) * 1000);

    expect(countDeletes()).toBe(1);
    expect(requests.find(r => r.url.includes('/v3/config/paths/delete/'))!.url)
      .toBe(`${state.ffmApi}/v3/config/paths/delete/${viewName(sid)}`);
    expect(streamViewService.activeSessions()).toBe(0);
  });

  it('повторный POST после 409 от ffm (путь уже существует) — трактуется ок, TTL жив', async () => {
    const sid = 'stream-7';
    usedStreamIds.push(sid);
    findStream.mockResolvedValue(ivideonStream(sid));
    findRunning.mockResolvedValue(null);

    // ffm уже имеет путь view_<sid> (например после потери Map-состояния)
    requests.length = 0;
    const dupFetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      let body: Record<string, unknown> | undefined;
      if (init?.body) {
        try { body = JSON.parse(String(init.body)) as Record<string, unknown>; } catch { /* ignore */ }
      }
      requests.push({ method, url: u, body });
      if (u.includes('/v3/config/paths/add/')) {
        return okRes({ status: 'error', error: 'path already exists' }, 409);
      }
      return okRes({ status: 'ok' });
    });
    vi.stubGlobal('fetch', dupFetch);

    const result = await streamViewService.openView(sid);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('view');
    expect(countDeletes()).toBe(0);
    expect(streamViewService.activeSessions()).toBe(1);
  });
});
