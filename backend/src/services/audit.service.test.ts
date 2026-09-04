import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('../database/connection', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../database/connection';
import { auditService, AUDIT_ACTIONS } from './audit.service';

const poolQuery = pool.query as unknown as Mock;

beforeEach(() => {
  poolQuery.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AUDIT_ACTIONS', () => {
  it('константы покрывают все события U1', () => {
    expect(AUDIT_ACTIONS).toContain('user.roles.set');
    expect(AUDIT_ACTIONS).toContain('role.create');
    expect(AUDIT_ACTIONS).toContain('group.members.set');
    expect(AUDIT_ACTIONS).toContain('auth.login.failed');
    expect(AUDIT_ACTIONS).toContain('auth.password.change');
  });
});

describe('auditService.logAudit', () => {
  it('вставляет запись через pool.query с нужным SQL и параметрами', async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await auditService.logAudit({
      actorId: 'user-1',
      actorName: 'alice',
      action: 'user.roles.set',
      targetType: 'user',
      targetId: 'target-1',
      details: { roleNames: ['operator'] },
    });

    expect(poolQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO audit_log/);
    expect(params).toEqual([
      'user-1',
      'alice',
      'user.roles.set',
      'user',
      'target-1',
      { roleNames: ['operator'] },
    ]);
  });

  it('проставляет NULL для пустого actor и {} для пустых details', async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await auditService.logAudit({ action: 'auth.login.failed', details: {} });

    const [, params] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
    expect(params[1]).toBeNull();
    expect(params[5]).toEqual({});
  });

  it('не бросает наружу при ошибке вставки (best-effort)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    poolQuery.mockRejectedValue(new Error('insert failed'));

    await expect(
      auditService.logAudit({
        action: 'role.create',
        targetType: 'role',
        targetId: 'role-1',
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });
});
