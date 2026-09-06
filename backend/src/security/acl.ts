import { pool } from '../database/connection';
import { Cache } from './permissionCache';
import type { ObjectAction } from './types';

/**
 * Application-level Access Control List.
 *
 * Повторяет логику RLS (has_permission + owner_read) на уровне приложения,
 * чтобы отдавать 403 рано — до выполнения бизнес-логики и без похода в БД
 * на каждый объект (результаты кешируются в памяти). RLS в БД остаётся
 * последним рубежом и защищает от обхода этого слоя.
 *
 * RBAC-таблицы (user_roles, permissions, group_members, groups,
 * role_object_grants) и objects (owner_id) НЕ имеют RLS, поэтому читаются
 * напрямую.
 *
 * Семантика owner_read (совпадает с RLS-политиками *_owner_read): владелец
 * (создатель) объекта читает его ТОЛЬКО пока объект не включён ни в одну
 * группу. Как только объект передан в группу(ы) — видимость определяется
 * исключительно групповыми правами (и админом). Это «bootstrap» для создания
 * объектов не-админами (camera:create и т.п.): автор видит свой свежий объект
 * до того, как администратор начнёт управлять доступом через группы.
 *
 * Прямые grants ролей на объекты (role_object_grants) действуют безусловно
 * (не зависят от группового членства) и объединяются с групповыми правами.
 */

// userId -> Map<objectId, Set<action>> (union прямых grants ролей юзера)
const userDirectGrantsCache = new Cache<Map<string, Set<ObjectAction>>>(2000, 5 * 60_000);
// userId -> Map<groupId, Set<action>>  (union прав по всем ролям юзера)
const userGroupsCache = new Cache<Map<string, Set<ObjectAction>>>(2000, 5 * 60_000);
// objectId -> Set<groupId>
const objectGroupsCache = new Cache<string[]>(2000, 5 * 60_000);
// objectId -> owner_id ('' если владельца нет/объект не существует)
const objectOwnerCache = new Cache<string>(2000, 5 * 60_000);
// userId -> boolean (admin)
const adminCache = new Cache<boolean>(2000, 5 * 60_000);
// userId -> Set<Capability>  (union спец-прав по всем ролям юзера из role_capabilities)
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
 * groupId -> набор действий, которые юзер может делать над этой группой
 * (объединение по всем ролям юзера).
 */
async function getUserGroupPermissions(
  userId: string,
): Promise<Map<string, Set<ObjectAction>>> {
  const cached = userGroupsCache.get(userId);
  if (cached) return cached;

  const { rows } = await pool.query<{ groupId: string; action: ObjectAction }>(
    `SELECT DISTINCT gm.group_id AS "groupId", p.action
     FROM permissions p
     JOIN user_roles ur ON ur.role_id = p.role_id
     JOIN group_members gm ON gm.group_id = p.group_id
     WHERE ur.user_id = $1`,
    [userId],
  );

  const map = new Map<string, Set<ObjectAction>>();
  for (const r of rows) {
    const set = map.get(r.groupId);
    if (set) set.add(r.action);
    else map.set(r.groupId, new Set([r.action]));
  }
  userGroupsCache.set(userId, map);
  return map;
}

async function getObjectGroups(objectId: string): Promise<string[]> {
  const cached = objectGroupsCache.get(objectId);
  if (cached) return cached;
  const { rows } = await pool.query<{ groupId: string }>(
    `SELECT gm.group_id AS "groupId" FROM group_members gm WHERE gm.object_id = $1`,
    [objectId],
  );
  const groups = rows.map((r) => r.groupId);
  objectGroupsCache.set(objectId, groups);
  return groups;
}

/**
 * Есть ли у юзера право action на конкретный объект.
 *
 * Семантика совпадает с RLS-политиками:
 *  - admin видит всё;
 *  - прямые grants ролей на объект (role_object_grants) действуют безусловно;
 *  - владелец (создатель) читает свой объект, только пока тот не включён
 *    ни в одну группу (аналог *_owner_read = is_owner AND NOT в group_members);
 *    как только объект передан в группу(ы) — неявный owner-read исчезает,
 *    доступ определяется только групповыми правами (и админом);
 *  - остальные — через права ролей на группы объекта.
 */
export async function can(
  userId: string,
  objectId: string,
  action: ObjectAction,
): Promise<boolean> {
  if (await isAdmin(userId)) return true;

  // Прямые grants ролей юзера на конкретный объект (role_object_grants).
  const direct = await getUserDirectGrants(userId);
  const directActions = direct.get(objectId);
  if (directActions && directActions.has(action)) return true;

  const perms = await getUserGroupPermissions(userId);

  // Владелец-«bootstrap» только для read: пока объект не включён ни в одну
  // группу, создатель читает его (совпадает с RLS-политикой *_owner_read,
  // где is_owner(object_id) AND NOT в group_members). Как только объект
  // передан в группу(ы) — неявный read владельца исчезает, доступ решают
  // группы (и админ).
  if (action === 'read') {
    const groups = await getObjectGroups(objectId);
    if (groups.length === 0) {
      const ownerId = await getObjectOwner(objectId);
      if (ownerId === userId) return true;
    }
  }

  if (perms.size === 0) return false;

  const groups = await getObjectGroups(objectId);
  if (groups.length === 0) return false;

  for (const groupId of groups) {
    const actions = perms.get(groupId);
    if (actions && actions.has(action)) return true;
  }
  return false;
}

/**
 * Union прямых grants (role_object_grants) пользователя: Map<objectId, Set<action>>.
 * Хранится в кеше (инвалидируется invalidateUser после изменений RBAC).
 */
async function getUserDirectGrants(userId: string): Promise<Map<string, Set<ObjectAction>>> {
  const cached = userDirectGrantsCache.get(userId);
  if (cached) return cached;
  const { rows } = await pool.query<{ objectId: string; action: ObjectAction }>(
    `SELECT DISTINCT g.object_id AS "objectId", g.action
     FROM role_object_grants g
     JOIN user_roles ur ON ur.role_id = g.role_id
     WHERE ur.user_id = $1`,
    [userId],
  );
  const map = new Map<string, Set<ObjectAction>>();
  for (const r of rows) {
    const set = map.get(r.objectId);
    if (set) set.add(r.action);
    else map.set(r.objectId, new Set([r.action]));
  }
  userDirectGrantsCache.set(userId, map);
  return map;
}

/**
 * owner_id объекта (из objects.owner_id, NULL если нет/объекта нет).
 * objects без RLS, поэтому читается напрямую.
 */
async function getObjectOwner(objectId: string): Promise<string | null> {
  const cached = objectOwnerCache.get(objectId);
  if (cached !== undefined) return cached === '' ? null : cached;
  const { rows } = await pool.query<{ ownerId: string | null }>(
    `SELECT owner_id AS "ownerId" FROM objects WHERE id = $1`,
    [objectId],
  );
  const ownerId = rows[0]?.ownerId ?? null;
  objectOwnerCache.set(objectId, ownerId ?? '');
  return ownerId;
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

// --- Инвалидация кеша (вызывать после изменений RBAC) ---
export function invalidateUser(userId: string): void {
  userDirectGrantsCache.del(userId);
  userGroupsCache.del(userId);
  adminCache.del(userId);
  userCapabilitiesCache.del(userId);
}

export function invalidateObject(objectId: string): void {
  objectGroupsCache.del(objectId);
  objectOwnerCache.del(objectId);
}

export function invalidateGroup(groupId: string): void {
  // группа меняет membership/групповые права — сбрасываем кеш всех юзеров
  userGroupsCache.clear();
  objectGroupsCache.clear();
}

/** Полностью сбросить ACL-кеши (например, при изменении прямых grants роли). */
export function clearAclCaches(): void {
  userDirectGrantsCache.clear();
  userGroupsCache.clear();
  objectGroupsCache.clear();
  objectOwnerCache.clear();
  adminCache.clear();
  userCapabilitiesCache.clear();
}
