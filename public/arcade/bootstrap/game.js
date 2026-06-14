// BOOTSTRAP — 흙에서 특이점까지 (MVP 수직 슬라이스)
// 헤드리스 시뮬레이션 코어(sim.js)를 브라우저 대시보드로 감싼 플레이 가능한 게임.
// 플레이어는 유한한 인구를 건물에 배분하고, min() 엔진이 만드는 병목을 진단하며
// 지속형 다조건 게이트(정착 → 초기 공장)를 통과시킨다.
(function () {
  'use strict';

  const { Sim, RES, BLD, SCENARIO, clone } = window.Bootstrap;

  // 건설 비용(식량) — "칼로리가 문명을 짓는다". 철거 시 50% 환급.
  const COST = {
    forager_camp: 8, farm: 14, compost_yard: 10, granary: 18, house: 30,
    lumber_camp: 14, mine: 20, smelter: 24, toolsmith: 20, school: 26,
  };
  const ORDER = ['forager_camp', 'farm', 'compost_yard', 'granary', 'house', 'school', 'lumber_camp', 'mine', 'smelter', 'toolsmith'];

  // 병목 사유 한글화
  const REASON_KO = {
    ok: '정상', idle: '유휴',
    'labor:unskilled': '비숙련 노동 부족', 'labor:skilled': '숙련 노동 부족',
    'input:ore': '철광석 부족', 'input:wood': '목재 부족', 'input:steel': '강철 부족',
    'deposit:depleted': '광맥 고갈',
  };
  const reasonKo = (r) => REASON_KO[r] || r;

  const TICKS_PER_SEC = 2;   // 1× 기준 초당 틱
  let sim, state, speed, paused, elapsedAcc, lastTime, won, lost, challenge;

  const $ = (id) => document.getElementById(id);

  // ── 시작/리셋 ───────────────────────────────────────────────────────
  function reset() {
    const sc = clone(SCENARIO);
    if (challenge) {
      // 작물 역병 도전: 비옥도 회복을 일정 기간 강하게 억제 → 식량→인구→노동 연쇄 시연
      sc.events.push({ tick: 150, type: 'blight', duration: 240, level: 0.35 });
    }
    sim = new Sim(RES, BLD, sc);
    speed = 1; paused = false; elapsedAcc = 0; lastTime = performance.now();
    won = false; lost = false; state = 'playing';
    buildBuildPanel();
    setSpeedButtons();
    $('overlay').classList.remove('visible');
    $('startOverlay').classList.remove('visible');
    $('eventBanner').classList.add('hidden');
    render();
  }

  // ── 건설/철거 ───────────────────────────────────────────────────────
  function canAfford(id) { return (sim.stock.food || 0) >= COST[id]; }
  function build(id) {
    if (state !== 'playing') return;
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
      while (elapsedAcc >= 1 && steps < 200) { sim.tick(); elapsedAcc -= 1; steps++; checkEnd(); if (state !== 'playing') break; }
      if (steps > 0) render();
    }
    requestAnimationFrame(loop);
  }

  function checkEnd() {
    const pop = sim.pop.unskilled + sim.pop.skilled;
    if (pop < 1 && !lost) { lost = true; state = 'over'; showOverlay(false); return; }
    if (sim.gates.every((g) => g.passed) && !won) { won = true; state = 'over'; showOverlay(true); }
    // 역병 배너
    if (sim.t < sim.blightUntil) $('eventBanner').classList.remove('hidden');
    else $('eventBanner').classList.add('hidden');
  }

  // ── 렌더링 ──────────────────────────────────────────────────────────
  function fmt(n, d) { return (n || 0).toFixed(d == null ? 1 : d); }
  function pct(n) { return Math.round((n || 0) * 100) + '%'; }

  function render() {
    const m = sim.metrics();
    const pop = sim.pop.unskilled + sim.pop.skilled;

    // 헤더
    $('tickCount').textContent = sim.t;
    $('popCount').textContent = fmt(pop, 0);
    $('ciValue').textContent = fmt(civIndex(m), 0);

    // 자원 막대
    $('foodVal').textContent = fmt(sim.stock.food, 0);
    $('foodFlow').textContent = flowStr('food');
    $('woodVal').textContent = fmt(sim.stock.wood, 0);
    $('oreVal').textContent = fmt(sim.stock.ore, 0);
    $('steelVal').textContent = fmt(sim.stock.steel, 1);
    $('toolsVal').textContent = fmt(sim.stock.tools, 1);

    renderBuildCounts();
    renderHealth(m, pop);
    renderGates(m);
    renderBottlenecks();
  }

  function flowStr(res) {
    const made = sim.lastOutputs[res] || 0;
    if (res === 'food') {
      const demand = (sim.pop.unskilled + sim.pop.skilled) * sim.cfg.foodPerCapita;
      const net = made - demand;
      return `${net >= 0 ? '+' : ''}${fmt(net, 1)}/틱`;
    }
    return `+${fmt(made, 1)}/틱`;
  }

  function civIndex(m) {
    const wellbeing = Math.max(0, Math.min(1, 0.5 + m.foodSurplusRatio)) ;
    let utilSum = 0, n = 0;
    for (const id of sim.order) if ((sim.counts[id] || 0) > 0) { utilSum += sim.util[id] || 0; n++; }
    const productivity = n ? utilSum / n : 0;
    const resilience = Math.min(1, (m.foodBuffer / 300) * 0.5 + Math.max(0, m.housingHeadroom) / 40 * 0.5);
    return (wellbeing * productivity * (0.5 + 0.5 * resilience)) * 100 * (1 + m.population / 100);
  }

  // 건설 패널 (정적 구조 1회 생성)
  function buildBuildPanel() {
    const wrap = $('buildList');
    wrap.innerHTML = '';
    for (const id of ORDER) {
      const d = BLD[id];
      const row = document.createElement('div');
      row.className = 'bld-row'; row.dataset.id = id;
      const skilled = d.labor && d.labor.skilled ? '<span class="tag-skill">숙련</span>' : '';
      row.innerHTML = `
        <div class="bld-ico">${d.icon}</div>
        <div class="bld-main">
          <div class="bld-name">${d.name} ${skilled}<span class="bld-cost">🍞${COST[id]}</span></div>
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
    for (const id of ORDER) {
      const span = document.querySelector(`[data-count="${id}"]`);
      if (span) span.textContent = sim.counts[id] || 0;
      const row = document.querySelector(`.bld-row[data-id="${id}"]`);
      if (row) row.classList.toggle('unaffordable', !canAfford(id));
    }
  }

  function renderHealth(m, pop) {
    // 인구 피라미드
    const u = sim.pop.unskilled, s = sim.pop.skilled;
    const uPct = pop > 0 ? u / pop * 100 : 0;
    $('popBarU').style.width = uPct + '%';
    $('popBarS').style.width = (100 - uPct) + '%';
    $('popPyramid').title = `비숙련 ${fmt(u, 0)} / 숙련 ${fmt(s, 0)}`;
    $('popLabel').textContent = `비숙련 ${fmt(u, 0)} · 숙련 ${fmt(s, 0)}`;

    setBar('fertBar', m.fertility, fertColor(m.fertility));
    $('fertLabel').textContent = pct(m.fertility);
    setBar('toolBar', m.toolCoverage, '#6ee7ff');
    $('toolLabel').textContent = pct(m.toolCoverage);

    const housing = sim.housingCap();
    const houseFrac = housing > 0 ? pop / housing : (pop > 0 ? 1.2 : 0);
    setBar('houseBar', Math.min(1, houseFrac), houseFrac > 1 ? '#e74c3c' : '#2ecc71');
    $('houseLabel').textContent = `${fmt(pop, 0)} / ${fmt(housing, 0)}`;

    // 식량 흑자율
    const fs = m.foodSurplusRatio;
    $('surplusLabel').textContent = `${fs >= 0 ? '+' : ''}${pct(fs)}`;
    $('surplusLabel').style.color = fs >= 0.15 ? '#2ecc71' : (fs >= 0 ? '#f1c40f' : '#e74c3c');

    // 광맥 잔량
    const oreFrac = sim.oreDepositMax ? sim.oreDeposit / sim.oreDepositMax : 0;
    setBar('depositBar', oreFrac, oreFrac < 0.2 ? '#e74c3c' : '#9c7b5b');
    $('depositLabel').textContent = fmt(sim.oreDeposit, 0);
  }

  function fertColor(f) { return f >= 0.6 ? '#2ecc71' : (f >= 0.4 ? '#f1c40f' : '#e74c3c'); }
  function setBar(id, frac, color) {
    const el = $(id); el.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
    if (color) el.style.background = color;
  }

  function renderGates(m) {
    const wrap = $('gateList'); wrap.innerHTML = '';
    for (const g of sim.gates) {
      const div = document.createElement('div');
      div.className = 'gate' + (g.passed ? ' passed' : '');
      const sustainPct = g.passed ? 100 : Math.round(g.sustain / g.sustainTicks * 100);
      let conds = '';
      for (const c of g.conditions) {
        const ok = sim._cmp(m[c.metric], c.op, c.value);
        const cur = fmtMetric(c.metric, m[c.metric]);
        conds += `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '○'} ${c.label} <span class="cur">(현재 ${cur})</span></li>`;
      }
      div.innerHTML = `
        <div class="gate-head">${g.passed ? '✅' : '🎯'} ${g.label}
          <span class="gate-sustain">${g.passed ? '통과' : `유지 ${g.sustain}/${g.sustainTicks}`}</span></div>
        <div class="gate-track"><div class="gate-fill" style="width:${sustainPct}%"></div></div>
        <ul class="gate-conds">${conds}</ul>`;
      wrap.appendChild(div);
    }
  }

  function fmtMetric(metric, v) {
    if (metric === 'foodSurplusRatio') return (v >= 0 ? '+' : '') + pct(v);
    if (metric === 'fertility' || metric === 'toolCoverage') return pct(v);
    if (metric === 'steelRate') return fmt(v, 2);
    return fmt(v, 0);
  }

  function renderBottlenecks() {
    const wrap = $('bottleneckList'); wrap.innerHTML = '';
    const bn = sim.bottlenecks();
    if (!bn.length) { wrap.innerHTML = '<div class="bn-empty">건물을 지어 생산을 시작하세요.</div>'; return; }
    const top = bn.slice(0, 6);
    for (const b of top) {
      const d = BLD[b.id];
      const u = Math.round(b.util * 100);
      const color = u >= 90 ? '#2ecc71' : (u >= 50 ? '#f1c40f' : '#e74c3c');
      const row = document.createElement('div');
      row.className = 'bn-row';
      row.innerHTML = `
        <div class="bn-ico">${d.icon}</div>
        <div class="bn-body">
          <div class="bn-top"><span>${d.name} ×${b.count}</span><span class="bn-reason">${reasonKo(b.reason)}</span></div>
          <div class="bn-track"><div class="bn-fill" style="width:${u}%;background:${color}"></div></div>
        </div>
        <div class="bn-util" style="color:${color}">${u}%</div>`;
      wrap.appendChild(row);
    }
  }

  // ── 오버레이 / 컨트롤 ────────────────────────────────────────────────
  function showOverlay(victory) {
    const ov = $('overlay');
    $('ovIcon').textContent = victory ? '🏛️' : '💀';
    $('ovTitle').textContent = victory ? '문명의 도약!' : '문명 붕괴';
    $('ovMsg').innerHTML = victory
      ? `두 게이트를 모두 지속 통과했습니다.<br><b>${sim.t}틱</b> 만에 흙에서 강철로 — 정착과 초기 공장을 세웠습니다.<br>문명 지수 <b>${fmt(civIndex(sim.metrics()), 0)}</b>`
      : `인구가 0에 도달했습니다.<br>식량→인구→노동 연쇄가 무너지면 모든 생산이 멈춥니다.<br>식량 흑자와 비축을 먼저 안정시키세요.`;
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
    $('challengeToggle').addEventListener('change', (e) => { challenge = e.target.checked; });
    $('startBtn').addEventListener('click', () => { challenge = $('challengeToggle').checked; reset(); });

    fillHelp();
    // 시작 오버레이는 startOverlay 로 표시 중
    requestAnimationFrame(loop);
  }

  function fillHelp() {
    $('helpBody').innerHTML = `
      <h4>핵심 사상 — min() 가동률</h4>
      모든 생산자는 매 틱 <b>가장 부족한 제약</b>만큼만 가동합니다:
      <code>가동률 = min(노동, 입력 자원, 광맥)</code>
      그래서 한 층(식량·노동)이 무너지면 위층(공장)까지 연쇄로 무너집니다.
      <h4>플레이 흐름</h4>
      <ul>
        <li>🍞 건설은 <b>식량</b>을 소비합니다(칼로리가 문명을 짓는다). 흑자를 유지하며 확장하세요.</li>
        <li>① 채집/농장으로 <b>식량 흑자</b> → 인구 증가</li>
        <li>② <b>퇴비장</b>으로 비옥도 유지(농장은 비옥도를 깎음)</li>
        <li>③ <b>곡물창고</b>로 비축·부패 방지, <b>주거</b>로 인구 수용</li>
        <li>④ <b>학교</b>로 비숙련→숙련 노동 양성</li>
        <li>⑤ <b>벌목장+광산→제련소(강철)→대장간(도구)</b>. 도구는 농장·광산 출력을 끌어올림</li>
      </ul>
      <h4>승리 / 패배</h4>
      두 게이트(<b>정착</b>·<b>초기 공장</b>)의 모든 조건을 <b>30틱 연속</b> 유지하면 승리. 인구가 0이 되면 붕괴.
      <h4>진단 도구</h4>
      <b>병목 분석기</b>가 각 건물의 가동률과 구속 사유를 실시간으로 보여줍니다. 가장 낮은 항목을 넓히는 것이 정답입니다.
      <h4>도전 모드</h4>
      작물 역병(중반 비옥도 급락)을 켜면 식량→인구→노동→강철 연쇄 붕괴를 직접 겪습니다.`;
  }

  init();
})();
