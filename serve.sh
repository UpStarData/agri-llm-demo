#!/usr/bin/env bash
# 农链 AgriLink 本地演示服务 —— 启停脚本（郭慧电脑上的常驻演示入口）
#
#   ./serve.sh start     启动（默认端口 4180，只监听 127.0.0.1）
#   ./serve.sh stop      停止（只杀本脚本启动的那个 PID）
#   ./serve.sh restart   重启
#   ./serve.sh status    查看状态 + 最近日志
#   ./serve.sh log       跟踪日志
#
# 凭证：运行时从 ~/.agrilink/ai-config.json（0600）或环境变量读取；
#       或只读复用本机已有的 pi 配置（~/.pi/agent/auth.json + models-store.json）。
#       key 不会出现在日志、页面、bundle、localStorage 里。
# 配置页：http://127.0.0.1:4180/ → 右上角「⚙ AI 配置」
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${AGRI_PORT:-4180}"
LOGDIR="${HOME}/.agrilink"
LOG="${LOGDIR}/demo.log"
PIDFILE="${LOGDIR}/demo.pid"
mkdir -p "$LOGDIR"

alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

case "${1:-status}" in
  start)
    if alive; then echo "已在运行：PID $(cat "$PIDFILE")  http://127.0.0.1:${PORT}/"; exit 0; fi
    cd "$DIR"
    PORT="$PORT" nohup node server.mjs >>"$LOG" 2>&1 &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 40); do
      curl -sf -o /dev/null "http://127.0.0.1:${PORT}/api/health" && break
      sleep 0.25
    done
    if alive; then echo "已启动：PID $(cat "$PIDFILE")  http://127.0.0.1:${PORT}/"; else echo "启动失败，见 $LOG"; tail -20 "$LOG"; exit 1; fi
    ;;
  stop)
    if alive; then kill "$(cat "$PIDFILE")" && echo "已停止 PID $(cat "$PIDFILE")"; else echo "未在运行"; fi
    rm -f "$PIDFILE"
    ;;
  restart) "$0" stop; sleep 1; "$0" start ;;
  status)
    if alive; then echo "运行中：PID $(cat "$PIDFILE")  http://127.0.0.1:${PORT}/"; else echo "未在运行"; fi
    echo "--- 健康检查 ---"; curl -s "http://127.0.0.1:${PORT}/api/health" || echo "(不可达)"
    echo; echo "--- $LOG 末尾 ---"; tail -12 "$LOG" 2>/dev/null || echo "(无日志)"
    ;;
  log) tail -f "$LOG" ;;
  *) echo "用法：$0 {start|stop|restart|status|log}"; exit 1 ;;
esac
