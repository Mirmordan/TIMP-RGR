#!/usr/bin/env bash
#
# ТИМП-РГР — резервное копирование (ежедневно).
#   1) pg_dump логической БД (Docker-контейнер с Postgres) в custom-format (.dump)
#   2) tar.gz директорий с чанками/записями -> data/archive (gitignore покрывает data/)
#   3) ротация по КОЛИЧЕСТВУ: доступны текущий и вчерашний день (KEEP_COUNT=2)
#
# Запуск из крона раз в сутки (пользователь с доступом к docker):
#   30 3 * * *  /home/mirmordan/Projects/TIMP-RGR/scripts/backup.sh >> /home/mirmordan/Projects/TIMP-RGR/data/backup.log 2>&1
#
# Бюджет диска: KEEP_COUNT=2 × ~13G ≈ ~26G + рост записей.
#
# Параметры окружения:
#   BACKUP_DIR     куда складывать бэкапы (по умолчанию ./data/archive от корня репо)
#   KEEP_COUNT     сколько последних архивов каждого типа хранить (по умолчанию 2 = сегодня+вчера)
#   SKIP_RECORDS=1 не архивировать чанки/записи (только дамп БД)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/data/archive}"
KEEP_COUNT="${KEEP_COUNT:-2}"
DB_CONTAINER="${DB_CONTAINER:-timp-rgr-db-1}"
# Роль дампа: суперuser кластера — он единственный проходит FORCE RLS в pg_dump.
DB_USER="${DB_DUMP_USER:-timprgr}"
DB_NAME="${DB_NAME:-timprgr}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
echo "[$(date -Is)] backup start -> $BACKUP_DIR (keep=$KEEP_COUNT)"

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

# 3) ротация: имена содержат STAMP (сортируются по времени), оставляем последние N по каждому префиксу
echo "  prune: keep last $KEEP_COUNT per kind in $BACKUP_DIR"
for pattern in 'db-*.dump' 'records-*.tar.gz'; do
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "$pattern" \
    | sort | head -n -"$KEEP_COUNT" | xargs -r rm -f
done

echo "[$(date -Is)] backup done"
