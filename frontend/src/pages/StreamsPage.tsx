import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { SkeletonRows } from '../components/Skeleton/Skeleton';
import { usePaginatedData } from '../hooks/usePaginatedData';
import type { RecordingStream as Stream } from '../types';
import listStyles from './ListPage.module.css';

function truncate(s: string, max = 50) {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

const columns: Column<Stream>[] = [
  { key: 'url', header: 'Источник', render: v => truncate(v as string) },
  { key: 'deviceId', header: 'Устройство', render: v => v ? String(v) : '—' },
  { key: 'sourceFingerprint', header: 'Fingerprint', mono: true, render: v => v ? truncate(String(v), 20) : '—' },
  { key: 'id', header: 'ID', mono: true },
];

export function StreamsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const endpoint = debouncedQ ? `/streams?q=${encodeURIComponent(debouncedQ)}` : '/streams';
  const { items, total, loading, page, setPage } = usePaginatedData<Stream>(endpoint);

  return (
    <Layout>
      <PageHeader title="Потоки" />
      <Card>
        <div className={listStyles.searchBar}>
          <input
            className={listStyles.searchInput}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Поиск по названию…"
            aria-label="Поиск по названию"
          />
          {q !== '' && (
            <button type="button" className={listStyles.searchClear} onClick={() => setQ('')} aria-label="Очистить поиск">✕</button>
          )}
        </div>
        {loading ? (
          <SkeletonRows rows={8} cols={columns.length} cellWidths={['46%', '54%', '36%', '26%']} />
        ) : (
          <>
            <Table columns={columns} data={items} emptyText={debouncedQ ? 'Ничего не найдено' : 'Потоков нет'} onRowClick={r => navigate(`/streams/${r.id}`)} />
            <Pagination page={page} total={total} pageSize={10} onChange={setPage} />
          </>
        )}
      </Card>
    </Layout>
  );
}
