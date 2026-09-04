import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Table, type Column } from '../Table/Table';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import { useNotify } from '../../notifications';
import { Skeleton, SkeletonRows } from '../Skeleton/Skeleton';
import type { AdminGroup, AdminGroupObject, RecordingDevice } from '../../types';
import styles from './GroupsTab.module.css';

export function GroupsTab() {
  const { toast } = useNotify();
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [devices, setDevices] = useState<RecordingDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);
  const devicesLoaded = useRef(false);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionError, setActionError] = useState('');

  const [composingId, setComposingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compLoading, setCompLoading] = useState(false);
  const [compSaving, setCompSaving] = useState(false);
  const [compError, setCompError] = useState('');
  const compRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const needDevices = !devicesLoaded.current;
    const devicesTask = needDevices ? apiFetch('/devices?limit=100') : Promise.resolve(null);
    Promise.all([apiFetch('/admin/groups'), devicesTask])
      .then(async ([groupsRes, devicesRes]) => {
        const failed: string[] = [];
        if (!groupsRes.ok) failed.push(String(groupsRes.status));
        if (devicesRes && !devicesRes.ok) failed.push(String(devicesRes.status));
        if (failed.length > 0) {
          throw new Error(`Ошибка загрузки (${failed.join('/')})`);
        }
        const groupsData = (await groupsRes.json()) as AdminGroup[];
        let devicesData: RecordingDevice[] = [];
        if (devicesRes) {
          const data = (await devicesRes.json()) as { devices?: RecordingDevice[] };
          devicesData = data.devices ?? [];
        }
        return { groupsData, devicesData, needDevices };
      })
      .then(({ groupsData, devicesData, needDevices: fetchedDevices }) => {
        if (cancelled) return;
        setGroups(groupsData);
        if (fetchedDevices) {
          setDevices(devicesData);
          devicesLoaded.current = true;
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);

  function closeComposition() {
    compRequestId.current++;
    setComposingId(null);
    setCompError('');
    setCompLoading(false);
    setCompSaving(false);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const r = await apiFetch('/admin/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось создать');
      }
      setName('');
      toast.success(`Группа «${trimmed}» создана`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось создать';
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  function startRename(row: AdminGroup) {
    closeComposition();
    setConfirmDeleteId(null);
    setRenamingId(row.id);
    setDraftName(row.name);
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
      const r = await apiFetch(`/admin/groups/${renamingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось переименовать');
      }
      setRenamingId(null);
      toast.success(`Группа переименована в «${trimmed}»`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось переименовать';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setRenaming(false);
    }
  }

  function askDelete(row: AdminGroup) {
    closeComposition();
    setRenamingId(null);
    setConfirmDeleteId(row.id);
    setActionError('');
  }

  async function handleDelete(row: AdminGroup) {
    if (!confirmDeleteId || deleting) return;
    setDeleting(true);
    setActionError('');
    try {
      const r = await apiFetch(`/admin/groups/${row.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось удалить');
      }
      setConfirmDeleteId(null);
      toast.success(`Группа «${row.name}» удалена`);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось удалить';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  function openComposition(row: AdminGroup) {
    setRenamingId(null);
    setConfirmDeleteId(null);
    setActionError('');
    const reqId = ++compRequestId.current;
    setComposingId(row.id);
    setCompError('');
    setCompSaving(false);
    setSelected(new Set());
    setCompLoading(true);
    apiFetch(`/admin/groups/${row.id}/objects`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'Не удалось загрузить состав');
        }
        return (await r.json()) as AdminGroupObject[];
      })
      .then(objs => {
        if (compRequestId.current !== reqId) return;
        setSelected(new Set(objs.map(o => o.objectId)));
      })
      .catch((e: unknown) => {
        if (compRequestId.current === reqId) {
          const msg = e instanceof Error ? e.message : 'Не удалось загрузить состав';
          setCompError(msg);
          toast.error(msg);
        }
      })
      .finally(() => {
        if (compRequestId.current === reqId) setCompLoading(false);
      });
  }

  function toggleDevice(deviceId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  }

  async function handleCompositionSave() {
    if (!composingId || compSaving) return;
    setCompSaving(true);
    setCompError('');
    try {
      const r = await apiFetch(`/admin/groups/${composingId}/objects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectIds: [...selected] }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось сохранить');
      }
      closeComposition();
      toast.success('Состав группы сохранён');
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось сохранить';
      setCompError(msg);
      toast.error(msg);
    } finally {
      setCompSaving(false);
    }
  }

  function renderActions(row: AdminGroup) {
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
        <Button size="sm" variant="outline" onClick={() => openComposition(row)}>
          Состав
        </Button>
        <Button size="sm" variant="outline" onClick={() => startRename(row)}>
          Переименовать
        </Button>
        <Button size="sm" variant="outline" onClick={() => askDelete(row)}>
          Удалить
        </Button>
      </div>
    );
  }

  function renderComposition() {
    const group = groups.find(g => g.id === composingId);
    if (!group) return null;
    return (
      <div className={styles.compBlock}>
        <div className={styles.compHead}>
          <div className={styles.compTitle}>
            Состав группы: <span className={styles.compGroupName}>{group.name}</span>
          </div>
          <div className={styles.compHint}>отметьте устройства, входящие в группу</div>
        </div>
        {compError && <div className={styles.saveError}>{compError}</div>}
        {compLoading ? (
          <div className={styles.compGrid} aria-hidden="true">
            <Skeleton width={150} height={24} />
            <Skeleton width={110} height={24} />
            <Skeleton width={180} height={24} />
            <Skeleton width={130} height={24} />
            <Skeleton width={160} height={24} />
            <Skeleton width={190} height={24} />
          </div>
        ) : (
          <>
            {devices.length === 0 ? (
              <div className={styles.noDevices}>Устройств нет</div>
            ) : (
              <div className={styles.compGrid}>
                {devices.map(device => (
                  <label key={device.id} className={styles.deviceOption}>
                    <input
                      type="checkbox"
                      className={styles.deviceCheck}
                      checked={selected.has(device.id)}
                      onChange={() => toggleDevice(device.id)}
                    />
                    <span className={styles.deviceName}>{device.name}</span>
                    <span className={styles.deviceType}>{device.type}</span>
                  </label>
                ))}
              </div>
            )}
            <div className={styles.compActions}>
              <Button size="sm" variant="primary" onClick={handleCompositionSave} disabled={compSaving}>
                {compSaving ? '…' : 'Сохранить'}
              </Button>
              <Button size="sm" variant="outline" onClick={closeComposition} disabled={compSaving}>
                Отмена
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <div className={styles.createBox}>
          <div className={styles.createLabel}>
            <Skeleton width={130} height={10} />
          </div>
          <div className={styles.createRow}>
            <Skeleton style={{ flex: '1 1 0%' }} height={30} />
            <Skeleton width={96} height={26} />
          </div>
        </div>
        <SkeletonRows
          rows={7}
          cols={3}
          cellWidths={['48%', '26%', '72%']}
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

  const columns: Column<AdminGroup>[] = [
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
    { key: 'objectCount', header: 'Объектов', render: v => String(v) },
    { key: '_actions', header: 'Действия', render: (_, row) => renderActions(row) },
  ];

  return (
    <>
      <form className={styles.createBox} onSubmit={handleCreate}>
        <div className={styles.createLabel}>Новая группа</div>
        <div className={styles.createRow}>
          <input
            className={styles.createInput}
            placeholder="имя группы"
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
      <Table columns={columns} data={groups} emptyText="Групп нет" />
      {renderComposition()}
    </>
  );
}
