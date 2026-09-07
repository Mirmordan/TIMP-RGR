import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../database/connection', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../database/connection';
import {
  can,
  hasCapability,
  invalidateUser,
  invalidateObject,
  clearAclCaches,
} from './acl';

const poolQuery = pool.query as unknown as Mock;

const OBJECT_CAN_RE = /object_can\(/;
const CAPABILITIES_RE = /role_capabilities/;
const IS_ADMIN_RE = /r\.name = 'admin'/;

interface SeedRows {
  adminExists?: boolean;
  capabilities?: string[];
}

function seed(rows: SeedRows = {}): void {
  poolQuery.mockImplementation((sql: unknown) => {
    const text = String(sql);
    if (OBJECT_CAN_RE.test(text)) {
      return Promise.resolve({ rows: [{ allowed: false }] });
    }
    if (IS_ADMIN_RE.test(text)) {
      return Promise.resolve({ rows: [{ exists: rows.adminExists ?? false }] });
    }
    if (CAPABILITIES_RE.test(text)) {
      return Promise.resolve({
        rows: (rows.capabilities ?? []).map((capability) => ({ capability })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

function queryCount(): number {
  return poolQuery.mock.calls.length;
}

beforeEach(() => {
  poolQuery.mockReset();
  clearAclCaches();
});

describe('acl.can', () => {
  it('делегает полное решение (admin, group, direct grants, parent inheritance, owner) в object_can', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ allowed: true }] })
      .mockResolvedValueOnce({ rows: [{ allowed: false }] });
    await expect(can('usr-a', 'obj-a', 'read')).resolves.toBe(true);
    await expect(can('usr-a', 'obj-a', 'write')).resolves.toBe(false);
    expect(poolQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT object_can($1::uuid, $2::text, $3::uuid) AS "allowed"',
      ['obj-a', 'read', 'usr-a'],
    );
  });
});

describe('acl.hasCapability', () => {
  it('admin → true через isAdmin-запрос без чтения role_capabilities', async () => {
    seed({ adminExists: true });
    await expect(hasCapability('cap-adm', 'admin:write')).resolves.toBe(true);
    expect(queryCount()).toBe(1);
  });

  it('не-админ: capability берётся из union role_capabilities по ролям юзера', async () => {
    seed({ capabilities: ['user:read', 'user:create'] });
    await expect(hasCapability('cap-hr', 'user:read')).resolves.toBe(true);
    await expect(hasCapability('cap-hr', 'admin:write')).resolves.toBe(false);
  });

  it('юзер без спец-прав (role_capabilities пусто) → false', async () => {
    seed({ capabilities: [] });
    await expect(hasCapability('cap-v', 'user:read')).resolves.toBe(false);
  });

  it('invalidateUser сбрасывает кеш спец-прав → повторный запрос идёт в БД', async () => {
    seed({ capabilities: ['user:delete'] });
    await hasCapability('cap-o', 'user:delete');
    const afterFirst = queryCount();

    invalidateUser('cap-o');
    await hasCapability('cap-o', 'user:delete');
    expect(queryCount()).toBe(afterFirst + 2); // isAdmin + снова union
  });
});
