-- Демо-данные для изучения; фиксированные UUID нужны для связей.

-- Роли
INSERT INTO roles (name) VALUES
    ('admin'),
    ('operator'),
    ('viewer');

-- Тестовые пользователи (пароль у обоих: password)
INSERT INTO users (id, username, email, password_hash) VALUES
    ('11111111-1111-1111-1111-111111111111', 'alice', 'alice@example.com', '$2b$10$hyhYsZVtqSrlis.dphPi8eL9DbIUSa40YfTRmdlruNU1ZpVhF.GuC'),
    ('22222222-2222-2222-2222-222222222222', 'bob',   'bob@example.com',   '$2b$10$hyhYsZVtqSrlis.dphPi8eL9DbIUSa40YfTRmdlruNU1ZpVhF.GuC');

-- Группы объектов
INSERT INTO groups (id, name) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'all'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'ground-floor'),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'archive');

-- Супертип: создаём объекты, потом кладём подтипы
INSERT INTO objects (id) VALUES
    ('dddddddd-0000-0000-0000-000000000001'),
    ('dddddddd-0000-0000-0000-000000000002'),
    ('dddddddd-0000-0000-0000-000000000003');

-- Устройства записи (подтипы)
INSERT INTO recording_devices (object_id, name, type) VALUES
    ('dddddddd-0000-0000-0000-000000000001', 'Камера 1 этаж',      'camera'),
    ('dddddddd-0000-0000-0000-000000000002', 'Камера 2 этаж',      'camera'),
    ('dddddddd-0000-0000-0000-000000000003', 'Микрофон серверная', 'microphone');

-- Выдача ролей: alice — админ, bob — оператор
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE (u.username = 'alice' AND r.name = 'admin')
   OR (u.username = 'bob'   AND r.name = 'operator');

-- Кладём объекты в группы для проверки RLS
INSERT INTO group_members (group_id, object_id) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001');

-- admin: все действия над группой 'all'
INSERT INTO permissions (role_id, group_id, action)
SELECT r.id, g.id, a.action
FROM roles r, groups g,
     (VALUES ('read'), ('write'), ('delete'), ('stream'), ('list')) AS a(action)
WHERE r.name = 'admin' AND g.name = 'all';

-- operator: только read и stream над 'ground-floor'
INSERT INTO permissions (role_id, group_id, action)
SELECT r.id, g.id, a.action
FROM roles r, groups g,
     (VALUES ('read'), ('stream')) AS a(action)
WHERE r.name = 'operator' AND g.name = 'ground-floor';
