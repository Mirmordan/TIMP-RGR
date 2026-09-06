-- Системная группа all: implicit member of every object.
-- Права роли на системную группу действуют на ВСЕ объекты (текущие и будущие),
-- без хранения строк group_members.
-- Скрипт идемпотентен: повторный прогон безопасен.

-- 1. Добавляем флаг is_system в таблицу groups.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- 2. Группа «all» с фиксированным UUID (= системная).
--    Если она уже существует — делаем её системной; если нет — создаём.
UPDATE groups SET is_system = true WHERE name = 'all';
INSERT INTO groups (id, name, is_system)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', 'all', true
WHERE NOT EXISTS (SELECT 1 FROM groups WHERE name = 'all');

-- 3. Индекс на is_system для быстрого поиска системных групп.
CREATE INDEX IF NOT EXISTS idx_groups_is_system ON groups (is_system) WHERE is_system = true;

-- 4. RLS-функция has_permission: добавляем системную группу.
--    Если роль юзера имеет право на системную группу — это право действует
--    на ЛЮБОЙ объект (без group_members).
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
    )
    OR EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN permissions p  ON p.role_id = ur.role_id AND p.action = p_action
        JOIN groups g ON g.id = p.group_id
        WHERE ur.user_id = v_user_id AND g.is_system
    );
END;
$$ LANGUAGE plpgsql STABLE;