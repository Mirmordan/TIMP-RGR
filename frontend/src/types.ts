export interface User {
  id: string;
  username: string;
  email?: string;
  createdAt?: string;
  role?: string;
}

export type Capabilities = string[];

export interface RecordingDevice {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

export interface RecordingStream {
  id: string;
  url: string;
  deviceId?: string | null;
  sourceFingerprint?: string | null;
  createdAt: string;
}

export interface RecordingProcess {
  id: string;
  streamId: string;
  startedAt: string;
  endedAt: string | null;
  status: 'running' | 'stopped' | 'failed';
  createdAt: string;
}

export interface RecordingSegment {
  id: string;
  processId: string;
  streamId: string;
  path: string;
  startedAt: string;
  endedAt: string | null;
  fileCount: number;
  durationS: number;
  sizeBytes: string;
  createdAt: string;
}

export interface RecordingIncident {
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

export interface TimelineSegment {
  id: string;
  startOffsetS: number;
  durationS: number;
  fileCount: number;
  sizeBytes: string;
  startedAt: string;
  endedAt: string | null;
  live: boolean;
}

export interface TimelineData {
  segments: TimelineSegment[];
  totalDurationS: number;
  start: string | null;
  end: string | null;
  live?: boolean;
}

export interface AdminRole {
  id: string;
  name: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  passwordSet: boolean;
  roles: Array<{ id: string; name: string }>;
}

export interface AdminCreateUserResponse {
  user: AdminUser;
  initialPassword?: string;
}

export interface AdminResetPasswordResponse {
  ok: boolean;
  initialPassword?: string;
}

export interface AdminGroup {
  id: string;
  name: string;
  objectCount: number;
}

export interface AdminGroupObject {
  objectId: string;
  name: string | null;
  type: string | null;
}

export interface AdminPermission {
  id: string;
  roleId: string;
  roleName: string;
  groupId: string;
  groupName: string;
  action: string;
}

/** Действия аудит-лога (U1) — зеркалит backend AUDIT_ACTIONS. */
export const AUDIT_ACTIONS = [
  'user.create',
  'user.update',
  'user.delete',
  'user.password.reset',
  'user.roles.set',
  'role.create',
  'role.rename',
  'role.delete',
  'role.perms.set',
  'group.create',
  'group.rename',
  'group.delete',
  'group.members.set',
  'auth.login.failed',
  'auth.password.change',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Запись аудит-лога. id bigint из pg приходит строкой. */
export interface AuditEntry {
  id: number | string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
}

export interface AuditClearResponse {
  ok: boolean;
  deleted: number;
}

// --- Статистика дашборда (U6): wire-ответы /stats/* ---

export interface StatsProcessesWire {
  total: number;
  running: number;
}

export interface StatsSeverityCountsWire {
  info: number;
  warning: number;
  critical: number;
}

export interface StatsOverviewWire {
  processes: StatsProcessesWire;
  segments: {
    count: number;
    durationS: number;
    sizeBytes: number;
  };
  incidents: {
    total: number;
    bySeverity: StatsSeverityCountsWire;
    last24h: number;
  };
  devices: { visible: number };
  topDevices: Array<{ id: string; name: string; durationS: number }>;
  recordingTodayS: number;
}

/** Строка GET /stats/timeline?days=N (день × устройство). */
export interface StatsTimelineRowWire {
  day: string;
  device: string;
  seconds: number;
}

/** Строка GET /stats/incidents?days=N (день × severity). */
export interface StatsIncidentRowWire {
  day: string;
  severity: 'info' | 'warning' | 'critical';
  count: number;
}

/** Ответ GET /stats/disk. */
export interface StatsDiskWire {
  chunksBytes: number | null;
  freeBytes: number | null;
  totalBytes: number | null;
}
