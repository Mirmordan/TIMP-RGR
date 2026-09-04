import { Link } from 'react-router';
import buttonStyles from '../components/Button/Button.module.css';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.code}>404</div>
      <p className={styles.msg}>$ route not found</p>
      <p className={styles.hint}>Страница не найдена или была удалена</p>
      <div className={styles.actions}>
        <Link to="/" className={`${buttonStyles.button} ${buttonStyles.outline} ${styles.actionLink}`}>
          &larr; На главную
        </Link>
        <Link to="/processes" className={`${buttonStyles.button} ${buttonStyles.outline} ${styles.actionLink}`}>
          Записи
        </Link>
      </div>
    </div>
  );
}
