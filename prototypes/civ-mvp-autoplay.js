// 헤드리스 자동 플레이어 — 시대 A→E 루프 진행이 실제로 닫히고 승리 가능한지 검증.
// 실행: node prototypes/civ-mvp-autoplay.js
'use strict';
const { Sim, RES, BLD, SCENARIO, clone } = require('../public/arcade/bootstrap/sim.js');

const COST = {
  forager_camp: 8, hunting_lodge: 12, fire_pit: 10, shelter: 16,
  crop_field: 16, compost_yard: 10, pasture: 14, clay_pit: 12,
  granary: 20, pottery_workshop: 18, irrigation_canal: 22, longhouse: 30, scribe_hall: 26,
  craft_school: 28, lumber_camp: 16, copper_mine: 24, smelter: 30, toolsmith: 24, trade_post: 20,
};

function autoPlay(seedRandom) {
  if (seedRandom != null) { let s = seedRandom; Math.random = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
  const sim = new Sim(RES, BLD, clone(SCENARIO));
  const can = (id) => (sim.stock.food || 0) >= COST[id] && sim.isUnlocked(id);
  const buy = (id) => { if (can(id)) { sim.stock.food -= COST[id]; sim.counts[id] = (sim.counts[id] || 0) + 1; return true; } return false; };
  const log = [];

  for (let t = 0; t < 4000; t++) {
    const m = sim.metrics();
    const pop = m.population;
    const era = sim.eraIndex;

    // 매우 단순한 휴리스틱 건설 전략 (시대별)
    // 식량 흑자가 음수면 식량 생산 우선
    if (m.foodSurplusRatio < 0.05) {
      if (era >= 1) { if (m.fertility < 0.6) buy('compost_yard'); else buy('crop_field'); }
      else buy('forager_camp');
    }
    // 주거 여유 확보
    if (m.housingHeadroom < 4) { buy(era >= 2 ? 'longhouse' : 'shelter'); }
    // 비옥도 관리
    if (era >= 1 && m.fertility < 0.62 && (sim.counts.crop_field || 0) > 0) buy('compost_yard');

    if (era === 0) {
      // 채집 루프 확장
      if ((sim.counts.fire_pit || 0) < 2) buy('fire_pit');
      if (Math.random() < 0.5) buy('forager_camp'); else buy('hunting_lodge');
    } else if (era === 1) {
      if ((sim.counts.crop_field || 0) < 6 && m.foodSurplusRatio > 0.1) buy('crop_field');
      if ((sim.counts.compost_yard || 0) < (sim.counts.crop_field || 0) * 0.6) buy('compost_yard');
      if ((sim.counts.clay_pit || 0) < 2) buy('clay_pit');
      if ((sim.counts.pasture || 0) < 2 && m.foodSurplusRatio > 0.15) buy('pasture');
    } else if (era === 2) {
      if ((sim.counts.granary || 0) < 2) buy('granary');
      if ((sim.counts.clay_pit || 0) < 3) buy('clay_pit');
      if ((sim.counts.pottery_workshop || 0) < 2) buy('pottery_workshop');
      if ((sim.counts.scribe_hall || 0) < 3) buy('scribe_hall');
      if ((sim.counts.irrigation_canal || 0) < 2) buy('irrigation_canal');
      if ((sim.counts.crop_field || 0) < 9 && m.foodSurplusRatio > 0.15) buy('crop_field');
      if ((sim.counts.compost_yard || 0) < (sim.counts.crop_field || 0) * 0.6) buy('compost_yard');
    } else if (era === 3) {
      if ((sim.counts.craft_school || 0) < 2) buy('craft_school');
      if ((sim.counts.lumber_camp || 0) < 3) buy('lumber_camp');
      if ((sim.counts.trade_post || 0) < 2) buy('trade_post');
      if ((sim.counts.pottery_workshop || 0) < 3) buy('pottery_workshop');
      if ((sim.counts.clay_pit || 0) < 4) buy('clay_pit');
      if ((sim.counts.copper_mine || 0) < 3) buy('copper_mine');
      if ((sim.counts.smelter || 0) < 2) buy('smelter');
      if ((sim.counts.toolsmith || 0) < 2) buy('toolsmith');
      if ((sim.counts.crop_field || 0) < 12 && m.foodSurplusRatio > 0.15) buy('crop_field');
      if ((sim.counts.compost_yard || 0) < (sim.counts.crop_field || 0) * 0.6) buy('compost_yard');
    }

    sim.tick();

    if (sim.justAdvanced && log[log.length - 1] !== sim.justAdvanced) {
      log.push(sim.justAdvanced);
      console.log(`  [t=${sim.t}] 시대 ${sim.justAdvanced} 진입 · 인구 ${pop.toFixed(0)} · 비옥도 ${(sim.fertility*100|0)}% · 숙련 ${sim.pop.skilled.toFixed(1)}`);
      sim.justAdvanced = null;
    }
    if (sim.won()) { console.log(`  ✅ 승리(시대 E 도달) @ t=${sim.t}, 인구 ${sim.totalPop().toFixed(0)}`); return { win: true, t: sim.t }; }
    if (sim.totalPop() < 1) { console.log(`  💀 붕괴 @ t=${sim.t}`); return { win: false, t: sim.t, era }; }
  }
  console.log(`  ⏱  4000틱 내 미승리. 최종 시대 ${sim.eraLetter()}, 인구 ${sim.totalPop().toFixed(0)}`);
  return { win: false, t: 4000, era: sim.eraIndex };
}

console.log('\n=== CIVILIZATION ENGINE MVP — 자동 플레이 검증 ===');
let wins = 0;
for (let i = 0; i < 5; i++) {
  console.log(`\n[시도 ${i + 1}]`);
  const r = autoPlay(i + 1);
  if (r.win) wins++;
}
console.log(`\n결과: ${wins}/5 승리`);
process.exit(wins >= 3 ? 0 : 1);
