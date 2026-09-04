import { rbacRepository } from '../repositories/rbac.repository';
import { invalidateGroup, invalidateObject, invalidateUser } from '../security/acl';
import { OBJECT_ACTIONS } from '../security/types';
import type { ObjectAction } from '../security/types';
import type {
  RbacGroup,
  RbacGroupObject,
  RbacPermission,
  RbacRole,
  RbacUserWithRoles,
} from '../repositories/rbac.repository';

const SYSTEM_ROLE_NAMES = ['admin', 'operator', 'viewer'];
const ROLE_NAME_RE = /^[a-z][a-z0-9_-]{1,30}$/;

/** HTTP-ошибка с кодом статуса (для тонких роутов /admin). */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function assertValidRoleName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !ROLE_NAME_RE.test(name)) {
    throw new HttpError(
      400,
      'имя роли: от 2 до 31 символа, латиница в нижнем регистре, цифры, "_" или "-", начинается с буквы',
    );
  }
}

function assertValidGroupName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !ROLE_NAME_RE.test(name)) {
    throw new HttpError(
      400,
      'имя группы: от 2 до 31 символа, латиница в нижнем регистре, цифры, "_" или "-", начинается с буквы',
    );
  }
}

export const rbacService = {
  /**
   * Заменить роли пользователя. Сам себе менять роли нельзя; нельзя снять
   * роль admin с последнего администратора. После записи — инвалидация
   * ACL-кеша пользователя. Возвращает пользователя в формате GET /admin/users/:id.
   */
  async setUserRoles(targetId: string, actorId: string, roleNames: string[]): Promise<RbacUserWithRoles> {
    if (targetId === actorId) throw new HttpError(400, 'нельзя менять свои роли');

    const user = await rbacRepository.findUserWithRoles(targetId);
    if (!user) throw new HttpError(404, 'пользователь не найден');

    const uniqueNames = [...new Set(roleNames)];
    const found = await rbacRepository.findRoleIdsByNames(uniqueNames);
    if (found.length !== uniqueNames.length) {
      const foundNames = new Set(found.map((r) => r.name));
      const unknown = uniqueNames.filter((n) => !foundNames.has(n));
      throw new HttpError(400, `неизвестная роль: ${unknown.join(', ')}`);
    }

    // Снятие admin разрешено (меняем не себя), но нельзя оставить систему
    // без последнего администратора.
    const wasAdmin = user.roles.some((r) => r.name === 'admin');
    if (wasAdmin && !uniqueNames.includes('admin')) {
      const otherAdmins = await rbacRepository.countAdminsExcluding(targetId);
      if (otherAdmins === 0) throw new HttpError(400, 'нельзя снять последнюю роль admin');
    }

    await rbacRepository.setUserRoles(targetId, found.map((r) => r.id));
    invalidateUser(targetId);

    const updated = await rbacRepository.findUserWithRoles(targetId);
    if (!updated) throw new HttpError(404, 'пользователь не найден');
    return updated;
  },

  /** Создать кастомную роль (имя не занято и не из системных). */
  async createRole(name: unknown): Promise<RbacRole> {
    assertValidRoleName(name);
    if (SYSTEM_ROLE_NAMES.includes(name)) throw new HttpError(400, 'системные роли неизменяемы');
    const existing = await rbacRepository.findRoleByName(name);
    if (existing) throw new HttpError(409, 'роль с таким именем уже существует');
    return rbacRepository.createRole(name);
  },

  /** Переименовать кастомную роль (системные роли менять нельзя). */
  async renameRole(id: string, name: unknown): Promise<RbacRole> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');
    if (SYSTEM_ROLE_NAMES.includes(role.name)) throw new HttpError(400, 'системные роли неизменяемы');

    assertValidRoleName(name);
    if (SYSTEM_ROLE_NAMES.includes(name)) throw new HttpError(400, 'системные роли неизменяемы');
    const clash = await rbacRepository.findRoleByName(name);
    if (clash && clash.id !== role.id) throw new HttpError(409, 'роль с таким именем уже существует');

    const updated = await rbacRepository.renameRole(id, name);
    if (!updated) throw new HttpError(404, 'роль не найдена');
    return updated;
  },

  /** Удалить кастомную роль + инвалидировать ACL-кеш затронутых юзеров и групп. */
  async deleteRole(id: string): Promise<void> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');
    if (SYSTEM_ROLE_NAMES.includes(role.name)) throw new HttpError(400, 'системные роли неизменяемы');

    const affected = await rbacRepository.deleteRole(id);
    if (!affected) throw new HttpError(404, 'роль не найдена');
    for (const userId of affected.userIds) invalidateUser(userId);
    for (const groupId of affected.groupIds) invalidateGroup(groupId);
  },

  // --- Э5: права ролей и группы объектов ---

  /**
   * Полностью заменить набор прав роли. Валидация до записи: действия из
   * чек-листа OBJECT_ACTIONS, все groupId существуют, дубликаты схлопываются.
   * После commit — инвалидация ACL-кеша затронутых групп (до+после).
   */
  async replaceRolePermissions(id: string, entries: unknown): Promise<RbacPermission[]> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');

    if (!Array.isArray(entries)) {
      throw new HttpError(400, 'entries должен быть массивом объектов { groupId, action }');
    }
    const list: Array<{ groupId: string; action: string }> = [];
    for (const e of entries) {
      const entry = e as { groupId?: unknown; action?: unknown } | null;
      if (!entry || typeof entry !== 'object' || typeof entry.groupId !== 'string' || typeof entry.action !== 'string') {
        throw new HttpError(400, 'entries должен быть массивом объектов { groupId, action }');
      }
      if (!OBJECT_ACTIONS.includes(entry.action as ObjectAction)) {
        throw new HttpError(400, `неизвестное действие: ${entry.action}`);
      }
      list.push({ groupId: entry.groupId, action: entry.action });
    }

    // Дубликаты пар (role, group, action) в БД запрещены UNIQUE — схлопываем.
    const uniquePairs = new Map<string, { groupId: string; action: string }>();
    for (const e of list) uniquePairs.set(`${e.groupId}:${e.action}`, e);

    const groupIds = [...new Set(list.map((e) => e.groupId))];
    if (groupIds.length > 0) {
      const found = await rbacRepository.findExistingGroupIds(groupIds);
      const foundSet = new Set(found);
      const missing = groupIds.filter((g) => !foundSet.has(g));
      if (missing.length > 0) throw new HttpError(400, `нет группы: ${missing[0]}`);
    }

    const before = await rbacRepository.findPermissionsByRole(id);
    const finalEntries = [...uniquePairs.values()];
    await rbacRepository.replaceRolePermissions(id, finalEntries);

    const affected = new Set<string>();
    for (const p of before) affected.add(p.groupId);
    for (const e of finalEntries) affected.add(e.groupId);
    for (const groupId of affected) invalidateGroup(groupId);

    return rbacRepository.findPermissionsByRole(id);
  },

  /** Создать группу объектов (имя валидируется тем же regex, что и роли). */
  async createGroup(name: unknown): Promise<RbacGroup> {
    assertValidGroupName(name);
    const existing = await rbacRepository.findGroupByName(name);
    if (existing) throw new HttpError(409, 'группа с таким именем уже существует');
    return rbacRepository.createGroup(name);
  },

  /** Переименовать группу объектов. */
  async renameGroup(id: string, name: unknown): Promise<RbacGroup> {
    const group = await rbacRepository.findGroupById(id);
    if (!group) throw new HttpError(404, 'группа не найдена');

    assertValidGroupName(name);
    const clash = await rbacRepository.findGroupByName(name);
    if (clash && clash.id !== group.id) throw new HttpError(409, 'группа с таким именем уже существует');

    const updated = await rbacRepository.renameGroup(id, name);
    if (!updated) throw new HttpError(404, 'группа не найдена');
    invalidateGroup(id);
    return updated;
  },

  /**
   * Удалить группу, только если на ней не висит ни прав, ни объектов
   * (иначе 409 — никаких молчаливых каскадов).
   */
  async deleteGroup(id: string): Promise<void> {
    const group = await rbacRepository.findGroupById(id);
    if (!group) throw new HttpError(404, 'группа не найдена');

    const usage = await rbacRepository.countGroupUsage(id);
    if (usage.permissions > 0 || usage.members > 0) {
      throw new HttpError(
        409,
        `группа используется: ${usage.permissions} прав, ${usage.members} объектов`,
      );
    }
    const deleted = await rbacRepository.deleteGroup(id);
    if (!deleted) throw new HttpError(404, 'группа не найдена');
    invalidateGroup(id);
  },

  /**
   * Заменить состав объектов группы (transaction DELETE+INSERT).
   * Валидация id объектов до записи; после — инвалидация кеша группы
   * и всех затронутых объектов (старое+новое множество).
   */
  async replaceGroupObjects(id: string, objectIds: unknown): Promise<RbacGroupObject[]> {
    const group = await rbacRepository.findGroupById(id);
    if (!group) throw new HttpError(404, 'группа не найдена');

    if (!Array.isArray(objectIds) || objectIds.some((o: unknown) => typeof o !== 'string')) {
      throw new HttpError(400, 'objectIds должен быть массивом uuid-строк');
    }
    const uniqueIds = [...new Set(objectIds as string[])];
    if (uniqueIds.length > 0) {
      const found = await rbacRepository.findExistingObjectIds(uniqueIds);
      const foundSet = new Set(found);
      const missing = uniqueIds.filter((o) => !foundSet.has(o));
      if (missing.length > 0) {
        throw new HttpError(400, `объект не найден: ${missing.slice(0, 5).join(', ')}`);
      }
    }

    const before = await rbacRepository.findGroupObjects(id);
    await rbacRepository.replaceGroupObjects(id, uniqueIds);

    invalidateGroup(id);
    const affectedObjects = new Set<string>([
      ...before.objects.map((o) => o.objectId),
      ...uniqueIds,
    ]);
    for (const objectId of affectedObjects) invalidateObject(objectId);

    const after = await rbacRepository.findGroupObjects(id);
    return after.objects;
  },
};
