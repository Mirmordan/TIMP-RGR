import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../database/connection', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../database/connection';
import { rbacRepository } from './rbac.repository';

const poolConnect = pool.connect as unknown as Mock;

function makeClient(roleRows: Array<{ id: string; name: string }>) {
  const queries: unknown[][] = [];
  const client = {
    release: vi.fn(),
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push([sql, params]);
      if (String(sql).includes('INSERT INTO users')) return { rows: [{ id: 'u-new' }], rowCount: 1 };
      if (String(sql).includes('FROM roles WHERE name = ANY')) return { rows: roleRows, rowCount: roleRows.length };
      return { rows: [], rowCount: 1 };
    }),
  };
  return { client, queries };
}

beforeEach(() => {
  poolConnect.mockReset();
});

describe('rbacRepository.createUserWithRoles', () => {
  it('пустой список ролей → viewer', async () => {
    const { client, queries } = makeClient([{ id: 'rv', name: 'viewer' }]);
    poolConnect.mockResolvedValue(client);

    const id = await rbacRepository.createUserWithRoles({
      username: 'u',
      email: 'u@example.test',
      passwordHash: 'hash',
      roleNames: [],
    });

    expect(id).toBe('u-new');
    const select = queries.find((q) => String(q[0]).includes('FROM roles WHERE name = ANY'));
    expect(select![1]).toEqual([['viewer']]);
    expect(queries).toContainEqual([
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      ['u-new', 'rv'],
    ]);
    expect(queries[queries.length - 1]![0]).toBe('COMMIT');
  });

  it('назначает несколько ролей (с дедупликацией)', async () => {
    const { client, queries } = makeClient([
      { id: 'rv', name: 'viewer' },
      { id: 'ra', name: 'admin' },
    ]);
    poolConnect.mockResolvedValue(client);

    await rbacRepository.createUserWithRoles({
      username: 'u',
      email: 'u@example.test',
      passwordHash: 'hash',
      roleNames: ['viewer', 'admin', 'viewer'],
    });

    const select = queries.find((q) => String(q[0]).includes('FROM roles WHERE name = ANY'));
    expect(select![1]).toEqual([['viewer', 'admin']]);
    const inserts = queries.filter((q) => String(q[0]).startsWith('INSERT INTO user_roles'));
    expect(inserts).toHaveLength(2);
  });

  it('неизвестная роль → ROLLBACK без COMMIT', async () => {
    const { client, queries } = makeClient([{ id: 'rv', name: 'viewer' }]);
    poolConnect.mockResolvedValue(client);

    await expect(
      rbacRepository.createUserWithRoles({
        username: 'u',
        email: 'u@example.test',
        passwordHash: 'hash',
        roleNames: ['ghost'],
      }),
    ).rejects.toThrow('роль не найдена: ghost');

    expect(queries.some((q) => q[0] === 'COMMIT')).toBe(false);
    expect(queries[queries.length - 1]![0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
