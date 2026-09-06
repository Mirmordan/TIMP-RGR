import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { SearchSelect, type SearchSelectItem } from '../components/SearchSelect/SearchSelect';
import { apiFetch } from '../api';
import type { RecordingStream as Stream, RecordingDevice as Device } from '../types';

type StartMode = 'running' | 'stopped';

function urlTail(url: string): string {
  return url.length > 28 ? '…' + url.slice(-28) : url;
}
function urlShort(url: string): string {
  return url.length > 40 ? url.slice(0, 40) + '…' : url;
}

export function ProcessCreatePage() {
  const navigate = useNavigate();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<StartMode>('running');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/streams?limit=200').then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      const list: Stream[] = d.streams ?? d;
      setStreams(list);
      if (list.length) setStreamId(prev => prev ?? list[0].id);
    });
    apiFetch('/devices?limit=200').then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      setDevices(d.devices ?? d);
    });
  }, []);

  const streamItems = useMemo<SearchSelectItem[]>(() => {
    const byId = new Map(devices.map(dev => [dev.id, dev]));
    return streams.map(s => {
      const dev = s.deviceId ? byId.get(s.deviceId) : undefined;
      return {
        value: s.id,
        label: dev?.name ?? urlShort(s.url),
        sublabel: urlTail(s.url),
        search: `${dev?.name ?? ''} ${s.url} ${s.id}`,
      };
    });
  }, [streams, devices]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!streamId) { setError('Выберите поток'); return; }
    setError('');
    setSaving(true);
    try {
      const r = await apiFetch('/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId, status: startMode }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Ошибка');
      }
      const p = await r.json();
      navigate(`/processes/${p.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <DetailHeader title="Новая запись" onBack="/processes" />
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

          <div className={styles.field}>
            <label className={styles.label}>Режим запуска</label>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text)' }}>
                <input
                  type="radio"
                  name="startMode"
                  checked={startMode === 'running'}
                  onChange={() => setStartMode('running')}
                />
                Запись сразу
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text)' }}>
                <input
                  type="radio"
                  name="startMode"
                  checked={startMode === 'stopped'}
                  onChange={() => setStartMode('stopped')}
                />
                Остановлена
              </label>
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? '...' : 'Создать'}</Button>
            <Button type="button" variant="outline" onClick={() => navigate('/processes')}>Отмена</Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
