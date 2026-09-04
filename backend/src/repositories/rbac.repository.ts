import { pool } from '../database/connection';

/**
 * Read-only доступ к RBAC-таблицам (users, roles, user_roles, groups,
 * group_members, permissions, objects, recording_devices) для /admin панели.
 * Таблицы не имеют RLS, поэтому читаются напрямую через pool (без queryAs).
 */

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
    const group = await pool.query<{ id: string }>('SELECT id FROM groups WHERE id = $1', [groupId]);
    if (!group.rows[0]) return { exists: false, objects: [] };
    const { rows } = await pool.query<RbacGroupObject>(
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
};
