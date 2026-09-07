import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { RemoteSearchSelect, type SearchSelectItem } from '../components/SearchSelect/RemoteSearchSelect';
import { apiFetch } from '../api';
import type { RecordingStream as Stream } from '../types';

type StartMode = 'running' | 'stopped';

function urlShort(url: string): string {
  return url.length > 40 ? url.slice(0, 40) + '…' : url;
}

function streamToItem(s: Stream): SearchSelectItem {
  return { value: s.id, label: s.name ?? `#${s.id.slice(0, 8)}`, sublabel: urlShort(s.url) };
}

async function loadStreams(q: string): Promise<SearchSelectItem[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (q.trim()) params.set('q', q.trim());
  const r = await apiFetch(`/streams?${params.toString()}`);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `Ошибка загрузки (${r.status})`);
  }
  const data = await r.json();
  return (data.streams ?? []).map(streamToItem);
}

export function ProcessCreatePage() {
  const navigate = useNavigate();
  const [streamId, setStreamId] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<StartMode>('running');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!streamId) { setError('Выберите поток'); return; }
    setError('');
    setSaving(true);
    try {
      const r = await apiFetch('/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId,
          status: startMode,
          name: null,
          description: null,
        }),
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
            <RemoteSearchSelect
              value={streamId}
              onChange={v => setStreamId(v)}
              load={loadStreams}
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
