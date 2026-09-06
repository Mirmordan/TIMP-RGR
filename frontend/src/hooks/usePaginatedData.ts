import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

interface UsePaginatedData<T> {
  items: T[];
  total: number;
  loading: boolean;
  page: number;
  setPage: (p: number) => void;
  refresh: () => void;
}

export function usePaginatedData<T>(endpoint: string, pageSize = 10): UsePaginatedData<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const offset = (page - 1) * pageSize;
    const sep = endpoint.includes('?') ? '&' : '?';
    apiFetch(`${endpoint}${sep}limit=${pageSize}&offset=${offset}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        // Бэкенд возвращает { devices: [], total } или { streams: [], total } и т.д.
        const key = Object.keys(data).find(k => Array.isArray(data[k]));
        if (key) {
          setItems(data[key]);
          setTotal(data.total ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [endpoint, page, pageSize, tick]);

  // При смене endpoint сброс на страницу 1.
  const [prevEndpoint, setPrevEndpoint] = useState(endpoint);
  if (endpoint !== prevEndpoint) {
    setPrevEndpoint(endpoint);
    setPage(1);
  }

  return { items, total, loading, page, setPage, refresh };
}
