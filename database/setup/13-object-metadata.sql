-- Единая модель объектов: общие name/description/parent живут в супертипе objects.
-- Этап-фундамент: metadata наследуется доменными сущностями
-- (device → stream → process → segment/chunk/incident) через objects.parent_id.
-- Применим и к чистой базе (после 09-demo-facts), и к живой (psql -f).
-- Скрипт идемпотентен: повторный прогон безопасен (UPDATE идёт только по строкам
-- с ещё не проставленным типом, INSERT — только для отсутствующих супертипов).

-- 1. DDL: новые колонки супертипа objects.
ALTER TABLE objects ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT '';
ALTER TABLE objects ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS description TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'objects' AND column_name = 'parent_id'
    ) THEN
        ALTER TABLE objects ADD COLUMN parent_id UUID REFERENCES objects(id) ON DELETE SET NULL;
    ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objects_parent_id_fkey') THEN
        ALTER TABLE objects
            ADD CONSTRAINT objects_parent_id_fkey FOREIGN KEY (parent_id)
            REFERENCES objects(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- Индексы для иерархии (parent_id) и фильтра по типу (админ-UI).
CREATE INDEX IF NOT EXISTS idx_objects_parent ON objects (parent_id);
CREATE INDEX IF NOT EXISTS idx_objects_type ON objects (type);

-- 2. Backfill: переносим существующие метаданные из доменных таблиц в objects.

-- Устройства: type='device', name копируем из recording_devices.name (источник до переноса).
UPDATE objects o
SET type = 'device',
    name = COALESCE(NULLIF(o.name, ''), d.name)
FROM recording_devices d
WHERE d.object_id = o.id
  AND o.type <> 'device';

-- Потоки: type='stream', parent = устройство. Собственное name не задаём —
-- наследуется от устройства (effective name резолвится при чтении).
UPDATE objects o
SET type = 'stream',
    parent_id = s.device_id
FROM recording_streams s
WHERE s.object_id = o.id
  AND o.type <> 'stream';

-- Процессы: type='process', parent = поток.
UPDATE objects o
SET type = 'process',
    parent_id = p.stream_id
FROM recording_processes p
WHERE p.object_id = o.id
  AND o.type <> 'process';

-- Чанки: type='chunk', parent = процесс.
UPDATE objects o
SET type = 'chunk',
    parent_id = c.process_id
FROM recording_chunks c
WHERE c.object_id = o.id
  AND o.type <> 'chunk';

-- Сегменты: type='segment', parent = процесс.
UPDATE objects o
SET type = 'segment',
    parent_id = sg.process_id
FROM recording_segments sg
WHERE sg.object_id = o.id
  AND o.type <> 'segment';

-- Инциденты: type='incident', parent = процесс; title/description переносим в objects.
-- Столбцы в recording_incidents остаются для обратной совместимости API.
UPDATE objects o
SET type = 'incident',
    parent_id = i.process_id,
    name = COALESCE(NULLIF(o.name, ''), i.title),
    description = COALESCE(NULLIF(o.description, ''), i.description)
FROM recording_incidents i
WHERE i.object_id = o.id
  AND o.type <> 'incident';

-- Инциденты, у которых нет своей строки-супертипа (recording_incidents не имеет
-- FK на objects — строку создаёт приложение отдельно).
INSERT INTO objects (id, type, name, description, parent_id, created_at)
SELECT i.object_id, 'incident', i.title, i.description, i.process_id, i.created_at
FROM recording_incidents i
WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.id = i.object_id);
