import { randomBytes } from 'node:crypto';
import { rbacRepository } from '../repositories/rbac.repository';
import { invalidateGroup, invalidateObject, invalidateUser } from '../security/acl';
import { authService, assertEmail, assertPassword, assertUsername } from '../security/auth.service';
import { userRepository } from '../repositories/user.repository';
import { OBJECT_ACTIONS } from '../security/types';
import type { ObjectAction } from '../security/types';
import { isCapability } from '../security/capabilities';
import { auditService } from './audit.service';
import { isOwnerUsername, assertOwnerUsernameReserved } from './owner.service';
import { HttpError } from '../http/HttpError';
export { HttpError };
import type { AuditActor } from './audit.service';
import type {
  RbacGroup,
  RbacGroupObject,
  RbacObjectGrant,
  RbacPermission,
  RbacRole,
  RbacUserWithRoles,
} from '../repositories/rbac.repository';

const PROTECTED_ROLE_NAMES = ['admin'];
const ROLE_NAME_RE = /^[a-z][a-z0-9_-]{1,30}$/;

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

/** Актор — владелец (username из OWNER_USERNAME)? */
function isActorOwner(actor: AuditActor): boolean {
  return isOwnerUsername(actor.username);
}

export interface ModifyUserOptions {
  /** Разрешить не-owner админу менять себя (сброс пароля, правка профиля, legacy /users). */
  allowSelfAdmin?: boolean;
}

/**
 * Единый guard мутаций пользователя (admin-панель + legacy /users):
 *  - owner-аккаунт неприкосновенен даже для себя → 403 «владелец защищён»;
 *  - админов трогает только владелец; не-owner админ может менять себя, если
 *    передан allowSelfAdmin.
 */
export function assertCanModifyUser(
  target: { id: string; username: string; roles: Array<{ name: string }> },
  actor: AuditActor,
  opts: ModifyUserOptions = {},
): void {
  if (isOwnerUsername(target.username)) throw new HttpError(403, 'владелец защищён');
  if (isActorOwner(actor)) return;
  if (!target.roles.some((r) => r.name === 'admin')) return;
  const isSelf = target.id === actor.id;
  if (isSelf && opts.allowSelfAdmin) return;
  throw new HttpError(403, 'изменять администраторов может только владелец');
}

/** Только владелец может назначать роль admin (создание/выдача). */
function assertCanAssignAdmin(actor: AuditActor): void {
  if (!isActorOwner(actor)) throw new HttpError(403, 'назначать роль admin может только владелец');
}

/** Криптостойкий временный пароль: 24 символа base64url (18 случайных байт). */
function generateTemporaryPassword(): string {
  return randomBytes(18).toString('base64url');
}

export const rbacService = {
  /**
   * Заменить роли пользователя. Сам себе менять роли нельзя; нельзя снять
   * роль admin с последнего администратора. После записи — инвалидация
   * ACL-кеша пользователя. Возвращает пользователя в формате GET /admin/users/:id.
   */
  async setUserRoles(targetId: string, actor: AuditActor, roleNames: string[]): Promise<RbacUserWithRoles> {
    if (targetId === actor.id) throw new HttpError(400, 'нельзя менять свои роли');

    const user = await rbacRepository.findUserWithRoles(targetId);
    if (!user) throw new HttpError(404, 'пользователь не найден');
    assertCanModifyUser(user, actor);

    const uniqueNames = [...new Set(roleNames)];
    if (uniqueNames.includes('admin')) assertCanAssignAdmin(actor);
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
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'user.roles.set',
      targetType: 'user',
      targetId,
      details: { roleNames },
    });
    return updated;
  },

  /** Создать роль (имя не занято; имя admin зарезервировано). */
  async createRole(name: unknown, actor: AuditActor): Promise<RbacRole> {
    assertValidRoleName(name);
    if (PROTECTED_ROLE_NAMES.includes(name)) throw new HttpError(400, 'имя admin зарезервировано');
    const existing = await rbacRepository.findRoleByName(name);
    if (existing) throw new HttpError(409, 'роль с таким именем уже существует');
    const role = await rbacRepository.createRole(name);
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'role.create',
      targetType: 'role',
      targetId: role.id,
      details: { name: role.name },
    });
    return role;
  },

  /** Переименовать роль (роль admin переименовывать нельзя). */
  async renameRole(id: string, actor: AuditActor, name: unknown): Promise<RbacRole> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');
    if (PROTECTED_ROLE_NAMES.includes(role.name)) throw new HttpError(400, 'роль admin неизменяема');

    assertValidRoleName(name);
    if (PROTECTED_ROLE_NAMES.includes(name)) throw new HttpError(400, 'имя admin зарезервировано');
    const clash = await rbacRepository.findRoleByName(name);
    if (clash && clash.id !== role.id) throw new HttpError(409, 'роль с таким именем уже существует');

    const updated = await rbacRepository.renameRole(id, name);
    if (!updated) throw new HttpError(404, 'роль не найдена');
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'role.rename',
      targetType: 'role',
      targetId: id,
      details: { from: role.name, to: updated.name },
    });
    return updated;
  },

  /** Удалить роль + инвалидировать ACL-кеш затронутых юзеров и групп. Роль admin удалить нельзя. */
  async deleteRole(id: string, actor: AuditActor): Promise<void> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');
    if (PROTECTED_ROLE_NAMES.includes(role.name)) throw new HttpError(400, 'роль admin неизменяема');

    const affected = await rbacRepository.deleteRole(id);
    if (!affected) throw new HttpError(404, 'роль не найдена');
    for (const userId of affected.userIds) invalidateUser(userId);
    for (const groupId of affected.groupIds) invalidateGroup(groupId);
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'role.delete',
      targetType: 'role',
      targetId: id,
      details: { name: role.name },
    });
  },

  // --- Э5: права ролей и группы объектов ---

  /**
   * Полностью заменить набор прав роли. Валидация до записи: действия из
   * чек-листа OBJECT_ACTIONS, все groupId существуют, дубликаты схлопываются.
   * После commit — инвалидация ACL-кеша затронутых групп (до+после).
   */
  async replaceRolePermissions(id: string, actor: AuditActor, entries: unknown): Promise<RbacPermission[]> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');
    if (PROTECTED_ROLE_NAMES.includes(role.name)) throw new HttpError(400, 'роль admin неизменяема');

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

    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'role.perms.set',
      targetType: 'role',
      targetId: id,
      details: { entries: finalEntries.map((e) => [e.groupId, e.action]) },
    });

    return rbacRepository.findPermissionsByRole(id);
  },

  /**
   * Полностью заменить набор спец-прав (system capabilities) роли.
   * Защищена только роль admin: её набор зафиксирован сидом role_capabilities —
   * это не даёт «понизить» активных админов (админ-роль всегда сохраняет
   * admin:read/admin:write и остальных). Остальные роли (в т.ч. operator/viewer)
   * редактируются как кастомные. Коды валидируются по CAPABILITIES (совпадает
   * с CHECK в БД). После записи инвалидируется кеш спец-прав всех пользователей роли.
   */
  async replaceRoleCapabilities(id: string, actor: AuditActor, capabilities: unknown): Promise<string[]> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');
    if (PROTECTED_ROLE_NAMES.includes(role.name)) {
      throw new HttpError(400, 'спец-права роли admin зафиксированы сидом');
    }

    if (!Array.isArray(capabilities) || capabilities.some((c: unknown) => typeof c !== 'string')) {
      throw new HttpError(400, 'capabilities должен быть массивом строк');
    }
    const codes = [...new Set(capabilities as string[])];
    for (const code of codes) {
      if (!isCapability(code)) throw new HttpError(400, `неизвестная capability: ${code}`);
    }

    const affected = await rbacRepository.findUsersByRole(id);
    await rbacRepository.replaceRoleCapabilities(id, codes);
    for (const userId of affected) invalidateUser(userId);

    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'role.caps.set',
      targetType: 'role',
      targetId: id,
      details: { capabilities: codes },
    });

    return rbacRepository.findRoleCapabilities(id);
  },

  /**
   * Полностью заменить набор прямых grants роли (role × object × action).
   * Прямые grants не зависят от групп: выдача read/write/... на конкретный
   * объект действует для всех юзеров роли. Валидация до записи: действия из
   * чек-листа OBJECT_ACTIONS, все objectId существуют, дубликаты схлопываются.
   * После commit — инвалидация ACL-кеша holder-ов роли и затронутых объектов.
   */
  async replaceRoleObjectGrants(id: string, actor: AuditActor, grants: unknown): Promise<RbacObjectGrant[]> {
    const role = await rbacRepository.findRoleById(id);
    if (!role) throw new HttpError(404, 'роль не найдена');
    if (PROTECTED_ROLE_NAMES.includes(role.name)) throw new HttpError(400, 'роль admin неизменяема');

    if (!Array.isArray(grants)) {
      throw new HttpError(400, 'grants должен быть массивом объектов { objectId, action }');
    }
    const list: Array<{ objectId: string; action: string }> = [];
    for (const g of grants) {
      const grant = g as { objectId?: unknown; action?: unknown } | null;
      if (!grant || typeof grant !== 'object' || typeof grant.objectId !== 'string' || typeof grant.action !== 'string') {
        throw new HttpError(400, 'grants должен быть массивом объектов { objectId, action }');
      }
      if (!OBJECT_ACTIONS.includes(grant.action as ObjectAction)) {
        throw new HttpError(400, `неизвестное действие: ${grant.action}`);
      }
      list.push({ objectId: grant.objectId, action: grant.action });
    }

    // Дубликаты пар (role, object, action) в БД запрещены UNIQUE — схлопываем.
    const uniquePairs = new Map<string, { objectId: string; action: string }>();
    for (const g of list) uniquePairs.set(`${g.objectId}:${g.action}`, g);

    const objectIds = [...new Set(list.map((g) => g.objectId))];
    if (objectIds.length > 0) {
      const found = await rbacRepository.findExistingObjectIds(objectIds);
      const foundSet = new Set(found);
      const missing = objectIds.filter((o) => !foundSet.has(o));
      if (missing.length > 0) throw new HttpError(400, `объект не найден: ${missing.slice(0, 5).join(', ')}`);
    }

    const before = await rbacRepository.findRoleObjectGrants(id);
    const finalGrants = [...uniquePairs.values()];
    await rbacRepository.replaceRoleObjectGrants(id, finalGrants);

    // Инвалидируем кеш holder-ов роли (у них изменился набор прямых grants)
    // и объектные кеши затронутых объектов.
    const holders = await rbacRepository.findUsersByRole(id);
    for (const userId of holders) invalidateUser(userId);
    const affectedObjects = new Set<string>([
      ...before.map((g) => g.objectId),
      ...objectIds,
    ]);
    for (const objectId of affectedObjects) invalidateObject(objectId);

    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'role.grants.set',
      targetType: 'role',
      targetId: id,
      details: { grants: finalGrants.map((g) => [g.objectId, g.action]) },
    });

    return rbacRepository.findRoleObjectGrants(id);
  },

/** Создать группу объектов (имя валидируется тем же regex, что и роли).
 *  Системное имя 'all' зарезервировано. */
async createGroup(name: unknown, actor: AuditActor): Promise<RbacGroup> {
    assertValidGroupName(name);
    if (name === 'all') throw new HttpError(400, 'имя «all» зарезервировано для системной группы');
    const existing = await rbacRepository.findGroupByName(name);
    if (existing) throw new HttpError(409, 'группа с таким именем уже существует');
    const group = await rbacRepository.createGroup(name);
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'group.create',
      targetType: 'group',
      targetId: group.id,
      details: { name: group.name },
    });
    return group;
  },

/** Переименовать группу объектов (системную группу переименовывать нельзя). */
async renameGroup(id: string, actor: AuditActor, name: unknown): Promise<RbacGroup> {
    const group = await rbacRepository.findGroupById(id);
    if (!group) throw new HttpError(404, 'группа не найдена');
    if (group.isSystem) throw new HttpError(400, 'системную группу переименовывать нельзя');

    assertValidGroupName(name);
    if (name === 'all') throw new HttpError(400, 'имя «all» зарезервировано для системной группы');
    const clash = await rbacRepository.findGroupByName(name);
    if (clash && clash.id !== group.id) throw new HttpError(409, 'группа с таким именем уже существует');

    const updated = await rbacRepository.renameGroup(id, name);
    if (!updated) throw new HttpError(404, 'группа не найдена');
    invalidateGroup(id);
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'group.rename',
      targetType: 'group',
      targetId: id,
      details: { from: group.name, to: updated.name },
    });
    return updated;
  },

/**
   * Удалить группу, только если на ней не висит ни прав, ни объектов
   * (иначе 409 — никаких молчаливых каскадов). Системную группу удалять нельзя.
   */
async deleteGroup(id: string, actor: AuditActor): Promise<void> {
    const group = await rbacRepository.findGroupById(id);
    if (!group) throw new HttpError(404, 'группа не найдена');
    if (group.isSystem) throw new HttpError(400, 'системную группу удалять нельзя');

    const usage = await rbacRepository.countGroupUsage(id);
    if (usage.permissions > 0 || usage.members > 0 || usage.directGrants > 0) {
      throw new HttpError(
        409,
        `группа используется: ${usage.permissions} прав, ${usage.members} объектов, ${usage.directGrants} прямых выдач`,
      );
    }
    const deleted = await rbacRepository.deleteGroup(id);
    if (!deleted) throw new HttpError(404, 'группа не найдена');
    invalidateGroup(id);
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'group.delete',
      targetType: 'group',
      targetId: id,
      details: { name: group.name },
    });
  },

/**
   * Заменить состав объектов группы (transaction DELETE+INSERT).
   * Валидация id объектов до записи; после — инвалидация кеша группы
   * и всех затронутых объектов (старое+новое множество).
   * Системная группа не имеет членов (все объекты implicit).
   */
async replaceGroupObjects(id: string, actor: AuditActor, objectIds: unknown): Promise<RbacGroupObject[]> {
    const group = await rbacRepository.findGroupById(id);
    if (!group) throw new HttpError(404, 'группа не найдена');
    if (group.isSystem) throw new HttpError(400, 'системная группа не имеет явных членов');

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
    const beforeIds = new Set(before.objects.map((o) => o.objectId));
    const afterIds = new Set(after.objects.map((o) => o.objectId));
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'group.members.set',
      targetType: 'group',
      targetId: id,
      details: {
        count: uniqueIds.length,
        ...(uniqueIds.some((o) => !beforeIds.has(o))
          ? { added: uniqueIds.filter((o) => !beforeIds.has(o)).slice(0, 5) }
          : {}),
        ...(before.objects.some((o) => !afterIds.has(o.objectId))
          ? { removed: before.objects.map((o) => o.objectId).filter((o) => !afterIds.has(o)).slice(0, 5) }
          : {}),
      },
    });
    return after.objects;
  },

  // --- P4: CRUD пользователей (панель /admin) ---

  /**
   * Список пользователей для админ-панели. Дополняет DB-проекцию флагом
   * isOwner (username === OWNER_USERNAME); при пустом env — всегда false.
   */
  async listUsers(limit: number, offset: number): Promise<RbacUserWithRoles[]> {
    const users = await rbacRepository.findUsersWithRoles(limit, offset);
    return users.map((u) => ({ ...u, isOwner: isOwnerUsername(u.username) }));
  },

  /**
   * Создать пользователя админом. username/email валидируются теми же
   * правилами, что в /auth; коллизии → 409. Если password не передан (или "")
   * — генерируется криптостойкий временный и возвращается один раз в
   * initialPassword. Роли берутся из roleNames (опционально): пусто → viewer;
   * роль admin может назначить только владелец.
   */
  async createUser(input: {
    username?: unknown;
    email?: unknown;
    password?: unknown;
    roleNames?: unknown;
  }, actor: AuditActor): Promise<{
    user: RbacUserWithRoles;
    initialPassword?: string;
  }> {
    const username = input.username;
    const email = input.email;
    assertUsername(username);
    assertEmail(email);
    assertOwnerUsernameReserved(username);

    const rawRoleNames = input.roleNames;
    let roleNames: string[];
    if (rawRoleNames === undefined) {
      roleNames = [];
    } else if (Array.isArray(rawRoleNames) && rawRoleNames.every((n) => typeof n === 'string')) {
      roleNames = rawRoleNames as string[];
    } else {
      throw new HttpError(400, 'roleNames должен быть массивом строк');
    }
    const uniqueNames = [...new Set(roleNames)];
    if (uniqueNames.includes('admin')) assertCanAssignAdmin(actor);
    const effectiveNames = uniqueNames.length > 0 ? uniqueNames : ['viewer'];
    if (uniqueNames.length > 0) {
      const found = await rbacRepository.findRoleIdsByNames(uniqueNames);
      if (found.length !== uniqueNames.length) {
        const foundNames = new Set(found.map((r) => r.name));
        const unknown = uniqueNames.filter((n) => !foundNames.has(n));
        throw new HttpError(400, `неизвестная роль: ${unknown.join(', ')}`);
      }
    }

    const clashName = await userRepository.findByUsername(username);
    if (clashName) throw new HttpError(409, 'username уже занят');
    const clashEmail = await userRepository.findByEmail(email);
    if (clashEmail) throw new HttpError(409, 'email уже занят');

    let plain: string;
    let initialPassword: string | undefined;
    if (input.password === undefined || input.password === '') {
      initialPassword = generateTemporaryPassword();
      plain = initialPassword;
    } else if (typeof input.password === 'string') {
      assertPassword(input.password);
      plain = input.password;
    } else {
      throw new HttpError(400, 'пароль должен быть строкой');
    }

    const passwordHash = await authService.hashPassword(plain);
    const userId = await rbacRepository.createUserWithRoles({
      username,
      email,
      passwordHash,
      roleNames: effectiveNames,
    });
    const user = await rbacRepository.findUserWithRoles(userId);
    if (!user) throw new Error('пользователь не создан');
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'user.create',
      targetType: 'user',
      targetId: userId,
      details: { email: user.email, roleNames: effectiveNames, generated: initialPassword !== undefined },
    });
    if (initialPassword === undefined) return { user };
    return { user, initialPassword };
  },

  /**
   * Сброс/активация пароля пользователя админом (себя можно). Если password
   * не задан — генерируется временный и возвращается в initialPassword.
   * Инвалидация токенов не нужна: login читает хэш из БД на каждый запрос.
   */
  async resetUserPassword(userId: string, actor: AuditActor, password: unknown): Promise<{
    ok: true;
    initialPassword?: string;
  }> {
    const target = await rbacRepository.findUserWithRoles(userId);
    if (!target) throw new HttpError(404, 'пользователь не найден');
    assertCanModifyUser(target, actor, { allowSelfAdmin: true });

    let plain: string;
    let initialPassword: string | undefined;
    if (password === undefined || password === '') {
      initialPassword = generateTemporaryPassword();
      plain = initialPassword;
    } else if (typeof password === 'string') {
      assertPassword(password);
      plain = password;
    } else {
      throw new HttpError(400, 'пароль должен быть строкой');
    }

    const passwordHash = await authService.hashPassword(plain);
    const updated = await rbacRepository.setUserPasswordHash(userId, passwordHash);
    if (!updated) throw new HttpError(404, 'пользователь не найден');
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'user.password.reset',
      targetType: 'user',
      targetId: userId,
      details: {},
    });
    if (initialPassword === undefined) return { ok: true };
    return { ok: true, initialPassword };
  },

  /**
   * Редактирование username/email пользователя админом (как updateProfile,
   * но цель задаётся id). Пароль через этот эндпоинт менять нельзя.
   */
  async patchUser(userId: string, actor: AuditActor, patch: Record<string, unknown>): Promise<RbacUserWithRoles> {
    if ('password' in patch || 'passwordHash' in patch) {
      throw new HttpError(400, 'сброс пароля — отдельный эндпоинт');
    }
    const username = patch.username;
    const email = patch.email;
    if (username === undefined && email === undefined) {
      throw new HttpError(400, 'укажите username или email');
    }
    if (username !== undefined) assertUsername(username);
    if (username !== undefined) assertOwnerUsernameReserved(username);
    if (email !== undefined) assertEmail(email);

    const target = await rbacRepository.findUserWithRoles(userId);
    if (!target) throw new HttpError(404, 'пользователь не найден');
    assertCanModifyUser(target, actor, { allowSelfAdmin: true });

    await authService.updateProfile(userId, {
      ...(username !== undefined ? { username } : {}),
      ...(email !== undefined ? { email } : {}),
    });

    const user = await rbacRepository.findUserWithRoles(userId);
    if (!user) throw new HttpError(404, 'пользователь не найден');
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'user.update',
      targetType: 'user',
      targetId: userId,
      details: { username: user.username, email: user.email },
    });
    return user;
  },

  /** Удалить пользователя админом: себя нельзя, последнего админа нельзя. */
  async deleteUser(userId: string, actor: AuditActor): Promise<void> {
    if (userId === actor.id) throw new HttpError(400, 'нельзя удалить себя');

    const target = await rbacRepository.findUserWithRoles(userId);
    if (!target) throw new HttpError(404, 'пользователь не найден');
    assertCanModifyUser(target, actor);
    if (target.roles.some((r) => r.name === 'admin')) {
      const otherAdmins = await rbacRepository.countAdminsExcluding(userId);
      if (otherAdmins === 0) throw new HttpError(400, 'нельзя удалить последнего администратора');
    }

    const deleted = await userRepository.deleteById(userId);
    if (!deleted) throw new HttpError(404, 'пользователь не найден');
    invalidateUser(userId);
    await auditService.logAudit({
      actorId: actor.id,
      actorName: actor.username,
      action: 'user.delete',
      targetType: 'user',
      targetId: userId,
      details: { username: target.username },
    });
  },
};
