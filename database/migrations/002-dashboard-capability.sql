-- ============================================================
-- 002-dashboard-capability.sql — capability `dashboard:read`.
--
-- Для уже живущих БД (где 02-schema-core.sql из setup уже применён):
--   1) расширяет CHECK role_capabilities_capability_check новым кодом;
--   2) идемпотентно выдаёт dashboard:read ролям admin/operator/viewer.
--
-- Идемпотентность: повторный прогон не меняет состояние
-- (DROP IF EXISTS + ADD CONSTRAINT + INSERT ON CONFLICT DO NOTHING).
-- ============================================================

ALTER TABLE public.role_capabilities DROP CONSTRAINT IF EXISTS role_capabilities_capability_check;

ALTER TABLE public.role_capabilities ADD CONSTRAINT role_capabilities_capability_check CHECK (
    capability = ANY (ARRAY[
        'admin:read'::text,
        'admin:write'::text,
        'audit:delete'::text,
        'audit:read'::text,
        'camera:create'::text,
        'chunk:create'::text,
        'dashboard:read'::text,
        'group:create'::text,
        'group:delete'::text,
        'group:read'::text,
        'group:update'::text,
        'media:export'::text,
        'permission:manage'::text,
        'permission:read'::text,
        'process:create'::text,
        'role:create'::text,
        'role:delete'::text,
        'role:read'::text,
        'role:update'::text,
        'stream:create'::text,
        'user:create'::text,
        'user:delete'::text,
        'user:password:reset'::text,
        'user:read'::text,
        'user:update'::text
    ])
);

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'dashboard:read' FROM public.roles WHERE name = 'admin'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'dashboard:read' FROM public.roles WHERE name = 'operator'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'dashboard:read' FROM public.roles WHERE name = 'viewer'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;
