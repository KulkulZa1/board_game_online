// BOOTSTRAP sim — automated test harness.  Run: node prototypes/bootstrap-sim/test.js
// Validates the non-negotiables from the roadmap: determinism, min()-bottleneck
// propagation, sustained multi-condition gates, the famine cascade, and tools-as-capital.
'use strict';
const { Sim } = require('./sim');
const resources = require('./data/resources.json');
const buildings = require('./data/buildings.json');
const baseScenario = require('./data/scenario.json');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));
function mk(overrides) {
  const sc = clone(baseScenario);
  Object.assign(sc, overrides);
  return new Sim(resources, buildings, sc);
}

console.log('=== BOOTSTRAP sim test harness ===\n');

// ── T1: Determinism — identical runs produce identical state ───────────────
(() => {
  const a = new Sim(resources, buildings, clone(baseScenario)).run(450);
  const b = new Sim(resources, buildings, clone(baseScenario)).run(450);
  check('T1 determinism: two 450-tick runs hash-identical', a.hash() === b.hash(),
    `\n      A=${a.hash().slice(0, 70)}\n      B=${b.hash().slice(0, 70)}`);
})();

// ── T2: min() bottleneck propagation ───────────────────────────────────────
(() => {
  // Smelter with NO ore source -> must be input-limited on ore.
  const s = mk({
    initial: {
      population: { unskilled: 40, skilled: 20 }, fertility: 1, oreDeposit: 0,
      stocks: { food: 300, wood: 200, ore: 0, steel: 0, tools: 20 },
      buildings: { smelter: 2, lumber_camp: 2 },
    }, gates: [], events: [],
  });
  s.run(5);
  const smelter = s.bottlenecks().find((x) => x.id === 'smelter');
  check('T2a min(): ore-starved smelter is input:ore limited', smelter && smelter.reason === 'input:ore' && smelter.util < 0.01,
    smelter && `reason=${smelter.reason} util=${smelter.util}`);

  // Labor-starved: huge labor demand, tiny population -> labor:unskilled limited.
  const l = mk({
    initial: {
      population: { unskilled: 3, skilled: 10 }, fertility: 1, oreDeposit: 9999,
      stocks: { food: 999, wood: 999, ore: 999, steel: 0, tools: 999 },
      buildings: { mine: 5, lumber_camp: 5 },
    }, gates: [], events: [],
  });
  l.run(3);
  const mine = l.bottlenecks().find((x) => x.id === 'mine');
  check('T2b min(): under-staffed mines are labor:unskilled limited', mine && mine.reason === 'labor:unskilled' && mine.util < 1,
    mine && `reason=${mine.reason} util=${mine.util}`);
})();

// ── T3: sustained multi-condition gates ────────────────────────────────────
(() => {
  // Always-true gate (population>=1), sustainTicks=20 -> passes at exactly tick 20.
  const g = mk({
    gates: [{ id: 'g', label: 'x', sustainTicks: 20, conditions: [{ metric: 'population', op: '>=', value: 1 }] }],
    events: [],
  });
  g.run(19); const at19 = g.gates[0].passed;
  g.run(2);  const at21 = g.gates[0].passed;
  check('T3a gate passes only after sustained window', at19 === false && at21 === true, `at19=${at19} at21=${at21}`);

  // Reset: a mid-window shock that breaks a condition must reset the counter.
  const r = mk({
    initial: {
      population: { unskilled: 30, skilled: 5 }, fertility: 1, oreDeposit: 9999,
      stocks: { food: 400, wood: 99, ore: 99, steel: 0, tools: 30 },
      buildings: { forager_camp: 2, farm: 3, granary: 2 },
    },
    gates: [{ id: 'g', label: 'x', sustainTicks: 15, conditions: [{ metric: 'foodBuffer', op: '>=', value: 100 }] }],
    events: [{ tick: 8, type: 'stockShock', res: 'food', value: -100000 }], // crash food to 0 mid-window (clamped)
  });
  r.run(12); // by now (without reset) 12 sustained ticks; the shock at t8 should have reset it
  check('T3b mid-window shock resets the sustain counter', r.gates[0].sustain < 12,
    `sustain=${r.gates[0].sustain} (expected reset near tick 8)`);
})();

// ── T4: famine cascade with traceability (fragile scenario) ────────────────
(() => {
  const sc = {
    name: 'fragile', config: baseScenario.config,
    initial: {
      population: { unskilled: 34, skilled: 7 }, fertility: 0.85, oreDeposit: 6000,
      stocks: { food: 70, wood: 25, ore: 18, steel: 6, tools: 16 },
      buildings: { // NOTE: no compost_yard -> fertility cannot recover from blight
        forager_camp: 1, farm: 4, granary: 1, house: 3,
        lumber_camp: 2, mine: 2, smelter: 2, toolsmith: 1, school: 1,
      },
    },
    gates: [],
    events: [{ tick: 140, type: 'blight', duration: 260, level: 0.18 }],
  };
  const s = new Sim(resources, buildings, clone(sc));
  s.run(135);
  const popBefore = s.metrics().population;
  const steelBefore = s.steelRate;
  let sawUpstreamBottleneck = false, minSteelAfter = Infinity;
  for (let i = 0; i < 360; i++) {
    s.tick();
    if (s.t > 150) minSteelAfter = Math.min(minSteelAfter, s.steelRate);
    const sm = s.reason['smelter'] || '';
    const mn = s.reason['mine'] || '';
    const lc = s.reason['lumber_camp'] || '';
    if (sm.startsWith('input:') || mn === 'labor:unskilled' || lc === 'labor:unskilled') sawUpstreamBottleneck = true;
  }
  const popAfter = s.metrics().population;
  console.log(`     [cascade] pop ${popBefore.toFixed(1)}→${popAfter.toFixed(1)}, steel ${steelBefore.toFixed(2)}→min ${minSteelAfter.toFixed(2)}`);
  check('T4a famine reduces population', popAfter < popBefore - 1, `before=${popBefore.toFixed(1)} after=${popAfter.toFixed(1)}`);
  check('T4b famine cascades into steel collapse', minSteelAfter < steelBefore * 0.7,
    `before=${steelBefore.toFixed(2)} min=${minSteelAfter.toFixed(2)}`);
  check('T4c cascade is traceable (upstream input/labor bottleneck observed)', sawUpstreamBottleneck);
})();

// ── T5: tools-as-capital raise output per laborer ──────────────────────────
(() => {
  const common = {
    population: { unskilled: 30, skilled: 8 }, fertility: 1, oreDeposit: 9999,
    stocks: { food: 120, wood: 50, ore: 30, steel: 8 },
    buildings: { forager_camp: 1, farm: 3, compost_yard: 2, granary: 2, house: 3, lumber_camp: 2, mine: 2, smelter: 2, toolsmith: 1, school: 1 },
  };
  const withTools = mk({ initial: Object.assign(clone(common), { stocks: Object.assign({}, common.stocks, { tools: 30 }) }), gates: [], events: [] });
  // remove tool supply AND the smith so coverage stays 0
  const noToolsBld = clone(common.buildings); noToolsBld.toolsmith = 0;
  const noTools = mk({ initial: Object.assign(clone(common), { stocks: Object.assign({}, common.stocks, { tools: 0 }), buildings: noToolsBld }), gates: [], events: [] });
  withTools.run(180); noTools.run(180);
  const pT = withTools.metrics().population, pN = noTools.metrics().population;
  console.log(`     [tools] population after 180t — with tools ${pT.toFixed(1)} vs none ${pN.toFixed(1)}`);
  check('T5 tools-as-capital boost farm output -> higher population', pT > pN + 1, `withTools=${pT.toFixed(1)} none=${pN.toFixed(1)}`);
  check('T5b tool coverage is high when supplied, zero when not', withTools.toolCoverage > 0.6 && noTools.toolCoverage < 0.01,
    `cov ${withTools.toolCoverage.toFixed(2)} vs ${noTools.toolCoverage.toFixed(2)}`);
})();

console.log(`\n결과: ${passed}/${passed + failed} 통과`);
process.exit(failed === 0 ? 0 : 1);
