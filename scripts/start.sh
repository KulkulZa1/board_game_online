#!/usr/bin/env bash
# scripts/start.sh — Start the local dev server
# Usage: bash scripts/start.sh [port]

PORT="${1:-3000}"
PID_FILE=".server.pid"
LOG_FILE=".server.log"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⚠️  Server already running (PID $OLD_PID)"
    echo "   Run: bash scripts/stop.sh   to stop it first"
    exit 1
  fi
fi

export PORT="$PORT"
node server.js > "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

# Wait for the server to start (up to 5s)
for i in $(seq 1 10); do
  sleep 0.5
  if curl -s "http://localhost:$PORT/api/status" > /dev/null 2>&1; then
    echo "✅ Server started — PID $PID"
    echo "   URL:  http://localhost:$PORT"
    echo "   Log:  tail -f $LOG_FILE"
    echo "   Stop: bash scripts/stop.sh"
    exit 0
  fi
done

echo "❌ Server did not start in time. Check $LOG_FILE"
cat "$LOG_FILE"
exit 1
