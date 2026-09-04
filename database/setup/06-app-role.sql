-- Приложение подключается НЕ под суперюзером (POSTGRES_USER из compose создаётся
-- как SUPERUSER, а суперюзеры обходят RLS безусловно). Поэтому заводят отдельного
-- роля LOGIN без SUPERUSER/BYPASSRLS — только тогда RLS-политики реально фильтруют.
-- Миграции (01-05) выполняются суперюзером timprgr, а бэкенд ходит как timprgr_app.

-- Пароль из переменной не подтянуть в чистый SQL, поэтому задаём явно.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timprgr_app') THEN
        CREATE ROLE timprgr_app LOGIN PASSWORD 'timprgr_app_password' NOSUPERUSER NOBYPASSRLS;
    END IF;
END
$$;

-- Доступ к схеме
GRANT USAGE ON SCHEMA public TO timprgr_app;

-- Таблицы учёта/данных: полный CRUD (RLS фильтрует объектные таблицы).
GRANT SELECT, INSERT, UPDATE, DELETE ON
    objects,
    recording_devices,
    recording_streams,
    recording_processes,
    recording_chunks,
    users,
    roles,
    user_roles,
    groups,
    group_members,
    permissions
TO timprgr_app;

-- gen_random_uuid() встроен в pg16 (pgcrypto не нужен) — прав не требует.
