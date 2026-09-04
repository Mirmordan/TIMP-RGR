import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { Button } from '../components/Button/Button';
import { useAuth } from '../auth';
import { apiFetch } from '../api';
import styles from './ProfilePage.module.css';

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Flash {
  kind: 'success' | 'error';
  text: string;
}

export function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();

  const [base, setBase] = useState(() => ({ username: user?.username ?? '', email: user?.email ?? '' }));
  const [username, setUsername] = useState(base.username);
  const [email, setEmail] = useState(base.email);
  const [profileFlash, setProfileFlash] = useState<Flash | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [passwordFlash, setPasswordFlash] = useState<Flash | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  const usernameChanged = username !== base.username;
  const emailChanged = email !== base.email;
  const profileDirty = usernameChanged || emailChanged;
  const profileValid = (!usernameChanged || USERNAME_RE.test(username)) && (!emailChanged || EMAIL_RE.test(email));
  const canSaveProfile = profileDirty && profileValid && !savingProfile;

  const passwordFilled = currentPassword !== '' && newPassword !== '' && confirmNewPassword !== '';

  function flashClass(f: Flash): string {
    return f.kind === 'error' ? styles.flashError : styles.flashSuccess;
  }

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileFlash(null);
    if (!profileDirty || !profileValid) return;
    setSavingProfile(true);
    try {
      const body: Record<string, string> = {};
      if (usernameChanged) body.username = username;
      if (emailChanged) body.email = email;
      const r = await apiFetch('/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) {
        setProfileFlash({ kind: 'error', text: data.error || 'Не удалось сохранить профиль' });
        return;
      }
      setBase({ username: body.username ?? base.username, email: body.email ?? base.email });
      setProfileFlash({ kind: 'success', text: 'Профиль сохранён' });
      await refresh();
    } catch {
      setProfileFlash({ kind: 'error', text: 'Ошибка сети' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordFlash(null);
    if (newPassword.length < 8) {
      setPasswordFlash({ kind: 'error', text: 'Пароль должен быть не короче 8 символов' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordFlash({ kind: 'error', text: 'Пароли не совпадают' });
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
        setPasswordFlash({ kind: 'error', text: data.error || 'Не удалось сменить пароль' });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordFlash({ kind: 'success', text: 'Пароль изменён' });
      await refresh();
    } catch {
      setPasswordFlash({ kind: 'error', text: 'Ошибка сети' });
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
            <form className={styles.form} onSubmit={handleSaveProfile} noValidate>
              <div className={styles.field}>
                <label className={styles.label}>Логин</label>
                <input
                  className={styles.input}
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              {profileFlash && <div className={flashClass(profileFlash)}>{profileFlash.text}</div>}
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" disabled={!canSaveProfile}>
                  {savingProfile ? '...' : 'Сохранить'}
                </Button>
              </div>
            </form>
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
              {passwordFlash && <div className={flashClass(passwordFlash)}>{passwordFlash.text}</div>}
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
