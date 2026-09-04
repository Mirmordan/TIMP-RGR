#!/usr/bin/env bash
#
# ТИМП-РГР — резервное копирование.
#   1) pg_dump логической БД (Docker-контейнер с Postgres) в custom-format (.dump)
#   2) tar.gz директорий с чанками/записями (только если они существуют)
#   3) ротация по RETENTION_DAYS
#
# Использование (из крона от имени пользователя, у которого есть доступ к docker):
#   30 3 * * * /home/mirmordan/Projects/TIMP-RGR/scripts/backup.sh >> /var/log/timp-rgr-backup.log 2>&1
#
# Параметры окружения:
#   BACKUP_DIR     каталогкуда складывать бэкапы (по умолчанию ./backups от корня репо)
#   RETENTION_DAYS сколько дней хранить (по умолчанию 14)
#   SKIP_RECORDS=1 не архивировать чанки/записи (только дамп БД)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-timp-rgr-db-1}"
# Роль dumps: суперuser кластера (обходит RLS/FORCE RLS). Приложению this не нужен.
DB_USER="${DB_DUMP_USER:-timprgr}"
DB_NAME="${DB_NAME:-timprgr}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
echo "[$(date -Is)] backup start -> $BACKUP_DIR"

# 1) БД
DB_DUMP="$BACKUP_DIR/db-$STAMP.dump"
echo "  pg_dump -> $DB_DUMP"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "/tmp/rgr-dump-$STAMP.dump"
docker cp "$DB_CONTAINER:/tmp/rgr-dump-$STAMP.dump" "$DB_DUMP"
docker exec "$DB_CONTAINER" rm -f "/tmp/rgr-dump-$STAMP.dump"

# 2) записи/чанки (опционально)
if [ "${SKIP_RECORDS:-0}" != "1" ]; then
  for rec in "data/chunks" "ffmpeg-manager/recordings" "media-manager/recordings"; do
    abs="$REPO_ROOT/$rec"
    [ -d "$abs" ] || continue
    safe="${rec//\//_}"
    tgz="$BACKUP_DIR/records-$safe-$STAMP.tar.gz"
    echo "  tar   -> $tgz"
    tar -C "$(dirname "$abs")" -czf "$tgz" "$(basename "$abs")"
  done
fi

# 3) ротация
echo "  prune files older than ${RETENTION_DAYS}d in $BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'records-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Is)] backup done"
