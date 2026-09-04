-- Помощники для политик RLS. Перед запросами сервер делает SET LOCAL app.user_id = '<uuid>'.

-- Есть ли у текущего юзера право p_action на объект
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
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Админ — отдельная проверка, чтобы не плодить записи rights
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = v_user_id AND r.name = 'admin'
    );
END;
$$ LANGUAGE plpgsql STABLE;
