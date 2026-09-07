-- Единое имя объекта. Убираем дублирующее имя в доменной таблице устройств;
-- настоящим носителем метаданного остаётся только objects.name/description.
-- Скрипт идемпотентен.

UPDATE objects o
SET name = d.name
FROM recording_devices d
WHERE d.object_id = o.id
  AND NULLIF(o.name, '') IS NULL;

-- Финальная гарантия не-PK NULL при удалении NOT NULL-столбца.
UPDATE objects o
SET name = 'Device ' || left(o.id::text, 8)
WHERE o.type = 'device'
  AND NULLIF(o.name, '') IS NULL;

ALTER TABLE recording_devices DROP COLUMN IF EXISTS name;
