import { useEffect, useState } from 'react';
import { Table, type Column } from '../Table/Table';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import type { AdminRole, AdminUser } from '../../types';
import styles from './UsersTab.module.css';

export function UsersTab() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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
      .then(([usersData, rolesData]) => {
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

  function startEdit(target: AdminUser) {
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
      setTick(t => t + 1);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
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
    if (row.roles.length === 0) {
      return <span className={styles.noRoles}>нет ролей</span>;
    }
    return (
      <div className={styles.roleList}>
        {row.roles.map(role => (
          <span key={role.id} className={styles.roleBadge}>{role.name}</span>
        ))}
      </div>
    );
  }

  function renderActions(row: AdminUser) {
    if (row.id === user?.id) {
      return <span className={styles.youMark}>это вы</span>;
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
    return <Button size="sm" variant="outline" onClick={() => startEdit(row)}>Роли</Button>;
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
      {saveError && <div className={styles.saveError}>{saveError}</div>}
      <Table columns={columns} data={users} emptyText="Пользователей нет" />
    </>
  );
}
