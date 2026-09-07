import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { RemoteSearchSelect, type SearchSelectItem } from '../components/SearchSelect/RemoteSearchSelect';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';
import type { RecordingProcess as Process, RecordingStream as Stream } from '../types';

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

async function loadStreamById(id: string): Promise<SearchSelectItem | null> {
  const r = await apiFetch(`/streams/${id}`);
  if (!r.ok) return null;
  return streamToItem(await r.json());
}

export function ProcessEditPage() {
  const { id } = useParams<{ id: string }>();
  const { item: process, loading } = useEntity<Process>('/processes', id);
  const navigate = useNavigate();

  const [streamId, setStreamId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (process) {
      setStreamId(process.streamId);
      setName(process.name ?? '');
      setDescription(process.description ?? '');
    }
  }, [process]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!streamId) { setError('Выберите поток'); return; }
    if (!name.trim()) { setError('Название обязательно'); return; }
    setError('');
    setSaving(true);
    try {
      const r = await apiFetch(`/processes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId,
          // Название/описание — собственные метаданные объекта записи.
          name: name.trim(),
          description: description.trim() || null,
        }),
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
        onBack={`/processes/${id}`}
        actions={
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>Удалить</Button>
        }
      />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Поток</label>
            <RemoteSearchSelect
              value={streamId}
              onChange={v => setStreamId(v)}
              load={loadStreams}
              loadSelected={loadStreamById}
              placeholder="Выберите поток"
              ariaLabel="Поток"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Название *</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Например: Вечерний мониторинг" required />
            <div className={styles.hint}>Собственное имя объекта записи; меняется только здесь.</div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Описание</label>
            <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={3} />
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
