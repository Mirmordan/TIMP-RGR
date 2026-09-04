import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, InfoRow, DetailGrid, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';

interface Device {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { item: device, loading, error } = useEntity<Device>('/devices', id);
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Удалить устройство?')) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/devices/${id}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error('Ошибка удаления');
      navigate('/devices');
    } catch {
      alert('Не удалось удалить');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;
  if (error || !device) return <Layout><div className={styles.error}>Устройство не найдено</div></Layout>;

  return (
    <Layout>
      <DetailHeader
        title={device.name}
        subtitle={device.type}
        actions={
          <>
            <Button variant="primary" onClick={() => navigate('edit')}>Редактировать</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>Удалить</Button>
          </>
        }
      />
      <Card>
        <DetailGrid>
          <InfoRow label="Название">{device.name}</InfoRow>
          <InfoRow label="Тип">{device.type}</InfoRow>
          <InfoRow label="ID" mono>{device.id}</InfoRow>
          <InfoRow label="Создан">{new Date(device.createdAt).toLocaleString('ru-RU')}</InfoRow>
        </DetailGrid>
      </Card>
    </Layout>
  );
}
