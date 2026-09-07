# ТИМП РГР

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

## Запущенные экземпляры сервисов

В dev-среде (на этом хосте) сервисы живут так:

- **`db`, `mtx`, `ffmpegmanager`, `webserver`** — docker compose (`docker compose ps`);
- **backend** (`tsx src/server.ts`) и **frontend** (`vite`) — обычно в сессии tmux (сейчас: `tmux ls` → session `vite`).
  Перед `restore-backup.sh --promote`/`--restore-media` эти процессы нужно остановить,
  иначе они держат соединения в БД/файлы чанков:

```bash
tmux kill-session -t vite          # фронтенд (имя можно посмотреть: tmux ls)
tmux kill-session -t backend       # если бэкенд тоже в tmux
docker compose stop mtx ffmpegmanager   # писатели в data/chunks во время --restore-media
# ... восстановить ...
docker compose up -d && tmux new-session -d -s backend \
  'cd backend && npx tsx src/server.ts' \
 && tmux new-session -d -s vite 'cd frontend && npx vite'
```

## Резервные копии (`scripts/backups.sh`)

Раздельно хранит три слоя:

- **приложение / доступы** — пользователи, роли, права, справочники камер и процессов;
- **записи** — сегменты, чанки, инциденты (+ их объекты в `objects`);
- **журнал** — аудит (`audit_log`) отдельно от остального;
- плюс **схема**, **роли кластера** и запасной цельный `full.dump`;
- медиа-файлы (`.ts` в `data/chunks`) — отдельные инкрементальные **hardlink-снапшоты**
  в `data/backups/files/` (не пишутся в бандл, только ссылка в манифесте).

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
останавливать `mtx`/`ffmpegmanager` и backend (см. выше), иначе в чанки пишут параллельно.

Конфиг — переменными окружения (defaults в `scripts/backup-lib.sh`):
`DB_CONTAINER timp-rgr-db-1` (compose) / `timp-rgr-mediamtx-1` legacy не трогаем,
`DB_SUPER_USER timprgr` (суперUser дампа из `.env`), `DB_NAME` (из `.env`),
`KEEP=7`/`MEDIA_KEEP=7` (ротация «сколько хранить»), `BACKUP_ROOT`,
`MEDIA_SOURCES="data/chunks ffmpeg-manager/recordings"`, `SKIP_DB/SKIP_MEDIA=1`.

## Планировщик

Скрипты расписания не знают — оно целиком на планировщике хоста.
В dev на этом хосте задача ставится так, чтобы `data/backups` НЕ раздувался: ротацию делает сам `backups.sh` (`keep`), поэтому можно кронить хоть каждый час. Пример `crontab` (от пользователя с доступом к docker):

```cron
30 3 * * *   /home/mirmordan/Projects/TIMP-RGR/scripts/backups.sh all   >> /home/mirmordan/Projects/TIMP-RGR/data/backups/run.log 2>&1
0 4 1 * *    /home/mirmordan/Projects/TIMP-RGR/scripts/backups.sh files >> /home/mirmordan/Projects/TIMP-RGR/data/backups/run.log 2>&1
15 5 * * *   /home/mirmordan/Projects/TIMP-RGR/scripts/verify-backup.sh >> /home/mirmordan/Projects/TIMP-RGR/data/backups/verify.log 2>&1
```

Пример systemd-таймера (если предпочтительнее крона): положить юниты в `/etc/systemd/system/`:

```ini
# rgr-backup.service: Type=oneshot;  ExecStart=/home/mirmordan/Projects/TIMP-RGR/scripts/backups.sh all
# rgr-backup.timer:   OnCalendar=*-*-* 03:30:00; Persistent=true
```

Замечания по расписанию:

- `db`-бандл маленький (~10 МБ), но `files`-снапшот первый раз копирует всё (сотни ГБ, `data/chunks` ≈ 32 ГБ) —
  первый прогон `files` делайте руками в tmux;
- после ротации в 03:30 медиа-снапшоты могут ссылаться на удалённые `--link-dest`-предков —
  `verify-backup.sh` это ловит и предупреждает (`media-snapshot` FAIL); `MEDIA_KEEP` держите ≥ `KEEP` либо крутите
  `prune` только БД (`KEEP`), а медиа чистите реже;
- restore в чистый кластер (новый сервер): сначала развернуть схему с ролью
  `database/setup/00-app-role.sql`, затем `restore-backup.sh --promote --yes --roles-full`
  (пароли из бандла перезапишутся).