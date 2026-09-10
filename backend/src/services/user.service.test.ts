import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const state = vi.hoisted(() => ({ ownerUsername: 'owner' }));

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    config: {
      ...actual.config,
      get owner() {
        return { username: state.ownerUsername, password: '', email: '', passwordForce: false };
      },
    },
  };
});

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    create: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    findByUsername: vi.fn(),
  },
}));

vi.mock('../security/auth.service', () => ({
  authService: { hashPassword: vi.fn() },
  assertEmail: vi.fn(),
  assertPassword: vi.fn(),
  assertUsername: vi.fn(),
}));

import { userRepository } from '../repositories/user.repository';
import { userService } from './user.service';

beforeEach(() => {
  vi.clearAllMocks();
  state.ownerUsername = 'owner';
});

describe('userService — owner-username зарезервирован (legacy /users)', () => {
  it('create: owner username → 403, репозиторий не вызван', async () => {
    await expect(
      userService.create({ username: 'owner', email: 'o@example.test', password: 'longpassword12' }),
    ).rejects.toMatchObject({ status: 403, message: 'имя владельца зарезервировано' });
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('put: owner username → 403, репозиторий не вызван', async () => {
    await expect(
      userService.put('u1', { username: 'owner', email: 'u1@example.test', password: 'longpassword12' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(userRepository.put).not.toHaveBeenCalled();
  });

  it('patch: rename на owner username → 403, репозиторий не вызван', async () => {
    await expect(userService.patch('u1', { username: 'owner' })).rejects.toMatchObject({ status: 403 });
    expect(userRepository.patch).not.toHaveBeenCalled();
  });

  it('patch: обычный rename viewer не ломается', async () => {
    (userRepository.patch as unknown as Mock).mockResolvedValue({
      id: 'u1',
      username: 'newname',
      email: 'u1@example.test',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const updated = await userService.patch('u1', { username: 'newname' });

    expect(userRepository.patch).toHaveBeenCalledWith('u1', { username: 'newname' });
    expect(updated?.username).toBe('newname');
  });
});
