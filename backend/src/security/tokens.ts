import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AccessTokenPayload, RefreshTokenPayload, Role } from './types';

export function createAccessToken(userId: string, username: string, role: Role): string {
  const payload: AccessTokenPayload = { sub: userId, username, role, type: 'access' };
  return jwt.sign(payload, config.security.jwtSecret, {
    expiresIn: config.security.accessTokenTtl as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  } as jwt.SignOptions);
}

export function createRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, type: 'refresh' };
  return jwt.sign(payload, config.security.jwtRefreshSecret, {
    expiresIn: config.security.refreshTokenTtl as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.security.jwtSecret);
  if (typeof decoded === 'string' || (decoded as AccessTokenPayload).type !== 'access') {
    throw new Error('неверный тип токена');
  }
  return decoded as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.security.jwtRefreshSecret);
  if (typeof decoded === 'string' || (decoded as RefreshTokenPayload).type !== 'refresh') {
    throw new Error('неверный тип токена');
  }
  return decoded as RefreshTokenPayload;
}
