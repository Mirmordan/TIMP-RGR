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
