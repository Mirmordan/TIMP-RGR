import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastType = 'success' | 'error';

export interface Toast {
  id: number;
  type: ToastType;
  text: string;
  leaving: boolean;
}

export interface NotifyApi {
  toast: {
    success: (text: string) => void;
    error: (text: string) => void;
  };
  dismiss: (id: number) => void;
}

interface ToastContextValue {
  toasts: Toast[];
  notify: (type: ToastType, text: string) => void;
  dismiss: (id: number) => void;
}

const MAX_TOASTS = 4;
const SUCCESS_DURATION = 4000;
const ERROR_DURATION = 6000;
const LEAVE_DURATION = 200;

const ToastContext = createContext<ToastContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(t => window.clearTimeout(t));
    };
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts(prev =>
        prev.map(t => (t.id === id && !t.leaving ? { ...t, leaving: true } : t)),
      );
      schedule(() => remove(id), LEAVE_DURATION);
    },
    [schedule, remove],
  );

  const notify = useCallback(
    (type: ToastType, text: string) => {
      const id = nextId.current++;
      const item: Toast = { id, type, text, leaving: false };
      setToasts(prev => [...prev, item].slice(-MAX_TOASTS));
      schedule(
        () => dismiss(id),
        type === 'success' ? SUCCESS_DURATION : ERROR_DURATION,
      );
    },
    [schedule, dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, notify, dismiss }),
    [toasts, notify, dismiss],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useNotify must be used within NotificationsProvider');
  return ctx;
}

export function useNotify(): NotifyApi {
  const ctx = useToastContext();
  return {
    toast: {
      success: (text: string) => ctx.notify('success', text),
      error: (text: string) => ctx.notify('error', text),
    },
    dismiss: ctx.dismiss,
  };
}

export function useToastFeed(): { toasts: Toast[]; dismiss: (id: number) => void } {
  const ctx = useToastContext();
  return { toasts: ctx.toasts, dismiss: ctx.dismiss };
}
