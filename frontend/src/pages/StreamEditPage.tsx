import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { SearchSelect, type SearchSelectItem } from '../components/SearchSelect/SearchSelect';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';
import type { RecordingStream as Stream, RecordingDevice as Device } from '../types';

export function StreamEditPage() {
  const { id } = useParams<{ id: string }>();
  const { item: stream, loading } = useEntity<Stream>('/streams', id);
  const navigate = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [url, setUrl] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sourceFingerprint, setSourceFingerprint] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (stream) {
      setUrl(stream.url);
      setDeviceId(stream.deviceId ?? null);
      setSourceFingerprint(stream.sourceFingerprint ?? '');
    }
  }, [stream]);

  useEffect(() => {
    apiFetch('/devices?limit=200').then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      setDevices(d.devices ?? d);
    });
  }, []);

  const deviceItems = useMemo<SearchSelectItem[]>(() => {
    const list: SearchSelectItem[] = devices.map(dev => ({ value: dev.id, label: dev.name }));
    if (deviceId && !list.some(it => it.value === deviceId)) {
      list.push({ value: deviceId, label: '#' + deviceId.slice(0, 8), search: deviceId });
    }
    return list;
  }, [devices, deviceId]);

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

  async function handleDelete() {
    if (!confirm('Удалить поток?')) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/streams/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Ошибка удаления');
      navigate('/streams');
    } catch {
      alert('Не удалось удалить');
      setDeleting(false);
    }
  }

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;

  return (
    <Layout>
      <DetailHeader
        title="Редактирование потока"
        onBack={`../${id}`}
        actions={
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>Удалить</Button>
        }
      />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>URL источника</label>
            <input className={styles.input} value={url} onChange={e => setUrl(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Устройство</label>
            <SearchSelect
              items={deviceItems}
              value={deviceId}
              onChange={v => setDeviceId(v)}
              allowNone
              placeholder="Не привязано"
              ariaLabel="Устройство"
            />
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
