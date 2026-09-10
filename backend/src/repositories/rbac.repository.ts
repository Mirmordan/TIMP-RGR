import { pool } from '../database/connection';
import type { PoolClient } from 'pg';
import type { Capability } from '../security/types';

/**
 * Доступ к RBAC-таблицам (users, roles, user_roles, groups,
 * group_members, permissions, objects, recording_devices) для /admin панели:
 * read-only выборки + мутации ролей пользователей и CRUD кастомных ролей.
 * Таблицы не имеют RLS, поэтому читаются напрямую через pool.
 */

/** Выполнить серию запросов в одной транзакции. */
async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export interface RbacRole {
  id: string;
  name: string;
  createdAt: string;
}

export interface RbacUserWithRoles {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  passwordSet: boolean;
  roles: Array<{ id: string; name: string }>;
  /** true, если username совпадает с OWNER_USERNAME (не колонка БД). */
  isOwner?: boolean;
}

export interface RbacGroup {
  id: string;
  name: string;
  objectCount: number;
  isSystem?: boolean;
}

export interface RbacGroupObject {
  objectId: string;
  name: string | null;
  type: string | null;
  description: string | null;
}

export interface RbacPermission {
  id: string;
  roleId: string;
  roleName: string;
  groupId: string;
  groupName: string;
  action: string;
}

/** Прямая выдача роли на объект (role_object_grants). */
export interface RbacObjectGrant {
  id: string;
  roleId: string;
  objectId: string;
  objectType: string | null;
  objectName: string | null;
  objectDescription: string | null;
  action: string;
  createdAt: string;
}

/** Унифицированная запись объекта для панели /admin (из objects). */
export interface RbacObject {
  id: string;
  type: string | null;
  name: string | null;
  description: string | null;
  parentObjectId: string | null;
  parentType: string | null;
  createdAt: string;
}

export const rbacRepository = {
  async findUsersWithRoles(limit: number, offset: number): Promise<RbacUserWithRoles[]> {
    const { rows } = await pool.query<RbacUserWithRoles>(
      `SELECT u.id AS "id",
              u.username AS "username",
              u.email AS "email",
              u.created_at AS "createdAt",
              u.password_hash IS NOT NULL AS "passwordSet",
              COALESCE(
                jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
                  FILTER (WHERE r.id IS NOT NULL),
                '[]'::jsonb
              ) AS "roles"
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.username
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows;
  },

  async findUserWithRoles(id: string): Promise<RbacUserWithRoles | null> {
    const { rows } = await pool.query<RbacUserWithRoles>(
      `SELECT u.id AS "id",
              u.username AS "username",
              u.email AS "email",
              u.created_at AS "createdAt",
              u.password_hash IS NOT NULL AS "passwordSet",
              COALESCE(
                jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
                  FILTER (WHERE r.id IS NOT NULL),
                '[]'::jsonb
              ) AS "roles"
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id],
    );
    return rows[0] ?? null;
  },

  async findRoles(): Promise<RbacRole[]> {
    const { rows } = await pool.query<RbacRole>(
      `SELECT id, name, created_at AS "createdAt"
       FROM roles
       ORDER BY name`,
    );
    return rows;
  },

  async findGroups(): Promise<RbacGroup[]> {
    const { rows } = await pool.query<RbacGroup>(
      `SELECT g.id AS "id",
              g.name AS "name",
              count(gm.object_id)::int AS "objectCount",
              g.is_system AS "isSystem"
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name`,
    );
    return rows;
  },

  /**
   * Объекты группы (произвольные типы: device/stream/process/segment/chunk/incident).
   * Для системной группы возвращает ВСЕ объекты (без group_members).
   * ВАЖНО: читается objects (без RLS) через pool — панель /admin обязана видеть
   * ВСЕ объекты группы, независимо от прав текущего юзера на них.
   */
  async findGroupObjects(groupId: string): Promise<{ exists: boolean; objects: RbacGroupObject[] }> {
    const group = await pool.query<{ id: string; isSystem: boolean }>('SELECT id, is_system AS "isSystem" FROM groups WHERE id = $1', [groupId]);
    if (!group.rows[0]) return { exists: false, objects: [] };
    const isSystem = group.rows[0].isSystem;

    if (isSystem) {
      // Системная группа — все объекты.
      const { rows } = await pool.query<RbacGroupObject>(
        `SELECT o.id AS "objectId",
                objects_display_name(o.id) AS "name",
                o.type AS "type",
                o.description AS "description"
         FROM objects o
         WHERE o.type <> ''
         ORDER BY o.created_at DESC`,
      );
      return { exists: true, objects: rows };
    }

    const { rows } = await pool.query<RbacGroupObject>(
      `SELECT gm.object_id AS "objectId",
              objects_display_name(o.id) AS "name",
              o.type AS "type",
              o.description AS "description"
       FROM group_members gm
       JOIN objects o ON o.id = gm.object_id
       WHERE gm.group_id = $1
       ORDER BY o.created_at DESC, gm.object_id`,
      [groupId],
    );
    return { exists: true, objects: rows };
  },

  // --- Прямые grants ролей на объекты (role_object_grants) ---

  /** Все прямые grants роли (с метаданными объекта). */
  async findRoleObjectGrants(roleId: string): Promise<RbacObjectGrant[]> {
    const { rows } = await pool.query<RbacObjectGrant>(
      `SELECT g.id AS "id",
              g.role_id AS "roleId",
              g.object_id AS "objectId",
              o.type AS "objectType",
              objects_display_name(o.id) AS "objectName",
              o.description AS "objectDescription",
              g.action AS "action",
              g.created_at AS "createdAt"
       FROM role_object_grants g
       JOIN objects o ON o.id = g.object_id
       WHERE g.role_id = $1
       ORDER BY o.created_at DESC, g.action, g.object_id`,
      [roleId],
    );
    return rows;
  },

  /** Заменить набор прямых grants роли (транзакция: DELETE + INSERT). */
  async replaceRoleObjectGrants(roleId: string, grants: Array<{ objectId: string; action: string }>): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM role_object_grants WHERE role_id = $1', [roleId]);
      for (const g of grants) {
        await client.query(
          'INSERT INTO role_object_grants (role_id, object_id, action) VALUES ($1, $2, $3)',
          [roleId, g.objectId, g.action],
        );
      }
    });
  },

  // --- Унифицированный список объектов для панели /admin ---

  /**
   * Поиск объектов любых типов по общим метаданным (objects).
   * ВАЖНО: objects без RLS, читаем через pool — /admin (permission-UI) должен
   * видеть ВСЕ объекты-кандидаты, независимо от visibility текущего юзера.
   * Эндпоинт защищён capability permission:read и аудитируется.
   */
  async findAdminObjects(params: {
    q?: string;
    type?: string;
    groupId?: string;
    limit: number;
    offset: number;
  }): Promise<{ objects: RbacObject[]; total: number }> {
    const where: string[] = [`o.type <> ''`];
    const cond: unknown[] = [];
    const push = (v: unknown) => {
      cond.push(v);
      return cond.length;
    };

    if (params.type) {
      where.push(`o.type = $${push(params.type)}`);
    }
    if (params.groupId) {
      where.push(
        `EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = $${push(params.groupId)} AND gm.object_id = o.id)`,
      );
    }
    if (params.q && params.q.trim() !== '') {
      const like = `%${params.q.trim()}%`;
      where.push(
        `(objects_display_name(o.id) ILIKE $${push(like)}
          OR o.description ILIKE $${push(like)}
          OR o.id::text ILIKE $${push(like)})`,
      );
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const select = `SELECT o.id AS "id",
                           o.type AS "type",
                           objects_display_name(o.id) AS "name",
                           o.description AS "description",
                           o.parent_id AS "parentObjectId",
                           objects_admin_parent_type(o.id) AS "parentType",
                           o.created_at AS "createdAt"
                    FROM objects o`;

    const [data, total] = await Promise.all([
      pool.query<RbacObject>(`${select} ${whereSql} ORDER BY o.created_at DESC LIMIT $${push(params.limit)} OFFSET $${push(params.offset)}`, cond),
      pool.query<{ total: number }>(
        `SELECT count(*)::int AS "total" FROM objects o ${whereSql}`,
        cond.slice(0, cond.length - 2),
      ),
    ]);
    return { objects: data.rows, total: total.rows[0]?.total ?? 0 };
  },

  async findPermissions(): Promise<RbacPermission[]> {
    const { rows } = await pool.query<RbacPermission>(
      `SELECT p.id AS "id",
              p.role_id AS "roleId",
              r.name AS "roleName",
              p.group_id AS "groupId",
              g.name AS "groupName",
              p.action AS "action"
       FROM permissions p
       JOIN roles r ON r.id = p.role_id
       JOIN groups g ON g.id = p.group_id
       ORDER BY r.name, g.name, p.action`,
    );
    return rows;
  },

  async findPermissionsByRole(roleId: string): Promise<RbacPermission[]> {
    const { rows } = await pool.query<RbacPermission>(
      `SELECT p.id AS "id",
              p.role_id AS "roleId",
              r.name AS "roleName",
              p.group_id AS "groupId",
              g.name AS "groupName",
              p.action AS "action"
       FROM permissions p
       JOIN roles r ON r.id = p.role_id
       JOIN groups g ON g.id = p.group_id
       WHERE p.role_id = $1
       ORDER BY g.name, p.action`,
      [roleId],
    );
    return rows;
  },

  // --- Мутации (Э3) ---

  async findRoleById(id: string): Promise<RbacRole | null> {
    const { rows } = await pool.query<RbacRole>(
      `SELECT id, name, created_at AS "createdAt"
       FROM roles
       WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  // --- Спец-права (role_capabilities) ---

  /** Коды спец-прав роли (все, включая пустой набор). */
  async findRoleCapabilities(roleId: string): Promise<string[]> {
    const { rows } = await pool.query<{ capability: string }>(
      `SELECT capability
       FROM role_capabilities
       WHERE role_id = $1
       ORDER BY capability`,
      [roleId],
    );
    return rows.map((r) => r.capability);
  },

  /** Union спец-прав пользователя по всем его ролям (для /auth/me). */
  async findCapabilitiesByUser(userId: string): Promise<Capability[]> {
    const { rows } = await pool.query<{ capability: Capability }>(
      `SELECT DISTINCT rc.capability AS "capability"
       FROM role_capabilities rc
       JOIN user_roles ur ON ur.role_id = rc.role_id
       WHERE ur.user_id = $1
       ORDER BY rc.capability`,
      [userId],
    );
    return rows.map((r) => r.capability);
  },

  /** Пользователи, которым выдана роль (для инвалидации кеша при смене прав роли). */
  async findUsersByRole(roleId: string): Promise<string[]> {
    const { rows } = await pool.query<{ userId: string }>(
      'SELECT user_id AS "userId" FROM user_roles WHERE role_id = $1',
      [roleId],
    );
    return rows.map((r) => r.userId);
  },

  /** Пагинированный список пользователей с ролями, которым выдана роль (для /admin/roles/:id/users). */
  async findUsersInRole(roleId: string, limit: number, offset: number): Promise<RbacUserWithRoles[]> {
    const { rows } = await pool.query<RbacUserWithRoles>(
      `SELECT u.id AS "id",
              u.username AS "username",
              u.email AS "email",
              u.created_at AS "createdAt",
              u.password_hash IS NOT NULL AS "passwordSet",
              COALESCE(
                jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
                  FILTER (WHERE r.id IS NOT NULL),
                '[]'::jsonb
              ) AS "roles"
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN user_roles ur_all ON ur_all.user_id = u.id
       LEFT JOIN roles r ON r.id = ur_all.role_id
       WHERE ur.role_id = $1
       GROUP BY u.id
       ORDER BY u.username
       LIMIT $2 OFFSET $3`,
      [roleId, limit, offset],
    );
    return rows;
  },

  /** Заменить набор спец-прав роли (транзакция: DELETE + INSERT). */
  async replaceRoleCapabilities(roleId: string, capabilities: string[]): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM role_capabilities WHERE role_id = $1', [roleId]);
      for (const capability of capabilities) {
        await client.query(
          'INSERT INTO role_capabilities (role_id, capability) VALUES ($1, $2)',
          [roleId, capability],
        );
      }
    });
  },

  async findRoleByName(name: string): Promise<RbacRole | null> {
    const { rows } = await pool.query<RbacRole>(
      `SELECT id, name, created_at AS "createdAt"
       FROM roles
       WHERE name = $1`,
      [name],
    );
    return rows[0] ?? null;
  },

  async findRoleIdsByNames(names: string[]): Promise<Array<{ id: string; name: string }>> {
    if (names.length === 0) return [];
    const { rows } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM roles WHERE name = ANY($1)`,
      [names],
    );
    return rows;
  },

  /** Число админов, исключая данного пользователя (для защиты последнего админа). */
  async countAdminsExcluding(userId: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS "count"
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE r.name = 'admin' AND ur.user_id <> $1`,
      [userId],
    );
    return rows[0] ? Number(rows[0].count) : 0;
  },

  /** Заменить роли пользователя (транзакция: DELETE + INSERT по списку id). */
  async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      for (const roleId of roleIds) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [userId, roleId],
        );
      }
    });
  },

  /**
   * Создать пользователя и сразу выдать ему набор ролей (одна транзакция).
   * Пустой список ролей трактуется как ['viewer']. Если какая-то роль не
   * найдена — транзакция откатывается.
   */
  async createUserWithRoles(data: {
    username: string;
    email: string;
    passwordHash: string;
    roleNames: string[];
  }): Promise<string> {
    const roleNames = data.roleNames.length > 0 ? [...new Set(data.roleNames)] : ['viewer'];
    return withTransaction(async (client) => {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id`,
        [data.username, data.email, data.passwordHash],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw new Error('пользователь не создан');
      const roles = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM roles WHERE name = ANY($1)`,
        [roleNames],
      );
      const foundNames = new Set(roles.rows.map((r) => r.name));
      const missing = roleNames.filter((name) => !foundNames.has(name));
      if (missing.length > 0) {
        throw new Error(`роль не найдена: ${missing.join(', ')}`);
      }
      for (const role of roles.rows) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [userId, role.id],
        );
      }
      return userId;
    });
  },

  /** Установить хэш пароля пользователя (для сброса/активации пароля). */
  async setUserPasswordHash(userId: string, passwordHash: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async createRole(name: string): Promise<RbacRole> {
    const { rows } = await pool.query<RbacRole>(
      `INSERT INTO roles (name) VALUES ($1)
       RETURNING id, name, created_at AS "createdAt"`,
      [name],
    );
    const row = rows[0];
    if (!row) throw new Error('роль не создана');
    return row;
  },

  async renameRole(id: string, name: string): Promise<RbacRole | null> {
    const { rows } = await pool.query<RbacRole>(
      `UPDATE roles SET name = $1 WHERE id = $2
       RETURNING id, name, created_at AS "createdAt"`,
      [name, id],
    );
    return rows[0] ?? null;
  },

  /**
   * Удалить роль (user_roles и permissions сносятся FK CASCADE).
   * Возвращает затронутые user_id/group_id для инвалидации ACL-кеша,
   * либо null, если роль с таким id не существует.
   */
  async deleteRole(id: string): Promise<{ userIds: string[]; groupIds: string[] } | null> {
    return withTransaction(async (client) => {
      const ur = await client.query<{ userId: string }>(
        'SELECT user_id AS "userId" FROM user_roles WHERE role_id = $1',
        [id],
      );
      const p = await client.query<{ groupId: string }>(
        'SELECT group_id AS "groupId" FROM permissions WHERE role_id = $1',
        [id],
      );
      const del = await client.query('DELETE FROM roles WHERE id = $1', [id]);
      if ((del.rowCount ?? 0) === 0) return null;
      return {
        userIds: ur.rows.map((r) => r.userId),
        groupIds: p.rows.map((r) => r.groupId),
      };
    });
  },

  // --- Мутации (Э5): права ролей и группы объектов ---

  /** Заменить ВСЕ права роли (транзакция: DELETE + INSERT по списку). */
  async replaceRolePermissions(roleId: string, entries: Array<{ groupId: string; action: string }>): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM permissions WHERE role_id = $1', [roleId]);
      for (const e of entries) {
        await client.query(
          'INSERT INTO permissions (role_id, group_id, action) VALUES ($1, $2, $3)',
          [roleId, e.groupId, e.action],
        );
      }
    });
  },

  async findGroupById(id: string): Promise<RbacGroup | null> {
    const { rows } = await pool.query<RbacGroup>(
      `SELECT g.id AS "id",
              g.name AS "name",
              g.is_system AS "isSystem",
              count(gm.object_id)::int AS "objectCount"
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       WHERE g.id = $1
       GROUP BY g.id`,
      [id],
    );
    return rows[0] ?? null;
  },

  async findGroupByName(name: string): Promise<RbacGroup | null> {
    const { rows } = await pool.query<RbacGroup>(
      `SELECT id AS "id", name AS "name", is_system AS "isSystem", 0::int AS "objectCount"
       FROM groups
       WHERE name = $1`,
      [name],
    );
    return rows[0] ?? null;
  },

  /** Сколько прав, членов и прямых выдач висит на группе (для guard при удалении). */
  async countGroupUsage(groupId: string): Promise<{ permissions: number; members: number; directGrants: number }> {
    const { rows } = await pool.query<{ permissions: number; members: number; directGrants: number }>(
      `SELECT (SELECT count(*)::int FROM permissions p WHERE p.group_id = $1) AS "permissions",
              (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = $1) AS "members",
              (SELECT count(*)::int FROM role_object_grants g WHERE g.object_id = $1) AS "directGrants"`,
      [groupId],
    );
    return {
      permissions: rows[0]?.permissions ?? 0,
      members: rows[0]?.members ?? 0,
      directGrants: rows[0]?.directGrants ?? 0,
    };
  },

  async createGroup(name: string): Promise<RbacGroup> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; name: string; isSystem: boolean }>(
        `INSERT INTO groups (name) VALUES ($1)
         RETURNING id, name, false AS "isSystem"`,
        [name],
      );
      const row = rows[0];
      if (!row) throw new Error('группа не создана');
      await client.query(
        `INSERT INTO objects (id, type, name, description, parent_id)
         VALUES ($1, 'group', $2, NULL,
                 'aaaaaaaa-0000-0000-0000-000000000001')`,
        [row.id, row.name],
      );
      return { ...row, objectCount: 0 };
    });
  },

  async renameGroup(id: string, name: string): Promise<RbacGroup | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<RbacGroup>(
        `UPDATE groups SET name = $1 WHERE id = $2
         RETURNING id, name, is_system AS "isSystem", 0::int AS "objectCount"`,
        [name, id],
      );
      const updated = rows[0];
      if (!updated) return null;
      await client.query(
        `UPDATE objects SET name = $2
         WHERE id = $1 AND type = 'group'`,
        [id, name],
      );
      const count = (await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM group_members WHERE group_id = $1",
        [id],
      )).rows[0];
      return { ...updated, objectCount: count?.count ?? 0 };
    });
  },

  async deleteGroup(id: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const deleted = await client.query('DELETE FROM groups WHERE id = $1', [id]);
      if ((deleted.rowCount ?? 0) === 0) return false;
      await client.query("DELETE FROM objects WHERE id = $1 AND type = 'group'", [id]);
      return true;
    });
  },

  /** Заменить состав объектов группы (транзакция: DELETE + INSERT). */
  async replaceGroupObjects(groupId: string, objectIds: string[]): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM group_members WHERE group_id = $1', [groupId]);
      for (const objectId of objectIds) {
        await client.query(
          'INSERT INTO group_members (group_id, object_id) VALUES ($1, $2)',
          [groupId, objectId],
        );
      }
    });
  },

  /** Какие из переданных id реально существуют в groups (для валидации entries). */
  async findExistingGroupIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM groups WHERE id::text = ANY($1)`,
      [ids],
    );
    return rows.map((r) => r.id);
  },

  /** Какие из переданных id реально существуют в objects (для валидации objectIds). */
  async findExistingObjectIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM objects WHERE id::text = ANY($1)`,
      [ids],
    );
    return rows.map((r) => r.id);
  },
};
