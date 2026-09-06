-- Прямые права роли на конкретный объект (role × object × action).
-- Дополняют групповую модель (permissions × group_members): позволяют выдать
-- доступ к отдельному объекту без создания/ведения групп. Учитываются:
--   * приложением — acl.can() (union с групповыми правами);
--   * RLS — функция has_permission() (переопределена ниже), которую вызывают
--     SELECT/UPDATE/DELETE-политики доменных таблиц.
-- Скрипт идемпотентен: повторный прогон безопасен.

-- 1. Таблица прямых выдач.
CREATE TABLE IF NOT EXISTS role_object_grants (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    object_id  UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    action     TEXT NOT NULL CHECK (action IN ('read', 'write', 'delete', 'stream', 'list')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (role_id, object_id, action)
);

-- 2. Индексы: поиск по роли (панель /admin/roles/:id/grants) и по объекту.
CREATE INDEX IF NOT EXISTS idx_role_object_grants_role ON role_object_grants (role_id);
CREATE INDEX IF NOT EXISTS idx_role_object_grants_object ON role_object_grants (object_id);

-- 3. Права приложения (идемпотентно, как в 15; роль timprgr_app создаётся в 06).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timprgr_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON role_object_grants TO timprgr_app';
    END IF;
END
$$;

-- 4. RLS-функция has_permission: добавляем прямые grants к групповой модели.
--    Теперь is_admin / групповое право / прямой grant на объект открывают строку.
--    CREATE OR REPLACE идемпотентен.
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
        FROM user_roles ur
        JOIN permissions p  ON p.role_id = ur.role_id AND p.action = p_action
        JOIN group_members gm ON gm.group_id = p.group_id
        WHERE ur.user_id = v_user_id
          AND gm.object_id = p_object_id
    )
    OR EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_object_grants g ON g.role_id = ur.role_id AND g.action = p_action
        WHERE ur.user_id = v_user_id
          AND g.object_id = p_object_id
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Хелпер для панели /admin: «эффективное имя» объекта по цепочке
--    objects.parent_id (device ← stream ← process ← segment/chunk/incident).
--    objects без RLS, поэтому читается напрямую из любой точки.
CREATE OR REPLACE FUNCTION objects_display_name(p_object_id UUID) RETURNS TEXT AS $$
DECLARE
    v_cur UUID := p_object_id;
    v_name TEXT;
    v_hops INT := 0;
BEGIN
    WHILE v_cur IS NOT NULL AND v_hops < 10 LOOP
        SELECT NULLIF(o.name, '') INTO v_name FROM objects o WHERE o.id = v_cur;
        IF v_name IS NOT NULL THEN
            RETURN v_name;
        END IF;
        SELECT o.parent_id INTO v_cur FROM objects o WHERE o.id = v_cur;
        v_hops := v_hops + 1;
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
