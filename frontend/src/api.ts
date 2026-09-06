import { config } from './config';

/** Активный запрос обновления сессии — общий для параллельных 401 (single-flight). */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Молчаливое обновление сессии через POST /auth/refresh (httpOnly refresh_token cookie).
 * Возвращает true при 200. Вызывается напрямую через fetch, а не apiFetch, — без рекурсии.
 */
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${config.apiPrefix}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(res => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Точки входа auth, которым silent-refresh на 401 противопоказан:
 * /auth/login — 401 = неверный пароль, refresh бессмыслен;
 * /auth/refresh — сам флоу обновления, иначе рекурсия.
 * Остальные /auth/me и т.п. — честно участвуют в восстановлении сессии.
 */
function skipsAutoRefresh(path: string): boolean {
  return path.includes('/auth/login') || path.includes('/auth/refresh');
}

/**
 * Обёртка над fetch с честной обработкой протухшего access-токена.
 * При 401 (кроме /auth/login и /auth/refresh): один раз молча обновляет сессию и повторяет исходный запрос.
 * При неудачном обновлении — редирект на /login?expired=1.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${config.apiPrefix}${path}`;

  const res = await fetch(url, { credentials: 'include', ...init });

  if (res.status === 401 && !skipsAutoRefresh(path)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      // Сессия обновлена — повторяем исходный запрос ровно один раз.
      return fetch(url, { credentials: 'include', ...init });
    }
    // Refresh-токен тоже протух/отозван — на логин с понятным сообщением.
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login?expired=1';
    }
  }

  return res;
}
