#!/usr/bin/env bash
# ТИМП-РГР — основной скрипт создания резервных копий.
#
# Что пишется в бандл data/backups/bundles/<STAMP>/:
#   db/roles.sql          роли кластера и пароли (pg_dumpall --globals-only) — для переноса
#   db/schema.sql.gz      схема (таблицы, RLS-политики, функции, гранты) без данных
#   db/application.sql.gz справочники пользователей/прав + объекты устройств/процессов
#   db/recording.sql.gz   записи (сегменты, чанки, инциденты) + их объекты
#   db/bindings.sql.gz    привязки: состав групп (group_members), гранты ролям (role_object_grants)
#   db/logs.sql.gz        только аудит (audit_log)
#   db/full.dump          цельный pg_dump -Fc (запасной путь восстановления)
#   files/rsync-*.log     логи rsync по каждому источнику медиа
#   manifest.env          метаданные и rowCount — по ним сверяет verify-backup.sh
#   checksums.txt         sha256 всех файлов бандла
# Медиафайлы (data/chunks и т.п.) в бандл НЕ кладутся: они копируются отдельными
# инкрементальными снапшотами data/backups/files/<STAMP>/ (rsync --link-dest,
# hardlinks на неизменённые) — бандл ссылается на снапшот manifest-ключами MEDIA_*.
#
# Запуск (расписание — за планировщиком, см. README.md):
#   scripts/backups.sh             # всё: БД + медиа
#   scripts/backups.sh db          # только БД
#   scripts/backups.sh files       # только медиа-снапшот
#
# Настройки через окружение (значения по умолчанию — в backup-lib.sh):
#   BACKUP_ROOT DB_CONTAINER DB_SUPER_USER DB_NAME APP_DB_USER KEEP MEDIA_KEEP
#   MEDIA_SOURCES  SKIP_DB=1 | SKIP_MEDIA=1 | SKIP_RECORDS=1 (== SKIP_MEDIA=1)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/backup-lib.sh"

ACTION="${1:-all}"
SKIP_MEDIA="${SKIP_MEDIA:-${SKIP_RECORDS:-0}}"

STAMP="$(date +%Y%m%d-%H%M%S)-$$"   # -pid — чтобы односекундные повторы не затерели предыдущий бандл
BUNDLE="$BUNDLE_ROOT/$STAMP"
TMP_BUNDLE="$BUNDLE_ROOT/.tmp-$STAMP-$$"
MANIFEST="$TMP_BUNDLE/manifest.env"
DONE=0
cleanup() {
  # при провале до финального mv: сносим временный бандл и недособранный снапшот этого запуска
  [ "$DONE" = 1 ] && return 0
  rm -rf "$TMP_BUNDLE" "${MEDIA_ROOT:?}/$STAMP"
}
trap cleanup EXIT

mkdir -p "$TMP_BUNDLE/files"
chmod 700 "$TMP_BUNDLE"
printf 'BACKUP_ACTION=%s\n' "$ACTION" > "$MANIFEST"
printf 'BACKUP_STAMP=%s\n' "$STAMP" >> "$MANIFEST"

# ----------------------------------------------------------------------- БД
# Одна таблица/подзапрос текстом в stdout (COPY TO STDOUT не печатает ничего "лишнего",
# поэтому добавляем терминатор '\\.' вручную).
dump_sql() { # <sql-select>
  docker exec -i "$DB_CONTAINER" psql -U "$DB_SUPER_USER" -d "$DB_NAME" \
    -X -q -At -c "COPY ($1) TO STDOUT"
}

# category-файл: BEGIN + отключённые на время загрузки триггеры/FK + полная копия таблиц
dump_category() { # <имя-файла> <"таблица ..."> [where-условие-для-objects]
  local name="$1" tables="$2" objw="${3:-}"
  local sql="$TMP_BUNDLE/files/$name.sql" t
  {
    echo "BEGIN;"
    echo "SET LOCAL session_replication_role = replica;"
    for t in $tables; do
      echo "COPY public.$t FROM stdin;"
      dump_sql "SELECT * FROM public.$t"
      printf '\\.\n'
    done
    if [ -n "$objw" ]; then
      echo "COPY public.objects FROM stdin;"
      dump_sql "SELECT * FROM public.objects WHERE $objw"
      printf '\\.\n'
    fi
    echo "COMMIT;"
  } > "$sql"
  gzip -f "$sql"
  mv "$TMP_BUNDLE/files/$name.sql.gz" "$TMP_BUNDLE/db/$name.sql.gz"
  chmod 600 "$TMP_BUNDLE/db/$name.sql.gz"
}

run_db_backup() {
  require_db
  mkdir -p "$TMP_BUNDLE/db"
  log_info "DB: роли кластера -> db/roles.sql"
  docker exec "$DB_CONTAINER" pg_dumpall -U "$DB_SUPER_USER" --globals-only > "$TMP_BUNDLE/db/roles.sql"
  chmod 600 "$TMP_BUNDLE/db/roles.sql"

  log_info "DB: схема -> db/schema.sql.gz"
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_SUPER_USER" -d "$DB_NAME" --schema-only --no-owner \
    | gzip -c > "$TMP_BUNDLE/db/schema.sql.gz"
  chmod 600 "$TMP_BUNDLE/db/schema.sql.gz"

  log_info "DB: split-дампы данных"
  local other_obj
  other_obj="$(psql_val "$DB_NAME" "SELECT count(*) FROM objects WHERE type::text NOT IN ($APP_OBJ_TYPES,$REC_OBJ_TYPES)")"
  [ "$other_obj" -gt 0 ] && log_warn "objects: $other_obj строк с неизвестным типом — поедут в recording.sql.gz"
  dump_category application "$APP_TABLES" "type::text IN ($APP_OBJ_TYPES)"
  dump_category recording "$REC_TABLES" "type::text NOT IN ($APP_OBJ_TYPES)"
  dump_category bindings "$BIND_TABLES"
  dump_category logs "$LOG_TABLES"

  log_info "DB: цельный дамп -> db/full.dump"
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_SUPER_USER" -d "$DB_NAME" -Fc \
    -f "/tmp/rgr-backup-$STAMP.dump"
  docker cp "$DB_CONTAINER:/tmp/rgr-backup-$STAMP.dump" "$TMP_BUNDLE/db/full.dump"
  docker exec "$DB_CONTAINER" rm -f "/tmp/rgr-backup-$STAMP.dump"
  chmod 600 "$TMP_BUNDLE/db/full.dump"

  log_info "DB: rowCount-ы в манифест"
  printf 'DB_CONTAINER=%s\nDB_NAME=%s\nDB_SUPER_USER=%s\nAPP_DB_USER=%s\n' \
    "$DB_CONTAINER" "$DB_NAME" "$DB_SUPER_USER" "$APP_DB_USER"
  local t n
  for t in $APP_TABLES $REC_TABLES $BIND_TABLES $LOG_TABLES; do
    n="$(psql_val "$DB_NAME" "SELECT count(*) FROM public.$t")"
    printf 'ROWS_%s=%s\n' "$t" "$n"
  done
  n="$(psql_val "$DB_NAME" "SELECT count(*) FROM objects WHERE type::text IN ($APP_OBJ_TYPES)")"
  printf 'ROWS_obj_app=%s\n' "$n"
  n="$(psql_val "$DB_NAME" "SELECT count(*) FROM objects WHERE type::text NOT IN ($APP_OBJ_TYPES)")"
  printf 'ROWS_obj_rec=%s\n' "$n"
  printf 'ROWS_obj_other=%s\n' "$other_obj"
}

# --------------------------------------------------------------------- МЕДИА
run_media_backup() {
  local snap="$MEDIA_ROOT/$STAMP"
  local prev=""
  [ -e "$MEDIA_ROOT/latest" ] && prev="$(readlink -f "$MEDIA_ROOT/latest")"
  printf 'MEDIA_SNAPSHOT=%s\n' "$snap"
  local src abspath safe args tfiles
  for src in $MEDIA_SOURCES; do
    abspath="$REPO_ROOT/$src"
    [ -d "$abspath" ] || { log_warn "media: $src нет — пропуск"; continue; }
    case "$BACKUP_ROOT" in
      "$abspath"/*) die "BACKUP_ROOT ($BACKUP_ROOT) внутри медиа-источника $src — бэкап копировал бы сам себя";;
    esac
    safe="$(MEDIA_SAFE "$src")"
    mkdir -p "$snap/$safe"
    args=(-a --numeric-ids --delete --exclude=/.hls/)
    [ -n "$prev" ] && [ -d "$prev/$safe" ] && args+=("--link-dest=$prev/$safe")
    log_info "rsync: $src -> $snap/$safe${prev:+ (link-dest $prev)}"
    if ! rsync "${args[@]}" "$abspath/" "$snap/$safe/" \
         > "$TMP_BUNDLE/files/rsync-$safe.log" 2>&1; then
      die "rsync $src упал — см. $BUNDLE/files/rsync-$safe.log"
    fi
    tfiles="$(find "$snap/$safe" -type f | wc -l)"
    printf 'MEDIA_FILES_%s=%s\n' "$safe" "$tfiles"
    printf 'MEDIA_BYTES_%s=%s\n' "$safe" "$(du -sb "$snap/$safe" | cut -f1)"
    printf 'MEDIA_SRC_%s=%s\n' "$safe" "$src"
  done
  ln -sfn "$STAMP" "$MEDIA_ROOT/latest"
  log_info "media: снапшот $snap готов"
}

# --------------------------------------------------------------------- main
case "$ACTION" in
  db)    SKIP_MEDIA=1 ;;
  files) SKIP_DB=1 ;;
  all)   ;;
  *)     die "неизвестное действие '$ACTION' (ожидалось db|files|all)" ;;
esac

if [ "${SKIP_DB:-0}" != 1 ]; then
  run_db_backup >> "$MANIFEST"
fi
if [ "${SKIP_MEDIA:-0}" != 1 ]; then
  run_media_backup >> "$MANIFEST"
fi

log_info "checksums"
( cd "$TMP_BUNDLE" && find . -type f ! -name checksums.txt -print0 | xargs -0r \
    sha256sum > "$TMP_BUNDLE/checksums.txt" )

mv "$TMP_BUNDLE" "$BUNDLE"
DONE=1
chmod 600 "$BUNDLE/manifest.env"
ln -sfn "$STAMP" "$BUNDLE_ROOT/latest"
log_info "бандл готов: $BUNDLE"

# ротация по количеству (не по расписанию)
prune_dir() { # <dir> <keep>
  local root="$1" keep="$2" d
  [ -d "$root" ] || return 0
  d="$(find "$root" -mindepth 1 -maxdepth 1 -type d ! -name '.tmp-*' -printf '%f\n' | sort | head -n -"$keep" || true)"
  [ -z "$d" ] && return 0
  while IFS= read -r old; do
    [ -z "$old" ] && continue
    log_info "prune: удаляю $root/$old"
    rm -rf "${root:?}/$old"
  done <<< "$d"
}
prune_dir "$BUNDLE_ROOT" "$KEEP"
prune_dir "$MEDIA_ROOT" "$MEDIA_KEEP"
log_info "backup done"
