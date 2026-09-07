-- Универсальная объектная модель доступа:
--  1) каждая группа становится объектом (objects.id = groups.id, type='group');
--  2) право на объект наследуется во всю композицию: предки/потомки через
--     objects.parent_id и членство group_members;
--  3) RLS инцидентов приводится к общей объектной модели вместо admin-only.
-- Скрипт идемпотентен.

-- =============================================================================
-- 1. Группы как объекты.
-- =============================================================================
INSERT INTO objects (id, type, name, description, parent_id)
SELECT g.id, 'group', g.name, NULL, NULL
FROM groups g
WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.id = g.id);

UPDATE objects o
SET type = 'group', name = g.name
FROM groups g
WHERE o.id = g.id
  AND (o.type IS DISTINCT FROM 'group' OR o.name IS DISTINCT FROM g.name);

CREATE UNIQUE INDEX IF NOT EXISTS objects_group_object_uniq
    ON objects (id)
    WHERE type = 'group';

-- Системная группа all — корень иерархии всех обычных групп.
UPDATE groups SET is_system = COALESCE(is_system, false);
INSERT INTO groups (id, name, is_system)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'all', true)
ON CONFLICT (name) DO UPDATE SET is_system = true;

WITH root AS (
    SELECT id FROM objects WHERE type = 'group' AND id = 'aaaaaaaa-0000-0000-0000-000000000001'
), non_system_groups AS (
    SELECT g.id
    FROM groups g
    WHERE NOT g.is_system
      AND g.id <> 'aaaaaaaa-0000-0000-0000-000000000001'
)
UPDATE objects o
SET parent_id = root.id
FROM root, non_system_groups ng
WHERE o.id = ng.id
  AND o.parent_id IS DISTINCT FROM root.id;

CREATE INDEX IF NOT EXISTS idx_objects_group_type ON objects (name) WHERE type = 'group';

CREATE OR REPLACE FUNCTION object_permission_candidates(p_object_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_candidates uuid[] := ARRAY[p_object_id];
    v_frontier   uuid[] := ARRAY[p_object_id];
    v_new        uuid[] := ARRAY[]::uuid[];
    v_current    uuid;
    v_parent     uuid;
    v_group      uuid;
    _i           integer;
BEGIN
    SELECT COALESCE(array_agg(g.id), ARRAY[]::uuid[]) INTO v_candidates
    FROM groups g
    WHERE g.is_system = true;

    IF v_candidates IS NULL THEN
        v_candidates := ARRAY[]::uuid[];
    END IF;
    IF NOT (p_object_id = ANY (v_candidates)) THEN
        v_candidates := array_append(v_candidates, p_object_id);
    END IF;
    v_frontier := ARRAY[p_object_id];

    FOR _i IN 1..16 LOOP
        v_new := ARRAY[]::uuid[];
        FOREACH v_current IN ARRAY v_frontier LOOP
            SELECT o.parent_id INTO v_parent FROM objects o WHERE o.id = v_current;
            IF v_parent IS NOT NULL AND NOT (v_parent = ANY (v_candidates)) THEN
                v_new := array_append(v_new, v_parent);
                v_candidates := array_append(v_candidates, v_parent);
            END IF;

            FOR v_group IN
                SELECT m.group_id FROM group_members m WHERE m.object_id = v_current
            LOOP
                IF NOT (v_group = ANY (v_candidates)) THEN
                    v_new := array_append(v_new, v_group);
                    v_candidates := array_append(v_candidates, v_group);
                END IF;
            END LOOP;
        END LOOP;

        IF v_new = ARRAY[]::uuid[] THEN
            EXIT;
        END IF;
        v_frontier := v_new;
    END LOOP;

    RETURN QUERY SELECT unnest(v_candidates);
END;
$$;

-- =============================================================================
-- 2. Универсальное решение object_can + has_permission: права наследуются по
--    parent-цепочке объектов и группе, системная all — корень прав.
-- =============================================================================
CREATE OR REPLACE FUNCTION object_can(
    p_object_id uuid,
    p_action    text,
    p_user      uuid DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := COALESCE(p_user, session_user_id());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF user_is_admin(v_user_id) THEN
        RETURN TRUE;
    END IF;
    IF p_action = 'read' AND user_is_owner(p_object_id, v_user_id) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM object_permission_candidates(p_object_id) c
        JOIN user_roles ur ON ur.user_id = v_user_id
        WHERE EXISTS (
            SELECT 1
            FROM permissions p
            JOIN groups g ON g.id = p.group_id
            WHERE p.role_id = ur.role_id
              AND p.action = p_action
              AND p.group_id = c
        )
        OR EXISTS (
            SELECT 1
            FROM role_object_grants g
            WHERE g.role_id = ur.role_id
              AND g.object_id = c
              AND g.action = p_action
        )
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION has_permission(
    p_object_id UUID,
    p_action    TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM object_permission_candidates(p_object_id) c
        JOIN user_roles ur ON ur.user_id = v_user_id
        WHERE EXISTS (
            SELECT 1
            FROM permissions p
            JOIN groups g ON g.id = p.group_id
            WHERE p.role_id = ur.role_id
              AND p.action = p_action
              AND p.group_id = c
        )
        OR EXISTS (
            SELECT 1
            FROM role_object_grants g
            WHERE g.role_id = ur.role_id
              AND g.object_id = c
              AND g.action = p_action
        )
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION user_has_permission(
    p_object_id UUID,
    p_action    TEXT,
    p_user      UUID
) RETURNS BOOLEAN AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1
        FROM object_permission_candidates(p_object_id) c
        JOIN user_roles ur ON ur.user_id = p_user
        WHERE EXISTS (
            SELECT 1
            FROM permissions p
            JOIN groups g ON g.id = p.group_id
            WHERE p.role_id = ur.role_id
              AND p.action = p_action
              AND p.group_id = c
        )
        OR EXISTS (
            SELECT 1
            FROM role_object_grants g
            WHERE g.role_id = ur.role_id
              AND g.object_id = c
              AND g.action = p_action
        )
    );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION user_is_owner(p_object_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT p_user IS NOT NULL
       AND EXISTS (SELECT 1 FROM objects o WHERE o.id = p_object_id AND o.owner_id = p_user)
       -- Владелец не должен «просачиваться» через системные корневые группы;
       -- bootstrap сохраняется только пока в объект явно ничего не включено.
       AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.object_id = p_object_id)
$$;

-- =============================================================================
-- 3. RLS инцидентов: общий супертип + предки, вместо одной admin-only политики.
-- =============================================================================
ALTER TABLE recording_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_incidents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incidents_admin_all ON recording_incidents;
DROP POLICY IF EXISTS incidents_admin_read ON recording_incidents;
DROP POLICY IF EXISTS incidents_read ON recording_incidents;
DROP POLICY IF EXISTS incidents_write ON recording_incidents;
DROP POLICY IF EXISTS incidents_delete ON recording_incidents;
DROP POLICY IF EXISTS incidents_insert ON recording_incidents;

CREATE POLICY incidents_admin_read ON recording_incidents
    FOR SELECT USING (is_admin());
CREATE POLICY incidents_read ON recording_incidents
    FOR SELECT USING (
        has_permission(object_id, 'read')
        OR is_owner(object_id)
    );
CREATE POLICY incidents_write ON recording_incidents
    FOR UPDATE USING (is_admin() OR has_permission(object_id, 'write'))
                 WITH CHECK (is_admin() OR has_permission(object_id, 'write'));
CREATE POLICY incidents_delete ON recording_incidents
    FOR DELETE USING (is_admin() OR has_permission(object_id, 'delete'));
CREATE POLICY incidents_insert ON recording_incidents
    FOR INSERT WITH CHECK (is_admin() OR has_permission(object_id, 'write'));
