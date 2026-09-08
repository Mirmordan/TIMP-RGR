import * as fs from 'fs';
import * as path from 'path';
import { queryAs } from '../security/dbBridge';
import { config } from '../config';

const DISK_CACHE_TTL_MS = 60_000;

// --- Типы ответов ---

interface OverviewProcesses {
  total: number;
  running: number;
}

interface OverviewSegments {
  count: number;
  durationS: number;
  sizeBytes: number;
}

interface OverviewIncidents {
  total: number;
  bySeverity: { info: number; warning: number; critical: number };
  last24h: number;
}

interface TopDevice {
  id: string;
  name: string;
  durationS: number;
}

export interface OverviewStats {
  processes: OverviewProcesses;
  segments: OverviewSegments;
  incidents: OverviewIncidents;
  devices: { visible: number };
  topDevices: TopDevice[];
  recordingTodayS: number;
}

export interface TimelineRow {
  day: string;
  device: string;
  seconds: number;
}

export interface IncidentTimelineRow {
  day: string;
  severity: string;
  count: number;
}

export interface DiskStats {
  chunksBytes: number | null;
  freeBytes: number | null;
  totalBytes: number | null;
}

export interface DailyDashboardRow {
  /** Полный UTC-день в формате YYYY-MM-DD. */
  day: string;
  /** Секунд записи в этом UTC-сутках (сумма пересечений интервалов сегментов с сутками). */
  recordingSeconds: number;
  /** Сколько сегментов реально пересекают эти сутки (overlap > 0). */
  segmentCount: number;
  incidents: {
    info: number;
    warning: number;
    critical: number;
    total: number;
  };
}

export interface DashboardSource {
  id: string;
  label: string;
  seconds: number;
  segmentCount: number;
  lastStartedAt: string | null;
}

export interface DashboardStats {
  generatedAt: string;
  timezone: 'UTC';
  period: {
    days: number;
    /** YYYY-MM-DD UTC первого бакета. */
    startDay: string;
    /** YYYY-MM-DD UTC текущей даты. */
    endDay: string;
  };
  tiles: {
    processes: {
      total: number;
      running: number;
      stopped: number;
      failed: number;
    };
    segments: {
      count: number;
      durationS: number;
      sizeBytes: number;
    };
    recording: {
      /** Секунд записи в текущих UTC-сутках. */
      todayS: number;
      /** Секунд записи за скользящие 24 часа от now(). */
      last24hS: number;
    };
    streams: {
      /** Видимых пользователю потоков-источников (всего). */
      visible: number;
      /** Потоков с записью (overlap > 0) за период. */
      recorded: number;
    };
    devices: {
      visible: number;
    };
    incidents: {
      total: number;
      last24h: number;
      bySeverity: {
        info: number;
        warning: number;
        critical: number;
      };
    };
  };
  daily: DailyDashboardRow[];
  sources: DashboardSource[];
  processStatuses: Array<{ status: 'running' | 'stopped' | 'failed'; count: number }>;
  disk: DiskStats;
}

// --- Утилиты UTC-суток и меток источников (для /dashboard) ---

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDay(d);
}

function isUrlText(value: string | null | undefined): boolean {
  return !!value && /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

/** «Короткий id» источника: 6 последних hex-символов UUID без дефисов. */
function idShort(id: string): string {
  return id.replace(/-/g, '').slice(-6);
}

function sourceLabel(id: string, url: string, streamName: string | null, deviceName: string | null): string {
  if (deviceName && !isUrlText(deviceName)) return deviceName;
  if (streamName && !isUrlText(streamName)) return streamName;

  const short = idShort(id);
  if (url.startsWith('ivideon://')) {
    const m = url.match(/\/(\d+)\/?$/);
    const camera = m?.[1];
    return camera && camera !== '0' ? `Ivideon #${short} (${camera})` : `Ivideon #${short}`;
  }
  const hls = url.match(/camera(\d+)/i);
  if (hls?.[1]) return `HLS camera${hls[1]}`;
  return `Источник #${short}`;
}

interface ProcessCountRow {
  total: number;
  running: number;
  stopped: number;
  failed: number;
}

interface SegmentTotalRow {
  count: number;
  durationS: number;
  sizeBytes: number;
}

interface VisibleCountRow {
  visible: number;
}

interface DashboardDailyRow {
  day: string;
  recordingSeconds: number;
  segmentCount: number;
}

interface DashboardDurationRow {
  seconds: number;
}

interface DashboardIncidentRow {
  day: string;
  severity: string;
  count: number;
}

interface DashboardSourceRow {
  id: string;
  url: string;
  streamName: string | null;
  deviceName: string | null;
  seconds: number;
  segmentCount: number;
  lastStartedAt: Date | null;
}

interface ProcessStatusRow {
  status: string;
  count: number;
}

// --- Агрегаты через RLS (queryAs) ---

async function getOverviewProcesses(): Promise<OverviewProcesses> {
  const { rows } = await queryAs<{ total: number; running: number }>(`
    SELECT COUNT(*)::int AS "total",
           COUNT(*) FILTER (WHERE status = 'running')::int AS "running"
    FROM recording_processes
  `);
  const row = rows[0] ?? { total: 0, running: 0 };
  return { total: row.total ?? 0, running: row.running ?? 0 };
}

async function getSegmentsAggregate(): Promise<{ segments: OverviewSegments; recordingTodayS: number }> {
  const { rows } = await queryAs<{
    count: number;
    durationS: number | null;
    sizeBytes: number | null;
    recordingTodayS: number | null;
  }>(`
    SELECT COUNT(*)::int AS "count",
           COALESCE(SUM(s.duration_s), 0)::float8 AS "durationS",
           COALESCE(SUM(s.size_bytes), 0)::float8 AS "sizeBytes",
           COALESCE(SUM(
             CASE WHEN s.ended_at IS NULL AND s.started_at::date = CURRENT_DATE
                  THEN EXTRACT(EPOCH FROM (now() - s.started_at))::float8
                  ELSE s.duration_s
             END
           ) FILTER (WHERE s.started_at::date = CURRENT_DATE), 0)::float8 AS "recordingTodayS"
    FROM recording_segments s
    JOIN recording_processes p ON p.object_id = s.process_id
    JOIN recording_streams st ON st.object_id = p.stream_id
  `);
  const row = rows[0] ?? null;
  return {
    segments: {
      count: row?.count ?? 0,
      durationS: row?.durationS ?? 0,
      sizeBytes: row?.sizeBytes ?? 0,
    },
    recordingTodayS: row?.recordingTodayS ?? 0,
  };
}

async function getIncidentsOverview(): Promise<OverviewIncidents> {
  const [{ rows: totals }, { rows: bySeverity }] = await Promise.all([
    queryAs<{ total: number; last24h: number }>(`
      SELECT COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS "last24h"
      FROM recording_incidents
    `),
    queryAs<{ severity: string; count: number }>(`
      SELECT severity, COUNT(*)::int AS "count"
      FROM recording_incidents
      GROUP BY severity
    `),
  ]);

  const severityCounts: Record<string, number> = {};
  for (const r of bySeverity) severityCounts[r.severity] = r.count;

  const total = totals[0]?.total ?? 0;
  const last24h = totals[0]?.last24h ?? 0;
  return {
    total,
    last24h,
    bySeverity: {
      info: severityCounts['info'] ?? 0,
      warning: severityCounts['warning'] ?? 0,
      critical: severityCounts['critical'] ?? 0,
    },
  };
}

async function getDevicesVisible(): Promise<number> {
  const { rows } = await queryAs<{ visible: number }>(`
    SELECT COUNT(*)::int AS "visible"
    FROM recording_devices
  `);
  return rows[0]?.visible ?? 0;
}

async function getTopDevices(): Promise<TopDevice[]> {
  const { rows } = await queryAs<TopDevice>(`
    SELECT d.object_id::text AS "id", NULLIF(do_.name, '') AS "name",
           COALESCE(SUM(s.duration_s), 0)::float8 AS "durationS"
    FROM recording_segments s
    JOIN recording_processes p ON p.object_id = s.process_id
    JOIN recording_streams st ON st.object_id = p.stream_id
    JOIN recording_devices d ON d.object_id = st.device_id
    LEFT JOIN objects do_ ON do_.id = d.object_id
    GROUP BY d.object_id, NULLIF(do_.name, '')
    ORDER BY "durationS" DESC
    LIMIT 5
  `);
  return rows;
}

export const statsService = {
  async getOverview(): Promise<OverviewStats> {
    const [processes, segmentsAgg, incidents, devicesVisible, topDevices] = await Promise.all([
      getOverviewProcesses(),
      getSegmentsAggregate(),
      getIncidentsOverview(),
      getDevicesVisible(),
      getTopDevices(),
    ]);

    return {
      processes,
      segments: segmentsAgg.segments,
      incidents,
      devices: { visible: devicesVisible },
      topDevices,
      recordingTodayS: segmentsAgg.recordingTodayS,
    };
  },

  /** Сводка рабочего дашборда. График записи — честные пересечения интервалов сегментов с UTC-сутками. */
  async getDashboard(days: number): Promise<DashboardStats> {
    const periodDays = Math.min(Math.max(Math.floor(days) || 1, 1), 365);
    const endDay = isoDay(new Date());
    const startDay = addUtcDays(endDay, -(periodDays - 1));
    const periodStartTs = `${startDay}T00:00:00.000Z`;

    const [
      processRows,
      segmentRows,
      incidentsOverview,
      devicesVisible,
      streamsVisible,
      dailyRows,
      last24Rows,
      incidentDailyRows,
      sourceRows,
      disk,
    ] = await Promise.all([
      queryAs<ProcessCountRow>(`
        SELECT COUNT(*)::int AS "total",
               COUNT(*) FILTER (WHERE status = 'running')::int AS "running",
               COUNT(*) FILTER (WHERE status = 'stopped')::int AS "stopped",
               COUNT(*) FILTER (WHERE status = 'failed')::int AS "failed"
        FROM recording_processes
      `),
      queryAs<SegmentTotalRow>(`
        SELECT COUNT(*)::int AS "count",
               COALESCE(SUM(s.duration_s), 0)::float8 AS "durationS",
               COALESCE(SUM(s.size_bytes), 0)::float8 AS "sizeBytes"
        FROM recording_segments s
        JOIN recording_processes p ON p.object_id = s.process_id
        JOIN recording_streams st ON st.object_id = p.stream_id
      `),
      getIncidentsOverview(),
      getDevicesVisible(),
      queryAs<VisibleCountRow>(`
        SELECT COUNT(*)::int AS "visible"
        FROM recording_streams
      `),
      queryAs<DashboardDailyRow>(`
        SELECT to_char(($1::date + g.i)::timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day",
               COALESCE(SUM(EXTRACT(EPOCH FROM (
                 LEAST(d.seg_end, (($1::date + g.i + 1))::timestamp AT TIME ZONE 'UTC')
               - GREATEST(d.seg_start, ($1::date + g.i)::timestamp AT TIME ZONE 'UTC'))
               )), 0)::float8 AS "recordingSeconds",
               COUNT(*)::int AS "segmentCount"
        FROM (
          SELECT s.started_at AS seg_start,
                 COALESCE(s.ended_at, now()) AS seg_end,
                 GREATEST(0, ((s.started_at AT TIME ZONE 'UTC')::date - $1::date)) AS i0,
                 LEAST(($2::date - $1::date), ((COALESCE(s.ended_at, now()) AT TIME ZONE 'UTC')::date - $1::date)) AS i1
          FROM recording_segments s
          JOIN recording_processes p ON p.object_id = s.process_id
          JOIN recording_streams st ON st.object_id = p.stream_id
          WHERE s.started_at < now()
            AND COALESCE(s.ended_at, now()) > $1::timestamp AT TIME ZONE 'UTC'
        ) d
        CROSS JOIN LATERAL generate_series(d.i0, d.i1) g(i)
        WHERE (LEAST(d.seg_end, (($1::date + g.i + 1))::timestamp AT TIME ZONE 'UTC')
             - GREATEST(d.seg_start, ($1::date + g.i)::timestamp AT TIME ZONE 'UTC')) > interval '0 seconds'
        GROUP BY g.i
      `, [startDay, endDay]),
      queryAs<DashboardDurationRow>(`
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
          LEAST(COALESCE(s.ended_at, now()), now())
        - GREATEST(s.started_at, now() - interval '24 hours')
        ))), 0)::float8 AS "seconds"
        FROM recording_segments s
        JOIN recording_processes p ON p.object_id = s.process_id
        JOIN recording_streams st ON st.object_id = p.stream_id
        WHERE s.started_at < now()
          AND COALESCE(s.ended_at, now()) > now() - interval '24 hours'
      `),
      queryAs<DashboardIncidentRow>(`
        SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day",
               severity,
               COUNT(*)::int AS "count"
        FROM recording_incidents
        WHERE created_at >= $1::timestamp AT TIME ZONE 'UTC'
          AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'UTC')
        GROUP BY 1, 2
      `, [startDay, endDay]),
      queryAs<DashboardSourceRow>(`
        SELECT x.stream_id::text AS "id",
               x.url AS "url",
               x.stream_name AS "streamName",
               x.device_name AS "deviceName",
               COALESCE(SUM(x.secs), 0)::float8 AS "seconds",
               COUNT(DISTINCT x.segment_id)::int AS "segmentCount",
               MAX(x.started_at) AS "lastStartedAt"
        FROM (
          SELECT s.object_id AS segment_id,
                 s.started_at,
                 st.object_id AS stream_id,
                 st.url AS url,
                 NULLIF(o_stream.name, '') AS stream_name,
                 NULLIF(o_dev.name, '') AS device_name,
                 EXTRACT(EPOCH FROM (
                   LEAST(COALESCE(s.ended_at, now()), now())
                 - GREATEST(s.started_at, $1::timestamptz)
                 ))::float8 AS secs
          FROM recording_segments s
          JOIN recording_processes p ON p.object_id = s.process_id
          JOIN recording_streams st ON st.object_id = p.stream_id
          LEFT JOIN objects o_stream ON o_stream.id = st.object_id
          LEFT JOIN objects o_dev ON o_dev.id = st.device_id
          WHERE s.started_at < now()
            AND COALESCE(s.ended_at, now()) > $1::timestamptz
        ) x
        WHERE x.secs > 0
        GROUP BY x.stream_id, x.url, x.stream_name, x.device_name
      `, [periodStartTs]),
      statsService.getDisk(),
    ]);

    const p = processRows.rows[0] ?? { total: 0, running: 0, stopped: 0, failed: 0 };
    const seg = segmentRows.rows[0] ?? { count: 0, durationS: 0, sizeBytes: 0 };

    const dailyMap = new Map<string, DashboardDailyRow>();
    for (const row of dailyRows.rows) dailyMap.set(row.day, row);

    const incByDay = new Map<string, { info: number; warning: number; critical: number; total: number }>();
    for (const row of incidentDailyRows.rows) {
      const entry = incByDay.get(row.day) ?? { info: 0, warning: 0, critical: 0, total: 0 };
      const severity = row.severity as 'info' | 'warning' | 'critical';
      if (severity === 'info' || severity === 'warning' || severity === 'critical') {
        entry[severity] += row.count;
      }
      entry.total += row.count;
      incByDay.set(row.day, entry);
    }

    const daily: DailyDashboardRow[] = [];
    for (let i = 0; i < periodDays; i++) {
      const day = addUtcDays(startDay, i);
      const rec = dailyMap.get(day);
      const inc = incByDay.get(day) ?? { info: 0, warning: 0, critical: 0, total: 0 };
      daily.push({
        day,
        recordingSeconds: rec?.recordingSeconds ?? 0,
        segmentCount: rec?.segmentCount ?? 0,
        incidents: { info: inc.info, warning: inc.warning, critical: inc.critical, total: inc.total },
      });
    }

    const sources: DashboardSource[] = sourceRows.rows.map((row) => ({
      id: row.id,
      label: sourceLabel(row.id, row.url, row.streamName, row.deviceName),
      seconds: row.seconds,
      segmentCount: row.segmentCount,
      lastStartedAt: row.lastStartedAt ? row.lastStartedAt.toISOString() : null,
    }));
    sources.sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label, 'ru'));

    return {
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      period: { days: periodDays, startDay, endDay },
      tiles: {
        processes: { total: p.total, running: p.running, stopped: p.stopped, failed: p.failed },
        segments: { count: seg.count, durationS: seg.durationS, sizeBytes: seg.sizeBytes },
        recording: {
          todayS: dailyMap.get(endDay)?.recordingSeconds ?? 0,
          last24hS: last24Rows.rows[0]?.seconds ?? 0,
        },
        streams: {
          visible: streamsVisible.rows[0]?.visible ?? 0,
          recorded: sources.length,
        },
        devices: { visible: devicesVisible },
        incidents: incidentsOverview,
      },
      daily,
      sources: sources.slice(0, 8),
      processStatuses: [
        { status: 'running', count: p.running },
        { status: 'stopped', count: p.stopped },
        { status: 'failed', count: p.failed },
      ],
      disk,
    };
  },

  /** Бакеты (день × устройство) за последние `days` календарных дней. */
  async getTimeline(days: number): Promise<TimelineRow[]> {
    const { rows } = await queryAs<TimelineRow>(`
      SELECT to_char(s.started_at, 'YYYY-MM-DD') AS "day",
             COALESCE(NULLIF(o.name, ''), 'Без камеры') AS "device",
             COALESCE(SUM(s.duration_s), 0)::float8 AS "seconds"
      FROM recording_segments s
      JOIN recording_processes p ON p.object_id = s.process_id
      JOIN recording_streams st ON st.object_id = p.stream_id
      LEFT JOIN recording_devices d ON d.object_id = st.device_id
      LEFT JOIN objects o ON o.id = d.object_id
      WHERE s.started_at >= now() - make_interval(days => $1)
      GROUP BY to_char(s.started_at, 'YYYY-MM-DD'), COALESCE(NULLIF(o.name, ''), 'Без камеры')
      ORDER BY 1, 2
    `, [days]);
    return rows;
  },

  /** Инциденты по (день × severity) за последние `days` дней. */
  async getIncidentsTimeline(days: number): Promise<IncidentTimelineRow[]> {
    const { rows } = await queryAs<IncidentTimelineRow>(`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS "day",
             severity,
             COUNT(*)::int AS "count"
      FROM recording_incidents
      WHERE created_at >= now() - make_interval(days => $1)
      GROUP BY to_char(created_at, 'YYYY-MM-DD'), severity
      ORDER BY 1, 2
    `, [days]);
    return rows;
  },

  /** Диск (без RLS). Кэш 60 секунд. */
  async getDisk(): Promise<DiskStats> {
    const cached = diskCache;
    if (cached && Date.now() - cached.at < DISK_CACHE_TTL_MS) {
      return cached.data;
    }

    const roots = [
      config.mediaMTX.recordRootHost,
      config.ffmpegManager.recordRoot,
    ];
    const existing = roots.filter((r) => fs.existsSync(r));

    let chunksBytes: number | null = 0;
    for (const dir of existing) {
      chunksBytes += await dirBytes(dir);
    }

    let freeBytes: number | null = null;
    let totalBytes: number | null = null;
    const statfs = fs.promises.statfs as (typeof fs.promises)['statfs'] | undefined;
    if (statfs && existing.length > 0) {
      try {
        const s = await statfs(existing[0]!);
        totalBytes = Number(s.blocks) * Number(s.bsize);
        freeBytes = Number(s.bavail) * Number(s.bsize);
      } catch {
        freeBytes = null;
        totalBytes = null;
      }
    }

    const data: DiskStats = { chunksBytes, freeBytes, totalBytes };
    diskCache = { at: Date.now(), data };
    return data;
  },
};

let diskCache: { at: number; data: DiskStats } | null = null;

/** Суммарный размер всех файлов внутри каталога (рекурсивно). */
async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(full);
          total += stat.size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return total;
}
