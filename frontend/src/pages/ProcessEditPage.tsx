import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { SearchSelect, type SearchSelectItem } from '../components/SearchSelect/SearchSelect';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';
import type { RecordingProcess as Process, RecordingStream as Stream, RecordingDevice as Device } from '../types';

function urlTail(url: string): string {
  return url.length > 28 ? '…' + url.slice(-28) : url;
}
function urlShort(url: string): string {
  return url.length > 40 ? url.slice(0, 40) + '…' : url;
}

export function ProcessEditPage() {
  const { id } = useParams<{ id: string }>();
  const { item: process, loading } = useEntity<Process>('/processes', id);
  const navigate = useNavigate();

  const [streams, setStreams] = useState<Stream[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (process) setStreamId(process.streamId);
  }, [process]);

  useEffect(() => {
    apiFetch('/streams?limit=200').then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      setStreams(d.streams ?? d);
    });
    apiFetch('/devices?limit=200').then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      setDevices(d.devices ?? d);
    });
  }, []);

  const streamItems = useMemo<SearchSelectItem[]>(() => {
    const byId = new Map(devices.map(dev => [dev.id, dev]));
    const list: SearchSelectItem[] = streams.map(s => {
      const dev = s.deviceId ? byId.get(s.deviceId) : undefined;
      return {
        value: s.id,
        label: dev?.name ?? urlShort(s.url),
        sublabel: urlTail(s.url),
        search: `${dev?.name ?? ''} ${s.url} ${s.id}`,
      };
    });
    if (process?.streamId && !list.some(it => it.value === process.streamId)) {
      list.push({ value: process.streamId, label: '#' + process.streamId.slice(0, 8), search: process.streamId });
    }
    return list;
  }, [streams, devices, process]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!streamId) { setError('Выберите поток'); return; }
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

  async function handleDelete() {
    if (!confirm('Удалить запись?')) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/processes/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Ошибка удаления');
      navigate('/processes');
    } catch {
      alert('Не удалось удалить');
      setDeleting(false);
    }
  }

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;

  return (
    <Layout>
      <DetailHeader
        title="Редактирование записи"
        onBack={`../${id}`}
        actions={
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>Удалить</Button>
        }
      />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Поток</label>
            <SearchSelect
              items={streamItems}
              value={streamId}
              onChange={v => setStreamId(v)}
              placeholder="Выберите поток"
              ariaLabel="Поток"
            />
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
