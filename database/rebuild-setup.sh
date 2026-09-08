#!/usr/bin/env bash
# Пересобирает database/setup из ЖИВОЙ БД контейнера (pg_dump) — вместо
# цепочки инкрементальных миграций. Идемпотентно: повторяемый снапшот схемы.
#
# Использование:  ./database/rebuild-setup.sh [container] [dbname] [dbuser]
# По умолчанию:   timp-rgr-db-1 timprgr timprgr
#
# После генерации проверьте diff'ом и закоммитьте. Для применения к чистой БД:
# docker volume rm -f timp-rgr_pgdata && docker compose up -d db
set -euo pipefail

CONTAINER=${1:-timp-rgr-db-1}
DBNAME=${2:-timprgr}
DBUSER=${3:-timprgr}
OUT=$(cd "$(dirname "$0")" && pwd)/setup

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PGD() { docker exec "$CONTAINER" pg_dump -U "$DBUSER" -d "$DBNAME" "$@"; }
PGQ() { docker exec "$CONTAINER" psql -U "$DBUSER" -d "$DBNAME" -v ON_ERROR_STOP=1 "$@"; }

echo "[rebuild] dump схемы…"
PGD --schema-only --no-owner > "$TMP/schema.sql"

echo "[rebuild] split на секции (core/functions/security/policies/grants)…"
python3 "$(dirname "$0")/split_setup.py" "$TMP/schema.sql" "$TMP"

echo "[rebuild] dump данных…"
# 1) Метаданные сущностей (objects — родитель для FK доменных таблиц)
PGD --data-only --no-owner --disable-triggers --inserts \
    -t public.objects \
    -t public.users -t public.roles -t public.user_roles \
    -t public.groups -t public.group_members -t public.permissions \
    -t public.role_capabilities -t public.role_object_grants \
    > "$TMP/data-meta.sql"
# 2) Доменные таблицы (записи: процессы/сегменты/чанки/инциденты + справочники)
PGD --data-only --no-owner --disable-triggers --inserts \
    -t public.recording_devices -t public.recording_streams \
    -t public.recording_processes -t public.recording_segments \
    -t public.recording_chunks -t public.recording_incidents \
    > "$TMP/data-domains.sql"

echo "[rebuild] перенос в $OUT…"
mv -f "$TMP/core.sql"       "$OUT/02-schema-core.sql"
mv -f "$TMP/functions.sql"  "$OUT/03-functions.sql"
mv -f "$TMP/security.sql"   "$OUT/20-security-functions.sql"
mv -f "$TMP/policies.sql"   "$OUT/21-security-policies.sql"
mv -f "$TMP/grants.sql"     "$OUT/11-grants.sql"
mv -f "$TMP/data-meta.sql"  "$OUT/30-seed-objects.sql"
mv -f "$TMP/data-domains.sql" "$OUT/31-seed-domains.sql"

cat > "$OUT/README.md" <<'EOF'
# Инициализация БД (выполняется postgres-entrypoint'ом по алфавиту при создании кластера)

- 00-app-role.sql     — роль приложения timprgr_app (до GRANT'ов)
- 02-schema-core.sql  — DDL таблиц + pgcrypto (супертип objects + домен + RBAC-таблицы)
- 03-functions.sql    — прикладные функции (display-name объектов и пр.)
- 11-grants.sql       — выдача привилегий роли приложения
- 20-security-*.sql   — RLS-функции доступа и политики
- 30-seed-objects.sql — сид: объекты, пользователи, роли, группы, права
- 31-seed-domains.sql — сид: устройства, потоки, записи, сегменты, чанки, инциденты
- 40-seed-rbac-defaults.sql — ручной аддитивный оверхей: read-all на группе all
  и спец-права ролей operator/viewer (идемпотентный, можно накатывать на живую БД)

Файлы 02/03/11/20/30/31 генерируются из живой БД скриптом
`database/rebuild-setup.sh` (снапшот актуальной схемы/данных без миграционной
цепочки). Правка руками — только секций-заголовков. Файл 40-серии скриптом
НЕ пересоздаётся: это стабильный оверхей поверх снапшота данных.

Для старой БД-вольюмы со схемой до v-current: пересоздайте.volume
(docker compose down -v && up -d db) или накатите недостающие старые скрипты из git-истории.
EOF
echo "[rebuild] готово."
