export type Role = 'admin' | 'operator' | 'viewer';

export const ROLES: Role[] = ['admin', 'operator', 'viewer'];

/**
 * Глобальные capability (системные операции управления).
 * В отличие от object-ACL (read/write/delete на группах объектов),
 * эти capability связаны с управлением самой системой. Набор совпадает с
 * CHECK (capability IN (...)) в таблице role_capabilities и содержит только
 * коды, реально проверяемые requireCapability в коде.
 *
 * Гранулярность: роль/группа/право/аудит/доменные-создания выдаются
 * отдельными кодами. admin:read — обзор панели/сводки (/stats/disk),
 * admin:write — полный доступ (в т.ч. чувствительные выдачи ролей/спец-прав).
 */
export type Capability =
  | 'admin:read'
  | 'admin:write'
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  | 'user:password:reset'
  | 'role:read'
  | 'role:create'
  | 'role:update'
  | 'role:delete'
  | 'group:read'
  | 'group:create'
  | 'group:update'
  | 'group:delete'
  | 'permission:read'
  | 'permission:manage'
  | 'audit:read'
  | 'audit:delete'
  | 'camera:create'
  | 'stream:create'
  | 'process:create'
  | 'chunk:create'
  | 'media:export'
  | 'dashboard:read';

/**
 * Объектные действия для ACL на группах объектов.
 * Совпадает с CHECK (action IN (...)) в таблице permissions.
 */
export type ObjectAction = 'read' | 'write' | 'delete';

export const OBJECT_ACTIONS: ObjectAction[] = ['read', 'write', 'delete'];

/** Payload access-токена (короткоживущий). */
export interface AccessTokenPayload {
  sub: string; // user id
  username: string;
  role: Role;
  type: 'access';
}

/** Payload refresh-токена (долгоживущий). */
export interface RefreshTokenPayload {
  sub: string; // user id
  type: 'refresh';
}

/** Аутентифицированный пользователь, вешается на req.user. */
export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
