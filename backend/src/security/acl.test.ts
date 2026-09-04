import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../database/connection', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../database/connection';
import {
  can,
  hasCapability,
  roleHasCapability,
  invalidateUser,
  invalidateObject,
} from './acl';

const poolQuery = pool.query as unknown as Mock;

const IS_ADMIN_RE = /r\.name = 'admin'/;
const PERMS_RE = /FROM permissions p/;
const OBJ_GROUPS_RE = /object_id = \$1/;
const ROLES_RE = /AS "role"/;

interface SeedRows {
  adminExists?: boolean;
  perms?: Array<{ groupId: string; action: string }>;
  objGroups?: string[];
  roles?: string[];
}

/** Настроить pool.query: отдаём строки в зависимости от текста SQL. */
function seed(rows: SeedRows = {}): void {
  poolQuery.mockImplementation((sql: unknown) => {
    const text = String(sql);
    if (IS_ADMIN_RE.test(text)) {
      return Promise.resolve({ rows: [{ exists: rows.adminExists ?? false }] });
    }
    if (PERMS_RE.test(text)) {
      return Promise.resolve({ rows: (rows.perms ?? []).map((r) => ({ groupId: r.groupId, action: r.action })) });
    }
    if (OBJ_GROUPS_RE.test(text)) {
      return Promise.resolve({ rows: (rows.objGroups ?? []).map((g) => ({ groupId: g })) });
    }
    if (ROLES_RE.test(text)) {
      return Promise.resolve({ rows: (rows.roles ?? []).map((r) => ({ role: r })) });
    }
    return Promise.resolve({ rows: [] });
  });
}

function queryCount(): number {
  return poolQuery.mock.calls.length;
}

beforeEach(() => {
  poolQuery.mockReset();
});

describe('acl.can', () => {
  it('admin: can(...) === true без прочих запросов', async () => {
    seed({ adminExists: true });
    await expect(can('adm-u', 'any-obj', 'delete')).resolves.toBe(true);
    expect(queryCount()).toBe(1); // только isAdmin
  });

  it('юзер с read на группу объекта → true', async () => {
    seed({ perms: [{ groupId: 'gA', action: 'read' }], objGroups: ['gA'] });
    await expect(can('usr-a', 'obj-a', 'read')).resolves.toBe(true);
  });

  it('объект в чужой группе → false', async () => {
    seed({ perms: [{ groupId: 'gA', action: 'read' }], objGroups: ['gB'] });
    await expect(can('usr-b', 'obj-b', 'read')).resolves.toBe(false);
  });

  it('юзер без прав → false и БЕЗ запроса объектных групп', async () => {
    seed({ perms: [] });
    await expect(can('usr-c', 'obj-c', 'read')).resolves.toBe(false);
    expect(queryCount()).toBe(2); // isAdmin + getUserGroupPermissions
  });

  it('invalidateUser/invalidateObject: повторный can снова идёт в БД', async () => {
    seed({ perms: [{ groupId: 'gOther', action: 'read' }], objGroups: ['invG'] });
    await can('inv-u', 'inv-o', 'read');
    expect(queryCount()).toBe(3);

    invalidateUser('inv-u');
    invalidateObject('inv-o');
    await can('inv-u', 'inv-o', 'read');
    expect(queryCount()).toBe(6);
  });
});

describe('acl.hasCapability', () => {
  it('admin → true через isAdmin-запрос без чтения ролей', async () => {
    seed({ adminExists: true });
    await expect(hasCapability('cap-adm', 'admin:write')).resolves.toBe(true);
    expect(queryCount()).toBe(1);
  });

  it('не-админ: capability ищется по ролям (viewer не имеет → false)', async () => {
    seed({ roles: ['viewer'] });
    await expect(hasCapability('cap-v', 'role:assign')).resolves.toBe(false);
  });

  it('не-админ c ролью admin в getUserRoles → true по ROLE_CAPABILITIES', async () => {
    seed({ roles: ['admin'] });
    await expect(hasCapability('cap-o', 'user:delete')).resolves.toBe(true);
  });
});

describe('roleHasCapability', () => {
  it('берёт набор из ROLE_CAPABILITIES по роли', () => {
    expect(roleHasCapability('admin', 'role:assign')).toBe(true);
    expect(roleHasCapability('viewer', 'role:assign')).toBe(false);
    expect(roleHasCapability('operator', 'user:read')).toBe(false);
  });
});
