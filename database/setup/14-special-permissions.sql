-- Глобальные спец-права (системные capability) вне object-ACL: роль × код.
-- Раньше набор был зашит в код (ROLE_CAPABILITIES) и не мог быть выдан
-- кастомным ролям. Теперь спец-права лежат в БД, редактируются через
-- /admin/roles/:id/capabilities и читаются при live-enforcement (hasCapability).
-- Скрипт идемпотентен: повторный прогон безопасен (CREATE ... IF NOT EXISTS,
-- сид идёт через ON CONFLICT DO NOTHING).

-- 1. DDL. CHECK повторяет набор кодов, реально используемых в requireCapability:
--    admin:read/admin:write — панель /admin + /stats/disk + создание доменных
--    объектов; user:* — CRUD /users.
CREATE TABLE IF NOT EXISTS role_capabilities (
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    capability TEXT NOT NULL CHECK (capability IN (
        'admin:read',
        'admin:write',
        'user:create',
        'user:read',
        'user:update',
        'user:delete'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (role_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_role_capabilities_role ON role_capabilities (role_id);

-- Если таблица была создана прежней версией скрипта без CHECK — добавляем его.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'role_capabilities'::regclass
          AND conname = 'role_capabilities_capability_check'
    ) THEN
        ALTER TABLE role_capabilities
            ADD CONSTRAINT role_capabilities_capability_check
            CHECK (capability IN (
                'admin:read',
                'admin:write',
                'user:create',
                'user:read',
                'user:update',
                'user:delete'
            ));
    END IF;
END
$$;

-- 2. Сид: семантика старого ROLE_CAPABILITIES — admin получает полный набор,
--    operator/viewer и кастомные роли — пустой (выдаётся только через API).
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, v.capability
FROM roles r
JOIN (VALUES
    ('admin:read'),
    ('admin:write'),
    ('user:create'),
    ('user:read'),
    ('user:update'),
    ('user:delete')
) AS v(capability) ON TRUE
WHERE r.name = 'admin'
ON CONFLICT (role_id, capability) DO NOTHING;

-- 3. Права приложения (бэкенд работает под timprgr_app, таблица без RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON role_capabilities TO timprgr_app;
