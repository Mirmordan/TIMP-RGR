-- Инциденты записи (u9): DDL-слепок живой БД.
-- Выполняется после 08-recording-segments.sql (FK на recording_segments).
-- Отличие от супертип-таблиц 01: object_id НЕ ссылается на objects(id) — это
-- собственный UUID инцидента (DEFAULT gen_random_uuid()), строку в objects()
-- создаёт приложение отдельно. RLS включена, но НЕ FORCE (как в живой БД);
-- политика одна — только админ (is_admin).

CREATE TABLE IF NOT EXISTS recording_incidents (
    object_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id    UUID NOT NULL REFERENCES recording_processes(object_id) ON DELETE CASCADE,
    segment_id    UUID REFERENCES recording_segments(object_id) ON DELETE SET NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    time_offset_s REAL NOT NULL DEFAULT 0,
    severity      TEXT NOT NULL DEFAULT 'info'::text
                  CHECK (severity IN ('info', 'warning', 'critical')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID REFERENCES users(id)
);

-- Индексы для выборки инцидентов по процессу и по позиции в записи.
CREATE INDEX IF NOT EXISTS idx_incidents_process ON recording_incidents (process_id);
CREATE INDEX IF NOT EXISTS idx_incidents_time    ON recording_incidents (process_id, time_offset_s);

-- RLS: включена, но без FORCE — как в живой БД. Обычные (не-админ) запросы
-- через приложение фильтруются политикой, владелец таблицы обходит её.
ALTER TABLE recording_incidents ENABLE ROW LEVEL SECURITY;

-- Единственная политика живой БД: только админ (is_admin) видит/меняет инциденты.
DROP POLICY IF EXISTS incidents_admin_all ON recording_incidents;
CREATE POLICY incidents_admin_all ON recording_incidents
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Права приложения (как в 08 и в живой БД): полный ALL, RLS фильтрует строки.
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON recording_incidents TO timprgr_app;
