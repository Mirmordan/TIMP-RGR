import { AsyncLocalStorage } from 'node:async_hooks';
import { pool } from '../database/connection';

/**
 * Контекст запроса. Выставляется middleware `authenticate` через run().
 * Позволяет репозиториям знать текущего юзера БЕЗ проброса userId
 * через сигнатуры сервисов/репозиториев.
 */
interface RequestContext {
  userId: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Обернуть обработчик запроса в контекст юзера (используется в authenticate).
 */
export function runWithUser(userId: string | null, fn: () => unknown): unknown {
  return requestContext.run({ userId }, fn);
}

export function currentUserId(): string | null {
  return requestContext.getStore()?.userId ?? null;
}

/**
 * Мост между аутентифицированным юзером и RLS в БД.
 *
 * RLS-функции (has_permission, is_admin) читают текущего юзера из
 * `SET LOCAL app.user_id`. Без установки этой переменной RLS для админа
 * вернёт FALSE (все строки скроются).
 *
 * `SET LOCAL` действует только в рамках одной транзакции/соединения, поэтому
 * каждый query (или транзакция) должен начинаться с установки app.user_id.
 */

async function setUser(client: { query: (text: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
  await client.query('SELECT set_config($1, $2, true)', ['app.user_id', currentUserId()]);
}

/**
 * Выполнить одиночный запрос под контекстом юзера (из AsyncLocalStorage).
 */
export async function queryAs<T = any>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setUser(client);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Выполнить функцию (серию запросов в одной транзакции) под контекстом юзера.
 */
export async function inUserContext<T>(
  fn: (client: {
    query: <R = any>(text: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount: number | null }>;
  }) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setUser(client);
    const wrapper = {
      query: async <R = any>(text: string, params: unknown[] = []) => {
        const result = await client.query<{ [k: string]: any }>(text, params);
        return { rows: (result.rows as unknown as R[]), rowCount: result.rowCount };
      },
    };
    const result = await fn(wrapper);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
