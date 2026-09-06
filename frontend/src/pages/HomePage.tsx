import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Layout, Card } from '../components/Layout/Layout';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { Button } from '../components/Button/Button';
import { useAuth } from '../auth';
import { apiFetch } from '../api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type {
  StatsDiskWire,
  StatsIncidentRowWire,
  StatsOverviewWire,
  StatsTimelineRowWire,
} from '../types';
import styles from './HomePage.module.css';

const DEVICE_COLORS = ['#3AAFA9', '#4C9FDD', '#E8A838', '#B87333', '#9B7EDE', '#E85D75'];

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

interface DashboardData {
  overview: StatsOverviewWire;
  timeline: StatsTimelineRowWire[];
  incidents: StatsIncidentRowWire[];
  disk: StatsDiskWire;
}

interface DashboardCounts {
  streams: number | null;
  devices: number | null;
}

interface TimelineChart {
  data: Array<Record<string, number | string>>;
  devices: string[];
}

export function HomePage() {
  const { user, capabilities } = useAuth();
  const canViewIncidents = capabilities.includes('admin:read');

  const [data, setData] = useState<DashboardData | null>(null);
  const [counts, setCounts] = useState<DashboardCounts>({ streams: null, devices: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const stats = [
      apiFetch('/stats/overview'),
      apiFetch('/stats/timeline?days=14'),
      canViewIncidents ? apiFetch('/stats/incidents?days=30') : Promise.resolve(null),
      apiFetch('/stats/disk'),
    ];
    Promise.all(stats)
      .then(async ([overviewRes, timelineRes, incidentsRes, diskRes]) => {
        if (!overviewRes?.ok || !timelineRes?.ok || !diskRes?.ok) {
          throw new Error(`Ошибка загрузки статистики (${overviewRes?.status ?? '-'}/${timelineRes?.status ?? '-'})`);
        }
        if (canViewIncidents && !incidentsRes?.ok) {
          throw new Error(`Ошибка загрузки статистики (инциденты ${incidentsRes?.status ?? '-'})`);
        }
        return Promise.all([
          overviewRes.json(),
          timelineRes.json(),
          incidentsRes ? incidentsRes.json() : Promise.resolve([]),
          diskRes.json(),
        ]);
      })
      .then(([overview, timeline, incidents, disk]) => {
        if (cancelled) return;
        setData({
          overview: overview as StatsOverviewWire,
          timeline: timeline as StatsTimelineRowWire[],
          incidents: incidents as StatsIncidentRowWire[],
          disk: disk as StatsDiskWire,
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить дашборд');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick, canViewIncidents]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch('/streams?limit=1').then(r => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/devices?limit=1').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([streams, devices]) => {
      if (cancelled) return;
      setCounts({
        streams: typeof streams?.total === 'number' ? streams.total : null,
        devices: typeof devices?.total === 'number' ? devices.total : null,
      });
    });
    return () => { cancelled = true; };
  }, [tick]);

  const timelineChart = useMemo<TimelineChart>(() => {
    const rows = data?.timeline ?? [];
    if (rows.length === 0) return { data: [], devices: [] };
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.device, (totals.get(r.device) ?? 0) + r.seconds);
    const devices = [...totals.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
    const dayList = [...new Set(rows.map(r => r.day))].sort();
    const recByDay = new Map<string, Record<string, number | string>>();
    for (const day of dayList) {
      const rec: Record<string, number | string> = { day };
      for (const d of devices) rec[d] = 0;
      recByDay.set(day, rec);
    }
    for (const r of rows) {
      const rec = recByDay.get(r.day);
      if (rec) rec[r.device] = Number(rec[r.device]) + r.seconds;
    }
    return { data: dayList.map(d => recByDay.get(d) as Record<string, number | string>), devices };
  }, [data?.timeline]);

  // «Отснято сегодня». Серверное recordingTodayS режет «сегодня» по календарю Postgres (UTC)
  // и по дню СТАРТА сегмента: для живых/длинных сегментов, начатых вчера по UTC, в утренние
  // часы локального дня оно даёт ложный 0. Когда оно 0 — берём сумму секунд из timeline за
  // ЛОКАЛЬНЫЙ день пользователя (та же выборка, что у графика); нет локального дня — честный 0.
  const recordedTodayS = useMemo<number>(() => {
    const backend = data?.overview.recordingTodayS ?? 0;
    if (backend > 0) return backend;
    const rows = data?.timeline ?? [];
    if (rows.length === 0) return 0;
    const today = localDayKey(new Date());
    return rows.reduce((acc, r) => (r.day === today ? acc + r.seconds : acc), 0);
  }, [data]);

  const incidentData = useMemo<Array<Record<string, number | string>>>(() => {
    const rows = data?.incidents ?? [];
    if (rows.length === 0) return [];
    const dayList = [...new Set(rows.map(r => r.day))].sort();
    const recByDay = new Map<string, Record<string, number | string>>();
    for (const day of dayList) {
      recByDay.set(day, { day, info: 0, warning: 0, critical: 0 });
    }
    for (const r of rows) {
      const rec = recByDay.get(r.day);
      if (rec && r.severity in rec) rec[r.severity] = Number(rec[r.severity]) + r.count;
    }
    return dayList.map(d => recByDay.get(d) as Record<string, number | string>);
  }, [data?.incidents]);

  const overview = data?.overview;
  const disk = data?.disk;

  return (
    <Layout>
      <div className={styles.welcome}>
        <div className={styles.heroRow}>
          <div className={styles.heroBrand}>
            <div className={styles.heroIcon}>T</div>
            <h1 className={styles.heroTitle}>ТИМП-РГР</h1>
          </div>
          <div className={styles.heroUser}>
            <span className={styles.userName}>{user?.username ?? 'гость'}</span>
            <span className={styles.userRole}>{user?.role ?? ''}</span>
            {capabilities.includes('admin:read') && (
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

      <section className={styles.dashboard} aria-label="Дашборд">
        <h2 className={styles.dashTitle}>Дашборд</h2>

        {loading && <DashboardSkeleton canViewIncidents={canViewIncidents} />}

        {!loading && loadError && (
          <div className={styles.failed}>
            <div className={styles.errorText}>{loadError}</div>
            <Button variant="outline" size="sm" onClick={() => setTick(t => t + 1)}>Повторить</Button>
          </div>
        )}

        {!loading && !loadError && overview && (
          <>
            <div className={styles.tiles}>
              <StatTile label="Сейчас в эфире">
                <div className={styles.tileLive}>
                  {overview.processes.running > 0 && <span className={styles.tileLiveDot} />}
                  <span className={styles.tileValue}>{overview.processes.running.toLocaleString('ru-RU')}</span>
                </div>
                <div className={styles.tileSub}>сессий записи</div>
              </StatTile>

              <StatTile label="Записей всего">
                <div className={styles.tileValue}>{overview.processes.total.toLocaleString('ru-RU')}</div>
                {overview.processes.total - overview.processes.running > 0 && (
                  <div className={styles.tileSub}>
                    остановлено {(overview.processes.total - overview.processes.running).toLocaleString('ru-RU')}
                  </div>
                )}
              </StatTile>

              <StatTile label="Потоков">
                <div className={styles.tileValue}>{counts.streams === null ? '—' : counts.streams.toLocaleString('ru-RU')}</div>
              </StatTile>

              <StatTile label="Камер">
                <div className={styles.tileValue}>{counts.devices === null ? '—' : counts.devices.toLocaleString('ru-RU')}</div>
              </StatTile>

              <StatTile label="Отснято сегодня">
                <div className={styles.tileValue}>{formatHours(recordedTodayS)}</div>
              </StatTile>

              <StatTile label="Всего">
                <div className={styles.tileValue}>{overview.segments.count.toLocaleString('ru-RU')}</div>
                <div className={styles.tileSub}>
                  {formatHours(overview.segments.durationS)} · {formatBytes(overview.segments.sizeBytes)}
                </div>
              </StatTile>

              {canViewIncidents && (
                <StatTile label="Инциденты 24ч">
                  <div className={styles.tileValue}>{overview.incidents.last24h.toLocaleString('ru-RU')}</div>
                  <div className={styles.sevRow}>
                    {(Object.keys(SEVERITY_COLORS) as Array<keyof typeof SEVERITY_COLORS>).map(s => (
                      <span key={s} className={styles.sevItem} title={`всего ${SEVERITY_LABELS[s].toLowerCase()}`}>
                        <span className={styles.sevDot} style={{ background: SEVERITY_COLORS[s] }} />
                        <span className={styles.sevCount}>{overview.incidents.bySeverity[s]}</span>
                      </span>
                    ))}
                  </div>
                </StatTile>
              )}
            </div>

            <div className={styles.gridArea}>
              <div className={styles.span2}>
                <Card>
                  <div className={styles.chartBody}>
                    <div className={styles.chartTitle}>Запись по дням, 14д</div>
                    {timelineChart.devices.length === 0 ? (
                      <div className={styles.chartEmpty}>Нет данных за период</div>
                    ) : (
                      <div className={styles.chartBox}>
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={timelineChart.data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="day" tickFormatter={fmtAxisDay} tick={AXIS_TICK} minTickGap={20} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                            <YAxis tickFormatter={fmtAxisSeconds} tick={AXIS_TICK} width={40} tickLine={false} axisLine={false} />
                            <Tooltip
                              contentStyle={TOOLTIP_STYLE}
                              labelStyle={{ color: '#D4D8DE' }}
                              labelFormatter={label => fmtTooltipDay(String(label))}
                              formatter={(value) => formatHours(Number(value))}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#6A7A8C', paddingTop: 6 }} iconSize={9} />
                            {timelineChart.devices.map((device, i) => (
                              <Area
                                key={device}
                                type="monotone"
                                dataKey={device}
                                stackId="rec"
                                stroke={DEVICE_COLORS[i % DEVICE_COLORS.length]}
                                fill={DEVICE_COLORS[i % DEVICE_COLORS.length]}
                                fillOpacity={0.55}
                                strokeWidth={1.2}
                              />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {canViewIncidents && (
                <Card>
                  <div className={styles.chartBody}>
                    <div className={styles.chartTitle}>Инциденты по дням, 30д</div>
                    {incidentData.length === 0 ? (
                      <div className={styles.chartEmpty}>Нет данных за период</div>
                    ) : (
                      <div className={styles.chartBox}>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={incidentData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
              )}

              <div className={canViewIncidents ? undefined : styles.span2}>
                <DiskCard disk={disk} />
              </div>
            </div>
          </>
        )}
      </section>
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

function DiskCard({ disk }: { disk: StatsDiskWire | undefined }) {
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

function DashboardSkeleton({ canViewIncidents }: { canViewIncidents: boolean }) {
  return (
    <>
      <div className={styles.tiles}>
        {Array.from({ length: canViewIncidents ? 7 : 6 }, (_, i) => (
          <div key={i} className={styles.tile}>
            <Skeleton width="55%" height={11} />
            <Skeleton width="70%" height={24} />
            <Skeleton width="40%" height={11} />
          </div>
        ))}
      </div>
      <div className={styles.gridArea}>
        <div className={styles.span2}>
          <Card>
            <div className={styles.chartBody}>
              <Skeleton width={160} height={13} />
              <Skeleton width="100%" height={280} />
            </div>
          </Card>
        </div>
        {canViewIncidents && (
          <Card>
            <div className={styles.chartBody}>
              <Skeleton width={160} height={13} />
              <Skeleton width="100%" height={240} />
            </div>
          </Card>
        )}
        <div className={canViewIncidents ? undefined : styles.span2}>
          <Card>
            <div className={styles.chartBody}>
              <Skeleton width={120} height={13} />
              <Skeleton width="100%" height={40} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Локальный календарный день как YYYY-MM-DD — ключ «day» строк /stats/timeline. */
function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtAxisDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}.${m}`;
}

function fmtTooltipDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

function fmtAxisSeconds(v: number | string): string {
  const s = Number(v);
  if (!Number.isFinite(s)) return '';
  if (s >= 3600) return `${Math.round(s / 3600)} ч`;
  if (s >= 60) return `${Math.round(s / 60)} мин`;
  return `${Math.round(s)} с`;
}

/** Человекочитаемое представление длительности (дни/часы/минуты). */
function formatHours(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} д ${h} ч` : `${d} д`;
  if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  return `${m} мин`;
}

/** Человекочитаемый размер в двоичных единицах. */
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
