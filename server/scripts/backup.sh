#!/bin/bash
# Nestworth Postgres 备份脚本（服务器端 cron 用）
#
# 上线后加 crontab：
#   crontab -e
#   0 4 * * * /data/nestworth-analytics/server/scripts/backup.sh >> /data/nestworth-analytics/logs/backup.log 2>&1
#
# 行为：
#   1. pg_dump 整库 → 本地 gzip
#   2. 上传到腾讯云 COS（如 coscli 已装）
#   3. 删 30 天前的本地备份
#
# COS 配置默认跟 private-chef 共用 bucket（weilan-1254036222），
# 通过环境变量覆盖：COS_BUCKET / COS_REGION / COS_PREFIX

set -euo pipefail

REMOTE_DIR="/data/nestworth-analytics"
APP_DIR="$REMOTE_DIR/server"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_DIR/backups}"
COS_BUCKET="${COS_BUCKET:-weilan-1254036222}"
COS_REGION="${COS_REGION:-ap-beijing}"
COS_PREFIX="${COS_PREFIX:-nestworth-backups}"

DATABASE_URL=$(grep '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL not found in $APP_DIR/.env" >&2
  exit 1
fi

DATE="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/nestworth_$DATE.sql.gz"
COS_TARGET="cos://${COS_BUCKET}/${COS_PREFIX}/nestworth_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

# 1. pg_dump
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

# 2. 上传 COS（可选）
if command -v coscli >/dev/null 2>&1; then
  if coscli cp "$BACKUP_FILE" "$COS_TARGET" 2>/dev/null; then
    UPLOAD_STATUS="✓ COS ${COS_REGION}"
  else
    UPLOAD_STATUS="✗ COS upload failed (仍保留本地)"
  fi
else
  UPLOAD_STATUS="- coscli 未装，仅本地备份"
fi

# 3. 删 30 天前的本地备份
DELETED=$(find "$BACKUP_DIR" -name 'nestworth_*.sql.gz' -mtime +30 -delete -print | wc -l)

printf '[%s] backup %s (%s) %s | cleaned %s old\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" \
  "$(basename $BACKUP_FILE)" \
  "$BACKUP_SIZE" \
  "$UPLOAD_STATUS" \
  "$DELETED"
