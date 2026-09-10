import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Table, type Column } from '../Table/Table';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import { useNotify } from '../../notifications';
import { Skeleton, SkeletonRows } from '../Skeleton/Skeleton';
import type {
  AdminGroup,
  AdminGroupObject,
  AdminObject,
  AdminObjectSearchResult,
} from '../../types';
import styles from './GroupsTab.module.css';

/** Типы объектов-кандидатов в поиске состава группы. 'other' — всё кроме камер/потоков/записей. */
const OBJECT_TYPE_FILTERS = [
  { value: '', label: 'все типы' },
  { value: 'device', label: 'камеры' },
  { value: 'stream', label: 'потоки' },
  { value: 'process', label: 'записи' },
  { value: 'other', label: 'иные' },
] as const;

/** Остальные типы objects-каталога — серверный фильтр одиночный, для «иных» сливаем запросы. */
const OTHER_OBJECT_TYPES = ['segment', 'chunk', 'incident'];

const OBJECT_TYPE_LABELS: Record<string, string> = {
  device: 'камера',
  stream: 'поток',
  process: 'запись',
  segment: 'сегмент',
  chunk: 'чанк',
  incident: 'инцидент',
};

function typeLabel(type: string | null) {
  if (!type) return 'объект';
  return OBJECT_TYPE_LABELS[type] ?? type;
}

function shortId(id: string) {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function objectDisplayName(name: string | null, id: string) {
  return name ? name : `#${id}`;
}

export function GroupsTab() {
  const { capabilities } = useAuth();
  const { toast } = useNotify();
  const canReadObjectCatalog = capabilities.includes('permission:read');
  const canManageComposition = capabilities.includes('permission:manage');
  const canCreateGroup = capabilities.includes('group:create');
  const canUpdateGroup = capabilities.includes('group:update');
  const canDeleteGroup = capabilities.includes('group:delete');
  const [groups, setGroups] = useState<AdminGroup[]>([]);
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

  // --- Состав группы: черновик участников + поиск кандидатов ---
  const [composingId, setComposingId] = useState<string | null>(null);
  const [members, setMembers] = useState<AdminGroupObject[]>([]);
  /** true после успешной GET-загрузки участников — иначе PUT по пустому списку сотрёт состав. */
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [compLoading, setCompLoading] = useState(false);
  const [compSaving, setCompSaving] = useState(false);
  const [compError, setCompError] = useState('');
  const compRequestId = useRef(0);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<AdminObject[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    apiFetch('/admin/groups')
      .then(async r => {
        if (!r.ok) throw new Error(`Ошибка загрузки (${r.status})`);
        return (await r.json()) as AdminGroup[];
      })
      .then(data => {
        if (!cancelled) setGroups(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);

  useEffect(() => () => {
    compRequestId.current++;
    searchSeq.current++;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
  }, []);

  function cancelSearch() {
    searchSeq.current++;
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    setQuery('');
    setTypeFilter('');
    setSearchResults([]);
    setSearchTotal(0);
    setSearchError('');
    setSearchLoading(false);
  }

  function closeComposition() {
    compRequestId.current++;
    cancelSearch();
    setComposingId(null);
    setMembers([]);
    setMembersLoaded(false);
    setCompLoading(false);
    setCompSaving(false);
    setCompError('');
  }

  async function loadCandidates(q: string, type: string): Promise<AdminObjectSearchResult> {
    const loadOne = async (t: string) => {
      const params = new URLSearchParams({ limit: '50', q });
      if (t !== '') params.set('type', t);
      const r = await apiFetch(`/admin/objects?${params.toString()}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Ошибка загрузки (${r.status})`);
      }
      return (await r.json()) as AdminObjectSearchResult;
    };
    if (type === 'other') {
      const data = await Promise.all(OTHER_OBJECT_TYPES.map(t => loadOne(t)));
      const merged = data
        .flatMap(d => d.objects)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { objects: merged, total: data.reduce((sum, d) => sum + d.total, 0) };
    }
    return loadOne(type);
  }

  // Дебаунс-поиск кандидатов в состав (только пока открыт редактор обычной группы).
  useEffect(() => {
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    const trimmed = query.trim();
    const seq = ++searchSeq.current;
    if (!composingId || !canReadObjectCatalog || trimmed === '') {
      setSearchResults([]);
      setSearchTotal(0);
      setSearchError('');
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = null;
      loadCandidates(trimmed, typeFilter)
        .then(data => {
          if (searchSeq.current !== seq) return;
          setSearchResults(data.objects);
          setSearchTotal(data.total);
        })
        .catch((e: unknown) => {
          if (searchSeq.current !== seq) return;
          setSearchError(e instanceof Error ? e.message : 'Не удалось загрузить объекты');
        })
        .finally(() => {
          if (searchSeq.current === seq) setSearchLoading(false);
        });
    }, 250);
  }, [query, typeFilter, composingId, canReadObjectCatalog]);

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

  function fetchMembers(groupId: string, seq: number) {
    setCompLoading(true);
    setCompError('');
    apiFetch(`/admin/groups/${groupId}/objects`)
      .then(async r => {
        if (r.status === 403) return null;
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'Не удалось загрузить состав');
        }
        return (await r.json()) as AdminGroupObject[];
      })
      .then(objs => {
        if (compRequestId.current !== seq || objs === null) return;
        setMembers(objs);
        setMembersLoaded(true);
      })
      .catch((e: unknown) => {
        if (compRequestId.current !== seq) return;
        const msg = e instanceof Error ? e.message : 'Не удалось загрузить состав';
        setMembersLoaded(false);
        setCompError(msg);
      })
      .finally(() => {
        if (compRequestId.current === seq) setCompLoading(false);
      });
  }

  function openComposition(row: AdminGroup) {
    setRenamingId(null);
    setConfirmDeleteId(null);
    setActionError('');
    cancelSearch();
    const seq = ++compRequestId.current;
    setComposingId(row.id);
    setMembers([]);
    setMembersLoaded(false);
    setCompSaving(false);
    setCompError('');
    // Системная группа — все объекты implicit; состав не читаем и не редактируем.
    if (row.isSystem) {
      setCompLoading(false);
      return;
    }
    fetchMembers(row.id, seq);
  }

  function retryCompositionLoad() {
    if (!composingId) return;
    fetchMembers(composingId, ++compRequestId.current);
  }

  function addMember(obj: AdminObject) {
    if (members.some(m => m.objectId === obj.id)) return;
    setMembers(prev => [...prev, { objectId: obj.id, name: obj.name, type: obj.type, description: obj.description }]);
  }

  function removeMember(objectId: string) {
    setMembers(prev => prev.filter(m => m.objectId !== objectId));
  }

  async function handleCompositionSave() {
    if (!composingId || compSaving || !canManageComposition) return;
    if (!membersLoaded) {
      setCompError('состав не загружен, изменения не отправлены — повторите загрузку');
      return;
    }
    setCompSaving(true);
    setCompError('');
    try {
      const r = await apiFetch(`/admin/groups/${composingId}/objects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectIds: members.map(m => m.objectId) }),
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
      // PUT — атомарная замена: сервер не изменился, локальный черновик — безопасный
      // набор для повторного «Сохранить» (inline-ошибка остаётся видимой).
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
        {!row.isSystem && (
          <>
            {canUpdateGroup && (
              <Button size="sm" variant="outline" onClick={() => startRename(row)}>
                Переименовать
              </Button>
            )}
            {canDeleteGroup && (
              <Button size="sm" variant="outline" onClick={() => askDelete(row)}>
                Удалить
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  function renderMemberSearch() {
    const trimmed = query.trim();
    const memberIds = new Set(members.map(m => m.objectId));
    return (
      <>
        <div className={styles.searchLabel}>Добавить объект</div>
        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            placeholder="имя или uuid объекта"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
          <select
            className={styles.searchSelect}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            aria-label="Тип объекта"
          >
            {OBJECT_TYPE_FILTERS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        {searchError && <div className={styles.saveError}>{searchError}</div>}
        {searchLoading ? (
          <div className={styles.searchStatus}>поиск…</div>
        ) : trimmed === '' ? (
          <div className={styles.searchStatus}>начните вводить имя или часть uuid объекта</div>
        ) : searchResults.length === 0 ? (
          <div className={styles.searchStatus}>ничего не найдено</div>
        ) : (
          <>
            <div className={styles.searchCount}>найдено: {searchTotal}</div>
            <div className={styles.miniTableWrap}>
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th>Объект</th>
                    <th>Тип</th>
                    <th>ID</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(obj => {
                    const already = memberIds.has(obj.id);
                    return (
                      <tr key={obj.id}>
                        <td className={styles.objectNameCell}>{objectDisplayName(obj.name, obj.id)}</td>
                        <td><span className={styles.typeChip}>{typeLabel(obj.type)}</span></td>
                        <td><span className={styles.monoId}>{shortId(obj.id)}</span></td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={already}
                            onClick={() => addMember(obj)}
                          >
                            {already ? 'добавлено' : 'Добавить'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    );
  }

  function renderComposition() {
    const group = groups.find(g => g.id === composingId);
    if (!group) return null;
    if (group.isSystem) {
      return (
        <div className={styles.compBlock}>
          <div className={styles.compHead}>
            <div className={styles.compTitle}>
              Состав группы: <span className={styles.compGroupName}>{group.name}</span>
            </div>
            <span className={styles.systemBadge}>системная</span>
          </div>
          <div className={styles.systemBanner}>
            в эту группу автоматически входят все объекты системы — текущие и будущие;
            состав не редактируется
          </div>
          <div className={styles.compActions}>
            <Button size="sm" variant="outline" onClick={closeComposition}>
              Закрыть
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.compBlock}>
        <div className={styles.compHead}>
          <div className={styles.compTitle}>
            Состав группы: <span className={styles.compGroupName}>{group.name}</span>
          </div>
          <div className={styles.compHint}>
            объекты добавляются поиском; изменения применяются по «Сохранить»
          </div>
        </div>
        {compError && !membersLoaded && (
          // Состав не загружен: PUT по пустому черновику сотрёт группу — показываем retry-блок.
          <div className={styles.compFail}>
            <div className={styles.compFailText}>{compError}</div>
            <div className={styles.compFailActions}>
              <Button size="sm" variant="outline" onClick={retryCompositionLoad}>
                Повторить загрузку
              </Button>
            </div>
          </div>
        )}
        {compLoading ? (
          <SkeletonRows rows={3} cols={3} cellWidths={['44%', '18%', '28%']} />
        ) : membersLoaded ? (
          <>
            {compError && <div className={styles.saveError}>{compError}</div>}
            <div className={styles.searchLabel}>В группе ({members.length})</div>
            {members.length === 0 ? (
              <div className={styles.noGroups}>В группе нет объектов</div>
            ) : (
              <div className={styles.miniTableWrap}>
                <table className={styles.miniTable}>
                  <thead>
                    <tr>
                      <th>Объект</th>
                      <th>Тип</th>
                      <th>ID</th>
                      {canManageComposition && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.objectId}>
                        <td className={styles.objectNameCell}>{objectDisplayName(m.name, m.objectId)}</td>
                        <td><span className={styles.typeChip}>{typeLabel(m.type)}</span></td>
                        <td><span className={styles.monoId}>{shortId(m.objectId)}</span></td>
                        {canManageComposition && (
                          <td>
                            <Button size="sm" variant="outline" onClick={() => removeMember(m.objectId)}>
                              Убрать
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canReadObjectCatalog && canManageComposition && renderMemberSearch()}
            <div className={styles.compActions}>
              {canManageComposition && (
                <Button size="sm" variant="primary" onClick={handleCompositionSave} disabled={compSaving}>
                  {compSaving ? '…' : 'Сохранить'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={closeComposition} disabled={compSaving}>
                {canManageComposition ? 'Отмена' : 'Закрыть'}
              </Button>
            </div>
          </>
        ) : null}
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
          <>
            <span className={styles.groupName}>{String(row.name)}</span>
            {row.isSystem && <span className={styles.systemBadge}>системная</span>}
          </>
        ),
    },
    {
      key: 'objectCount',
      header: 'Объектов',
      render: (_, row) => (row.isSystem ? 'все' : String(row.objectCount)),
    },
    { key: '_actions', header: 'Действия', render: (_, row) => renderActions(row) },
  ];

  return (
    <>
      {canCreateGroup && (
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
      )}
      {actionError && <div className={styles.saveError}>{actionError}</div>}
      <Table columns={columns} data={groups} emptyText="Групп нет" />
      {renderComposition()}
    </>
  );
}
