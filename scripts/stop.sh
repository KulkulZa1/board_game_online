#!/usr/bin/env bash
# scripts/stop.sh — Stop the local dev server

PID_FILE=".server.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "ℹ️  No PID file found — server may not be running"
  # try to kill any stray node server.js processes
  PIDS=$(pgrep -f "node server.js" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "   Killing stray processes: $PIDS"
    kill $PIDS 2>/dev/null
  fi
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  sleep 0.5
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID"
  fi
  echo "✅ Server stopped (PID $PID)"
else
  echo "ℹ️  Server was not running (PID $PID)"
fi

rm -f "$PID_FILE"
