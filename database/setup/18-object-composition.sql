-- Объектная композиция: единая иерархия через objects.parent_id.
--
-- Родитель сущности всегда указывается ссылкой на objects.id:
--   device ← stream ← process ← segment/chunk/incident.
-- Всё наименование (name/description/raw/inherited) резолвится по этой цепочке,
-- доступ — на объект (RLS-функции has_permission/is_admin/owner_read).
-- Скрипт идемпотентен: повторный прогон безопасен.

-- =====================================================================
-- 1. Валидация/бэкфилл иерархии по доменным строкам.
--    Устройства — корни иерархии (parent_id = NULL).
-- =====================================================================
UPDATE objects o
SET type = 'device', parent_id = NULL
FROM recording_devices d
WHERE d.object_id = o.id
  AND (o.type IS DISTINCT FROM 'device' OR o.parent_id IS NOT NULL);

-- Поток: родитель = объект устройства (recording_streams.device_id = objects.id устройства).
UPDATE objects o
SET type = 'stream', parent_id = s.device_id
FROM recording_streams s
WHERE s.object_id = o.id
  AND (o.type IS DISTINCT FROM 'stream' OR o.parent_id IS DISTINCT FROM s.device_id);

-- Процесс: родитель = объект потока.
UPDATE objects o
SET type = 'process', parent_id = p.stream_id
FROM recording_processes p
WHERE p.object_id = o.id
  AND (o.type IS DISTINCT FROM 'process' OR o.parent_id IS DISTINCT FROM p.stream_id);

-- Чанк: родитель = объект процесса.
UPDATE objects o
SET type = 'chunk', parent_id = c.process_id
FROM recording_chunks c
WHERE c.object_id = o.id
  AND (o.type IS DISTINCT FROM 'chunk' OR o.parent_id IS DISTINCT FROM c.process_id);

-- Сегмент: родитель = объект процесса.
UPDATE objects o
SET type = 'segment', parent_id = sg.process_id
FROM recording_segments sg
WHERE sg.object_id = o.id
  AND (o.type IS DISTINCT FROM 'segment' OR o.parent_id IS DISTINCT FROM sg.process_id);

-- Инцидент: родитель = объект процесса.
UPDATE objects o
SET type = 'incident', parent_id = i.process_id
FROM recording_incidents i
WHERE i.object_id = o.id
  AND (o.type IS DISTINCT FROM 'incident' OR o.parent_id IS DISTINCT FROM i.process_id);

-- =====================================================================
-- 2. Очистка осиротевших objects-строк.
--    Удаляем ТОЛЬКО строки, не привязанные ни к одной доменной таблице,
--    не состоящие в group_members / role_object_grants и не являющиеся
--    родителем других объектов. Идемпотентно (листья итеративно).
-- =====================================================================
DO $$
DECLARE v_deleted integer := 1;
BEGIN
    WHILE v_deleted > 0 LOOP
        DELETE FROM objects o
        WHERE NOT EXISTS (SELECT 1 FROM recording_devices d WHERE d.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM recording_streams st WHERE st.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM recording_processes p WHERE p.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM recording_chunks c WHERE c.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM recording_segments sg WHERE sg.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM recording_incidents i WHERE i.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM role_object_grants g WHERE g.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM objects c WHERE c.parent_id = o.id);
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    END LOOP;
END;
$$;

-- =====================================================================
-- 3. Вспомогательные функции видимости объекта для произвольного юзера.
--    objects без RLS, поэтому проверка доступа к «родителю» повторяет RLS:
--    is_admin / has_permission (группы + прямые grants + системная группа all)
--    / owner-read (владелец, пока объект не передан ни в одну группу).
-- =====================================================================

-- Текущий юзер (app.user_id из контекста запроса; NULL — системный/неавторизованный).
CREATE OR REPLACE FUNCTION session_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Админ ли юзер (роль 'admin').
CREATE OR REPLACE FUNCTION user_is_admin(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user AND r.name = 'admin'
    );
$$;

-- Прямое/групповое право на объект для конкретного юзера (как has_permission,
-- но с явным p_user вместо current_setting('app.user_id')).
CREATE OR REPLACE FUNCTION user_has_permission(p_object_id uuid, p_action text, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT p_user IS NOT NULL AND (
        EXISTS (
            SELECT 1
            FROM user_roles ur
            JOIN permissions p  ON p.role_id = ur.role_id AND p.action = p_action
            JOIN group_members gm ON gm.group_id = p.group_id
            WHERE ur.user_id = p_user
              AND gm.object_id = p_object_id
        )
        OR EXISTS (
            SELECT 1
            FROM user_roles ur
            JOIN role_object_grants g ON g.role_id = ur.role_id AND g.action = p_action
            WHERE ur.user_id = p_user
              AND g.object_id = p_object_id
        )
        OR EXISTS (
            SELECT 1
            FROM user_roles ur
            JOIN permissions p  ON p.role_id = ur.role_id AND p.action = p_action
            JOIN groups g ON g.id = p.group_id
            WHERE ur.user_id = p_user AND g.is_system
        )
    );
$$;

-- Владелец-«bootstrap»: читает свой объект, пока тот не включён в группу.
CREATE OR REPLACE FUNCTION user_is_owner(p_object_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT p_user IS NOT NULL
       AND EXISTS (SELECT 1 FROM objects o WHERE o.id = p_object_id AND o.owner_id = p_user)
       AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.object_id = p_object_id);
$$;

-- Может ли юзер читать объект (admin | групповое право read | owner bootstrap).
-- p_user = NULL → fallback на сессионного юзера (app.user_id).
CREATE OR REPLACE FUNCTION objects_readable_by(p_object_id uuid, p_user uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT CASE WHEN p_user IS NULL THEN session_user_id() ELSE p_user END IS NOT NULL
       AND (
        user_is_admin(COALESCE(p_user, session_user_id()))
        OR user_has_permission(p_object_id, 'read', COALESCE(p_user, session_user_id()))
        OR user_is_owner(p_object_id, COALESCE(p_user, session_user_id()))
    );
$$;

-- =====================================================================
-- 4. Эффективные метаданные через цепочку objects.parent_id.
--    Собственный name/description, при пустоте — поднимаемся к родителю.
--    Fail-closed: нечитаемый родитель останавливает цепочку (NULL).
-- =====================================================================

-- Эффективное имя объекта для пользователя (own name → родитель → ...).
-- p_user = NULL → сессионный юзер (app.user_id).
CREATE OR REPLACE FUNCTION objects_effective_name(p_object_id uuid, p_user uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cur uuid := p_object_id;
    v_name text;
    v_parent uuid;
    v_hops int := 0;
BEGIN
    WHILE v_cur IS NOT NULL AND v_hops < 16 LOOP
        -- Нечитаемый предок — не показываем ни его имя, ни имена выше.
        IF NOT objects_readable_by(v_cur, p_user) THEN
            RETURN NULL;
        END IF;
        SELECT NULLIF(o.name, ''), o.parent_id
        INTO v_name, v_parent
        FROM objects o WHERE o.id = v_cur;
        IF NOT FOUND THEN
            RETURN NULL;
        END IF;
        IF v_name IS NOT NULL THEN
            RETURN v_name;
        END IF;
        v_cur := v_parent;
        v_hops := v_hops + 1;
    END LOOP;
    RETURN NULL;
END;
$$;

-- Эффективное описание объекта (own description → родитель → ...).
-- p_user = NULL → сессионный юзер (app.user_id).
CREATE OR REPLACE FUNCTION objects_effective_description(p_object_id uuid, p_user uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cur uuid := p_object_id;
    v_desc text;
    v_parent uuid;
    v_hops int := 0;
BEGIN
    WHILE v_cur IS NOT NULL AND v_hops < 16 LOOP
        IF NOT objects_readable_by(v_cur, p_user) THEN
            RETURN NULL;
        END IF;
        SELECT NULLIF(o.description, ''), o.parent_id
        INTO v_desc, v_parent
        FROM objects o WHERE o.id = v_cur;
        IF NOT FOUND THEN
            RETURN NULL;
        END IF;
        IF v_desc IS NOT NULL THEN
            RETURN v_desc;
        END IF;
        v_cur := v_parent;
        v_hops := v_hops + 1;
    END LOOP;
    RETURN NULL;
END;
$$;

-- =====================================================================
-- 5. Админ-панель: полная цепочка без проверки доступа (objects без RLS,
--    /admin управляет правами и обязан видеть все объекты).
-- =====================================================================
CREATE OR REPLACE FUNCTION objects_admin_display_name(p_object_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cur uuid := p_object_id;
    v_name text;
    v_hops int := 0;
BEGIN
    WHILE v_cur IS NOT NULL AND v_hops < 16 LOOP
        SELECT NULLIF(o.name, ''), o.parent_id
        INTO v_name, v_cur
        FROM objects o WHERE o.id = v_cur;
        IF NOT FOUND THEN
            RETURN NULL;
        END IF;
        IF v_name IS NOT NULL THEN
            RETURN v_name;
        END IF;
        v_hops := v_hops + 1;
    END LOOP;
    RETURN NULL;
END;
$$;

-- Тип ближайшего родителя (для отображения parentType в /admin).
CREATE OR REPLACE FUNCTION objects_admin_parent_type(p_object_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT o2.type
    FROM objects o1
    JOIN objects o2 ON o2.id = o1.parent_id
    WHERE o1.id = p_object_id;
$$;

-- Совместимость: прежний objects_display_name делегирует новой функции.
CREATE OR REPLACE FUNCTION objects_display_name(p_object_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT objects_admin_display_name(p_object_id);
$$;
