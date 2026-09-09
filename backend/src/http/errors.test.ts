import { describe, it, expect, vi } from 'vitest';
import { isSystemError, replyError, globalErrorHandler } from './errors';

function mockRes() {
  const res: Record<string, unknown> = { headersSent: false };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  res.end = vi.fn();
  return res as unknown as import('express').Response & { statusCode: number; body: { error?: string } };
}

// console.error в тестах не нужен в выводе
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('isSystemError', () => {
  it('ловит spawn ENOENT', () => {
    expect(isSystemError('spawn ffmpeg ENOENT')).toBe(true);
  });
  it('ловит pg-тексты', () => {
    expect(isSystemError('insert or update on table "users" violates foreign key constraint')).toBe(true);
    expect(isSystemError('relation "foo" does not exist')).toBe(true);
  });
  it('ловит сетевые errno', () => {
    expect(isSystemError('connect ECONNREFUSED 127.0.0.1:5432')).toBe(true);
  });
  it('не трогает русские бизнес-валидации', () => {
    for (const m of [
      'неверный логин или пароль',
      'url обязателен',
      'username уже занят',
      'пароль минимум 12 символов',
      'поток не найден',
      'статус должен быть running, stopped или failed',
    ]) {
      expect(isSystemError(m)).toBe(false);
    }
  });
});

describe('replyError', () => {
  it('системная ошибка с fallback 400 -> 500 generic, текст не утекает', () => {
    const res = mockRes();
    replyError(res, new Error('spawn ffmpeg ENOENT'), 'test', 400);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('внутренняя ошибка сервера');
  });

  it('бизнес Error со статусом 409 -> текст клиенту', () => {
    const res = mockRes();
    const e = Object.assign(new Error('username уже занят'), { status: 409 });
    replyError(res, e, 'test');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('username уже занят');
  });

  it('fallbackStatus 401 для русских сообщений сохраняется', () => {
    const res = mockRes();
    replyError(res, new Error('неверный логин или пароль'), 'test', 401);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('неверный логин или пароль');
  });

  it('status>=500 всегда generic', () => {
    const res = mockRes();
    const e = Object.assign(new Error('что-то сломалось'), { status: 503 });
    replyError(res, e, 'test');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('внутренняя ошибка сервера');
  });

  it('заголовки уже отправлены -> только end(), без json', () => {
    const res = mockRes();
    res.headersSent = true;
    replyError(res, new Error('spawn ffmpeg ENOENT'), 'test', 400);
    expect(res.json).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });
});

describe('globalErrorHandler', () => {
  it('неизвестныйThrow -> 500 generic', () => {
    const res = mockRes();
    globalErrorHandler(new Error('Cannot read properties of undefined'), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('внутренняя ошибка сервера');
  });
});
