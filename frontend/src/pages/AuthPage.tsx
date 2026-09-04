import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Header } from '../components/Header/Header';
import { Footer } from '../components/Footer/Footer';
import { Button } from '../components/Button/Button';
import { useAuth } from '../auth';
import styles from './AuthPage.module.css';

type Mode = 'login' | 'register';

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(username, email, password);
        setSuccess('Аккаунт создан. Войдите.');
        setMode('login');
        setPassword('');
        return;
      }

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

          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
              onClick={() => switchMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`}
              onClick={() => switchMode('register')}
            >
              Регистрация
            </button>
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

            {mode === 'register' && (
              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Пароль</label>
              <input
                className={`${styles.input} ${error ? styles.inputError : ''}`}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'минимум 6 символов' : '••••••••'}
                required
                minLength={mode === 'register' ? 6 : undefined}
              />
            </div>

            {success && <div className={styles.success}>{success}</div>}
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.submit}>
              <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? '...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              </Button>
            </div>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
