import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../database/connection', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../database/connection';
import { rbacRepository } from './rbac.repository';

const poolQuery = pool.query as unknown as Mock;
const poolConnect = pool.connect as unknown as Mock;

beforeEach(() => {
  poolQuery.mockReset();
  poolConnect.mockReset();
});

describe('rbacRepository.findRoleCapabilities', () => {
  it('возвращает коды спец-прав роли', async () => {
    poolQuery.mockResolvedValue({
      rows: [{ capability: 'admin:read' }, { capability: 'admin:write' }],
    });
    const result = await rbacRepository.findRoleCapabilities('role-1');
    expect(result).toEqual(['admin:read', 'admin:write']);
    const call = poolQuery.mock.calls[0]!;
    expect(String(call[0])).toContain('FROM role_capabilities');
    expect(call[1]).toEqual(['role-1']);
  });
});

describe('rbacRepository.findCapabilitiesByUser', () => {
  it('возвращает union спец-прав пользователя (DISTINCT по ролям)', async () => {
    poolQuery.mockResolvedValue({
      rows: [{ capability: 'user:read' }, { capability: 'user:create' }],
    });
    const result = await rbacRepository.findCapabilitiesByUser('user-1');
    expect(result).toEqual(['user:read', 'user:create']);
    const call = poolQuery.mock.calls[0]!;
    const sql = String(call[0]);
    expect(sql).toContain('role_capabilities');
    expect(sql).toContain('JOIN user_roles');
    expect(call[1]).toEqual(['user-1']);
  });

  it('пользователь без ролей → пустой массив', async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    await expect(rbacRepository.findCapabilitiesByUser('user-x')).resolves.toEqual([]);
  });
});

describe('rbacRepository.findUsersByRole', () => {
  it('возвращает holder-ов роли', async () => {
    poolQuery.mockResolvedValue({ rows: [{ userId: 'u1' }, { userId: 'u2' }] });
    await expect(rbacRepository.findUsersByRole('role-1')).resolves.toEqual(['u1', 'u2']);
  });
});

describe('rbacRepository.replaceRoleCapabilities', () => {
  it('заменяет набор в транзакции: DELETE всех строк роли + INSERT по списку', async () => {
    const queries: unknown[][] = [];
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push([sql, params]);
        return { rows: [], rowCount: 1 };
      }),
    };
    poolConnect.mockResolvedValue(client);

    await rbacRepository.replaceRoleCapabilities('role-1', ['user:read', 'user:delete']);

    expect(poolConnect).toHaveBeenCalledTimes(1);
    expect(queries[0]![0]).toBe('BEGIN');
    expect(String(queries[1]![0])).toContain('DELETE FROM role_capabilities');
    expect(queries[1]![1]).toEqual(['role-1']);
    expect(queries[2]).toEqual(['INSERT INTO role_capabilities (role_id, capability) VALUES ($1, $2)', ['role-1', 'user:read']]);
    expect(queries[3]).toEqual(['INSERT INTO role_capabilities (role_id, capability) VALUES ($1, $2)', ['role-1', 'user:delete']]);
    expect(queries[queries.length - 1]![0]).toBe('COMMIT');
  });
});
