import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { SkeletonRows } from '../components/Skeleton/Skeleton';
import { usePaginatedData } from '../hooks/usePaginatedData';
import type { RecordingStream as Stream } from '../types';

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
  const { items, total, loading, page, setPage } = usePaginatedData<Stream>('/streams');
  const navigate = useNavigate();

  return (
    <Layout>
      <PageHeader title="Потоки" />
      <Card>
        {loading ? (
          <SkeletonRows rows={8} cols={columns.length} cellWidths={['46%', '54%', '36%', '26%']} />
        ) : (
          <>
            <Table columns={columns} data={items} emptyText="Потоков нет" onRowClick={r => navigate(`/streams/${r.id}`)} />
            <Pagination page={page} total={total} pageSize={10} onChange={setPage} />
          </>
        )}
      </Card>
    </Layout>
  );
}
