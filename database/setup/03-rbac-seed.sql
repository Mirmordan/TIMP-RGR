-- RBAC-факты = состояние живой БД (реальные UUID и хэши), плюс демо-личности.
-- u8: строки users/roles/user_roles/groups/group_members/permissions повторяют
-- pg_dump рабочей базы. Роли probe_u1/probe_u2 и их группы — тестовый мусор,
-- в чистую инициализацию не переносятся. group_members в живой БД пуст (0 строк).

-- === Роли ===
INSERT INTO roles (id, name, created_at) VALUES
    ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'admin',    '2026-08-31 10:58:38.815788+00'),
    ('014641df-a049-4948-9c40-6179a9837b36', 'operator', '2026-08-31 10:58:38.815788+00'),
    ('9f901d9a-43a6-4262-a27b-858645d68081', 'viewer',   '2026-08-31 10:58:38.815788+00');

-- Демо-роль "охрана" (не системная)
INSERT INTO roles (id, name, created_at) VALUES
    ('55555555-0000-0000-0000-000000000001', 'guard', now())
ON CONFLICT (name) DO NOTHING;

-- === Пользователи (живая БД) ===
INSERT INTO users (id, username, email, password_hash, created_at) VALUES
    ('11111111-1111-1111-1111-111111111111', 'alice',     'alice@example.com',     '$2b$10$ECZjN/UDs5.pyh0xVAe0geWPu055ImRS1/g.A2y7hpBKaCrAS9SIK', '2026-08-31 10:58:38.824324+00'),
    ('22222222-2222-2222-2222-222222222222', 'bob',       'bob@example.com',       '$2b$10$hyhYsZVtqSrlis.dphPi8eL9DbIUSa40YfTRmdlruNU1ZpVhF.GuC', '2026-08-31 10:58:38.824324+00'),
    ('624e3d8c-e0ea-4388-9a69-587efb07f309', 'carol',     'carol@example.com',     '$2b$10$R6G..7FVkSANBh8KZmNvz.i.ItH5FW1y9kHKLzOW11Y031jrFkgWW', '2026-08-31 10:59:56.487864+00'),
    ('1a384f22-6fcb-463d-914b-ec3afd3e0873', 'testuser',  'test@test.com',         '$2b$10$YVQT/lc57raIuBtf9VL2veNQynCEx0kSs93/nLoiS7Vjv4JS7MGOK', '2026-09-01 10:57:20.27161+00'),
    ('186bbf8c-6417-4362-aa0d-24e8cc1700b0', 'demo',      'demo@test.com',         '$2b$10$X6coMeWgiw0gnt2i48.4SejSqXST/wAcNA3w6CRdvJg6fvDrtjKbS', '2026-09-01 10:59:54.757362+00'),
    ('d9d8d02a-3f9a-4267-91e0-df21237d7323', 'flow_test', 'flow@test.com',         '$2b$10$tJWYpbT4Lu3EXB/1oG5yaOc7dier9quHdHCka5PG.zXPQxKCG2Lge', '2026-09-01 11:04:47.584121+00'),
    ('11ff2264-a48a-4eaf-8644-f3cfc0a9165c', 'asd',       'asd@mail.ru',           '$2b$10$5CIdjf1bam8slUBwWVzv9.RLc2/EgDHNMg8C8WSVUAA4dt2N7Kajm', '2026-09-04 14:56:31.206917+00');

-- Демо-личности: valera (вторая админ-учётка, пароль 6969), vasily (охрана, guard).
INSERT INTO users (id, username, email, password_hash) VALUES
    ('33333333-0000-0000-0000-000000000001', 'valera', 'valera@example.com', '$2b$10$ECZjN/UDs5.pyh0xVAe0geWPu055ImRS1/g.A2y7hpBKaCrAS9SIK'),
    ('44444444-0000-0000-0000-000000000001', 'vasily', 'vasily@example.com', '$2b$10$hyhYsZVtqSrlis.dphPi8eL9DbIUSa40YfTRmdlruNU1ZpVhF.GuC')
ON CONFLICT (username) DO NOTHING;

-- === Выдача ролей (user_roles) ===
INSERT INTO user_roles (user_id, role_id) VALUES
    ('11111111-1111-1111-1111-111111111111', 'f4fdd515-c8f1-4965-8a67-b883fbee6022'),  -- alice  → admin
    ('22222222-2222-2222-2222-222222222222', '014641df-a049-4948-9c40-6179a9837b36'),  -- bob    → operator
    ('11ff2264-a48a-4eaf-8644-f3cfc0a9165c', '9f901d9a-43a6-4262-a27b-858645d68081'),  -- asd    → viewer
    ('33333333-0000-0000-0000-000000000001', 'f4fdd515-c8f1-4965-8a67-b883fbee6022'),  -- valera → admin
    ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001')   -- vasily → guard
ON CONFLICT DO NOTHING;

-- === Группы объектов ===
INSERT INTO groups (id, name) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'all'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'ground-floor'),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'archive');

-- group_members: в живой БД пусто — ничего не вставляем (объекты из 09 не закреплены за группами).

-- === Права (role × group × action) ===
INSERT INTO permissions (id, role_id, group_id, action) VALUES
    -- admin × all (живая БД)
    ('9963ba3b-0861-40aa-9cc6-1ef16d70c666', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'read'),
    ('4e162f77-0986-488f-bb51-5c67f6148bd8', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'write'),
    ('9e815a63-8b3d-40dc-ab58-0297ec500f13', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'delete'),
    ('00cb25f7-27ed-4881-82f0-a715de9faf07', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'stream'),
    ('15cd7f5c-5c79-49e4-b53d-8686dbe90f2a', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'list'),
    -- operator × ground-floor (живая БД)
    ('dfd6752f-2514-4d5f-8f75-7ec3ad8cf844', '014641df-a049-4948-9c40-6179a9837b36', 'aaaaaaaa-0000-0000-0000-000000000002', 'read'),
    ('62afd62b-0161-4f57-9874-889ae9c72081', '014641df-a049-4948-9c40-6179a9837b36', 'aaaaaaaa-0000-0000-0000-000000000002', 'stream'),
    -- guard × ground-floor (демо): read + list
    ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'read'),
    ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'list')
ON CONFLICT DO NOTHING;
