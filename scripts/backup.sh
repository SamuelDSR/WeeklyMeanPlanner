#!/bin/bash
# 备份：数据库用 pg_dump（逻辑备份），图片直接打包。
#
# 为什么不直接拷 pgdata 目录：Postgres 在跑的时候，数据分散在很多文件加 WAL 里，
# 直接 tar/rsync 拿到的是撕裂快照，可能根本恢复不了 —— 而且你不会知道，
# 直到真的要用的那天。pg_dump 出来的是一致的、能恢复的、跨架构也能用的。
#
# 用法：
#   ./scripts/backup.sh                    备份到 ./backups
#   ./scripts/backup.sh /mnt/backup        备份到指定目录
#   KEEP=14 ./scripts/backup.sh            只保留最近 14 份（默认 30）
#
# 放进 crontab（每天凌晨 3 点）：
#   0 3 * * * cd /path/to/meal-planner && ./scripts/backup.sh /mnt/backup >> /var/log/meal-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="${1:-./backups}"
KEEP="${KEEP:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
PG_SERVICE="${PG_SERVICE:-postgres}"
DB_USER="${DB_USER:-mealplanner}"
DB_NAME="${DB_NAME:-mealplanner}"

mkdir -p "$DEST"
# 备份里有 bcrypt 密码哈希、邮箱地址、VAPID 私钥 —— 只给自己读
chmod 700 "$DEST"

SQL="$DEST/db-$STAMP.sql.gz"
IMG="$DEST/uploads-$STAMP.tar.gz"

echo "==> 备份数据库 -> $SQL"
docker compose exec -T "$PG_SERVICE" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges --clean --if-exists | gzip -9 > "$SQL"
chmod 600 "$SQL"

echo "==> 备份图片 -> $IMG"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
docker run --rm -v "${PROJECT_NAME}_uploads":/from -v "$(cd "$DEST" && pwd)":/to alpine \
  tar czf "/to/$(basename "$IMG")" -C /from .
chmod 600 "$IMG"

echo "==> 校验（能解压、能看到建表语句才算数）"
gzip -t "$SQL"
TABLES=$(gzip -dc "$SQL" | grep -c "^CREATE TABLE" || true)
[ "$TABLES" -ge 10 ] || { echo "备份看起来不完整：只有 $TABLES 条 CREATE TABLE" >&2; exit 1; }
echo "    $TABLES 张表，$(du -h "$SQL" | cut -f1) / $(du -h "$IMG" | cut -f1)"

echo "==> 清理旧备份（保留最近 $KEEP 份）"
ls -1t "$DEST"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$DEST"/uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "完成。恢复用：gzip -dc $SQL | docker compose exec -T $PG_SERVICE psql -U $DB_USER -d $DB_NAME"
