-- Модель доступа:.roles (группы юзеров) + группы объектов.
-- users →< user_roles >→ roles ── permissions(role,group,action) ── groups <── group_members ── objects.
-- Юзер видит объект, если его роль имеет право на группу этого объекта.

-- Роли (группы пользователей)
CREATE TABLE roles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Выдача ролей пользователям (связь users ↔ roles)
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id)  ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Группы объектов
CREATE TABLE groups (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

-- Принадлежность объекта к группе (ссылка на супертип objects)
CREATE TABLE group_members (
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, object_id)
);

-- Разрешения: роль × группа × действие
CREATE TABLE permissions (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id  UUID NOT NULL REFERENCES roles(id)  ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    action   TEXT NOT NULL CHECK (action IN ('read', 'write', 'delete', 'stream', 'list')),
    UNIQUE (role_id, group_id, action)
);

-- Индексы
CREATE INDEX idx_user_roles_user ON user_roles(user_id, role_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id, user_id);

CREATE INDEX idx_group_members_group  ON group_members(group_id, object_id);
CREATE INDEX idx_group_members_object ON group_members(object_id, group_id);

CREATE INDEX idx_permissions_role  ON permissions(role_id, group_id);
CREATE INDEX idx_permissions_group ON permissions(group_id, role_id);
