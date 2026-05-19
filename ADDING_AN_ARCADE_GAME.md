# Adding an Arcade Game (Layer B)

Arcade games are **solo, standalone** HTML/CSS/JS pages served at `/arcade/<gamename>/`.  
They have **zero server dependency** — no socket events, no room state, no backend changes.

---

## What Makes an Arcade Game

- Single HTML page with a `<canvas>` or DOM game area
- All game logic in one `game.js` IIFE — no imports, no build step
- Korean UI (matches the rest of the platform)
- `← 로비` back button linking to `/`
- Score saved to `localStorage` for high-score display
- AdMob interstitial on game-over via `/js/admob.js` (no-op on web)
- Mobile-responsive (touch controls or virtual joystick if needed)

---

## Files to Create (3 files)

```
public/arcade/<gamename>/
├── index.html    ← page shell: header + canvas + overlays
├── style.css     ← layout, overlay, HUD styles
└── game.js       ← entire game logic as an IIFE
```

**No server files needed. No `game-registry.js` changes needed.**

---

## Step-by-Step

### 1. Create the directory

```bash
mkdir public/arcade/<gamename>
```

### 2. Write `index.html`

Copy the structure from an existing arcade game (e.g. `public/arcade/snake/index.html`):

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>게임이름 — 보드게임 온라인</title>
  <link rel="icon" href="/icons/icon-192.png">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="container">
    <header id="hdr">
      <a href="/" class="back-btn">← 로비</a>
      <span class="game-title">🎮 게임이름</span>
      <div id="scores">
        <span>점수 <strong id="scoreDisplay">0</strong></span>
        <span>최고 <strong id="highDisplay">0</strong></span>
      </div>
    </header>

    <div id="gameWrapper">
      <canvas id="c" tabindex="0"></canvas>

      <div id="overlay" class="visible">
        <div id="overlayBox">
          <div id="overlayIcon">🎮</div>
          <p id="overlayMsg">게임 설명</p>
          <button id="startBtn">시작하기</button>
        </div>
      </div>
    </div>
  </div>
  <script src="/js/admob.js"></script>
  <script src="game.js"></script>
</body>
</html>
```

### 3. Write `style.css`

Copy from `public/arcade/snake/style.css` or `breakout/style.css` — adjust colors only.  
The layout is always: full-height flex column, `#hdr` fixed height, `#gameWrapper` fills remaining space.

### 4. Write `game.js`

Structure:
```javascript
// 게임이름 — 아케이드 솔로 게임
(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const ctx    = canvas.getContext('2d');

  // ── 상수 ──────────────────────────────────────────────────────
  const GRID = 20;
  // ... all hardcoded constants here

  // ── 상태 ──────────────────────────────────────────────────────
  let state = 'idle'; // idle | playing | dead | win
  let score, highScore;

  function loadHigh() {
    highScore = parseInt(localStorage.getItem('arcade_<gamename>_high') || '0', 10);
    document.getElementById('highDisplay').textContent = highScore;
  }

  function saveHigh() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('arcade_<gamename>_high', highScore);
      document.getElementById('highDisplay').textContent = highScore;
    }
  }

  // ── 게임 루프 ─────────────────────────────────────────────────
  let lastTime = 0;
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ── 게임 오버 ─────────────────────────────────────────────────
  function gameOver() {
    state = 'dead';
    saveHigh();
    if (window.AdMob) window.AdMob.showInterstitial();
    showOverlay('다시하기', restart);
  }

  // ── 시작 ──────────────────────────────────────────────────────
  document.getElementById('startBtn').addEventListener('click', start);
  loadHigh();
})();
```

Key rules for `game.js`:
- Single IIFE — no `export`, no `import`, no top-level `var`
- All constants hardcoded (no config object)
- Korean UI text in overlays and HUD
- `localStorage` key: `arcade_<gamename>_high` (or `_best`, `_score`)
- Call `window.AdMob.showInterstitial()` (from `/js/admob.js`) on game-over — it's a no-op on web

### 5. Add lobby card in `public/index.html`

Find the `<div class="arcade-cards">` section and add:

```html
<a class="arcade-card" href="/arcade/<gamename>/">
  <div class="arcade-card-icon">🎮</div>
  <div class="arcade-card-name">게임이름</div>
  <div class="arcade-card-desc">한 줄 설명<br>혼자하기</div>
  <span class="arcade-badge">솔로</span>
</a>
```

### 6. Add to smoke test

In `scripts/smoke-test.js`, add to the `ROUTES` array:

```javascript
{ path: '/arcade/<gamename>/', label: '/arcade/<gamename>/ → 200', expect: 200 },
```

---

## Checklist

- [ ] `public/arcade/<gamename>/index.html` created
- [ ] `public/arcade/<gamename>/style.css` created
- [ ] `public/arcade/<gamename>/game.js` created (IIFE, Korean UI)
- [ ] `← 로비` back button links to `/`
- [ ] High score saved to `localStorage`
- [ ] `window.AdMob.showInterstitial()` called on game-over
- [ ] Canvas resizes to fit `#gameWrapper` (call on `resize` event)
- [ ] Lobby card added in `public/index.html`
- [ ] Smoke test route added in `scripts/smoke-test.js`
- [ ] Manual test: play in browser, game-over, high score saves, back button works

---

## Sandbox → Arcade pipeline (optional)

If a sandbox prototype exists for this game type:
1. Open the sandbox locally: `npm run sandbox`
2. Use the sandbox to tune game balance (enemy counts, speeds, difficulty curves)
3. Export the config via the sandbox UI (`📤 Export JSON`)
4. Use the exported values as **reference constants** when writing the arcade `game.js`
5. The arcade game does NOT import the JSON at runtime — values are hardcoded

The sandbox is a design tool; the arcade game is the shipping product.

---

## Token budget

- Creating a new arcade game from scratch: ~5–8k tokens
- Adapting from a similar existing arcade game: ~2–3k tokens
- Adding a lobby card + smoke test entry: ~200 tokens
