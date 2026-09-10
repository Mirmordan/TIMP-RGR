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

vi.mock('../database/connection', () => ({ pool: { query: vi.fn() } }));

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    findAuthByUsername: vi.fn(),
    findAuthById: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    patch: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock('./tokens', () => ({
  createAccessToken: vi.fn(() => 'access'),
  createRefreshToken: vi.fn(() => 'refresh'),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('./password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('./acl', () => ({
  invalidateUser: vi.fn(),
  invalidateObject: vi.fn(),
  invalidateGroup: vi.fn(),
}));

import { userRepository } from '../repositories/user.repository';
import { hashPassword } from './password';
import { authService } from './auth.service';

beforeEach(() => {
  vi.clearAllMocks();
  state.ownerUsername = 'owner';
});

describe('authService — owner-username зарезервирован', () => {
  it('register: owner username → 403, БД не трогаем', async () => {
    await expect(
      authService.register('owner', 'o@example.test', 'longpassword12'),
    ).rejects.toMatchObject({ status: 403, message: 'имя владельца зарезервировано' });
    expect(userRepository.findAuthByUsername).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('register: обычного пользователя регистрирует (не регресс)', async () => {
    (userRepository.findAuthByUsername as unknown as Mock).mockResolvedValue(null);
    (hashPassword as unknown as Mock).mockResolvedValue('hashed');
    (userRepository.create as unknown as Mock).mockResolvedValue({ id: 'u1', username: 'newuser' });

    const result = await authService.register('newuser', 'n@example.test', 'longpassword12');

    expect(userRepository.create).toHaveBeenCalledWith({
      username: 'newuser',
      email: 'n@example.test',
      passwordHash: 'hashed',
    });
    expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    expect(result.user).toMatchObject({ id: 'u1', username: 'newuser', role: 'viewer' });
  });

  it('updateProfile: rename на owner username → 403, patch не вызван', async () => {
    await expect(
      authService.updateProfile('u1', { username: 'owner' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(userRepository.findByUsername).not.toHaveBeenCalled();
    expect(userRepository.patch).not.toHaveBeenCalled();
  });

  it('updateProfile: обычный rename viewer проходит', async () => {
    (userRepository.findByUsername as unknown as Mock).mockResolvedValue(null);
    (userRepository.patch as unknown as Mock).mockResolvedValue({ id: 'u1', username: 'newname' });

    await authService.updateProfile('u1', { username: 'newname' });

    expect(userRepository.patch).toHaveBeenCalledWith('u1', { username: 'newname' });
  });
});
