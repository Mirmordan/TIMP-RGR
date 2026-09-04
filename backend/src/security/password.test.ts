import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

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
});
