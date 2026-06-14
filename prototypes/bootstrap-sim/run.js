// CLI dashboard runner:  node prototypes/bootstrap-sim/run.js [ticks] [--disease]
'use strict';
const { loadDefault } = require('./sim');

const ticks = parseInt(process.argv[2] || '600', 10);
const sim = loadDefault();
if (process.argv.includes('--disease')) sim.events.push({ tick: 400, type: 'fertilityShock', value: -0.45, label: 'Crop disease' });

const pad = (s, n) => String(s).padStart(n);
function dash() {
  const m = sim.metrics();
  const bn = sim.bottlenecks().slice(0, 3).map((b) => `${b.id}@${(b.util * 100).toFixed(0)}%(${b.reason})`).join('  ');
  const gates = sim.gates.map((g) => `${g.label.split(' ').pop()}:${g.passed ? 'PASS' : g.sustain + '/' + g.sustainTicks}`).join('  ');
  console.log(
    `t=${pad(sim.t, 4)} pop=${pad(m.population.toFixed(1), 7)} ` +
    `(u${sim.pop.unskilled.toFixed(0)}/s${sim.pop.skilled.toFixed(0)}) ` +
    `food=${pad((sim.stock.food || 0).toFixed(0), 4)} surplus=${pad((m.foodSurplusRatio * 100).toFixed(0), 4)}% ` +
    `fert=${(m.fertility).toFixed(2)} steel/t=${m.steelRate.toFixed(2)} tools=${(m.toolCoverage * 100).toFixed(0)}% ore=${sim.oreDeposit.toFixed(0)}`
  );
  if (sim.t % 100 === 0) { console.log(`        bottlenecks: ${bn}`); console.log(`        gates: ${gates}`); }
}

console.log(`=== BOOTSTRAP MVP sim — "${require('./data/scenario.json').name}" — ${ticks} ticks ===`);
for (let i = 0; i < ticks; i++) {
  if (sim.t % 50 === 0) dash();
  sim.tick();
}
dash();
console.log('\nFinal gates:', sim.gates.map((g) => `${g.id}=${g.passed ? 'PASS' : 'no'}`).join(', '));
