-- Гранулярные спец-права (расширение модели из 14-special-permissions.sql).
-- Вместо монолитных admin:read/admin:write на панели /admin появляются
-- отдельные права на управление пользователями/ролями/группами/правами/аудитом,
-- а жёсткий гейт создания доменных объектов (admin:write) заменяется на
-- camera:create/stream:create/process:create/chunk:create.
-- admin:read/admin:write СОХРАНЯЮТСЯ: admin:read — чтение сводки/обзора
-- (панель + /stats/disk), admin:write — полный доступ (совместимость и
-- чувствительные операции: выдача ролей пользователям, выдача спец-прав).
-- Скрипт идемпотентен: повторный прогон безопасен.

-- 1. Таблица (на случай прогона без 14) с полным CHECK.
CREATE TABLE IF NOT EXISTS role_capabilities (
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    capability TEXT NOT NULL CHECK (capability IN (
        'admin:read',
        'admin:write',
        'audit:delete',
        'audit:read',
        'camera:create',
        'chunk:create',
        'group:create',
        'group:delete',
        'group:read',
        'group:update',
        'media:export',
        'permission:manage',
        'permission:read',
        'process:create',
        'role:create',
        'role:delete',
        'role:read',
        'role:update',
        'stream:create',
        'user:create',
        'user:delete',
        'user:password:reset',
        'user:read',
        'user:update'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (role_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_role_capabilities_role ON role_capabilities (role_id);

-- Права приложения на таблицу (если скрипт запущен без 14, где GRANT уже есть).
-- GRANT идемпотентен; роль timprgr_app создаётся в 06-app-role.sql.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timprgr_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON role_capabilities TO timprgr_app';
    END IF;
END
$$;

-- 2. Обновляем CHECK до актуального набора (старый констрейнт пересоздаётся).
ALTER TABLE role_capabilities DROP CONSTRAINT IF EXISTS role_capabilities_capability_check;
ALTER TABLE role_capabilities
    ADD CONSTRAINT role_capabilities_capability_check
    CHECK (capability IN (
        'admin:read',
        'admin:write',
        'audit:delete',
        'audit:read',
        'camera:create',
        'chunk:create',
        'group:create',
        'group:delete',
        'group:read',
        'group:update',
        'media:export',
        'permission:manage',
        'permission:read',
        'process:create',
        'role:create',
        'role:delete',
        'role:read',
        'role:update',
        'stream:create',
        'user:create',
        'user:delete',
        'user:password:reset',
        'user:read',
        'user:update'
    ));

-- 3. Сид: admin получает ВСЕ коды; operator/viewer и кастомные роли — пусто
--    (выдаётся только вручную через /admin). Повторный прогон безопасен.
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, v.capability
FROM roles r
JOIN (VALUES
    ('admin:read'),
    ('admin:write'),
    ('audit:delete'),
    ('audit:read'),
    ('camera:create'),
    ('chunk:create'),
    ('group:create'),
    ('group:delete'),
    ('group:read'),
    ('group:update'),
    ('media:export'),
    ('permission:manage'),
    ('permission:read'),
    ('process:create'),
    ('role:create'),
    ('role:delete'),
    ('role:read'),
    ('role:update'),
    ('stream:create'),
    ('user:create'),
    ('user:delete'),
    ('user:password:reset'),
    ('user:read'),
    ('user:update')
) AS v(capability) ON TRUE
WHERE r.name = 'admin'
ON CONFLICT (role_id, capability) DO NOTHING;

-- 4. RLS: доменные INSERT-политики по гранулярным спец-правам.
--    Раньше вставки в recording_devices/streams/processes/chunks/segments были
--    доступны только is_admin() (админ-роль). Чтобы выданные роли
--    camera:create/stream:create/process:create/chunk:create реально работали
--    для кастомных ролей, INSERT разрешается при is_admin() ИЛИ наличии
--    соответствующего спец-права.
--    ВАЖНО: WITH CHECK нескольких permissive-политик комбинируются через AND,
--    поэтому admin_all-политики сужены до SELECT/UPDATE/DELETE, а INSERT
--    полностью обслуживается единой политикой *_insert_access (иначе
--    не-админ с capability упёрся бы в WITH CHECK (is_admin()) политики admin_all).

-- Проверка спец-права текущего юзера (app.user_id из контекста запроса).
CREATE OR REPLACE FUNCTION has_capability(p_capability TEXT) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_capabilities rc ON rc.role_id = ur.role_id
        WHERE ur.user_id = v_user_id AND rc.capability = p_capability
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- recording_devices
DROP POLICY IF EXISTS devices_admin_all ON recording_devices;
DROP POLICY IF EXISTS devices_admin_all_ud ON recording_devices;
DROP POLICY IF EXISTS devices_admin_all_d ON recording_devices;
DROP POLICY IF EXISTS devices_insert_capability ON recording_devices;
CREATE POLICY devices_admin_all ON recording_devices
    FOR SELECT USING (is_admin());
CREATE POLICY devices_admin_all_ud ON recording_devices
    FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY devices_admin_all_d ON recording_devices
    FOR DELETE USING (is_admin());
CREATE POLICY devices_insert_capability ON recording_devices
    FOR INSERT WITH CHECK (is_admin() OR has_capability('camera:create'));

-- recording_streams
DROP POLICY IF EXISTS streams_admin_all ON recording_streams;
DROP POLICY IF EXISTS streams_admin_all_ud ON recording_streams;
DROP POLICY IF EXISTS streams_admin_all_d ON recording_streams;
DROP POLICY IF EXISTS streams_insert_capability ON recording_streams;
CREATE POLICY streams_admin_all ON recording_streams
    FOR SELECT USING (is_admin());
CREATE POLICY streams_admin_all_ud ON recording_streams
    FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY streams_admin_all_d ON recording_streams
    FOR DELETE USING (is_admin());
CREATE POLICY streams_insert_capability ON recording_streams
    FOR INSERT WITH CHECK (is_admin() OR has_capability('stream:create'));

-- recording_processes
DROP POLICY IF EXISTS processes_admin_all ON recording_processes;
DROP POLICY IF EXISTS processes_admin_all_ud ON recording_processes;
DROP POLICY IF EXISTS processes_admin_all_d ON recording_processes;
DROP POLICY IF EXISTS processes_insert_capability ON recording_processes;
CREATE POLICY processes_admin_all ON recording_processes
    FOR SELECT USING (is_admin());
CREATE POLICY processes_admin_all_ud ON recording_processes
    FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY processes_admin_all_d ON recording_processes
    FOR DELETE USING (is_admin());
CREATE POLICY processes_insert_capability ON recording_processes
    FOR INSERT WITH CHECK (is_admin() OR has_capability('process:create'));

-- recording_chunks
DROP POLICY IF EXISTS chunks_admin_all ON recording_chunks;
DROP POLICY IF EXISTS chunks_admin_all_ud ON recording_chunks;
DROP POLICY IF EXISTS chunks_admin_all_d ON recording_chunks;
DROP POLICY IF EXISTS chunks_insert_capability ON recording_chunks;
CREATE POLICY chunks_admin_all ON recording_chunks
    FOR SELECT USING (is_admin());
CREATE POLICY chunks_admin_all_ud ON recording_chunks
    FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY chunks_admin_all_d ON recording_chunks
    FOR DELETE USING (is_admin());
CREATE POLICY chunks_insert_capability ON recording_chunks
    FOR INSERT WITH CHECK (is_admin() OR has_capability('chunk:create'));

-- recording_segments: создаются только как побочный эффект запуска процесса
-- записи (ручного POST /segments нет), поэтому INSERT привязан к process:create.
DROP POLICY IF EXISTS segments_admin_all ON recording_segments;
DROP POLICY IF EXISTS segments_admin_all_ud ON recording_segments;
DROP POLICY IF EXISTS segments_admin_all_d ON recording_segments;
DROP POLICY IF EXISTS segments_insert_capability ON recording_segments;
CREATE POLICY segments_admin_all ON recording_segments
    FOR SELECT USING (is_admin());
CREATE POLICY segments_admin_all_ud ON recording_segments
    FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY segments_admin_all_d ON recording_segments
    FOR DELETE USING (is_admin());
CREATE POLICY segments_insert_capability ON recording_segments
    FOR INSERT WITH CHECK (is_admin() OR has_capability('process:create'));

-- 5. Владелец-объекта (owner_id): INSERT ... RETURNING/просмотр собственных
--    созданных объектов. Раньше строка после INSERT не проходила SELECT-политики
--    (has_permission), из-за чего RETURNING падал и не-админ с camera:create
--    не мог создать устройство. owner_id проставляется при создании (см.
--    INSERT INTO objects в queries) и даёт автору право читать свой объект
--    ТОЛЬКО ПОКА объект не включён ни в одну группу: это «bootstrap» для
--    создания объектов не-админами. Как только администратор передал объект
--    в группу(ы) (начал управлять доступом через группы), видимость
--    определяется исключительно групповыми правами (и админом) — у владельца
--    не остаётся неявного read на переданный объект.
--    ВАЖНО: app-ACL (acl.can) повторяет ровно эту семантику, чтобы list/detail
--    и RLS-запросы не расходились.
ALTER TABLE objects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_objects_owner ON objects (owner_id);

CREATE OR REPLACE FUNCTION is_owner(p_object_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM objects o
        WHERE o.id = p_object_id AND o.owner_id = v_user_id
    );
END;
$$ LANGUAGE plpgsql STABLE;

DROP POLICY IF EXISTS devices_owner_read ON recording_devices;
CREATE POLICY devices_owner_read ON recording_devices
    FOR SELECT USING (
        is_owner(object_id)
        AND NOT EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.object_id = recording_devices.object_id
        )
    );

DROP POLICY IF EXISTS streams_owner_read ON recording_streams;
CREATE POLICY streams_owner_read ON recording_streams
    FOR SELECT USING (
        is_owner(object_id)
        AND NOT EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.object_id = recording_streams.object_id
        )
    );

DROP POLICY IF EXISTS processes_owner_read ON recording_processes;
CREATE POLICY processes_owner_read ON recording_processes
    FOR SELECT USING (
        is_owner(object_id)
        AND NOT EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.object_id = recording_processes.object_id
        )
    );

DROP POLICY IF EXISTS chunks_owner_read ON recording_chunks;
CREATE POLICY chunks_owner_read ON recording_chunks
    FOR SELECT USING (
        is_owner(object_id)
        AND NOT EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.object_id = recording_chunks.object_id
        )
    );

DROP POLICY IF EXISTS segments_owner_read ON recording_segments;
CREATE POLICY segments_owner_read ON recording_segments
    FOR SELECT USING (
        is_owner(object_id)
        AND NOT EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.object_id = recording_segments.object_id
        )
    );
