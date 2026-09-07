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
 * name/description — эффективные (резолвятся по цепочке parent_id);
 * parentObjectId — id родительского объекта (objects.parent_id);
 * parentType — тип родительского объекта (device/stream/process), NULL для корня.
 */
export interface CommonObjectMeta {
  name?: string | null;
  description?: string | null;
  parentObjectId?: string | null;
  parentType?: string | null;
}

/**
 * Поля для форм редактирования: rawName — собственный objects.name (override,
 * NULL = наследуется); inheritedName — имя ближайшего видимого родителя.
 */
export interface NameSourceFields {
  rawName?: string | null;
  inheritedName?: string | null;
}

export interface RecordingDevice extends CommonObjectMeta {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
}

export interface RecordingStream extends CommonObjectMeta, NameSourceFields {
  id: string;
  url: string;
  deviceId?: string;
  sourceFingerprint?: string;
  createdAt: Date;
}

export interface RecordingProcess extends CommonObjectMeta, NameSourceFields {
  id: string;
  streamId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'running' | 'stopped' | 'failed';
  createdAt: Date;
}

export interface RecordingChunk extends CommonObjectMeta, NameSourceFields {
  id: string;
  processId: string;
  startedAt: Date;
  endedAt: Date;
  url: string;
  createdAt: Date;
}

export interface RecordingSegment extends CommonObjectMeta, NameSourceFields {
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
  parentObjectId?: string | null;
  parentType?: string | null;
  createdAt: Date;
  createdBy?: string;
}