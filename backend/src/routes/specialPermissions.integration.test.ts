import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Хуки для vi.mock фабрик (hoisted выше import'ов).
const mocks = vi.hoisted(() => ({
  hasCapability: vi.fn(),
  can: vi.fn(),
  invalidateUser: vi.fn(),
  invalidateGroup: vi.fn(),
  invalidateObject: vi.fn(),
  findRoles: vi.fn(),
  findRoleById: vi.fn(),
  findRoleCapabilities: vi.fn(),
  findCapabilitiesByUser: vi.fn(),
  findUsersByRole: vi.fn(),
  replaceRoleCapabilities: vi.fn(),
  logAudit: vi.fn(),
  userGetAll: vi.fn(),
  deviceCreate: vi.fn(),
}));

vi.mock('../security/acl', () => ({
  hasCapability: (...a: unknown[]) => mocks.hasCapability(...a),
  can: (...a: unknown[]) => mocks.can(...a),
  invalidateUser: (...a: unknown[]) => mocks.invalidateUser(...a),
  invalidateGroup: (...a: unknown[]) => mocks.invalidateGroup(...a),
  invalidateObject: (...a: unknown[]) => mocks.invalidateObject(...a),
}));

vi.mock('../repositories/rbac.repository', () => ({
  rbacRepository: {
    findRoles: (...a: unknown[]) => mocks.findRoles(...a),
    findRoleById: (...a: unknown[]) => mocks.findRoleById(...a),
    findRoleCapabilities: (...a: unknown[]) => mocks.findRoleCapabilities(...a),
    findCapabilitiesByUser: (...a: unknown[]) => mocks.findCapabilitiesByUser(...a),
    findUsersByRole: (...a: unknown[]) => mocks.findUsersByRole(...a),
    replaceRoleCapabilities: (...a: unknown[]) => mocks.replaceRoleCapabilities(...a),
  },
}));

vi.mock('../services/audit.service', () => ({
  auditService: { logAudit: (...a: unknown[]) => mocks.logAudit(...a) },
}));

vi.mock('../services/user.service', () => ({
  userService: { getAll: (...a: unknown[]) => mocks.userGetAll(...a) },
}));

vi.mock('../services/device.service', () => ({
  deviceService: { create: (...a: unknown[]) => mocks.deviceCreate(...a) },
}));

import app from '../app';
import { createAccessToken } from '../security/tokens';

// Порядок совпадает с CAPABILITY_CATALOG в security/capabilities.ts.
const ALL_CODES = [
  'admin:read',
  'admin:write',
  'user:create',
  'user:read',
  'user:update',
  'user:delete',
  'user:password:reset',
  'role:read',
  'role:create',
  'role:update',
  'role:delete',
  'group:read',
  'group:create',
  'group:update',
  'group:delete',
  'permission:read',
  'permission:manage',
  'audit:read',
  'audit:delete',
  'camera:create',
  'stream:create',
  'process:create',
  'chunk:create',
  'media:export',
];

// userId -> выданные спец-права (эмуляция union role_capabilities).
const grants = new Map<string, Set<string>>();

function grantAll(userId: string): void {
  grants.set(userId, new Set(ALL_CODES));
}

function grant(userId: string, codes: string[]): void {
  grants.set(userId, new Set(codes));
}

describe('specialPermissions.integration (route-level, роли и спец-права)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}/api/v1`;
    mocks.hasCapability.mockImplementation(async (userId: string, cap: string) => {
      return grants.get(userId)?.has(cap) ?? false;
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    grants.clear();
    mocks.hasCapability.mockClear();
    mocks.hasCapability.mockImplementation(async (userId: string, cap: string) => {
      return grants.get(userId)?.has(cap) ?? false;
    });
    mocks.userGetAll.mockResolvedValue([]);
    mocks.deviceCreate.mockResolvedValue({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'cam',
      type: 'camera',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  async function api(method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE', path: string, userId: string, body?: unknown) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${createAccessToken(userId, `user_${userId}`, 'viewer')}`,
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

  describe('admin full (роль admin в сиде role_capabilities → все коды)', () => {
    it('GET /admin/capabilities → 200 и каталог из 24 спец-прав', async () => {
      grantAll('u-admin');
      const r = await api('GET', '/admin/capabilities', 'u-admin');
      expect(r.status).toBe(200);
      expect((r.body as Array<{ code: string }>).map((c) => c.code)).toEqual(ALL_CODES);
    });

    it('GET /users → 200 (user:read доступен полному админу)', async () => {
      grantAll('u-admin');
      const r = await api('GET', '/users', 'u-admin');
      expect(r.status).toBe(200);
      expect(mocks.userGetAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('кастомная роль без спец-прав', () => {
    it('GET /users → 403, POST /devices → 403, GET /stats/disk → 403, GET /admin/capabilities → 403', async () => {
      const uid = 'u-custom-none';
      // не делаем grant — роли не выданы спец-права
      expect((await api('GET', '/users', uid)).status).toBe(403);
      expect((await api('POST', '/devices', uid, { name: 'x', type: 'camera' })).status).toBe(403);
      expect((await api('GET', '/stats/disk', uid)).status).toBe(403);
      expect((await api('GET', '/admin/capabilities', uid)).status).toBe(403);
      expect(mocks.userGetAll).not.toHaveBeenCalled();
    });
  });

  describe('кастомная роль «device-manager» c единственным camera:create', () => {
    it('POST /devices → 201, но никакие чтения /users, /roles, /groups, /admin и /stats/disk недоступны', async () => {
      const uid = 'u-dm';
      grant(uid, ['camera:create']);
      const created = await api('POST', '/devices', uid, { name: 'cam-1', type: 'camera' });
      expect(created.status).toBe(201);
      expect(mocks.deviceCreate).toHaveBeenCalledWith('cam-1', 'camera');

      expect((await api('GET', '/users', uid)).status).toBe(403);
      expect((await api('GET', '/admin/roles', uid)).status).toBe(403);
      expect((await api('GET', '/admin/groups', uid)).status).toBe(403);
      expect((await api('GET', '/admin/permissions', uid)).status).toBe(403);
      expect((await api('GET', '/admin/audit', uid)).status).toBe(403);
      expect((await api('GET', '/admin/capabilities', uid)).status).toBe(403);
      expect((await api('GET', '/stats/disk', uid)).status).toBe(403);
      expect(mocks.findRoles).not.toHaveBeenCalled();
      expect(mocks.userGetAll).not.toHaveBeenCalled();
    });
  });

  describe('кастомная роль только с user:read', () => {
    it('GET /users → 200, но POST /devices (camera:create) → 403', async () => {
      const uid = 'u-custom-read';
      grant(uid, ['user:read']);
      expect((await api('GET', '/users', uid)).status).toBe(200);
      expect((await api('POST', '/devices', uid, { name: 'x', type: 'camera' })).status).toBe(403);
    });
  });

  describe('кастомная роль только с role:read', () => {
    const roleId = '00000000-0000-0000-0000-00000000cafe';
    it('чтение ролей/каталога доступно, но любые мутации ролей и выдачи прав — 403', async () => {
      const uid = 'u-role-read';
      grant(uid, ['role:read']);
      (mocks.findRoles as unknown as Mock).mockResolvedValue([]);
      (mocks.findRoleById as unknown as Mock).mockResolvedValue({
        id: roleId,
        name: 'hr',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      (mocks.findRoleCapabilities as unknown as Mock).mockResolvedValue([]);

      expect((await api('GET', '/admin/roles', uid)).status).toBe(200);
      expect((await api('GET', `/admin/roles/${roleId}`, uid)).status).toBe(200);
      expect((await api('GET', `/admin/roles/${roleId}/capabilities`, uid)).status).toBe(200);
      expect((await api('GET', '/admin/capabilities', uid)).status).toBe(200);

      expect((await api('POST', '/admin/roles', uid, { name: 'nrole' })).status).toBe(403);
      expect((await api('PATCH', `/admin/roles/${roleId}`, uid, { name: 'hr2' })).status).toBe(403);
      expect((await api('DELETE', `/admin/roles/${roleId}`, uid)).status).toBe(403);
      expect((await api('PUT', `/admin/roles/${roleId}/permissions`, uid, { entries: [] })).status).toBe(403);
      expect((await api('PUT', `/admin/roles/${roleId}/capabilities`, uid, { capabilities: [] })).status).toBe(403);
      expect((await api('PUT', `/admin/users/u1/roles`, uid, { roleNames: ['viewer'] })).status).toBe(403);
    });
  });

  describe('admin API ролей: GET/PUT capabilities', () => {
    const customRole = { id: '00000000-0000-0000-0000-00000000cafe', name: 'hr', createdAt: '2026-01-01T00:00:00.000Z' };
    const adminRole = { id: '00000000-0000-0000-0000-00000000aaaa', name: 'admin', createdAt: '2026-01-01T00:00:00.000Z' };

    it('GET /admin/roles/:id/capabilities → 200 и коды роли', async () => {
      grantAll('u-admin');
      (mocks.findRoleById as unknown as Mock).mockResolvedValue(adminRole);
      (mocks.findRoleCapabilities as unknown as Mock).mockResolvedValue(['admin:read', 'admin:write']);
      const r = await api('GET', `/admin/roles/${adminRole.id}/capabilities`, 'u-admin');
      expect(r.status).toBe(200);
      expect(r.body).toEqual(['admin:read', 'admin:write']);
    });

    it('GET /admin/roles/:id/capabilities → 404 для неизвестной роли', async () => {
      grantAll('u-admin');
      (mocks.findRoleById as unknown as Mock).mockResolvedValue(null);
      expect((await api('GET', `/admin/roles/${adminRole.id}/capabilities`, 'u-admin')).status).toBe(404);
    });

    it('PUT capabilities на системную роль admin → 400 (защита от понижения админов)', async () => {
      grantAll('u-admin');
      (mocks.findRoleById as unknown as Mock).mockResolvedValue(adminRole);
      const r = await api('PUT', `/admin/roles/${adminRole.id}/capabilities`, 'u-admin', { capabilities: [] });
      expect(r.status).toBe(400);
      expect(mocks.replaceRoleCapabilities).not.toHaveBeenCalled();
    });

    it('PUT capabilities кастомной роли → 200, holder-ы инвалидированы, аудит записан', async () => {
      grantAll('u-admin');
      (mocks.findRoleById as unknown as Mock).mockResolvedValue(customRole);
      (mocks.findUsersByRole as unknown as Mock).mockResolvedValue(['u1', 'u2']);
      (mocks.replaceRoleCapabilities as unknown as Mock).mockResolvedValue(undefined);
      (mocks.findRoleCapabilities as unknown as Mock).mockResolvedValue(['user:read']);

      const r = await api('PUT', `/admin/roles/${customRole.id}/capabilities`, 'u-admin', {
        capabilities: ['user:read'],
      });
      expect(r.status).toBe(200);
      expect(r.body).toEqual(['user:read']);
      expect(mocks.replaceRoleCapabilities).toHaveBeenCalledWith(customRole.id, ['user:read']);
      expect(mocks.invalidateUser).toHaveBeenCalledWith('u1');
      expect(mocks.invalidateUser).toHaveBeenCalledWith('u2');
      expect(mocks.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.caps.set', targetId: customRole.id }),
      );
    });

    it('PUT capabilities с неизвестным кодом → 400', async () => {
      grantAll('u-admin');
      (mocks.findRoleById as unknown as Mock).mockResolvedValue(customRole);
      const r = await api('PUT', `/admin/roles/${customRole.id}/capabilities`, 'u-admin', {
        capabilities: ['role:assign'],
      });
      expect(r.status).toBe(400);
      expect(mocks.replaceRoleCapabilities).not.toHaveBeenCalled();
    });
  });
});
