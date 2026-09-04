import { pool } from '../database/connection';
import type { PoolClient } from 'pg';
import { queryAs } from '../security/dbBridge';

/**
 * Доступ к RBAC-таблицам (users, roles, user_roles, groups,
 * group_members, permissions, objects, recording_devices) для /admin панели:
 * read-only выборки + мутации ролей пользователей и CRUD кастомных ролей.
 * Таблицы не имеют RLS, поэтому читаются напрямую через pool (без queryAs).
 * Исключение — выборки, джойнящие recording_devices (FORCE RLS): идут через
 * queryAs, чтобы app.user_id из контекста запроса прошёл is_admin()/has_permission().
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
  roles: Array<{ id: string; name: string }>;
}

export interface RbacGroup {
  id: string;
  name: string;
  objectCount: number;
}

export interface RbacGroupObject {
  objectId: string;
  name: string | null;
  type: string | null;
}

export interface RbacPermission {
  id: string;
  roleId: string;
  roleName: string;
  groupId: string;
  groupName: string;
  action: string;
}

export const rbacRepository = {
  async findUsersWithRoles(limit: number, offset: number): Promise<RbacUserWithRoles[]> {
    const { rows } = await pool.query<RbacUserWithRoles>(
      `SELECT u.id AS "id",
              u.username AS "username",
              u.email AS "email",
              u.created_at AS "createdAt",
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
              count(gm.object_id)::int AS "objectCount"
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name`,
    );
    return rows;
  },

  async findGroupObjects(groupId: string): Promise<{ exists: boolean; objects: RbacGroupObject[] }> {
    const group = await queryAs<{ id: string }>('SELECT id FROM groups WHERE id = $1', [groupId]);
    if (!group.rows[0]) return { exists: false, objects: [] };
    const { rows } = await queryAs<RbacGroupObject>(
      `SELECT gm.object_id AS "objectId",
              rd.name AS "name",
              rd.type AS "type"
       FROM group_members gm
       LEFT JOIN recording_devices rd ON rd.object_id = gm.object_id
       WHERE gm.group_id = $1
       ORDER BY rd.name NULLS LAST, gm.object_id`,
      [groupId],
    );
    return { exists: true, objects: rows };
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
      `SELECT id AS "id", name AS "name", 0::int AS "objectCount"
       FROM groups
       WHERE name = $1`,
      [name],
    );
    return rows[0] ?? null;
  },

  /** Сколько прав и объектов висят на группе (для guard при удалении). */
  async countGroupUsage(groupId: string): Promise<{ permissions: number; members: number }> {
    const { rows } = await pool.query<{ permissions: number; members: number }>(
      `SELECT (SELECT count(*)::int FROM permissions p WHERE p.group_id = $1) AS "permissions",
              (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = $1) AS "members"`,
      [groupId],
    );
    return { permissions: rows[0]?.permissions ?? 0, members: rows[0]?.members ?? 0 };
  },

  async createGroup(name: string): Promise<RbacGroup> {
    const { rows } = await pool.query<RbacGroup>(
      `INSERT INTO groups (name) VALUES ($1)
       RETURNING id, name, 0::int AS "objectCount"`,
      [name],
    );
    const row = rows[0];
    if (!row) throw new Error('группа не создана');
    return row;
  },

  async renameGroup(id: string, name: string): Promise<RbacGroup | null> {
    const { rows } = await pool.query<RbacGroup>(
      `UPDATE groups SET name = $1 WHERE id = $2
       RETURNING id,
               name,
               (SELECT count(*)::int FROM group_members gm WHERE gm.group_id = groups.id) AS "objectCount"`,
      [name, id],
    );
    return rows[0] ?? null;
  },

  async deleteGroup(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM groups WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
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
