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
  'user:password:reset',
  'role:read',
  'role:create',
  'role:update',
  'role:delete',
  'group:read',
  'group:create',
  'group:update',
  'group:delete',
  'permission:read',
  'permission:manage',
  'audit:read',
  'audit:delete',
  'camera:create',
  'stream:create',
  'process:create',
  'chunk:create',
  'media:export',
  'dashboard:read',
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
    label: 'Администрирование: обзор',
    description: 'Обзор/сводка панели администратора и глобальная статистика диска (/stats/disk).',
  },
  {
    code: 'admin:write',
    label: 'Администрирование: полный доступ',
    description: 'Полный доступ к управлению системой: выдача ролей пользователям и спец-прав ролям (совместимость с прежним admin:write).',
  },
  {
    code: 'user:create',
    label: 'Пользователи: создание',
    description: 'Создание пользователей (POST /admin/users, POST /users).',
  },
  {
    code: 'user:read',
    label: 'Пользователи: чтение',
    description: 'Просмотр списка и карточек пользователей (GET /admin/users*, GET /users*).',
  },
  {
    code: 'user:update',
    label: 'Пользователи: изменение',
    description: 'Редактирование username/email пользователей (PATCH /admin/users/:id, PUT/PATCH /users/:id).',
  },
  {
    code: 'user:delete',
    label: 'Пользователи: удаление',
    description: 'Удаление пользователей (DELETE /admin/users/:id, DELETE /users/:id).',
  },
  {
    code: 'user:password:reset',
    label: 'Пользователи: сброс пароля',
    description: 'Сброс/активация пароля пользователя админом (PUT /admin/users/:id/password).',
  },
  {
    code: 'role:read',
    label: 'Роли: чтение',
    description: 'Просмотр ролей и их спец-прав (GET /admin/roles*, GET /admin/capabilities).',
  },
  {
    code: 'role:create',
    label: 'Роли: создание',
    description: 'Создание ролей (имя admin зарезервировано) (POST /admin/roles).',
  },
  {
    code: 'role:update',
    label: 'Роли: изменение',
    description: 'Переименование ролей (роль admin переименовывать нельзя) (PATCH /admin/roles/:id).',
  },
  {
    code: 'role:delete',
    label: 'Роли: удаление',
    description: 'Удаление ролей (роль admin удалить нельзя) (DELETE /admin/roles/:id).',
  },
  {
    code: 'group:read',
    label: 'Группы объектов: чтение',
    description: 'Просмотр групп объектов и их состава (GET /admin/groups*, GET /admin/groups/:id/objects).',
  },
  {
    code: 'group:create',
    label: 'Группы объектов: создание',
    description: 'Создание групп объектов (POST /admin/groups).',
  },
  {
    code: 'group:update',
    label: 'Группы объектов: изменение',
    description: 'Переименование групп объектов (PATCH /admin/groups/:id).',
  },
  {
    code: 'group:delete',
    label: 'Группы объектов: удаление',
    description: 'Удаление групп объектов (DELETE /admin/groups/:id).',
  },
  {
    code: 'permission:read',
    label: 'Права доступа: чтение',
    description: 'Просмотр прав ролей на группы объектов и прямых выдач на объекты (GET /admin/permissions, GET /admin/roles/:id/grants, GET /admin/objects).',
  },
  {
    code: 'permission:manage',
    label: 'Права доступа: управление',
    description: 'Изменение прав ролей на группы объектов, прямых выдач на объекты и состава объектов групп (PUT /admin/roles/:id/permissions, PUT /admin/roles/:id/grants, PUT /admin/groups/:id/objects).',
  },
  {
    code: 'audit:read',
    label: 'Аудит: чтение',
    description: 'Просмотр журнала аудита (GET /admin/audit).',
  },
  {
    code: 'audit:delete',
    label: 'Аудит: очистка',
    description: 'Удаление записей журнала аудита (DELETE /admin/audit).',
  },
  {
    code: 'camera:create',
    label: 'Камеры: создание',
    description: 'Создание устройств-камер (POST /devices).',
  },
  {
    code: 'stream:create',
    label: 'Потоки: создание',
    description: 'Создание потоков-источников (POST /streams).',
  },
  {
    code: 'process:create',
    label: 'Записи: запуск процесса',
    description: 'Создание процессов записи (POST /processes).',
  },
  {
    code: 'chunk:create',
    label: 'Чанки: создание',
    description: 'Создание чанков записей (POST /chunks).',
  },
  {
    code: 'media:export',
    label: 'Медиа: экспорт',
    description: 'Экспорт фрагмента записи в файл (GET /processes/:id/export).',
  },
  {
    code: 'dashboard:read',
    label: 'Дашборд: просмотр',
    description: 'Доступ к сводке/графикам (/stats/dashboard). Не является правом админ-панели.',
  },
];
