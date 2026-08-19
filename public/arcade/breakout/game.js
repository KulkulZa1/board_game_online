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
  const comboEl    = document.getElementById('comboDisplay');
  const feverLabel = document.getElementById('feverLabel');
  const feverFill  = document.getElementById('feverFill');
  const gameWrapper = document.getElementById('gameWrapper');
  const shardEl    = document.getElementById('shardDisplay');
  const gearTray   = document.getElementById('gearTray');
  const draftOverlay = document.getElementById('draftOverlay');
  const draftCards = document.getElementById('draftCards');
  const draftSub   = document.getElementById('draftSub');
  const fuseBanner = document.getElementById('fuseBanner');
  const shopOverlay = document.getElementById('shopOverlay');
  const shopBtn    = document.getElementById('shopBtn');
  const shopClose  = document.getElementById('shopClose');
  const shopList   = document.getElementById('shopList');
  const shopShards = document.getElementById('shopShards');
  const runSummary = document.getElementById('runSummary');

  const R = window.BreakoutRogue;   // 규칙/밸런스는 전부 sim.js 에

  // ── Config ───────────────────────────────────────────────────
  const COLS   = 10;
  const ROWS   = 6;
  const PAD_H  = 12;
  const PAD_GAP = 4;          // gap between bricks
  const BALL_BASE_SPEED = 5;
  const POWERUP_CHANCE  = 0.18;
  const FEVER_TARGET = 12;
  const FEVER_DURATION_MS = 6000;

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
  let combo, bestCombo, feverUntil;
  let running = false, animId = 0;

  highScore = +(localStorage.getItem('breakout_hs') || 0);
  highEl.textContent = highScore;

  // ── 로그라이트 상태 ──────────────────────────────────────────
  let run = null;          // sim.js 런 상태 (보유 장비/합성)
  let drafting = false;    // 드래프트 중에는 루프가 멈춘다
  let pierceLeft = 0;      // 스테이지당 관통 충전
  let revivesLeft = 0;     // 스테이지당 되살리기
  let sinceSplit = 0;      // 분열탄 카운터

  function loadMeta() {
    try { return R.normalizeMeta(JSON.parse(localStorage.getItem('breakout_meta') || '{}')); }
    catch (e) { return R.normalizeMeta({}); }
  }
  function saveMeta(m) {
    meta = R.normalizeMeta(m);
    try { localStorage.setItem('breakout_meta', JSON.stringify(meta)); } catch (e) {}
    renderShards();
  }
  let meta = loadMeta();
  function renderShards() { shardEl.textContent = meta.shards; shopShards.textContent = meta.shards + ' 부품'; }
  renderShards();

  function renderGearTray() {
    if (!run) { gearTray.innerHTML = ''; return; }
    gearTray.innerHTML = run.owned.map((id) => {
      const d = R.defOf(id);
      if (!d) return '';
      return `<span class="gear-chip${R.F[id] ? ' fused' : ''}${d.kind === 'cursed' ? ' curse' : ''}" title="${d.name} — ${d.desc}">${d.icon}</span>`;
    }).join('');
  }

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
    const gs = run ? R.stats(run).ballSpeedMult : 1;
    const spd = (BALL_BASE_SPEED + (level - 1) * 0.4) * gs;
    const a   = angle !== undefined ? angle : (-Math.PI / 2 + (Math.random() - 0.5) * 0.6);
    return { x: x || W / 2, y: y || H * 0.72, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7 };
  }

  function makePaddle() {
    return { x: W / 2, y: H - 40, w: W * 0.22 * (run ? R.paddleScale(run) : 1), h: PAD_H, wide: 0 };
  }

  function initLevel() {
    bricks     = buildBricks(level);
    totalBricks = bricks.length;
    particles  = [];
    powerups   = [];
    falling    = [];
    balls      = [makeBall()];
    if (!paddle) paddle = makePaddle();
    paddle.w   = W * 0.22 * (run ? R.paddleScale(run) : 1);
    // 스테이지마다 재충전되는 장비 효과
    const gs = run ? R.stats(run) : null;
    pierceLeft  = gs ? gs.pierceCharges : 0;
    revivesLeft = gs ? gs.revives : 0;
    sinceSplit  = 0;
    updateLevelBar();
  }

  function init() {
    run = R.createRun({ meta, seed: (Math.random() * 1e9) | 0 });
    drafting = false;
    score  = 0;
    lives  = R.startingLives(run);
    level  = 1;
    combo = 0;
    bestCombo = 0;
    feverUntil = 0;
    paddle = makePaddle();
    scoreEl.textContent = 0;
    livesEl.textContent = lives;
    renderGearTray();
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
    update(ts);
    draw();
  }

  function isFever(now) {
    return feverUntil > (now || performance.now());
  }

  function activateFever(now) {
    feverUntil = now + FEVER_DURATION_MS;
    playFever();
    vibrate([25, 35, 25, 55]);
  }

  function renderMomentum(ts) {
    const active = isFever(ts);
    const progress = active
      ? Math.max(0, (feverUntil - ts) / FEVER_DURATION_MS * 100)
      : (combo % FEVER_TARGET) / FEVER_TARGET * 100;
    comboEl.textContent = `x${Math.max(1, combo || 1)}`;
    comboEl.classList.toggle('hot', combo >= 4);
    feverFill.style.width = `${progress}%`;
    feverLabel.textContent = active ? 'FEVER!' : 'FEVER';
    feverLabel.classList.toggle('active', active);
    gameWrapper.classList.toggle('fever', active);
  }

  function update(ts) {
    renderMomentum(ts);
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
    if (balls.length === 0 && revivesLeft > 0) {
      // 되살리기 — 목숨을 쓰지 않고 공을 되돌린다
      revivesLeft--;
      balls = [makeBall()];
      showFuse({ icon: '🔁', name: '되살아났다!', desc: `남은 되살리기 ${revivesLeft}회` });
      playPowerup();
    } else if (balls.length === 0) {
      lives--;
      combo = 0;
      feverUntil = 0;
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
    const gs = R.stats(run);
    bricks.filter(b => b.alive).forEach(brick => {
      balls.forEach(ball => {
        if (!brickHit(ball, brick, gs)) return;
        brick.hp -= gs.brickDamage;
        if (brick.hp <= 0) {
          destroyBrick(brick, gs, true);
        } else {
          spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, '#fff', 3);
        }
      });
    });

    // Check level complete
    if (aliveBricks().length === 0) {
      level++;
      run.level = level;
      playLevelUp();
      openDraft();          // 스테이지 사이 = 빌드를 고르는 순간
    }

    // Particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x  += p.vx; p.y += p.vy; p.vy += 0.15;
      p.life--;
    });

    // Falling power-ups
    falling = falling.filter(f => f.y < H + 20);
    falling.forEach(f => {
      f.y += 2;
      if (gs.magnet) {                       // 자석 패들 — 가로로 끌어온다
        const pull = 0.6 * gs.magnet;
        f.x += Math.max(-pull, Math.min(pull, paddle.x - f.x));
      }
    });

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
  function brickHit(ball, brick, gs) {
    const bx = brick.x, by = brick.y, bw = brick.w, bh = brick.h;
    const nx = Math.max(bx, Math.min(ball.x, bx + bw));
    const ny = Math.max(by, Math.min(ball.y, by + bh));
    const dx = ball.x - nx, dy = ball.y - ny;
    if (dx * dx + dy * dy > ball.r * ball.r) return false;

    // 관통 — 철갑탄은 항상, 관통 장비는 충전이 남아 있는 동안 튕기지 않고 지나간다
    if (gs && (gs.alwaysPierce || pierceLeft > 0)) {
      if (!gs.alwaysPierce) pierceLeft--;
      return true;
    }

    // determine which face was hit
    const overlapX = ball.r - Math.abs(ball.x - (bx + bw / 2)) + bw / 2;
    const overlapY = ball.r - Math.abs(ball.y - (by + bh / 2)) + bh / 2;
    if (overlapX < overlapY) ball.vx = -ball.vx;
    else                      ball.vy = -ball.vy;
    return true;
  }


  // ── 드래프트 (스테이지 사이에 빌드를 고른다) ──────────────────
  function openDraft() {
    const offers = R.draftOffers(run);
    if (!offers.length) { setTimeout(() => { initLevel(); }, 300); return; }
    drafting = true;
    running = false;
    cancelAnimationFrame(animId);
    draftSub.textContent = `스테이지 ${level - 1} 클리어 — 하나를 고르세요`;
    draftCards.innerHTML = offers.map((o, i) => `
      <button class="draft-card ${o.kind}" data-i="${i}">
        <span class="dc-icon">${o.icon}</span>
        <span class="dc-name">${o.name}</span>
        <span class="dc-desc">${o.desc}</span>
        ${o.kind === 'cursed' ? '<span class="dc-tag curse">저주</span>' : ''}
        ${o.kind === 'rare' ? '<span class="dc-tag rare">희귀</span>' : ''}
        ${o.fusesInto ? `<span class="dc-evo">⚡ ${o.fusesInto.icon} ${o.fusesInto.name} 완성!</span>` : ''}
      </button>`).join('');
    draftOverlay.classList.add('visible');
    const armed = performance.now() + 320;      // 실수 방지 — 열리자마자의 클릭 무시
    draftCards.onclick = (e) => {
      const btn = e.target.closest('.draft-card');
      if (!btn) return;
      if (e.detail !== 0 && performance.now() < armed) return;
      pickGear(offers[+btn.dataset.i]);
    };
  }

  function pickGear(offer) {
    const fused = R.grant(run, offer.id);
    draftOverlay.classList.remove('visible');
    drafting = false;
    renderGearTray();
    // 목숨 관련 장비는 즉시 반영 (저주는 1로 묶는다)
    const gs = R.stats(run);
    if (gs.lockLives) lives = Math.min(lives, 1);
    else if (offer.mods && offer.mods.lives) lives += offer.mods.lives;
    livesEl.textContent = lives;

    if (fused) showFuse(fused);
    else playPowerup();
    initLevel();
    running = true;
    animId = requestAnimationFrame(loop);
  }

  function showFuse(item) {
    fuseBanner.innerHTML =
      `<div class="fuse-inner"><span class="fuse-icon">${item.icon}</span>` +
      `<strong>${item.name}</strong><span class="fuse-desc">${item.desc}</span></div>`;
    fuseBanner.classList.add('show');
    vibrate([40, 30, 60, 30, 80]);
    playFever();
    setTimeout(() => fuseBanner.classList.remove('show'), 1800);
  }

  // ── 부품 상점 (죽어도 남는 진행) ──────────────────────────────
  function renderShop() {
    shopShards.textContent = meta.shards + ' 부품';
    shopList.innerHTML = R.UPGRADES.map((u) => {
      const lv = meta.upgrades[u.id] || 0;
      const maxed = lv >= u.max;
      const cost = R.upgradeCost(u.id, meta);
      const afford = !maxed && meta.shards >= cost;
      return `<button class="shop-row${maxed ? ' maxed' : ''}${afford ? ' afford' : ''}" data-id="${u.id}" ${maxed || !afford ? 'disabled' : ''}>
        <span class="sr-icon">${u.icon}</span>
        <span class="sr-body">
          <strong>${u.name} ${lv > 0 ? `<em>Lv.${lv}${maxed ? ' MAX' : ''}</em>` : ''}</strong>
          <small>${u.desc(Math.min(u.max, lv + 1))}</small>
        </span>
        <span class="sr-cost">${maxed ? '완료' : '🔩 ' + cost}</span>
      </button>`;
    }).join('');
  }
  shopList.addEventListener('click', (e) => {
    const row = e.target.closest('.shop-row');
    if (!row || row.disabled) return;
    const res = R.buyUpgrade(meta, row.dataset.id);
    if (!res.ok) return;
    saveMeta(res.meta);
    renderShop();
    playPowerup();
  });
  shopBtn.addEventListener('click', () => { renderShop(); shopOverlay.classList.add('visible'); });
  shopClose.addEventListener('click', () => shopOverlay.classList.remove('visible'));

  // ── Power-ups ────────────────────────────────────────────────

  // 벽돌 파괴 — 점수/드롭/폭발/분열을 한곳에서 처리한다
  function destroyBrick(brick, gs, chain) {
    if (!brick.alive) return;
    brick.alive = false;
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    run.bestCombo = bestCombo;
    if (combo % FEVER_TARGET === 0) activateFever(performance.now());

    const pts = R.brickScore(run, { level, combo, brickHp: brick.maxHp, fever: isFever() });
    score += pts;
    run.score = score;
    scoreEl.textContent = score;
    spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 8);

    // 아이템 드롭 — 장비가 확률을 올린다
    const bonusDrop = gs.dropChance > 0 && Math.random() < gs.dropChance;
    if (brick.hasPowerup || bonusDrop || (isFever() && combo % 3 === 0)) spawnFalling(brick);

    // 분열탄 — 일정 개수마다 공이 늘어난다
    run.bricksBroken = (run.bricksBroken || 0) + 1;
    if (gs.splitEvery) {
      sinceSplit++;
      if (sinceSplit >= gs.splitEvery && balls.length < 12) {
        sinceSplit = 0;
        const src = balls[0];
        if (src) balls.push(makeBall(src.x, src.y, Math.atan2(src.vy, src.vx) + (Math.random() - 0.5) * 1.4));
      }
    }

    // 폭발탄 — 주변 벽돌까지 터진다 (chain 은 폭발의 무한 연쇄를 막는다)
    if (chain && gs.bombChance > 0 && Math.random() < gs.bombChance) {
      const cx = brick.x + brick.w / 2, cy = brick.y + brick.h / 2;
      const reach = brick.w * 1.35;
      spawnParticles(cx, cy, '#ffb703', 16);
      bricks.filter((b) => b.alive).forEach((b) => {
        const dx = (b.x + b.w / 2) - cx, dy = (b.y + b.h / 2) - cy;
        if (Math.abs(dx) <= reach && Math.abs(dy) <= brick.h * 1.6) destroyBrick(b, gs, false);
      });
      if (gs.bombSplits && balls.length < 12) {
        const src = balls[0];
        if (src) balls.push(makeBall(cx, cy, Math.random() * Math.PI * 2));
      }
    }

    playBreak(brick.maxHp);
    updateLevelBar();
  }

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
    // 죽어도 남는 것 — 부품 정산
    let earned = 0;
    if (run && score > 0) {
      run.score = score; run.bestCombo = bestCombo; run.level = level;
      earned = R.shardsEarned(run);
      saveMeta({ shards: meta.shards + earned, upgrades: meta.upgrades });
    }

    overlayIcon.textContent  = won ? '🎉' : '💀';
    overlayTitle.textContent = won ? `Level ${level - 1} 클리어!` : '게임 오버';
    overlayMsg.textContent   = `점수: ${score} · 최고 연쇄 x${bestCombo}${isRecord && score > 0 ? ' — 신기록!' : ''}`;

    if (score > 0 && run) {
      const owned = run.owned.map((id) => {
        const d = R.defOf(id);
        return d ? `<span class="rs-chip${R.F[id] ? ' fused' : ''}">${d.icon} ${d.name}</span>` : '';
      }).join('');
      runSummary.innerHTML =
        `<div class="rs-shards">🔩 <strong>+${earned}</strong> 부품 획득 <em>(보유 ${meta.shards})</em></div>` +
        (owned ? `<div class="rs-build">${owned}</div>` : '') +
        (run.fused.length ? `<div class="rs-fuse">⚡ 합성 ${run.fused.length}회</div>` : '');
      runSummary.classList.add('visible');
    } else {
      runSummary.classList.remove('visible');
      runSummary.innerHTML = '';
    }

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
  function playFever()    { [523,659,784,1047].forEach((f,i) => setTimeout(() => beep(f,0.18,'triangle',0.14), i*65)); }
  function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {} }

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

  // 자동화 테스트용 훅 — ?debug=1 일 때만 노출된다. 일반 플레이에는 영향이 없다.
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__breakout = {
      clearStage() {                 // 남은 벽돌을 모두 없애 스테이지를 끝낸다
        if (!bricks) return false;
        bricks.forEach((b) => { b.alive = false; });
        return true;
      },
      grant(id) { const f = R.grant(run, id); renderGearTray(); if (f) showFuse(f); return f; },
      state() {
        return {
          level, score, lives, drafting,
          owned: run ? run.owned.slice() : [],
          fused: run ? run.fused.slice() : [],
          balls: balls ? balls.length : 0,
        };
      },
    };
  }

})();
