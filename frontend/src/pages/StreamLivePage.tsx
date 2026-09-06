import { useParams } from 'react-router';
import { Layout } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { LiveViewer } from '../components/LiveViewer/LiveViewer';
import { useEntity } from '../hooks/useEntity';
import type { RecordingStream as Stream } from '../types';

export function StreamLivePage() {
  const { id } = useParams<{ id: string }>();
  const { item: stream, loading, error } = useEntity<Stream>('/streams', id);

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;
  if (error || !stream) return <Layout><div className={styles.error}>Поток не найден</div></Layout>;

  return (
    <Layout>
      <DetailHeader
        title="Прямой эфир"
        subtitle={stream.url.length > 60 ? stream.url.slice(0, 60) + '...' : stream.url}
        onBack={`/streams/${stream.id}`}
      />
      <div className={styles.playerSection}>
        <LiveViewer view={{ streamId: stream.id }} />
      </div>
    </Layout>
  );
}
