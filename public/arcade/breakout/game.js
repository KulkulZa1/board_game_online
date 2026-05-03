/* Breakout (벽돌깨기) — v2 arcade game for 보드게임 온라인
 * Self-contained IIFE. No server state. requestAnimationFrame loop.
 * Features: multi-level, power-ups (wide, multi-ball, slow), particles,
 *           mouse + touch paddle, progressive difficulty.
 */
(function () {
  'use strict';

  // ── DOM ──────────────────────────────────────────────────────
  const canvas     = document.getElementById('c');
  const ctx        = canvas.getContext('2d');
  const overlay    = document.getElementById('overlay');
  const overlayIcon  = document.getElementById('overlayIcon');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMsg   = document.getElementById('overlayMsg');
  const startBtn   = document.getElementById('startBtn');
  const scoreEl    = document.getElementById('scoreDisplay');
  const highEl     = document.getElementById('highDisplay');
  const livesEl    = document.getElementById('livesDisplay');
  const levelLabel = document.getElementById('levelLabel');
  const brickFill  = document.getElementById('brickFill');

  // ── Config ───────────────────────────────────────────────────
  const COLS   = 10;
  const ROWS   = 6;
  const PAD_H  = 12;
  const PAD_GAP = 4;          // gap between bricks
  const BALL_BASE_SPEED = 5;
  const POWERUP_CHANCE  = 0.18;

  const BRICK_COLORS = [
    '#ff4757','#ff6b81','#ffa502',
    '#2ecc71','#1e90ff','#9b59b6',
  ];
  const POWERUP_TYPES = ['wide','slow','multi'];
  const POWERUP_COLOR = { wide:'#f7931e', slow:'#2ecc71', multi:'#9b59b6' };

  // ── State ────────────────────────────────────────────────────
  let W, H, brickW, brickH, brickTop;
  let paddle, balls, bricks, particles, powerups, falling;
  let score, lives, level, totalBricks, highScore;
  let running = false, animId = 0;

  highScore = +(localStorage.getItem('breakout_hs') || 0);
  highEl.textContent = highScore;

  // ── Sizing ───────────────────────────────────────────────────
  function resize() {
    const avail = Math.min(
      window.innerWidth - 24,
      window.innerHeight - 120,
      520
    );
    W = avail;
    H = Math.round(avail * 1.35);
    canvas.width  = W;
    canvas.height = H;
    brickW  = (W - PAD_GAP * (COLS + 1)) / COLS;
    brickH  = Math.max(18, brickW * 0.45);
    brickTop = 54;
  }

  window.addEventListener('resize', () => { resize(); if (!running) drawStatic(); });
  resize();

  // ── Brick builder ────────────────────────────────────────────
  function buildBricks(lv) {
    const b = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const hp = Math.min(3, 1 + Math.floor(lv / 3));
        b.push({
          x: PAD_GAP + c * (brickW + PAD_GAP),
          y: brickTop + r * (brickH + PAD_GAP),
          w: brickW, h: brickH,
          alive: true, hp, maxHp: hp,
          color: BRICK_COLORS[r % BRICK_COLORS.length],
          hasPowerup: Math.random() < POWERUP_CHANCE,
          powerupType: POWERUP_TYPES[(Math.random() * POWERUP_TYPES.length) | 0],
        });
      }
    }
    return b;
  }

  function aliveBricks() { return bricks.filter(b => b.alive); }

  // ── Init ─────────────────────────────────────────────────────
  function makeBall(x, y, angle) {
    const spd = BALL_BASE_SPEED + (level - 1) * 0.4;
    const a   = angle !== undefined ? angle : (-Math.PI / 2 + (Math.random() - 0.5) * 0.6);
    return { x: x || W / 2, y: y || H * 0.72, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7 };
  }

  function makePaddle() {
    return { x: W / 2, y: H - 40, w: W * 0.22, h: PAD_H, wide: 0 };
  }

  function initLevel() {
    bricks     = buildBricks(level);
    totalBricks = bricks.length;
    particles  = [];
    powerups   = [];
    falling    = [];
    balls      = [makeBall()];
    if (!paddle) paddle = makePaddle();
    paddle.w   = W * 0.22;
    updateLevelBar();
  }

  function init() {
    score  = 0;
    lives  = 3;
    level  = 1;
    paddle = makePaddle();
    scoreEl.textContent = 0;
    livesEl.textContent = 3;
    initLevel();
  }

  function updateLevelBar() {
    levelLabel.textContent = `Level ${level}`;
    const alive = aliveBricks().length;
    brickFill.style.width = ((1 - alive / totalBricks) * 100).toFixed(1) + '%';
  }

  // ── Game loop ────────────────────────────────────────────────
  function loop(ts) {
    if (!running) return;
    animId = requestAnimationFrame(loop);
    update();
    draw();
  }

  function update() {
    // Move balls
    balls.forEach(ball => {
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Wall collisions
      if (ball.x - ball.r < 0)  { ball.x = ball.r;     ball.vx = Math.abs(ball.vx); playBounce(0.07); }
      if (ball.x + ball.r > W)   { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); playBounce(0.07); }
      if (ball.y - ball.r < 0)   { ball.y = ball.r;     ball.vy = Math.abs(ball.vy); playBounce(0.07); }

      // Paddle collision
      const pd = paddle;
      const pw = pd.wide > 0 ? pd.w * 1.6 : pd.w;
      if (ball.vy > 0 &&
          ball.y + ball.r >= pd.y && ball.y - ball.r <= pd.y + pd.h &&
          ball.x >= pd.x - pw / 2 && ball.x <= pd.x + pw / 2) {
        const rel = (ball.x - pd.x) / (pw / 2);
        const angle = rel * (Math.PI / 3) - Math.PI / 2;
        const spd = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.cos(angle) * spd;
        ball.vy = -Math.abs(Math.sin(angle) * spd);
        ball.y  = pd.y - ball.r;
        playBounce(0.12);
      }
    });

    // Remove fallen balls
    const before = balls.length;
    balls = balls.filter(b => b.y - b.r < H);
    if (balls.length === 0) {
      lives--;
      livesEl.textContent = lives;
      if (lives <= 0) {
        gameOver(false);
        return;
      }
      balls = [makeBall()];
      playDeath();
    } else if (balls.length < before) {
      playBounce(0.05);
    }

    // Brick collisions
    bricks.filter(b => b.alive).forEach(brick => {
      balls.forEach(ball => {
        if (!brickHit(ball, brick)) return;
        brick.hp--;
        if (brick.hp <= 0) {
          brick.alive = false;
          const pts = 10 * level * brick.maxHp;
          score += pts;
          scoreEl.textContent = score;
          spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 8);
          if (brick.hasPowerup) spawnFalling(brick);
          playBreak(brick.maxHp);
          updateLevelBar();
        } else {
          spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, '#fff', 3);
        }
      });
    });

    // Check level complete
    if (aliveBricks().length === 0) {
      level++;
      setTimeout(() => initLevel(), 300);
      playLevelUp();
    }

    // Particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x  += p.vx; p.y += p.vy; p.vy += 0.15;
      p.life--;
    });

    // Falling power-ups
    falling = falling.filter(f => f.y < H + 20);
    falling.forEach(f => { f.y += 2; });

    // Power-up collection
    falling.forEach((f, i) => {
      const pw = paddle.wide > 0 ? paddle.w * 1.6 : paddle.w;
      if (f.y + 10 >= paddle.y && f.y - 10 <= paddle.y + PAD_H &&
          f.x >= paddle.x - pw / 2 && f.x <= paddle.x + pw / 2) {
        applyPowerup(f.type);
        falling.splice(i, 1);
      }
    });

    // Power-up timers
    if (paddle.wide > 0) paddle.wide--;
  }

  // ── Collision ────────────────────────────────────────────────
  function brickHit(ball, brick) {
    const bx = brick.x, by = brick.y, bw = brick.w, bh = brick.h;
    const nx = Math.max(bx, Math.min(ball.x, bx + bw));
    const ny = Math.max(by, Math.min(ball.y, by + bh));
    const dx = ball.x - nx, dy = ball.y - ny;
    if (dx * dx + dy * dy > ball.r * ball.r) return false;

    // determine which face was hit
    const overlapX = ball.r - Math.abs(ball.x - (bx + bw / 2)) + bw / 2;
    const overlapY = ball.r - Math.abs(ball.y - (by + bh / 2)) + bh / 2;
    if (overlapX < overlapY) ball.vx = -ball.vx;
    else                      ball.vy = -ball.vy;
    return true;
  }

  // ── Power-ups ────────────────────────────────────────────────
  function spawnFalling(brick) {
    falling.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, type: brick.powerupType });
  }

  function applyPowerup(type) {
    if (type === 'wide')  { paddle.wide = 300; playPowerup(); }
    if (type === 'slow')  { balls.forEach(b => { b.vx *= 0.7; b.vy *= 0.7; }); playPowerup(); }
    if (type === 'multi') {
      const extra = balls.slice(0, 2).map(b =>
        makeBall(b.x, b.y, Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * 1.2)
      );
      balls.push(...extra);
      playPowerup();
    }
  }

  // ── Particles ────────────────────────────────────────────────
  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
                       color, size: 2 + Math.random() * 3, life: 25 + (Math.random() * 15) | 0 });
    }
  }

  // ── Draw ─────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Bricks
    bricks.forEach(brick => {
      if (!brick.alive) return;
      const alpha = 0.4 + 0.6 * (brick.hp / brick.maxHp);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 4);
      ctx.fill();
      if (brick.hp > 1) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (brick.hasPowerup && brick.alive) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = POWERUP_COLOR[brick.powerupType] || '#fff';
        ctx.beginPath();
        ctx.arc(brick.x + brick.w - 6, brick.y + 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // Falling power-ups
    falling.forEach(f => {
      ctx.fillStyle = POWERUP_COLOR[f.type] || '#fff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(f.x - 14, f.y - 8, 28, 16, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.type === 'wide' ? '▬+' : f.type === 'slow' ? '⏱' : '✕3', f.x, f.y);
    });

    // Particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 40;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Paddle
    const pw = paddle.wide > 0 ? paddle.w * 1.6 : paddle.w;
    const px = paddle.x - pw / 2;
    const grad = ctx.createLinearGradient(px, paddle.y, px + pw, paddle.y + PAD_H);
    grad.addColorStop(0, '#f7931e');
    grad.addColorStop(1, '#ff6b35');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(px, paddle.y, pw, PAD_H, 6);
    ctx.fill();
    if (paddle.wide > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Balls
    balls.forEach(ball => {
      ctx.shadowColor = '#fff';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = '#fff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Game over / win ──────────────────────────────────────────
  function gameOver(won) {
    running = false;
    cancelAnimationFrame(animId);
    const isRecord = score > highScore;
    if (isRecord) {
      highScore = score;
      localStorage.setItem('breakout_hs', highScore);
      highEl.textContent = highScore;
    }
    overlayIcon.textContent  = won ? '🎉' : '💀';
    overlayTitle.textContent = won ? `Level ${level - 1} 클리어!` : '게임 오버';
    overlayMsg.textContent   = `점수: ${score}${isRecord && score > 0 ? ' — 신기록!' : ''}`;
    startBtn.textContent     = '다시 시작';
    overlay.classList.add('visible');
    if (window.AdMobHelper && score > 0) AdMobHelper.showAfterGame();
  }

  // ── Input ────────────────────────────────────────────────────
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    paddle.x = Math.max(0, Math.min(W, e.clientX - rect.left));
  });

  canvas.addEventListener('touchmove', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    paddle.x = Math.max(0, Math.min(W, (e.touches[0].clientX - rect.left) * scaleX));
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !running) { startGame(); return; }
    if (!running) return;
    const speed = 18;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') paddle.x = Math.max(0, paddle.x - speed);
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') paddle.x = Math.min(W, paddle.x + speed);
    e.preventDefault();
  });

  // ── Sound (Web Audio API) ────────────────────────────────────
  let _ac;
  function getAc() { if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)(); return _ac; }

  function beep(freq, dur, type, vol) {
    try {
      const a = getAc(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, a.currentTime);
      g.gain.setValueAtTime(vol || 0.1, a.currentTime);
      g.gain.linearRampToValueAtTime(0, a.currentTime + dur);
      o.start(); o.stop(a.currentTime + dur);
    } catch (_) {}
  }

  function playBounce(v)  { beep(220, 0.05, 'square', v); }
  function playBreak(hp)  { beep(330 + hp * 100, 0.12, 'sawtooth', 0.15); }
  function playDeath()    { beep(150, 0.3, 'sawtooth', 0.2); }
  function playPowerup()  { beep(660, 0.1, 'sine', 0.15); setTimeout(() => beep(880, 0.1, 'sine', 0.15), 100); }
  function playLevelUp()  { [440,550,660,880].forEach((f,i) => setTimeout(() => beep(f,0.12,'sine',0.15), i*80)); }

  // ── Start ────────────────────────────────────────────────────
  function startGame() {
    overlay.classList.remove('visible');
    init();
    running = true;
    if (window.AdMobHelper) AdMobHelper.init();
    animId = requestAnimationFrame(loop);
    canvas.focus();
  }

  startBtn.addEventListener('click', startGame);
  drawStatic();

})();
