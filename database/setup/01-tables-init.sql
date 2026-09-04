-- Таблицы предметной области, выполняются при первом старте контейнера.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Пользователи
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Супертип: все сущности (устройства, потоки, процессы, кусочки) ссылаются на него.
-- Это их ID и точка для RLS-политик.
CREATE TABLE objects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Устройства записи
CREATE TABLE recording_devices (
    object_id  UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL
);

-- Потоки записи
CREATE TABLE recording_streams (
    object_id  UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    device_id  UUID REFERENCES recording_devices(object_id) ON DELETE SET NULL
);

-- Процессы записи
CREATE TABLE recording_processes (
    object_id  UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
    stream_id  UUID NOT NULL REFERENCES recording_streams(object_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at   TIMESTAMPTZ,
    status     TEXT NOT NULL CHECK (status IN ('running', 'stopped', 'failed'))
);

-- Кусочки записи
CREATE TABLE recording_chunks (
    object_id  UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
    process_id UUID NOT NULL REFERENCES recording_processes(object_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at   TIMESTAMPTZ NOT NULL,
    url        TEXT NOT NULL,
    CHECK (ended_at >= started_at)
);
