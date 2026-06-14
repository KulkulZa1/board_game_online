// BOOTSTRAP — 브라우저용 시뮬레이션 코어 (헤드리스 prototypes/bootstrap-sim/sim.js 의 충실한 이식본)
// 핵심 규칙(the spine): 모든 생산자는 매 틱 min()-가동률로 동작한다.
//   utilization = min(labor_ratio, input_ratios, deposit_ratio)
//   output      = nominal * utilization * outputMultiplier(tools, fertility)
// 병목은 공유 자원(stock)과 공유 노동 풀(labor)을 통해 앞뒤로 전파된다.
(function () {
  'use strict';

  const TIERS = ['unskilled', 'skilled'];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── 데이터 모델 (prototypes/bootstrap-sim/data/*.json 과 동일) ──────────
  const RES = {
    food:  { name: '식량',  category: 'food',       perishable: true,  spoilRate: 0.015 },
    wood:  { name: '목재',  category: 'natural',    perishable: false },
    ore:   { name: '철광석', category: 'mineral',    perishable: false },
    steel: { name: '강철',  category: 'industrial', perishable: false },
    tools: { name: '도구',  category: 'capital',    perishable: false },
  };

  const BLD = {
    forager_camp: {
      name: '채집 캠프', era: 'A', priority: 10, icon: '🧺',
      outputs: { food: 1.1 }, labor: { unskilled: 2 },
      note: '야생에서 얻는 부트스트랩 식량. 수확량 낮고 입력·토지 불필요.',
    },
    farm: {
      name: '농장', era: 'B', priority: 11, icon: '🌾',
      outputs: { food: 3.2 }, labor: { unskilled: 3 },
      scaleFertility: true, usesTools: true, fertilityDrain: 0.0024,
      note: '주력 식량. 토양 비옥도·도구 보급률에 비례. 비옥도를 깎는다.',
    },
    compost_yard: {
      name: '퇴비장', era: 'B', priority: 12, icon: '♻️',
      labor: { unskilled: 1 }, fertilityRestore: 0.0064,
      note: '토양 비옥도를 회복. 단작 고갈의 해독제.',
    },
    granary: {
      name: '곡물창고', era: 'B', priority: 90, icon: '🏚️',
      storage: { food: 220 }, labor: { unskilled: 1 },
      note: '식량 저장 한도↑. 저장량이 재고보다 크면 부패를 억제.',
    },
    house: {
      name: '주거 블록', era: 'D', priority: 90, icon: '🏠',
      housing: 24,
      note: '주거 수용량. 과밀은 성장 정지·사기 저하를 부른다.',
    },
    lumber_camp: {
      name: '벌목장', era: 'E', priority: 20, icon: '🪵',
      outputs: { wood: 1.8 }, labor: { unskilled: 2 },
      note: '제련용 연료/원료 목재.',
    },
    mine: {
      name: '철광산', era: 'E', priority: 21, icon: '⛏️',
      outputs: { ore: 2.0 }, labor: { unskilled: 3 },
      usesTools: true, deposit: 'ore', depletes: true,
      note: '유한·고갈성 광맥. 출력은 도구 보급률에 비례.',
    },
    smelter: {
      name: '제련소', era: 'F', priority: 30, icon: '🔥',
      inputs: { ore: 1.4, wood: 1.0 }, outputs: { steel: 1.0 },
      labor: { skilled: 2 },
      note: '철광석+목재 → 강철. 숙련 노동 필요(학교가 양성).',
    },
    toolsmith: {
      name: '대장간', era: 'F', priority: 31, icon: '🔨',
      inputs: { steel: 0.5 }, outputs: { tools: 0.45 },
      labor: { skilled: 1 },
      note: '강철 → 도구. 도구는 농장·광산을 강화하는 자본재이며 마모된다(유지보수 루프).',
    },
    school: {
      name: '학교', era: 'D', priority: 40, icon: '🎓',
      labor: { skilled: 1 }, institution: true,
      converts: { from: 'unskilled', to: 'skilled', rate: 0.025 },
      note: '기관. 비숙련→숙련 노동 전환(식량이 흑자일 때만).',
    },
  };

  // 게임 시작 시나리오 — 작게 시작해 직접 키운다.
  const SCENARIO = {
    name: 'MVP — 흙에서 강철까지',
    config: {
      dt: 1, foodPerCapita: 0.11, growthRate: 0.012, starveRate: 0.06,
      toolBonus: 1.0, toolsPerUser: 2.0, toolWear: 0.012,
      fertilityRegen: 0.0006, spoilFloorFactor: 0.25,
    },
    initial: {
      population: { unskilled: 16, skilled: 3 },
      fertility: 0.95,
      oreDeposit: 6000,
      stocks: { food: 90, wood: 0, ore: 0, steel: 0, tools: 0 },
      buildings: { forager_camp: 5, farm: 0, compost_yard: 0, granary: 0, house: 0, lumber_camp: 0, mine: 0, smelter: 0, toolsmith: 0, school: 0 },
    },
    gates: [
      {
        id: 'settlement', label: '농경 → 정착',
        sustainTicks: 30,
        conditions: [
          { metric: 'foodSurplusRatio', op: '>=', value: 0.15, label: '식량 흑자율 ≥ 15%' },
          { metric: 'fertility',        op: '>=', value: 0.60, label: '토양 비옥도 ≥ 60%' },
          { metric: 'population',       op: '>=', value: 40,   label: '인구 ≥ 40' },
          { metric: 'foodBuffer',       op: '>=', value: 120,  label: '식량 비축 ≥ 120' },
        ],
      },
      {
        id: 'factory', label: '정착 → 초기 공장',
        sustainTicks: 30,
        conditions: [
          { metric: 'housingHeadroom', op: '>=', value: 0,   label: '주거 여유 ≥ 0 (주거 ≥ 인구)' },
          { metric: 'population',      op: '>=', value: 55,   label: '인구 ≥ 55' },
          { metric: 'institutions',    op: '>=', value: 1,    label: '기관 ≥ 1 (학교)' },
          { metric: 'steelRate',       op: '>=', value: 1.2,  label: '강철 생산 ≥ 1.2/틱' },
          { metric: 'toolCoverage',    op: '>=', value: 0.6,  label: '도구 보급률 ≥ 60%' },
        ],
      },
    ],
    events: [],
  };

  // ── 시뮬레이션 코어 ────────────────────────────────────────────────────
  class Sim {
    constructor(resources, buildings, scenario) {
      this.res = resources;
      this.bdefs = buildings;
      this.cfg = Object.assign({
        dt: 1, foodPerCapita: 0.05, growthRate: 0.012, starveRate: 0.06,
        toolBonus: 1.0, toolsPerUser: 2.0, toolWear: 0.012,
        fertilityRegen: 0.0006, spoilFloorFactor: 0.25,
      }, scenario.config || {});

      const init = scenario.initial;
      this.t = 0;
      this.pop = { unskilled: init.population.unskilled || 0, skilled: init.population.skilled || 0 };
      this.fertility = init.fertility != null ? init.fertility : 1;
      this.oreDeposit = init.oreDeposit != null ? init.oreDeposit : Infinity;
      this.oreDepositMax = this.oreDeposit;
      this.stock = Object.assign({}, init.stocks);
      this.counts = Object.assign({}, init.buildings);

      this.order = Object.keys(this.bdefs)
        .sort((a, b) => (this.bdefs[a].priority - this.bdefs[b].priority) || (a < b ? -1 : 1));

      this.gates = (scenario.gates || []).map((g) => Object.assign({ sustain: 0, passed: false }, g));
      this.events = (scenario.events || []).slice();

      this.foodSurplusRatio = 0;
      this.steelRate = 0;
      this.blightUntil = -1;
      this.blightCap = 1;
      this.util = {};
      this.reason = {};
      this.lastOutputs = {};
      this.toolCoverage = 0;
      this.laborRatio = { unskilled: 1, skilled: 1 };
    }

    housingCap() {
      let h = 0;
      for (const id of this.order) { const d = this.bdefs[id]; if (d.housing) h += d.housing * (this.counts[id] || 0); }
      return h;
    }
    storageCap(resId) {
      let s = 0;
      for (const id of this.order) { const d = this.bdefs[id]; if (d.storage && d.storage[resId]) s += d.storage[resId] * (this.counts[id] || 0); }
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
    outputMult(def) {
      let m = 1;
      if (def.usesTools) m *= (1 + this.cfg.toolBonus * this.toolCoverage);
      if (def.scaleFertility) m *= this.fertility;
      return m;
    }

    tick() {
      const dt = this.cfg.dt;

      for (const ev of this.events) {
        if (ev.tick === this.t) {
          if (ev.type === 'fertilityShock') this.fertility = clamp(this.fertility + ev.value, 0, 1);
          if (ev.type === 'popShock') { this._removePop(ev.value); }
          if (ev.type === 'stockShock' && ev.res) this.stock[ev.res] = Math.max(0, (this.stock[ev.res] || 0) + ev.value);
          if (ev.type === 'blight') { this.blightUntil = this.t + (ev.duration || 0); this.blightCap = ev.level != null ? ev.level : 0.3; }
        }
      }

      const need = Math.max(1, this.toolUsersWeight() * this.cfg.toolsPerUser);
      this.toolCoverage = clamp((this.stock.tools || 0) / need, 0, 1);

      const supply = { unskilled: this.pop.unskilled, skilled: this.pop.skilled };
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
            const cap = avail / (d.inputs[r] * dt);
            if (cap < util) { util = cap; reason = 'input:' + r; }
          }
        }
        const mult = this.outputMult(d);
        if (d.deposit && d.depletes && d.outputs && d.outputs[d.deposit]) {
          const perUtil = d.outputs[d.deposit] * mult * c * dt;
          if (perUtil > 0) {
            const cap = this.oreDeposit / perUtil;
            if (cap < util) { util = cap; reason = 'deposit:depleted'; }
          }
        }
        util = clamp(util, 0, 1);

        if (d.inputs) for (const r in d.inputs) this.stock[r] = (this.stock[r] || 0) - d.inputs[r] * c * dt * util;
        if (d.deposit && d.depletes && d.outputs && d.outputs[d.deposit]) {
          this.oreDeposit = Math.max(0, this.oreDeposit - d.outputs[d.deposit] * mult * c * dt * util);
        }
        if (d.outputs) for (const r in d.outputs) {
          const made = d.outputs[r] * c * dt * util * mult;
          this.stock[r] = (this.stock[r] || 0) + made;
          outputs[r] = (outputs[r] || 0) + made;
        }
        if (d.fertilityDrain) this.fertility -= d.fertilityDrain * c * util * dt;
        if (d.fertilityRestore) this.fertility += d.fertilityRestore * c * util * dt;
        if (d.usesTools) this.stock.tools = Math.max(0, (this.stock.tools || 0) - this.cfg.toolWear * c * util * dt);

        this.util[id] = util; this.reason[id] = reason;
      }
      this.lastOutputs = outputs;
      this.steelRate = lerp(this.steelRate, outputs.steel || 0, 0.2);

      const total = this.pop.unskilled + this.pop.skilled;
      const demandFood = total * this.cfg.foodPerCapita * dt;
      const haveFood = this.stock.food || 0;
      const producedFood = outputs.food || 0;
      let surplusRatio;
      if (haveFood >= demandFood) {
        this.stock.food = haveFood - demandFood;
        surplusRatio = demandFood > 0 ? (producedFood - demandFood) / demandFood : 0;
        const housing = this.housingCap();
        const housingFactor = clamp((housing - total) / Math.max(housing, 1), 0, 1);
        if (producedFood >= demandFood) {
          const grow = this.cfg.growthRate * total * dt * clamp(surplusRatio, 0, 1) * housingFactor;
          this.pop.unskilled += grow;
        }
      } else {
        this.stock.food = 0;
        const deficitFrac = demandFood > 0 ? (demandFood - haveFood) / demandFood : 0;
        this._removePop(this.cfg.starveRate * deficitFrac * total * dt);
        surplusRatio = -deficitFrac;
      }
      this.foodSurplusRatio = lerp(this.foodSurplusRatio, surplusRatio, 0.2);

      if (this.foodSurplusRatio >= 0) {
        for (const id of this.order) {
          const d = this.bdefs[id], c = this.counts[id] || 0;
          if (!c || !d.converts) continue;
          let conv = d.converts.rate * c * (this.util[id] || 0) * dt;
          conv = Math.min(conv, this.pop.unskilled);
          this.pop.unskilled -= conv; this.pop.skilled += conv;
        }
      }

      for (const r in this.res) {
        if (!this.res[r].perishable) continue;
        const amt = this.stock[r] || 0; if (amt <= 0) continue;
        const cap = this.storageCap(r);
        const protectedFrac = clamp(cap / Math.max(amt, 1), 0, 1);
        const effRate = this.res[r].spoilRate * (this.cfg.spoilFloorFactor * protectedFrac + (1 - protectedFrac));
        this.stock[r] = amt * (1 - effRate * dt);
      }

      this.fertility = clamp(this.fertility + this.cfg.fertilityRegen * dt, 0, 1);
      if (this.t < this.blightUntil) this.fertility = Math.min(this.fertility, this.blightCap);

      const m = this.metrics();
      for (const g of this.gates) {
        if (g.passed) continue;
        const ok = g.conditions.every((c) => this._cmp(m[c.metric], c.op, c.value));
        if (ok) { g.sustain += 1; if (g.sustain >= g.sustainTicks) g.passed = true; }
        else g.sustain = 0;
      }

      this.t += dt;
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
      const total = this.pop.unskilled + this.pop.skilled;
      return {
        foodSurplusRatio: this.foodSurplusRatio,
        fertility: this.fertility,
        population: total,
        foodBuffer: this.stock.food || 0,
        housingHeadroom: this.housingCap() - total,
        institutions: this.institutions(),
        steelRate: this.steelRate,
        toolCoverage: this.toolCoverage,
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

  window.Bootstrap = { Sim, RES, BLD, SCENARIO, TIERS, clone: (o) => JSON.parse(JSON.stringify(o)) };
})();
