import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';

interface Process {
  id: string;
  streamId: string;
}

export function ProcessEditPage() {
  const { id } = useParams<{ id: string }>();
  const { item: process, loading } = useEntity<Process>('/processes', id);
  const navigate = useNavigate();

  const [streamId, setStreamId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (process) setStreamId(process.streamId);
  }, [process]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await apiFetch(`/processes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || 'Ошибка');
      }
      navigate(`/processes/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;

  return (
    <Layout>
      <DetailHeader title="Редактирование записи" onBack={`../${id}`} />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Stream ID</label>
            <input className={styles.input} value={streamId} onChange={e => setStreamId(e.target.value)} required />
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? '...' : 'Сохранить'}</Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/processes/${id}`)}>Отмена</Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
