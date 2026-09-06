import type { Capability } from './types';

/**
 * Коды спец-прав, которые реально читает/пишет система.
 * Должен совпадать с CHECK (capability IN (...)) в role_capabilities.
 * Эталон: в проде источник прав — таблица role_capabilities; константа
 * используется для валидации запросов и для каталога в /admin/capabilities.
 */
export const CAPABILITIES: readonly Capability[] = [
  'admin:read',
  'admin:write',
  'user:create',
  'user:read',
  'user:update',
  'user:delete',
] as const;

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export interface CapabilityInfo {
  code: Capability;
  label: string;
  description: string;
}

/** Каталог спец-прав для /admin/capabilities (код + человекочитаемая подпись). */
export const CAPABILITY_CATALOG: readonly CapabilityInfo[] = [
  {
    code: 'admin:read',
    label: 'Панель администратора: чтение',
    description: 'Просмотр панели /admin (пользователи, роли, группы, права, аудит) и /stats/disk.',
  },
  {
    code: 'admin:write',
    label: 'Панель администратора: изменение',
    description: 'Управление пользователями, ролями, группами и правами в /admin, очистка аудита, создание устройств/потоков/процессов/чанков.',
  },
  {
    code: 'user:create',
    label: 'Пользователи: создание',
    description: 'Создание пользователей через API /users.',
  },
  {
    code: 'user:read',
    label: 'Пользователи: чтение',
    description: 'Просмотр списка и карточек пользователей через API /users.',
  },
  {
    code: 'user:update',
    label: 'Пользователи: изменение',
    description: 'Редактирование пользователей через API /users (PUT/PATCH).',
  },
  {
    code: 'user:delete',
    label: 'Пользователи: удаление',
    description: 'Удаление пользователей через API /users.',
  },
];
