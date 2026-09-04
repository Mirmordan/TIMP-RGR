import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

// config.ts читает process.env в момент импорта модуля — поэтому env задаём
// ДО динамического import('./tokens'). dotenv.config() внутри config не
// перезаписывает уже установленные переменные (override=false).
const JWT_SECRET = 'unit-test-jwt-secret';
const JWT_REFRESH_SECRET = 'unit-test-refresh-secret';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;

type TokensModule = typeof import('./tokens');
let tokens: TokensModule;

beforeAll(async () => {
  tokens = await import('./tokens');
});

function signRaw(payload: Record<string, unknown>, secret: string): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256' } as jwt.SignOptions);
}

describe('tokens', () => {
  it('access: sign→verify сохраняет sub/username/role/type', () => {
    const token = tokens.createAccessToken('u-1', 'alice', 'operator');
    const payload = tokens.verifyAccessToken(token);
    expect(payload.sub).toBe('u-1');
    expect(payload.username).toBe('alice');
    expect(payload.role).toBe('operator');
    expect(payload.type).toBe('access');
  });

  it('refresh: sign→verify сохраняет sub', () => {
    const token = tokens.createRefreshToken('u-1');
    expect(tokens.verifyRefreshToken(token).sub).toBe('u-1');
  });

  it('verify с токеном, подписанным не тем ключом, бросает', () => {
    const forged = signRaw({ sub: 'u-1', username: 'x', role: 'admin', type: 'access' }, 'wrong-secret');
    expect(() => tokens.verifyAccessToken(forged)).toThrow();
  });

  it('verify протухшего токена бросает', () => {
    const expired = signRaw(
      {
        sub: 'u-1',
        username: 'alice',
        role: 'viewer',
        type: 'access',
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      JWT_SECRET,
    );
    expect(() => tokens.verifyAccessToken(expired)).toThrow();
  });

  it('verify не-JWT мусора бросает', () => {
    expect(() => tokens.verifyAccessToken('not-a-jwt')).toThrow();
  });
});
