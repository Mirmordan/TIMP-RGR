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

describe('rbacRepository.findRoleObjectGrants', () => {
  it('возвращает grants роли с метаданными объекта', async () => {
    poolQuery.mockResolvedValue({
      rows: [
        { id: 'g1', roleId: 'r1', objectId: 'o1', objectType: 'device', objectName: 'cam', objectDescription: null, action: 'read', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const result = await rbacRepository.findRoleObjectGrants('r1');
    expect(result).toHaveLength(1);
    const call = poolQuery.mock.calls[0]!;
    expect(String(call[0])).toContain('FROM role_object_grants g');
    expect(call[1]).toEqual(['r1']);
  });
});

describe('rbacRepository.replaceRoleObjectGrants', () => {
  it('заменяет набор в транзакции: DELETE + INSERT по списку', async () => {
    const queries: unknown[][] = [];
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push([sql, params]);
        return { rows: [], rowCount: 1 };
      }),
    };
    poolConnect.mockResolvedValue(client);

    await rbacRepository.replaceRoleObjectGrants('r1', [
      { objectId: 'o1', action: 'read' },
      { objectId: 'o2', action: 'write' },
    ]);

    expect(poolConnect).toHaveBeenCalledTimes(1);
    expect(queries[0]![0]).toBe('BEGIN');
    expect(String(queries[1]![0])).toContain('DELETE FROM role_object_grants');
    expect(queries[1]![1]).toEqual(['r1']);
    expect(queries[2]).toEqual([
      'INSERT INTO role_object_grants (role_id, object_id, action) VALUES ($1, $2, $3)',
      ['r1', 'o1', 'read'],
    ]);
    expect(queries[3]).toEqual([
      'INSERT INTO role_object_grants (role_id, object_id, action) VALUES ($1, $2, $3)',
      ['r1', 'o2', 'write'],
    ]);
    expect(queries[queries.length - 1]![0]).toBe('COMMIT');
  });
});

describe('rbacRepository.findUsersInRole', () => {
  it('возвращает пользователей роли с их ролями', async () => {
    poolQuery.mockResolvedValue({
      rows: [
        { id: 'u1', username: 'alice', email: 'a@t.ru', createdAt: '2026-01-01T00:00:00.000Z', passwordSet: true, roles: [{ id: 'r1', name: 'hr' }] },
      ],
    });
    const result = await rbacRepository.findUsersInRole('r1', 20, 0);
    expect(result).toHaveLength(1);
    const call = poolQuery.mock.calls[0]!;
    expect(String(call[0])).toContain('ur.role_id = $1');
    expect(call[1]).toEqual(['r1', 20, 0]);
  });
});

describe('rbacRepository.findAdminObjects', () => {
  it('ищет объекты по q/type и возвращает total', async () => {
    poolQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'o1', type: 'device', name: 'Камера 1', description: null, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await rbacRepository.findAdminObjects({ q: 'Камера', type: 'device', limit: 10, offset: 0 });
    expect(result.objects).toHaveLength(1);
    expect(result.total).toBe(1);
    const [dataCall, countCall] = poolQuery.mock.calls;
    expect(String(dataCall![0])).toContain('objects_display_name(o.id)');
    expect(String(countCall![0])).toContain('count(*)');
  });
});
