// CIVILIZATION ENGINE — 루프로 자라는 문명 (MVP: 시대 A→E)
// 헤드리스 시뮬레이션 코어(sim.js)를 브라우저 대시보드로 감싼 플레이 가능한 게임.
// 플레이어는 유한한 인구를 시대별 건물에 배분하고, min() 엔진이 만드는 병목을 진단하며
// 순차 시대 게이트(채집→농경→정착→분업→야금술)의 자급 루프를 차례로 닫는다.
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
  // 표시 순서(시대 → 화면 순)
  const ORDER = [
    'forager_camp', 'hunting_lodge', 'fire_pit', 'shelter',
    'crop_field', 'compost_yard', 'pasture', 'clay_pit',
    'granary', 'pottery_workshop', 'irrigation_canal', 'longhouse', 'scribe_hall',
    'craft_school', 'lumber_camp', 'copper_mine', 'smelter', 'toolsmith', 'trade_post',
  ];

  // 자원 바에 표시할 자원
  const RES_BAR = ['food', 'wood', 'clay', 'pottery', 'tools', 'copper', 'tin', 'bronze'];

  // 병목 사유 한글화
  const REASON_KO = {
    ok: '정상', idle: '유휴',
    'labor:unskilled': '비숙련 노동 부족', 'labor:skilled': '숙련 노동 부족',
    'input:clay': '점토 부족', 'input:wood': '목재 부족', 'input:copper': '구리 부족',
    'input:tin': '주석 부족', 'input:bronze': '청동 부족', 'input:pottery': '토기 부족',
    'deposit:depleted': '광맥 고갈',
  };
  const reasonKo = (r) => REASON_KO[r] || r;

  const TICKS_PER_SEC = 2;   // 1× 기준 초당 틱
  let sim, state, speed, paused, elapsedAcc, lastTime, challenge, lastEra, toastTimer;

  const $ = (id) => document.getElementById(id);

  // ── 시작/리셋 ───────────────────────────────────────────────────────
  function reset() {
    const sc = clone(SCENARIO);
    if (challenge) {
      // 도전: 사건 발생 확률을 끌어올려 식량→인구→노동 연쇄 충격을 자주 겪게 한다.
      sc.config = Object.assign({}, sc.config, { challenge: true });
    }
    sim = new Sim(RES, BLD, sc);
    if (challenge) {
      // EVENTS 확률은 sim 내부 상수라 직접 못 바꾸므로, 도전 시 시작 비축을 줄여 난도↑
      sim.stock.food = 70;
    }
    speed = 1; paused = false; elapsedAcc = 0; lastTime = performance.now();
    state = 'playing'; lastEra = 0;
    buildBuildPanel();
    buildResourceBar();
    setSpeedButtons();
    $('overlay').classList.remove('visible');
    $('startOverlay').classList.remove('visible');
    $('eventBanner').classList.add('hidden');
    $('btToast').classList.add('hidden');
    render();
  }

  // ── 건설/철거 ───────────────────────────────────────────────────────
  function canAfford(id) { return (sim.stock.food || 0) >= COST[id]; }
  function build(id) {
    if (state !== 'playing') return;
    if (!sim.isUnlocked(id)) return;
    if (!canAfford(id)) { flashCost(id); return; }
    sim.stock.food -= COST[id];
    sim.counts[id] = (sim.counts[id] || 0) + 1;
    render();
  }
  function demolish(id) {
    if (state !== 'playing') return;
    if ((sim.counts[id] || 0) <= 0) return;
    sim.counts[id]--;
    sim.stock.food = (sim.stock.food || 0) + COST[id] * 0.5;  // 50% 환급
    render();
  }
  function flashCost(id) {
    const el = document.querySelector(`.bld-row[data-id="${id}"] .bld-cost`);
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  // ── 메인 루프 ───────────────────────────────────────────────────────
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
      if (steps > 0) render();
    }
    requestAnimationFrame(loop);
  }

  function handleSimEvents() {
    // 시대 전진 연출
    if (sim.eraIndex !== lastEra) {
      lastEra = sim.eraIndex;
      flashEraAdvance();
    }
    // 돌파 발견 토스트
    if (sim.pendingBreakthrough) {
      const bt = sim.pendingBreakthrough; sim.pendingBreakthrough = null;
      showToast(bt.icon, bt.name + ' 발견!', bt.narrative);
    }
  }

  function checkEnd() {
    const pop = sim.totalPop();
    if (pop < 1 && state === 'playing') { state = 'over'; showOverlay(false); return; }
    if (sim.won() && state === 'playing') { state = 'over'; showOverlay(true); }
  }

  // ── 렌더링 ──────────────────────────────────────────────────────────
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
    renderEventBanner();
    renderBuildCounts();
    renderGate(m);
    renderHealth(m, pop);
    renderBreakthroughs();
    renderBottlenecks();
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
        (r === 'food' ? `<span class="res-flow" id="foodFlow">+0/틱</span>` : `<span class="res-flow" data-rf="${r}"></span>`);
      bar.appendChild(chip);
    }
  }

  function renderResourceBar() {
    for (const r of RES_BAR) {
      const v = sim.stock[r] || 0;
      const el = document.querySelector(`[data-rv="${r}"]`);
      if (el) el.textContent = fmt(v, r === 'food' || r === 'wood' || r === 'clay' || r === 'copper' ? 0 : 1);
      // 해당 시대 자원만 강조(미해금 자원은 흐리게)
      const chip = document.querySelector(`.res-chip[data-res="${r}"]`);
      if (chip) chip.classList.toggle('dim', v <= 0 && !producesRes(r));
      if (r === 'food') { $('foodFlow').textContent = flowStr('food'); }
      else {
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
    banner.textContent = '⚠ ' + parts.join(' · ') + ' — ' + active.map((n) => E[n].desc).join(' ');
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

  // 건설 패널 — 시대 구획으로 나눠 1회 생성, 해금 여부는 매 틱 갱신
  function buildBuildPanel() {
    const wrap = $('buildList');
    wrap.innerHTML = '';
    let curEra = null;
    for (const id of ORDER) {
      const d = BLD[id];
      if (d.era !== curEra) {
        curEra = d.era;
        const hdr = document.createElement('div');
        hdr.className = 'era-section';
        hdr.dataset.era = curEra;
        hdr.innerHTML = `<span class="era-tag">${curEra}</span> ${ERA_NAMES[curEra]}`;
        wrap.appendChild(hdr);
      }
      const skilled = d.labor && d.labor.skilled ? '<span class="tag-skill">숙련</span>' : '';
      const inst = d.institution ? '<span class="tag-inst">기관</span>' : '';
      const row = document.createElement('div');
      row.className = 'bld-row'; row.dataset.id = id;
      row.innerHTML = `
        <div class="bld-ico">${d.icon}</div>
        <div class="bld-main">
          <div class="bld-name">${d.name} ${skilled}${inst}<span class="bld-cost">🍞${COST[id]}</span></div>
          <div class="bld-note">${d.note}</div>
        </div>
        <div class="bld-ctl">
          <button class="bld-btn minus" data-act="-" data-id="${id}">−</button>
          <span class="bld-count" data-count="${id}">0</span>
          <button class="bld-btn plus" data-act="+" data-id="${id}">+</button>
        </div>`;
      wrap.appendChild(row);
    }
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.bld-btn'); if (!btn) return;
      if (btn.dataset.act === '+') build(btn.dataset.id); else demolish(btn.dataset.id);
    });
  }

  function renderBuildCounts() {
    // 시대 구획 잠금 표시
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
      conds += `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '○'} ${c.label} <span class="cur">(현재 ${cur})</span></li>`;
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

  function renderBreakthroughs() {
    const wrap = $('breakthroughList'); wrap.innerHTML = '';
    const all = window.Bootstrap.BREAKTHROUGHS;
    for (const bt of all) {
      const got = sim.breakthroughs.has(bt.id);
      const row = document.createElement('div');
      row.className = 'bt-row' + (got ? ' got' : '');
      row.innerHTML = `<span class="bt-ico">${bt.icon}</span>
        <span class="bt-name">${bt.name}</span>
        <span class="bt-state">${got ? '✓ 발견' : '잠김'}</span>`;
      row.title = bt.narrative;
      wrap.appendChild(row);
    }
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
      const row = document.createElement('div');
      row.className = 'bn-row';
      row.innerHTML = `
        <div class="bn-ico">${d.icon}</div>
        <div class="bn-body">
          <div class="bn-top"><span>${d.name} ×${b.count}</span><span class="bn-reason">${reasonKo(b.reason)}</span></div>
          <div class="bn-track"><div class="bn-fill" style="width:${uu}%;background:${color}"></div></div>
        </div>
        <div class="bn-util" style="color:${color}">${uu}%</div>`;
      wrap.appendChild(row);
    }
  }

  // ── 오버레이 / 토스트 / 컨트롤 ────────────────────────────────────────
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
    const badge = $('eraBadge');
    badge.classList.remove('flash'); void badge.offsetWidth; badge.classList.add('flash');
    const letter = sim.eraLetter();
    showToast('🏛️', ERA_NAMES[letter] + ' 진입!', sim.eraSub() + ' — 새 건물이 해금되었습니다.');
  }

  function showOverlay(victory) {
    const ov = $('overlay');
    $('ovIcon').textContent = victory ? '🏛️' : '💀';
    $('ovTitle').textContent = victory ? '야금술 시대 도달!' : '문명 붕괴';
    $('ovMsg').innerHTML = victory
      ? `네 개의 시대 게이트를 모두 지속 통과했습니다.<br><b>${sim.t}틱</b> 만에 채집에서 금속으로 — 문명의 자급 루프를 차례로 닫았습니다.<br>최종 인구 <b>${fmt(sim.totalPop(), 0)}</b> · 문명 지수 <b>${fmt(civIndex(sim.metrics()), 0)}</b> · 돌파 <b>${sim.breakthroughs.size}/3</b>`
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

  // ── 부트스트랩 ──────────────────────────────────────────────────────
  function init() {
    challenge = false;
    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => { speed = +btn.dataset.speed; paused = false; lastTime = performance.now(); setSpeedButtons(); });
    });
    $('pauseBtn').addEventListener('click', togglePause);
    $('restartBtn').addEventListener('click', reset);
    $('ovBtn').addEventListener('click', reset);
    $('helpBtn').addEventListener('click', () => $('helpModal').classList.toggle('hidden'));
    $('helpClose').addEventListener('click', () => $('helpModal').classList.add('hidden'));
    $('startBtn').addEventListener('click', () => { challenge = $('challengeToggle').checked; reset(); });

    fillHelp();
    requestAnimationFrame(loop);
  }

  function fillHelp() {
    $('helpBody').innerHTML = `
      <h4>핵심 사상 — 루프로 자라는 문명</h4>
      다음 시대는 자원 누적이 아니라 <b>현재 시대의 자급 루프를 안정적으로 닫았을 때</b> 열립니다.
      각 시대 게이트의 <b>모든 조건을 연속 유지</b>해야 통과합니다(돌진 방지).
      <h4>min() 가동률</h4>
      모든 생산자는 매 틱 <b>가장 부족한 제약</b>만큼만 가동합니다:
      <code>가동률 = min(노동, 입력 자원, 광맥)</code>
      그래서 한 층(식량·노동)이 무너지면 위층(금속)까지 연쇄로 무너집니다.
      <h4>시대 흐름</h4>
      <ul>
        <li><b>A 채집</b> — 채집/사냥으로 인구를 키우고 생태 지식을 쌓는다</li>
        <li><b>B 농경</b> — 경작지+퇴비로 흑자와 비옥도를 동시에 유지</li>
        <li><b>C 정착</b> — 곡물창고·토기로 비축, 서기소로 문자, 주거 확보</li>
        <li><b>D 분업</b> — 학교로 숙련 장인, 광산→제련소→대장간으로 청동·도구 루프</li>
        <li><b>E 야금술</b> — 도달 시 승리</li>
      </ul>
      <h4>돌파 💡</h4>
      <b>토기·관개·문자</b>는 구매가 아니라 조건이 무르익으면 <b>발견</b>됩니다. 부패 압력·가뭄 경험·기록 필요가 쌓일 때 등장합니다.
      <h4>사건 ⚠</h4>
      가뭄(작물 급감)·홍수(토양·식량 피해)·혹한(소비 증가). 비축과 흑자 여유가 충분하면 견딥니다.
      <h4>진단 도구</h4>
      <b>병목 분석기</b>가 각 건물의 가동률과 구속 사유를 실시간으로 보여줍니다. 가장 낮은 항목을 넓히는 것이 정답입니다.`;
  }

  init();
})();
