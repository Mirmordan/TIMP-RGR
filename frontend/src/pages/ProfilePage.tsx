import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { Button } from '../components/Button/Button';
import { useAuth } from '../auth';
import { apiFetch } from '../api';
import { useNotify } from '../notifications';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const { toast } = useNotify();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  const passwordFilled = currentPassword !== '' && newPassword !== '' && confirmNewPassword !== '';

  async function handleChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError('');
    if (newPassword.length < 12) {
      const msg = 'Пароль должен быть не короче 12 символов';
      setPasswordError(msg);
      toast.error(msg);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      const msg = 'Пароли не совпадают';
      setPasswordError(msg);
      toast.error(msg);
      return;
    }
    setSavingPassword(true);
    try {
      const r = await apiFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) {
        const msg = data.error || 'Не удалось сменить пароль';
        setPasswordError(msg);
        toast.error(msg);
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      toast.success('Пароль изменён');
      await refresh();
    } catch {
      setPasswordError('Ошибка сети');
      toast.error('Ошибка сети');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* сеть недоступна — остаёмся на странице */
    }
    navigate('/login', { replace: true });
  }

  return (
    <Layout>
      <div className={styles.page}>
        <PageHeader title="Профиль" />

        <div className={styles.grid}>
          <Card>
            <div className={styles.sectionHeader}>
              <h2>Учётная запись</h2>
            </div>
            <div className={styles.sessionBody}>
              <div className={styles.sessionGrid}>
                <div className={styles.sessionItem}>
                  <span className={styles.sessionLabel}>Логин</span>
                  <span className={`${styles.sessionValue} ${styles.mono}`}>{user.username}</span>
                </div>
                <div className={styles.sessionItem}>
                  <span className={styles.sessionLabel}>Email</span>
                  <span className={styles.sessionValue}>{user.email || '—'}</span>
                </div>
              </div>
              <div className={styles.accountNote}>Логин и email изменяет только администратор</div>
            </div>
          </Card>

          <Card>
            <div className={styles.sectionHeader}>
              <h2>Смена пароля</h2>
            </div>
            <form className={styles.form} onSubmit={handleChangePassword} noValidate>
              <div className={styles.field}>
                <div className={styles.fieldHead}>
                  <label className={styles.label}>Текущий пароль</label>
                  <button type="button" className={styles.toggle} onClick={() => setShowCurrent(v => !v)}>
                    {showCurrent ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
                <input
                  className={styles.input}
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Новый пароль</label>
                <input
                  className={styles.input}
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Повторите новый пароль</label>
                <input
                  className={styles.input}
                  type="password"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              {passwordError && <div className={styles.flashError}>{passwordError}</div>}
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" disabled={!passwordFilled || savingPassword}>
                  {savingPassword ? '...' : 'Сменить пароль'}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <Card>
          <div className={styles.sectionHeader}>
            <h2>Сессия</h2>
          </div>
          <div className={styles.sessionBody}>
            <div className={styles.sessionGrid}>
              <div className={styles.sessionItem}>
                <span className={styles.sessionLabel}>Логин</span>
                <span className={`${styles.sessionValue} ${styles.mono}`}>{user.username}</span>
              </div>
              <div className={styles.sessionItem}>
                <span className={styles.sessionLabel}>Роль</span>
                <span className={styles.sessionValue}>{user.role ?? '—'}</span>
              </div>
              <div className={styles.sessionItem}>
                <span className={styles.sessionLabel}>Создан</span>
                <span className={styles.sessionValue}>
                  {user.createdAt ? new Date(user.createdAt).toLocaleString('ru-RU') : '—'}
                </span>
              </div>
            </div>
            <div className={styles.sessionActions}>
              <Button type="button" variant="danger" onClick={handleLogout}>Выйти из системы</Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
