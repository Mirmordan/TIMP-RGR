# ROUTES — API эндпоинты TIMP-RGR (ТИМП-VIGIL)

Базовый URL: `/api/v1` (backend Express). Полная OpenAPI-спека: `GET /api/v1/docs` (Swagger UI).

Доступ в таблице указан не по ролям, а по разрешениям и возможностям:

- `authenticate` — обязательна активная сессия (httpOnly-куки `access_token`/`refresh_token`, выдаются на `POST /auth/login`); ставится на весь роутер или отдельно на обработчик;
- `permission("read"|"write"|"delete")` — `requirePermission`: право на конкретный объект (super-type `objects`) с наложением RLS по строкам; `scope: процесс` — право проверяется по объекту процесса/потока из URL;
- `capability("...")` — `requireCapability`: системное спец-право роли (например `camera:create`, `media:export`, `audit:read`);
- owner/admin guard — мутации пользователей (`PUT/PATCH/DELETE /users/:id` и `/admin/users/:id`, роли, сброс пароля) наследуют защиту: owner-аккаунт (`username === OWNER_USERNAME`) неприкосновенен для всех, включая себя → 403 «владелец защищён»; трогать пользователя с ролью `admin` может только владелец (иначе 403 «изменять администраторов может только владелец»). Назначение роли `admin` при создании (`POST /admin/users`, поле `roleNames`) тоже доступно только владельцу (иначе 403 «назначать роль admin может только владелец»); без `roleNames` создаётся `viewer`.

Списки (`GET /`...) дополнительно фильтруются на уровне БД (RLS), возвращают `limit`/`offset`, поиск `q`.

| Метод | Эндпоинт | Назначение | Доступ |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Проверка доступности API | открытый |
| GET | `/api/v1/docs` | Swagger UI (открыт при `SWAGGER_ENABLED=1`; CSP снят только здесь) | открытый |
| GET | `/api/v1/docs.json` | OpenAPI-спека (при `SWAGGER_ENABLED=1`) | открытый |
| POST | `/api/v1/auth/login` | Вход по логину и паролю | открытый |
| POST | `/api/v1/auth/refresh` | Обновление сессии | открытый |
| POST | `/api/v1/auth/logout` | Выход из системы | открытый |
| GET | `/api/v1/auth/me` | Текущий пользователь | authenticate |
| POST | `/api/v1/auth/change-password` | Смена пароля | authenticate |
| GET | `/api/v1/users` | Список пользователей | authenticate, capability("user:read") |
| GET | `/api/v1/users/:id` | Пользователь по ID | authenticate, capability("user:read") |
| POST | `/api/v1/users` | Создание пользователя | authenticate, capability("user:create") |
| PUT | `/api/v1/users/:id` | Полная замена пользователя | authenticate, capability("user:update") |
| PATCH | `/api/v1/users/:id` | Частичное обновление пользователя | authenticate, capability("user:update") |
| DELETE | `/api/v1/users/:id` | Удаление пользователя | authenticate, capability("user:delete") |
| GET | `/api/v1/devices` | Список устройств | authenticate |
| GET | `/api/v1/devices/:id` | Устройство по ID | authenticate, permission("read") |
| POST | `/api/v1/devices` | Создание устройства | authenticate, capability("camera:create") |
| PUT | `/api/v1/devices/:id` | Полная замена устройства | authenticate, permission("write") |
| PATCH | `/api/v1/devices/:id` | Частичное обновление устройства | authenticate, permission("write") |
| DELETE | `/api/v1/devices/:id` | Удаление устройства | authenticate, permission("delete") |
| GET | `/api/v1/streams` | Список потоков | authenticate |
| GET | `/api/v1/streams/:id` | Поток по ID | authenticate, permission("read") |
| POST | `/api/v1/streams/:id/view` | Просмотр live-потока без записи (view-сессия) | authenticate, permission("read") |
| DELETE | `/api/v1/streams/:id/view` | Остановить view-сессию потока | authenticate, permission("read") |
| POST | `/api/v1/streams` | Создание потока | authenticate, capability("stream:create") |
| PUT | `/api/v1/streams/:id` | Полная замена потока | authenticate, permission("write") |
| PATCH | `/api/v1/streams/:id` | Частичное обновление потока | authenticate, permission("write") |
| DELETE | `/api/v1/streams/:id` | Удаление потока | authenticate, permission("delete") |
| GET | `/api/v1/processes` | Список процессов записи | authenticate |
| GET | `/api/v1/processes/:id` | Процесс записи по ID | authenticate, permission("read") |
| POST | `/api/v1/processes` | Создание процесса записи | authenticate, capability("process:create") |
| PUT | `/api/v1/processes/:id` | Полная замена процесса записи | authenticate, permission("write") |
| PATCH | `/api/v1/processes/:id` | Частичное обновление процесса записи | authenticate, permission("write") |
| DELETE | `/api/v1/processes/:id` | Удаление процесса записи | authenticate, permission("delete") |
| GET | `/api/v1/processes/:id/export` | Экспорт фрагмента записи процесса в MP4 | authenticate, permission("read"), capability("media:export") |
| GET | `/api/v1/chunks` | Список чанков | authenticate |
| GET | `/api/v1/chunks/:id` | Чанк по ID | authenticate, permission("read") |
| POST | `/api/v1/chunks` | Создание чанка | authenticate, capability("chunk:create") |
| PUT | `/api/v1/chunks/:id` | Полная замена чанка | authenticate, permission("write") |
| PATCH | `/api/v1/chunks/:id` | Частичное обновление чанка | authenticate, permission("write") |
| DELETE | `/api/v1/chunks/:id` | Удаление чанка | authenticate, permission("delete") |
| GET | `/api/v1/segments` | Список сегментов записи | authenticate |
| GET | `/api/v1/segments/range` | Сегменты по временному диапазону | authenticate |
| GET | `/api/v1/segments/process/:processId/timeline` | Таймлайн записей процесса | authenticate, permission("read", scope: процесс) |
| GET | `/api/v1/segments/process/:processId/playlist` | Объединённый HLS-плейлист процесса | authenticate, permission("read", scope: процесс) |
| GET | `/api/v1/segments/process/:processId/live` | Live-плейлист процесса | authenticate, permission("read", scope: процесс) |
| GET | `/api/v1/segments/:id` | Сегмент по ID | authenticate, permission("read") |
| GET | `/api/v1/segments/:id/playlist` | HLS-плейлист сегмента | authenticate, permission("read") |
| GET | `/api/v1/segments/:id/files` | Файлы сегмента | authenticate, permission("read") |
| GET | `/api/v1/segments/:id/video` | Видео сегмента (MP4-стрим) | authenticate, permission("read") |
| DELETE | `/api/v1/segments/:id` | Удаление сегмента | authenticate, permission("delete") |
| GET | `/api/v1/recordings/auth` | Проверка доступа к медиа-объекту (nginx auth_request) | authenticate |
| GET | `/api/v1/recordings/:processDir/:filename` | Раздача .ts файла записи | authenticate |
| GET | `/api/v1/incidents/process/:processId` | Инциденты процесса записи | authenticate, permission("read", scope: процесс) |
| POST | `/api/v1/incidents` | Создание инцидента | authenticate, permission("write", scope: процесс) |
| DELETE | `/api/v1/incidents/:id` | Удаление инцидента | authenticate, permission("delete") |
| PATCH | `/api/v1/incidents/:id` | Частичное обновление инцидента | authenticate, permission("write") |
| GET | `/api/v1/objects/:id` | Объект с общими метаданными | authenticate, permission("read") |
| PATCH | `/api/v1/objects/:id/metadata` | Обновление общих метаданных объекта | authenticate, permission("write") |
| GET | `/api/v1/admin/users` | Список пользователей (RBAC-панель) | authenticate, capability("user:read") |
| GET | `/api/v1/admin/users/:id` | Пользователь с ролями по ID | authenticate, capability("user:read") |
| GET | `/api/v1/admin/roles` | Список ролей | authenticate, capability("role:read") |
| GET | `/api/v1/admin/roles/:id` | Роль по ID | authenticate, capability("role:read") |
| GET | `/api/v1/admin/groups` | Список групп объектов | authenticate, capability("group:read") |
| GET | `/api/v1/admin/groups/:id/objects` | Объекты группы | authenticate, capability("group:read") |
| GET | `/api/v1/admin/permissions` | Список прав | authenticate, capability("permission:read") |
| PUT | `/api/v1/admin/users/:id/roles` | Замена ролей пользователя | authenticate, capability("admin:write") |
| POST | `/api/v1/admin/roles` | Создание кастомной роли | authenticate, capability("role:create") |
| PATCH | `/api/v1/admin/roles/:id` | Переименование роли | authenticate, capability("role:update") |
| DELETE | `/api/v1/admin/roles/:id` | Удаление роли | authenticate, capability("role:delete") |
| PUT | `/api/v1/admin/roles/:id/permissions` | Замена прав роли | authenticate, capability("permission:manage") |
| GET | `/api/v1/admin/capabilities` | Каталог спец-прав системы | authenticate, capability("role:read") |
| GET | `/api/v1/admin/roles/:id/capabilities` | Спец-права роли | authenticate, capability("role:read") |
| PUT | `/api/v1/admin/roles/:id/capabilities` | Замена спец-прав роли | authenticate, capability("admin:write") |
| POST | `/api/v1/admin/groups` | Создание группы объектов | authenticate, capability("group:create") |
| PATCH | `/api/v1/admin/groups/:id` | Переименование группы объектов | authenticate, capability("group:update") |
| DELETE | `/api/v1/admin/groups/:id` | Удаление группы объектов | authenticate, capability("group:delete") |
| PUT | `/api/v1/admin/groups/:id/objects` | Замена состава объектов группы | authenticate, capability("permission:manage") |
| POST | `/api/v1/admin/users` | Создание пользователя (тело: `username`, `email`, `password?`, `roleNames?`; пусто → viewer) | authenticate, capability("user:create") |
| PUT | `/api/v1/admin/users/:id/password` | Сброс/установка пароля пользователя | authenticate, capability("user:password:reset") |
| PATCH | `/api/v1/admin/users/:id` | Редактирование пользователя | authenticate, capability("user:update") |
| DELETE | `/api/v1/admin/users/:id` | Удаление пользователя | authenticate, capability("user:delete") |
| GET | `/api/v1/admin/audit` | Аудит-лог | authenticate, capability("audit:read") |
| DELETE | `/api/v1/admin/audit` | Очистка аудит-лога | authenticate, capability("audit:delete") |
| GET | `/api/v1/admin/roles/:id/users` | Пользователи роли | authenticate, capability("user:read") |
| GET | `/api/v1/admin/roles/:id/grants` | Прямые grants роли на объекты | authenticate, capability("permission:read") |
| PUT | `/api/v1/admin/roles/:id/grants` | Замена прямых grants роли | authenticate, capability("permission:manage") |
| GET | `/api/v1/admin/objects` | Унифицированный список объектов (для permission-UI) | authenticate, capability("permission:read") |
| GET | `/api/v1/stats/overview` | Сводная статистика | authenticate, capability("admin:read") |
| GET | `/api/v1/stats/timeline` | Таймлайн записей по дням и устройствам | authenticate, capability("admin:read") |
| GET | `/api/v1/stats/incidents` | Инциденты по дням и важности | authenticate, capability("admin:read") |
| GET | `/api/v1/stats/disk` | Статистика по диску | authenticate, capability("admin:read") |
| GET | `/api/v1/stats/dashboard` | Сводка рабочего дашборда | authenticate, capability("dashboard:read") |

Дополнительно (не JSON-API): `GET /*` — SPA-фолбэк (раздача собранного фронтенда `backend/public`), включая `GET /`.
