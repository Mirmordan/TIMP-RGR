import { pool } from '../database/connection';
import { Cache } from './permissionCache';
import type { ObjectAction } from './types';

const adminCache = new Cache<boolean>(2000, 5 * 60_000);
const userCapabilitiesCache = new Cache<Set<string>>(2000, 5 * 60_000);

async function isAdmin(userId: string): Promise<boolean> {
  const cached = adminCache.get(userId);
  if (cached !== undefined) return cached;
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1 AND r.name = 'admin'
     ) AS "exists"`,
    [userId],
  );
  const admin = rows[0]?.exists ?? false;
  adminCache.set(userId, admin);
  return admin;
}

/**
 * Application-level Access Control List.
 *
 * can() вызывает БД-функцию object_can(), которая является единственным
 * источником истины для модели доступа:
 *  - админ;
 *  - право по группе/прямому grant на объект, любого предка через parent_id
 *    или группу, содержащую объект/предка;
 *  - owner bootstrap для read (создатель видит свой не введённый в группы объект).
 *
 * RLS в БД продолжает enforcing те же functions. Инвалидация кешей доступа на
 * уровне приложения после 20-object-access-inheritance не требуется: решение
 * всегда получается из текущей таблицы прав.
 */
export async function can(
  userId: string,
  objectId: string,
  action: ObjectAction,
): Promise<boolean> {
  const { rows } = await pool.query<{ allowed: boolean }>(
    'SELECT object_can($1::uuid, $2::text, $3::uuid) AS "allowed"',
    [objectId, action, userId],
  );
  return rows[0]?.allowed ?? false;
}

/**
 * Union спец-прав пользователя: DISTINCT по ролям из user_roles JOIN
 * role_capabilities. Хранится в кеше (инвалидируется invalidateUser).
 */
async function getUserCapabilities(userId: string): Promise<Set<string>> {
  const cached = userCapabilitiesCache.get(userId);
  if (cached) return cached;
  const { rows } = await pool.query<{ capability: string }>(
    `SELECT DISTINCT rc.capability AS "capability"
     FROM user_roles ur
     JOIN role_capabilities rc ON rc.role_id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId],
  );
  const set = new Set(rows.map((r) => r.capability));
  userCapabilitiesCache.set(userId, set);
  return set;
}

/**
 * Есть ли у юзера глобальный capability (системная операция).
 * Источник прав — таблица role_capabilities (union по ролям юзера);
 * роль admin дополнительно даёт полный набор (RLS/ACL-семантика is_admin).
 */
export async function hasCapability(
  userId: string,
  capability: string,
): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const caps = await getUserCapabilities(userId);
  return caps.has(capability);
}

// --- Инвалидация кешей спец-прав (доступ через object_can всегда свежий) ---
export function invalidateUser(userId: string): void {
  adminCache.del(userId);
  userCapabilitiesCache.del(userId);
  clearAclCaches();
}

export function invalidateObject(_objectId: string): void {
  clearAclCaches();
}

export function invalidateObjectHierarchy(_objectId: string): void {
  clearAclCaches();
}

export function invalidateGroup(_groupId: string): void {
  clearAclCaches();
}

/** Полностью сбросить ACL-кеши (для изменений RBAC). */
export function clearAclCaches(): void {
  adminCache.clear();
  userCapabilitiesCache.clear();
}
