#!/bin/bash
# 一键部署脚本（跳过 git pull）
#
# 用途：服务器无法访问 GitHub 时用。代码靠本地 scp 推上去，本脚本只做服务器
# 端的 install / build / migration / pm2 restart。
#
# 跟 deploy.sh 区别：去掉 git fetch + git pull 两步；其余完全相同。
#
# 用法：
#   ./deploy-no-git.sh

set -euo pipefail

SERVER_USER="ubuntu"
SERVER_HOST="101.42.108.88"
SERVER_PORT="22"

echo "🚀 Deploying Nestworth backend (跳过 git pull，代码已 scp 到位)"
echo "   server: ${SERVER_USER}@${SERVER_HOST}"
echo ""

ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" 'bash -s' <<'EOF'
set -euo pipefail

REMOTE_DIR="/data/nestworth-analytics"
APP_DIR="$REMOTE_DIR/server"

cd "$APP_DIR"
echo "→ current HEAD (if git available):"
git log --oneline -1 2>/dev/null || echo "(not a git repo, skip)"
echo ""

# === 1. npm install + build ===
echo "→ npm install (incl. devDeps for tsc)"
npm install --production=false --silent
echo "→ npm run build"
npm run build
echo ""

# === 2. migrations (幂等) ===
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
  echo "⚠️  .env 不存在；跳过 migration"
fi
echo ""

# === 3. prune devDeps 省内存 ===
echo "→ npm prune --omit=dev"
npm prune --omit=dev --silent
echo ""

# === 4. PM2 ===
mkdir -p logs
echo "→ pm2 startOrRestart"
pm2 startOrRestart ecosystem.config.cjs --update-env
echo ""

# === 5. 健康检查 ===
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
