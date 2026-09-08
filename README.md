# ТИМП РГР

## Развёрнутая версия

- Приложение: [http://217.71.129.139:3120](http://217.71.129.139:3120)
- Swagger UI: [http://217.71.129.139:3120/api/v1/docs/](http://217.71.129.139:3120/api/v1/docs/)
- OpenAPI JSON: [http://217.71.129.139:3120/api/v1/docs.json](http://217.71.129.139:3120/api/v1/docs.json)

# Введение
## Тема
Система видеонаблюдения торгового центра
# Этапы выполнения
## Первоначальный набросок:
Было 3 попытки реализовать проект полностью, текущая выжимка:

Сайт (бэкенд+фронтенд+веб сервер), который принимает видео с камер, хрнаит их, оьджает и позволяет отмечать инциденты
Сущности:
Пользователи
Устрйоства записи (камеры)
Объекты записи (поток видео над камерой)
Куски записей (нарезки с потока записи)

Микровсервисы:
- dev:
    - npm веб-сервер фронтенда с проксированием на бэкенд
    - бэкенд
    - БД
    - Контейнер медиа 
- prod:
    - nginx проксирует и раздает фронтенд

Функционал:
- CRUD источника видео (добалвение камер)
- CRUD Объекта записей (создание записей на камерах, их запуск и останов)
- CRUD записей с камер (просмотр за период, создание инцидентов по таймкоду)
- CRUD инцидентов на записях с камер 
- Админ дашборд:
    - CRUD пользователей
    - CRUD прав пользователей (Юзер Право Объект)
    - Возсожен функционал мониторинга (сбор метрик)

Предполагаемая модель безопасности:
- ALC на уровне БД для фильтрации запросов по правам ПЕРЕД бэкендом (Субъекты пользователи имеют Права на Объекты камеры/записи/инциденты)
- RBAC/ABAC/PBAC на уровне бизнес логики как мощный и удобный механизм прав доступа
- Идентификация и аутентификация по логину паролю
- Авторизация через JWT токен

# Эксплуатация

## Запуск в dev (на хосте разработчика, Linux)

Требуется: Node.js 22, Docker c плагином compose, git, tmux (по желанию).

1. Клонировать репозиторий и зайти в него:
   ```bash
   git clone https://github.com/Mirmordan/TIMP-RGR.git
   cd TIMP-RGR
   ```
   Все настройки — в файле `.env` (он в репозитории) и в `backend/.env` (дефолты для локального запуска).

2. Поднять инфраструктуру (БД + mediaMTX):
   ```bash
   docker compose up -d db mtx
   ```
   Контейнер БД `timp-rgr-db-1` поднимется с портом `5432:5432`, `mtx` с портами `8554/8888/9996-9998`.
   При первом запуске БД инициализируется сидами из `database/setup/` (тестовые пользователи `alice`/`bob`, пароль `password`).
   Если на хосте уже поднят legacy-контейнер `timp-rgr-mediamtx-1` — остановить, иначе конфликты по портам.

3. Запустить ffmpeg-manager на хосте (запись Ivideon-потоков в `data/chunks`):
   ```bash
   cd ffmpeg-manager && npm install
   RECORD_ROOT=$PWD/../data/chunks node server.js &   # порт 9999
   ```

4. Запустить бэкенд и фронтенд (каждый в своей tmux-сессии — так они переживают закрытие терминала):
   ```bash
   tmux new-session -d -s backend 'cd backend && npm install && npx tsx src/server.ts'
   tmux new-session -d -s vite    'cd frontend && npm install && npx vite --host'
   ```
   Проверка: `curl -s http://localhost:5000/api/v1/auth/login -X POST -H 'Content-Type: application/json' -d '{"username":"alice","password":"***"}'` должен вернуть JSON с `user`,
   фронтенд доступен на `http://localhost:5173`.
   Логи tmux: `tmux attach -t backend` (отключение — `Ctrl-b d`). Остановка: `tmux kill-session -t backend`.

## Запуск в prod (docker compose, локально или на сервере)

Prod-стек — весь проект в контейнерах, хостовые процессы не нужны:

1. Убедиться, что свободны порты `80` (nginx), `5432` (БД), `5000` (app), `8554/1935/8888/9996-9998` (mtx):
   `ss -tlnp | grep -E ':(80|5432|5000) '`
2. Пересобрать и запустить:
   ```bash
   docker compose up -d --build
   ```
3. Настроить `.env` для прода:
   - задать свои секреты (иначе используются dev-дефолты из compose):
     ```bash
     printf 'JWT_SECRET=%s\nJWT_REFRESH_SECRET=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" >> .env
     ```
   - на сервер NSTU Cloud наружи отдаётся только 80-й порт через `217.71.129.139:6310`, TLS нет —
     создать `docker-compose.override.yml` (gitignore'd, подхватывается автоматически):
     ```yaml
     services:
       app:
         environment:
           COOKIE_SECURE: "0"
     ```
     Без этого браузер сбрасывает Secure-cookie по HTTP и сессия мгновенно слетает в logout.
4. Перезапустить app после правки `.env`/override: `docker compose up -d app`.
5. Остановить стек: `docker compose down` (БД сохранится в volume `pgdata`).

## Обновление с сервера разработки

На сервере (каталог `/home/deploy/TIMP-RGR`, пользователь `deploy`):

```bash
cd ~/TIMP-RGR
git pull --ff-only
docker compose up -d --build   # пересоберёт изменённые образы и перезапустит только их
docker image prune -f          # (опционально) счистить висячие слои старых сборок
```

БД и чанки при обновлении не трогаются. После pull — прогнать backup (см. ниже) и открыть
`http://217.71.129.139:6310`. Сервисы `restart: unless-stopped` переживают ребут сервера:
tmux на проде не нужен, всём управляет docker.


## Резервные копии (`scripts/backups.sh`, `verify-backup.sh`, `restore-backup.sh`)

Раздельно хранит три слоя:

- **приложение / доступы** — пользователи, роли, права, справочники камер и процессов;
- **записи** — сегменты, чанки, инциденты (+ их объекты в `objects`);
- **журнал** — аудит (`audit_log`) отдельно от остального;
- плюс **схема**, **роли кластера** и запасной цельный `full.dump`;
- медиа-файлы (`.ts` в `data/chunks`) — отдельные инкрементальные **hardlink-снапшоты**
  в `data/backups/files/` (не пишутся в бандл, только ссылка в манифесте).

Предварительно на хосте нужны: `docker` (доступ из группы), `rsync`. Переменные настройки —
дефолты в `scripts/backup-lib.sh`, все переопределяются окружением:
`DB_CONTAINER timp-rgr-db-1`, `DB_SUPER_USER`/`DB_NAME` (из `.env`), `KEEP=7`/`MEDIA_KEEP=7`
(ротация «сколько хранить»), `BACKUP_ROOT` (`data/backups`),
`MEDIA_SOURCES` (дефолт `data/chunks ffmpeg-manager/recordings`; на сервере, где записи лежат
только в `data/chunks`, запускать с `MEDIA_SOURCES=data/chunks`), `SKIP_DB`/`SKIP_MEDIA=1`.

Использование:

```bash
scripts/backups.sh             # всё: split-дампы БД + rsync медиа в data/backups/
scripts/backups.sh db          # только БД (быстро, для дневного крона)
scripts/backups.sh files       # только медиа-снапшот (реже — файлы чанков не меняются)
scripts/verify-backup.sh       # проверить последний бандл: sha256 + тестовый restore во временную БД (+rowCount)
scripts/restore-backup.sh                          # восстановить в отдельную scratch-БД rgr_restore_* (безопасно)
scripts/restore-backup.sh <bundle> --promote --yes # заменить живую timprgr проверенным бандлом
scripts/restore-backup.sh <bundle> --restore-media --yes   # раскатать медиа-снапшот в рабочие каталоги
```

Медиа-часть (`--restore-media`) перезаписывает рабочие каталоги — перед этим
останавливать писателей чанков. В prod-стеке: `docker compose stop app mtx ffmpegmanager`;
в dev на хосте: `tmux kill-session -t backend` и `tmux kill-session -t vite`.
После восстановления — `docker compose up -d` (dev — заново поднять tmux-сессии, см. выше).

Restore в чистый кластер (новый сервер): сначала применить `database/setup/00-app-role.sql`
к новому кластеру (роль приложения `timprgr_app`), затем
`restore-backup.sh --promote --yes --roles-full` (роли и пароли применится из бандла).

## Постановка бэкапа на планировщик

Скрипты расписания не знают — оно целиком на планировщике хоста. Ротацию (`KEEP`) выполняет сам
`backups.sh`, поэтому кронить можно хоть каждый час, каталог не раздувается.
Первый `files`-снапшот копирует весь `data/chunks` — делать руками, дальше — инкрементально.

### Вариант 1: cron (сервер, пользователь `deploy` из группы docker)

```bash
crontab -e   # от пользователя deploy (не root)
```

```cron
30 3 * * * cd /home/deploy/TIMP-RGR && MEDIA_SOURCES=data/chunks scripts/backups.sh all    >> data/backups/run.log 2>&1
0 4 1 * *  cd /home/deploy/TIMP-RGR && MEDIA_SOURCES=data/chunks scripts/backups.sh files  >> data/backups/run.log 2>&1
15 5 * * * cd /home/deploy/TIMP-RGR && scripts/verify-backup.sh                            >> data/backups/verify.log 2>&1
```

### Вариант 2: systemd-таймеры (хост разработчика, пользователь `mirmordan`)

`~/.config/systemd/user/rgr-backup.service`:

```ini
[Unit]
Description=TIMP-RGR backup all

[Service]
Type=oneshot
WorkingDirectory=/home/mirmordan/Projects/TIMP-RGR
ExecStart=/home/mirmordan/Projects/TIMP-RGR/scripts/backups.sh all
```

`~/.config/systemd/user/rgr-backup.timer`:

```ini
[Unit]
Description=TIMP-RGR nightly backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

Включить (пользовательские юниты, без root):

```bash
systemctl --user daemon-reload
systemctl --user enable --now rgr-backup.timer
systemctl --user list-timers rgr-backup.timer   # следующая срабатывание
journalctl --user -u rgr-backup.service -n 50   # журнал последнего прогона
```

Замечания:

- для `Persistent=true` пользовательские сервисы должны жить после выхода из сессии:
  `loginctl enable-linger $USER` (иначе таймер сработает только пока вы залогинены);
- при `--link-dest` ротации verify предупреждает (`media-snapshot FAIL`), если самый новый медиа-снапшот
  ссылается на удалённого предка — либо держать `MEDIA_KEEP` не меньше `KEEP`, либо чистить медиа-снапшоты реже БД.

