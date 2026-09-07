-- Инциденты: перевод title/description полностью в объект (objects.name/description).
--
-- 1. Бэкфилл общих метаданных объектов инцидентов из legacy-столбцов.
-- 2. Гарантируем objects-строку для каждого инцидента (id = object_id).
-- 3. FK recording_incidents.object_id -> objects(id) ON DELETE CASCADE.
-- 4. Удаление «настоящих» orphan-объектов инцидентов (тип incident без строки).
-- 5. DROP legacy-столбцов title/description (данные уже в objects).
-- Скрипт идемпотентен: повторный прогон после DROP столбцов безопасен
-- (бэкфилл из legacy-столбцов выполняется только пока они существуют).

-- =====================================================================
-- 1. Объект инцидента: тип/имя/описание/родитель из recording_incidents.
--    Выполняется ТОЛЬКО пока существуют legacy-столбцы title/description.
-- =====================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'recording_incidents' AND column_name = 'title'
    ) THEN
        UPDATE objects o
        SET type        = 'incident',
            name        = COALESCE(NULLIF(o.name, ''), NULLIF(i.title, ''), o.name),
            description = COALESCE(NULLIF(o.description, ''), i.description, o.description),
            parent_id   = COALESCE(o.parent_id, i.process_id)
        FROM recording_incidents i
        WHERE i.object_id = o.id
          AND (o.type IS DISTINCT FROM 'incident'
               OR NULLIF(o.name, '') IS NULL
               OR o.parent_id IS DISTINCT FROM i.process_id);

        -- Инцидент без объекта: создаём (id совпадает с object_id, имя из title).
        INSERT INTO objects (id, type, name, description, parent_id)
        SELECT i.object_id, 'incident', i.title, i.description, i.process_id
        FROM recording_incidents i
        WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.id = i.object_id);
    END IF;
END
$$;

-- =====================================================================
-- 2. FK: составная связь объект → инцидент (удаление объекта каскадит строку).
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recording_incidents_object_id_fkey'
          AND conrelid = 'recording_incidents'::regclass
    ) THEN
        ALTER TABLE recording_incidents
            ADD CONSTRAINT recording_incidents_object_id_fkey
            FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- =====================================================================
-- 3. Очистка «настоящих» orphan-объектов инцидентов (тип incident без строки).
--    Удаляем только не привязанные ни к чему и не являющиеся родителями.
-- =====================================================================
DO $$
DECLARE v_deleted integer := 1;
BEGIN
    WHILE v_deleted > 0 LOOP
        DELETE FROM objects o
        WHERE o.type = 'incident'
          AND NOT EXISTS (SELECT 1 FROM recording_incidents i WHERE i.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM role_object_grants g WHERE g.object_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM objects c WHERE c.parent_id = o.id);
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    END LOOP;
END;
$$;

-- =====================================================================
-- 4. DROP legacy-столбцов title/description (metadata теперь только в objects).
--    Выполняется ПОСЛЕ обновления кода: сервисы больше не читают эти столбцы.
-- =====================================================================
ALTER TABLE recording_incidents DROP COLUMN IF EXISTS title;
ALTER TABLE recording_incidents DROP COLUMN IF EXISTS description;
