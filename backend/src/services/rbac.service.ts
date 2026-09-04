import { rbacRepository } from '../repositories/rbac.repository';
import { invalidateGroup, invalidateUser } from '../security/acl';
import type { RbacRole, RbacUserWithRoles } from '../repositories/rbac.repository';

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
};
