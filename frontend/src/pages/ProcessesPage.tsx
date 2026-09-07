import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card, StatusBadge } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { SkeletonRows } from '../components/Skeleton/Skeleton';
import { Button } from '../components/Button/Button';
import { usePaginatedData } from '../hooks/usePaginatedData';
import type { RecordingProcess as Process } from '../types';
import listStyles from './ListPage.module.css';

function truncate(s: string, max = 60) {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function NameCell({ name, sub, title }: { name: string; sub?: string; title?: string }) {
  return (
    <div className={listStyles.nameCell} title={title}>
      <span className={listStyles.namePrimary}>{name}</span>
      {sub ? <span className={listStyles.nameSub}>{truncate(sub)}</span> : null}
    </div>
  );
}

const columns: Column<Process>[] = [
  {
    key: 'name',
    header: 'Название',
    render: (v, row) => (
      <NameCell
        name={(v as string) ?? `#${row.id.slice(0, 8)}`}
        sub={row.description ?? undefined}
        title={row.description ?? undefined}
      />
    ),
  },
  { key: 'status', header: 'Статус', render: (_, row) => <StatusBadge status={row.status} /> },
  { key: 'startedAt', header: 'Старт', render: v => new Date(v as string).toLocaleString('ru-RU') },
  { key: 'endedAt', header: 'Окончание', render: v => v ? new Date(v as string).toLocaleString('ru-RU') : '—' },
  { key: 'id', header: 'ID', mono: true },
];

export function ProcessesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const endpoint = debouncedQ ? `/processes?q=${encodeURIComponent(debouncedQ)}` : '/processes';
  const { items, total, loading, page, setPage } = usePaginatedData<Process>(endpoint);

  return (
    <Layout>
      <PageHeader title="Записи" action={
        <Button variant="primary" size="sm" onClick={() => navigate('/processes/new')}>Новая запись</Button>
      } />
      <Card>
        <div className={listStyles.searchBar}>
          <input
            className={listStyles.searchInput}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Поиск по названию, описанию…"
            aria-label="Поиск по названию, описанию"
          />
          {q !== '' && (
            <button type="button" className={listStyles.searchClear} onClick={() => setQ('')} aria-label="Очистить поиск">✕</button>
          )}
        </div>
        {loading ? (
          <SkeletonRows rows={8} cols={columns.length} cellWidths={['24%', '44%', '46%', '40%', '26%']} />
        ) : (
          <>
            <Table columns={columns} data={items} emptyText={debouncedQ ? 'Ничего не найдено' : 'Записей нет'} onRowClick={r => navigate(`/processes/${r.id}`)} />
            <Pagination page={page} total={total} pageSize={10} onChange={setPage} />
          </>
        )}
      </Card>
    </Layout>
  );
}
