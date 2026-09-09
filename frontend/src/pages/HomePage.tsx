import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { Button } from '../components/Button/Button';
import { useAuth } from '../auth';
import { canSeeAdmin } from '../adminAccess';
import { apiFetch } from '../api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { StatsDashboardWire } from '../types';
import styles from './HomePage.module.css';

const DASHBOARD_PERIOD_DAYS = 30;
const DEVICE_COLORS = ['#3AAFA9', '#4C9FDD', '#E8A838', '#B87333', '#9B7EDE', '#E85D75'];
const STATUS_COLORS = { running: '#3AAFA9', stopped: '#4C9FDD', failed: '#ef4444' } as const;
const STATUS_LABELS = { running: 'В эфире', stopped: 'Остановлены', failed: 'Ошибки' } as const;
const SEVERITY_COLORS = { info: '#3b82f6', warning: '#eab308', critical: '#ef4444' } as const;
const SEVERITY_LABELS: Record<string, string> = {
  info: 'Инфо',
  warning: 'Предупреждения',
  critical: 'Критичные',
};

const AXIS_TICK = { fill: '#6A7A8C', fontSize: 10 };
const GRID_STROKE = '#2E3A48';
const TOOLTIP_STYLE: CSSProperties = {
  background: '#1C2430',
  border: '1px solid #2E3A48',
  borderRadius: 8,
  fontSize: 12,
  color: '#D4D8DE',
};

const HERO_PERKS = [
  'Живой эфир камер в один клик — без записи, задержка в единицы секунд.',
  'Архив записей с таймлайном: зоны «запись отсутствует», эфирный сегмент — как обычная запись.',
  'Инциденты с выгрузкой фрагмента ±60 секунд.',
  'Реестр камер и потоков с разграничением доступа.',
  'Автоконтроль записей: потеря источника не оставляет «висячих» записей.',
];

const STACK_GROUPS: Array<{ name: string; items: string[] }> = [
  { name: 'Frontend', items: ['TypeScript', 'React', 'Vite'] },
  { name: 'Backend', items: ['TypeScript', 'Express', 'Swagger'] },
  { name: 'Database', items: ['PostgreSQL'] },
  { name: 'Media', items: ['mediaMTX', 'FFmpeg', 'ffmpeg-manager'] },
  { name: 'Развёртывание', items: ['Node.js', 'npm', 'Docker', 'Docker Compose'] },
];
const SECTION_CARDS = [
  {
    to: '/processes',
    icon: '▤',
    title: 'Записи',
    text: 'Архив сессий: таймлайн с пропусками, эфирный сегмент как запись, выгрузка фрагментов ±60с',
  },
  {
    to: '/streams',
    icon: '≋',
    title: 'Потоки',
    text: 'Живой эфир без записи в один клик; Ivideon и HLS-источники',
  },
  {
    to: '/devices',
    icon: '⛭',
    title: 'Устройства',
    text: 'Реестр камер: привязка потоков, кто и что видит',
  },
];

interface ChartDay {
  day: string;
  hours: number;
  info: number;
  warning: number;
  critical: number;
  segmentCount: number;
}

export function HomePage() {
  const { user, capabilities } = useAuth();
  const canDashboard = capabilities.includes('dashboard:read');
  const [dashboard, setDashboard] = useState<StatsDashboardWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!canDashboard) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    apiFetch(`/stats/dashboard?days=${DASHBOARD_PERIOD_DAYS}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || `Дашборд недоступен (${res.status})`);
        }
        return res.json() as Promise<StatsDashboardWire>;
      })
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить дашборд');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [canDashboard, tick]);

  const chartData = useMemo<ChartDay[]>(() => {
    return (dashboard?.daily ?? []).map((row) => ({
      day: row.day,
      hours: Number((row.recordingSeconds / 3600).toFixed(2)),
      info: row.incidents.info,
      warning: row.incidents.warning,
      critical: row.incidents.critical,
      segmentCount: row.segmentCount,
    }));
  }, [dashboard?.daily]);

  const hasRecordingData = chartData.some((row) => row.hours > 0);
  const hasIncidentData = chartData.some((row) => row.info + row.warning + row.critical > 0);
  const sourceMaxSeconds = useMemo(
    () => Math.max(1, ...(dashboard?.sources ?? []).map((source) => source.seconds)),
    [dashboard?.sources],
  );
  const statusChart = useMemo(() => {
    return (dashboard?.processStatuses ?? [])
      .map((item) => ({
        name: STATUS_LABELS[item.status],
        status: item.status,
        value: item.count,
        fill: STATUS_COLORS[item.status],
      }))
      .filter((item) => item.value > 0);
  }, [dashboard?.processStatuses]);
  const statusTotal = statusChart.reduce((acc, item) => acc + item.value, 0);
  const tiles = dashboard?.tiles;
  const periodDays = dashboard?.period.days ?? DASHBOARD_PERIOD_DAYS;

  return (
    <Layout>
      <div className={styles.welcome}>
        <div className={styles.heroRow}>
          <div className={styles.heroBrand}>
            <div className={styles.heroIcon}>T</div>
            <h1 className={styles.heroTitle}>ТИМП-VIGIL</h1>
          </div>
          <div className={styles.heroUser}>
            <span className={styles.userName}>{user?.username ?? 'гость'}</span>
            <span className={styles.userRole}>{user?.role ?? ''}</span>
            {canSeeAdmin(capabilities) && (
              <Link to="/admin" className={styles.adminLink}>Админ-панель</Link>
            )}
          </div>
        </div>

        <ul className={styles.heroPerks}>
          {HERO_PERKS.map(perk => (
            <li key={perk} className={styles.heroPerk}>{perk}</li>
          ))}
        </ul>

        <div className={styles.stack}>
          {STACK_GROUPS.map(group => (
            <div key={group.name} className={styles.stackRow}>
              <span className={styles.stackGroup}>{group.name}</span>
              <span className={styles.stackChips}>
                {group.items.map(item => (
                  <span key={item} className={styles.stackChip}>{item}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <section className={styles.sectionCards} aria-label="Разделы">
        {SECTION_CARDS.map(card => (
          <Link key={card.to} to={card.to} className={styles.sectionCard}>
            <span className={styles.sectionGlyph} aria-hidden="true">{card.icon}</span>
            <span className={styles.sectionCardTitle}>{card.title}</span>
            <span className={styles.sectionCardText}>{card.text}</span>
          </Link>
        ))}
      </section>

      {canDashboard && (
        <section className={styles.dashboard} aria-label="Дашборд">
          <div className={styles.dashHeader}>
            <h2 className={styles.dashTitle}>Дашборд</h2>
            <Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)} disabled={loading}>
              Обновить
            </Button>
          </div>

          {loading && <DashboardSkeleton />}

          {!loading && loadError && (
            <div className={styles.failed}>
              <div className={styles.errorText}>{loadError}</div>
              <Button variant="outline" size="sm" onClick={() => setTick(t => t + 1)}>Повторить</Button>
            </div>
          )}

          {!loading && !loadError && tiles && (
            <>
              <div className={styles.tiles}>
                <StatTile label="Сейчас в эфире">
                  <div className={styles.tileLive}>
                    {tiles.processes.running > 0 && <span className={styles.tileLiveDot} />}
                    <span className={styles.tileValue}>{tiles.processes.running.toLocaleString('ru-RU')}</span>
                  </div>
                  <div className={styles.tileSub}>сессий записи</div>
                </StatTile>

                <StatTile label="Всего процессов">
                  <div className={styles.tileValue}>{tiles.processes.total.toLocaleString('ru-RU')}</div>
                  <div className={styles.tileSub}>
                    {tiles.processes.stopped.toLocaleString('ru-RU')} остановлено · {tiles.processes.failed.toLocaleString('ru-RU')} с ошибкой
                  </div>
                </StatTile>

                <StatTile label="Потоки">
                  <div className={styles.tileValue}>{tiles.streams.visible.toLocaleString('ru-RU')}</div>
                  <div className={styles.tileSub}>записывались {tiles.streams.recorded.toLocaleString('ru-RU')}</div>
                </StatTile>

                <StatTile label="Камеры">
                  <div className={styles.tileValue}>{tiles.devices.visible.toLocaleString('ru-RU')}</div>
                  <div className={styles.tileSub}>в зоне доступа</div>
                </StatTile>

                <StatTile label="Отснято сегодня">
                  <div className={styles.tileValue}>{formatHours(tiles.recording.todayS)}</div>
                  <div className={styles.tileSub}>UTC-сутки</div>
                </StatTile>

                <StatTile label="За сутки">
                  <div className={styles.tileValue}>{formatHours(tiles.recording.last24hS)}</div>
                  <div className={styles.tileSub}>скользящие 24 ч</div>
                </StatTile>

                <StatTile label="Сегменты">
                  <div className={styles.tileValue}>{tiles.segments.count.toLocaleString('ru-RU')}</div>
                  <div className={styles.tileSub}>
                    {formatHours(tiles.segments.durationS)} · {formatBytes(tiles.segments.sizeBytes)}
                  </div>
                </StatTile>

                <StatTile label="Инциденты 24ч">
                  <div className={styles.tileValue}>{tiles.incidents.last24h.toLocaleString('ru-RU')}</div>
                  <div className={styles.sevRow}>
                    {(Object.keys(SEVERITY_COLORS) as Array<keyof typeof SEVERITY_COLORS>).map((severity) => (
                      <span key={severity} className={styles.sevItem} title={SEVERITY_LABELS[severity]}>
                        <span className={styles.sevDot} style={{ background: SEVERITY_COLORS[severity] }} />
                        <span className={styles.sevCount}>{tiles.incidents.bySeverity[severity].toLocaleString('ru-RU')}</span>
                      </span>
                    ))}
                  </div>
                </StatTile>
              </div>

              <div className={styles.gridArea}>
                <div className={`${styles.span2} ${styles.spanDaily}`}>
                  <Card>
                    <div className={styles.chartBody}>
                      <div className={styles.chartTitle}>Запись по дням, {periodDays} д</div>
                      {!hasRecordingData ? (
                        <div className={styles.chartEmpty}>Нет записей за период</div>
                      ) : (
                        <div className={styles.chartBox}>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="day" tickFormatter={fmtAxisDay} tick={AXIS_TICK} minTickGap={22} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                              <YAxis tickFormatter={fmtAxisHours} tick={AXIS_TICK} width={46} tickLine={false} axisLine={false} />
                              <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                contentStyle={TOOLTIP_STYLE}
                                labelStyle={{ color: '#D4D8DE' }}
                                labelFormatter={label => fmtTooltipDay(String(label))}
                                formatter={(value) => [`${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ч`, 'Запись']}
                              />
                              <Bar dataKey="hours" name="Часы" fill="#3AAFA9" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                <Card>
                  <div className={styles.chartBody}>
                    <div className={styles.chartTitle}>Инциденты по дням, {periodDays} д</div>
                    {!hasIncidentData ? (
                      <div className={styles.chartEmpty}>Инцидентов за период нет</div>
                    ) : (
                      <div className={styles.chartBox}>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="day" tickFormatter={fmtAxisDay} tick={AXIS_TICK} minTickGap={24} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                            <YAxis allowDecimals={false} tick={AXIS_TICK} width={28} tickLine={false} axisLine={false} />
                            <Tooltip
                              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                              contentStyle={TOOLTIP_STYLE}
                              labelStyle={{ color: '#D4D8DE' }}
                              labelFormatter={label => fmtTooltipDay(String(label))}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#6A7A8C', paddingTop: 6 }} iconSize={9} />
                            <Bar dataKey="info" stackId="sev" name={SEVERITY_LABELS.info} fill={SEVERITY_COLORS.info} />
                            <Bar dataKey="warning" stackId="sev" name={SEVERITY_LABELS.warning} fill={SEVERITY_COLORS.warning} />
                            <Bar dataKey="critical" stackId="sev" name={SEVERITY_LABELS.critical} fill={SEVERITY_COLORS.critical} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </Card>

                <Card>
                  <div className={styles.chartBody}>
                    <div className={styles.chartTitle}>Статусы процессов</div>
                    {statusTotal === 0 ? (
                      <div className={styles.chartEmpty}>Нет процессов для графика</div>
                    ) : (
                      <div className={styles.chartBox}>
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Tooltip
                              contentStyle={TOOLTIP_STYLE}
                              formatter={(value) => [`${Number(value).toLocaleString('ru-RU')} шт.`, 'Процессы']}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#6A7A8C', paddingTop: 6 }} iconSize={9} />
                            <Pie
                              data={statusChart}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="46%"
                              innerRadius={58}
                              outerRadius={88}
                              paddingAngle={2}
                              stroke="none"
                            >
                              {statusChart.map((entry) => <Cell key={entry.status} fill={entry.fill} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </Card>

                <Card>
                  <div className={styles.chartBody}>
                    <div className={styles.chartTitle}>Источники записи, {periodDays} д</div>
                    {(dashboard?.sources.length ?? 0) === 0 ? (
                      <div className={styles.chartEmpty}>Записей по источникам нет</div>
                    ) : (
                      <div className={styles.sourceList}>
                        {dashboard?.sources.map((source, index) => (
                          <div key={source.id} className={styles.sourceItem} title={source.label}>
                            <div className={styles.sourceMeta}>
                              <span className={styles.sourceLabel}>{source.label}</span>
                              <span className={styles.sourceValue}>{formatHours(source.seconds)}</span>
                            </div>
                            <div className={styles.sourceTrack}>
                              <div
                                className={styles.sourceFill}
                                style={{
                                  width: `${Math.max(1.5, (source.seconds / sourceMaxSeconds) * 100)}%`,
                                  background: `linear-gradient(90deg, ${DEVICE_COLORS[index % DEVICE_COLORS.length]}, var(--copper))`,
                                }}
                              />
                            </div>
                            <div className={styles.sourceSub}>
                              {source.segmentCount.toLocaleString('ru-RU')} сегментов · {formatDate(source.lastStartedAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>

                <DiskCard disk={dashboard?.disk} />
              </div>
            </>
          )}
        </section>
      )}
    </Layout>
  );
}

function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileLabel}>{label}</div>
      {children}
    </div>
  );
}

function DiskCard({ disk }: { disk: StatsDashboardWire['disk'] | undefined }) {
  if (!disk || disk.totalBytes == null || disk.freeBytes == null || disk.totalBytes <= 0) {
    return (
      <Card>
        <div className={styles.chartBody}>
          <div className={styles.chartTitle}>Диск</div>
          <div className={styles.chartEmpty}>Нет данных</div>
        </div>
      </Card>
    );
  }

  const chunks = disk.chunksBytes ?? 0;
  const used = Math.max(0, disk.totalBytes - disk.freeBytes);
  const pct = Math.min(100, Math.round((used / disk.totalBytes) * 100));

  return (
    <Card>
      <div className={styles.chartBody}>
        <div className={styles.chartTitle}>Диск</div>
        <div className={styles.diskBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Занятость диска">
          <div className={styles.diskBarFill} style={{ width: `${pct}%` }} />
        </div>
        <div className={styles.diskCaption}>
          Чанки <b>{formatBytes(chunks)}</b> · Свободно <b>{formatBytes(disk.freeBytes)}</b> ({pct}% занято диска)
        </div>
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className={styles.tiles}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={styles.tile}>
            <Skeleton width="55%" height={11} />
            <Skeleton width="70%" height={24} />
            <Skeleton width="40%" height={11} />
          </div>
        ))}
      </div>
      <div className={styles.gridArea}>
        <div className={`${styles.span2} ${styles.spanDaily}`}>
          <Card>
            <div className={styles.chartBody}>
              <Skeleton width={180} height={13} />
              <Skeleton width="100%" height={280} />
            </div>
          </Card>
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i}>
            <div className={styles.chartBody}>
              <Skeleton width={150} height={13} />
              <Skeleton width="100%" height={i === 0 ? 220 : 130} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function fmtAxisDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}.${m}`;
}

function fmtTooltipDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

function fmtAxisHours(v: number | string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n >= 24) return `${Math.round(n / 24)} д`;
  if (n >= 1) return `${n.toFixed(n < 10 ? 1 : 0)} ч`;
  return '0 ч';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

function formatHours(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} д ${h} ч` : `${d} д`;
  if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  return `${m} мин`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 Б';
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let v = bytes;
  let u = -1;
  do {
    v /= 1024;
    u += 1;
  } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(1).replace('.', ',')} ${units[u]}`;
}