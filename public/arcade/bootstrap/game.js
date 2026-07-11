// CIVILIZATION ENGINE — 루프로 자라는 문명 (MVP: 시대 A→E)
// 헤드리스 시뮬레이션 코어(sim.js)를 브라우저 대시보드로 감싼 플레이 가능한 게임.
(function () {
  'use strict';

  const { Sim, RES, BLD, SCENARIO, ERA_LETTERS, ERA_NAMES, clone } = window.Bootstrap;

  // 건설 비용(식량) — "칼로리가 문명을 짓는다". 철거 시 50% 환급.
  const COST = {
    forager_camp: 8, hunting_lodge: 12, fire_pit: 10, shelter: 16,
    crop_field: 16, compost_yard: 10, pasture: 14, clay_pit: 12,
    granary: 20, pottery_workshop: 18, irrigation_canal: 22, longhouse: 30, scribe_hall: 26,
    craft_school: 28, lumber_camp: 16, copper_mine: 24, smelter: 30, toolsmith: 24, trade_post: 20,
  };
  const ORDER = [
    'forager_camp', 'hunting_lodge', 'fire_pit', 'shelter',
    'crop_field', 'compost_yard', 'pasture', 'clay_pit',
    'granary', 'pottery_workshop', 'irrigation_canal', 'longhouse', 'scribe_hall',
    'craft_school', 'lumber_camp', 'copper_mine', 'smelter', 'toolsmith', 'trade_post',
  ];
  const RES_BAR = ['food', 'wood', 'clay', 'pottery', 'tools', 'copper', 'tin', 'bronze'];
  const REASON_KO = {
    ok: '정상', idle: '유휴',
    'labor:unskilled': '비숙련 노동 부족', 'labor:skilled': '숙련 노동 부족',
    'input:clay': '점토 부족', 'input:wood': '목재 부족', 'input:copper': '구리 부족',
    'input:tin': '주석 부족', 'input:bronze': '청동 부족', 'input:pottery': '토기 부족',
    'deposit:depleted': '광맥 고갈',
  };
  const reasonKo = (r) => REASON_KO[r] || r;

  // ── 절차적 사운드 (Web Audio API) ──────────────────────────────────────
  const Sound = (() => {
    let ctx, muted = false;
    try { muted = localStorage.getItem('civ_muted') === '1'; } catch (e) {}
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
      toggle: () => {
        muted = !muted;
        try { localStorage.setItem('civ_muted', muted ? '1' : '0'); } catch (e) {}
        return muted;
      },
      isMuted: () => muted,
      resume: () => { try { const c = ac(); if (c.state === 'suspended') c.resume(); } catch (e) {} },
      build:        () => { tone(520, 'sine', 0.12, 0.10); tone(780, 'sine', 0.08, 0.06, 0.07); },
      demolish:     () => tone(220, 'triangle', 0.22, 0.09),
      eraAdvance:   () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.55, 0.15, i * 0.12)),
      breakthrough: () => [880, 1108, 1320, 1760].forEach((f, i) => tone(f, 'triangle', 0.4, 0.12, i * 0.08)),
      action:        (combo) => tone(420 + Math.min(combo, 12) * 24, 'sine', 0.1, 0.07),
      goldenAge:     () => [660, 880, 1108, 1320].forEach((f, i) => tone(f, 'triangle', 0.45, 0.13, i * 0.07)),
      event:        () => { tone(300, 'sawtooth', 0.3, 0.12); tone(200, 'sawtooth', 0.35, 0.10, 0.18); },
      good:         () => { tone(660, 'sine', 0.25, 0.10); tone(990, 'sine', 0.3, 0.08, 0.12); },
      victory:      () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 'sine', 0.8, 0.18, i * 0.14)),
      collapse:     () => [350, 250, 140, 80].forEach((f, i) => tone(f, 'sawtooth', 0.5, 0.14, i * 0.18)),
    };
  })();

  // ── 게이트 조건별 조언 ──────────────────────────────────────────────────
  const GATE_ADVICE = {
    population:          (cur, tgt) => cur < tgt * 0.6
      ? '채집 캠프를 더 짓고 막집으로 주거 한도를 확보하세요.'
      : '식량 흑자를 유지하면 인구가 자연 성장합니다. 주거 여유를 확인하세요.',
    foodBuffer:          () => '채집 캠프를 늘리거나 화덕·곡물창고로 부패를 억제하세요.',
    ecologicalKnowledge: () => '채집 캠프·사냥막을 계속 운영하면 생태 지식이 쌓입니다.',
    foodSurplusRatio:    () => '경작지를 늘리거나 퇴비장으로 토양 비옥도를 높이세요.',
    fertility:           () => '퇴비장을 경작지 수의 60% 이상 운영하세요.',
    housingHeadroom:     () => '장옥을 건설해 주거 수용 한도를 늘리세요.',
    writing:             () => '서기소를 더 건설하세요. 수가 많을수록 문자가 빠르게 쌓입니다.',
    toolCoverage:        () => '대장간(청동→도구)을 늘리세요. 광산→제련소→대장간 루프를 완성하세요.',
    skilledFrac:         () => '공방 학교를 더 건설해 비숙련 인구를 숙련 장인으로 전환하세요.',
    bronzeRate:          () => '제련소를 더 건설하고 구리·주석·목재 공급을 확인하세요.',
  };

  // ── 튜토리얼 단계 ──────────────────────────────────────────────────────
  const TUT = [
    { text: '✋ <b>채집 돕기</b>를 세 번 눌러 문명에 직접 개입하세요. 빠르게 연속 행동하면 황금기 충전이 더 빨라집니다.',
      done: () => sim.totalActions >= 3 },
    { text: '👋 시작: <b>막집 ⛺</b>을 1채 건설해 주거 한도를 확보하세요. 인구가 한도를 초과하면 성장이 멈춥니다.',
      done: () => (sim.counts.shelter || 0) >= 1 },
    { text: '🔥 <b>화덕</b>을 지어 식량 <b>저장 한도</b>를 늘리세요. 한도를 넘는 식량은 빠르게 썩습니다 — 저장이 비축의 상한입니다.',
      done: () => (sim.counts.fire_pit || 0) >= 1 },
    { text: '🔍 <b>병목 분석기</b>(우측 하단)를 보세요. 빨간 항목이 루프의 약점입니다. 채집 캠프를 더 지어 생산을 늘려보세요.',
      done: () => (sim.counts.forager_camp || 0) >= 5 },
    { text: '🎯 게이트: 인구 22 · 식량 45 · 생태 지식 30%를 <b>동시에 20틱 연속</b> 유지하면 농경 시대로 전진합니다.',
      done: () => sim.eraIndex >= 1 },
    { text: null }, // 종료 신호
  ];

  const TICKS_PER_SEC = 2;
  const TUT_KEY = 'civ_tut_done';
  const SAVE_KEY = 'civ_save_v2';
  const BEST_KEY = 'civ_best_v1';
  const MILES = [25, 50, 75, 100, 125];   // 연대기 인구 이정표
  let sim, state, speed, paused, elapsedAcc, lastTime, challenge, lastEra, toastTimer;
  let tapCombo = 0;
  let lastTapAt = 0;
  let tutStep = 0;
  let prevEventKeys = new Set();
  let hist = [];            // {p:인구, f:식량} 추이 (2틱마다)
  let chron = [];           // 연대기 항목 {t, icon, text}
  let chronDirty = true;
  let mileIdx = 0;
  let lastSaveT = 0;

  function tutSeen() { try { return localStorage.getItem(TUT_KEY) === '1'; } catch (e) { return false; } }
  function markTutSeen() { try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {} }

  const $ = (id) => document.getElementById(id);

  // ── 저장 / 이어하기 ──────────────────────────────────────────────────────
  function serialize() {
    return {
      v: 3, challenge, savedAt: Date.now(),
      hist: hist.slice(-400), chron: chron.slice(0, 40), mileIdx,
      s: {
        t: sim.t, pop: { u: sim.pop.unskilled, s: sim.pop.skilled },
        fertility: sim.fertility, copperDeposit: sim.copperDeposit,
        stock: sim.stock, counts: sim.counts, eraIndex: sim.eraIndex,
        sustain: sim.curGate ? sim.curGate.sustain : 0,
        fsr: sim.foodSurplusRatio, bronzeRate: sim.bronzeRate,
        writing: sim.writing, eco: sim.ecologicalKnowledge,
        bts: Array.from(sim.breakthroughs), droughtCount: sim.droughtCount,
        activeEvents: sim.activeEvents, eventCooldown: sim.eventCooldown,
        mods: sim.mods,
        actionCharge: sim.actionCharge, activeBoostTicks: sim.activeBoostTicks,
        totalActions: sim.totalActions,
      },
    };
  }
  function applySave(d) {
    const s = d.s;
    sim.t = s.t;
    sim.pop.unskilled = s.pop.u; sim.pop.skilled = s.pop.s;
    sim.fertility = s.fertility; sim.copperDeposit = s.copperDeposit;
    sim.stock = Object.assign({}, sim.stock, s.stock);
    sim.counts = Object.assign({}, sim.counts, s.counts);
    sim.eraIndex = s.eraIndex;
    sim.curGate = sim._mkGate(s.eraIndex);
    if (sim.curGate) sim.curGate.sustain = s.sustain || 0;
    sim.foodSurplusRatio = s.fsr || 0; sim.bronzeRate = s.bronzeRate || 0;
    sim.writing = s.writing || 0; sim.ecologicalKnowledge = s.eco || 0;
    sim.droughtCount = s.droughtCount || 0;
    sim.activeEvents = s.activeEvents || {}; sim.eventCooldown = s.eventCooldown || {};
    sim.mods = Object.assign(sim._freshMods(), s.mods);
    sim.breakthroughs = new Set(s.bts || []);
    sim.actionCharge = Math.max(0, Math.min(100, Number(s.actionCharge) || 0));
    sim.activeBoostTicks = Math.max(0, Math.min(120, Number(s.activeBoostTicks) || 0));
    sim.totalActions = Math.max(0, Number(s.totalActions) || 0);
    hist = Array.isArray(d.hist) ? d.hist : [];
    chron = Array.isArray(d.chron) ? d.chron : [];
    mileIdx = d.mileIdx || 0;
  }
  function saveGame() {
    if (!sim || state !== 'playing') return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (e) {}
  }
  function loadSaveData() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d || (d.v !== 2 && d.v !== 3) || !d.s || !d.s.counts || !d.s.pop) return null;
      for (const k in d.s.counts) if (!BLD[k]) return null;   // 건물 세트 불일치 → 무효
      return d;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // ── 최고 기록(★) ─────────────────────────────────────────────────────────
  function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); } catch (e) { return null; } }
  function starsFor(t) { return t <= 560 ? 3 : (t <= 850 ? 2 : 1); }
  function starStr(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }

  // ── 시작/리셋 ────────────────────────────────────────────────────────────
  // restore: loadSaveData()가 돌려준 세이브 객체(없으면 새 게임)
  function reset(restore) {
    const valid = restore && restore.s;
    if (valid) challenge = !!restore.challenge;
    const sc = clone(SCENARIO);
    if (challenge) sc.config = Object.assign({}, sc.config, { challenge: true });
    sim = new Sim(RES, BLD, sc);
    if (challenge && !valid) sim.stock.food = 70;
    hist = []; chron = []; chronDirty = true; mileIdx = 0;
    let restBonus = null;
    if (valid) {
      try {
        applySave(restore);
        restBonus = sim.applyRestBonus(Math.max(0, (Date.now() - (restore.savedAt || Date.now())) / 1000));
      } catch (e) { /* 손상 세이브 → 새 게임으로 진행 */ }
    }
    speed = 1; paused = false; elapsedAcc = 0; lastTime = performance.now();
    state = 'playing'; lastEra = sim.eraIndex;
    tapCombo = 0; lastTapAt = 0;
    prevEventKeys = new Set(Object.keys(sim.activeEvents));
    lastSaveT = sim.t;
    tutStep = (tutSeen() || sim.eraIndex > 0) ? TUT.length - 1 : 0;
    if (valid) {
      addChron('📂', '기록에서 문명을 이어간다');
      if (restBonus && restBonus.charge >= 1) addChron('☀', `휴식 보너스로 황금기 ${Math.round(restBonus.charge)}% 충전`);
    }
    else { clearSave(); addChron('🌱', '작은 무리가 정착을 시작했다'); }
    buildBuildPanel();
    buildResourceBar();
    setSpeedButtons();
    $('overlay').classList.remove('visible');
    $('startOverlay').classList.remove('visible');
    $('eventBanner').classList.add('hidden');
    $('btToast').classList.add('hidden');
    renderTutorial();
    render();
    if (restBonus && restBonus.charge >= 1) {
      showToast('☀', '휴식 보너스', `황금기 충전 +${Math.round(restBonus.charge)}%`);
    }
    if (valid) saveGame();
  }

  // ── 건설/철거 ─────────────────────────────────────────────────────────────
  function canAfford(id) { return (sim.stock.food || 0) >= COST[id]; }
  function build(id) {
    if (state !== 'playing') return;
    const status = buildStatus(id);
    if (!status.ok) {
      flashCost(id);
      return;
    }
    sim.stock.food -= COST[id];
    sim.counts[id] = (sim.counts[id] || 0) + 1;
    Sound.build();
    render();
  }

  function buildStatus(id, m) {
    if (!sim.isUnlocked(id)) return { ok: false, reason: '시대 잠김' };
    if (!canAfford(id)) return { ok: false, reason: '식량 부족' };

    const count = sim.counts[id] || 0;
    const cap = usefulCap(id);
    if (count >= cap) return { ok: false, reason: '현재 규모로 충분' };

    const def = BLD[id];
    m = m || sim.metrics();
    const laborNeed = laborDemand(def);
    const laborSupply = (sim.pop.unskilled || 0) + (sim.pop.skilled || 0);
    const projectedDemand = currentLaborDemand() + laborNeed;
    const projectedRatio = laborSupply / Math.max(laborSupply, projectedDemand || 1);
    const infrastructure = !!(def.housing || def.storage || def.institution || id === 'compost_yard' || id === 'irrigation_canal');
    const producesFood = !!(def.outputs && def.outputs.food);

    if (!infrastructure && count > 0 && projectedRatio < 0.42) {
      return { ok: false, reason: '노동 병목' };
    }
    // 주거 부족 시 산업·추출 건물만 차단 — 식량 생산과 기반시설(주거·저장·기관)은 항상 허용해
    // 과밀+기아 상태에서도 생존 루프를 회복할 수 있게 한다.
    if (!infrastructure && !producesFood && m.housingHeadroom < 0) {
      return { ok: false, reason: '주거 먼저' };
    }
    return { ok: true, reason: '' };
  }

  function usefulCap(id) {
    const pop = Math.max(1, sim.totalPop());
    const fields = sim.counts.crop_field || 0;
    const housingNeed = Math.max(0, pop + 10 - sim.housingCap());
    switch (id) {
      case 'forager_camp': return Math.max(4, Math.ceil(pop / 3.5));
      case 'hunting_lodge': return Math.max(1, Math.ceil(pop / 12));
      case 'fire_pit': return Math.max(2, Math.ceil(pop / 10));
      case 'shelter': return (sim.counts.shelter || 0) + Math.ceil(housingNeed / 8);
      case 'crop_field': return Math.max(2, Math.ceil(pop / 7));
      case 'compost_yard': return Math.max(1, Math.ceil(fields / 2));
      case 'pasture': return Math.max(1, Math.ceil(pop / 14));
      case 'clay_pit': return Math.max(1, Math.ceil(pop / 12));
      case 'granary': return Math.max(1, Math.ceil(pop / 18));
      case 'pottery_workshop': return Math.max(1, Math.ceil(pop / 14));
      case 'irrigation_canal': return Math.max(1, fields);
      case 'longhouse': return (sim.counts.longhouse || 0) + Math.ceil(Math.max(0, pop + 18 - sim.housingCap()) / 26);
      case 'scribe_hall': return Math.max(1, Math.ceil(pop / 30));
      case 'craft_school': return Math.max(1, Math.ceil(pop / 28));
      case 'lumber_camp': return Math.max(1, Math.ceil(pop / 16));
      case 'copper_mine': return Math.max(1, Math.ceil(pop / 18));
      case 'smelter': return Math.max(1, Math.ceil((sim.counts.copper_mine || 1) / 2));
      case 'toolsmith': return Math.max(1, Math.ceil(pop / 18));
      case 'trade_post': return Math.max(1, Math.ceil(pop / 22));
      default: return 99;
    }
  }

  function laborDemand(def) {
    if (!def || !def.labor) return 0;
    return Object.values(def.labor).reduce((sum, value) => sum + value, 0);
  }

  function currentLaborDemand() {
    return Object.keys(BLD).reduce((sum, id) => sum + laborDemand(BLD[id]) * (sim.counts[id] || 0), 0);
  }
  function demolish(id) {
    if (state !== 'playing') return;
    if ((sim.counts[id] || 0) <= 0) return;
    sim.counts[id]--;
    sim.stock.food = (sim.stock.food || 0) + COST[id] * 0.5;
    Sound.demolish();
    render();
  }

  function runActiveAction() {
    if (state !== 'playing') return;
    const now = performance.now();
    tapCombo = now - lastTapAt <= 1250 ? Math.min(20, tapCombo + 1) : 1;
    lastTapAt = now;
    const result = sim.performActiveAction(tapCombo);
    Sound.action(tapCombo);
    if (navigator.vibrate) navigator.vibrate(result.boostTriggered ? [25, 35, 55] : 10);
    if (result.boostTriggered) {
      Sound.goldenAge();
      addChron('☀', '황금기 시작 — 자동 생산 1.8배');
      showToast('☀', '황금기!', '15초 분량 동안 모든 자동 생산 1.8배');
      saveGame();
    }
    render();
  }
  function flashCost(id) {
    const el = document.querySelector(`.bld-row[data-id="${id}"] .bld-cost`);
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  // ── 메인 루프 ─────────────────────────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.25);
    lastTime = ts;
    if (state === 'playing' && !paused) {
      elapsedAcc += dt * TICKS_PER_SEC * speed;
      let steps = 0;
      while (elapsedAcc >= 1 && steps < 200) {
        sim.tick(); elapsedAcc -= 1; steps++;
        handleSimEvents();
        checkEnd();
        if (state !== 'playing') break;
      }
      if (steps > 0) {
        render();
        // 자동 저장(25틱마다) — 탭을 닫아도 이어서 할 수 있다
        if (sim.t - lastSaveT >= 25 && state === 'playing') { lastSaveT = sim.t; saveGame(); }
      }
    }
    requestAnimationFrame(loop);
  }

  function handleSimEvents() {
    const pop = sim.totalPop();
    if (sim.eraIndex !== lastEra) {
      lastEra = sim.eraIndex; buildBuildPanel(); flashEraAdvance();
      addChron('🏛️', ERA_NAMES[sim.eraLetter()] + ' 진입 — ' + sim.eraSub());
      lastSaveT = sim.t; saveGame();   // 시대 진입은 잃기 아까운 순간 — 즉시 저장
    }
    if (sim.pendingBreakthrough) {
      const bt = sim.pendingBreakthrough; sim.pendingBreakthrough = null;
      Sound.breakthrough();
      showToast(bt.icon, bt.name + ' 발견!', bt.narrative);
      addChron(bt.icon, bt.name + ' 돌파 발견');
    }
    // 사건 시작/종료 감지 → 연대기 + 사운드(양의 사건은 밝은 차임)
    const E = window.Bootstrap.EVENTS;
    const curKeys = new Set(Object.keys(sim.activeEvents));
    for (const k of curKeys) if (!prevEventKeys.has(k)) {
      if (E[k] && E[k].positive) Sound.good(); else Sound.event();
      addChron(E[k] ? E[k].icon : '⚠', (E[k] ? E[k].name : k) + ' 시작');
    }
    for (const k of prevEventKeys) if (!curKeys.has(k)) {
      addChron(E[k] ? E[k].icon : '·', (E[k] ? E[k].name : k) + ' 종료');
    }
    prevEventKeys = curKeys;
    // 인구 이정표
    while (mileIdx < MILES.length && pop >= MILES[mileIdx]) {
      addChron('👥', '인구 ' + MILES[mileIdx] + ' 달성');
      mileIdx++;
    }
    // 추이 기록(2틱마다, 최근 2400틱 창)
    if (sim.t % 2 === 0) {
      hist.push({ p: pop, f: sim.stock.food || 0 });
      if (hist.length > 1200) hist.shift();
    }
  }

  function checkEnd() {
    const pop = sim.totalPop();
    if (pop < 1 && state === 'playing') { state = 'over'; showOverlay(false); return; }
    if (sim.won() && state === 'playing') { state = 'over'; showOverlay(true); }
  }

  // ── 렌더링 ───────────────────────────────────────────────────────────────
  function fmt(n, d) { return (n || 0).toFixed(d == null ? 1 : d); }
  function pct(n) { return Math.round((n || 0) * 100) + '%'; }

  function render() {
    const m = sim.metrics();
    const pop = sim.totalPop();
    $('tickCount').textContent = sim.t;
    $('popCount').textContent = fmt(pop, 0);
    $('ciValue').textContent = fmt(civIndex(m), 0);
    renderEra();
    renderResourceBar();
    renderActiveAction();
    renderEventBanner();
    renderBuildCounts(m);
    renderGate(m);
    renderHealth(m, pop);
    renderBreakthroughs(m);
    renderBottlenecks();
    renderChronicle();
    drawHist();
    advanceTutorial();
  }

  function renderActiveAction() {
    if (!sim) return;
    if (tapCombo && performance.now() - lastTapAt > 1400) tapCombo = 0;
    const action = sim.activeAction();
    const gainText = Object.entries(action.gains)
      .map(([resource, amount]) => `+${fmt(amount, 1)}${RES[resource] ? RES[resource].icon : resource}`)
      .join(' · ');
    const active = sim.activeBoostTicks > 0;
    $('activeActionIcon').textContent = action.icon;
    $('activeActionName').textContent = action.name;
    $('activeActionGain').textContent = gainText;
    $('activeCombo').textContent = tapCombo > 1 ? `x${tapCombo}` : 'x1';
    $('activeActionBtn').classList.toggle('boosted', active);
    $('activeActionBtn').setAttribute('aria-label', `${action.name} ${gainText}`);
    $('goldenAgeLabel').textContent = active ? '황금기 가동' : '황금기 충전';
    $('goldenAgeCount').textContent = active ? `${Math.ceil(sim.activeBoostTicks / TICKS_PER_SEC)}초` : `${Math.round(sim.actionCharge)}%`;
    $('goldenAgeFill').style.width = `${active ? 100 : Math.min(100, sim.actionCharge)}%`;
    $('idleStatus').textContent = active
      ? '모든 자동 생산 1.8배 · 이전 시대 생산도 함께 가속'
      : '자동 생산 중 · 빠른 연속 행동으로 더 빨리 충전';
  }

  // ── 연대기 ───────────────────────────────────────────────────────────────
  function addChron(icon, text) {
    chron.unshift({ t: sim ? sim.t : 0, icon, text });
    if (chron.length > 80) chron.pop();
    chronDirty = true;
  }
  function renderChronicle() {
    if (!chronDirty) return;
    chronDirty = false;
    const wrap = $('chronicleList'); if (!wrap) return;
    wrap.innerHTML = chron.map((c) =>
      `<div class="chron-row"><span class="chron-t">${c.t}틱</span><span>${c.icon}</span><span>${c.text}</span></div>`
    ).join('');
  }

  // ── 추이 그래프(인구·식량) ────────────────────────────────────────────────
  function drawHist() {
    const cv = $('histChart'); if (!cv || !cv.getContext) return;
    const c2 = cv.getContext('2d'); if (!c2) return;
    const w = cv.clientWidth || 280;
    if (cv.width !== w) cv.width = w;
    const h = cv.height;
    c2.clearRect(0, 0, w, h);
    if (hist.length < 2) return;
    let maxP = 20, maxF = 50;
    for (const d of hist) { if (d.p > maxP) maxP = d.p; if (d.f > maxF) maxF = d.f; }
    const line = (key, max, color, width) => {
      c2.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const x = i / (hist.length - 1) * (w - 2) + 1;
        const y = h - 2 - (hist[i][key] / max) * (h - 6);
        if (i) c2.lineTo(x, y); else c2.moveTo(x, y);
      }
      c2.strokeStyle = color; c2.lineWidth = width; c2.stroke();
    };
    line('f', maxF, 'rgba(255,209,102,0.5)', 1);
    line('p', maxP, '#6fcf97', 1.5);
  }

  function renderEra() {
    const letter = sim.eraLetter();
    $('eraLetter').textContent = letter;
    $('eraName').textContent = sim.eraName();
    $('eraSub').textContent = sim.eraSub();
    document.querySelectorAll('.era-dot').forEach((d) => {
      const idx = ERA_LETTERS.indexOf(d.dataset.era);
      d.classList.toggle('done', idx < sim.eraIndex);
      d.classList.toggle('current', idx === sim.eraIndex);
    });
  }

  function buildResourceBar() {
    const bar = $('resourceBar'); bar.innerHTML = '';
    for (const r of RES_BAR) {
      const def = RES[r];
      const chip = document.createElement('div');
      chip.className = 'res-chip' + (r === 'food' ? ' food' : '');
      chip.dataset.res = r;
      chip.innerHTML = `<span class="res-ico">${def.icon}</span><b data-rv="${r}">0</b>` +
        (r === 'food' ? `<span class="res-cap" id="foodCap"></span><span class="res-flow" id="foodFlow">+0/틱</span>` : `<span class="res-flow" data-rf="${r}"></span>`);
      bar.appendChild(chip);
    }
  }

  function renderResourceBar() {
    for (const r of RES_BAR) {
      const v = sim.stock[r] || 0;
      const el = document.querySelector(`[data-rv="${r}"]`);
      if (el) el.textContent = fmt(v, r === 'food' || r === 'wood' || r === 'clay' || r === 'copper' ? 0 : 1);
      const chip = document.querySelector(`.res-chip[data-res="${r}"]`);
      if (chip) chip.classList.toggle('dim', v <= 0 && !producesRes(r));
      if (r === 'food') {
        $('foodFlow').textContent = flowStr();
        const cap = Math.round(sim.storageCap('food'));
        const capEl = $('foodCap'); if (capEl) capEl.textContent = '/ ' + cap;
        if (el) el.classList.toggle('full', v >= cap - 1);  // 한도 도달 → 저장 확장·소비 권장
      } else {
        const fl = document.querySelector(`[data-rf="${r}"]`);
        if (fl) { const made = sim.lastOutputs[r] || 0; fl.textContent = made > 0.001 ? `+${fmt(made, 1)}` : ''; }
      }
    }
  }
  function producesRes(r) {
    for (const id in BLD) { const d = BLD[id]; if (d.outputs && d.outputs[r] && (sim.counts[id] || 0) > 0) return true; }
    return false;
  }
  function flowStr() {
    const made = sim.lastOutputs.food || 0;
    const winterMult = sim.activeEvents.winter ? 1.3 : 1.0;
    const demand = sim.totalPop() * sim.cfg.foodPerCapita * winterMult;
    const net = made - demand;
    return `${net >= 0 ? '+' : ''}${fmt(net, 1)}/틱`;
  }

  function renderEventBanner() {
    const active = Object.keys(sim.activeEvents);
    const banner = $('eventBanner');
    if (!active.length) { banner.classList.add('hidden'); return; }
    const E = window.Bootstrap.EVENTS;
    const parts = active.map((n) => `${E[n].icon} ${E[n].name} (${Math.ceil(sim.activeEvents[n].remaining)}틱)`);
    const anyBad = active.some((n) => !(E[n] && E[n].positive));
    banner.classList.toggle('good', !anyBad);
    banner.textContent = (anyBad ? '⚠ ' : '☀ ') + parts.join(' · ') + ' — ' + active.map((n) => E[n].desc).join(' ');
    banner.classList.remove('hidden');
  }

  function civIndex(m) {
    const wellbeing = Math.max(0, Math.min(1, 0.5 + m.foodSurplusRatio));
    let utilSum = 0, n = 0;
    for (const id of sim.order) if ((sim.counts[id] || 0) > 0) { utilSum += sim.util[id] || 0; n++; }
    const productivity = n ? utilSum / n : 0;
    const resilience = Math.min(1, (m.foodBuffer / 300) * 0.5 + Math.max(0, m.housingHeadroom) / 40 * 0.5);
    const eraMult = 1 + sim.eraIndex * 0.15;
    const btMult = 1 + sim.breakthroughs.size * 0.04;
    return (wellbeing * productivity * (0.5 + 0.5 * resilience)) * 100 * (1 + m.population / 80) * eraMult * btMult;
  }

  // 건설 패널 — 시대 구획으로 나눠 생성. 잠긴 미래 시대는 헤더만(타일 숨김),
  // 시대 진입 시 다시 그려 새 타일을 공개한다(시작 화면 정돈 + 진보의 보상감).
  function buildBuildPanel() {
    const wrap = $('buildList');
    wrap.innerHTML = '';
    let curEra = null;
    for (const id of ORDER) {
      const d = BLD[id];
      const locked = ERA_LETTERS.indexOf(d.era) > sim.eraIndex;
      if (d.era !== curEra) {
        curEra = d.era;
        const hdr = document.createElement('div');
        hdr.className = 'era-section' + (locked ? ' locked' : '');
        hdr.dataset.era = curEra;
        hdr.innerHTML = `<span class="era-tag">${curEra}</span> ${ERA_NAMES[curEra]}` +
          (locked ? `<span class="era-lock">🔒 이전 시대 통과 시 공개</span>` : '');
        wrap.appendChild(hdr);
      }
      if (locked) continue;  // 잠긴 시대 타일은 표시하지 않음(정돈)
      const skilled = d.labor && d.labor.skilled ? '<span class="tag-skill">숙련</span>' : '';
      const inst = d.institution ? '<span class="tag-inst">기관</span>' : '';
      const row = document.createElement('div');
      row.className = 'bld-row'; row.dataset.id = id;
      row.innerHTML = `
        <div class="bld-ico">${d.icon}</div>
        <div class="bld-main">
          <div class="bld-name">${d.name} ${skilled}${inst}<span class="bld-cost">🍞${COST[id]}</span></div>
          <div class="bld-note">${d.note}</div>
          <div class="bld-util-wrap" style="display:none"><div class="bld-util-fill" data-uf="${id}"></div></div>
        </div>
        <div class="bld-ctl">
          <button class="bld-btn minus" data-act="-" data-id="${id}">−</button>
          <span class="bld-count" data-count="${id}">0</span>
          <button class="bld-btn plus" data-act="+" data-id="${id}">+</button>
        </div>`;
      wrap.appendChild(row);
    }
  }

  // 건설/철거 클릭 위임 — init()에서 한 번만 바인딩(리셋마다 누적 방지)
  function bindBuildPanel() {
    $('buildList').addEventListener('click', (e) => {
      const btn = e.target.closest('.bld-btn'); if (!btn) return;
      if (btn.dataset.act === '+') build(btn.dataset.id); else demolish(btn.dataset.id);
    });
  }

  function renderBuildCounts(m) {
    m = m || sim.metrics();
    document.querySelectorAll('.era-section').forEach((h) => {
      const locked = ERA_LETTERS.indexOf(h.dataset.era) > sim.eraIndex;
      h.classList.toggle('locked', locked);
    });
    for (const id of ORDER) {
      const span = document.querySelector(`[data-count="${id}"]`);
      if (span) span.textContent = sim.counts[id] || 0;
      const row = document.querySelector(`.bld-row[data-id="${id}"]`);
      if (!row) continue;
      const locked = !sim.isUnlocked(id);
      row.classList.toggle('locked', locked);
      row.classList.toggle('unaffordable', !locked && !canAfford(id));
      // + 버튼 상태 — 구조적 차단(규모·노동·주거)은 비활성, 식량 부족은 활성 유지(클릭 시 비용 플래시)
      const plus = row.querySelector('.bld-btn.plus');
      if (plus) {
        if (locked) { plus.disabled = false; plus.title = '시대 잠김'; }
        else {
          const st = buildStatus(id, m);
          plus.disabled = !st.ok && st.reason !== '식량 부족';
          plus.title = st.ok ? '건설' : st.reason;
        }
      }
      // 인라인 가동률 바
      const fill = row.querySelector(`[data-uf="${id}"]`);
      if (fill) {
        const cnt = sim.counts[id] || 0;
        const wrap = fill.parentElement;
        if (cnt > 0) {
          const uu = Math.round((sim.util[id] || 0) * 100);
          fill.style.width = uu + '%';
          fill.style.background = uu >= 90 ? '#2ecc71' : (uu >= 50 ? '#f1c40f' : '#e74c3c');
          wrap.style.display = '';
        } else {
          wrap.style.display = 'none';
        }
      }
    }
  }

  function renderGate(m) {
    const wrap = $('gateList'); wrap.innerHTML = '';
    const g = sim.curGate;
    if (!g) {
      wrap.innerHTML = '<div class="gate passed"><div class="gate-head">🏆 야금술 시대 도달 — 모든 게이트 통과!</div></div>';
      $('gateHint').textContent = '문명이 땅속으로 들어갔습니다.';
      return;
    }
    $('gateHint').textContent = g.hint || '현재 시대 루프를 닫으세요';
    const sustainPct = Math.round(g.sustain / g.sustainTicks * 100);
    let conds = '';
    for (const c of g.conditions) {
      const ok = sim._cmp(m[c.metric], c.op, c.value);
      const cur = fmtMetric(c.metric, m[c.metric]);
      const advice = !ok && GATE_ADVICE[c.metric] ? GATE_ADVICE[c.metric](m[c.metric], c.value) : '';
      conds += `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '○'} ${c.label} <span class="cur">(현재 ${cur})</span>` +
        (advice ? `<div class="gate-advice">→ ${advice}</div>` : '') + `</li>`;
    }
    const div = document.createElement('div');
    div.className = 'gate active';
    div.innerHTML = `
      <div class="gate-head">🎯 ${g.label}
        <span class="gate-sustain">유지 ${g.sustain}/${g.sustainTicks}</span></div>
      <div class="gate-track"><div class="gate-fill" style="width:${sustainPct}%"></div></div>
      <ul class="gate-conds">${conds}</ul>`;
    wrap.appendChild(div);
  }

  function fmtMetric(metric, v) {
    if (metric === 'foodSurplusRatio') return (v >= 0 ? '+' : '') + pct(v);
    if (metric === 'fertility' || metric === 'toolCoverage' || metric === 'writing' ||
        metric === 'ecologicalKnowledge' || metric === 'skilledFrac') return pct(v);
    if (metric === 'bronzeRate') return fmt(v, 2);
    return fmt(v, 0);
  }

  function renderHealth(m, pop) {
    const u = sim.pop.unskilled, s = sim.pop.skilled;
    const uPct = pop > 0 ? u / pop * 100 : 0;
    $('popBarU').style.width = uPct + '%';
    $('popBarS').style.width = (100 - uPct) + '%';
    $('popLabel').textContent = `비숙련 ${fmt(u, 0)} · 숙련 ${fmt(s, 0)} (${pct(m.skilledFrac)})`;
    const fs = m.foodSurplusRatio;
    $('surplusLabel').textContent = `${fs >= 0 ? '+' : ''}${pct(fs)}`;
    $('surplusLabel').style.color = fs >= 0.15 ? '#2ecc71' : (fs >= 0 ? '#f1c40f' : '#e74c3c');
    setBar('fertBar', m.fertility, fertColor(m.fertility));
    $('fertLabel').textContent = pct(m.fertility);
    setBar('toolBar', m.toolCoverage, '#6ee7ff');
    $('toolLabel').textContent = pct(m.toolCoverage);
    const housing = sim.housingCap();
    const houseFrac = housing > 0 ? pop / housing : (pop > 0 ? 1.2 : 0);
    setBar('houseBar', Math.min(1, houseFrac), houseFrac > 1 ? '#e74c3c' : '#2ecc71');
    $('houseLabel').textContent = `${fmt(pop, 0)} / ${fmt(housing, 0)}`;
    setBar('ecoBar', m.ecologicalKnowledge, '#b5e48c');
    $('ecoLabel').textContent = pct(m.ecologicalKnowledge);
    setBar('writeBar', m.writing, '#e9c46a');
    $('writeLabel').textContent = pct(m.writing);
    const oreFrac = sim.copperDepositMax ? sim.copperDeposit / sim.copperDepositMax : 0;
    setBar('depositBar', oreFrac, oreFrac < 0.2 ? '#e74c3c' : '#d08b5b');
    $('depositLabel').textContent = fmt(sim.copperDeposit, 0);
  }

  function fertColor(f) { return f >= 0.6 ? '#2ecc71' : (f >= 0.4 ? '#f1c40f' : '#e74c3c'); }
  function setBar(id, frac, color) {
    const el = $(id); if (!el) return;
    el.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
    if (color) el.style.background = color;
  }

  function renderBreakthroughs(m) {
    const wrap = $('breakthroughList'); wrap.innerHTML = '';
    const all = window.Bootstrap.BREAKTHROUGHS;
    for (const bt of all) {
      const got = sim.breakthroughs.has(bt.id);
      const prog = got ? 1 : btProgress(bt.id, m);
      const progPct = Math.round(prog * 100);
      const row = document.createElement('div');
      row.className = 'bt-row' + (got ? ' got' : '');
      row.innerHTML = `
        <span class="bt-ico">${bt.icon}</span>
        <div class="bt-body">
          <div class="bt-head">
            <span class="bt-name">${bt.name}</span>
            <span class="bt-state">${got ? '✓ 발견' : progPct + '%'}</span>
          </div>
          ${!got ? `<div class="bt-prog-wrap"><div class="bt-prog-fill" style="width:${progPct}%"></div></div>` : ''}
        </div>`;
      row.title = bt.narrative;
      wrap.appendChild(row);
    }
  }

  function btProgress(id, m) {
    if (id === 'pottery') {
      return Math.min(
        sim.eraIndex >= 1 ? 1 : 0,
        (sim.counts.clay_pit || 0) > 0 ? 1 : 0,
        m.population / 22,
        sim._spoilPressure() / 0.5
      );
    }
    if (id === 'irrigation') {
      return Math.min(
        sim.droughtCount >= 1 ? 1 : 0,
        m.population / 40,
        m.toolCoverage / 0.3
      );
    }
    if (id === 'writing') {
      return Math.min(
        (sim.counts.scribe_hall || 0) > 0 ? 1 : 0,
        sim.writing / 0.5,
        m.population / 55
      );
    }
    return 0;
  }

  function renderBottlenecks() {
    const wrap = $('bottleneckList'); wrap.innerHTML = '';
    const bn = sim.bottlenecks();
    if (!bn.length) { wrap.innerHTML = '<div class="bn-empty">건물을 지어 생산을 시작하세요.</div>'; return; }
    const top = bn.slice(0, 6);
    for (const b of top) {
      const d = BLD[b.id];
      const uu = Math.round(b.util * 100);
      const color = uu >= 90 ? '#2ecc71' : (uu >= 50 ? '#f1c40f' : '#e74c3c');
      const fix = bnFix(b.reason, b.util);
      const row = document.createElement('div');
      row.className = 'bn-row';
      row.innerHTML = `
        <div class="bn-ico">${d.icon}</div>
        <div class="bn-body">
          <div class="bn-top"><span>${d.name} ×${b.count}</span><span class="bn-reason">${reasonKo(b.reason)}</span></div>
          <div class="bn-track"><div class="bn-fill" style="width:${uu}%;background:${color}"></div></div>
          ${fix ? `<div class="bn-fix">→ ${fix}</div>` : ''}
        </div>
        <div class="bn-util" style="color:${color}">${uu}%</div>`;
      wrap.appendChild(row);
    }
  }

  function bnFix(reason, util) {
    if (util >= 0.85) return '';
    if (reason === 'labor:unskilled') return '식량 흑자 유지 시 자연 성장. 또는 다른 건물을 철거해 노동을 확보하세요.';
    if (reason === 'labor:skilled') return '공방 학교를 더 건설해 숙련 장인을 양성하세요.';
    if (reason === 'input:clay') return '점토 채취장을 더 건설하세요.';
    if (reason === 'input:wood') return '벌목장을 더 건설하세요.';
    if (reason === 'input:copper') return '구리 광산을 더 건설하세요.';
    if (reason === 'input:tin') return '교역소(토기→주석)를 더 건설하세요.';
    if (reason === 'input:bronze') return '제련소(구리+주석+목재→청동)를 더 건설하세요.';
    if (reason === 'input:pottery') return '토기 공방(점토→토기)을 더 건설하세요.';
    if (reason === 'deposit:depleted') return '광맥이 고갈됩니다. 교역소로 전환을 준비하세요.';
    return '';
  }

  // ── 튜토리얼 ─────────────────────────────────────────────────────────────
  function advanceTutorial() {
    if (tutStep >= TUT.length - 1) return;
    if (TUT[tutStep].done && TUT[tutStep].done()) {
      tutStep++;
      if (tutStep >= TUT.length - 1) markTutSeen();  // 마지막 단계까지 완료 → 다시 표시 안 함
      renderTutorial();
    }
  }

  function renderTutorial() {
    const el = $('tutBox');
    if (!el) return;
    const step = TUT[tutStep];
    if (!step || step.text === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('tutText').innerHTML = step.text;
    $('tutProg').textContent = `${tutStep + 1} / ${TUT.length - 1}`;
  }

  // ── 오버레이 / 토스트 / 컨트롤 ──────────────────────────────────────────
  function showToast(icon, name, text) {
    $('btToastIcon').textContent = icon;
    $('btToastName').textContent = name;
    $('btToastText').textContent = text;
    const el = $('btToast');
    el.classList.remove('hidden'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 5200);
  }

  function flashEraAdvance() {
    Sound.eraAdvance();
    const badge = $('eraBadge');
    badge.classList.remove('flash'); void badge.offsetWidth; badge.classList.add('flash');
    const letter = sim.eraLetter();
    showToast('🏛️', ERA_NAMES[letter] + ' 진입!', sim.eraSub() + ' — 새 건물이 해금되었습니다.');
  }

  function showOverlay(victory) {
    if (victory) Sound.victory(); else Sound.collapse();
    clearSave();   // 종료된 게임의 세이브는 폐기
    const ov = $('overlay');
    $('ovIcon').textContent = victory ? '🏛️' : '💀';
    $('ovTitle').textContent = victory ? '야금술 시대 도달!' : '문명 붕괴';
    let recordLine = '';
    if (victory) {
      const st = starsFor(sim.t);
      const best = loadBest() || { t: Infinity, wins: 0, stars: 0 };
      const isRecord = sim.t < best.t;
      const nb = { t: Math.min(best.t, sim.t), wins: (best.wins || 0) + 1, stars: Math.max(best.stars || 0, st) };
      try { localStorage.setItem(BEST_KEY, JSON.stringify(nb)); } catch (e) {}
      recordLine = `<br><span class="stars">${starStr(st)}</span> ` +
        (isRecord ? '<b>신기록!</b>' : `최고 기록 <b>${nb.t}틱</b>`) + ` · 통산 승리 <b>${nb.wins}회</b>`;
    }
    $('ovMsg').innerHTML = victory
      ? `네 개의 시대 게이트를 모두 지속 통과했습니다.<br><b>${sim.t}틱</b> 만에 채집에서 금속으로 — 문명의 자급 루프를 차례로 닫았습니다.<br>최종 인구 <b>${fmt(sim.totalPop(), 0)}</b> · 문명 지수 <b>${fmt(civIndex(sim.metrics()), 0)}</b> · 돌파 <b>${sim.breakthroughs.size}/3</b>${recordLine}`
      : `인구가 0에 도달했습니다.<br>식량→인구→노동 사슬이 무너지면 모든 생산이 멈춥니다.<br>식량 흑자와 비축, 토양 비옥도를 먼저 안정시키세요.`;
    $('ovBtn').textContent = '다시 시작';
    ov.classList.add('visible');
    if (victory && window.AdMobHelper) AdMobHelper.showAfterGame();
  }

  function setSpeedButtons() {
    document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', +b.dataset.speed === speed && !paused));
    $('pauseBtn').classList.toggle('paused', paused);
  }
  function togglePause() { paused = !paused; if (!paused) lastTime = performance.now(); setSpeedButtons(); }

  // ── 부트스트랩 ───────────────────────────────────────────────────────────
  function init() {
    challenge = false;
    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => { speed = +btn.dataset.speed; paused = false; lastTime = performance.now(); setSpeedButtons(); });
    });
    $('pauseBtn').addEventListener('click', togglePause);
    $('restartBtn').addEventListener('click', () => reset());
    $('ovBtn').addEventListener('click', () => reset());
    $('activeActionBtn').addEventListener('click', runActiveAction);
    $('helpBtn').addEventListener('click', () => $('helpModal').classList.toggle('hidden'));
    $('helpClose').addEventListener('click', () => $('helpModal').classList.add('hidden'));
    $('startBtn').addEventListener('click', () => { Sound.resume(); challenge = $('challengeToggle').checked; reset(); });
    const muteBtn = $('muteBtn');
    if (muteBtn) {
      if (Sound.isMuted()) { muteBtn.textContent = '🔇'; muteBtn.title = '소리 켜기'; }
      muteBtn.addEventListener('click', () => {
        const m = Sound.toggle();
        muteBtn.textContent = m ? '🔇' : '🔊';
        muteBtn.title = m ? '소리 켜기' : '음소거';
      });
    }
    const tutDismiss = $('tutDismiss');
    if (tutDismiss) tutDismiss.addEventListener('click', () => {
      tutStep = TUT.length - 1;
      markTutSeen();
      $('tutBox').classList.add('hidden');
    });

    // 시작 화면 — 최고 기록 + 이어하기
    const best = loadBest();
    if (best && best.wins) {
      const bl = $('bestLine');
      if (bl) { bl.textContent = `🏆 최고 기록 ${starStr(best.stars || 1)} ${best.t}틱 · 통산 승리 ${best.wins}회`; bl.classList.remove('hidden'); }
    }
    const sv = loadSaveData();
    const contBtn = $('continueBtn');
    if (sv && contBtn) {
      contBtn.textContent = `📂 이어하기 — 시대 ${ERA_LETTERS[sv.s.eraIndex] || 'A'} · ${sv.s.t}틱`;
      contBtn.classList.remove('hidden');
      contBtn.addEventListener('click', () => { Sound.resume(); reset(loadSaveData()); });
    }

    // 키보드 단축키: Space 일시정지 · 1–4 배속 · H/? 도움말
    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        if (state === 'playing') { e.preventDefault(); togglePause(); }
      } else if (e.key === 'f' || e.key === 'F') {
        runActiveAction();
      } else if (e.key >= '1' && e.key <= '4') {
        if (state === 'playing') { speed = [1, 2, 4, 8][+e.key - 1]; paused = false; lastTime = performance.now(); setSpeedButtons(); }
      } else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        $('helpModal').classList.toggle('hidden');
      }
    });

    // 탭 이탈/닫기 직전 저장
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
    window.addEventListener('pagehide', saveGame);

    bindBuildPanel();
    fillHelp();
    requestAnimationFrame(loop);
  }

  function fillHelp() {
    $('helpBody').innerHTML = `
      <h4>클릭하고 방치하며 키우기</h4>
      시대별 큰 행동 버튼을 누르면 즉시 자원을 얻고 <b>황금기</b>가 충전됩니다. 빠르게 연속 행동하면 콤보가 올라 충전이 빨라지고, 황금기 동안 모든 자동 생산이 <b>1.8배</b>가 됩니다. 문명을 떠났다가 이어하면 최대 4시간의 휴식 시간으로 황금기 충전을 일부 회복합니다. <b>F</b> 키로도 직접 행동할 수 있습니다.
      <h4>핵심 사상 — 루프로 자라는 문명</h4>
      다음 시대는 자원 누적이 아니라 <b>현재 시대의 자급 루프를 안정적으로 닫았을 때</b> 열립니다.
      각 시대 게이트의 <b>모든 조건을 연속 유지</b>해야 통과합니다(돌진 방지).
      <h4>min() 가동률</h4>
      모든 생산자는 매 틱 <b>가장 부족한 제약</b>만큼만 가동합니다:
      <code>가동률 = min(노동, 입력 자원, 광맥)</code>
      한 층(식량·노동)이 무너지면 위층(금속)까지 연쇄로 무너집니다.
      각 건물 행의 <b>색 가동률 바</b>(녹색=정상 / 노랑=경고 / 빨강=병목)가 실시간으로 보여줍니다.
      <h4>식량과 저장 🍞</h4>
      식량은 칼로리 통화이자 <b>건설 비용</b>입니다. <b>저장 한도를 넘는 식량은 빠르게 썩어</b> 사라집니다 —
      화덕·곡물창고·토기로 한도를 늘려야 큰 비축이 가능합니다. 자원 바의 <b>X / 한도</b>가 노랗게 차면 저장을 늘리거나 더 건설하세요.
      <h4>시대 흐름</h4>
      <ul>
        <li><b>A 채집</b> — 채집/사냥으로 인구를 키우고 생태 지식을 쌓는다</li>
        <li><b>B 농경</b> — 경작지+퇴비로 흑자와 비옥도를 동시에 유지</li>
        <li><b>C 정착</b> — 곡물창고·토기로 비축, 서기소로 문자, 주거 확보</li>
        <li><b>D 분업</b> — 학교로 숙련 장인, 광산→제련소→대장간으로 청동·도구 루프</li>
        <li><b>E 야금술</b> — 도달 시 승리</li>
      </ul>
      <h4>돌파 💡</h4>
      <b>토기·관개·문자</b>는 구매가 아니라 조건이 무르익으면 자동으로 <b>발견</b>됩니다.
      돌파 패널의 <b>진행률(%)</b>이 각 발견까지 얼마나 왔는지 보여줍니다.
      <h4>사건 ⚠</h4>
      가뭄(작물 급감)·홍수(토양·식량 피해)·혹한(소비 증가)·<b>역병(과밀 시 인구 감소 — 주거 여유로 예방)</b>.
      가끔 <b>풍년 🌾</b>이 찾아와 수확이 크게 늘기도 합니다. 비축과 흑자 여유가 충분하면 견딥니다.
      <h4>진단 도구</h4>
      <b>병목 분석기</b>가 가동률·구속 사유·개선 조언을 실시간으로, <b>연대기 📜</b>가 문명의 역사를,
      <b>추이 그래프</b>가 인구·식량의 흐름을 보여줍니다.
      <h4>저장·단축키</h4>
      진행은 <b>25틱마다 자동 저장</b>되어 다음 방문 때 이어할 수 있습니다(승리·붕괴 시 초기화).
      <b>F</b> 직접 행동 · <b>Space</b> 일시정지 · <b>1–4</b> 배속 · <b>H</b> 도움말. 승리 시 소요 틱에 따라 ★ 등급과 최고 기록이 남습니다.`;
  }

  init();
})();
