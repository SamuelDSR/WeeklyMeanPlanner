#!/bin/bash
# 把 demo 的数据恢复到新服务器。
#
# 只用 `docker` 命令，不依赖 `docker compose` ——
# 这样在 **swarm（docker stack deploy / Portainer Swarm Stack）** 和普通 compose 下都能跑。
#
# 前提：服务已经起来了（postgres 容器在跑）。这个脚本不负责部署，只负责灌数据。
#   swarm:   Portainer 里先把 stack 部署好
#   compose: docker compose up -d
#
# 用法：
#   ./restore.sh                      自动找 postgres 容器，先给你看计划
#   ./restore.sh -y                   跳过确认
#   ./restore.sh -y --force           目标库已有数据也覆盖
#   ./restore.sh /path/to/迁移包       数据文件不在脚本旁边时，指定目录
#   PG_CONTAINER=xxx ./restore.sh     指定容器（自动找不到时用）
#   UPLOADS_VOLUME=xxx ./restore.sh   指定图片卷名
#
# 这个脚本在两个地方各有一份，内容一样：
#   仓库里          scripts/restore.sh   （跟着代码走，别丢）
#   迁移包里        restore.sh           （和 dump 放一起，拷过去就能跑）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_USER="${DB_USER:-mealplanner}"
DB_NAME="${DB_NAME:-mealplanner}"
ASSUME_YES=0; FORCE=0; BUNDLE=""
for a in "$@"; do
  case "$a" in
    -y|--yes) ASSUME_YES=1 ;;
    --force) FORCE=1 ;;
    -*) echo "不认识的参数: $a" >&2; exit 1 ;;
    *) BUNDLE="$a" ;;
  esac
done

# 数据文件默认就在脚本旁边（迁移包的情况）；放在仓库 scripts/ 里时用参数或
# BUNDLE_DIR 指过去
HERE="${BUNDLE:-${BUNDLE_DIR:-$SCRIPT_DIR}}"
HERE="$(cd "$HERE" && pwd)"

for f in mealplanner.sql uploads.tar.gz; do
  [ -f "$HERE/$f" ] || {
    echo "在 $HERE 找不到 $f" >&2
    echo "把迁移包目录传进来，例如： $0 /path/to/meal-planner-migration-YYYYMMDD" >&2
    exit 1
  }
done

# --- 找 postgres 容器 ---
# swarm 里容器名形如 <stack>_postgres.1.xxxxx，compose 里是 <项目>-postgres-1，
# 所以按名字里含 postgres 来找，比猜命名规则可靠。
if [ -z "${PG_CONTAINER:-}" ]; then
  FOUND=$(docker ps --filter "name=postgres" --format '{{.Names}}')
  COUNT=$(printf '%s\n' "$FOUND" | grep -c . || true)
  if [ "$COUNT" -eq 0 ]; then
    echo "没找到在跑的 postgres 容器。先把服务部署起来，或者用 PG_CONTAINER=xxx 指定。" >&2
    docker ps --format '  {{.Names}}\t{{.Image}}' >&2
    exit 1
  elif [ "$COUNT" -gt 1 ]; then
    echo "找到多个 postgres 容器，请用 PG_CONTAINER=xxx 指定一个：" >&2
    printf '  %s\n' "$FOUND" >&2
    exit 1
  fi
  PG_CONTAINER=$(printf '%s\n' "$FOUND" | head -1)
fi

# --- 找图片卷 ---
# swarm/compose 都是 <stack或项目名>_uploads
if [ -z "${UPLOADS_VOLUME:-}" ]; then
  VOLS=$(docker volume ls --format '{{.Name}}' | grep -E '_uploads$' || true)
  VCOUNT=$(printf '%s\n' "$VOLS" | grep -c . || true)
  if [ "$VCOUNT" -eq 1 ]; then
    UPLOADS_VOLUME=$(printf '%s\n' "$VOLS" | head -1)
  elif [ "$VCOUNT" -eq 0 ]; then
    echo "没找到 *_uploads 卷。用 UPLOADS_VOLUME=xxx 指定（bind mount 的话见下面提示）。" >&2
    exit 1
  else
    echo "找到多个 uploads 卷，请用 UPLOADS_VOLUME=xxx 指定：" >&2
    printf '  %s\n' "$VOLS" >&2
    exit 1
  fi
fi

cat <<INFO
即将执行：

  postgres 容器   $PG_CONTAINER
  库 / 用户       $DB_NAME / $DB_USER
  图片卷          $UPLOADS_VOLUME
  dump            $HERE/mealplanner.sql
  图片包          $HERE/uploads.tar.gz

  1) 等 postgres 就绪
  2) 灌 dump（**覆盖式**：dump 带 --clean，同名表会先删再建）
  3) 把图片解到 $UPLOADS_VOLUME

  图片如果是 bind mount（比如 /srv/meal-planner/uploads），不要用这个脚本解，
  直接： tar xzf $HERE/uploads.tar.gz -C /srv/meal-planner/uploads

INFO

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "继续？(输入 yes) " ans
  [ "$ans" = "yes" ] || { echo "已取消。"; exit 1; }
fi

echo "==> 1/3 等 postgres 就绪"
for _ in $(seq 1 60); do
  docker exec "$PG_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$PG_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME"

EXISTING=$(docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT coalesce((SELECT count(*) FROM users),0)" 2>/dev/null | tr -d ' \r' || echo 0)
if [ "${EXISTING:-0}" -gt 0 ] && [ "$FORCE" -ne 1 ]; then
  echo "目标库里已经有 $EXISTING 个用户 —— 不敢直接覆盖。要覆盖请加 --force。" >&2
  exit 1
fi

echo "==> 2/3 灌入 dump"
docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q < "$HERE/mealplanner.sql"

echo "==> 3/3 恢复图片"
docker run --rm -v "$UPLOADS_VOLUME":/to -v "$HERE":/from alpine \
  sh -c 'tar xzf /from/uploads.tar.gz -C /to'

echo "==> 核对"
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT relname AS 表, n_live_tup AS 行数 FROM pg_stat_user_tables
 WHERE n_live_tup > 0 ORDER BY relname;"
echo "图片文件数: $(docker run --rm -v "$UPLOADS_VOLUME":/v alpine sh -c 'ls /v | wc -l' | tr -d ' \r')"
echo
echo "完成。api 容器重启一下更稳（让它重新连库）："
echo "  swarm:   docker service update --force <stack>_api"
echo "  compose: docker compose restart api"
echo "如果 JWT_SECRET 和原服务器不同，所有人需要重新登录一次（数据不受影响）。"
