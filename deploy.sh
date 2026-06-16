#!/bin/bash
# 快麦→简道云 部署脚本
# 用法: ./deploy.sh [once|full|restart|logs|logsave|down]

set -e

mkdir -p logs

case "${1:-restart}" in
  once)
    echo ">>> 单次增量同步..."
    docker compose --profile once run --rm kuaimai-sync-once
    ;;
  full)
    echo ">>> 全量同步（回溯一年）..."
    docker compose --profile full run --rm kuaimai-sync-full
    ;;
  restart)
    echo ">>> 启动定时同步服务..."
    docker compose up -d --build kuaimai-sync
    docker compose logs -f kuaimai-sync
    ;;
  logs)
    docker compose logs -t -f --tail 100 kuaimai-sync
    ;;
  logsave)
    # 将 Docker 日志导出到 logs/ 目录，按日期命名
    FILE="logs/sync-$(date +%Y%m%d-%H%M%S).log"
    docker compose logs -t kuaimai-sync > "$FILE"
    echo ">>> 日志已保存到: $FILE ($(wc -l < "$FILE") 行)"
    ;;
  down)
    docker compose down
    ;;
  *)
    echo "用法: $0 {once|full|restart|logs|logsave|down}"
    echo "  once     - 单次增量同步"
    echo "  full     - 全量同步"
    echo "  restart  - 重启定时服务并查看日志"
    echo "  logs     - 查看实时日志（带时间戳）"
    echo "  logsave  - 导出当日日志到 logs/ 目录"
    echo "  down     - 停止所有服务"
    exit 1
    ;;
esac
