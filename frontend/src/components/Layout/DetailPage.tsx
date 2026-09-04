import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../Button/Button';
import styles from './DetailPage.module.css';

export { styles };

interface DetailHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: string;
  actions?: ReactNode;
}

export function DetailHeader({ title, subtitle, onBack = '..', actions }: DetailHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className={styles.detailHeader}>
      <div className={styles.headerLeft}>
        <Button variant="ghost" size="sm" onClick={() => navigate(onBack)}>&larr; Назад</Button>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  children: ReactNode;
  mono?: boolean;
}

export function InfoRow({ label, children, mono }: InfoRowProps) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={[styles.infoValue, mono ? styles.mono : ''].filter(Boolean).join(' ')}>{children}</span>
    </div>
  );
}

interface DetailGridProps {
  children: ReactNode;
}

export function DetailGrid({ children }: DetailGridProps) {
  return <div className={styles.detailGrid}>{children}</div>;
}
