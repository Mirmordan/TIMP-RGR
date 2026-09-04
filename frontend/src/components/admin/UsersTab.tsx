import { useEffect, useState, type FormEvent } from 'react'
import { Table, type Column } from '../Table/Table'
import { Button } from '../Button/Button'
import { apiFetch } from '../../api'
import { useAuth } from '../../auth'
import { useNotify } from '../../notifications'
import type {
  AdminCreateUserResponse,
  AdminResetPasswordResponse,
  AdminRole,
  AdminUser,
} from '../../types'
import styles from './UsersTab.module.css'

const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Одноразовая зелёная плашка с временным паролем (не восстанавливается после refetch). */
interface PasswordBanner {
  prefix: string
  code?: string
  suffix?: string
}

export function UsersTab() {
  const { user } = useAuth();
  const { toast } = useNotify();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);

  const [banner, setBanner] = useState<PasswordBanner | null>(null);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [profileId, setProfileId] = useState<string | null>(null);
  const [draftUsername, setDraftUsername] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const [resettingId, setResettingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([
      apiFetch('/admin/users?limit=100'),
      apiFetch('/admin/roles'),
    ])
      .then(async ([usersRes, rolesRes]) => {
        if (!usersRes.ok || !rolesRes.ok) {
          throw new Error(`Ошибка загрузки (${usersRes.status}/${rolesRes.status})`);
        }
        return Promise.all([usersRes.json(), rolesRes.json()]);
      })
      .then(([usersData, rolesData]: [AdminUser[], AdminRole[]]) => {
        if (cancelled) return;
        setUsers(usersData);
        setRoles(rolesData);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);

  const createDisabled = creating
    || !USERNAME_RE.test(username.trim())
    || !EMAIL_RE.test(email.trim());

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (creating || !USERNAME_RE.test(trimmedUsername) || !EMAIL_RE.test(trimmedEmail)) return;
    setCreating(true);
    setCreateError('');
    try {
      const body: Record<string, string> = { username: trimmedUsername, email: trimmedEmail };
      if (password !== '') body.password = password;
      const r = await apiFetch('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось создать пользователя');
      }
      const data = (await r.json()) as AdminCreateUserResponse;
      setUsername('');
      setEmail('');
      setPassword('');
      setBanner(
        data.initialPassword
          ? {
              prefix: 'Пользователь создан. Временный пароль:',
              code: data.initialPassword,
              suffix: '— скопируйте сейчас',
            }
          : null,
      );
      toast.success(`Пользователь «${trimmedUsername}» создан`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось создать пользователя';
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(target: AdminUser) {
    setConfirmDeleteId(null);
    setProfileId(null);
    setProfileError('');
    setActionError('');
    setEditingId(target.id);
    setDraftNames(target.roles.map(r => r.name));
    setSaveError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError('');
  }

  function toggleRole(name: string) {
    setDraftNames(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
  }

  async function handleSave() {
    if (!editingId) return;
    setSaving(true);
    setSaveError('');
    try {
      const r = await apiFetch(`/admin/users/${editingId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleNames: draftNames }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось сохранить');
      }
      setEditingId(null);
      toast.success('Роли сохранены');
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось сохранить';
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function openProfile(row: AdminUser) {
    setEditingId(null);
    setConfirmDeleteId(null);
    setSaveError('');
    setActionError('');
    setProfileError('');
    setProfileId(row.id);
    setDraftUsername(row.username);
    setDraftEmail(row.email);
  }

  function closeProfile() {
    setProfileId(null);
    setProfileError('');
  }

  async function handleProfileSave() {
    if (!profileId || profileSaving) return;
    const trimmedUsername = draftUsername.trim();
    const trimmedEmail = draftEmail.trim();
    if (!trimmedUsername && !trimmedEmail) return;
    setProfileSaving(true);
    setProfileError('');
    try {
      const body: Record<string, string> = {};
      if (trimmedUsername) body.username = trimmedUsername;
      if (trimmedEmail) body.email = trimmedEmail;
      const r = await apiFetch(`/admin/users/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось сохранить');
      }
      setProfileId(null);
      toast.success('Профиль пользователя обновлён');
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось сохранить';
      setProfileError(msg);
      toast.error(msg);
    } finally {
      setProfileSaving(false);
    }
  }

  function askDelete(row: AdminUser) {
    setEditingId(null);
    setProfileId(null);
    setSaveError('');
    setProfileError('');
    setActionError('');
    setConfirmDeleteId(row.id);
  }

  async function handleDelete(row: AdminUser) {
    if (!confirmDeleteId || deleting) return;
    setDeleting(true);
    setActionError('');
    try {
      const r = await apiFetch(`/admin/users/${row.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось удалить');
      }
      setConfirmDeleteId(null);
      if (profileId === row.id) setProfileId(null);
      toast.success(`Пользователь «${row.username}» удалён`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось удалить';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  async function handleReset(row: AdminUser) {
    if (resettingId) return;
    setResettingId(row.id);
    setActionError('');
    try {
      const r = await apiFetch(`/admin/users/${row.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось сбросить пароль');
      }
      const data = (await r.json()) as AdminResetPasswordResponse;
      setBanner(
        data.initialPassword
          ? { prefix: 'Новый пароль:', code: data.initialPassword }
          : null,
      );
      toast.success(row.passwordSet ? 'Пароль сброшен' : 'Пароль задан');
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось сбросить пароль';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setResettingId(null);
    }
  }

  function renderRoles(row: AdminUser) {
    if (row.id === editingId) {
      return (
        <div className={styles.roleOptions}>
          {roles.map(role => (
            <label key={role.id} className={styles.roleOption}>
              <input
                type="checkbox"
                checked={draftNames.includes(role.name)}
                onChange={() => toggleRole(role.name)}
              />
              <span>{role.name}</span>
            </label>
          ))}
        </div>
      );
    }
    const noPassword = !row.passwordSet;
    if (row.roles.length === 0) {
      return (
        <div className={styles.roleList}>
          <span className={styles.noRoles}>нет ролей</span>
          {noPassword && <span className={styles.noPasswordBadge}>без пароля</span>}
        </div>
      );
    }
    return (
      <div className={styles.roleList}>
        {row.roles.map(role => (
          <span key={role.id} className={styles.roleBadge}>{role.name}</span>
        ))}
        {noPassword && <span className={styles.noPasswordBadge}>без пароля</span>}
      </div>
    );
  }

  function renderActions(row: AdminUser) {
    if (row.id === user?.id) {
      return <span className={styles.youMark}>это вы</span>;
    }
    if (row.id === confirmDeleteId) {
      return (
        <div className={styles.editorActions}>
          <span className={styles.confirmText}>Удалить?</span>
          <Button size="sm" variant="danger" onClick={() => handleDelete(row)} disabled={deleting}>
            Да
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>
            Нет
          </Button>
        </div>
      );
    }
    if (row.id === editingId) {
      return (
        <div className={styles.editorActions}>
          <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '…' : 'Сохранить'}
          </Button>
          <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
            Отмена
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.editorActions}>
        <Button size="sm" variant="outline" onClick={() => startEdit(row)}>Роли</Button>
        <Button size="sm" variant="outline" onClick={() => openProfile(row)}>Ред.</Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleReset(row)}
          disabled={resettingId === row.id}
        >
          {resettingId === row.id ? '…' : row.passwordSet ? 'Сбросить пароль' : 'Задать пароль'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => askDelete(row)}>Удалить</Button>
      </div>
    );
  }

  function renderProfilePanel() {
    const target = users.find(u => u.id === profileId);
    if (!target) return null;
    const canSave = draftUsername.trim() !== '' || draftEmail.trim() !== '';
    return (
      <div className={styles.profileBlock}>
        <div className={styles.profileHead}>
          <div className={styles.profileTitle}>
            Редактировать: <span className={styles.profileUserName}>{target.username}</span>
          </div>
          <div className={styles.profileHint}>логин и email пользователя</div>
        </div>
        {profileError && <div className={styles.saveError}>{profileError}</div>}
        <div className={styles.profileFields}>
          <label className={styles.profileField}>
            <span className={styles.profileFieldLabel}>Логин</span>
            <input
              className={styles.profileInput}
              value={draftUsername}
              onChange={e => setDraftUsername(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className={styles.profileField}>
            <span className={styles.profileFieldLabel}>Email</span>
            <input
              className={styles.profileInput}
              value={draftEmail}
              onChange={e => setDraftEmail(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        <div className={styles.profileActions}>
          <Button size="sm" variant="primary" onClick={handleProfileSave} disabled={profileSaving || !canSave}>
            {profileSaving ? '…' : 'Сохранить'}
          </Button>
          <Button size="sm" variant="outline" onClick={closeProfile} disabled={profileSaving}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  const columns: Column<AdminUser>[] = [
    { key: 'username', header: 'Логин' },
    { key: 'email', header: 'Email', render: v => (v ? String(v) : '—') },
    {
      key: 'createdAt',
      header: 'Создан',
      render: v => (v ? new Date(String(v)).toLocaleString('ru-RU') : '—'),
    },
    { key: 'roles', header: 'Роли', render: (_, row) => renderRoles(row) },
    { key: 'id', header: 'ID', mono: true, render: v => String(v).slice(0, 8) + '…' },
    { key: '_actions', header: 'Действия', render: (_, row) => renderActions(row) },
  ];

  if (loading) {
    return <div className={styles.loading}>Загрузка...</div>;
  }

  if (loadError) {
    return (
      <div className={styles.failed}>
        <div className={styles.errorText}>{loadError}</div>
        <Button variant="outline" size="sm" onClick={() => setTick(t => t + 1)}>Повторить</Button>
      </div>
    );
  }

  return (
    <>
      <form className={styles.createBox} onSubmit={handleCreate}>
        <div className={styles.createLabel}>Создать пользователя</div>
        <div className={styles.createRow}>
          <input
            className={styles.createInput}
            placeholder="логин"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="off"
          />
          <input
            className={styles.createInput}
            placeholder="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="off"
          />
          <input
            className={styles.createInput}
            placeholder="оставьте пустым — сгенерируем"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Button size="sm" variant="primary" type="submit" disabled={createDisabled}>
            {creating ? '…' : 'Создать'}
          </Button>
        </div>
        {createError && <div className={styles.formError}>{createError}</div>}
      </form>
      {banner && (
        <div className={styles.successBanner}>
          <span className={styles.bannerText}>{banner.prefix}</span>
          {banner.code && <code className={styles.bannerCode}>{banner.code}</code>}
          {banner.suffix && <span className={styles.bannerText}>{banner.suffix}</span>}
          <button type="button" className={styles.bannerClose} onClick={() => setBanner(null)} aria-label="Закрыть">
            ×
          </button>
        </div>
      )}
      {saveError && <div className={styles.saveError}>{saveError}</div>}
      {actionError && <div className={styles.saveError}>{actionError}</div>}
      <Table columns={columns} data={users} emptyText="Пользователей нет" />
      {renderProfilePanel()}
    </>
  );
}
