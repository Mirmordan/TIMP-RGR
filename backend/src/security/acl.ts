import { pool } from '../database/connection';
import { Cache } from './permissionCache';
import { ROLE_CAPABILITIES } from './types';
import type { ObjectAction, Role } from './types';

/**
 * Application-level Access Control List.
 *
 * Повторяет логику RLS (has_permission) на уровне приложения, чтобы отдавать
 * 403 рано — до выполнения бизнес-логики и без похода в БД на каждый объект
 * (результаты кешируются в памяти). RLS в БД остаётся последним рубежом
 * и защищает от обхода этого слоя.
 *
 * RBAC-таблицы (user_roles, permissions, group_members, groups) НЕ имеют RLS,
 * поэтому читаются напрямую.
 */

// userId -> Map<groupId, Set<action>>  (union прав по всем ролям юзера)
const userGroupsCache = new Cache<Map<string, Set<ObjectAction>>>(2000, 5 * 60_000);
// objectId -> Set<groupId>
const objectGroupsCache = new Cache<string[]>(2000, 5 * 60_000);
// userId -> boolean (admin)
const adminCache = new Cache<boolean>(2000, 5 * 60_000);

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
 */
export async function can(
  userId: string,
  objectId: string,
  action: ObjectAction,
): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const perms = await getUserGroupPermissions(userId);
  if (perms.size === 0) return false;

  const groups = await getObjectGroups(objectId);
  if (groups.length === 0) return false;

  for (const groupId of groups) {
    const actions = perms.get(groupId);
    if (actions && actions.has(action)) return true;
  }
  return false;
}

async function getUserRoles(userId: string): Promise<Role[]> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT r.name AS "role"
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.role) as Role[];
}

/**
 * Есть ли у юзера глобальный capability (системная операция).
 */
export async function hasCapability(
  userId: string,
  capability: string,
): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const roles = await getUserRoles(userId);
  return roles.some((role) => roleHasCapability(role, capability));
}

export function roleHasCapability(role: Role, capability: string): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability as never) ?? false;
}

// --- Инвалидация кеша (вызывать после изменений RBAC) ---
export function invalidateUser(userId: string): void {
  userGroupsCache.del(userId);
  adminCache.del(userId);
}

export function invalidateObject(objectId: string): void {
  objectGroupsCache.del(objectId);
}

export function invalidateGroup(groupId: string): void {
  // группа меняет membership/групповые права — сбрасываем кеш всех юзеров
  userGroupsCache.clear();
  objectGroupsCache.clear();
}
