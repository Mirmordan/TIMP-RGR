import type { Capabilities } from './types';

export interface AdminSection {
  label: string;
  caps: string[];
}

// Вкладки админ-панели: раздел виден, только если хоть один GET-эндпоинт вкладки
// не вернёт 403 (совпадает с requireCapability на бэкенде).
export const ADMIN_SECTIONS: AdminSection[] = [
  { label: 'Пользователи', caps: ['user:read'] },
  { label: 'Роли и права', caps: ['role:read'] },
  { label: 'Группы объектов', caps: ['group:read'] },
  { label: 'Аудит', caps: ['audit:read'] },
];

export const ADMIN_ENTRY_CAPS = ['admin:read', ...ADMIN_SECTIONS.flatMap(s => s.caps)];

export function canSeeAdmin(capabilities: Capabilities): boolean {
  return ADMIN_ENTRY_CAPS.some(c => capabilities.includes(c));
}

export function visibleAdminSections(capabilities: Capabilities): AdminSection[] {
  return ADMIN_SECTIONS.filter(s => s.caps.some(c => capabilities.includes(c)));
}
