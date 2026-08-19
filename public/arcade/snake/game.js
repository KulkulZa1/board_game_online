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
  const COMBO_WINDOW_MS = 3500;
  const RUSH_DURATION_MS = 6000;
  const GOLD_FOOD_CHANCE = 0.12;

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
  const comboEl    = document.getElementById('comboDisplay');
  const rushLabel  = document.getElementById('rushLabel');
  const rushFill   = document.getElementById('rushFill');
  const gameWrapper = document.getElementById('gameWrapper');
  const scaleEl    = document.getElementById('scaleDisplay');
  const mutTray    = document.getElementById('mutTray');
  const draftOverlay = document.getElementById('draftOverlay');
  const draftCards = document.getElementById('draftCards');
  const draftSub   = document.getElementById('draftSub');
  const evoBanner  = document.getElementById('evoBanner');
  const shopOverlay = document.getElementById('shopOverlay');
  const shopBtn    = document.getElementById('shopBtn');
  const shopClose  = document.getElementById('shopClose');
  const shopList   = document.getElementById('shopList');
  const shopScales = document.getElementById('shopScales');
  const runSummary = document.getElementById('runSummary');

  const R = window.SnakeRogue;   // 규칙/밸런스는 전부 sim.js 에 있다

  // ── Persistent state ─────────────────────────────────────────
  let highScore = +(localStorage.getItem('snake_hs') || 0);
  highEl.textContent = highScore;

  function loadMeta() {
    try { return R.normalizeMeta(JSON.parse(localStorage.getItem('snake_meta') || '{}')); }
    catch (e) { return R.normalizeMeta({}); }
  }
  function saveMeta(m) {
    meta = R.normalizeMeta(m);
    try { localStorage.setItem('snake_meta', JSON.stringify(meta)); } catch (e) {}
    renderScales();
  }
  let meta = loadMeta();
  function renderScales() { scaleEl.textContent = meta.scales; shopScales.textContent = meta.scales + ' 비늘'; }
  renderScales();

  // ── Game state ───────────────────────────────────────────────
  let snake, dir, nextDir, food, score, foodEaten, tickMs;
  let combo, bestCombo, lastEatAt, rushCharge, rushUntil;
  let running = false, lastTick = 0, animId = 0;
  let run = null;            // sim.js 런 상태 (돌연변이/진화 보유)
  let obstacles = [];        // 레벨이 오르면 늘어나는 장애물
  let drafting = false;      // 드래프트 중에는 루프가 멈춘다
  let extraFoods = [];       // 분열로 뿌려진 추가 먹이
  let floaters = [];         // 떠오르는 점수 숫자
  let shake = 0;             // 화면 흔들림

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
    run = R.createRun({ meta, seed: (Math.random() * 1e9) | 0 });
    const st = R.stats(run);
    const mid = Math.floor(COLS / 2);
    // 영구 강화 '짧은 시작' 은 시작 길이를 줄여 초반 사고를 줄인다
    const startLen = Math.max(2, 3 - (meta.upgrades.shortstart || 0));
    snake = [];
    for (let i = 0; i < startLen; i++) snake.push({ x: mid - i, y: 10 });
    dir      = { x: 1, y: 0 };
    nextDir  = { x: 1, y: 0 };
    score    = 0;
    foodEaten = 0;
    tickMs   = BASE_MS * st.speedMult;
    combo = 0;
    bestCombo = 0;
    lastEatAt = 0;
    rushCharge = (meta.upgrades.headstart || 0) * 25;   // 선행 충전
    rushUntil = 0;
    obstacles = [];
    extraFoods = [];
    floaters = [];
    shake = 0;
    drafting = false;
    scoreEl.textContent = 0;
    renderMomentum(0);
    setLevel(1, 0);
    renderMutTray();
    placeFood();
  }

  function occupiedSet() {
    const s = new Set(snake.map((p) => `${p.x},${p.y}`));
    obstacles.forEach((o) => s.add(`${o.x},${o.y}`));
    extraFoods.forEach((f) => s.add(`${f.x},${f.y}`));
    if (food) s.add(`${food.x},${food.y}`);
    return s;
  }
  function freeCell(occupied) {
    let f, guard = 0;
    do {
      f = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
    } while (occupied.has(`${f.x},${f.y}`) && guard++ < 400);
    return f;
  }

  function placeFood() {
    const st = R.stats(run);
    const f = freeCell(occupiedSet());
    const goldChance = (isRush(performance.now()) ? 0.32 : GOLD_FOOD_CHANCE) + st.goldChance;
    food = { ...f, type: Math.random() < goldChance ? 'gold' : 'normal' };
  }

  // 레벨이 오를 때 장애물을 목표 수까지 채운다 (긴장감을 서서히 올린다)
  function syncObstacles(level) {
    const want = R.obstacleCount(level);
    if (obstacles.length >= want) return;
    const head = snake[0];
    while (obstacles.length < want) {
      const occ = occupiedSet();
      const c = freeCell(occ);
      // 머리 바로 앞에 생기면 즉사라 억울하다 — 최소 거리를 둔다
      if (Math.abs(c.x - head.x) + Math.abs(c.y - head.y) < 4) continue;
      obstacles.push(c);
    }
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
    updateMomentum(ts);
    if (ts - lastTick >= tickMs) {
      lastTick = ts;
      tick();
    }
    draw();
  }

  function tick() {
    const st = R.stats(run);
    dir = nextDir;
    let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // 유령/공허의 뱀: 벽을 통과해 반대편으로
    if (st.wrap) {
      head.x = (head.x + COLS) % COLS;
      head.y = (head.y + ROWS) % ROWS;
    } else if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      if (!absorbHit()) return gameOver();
      return;                                   // 방어막으로 버텼으니 이번 틱은 제자리
    }

    if (obstacles.some((o) => o.x === head.x && o.y === head.y)) {
      if (!absorbHit()) return gameOver();
      return;
    }
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      // 공허의 뱀: 자기 몸에 부딪혀도 꼬리만 잃는다
      if (st.selfEat) {
        for (let i = 0; i < st.selfEat && snake.length > 3; i++) snake.pop();
        burst('🕳️', '#a78bfa');
        return;
      }
      if (!absorbHit()) return gameOver();
      return;
    }

    snake.unshift(head);

    // 자석: 주변 칸의 먹이를 끌어당긴다
    let ate = head.x === food.x && head.y === food.y;
    if (!ate && st.magnet) {
      const d = Math.max(Math.abs(head.x - food.x), Math.abs(head.y - food.y));
      if (d <= st.magnet) ate = true;
    }
    // 분열로 뿌려진 추가 먹이
    let extraIdx = extraFoods.findIndex((f) => {
      const d = Math.max(Math.abs(head.x - f.x), Math.abs(head.y - f.y));
      return d === 0 || (st.magnet && d <= st.magnet);
    });

    if (ate || extraIdx >= 0) {
      const gold = ate ? food.type === 'gold' : false;
      if (extraIdx >= 0 && !ate) extraFoods.splice(extraIdx, 1);
      eatFood(gold, st);
      if (ate) placeFood();
    } else {
      // 포식/거대화는 growth 만큼 덜 줄인다 (즉 더 자란다)
      snake.pop();
    }
  }

  // 방어막 소모. 남아 있으면 true (죽지 않음)
  function absorbHit() {
    const st = R.stats(run);
    if (st.shields <= 0) return false;
    run.shieldsUsed++;
    burst('🛡️', '#67e8f9');
    shake = Math.max(shake, 10);
    vibrate([40, 30, 40]);
    playShield();
    renderMutTray();
    return true;
  }

  function eatFood(gold, st) {
    const now = performance.now();
    const win = R.comboWindow(run, COMBO_WINDOW_MS);
    combo = lastEatAt && (now - lastEatAt <= win) ? combo + 1 : 1;
    bestCombo = Math.max(bestCombo, combo);
    lastEatAt = now;
    foodEaten++;

    const prevLv = run.level;
    const lv   = Math.floor(foodEaten / FOODS_PER_LEVEL) + 1;
    const fill = (foodEaten % FOODS_PER_LEVEL) / FOODS_PER_LEVEL;
    run.level = lv;
    setLevel(lv, fill);

    const gained = R.foodScore(run, { level: lv, combo, rush: isRush(now), gold });
    score += gained;
    run.score = score;
    run.bestCombo = bestCombo;
    addFloater(snake[0], '+' + gained, gold ? '#ffd166' : '#2effa5');

    rushCharge = Math.min(100, rushCharge + (gold ? 34 : 14));
    if (rushCharge >= 100 && !isRush(now)) activateRush(now);

    // 성장: growth 만큼 자란다 (기본 1). pop 을 건너뛴 만큼이 성장이다.
    for (let i = 1; i < st.growth; i++) snake.push({ ...snake[snake.length - 1] });

    // 속도: 기본 가속 + 광란 계열의 연쇄 가속
    const frenzy = 1 - Math.min(0.35, st.comboSpeedPer * (combo - 1));
    tickMs = Math.max(FLOOR_MS, (tickMs - SPEED_STEP) * (frenzy || 1));

    // 탈피: 주기적으로 꼬리를 떨군다 (생존 보상)
    if (st.moltEvery && foodEaten % st.moltEvery === 0) {
      for (let i = 0; i < st.moltAmount && snake.length > 3; i++) snake.pop();
      burst('🍂', '#fbbf24');
    }
    // 독니: 황금을 먹으면 꼬리가 녹는다
    if (gold && st.goldMolt) {
      for (let i = 0; i < st.goldMolt && snake.length > 3; i++) snake.pop();
    }
    // 분열: 황금이 추가 먹이를 뿌린다
    if (gold && st.splitSpawn) {
      const occ = occupiedSet();
      for (let i = 0; i < st.splitSpawn; i++) {
        const c = freeCell(occ);
        occ.add(`${c.x},${c.y}`);
        extraFoods.push(c);
      }
    }

    scoreEl.textContent = score;
    playEat(gold, combo);
    if (gold) { vibrate([18, 24, 18]); shake = Math.max(shake, 6); }

    if (lv > prevLv) {
      syncObstacles(lv);
      openDraft();          // 레벨업 = 빌드를 고르는 순간
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

    // 죽어도 남는 것 — 비늘 정산
    let earned = 0;
    if (run && score > 0) {
      run.score = score; run.bestCombo = bestCombo;
      earned = R.scalesEarned(run);
      saveMeta({ scales: meta.scales + earned, upgrades: meta.upgrades });
    }

    overlayIcon.textContent = isRecord ? '🏆' : '💀';
    overlayMsg.textContent  = score > 0
      ? `점수: ${score} · 최고 연쇄 x${bestCombo}${isRecord ? ' — 신기록!' : ''}`
      : '뱀을 움직여 사과를 먹으세요';

    if (score > 0 && run) {
      const owned = run.owned.map((id) => {
        const d = R.defOf(id);
        return d ? `<span class="rs-chip${R.EVO[id] ? ' evo' : ''}">${d.icon} ${d.name}</span>` : '';
      }).join('');
      runSummary.innerHTML =
        `<div class="rs-scales">🐚 <strong>+${earned}</strong> 비늘 획득 <em>(보유 ${meta.scales})</em></div>` +
        (owned ? `<div class="rs-build">${owned}</div>` : '') +
        (run.evolved.length ? `<div class="rs-evo">⚡ 진화 ${run.evolved.length}회</div>` : '');
      runSummary.classList.add('visible');
    } else {
      runSummary.classList.remove('visible');
      runSummary.innerHTML = '';
    }

    startBtn.textContent = score > 0 ? '다시 시작' : '시작하기';
    overlay.classList.add('visible');

    if (window.AdMobHelper && score > 0) AdMobHelper.showAfterGame();
  }

  // ── 드래프트 (레벨업마다 빌드를 고른다) ──────────────────────
  function openDraft() {
    const offers = R.draftOffers(run);
    if (!offers.length) return;                 // 풀이 마르면 그냥 진행
    drafting = true;
    running = false;
    cancelAnimationFrame(animId);
    draftSub.textContent = `Lv.${run.level} 도달 — 하나를 고르세요`;
    draftCards.innerHTML = offers.map((o, i) => `
      <button class="draft-card ${o.kind}" data-i="${i}">
        <span class="dc-icon">${o.icon}</span>
        <span class="dc-name">${o.name}</span>
        <span class="dc-desc">${o.desc}</span>
        ${o.kind === 'cursed' ? '<span class="dc-tag curse">저주</span>' : ''}
        ${o.kind === 'rare' ? '<span class="dc-tag rare">희귀</span>' : ''}
        ${o.evolvesInto ? `<span class="dc-evo">⚡ ${o.evolvesInto.icon} ${o.evolvesInto.name} 완성!</span>` : ''}
      </button>`).join('');
    draftOverlay.classList.add('visible');
    // 실수 방지 — 열리자마자의 클릭은 무시한다
    const armed = performance.now() + 320;
    draftCards.onclick = (e) => {
      const btn = e.target.closest('.draft-card');
      if (!btn) return;
      if (e.detail !== 0 && performance.now() < armed) return;
      pickMutation(offers[+btn.dataset.i]);
    };
  }

  function pickMutation(offer) {
    const evo = R.grant(run, offer.id);
    draftOverlay.classList.remove('visible');
    drafting = false;
    renderMutTray();
    // 속도 계열 돌연변이는 즉시 반영
    const st = R.stats(run);
    tickMs = Math.max(FLOOR_MS, Math.min(BASE_MS * st.speedMult, tickMs * st.speedMult));
    if (evo) showEvolution(evo);
    else playPick();
    resumeRun();
  }

  function resumeRun() {
    if (drafting) return;
    running = true;
    lastTick = performance.now();
    lastEatAt = lastEatAt ? performance.now() : 0;   // 드래프트 시간은 연쇄에서 빼준다
    animId = requestAnimationFrame(loop);
    canvas.focus();
  }

  function showEvolution(evo) {
    evoBanner.innerHTML =
      `<div class="evo-inner"><span class="evo-icon">${evo.icon}</span>` +
      `<strong>${evo.name}</strong><span class="evo-desc">${evo.desc}</span></div>`;
    evoBanner.classList.add('show');
    shake = Math.max(shake, 16);
    vibrate([40, 30, 60, 30, 80]);
    playEvolve();
    setTimeout(() => evoBanner.classList.remove('show'), 1900);
  }

  function renderMutTray() {
    if (!run) { mutTray.innerHTML = ''; return; }
    const st = R.stats(run);
    const chips = run.owned.map((id) => {
      const d = R.defOf(id);
      if (!d) return '';
      const evo = !!R.EVO[id];
      return `<span class="mut-chip${evo ? ' evo' : ''}${d.kind === 'cursed' ? ' curse' : ''}" title="${d.name} — ${d.desc}">${d.icon}</span>`;
    }).join('');
    const shieldChip = st.shields > 0 ? `<span class="mut-chip shield" title="방어막">🛡️${st.shields}</span>` : '';
    mutTray.innerHTML = chips + shieldChip;
  }

  // ── 비늘 상점 (죽어도 남는 진행) ──────────────────────────────
  function renderShop() {
    shopScales.textContent = meta.scales + ' 비늘';
    shopList.innerHTML = R.UPGRADES.map((u) => {
      const lv = meta.upgrades[u.id] || 0;
      const maxed = lv >= u.max;
      const cost = R.upgradeCost(u.id, meta);
      const afford = !maxed && meta.scales >= cost;
      return `<button class="shop-row${maxed ? ' maxed' : ''}${afford ? ' afford' : ''}" data-id="${u.id}" ${maxed || !afford ? 'disabled' : ''}>
        <span class="sr-icon">${u.icon}</span>
        <span class="sr-body">
          <strong>${u.name} ${lv > 0 ? `<em>Lv.${lv}${maxed ? ' MAX' : ''}</em>` : ''}</strong>
          <small>${u.desc(Math.min(u.max, lv + 1))}</small>
        </span>
        <span class="sr-cost">${maxed ? '완료' : '🐚 ' + cost}</span>
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
    playPick();
  });
  shopBtn.addEventListener('click', () => { renderShop(); shopOverlay.classList.add('visible'); });
  shopClose.addEventListener('click', () => shopOverlay.classList.remove('visible'));

  // ── 연출 ──────────────────────────────────────────────────────
  function addFloater(cellPos, text, color) {
    floaters.push({ x: cellPos.x, y: cellPos.y, text, color, t: performance.now() });
    if (floaters.length > 12) floaters.shift();
  }
  function burst(icon, color) {
    addFloater(snake[0], icon, color);
    shake = Math.max(shake, 8);
  }

  function isRush(now) { return rushUntil > (now || performance.now()); }

  function activateRush(now) {
    rushCharge = 100;
    rushUntil = now + RUSH_DURATION_MS;
    playRush();
    vibrate([30, 40, 30, 60]);
  }

  function updateMomentum(ts) {
    // 연쇄 유지 시간은 돌연변이가 바꾼다 (정지 세계는 아예 안 풀린다)
    const win = run ? R.comboWindow(run, COMBO_WINDOW_MS) : COMBO_WINDOW_MS;
    if (combo > 0 && ts - lastEatAt > win) combo = 0;
    if (isRush(ts)) {
      rushCharge = Math.max(0, (rushUntil - ts) / RUSH_DURATION_MS * 100);
    } else if (rushUntil) {
      rushUntil = 0;
      rushCharge = 0;
    }
    renderMomentum(ts);
  }

  function renderMomentum(ts) {
    comboEl.textContent = `x${Math.max(1, combo || 1)}`;
    comboEl.classList.toggle('hot', combo >= 3);
    rushFill.style.width = `${Math.max(0, Math.min(100, rushCharge))}%`;
    const active = isRush(ts || performance.now());
    rushLabel.textContent = active ? 'RUSH!' : 'RUSH';
    rushLabel.classList.toggle('active', active);
    gameWrapper.classList.toggle('rush', active);
  }

  // ── Renderer ─────────────────────────────────────────────────
  function draw() {
    const cs = cell();
    const W  = canvas.width;
    const H  = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // 화면 흔들림 — 황금/진화/피격 순간의 타격감
    if (shake > 0.4) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.86;
    } else shake = 0;

    // Grid lines
    ctx.strokeStyle = '#161b22';
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * cs, 0);  ctx.lineTo(i * cs, H);  ctx.stroke();
    }
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * cs);  ctx.lineTo(W, i * cs);  ctx.stroke();
    }

    // 장애물 — 레벨이 오를수록 판을 조여온다
    obstacles.forEach((o) => {
      const x = o.x * cs, y = o.y * cs;
      ctx.fillStyle = '#3d2b4f';
      ctx.strokeStyle = '#7c5ea8';
      ctx.lineWidth = Math.max(1, cs * 0.06);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x + 2, y + 2, cs - 4, cs - 4, cs * 0.18);
      else roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, cs * 0.18);
      ctx.fill(); ctx.stroke();
    });

    // 분열로 뿌려진 추가 먹이
    extraFoods.forEach((f) => {
      ctx.fillStyle = '#ff8fab';
      ctx.shadowColor = '#ff8fab'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(f.x * cs + cs * 0.5, f.y * cs + cs * 0.5, cs * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    if (food) {
      const fx = food.x * cs + cs * 0.5;
      const fy = food.y * cs + cs * 0.5;
      const r  = cs * 0.38;
      const gold = food.type === 'gold';
      ctx.shadowColor = gold ? '#ffd166' : '#ff4757';
      ctx.shadowBlur  = gold ? 18 : 10;
      ctx.fillStyle   = gold ? '#ffd166' : '#ff4757';
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
      // shine
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(fx - r * 0.25, fy - r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (gold) {
        ctx.strokeStyle = '#fff4bd';
        ctx.lineWidth = Math.max(1, cs * 0.07);
        ctx.beginPath();
        ctx.arc(fx, fy, r * 1.25, 0, Math.PI * 2);
        ctx.stroke();
      }
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
      if (isRush()) {
        ctx.shadowColor = i % 2 ? '#ffd166' : '#2effa5';
        ctx.shadowBlur = i === 0 ? 18 : 8;
      }

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, s, s, rad);
      } else {
        roundRect(ctx, x, y, s, s, rad);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Eyes on head
    if (snake.length > 0) {
      drawEyes(snake[0], cs);
    }

    // 떠오르는 점수 숫자 — 보상이 눈에 보이게
    const now = performance.now();
    floaters = floaters.filter((f) => now - f.t < 900);
    floaters.forEach((f) => {
      const age = (now - f.t) / 900;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = f.color;
      ctx.font = `700 ${Math.max(11, cs * 0.52)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText(f.text, f.x * cs + cs * 0.5, f.y * cs + cs * 0.4 - age * cs * 1.6);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'start';
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

  function playEat(gold, chain) {
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = 'square';
      o.frequency.setValueAtTime(gold ? 520 : 300 + Math.min(chain || 1, 8) * 25, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(gold ? 1560 : 900, a.currentTime + 0.07);
      g.gain.setValueAtTime(gold ? 0.18 : 0.12, a.currentTime);
      g.gain.linearRampToValueAtTime(0, a.currentTime + 0.1);
      o.start(); o.stop(a.currentTime + 0.1);
    } catch (_) {}
  }

  function playRush() {
    try {
      const a = ac();
      [440, 660, 880, 1320].forEach((freq, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.connect(g); g.connect(a.destination);
        o.type = 'triangle';
        const t = a.currentTime + i * 0.06;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.start(t); o.stop(t + 0.2);
      });
    } catch (_) {}
  }

  // 돌연변이 선택 — 짧고 기분 좋은 확정음
  function playPick() {
    try {
      const a = ac();
      [660, 990].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.connect(g); g.connect(a.destination);
        o.type = 'sine';
        const t = a.currentTime + i * 0.07;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.start(t); o.stop(t + 0.18);
      });
    } catch (_) {}
  }

  // 진화 — 판에서 제일 큰 순간이라 가장 화려하게
  function playEvolve() {
    try {
      const a = ac();
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.connect(g); g.connect(a.destination);
        o.type = i % 2 ? 'triangle' : 'square';
        const t = a.currentTime + i * 0.075;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o.start(t); o.stop(t + 0.32);
      });
    } catch (_) {}
  }

  // 방어막이 깨질 때 — 살았다는 신호
  function playShield() {
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(880, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(160, a.currentTime + 0.26);
      g.gain.setValueAtTime(0.18, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.3);
      o.start(); o.stop(a.currentTime + 0.3);
    } catch (_) {}
  }

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
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

  // 자동화 테스트용 훅 — ?debug=1 일 때만 노출된다. 일반 플레이에는 영향이 없다.
  // (드래프트까지 가려면 먹이를 5개 먹어야 해서 브라우저 테스트가 사실상 불가능하다)
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__snake = {
      feed() {                       // 다음 칸에 먹이를 놓아 즉시 먹게 한다
        if (!snake) return false;
        food = { x: snake[0].x + dir.x, y: snake[0].y + dir.y, type: 'normal' };
        return true;
      },
      grant(id) { const e = R.grant(run, id); renderMutTray(); if (e) showEvolution(e); return e; },
      state() {
        return {
          level: run ? run.level : 0, owned: run ? run.owned.slice() : [],
          evolved: run ? run.evolved.slice() : [], score, drafting,
          obstacles: obstacles.length, shields: run ? R.stats(run).shields : 0,
        };
      },
    };
  }

})();
