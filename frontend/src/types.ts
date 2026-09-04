export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  role?: string;
}

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
  endedAt: string;
  live: boolean;
}

export interface TimelineData {
  segments: TimelineSegment[];
  totalDurationS: number;
  start: string | null;
  end: string | null;
  live?: boolean;
}
