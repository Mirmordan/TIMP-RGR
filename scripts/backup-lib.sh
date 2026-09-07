#!/usr/bin/env bash
# ТИМП-РГР — общие настройки backup-сьюты. Самостоятельно не запускается,
# source-ится из backups.sh / verify-backup.sh / restore-backup.sh.
#
# Переопределяются переменными окружения (см. комментарии в каждом скрипте).

log_info() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
log_warn() { printf '[%s] WARN: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()      { printf '[%s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

BACKUP_ROOT="${BACKUP_ROOT:-$REPO_ROOT/data/backups}"
BUNDLE_ROOT="$BACKUP_ROOT/bundles"
MEDIA_ROOT="$BACKUP_ROOT/files"

DB_CONTAINER="${DB_CONTAINER:-timp-rgr-db-1}"
# Роль дампа/восстановления: суперuser кластера (рядовой user упрётся в FORCE RLS,
# а pg_dump как owner обязан видеть все таблицы).
DB_SUPER_USER="${DB_SUPER_USER:-timprgr}"
DB_NAME="${DB_NAME:-$(grep -E '^DB_DATABASE=' "$REPO_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
DB_NAME="${DB_NAME:-timprgr}"
APP_DB_USER="${APP_DB_USER:-timprgr_app}"

KEEP="${KEEP:-7}"              # сколько db-бандлов хранить
MEDIA_KEEP="${MEDIA_KEEP:-7}"  # сколько медиа-снапшотов хранить

# Источники медиа (относительно корня репо, пробелом). .hls — живой буфер, не бэкапим.
MEDIA_SOURCES="${MEDIA_SOURCES:-data/chunks ffmpeg-manager/recordings}"
MEDIA_SAFE() { printf '%s' "$1" | tr '/ ' '__'; }

# -----------------------------------------------------------------------------
# Категории раздельного дампа БД
# -----------------------------------------------------------------------------
APP_TABLES="users roles user_roles role_capabilities groups permissions recording_devices recording_streams recording_processes"
REC_TABLES="recording_segments recording_chunks recording_incidents"
BIND_TABLES="group_members role_object_grants"
LOG_TABLES="audit_log"
# Прочие неизвестные типы objects попадают в recording файл с предупреждением.
APP_OBJ_TYPES="'group','device','stream','process'"
REC_OBJ_TYPES="'segment','incident','chunk'"; 

# -----------------------------------------------------------------------------
# psql внутри контейнера: psql_run <db> <psql-args...>
psql_run() {
  local db="$1"; shift
  docker exec -i "$DB_CONTAINER" psql -U "$DB_SUPER_USER" -d "$db" \
    -X -q -t -A -v ON_ERROR_STOP=1 -q "$@"
}
# Только SQL-строка, скаляр/строки в stdout (для count(*)-проверок)
psql_val() { docker exec "$DB_CONTAINER" psql -U "$DB_SUPER_USER" -d "$1" -X -q -At -v ON_ERROR_STOP=1 -c "$2"; }

require_db() {
  docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q '^true$' \
    || die "контейнер БД $DB_CONTAINER не запущен"
}

# Загрузка одного .sql.gz из бандла в БД
load_sql_gz() { # <bundle_dir> <gz-файл(относ. путь)> <db>
  log_info "restore: $2 -> db '$3'"
  gunzip -c "$1/$2" | psql_run "$3" -f -
}

# SQL-генератор setval для всех owned-последовательностей (после загрузки данных).
# Значение = MAX(колонки)+1, поэтому корректно независимо от порядка категорий.
SEQ_RESET_SQL="
SELECT format('SELECT setval(%L, (SELECT COALESCE(MAX(%I), 0) + 1 FROM %I.%I), true);',
       quote_ident(sn.nspname)||'.'||quote_ident(s.relname), a.attname, n.nspname, t.relname)
FROM pg_class s
JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a','i')
JOIN pg_class t ON t.oid = d.refobjid AND t.relkind = 'r'
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_namespace sn ON sn.oid = s.relnamespace
WHERE s.relkind = 'S' AND n.nspname = 'public';"

run_seq_reset() { # <db>
  local stmts db="$1"
  stmts="$(psql_run "$db" -At -c "$SEQ_RESET_SQL" || true)"
  if [ -z "$stmts" ]; then
    log_warn "setval-запросы не найдены (нет owned-последовательностей?)"
    return 0
  fi
  printf '%s\n' "$stmts" | psql_run "$db" -f - >/dev/null
}

# Чтение значения из manifest.env
manifest_get() { # <файл> <ключ>
  sed -n "s/^$2=//p" "$1" | tail -1
}

# Сверка rowCount из manifest.env с содержимым БД. Логи — в stderr; в stdout
# печатает число расхождений (0 = всё совпало). Возвращает всегда 0 (чтобы
# set -e у вызывающего не падал от ненулевого возврата). Вызывается так:
#   f="$(manifest_counts_check <manifest.env> <db>)"; failures=$((failures + f))
manifest_counts_check() { # <manifest.env> <db>
  local manifest="$1" db="$2" failures=0 t want got want_sql objname
  while IFS='=' read -r k v; do
    case "$k" in
      ROWS_obj_*)
        objname="${k#ROWS_obj_}"
        case "$objname" in
          app) want="$v";   want_sql="SELECT count(*) FROM objects WHERE type::text IN ($APP_OBJ_TYPES)" ;;
          rec) want="$v";   want_sql="SELECT count(*) FROM objects WHERE type::text NOT IN ($APP_OBJ_TYPES)" ;;
          *) continue ;;
        esac
        got="$(psql_val "$db" "$want_sql" || true)"
        ;;
      ROWS_*)
        t="${k#ROWS_}"; want="$v"
        got="$(psql_val "$db" "SELECT count(*) FROM public.$t" || true)"
        ;;
      *) continue ;;
    esac
    if [ "x$got" = "x$want" ]; then
      log_info "OK  $k=$got"
    else
      log_warn "FAIL $k: want $want, got ${got:-<нет>}"
      failures=$((failures + 1))
    fi
  done < "$manifest"
  echo "$failures"
  return 0
}
