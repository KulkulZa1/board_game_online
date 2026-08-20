// 문명 키우기(bootstrap) 루프 검증 — 실행: node prototypes/bootstrap-loop-test.js
// 합리적 빌드 오더가 무클릭으로 이기는지, 직접 행동(클릭)이 실제로 시간을 줄이는지 잰다.
'use strict';
const BOOT = require('../public/arcade/bootstrap/sim.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

// 게임 UI의 COST와 동일해야 한다 (game.js와 이중 정의 — 값이 바뀌면 여기도 바꿀 것)
const COST = {
  forager_camp: 8, hunting_lodge: 12, fire_pit: 10, shelter: 16,
  crop_field: 16, compost_yard: 10, pasture: 14, clay_pit: 12,
  granary: 20, pottery_workshop: 18, irrigation_canal: 22, longhouse: 30, scribe_hall: 26,
  craft_school: 28, lumber_camp: 16, copper_mine: 24, smelter: 30, toolsmith: 24, trade_post: 20,
};

function makeSim() { return new BOOT.Sim(BOOT.RES, BOOT.BLD, BOOT.clone(BOOT.SCENARIO)); }

// "주의 깊은 플레이어" 정책 — 시대별 고정 플랜, 과건설 없음
function policy(sim) {
  const m = sim.metrics();
  const era = sim.eraLetter();
  const c = (id) => sim.counts[id] || 0;
  const buy = (id) => {
    if (!sim.isUnlocked(id) || (sim.stock.food || 0) < COST[id] + 25) return false;
    sim.stock.food -= COST[id]; sim.counts[id] = c(id) + 1; return true;
  };
  if (era !== 'D' && m.housingHeadroom < 3) { if (buy(era >= 'C' ? 'longhouse' : 'shelter')) return; }
  if (era === 'A') {
    if (c('forager_camp') < 6 && buy('forager_camp')) return;
    if (c('hunting_lodge') < 2 && buy('hunting_lodge')) return;
    if (c('fire_pit') < 1) buy('fire_pit');
  } else if (era === 'B') {
    const f = c('crop_field'), cp = c('compost_yard');
    if (m.fertility < 0.62 && cp < f && buy('compost_yard')) return;
    if (f < 6 && buy('crop_field')) return;
    if (c('pasture') < 2 && buy('pasture')) return;
    if (c('clay_pit') < 1) buy('clay_pit');
  } else if (era === 'C') {
    if (c('granary') < 2 && buy('granary')) return;
    if (c('pottery_workshop') < 2 && buy('pottery_workshop')) return;
    if (m.writing < 0.72 && c('scribe_hall') < 3 && buy('scribe_hall')) return;
    if (c('irrigation_canal') < 1 && buy('irrigation_canal')) return;
    if (m.foodSurplusRatio < 0.12 && c('crop_field') < 10 && buy('crop_field')) return;
    const f = c('crop_field'), cp = c('compost_yard');
    if (m.fertility < 0.62 && cp < f) buy('compost_yard');
  } else if (era === 'D') {
    const pop = m.population;
    if (c('craft_school') < Math.ceil(pop / 40) && buy('craft_school')) return;
    if (c('lumber_camp') < 2 && buy('lumber_camp')) return;
    if (c('copper_mine') < 2 && buy('copper_mine')) return;
    if (c('trade_post') < 2 && buy('trade_post')) return;
    if (c('smelter') < 2 && buy('smelter')) return;
    if (m.toolCoverage < 0.6 && c('toolsmith') < Math.ceil(pop / 50) && buy('toolsmith')) return;
    if (m.bronzeRate < 0.6 && c('smelter') < 3) buy('smelter');
  }
}

function playToWin(clicky, maxT) {
  const sim = makeSim();
  for (let t = 0; t < maxT; t++) {
    policy(sim);
    if (clicky && t % 2 === 0) sim.performActiveAction(Math.min(10, 1 + (t % 12)));
    sim.tick();
    if (sim.won()) return { won: true, t: sim.t };
    if (sim.totalPop() < 1) return { won: false, t: sim.t, dead: true };
  }
  return { won: false, t: maxT };
}

console.log('\n[방치 경로 — 클릭 없이도 이겨야 한다]');
const idle = playToWin(false, 3000);
ok(idle.won, '무클릭 합리적 빌드가 3000틱 안에 승리한다', `t=${idle.t}${idle.dead ? ' (멸망)' : ''}`);
ok(idle.won && idle.t >= 400, '너무 순식간에 끝나지도 않는다 (400틱 이상)', `t=${idle.t}`);
console.log(`    무클릭 승리: t=${idle.t} (1배속 ${(idle.t / 2 / 60).toFixed(1)}분)`);

console.log('\n[직접 행동 — 클릭이 실제로 시간을 줄여야 한다]');
{
  // 황금기가 생산(병목 아님)만 올리던 시절, 클릭 유무가 결과를 전혀 바꾸지 못했다 (842틱 동일).
  // 지금은 황금기가 인구 성장·문자·숙련 전환(진짜 병목 시계)도 x1.5 하므로 차이가 나야 한다.
  const clicky = playToWin(true, 3000);
  ok(clicky.won, '클릭 병행도 승리한다', `t=${clicky.t}`);
  const speedup = idle.won && clicky.won ? 1 - clicky.t / idle.t : 0;
  ok(speedup >= 0.15, '클릭 병행이 승리를 15% 이상 앞당긴다', `${(speedup * 100).toFixed(0)}% (${idle.t} → ${clicky.t})`);
}

console.log('\n[황금기 — 문명의 시계를 돌려야 한다]');
{
  const a = makeSim(); const b = makeSim();
  a.counts.scribe_hall = 3; b.counts.scribe_hall = 3;
  a.counts.forager_camp = 8; b.counts.forager_camp = 8;
  a.counts.shelter = 6; b.counts.shelter = 6;   // 주거 여유가 있어야 인구가 는다
  a.eraIndex = 2; b.eraIndex = 2;   // 서기소 해금 시대
  b.activeBoostTicks = 999;
  for (let i = 0; i < 50; i++) { a.tick(); b.tick(); }
  ok(b.writing > a.writing, '황금기 중 문자·행정이 더 빨리 쌓인다', `${a.writing.toFixed(3)} vs ${b.writing.toFixed(3)}`);
  ok(b.totalPop() > a.totalPop(), '황금기 중 인구가 더 빨리 는다', `${a.totalPop().toFixed(1)} vs ${b.totalPop().toFixed(1)}`);
}

console.log('\n[활성 행동 기본기]');
{
  const s = makeSim();
  const before = s.stock.food;
  const r = s.performActiveAction(1);
  ok((s.stock.food || 0) > before, '클릭이 즉시 자원을 준다');
  ok(r && r.combo === 1, '체인 값이 결과에 실린다');
  s.actionCharge = 99; const r2 = s.performActiveAction(5);
  ok(r2.boostTriggered && s.activeBoostTicks >= 30, '게이지 100% → 황금기 발동');
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
