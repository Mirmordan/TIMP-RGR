import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password';
import { assertPassword } from './auth.service';

describe('password', () => {
  it('hash/verify round-trip: тот же пароль → true', async () => {
    const hash = await hashPassword('secret-pass-123');
    await expect(verifyPassword('secret-pass-123', hash)).resolves.toBe(true);
  });

  it('другой пароль → false', async () => {
    const hash = await hashPassword('secret-pass-123');
    await expect(verifyPassword('wrong-pass', hash)).resolves.toBe(false);
  });

  it('два хэша одного пароля различаются (разный salt)', async () => {
    const hashA = await hashPassword('same-pass');
    const hashB = await hashPassword('same-pass');
    expect(hashA).not.toBe(hashB);
  });

  describe('assertPassword (политика: минимум 12 символов)', () => {
    it('пароль короче 12 символов отбивается', () => {
      expect(() => assertPassword('12345678')).toThrowError('пароль минимум 12 символов');
      expect(() => assertPassword('12345678901')).toThrowError('пароль минимум 12 символов');
      expect(() => assertPassword('')).toThrowError('пароль минимум 12 символов');
      expect(() => assertPassword(42)).toThrowError('пароль минимум 12 символов');
    });

    it('пароль длиной 12 и более принимается', () => {
      expect(() => assertPassword('123456789012')).not.toThrow();
      expect(() => assertPassword('1234567890123')).not.toThrow();
    });

    it('генерируемый временный пароль (18 байт → 24 символа base64url) валиден assertPassword', () => {
      // Тот же формат, что generateTemporaryPassword в rbac.service.
      const generated = randomBytes(18).toString('base64url');
      expect(generated).toHaveLength(24);
      expect(() => assertPassword(generated)).not.toThrow();
    });
  });
});
