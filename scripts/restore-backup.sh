#!/usr/bin/env bash
# ТИМП-РГР — восстановление БД (и, опционально, медиа) из backup-бандла.
#
# Скрипт всегда сначала разворачивает бандл во ВРЕМЕННУЮ базу и сверяет rowCount
# с манифестом — только после этого, если запрошено --promote, подменяет живую
# базу (DROP текущей + RENAME временной). Без --promote ничего разрушительного
# не происходит: временная база остаётся для инспекции, а её удаление печатается
# в подсказке.
#
#   scripts/restore-backup.sh                       # latest-бандл -> scratch-база
#   scripts/restore-backup.sh <bundle-dir>          # конкретный бандл
#   scripts/restore-backup.sh --promote --yes       # то же + заменить живую БД
#   scripts/restore-backup.sh --restore-media [--yes]   # + раскатать медиа-снапшот
# Опции:
#   --skip-verify          не запускать целостность перед restore (не рекомендуется)
#   --keep-tmp             не удалять scratch-БД
#   --roles-full           применить всё roles.sql (включая ALTER ROLE паролей), а не
#                          только недостающие CREATE ROLE
#   --media-delete         при --restore-media зеркалить (--delete) в рабочие каталоги
# ВНИМАНИЕ --restore-media: поверх актуальных data/chunks/... ложится снапшот бандла.
# Перед ним нужно остановить запись (tmux: backend/vite + docker compose stop
# ffmpegmanager mtx), иначе в рабочие каталоги налету дописываются новые файлы.
#
# Настройки: BACKUP_ROOT, DB_CONTAINER, DB_SUPER_USER, DB_NAME (backup-lib.sh).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/backup-lib.sh"

BUNDLE=""; PROMOTE=0; RESTORE_MEDIA=0; MEDIA_DELETE=0; SKIP_VERIFY=0; KEEP_TMP=0; ROLES_MODE=only-missing
YES="${YES:-0}"
while [ $# -gt 0 ]; do
  case "$1" in
    --promote)        PROMOTE=1 ;;
    --yes)            YES=1 ;;
    --restore-media)  RESTORE_MEDIA=1 ;;
    --media-delete)   MEDIA_DELETE=1 ;;
    --skip-verify)    SKIP_VERIFY=1 ;;
    --keep-tmp)       KEEP_TMP=1 ;;
    --roles-full)     ROLES_MODE=full ;;
    -h|--help)        sed -n '2,22p' "$0"; exit 0 ;;
    *)                BUNDLE="$1" ;;
  esac
  shift
done

[ -z "$BUNDLE" ] && BUNDLE="$BUNDLE_ROOT/latest"
BUNDLE="$(readlink -f "$BUNDLE")" || true
[ -d "$BUNDLE/db" ] || die "нет бандла с БД-частями: $BUNDLE (scripts/backups.sh db)"
MANIFEST="$BUNDLE/manifest.env"
[ -f "$MANIFEST" ] || die "нет manifest.env в $BUNDLE"
DB_NAME_B="$(manifest_get "$MANIFEST" DB_NAME)"; DB_NAME_B="${DB_NAME_B:-?}"
if [ "$DB_NAME_B" != "$DB_NAME" ]; then
  log_warn "бандл снят с БД '$DB_NAME_B', а текущая живая — '$DB_NAME': promote подменит именно '$DB_NAME'"
fi
APP_DB_M="$(manifest_get "$MANIFEST" APP_DB_USER)"; APP_DB_M="${APP_DB_M:-$APP_DB_USER}"
require_db

confirm() { # <msg>
  [ "$YES" = 1 ] && return 0
  printf '%s [yes/NO]: ' "$*" >&2
  local a; read -r a
  [ "$a" = "yes" ] || die "отменено"
}

# 1) проверка бандла
if [ "$SKIP_VERIFY" != 1 ]; then
  log_info "проверяю бандл: verify-backup.sh --skip-db"
  "$REPO_ROOT/scripts/verify-backup.sh" "$BUNDLE" --skip-db
fi

# --promote с --yes — разрушительно
[ "$PROMOTE" = 1 ] && [ "$RESTORE_MEDIA" = 1 ] && die "--promote и --restore-media вместе не совмещаем: делай последовательно"
if [ "$PROMOTE" = 1 ]; then
  confirm "ВНИМАНИЕ: --promote удалит живую БД '$DB_NAME' и переименует восстановленную в '$DB_NAME'. Продолжить?"
fi
if [ "$RESTORE_MEDIA" = 1 ]; then
  confirm "ВНИМАНИЕ: --restore-media перезапишет медиа из снапшота $BUNDLE-бандла в рабочие каталоги. Продолжить?"
fi

TS="$(date +%Y%m%d_%H%M%S)_$$"
SCRATCH="rgr_restore_$TS"
cleanup_scratch() {
  [ "$KEEP_TMP" = 1 ] && return 0
  docker exec "$DB_CONTAINER" psql -U "$DB_SUPER_USER" -d postgres -X -q -c \
    "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 || true
}

# 2) роль приложения должна существовать (схема её грантит)
log_info "роли: проверяю наличие '$APP_DB_M' в кластере"
# 2) роли приложения/кластера: pg_dumpall PG16 пишет "CREATE ROLE name;" и отдельно
# "ALTER ROLE name WITH ... PASSWORD ..." — недостающую роль воспроизводим обоими.
if [ "$ROLES_MODE" = full ]; then
  [ -f "$BUNDLE/db/roles.sql" ] || die "roles.sql нет в бандле — --roles-full неприменим"
  confirm "Применить ВЕСЬ roles.sql из бандла (ALTER ROLE перезапишет пароли ВСЕХ ролей кластера)?"
  log_warn "roles-full: применяю roles.sql как есть (пароли ролей будут перезаписаны)"
  psql_run postgres -f - < "$BUNDLE/db/roles.sql"
elif ! psql_val postgres "SELECT 1 FROM pg_roles WHERE rolname = '$APP_DB_M'" | grep -q 1; then
  log_info "роли: роль '$APP_DB_M' отсутствует в кластере — создаю из roles.sql недостающие"
  [ -f "$BUNDLE/db/roles.sql" ] || die "роль '$APP_DB_M' отсутствует, а roles.sql в бандле нет — создай вручную (database/setup/00-app-role.sql)"
  grep '^CREATE ROLE' "$BUNDLE/db/roles.sql" | awk '{print $3}' | tr -d '";' | while read -r role; do
    [ -n "$role" ] || continue
    if ! psql_val postgres "SELECT 1 FROM pg_roles WHERE rolname = '$role'" | grep -q 1; then
      attrs="$(grep -m1 "^ALTER ROLE $role " "$BUNDLE/db/roles.sql" || true)"
      log_info "  создаю недостающую роль $role"
      psql_run postgres -c "CREATE ROLE \"$role\""
      [ -n "$attrs" ] && psql_run postgres -c "$attrs"
    fi
  done
  psql_val postgres "SELECT 1 FROM pg_roles WHERE rolname = '$APP_DB_M'" | grep -q 1 \
    || die "роль '$APP_DB_M' так и не появилась после применения roles.sql (формат роли в SQL?) — проверь db/roles.sql вручную"
fi

# 3) scratch-база
log_info "restore: создаю временную БД $SCRATCH"
psql_run postgres -c "CREATE DATABASE $SCRATCH OWNER \"$DB_SUPER_USER\" TEMPLATE template0"
trap '[ "$KEEP_TMP" = 1 ] || cleanup_scratch' EXIT

log_info "restore: накатываю части в порядке схема -> app -> rec -> bindings -> logs"
load_sql_gz "$BUNDLE" db/schema.sql.gz       "$SCRATCH"
load_sql_gz "$BUNDLE" db/application.sql.gz  "$SCRATCH"
load_sql_gz "$BUNDLE" db/recording.sql.gz    "$SCRATCH"
load_sql_gz "$BUNDLE" db/bindings.sql.gz     "$SCRATCH"
load_sql_gz "$BUNDLE" db/logs.sql.gz         "$SCRATCH"
run_seq_reset "$SCRATCH"

# 4) сверка rowCount
fails="$(manifest_counts_check "$MANIFEST" "$SCRATCH")"
[ "${fails:-1}" != 0 ] && die "после restore rowCount не совпали с манифестом ($fails расхождений) — НЕ повышаю до --promote"
log_info "restore: rowCount сходится с манифестом"

# 5) promote (замена живой базы)
if [ "$PROMOTE" = 1 ]; then
  log_info "promote: обрываю соединения к '$DB_NAME'"
  psql_run postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid()" >/dev/null
  log_info "promote: drop '$DB_NAME'; rename '$SCRATCH' -> '$DB_NAME'"
  psql_run postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)"
  psql_run postgres -c "ALTER DATABASE \"$SCRATCH\" RENAME TO \"$DB_NAME\""
  KEEP_TMP=1   # база переименована, cleanup не должен её сносить
  log_info "promote выполнен. Перезапусти backend: docker compose up -d --force-recreate db app"
fi

# 6) медиа
if [ "$RESTORE_MEDIA" = 1 ]; then
  SNAP="$(manifest_get "$MANIFEST" MEDIA_SNAPSHOT)"
  [ -n "$SNAP" ] || die "в бандле нет MEDIA_SNAPSHOT (бандл снят без медиа — --restore-media неприменим)"
  [ -d "$SNAP" ] || die "снапшот $SNAP из манифеста отсутствует на диске (после prune раскатывай data/backups/files/latest)"
  latest_snap="$(readlink -f "$MEDIA_ROOT/latest" 2>/dev/null || true)"
  [ -n "$latest_snap" ] && [ "$latest_snap" != "$SNAP" ] && log_warn "снапшот бандла не самый свежий — раскатываю именно бандловый, как запрошено"
  while IFS='=' read -r k v; do
    case "$k" in
      MEDIA_SRC_*)
        safe="${k#MEDIA_SRC_}"
        src_dir="$REPO_ROOT/$v"
        snap_dir="$SNAP/$safe"
        [ -d "$snap_dir" ] || { log_warn "media: нет снапшота $snap_dir"; continue; }
        margs=(-a --numeric-ids)
        [ "$MEDIA_DELETE" = 1 ] && margs+=(--delete)
        log_info "media: раскатываю $snap_dir -> $src_dir"
        rsync "${margs[@]}" "$snap_dir/" "$src_dir/"
        ;;
    esac
  done < "$MANIFEST"
fi

log_info "restore готов. Проверь данные и перезапусти сервисы:"
if [ "$KEEP_TMP" = 1 ]; then
  printf '  (scratch-база %s НЕ удалена: DROP DATABASE %s когда не нужна)\n' "$SCRATCH" "$SCRATCH" >&2
fi
