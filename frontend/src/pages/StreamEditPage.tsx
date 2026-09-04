import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';
import type { RecordingStream as Stream } from '../types';

export function StreamEditPage() {
  const { id } = useParams<{ id: string }>();
  const { item: stream, loading } = useEntity<Stream>('/streams', id);
  const navigate = useNavigate();

  const [url, setUrl] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sourceFingerprint, setSourceFingerprint] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (stream) {
      setUrl(stream.url);
      setDeviceId(stream.deviceId ?? '');
      setSourceFingerprint(stream.sourceFingerprint ?? '');
    }
  }, [stream]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        url,
        deviceId: deviceId || null,
        sourceFingerprint: sourceFingerprint || null,
      };
      const r = await apiFetch(`/streams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || 'Ошибка');
      }
      navigate(`/streams/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;

  return (
    <Layout>
      <DetailHeader title="Редактирование потока" onBack={`../${id}`} />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>URL источника</label>
            <input className={styles.input} value={url} onChange={e => setUrl(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>ID устройства</label>
            <input className={styles.input} value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="необязательно" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Fingerprint</label>
            <input className={styles.input} value={sourceFingerprint} onChange={e => setSourceFingerprint(e.target.value)} placeholder="необязательно" />
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? '...' : 'Сохранить'}</Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/streams/${id}`)}>Отмена</Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
