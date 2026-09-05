import { pool } from '../database/connection';

/**
 * Аудит-лог RBAC-мутаций и security-событий (U1).
 * Таблица audit_log RLS не имеет: пишется/читается только кодом под
 * admin-capability через /admin. Все вставки — best-effort: при сбое
 * (например, таблица недоступна) пишем warn и НЕ роняем основную операцию.
 */

export const AUDIT_ACTIONS = [
  'user.create',
  'user.update',
  'user.delete',
  'user.password.reset',
  'user.roles.set',
  'role.create',
  'role.rename',
  'role.delete',
  'role.perms.set',
  'group.create',
  'group.rename',
  'group.delete',
  'group.members.set',
  'auth.login.failed',
  'auth.password.change',
  'recording.watchdog.stalled',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Кто совершает действие (req.user из access-токена). */
export interface AuditActor {
  id: string;
  username: string;
}

export interface AuditEvent {
  actorId?: string | null;
  actorName?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  details?: object;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
}

export interface AuditListQuery {
  limit?: number;
  offset?: number;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
}

export const auditService = {
  /** Вставить событие (best-effort, никогда не бросает наружу). */
  async logAudit(e: AuditEvent): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          e.actorId ?? null,
          e.actorName ?? null,
          e.action,
          e.targetType ?? null,
          e.targetId ?? null,
          e.details && Object.keys(e.details).length > 0 ? e.details : {},
        ],
      );
    } catch (err) {
      console.warn('[audit] logAudit failed:', err);
    }
  },

  /** Страница лога: created_at DESC, фильтры actor(partial)/action/from/to. */
  async findAudit(q: AuditListQuery): Promise<AuditEntry[]> {
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? 20) || 20, 1), 200);
    const offset = Math.max(Math.trunc(q.offset ?? 0) || 0, 0);

    const where: string[] = [];
    const params: unknown[] = [];
    const push = (v: unknown) => {
      params.push(v);
      return params.length;
    };

    if (q.actor) {
      where.push(`actor_name ILIKE $${push(`%${q.actor}%`)}`);
    }
    if (q.action) {
      where.push(`action = $${push(q.action)}`);
    }
    if (q.from) {
      where.push(`created_at >= $${push(q.from)}`);
    }
    if (q.to) {
      where.push(`created_at < $${push(q.to)}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query<AuditEntry>(
      `SELECT id,
              created_at AS "createdAt",
              actor_id AS "actorId",
              actor_name AS "actorName",
              action,
              target_type AS "targetType",
              target_id AS "targetId",
              details
       FROM audit_log
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${push(limit)} OFFSET $${push(offset)}`,
      params,
    );
    return rows;
  },

  /** Удалить записи старше before (created_at < $1). */
  async deleteAuditBefore(before: string): Promise<{ ok: true; deleted: number }> {
    const result = await pool.query('DELETE FROM audit_log WHERE created_at < $1', [before]);
    return { ok: true, deleted: result.rowCount ?? 0 };
  },
};
