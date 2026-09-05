import { config } from '../config';

/**
 * Медиа-менеджер: поддержка HLS (mediaMTX) и Ivideon (ffmpeg-manager).
 *
 * HLS-потоки → mediaMTX API (:9997)
 * Ivideon    → ffmpeg-manager API (:9999)
 *
 * Формат URL в БД:
 *   HLS:      https://cameras.smarty.kz/rtplive/camera1.stream/playlist.m3u8
 *   Ivideon:  ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0
 */

interface MtxError {
  status?: string;
  error?: string;
}

function isIvideonUrl(source: string): boolean {
  return source.startsWith('ivideon://');
}

function parseIvideonUrl(source: string): { server: string; camera: string } {
  // ivideon://server/camera
  const match = source.match(/^ivideon:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Неверный Ivideon URL: ${source}`);
  return { server: match[1]!, camera: match[2]! };
}

async function request<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error('Медиа-менеджер недоступен');
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as MtxError;
      msg = body.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(`Медиа-менеджер: ${msg}`);
  }

  return (await res.json()) as T;
}

export const mediaManager = {
  /** Создать путь (поднять поток с источником). */
  async createPath(
    name: string,
    opts: {
      source: string;
      sourceFingerprint?: string;
      sourceOnDemand?: boolean;
      record?: boolean;
      recordSegmentDuration?: string;
    },
  ): Promise<void> {
    if (isIvideonUrl(opts.source)) {
      // Ivideon → ffmpeg-manager
      const { server, camera } = parseIvideonUrl(opts.source);
      await request(`${config.ffmpegManager.apiUrl}/v3/config/paths/add/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify({ _ivideon: { server, camera } }),
      });
    } else {
      // HLS → mediaMTX
      const conf: Record<string, unknown> = {
        source: opts.source,
        sourceOnDemand: opts.sourceOnDemand ?? false,
        ...(opts.sourceFingerprint ? { sourceFingerprint: opts.sourceFingerprint } : {}),
        record: opts.record ?? true,
        recordFormat: 'mpegts',
        recordPath: `${config.mediaMTX.recordRoot}/%path/%Y-%m-%d_%H-%M-%S-%f`,
        recordPartDuration: '2s',
        recordSegmentDuration: opts.recordSegmentDuration ?? '10s',
      };
      await request(`${config.mediaMTX.apiUrl}/v3/config/paths/add/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify(conf),
      });
    }
  },

  /** Удалить путь (остановить поток). apiBase — явное указание сервиса (для путей-сирот, чей источник уже неизвестен). */
  async removePath(name: string, source?: string, apiBase?: string): Promise<void> {
    const base = apiBase ?? ((source && isIvideonUrl(source))
      ? config.ffmpegManager.apiUrl
      : config.mediaMTX.apiUrl);
    await request(`${base}/v3/config/paths/delete/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },

  /** Есть ли путь онлайн (поток поднят). */
  async isOnline(name: string, source?: string): Promise<boolean> {
    const apiBase = (source && isIvideonUrl(source))
      ? config.ffmpegManager.apiUrl
      : config.mediaMTX.apiUrl;
    try {
      const data = (await request(`${apiBase}/v3/paths/get/${encodeURIComponent(name)}`)) as { online?: boolean };
      return !!data.online;
    } catch {
      return false;
    }
  },
};
