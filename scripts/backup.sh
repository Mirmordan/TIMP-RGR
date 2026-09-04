#!/usr/bin/env bash
#
# ТИМП-РГР — резервное копирование (ежедневно). Все пути и параметры — только
# переменными в блоке ниже; абсолютных личных путей в скрипте нет.
#   1) pg_dump логической БД (контейнер $DB_CONTAINER) в custom-format (.dump)
#   2) tar.gz $ARCHIVE_SOURCES -> $BACKUP_DIR
#   3) ротация по КОЛИЧЕСТВУ: храним последние $KEEP_COUNT архивов каждого типа
#      (при суточном кроне и KEEP=2 доступны сегодня и вчера)
#
# Запуск из крона от пользователя с доступом к docker (путь подставить свой):
#   30 3 * * *  <РЕПО>/scripts/backup.sh >> <РЕПО>/data/backup.log 2>&1
#
# Параметры окружения (переопределяют дефолты ниже):
#   BACKUP_DIR, KEEP_COUNT, DB_CONTAINER, DB_DUMP_USER, DB_NAME, ARCHIVE_SOURCES,
#   SKIP_RECORDS=1 — только дамп БД, без чанков.

set -euo pipefail

# ===== настройки =====
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/data/archive}"   # куда класть архивы
KEEP_COUNT="${KEEP_COUNT:-2}"                          # сколько поколений хранить
DB_CONTAINER="${DB_CONTAINER:-timp-rgr-db-1}"         # контейнер Postgres
# Роль дампа: суперuser кластера — только он проходит FORCE RLS в pg_dump.
DB_DUMP_USER="${DB_DUMP_USER:-timprgr}"
DB_NAME="${DB_NAME:-timprgr}"
# Директории-источники для tar (относительно корня репо, пробелом разделены):
ARCHIVE_SOURCES="${ARCHIVE_SOURCES:-data/chunks ffmpeg-manager/recordings}"
# =====================
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
