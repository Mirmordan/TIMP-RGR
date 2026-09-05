-- Согласование recording_segments с живой БД (u9): ended_at обязан быть
-- NULLABLE — открытый сегмент (live-запись) создаётся с ended_at = NULL
-- (segment.service createOpen, endedAt: null), а закрывается при остановке.
-- Файл 08 декларирует NOT NULL; здесь приводим к фактической структуре живой БД.
ALTER TABLE recording_segments ALTER COLUMN ended_at DROP NOT NULL;
