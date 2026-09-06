import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layout, Card, StatusBadge } from '../components/Layout/Layout';
import { DetailHeader, InfoRow, DetailGrid, styles } from '../components/Layout/DetailPage';
import { Button } from '../components/Button/Button';
import { CustomPlayer } from '../components/CustomPlayer/CustomPlayer';
import { LiveViewer } from '../components/LiveViewer/LiveViewer';
import viewStyles from './ProcessDetailPage.module.css';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useEntity } from '../hooks/useEntity';
import { apiFetch } from '../api';
import type {
  RecordingIncident as Incident,
  RecordingProcess as Process,
  TimelineData,
} from '../types';

export function ProcessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { item: process, loading, error, refresh } = useEntity<Process>('/processes', id);
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [timelineVersion, setTimelineVersion] = useState(0);
  // Ручной уход из LiveViewer в архивный CustomPlayer (клик по сегменту) и обратно.
  const [forceArchive, setForceArchive] = useState(false);

  // Новый запуск записи → снова LiveViewer по умолчанию.
  useEffect(() => {
    if (process && process.status !== 'running') setForceArchive(false);
  }, [process?.status]);

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

  useEffect(() => {
    if (!id || process?.status !== 'running') return;
    const timer = setInterval(() => {
      apiFetch(`/processes/${id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.status && data.status !== process?.status) refresh();
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [id, process?.status, refresh]);

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

  if (loading) {
    return (
      <Layout>
        <DetailHeader
          title="Запись"
          actions={
            <>
              <Skeleton width={124} height={26} />
              <Skeleton width={112} height={26} />
              <Skeleton width={96} height={26} />
            </>
          }
        />
        <Card>
          <DetailGrid>
            {Array.from({ length: 6 }, (_, i) => (
              <InfoRow key={i} label={<Skeleton width={64} height={10} />}>
                <Skeleton width={i % 3 === 2 ? '40%' : '70%'} height={14} />
              </InfoRow>
            ))}
          </DetailGrid>
        </Card>
        <div className={styles.playerSection}>
          <div className={styles.sectionTitle}>
            <Skeleton width={220} height={14} />
          </div>
          <Skeleton width="100%" height={544} />
        </div>
      </Layout>
    );
  }
  if (error || !process) return <Layout><div className={styles.error}>Запись не найдена</div></Layout>;

  const isRunning = process.status === 'running';
  const hasSegments = timeline && timeline.segments.length > 0;
  const openLiveSeg = timeline?.segments.find(s => s.endedAt === null) ?? null;
  // Сегменты с записанными данными — доступны в режиме «Сегменты». Открытый сегмент
  // c fileCount > 0 тоже показываем: в архивном плеере он играется VOD-снимком диска.
  const recordedSegs = (timeline?.segments ?? []).filter(s => s.fileCount > 0);
  const liveViewerShown = isRunning && !!openLiveSeg && !forceArchive;

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-4)' }}>
          <h2 className={styles.sectionTitle} style={{ marginTop: 0, marginBottom: 0 }}>
            {isRunning && !forceArchive ? 'Прямая трансляция' : 'Просмотр записи'}
          </h2>
          {isRunning && (
            <div className={viewStyles.viewToggle}>
              <Button
                variant={!forceArchive ? 'danger' : 'outline'}
                size="sm"
                disabled={!openLiveSeg}
                title={!openLiveSeg ? 'Открытого сегмента нет — эфир недоступен' : undefined}
                onClick={() => setForceArchive(false)}
              >
                ● Прямой эфир
              </Button>
              <Button
                variant={forceArchive ? 'danger' : 'outline'}
                size="sm"
                disabled={recordedSegs.length === 0}
                title={recordedSegs.length === 0 ? 'Записанных сегментов нет — доступен только эфир' : undefined}
                onClick={() => setForceArchive(true)}
              >
                ▤ Сегменты
              </Button>
            </div>
          )}
        </div>
        {timeline ? (
          (hasSegments || isRunning) ? (
            liveViewerShown ? (
              <LiveViewer processId={id!} />
            ) : (
              <CustomPlayer
                processId={id!}
                timeline={timeline}
                incidents={incidents}
                onCreateIncident={handleCreateIncident}
                onUpdateIncident={handleUpdateIncident}
                onDeleteIncident={handleDeleteIncident}
              />
            )
          ) : (
            <div className={styles.noSegments}>Запись отсутствует</div>
          )
        ) : (
          <Skeleton width="100%" height={544} />
        )}
      </div>

      {hasSegments && (
        <>
          <h2 className={styles.sectionTitle}>Сегменты ({recordedSegs.length})</h2>
          <div className={styles.segmentList}>
            {recordedSegs.map((seg, i) => (
              <Card key={seg.id}>
                <div
                  className={styles.segmentRow}
                  style={liveViewerShown ? { cursor: 'pointer' } : undefined}
                  onClick={liveViewerShown ? () => setForceArchive(true) : undefined}
                  title={liveViewerShown ? 'Открыть в плеере записи' : undefined}
                >
                  <div className={styles.segmentInfo}>
                    <span className={styles.segmentLabel}>
                      Сегмент {i + 1}
                      {seg.live && <span className={styles.liveIndicator}>● LIVE</span>}
                    </span>
                    <span className={styles.segmentMeta}>
                      {seg.fileCount} файлов · {formatSize(seg.sizeBytes)} · {formatDuration(seg.durationS)}
                    </span>
                    <span className={styles.segmentTime}>
                      {new Date(seg.startedAt).toLocaleString('ru-RU')} — {seg.endedAt ? new Date(seg.endedAt).toLocaleString('ru-RU') : '—'}
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
