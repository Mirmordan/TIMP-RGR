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
}

/**
 * Общие поля супертипа objects, наследуемые доменными сущностями.
 * name/description — собственные поля objects (устройство/поток/запись/инцидент
 * каждое со своим названием); наследование по parent_id упразднено.
 */
export interface CommonObjectMeta {
  name?: string | null;
  description?: string | null;
  parentObjectId?: string | null;
  parentType?: string | null;
}

export interface RecordingDevice extends CommonObjectMeta {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
}

export interface RecordingStream extends CommonObjectMeta {
  id: string;
  url: string;
  deviceId?: string;
  sourceFingerprint?: string;
  createdAt: Date;
}

export interface RecordingProcess extends CommonObjectMeta {
  id: string;
  streamId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'running' | 'stopped' | 'failed';
  createdAt: Date;
}

export interface RecordingChunk extends CommonObjectMeta {
  id: string;
  processId: string;
  startedAt: Date;
  endedAt: Date;
  url: string;
  createdAt: Date;
}

export interface RecordingSegment extends CommonObjectMeta {
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
  name: string;
  description?: string;
  /** @deprecated алиас для name (обратная совместимость). */
  title?: string;
  timeOffsetS: number;
  severity: 'info' | 'warning' | 'critical';
  parentObjectId?: string | null;
  parentType?: string | null;
  createdAt: Date;
  createdBy?: string;
}