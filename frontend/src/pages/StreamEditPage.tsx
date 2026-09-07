import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { RemoteSearchSelect, type SearchSelectItem } from '../components/SearchSelect/RemoteSearchSelect';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';
import type { RecordingStream as Stream, RecordingDevice as Device } from '../types';

function deviceToItem(d: Device): SearchSelectItem {
  return { value: d.id, label: d.name, sublabel: d.type };
}

async function loadDevices(q: string): Promise<SearchSelectItem[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (q.trim()) params.set('q', q.trim());
  const r = await apiFetch(`/devices?${params.toString()}`);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `Ошибка загрузки (${r.status})`);
  }
  const data = await r.json();
  return (data.devices ?? []).map(deviceToItem);
}

async function loadDeviceById(id: string): Promise<SearchSelectItem | null> {
  const r = await apiFetch(`/devices/${id}`);
  if (!r.ok) return null;
  return deviceToItem(await r.json());
}

export function StreamEditPage() {
  const { id } = useParams<{ id: string }>();
  const isCreate = id === undefined || id === 'new';
  const { item: stream, loading } = useEntity<Stream>('/streams', isCreate ? undefined : id);
  const navigate = useNavigate();

  const [url, setUrl] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceFingerprint, setSourceFingerprint] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isCreate) {
      setUrl('');
      setDeviceId(null);
      setName('');
      setDescription('');
      setSourceFingerprint('');
      setError('');
      return;
    }
    if (stream) {
      setUrl(stream.url);
      setDeviceId(stream.deviceId ?? null);
      // Только собственный override: эффективное имя родителя не должно
      // сохраниться как явное название при PUT.
      setName(stream.rawName ?? '');
      setDescription(stream.description ?? '');
      setSourceFingerprint(stream.sourceFingerprint ?? '');
    }
  }, [isCreate, stream]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        url,
        deviceId: deviceId || null,
        sourceFingerprint: sourceFingerprint || null,
        name: name.trim() || null,
        description: description.trim() || null,
      };
      const urlPath = isCreate ? '/streams' : `/streams/${id}`;
      const r = await apiFetch(urlPath, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || d.message || 'Ошибка');
      }
      const d = await r.json();
      navigate(isCreate ? `/streams/${d.id}` : `/streams/${id}`);
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

  if (loading && !isCreate) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;

  const namePlaceholder = stream?.inheritedName
    ? `Наследуется от устройства: ${stream.inheritedName}`
    : 'Наследуется';

  return (
    <Layout>
      <DetailHeader
        title={isCreate ? 'Новый поток' : 'Редактирование потока'}
        onBack={isCreate ? '/streams' : `/streams/${id}`}
        actions={!isCreate && (
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>Удалить</Button>
        )}
      />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Название</label>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={namePlaceholder}
            />
            {!isCreate && !stream?.rawName && (
              <div className={styles.hint}>Своё название не задано — отображается название устройства.</div>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Описание</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="необязательно"
              rows={3}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>URL источника</label>
            <input className={styles.input} value={url} onChange={e => setUrl(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Устройство</label>
            <RemoteSearchSelect
              value={deviceId}
              onChange={v => setDeviceId(v)}
              load={loadDevices}
              loadSelected={loadDeviceById}
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
            <Button type="submit" variant="primary" disabled={saving}>{saving ? '...' : isCreate ? 'Создать' : 'Сохранить'}</Button>
            <Button type="button" variant="outline" onClick={() => navigate(isCreate ? '/streams' : `/streams/${id}`)}>Отмена</Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
