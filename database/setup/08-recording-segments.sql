-- Отрезки записи: абстракция над чанками на диске.
-- Каждый сегмент = непрерывный блок записанного видео в одной директории.
CREATE TABLE recording_segments (
    object_id    UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
    process_id   UUID NOT NULL REFERENCES recording_processes(object_id) ON DELETE CASCADE,
    stream_id    UUID NOT NULL REFERENCES recording_streams(object_id) ON DELETE CASCADE,
    path         TEXT NOT NULL,                     -- относительный путь в recordRoot (process_xxx)
    started_at   TIMESTAMPTZ NOT NULL,
    ended_at     TIMESTAMPTZ NOT NULL,
    file_count   INT NOT NULL DEFAULT 0,
    duration_s   REAL NOT NULL DEFAULT 0,           -- длительность в секундах
    size_bytes   BIGINT NOT NULL DEFAULT 0,         -- суммарный размер .ts файлов
    CHECK (ended_at >= started_at),
    CHECK (duration_s >= 0)
);

-- Индексы для быстрого поиска по периоду.
CREATE INDEX idx_segments_time ON recording_segments (started_at, ended_at);
CREATE INDEX idx_segments_stream ON recording_segments (stream_id);
CREATE INDEX idx_segments_process ON recording_segments (process_id);

-- RLS
ALTER TABLE recording_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_segments FORCE ROW LEVEL SECURITY;

CREATE POLICY segments_admin_all ON recording_segments
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY segments_read ON recording_segments
    FOR SELECT USING (has_permission(object_id, 'read'));

CREATE POLICY segments_write ON recording_segments
    FOR UPDATE USING (has_permission(object_id, 'write'))
    WITH CHECK (has_permission(object_id, 'write'));

CREATE POLICY segments_delete ON recording_segments
    FOR DELETE USING (has_permission(object_id, 'delete'));
