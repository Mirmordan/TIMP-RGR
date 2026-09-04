import { useToastFeed } from '../../notifications';
import styles from './Toaster.module.css';

export function Toaster() {
  const { toasts, dismiss } = useToastFeed();

  return (
    <div className={styles.toaster} role="status" aria-live="polite">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${styles.toast} ${t.type === 'success' ? styles.success : styles.error}${t.leaving ? ` ${styles.leaving}` : ''}`}
        >
          <span className={styles.msg}>{t.text}</span>
          <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Закрыть">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
