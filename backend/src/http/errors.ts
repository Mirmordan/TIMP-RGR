import type { Response } from 'express';

/**
 * Системные/программные ошибки, текст которых нельзя показывать клиенту:
 * errno-коды uv, spawn, сетевой стек, pg-тексты, TypeError'подобные фразы.
 * Бизнес-валидации пишутся по-русски и под эти паттерны не попадают.
 */
const SYSTEM_RE = new RegExp(
  [
    // libuv / OS errno
    'ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'EISDIR', 'EXDEV', 'EMFILE', 'ENFILE',
    'ENOSPC', 'EPIPE', 'EBADF', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED',
    'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRINUSE', 'EADDRNOTAVAIL',
    'EAGAIN', 'EAI_[A-Z]+', 'EFTYPE', 'EINVAL(?=.*file)',
    // spawn/child_process
    'spawn\\s', 'spawnSync\\s', 'child process', 'exited with code',
    // сеть/базы
    'connect ETIMEDOUT', 'getaddrinfo', 'self signed certificate',
    'certificate (has expired|is not yet valid)', 'ssl',
    // postgres
    'does not exist', 'violates', 'constraint', 'syntax error at or near',
    'invalid input syntax', 'division by zero', 'null value in column',
    'permission denied for', 'relation "', 'column "', 'function .*\\(\\) does not',
    'database "\\w+" does not', 'postgre',
    // JS runtime
    'Cannot read propert', 'is not a function', 'is not defined', 'is not iterable',
    'Unexpected token', 'Unexpected end of JSON', 'Cannot convert',
    'Maximum call stack', 'heap', 'out of memory', 'ARRAY_BUFFER',
  ].join('|'),
  'i',
);

export function isSystemError(message: string): boolean {
  return SYSTEM_RE.test(message);
}

const GENERIC_MESSAGE = 'внутренняя ошибка сервера';

/**
 * Единственно правильный ответ на исключение в обработчике маршрута.
 * — Бизнес-ошибки (статус < 500, человекочитаемое сообщение) отдаются клиенту как есть.
 * — Системные (статус >= 500 или текст похож на внутреннюю) — полная версия уходит
 *   только в серверный лог, клиенту — generic 500.
 * — Если заголовки уже отправлены (стриминг видео и т.п.), менять статус нельзя:
 *   соединение просто обрывается.
 */
export function replyError(res: Response, e: unknown, ctx: string, fallbackStatus = 400): void {
  const err = e as { status?: unknown; message?: unknown };
  const raw = String((err && (err.message as unknown)) ?? e ?? 'unknown error');
  const statusNum = Number.isInteger((err as { status?: unknown }).status)
    ? (err as { status: number }).status
    : fallbackStatus;

  console.error(`[api:${ctx}] ${raw}`);

  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* соединение уже мертво */
    }
    return;
  }

  if (statusNum >= 500 || isSystemError(raw)) {
    res.status(500).json({ error: GENERIC_MESSAGE });
  } else {
    res.status(statusNum).json({ error: raw });
  }
}

/** Экспресс-4-аргументный fallback: ловит throw'ы, до которых не дожил локальный catch. */
export function globalErrorHandler(
  err: unknown,
  _req: unknown,
  res: Response,
  _next: unknown,
): void {
  if (res.headersSent) return;
  const e = err as { status?: unknown; message?: unknown; stack?: unknown };
  console.error('[api:unhandled]', e?.message ?? err, e?.stack ?? '');
  const status = Number.isInteger(e?.status) ? (e?.status as number) : 500;
  if (status >= 500 || isSystemError(String(e?.message ?? ''))) {
    res.status(500).json({ error: GENERIC_MESSAGE });
  } else {
    res.status(status).json({ error: String(e?.message ?? 'unknown error') });
  }
}
