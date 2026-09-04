export type Role = 'admin' | 'operator' | 'viewer';

export const ROLES: Role[] = ['admin', 'operator', 'viewer'];

/**
 * Глобальные capability (системные операции управления).
 * В отличие от object-ACL (read/write/delete/stream/list на группах объектов),
 * эти capability связаны с управлением самой системой и выдаются по роли.
 */
export type Capability =
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  | 'group:create'
  | 'group:read'
  | 'group:update'
  | 'group:delete'
  | 'permission:grant'
  | 'permission:revoke'
  | 'role:assign';

/**
 * Объектные действия для ACL на группах объектов.
 * Совпадает с CHECK (action IN (...)) в таблице permissions.
 */
export type ObjectAction = 'read' | 'write' | 'delete' | 'stream' | 'list';

export const OBJECT_ACTIONS: ObjectAction[] = ['read', 'write', 'delete', 'stream', 'list'];

/**
 * Роль -> набор системных capability.
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  admin: [
    'user:create',
    'user:read',
    'user:update',
    'user:delete',
    'group:create',
    'group:read',
    'group:update',
    'group:delete',
    'permission:grant',
    'permission:revoke',
    'role:assign',
  ],
  operator: [],
  viewer: [],
};

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
