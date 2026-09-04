import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card, StatusBadge } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { Button } from '../components/Button/Button';
import { usePaginatedData } from '../hooks/usePaginatedData';
import styles from './ListPage.module.css';

interface Process {
  id: string;
  streamId: string;
  startedAt: string;
  endedAt: string | null;
  status: 'running' | 'stopped' | 'failed';
  createdAt: string;
}

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
          <div className={styles.loading}>Загрузка...</div>
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
