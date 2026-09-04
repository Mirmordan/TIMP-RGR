import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { usePaginatedData } from '../hooks/usePaginatedData';
import styles from './ListPage.module.css';

interface Device {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

const columns: Column<Device>[] = [
  { key: 'name', header: 'Название' },
  { key: 'type', header: 'Тип' },
  { key: 'id', header: 'ID', mono: true },
  { key: 'createdAt', header: 'Создан', render: v => new Date(v as string).toLocaleDateString('ru-RU') },
];

export function DevicesPage() {
  const { items, total, loading, page, setPage } = usePaginatedData<Device>('/devices');
  const navigate = useNavigate();

  return (
    <Layout>
      <PageHeader title="Устройства" />
      <Card>
        {loading ? (
          <div className={styles.loading}>Загрузка...</div>
        ) : (
          <>
            <Table columns={columns} data={items} emptyText="Устройств нет" onRowClick={r => navigate(`/devices/${r.id}`)} />
            <Pagination page={page} total={total} pageSize={10} onChange={setPage} />
          </>
        )}
      </Card>
    </Layout>
  );
}
