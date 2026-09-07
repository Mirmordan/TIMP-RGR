import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, InfoRow, DetailGrid, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { useEntity } from '../hooks/useEntity';
import type { RecordingStream as Stream } from '../types';

export function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { item: stream, loading, error } = useEntity<Stream>('/streams', id);
  const navigate = useNavigate();

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;
  if (error || !stream) return <Layout><div className={styles.error}>Поток не найден</div></Layout>;

  return (
    <Layout>
      <DetailHeader
        title={stream.name ?? 'Поток'}
        subtitle={stream.url.length > 60 ? stream.url.slice(0, 60) + '...' : stream.url}
        actions={
          <>
            <Button variant="success" onClick={() => navigate(`/streams/${id}/live`)}>▶ Смотреть эфир</Button>
            <Button variant="primary" onClick={() => navigate(`/streams/${stream.id}/edit`)}>Редактировать</Button>
          </>
        }
      />
      <Card>
        <DetailGrid>
          <InfoRow label="Название">{stream.name ?? '—'}</InfoRow>
          <InfoRow label="Описание">{stream.description ?? '—'}</InfoRow>
          <InfoRow label="URL">{stream.url}</InfoRow>
          <InfoRow label="Родительский объект" mono>{stream.parentObjectId ?? '—'}</InfoRow>
          <InfoRow label="Устройство (ID)" mono>{stream.deviceId ?? '—'}</InfoRow>
          <InfoRow label="Fingerprint" mono>{stream.sourceFingerprint ?? '—'}</InfoRow>
          <InfoRow label="ID" mono>{stream.id}</InfoRow>
          <InfoRow label="Создан">{new Date(stream.createdAt).toLocaleString('ru-RU')}</InfoRow>
        </DetailGrid>
      </Card>
    </Layout>
  );
}
