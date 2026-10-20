#!/bin/bash
# AgriLink 核查库（SQLite + Datasette）启停脚本
DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/datasette.pid"
LOG="$DIR/datasette.log"
PORT=8100
case "$1" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then echo "already running pid $(cat "$PIDFILE")"; exit 0; fi
    nohup "$DIR/venv/bin/datasette" "$DIR/agrilink.db" --host 0.0.0.0 --port $PORT \
      --metadata "$DIR/metadata.json" --setting sql_time_limit_ms 10000 \
      --setting max_returned_rows 5000 --setting default_page_size 50 \
      >> "$LOG" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 3
    echo "started pid $(cat "$PIDFILE") -> http://127.0.0.1:$PORT/ (局域网访问请用本机 IP)"
    ;;
  stop)
    if [ -f "$PIDFILE" ]; then kill "$(cat "$PIDFILE")" 2>/dev/null && echo "stopped pid $(cat "$PIDFILE")"; rm -f "$PIDFILE"; else echo "no pidfile"; fi
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then echo "running pid $(cat "$PIDFILE")"; else echo "not running"; fi
    ;;
  *) echo "usage: $0 {start|stop|status}";;
esac
