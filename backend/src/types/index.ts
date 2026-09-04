export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
}

/**
 * Внутренняя модель юзера, включает хэш пароля.
 * НЕ должен покидать слои репозитория/security/authService.
 */
export interface UserAuth extends User {
  passwordHash: string | null;
}

/** Входные данные для создания/обновления юзера (пароль в открытом виде, только для ввода). */
export interface UserInput {
  username?: string;
  email?: string;
  password?: string;
}export interface RecordingDevice {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
}

export interface RecordingStream {
  id: string;
  url: string;
  deviceId?: string;
  sourceFingerprint?: string;
  createdAt: Date;
}

export interface RecordingProcess {
  id: string;
  streamId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'running' | 'stopped' | 'failed';
  createdAt: Date;
}

export interface RecordingChunk {
  id: string;
  processId: string;
  startedAt: Date;
  endedAt: Date;
  url: string;
  createdAt: Date;
}

export interface RecordingSegment {
  id: string;
  processId: string;
  streamId: string;
  path: string;
  startedAt: Date;
  endedAt: Date | null;
  fileCount: number;
  durationS: number;
  sizeBytes: number;
  createdAt: Date;
}

export interface RecordingIncident {
  id: string;
  processId: string;
  segmentId?: string;
  title: string;
  description?: string;
  timeOffsetS: number;
  severity: 'info' | 'warning' | 'critical';
  createdAt: Date;
  createdBy?: string;
}