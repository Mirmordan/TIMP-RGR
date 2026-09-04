import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { apiFetch } from '../api';
import type { RecordingStream as Stream } from '../types';

type StartMode = 'running' | 'stopped';

export function ProcessCreatePage() {
  const navigate = useNavigate();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [streamId, setStreamId] = useState('');
  const [startMode, setStartMode] = useState<StartMode>('running');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/streams?limit=100').then(async r => {
      if (r.ok) {
        const d = await r.json();
        setStreams(d.streams ?? d);
        if (d.streams?.length) setStreamId(d.streams[0].id);
      }
    });
  }, []);

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
            <select className={styles.input} value={streamId} onChange={e => setStreamId(e.target.value)} required>
              <option value="" disabled>Выберите поток</option>
              {streams.map(s => (
                <option key={s.id} value={s.id}>{s.id.slice(0, 8)}... ({s.url.slice(0, 40)}...)</option>
              ))}
            </select>
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
