import { useEffect, useState, type FormEvent } from 'react';
import { Table, type Column } from '../Table/Table';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import { useNotify } from '../../notifications';
import { Skeleton, SkeletonRows } from '../Skeleton/Skeleton';
import type { AdminGroup, AdminPermission, AdminRole } from '../../types';
import styles from './RolesTab.module.css';

const SYSTEM_ROLE_NAMES = ['admin', 'operator', 'viewer'];

const ACTIONS = [
  { value: 'read', label: 'просмотр' },
  { value: 'write', label: 'запись' },
  { value: 'delete', label: 'удалить' },
  { value: 'stream', label: 'стрим' },
  { value: 'list', label: 'список' },
] as const;

function entryKey(groupId: string, action: string) {
  return `${groupId}|${action}`;
}

function isSystemRole(role: AdminRole) {
  return SYSTEM_ROLE_NAMES.includes(role.name);
}

export function RolesTab() {
  const { toast } = useNotify();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionError, setActionError] = useState('');

  const [matrixRole, setMatrixRole] = useState<AdminRole | null>(null);
  const [matrixDraft, setMatrixDraft] = useState<Set<string>>(new Set());
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixError, setMatrixError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([
      apiFetch('/admin/roles'),
      apiFetch('/admin/groups'),
      apiFetch('/admin/permissions'),
    ])
      .then(async ([rolesRes, groupsRes, permsRes]) => {
        if (!rolesRes.ok || !groupsRes.ok || !permsRes.ok) {
          throw new Error(`Ошибка загрузки (${rolesRes.status}/${groupsRes.status}/${permsRes.status})`);
        }
        return Promise.all([rolesRes.json(), groupsRes.json(), permsRes.json()]);
      })
      .then(([rolesData, groupsData, permsData]: [AdminRole[], AdminGroup[], AdminPermission[]]) => {
        if (cancelled) return;
        setRoles(rolesData);
        setGroups(groupsData);
        setPermissions(permsData);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const r = await apiFetch('/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось создать');
      }
      setName('');
      toast.success(`Роль «${trimmed}» создана`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось создать';
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  function startRename(row: AdminRole) {
    setRenamingId(row.id);
    setDraftName(row.name);
    setConfirmDeleteId(null);
    setMatrixRole(null);
    setActionError('');
  }

  function cancelRename() {
    setRenamingId(null);
    setActionError('');
  }

  async function handleRenameSave() {
    if (!renamingId) return;
    const trimmed = draftName.trim();
    if (!trimmed || renaming) return;
    setRenaming(true);
    setActionError('');
    try {
      const r = await apiFetch(`/admin/roles/${renamingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось переименовать');
      }
      setRenamingId(null);
      toast.success(`Роль переименована в «${trimmed}»`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось переименовать';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete(row: AdminRole) {
    if (!confirmDeleteId || deleting) return;
    setDeleting(true);
    setActionError('');
    try {
      const r = await apiFetch(`/admin/roles/${row.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось удалить');
      }
      setConfirmDeleteId(null);
      setMatrixRole(prev => (prev?.id === row.id ? null : prev));
      toast.success(`Роль «${row.name}» удалена`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось удалить';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  function openMatrix(row: AdminRole) {
    setRenamingId(null);
    setConfirmDeleteId(null);
    setActionError('');
    setMatrixError('');
    setMatrixRole(row);
    const granted = new Set<string>(
      permissions.filter(p => p.roleId === row.id).map(p => entryKey(p.groupId, p.action)),
    );
    setMatrixDraft(granted);
  }

  function togglePerm(groupId: string, action: string) {
    const key = entryKey(groupId, action);
    setMatrixDraft(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleMatrixSave() {
    if (!matrixRole || matrixSaving) return;
    setMatrixSaving(true);
    setMatrixError('');
    try {
      const entries = [...matrixDraft].map(key => {
        const sep = key.indexOf('|');
        return { groupId: key.slice(0, sep), action: key.slice(sep + 1) };
      });
      const r = await apiFetch(`/admin/roles/${matrixRole.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось сохранить');
      }
      setMatrixRole(null);
      toast.success(`Права роли «${matrixRole.name}» сохранены`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось сохранить';
      setMatrixError(msg);
      toast.error(msg);
    } finally {
      setMatrixSaving(false);
    }
  }

  function renderActions(row: AdminRole) {
    if (row.id === renamingId) {
      return (
        <div className={styles.editorActions}>
          <Button size="sm" variant="primary" onClick={handleRenameSave} disabled={renaming}>
            {renaming ? '…' : 'Сохранить'}
          </Button>
          <Button size="sm" variant="outline" onClick={cancelRename} disabled={renaming}>
            Отмена
          </Button>
        </div>
      );
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
    return (
      <div className={styles.editorActions}>
        <Button size="sm" variant="outline" onClick={() => openMatrix(row)}>
          Права
        </Button>
        {!isSystemRole(row) && (
          <>
            <Button size="sm" variant="outline" onClick={() => startRename(row)}>
              Переименовать
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(row.id)}>
              Удалить
            </Button>
          </>
        )}
      </div>
    );
  }

  function renderMatrix() {
    if (!matrixRole) return null;
    const isAdmin = matrixRole.name === 'admin';
    return (
      <div className={styles.matrixBlock}>
        <div className={styles.matrixHead}>
          <div className={styles.matrixTitle}>
            Права роли: <span className={styles.matrixRoleName}>{matrixRole.name}</span>
          </div>
          {isAdmin ? (
            <div className={styles.matrixHint}>admin — полный доступ, матрица не сохраняется</div>
          ) : (
            <div className={styles.matrixHint}>отметьте действия для каждой группы</div>
          )}
        </div>
        {matrixError && <div className={styles.saveError}>{matrixError}</div>}
        {groups.length === 0 ? (
          <div className={styles.noGroups}>Групп нет</div>
        ) : (
          <div className={styles.matrixWrap}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th>Группа</th>
                  {ACTIONS.map(a => (
                    <th key={a.value}>{a.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.id}>
                    <td className={styles.groupCell}>
                      {g.name}
                      {g.objectCount > 0 && <span className={styles.groupCount}>({g.objectCount})</span>}
                    </td>
                    {ACTIONS.map(a => (
                      <td key={a.value} className={styles.permCell}>
                        <input
                          type="checkbox"
                          className={styles.permCheck}
                          checked={isAdmin || matrixDraft.has(entryKey(g.id, a.value))}
                          disabled={isAdmin}
                          onChange={() => togglePerm(g.id, a.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.matrixActions}>
          {!isAdmin && (
            <Button size="sm" variant="primary" onClick={handleMatrixSave} disabled={matrixSaving}>
              {matrixSaving ? '…' : 'Сохранить'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setMatrixRole(null)} disabled={matrixSaving}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <div className={styles.createBox}>
          <div className={styles.createLabel}>
            <Skeleton width={110} height={10} />
          </div>
          <div className={styles.createRow}>
            <Skeleton style={{ flex: '1 1 0%' }} height={30} />
            <Skeleton width={96} height={26} />
          </div>
        </div>
        <SkeletonRows
          rows={7}
          cols={4}
          cellWidths={['46%', '40%', '36%', '72%']}
        />
      </>
    );
  }

  if (loadError) {
    return (
      <div className={styles.failed}>
        <div className={styles.errorText}>{loadError}</div>
        <Button variant="outline" size="sm" onClick={() => setTick(t => t + 1)}>Повторить</Button>
      </div>
    );
  }

  const columns: Column<AdminRole>[] = [
    {
      key: 'name',
      header: 'Имя',
      render: (_, row) =>
        row.id === renamingId ? (
          <input
            className={styles.nameInput}
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameSave();
              if (e.key === 'Escape') cancelRename();
            }}
          />
        ) : (
          String(row.name)
        ),
    },
    {
      key: 'createdAt',
      header: 'Создан',
      render: v => (v ? new Date(String(v)).toLocaleString('ru-RU') : '—'),
    },
    {
      key: 'type',
      header: 'Тип',
      render: (_, row) => (
        <span className={isSystemRole(row) ? styles.systemBadge : styles.roleBadge}>
          {isSystemRole(row) ? 'системная' : 'роль'}
        </span>
      ),
    },
    { key: '_actions', header: 'Действия', render: (_, row) => renderActions(row) },
  ];

  return (
    <>
      <form className={styles.createBox} onSubmit={handleCreate}>
        <div className={styles.createLabel}>Новая роль</div>
        <div className={styles.createRow}>
          <input
            className={styles.createInput}
            placeholder="имя роли"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Button size="sm" variant="primary" type="submit" disabled={creating || !name.trim()}>
            {creating ? '…' : 'Создать'}
          </Button>
        </div>
        {createError && <div className={styles.formError}>{createError}</div>}
      </form>
      {actionError && <div className={styles.saveError}>{actionError}</div>}
      <Table columns={columns} data={roles} emptyText="Ролей нет" />
      {renderMatrix()}
    </>
  );
}
