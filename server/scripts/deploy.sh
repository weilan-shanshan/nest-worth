#!/bin/bash
# Nestworth backend 一键部署 / 升级脚本（仿 private-chef 模式）
#
# 用法：
#   ./deploy.sh              # 部署 main 分支
#   ./deploy.sh feat/xxx      # 部署指定分支
#
# 行为：
#   1. SSH 到 Lighthouse
#   2. cd /data/nestworth-analytics && git pull
#   3. cd server && npm install + build
#   4. 跑 schema.sql + 所有 sql/migrations/*.sql (IF NOT EXISTS 幂等)
#   5. npm prune 省内存
#   6. pm2 startOrRestart ecosystem.config.cjs
#   7. 健康检查 http://127.0.0.1:8787/
#
# 首次部署前先手工把 .env 11 个新 key 加上（见 DEPLOY-UPGRADE.md §3.7）。
# 之后改代码 / merge 分支只需 `./deploy.sh` 1 分钟。

set -euo pipefail

SERVER_USER="ubuntu"
SERVER_HOST="101.42.108.88"
SERVER_PORT="22"
BRANCH="${1:-main}"

echo "🚀 Deploying Nestworth backend"
echo "   server: ${SERVER_USER}@${SERVER_HOST}"
echo "   branch: ${BRANCH}"
echo ""

ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" "BRANCH=${BRANCH} bash -s" <<'EOF'
set -euo pipefail

REMOTE_DIR="/data/nestworth-analytics"
APP_DIR="$REMOTE_DIR/server"

cd "$REMOTE_DIR"

# === 1. git pull ===
echo "→ git fetch + checkout $BRANCH"
git fetch --all --prune --quiet
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo "→ HEAD: $(git log --oneline -1)"
echo ""

# === 2. npm install + build ===
cd "$APP_DIR"
echo "→ npm install (incl. devDeps for tsc)"
npm install --production=false --silent
echo "→ npm run build"
npm run build
echo ""

# === 3. migrations (幂等) ===
if [ -f .env ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
  if [ -n "$DATABASE_URL" ]; then
    echo "→ migration: sql/schema.sql"
    psql "$DATABASE_URL" -f sql/schema.sql -q 2>&1 | grep -v 'NOTICE\|already exists' || true
    for migration in sql/migrations/*.sql; do
      [ -e "$migration" ] || continue
      echo "→ migration: $(basename $migration)"
      psql "$DATABASE_URL" -f "$migration" -q 2>&1 | grep -v 'NOTICE\|already exists' || true
    done
  else
    echo "⚠️  .env 里没有 DATABASE_URL；跳过 migration"
  fi
else
  echo "⚠️  .env 不存在；跳过 migration（首次部署需要先建 .env）"
fi
echo ""

# === 4. prune devDeps 省内存 ===
echo "→ npm prune --omit=dev"
npm prune --omit=dev --silent
echo ""

# === 5. PM2 ===
mkdir -p logs
echo "→ pm2 startOrRestart"
pm2 startOrRestart ecosystem.config.cjs --update-env
echo ""

# === 6. 健康检查 ===
PORT=$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2-)
PORT="${PORT:-8787}"
echo "→ 等 2 秒后健康检查..."
sleep 2
if curl -s -m 5 "http://127.0.0.1:${PORT}/" | grep -q "ok"; then
  echo "✅ 健康检查通过 (127.0.0.1:${PORT})"
else
  echo "❌ 健康检查失败！pm2 logs："
  pm2 logs nestworth-analytics --lines 30 --nostream
  exit 1
fi

printf '\n🎉 Deploy completed at %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
EOF
