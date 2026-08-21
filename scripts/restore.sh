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
#
# 图片怎么恢复，三种情况：
#   UPLOADS_VOLUME=xxx ./restore.sh          指定 docker 卷名
#   UPLOADS_PATH=/srv/xx/uploads ./restore.sh  bind mount：直接 tar 到这个目录
#   ./restore.sh --skip-uploads               只恢复数据库，图片自己解
# 什么都不指定、也没找到卷时：**照样会恢复数据库**，最后告诉你图片的解压命令
#
# 这个脚本在两个地方各有一份，内容一样：
#   仓库里          scripts/restore.sh   （跟着代码走，别丢）
#   迁移包里        restore.sh           （和 dump 放一起，拷过去就能跑）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_USER="${DB_USER:-mealplanner}"
DB_NAME="${DB_NAME:-mealplanner}"
ASSUME_YES=0; FORCE=0; SKIP_UPLOADS=0; BUNDLE=""
for a in "$@"; do
  case "$a" in
    -y|--yes) ASSUME_YES=1 ;;
    --force) FORCE=1 ;;
    --skip-uploads) SKIP_UPLOADS=1 ;;
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

# --- 图片恢复方式 ---
# 三种：docker 卷 / bind mount 的本地路径 / 跳过。
# 关键：**找不到卷不能直接退出** —— 数据库那步才是主角，
# 之前一上来就 exit 1，用 bind mount 的人连库都恢复不了。
UPLOADS_MODE=""
if [ "$SKIP_UPLOADS" -eq 1 ]; then
  UPLOADS_MODE="skip"
elif [ -n "${UPLOADS_PATH:-}" ]; then
  UPLOADS_MODE="path"
elif [ -n "${UPLOADS_VOLUME:-}" ]; then
  UPLOADS_MODE="volume"
else
  VOLS=$(docker volume ls --format '{{.Name}}' | grep -E '_uploads$' || true)
  VCOUNT=$(printf '%s\n' "$VOLS" | grep -c . || true)
  if [ "$VCOUNT" -eq 1 ]; then
    UPLOADS_VOLUME=$(printf '%s\n' "$VOLS" | head -1)
    UPLOADS_MODE="volume"
  elif [ "$VCOUNT" -gt 1 ]; then
    echo "找到多个 uploads 卷，用 UPLOADS_VOLUME=xxx 指定一个：" >&2
    printf '  %s\n' "$VOLS" >&2
    exit 1
  else
    # 很可能图片用的是 bind mount。不拦着，先把数据库恢复了。
    UPLOADS_MODE="manual"
  fi
fi

case "$UPLOADS_MODE" in
  volume) UPLOADS_DESC="docker 卷 $UPLOADS_VOLUME" ;;
  path)   UPLOADS_DESC="本地目录 ${UPLOADS_PATH}（bind mount）" ;;
  skip)   UPLOADS_DESC="跳过（--skip-uploads）" ;;
  manual) UPLOADS_DESC="没找到 *_uploads 卷 —— 数据库照常恢复，图片最后给你命令自己解" ;;
esac

cat <<INFO
即将执行：

  postgres 容器   $PG_CONTAINER
  库 / 用户       $DB_NAME / $DB_USER
  dump            $HERE/mealplanner.sql
  图片包          $HERE/uploads.tar.gz
  图片恢复方式    $UPLOADS_DESC

  1) 等 postgres 就绪
  2) 灌 dump（**覆盖式**：dump 带 --clean，同名表会先删再建）
  3) 恢复图片（按上面那个方式）

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

echo "==> 3/3 恢复图片（${UPLOADS_MODE}）"
case "$UPLOADS_MODE" in
  volume)
    docker run --rm -v "$UPLOADS_VOLUME":/to -v "$HERE":/from alpine \
      sh -c 'tar xzf /from/uploads.tar.gz -C /to'
    ;;
  path)
    mkdir -p "$UPLOADS_PATH"
    tar xzf "$HERE/uploads.tar.gz" -C "$UPLOADS_PATH"
    echo "    解到了 ${UPLOADS_PATH}（$(ls -1 "$UPLOADS_PATH" | wc -l | tr -d ' ') 个文件）"
    ;;
  skip)
    echo "    跳过。要恢复的话： tar xzf $HERE/uploads.tar.gz -C <你的 uploads 目录>"
    ;;
  manual)
    echo "    没找到 *_uploads 卷，图片没动。"
    echo "    如果用的是 bind mount，执行： tar xzf $HERE/uploads.tar.gz -C /srv/meal-planner/uploads"
    echo "    如果卷名不一样，重跑： UPLOADS_VOLUME=<卷名> $0 $HERE -y --force"
    ;;
esac

echo "==> 核对"
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT relname AS 表, n_live_tup AS 行数 FROM pg_stat_user_tables
 WHERE n_live_tup > 0 ORDER BY relname;"
case "$UPLOADS_MODE" in
  volume) echo "图片文件数: $(docker run --rm -v "$UPLOADS_VOLUME":/v alpine sh -c 'ls /v | wc -l' | tr -d ' \r')" ;;
  path)   echo "图片文件数: $(ls -1 "$UPLOADS_PATH" | wc -l | tr -d ' ')" ;;
  *)      echo "图片: 未恢复（见上面提示）" ;;
esac
echo
echo "完成。api 容器重启一下更稳（让它重新连库）："
echo "  swarm:   docker service update --force <stack>_api"
echo "  compose: docker compose restart api"
echo "如果 JWT_SECRET 和原服务器不同，所有人需要重新登录一次（数据不受影响）。"
