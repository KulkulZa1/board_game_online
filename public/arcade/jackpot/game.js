// 월세 잭팟 — 슬롯 로그라이트 (UI/연출 레이어)
// 시뮬레이션 로직은 sim.js(window.Jackpot). 여기는 도파민 담당:
// 열 순차 정지 롤, 상승 피치 지급 팝, 코인 카운트업, 잭팟 색종이, 월세 도장.
(function () {
  'use strict';

  const { Run, SYMBOLS, RELICS, ROUTES, WORLD_EVENTS, COLS, CELLS, WIN_STAGE, rentFor } = window.Jackpot;

  const BEST_KEY = 'arcade_jackpot_best';
  const WINS_KEY = 'arcade_jackpot_wins';
  const MUTE_KEY = 'arcade_jackpot_muted';
  const TURBO_KEY = 'arcade_jackpot_turbo';
  const FAST = !!window.__JACKPOT_FAST;           // 헤드리스 테스트용: 연출 시간 0
  let turbo = false;
  try { turbo = localStorage.getItem(TURBO_KEY) === '1'; } catch (e) {}
  const T = (ms) => (FAST ? 0 : Math.round(ms * (turbo ? 0.45 : 1)));

  const $ = (id) => document.getElementById(id);
  // 방어적 바인딩 — 요소가 없으면(구버전 HTML 캐시 등) 조용히 건너뛴다.
  // HTML/JS 버전이 어긋나도 게임 시작 자체가 벽돌이 되지 않게 하는 안전망.
  const onEl = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); return el; };
  const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
  const RARITY_KO = { common: '커먼', uncommon: '언커먼', rare: '레어' };

  // 전역 오류 표시 — 조용한 실패 대신 화면에 알린다
  window.addEventListener('error', (e) => {
    const el = $('payLine');
    if (el) el.textContent = '⚠ 오류가 발생했습니다: ' + (e.message || '알 수 없음');
  });

  // ── 오터치 가드 — 모달/오버레이가 뜬 직후 잠깐 입력을 무시한다 ────
  // 스핀 연타 중 선택지가 갑자기 나타나면 진행 중이던 탭이 카드에 꽂힌다.
  // 열릴 때 armGuard() → 380ms 동안 카드/버튼 클릭 무효(키보드 선택은 즉시 허용).
  let modalGuardUntil = 0;
  function armGuard() { modalGuardUntil = performance.now() + (FAST ? 0 : 380); }
  function guarded(e) {
    if (e && e.detail === 0) return false;   // 키보드 유래 클릭(detail 0)은 통과
    return performance.now() < modalGuardUntil;
  }

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
      tension: () => [392, 440, 494, 523].forEach((f, i) => tone(f, 'square', 0.09, 0.07, i * 0.13)),   // 잭팟 예감 두근두근
      fever: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 'sawtooth', 0.22, 0.1, i * 0.07)),
      mega: () => [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 'triangle', 0.55, 0.15, i * 0.08)),
      fuse: () => [330, 392, 494, 659, 988].forEach((f, i) => tone(f, 'sawtooth', 0.18, 0.11, i * 0.06)),   // ⚡ 합성
      golden: () => { tone(1568, 'triangle', 0.35, 0.13); tone(2093, 'triangle', 0.45, 0.11, 0.1); },        // ✨ 황금 등장
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

  // ── 로그라이크 메타 (세입자 · 승급 · 해금) ────────────────────
  const MT = window.JackpotMeta;
  const META_KEY = 'jackpot_meta_v1';
  function loadMeta() {
    try { return MT.normalize(JSON.parse(localStorage.getItem(META_KEY) || '{}')); }
    catch (e) { return MT.normalize({}); }
  }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  let meta = loadMeta();
  let tenantId = MT.TENANTS[0].id;
  let ascension = 0;

  function renderMetaPanel() {
    const line = $('metaLine');
    if (line) {
      line.innerHTML = `🏠 <b>${meta.deeds}</b> 조각 · ${meta.runs}판 · ${meta.wins}승 · 최고 ${meta.bestStage}단계`;
      line.classList.remove('hidden');
    }
    const tr = $('tenantRow');
    if (tr) {
      tr.innerHTML = MT.TENANTS.map((t) => {
        const un = MT.isUnlocked(meta, t.id);
        return `<button class="tenant-chip${t.id === tenantId ? ' on' : ''}${un ? '' : ' locked'}" data-id="${t.id}" ${un ? '' : 'disabled'} title="${un ? t.desc : '해금 필요 — 🏠 ' + t.cost}">${t.icon} ${t.name}</button>`;
      }).join('');
    }
    const ar = $('ascRow');
    if (ar) {
      const maxA = MT.availableAscension(meta);
      let html = '';
      for (let lv = 0; lv <= MT.MAX_ASCENSION; lv++) {
        const playable = lv <= maxA;
        html += `<button class="asc-chip${lv === ascension ? ' on' : ''}${playable ? '' : ' locked'}" data-lv="${lv}" ${playable ? '' : 'disabled'}>${lv === 0 ? '기본' : '승급 ' + lv}</button>`;
      }
      ar.innerHTML = html;
    }
    const det = $('ascDetail');
    if (det) {
      const t = MT.TEN[tenantId];
      const lines = MT.describeAscension(ascension);
      det.innerHTML = `<div class="ad-tenant">${t.icon} <b>${t.name}</b> — ${t.desc}</div>` +
        (lines.length ? `<div class="ad-asc">${lines.map((l) => `<div>${l}</div>`).join('')}</div>` : '');
    }
  }

  function renderUnlockList() {
    const el = $('unlockList');
    const d = $('unlockDeeds');
    if (d) d.textContent = `🏠 ${meta.deeds}`;
    if (!el) return;
    el.innerHTML = MT.TENANTS.map((t) => {
      const un = MT.isUnlocked(meta, t.id);
      const afford = !un && meta.deeds >= t.cost;
      return `<button class="unlock-row${un ? ' owned' : ''}${afford ? ' afford' : ''}" data-id="${t.id}" ${un || !afford ? 'disabled' : ''}>
        <span class="ur-icon">${t.icon}</span>
        <span class="ur-body"><strong>${t.name}</strong><small>${t.desc}</small></span>
        <span class="ur-cost">${un ? '보유' : '🏠 ' + t.cost}</span>
      </button>`;
    }).join('');
  }

  // 판이 끝나면 조각을 지급하고 승급 사다리를 갱신한다 (이기든 지든)
  function settleRun(won) {
    const res = MT.finishRun(meta, { stage: run.stage, won: !!won, ascension });
    const before = MT.availableAscension(meta);
    meta = res.meta;
    saveMeta();
    const after = MT.availableAscension(meta);
    renderMetaPanel();
    return { gained: res.gained, newAscension: after > before ? after : 0 };
  }

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
    el.querySelectorAll('.piggy-badge, .lv-badge').forEach((b) => b.remove());
    el.classList.toggle('goldsym', !!(item && item.gold));
    if (item && item.id === 'piggy' && item.bank > 0) {
      const b = document.createElement('span');
      b.className = 'piggy-badge'; b.textContent = item.bank;
      el.appendChild(b);
    }
    if (item && item.lv > 1) {
      const b = document.createElement('span');
      b.className = 'lv-badge'; b.textContent = 'Lv' + item.lv;
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
    renderPins();
  }

  // 유물 바 + 현재 동네 칩 (요소 없으면 무시 — 구버전 HTML 안전망)
  function renderMeta() {
    const chip = $('routeChip');
    if (chip) {
      const route = ROUTES[run.route];
      chip.textContent = `${route.icon} ${route.name}`;
      chip.title = route.desc;
    }
    const bar = $('relicBar');
    if (bar) {
      bar.innerHTML = '';
      for (const id of run.relics) {
        const def = RELICS[id];
        const s = document.createElement('span');
        s.className = 'relic-chip';
        s.textContent = def.icon;
        s.title = `${def.name} — ${def.good} / 저주: ${def.bad}`;
        bar.appendChild(s);
      }
    }
    renderFever();
  }

  // 피버 게이지 — 3연속 좋은 스핀이면 다음 스핀 점화
  function renderFever() {
    const bar = $('feverBar'); if (!bar) return;
    bar.classList.toggle('armed', run.feverArmed);
    const dots = bar.querySelectorAll('.fdot');
    dots.forEach((d, i) => d.classList.toggle('on', run.feverArmed || i < run.feverStreak));
    const spinBtn = $('spinBtn');
    if (spinBtn) spinBtn.classList.toggle('fever', run.feverArmed);
  }

  // 지속 월드 이벤트 배너
  function renderEventBanner() {
    const b = $('eventBanner'); if (!b) return;
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
    // 잭팟 예감 — 확률 심볼(슬롯머신·로또)이 보드에 있으면 마지막 열을 늦추고 긴장음
    const teaseCols = new Set();
    for (let i = 0; i < CELLS; i++) {
      const b = result.board[i];
      if (b && (b.id === 'slotm' || b.id === 'lotto')) teaseCols.add(i % COLS);
    }
    const maxTease = teaseCols.size ? Math.max(...teaseCols) : -1;

    const stopCol = (col) => {
      for (let r = 0; r < CELLS / COLS; r++) {
        const i = r * COLS + col;
        clearInterval(rollTimers[i]);
        const el = cellEl(i);
        el.classList.remove('rolling');
        setCell(i, result.board[i]);
        const b = result.board[i];
        if (b && (b.id === 'slotm' || b.id === 'lotto')) {   // 두근두근 금빛 점멸
          el.classList.add('tease');
          setTimeout(() => el.classList.remove('tease'), T(1100));
        }
      }
      Sound.thunk();
    };
    if (FAST) {
      for (let c = 0; c < COLS; c++) stopCol(c);
      payoutSequence(result);
    } else {
      let delay = 300, lastDelay = 300;
      for (let c = 0; c < COLS; c++) {
        delay = 300 + c * 140;
        if (c === maxTease && c === COLS - 1) {   // 마지막 열이 잭팟 후보 — 시간을 끌며 긴장
          delay += 520;
          setTimeout(() => Sound.tension(), delay - 480);
        }
        lastDelay = delay;
        setTimeout(() => stopCol(c), delay);
      }
      setTimeout(() => payoutSequence(result), lastDelay + 140);
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

  // ⚡ 합성 축하 — 3장이 한 장의 상위 카드로
  function celebrateMerges(merges) {
    // 전설 조합은 판에서 가장 드문 사건이라 합성보다 먼저·크게 알린다
    if (run && run.lastLegend) {
      const L = SYMBOLS.landlord;
      showMega(`🏙️ 전설 조합! ${L.icon} ${L.name}${run.lastLegend.gold ? ' ✨' : ''}`);
      Sound.fuse(); Sound.fuse();
      vibrate([40, 30, 60, 30, 90]);
      confetti();
      run.lastLegend = null;
      return;
    }
    if (!merges || !merges.length) return;
    const m = merges[merges.length - 1];
    const def = SYMBOLS[m.id];
    showMega(`⚡ 합성! ${def.icon} Lv${m.lv}${m.gold ? ' ✨' : ''}`);
    Sound.fuse();
    vibrate([20, 30, 40]);
  }

  // MEGA WIN 배너 + 그리드 셰이크
  let megaTimer = 0;
  function showMega(text) {
    const el = $('megaWin'); if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(megaTimer);
    megaTimer = setTimeout(() => el.classList.add('hidden'), T(1400));
    confetti();
  }
  function shakeGrid() {
    const g = $('slotWrap'); if (!g) return;
    g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
    setTimeout(() => g.classList.remove('shake'), T(500));
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

  // 스핀 총액별 풍미 문구 — 같은 결과도 다르게 읽힌다
  const FLAVOR_ZERO = ['꽝... 다음 스핀!', '오늘은 공쳤다...', '바람만 스쳐갔다'];
  const FLAVOR_BIG = ['🔥 대박!', '💸 돈벼락!', '🤑 살림살이가 폈다!'];
  const pickFlavor = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function finishSpin(result) {
    const pl = $('payLine');
    let txt = result.total > 0 ? `이번 스핀 +${result.total}` : pickFlavor(FLAVOR_ZERO);
    if (result.extra && result.extra.length) {
      txt += '  (' + result.extra.map((e) => e.amt !== 0 ? `${e.label} ${e.amt >= 0 ? '+' : ''}${e.amt}` : e.label).join(' · ') + ')';
    }
    pl.textContent = txt;
    if (result.total >= 40) { pl.classList.add('mega'); pl.textContent = `${pickFlavor(FLAVOR_BIG)} +${result.total}`; }

    // MEGA WIN — 화면을 채우는 황금 배너 + 셰이크
    if (result.total >= 50) {
      showMega(result.total >= 90 ? `JACKPOT! +${result.total}` : `MEGA WIN +${result.total}`);
      shakeGrid();
      Sound.mega();
      vibrate([40, 50, 40, 50, 80]);
    }
    // 스핀 중 합성(닭이 낳은 알 3개 등)
    if (result.merges && result.merges.length) celebrateMerges(result.merges);
    // 피버 점화 안내
    if (result.feverArmed && !result.feverNow) {
      showMega('🔥 FEVER SPIN!');
      Sound.fever();
      vibrate([25, 35, 25]);
    }
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
    if (!$('movingModal') || !$('movingList')) {   // 안전망: 그냥 넘어간다
      run.declineRemoval();
      afterMoving();
      return;
    }
    phase = 'pick';
    armGuard();
    const list = $('movingList'); list.innerHTML = '';
    for (const d of run.deck) {
      const def = SYMBOLS[d.id];
      const b = document.createElement('button');
      b.className = `deck-item ${def.rarity} deck-remove`;
      b.innerHTML = `${run.displayIcon(d)} ${def.name}`;
      b.addEventListener('click', (e) => {
        if (guarded(e)) return;
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

  // ── 동네 지도 렌더 ──────────────────────────────────────────────
  // 슬더스처럼 층을 아래에서 위로 쌓아 보여준다. 지나온 길은 흐리게,
  // 지금 갈 수 있는 곳은 밝게 — 몇 층 앞이 보여야 "계획" 이 성립한다.
  function renderMap(el, opts) {
    const o = opts || {};
    if (!el) return;
    const map = run && run.map;
    if (!map || !window.JackpotMap) { el.innerHTML = ''; return; }
    const M = window.JackpotMap;
    const reach = M.reachable(map);
    const canPick = !!o.pickable && !!run.pendingRoutes;
    const visited = new Set(map.visited.map((v) => v.floor + ':' + v.lane));

    let html = '';
    for (let f = map.floors.length - 1; f >= 0; f--) {
      const isNow = f === map.pos.floor;
      html += `<div class="map-floor${isNow ? ' now' : ''}">`;
      html += `<span class="mf-no">${f === map.floors.length - 1 ? '🏁' : f}</span>`;
      html += '<span class="mf-nodes">';
      map.floors[f].forEach((nd, lane) => {
        const t = M.NODE_TYPES[nd.type] || { icon: '?', name: '?' };
        const here = isNow && lane === map.pos.lane;
        const open = reach.some((r) => r.floor === f && r.lane === lane);
        const been = visited.has(f + ':' + lane);
        const cls = ['map-node', here ? 'here' : '', open ? 'open' : '', been && !here ? 'been' : ''].filter(Boolean).join(' ');
        const clickable = canPick && open;
        html += `<button class="${cls}" ${clickable ? '' : 'disabled'} data-f="${f}" data-l="${lane}" data-type="${nd.type}" title="${t.name}">${t.icon}</button>`;
      });
      html += '</span></div>';
    }
    el.innerHTML = html;

    drawMapEdges(el, map, M);

    if (canPick) {
      el.onclick = (e) => {
        const b = e.target.closest('.map-node');
        if (!b || b.disabled) return;
        if (guarded(e)) return;
        const f = +b.dataset.f, l = +b.dataset.l;
        const rt = run.pendingRoutes.find((r) => r.floor === f && r.lane === l);
        if (!rt) return;
        pickRoute(rt);
      };
    } else el.onclick = null;
  }

  // 연결선 — 어느 칸이 어디로 이어지는지 보여야 "계획" 이 성립한다.
  // 노드를 그린 뒤 실제 좌표를 재서 SVG 로 잇는다 (레이아웃이 바뀌어도 따라간다).
  function drawMapEdges(el, map, M) {
    const old = el.querySelector('.map-edges');
    if (old) old.remove();
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const center = (f, l) => {
      const n = el.querySelector(`.map-node[data-f="${f}"][data-l="${l}"]`);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top + el.scrollTop };
    };
    const reach = M.reachable(map);
    const isOpenEdge = (f, l, nf, nl) =>
      f === map.pos.floor && l === map.pos.lane && reach.some((r) => r.floor === nf && r.lane === nl);

    let lines = '';
    for (let f = 0; f < map.floors.length - 1; f++) {
      map.floors[f].forEach((nd, l) => {
        const a = center(f, l);
        if (!a) return;
        nd.next.forEach((nl) => {
          const b = center(f + 1, nl);
          if (!b) return;
          const open = isOpenEdge(f, l, f + 1, nl);
          lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="map-edge${open ? ' open' : ''}" />`;
        });
      });
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'map-edges');
    svg.setAttribute('width', String(Math.round(box.width)));
    svg.setAttribute('height', String(el.scrollHeight));
    svg.innerHTML = lines;
    el.insertBefore(svg, el.firstChild);
  }

  // 동네 선택 확정 — 지도 클릭과 카드 클릭이 같은 경로를 쓴다
  function pickRoute(rt) {
    run.chooseRoute(rt.id, rt.floor, rt.lane);
    Sound.pick();
    $('routeModal').classList.add('hidden');
    renderHUD();
    if (run.pendingRelics) setTimeout(() => showRelic(), T(150));
    else setTimeout(() => showPick(false, routeBonusNext), T(150));
  }

  function showRoute(bonusAfter) {
    if (run.state !== 'playing' || !run.pendingRoutes) { showPick(false, bonusAfter); return; }
    // 구버전 HTML에 모달이 없으면 자동 선택(평범한 동네) — 시작 벽돌 방지 안전망
    if (!$('routeModal') || !$('routeCards')) {
      const ids = run.pendingRoutes.map((r) => r.id);
      run.chooseRoute(ids.includes('normal') ? 'normal' : ids[0]);
      if (run.pendingRelics) run.chooseRelic(run.pendingRelics[0].id);
      showPick(false, bonusAfter);
      return;
    }
    routeBonusNext = !!bonusAfter;
    phase = 'pick';
    armGuard();
    const wrap = $('routeCards'); wrap.innerHTML = '';
    run.pendingRoutes.forEach((rt, i) => {
      const btn = document.createElement('button');
      btn.className = 'pick-card route-card' + (rt.relic ? ' rare' : '');
      btn.dataset.id = rt.id;   // 지도 노드와 같은 식별자 — 자동 플레이/QA 가 카드 글자를 읽지 않아도 된다
      btn.innerHTML = `
        <span class="pick-ico">${rt.icon}</span>
        <span class="pick-body">
          <span class="pick-name">${rt.name} <span class="key-hint">${i + 1}</span></span>
          <span class="pick-desc">${rt.desc}</span>
        </span>`;
      btn.addEventListener('click', (e) => {
        if (guarded(e)) return;
        pickRoute(rt);
      });
      wrap.appendChild(btn);
    });
    $('routeModal').classList.remove('hidden');
    renderMap($('mapView'), { pickable: true });   // 표시 후에 그려야 좌표를 잴 수 있다
  }

  // ── 유물 선택 (유물 골목 입주 보상) ─────────────────────────────
  function showRelic() {
    if (!run.pendingRelics) { showPick(false, routeBonusNext); return; }
    if (!$('relicModal') || !$('relicCards')) {   // 안전망: 자동 선택
      run.chooseRelic(run.pendingRelics[0].id);
      showPick(false, routeBonusNext);
      return;
    }
    phase = 'pick';
    armGuard();
    const wrap = $('relicCards'); wrap.innerHTML = '';
    run.pendingRelics.forEach((rl, i) => {
      const btn = document.createElement('button');
      btn.className = 'pick-card rare relic-card';
      btn.dataset.id = rl.id;
      btn.innerHTML = `
        <span class="pick-ico">${rl.icon}</span>
        <span class="pick-body">
          <span class="pick-name">${rl.name} <span class="key-hint">${i + 1}</span></span>
          <span class="pick-desc">✨ ${rl.good}<br>☠️ 저주: ${rl.bad}</span>
        </span>`;
      btn.addEventListener('click', (e) => {
        if (guarded(e)) return;
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
    armGuard();
    const offers = run.offers(isBonus);
    const title = $('pickTitle');
    title.textContent = isBonus ? '💜 보너스 뽑기! (잉여 완납 보상)' : '🎁 심볼 하나를 골라 덱에 추가';
    title.classList.toggle('bonus', !!isBonus);
    const wrap = $('pickCards'); wrap.innerHTML = '';
    let anyGold = false;
    offers.forEach((o, i) => {
      const def = SYMBOLS[o.id];
      if (o.gold) anyGold = true;
      const btn = document.createElement('button');
      btn.className = `pick-card ${def.rarity}` + (o.gold ? ' golden' : '');
      btn.dataset.id = o.id;
      if (o.gold) btn.dataset.gold = '1';
      btn.innerHTML = `
        <span class="pick-ico">${def.icon}</span>
        <span class="pick-body">
          <span class="pick-name">${def.name}
            ${o.gold ? '<span class="rarity-tag gold-tag">✨황금 ×3</span>' : ''}
            <span class="rarity-tag ${def.rarity}">${RARITY_KO[def.rarity]}</span>
            <span class="key-hint">${i + 1}</span></span>
          <span class="pick-desc">${def.desc}</span>
        </span>`;
      btn.addEventListener('click', (e) => { if (guarded(e)) return; resolvePick(o.id, o.gold); });
      wrap.appendChild(btn);
      if (def.rarity === 'rare') vibrate(15);
    });
    if (anyGold) { Sound.golden(); vibrate([20, 30, 20]); }   // 황금 등장 — 드래프트의 잭팟
    const sr = run.skipReward();
    $('skipBtn').innerHTML = sr > 0
      ? `건너뛰고 +${sr} 코인 <span class="key-hint">0</span>`
      : `건너뛴다 (마트 회원권: 보상 없음) <span class="key-hint">0</span>`;
    $('pickModal').classList.remove('hidden');
  }

  function resolvePick(id, gold) {
    const merges = run.pick(id, gold) || [];
    Sound.pick();
    celebrateMerges(merges);
    $('pickModal').classList.add('hidden');
    renderHUD();
    if (bonusQueued) { bonusQueued = false; setTimeout(() => showPick(true), T(180)); return; }
    phase = 'idle';
    setTimeout(() => { if (phase === 'idle') $('spinBtn').disabled = false; }, T(220));
  }

  // ── 승리 / 게임오버 ─────────────────────────────────────────────
  function showVictory() {
    phase = 'over';
    armGuard();
    Sound.win();
    vibrate([40, 60, 40, 60, 90]);
    confetti(); confetti();
    $('ovIcon').textContent = '🏠';
    $('ovTitle').textContent = '내 집 마련!';
    $('ovMsg').innerHTML =
      `<b>${WIN_STAGE}번의 월세</b>를 모두 완납하고 전세 지옥에서 탈출했습니다!<br>` +
      `총 수입 <b>${run.totalEarned}</b> 코인 · 최고 스핀 <b>+${run.bestSpin}</b> · 덱 <b>${run.deck.length}</b>장<br><br>` +
      `이대로 은퇴할까요, 아니면 건물주에 도전할까요?<br><span style="color:var(--muted);font-size:0.76rem">무한 모드: 월세가 계속 오릅니다</span>`;
    const mres = settleRun(true);
    $('ovMsg').innerHTML += `<br><br>🏠 <b>+${mres.gained}</b> 집문서 조각` +
      (mres.newAscension ? ` · <b style="color:var(--good,#7bd96c)">승급 ${mres.newAscension} 해금!</b>` : '');
    $('startBtn').textContent = '🏢 무한 모드 계속';
    $('bestLine').classList.add('hidden');
    $('overlay').classList.add('visible');
    endless = true;
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
    else if (window.AdMob) AdMob.showInterstitial();
  }

  function gameOver(settle) {
    phase = 'over';
    armGuard();
    saveBest(run.stage - 1 + (run.won ? 1 : 0));
    const nearMiss = settle.shortfall <= Math.ceil(settle.rent * 0.2);
    $('ovIcon').textContent = '📦';
    $('ovTitle').textContent = run.won ? '건물주의 꿈, 여기까지' : '강제 퇴거...';
    $('ovMsg').innerHTML =
      (nearMiss ? `<b style="color:var(--bad)">겨우 ${settle.shortfall}코인이 부족했습니다!</b><br>` : `월세 ${settle.rent} 중 <b>${settle.shortfall}코인</b>이 부족했습니다.<br>`) +
      `${settle.stage}단계에서 퇴거 · 완납 <b>${run.rentsPaid}</b>회 · 총 수입 <b>${run.totalEarned}</b><br>` +
      (nearMiss ? '한 스핀만 더 터졌다면...' : '파괴 시너지(고양이+우유, 광부+보석)로 한 방을 노려보세요.');
    const mres = settleRun(false);
    $('ovMsg').innerHTML += `<br>🏠 <b>+${mres.gained}</b> 집문서 조각`;
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
    run = new Run(undefined, MT.runOptions(tenantId, ascension));
    phase = 'idle';
    endless = false;
    displayedCoins = 0;
    buildGrid();
    renderHUD();
    $('payLine').textContent = ' ';
    const hideEl = (id, cls) => { const el = $(id); if (el) el.classList.add(cls || 'hidden'); };
    $('overlay').classList.remove('visible');
    hideEl('pickModal'); hideEl('routeModal'); hideEl('relicModal');
    hideEl('movingModal'); hideEl('stamp'); hideEl('megaWin');
    exitPinMode();
    renderPins();
    $('spinBtn').disabled = false;
  }

  // ── 📌 붙박이 — 심볼을 지정 칸에 고정해 인접 시너지를 설계한다 ─────
  let pinMode = null;   // 배치 대기 중인 심볼 uid
  function renderPins() {
    document.querySelectorAll('.pin-badge').forEach((b) => b.remove());
    document.querySelectorAll('.cell.pinned').forEach((c) => c.classList.remove('pinned'));
    if (!run) return;
    for (const f of run.fixtures) {
      const el = cellEl(f.cell); if (!el) continue;
      el.classList.add('pinned');
      const b = document.createElement('span');
      b.className = 'pin-badge'; b.textContent = '📌';
      el.appendChild(b);
    }
  }
  function enterPinMode(uid) {
    pinMode = uid;
    const m = $('deckModal'); if (m) m.classList.add('hidden');
    const g = $('slotGrid'); if (g) g.classList.add('pinning');
    setText('payLine', '📌 고정할 칸을 탭하세요 (빈 칸 아무데나 · ESC 취소)');
  }
  function exitPinMode() {
    pinMode = null;
    const g = $('slotGrid'); if (g) g.classList.remove('pinning');
  }

  // ── 덱 뷰어 — 심볼 탭으로 붙박이 지정/해제 ───────────────────────
  function showDeck() {
    if (!run) return;
    const list = $('deckList'); if (!list) return;
    list.innerHTML = '';
    for (const { id, lv, gold, n, def } of run.deckSummary()) {
      const match = (d) => d.id === id && d.lv === lv && !!d.gold === !!gold;
      const fixedItem = run.deck.find((d) => match(d) && run.isFixed(d.uid));
      const freeItem = run.deck.find((d) => match(d) && !run.isFixed(d.uid));
      const b = document.createElement('button');
      b.className = `deck-item ${def.rarity}` + (fixedItem ? ' fixed' : '') + (gold ? ' gold' : '');
      b.title = def.desc + (fixedItem ? ' — 탭하면 붙박이 해제' : ' — 탭하면 붙박이 고정(칸 선택)');
      b.innerHTML = `${def.icon} ${def.name}${lv > 1 ? ` <b class="lvtxt">Lv${lv}</b>` : ''}${gold ? ' ✨' : ''} <span class="n">×${n}</span>${fixedItem ? ' 📌' : ''}`;
      b.addEventListener('click', (e) => {
        if (guarded(e)) return;
        if (fixedItem) {   // 해제
          run.clearFixture(fixedItem.uid);
          renderPins(); showDeck();
          setText('payLine', '📌 붙박이 해제');
        } else if (freeItem) {
          if (run.fixtures.length >= window.Jackpot.MAX_FIXTURES) {
            setText('payLine', `붙박이는 최대 ${window.Jackpot.MAX_FIXTURES}개 — 기존 📌를 해제하세요`);
            return;
          }
          enterPinMode(freeItem.uid);
        }
      });
      list.appendChild(b);
    }
    setText('deckModalCount', `(${run.deck.length}장 · 📌${run.fixtures.length}/${window.Jackpot.MAX_FIXTURES})`);
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
    // 방어적 바인딩 — 어떤 요소가 없어도(HTML/JS 버전 스큐) 나머지는 정상 동작
    onEl('startBtn', 'click', (e) => { if (guarded(e)) return; start(); });
    onEl('mapBtn', 'click', () => {
      $('mapModal').classList.remove('hidden');
      renderMap($('mapFull'), { pickable: false });   // 표시 후에 그린다
    });
    onEl('mapClose', 'click', () => $('mapModal').classList.add('hidden'));

    // 세입자 / 승급 선택
    onEl('tenantRow', 'click', (e) => {
      const b = e.target.closest('.tenant-chip');
      if (!b || b.disabled) return;
      tenantId = b.dataset.id;
      renderMetaPanel();
    });
    onEl('ascRow', 'click', (e) => {
      const b = e.target.closest('.asc-chip');
      if (!b || b.disabled) return;
      ascension = +b.dataset.lv;
      renderMetaPanel();
    });
    // 세입자 해금
    onEl('unlockBtn', 'click', (e) => {
      if (guarded(e)) return;
      renderUnlockList();
      $('unlockModal').classList.remove('hidden');
    });
    onEl('unlockClose', 'click', () => $('unlockModal').classList.add('hidden'));
    onEl('unlockList', 'click', (e) => {
      const row = e.target.closest('.unlock-row');
      if (!row || row.disabled) return;
      const res = MT.unlockTenant(meta, row.dataset.id);
      if (!res.ok) return;
      meta = res.meta;
      saveMeta();
      renderUnlockList();
      renderMetaPanel();
    });
    renderMetaPanel();
    onEl('spinBtn', 'click', doSpin);
    onEl('skipBtn', 'click', (e) => { if (guarded(e)) return; resolvePick(null); });
    onEl('movingSkip', 'click', (e) => {
      if (guarded(e)) return;
      run.declineRemoval();
      const m = $('movingModal'); if (m) m.classList.add('hidden');
      afterMoving();
    });
    onEl('deckBtn', 'click', showDeck);
    // 📌 붙박이 배치 — 핀 모드에서 칸 탭 = 고정, 평시 고정 칸 탭 = 해제
    onEl('slotGrid', 'click', (e) => {
      const cell = e.target.closest('.cell'); if (!cell || !run) return;
      const idx = +cell.dataset.idx;
      if (pinMode != null) {
        if (run.setFixture(pinMode, idx)) { Sound.pick(); setText('payLine', '📌 붙박이 고정! 매 스핀 이 칸에 나타납니다'); }
        else setText('payLine', '고정 실패 — 이미 사용 중인 칸이거나 슬롯이 가득');
        exitPinMode();
        renderPins();
      } else if (phase === 'idle') {
        const f = run.fixtureAt(idx);
        if (f) { run.clearFixture(f.uid); renderPins(); setText('payLine', '📌 붙박이 해제'); }
      }
    });
    onEl('deckClose', 'click', () => { const m = $('deckModal'); if (m) m.classList.add('hidden'); });
    onEl('deckModal', 'click', (e) => { if (e.target === $('deckModal')) $('deckModal').classList.add('hidden'); });
    const muteBtn = $('muteBtn');
    if (muteBtn) {
      if (Sound.isMuted()) muteBtn.textContent = '🔇';
      muteBtn.addEventListener('click', () => { muteBtn.textContent = Sound.toggle() ? '🔇' : '🔊'; });
    }
    const turboBtn = $('turboBtn');
    if (turboBtn) {
      turboBtn.classList.toggle('on', turbo);
      turboBtn.addEventListener('click', () => {
        turbo = !turbo;
        try { localStorage.setItem(TURBO_KEY, turbo ? '1' : '0'); } catch (e) {}
        turboBtn.classList.toggle('on', turbo);
      });
    }

    const isOpen = (id) => { const el = $(id); return el && !el.classList.contains('hidden'); };
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        if (phase === 'idle') { e.preventDefault(); doSpin(); }
        else if ($('overlay').classList.contains('visible')) { e.preventDefault(); start(); }
      } else if (phase === 'pick' && ['1', '2', '3', '4'].includes(e.key)) {
        // 열려 있는 모달(뽑기/루트/유물)에서 숫자키 선택
        const openSel = isOpen('routeModal') ? '#routeCards .pick-card'
          : isOpen('relicModal') ? '#relicCards .pick-card'
          : '#pickCards .pick-card';
        const btns = document.querySelectorAll(openSel);
        const b = btns[parseInt(e.key, 10) - 1];
        if (b) { e.preventDefault(); b.click(); }
      } else if (phase === 'pick' && e.key === '0' && isOpen('pickModal')) {
        e.preventDefault(); resolvePick(null);
      } else if (e.key === 'd' || e.key === 'D') {
        if (!isOpen('deckModal')) showDeck();
        else $('deckModal').classList.add('hidden');
      } else if ((e.key === 't' || e.key === 'T') && turboBtn) {
        turboBtn.click();
      } else if (e.key === 'm' || e.key === 'M') {
        if (muteBtn) muteBtn.click();
      } else if (e.key === 'Escape') {
        if (pinMode != null) { exitPinMode(); setText('payLine', '📌 배치 취소'); return; }
        const m = $('deckModal'); if (m) m.classList.add('hidden');
      }
    });
  }

  init();
})();
