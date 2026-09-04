import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

interface UseEntity<T> {
  item: T | null;
  loading: boolean;
  error: string;
  refresh: () => void;
}

export function useEntity<T>(endpoint: string, id: string | undefined): UseEntity<T> {
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    apiFetch(`${endpoint}/${id}`)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(data => {
        if (cancelled) return;
        // API возвращает объект напрямую: { id, url, ... }
        setItem(data as T);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [endpoint, id, tick]);

  return { item, loading, error, refresh };
}
