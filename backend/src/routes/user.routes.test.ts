import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Route-level регрессия: legacy /users/:id обязан наследовать owner/admin guards.
const mocks = vi.hoisted(() => ({
  hasCapability: vi.fn(),
  can: vi.fn(),
  invalidateUser: vi.fn(),
  invalidateGroup: vi.fn(),
  invalidateObject: vi.fn(),
  findUserWithRoles: vi.fn(),
  countAdminsExcluding: vi.fn(),
  deleteById: vi.fn(),
  logAudit: vi.fn(),
  getAll: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../security/acl', () => ({
  hasCapability: (...a: unknown[]) => mocks.hasCapability(...a),
  can: (...a: unknown[]) => mocks.can(...a),
  invalidateUser: (...a: unknown[]) => mocks.invalidateUser(...a),
  invalidateGroup: (...a: unknown[]) => mocks.invalidateGroup(...a),
  invalidateObject: (...a: unknown[]) => mocks.invalidateObject(...a),
}));

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    config: {
      ...actual.config,
      owner: { username: 'owner', password: '', email: '', passwordForce: false },
    },
  };
});

vi.mock('../repositories/rbac.repository', () => ({
  rbacRepository: {
    findUserWithRoles: (...a: unknown[]) => mocks.findUserWithRoles(...a),
    countAdminsExcluding: (...a: unknown[]) => mocks.countAdminsExcluding(...a),
  },
}));

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    deleteById: (...a: unknown[]) => mocks.deleteById(...a),
    findByUsername: vi.fn(),
    findByEmail: vi.fn(),
  },
}));

vi.mock('../services/user.service', () => ({
  userService: {
    getAll: (...a: unknown[]) => mocks.getAll(...a),
    getById: (...a: unknown[]) => mocks.getById(...a),
    create: (...a: unknown[]) => mocks.create(...a),
    put: (...a: unknown[]) => mocks.put(...a),
    patch: (...a: unknown[]) => mocks.patch(...a),
    deleteById: (...a: unknown[]) => mocks.deleteById(...a),
  },
}));

vi.mock('../services/audit.service', () => ({
  auditService: { logAudit: (...a: unknown[]) => mocks.logAudit(...a) },
}));

import app from '../app';
import { createAccessToken } from '../security/tokens';

const USER_UPDATE = 'user:update';
const USER_DELETE = 'user:delete';

const targetUser = (over: Record<string, unknown>) => ({
  id: 'u-target',
  username: 'target',
  email: 'target@example.test',
  createdAt: '2026-01-01T00:00:00.000Z',
  passwordSet: true,
  roles: [{ id: 'rv', name: 'viewer' }],
  ...over,
});

describe('user.routes legacy guards (owner/admin)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}/api/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasCapability.mockImplementation(async (_userId: string, cap: string) => {
      return [USER_UPDATE, USER_DELETE].includes(cap);
    });
  });

  async function api(
    method: 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    actor: { id: string; username: string },
    body?: unknown,
  ) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${createAccessToken(actor.id, actor.username, 'viewer')}`,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, init);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  const NON_OWNER_ADMIN = { id: 'u-admin', username: 'admin1' };
  const OWNER = { id: 'u-owner', username: 'owner' };

  it('PATCH legacy: owner password не-owner админом → 403, userService.patch не вызван', async () => {
    mocks.findUserWithRoles.mockResolvedValue(
      targetUser({ id: 'owner-id', username: 'owner', roles: [{ id: 'ra', name: 'admin' }] }),
    );

    const r = await api('PATCH', '/users/owner-id', NON_OWNER_ADMIN, { password: 'newpassword123' });

    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe('владелец защищён');
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('PUT legacy: owner target не-owner админом → 403, userService.put не вызван', async () => {
    mocks.findUserWithRoles.mockResolvedValue(
      targetUser({ id: 'owner-id', username: 'owner', roles: [{ id: 'ra', name: 'admin' }] }),
    );

    const r = await api('PUT', '/users/owner-id', NON_OWNER_ADMIN, {
      username: 'owner',
      email: 'owner@example.test',
      password: 'newpassword123',
    });

    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe('владелец защищён');
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('PUT legacy: admin target не-owner админом → 403, userService.put не вызван', async () => {
    mocks.findUserWithRoles.mockResolvedValue(
      targetUser({ id: 'adm-id', username: 'admin2', roles: [{ id: 'ra', name: 'admin' }] }),
    );

    const r = await api('PUT', '/users/adm-id', NON_OWNER_ADMIN, {
      username: 'admin2',
      email: 'admin2@example.test',
      password: 'newpassword123',
    });

    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe('изменять администраторов может только владелец');
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('DELETE legacy: owner target не-owner админом → 403, delete не вызван', async () => {
    mocks.findUserWithRoles.mockResolvedValue(
      targetUser({ id: 'owner-id', username: 'owner', roles: [{ id: 'ra', name: 'admin' }] }),
    );

    const r = await api('DELETE', '/users/owner-id', NON_OWNER_ADMIN);

    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe('владелец защищён');
    expect(mocks.deleteById).not.toHaveBeenCalled();
  });

  it('DELETE legacy: admin target не-owner админом → 403, delete не вызван', async () => {
    mocks.findUserWithRoles.mockResolvedValue(
      targetUser({ id: 'adm-id', username: 'admin2', roles: [{ id: 'ra', name: 'admin' }] }),
    );

    const r = await api('DELETE', '/users/adm-id', NON_OWNER_ADMIN);

    expect(r.status).toBe(403);
    expect(mocks.deleteById).not.toHaveBeenCalled();
  });

  it('DELETE legacy: последний admin владельцем → 400', async () => {
    mocks.findUserWithRoles.mockResolvedValue(
      targetUser({ id: 'adm-id', username: 'admin2', roles: [{ id: 'ra', name: 'admin' }] }),
    );
    mocks.countAdminsExcluding.mockResolvedValue(0);

    const r = await api('DELETE', '/users/adm-id', OWNER);

    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe('нельзя удалить последнего администратора');
    expect(mocks.deleteById).not.toHaveBeenCalled();
  });

  it('PATCH legacy: обычного viewer не-owner админом → 200', async () => {
    mocks.findUserWithRoles.mockResolvedValue(targetUser({ id: 'viewer-id', username: 'viewer' }));
    mocks.patch.mockResolvedValue({
      id: 'viewer-id',
      username: 'viewer',
      email: 'v@example.test',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const r = await api('PATCH', '/users/viewer-id', NON_OWNER_ADMIN, { email: 'v@example.test' });

    expect(r.status).toBe(200);
    expect(mocks.patch).toHaveBeenCalledWith('viewer-id', { email: 'v@example.test' });
  });

  it('PATCH legacy: не-owner админ меняет свой пароль (self) → 200', async () => {
    mocks.findUserWithRoles.mockResolvedValue(
      targetUser({ id: 'u-admin', username: 'admin1', roles: [{ id: 'ra', name: 'admin' }] }),
    );
    mocks.patch.mockResolvedValue({
      id: 'u-admin',
      username: 'admin1',
      email: 'admin1@example.test',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const r = await api('PATCH', '/users/u-admin', NON_OWNER_ADMIN, { password: 'newpassword123' });

    expect(r.status).toBe(200);
    expect(mocks.patch).toHaveBeenCalledWith('u-admin', { password: 'newpassword123' });
  });
});
