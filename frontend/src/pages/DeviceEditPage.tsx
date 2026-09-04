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
  const { item: device, loading } = useEntity<Device>('/devices', id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (device) {
      setName(device.name);
      setType(device.type);
    }
  }, [device]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await apiFetch(`/devices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || 'Ошибка');
      }
      navigate(`/devices/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;

  return (
    <Layout>
      <DetailHeader title="Редактирование устройства" onBack={`../${id}`} />
      <Card>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Название</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Тип</label>
            <select className={styles.select} value={type} onChange={e => setType(e.target.value)} required>
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? '...' : 'Сохранить'}</Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/devices/${id}`)}>Отмена</Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
