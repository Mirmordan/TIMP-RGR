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
} from './acl';

const poolQuery = pool.query as unknown as Mock;

const IS_ADMIN_RE = /r\.name = 'admin'/;
const PERMS_RE = /FROM permissions p/;
const OBJ_GROUPS_RE = /object_id = \$1/;
const CAPABILITIES_RE = /role_capabilities/;
const OWNER_RE = /FROM objects WHERE id = \$1/;

interface SeedRows {
  adminExists?: boolean;
  perms?: Array<{ groupId: string; action: string }>;
  objGroups?: string[];
  capabilities?: string[];
  ownerId?: string | null;
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
    if (OWNER_RE.test(text)) {
      return Promise.resolve({
        rows: rows.ownerId === undefined || rows.ownerId === null ? [] : [{ ownerId: rows.ownerId }],
      });
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

  it('владелец читает свой объект, пока тот не в группах (bootstrap read)', async () => {
    seed({ perms: [], objGroups: [], ownerId: 'own-u' });
    await expect(can('own-u', 'obj-own1', 'read')).resolves.toBe(true);
  });

  it('владелец ТЕРЯЕТ read после включения объекта в группу без прав на неё', async () => {
    // объект уже в группе gX, у владельца прав на gX нет → owner-bootstrap не работает
    seed({ perms: [], objGroups: ['gX'], ownerId: 'own2-u' });
    await expect(can('own2-u', 'obj-own2', 'read')).resolves.toBe(false);
  });

  it('владелец читает объект в группе, если у роли есть read на эту группу', async () => {
    seed({ perms: [{ groupId: 'gX', action: 'read' }], objGroups: ['gX'], ownerId: 'own3-u' });
    await expect(can('own3-u', 'obj-own3', 'read')).resolves.toBe(true);
  });

  it('owner-bootstrap даёт только read: write/delete на свой объект без прав → false', async () => {
    seed({ perms: [], objGroups: [], ownerId: 'own4-u' });
    await expect(can('own4-u', 'obj-own4', 'write')).resolves.toBe(false);
    await expect(can('own4-u', 'obj-own4', 'delete')).resolves.toBe(false);
  });

  it('не-владелец без прав не читает объект без групп', async () => {
    seed({ perms: [], objGroups: [], ownerId: 'other-u' });
    await expect(can('usr-x', 'obj-own5', 'read')).resolves.toBe(false);
  });

  it('юзер без прав на не-read действие → false и БЕЗ запроса объектных групп', async () => {
    seed({ perms: [] });
    await expect(can('usr-c', 'obj-c', 'delete')).resolves.toBe(false);
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
