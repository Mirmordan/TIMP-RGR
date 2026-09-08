import { useEffect, useState, type FormEvent } from 'react';
import { Table, type Column } from '../Table/Table';
import { Pagination } from '../Pagination/Pagination';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import { useNotify } from '../../notifications';
import { SkeletonRows } from '../Skeleton/Skeleton';
import { AUDIT_ACTIONS, type AuditClearResponse, type AuditEntry } from '../../types';
import styles from './AuditTab.module.css';

const LIMIT = 10;

function isEmptyDetails(d: Record<string, unknown> | null | undefined): boolean {
  return !d || Object.keys(d).length === 0;
}

/** Дата из <input type=date> → ISO-момент локальной полуночи (UTC через toISOString). */
function dayToIso(day: string, addDays = 0): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + addDays);
  return d.toISOString();
}

export function AuditTab() {
  const { capabilities } = useAuth();
  const { toast } = useNotify();

  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Черновики фильтров (поле ввода) и применённый набор запросов.
  const [actorDraft, setActorDraft] = useState('');
  const [actionDraft, setActionDraft] = useState('');
  const [fromDraft, setFromDraft] = useState('');
  const [toDraft, setToDraft] = useState('');
  const [query, setQuery] = useState({ actor: '', action: '', from: '', to: '' });

  // Очистка старше даты.
  const [clearDate, setClearDate] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');

  const [tick, setTick] = useState(0);

  function buildParams(offset: number): URLSearchParams {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (query.actor.trim() !== '') p.set('actor', query.actor.trim());
    if (query.action !== '') p.set('action', query.action);
    if (query.from !== '') p.set('from', dayToIso(query.from));
    if (query.to !== '') p.set('to', dayToIso(query.to, 1));
    return p;
  }

  async function fetchPage(offset: number): Promise<{ events: AuditEntry[]; total: number }> {
    const res = await apiFetch(`/admin/audit?${buildParams(offset).toString()}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Ошибка загрузки (${res.status})`);
    }
    return res.json();
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetchPage((page - 1) * LIMIT)
      .then(pageData => {
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(pageData.total / LIMIT));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setRows(pageData.events);
        setTotal(pageData.total);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page, tick]);

  function applyFilters(e?: FormEvent) {
    e?.preventDefault();
    setPage(1);
    setQuery({ actor: actorDraft, action: actionDraft, from: fromDraft, to: toDraft });
  }

  function requestClear() {
    if (!clearDate || clearing) return;
    setClearError('');
    setConfirmClear(true);
  }

  async function doClear() {
    if (!clearDate || clearing) return;
    setClearing(true);
    setClearError('');
    try {
      const res = await apiFetch(`/admin/audit?before=${encodeURIComponent(clearDate)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Не удалось очистить лог');
      }
      const data = (await res.json()) as AuditClearResponse;
      setConfirmClear(false);
      setClearDate('');
      toast.success(`Удалено ${data.deleted} записей`);
      setPage(1);
      setTick(t => t + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось очистить лог';
      setClearError(msg);
    } finally {
      setClearing(false);
    }
  }

  function renderAction(row: AuditEntry) {
    return (
      <div className={styles.actionCell}>
        <span>{row.action}</span>
        {row.targetType && (
          <span className={styles.targetDim}>
            {row.targetType}
            {row.targetId ? `:${String(row.targetId).slice(0, 8)}…` : ''}
          </span>
        )}
      </div>
    );
  }

  function renderDetails(row: AuditEntry) {
    if (isEmptyDetails(row.details)) {
      return <span className={styles.noDetails}>—</span>;
    }
    const compact = JSON.stringify(row.details);
    return (
      <details className={styles.details}>
        <summary className={styles.detailsSummary}>
          {compact.length > 70 ? `${compact.slice(0, 70)}…` : compact}
        </summary>
        <pre className={styles.detailsPre}>{JSON.stringify(row.details, null, 2)}</pre>
      </details>
    );
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: 'createdAt',
      header: 'Время',
      mono: true,
      render: v => (v ? new Date(String(v)).toLocaleString('ru-RU') : '—'),
    },
    {
      key: 'actorName',
      header: 'Актор',
      render: (_, row) =>
        row.actorName ? (
          <span className={styles.actorCell}>
            {row.actorName}
            {!row.actorId && <span className={styles.actorGhost}>аноним</span>}
          </span>
        ) : (
          <span className={styles.noDetails}>—</span>
        ),
    },
    { key: 'action', header: 'Действие', render: (_, row) => renderAction(row) },
    { key: 'details', header: 'Детали', render: (_, row) => renderDetails(row) },
  ];

  const canClear = capabilities.includes('admin:write');

  return (
    <>
      <form className={styles.filters} onSubmit={applyFilters}>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Актор</span>
          <input
            className={styles.input}
            placeholder="часть логина"
            value={actorDraft}
            onChange={e => setActorDraft(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Действие</span>
          <select
            className={styles.input}
            value={actionDraft}
            onChange={e => setActionDraft(e.target.value)}
          >
            <option value="">все</option>
            {AUDIT_ACTIONS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>От</span>
          <input
            type="date"
            className={styles.input}
            value={fromDraft}
            onChange={e => setFromDraft(e.target.value)}
          />
        </div>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>До</span>
          <input
            type="date"
            className={styles.input}
            value={toDraft}
            onChange={e => setToDraft(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" type="submit">
          Применить
        </Button>
      </form>

      {canClear && (
        <div className={styles.clearBox}>
          <div className={styles.clearRow}>
            <span className={styles.clearLabel}>Очистить лог старше</span>
            <input
              type="date"
              className={styles.input}
              value={clearDate}
              onChange={e => {
                setClearDate(e.target.value);
                setConfirmClear(false);
              }}
            />
            {confirmClear ? (
              <div className={styles.clearConfirm}>
                <span className={styles.confirmText}>Удалить все записи старше {clearDate}?</span>
                <Button size="sm" variant="danger" onClick={doClear} disabled={clearing}>
                  {clearing ? '…' : 'Да'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmClear(false)} disabled={clearing}>
                  Нет
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={requestClear} disabled={!clearDate}>
                Удалить…
              </Button>
            )}
          </div>
          {clearError && <div className={styles.errorText}>{clearError}</div>}
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={8} cols={4} cellWidths={['26%', '30%', '60%', '52%']} />
      ) : loadError ? (
        <div className={styles.failed}>
          <div className={styles.errorText}>{loadError}</div>
          <Button variant="outline" size="sm" onClick={() => setTick(t => t + 1)}>
            Повторить
          </Button>
        </div>
      ) : (
        <>
          <Table columns={columns} data={rows} emptyText="Событий нет" />
          <Pagination page={page} total={total} pageSize={LIMIT} onChange={setPage} />
        </>
      )}
    </>
  );
}
