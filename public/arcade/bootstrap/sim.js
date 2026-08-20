// CIVILIZATION ENGINE — 루프 기반 문명 진보 시뮬레이션 코어 (MVP: 시대 A→E)
// 핵심 규칙(the spine): 모든 생산자는 매 틱 min()-가동률로 동작한다.
//   가동률 = min(노동 비율, 입력 자원 비율, 광맥 비율)
//   출력   = 기준치 × 가동률 × 출력배수(도구·비옥도·관개·가뭄…)
// 시대는 "자원을 모았다"가 아니라 "현재 시대의 자급 루프를 안정적으로 닫았을 때"만 전진한다.
// 각 시대 게이트는 다조건을 N틱 연속 동시 충족해야 통과한다(돌진 방지).
(function () {
  'use strict';

  const TIERS = ['unskilled', 'skilled'];
  const ERA_LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const ERA_NAMES = {
    A: '채집 시대', B: '농경 시대', C: '정착·저장 시대', D: '초기 공예·금속 시대', E: '광물 시대',
  };
  const ERA_SUBS = {
    A: '야생에서 칼로리를 줍는다', B: '땅을 길들여 잉여를 만든다',
    C: '저장과 행정으로 도시가 선다', D: '분업이 금속을 벼린다', E: '문명이 땅속으로 들어간다',
  };
  const ACTIVE_ACTIONS = {
    A: { id: 'forage', icon: '✋', name: '채집 돕기', gains: { food: 2.4 }, ecology: 0.003 },
    B: { id: 'cultivate', icon: '🌾', name: '밭 일구기', gains: { food: 3.2 }, fertility: 0.002 },
    C: { id: 'settle', icon: '🏺', name: '정착 지원', gains: { food: 1.2, clay: 1.4 } },
    D: { id: 'craft', icon: '🔨', name: '장인 격려', gains: { wood: 1.8, copper: 1.0 } },
    E: { id: 'refine', icon: '⚒', name: '야금 정련', gains: { tools: 0.9, bronze: 0.4 } },
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eraIdxOf = (letter) => ERA_LETTERS.indexOf(letter);

  // ── 자원 모델 (8종) ─────────────────────────────────────────────────────
  const RES = {
    food:    { name: '식량',  category: 'food',       perishable: true,  spoilRate: 0.016, icon: '🍞' },
    wood:    { name: '목재',  category: 'natural',    perishable: false, icon: '🪵' },
    clay:    { name: '점토',  category: 'mineral',    perishable: false, icon: '🟤' },
    pottery: { name: '토기',  category: 'capital',    perishable: false, icon: '🏺' },
    tools:   { name: '도구',  category: 'capital',    perishable: false, icon: '🔧' },
    copper:  { name: '구리',  category: 'mineral',    perishable: false, icon: '🟧' },
    tin:     { name: '주석',  category: 'mineral',    perishable: false, icon: '⬜' },
    bronze:  { name: '청동',  category: 'industrial', perishable: false, icon: '🟫' },
  };

  // ── 건물 모델 (시대별) ──────────────────────────────────────────────────
  //  era         : 해금 시대(A..E). 현재 시대 이하만 건설 가능.
  //  scaleFert   : 출력이 토양 비옥도에 비례(농경 생산자).
  //  cropAffected: 가뭄·관개 보정을 받는 작물 계열.
  //  usesTools   : 출력이 도구 보급률에 비례(도구 마모).
  //  fertilityDrain/Restore : 토양 비옥도 소모/회복.
  //  storage     : 자원 저장 한도↑ + 부패 억제.
  //  housing     : 주거 수용량.
  //  institution : 비생산 기관(학교 등).
  //  converts    : 비숙련→숙련 노동 전환(식량 흑자 시).
  //  research    : 매 틱 문자/행정 진척(writing)↑.
  //  ecology     : 매 틱 생태 지식(ecologicalKnowledge)↑.
  //  deposit/depletes : 유한 광맥 소모.
  //  floodGuard  : 홍수 피해 경감.
  const BLD = {
    // ── 시대 A — 채집 ──
    forager_camp: {
      name: '채집 캠프', era: 'A', priority: 10, icon: '🧺',
      outputs: { food: 1.0 }, labor: { unskilled: 2 }, ecology: 0.0016,
      note: '야생 식량을 줍는다. 수확 낮음·입력 불필요. 오래 운영하면 생태 지식이 쌓인다.',
    },
    hunting_lodge: {
      name: '사냥막', era: 'A', priority: 11, icon: '🏹',
      outputs: { food: 1.9 }, labor: { unskilled: 2 }, usesTools: true, ecology: 0.0012,
      note: '단백질 풍부한 사냥감. 도구 보급률에 비례해 출력이 오른다.',
    },
    fire_pit: {
      name: '화덕', era: 'A', priority: 90, icon: '🔥',
      storage: { food: 25 }, labor: { unskilled: 1 },
      note: '조리·훈제로 식량 부패를 늦추고 소량 비축한다.',
    },
    shelter: {
      name: '막집', era: 'A', priority: 91, icon: '⛺',
      housing: 8,
      note: '임시 주거. 인구 수용 한도를 늘린다.',
    },

    // ── 시대 B — 농경 ──
    crop_field: {
      name: '경작지', era: 'B', priority: 12, icon: '🌾',
      outputs: { food: 3.4 }, labor: { unskilled: 3 },
      scaleFert: true, cropAffected: true, usesTools: true, fertilityDrain: 0.0026,
      note: '주력 식량. 비옥도·도구·관개에 비례. 토양을 깎으므로 퇴비가 필요하다.',
    },
    compost_yard: {
      name: '퇴비장', era: 'B', priority: 13, icon: '♻️',
      labor: { unskilled: 1 }, fertilityRestore: 0.0070,
      note: '토양 비옥도를 회복. 단작 고갈의 해독제.',
    },
    pasture: {
      name: '목초지', era: 'B', priority: 14, icon: '🐑',
      outputs: { food: 1.8 }, labor: { unskilled: 2 }, scaleFert: true, cropAffected: true, fertilityDrain: 0.0010,
      note: '가축 사육. 비옥도에 비례하는 보조 식량원.',
    },
    clay_pit: {
      name: '점토 채취장', era: 'B', priority: 22, icon: '🟤',
      outputs: { clay: 1.6 }, labor: { unskilled: 1 },
      note: '강가 점토. 토기·저장 산업의 원료.',
    },

    // ── 시대 C — 정착·저장 ──
    granary: {
      name: '곡물창고', era: 'C', priority: 90, icon: '🏚️',
      storage: { food: 240 }, labor: { unskilled: 1 },
      note: '식량 저장 한도↑·부패 억제. 계절을 넘는 비축을 가능케 한다.',
    },
    pottery_workshop: {
      name: '토기 공방', era: 'C', priority: 32, icon: '🏺',
      inputs: { clay: 1.0 }, outputs: { pottery: 0.6 }, labor: { unskilled: 1 },
      note: '점토→토기. 토기 재고가 쌓일수록 저장·부패 억제가 강해진다.',
    },
    irrigation_canal: {
      name: '관개 수로', era: 'C', priority: 15, icon: '💧',
      labor: { unskilled: 2 }, floodGuard: 0.5,
      note: '경작지 출력을 끌어올리고 가뭄·홍수 피해를 줄인다(작물 1기당 보정).',
    },
    longhouse: {
      name: '장옥', era: 'C', priority: 92, icon: '🏠',
      housing: 26,
      note: '정착형 영구 주거. 도시 규모의 인구를 수용한다.',
    },
    scribe_hall: {
      name: '서기소', era: 'C', priority: 41, icon: '📜',
      labor: { unskilled: 1 }, institution: true, research: 0.0060,
      note: '기관. 곡물 기록·과세에서 문자가 자란다. 행정이 대규모 사업을 가능케 한다.',
    },

    // ── 시대 D — 초기 공예·금속 ──
    craft_school: {
      name: '공방 학교', era: 'D', priority: 42, icon: '🎓',
      labor: { skilled: 1 }, institution: true,
      converts: { from: 'unskilled', to: 'skilled', rate: 0.030 },
      note: '기관. 비숙련→숙련 장인 양성(식량 흑자 시). 금속 산업의 인력 공급원.',
    },
    lumber_camp: {
      name: '벌목장', era: 'D', priority: 20, icon: '🪵',
      outputs: { wood: 1.9 }, labor: { unskilled: 2 },
      note: '제련 연료·건축 목재.',
    },
    copper_mine: {
      name: '구리 광산', era: 'D', priority: 21, icon: '⛏️',
      outputs: { copper: 2.0 }, labor: { unskilled: 3 }, usesTools: true,
      deposit: 'copper', depletes: true,
      note: '유한·고갈성 광맥. 출력은 도구 보급률에 비례.',
    },
    smelter: {
      name: '제련소', era: 'D', priority: 30, icon: '🔥',
      inputs: { copper: 1.3, tin: 0.3, wood: 0.8 }, outputs: { bronze: 1.0 }, labor: { skilled: 2 },
      note: '구리+주석+목재 → 청동. 숙련 노동 필요(학교가 양성).',
    },
    toolsmith: {
      name: '대장간', era: 'D', priority: 31, icon: '🔨',
      inputs: { bronze: 0.5 }, outputs: { tools: 0.5 }, labor: { skilled: 1 },
      note: '청동 → 도구. 도구는 농장·광산을 강화하는 자본재이며 마모된다(유지 루프).',
    },
    trade_post: {
      name: '교역소', era: 'D', priority: 33, icon: '🤝',
      inputs: { pottery: 0.3 }, outputs: { tin: 0.5 }, labor: { unskilled: 1 },
      note: '토기를 수출해 주석을 수입한다. 청동 합금의 필수 수입품.',
    },
  };

  // ── 시작 시나리오 ───────────────────────────────────────────────────────
  const SCENARIO = {
    name: 'MVP — 흙에서 금속까지 (시대 A→E)',
    config: {
      dt: 1, foodPerCapita: 0.11, growthRate: 0.013, starveRate: 0.06,
      toolBonus: 1.0, toolsPerUser: 2.0, toolWear: 0.012,
      fertilityRegen: 0.0006, spoilFloorFactor: 0.22,
      irrigationBonus: 0.22,            // 관개 수로 1기당 작물 출력 보정(작물 수 대비)
      potteryStorageFactor: 1.6,        // 토기 1단위당 식량 저장 한도 가산
      ecologyKnowledgeMax: 1.0,
      baseFoodStorage: 90,              // 기본(신선) 식량 저장 한도 — 저장 건물로 확장
      overflowSpoil: 0.40,              // 저장 한도 초과분의 틱당 소실률(저장이 비축의 실질 상한)
    },
    initial: {
      population: { unskilled: 14, skilled: 3 },
      fertility: 0.95,
      copperDeposit: 6000,
      stocks: { food: 95, wood: 0, clay: 0, pottery: 0, tools: 0, copper: 0, tin: 0, bronze: 0 },
      buildings: {
        forager_camp: 4, hunting_lodge: 0, fire_pit: 0, shelter: 0,
        crop_field: 0, compost_yard: 0, pasture: 0, clay_pit: 0,
        granary: 0, pottery_workshop: 0, irrigation_canal: 0, longhouse: 0, scribe_hall: 0,
        craft_school: 0, lumber_camp: 0, copper_mine: 0, smelter: 0, toolsmith: 0, trade_post: 0,
      },
    },
    // 순차 시대 게이트(현재 시대 게이트만 평가). 통과 시 다음 시대 해금.
    gates: [
      {
        id: 'agriculture', from: 'A', to: 'B', label: '채집 → 농경', sustainTicks: 20,
        hint: '안정적 채집 루프로 인구를 키우고 생태 지식을 쌓으세요.',
        conditions: [
          { metric: 'population',          op: '>=', value: 22,   label: '인구 ≥ 22' },
          { metric: 'foodBuffer',          op: '>=', value: 45,   label: '식량 비축 ≥ 45' },
          { metric: 'ecologicalKnowledge', op: '>=', value: 0.30, label: '생태 지식 ≥ 30%' },
        ],
      },
      {
        id: 'settlement', from: 'B', to: 'C', label: '농경 → 정착', sustainTicks: 30,
        hint: '경작지+퇴비로 흑자와 비옥도를 동시에 유지하세요.',
        conditions: [
          { metric: 'foodSurplusRatio', op: '>=', value: 0.15, label: '식량 흑자율 ≥ 15%' },
          { metric: 'fertility',        op: '>=', value: 0.60, label: '토양 비옥도 ≥ 60%' },
          { metric: 'population',       op: '>=', value: 45,   label: '인구 ≥ 45' },
          { metric: 'foodBuffer',       op: '>=', value: 120,  label: '식량 비축 ≥ 120' },
        ],
      },
      {
        id: 'administration', from: 'C', to: 'D', label: '정착 → 분업', sustainTicks: 30,
        hint: '곡물창고·토기로 큰 비축을, 서기소로 문자를 키우고 주거를 확보하세요.',
        conditions: [
          { metric: 'foodBuffer',       op: '>=', value: 200,  label: '식량 비축 ≥ 200' },
          { metric: 'population',       op: '>=', value: 70,   label: '인구 ≥ 70' },
          { metric: 'writing',          op: '>=', value: 0.70, label: '문자·행정 ≥ 70%' },
          { metric: 'housingHeadroom',  op: '>=', value: 0,    label: '주거 여유 ≥ 0' },
        ],
      },
      {
        id: 'metallurgy', from: 'D', to: 'E', label: '분업 → 야금술', sustainTicks: 40,
        hint: '학교로 숙련 장인을, 광산→제련소→대장간으로 청동·도구 루프를 닫으세요.',
        conditions: [
          { metric: 'skilledFrac',  op: '>=', value: 0.12, label: '숙련 인구 비율 ≥ 12%' },
          { metric: 'toolCoverage', op: '>=', value: 0.55, label: '도구 보급률 ≥ 55%' },
          { metric: 'bronzeRate',   op: '>=', value: 0.5,  label: '청동 생산 ≥ 0.5/틱' },
          { metric: 'population',   op: '>=', value: 80,   label: '인구 ≥ 80' },
        ],
      },
    ],
  };

  // ── 돌파(Breakthrough) — "구매"가 아니라 조건이 맞으면 "발견"된다 ─────────
  const BREAKTHROUGHS = [
    {
      id: 'pottery', name: '토기', icon: '🏺',
      narrative: '잉여 곡물을 저장할 그릇이 필요했다. 토기가 발명되어 식량 부패가 크게 줄었습니다.',
      test: (s) => s.eraIndex >= 1 && (s.counts.clay_pit || 0) > 0 && s.totalPop() >= 22 && s._spoilPressure() >= 0.5,
      apply: (s) => { s.mods.spoilMult *= 0.6; },
    },
    {
      id: 'irrigation', name: '관개', icon: '💧',
      narrative: '가뭄으로 수확이 흔들렸다. 수로와 둑을 쌓아 물을 다스리는 법을 익혔습니다.',
      test: (s) => s.droughtCount >= 1 && s.totalPop() >= 40 && s.toolCoverage >= 0.3,
      apply: (s) => { s.mods.farmBonus += 0.15; s.mods.droughtResist = true; },
    },
    {
      id: 'writing', name: '문자', icon: '✍️',
      narrative: '교역·노동·세금이 기억의 한계를 넘었다. 기록 체계가 생겨 행정 효율이 올랐습니다.',
      test: (s) => (s.counts.scribe_hall || 0) > 0 && s.writing >= 0.5 && s.totalPop() >= 55,
      apply: (s) => { s.mods.laborEff *= 1.10; s.mods.researchMult *= 1.4; },
    },
  ];

  // ── 확률적 사건 ─────────────────────────────────────────────────────────
  //  precond : 발생 가능 조건. p : 매 틱 발생 확률(조건 충족 시).
  const EVENTS = {
    drought: {
      name: '가뭄', icon: '🌵',
      desc: '비가 오지 않아 작물 수확이 급감합니다.',
      duration: 26, cooldown: 80,
      precond: (s) => s.t > 50 && (s.counts.crop_field || 0) >= 2,
      p: (s) => 0.010 * (s.challenge ? 2.4 : 1),
    },
    flood: {
      name: '홍수', icon: '🌊',
      desc: '강이 범람해 토양과 비축 식량이 피해를 입습니다.',
      duration: 1, cooldown: 90,
      precond: (s) => s.t > 70 && s.totalPop() >= 40,
      p: (s) => 0.008 * (s.challenge ? 2.4 : 1),
    },
    winter: {
      name: '혹한', icon: '❄️',
      desc: '긴 겨울로 1인당 식량 소비가 늘어납니다.',
      duration: 18, cooldown: 70,
      precond: (s) => s.t > 40,
      p: (s) => 0.012 * (s.challenge ? 2.4 : 1),
    },
    harvest: {
      name: '풍년', icon: '🌾',
      desc: '온화한 계절 — 작물 수확이 크게 늘어납니다.',
      duration: 20, cooldown: 90, positive: true,
      precond: (s) => s.t > 60 && (s.counts.crop_field || 0) >= 2,
      p: () => 0.010,   // 도전 모드에서도 행운은 늘지 않는다
    },
    plague: {
      name: '역병', icon: '☠️',
      desc: '과밀한 정착지에 역병이 퍼집니다 — 주거 여유를 확보하면 피해가 줄어듭니다.',
      duration: 22, cooldown: 140,
      precond: (s) => s.t > 100 && s.totalPop() >= 50 && (s.housingCap() - s.totalPop()) < -2,
      p: (s) => 0.025 * (s.challenge ? 1.5 : 1),
    },
  };

  // ── 시뮬레이션 코어 ─────────────────────────────────────────────────────
  class Sim {
    constructor(resources, buildings, scenario) {
      this.res = resources;
      this.bdefs = buildings;
      this.cfg = Object.assign({
        dt: 1, foodPerCapita: 0.11, growthRate: 0.013, starveRate: 0.06,
        toolBonus: 1.0, toolsPerUser: 2.0, toolWear: 0.012,
        fertilityRegen: 0.0006, spoilFloorFactor: 0.22,
        irrigationBonus: 0.22, potteryStorageFactor: 1.6, ecologyKnowledgeMax: 1.0,
        baseFoodStorage: 90, overflowSpoil: 0.40,
      }, scenario.config || {});

      this.challenge = !!this.cfg.challenge;
      const init = scenario.initial;
      this.t = 0;
      this.pop = { unskilled: init.population.unskilled || 0, skilled: init.population.skilled || 0 };
      this.fertility = init.fertility != null ? init.fertility : 1;
      this.copperDeposit = init.copperDeposit != null ? init.copperDeposit : Infinity;
      this.copperDepositMax = this.copperDeposit;
      this.stock = Object.assign({}, init.stocks);
      this.counts = Object.assign({}, init.buildings);

      this.order = Object.keys(this.bdefs)
        .sort((a, b) => (this.bdefs[a].priority - this.bdefs[b].priority) || (a < b ? -1 : 1));

      this.gateDefs = (scenario.gates || []).slice();
      this.eraIndex = 0;                 // 0=A … 4=E(승리)
      this.curGate = this._mkGate(0);

      // 누적 상태 지표
      this.foodSurplusRatio = 0;
      this.steelRateUnused = 0;
      this.bronzeRate = 0;
      this.writing = 0;
      this.ecologicalKnowledge = 0;
      this.toolCoverage = 0;
      this.laborRatio = { unskilled: 1, skilled: 1 };
      this.util = {};
      this.reason = {};
      this.lastOutputs = {};

      // 돌파 / 사건 / 보정자
      this.breakthroughs = new Set();
      this.pendingBreakthrough = null;
      this.droughtCount = 0;
      this.activeEvents = {};            // name → { remaining }
      this.eventCooldown = {};           // name → tick available
      this.lastEventLog = null;
      this.mods = this._freshMods();
      this.actionCharge = 0;
      this.activeBoostTicks = 0;
      this.totalActions = 0;
    }

    _freshMods() {
      return { spoilMult: 1, farmBonus: 0, droughtResist: false, laborEff: 1, researchMult: 1 };
    }
    _mkGate(idx) {
      const g = this.gateDefs[idx];
      return g ? Object.assign({ sustain: 0, passed: false }, g) : null;
    }

    totalPop() { return this.pop.unskilled + this.pop.skilled; }
    eraLetter() { return ERA_LETTERS[this.eraIndex] || 'E'; }
    eraName() { return ERA_NAMES[this.eraLetter()]; }
    eraSub() { return ERA_SUBS[this.eraLetter()]; }
    activeAction() { return ACTIVE_ACTIONS[this.eraLetter()] || ACTIVE_ACTIONS.A; }
    isUnlocked(id) { return eraIdxOf(this.bdefs[id].era) <= this.eraIndex; }
    won() { return this.eraIndex >= ERA_LETTERS.length - 1; } // 시대 E 도달

    performActiveAction(chain) {
      const action = this.activeAction();
      const combo = clamp(Math.floor(Number(chain) || 1), 1, 20);
      const multiplier = 1 + Math.min(combo - 1, 12) * 0.06;
      const gains = {};
      for (const resource in action.gains) {
        const amount = action.gains[resource] * multiplier;
        this.stock[resource] = (this.stock[resource] || 0) + amount;
        gains[resource] = amount;
      }
      if (action.ecology) this.ecologicalKnowledge = clamp(this.ecologicalKnowledge + action.ecology * multiplier, 0, this.cfg.ecologyKnowledgeMax);
      if (action.fertility) this.fertility = clamp(this.fertility + action.fertility * multiplier, 0, 1);
      this.totalActions++;
      this.actionCharge += 8 + Math.min(combo, 10) * 0.6;
      let boostTriggered = false;
      if (this.actionCharge >= 100) {
        this.actionCharge -= 100;
        this.activeBoostTicks = Math.max(this.activeBoostTicks, 30);
        boostTriggered = true;
      }
      return { action, gains, combo, multiplier, boostTriggered };
    }

    applyRestBonus(seconds) {
      const safeSeconds = clamp(Number(seconds) || 0, 0, 4 * 60 * 60);
      const before = this.actionCharge;
      this.actionCharge = Math.min(100, this.actionCharge + Math.min(60, safeSeconds / 30 * 2));
      return { seconds: safeSeconds, charge: this.actionCharge - before };
    }

    housingCap() {
      let h = 0;
      for (const id of this.order) { const d = this.bdefs[id]; if (d.housing) h += d.housing * (this.counts[id] || 0); }
      return h;
    }
    storageCap(resId) {
      let s = resId === 'food' ? this.cfg.baseFoodStorage : 0;
      for (const id of this.order) { const d = this.bdefs[id]; if (d.storage && d.storage[resId]) s += d.storage[resId] * (this.counts[id] || 0); }
      if (resId === 'food') s += (this.stock.pottery || 0) * this.cfg.potteryStorageFactor;
      return s;
    }
    institutions() {
      let n = 0;
      for (const id of this.order) { const d = this.bdefs[id]; if (d.institution) n += (this.counts[id] || 0); }
      return n;
    }
    toolUsersWeight() {
      let w = 0;
      for (const id of this.order) { const d = this.bdefs[id]; if (d.usesTools) w += (this.counts[id] || 0); }
      return w;
    }
    cropCount() { return this.counts.crop_field || 0; }
    _spoilPressure() {
      // 저장 한도 대비 재고 압력(0..1). 부패 위험이 클수록 1에 가깝다.
      const amt = this.stock.food || 0;
      const cap = Math.max(1, this.storageCap('food'));
      return clamp(amt / cap, 0, 1);
    }

    // 출력 배수: 도구·비옥도·관개·가뭄 보정을 합성
    outputMult(def) {
      let m = 1;
      if (this.activeBoostTicks > 0) m *= 1.8;
      if (def.usesTools) m *= (1 + this.cfg.toolBonus * this.toolCoverage);
      if (def.scaleFert) m *= this.fertility;
      if (def.cropAffected) {
        // 관개 보정: 수로 1기당 작물 1기를 보조(상한)
        const canals = this.counts.irrigation_canal || 0;
        const crops = Math.max(1, this.cropCount() + (this.counts.pasture || 0));
        const irr = clamp(canals / crops, 0, 1) * this.cfg.irrigationBonus;
        m *= (1 + irr + this.mods.farmBonus);
        // 풍년: 작물 출력 대폭 증가(양의 사건)
        if (this.activeEvents.harvest) m *= 1.45;
        // 가뭄: 작물 출력 급감(관개/돌파로 완화)
        if (this.activeEvents.drought) m *= (this.mods.droughtResist || canals > 0) ? 0.78 : 0.5;
      }
      return m;
    }

    tick() {
      // 황금기: 생산(×1.8)만이 아니라 문명의 '시계'(인구 성장·문자·숙련 전환)도 ×1.5 —
      // 생산은 좋은 빌드에서 병목이 아니라서, 이게 없으면 직접 행동이 아무 의미가 없다
      const goldenClock = this.activeBoostTicks > 0 ? 1.5 : 1;
      const dt = this.cfg.dt;

      // 0) 활성 사건 타이머 감소
      for (const name in this.activeEvents) {
        this.activeEvents[name].remaining -= dt;
        if (this.activeEvents[name].remaining <= 0) delete this.activeEvents[name];
      }

      // 1) 도구 보급률
      const need = Math.max(1, this.toolUsersWeight() * this.cfg.toolsPerUser);
      this.toolCoverage = clamp((this.stock.tools || 0) / need, 0, 1);

      // 2) 노동 배분(우선순위·반복 수렴) — 문자 돌파 시 효율 보정
      const eff = this.mods.laborEff;
      const supply = { unskilled: this.pop.unskilled * eff, skilled: this.pop.skilled * eff };
      const desired = {};
      for (const id of this.order) desired[id] = (this.counts[id] || 0) > 0 ? 1 : 0;
      let ratio = { unskilled: 1, skilled: 1 };
      for (let iter = 0; iter < 3; iter++) {
        const demand = { unskilled: 0, skilled: 0 };
        for (const id of this.order) {
          const d = this.bdefs[id], c = this.counts[id] || 0;
          if (!c || !d.labor) continue;
          for (const tier of TIERS) if (d.labor[tier]) demand[tier] += d.labor[tier] * c * desired[id];
        }
        for (const tier of TIERS) ratio[tier] = demand[tier] > 0 ? Math.min(1, supply[tier] / demand[tier]) : 1;
        for (const id of this.order) {
          const d = this.bdefs[id], c = this.counts[id] || 0;
          if (!c) { desired[id] = 0; continue; }
          if (!d.labor) { desired[id] = 1; continue; }
          let u = 1;
          for (const tier of TIERS) if (d.labor[tier] && ratio[tier] < u) u = ratio[tier];
          desired[id] = u;
        }
      }
      this.laborRatio = ratio;

      // 3) 생산(min 가동률 → 입력 차감 → 출력 적립)
      const outputs = {};
      for (const id of this.order) {
        const d = this.bdefs[id], c = this.counts[id] || 0;
        this.util[id] = 0; this.reason[id] = 'idle';
        if (!c) continue;

        let util = desired[id];
        let reason = util < 1 ? this._laborBinding(d, ratio) : 'ok';

        if (d.inputs) {
          for (const r in d.inputs) {
            const avail = this.stock[r] || 0;
            const cap = avail / (d.inputs[r] * c * dt);
            if (cap < util) { util = cap; reason = 'input:' + r; }
          }
        }
        const mult = this.outputMult(d);
        if (d.deposit && d.depletes && d.outputs && d.outputs[d.deposit]) {
          const perUtil = d.outputs[d.deposit] * mult * c * dt;
          if (perUtil > 0) {
            const cap = this.copperDeposit / perUtil;
            if (cap < util) { util = cap; reason = 'deposit:depleted'; }
          }
        }
        util = clamp(util, 0, 1);

        if (d.inputs) for (const r in d.inputs) this.stock[r] = Math.max(0, (this.stock[r] || 0) - d.inputs[r] * c * dt * util);
        if (d.deposit && d.depletes && d.outputs && d.outputs[d.deposit]) {
          this.copperDeposit = Math.max(0, this.copperDeposit - d.outputs[d.deposit] * mult * c * dt * util);
        }
        if (d.outputs) for (const r in d.outputs) {
          const made = d.outputs[r] * c * dt * util * mult;
          this.stock[r] = (this.stock[r] || 0) + made;
          outputs[r] = (outputs[r] || 0) + made;
        }
        if (d.fertilityDrain) this.fertility -= d.fertilityDrain * c * util * dt;
        if (d.fertilityRestore) this.fertility += d.fertilityRestore * c * util * dt;
        if (d.usesTools) this.stock.tools = Math.max(0, (this.stock.tools || 0) - this.cfg.toolWear * c * util * dt);
        if (d.research) this.writing = clamp(this.writing + d.research * this.mods.researchMult * c * util * dt * goldenClock, 0, 1);
        if (d.ecology) this.ecologicalKnowledge = clamp(this.ecologicalKnowledge + d.ecology * c * util * dt, 0, this.cfg.ecologyKnowledgeMax);

        this.util[id] = util; this.reason[id] = reason;
      }
      this.lastOutputs = outputs;
      this.bronzeRate = lerp(this.bronzeRate, outputs.bronze || 0, 0.2);

      // 4) 인구 소비/성장/아사 — 혹한 시 소비 증가
      const total = this.totalPop();
      const winterMult = this.activeEvents.winter ? 1.3 : 1.0;
      const demandFood = total * this.cfg.foodPerCapita * winterMult * dt;
      const haveFood = this.stock.food || 0;
      const producedFood = outputs.food || 0;
      let surplusRatio;
      if (haveFood >= demandFood) {
        this.stock.food = haveFood - demandFood;
        surplusRatio = demandFood > 0 ? (producedFood - demandFood) / demandFood : 0;
        const housing = this.housingCap();
        const housingFactor = clamp((housing - total) / Math.max(housing, 1), 0, 1);
        if (producedFood >= demandFood) {
          const grow = this.cfg.growthRate * total * dt * clamp(surplusRatio, 0, 1) * housingFactor * goldenClock;
          this.pop.unskilled += grow;
        }
      } else {
        this.stock.food = 0;
        const deficitFrac = demandFood > 0 ? (demandFood - haveFood) / demandFood : 0;
        this._removePop(this.cfg.starveRate * deficitFrac * total * dt);
        surplusRatio = -deficitFrac;
      }
      this.foodSurplusRatio = lerp(this.foodSurplusRatio, surplusRatio, 0.2);

      // 역병 — 과밀이 부른 재난. 주거 여유를 회복하면 피해가 절반으로 준다.
      if (this.activeEvents.plague) {
        const guard = (this.housingCap() - this.totalPop()) >= 0 ? 0.5 : 1.0;
        this._removePop(0.0035 * this.totalPop() * guard * dt);
      }

      // 5) 숙련 전환(식량 흑자 시)
      if (this.foodSurplusRatio >= 0) {
        for (const id of this.order) {
          const d = this.bdefs[id], c = this.counts[id] || 0;
          if (!c || !d.converts) continue;
          let conv = d.converts.rate * c * (this.util[id] || 0) * dt * goldenClock;
          conv = Math.min(conv, this.pop.unskilled);
          this.pop.unskilled -= conv; this.pop.skilled += conv;
        }
      }

      // 6) 부패 — 저장 한도가 비축의 실질 상한이다.
      //    한도 내 식량: 저장(곡물창고·토기)이 보호해 천천히 부패.
      //    한도 초과분: 빠르게 소실 → 저장을 늘리지 않으면 식량을 쌓아둘 수 없다("칼로리는 흐른다").
      for (const r in this.res) {
        if (!this.res[r].perishable) continue;
        let amt = this.stock[r] || 0; if (amt <= 0) continue;
        const cap = Math.max(1, this.storageCap(r));
        if (amt > cap) {
          const over = amt - cap;
          amt = cap + over * Math.max(0, 1 - this.cfg.overflowSpoil * dt);
        }
        const baseRate = this.res[r].spoilRate * this.cfg.spoilFloorFactor * this.mods.spoilMult;
        this.stock[r] = amt * (1 - baseRate * dt);
      }

      // 7) 비옥도 자연 회복
      this.fertility = clamp(this.fertility + this.cfg.fertilityRegen * dt, 0, 1);

      // 8) 사건 발생/적용
      this._stepEvents(dt);

      // 9) 돌파 점검
      this._checkBreakthroughs();

      // 10) 현재 시대 게이트 평가 → 통과 시 시대 전진
      this._stepGate();

      this.activeBoostTicks = Math.max(0, this.activeBoostTicks - dt);

      this.t += dt;
    }

    _stepEvents(dt) {
      this.lastEventLog = null;
      for (const name in EVENTS) {
        const ev = EVENTS[name];
        if (this.activeEvents[name]) continue;
        if ((this.eventCooldown[name] || 0) > this.t) continue;
        if (!ev.precond(this)) continue;
        if (Math.random() < ev.p(this) * dt) {
          this.activeEvents[name] = { remaining: ev.duration };
          this.eventCooldown[name] = this.t + ev.duration + ev.cooldown;
          this.lastEventLog = { name, icon: ev.icon, label: ev.name, desc: ev.desc };
          if (name === 'drought') this.droughtCount++;
          if (name === 'flood') {
            const guard = (this.counts.irrigation_canal || 0) > 0 ? 0.5 : 1.0;
            this.fertility = clamp(this.fertility - 0.10 * guard, 0, 1);
            this.stock.food = Math.max(0, (this.stock.food || 0) * (1 - 0.12 * guard));
          }
        }
      }
    }

    _checkBreakthroughs() {
      for (const bt of BREAKTHROUGHS) {
        if (this.breakthroughs.has(bt.id)) continue;
        if (bt.test(this)) {
          this.breakthroughs.add(bt.id);
          bt.apply(this);
          this.pendingBreakthrough = { id: bt.id, name: bt.name, icon: bt.icon, narrative: bt.narrative };
        }
      }
    }

    _stepGate() {
      if (!this.curGate || this.curGate.passed) return;
      const m = this.metrics();
      const ok = this.curGate.conditions.every((c) => this._cmp(m[c.metric], c.op, c.value));
      if (ok) {
        this.curGate.sustain += 1;
        if (this.curGate.sustain >= this.curGate.sustainTicks) {
          this.curGate.passed = true;
          this.eraIndex = Math.min(this.eraIndex + 1, ERA_LETTERS.length - 1);
          this.justAdvanced = this.eraLetter();
          this.curGate = this._mkGate(this.eraIndex);
        }
      } else {
        this.curGate.sustain = 0;
      }
    }

    _removePop(amount) {
      let a = Math.max(0, amount);
      const fromU = Math.min(this.pop.unskilled, a);
      this.pop.unskilled -= fromU; a -= fromU;
      this.pop.skilled = Math.max(0, this.pop.skilled - a);
    }
    _laborBinding(d, ratio) {
      let best = null, bestR = 2;
      for (const tier of TIERS) if (d.labor && d.labor[tier] && ratio[tier] < bestR) { bestR = ratio[tier]; best = tier; }
      return best ? 'labor:' + best : 'ok';
    }
    _cmp(a, op, b) {
      a = a == null ? 0 : a;
      if (op === '>=') return a >= b; if (op === '<=') return a <= b;
      if (op === '>') return a > b; if (op === '<') return a < b;
      return a === b;
    }

    metrics() {
      const total = this.totalPop();
      return {
        foodSurplusRatio: this.foodSurplusRatio,
        fertility: this.fertility,
        population: total,
        foodBuffer: this.stock.food || 0,
        housingHeadroom: this.housingCap() - total,
        institutions: this.institutions(),
        toolCoverage: this.toolCoverage,
        bronzeRate: this.bronzeRate,
        writing: this.writing,
        ecologicalKnowledge: this.ecologicalKnowledge,
        skilledFrac: total > 0 ? this.pop.skilled / total : 0,
      };
    }
    bottlenecks() {
      return this.order
        .filter((id) => (this.counts[id] || 0) > 0)
        .map((id) => ({ id, count: this.counts[id], util: +(this.util[id] || 0).toFixed(3), reason: this.reason[id] }))
        .sort((a, b) => a.util - b.util);
    }
    run(ticks) { for (let i = 0; i < ticks; i++) this.tick(); return this; }
  }

  const api = {
    Sim, RES, BLD, SCENARIO, BREAKTHROUGHS, EVENTS, ACTIVE_ACTIONS, TIERS,
    ERA_LETTERS, ERA_NAMES, ERA_SUBS,
    clone: (o) => JSON.parse(JSON.stringify(o)),
  };
  if (typeof window !== 'undefined') window.Bootstrap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
