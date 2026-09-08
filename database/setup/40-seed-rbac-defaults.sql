-- ============================================================
-- 40-seed-rbac-defaults.sql — аддитивные дефолты RBAC-ролей.
--
-- Файл НЕ генерируется database/rebuild-setup.sh (в отличие от
-- 02/03/11/20/21/30/31): это ручной оверхей поверх сидов, поэтому
-- переживает пересборку setup и применяется entrypoint'ом при
-- создании НОВОГО кластера (сортировка: 40 идёт после 21/30/31).
--
-- Для уже существующих БД файл можно накатывать повторно без
-- последствий: INSERT ... ON CONFLICT DO NOTHING по натуральным
-- уникальным ключам (permissions: role+group+action,
-- role_capabilities: role+capability). Ничего не удаляет —
-- только доводит роли operator/viewer до целевых дефолтов:
--   operator — read на системной группе all (видимость всех
--   объектов записи) + create-капабилити процессов/стримов/чанков;
--   viewer   — read на all + media:export.
--
-- Проверка идемпотентности: повторный psql не меняет число строк.
-- ============================================================

-- 1) Видимость: read на системной группе all (группа присутствует
--    в object_permission_candidates() для любого объекта — см.
--    20-security-functions.sql, поэтому read на all = read на всё).
INSERT INTO public.permissions (id, role_id, group_id, action)
SELECT '2b6058a6-b737-466e-be56-dd8f155876cc', id, 'aaaaaaaa-0000-0000-0000-000000000001', 'read'
FROM public.roles WHERE name = 'operator'
ON CONFLICT ON CONSTRAINT permissions_role_id_group_id_action_key DO NOTHING;

INSERT INTO public.permissions (id, role_id, group_id, action)
SELECT 'd7768f7f-f99b-4a8a-a0ef-853324597a86', id, 'aaaaaaaa-0000-0000-0000-000000000001', 'read'
FROM public.roles WHERE name = 'viewer'
ON CONFLICT ON CONSTRAINT permissions_role_id_group_id_action_key DO NOTHING;

-- 2) Спец-права ролей (system capabilities).
INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'camera:create' FROM public.roles WHERE name = 'operator'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'chunk:create' FROM public.roles WHERE name = 'operator'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'process:create' FROM public.roles WHERE name = 'operator'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'stream:create' FROM public.roles WHERE name = 'operator'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'media:export' FROM public.roles WHERE name = 'viewer'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

-- 3) Дашборд: просмотр рабочей сводки доступен всем ролям.
INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'dashboard:read' FROM public.roles WHERE name = 'admin'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'dashboard:read' FROM public.roles WHERE name = 'operator'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT id, 'dashboard:read' FROM public.roles WHERE name = 'viewer'
ON CONFLICT ON CONSTRAINT role_capabilities_role_id_capability_key DO NOTHING;
