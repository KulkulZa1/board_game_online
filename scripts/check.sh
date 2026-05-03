#!/usr/bin/env bash
# scripts/check.sh — Smoke-test the local server
# Usage: bash scripts/check.sh [port]
#
# Checks:
#   1. Server responds at /api/status
#   2. All 12 game handlers are registered
#   3. Key static assets are served (lobby, game page, all game JS)
#   4. No JS syntax errors in new arcade / 3D files

PORT="${1:-3000}"
BASE="http://localhost:$PORT"
PASS=0; FAIL=0

ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
err() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# ── 1. Server health ─────────────────────────────────────────────
echo ""
echo "=== 1. Server health ==="
STATUS=$(curl -s --max-time 5 "$BASE/api/status")
if echo "$STATUS" | grep -q '"uptime"'; then
  ok "/api/status responds"
  UPTIME=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['uptime'])" 2>/dev/null)
  ok "Uptime: ${UPTIME}s"
else
  err "/api/status did not respond — is the server running? (bash scripts/start.sh)"
  exit 1
fi

# ── 2. Game handler registry ─────────────────────────────────────
echo ""
echo "=== 2. Game handlers ==="
node -e "
const h = require('./server/handlers');
const games = ['chess','omok','connect4','othello','checkers','indianpoker',
               'applegame','battleship','backgammon','texasholdem','dotsboxes','mancala'];
let ok=0,fail=0;
games.forEach(g => {
  if(h.has(g)) { console.log('  ✅ '+g); ok++; }
  else          { console.log('  ❌ '+g+' MISSING'); fail++; }
});
console.log('  -- '+ok+' OK, '+fail+' missing');
process.exitCode = fail > 0 ? 1 : 0;
"
if [ $? -eq 0 ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

# ── 3. Static assets ─────────────────────────────────────────────
echo ""
echo "=== 3. Static assets ==="

check_url() {
  local url="$BASE/$1"
  local code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url")
  if [ "$code" = "200" ]; then ok "$1"; else err "$1 → HTTP $code"; fi
}

check_url ""
check_url "game.html"
check_url "js/game-registry.js"
check_url "js/game.js"
check_url "js/admob.js"

for game in chess omok connect4 othello checkers indianpoker applegame battleship backgammon texasholdem dotsboxes mancala; do
  check_url "js/game-${game}.js"
  check_url "css/games/${game}.css"
done

# Arcade v2
check_url "arcade/snake/"
check_url "arcade/snake/game.js"
check_url "arcade/breakout/"
check_url "arcade/breakout/game.js"

# 3D
check_url "games3d/chess3d/"
check_url "games3d/chess3d/scene.js"

# ── 4. JS syntax ─────────────────────────────────────────────────
echo ""
echo "=== 4. JS syntax check ==="

check_js() {
  if node --check "$1" 2>/dev/null; then ok "$1"; else err "$1 has syntax error"; fi
}

check_js public/arcade/snake/game.js
check_js public/arcade/breakout/game.js
check_js public/games3d/chess3d/scene.js
check_js server/handlers/mancala.js
check_js server/events.js

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "🎉 All checks passed!" || echo "⚠️  Fix the failures above before deploying."
exit $FAIL
