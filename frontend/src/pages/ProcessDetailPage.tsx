import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card, StatusBadge } from '../components/Layout/Layout';
import { DetailHeader, InfoRow, DetailGrid, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { CustomPlayer } from '../components/CustomPlayer/CustomPlayer';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';

interface Process {
  id: string;
  streamId: string;
  startedAt: string;
  endedAt: string | null;
  status: 'running' | 'stopped' | 'failed';
  createdAt: string;
  mtxPath?: string;
}

interface Segment {
  id: string;
  startOffsetS: number;
  durationS: number;
  fileCount: number;
  sizeBytes: number;
  startedAt: string;
  endedAt: string;
  live?: boolean;
}

interface Incident {
  id: string;
  processId: string;
  segmentId?: string;
  title: string;
  description?: string;
  timeOffsetS: number;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
  createdBy?: string;
}

interface TimelineData {
  segments: Segment[];
  totalDurationS: number;
  start: string | null;
  end: string | null;
  live?: boolean;
}

export function ProcessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { item: process, loading, error, refresh } = useEntity<Process>('/processes', id);
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [timelineVersion, setTimelineVersion] = useState(0);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/segments/process/${id}/timeline`)
      .then(r => r.json())
      .then(data => setTimeline(data))
      .catch(() => {});
    apiFetch(`/incidents/process/${id}`)
      .then(r => r.json())
      .then(data => setIncidents(data.incidents || []))
      .catch(() => {});
  }, [id, refresh, timelineVersion]);

  // Auto-refresh timeline while recording is running
  useEffect(() => {
    if (!id || process?.status !== 'running') return;
    const timer = setInterval(() => {
      apiFetch(`/segments/process/${id}/timeline`)
        .then(r => r.json())
        .then(data => setTimeline(data))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [id, process?.status]);

  async function patchStatus(newStatus: string) {
    setActionLoading(true);
    try {
      const r = await apiFetch(`/processes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error('Ошибка');
      refresh();
      setTimelineVersion(v => v + 1);
    } catch {
      alert('Не удалось изменить статус');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Удалить запись?')) return;
    setActionLoading(true);
    try {
      const r = await apiFetch(`/processes/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Ошибка удаления');
      navigate('/processes');
    } catch {
      alert('Не удалось удалить');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateIncident(data: { title: string; description?: string; timeOffsetS: number; severity: string }) {
    const r = await apiFetch('/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processId: id, ...data }),
    });
    if (!r.ok) throw new Error('Ошибка создания инцидента');
    const incident = await r.json();
    setIncidents(prev => [...prev, incident].sort((a, b) => a.timeOffsetS - b.timeOffsetS));
    return incident;
  }

  async function handleDeleteIncident(incidentId: string) {
    const r = await apiFetch(`/incidents/${incidentId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Ошибка удаления инцидента');
    setIncidents(prev => prev.filter(i => i.id !== incidentId));
  }

  async function handleUpdateIncident(incidentId: string, data: { title: string; description?: string; severity: string }) {
    const r = await apiFetch(`/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Ошибка обновления инцидента');
    const updated = await r.json();
    setIncidents(prev => prev.map(i => i.id === incidentId ? updated : i));
  }

  if (loading) return <Layout><div className={styles.loading}>Загрузка...</div></Layout>;
  if (error || !process) return <Layout><div className={styles.error}>Запись не найдена</div></Layout>;

  const isRunning = process.status === 'running';
  const hasSegments = timeline && timeline.segments.length > 0;

  const mtxPath = `process_${id}`;
  const liveUrl = `/live/${mtxPath}/index.m3u8`;

  return (
    <Layout>
      <DetailHeader
        title="Запись"
        actions={
          <>
            {isRunning && (
              <Button variant="danger" onClick={() => patchStatus('stopped')} disabled={actionLoading}>
                {actionLoading ? '...' : 'Остановить'}
              </Button>
            )}
            {process.status === 'stopped' && (
              <Button variant="success" onClick={() => patchStatus('running')} disabled={actionLoading}>
                {actionLoading ? '...' : 'Возобновить'}
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('edit')}>Редактировать</Button>
            <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>Удалить</Button>
          </>
        }
      />
      <Card>
        <DetailGrid>
          <InfoRow label="Статус">
            <StatusBadge status={process.status} />
            {isRunning && <span className={styles.liveIndicator}>● LIVE</span>}
          </InfoRow>
          <InfoRow label="Поток" mono>{process.streamId}</InfoRow>
          <InfoRow label="Старт">{new Date(process.startedAt).toLocaleString('ru-RU')}</InfoRow>
          <InfoRow label="Окончание">{process.endedAt ? new Date(process.endedAt).toLocaleString('ru-RU') : '—'}</InfoRow>
          <InfoRow label="ID" mono>{process.id}</InfoRow>
          <InfoRow label="Создан">{new Date(process.createdAt).toLocaleString('ru-RU')}</InfoRow>
        </DetailGrid>
      </Card>

      <div className={styles.playerSection}>
        <h2 className={styles.sectionTitle}>
          {isRunning ? 'Прямая трансляция' : 'Просмотр записи'}
        </h2>
        {timeline ? (
          (hasSegments || isRunning) ? (
            <CustomPlayer
              processId={id!}
              liveUrl={liveUrl}
              timeline={timeline}
              incidents={incidents}
              onCreateIncident={handleCreateIncident}
              onUpdateIncident={handleUpdateIncident}
              onDeleteIncident={handleDeleteIncident}
            />
          ) : (
            <div className={styles.noSegments}>Запись отсутствует</div>
          )
        ) : (
          <div className={styles.noSegments}>Загрузка...</div>
        )}
      </div>

      {hasSegments && (
        <>
          <h2 className={styles.sectionTitle}>Сегменты ({timeline!.segments.filter(s => !s.live).length})</h2>
          <div className={styles.segmentList}>
            {timeline!.segments.filter(s => !s.live).map((seg, i) => (
              <Card key={seg.id}>
                <div className={styles.segmentRow}>
                  <div className={styles.segmentInfo}>
                    <span className={styles.segmentLabel}>Сегмент {i + 1}</span>
                    <span className={styles.segmentMeta}>
                      {seg.fileCount} файлов · {formatSize(seg.sizeBytes)} · {formatDuration(seg.durationS)}
                    </span>
                    <span className={styles.segmentTime}>
                      {new Date(seg.startedAt).toLocaleString('ru-RU')} — {new Date(seg.endedAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {!hasSegments && process.status === 'stopped' && (
        <div className={styles.noSegments}>Нет записанных сегментов</div>
      )}
    </Layout>
  );
}

function formatSize(bytes: number | string): string {
  const b = Number(bytes);
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}м ${s}с`;
}
