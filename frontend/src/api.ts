import { config } from './config';

/**
 * Обёртка над fetch с обработкой 401.
 * При 401 — редирект на /login.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${config.apiPrefix}${path}`;
  const res = await fetch(url, { credentials: 'include', ...init });

  if (res.status === 401) {
    // Не редиректим если уже на /login или это запрос /auth/*
    if (!window.location.pathname.startsWith('/login') && !path.includes('/auth/')) {
      window.location.href = '/login';
    }
  }

  return res;
}
