import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Header } from '../components/Header/Header';
import { Footer } from '../components/Footer/Footer';
import { Button } from '../components/Button/Button';
import { useAuth } from '../auth';
import styles from './AuthPage.module.css';

export function AuthPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Пришли сюда после неудачного обновления сессии (?expired=1) — показываем сообщение.
  const [notice, setNotice] = useState(searchParams.get('expired') === '1' ? 'Сессия завершена. Войдите снова.' : '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice('');
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>T</span>
              ТИМП-РГР
            </div>
            <div className={styles.subtitle}>Система записи видеонаблюдения</div>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label}>Логин</label>
              <input
                className={`${styles.input} ${error ? styles.inputError : ''}`}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                autoFocus
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Пароль</label>
              <input
                className={`${styles.input} ${error ? styles.inputError : ''}`}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {(notice || error) && <div className={styles.error}>{notice || error}</div>}

            <div className={styles.submit}>
              <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? '...' : 'Войти'}
              </Button>
            </div>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
