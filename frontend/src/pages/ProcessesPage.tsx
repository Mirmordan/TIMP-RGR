import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card, StatusBadge } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { SkeletonRows } from '../components/Skeleton/Skeleton';
import { Button } from '../components/Button/Button';
import { usePaginatedData } from '../hooks/usePaginatedData';
import type { RecordingProcess as Process } from '../types';

const columns: Column<Process>[] = [
  { key: 'status', header: 'Статус', render: (_, row) => <StatusBadge status={row.status} /> },
  { key: 'streamId', header: 'Поток', mono: true, render: v => (v as string).slice(0, 8) + '...' },
  { key: 'startedAt', header: 'Старт', render: v => new Date(v as string).toLocaleString('ru-RU') },
  { key: 'endedAt', header: 'Окончание', render: v => v ? new Date(v as string).toLocaleString('ru-RU') : '—' },
  { key: 'id', header: 'ID', mono: true },
];

export function ProcessesPage() {
  const { items, total, loading, page, setPage } = usePaginatedData<Process>('/processes');
  const navigate = useNavigate();

  return (
    <Layout>
      <PageHeader title="Записи" action={
        <Button variant="primary" size="sm" onClick={() => navigate('/processes/new')}>Новая запись</Button>
      } />
      <Card>
        {loading ? (
          <SkeletonRows rows={8} cols={columns.length} cellWidths={['24%', '44%', '46%', '40%', '26%']} />
        ) : (
          <>
            <Table columns={columns} data={items} emptyText="Записей нет" onRowClick={r => navigate(`/processes/${r.id}`)} />
            <Pagination page={page} total={total} pageSize={10} onChange={setPage} />
          </>
        )}
      </Card>
    </Layout>
  );
}
