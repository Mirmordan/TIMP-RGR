import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Table, type Column } from '../Table/Table';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import { useNotify } from '../../notifications';
import { Skeleton, SkeletonRows } from '../Skeleton/Skeleton';
import type {
  AdminCapabilityInfo,
  AdminGroup,
  AdminObject,
  AdminObjectGrant,
  AdminObjectSearchResult,
  AdminPermission,
  AdminRole,
  AdminUser,
} from '../../types';
import styles from './RolesTab.module.css';

const SYSTEM_ROLE_NAMES = ['admin', 'operator', 'viewer'];

const ACTIONS = [
  { value: 'read', label: 'просмотр' },
  { value: 'write', label: 'запись' },
  { value: 'delete', label: 'удалить' },
  { value: 'stream', label: 'стрим' },
  { value: 'list', label: 'список' },
] as const;

/** Типы объектов-кандидатов в поиске прямых выдач. 'other' — всё кроме камер/потоков/записей. */
const OBJECT_TYPE_FILTERS = [
  { value: '', label: 'все типы' },
  { value: 'device', label: 'камеры' },
  { value: 'stream', label: 'потоки' },
  { value: 'process', label: 'записи' },
  { value: 'other', label: 'иные' },
] as const;

/** Остальные типы objects-каталога — серверный фильтр одиночный, для «иных» сливаем запросы. */
const OTHER_OBJECT_TYPES = ['segment', 'chunk', 'incident'];

/** Порядок и заголовки рубрик каталога спец-прав (код группируется по префиксу). */
const CAP_GROUP_ORDER = [
  'Администрирование',
  'Пользователи',
  'Роли',
  'Группы',
  'Права доступа',
  'Аудит',
  'Создание объектов',
  'Экспорт',
];

function capabilityGroupTitle(code: string): string {
  const prefix = code.split(':')[0];
  if (['camera', 'stream', 'process', 'chunk'].includes(prefix)) return 'Создание объектов';
  const byPrefix: Record<string, string> = {
    admin: 'Администрирование',
    user: 'Пользователи',
    role: 'Роли',
    group: 'Группы',
    permission: 'Права доступа',
    audit: 'Аудит',
    media: 'Экспорт',
  };
  return byPrefix[prefix] ?? 'Прочее';
}

/** Каталог спец-прав, разложенный по рубрикам в фиксированном порядке. */
function groupCapsCatalog(catalog: AdminCapabilityInfo[]): Array<{ title: string; items: AdminCapabilityInfo[] }> {
  const byGroup = new Map<string, AdminCapabilityInfo[]>();
  for (const item of catalog) {
    const title = capabilityGroupTitle(item.code);
    const list = byGroup.get(title);
    if (list) list.push(item);
    else byGroup.set(title, [item]);
  }
  const ordered: string[] = [];
  for (const title of CAP_GROUP_ORDER) if (byGroup.has(title)) ordered.push(title);
  for (const title of byGroup.keys()) if (!ordered.includes(title)) ordered.push(title);
  return ordered.map(title => ({ title, items: byGroup.get(title) ?? [] }));
}

const OBJECT_TYPE_LABELS: Record<string, string> = {
  device: 'камера',
  stream: 'поток',
  process: 'запись',
  segment: 'сегмент',
  chunk: 'чанк',
  incident: 'инцидент',
};

function entryKey(groupId: string, action: string) {
  return `${groupId}|${action}`;
}

function isSystemRole(role: AdminRole) {
  return SYSTEM_ROLE_NAMES.includes(role.name);
}

function isAdminRole(role: AdminRole) {
  return role.name === 'admin';
}

function actionLabel(action: string) {
  return ACTIONS.find(a => a.value === action)?.label ?? action;
}

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

interface LocalGrant {
  objectId: string;
  objectType: string | null;
  objectName: string | null;
  action: string;
}

function grantKey(g: Pick<LocalGrant, 'objectId' | 'action'>) {
  return `${g.objectId}|${g.action}`;
}

export function RolesTab() {
  const { capabilities } = useAuth();
  const { toast } = useNotify();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);

  // Спец-права видит только admin:read, каталог читается под role:read,
  // изменение требует admin:write (gates зеркалят права backend-эндпоинтов).
  const canViewSpecialCaps = capabilities.includes('admin:read');
  const canReadSpecialCaps = canViewSpecialCaps && capabilities.includes('role:read');
  const canManageSpecialCaps = capabilities.includes('admin:write');

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionError, setActionError] = useState('');

  // --- Карточка роли: пользователи + матрица групп + прямые выдачи ---
  const [activeRole, setActiveRole] = useState<AdminRole | null>(null);
  const [matrixDraft, setMatrixDraft] = useState<Set<string>>(new Set());
  const [matrixError, setMatrixError] = useState('');

  const [roleUsers, setRoleUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  const [grants, setGrants] = useState<LocalGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsError, setGrantsError] = useState('');
  /** true после успешной GET-загрузки прямых выдач — иначе PUT по пустому списку сотрёт их. */
  const [grantsLoaded, setGrantsLoaded] = useState(false);

  // --- Спец-права (system capabilities) роли: каталог + черновик выданных кодов ---
  const [capsCatalog, setCapsCatalog] = useState<AdminCapabilityInfo[]>([]);
  const [capsDraft, setCapsDraft] = useState<Set<string>>(new Set());
  const [capsLoading, setCapsLoading] = useState(false);
  const [capsError, setCapsError] = useState('');
  /** true после успешной GET-загрузки спец-прав роли — иначе PUT по пустому Set сотрёт их. */
  const [capsLoaded, setCapsLoaded] = useState(false);

  const [detailSaving, setDetailSaving] = useState(false);
  const detailSeq = useRef(0);

  // --- Поиск объектов для прямых выдач ---
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<AdminObject[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [rowActions, setRowActions] = useState<Record<string, string>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

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

  // Каталог спец-прав — статичный; грузится вместе со списками, повторно на перезагрузках.
  useEffect(() => {
    if (!canReadSpecialCaps) return;
    let cancelled = false;
    apiFetch('/admin/capabilities')
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Ошибка загрузки (${r.status})`);
        }
        return (await r.json()) as AdminCapabilityInfo[];
      })
      .then(data => {
        if (!cancelled) setCapsCatalog(data);
      })
      .catch(() => {
        // Без каталога секция спец-прав просто не отобразится (без шумных тостов).
        if (!cancelled) setCapsCatalog([]);
      });
    return () => { cancelled = true; };
  }, [tick, canReadSpecialCaps]);

  useEffect(() => () => {
    detailSeq.current++;
    searchSeq.current++;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
  }, []);

  async function fetchObjects(q: string, type: string): Promise<AdminObjectSearchResult> {
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

  // Дебаунс-поиск объектов для блока «Прямой доступ».
  useEffect(() => {
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    if (!activeRole || isAdminRole(activeRole)) {
      searchSeq.current++;
      setSearchResults([]);
      setSearchTotal(0);
      setSearchError('');
      setSearchLoading(false);
      return;
    }
    const trimmed = query.trim();
    const seq = ++searchSeq.current;
    if (trimmed === '') {
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
      fetchObjects(trimmed, typeFilter)
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
  }, [query, typeFilter, activeRole]);

  function closeRole() {
    detailSeq.current++;
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    setActiveRole(null);
    setMatrixError('');
    setDetailSaving(false);
  }

  function fetchRoleGrants(roleId: string, seq: number) {
    setGrantsLoading(true);
    setGrantsError('');
    apiFetch(`/admin/roles/${roleId}/grants`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Ошибка загрузки (${r.status})`);
        }
        return (await r.json()) as AdminObjectGrant[];
      })
      .then(rows => {
        if (detailSeq.current !== seq) return;
        setGrants(rows.map(g => ({ objectId: g.objectId, objectType: g.objectType, objectName: g.objectName, action: g.action })));
        setGrantsLoaded(true);
      })
      .catch((e: unknown) => {
        if (detailSeq.current !== seq) return;
        const msg = e instanceof Error ? e.message : 'Не удалось загрузить прямые доступы';
        setGrantsLoaded(false);
        setGrantsError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (detailSeq.current === seq) setGrantsLoading(false);
      });
  }

  function retryGrantsLoad() {
    if (!activeRole) return;
    const seq = ++detailSeq.current;
    fetchRoleGrants(activeRole.id, seq);
  }

  function fetchRoleCaps(roleId: string, seq: number) {
    setCapsLoading(true);
    setCapsError('');
    apiFetch(`/admin/roles/${roleId}/capabilities`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Ошибка загрузки (${r.status})`);
        }
        return (await r.json()) as string[];
      })
      .then(codes => {
        if (detailSeq.current !== seq) return;
        setCapsDraft(new Set(codes));
        setCapsLoaded(true);
      })
      .catch((e: unknown) => {
        if (detailSeq.current !== seq) return;
        const msg = e instanceof Error ? e.message : 'Не удалось загрузить спец-права';
        setCapsLoaded(false);
        setCapsError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (detailSeq.current === seq) setCapsLoading(false);
      });
  }

  function retryCapsLoad() {
    if (!activeRole) return;
    const seq = ++detailSeq.current;
    fetchRoleCaps(activeRole.id, seq);
  }

  function toggleCap(code: string) {
    setCapsDraft(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function openRole(row: AdminRole) {
    setRenamingId(null);
    setConfirmDeleteId(null);
    setActionError('');
    const granted = new Set<string>(
      permissions.filter(p => p.roleId === row.id).map(p => entryKey(p.groupId, p.action)),
    );
    setActiveRole(row);
    setMatrixDraft(granted);
    setMatrixError('');
    setDetailSaving(false);
    setRoleUsers([]);
    setUsersError('');
    setGrants([]);
    setGrantsLoaded(false);
    setGrantsError('');
    setCapsDraft(new Set());
    setCapsLoaded(false);
    setCapsError('');
    setQuery('');
    setTypeFilter('');
    setRowActions({});

    const seq = ++detailSeq.current;

    setUsersLoading(true);
    apiFetch(`/admin/roles/${row.id}/users?limit=100`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Ошибка загрузки (${r.status})`);
        }
        return (await r.json()) as AdminUser[];
      })
      .then(users => {
        if (detailSeq.current !== seq) return;
        setRoleUsers(users);
      })
      .catch((e: unknown) => {
        if (detailSeq.current !== seq) return;
        const msg = e instanceof Error ? e.message : 'Не удалось загрузить пользователей';
        setUsersError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (detailSeq.current === seq) setUsersLoading(false);
      });

    if (canReadSpecialCaps) fetchRoleCaps(row.id, seq);
    if (isAdminRole(row)) {
      // admin — полный доступ, прямые выдачи не редактируются.
      setGrantsLoading(false);
      return;
    }
    fetchRoleGrants(row.id, seq);
  }

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
    closeRole();
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

  function askDelete(row: AdminRole) {
    closeRole();
    setRenamingId(null);
    setActionError('');
    setConfirmDeleteId(row.id);
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

  function addGrant(object: Pick<AdminObject, 'id' | 'type' | 'name'>, action: string) {
    if (!activeRole) return;
    const entry: LocalGrant = { objectId: object.id, objectType: object.type, objectName: object.name, action };
    if (grants.some(g => grantKey(g) === grantKey(entry))) return;
    setGrants(prev => [...prev, entry]);
  }

  function removeGrant(key: string) {
    setGrants(prev => prev.filter(g => grantKey(g) !== key));
  }

  async function handleDetailSave() {
    if (!activeRole || detailSaving) return;
    setDetailSaving(true);
    setMatrixError('');
    setGrantsError('');
    setCapsError('');
    const failures: string[] = [];
    let matrixSaved = false;
    let grantsSaved = false;
    let capsSaved = false;

    // 1) Матрица группового доступа.
    try {
      const entries = [...matrixDraft].map(key => {
        const sep = key.indexOf('|');
        return { groupId: key.slice(0, sep), action: key.slice(sep + 1) };
      });
      const r = await apiFetch(`/admin/roles/${activeRole.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось сохранить групповые права');
      }
      const updated = (await r.json()) as AdminPermission[];
      setPermissions(prev => [...prev.filter(p => p.roleId !== activeRole.id), ...updated]);
      matrixSaved = true;
    } catch (err: unknown) {
      const msg = `групповой доступ: ${err instanceof Error ? err.message : 'ошибка'}`;
      // Матрица осталась локальным черновиком — повторное сохранение безопасно (полная замена).
      setMatrixError(msg);
      failures.push(msg);
    }

    // 2) Прямые выдачи на объекты. PUT — полная замена: без успешной GET-загрузки
    // отправлять список нельзя (пустой grants сотрёт все выдачи роли).
    if (!isAdminRole(activeRole)) {
      if (!grantsLoaded) {
        const msg = 'прямые доступы: список не загружен, изменения не отправлены — повторите загрузку';
        setGrantsError(msg);
        failures.push(msg);
      } else {
        try {
          const r = await apiFetch(`/admin/roles/${activeRole.id}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grants: grants.map(g => ({ objectId: g.objectId, action: g.action })) }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || 'Не удалось сохранить прямые доступы');
          }
          const updated = (await r.json()) as AdminObjectGrant[];
          setGrants(updated.map(g => ({ objectId: g.objectId, objectType: g.objectType, objectName: g.objectName, action: g.action })));
          grantsSaved = true;
        } catch (err: unknown) {
          const msg = `прямые доступы: ${err instanceof Error ? err.message : 'ошибка'}`;
          // PUT — атомарная замена: сервер не изменился, локальный список — безопасный
          // черновик для повторного «Сохранить» (inline-ошибка остаётся видимой).
          setGrantsError(msg);
          failures.push(msg);
        }
      }
    }

    // 3) Спец-права роли (system capabilities). PUT — полная замена: без успешной
    // GET-загрузки не отправляем (пустой Set сотрёт коды); системные роли
    // (admin/operator/viewer) зафиксированы сидом, изменение требует admin:write.
    if (canManageSpecialCaps && !isSystemRole(activeRole)) {
      if (!capsLoaded) {
        const msg = 'спец-права: список не загружен, изменения не отправлены — повторите загрузку';
        setCapsError(msg);
        failures.push(msg);
      } else {
        try {
          const r = await apiFetch(`/admin/roles/${activeRole.id}/capabilities`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capabilities: [...capsDraft] }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || 'Не удалось сохранить спец-права');
          }
          const updated = (await r.json()) as string[];
          setCapsDraft(new Set(updated));
          capsSaved = true;
        } catch (err: unknown) {
          const msg = `спец-права: ${err instanceof Error ? err.message : 'ошибка'}`;
          // PUT — атомарная замена: сервер не изменился, локальный черновик безопасен
          // для повторного «Сохранить» (inline-ошибка остаётся видимой).
          setCapsError(msg);
          failures.push(msg);
        }
      }
    }

    setDetailSaving(false);
    if (failures.length === 0) {
      toast.success(`Роль «${activeRole.name}» обновлена`);
      return;
    }
    const applied = matrixSaved || grantsSaved || capsSaved ? ' Сохранённое уже применено — проверьте ошибки секций и сохраните повторно.' : '';
    toast.error(`${failures.join('; ')}.${applied}`);
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
        <Button size="sm" variant="outline" onClick={() => openRole(row)}>
          Права
        </Button>
        {!isSystemRole(row) && (
          <>
            <Button size="sm" variant="outline" onClick={() => startRename(row)}>
              Переименовать
            </Button>
            <Button size="sm" variant="outline" onClick={() => askDelete(row)}>
              Удалить
            </Button>
          </>
        )}
      </div>
    );
  }

  function renderRoleUsers() {
    return (
      <div className={styles.detailSection}>
        <div className={styles.matrixHead}>
          <div className={styles.matrixTitle}>Пользователи роли</div>
          <div className={styles.matrixHint}>состав меняется во вкладке «Пользователи» → кнопка «Роли»</div>
        </div>
        {usersError ? (
          <div className={styles.noGroups}>{usersError}</div>
        ) : usersLoading ? (
          <SkeletonRows rows={3} cols={3} cellWidths={['30%', '46%', '52%']} />
        ) : roleUsers.length === 0 ? (
          <div className={styles.noGroups}>Пользователей с этой ролью нет</div>
        ) : (
          <div className={styles.miniTableWrap}>
            <table className={styles.miniTable}>
              <thead>
                <tr>
                  <th>Логин</th>
                  <th>Роли</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {roleUsers.map(u => (
                  <tr key={u.id}>
                    <td className={styles.userLogin}>{u.username}</td>
                    <td>
                      <div className={styles.badgeList}>
                        {u.roles.map(r => (
                          <span key={r.id} className={styles.roleBadge}>{r.name}</span>
                        ))}
                      </div>
                    </td>
                    <td>{u.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderMatrix() {
    const role = activeRole;
    if (!role) return null;
    const isAdmin = isAdminRole(role);
    return (
      <div className={styles.detailSection}>
        <div className={styles.matrixHead}>
          <div className={styles.matrixTitle}>Групповой доступ</div>
          <div className={styles.matrixHint}>
            {isAdmin
              ? 'admin — полный доступ, матрица не редактируется'
              : 'права на все объекты групп из вкладки «Группы объектов»'}
          </div>
        </div>
        {isAdmin
          ? null
          : matrixError && <div className={styles.saveError}>{matrixError}</div>}
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
      </div>
    );
  }

  function renderGrantsSearch() {
    const trimmed = query.trim();
    return (
      <>
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
                    <th>Действие</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(obj => {
                    const action = rowActions[obj.id] ?? 'read';
                    const already = grants.some(g => grantKey(g) === `${obj.id}|${action}`);
                    return (
                      <tr key={obj.id}>
                        <td className={styles.objectNameCell}>{objectDisplayName(obj.name, obj.id)}</td>
                        <td><span className={styles.typeChip}>{typeLabel(obj.type)}</span></td>
                        <td><span className={styles.monoId}>{shortId(obj.id)}</span></td>
                        <td>
                          <select
                            className={styles.actionSelect}
                            value={action}
                            onChange={e => setRowActions(prev => ({ ...prev, [obj.id]: e.target.value }))}
                            aria-label="Действие выдачи"
                          >
                            {ACTIONS.map(a => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={already}
                            onClick={() => addGrant(obj, action)}
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

  function renderGrants() {
    const role = activeRole;
    if (!role) return null;
    const isAdmin = isAdminRole(role);
    return (
      <div className={styles.detailSection}>
        <div className={styles.matrixHead}>
          <div className={styles.matrixTitle}>Прямой доступ к объектам</div>
          <div className={styles.matrixHint}>выдачи на отдельные камеры, потоки, записи и другие объекты</div>
        </div>
        {isAdmin ? (
          <div className={styles.fullAccessNote}>
            роли admin не нужны прямые выдачи — полный доступ на все объекты действует всегда
          </div>
        ) : grantsLoading ? (
          <SkeletonRows rows={3} cols={4} cellWidths={['44%', '18%', '22%', '30%']} />
        ) : grantsError && !grantsLoaded ? (
          // Список не загружен: PUT по пустому grants сотрёт выдачи — показываем retry-блок.
          <div className={styles.grantsFail}>
            <div className={styles.grantsFailText}>{grantsError}</div>
            <div className={styles.grantsFailActions}>
              <Button size="sm" variant="outline" onClick={retryGrantsLoad}>
                Повторить загрузку
              </Button>
            </div>
          </div>
        ) : (
          <>
            {grantsError && <div className={styles.saveError}>{grantsError}</div>}
            {grants.length === 0 ? (
              <div className={styles.noGroups}>Прямых доступов нет</div>
            ) : (
              <div className={styles.miniTableWrap}>
                <table className={styles.miniTable}>
                  <thead>
                    <tr>
                      <th>Объект</th>
                      <th>Тип</th>
                      <th>ID</th>
                      <th>Действие</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map(g => (
                      <tr key={grantKey(g)}>
                        <td className={styles.objectNameCell}>{objectDisplayName(g.objectName, g.objectId)}</td>
                        <td><span className={styles.typeChip}>{typeLabel(g.objectType)}</span></td>
                        <td><span className={styles.monoId}>{shortId(g.objectId)}</span></td>
                        <td><span className={styles.actionChip}>{actionLabel(g.action)}</span></td>
                        <td>
                          <Button size="sm" variant="outline" onClick={() => removeGrant(grantKey(g))}>
                            Убрать
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={styles.searchLabel}>Добавить прямой доступ</div>
            {renderGrantsSearch()}
          </>
        )}
      </div>
    );
  }

  function renderSpecialCaps() {
    const role = activeRole;
    if (!role) return null;
    const system = isSystemRole(role);
    const editable = canManageSpecialCaps && !system;
    return (
      <div className={styles.detailSection}>
        <div className={styles.matrixHead}>
          <div className={styles.matrixTitle}>Системные специальные права</div>
          <div className={styles.matrixHint}>
            {system
              ? 'набор системных ролей задан сидом и не редактируется'
              : editable
                ? 'глобальные операции роли — отметьте нужные и сохраните'
                : 'просмотр доступен, изменение требует capability admin:write'}
          </div>
        </div>
        {capsCatalog.length === 0 ? (
          <div className={styles.noGroups}>Каталог спец-прав недоступен</div>
        ) : capsLoading ? (
          <SkeletonRows rows={3} cols={3} cellWidths={['40%', '52%', '52%']} />
        ) : capsError && !capsLoaded ? (
          // Список не загружен: PUT по пустому Set сотрёт коды — показываем retry-блок.
          <div className={styles.grantsFail}>
            <div className={styles.grantsFailText}>{capsError}</div>
            <div className={styles.grantsFailActions}>
              <Button size="sm" variant="outline" onClick={retryCapsLoad}>
                Повторить загрузку
              </Button>
            </div>
          </div>
        ) : (
          <>
            {capsError && <div className={styles.saveError}>{capsError}</div>}
            {groupCapsCatalog(capsCatalog).map(group => (
              <div key={group.title} className={styles.capsGroup}>
                <div className={styles.capsGroupTitle}>{group.title}</div>
                <div className={styles.capsGrid}>
                  {group.items.map(item => {
                    const checked = capsDraft.has(item.code);
                    return (
                      <label key={item.code} className={styles.capsItem} title={item.description}>
                        <input
                          type="checkbox"
                          className={styles.capsCheck}
                          checked={checked}
                          disabled={!editable}
                          onChange={() => toggleCap(item.code)}
                        />
                        <span className={styles.capsLabel}>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  function renderRoleDetail() {
    if (!activeRole) return null;
    const isAdmin = isAdminRole(activeRole);
    return (
      <div className={styles.matrixBlock}>
        <div className={styles.matrixHead}>
          <div className={styles.detailTitleWrap}>
            <span className={styles.matrixTitle}>
              Роль: <span className={styles.matrixRoleName}>{activeRole.name}</span>
            </span>
            <span className={isSystemRole(activeRole) ? styles.systemBadge : styles.roleBadge}>
              {isSystemRole(activeRole) ? 'системная' : 'роль'}
            </span>
          </div>
          <div className={styles.matrixHint}>
            {isAdmin ? 'доступ зашит в систему и не редактируется' : 'отредактируйте доступ и сохраните'}
          </div>
        </div>
        {isAdmin && (
          <div className={styles.fullAccessBanner}>
            <span className={styles.fullAccessBadge}>полный доступ</span>
            роль admin имеет полный доступ ко всем объектам и действиям; прямое редактирование прав, выдач и спец-прав отключено
          </div>
        )}
        {renderRoleUsers()}
        {renderMatrix()}
        {canViewSpecialCaps && renderSpecialCaps()}
        {renderGrants()}
        <div className={styles.matrixActions}>
          {!isAdmin && (
            <Button size="sm" variant="primary" onClick={handleDetailSave} disabled={detailSaving}>
              {detailSaving ? '…' : 'Сохранить'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={closeRole} disabled={detailSaving}>
            Закрыть
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
      {renderRoleDetail()}
    </>
  );
}
