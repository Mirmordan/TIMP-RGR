-- Собственные имена объектов вместо наследования по parent-цепочке.
--
-- Логика как у инцидентов: название и описание каждой сущности живут в её
-- собственном objects.name/description. Резолв по цепочке предков
-- (objects_effective_name/objects_effective_description) упразднён.
--
-- Бэкфилл только пустых имён (NULL/''), повторный прогон безопасен:
--   stream   ← recording_streams.url (в текущей БД имена == url, no-op);
--   process  ← url родительского потока;
--   segment  ← имя процесса (фолбэк — url потока) — техническая копия,
--              чтобы отображение не просело после отключения наследования;
--   chunk    ← имя процесса (фолбэк — url потока).
--
-- После бэкфилла для device/stream/process вводится CHECK — название таких
-- объектов не может быть пустым. Скрипт идемпотентен.

-- 1. Потоки: имя источника.
UPDATE objects o
SET name = s.url
FROM recording_streams s
WHERE s.object_id = o.id
  AND NULLIF(o.name, '') IS NULL;

-- 2. Процессы: url родительского потока.
UPDATE objects o
SET name = s.url
FROM recording_processes p
JOIN recording_streams s ON s.object_id = p.stream_id
WHERE p.object_id = o.id
  AND NULLIF(o.name, '') IS NULL;

-- 3. Сегменты: имя процесса (фолбэк — url потока).
UPDATE objects o
SET name = COALESCE(
        NULLIF(p.name, ''),
        (SELECT s.url
           FROM recording_streams s
          JOIN recording_processes sp ON sp.object_id = sg.process_id
          WHERE s.object_id = sp.stream_id)
    )
FROM recording_segments sg
JOIN objects p ON p.id = sg.process_id
WHERE sg.object_id = o.id
  AND NULLIF(o.name, '') IS NULL;

-- 4. Чанки: имя процесса (фолбэк — url потока).
UPDATE objects o
SET name = COALESCE(
        NULLIF(p.name, ''),
        (SELECT s.url
           FROM recording_streams s
          JOIN recording_processes sp ON sp.object_id = c.process_id
          WHERE s.object_id = sp.stream_id)
    )
FROM recording_chunks c
JOIN objects p ON p.id = c.process_id
WHERE c.object_id = o.id
  AND NULLIF(o.name, '') IS NULL;

-- 5. Название обязательно для user-facing сущностей (device/stream/process;
--    инциденты создаются только через сервис, в текущей БД пустых имён нет).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'objects_user_entity_name_required'
    ) THEN
        ALTER TABLE objects
            ADD CONSTRAINT objects_user_entity_name_required
            CHECK (
                type NOT IN ('device', 'stream', 'process')
                OR NULLIF(name, '') IS NOT NULL
            );
    END IF;
END
$$;

-- 6. Display-функции (admin-панель) — собственный objects.name, без цепочки.
--    session_user_id/user_is_admin/user_is_owner/user_has_permission НЕ
--    удаляем: они используются object_can (20-object-access-inheritance.sql).
CREATE OR REPLACE FUNCTION objects_admin_display_name(p_object_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(o.name, '') FROM objects o WHERE o.id = p_object_id;
$$;

CREATE OR REPLACE FUNCTION objects_display_name(p_object_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT objects_admin_display_name(p_object_id);
$$;

-- 7. Цепочка резолва имён/описаний больше не нужна.
DROP FUNCTION IF EXISTS objects_effective_name(uuid, uuid);
DROP FUNCTION IF EXISTS objects_effective_description(uuid, uuid);
DROP FUNCTION IF EXISTS objects_readable_by(uuid, uuid);
