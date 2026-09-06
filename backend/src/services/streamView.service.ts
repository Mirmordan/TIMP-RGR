import { streamRepository } from '../repositories/stream.repository';
import { processRepository } from '../repositories/process.repository';
import { mediaManager } from '../media/mediaManager';

/**
 * View-сессии: просмотр live-потока БЕЗ записи («что сейчас на камере»).
 *
 * Единый фронт-URL (POST /streams/:id/view) решает бэкенд:
 *  - идёт живая запись (running-процесс + путь онлайн) → отдаём HLS живого
 *    process-пути, ничего не создаём;
 *  - иначе поднимаем выделенный view-путь view_<streamId> без записи
 *    (ffmpeg-manager для ivideon:// с conf._view, mediaMTX record:false для HLS/rtsp).
 *
 * View-путь живёт пока фронт шлёт heartbeat (каждый POST продлевает TTL=90с).
 * Истечение TTL или явный DELETE → путь останавливается (removePath).
 * Карта таймеров живёт на уровне модуля: рестарт бэкенда теряет её, поэтому
 * любые осиротевшие view_* пути вычищаются стартовой реконсиляцией (recovery.service).
 */

/** Время жизни view-сессии без heartbeat (сек). */
export const VIEW_TTL_S = 90;
const VIEW_TTL_MS = VIEW_TTL_S * 1000;

/** Задержка перед фактическим removePath при stopView (grace для StrictMode double-mount). */
export const PENDING_CLOSE_MS = 10000;

export type StreamViewResult = {
  hlsUrl: string;
  source: 'process' | 'view';
  ttlS: number;
};

interface Session {
  timer: ReturnType<typeof setTimeout>;
  streamUrl: string;
  /** Не-null когда stopView запланировал удаление; openView отменяет этот таймер. */
  closeTimer?: ReturnType<typeof setTimeout>;
}

/** view_<streamId> — имя пути в медиа-сервисе (uuid полностью, безопасно). */
export function viewName(streamId: string): string {
  return `view_${streamId}`;
}

const sessions = new Map<string, Session>();

function viewPathOnline(processId: string, streamUrl: string): Promise<boolean> {
  return mediaManager.isOnline(`process_${processId}`, streamUrl);
}

/** HLS-URL по имени пути медиа-сервиса и типу источника. */
function hlsUrlFor(pathName: string, streamUrl: string): string {
  return isIvideon(streamUrl)
    ? `/hls/${pathName}/index.m3u8`
    : `/live/${pathName}/index.m3u8`;
}

function isIvideon(source: string): boolean {
  return source.startsWith('ivideon://');
}

/** Остановить путь (идемпотентно: 404/недоступность сервиса — не ошибка). */
async function removeViewPath(name: string, streamUrl: string): Promise<void> {
  try {
    await mediaManager.removePath(name, streamUrl);
  } catch {
    /* путь мог быть уже удалён — view-session стоп идемпотентен */
  }
}

function clearSession(name: string): void {
  const session = sessions.get(name);
  if (!session) return;
  clearTimeout(session.timer);
  if (session.closeTimer) clearTimeout(session.closeTimer);
  sessions.delete(name);
}

async function expireSession(name: string, timer: ReturnType<typeof setTimeout>): Promise<void> {
  const session = sessions.get(name);
  // Устаревший таймер (после refresh от нового POST) — не гасим свежую сессию.
  if (!session || session.timer !== timer) return;
  if (session.closeTimer) clearTimeout(session.closeTimer);
  clearTimeout(session.timer);
  sessions.delete(name);
  await removeViewPath(name, session.streamUrl);
}

/** Таймер отложенного удаления (stopView). Если TTL истекает раньше — expireSession возьмёт верх. */
async function closeSession(name: string, closeTimer: ReturnType<typeof setTimeout>): Promise<void> {
  const session = sessions.get(name);
  if (!session || session.closeTimer !== closeTimer) return;
  clearTimeout(session.timer);
  sessions.delete(name);
  await removeViewPath(name, session.streamUrl);
}

/** Поднять view-путь (если ещё нет) и продлить TTL-сессию. Отменяет pending close. */
async function ensureViewPath(streamId: string, streamUrl: string, sourceFingerprint?: string): Promise<void> {
  const name = viewName(streamId);
  if (!sessions.has(name)) {
    const opts: { source: string; view: true; sourceFingerprint?: string } = { source: streamUrl, view: true };
    if (sourceFingerprint) opts.sourceFingerprint = sourceFingerprint;
    try {
      await mediaManager.createPath(name, opts);
    } catch (e: any) {
      // path уже существует (дубль/гонка) — для view это ок: путь уже живой.
      if (!/already exists/i.test(e?.message ?? '')) throw e;
    }
  }
  const prev = sessions.get(name);
  if (prev) {
    clearTimeout(prev.timer);
    // Отменяем запланированное удаление (stopView).
    if (prev.closeTimer) {
      clearTimeout(prev.closeTimer);
      delete prev.closeTimer;
    }
  }
  const timer = setTimeout(() => { void expireSession(name, timer); }, VIEW_TTL_MS);
  sessions.set(name, { timer, streamUrl });
}

/** Остановить живую view-сессию потока (переход на process-путь записи или немедленный стоп). */
async function stopSession(streamId: string): Promise<void> {
  const name = viewName(streamId);
  const session = sessions.get(name);
  if (!session) return; // записи живут на process-пути — view-сессии нет
  clearTimeout(session.timer);
  if (session.closeTimer) clearTimeout(session.closeTimer);
  sessions.delete(name);
  await removeViewPath(name, session.streamUrl);
}

export const streamViewService = {
  /**
   * Открыть/продлить view-сессию потока. Возвращает HLS-URL для просмотра
   * «что сейчас на камере»: process-путь живой записи (если запись идёт) или
   * выделенный view-путь без записи. null — поток не найден/нет доступа.
   */
  async openView(streamId: string): Promise<StreamViewResult | null> {
    const stream = await streamRepository.findById(streamId);
    if (!stream) return null;

    // (a) живая запись онлайн — смотрим её process-путь, view-путь не нужен.
    const running = await processRepository.findRunningByStreamId(streamId);
    if (running) {
      if (await viewPathOnline(running.id, stream.url)) {
        // Запись пошла поверх view-сессии: stale view-путь глушим, дальше — process.
        await stopSession(streamId);
        return {
          hlsUrl: hlsUrlFor(`process_${running.id}`, stream.url),
          source: 'process',
          ttlS: VIEW_TTL_S,
        };
      }
    }

    // (b) записи нет — выделенный view-путь без записи.
    await ensureViewPath(streamId, stream.url, stream.sourceFingerprint);
    return {
      hlsUrl: hlsUrlFor(viewName(streamId), stream.url),
      source: 'view',
      ttlS: VIEW_TTL_S,
    };
  },

  /**
   * Остановить view-сессию потока с отложенным removePath (PENDING_CLOSE_MS).
   * Повторный POST /view отменяет отложенное удаление (через ensureViewPath).
   * Идемпотентен: если сессии нет — 204 без removePath.
   */
  async stopView(streamId: string): Promise<void> {
    const name = viewName(streamId);
    const session = sessions.get(name);
    if (!session) return;
    // Уже запланировано закрытие — повторный DELETE идемпотентен.
    if (session.closeTimer) return;
    const closeTimer = setTimeout(() => { void closeSession(name, closeTimer); }, PENDING_CLOSE_MS);
    session.closeTimer = closeTimer;
  },

  /** Кол-во живых view-сессий (для тестов/диагностики). */
  activeSessions(): number {
    return sessions.size;
  },

  /** Сброс Map (только для тестов). */
  _resetSessions(): void {
    for (const [, s] of sessions) {
      clearTimeout(s.timer);
      if (s.closeTimer) clearTimeout(s.closeTimer);
    }
    sessions.clear();
  },
};
