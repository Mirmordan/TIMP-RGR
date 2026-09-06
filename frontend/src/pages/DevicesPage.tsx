import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { SkeletonRows } from '../components/Skeleton/Skeleton';
import { Button } from '../components/Button/Button';
import { usePaginatedData } from '../hooks/usePaginatedData';
import type { RecordingDevice as Device } from '../types';
import listStyles from './ListPage.module.css';

const columns: Column<Device>[] = [
  { key: 'name', header: 'Название' },
  { key: 'type', header: 'Тип' },
  { key: 'id', header: 'ID', mono: true },
  { key: 'createdAt', header: 'Создан', render: v => new Date(v as string).toLocaleDateString('ru-RU') },
];

export function DevicesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const endpoint = debouncedQ ? `/devices?q=${encodeURIComponent(debouncedQ)}` : '/devices';
  const { items, total, loading, page, setPage } = usePaginatedData<Device>(endpoint);

  return (
    <Layout>
      <PageHeader title="Устройства" action={
        <Button variant="primary" size="sm" onClick={() => navigate('/devices/new')}>＋ Создать устройство</Button>
      } />
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
          <SkeletonRows rows={8} cols={columns.length} cellWidths={['56%', '30%', '44%', '48%']} />
        ) : (
          <>
            <Table columns={columns} data={items} emptyText={debouncedQ ? 'Ничего не найдено' : 'Устройств нет'} onRowClick={r => navigate(`/devices/${r.id}`)} />
            <Pagination page={page} total={total} pageSize={10} onChange={setPage} />
          </>
        )}
      </Card>
    </Layout>
  );
}
