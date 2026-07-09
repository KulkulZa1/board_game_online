// 월세 잭팟 — 슬롯 로그라이트 (UI/연출 레이어)
// 시뮬레이션 로직은 sim.js(window.Jackpot). 여기는 도파민 담당:
// 열 순차 정지 롤, 상승 피치 지급 팝, 코인 카운트업, 잭팟 색종이, 월세 도장.
(function () {
  'use strict';

  const { Run, SYMBOLS, RELICS, ROUTES, WORLD_EVENTS, COLS, CELLS, WIN_STAGE, rentFor } = window.Jackpot;

  const BEST_KEY = 'arcade_jackpot_best';
  const WINS_KEY = 'arcade_jackpot_wins';
  const MUTE_KEY = 'arcade_jackpot_muted';
  const FAST = !!window.__JACKPOT_FAST;           // 헤드리스 테스트용: 연출 시간 0
  const T = (ms) => (FAST ? 0 : ms);

  const $ = (id) => document.getElementById(id);
  const RARITY_KO = { common: '커먼', uncommon: '언커먼', rare: '레어' };

  // ── 사운드 (Web Audio 절차 효과음) ───────────────────────────────
  const Sound = (() => {
    let ctx, muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
    const ac = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; };
    function tone(freq, type, dur, vol, delay) {
      if (muted) return;
      try {
        const c = ac(); const t0 = c.currentTime + (delay || 0);
        const o = c.createOscillator(); const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = type; o.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.start(t0); o.stop(t0 + dur);
      } catch (e) {}
    }
    return {
      toggle() { muted = !muted; try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {} return muted; },
      isMuted: () => muted,
      resume() { try { const c = ac(); if (c.state === 'suspended') c.resume(); } catch (e) {} },
      thunk: () => tone(140, 'square', 0.08, 0.12),
      blip: (k) => tone(440 * Math.pow(1.059, Math.min(k, 24)), 'sine', 0.12, 0.1),
      bigPay: () => { tone(660, 'triangle', 0.2, 0.14); tone(990, 'triangle', 0.25, 0.12, 0.08); },
      jackpot: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 'triangle', 0.5, 0.15, i * 0.09)),
      paid: () => { tone(523, 'sine', 0.3, 0.14); tone(784, 'sine', 0.4, 0.14, 0.12); },
      evict: () => [300, 240, 180, 120].forEach((f, i) => tone(f, 'sawtooth', 0.4, 0.13, i * 0.16)),
      win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 'sine', 0.7, 0.16, i * 0.13)),
      pick: () => tone(880, 'sine', 0.1, 0.09),
    };
  })();
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ── 상태 ────────────────────────────────────────────────────────
  let run = null;
  let phase = 'idle';           // idle | rolling | paying | pick | over
  let endless = false;          // 승리 후 무한 모드
  let displayedCoins = 0;
  let coinAnimId = 0;
  let rollTimers = [];

  function loadBest() { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10); } catch (e) { return 0; } }
  function saveBest(stage) {
    const b = loadBest();
    if (stage > b) { try { localStorage.setItem(BEST_KEY, String(stage)); } catch (e) {} }
    $('bestDisp').textContent = Math.max(b, stage);
  }
  function addWin() {
    try { localStorage.setItem(WINS_KEY, String((parseInt(localStorage.getItem(WINS_KEY) || '0', 10)) + 1)); } catch (e) {}
  }

  // ── 그리드 구성 ─────────────────────────────────────────────────
  const ALL_ICONS = Object.values(SYMBOLS).map((s) => s.icon);
  function buildGrid() {
    const g = $('slotGrid'); g.innerHTML = '';
    for (let i = 0; i < CELLS; i++) {
      const c = document.createElement('div');
      c.className = 'cell'; c.dataset.idx = i;
      c.innerHTML = '<span class="sym"></span>';
      g.appendChild(c);
    }
  }
  const cellEl = (i) => document.querySelector(`.cell[data-idx="${i}"]`);
  function setCell(i, item) {
    const el = cellEl(i); if (!el) return;
    const sym = el.querySelector('.sym');
    sym.textContent = item ? run.displayIcon(item) : '';
    el.querySelectorAll('.piggy-badge').forEach((b) => b.remove());
    if (item && item.id === 'piggy' && item.bank > 0) {
      const b = document.createElement('span');
      b.className = 'piggy-badge'; b.textContent = item.bank;
      el.appendChild(b);
    }
  }

  // ── HUD ─────────────────────────────────────────────────────────
  function renderHUD() {
    $('stageLabel').textContent = run.won ? `${run.stage}단계 (무한)` : `${run.stage}단계 / ${WIN_STAGE}`;
    $('rentAmt').textContent = run.rent();
    $('deckCount').textContent = run.deck.length;
    const per = run.spinsPerRent();
    const dots = $('spinDots'); dots.innerHTML = '';
    for (let i = 0; i < per; i++) {
      const d = document.createElement('span');
      d.className = 'sdot' + (i < run.spinsIntoStage ? ' done' : '');
      dots.appendChild(d);
    }
    // 마지막 스핀인데 코인이 부족하면 위험 펄스
    const danger = run.spinsIntoStage === per - 1 && run.coins < run.rent();
    $('rentPanel').classList.toggle('danger', danger);
    animateCoins(run.coins);
    renderMeta();
    renderEventBanner();
  }

  // 유물 바 + 현재 동네 칩
  function renderMeta() {
    const route = ROUTES[run.route];
    $('routeChip').textContent = `${route.icon} ${route.name}`;
    $('routeChip').title = route.desc;
    const bar = $('relicBar'); bar.innerHTML = '';
    for (const id of run.relics) {
      const def = RELICS[id];
      const s = document.createElement('span');
      s.className = 'relic-chip';
      s.textContent = def.icon;
      s.title = `${def.name} — ${def.good} / 저주: ${def.bad}`;
      bar.appendChild(s);
    }
  }

  // 지속 월드 이벤트 배너
  function renderEventBanner() {
    const b = $('eventBanner');
    const ev = run.activeEvent;
    if (!ev) { b.classList.add('hidden'); return; }
    const def = WORLD_EVENTS[ev.id];
    b.textContent = `${def.icon} ${def.name} (${ev.remaining}스핀 남음) — ${def.desc}`;
    b.classList.toggle('good', def.kind === 'good');
    b.classList.remove('hidden');
  }

  function animateCoins(target) {
    cancelAnimationFrame(coinAnimId);
    const el = $('coinDisp');
    if (FAST) { el.textContent = target; displayedCoins = target; return; }
    const from = displayedCoins, t0 = performance.now(), dur = 380;
    const step = (ts) => {
      const k = Math.min(1, (ts - t0) / dur);
      displayedCoins = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = displayedCoins;
      if (k < 1) coinAnimId = requestAnimationFrame(step);
    };
    coinAnimId = requestAnimationFrame(step);
    const box = $('coinBox');
    box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
  }

  // ── 스핀 연출 ───────────────────────────────────────────────────
  function doSpin() {
    if (phase !== 'idle' || !run || run.state !== 'playing') return;
    const result = run.spin();
    if (!result) return;
    phase = 'rolling';
    $('spinBtn').disabled = true;
    $('payLine').textContent = ' ';
    $('payLine').classList.remove('mega');

    // 열 순차 정지 롤 — 각 칸이 아이콘을 빠르게 돌리다 왼쪽 열부터 멈춘다
    rollTimers.forEach(clearInterval); rollTimers = [];
    for (let i = 0; i < CELLS; i++) {
      const el = cellEl(i);
      el.className = 'cell rolling';
      const sym = el.querySelector('.sym');
      const iv = setInterval(() => {
        sym.textContent = ALL_ICONS[Math.floor(Math.random() * ALL_ICONS.length)];
      }, 55);
      rollTimers.push(iv);
    }
    const stopCol = (col) => {
      for (let r = 0; r < CELLS / COLS; r++) {
        const i = r * COLS + col;
        clearInterval(rollTimers[i]);
        cellEl(i).classList.remove('rolling');
        setCell(i, result.board[i]);
      }
      Sound.thunk();
    };
    if (FAST) {
      for (let c = 0; c < COLS; c++) stopCol(c);
      payoutSequence(result);
    } else {
      for (let c = 0; c < COLS; c++) setTimeout(() => stopCol(c), 300 + c * 140);
      setTimeout(() => payoutSequence(result), 300 + COLS * 140 + 120);
    }
  }

  // 지급 팝 — 읽기 순서로 하나씩, 피치가 계단식으로 올라간다
  function payoutSequence(result) {
    phase = 'paying';
    const evByIdx = {};
    for (const ev of result.events) {
      (evByIdx[ev.targetIdx != null ? ev.targetIdx : ev.idx] = evByIdx[ev.targetIdx != null ? ev.targetIdx : ev.idx] || []).push(ev);
    }
    const pays = result.pays.slice().sort((a, b) => a.idx - b.idx);
    let k = 0;
    const stepOne = () => {
      if (k >= pays.length) { finishSpin(result); return; }
      const p = pays[k];
      const el = cellEl(p.idx);
      if (el) {
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        const f = document.createElement('span');
        f.className = 'float-pay' + (p.amt >= 15 ? ' big' : '');
        f.textContent = '+' + p.amt;
        el.appendChild(f);
        setTimeout(() => f.remove(), T(900));
        // 이 칸의 이벤트 연출
        for (const ev of (evByIdx[p.idx] || [])) {
          if (ev.type === 'jackpot' || ev.type === 'burst') {
            el.classList.add('gold');
            $('flashLayer').classList.remove('go'); void $('flashLayer').offsetWidth;
            $('flashLayer').classList.add('go');
            confetti();
            Sound.jackpot();
            vibrate([30, 40, 60]);
            setTimeout(() => el.classList.remove('gold'), T(900));
          } else if (ev.type === 'eat' || ev.type === 'mine' || ev.type === 'break' || ev.type === 'clean') {
            const tgt = cellEl(ev.targetIdx);
            if (tgt) { tgt.classList.remove('shatter'); void tgt.offsetWidth; tgt.classList.add('shatter'); }
            Sound.bigPay();
          }
        }
      }
      if (p.amt >= 15) Sound.bigPay(); else Sound.blip(k);
      k++;
      setTimeout(stepOne, T(95));
    };
    if (pays.length) stepOne(); else finishSpin(result);
  }

  function confetti() {
    if (FAST) return;
    const layer = $('fxLayer');
    const glyphs = ['💰', '✨', '🪙', '⭐'];
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('span');
      s.className = 'confetti';
      s.textContent = glyphs[i % glyphs.length];
      s.style.left = (5 + Math.random() * 90) + '%';
      s.style.animationDelay = (Math.random() * 0.25) + 's';
      s.style.fontSize = (0.7 + Math.random() * 0.8) + 'rem';
      layer.appendChild(s);
      setTimeout(() => s.remove(), 1600);
    }
  }

  function finishSpin(result) {
    const pl = $('payLine');
    let txt = result.total > 0 ? `이번 스핀 +${result.total}` : '꽝... 다음 스핀!';
    if (result.extra && result.extra.length) {
      txt += '  (' + result.extra.map((e) => `${e.label} ${e.amt >= 0 ? '+' : ''}${e.amt}`).join(' · ') + ')';
    }
    pl.textContent = txt;
    if (result.total >= 40) { pl.classList.add('mega'); pl.textContent = `🔥 대박! +${result.total}`; }
    renderHUD();

    // 월드 이벤트 발동 토스트(도장 자리 재활용)
    if (result.firedEvent) {
      const ev = result.firedEvent;
      const stamp = $('stamp');
      stamp.textContent = `${ev.icon} ${ev.name}`;
      stamp.classList.toggle('bad', ev.kind === 'bad');
      stamp.classList.remove('hidden', 'show'); void stamp.offsetWidth; stamp.classList.add('show');
      if (ev.kind === 'bad') { Sound.evict(); vibrate(60); } else Sound.bigPay();
      if (ev.detail) pl.textContent += ` — ${ev.detail}`;
    }

    const next = () => {
      if (result.settle && result.settle.type === 'evicted') { showSettle(result.settle); return; }
      if (run.pendingRemoval) { afterMovingSettle = result.settle || null; showMoving(); return; }   // 이삿짐 정리 — 해소 필수
      if (result.settle) { showSettle(result.settle); return; }
      showPick(false);
    };
    setTimeout(next, T(result.firedEvent ? 900 : (result.settle ? 450 : 500)));
  }

  // ── 이삿짐 정리 — 덱에서 1장 버리기(선택) ───────────────────────
  function showMoving() {
    phase = 'pick';
    const list = $('movingList'); list.innerHTML = '';
    for (const d of run.deck) {
      const def = SYMBOLS[d.id];
      const b = document.createElement('button');
      b.className = `deck-item ${def.rarity} deck-remove`;
      b.innerHTML = `${run.displayIcon(d)} ${def.name}`;
      b.addEventListener('click', () => {
        run.removeCard(d.uid);
        Sound.pick();
        $('movingModal').classList.add('hidden');
        renderHUD();
        afterMoving();
      });
      list.appendChild(b);
    }
    $('movingModal').classList.remove('hidden');
  }
  let afterMovingSettle = null;
  function afterMoving() {
    const s = afterMovingSettle; afterMovingSettle = null;
    if (s) showSettle(s);
    else showPick(false);
  }

  // ── 월세 정산 연출 ──────────────────────────────────────────────
  function showSettle(settle) {
    const stamp = $('stamp');
    if (settle.type === 'evicted') {
      stamp.textContent = '월세 미납';
      stamp.classList.add('bad');
      stamp.classList.remove('hidden', 'show'); void stamp.offsetWidth; stamp.classList.add('show');
      Sound.evict();
      vibrate(150);
      setTimeout(() => gameOver(settle), T(1100));
      return;
    }
    if (settle.type === 'revived') {
      stamp.textContent = '👼 수호천사!';
      stamp.classList.remove('bad');
      stamp.classList.remove('hidden', 'show'); void stamp.offsetWidth; stamp.classList.add('show');
      Sound.jackpot();
      vibrate([30, 50, 30]);
      $('payLine').textContent = `수호천사가 퇴거를 막았다! 압류: ${settle.seized.join(', ')}`;
      saveBest(settle.stage);
      renderHUD();
      setTimeout(() => showRoute(false), T(1200));
      return;
    }
    stamp.textContent = '완납 ✓';
    stamp.classList.remove('bad');
    stamp.classList.remove('hidden', 'show'); void stamp.offsetWidth; stamp.classList.add('show');
    Sound.paid();
    vibrate([20, 30, 20]);
    saveBest(settle.stage);
    renderHUD();

    if (settle.type === 'won') {
      addWin();
      setTimeout(() => showVictory(settle), T(1100));
    } else {
      setTimeout(() => showRoute(settle.bonus), T(1000));   // 분기점: 동네 선택 → (유물) → 뽑기
    }
  }

  // ── 루트 분기 — 다음 동네 선택 ──────────────────────────────────
  let routeBonusNext = false;
  function showRoute(bonusAfter) {
    if (run.state !== 'playing' || !run.pendingRoutes) { showPick(false, bonusAfter); return; }
    routeBonusNext = !!bonusAfter;
    phase = 'pick';
    const wrap = $('routeCards'); wrap.innerHTML = '';
    run.pendingRoutes.forEach((rt, i) => {
      const btn = document.createElement('button');
      btn.className = 'pick-card route-card' + (rt.relic ? ' rare' : '');
      btn.innerHTML = `
        <span class="pick-ico">${rt.icon}</span>
        <span class="pick-body">
          <span class="pick-name">${rt.name} <span class="key-hint">${i + 1}</span></span>
          <span class="pick-desc">${rt.desc}</span>
        </span>`;
      btn.addEventListener('click', () => {
        run.chooseRoute(rt.id);
        Sound.pick();
        $('routeModal').classList.add('hidden');
        renderHUD();
        if (run.pendingRelics) setTimeout(() => showRelic(), T(150));
        else setTimeout(() => showPick(false, routeBonusNext), T(150));
      });
      wrap.appendChild(btn);
    });
    $('routeModal').classList.remove('hidden');
  }

  // ── 유물 선택 (유물 골목 입주 보상) ─────────────────────────────
  function showRelic() {
    if (!run.pendingRelics) { showPick(false, routeBonusNext); return; }
    phase = 'pick';
    const wrap = $('relicCards'); wrap.innerHTML = '';
    run.pendingRelics.forEach((rl, i) => {
      const btn = document.createElement('button');
      btn.className = 'pick-card rare relic-card';
      btn.innerHTML = `
        <span class="pick-ico">${rl.icon}</span>
        <span class="pick-body">
          <span class="pick-name">${rl.name} <span class="key-hint">${i + 1}</span></span>
          <span class="pick-desc">✨ ${rl.good}<br>☠️ 저주: ${rl.bad}</span>
        </span>`;
      btn.addEventListener('click', () => {
        run.chooseRelic(rl.id);
        Sound.jackpot();
        vibrate([20, 30, 40]);
        $('relicModal').classList.add('hidden');
        renderHUD();
        setTimeout(() => showPick(false, routeBonusNext), T(150));
      });
      wrap.appendChild(btn);
    });
    $('relicModal').classList.remove('hidden');
  }

  // ── 심볼 선택 ───────────────────────────────────────────────────
  let bonusQueued = false;
  function showPick(isBonus, queueBonus) {
    if (run.state !== 'playing') return;
    bonusQueued = !!queueBonus;
    phase = 'pick';
    const offers = run.offers(isBonus);
    const title = $('pickTitle');
    title.textContent = isBonus ? '💜 보너스 뽑기! (잉여 완납 보상)' : '🎁 심볼 하나를 골라 덱에 추가';
    title.classList.toggle('bonus', !!isBonus);
    const wrap = $('pickCards'); wrap.innerHTML = '';
    offers.forEach((id, i) => {
      const def = SYMBOLS[id];
      const btn = document.createElement('button');
      btn.className = `pick-card ${def.rarity}`;
      btn.innerHTML = `
        <span class="pick-ico">${def.icon}</span>
        <span class="pick-body">
          <span class="pick-name">${def.name}
            <span class="rarity-tag ${def.rarity}">${RARITY_KO[def.rarity]}</span>
            <span class="key-hint">${i + 1}</span></span>
          <span class="pick-desc">${def.desc}</span>
        </span>`;
      btn.addEventListener('click', () => resolvePick(id));
      wrap.appendChild(btn);
      if (def.rarity === 'rare') vibrate(15);
    });
    const sr = run.skipReward();
    $('skipBtn').innerHTML = sr > 0
      ? `건너뛰고 +${sr} 코인 <span class="key-hint">0</span>`
      : `건너뛴다 (마트 회원권: 보상 없음) <span class="key-hint">0</span>`;
    $('pickModal').classList.remove('hidden');
  }

  function resolvePick(id) {
    run.pick(id);
    Sound.pick();
    $('pickModal').classList.add('hidden');
    renderHUD();
    if (bonusQueued) { bonusQueued = false; setTimeout(() => showPick(true), T(180)); return; }
    phase = 'idle';
    $('spinBtn').disabled = false;
  }

  // ── 승리 / 게임오버 ─────────────────────────────────────────────
  function showVictory() {
    phase = 'over';
    Sound.win();
    vibrate([40, 60, 40, 60, 90]);
    confetti(); confetti();
    $('ovIcon').textContent = '🏠';
    $('ovTitle').textContent = '내 집 마련!';
    $('ovMsg').innerHTML =
      `<b>${WIN_STAGE}번의 월세</b>를 모두 완납하고 전세 지옥에서 탈출했습니다!<br>` +
      `총 수입 <b>${run.totalEarned}</b> 코인 · 최고 스핀 <b>+${run.bestSpin}</b> · 덱 <b>${run.deck.length}</b>장<br><br>` +
      `이대로 은퇴할까요, 아니면 건물주에 도전할까요?<br><span style="color:var(--muted);font-size:0.76rem">무한 모드: 월세가 계속 오릅니다</span>`;
    $('startBtn').textContent = '🏢 무한 모드 계속';
    $('bestLine').classList.add('hidden');
    $('overlay').classList.add('visible');
    endless = true;
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
    else if (window.AdMob) AdMob.showInterstitial();
  }

  function gameOver(settle) {
    phase = 'over';
    saveBest(run.stage - 1 + (run.won ? 1 : 0));
    const nearMiss = settle.shortfall <= Math.ceil(settle.rent * 0.2);
    $('ovIcon').textContent = '📦';
    $('ovTitle').textContent = run.won ? '건물주의 꿈, 여기까지' : '강제 퇴거...';
    $('ovMsg').innerHTML =
      (nearMiss ? `<b style="color:var(--bad)">겨우 ${settle.shortfall}코인이 부족했습니다!</b><br>` : `월세 ${settle.rent} 중 <b>${settle.shortfall}코인</b>이 부족했습니다.<br>`) +
      `${settle.stage}단계에서 퇴거 · 완납 <b>${run.rentsPaid}</b>회 · 총 수입 <b>${run.totalEarned}</b><br>` +
      (nearMiss ? '한 스핀만 더 터졌다면...' : '파괴 시너지(고양이+우유, 광부+보석)로 한 방을 노려보세요.');
    $('startBtn').textContent = '🔄 다시 입주';
    const best = loadBest();
    const bl = $('bestLine');
    bl.textContent = `🏆 최고 기록: ${best}단계 완납`;
    bl.classList.remove('hidden');
    $('overlay').classList.add('visible');
    endless = false;
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
    else if (window.AdMob) AdMob.showInterstitial();
  }

  // ── 시작 ────────────────────────────────────────────────────────
  function start() {
    Sound.resume();
    if (endless && run && run.state === 'playing') {
      // 무한 모드 계속 — 런 유지, 대기 중인 분기부터 해소
      endless = false;
      $('overlay').classList.remove('visible');
      phase = 'idle';
      $('spinBtn').disabled = false;
      if (run.pendingRoutes) showRoute(false);
      else showPick(false);
      return;
    }
    run = new Run();
    phase = 'idle';
    endless = false;
    displayedCoins = 0;
    buildGrid();
    renderHUD();
    $('payLine').textContent = ' ';
    $('overlay').classList.remove('visible');
    $('pickModal').classList.add('hidden');
    $('routeModal').classList.add('hidden');
    $('relicModal').classList.add('hidden');
    $('movingModal').classList.add('hidden');
    $('stamp').classList.add('hidden');
    $('spinBtn').disabled = false;
  }

  // ── 덱 뷰어 ─────────────────────────────────────────────────────
  function showDeck() {
    if (!run) return;
    const list = $('deckList'); list.innerHTML = '';
    for (const { id, n, def } of run.deckSummary()) {
      const d = document.createElement('div');
      d.className = `deck-item ${def.rarity}`;
      d.title = def.desc;
      d.innerHTML = `${def.icon} ${def.name} <span class="n">×${n}</span>`;
      list.appendChild(d);
    }
    $('deckModalCount').textContent = `(${run.deck.length}장)`;
    $('deckModal').classList.remove('hidden');
  }

  // ── 바인딩 ──────────────────────────────────────────────────────
  function init() {
    buildGrid();
    $('bestDisp').textContent = loadBest();
    const best = loadBest();
    if (best > 0) {
      const bl = $('bestLine');
      bl.textContent = `🏆 최고 기록: ${best}단계 완납`;
      bl.classList.remove('hidden');
    }
    $('startBtn').addEventListener('click', start);
    $('spinBtn').addEventListener('click', doSpin);
    $('skipBtn').addEventListener('click', () => resolvePick(null));
    $('movingSkip').addEventListener('click', () => {
      run.declineRemoval();
      $('movingModal').classList.add('hidden');
      afterMoving();
    });
    $('deckBtn').addEventListener('click', showDeck);
    $('deckClose').addEventListener('click', () => $('deckModal').classList.add('hidden'));
    $('deckModal').addEventListener('click', (e) => { if (e.target === $('deckModal')) $('deckModal').classList.add('hidden'); });
    const muteBtn = $('muteBtn');
    if (Sound.isMuted()) muteBtn.textContent = '🔇';
    muteBtn.addEventListener('click', () => { muteBtn.textContent = Sound.toggle() ? '🔇' : '🔊'; });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        if (phase === 'idle') { e.preventDefault(); doSpin(); }
        else if ($('overlay').classList.contains('visible')) { e.preventDefault(); start(); }
      } else if (phase === 'pick' && ['1', '2', '3', '4'].includes(e.key)) {
        // 열려 있는 모달(뽑기/루트/유물)에서 숫자키 선택
        const openSel = !$('routeModal').classList.contains('hidden') ? '#routeCards .pick-card'
          : !$('relicModal').classList.contains('hidden') ? '#relicCards .pick-card'
          : '#pickCards .pick-card';
        const btns = document.querySelectorAll(openSel);
        const b = btns[parseInt(e.key, 10) - 1];
        if (b) { e.preventDefault(); b.click(); }
      } else if (phase === 'pick' && e.key === '0' && !$('pickModal').classList.contains('hidden')) {
        e.preventDefault(); resolvePick(null);
      } else if (e.key === 'd' || e.key === 'D') {
        if ($('deckModal').classList.contains('hidden')) showDeck();
        else $('deckModal').classList.add('hidden');
      } else if (e.key === 'm' || e.key === 'M') {
        muteBtn.click();
      } else if (e.key === 'Escape') {
        $('deckModal').classList.add('hidden');
      }
    });
  }

  init();
})();
