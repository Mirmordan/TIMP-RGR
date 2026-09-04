import { Layout } from '../components/Layout/Layout';
import { useAuth } from '../auth';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className={styles.welcome}>
        <div className={styles.hero}>
          <div className={styles.heroIcon}>T</div>
          <h1 className={styles.heroTitle}>ТИМП-РГР</h1>
          <p className={styles.heroSub}>
            Система управления записью видеонаблюдения.
            Модульная архитектура: бэкенд (Express + PostgreSQL) управляет процессами записи,
            mediaMTX нарезает чанки из HLS/RTSP-потоков.
          </p>
        </div>

        <div className={styles.cards}>
          <div className={styles.infoCard}>
            <div className={styles.infoCardIcon}>📷</div>
            <div className={styles.infoCardTitle}>Устройства</div>
            <div className={styles.infoCardDesc}>Камеры, микрофоны и другие источники видео и аудио.</div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoCardIcon}>📡</div>
            <div className={styles.infoCardTitle}>Потоки</div>
            <div className={styles.infoCardDesc}>HLS/RTSP-потоки с камер для записи и трансляции.</div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoCardIcon}>⏺</div>
            <div className={styles.infoCardTitle}>Записи</div>
            <div className={styles.infoCardDesc}>Запуск, пауза и остановка процессов записи.</div>
          </div>
        </div>

        <div className={styles.tech}>
          <div className={styles.techTitle}>Стек технологий</div>
          <div className={styles.techList}>
            <div className={styles.techItem}>
              <span className={styles.techDot} />
              <span className={styles.techLabel}>Бэкенд</span>
              Express 5 + TypeScript + PostgreSQL + RLS
            </div>
            <div className={styles.techItem}>
              <span className={styles.techDot} />
              <span className={styles.techLabel}>Фронтенд</span>
              React 19 + Vite + TypeScript
            </div>
            <div className={styles.techItem}>
              <span className={styles.techDot} />
              <span className={styles.techLabel}>Медиа</span>
              mediaMTX (HLS → MPEG-TS чанки)
            </div>
            <div className={styles.techItem}>
              <span className={styles.techDot} />
              <span className={styles.techLabel}>Авторизация</span>
              JWT + httpOnly cookies + RBAC + ACL
            </div>
            <div className={styles.techItem}>
              <span className={styles.techDot} />
              <span className={styles.techLabel}>Пользователь</span>
              {user?.username} ({user?.role})
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
