/* Snake — v2 arcade game for 보드게임 온라인
 * Self-contained: no server state, no socket.io.
 * AdMobHelper.showAfterGame() called on game-over (no-op on web).
 */
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────
  const COLS = 20;
  const ROWS = 20;
  const BASE_MS  = 145;  // ms per tick at level 1
  const FLOOR_MS = 58;   // fastest tick
  const SPEED_STEP = 3;  // ms faster per food eaten
  const FOODS_PER_LEVEL = 5;
  const SCORE_BASE = 10;

  // ── DOM ──────────────────────────────────────────────────────
  const canvas     = document.getElementById('c');
  const ctx        = canvas.getContext('2d');
  const overlay    = document.getElementById('overlay');
  const overlayIcon = document.getElementById('overlayIcon');
  const overlayMsg = document.getElementById('overlayMsg');
  const startBtn   = document.getElementById('startBtn');
  const scoreEl    = document.getElementById('scoreDisplay');
  const highEl     = document.getElementById('highDisplay');
  const levelLabel = document.getElementById('levelLabel');
  const levelFill  = document.getElementById('levelFill');

  // ── Persistent state ─────────────────────────────────────────
  let highScore = +(localStorage.getItem('snake_hs') || 0);
  highEl.textContent = highScore;

  // ── Game state ───────────────────────────────────────────────
  let snake, dir, nextDir, food, score, foodEaten, tickMs;
  let running = false, lastTick = 0, animId = 0;

  // ── Sizing ───────────────────────────────────────────────────
  function resize() {
    const wrapper = canvas.parentElement;
    const available = Math.min(
      wrapper.offsetWidth  || window.innerWidth  - 24,
      window.innerHeight - 200,
      460
    );
    const cell = Math.max(14, Math.floor(available / COLS));
    canvas.width  = cell * COLS;
    canvas.height = cell * ROWS;
    if (running) draw();
  }

  function cell() { return canvas.width / COLS; }

  window.addEventListener('resize', resize);
  resize();

  // ── Initialization ───────────────────────────────────────────
  function init() {
    const mid = Math.floor(COLS / 2);
    snake    = [{ x: mid, y: 10 }, { x: mid - 1, y: 10 }, { x: mid - 2, y: 10 }];
    dir      = { x: 1, y: 0 };
    nextDir  = { x: 1, y: 0 };
    score    = 0;
    foodEaten = 0;
    tickMs   = BASE_MS;
    scoreEl.textContent = 0;
    setLevel(1, 0);
    placeFood();
  }

  function placeFood() {
    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    let f;
    do { f = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 }; }
    while (occupied.has(`${f.x},${f.y}`));
    food = f;
  }

  function setLevel(lv, fill) {
    levelLabel.textContent = `Lv.${lv}`;
    levelFill.style.width  = (fill * 100).toFixed(1) + '%';
    // colour shifts towards orange at high levels
    const t = Math.min(1, (lv - 1) / 10);
    levelFill.style.background =
      `linear-gradient(90deg, hsl(${150 - 80 * t},90%,55%), hsl(${210 - 80 * t},90%,65%))`;
  }

  // ── Game loop ────────────────────────────────────────────────
  function loop(ts) {
    if (!running) return;
    animId = requestAnimationFrame(loop);
    if (ts - lastTick >= tickMs) {
      lastTick = ts;
      tick();
    }
    draw();
  }

  function tick() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return gameOver();
    if (snake.some(s => s.x === head.x && s.y === head.y))             return gameOver();

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      foodEaten++;
      const lv    = Math.floor(foodEaten / FOODS_PER_LEVEL) + 1;
      const fill  = (foodEaten % FOODS_PER_LEVEL) / FOODS_PER_LEVEL;
      setLevel(lv, fill);
      score  += SCORE_BASE * lv;
      tickMs  = Math.max(FLOOR_MS, tickMs - SPEED_STEP);
      scoreEl.textContent = score;
      placeFood();
      playEat();
    } else {
      snake.pop();
    }
  }

  function gameOver() {
    running = false;
    cancelAnimationFrame(animId);

    const isRecord = score > 0 && score > highScore;
    if (isRecord) {
      highScore = score;
      localStorage.setItem('snake_hs', highScore);
      highEl.textContent = highScore;
    }

    draw();  // render final frame
    overlayIcon.textContent = isRecord ? '🏆' : '💀';
    overlayMsg.textContent  = score > 0
      ? `점수: ${score}${isRecord ? ' — 신기록!' : ''}`
      : '뱀을 움직여 사과를 먹으세요';
    startBtn.textContent = score > 0 ? '다시 시작' : '시작하기';
    overlay.classList.add('visible');

    if (window.AdMobHelper && score > 0) AdMobHelper.showAfterGame();
  }

  // ── Renderer ─────────────────────────────────────────────────
  function draw() {
    const cs = cell();
    const W  = canvas.width;
    const H  = canvas.height;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#161b22';
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * cs, 0);  ctx.lineTo(i * cs, H);  ctx.stroke();
    }
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * cs);  ctx.lineTo(W, i * cs);  ctx.stroke();
    }

    // Food — glowing red circle
    if (food) {
      const fx = food.x * cs + cs * 0.5;
      const fy = food.y * cs + cs * 0.5;
      const r  = cs * 0.38;
      ctx.shadowColor = '#ff4757';
      ctx.shadowBlur  = 10;
      ctx.fillStyle   = '#ff4757';
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
      // shine
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(fx - r * 0.25, fy - r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Snake body
    const len = snake.length;
    snake.forEach((seg, i) => {
      const t   = 1 - i / Math.max(len - 1, 1);
      const pad = i === 0 ? 1 : 2;
      const x   = seg.x * cs + pad;
      const y   = seg.y * cs + pad;
      const s   = cs - pad * 2;
      const rad = i === 0 ? cs * 0.32 : cs * 0.22;

      // colour gradient: head bright green → tail dark green
      const r = Math.round(0x12 + (0x2e - 0x12) * t);
      const g = Math.round(0x6a + (0xff - 0x6a) * t);
      const b = Math.round(0x48 + (0xa5 - 0x48) * t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, s, s, rad);
      } else {
        roundRect(ctx, x, y, s, s, rad);
      }
      ctx.fill();
    });

    // Eyes on head
    if (snake.length > 0) {
      drawEyes(snake[0], cs);
    }
  }

  function drawEyes(head, cs) {
    const cx = head.x * cs + cs * 0.5;
    const cy = head.y * cs + cs * 0.5;
    const er = cs * 0.1;
    const spread = cs * 0.2;

    // eye offsets relative to travel direction
    let e1, e2;
    if (dir.x === 1)       { e1 = { x: cx + cs*0.18, y: cy - spread }; e2 = { x: cx + cs*0.18, y: cy + spread }; }
    else if (dir.x === -1) { e1 = { x: cx - cs*0.18, y: cy - spread }; e2 = { x: cx - cs*0.18, y: cy + spread }; }
    else if (dir.y === -1) { e1 = { x: cx - spread, y: cy - cs*0.18 }; e2 = { x: cx + spread, y: cy - cs*0.18 }; }
    else                   { e1 = { x: cx - spread, y: cy + cs*0.18 }; e2 = { x: cx + spread, y: cy + cs*0.18 }; }

    ctx.fillStyle = '#0d1117';
    [e1, e2].forEach(e => {
      ctx.beginPath(); ctx.arc(e.x, e.y, er, 0, Math.PI * 2); ctx.fill();
    });
  }

  // polyfill for Safari < 15.4
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  // ── Sound ────────────────────────────────────────────────────
  let _ac;
  function ac() {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    return _ac;
  }

  function playEat() {
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = 'square';
      o.frequency.setValueAtTime(300, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(900, a.currentTime + 0.07);
      g.gain.setValueAtTime(0.12, a.currentTime);
      g.gain.linearRampToValueAtTime(0, a.currentTime + 0.1);
      o.start(); o.stop(a.currentTime + 0.1);
    } catch (_) {}
  }

  // ── Input ────────────────────────────────────────────────────
  const KEY_MAP = {
    ArrowUp:    { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
    ArrowDown:  { x: 0, y:  1 }, s: { x: 0, y:  1 }, S: { x: 0, y:  1 },
    ArrowLeft:  { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
    ArrowRight: { x:  1, y: 0 }, d: { x:  1, y: 0 }, D: { x:  1, y: 0 },
  };

  function tryDir(d) {
    if (!d) return;
    if (d.x === -dir.x && d.y === -dir.y) return;  // can't reverse
    nextDir = d;
  }

  document.addEventListener('keydown', e => {
    const d = KEY_MAP[e.key];
    if (d) { tryDir(d); e.preventDefault(); }
    if ((e.key === ' ' || e.key === 'Enter') && !running) startGame();
  });

  // D-pad
  document.querySelectorAll('#dpad button[data-dir]').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      tryDir(KEY_MAP['Arrow' + btn.dataset.dir]);
    });
  });

  // Touch swipe on canvas
  let _touch = null;
  canvas.addEventListener('touchstart', e => {
    _touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (!_touch) return;
    const dx = e.changedTouches[0].clientX - _touch.x;
    const dy = e.changedTouches[0].clientY - _touch.y;
    _touch = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    if (Math.abs(dx) >= Math.abs(dy)) tryDir(dx > 0 ? KEY_MAP.ArrowRight : KEY_MAP.ArrowLeft);
    else                               tryDir(dy > 0 ? KEY_MAP.ArrowDown  : KEY_MAP.ArrowUp);
  }, { passive: false });

  // ── Start / Restart ──────────────────────────────────────────
  function startGame() {
    overlay.classList.remove('visible');
    init();
    running  = true;
    lastTick = 0;
    if (window.AdMobHelper) AdMobHelper.init();
    animId = requestAnimationFrame(loop);
    canvas.focus();
  }

  startBtn.addEventListener('click', startGame);

})();
