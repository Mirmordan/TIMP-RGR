-- Приложение подключается НЕ под суперюзером (POSTGRES_USER из compose создаётся
-- как SUPERUSER, а суперюзеры обходят RLS безусловно). Поэтому заводят отдельного
-- роля LOGIN без SUPERUSER/BYPASSRLS — только тогда RLS-политики реально фильтруют.
-- Права на таблицы выдаёт 11-grants.sql.

\set ON_ERROR_STOP on

-- Пароль из переменной не подтянуть в чистый SQL, поэтому задаём явно.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timprgr_app') THEN
        CREATE ROLE timprgr_app LOGIN PASSWORD 'timprgr_app_password' NOSUPERUSER NOBYPASSRLS;
    END IF;
END
$$;
