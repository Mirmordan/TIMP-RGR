import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { DetailHeader, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';
import type { RecordingDevice as Device } from '../types';

const DEVICE_TYPES = ['camera', 'microphone', 'sensor', 'nvr', 'encoder'];

export function DeviceEditPage() {
  const { id } = useParams<{ id: string }>();
  const isCreate = id === undefined || id === 'new';
  const { item: device, loading } = useEntity<Device>('/devices', isCreate ? undefined : id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isCreate) {
      setName('');
      setType('');
      setDescription('');
      setError('');
      return;
    }
    if (device) {
      setName(device.name);
      setType(device.type);
      setDescription(device.description ?? '');
    }
  }, [isCreate, device]);

  async function handleDelete() {
    if (!confirm('Удалить устройство?')) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/devices/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Ошибка удаления');
      navigate('/devices');
    } catch {
      alert('Не удалось удалить');
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = isCreate ? '/devices' : `/devices/${id}`;
      const r = await apiFetch(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, description: description.trim() || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || d.message || 'Ошибка');
      }
      const d = await r.json();
      navigate(isCreate ? `/devices/${d.id}` : `/devices/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !isCreate) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;

  return (
    <Layout>
      <DetailHeader
        title={isCreate ? 'Новое устройство' : 'Редактирование устройства'}
        onBack={isCreate ? '/devices' : `/devices/${id}`}
        actions={!isCreate && (
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>Удалить</Button>
        )}
      />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Название</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Тип</label>
            <select className={styles.select} value={type} onChange={e => setType(e.target.value)} required>
              {!type && <option value="" disabled>— выберите тип —</option>}
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
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
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? '...' : isCreate ? 'Создать' : 'Сохранить'}</Button>
            <Button type="button" variant="outline" onClick={() => navigate(isCreate ? '/devices' : `/devices/${id}`)}>Отмена</Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
