import type { ReactNode } from 'react';
import { useAuth } from '../auth';

interface RequireCapabilityProps {
  caps: string[];
  children: ReactNode;
}

export function RequireCapability({ caps, children }: RequireCapabilityProps) {
  const { user, capabilities } = useAuth();

  // Пока юзер не загружен — редирект на /login делает ProtectedRoute на уровень выше.
  if (!user) return null;

  const allowed = caps.some(c => capabilities.includes(c));
  if (!allowed) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 240,
          padding: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
          textAlign: 'center',
        }}
      >
        Доступ запрещён
      </div>
    );
  }

  return <>{children}</>;
}
