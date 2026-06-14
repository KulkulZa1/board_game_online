// BOOTSTRAP — headless civilization simulation core (MVP)
// Deterministic, no RNG, no DOM. The spine is the min()-utilization rule:
//   utilization = min(labor_ratio, input_ratios, deposit_ratio)
//   output      = nominal * utilization * outputMultiplier(tools, fertility)
// Bottlenecks propagate through shared stocks (materials) and shared labor pools.
'use strict';

const TIERS = ['unskilled', 'skilled'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

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
    this.stock = Object.assign({}, init.stocks);
    this.counts = Object.assign({}, init.buildings);

    // deterministic building order: by priority then id
    this.order = Object.keys(this.bdefs)
      .filter((id) => (this.counts[id] || 0) > 0 || true) // keep all defs; counts may grow later
      .sort((a, b) => (this.bdefs[a].priority - this.bdefs[b].priority) || (a < b ? -1 : 1));

    this.gates = (scenario.gates || []).map((g) => Object.assign({ sustain: 0, passed: false }, g));
    this.events = (scenario.events || []).slice();

    // smoothed / recorded telemetry
    this.foodSurplusRatio = 0;
    this.steelRate = 0;
    this.blightUntil = -1;   // sustained crop-disease: caps fertility while active
    this.blightCap = 1;
    this.util = {};        // id -> utilization last tick
    this.reason = {};      // id -> binding-constraint label
    this.lastOutputs = {}; // res -> produced this tick
    this.toolCoverage = 0;
    this.laborRatio = { unskilled: 1, skilled: 1 };
  }

  // ── capacities ────────────────────────────────────────────────
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

  // ── one tick ──────────────────────────────────────────────────
  tick() {
    const dt = this.cfg.dt;

    // 0) scripted events
    for (const ev of this.events) {
      if (ev.tick === this.t) {
        if (ev.type === 'fertilityShock') this.fertility = clamp(this.fertility + ev.value, 0, 1);
        if (ev.type === 'popShock') { this._removePop(ev.value); }
        if (ev.type === 'stockShock' && ev.res) this.stock[ev.res] = Math.max(0, (this.stock[ev.res] || 0) + ev.value);
        if (ev.type === 'blight') { this.blightUntil = this.t + (ev.duration || 0); this.blightCap = ev.level != null ? ev.level : 0.3; }
      }
    }

    // 1) tool coverage from current tool stock
    const need = Math.max(1, this.toolUsersWeight() * this.cfg.toolsPerUser);
    this.toolCoverage = clamp((this.stock.tools || 0) / need, 0, 1);

    // 2) labor fixed-point: estimate per-building utilization limited by labor pools
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
        let u = 1, binding = null;
        for (const tier of TIERS) if (d.labor[tier] && ratio[tier] < u) { u = ratio[tier]; binding = tier; }
        desired[id] = u;
      }
    }
    this.laborRatio = ratio;

    // 3) production / consumption pass in priority order (shared stocks → bottleneck propagation)
    const outputs = {};
    for (const id of this.order) {
      const d = this.bdefs[id], c = this.counts[id] || 0;
      this.util[id] = 0; this.reason[id] = 'idle';
      if (!c) continue;

      let util = desired[id];
      let reason = util < 1 ? this._laborBinding(d, ratio) : 'ok';

      // input material cap (shared stock, consumed in priority order)
      if (d.inputs) {
        for (const r in d.inputs) {
          const avail = this.stock[r] || 0;
          const cap = avail / (d.inputs[r] * dt);
          if (cap < util) { util = cap; reason = 'input:' + r; }
        }
      }
      const mult = this.outputMult(d);
      // depleting deposit cap (ore mined includes the tool multiplier)
      if (d.deposit && d.depletes && d.outputs && d.outputs[d.deposit]) {
        const perUtil = d.outputs[d.deposit] * mult * c * dt;
        if (perUtil > 0) {
          const cap = this.oreDeposit / perUtil;
          if (cap < util) { util = cap; reason = 'deposit:depleted'; }
        }
      }
      util = clamp(util, 0, 1);

      // consume inputs (inputs do NOT scale with mult — mult is a yield/efficiency bonus)
      if (d.inputs) for (const r in d.inputs) this.stock[r] = (this.stock[r] || 0) - d.inputs[r] * c * dt * util;
      // drain deposit by actual ore produced
      if (d.deposit && d.depletes && d.outputs && d.outputs[d.deposit]) {
        this.oreDeposit = Math.max(0, this.oreDeposit - d.outputs[d.deposit] * mult * c * dt * util);
      }
      // produce outputs (scaled by mult)
      if (d.outputs) for (const r in d.outputs) {
        const made = d.outputs[r] * c * dt * util * mult;
        this.stock[r] = (this.stock[r] || 0) + made;
        outputs[r] = (outputs[r] || 0) + made;
      }
      // fertility effects
      if (d.fertilityDrain) this.fertility -= d.fertilityDrain * c * util * dt;
      if (d.fertilityRestore) this.fertility += d.fertilityRestore * c * util * dt;
      // tool wear (maintenance loop): tool-using buildings consume tools as they operate
      if (d.usesTools) this.stock.tools = Math.max(0, (this.stock.tools || 0) - this.cfg.toolWear * c * util * dt);

      this.util[id] = util; this.reason[id] = reason;
    }
    this.lastOutputs = outputs;
    this.steelRate = lerp(this.steelRate, outputs.steel || 0, 0.2);

    // 4) population & food
    const total = this.pop.unskilled + this.pop.skilled;
    const demandFood = total * this.cfg.foodPerCapita * dt;
    const haveFood = this.stock.food || 0;
    const producedFood = outputs.food || 0;
    let surplusRatio;
    if (haveFood >= demandFood) {
      this.stock.food = haveFood - demandFood;
      surplusRatio = demandFood > 0 ? (producedFood - demandFood) / demandFood : 0;
      const housing = this.housingCap();
      // growth tapers as population approaches housing capacity (leaves headroom; avoids overshoot)
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

    // 5) education: schools convert unskilled→skilled, only when food is not in deficit
    if (this.foodSurplusRatio >= 0) {
      for (const id of this.order) {
        const d = this.bdefs[id], c = this.counts[id] || 0;
        if (!c || !d.converts) continue;
        let conv = d.converts.rate * c * (this.util[id] || 0) * dt;
        conv = Math.min(conv, this.pop.unskilled);
        this.pop.unskilled -= conv; this.pop.skilled += conv;
      }
    }

    // 6) spoilage (storage suppresses it toward a floor)
    for (const r in this.res) {
      if (!this.res[r].perishable) continue;
      const amt = this.stock[r] || 0; if (amt <= 0) continue;
      const cap = this.storageCap(r);
      const protectedFrac = clamp(cap / Math.max(amt, 1), 0, 1);
      const effRate = this.res[r].spoilRate * (this.cfg.spoilFloorFactor * protectedFrac + (1 - protectedFrac));
      this.stock[r] = amt * (1 - effRate * dt);
    }

    // 7) fertility natural regen + clamp; sustained blight caps recovery
    this.fertility = clamp(this.fertility + this.cfg.fertilityRegen * dt, 0, 1);
    if (this.t < this.blightUntil) this.fertility = Math.min(this.fertility, this.blightCap);

    // 8) gates (sustained multi-condition)
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

  // ── readouts ──────────────────────────────────────────────────
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
  hash() {
    const round = (x) => Math.round((x || 0) * 1e4) / 1e4;
    const stock = {}; for (const k of Object.keys(this.stock).sort()) stock[k] = round(this.stock[k]);
    return JSON.stringify({
      t: this.t,
      pop: { u: round(this.pop.unskilled), s: round(this.pop.skilled) },
      fert: round(this.fertility), ore: round(this.oreDeposit), stock,
      gates: this.gates.map((g) => (g.passed ? 1 : 0)),
    });
  }
  run(ticks) { for (let i = 0; i < ticks; i++) this.tick(); return this; }
}

function loadDefault() {
  const resources = require('./data/resources.json');
  const buildings = require('./data/buildings.json');
  const scenario = require('./data/scenario.json');
  return new Sim(resources, buildings, JSON.parse(JSON.stringify(scenario)));
}

module.exports = { Sim, loadDefault, TIERS };
