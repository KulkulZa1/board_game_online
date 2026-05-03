#!/usr/bin/env bash
# scripts/diagnose.sh — Diagnose why Render.com is showing the wrong version.
# Run this script and paste the output to Claude (or into COWORK_BRIEF.md).
# Usage: bash scripts/diagnose.sh [render-url]

RENDER_URL="${1:-https://board-game-online.onrender.com}"
PASS=0; FAIL=0; WARN=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
err()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║   board_game_online — 배포 진단 리포트             ║"
echo "╚════════════════════════════════════════════════════╝"
echo "  실행 시각: $(date)"
echo "  Render URL: $RENDER_URL"
echo ""

# ── A. Local git state ───────────────────────────────────────────
echo "=== A. 로컬 Git 상태 ==="
BRANCH=$(git rev-parse --abbrev-ref HEAD)
MAIN_COMMIT=$(git rev-parse --short origin/main 2>/dev/null || echo "unknown")
echo "  현재 브랜치: $BRANCH"
echo "  origin/main HEAD: $MAIN_COMMIT"

GAME_COUNT=$(grep -c "require('./" server/handlers/index.js 2>/dev/null || echo 0)
echo "  서버 핸들러 수: $GAME_COUNT"
[ "$GAME_COUNT" -ge 12 ] && ok "핸들러 12개 확인" || err "핸들러 수 부족 ($GAME_COUNT/12) — main 브랜치 확인 필요"

LOBBY_CARDS=$(grep -c 'class="game-card"' public/index.html 2>/dev/null || echo 0)
echo "  로비 게임 카드 수: $LOBBY_CARDS"
[ "$LOBBY_CARDS" -ge 12 ] && ok "로비 카드 12개 확인" || err "로비 카드 부족 ($LOBBY_CARDS/12)"

RENDER_BRANCH=$(grep "branch:" render.yaml 2>/dev/null | awk '{print $2}')
if [ -n "$RENDER_BRANCH" ]; then
  ok "render.yaml branch 명시: $RENDER_BRANCH"
else
  err "render.yaml에 branch 미지정 — Render 대시보드 설정에 의존"
fi

echo ""

# ── B. Live server check ─────────────────────────────────────────
echo "=== B. 라이브 서버 확인 ($RENDER_URL) ==="
RAW=$(curl -s --max-time 12 "$RENDER_URL/api/status" 2>&1)
CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
  err "서버 응답 없음 (curl exit $CURL_EXIT) — 서버가 슬립 상태이거나 오프라인"
  echo "  힌트: Render free tier는 15분 비활성 시 슬립됩니다."
  echo "  해결: 브라우저로 $RENDER_URL 열어 wake-up 후 재시도"
else
  UPTIME=$(echo "$RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('uptime','?'))" 2>/dev/null)
  ok "서버 응답 확인 — uptime: ${UPTIME}s"

  # Check if game cards visible via HTML
  LIVE_HTML=$(curl -s --max-time 12 "$RENDER_URL/" 2>/dev/null)
  LIVE_CARDS=$(echo "$LIVE_HTML" | grep -c 'class="game-card"' 2>/dev/null || echo 0)
  echo "  라이브 게임 카드 수: $LIVE_CARDS"

  if [ "$LIVE_CARDS" -ge 12 ]; then
    ok "라이브 서버: 12개 게임 확인 ✅ 배포 정상"
  elif [ "$LIVE_CARDS" -ge 7 ]; then
    warn "라이브 서버: ${LIVE_CARDS}개 게임 — 부분 배포 (기대값: 12)"
  elif [ "$LIVE_CARDS" -ge 6 ]; then
    err "라이브 서버: ${LIVE_CARDS}개 게임 — 구 버전(v1.0/v1.2) 배포 중!"
    echo ""
    echo "  🔴 문제 진단: Render가 main 브랜치가 아닌 구 버전을 서비스 중입니다."
    echo "     예상 원인:"
    echo "     1) Render 대시보드가 다른 브랜치(develop/dev)로 연결됨"
    echo "     2) render.yaml branch 필드 미지정으로 구 설정 유지"
    echo "     3) Render에서 수동 재배포 필요"
    echo ""
    echo "  🛠 즉시 해결 방법:"
    echo "     → Render 대시보드 접속: https://dashboard.render.com"
    echo "     → boardgame-online 서비스 클릭"
    echo "     → Settings → Branch: main 으로 변경"
    echo "     → Manual Deploy → Deploy latest commit 클릭"
  else
    err "라이브 서버: 게임 없음 (${LIVE_CARDS}) — 서버 오류 가능성"
  fi

  # Check for leaked IPs (security)
  if echo "$RAW" | grep -q '"ip"'; then
    err "보안: /api/status가 플레이어 IP 노출 중 — 구 버전 배포 증거"
  else
    ok "보안: /api/status IP 미노출 확인"
  fi

  # Check socketId exposure
  if echo "$RAW" | grep -q '"socketId"'; then
    err "보안: /api/status가 socketId 노출 중 — 구 버전 배포 증거"
  else
    ok "보안: /api/status socketId 미노출 확인"
  fi
fi

echo ""

# ── C. Git log summary ───────────────────────────────────────────
echo "=== C. 최근 커밋 (origin/main) ==="
git log --oneline origin/main -6 2>/dev/null | sed 's/^/  /'

echo ""

# ── D. Key files check ───────────────────────────────────────────
echo "=== D. 핵심 파일 존재 확인 ==="
FILES=(
  "server/handlers/mancala.js"
  "server/handlers/backgammon.js"
  "server/handlers/texasholdem.js"
  "server/handlers/dotsboxes.js"
  "public/js/game-mancala.js"
  "public/js/game-backgammon.js"
  "public/js/admob.js"
  "capacitor.config.json"
  "render.yaml"
)
for f in "${FILES[@]}"; do
  [ -f "$f" ] && ok "$f" || err "$f 없음"
done

echo ""

# ── Summary ──────────────────────────────────────────────────────
echo "╔════════════════════════════════════════════════════╗"
echo "║  진단 결과: ✅ $PASS 통과  ❌ $FAIL 실패  ⚠️  $WARN 경고"
echo "╚════════════════════════════════════════════════════╝"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "📋 COWORK_BRIEF.md 파일을 Claude에게 전달하거나"
  echo "   아래 명령을 Render 대시보드에서 수동 실행하세요:"
  echo ""
  echo "   git checkout main"
  echo "   git log --oneline -3   # dd6246c 가 최상단이어야 함"
  echo "   # Render 대시보드 → Manual Deploy → Deploy latest commit"
fi
