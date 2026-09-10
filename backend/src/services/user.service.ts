import type { User } from '../types';
import { userRepository } from '../repositories/user.repository';
import { authService } from '../security/auth.service';
import { assertOwnerUsernameReserved } from './owner.service';

export const userService = {
  async getById(id: string): Promise<User | null> {
    return userRepository.findById(id);
  },

  async getAll(limit: number, offset: number): Promise<User[]> {
    return userRepository.findAll(limit, offset);
  },

  async create(input: { username: string; email: string; password: string }): Promise<User> {
    if (!input.username || !input.email) throw new Error('username и email обязательны');
    if (!input.password) throw new Error('пароль обязателен');
    assertOwnerUsernameReserved(input.username);
    const exists = await userRepository.findByUsername(input.username);
    if (exists) throw new Error(`пользователь '${input.username}' уже существует`);
    const passwordHash = await authService.hashPassword(input.password);
    return userRepository.create({
      username: input.username,
      email: input.email,
      passwordHash,
    });
  },

  async put(id: string, input: { username: string; email: string; password: string }): Promise<User | null> {
    if (!input.username || !input.email) throw new Error('username и email обязательны');
    if (!input.password) throw new Error('пароль обязателен');
    assertOwnerUsernameReserved(input.username);
    const passwordHash = await authService.hashPassword(input.password);
    return userRepository.put(id, {
      username: input.username,
      email: input.email,
      passwordHash,
    });
  },

  async patch(id: string, patch: { username?: string; email?: string; password?: string }): Promise<User | null> {
    if (patch.username === '') throw new Error('username не может быть пустым');
    if (patch.email === '') throw new Error('email не может быть пустым');
    if (patch.password !== undefined && patch.password === '') {
      throw new Error('пароль не может быть пустым');
    }
    if (patch.username !== undefined) assertOwnerUsernameReserved(patch.username);
    const passwordHash = patch.password !== undefined
      ? await authService.hashPassword(patch.password)
      : undefined;
    return userRepository.patch(id, {
      ...(patch.username !== undefined ? { username: patch.username } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    });
  },

  async deleteById(id: string): Promise<boolean> {
    return userRepository.deleteById(id);
  },
};
