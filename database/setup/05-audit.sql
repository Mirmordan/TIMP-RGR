-- Аудит-лог RBAC и security-событий (U1). RLS не вешается: доступ только
-- через /admin под admin-capability. Применяется идемпотентно.
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id    UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_name  TEXT,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    details     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_log (action);
