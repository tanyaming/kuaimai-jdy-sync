#!/bin/bash
# 快麦订单同步脚本
# crontab: */5 * * * * /Users/htjc/.easyclaw/workspace/kuaimai-jdy-sync/src/cron-sync.sh >> /tmp/kuaimai-sync.log 2>&1

# crontab 环境没有 PATH，需要显式设置
export PATH="/Users/htjc/Library/Application Support/easyclaw/ai/tool_cache/resources/tools/mac/node-24.13.0-arm64/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME=/Users/htjc

cd /Users/htjc/.easyclaw/workspace/kuaimai-jdy-sync

# 防止重复执行
LOCKFILE="/tmp/kuaimai-sync.lock"
if [ -f "$LOCKFILE" ]; then
    # 检查锁是否超过 10 分钟（防止死锁）
    if [ "$(find "$LOCKFILE" -mmin +10 2>/dev/null)" ]; then
        rm -f "$LOCKFILE"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 上次同步仍在运行，跳过"
        exit 0
    fi
fi
touch "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ===== 开始同步 ====="

npx tsx src/sync-orders.ts --once 2>&1

EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ===== 同步结束 (exit=$EXIT_CODE) ====="

exit $EXIT_CODE
