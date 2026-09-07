#!/usr/bin/env bash
# ТИМП-РГР — проверка бэкап-бандла.
#
# 1) Целостность: manifest.env на месте, sha256 по checksums.txt, gzip-целостность,
#    непустые db-файлы, наличие rsync-снапшота медиа (если MEDIA_SNAPSHOT прописан).
# 2) Тест-восстановление БЕЗ риска для рабочей БД: поднимает временную базу
#    rgr_verify_<STAMP> внутри того же контейнера postgres, накатывает
#    schema -> application -> recording -> bindings -> logs, сверяет табличные
#    rowCount из manifest.env. Временная база удаляется в любом случае (кроме
#    --keep, тогда её надо удалить вручную).
#
# Запуск:
#   scripts/verify-backup.sh                # последний бандл (bundles/latest)
#   scripts/verify-backup.sh <bundle-dir>   # конкретный
# Опции:
#   --skip-db   только целостность (без развёртывания тестовой БД)
#   --keep      не удалять тестовую базу после проверки
# Выход 0 — OK, 1 — проблемы.
#
# Настройки через окружение см. backup-lib.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/backup-lib.sh"

BUNDLE=""; SKIP_DB=0; KEEP_TMP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-db) SKIP_DB=1 ;;
    --keep)    KEEP_TMP=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *)         BUNDLE="$1" ;;
  esac
  shift
done

if [ -z "$BUNDLE" ]; then BUNDLE="$BUNDLE_ROOT/latest"; fi
BUNDLE="$(readlink -f "$BUNDLE")" || die "не могу разрешить бандл: $BUNDLE"
[ -d "$BUNDLE" ] || die "нет бандла $BUNDLE (запустите scripts/backups.sh db)"
MANIFEST="$BUNDLE/manifest.env"
[ -f "$MANIFEST" ] || die "в бандле нет manifest.env — бандл неполный/чужой"
[ -f "$BUNDLE/checksums.txt" ] || die "в бандле нет checksums.txt"

failures=0
check() { # <msg> <cmd...>
  local msg="$1"; shift
  if "$@"; then log_info "OK  $msg"; else log_warn "FAIL  $msg"; failures=$((failures + 1)); fi
}

log_info "verify: $BUNDLE"
# ---------------------------------------------------------------- 1) целостность
check "sha256"        bash -c "cd '$BUNDLE' && sha256sum -c --quiet checksums.txt"
for f in db/schema.sql.gz db/application.sql.gz db/recording.sql.gz \
         db/bindings.sql.gz db/logs.sql.gz; do
  p="$BUNDLE/$f"
  if [ -f "$p" ]; then
    check "gzip $f" bash -c "gunzip -t '$p'"
  elif [ "$(manifest_get "$MANIFEST" BACKUP_ACTION)" = "files" ]; then
    log_warn "WARN: $f отсутствует (бандл без БД — ожидаемо для ACTION=files)"
  else
    log_warn "FAIL: нет $f"; failures=$((failures + 1))
  fi
done
if [ "$(manifest_get "$MANIFEST" BACKUP_ACTION)" != "files" ]; then
  check "roles.sql" bash -c "[ -s '$BUNDLE/db/roles.sql' ]"
fi
if [ -f "$BUNDLE/db/full.dump" ]; then
  check "full.dump читается" bash -c \
    "docker exec -i $DB_CONTAINER pg_restore --list < '$BUNDLE/db/full.dump' > /dev/null"
fi

MEDIA_SNAP="$(manifest_get "$MANIFEST" MEDIA_SNAPSHOT || true)"
if [ -n "$MEDIA_SNAP" ]; then
  check "media-snapshot" test -d "$MEDIA_SNAP"
  while IFS='=' read -r k v; do
    case "$k" in
      MEDIA_FILES_TOTAL|MEDIA_SNAPSHOT) continue ;;
      MEDIA_FILES_*)
        safe="${k#MEDIA_FILES_}"
        if [ -d "$MEDIA_SNAP/$safe" ]; then
          actual="$(find "$MEDIA_SNAP/$safe" -type f | wc -l)"
          [ "$actual" = "$v" ] || { log_warn "FAIL: media $safe: манифест $v, на диске $actual"; failures=$((failures+1)); }
        else
          log_warn "FAIL: media $safe: снапшот-директории нет"; failures=$((failures + 1))
        fi
        ;;
    esac
  done < "$MANIFEST"
fi

# ---------------------------------------------------- 2) тест-восстановление БД
ACTION_DB="$(manifest_get "$MANIFEST" BACKUP_ACTION)"
if [ "$SKIP_DB" = 1 ] || [ "$ACTION_DB" = "files" ]; then
  log_info "пропускаю тест-restore (--skip-db или ACTION=files)"
else
  require_db
  TMPDB="rgr_verify_$(date +%H%M%S)_$$"
  log_info "тест-restore: создаю временную БД '$TMPDB'"
  psql_run postgres -c "CREATE DATABASE $TMPDB OWNER $DB_SUPER_USER TEMPLATE template0"

  # cleanup temp DB on exit (verify может умереть по ON_ERROR_STOP)
  trap '[ "$KEEP_TMP" = 1 ] || docker exec -i "$DB_CONTAINER" psql -U "$DB_SUPER_USER" -d postgres \
    -X -q -c "DROP DATABASE IF EXISTS $TMPDB WITH (FORCE)" >/dev/null 2>&1 || true' EXIT

  load_sql_gz "$BUNDLE" db/schema.sql.gz "$TMPDB"
  for part in application recording bindings logs; do
    load_sql_gz "$BUNDLE" "db/$part.sql.gz" "$TMPDB"
  done
  log_info "тест-restore: seq reset"
  run_seq_reset "$TMPDB"

  local_fails="$(manifest_counts_check "$MANIFEST" "$TMPDB")"
  failures=$((failures + local_fails))
fi

# ------------------------------------------------------------------------ итог
if [ "$failures" -eq 0 ]; then
  log_info "VERIFY OK: бандл цел и разворачивается с совпадающими rowCount"
  exit 0
fi
log_warn "VERIFY FAIL: $failures проблем(ы)"
exit 1
