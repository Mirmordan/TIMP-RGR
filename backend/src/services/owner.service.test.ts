import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const state = vi.hoisted(() => ({
  owner: { username: '', password: '', email: '', passwordForce: false },
}));

const auth = vi.hoisted(() => ({ hashPassword: vi.fn() }));

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    config: {
      ...actual.config,
      get owner() {
        return state.owner;
      },
    },
  };
});

vi.mock('../repositories/user.repository', () => ({
  userRepository: { findByUsername: vi.fn() },
}));

vi.mock('../repositories/rbac.repository', () => ({
  rbacRepository: { createUserWithRoles: vi.fn(), setUserPasswordHash: vi.fn() },
}));

vi.mock('../security/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../security/auth.service')>();
  return { ...actual, authService: { ...actual.authService, hashPassword: auth.hashPassword } };
});

import { userRepository } from '../repositories/user.repository';
import { rbacRepository } from '../repositories/rbac.repository';
import { ownerService, isOwnerUsername, isReservedOwnerUsername, assertOwnerUsernameReserved } from './owner.service';

const findByUsername = userRepository.findByUsername as unknown as Mock;
const createUserWithRoles = rbacRepository.createUserWithRoles as unknown as Mock;
const setUserPasswordHash = rbacRepository.setUserPasswordHash as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  state.owner = { username: '', password: '', email: '', passwordForce: false };
});

describe('ownerService.ensureOwner', () => {
  it('без OWNER_* — warn, ничего не создаёт', async () => {
    await ownerService.ensureOwner();
    expect(findByUsername).not.toHaveBeenCalled();
    expect(createUserWithRoles).not.toHaveBeenCalled();
  });

  it('без пароля при отсутствующем пользователе — не создаёт', async () => {
    state.owner = { username: 'owner', password: '', email: '', passwordForce: false };
    findByUsername.mockResolvedValue(null);

    await ownerService.ensureOwner();

    expect(createUserWithRoles).not.toHaveBeenCalled();
  });

  it('создаёт owner с ролью admin и синтетическим email', async () => {
    state.owner = { username: 'owner', password: 'longpassword12', email: '', passwordForce: false };
    findByUsername.mockResolvedValue(null);
    auth.hashPassword.mockResolvedValue('hashed');
    createUserWithRoles.mockResolvedValue('owner-id');

    await ownerService.ensureOwner();

    expect(auth.hashPassword).toHaveBeenCalledWith('longpassword12');
    expect(createUserWithRoles).toHaveBeenCalledWith({
      username: 'owner',
      email: 'owner@owner.local',
      passwordHash: 'hashed',
      roleNames: ['admin'],
    });
  });

  it('существующего owner без FORCE не трогает (идемпотентность)', async () => {
    state.owner = { username: 'owner', password: 'longpassword12', email: '', passwordForce: false };
    findByUsername.mockResolvedValue({ id: 'owner-id', username: 'owner' });

    await ownerService.ensureOwner();

    expect(createUserWithRoles).not.toHaveBeenCalled();
    expect(setUserPasswordHash).not.toHaveBeenCalled();
  });

  it('OWNER_PASSWORD_FORCE пересоздаёт пароль существующего owner', async () => {
    state.owner = { username: 'owner', password: 'longpassword12', email: '', passwordForce: true };
    findByUsername.mockResolvedValue({ id: 'owner-id', username: 'owner' });
    auth.hashPassword.mockResolvedValue('hashed');
    setUserPasswordHash.mockResolvedValue(true);

    await ownerService.ensureOwner();

    expect(setUserPasswordHash).toHaveBeenCalledWith('owner-id', 'hashed');
  });

  it('невалидный OWNER_PASSWORD — warn и без обращения к БД', async () => {
    state.owner = { username: 'owner', password: 'short', email: '', passwordForce: false };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await ownerService.ensureOwner();

    expect(findByUsername).not.toHaveBeenCalled();
    expect(createUserWithRoles).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('OWNER_PASSWORD не проходит политику'));
    warn.mockRestore();
  });
});

describe('isOwnerUsername', () => {
  it('сравнивает username с OWNER_USERNAME', () => {
    state.owner = { username: 'owner', password: '', email: '', passwordForce: false };
    expect(isOwnerUsername('owner')).toBe(true);
    expect(isOwnerUsername('other')).toBe(false);
  });

  it('пустой OWNER_USERNAME → всегда false', () => {
    state.owner = { username: '', password: '', email: '', passwordForce: false };
    expect(isOwnerUsername('owner')).toBe(false);
  });
});

describe('isReservedOwnerUsername / assertOwnerUsernameReserved', () => {
  beforeEach(() => {
    state.owner = { username: 'owner', password: '', email: '', passwordForce: false };
  });

  it('точное case-sensitive сравнение с trim', () => {
    expect(isReservedOwnerUsername('owner')).toBe(true);
    expect(isReservedOwnerUsername(' owner ')).toBe(true);
    expect(isReservedOwnerUsername('Owner')).toBe(false);
    expect(isReservedOwnerUsername('owner2')).toBe(false);
    expect(isReservedOwnerUsername('')).toBe(false);
    expect(isReservedOwnerUsername(undefined)).toBe(false);
  });

  it('assert бросает 403 «имя владельца зарезервировано»', () => {
    expect(() => assertOwnerUsernameReserved('owner')).toThrowError('имя владельца зарезервировано');
    let status: number | undefined;
    try {
      assertOwnerUsernameReserved('owner');
    } catch (e) {
      status = (e as { status?: number }).status;
    }
    expect(status).toBe(403);
    expect(() => assertOwnerUsernameReserved('other')).not.toThrow();
  });

  it('пустой env → имя не резервируется', () => {
    state.owner = { username: '', password: '', email: '', passwordForce: false };
    expect(isReservedOwnerUsername('owner')).toBe(false);
    expect(() => assertOwnerUsernameReserved('owner')).not.toThrow();
  });
});
