import { useNavigate } from 'react-router';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { Table, type Column } from '../components/Table/Table';
import { Pagination } from '../components/Pagination/Pagination';
import { SkeletonRows } from '../components/Skeleton/Skeleton';
import { usePaginatedData } from '../hooks/usePaginatedData';
import type { RecordingDevice as Device } from '../types';

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
          <SkeletonRows rows={8} cols={columns.length} cellWidths={['56%', '30%', '44%', '48%']} />
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
