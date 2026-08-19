// 식물 키우기 환생 검증 — 실행: node prototypes/plant-prestige-test.js
'use strict';
const P = require('../public/arcade/plant/sim.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

const freshSave = () => ({
  water: 0, sun: 0, nutrient: 0, star: 0, growth: 0, stageIdx: 0,
  upgrades: {}, achievements: [], breakthroughs: [], totalClicks: 0, lastSave: 0,
});

console.log('\n[정수 계산]');
{
  const p0 = P.normalizePrestige({});
  ok(P.essenceFor(0, p0) === 0, '성장이 없으면 정수도 없다');
  ok(P.essenceFor(12000, p0) > 0, '신목까지 키우면 정수를 얻는다', String(P.essenceFor(12000, p0)));

  // 단조 증가 + 체감 (제곱근)
  let mono = true;
  for (let g = 1000; g < 200000; g += 4000) if (P.essenceFor(g + 4000, p0) < P.essenceFor(g, p0)) mono = false;
  ok(mono, '누적 성장이 늘면 정수도 줄지 않는다');
  const a = P.essenceFor(10000, p0), b = P.essenceFor(40000, p0);
  ok(b < a * 4, '4배 키워도 정수는 4배가 안 된다 (후반 체감)', `${a} → ${b}`);

  // 풍요의 씨앗
  const bounty = P.normalizePrestige({ traits: { bounty: 5 } });
  ok(P.essenceFor(12000, bounty) > P.essenceFor(12000, p0), '풍요의 씨앗이 정수를 늘린다');
}

console.log('\n[첫 환생이 실제로 보상이 되는가]');
{
  // 환생 조건을 갓 만족한 시점에 정수 1개만 줘서 아무것도 못 사면 허탈하다.
  // 최소한 특성 하나는 살 수 있어야 "환생할 이유" 가 성립한다.
  const p0 = P.normalizePrestige({});
  const justQualified = { ...freshSave(), stageIdx: P.FIRST_REBIRTH_STAGE, lifetimeGrowth: 1400 };
  ok(P.canRebirth(justQualified, p0), '꽃 단계 도달 시점에 환생이 열린다');
  const gain = P.pendingEssence(justQualified, p0);
  const cheapest = Math.min(...P.TRAITS.map((t) => t.cost(0)));
  ok(gain >= cheapest, '첫 환생 정수로 최소 하나는 살 수 있다', `정수 ${gain} / 최저가 ${cheapest}`);
}

console.log('\n[환생 조건]');
{
  const p0 = P.normalizePrestige({});
  const early = { ...freshSave(), stageIdx: 2, lifetimeGrowth: 50000 };
  ok(!P.canRebirth(early, p0), '첫 회차는 꽃 단계 전에는 환생 불가');
  ok(/꽃 단계/.test(P.rebirthBlockReason(early, p0) || ''), '이유를 사람 말로 알려준다');

  const ready = { ...freshSave(), stageIdx: P.FIRST_REBIRTH_STAGE, lifetimeGrowth: 12000 };
  ok(P.canRebirth(ready, p0), '꽃 단계 + 충분한 성장이면 환생 가능');

  const veteran = P.normalizePrestige({ rebirths: 1 });
  const small = { ...freshSave(), stageIdx: 0, lifetimeGrowth: 12000 };
  ok(P.canRebirth(small, veteran), '2회차부터는 단계 제한 없이 정수만 보면 된다');

  const tooSmall = { ...freshSave(), stageIdx: 0, lifetimeGrowth: 10 };
  ok(!P.canRebirth(tooSmall, veteran), '정수가 1도 안 되면 환생 불가');
  ok(P.rebirthBlockReason(tooSmall, veteran) !== null, '그 이유도 알려준다');
}

console.log('\n[환생이 지우는 것 / 남기는 것]');
{
  const p0 = P.normalizePrestige({});
  const before = {
    ...freshSave(),
    water: 900, sun: 800, nutrient: 700, star: 12,
    growth: 5000, stageIdx: 6,
    upgrades: { waterCan: 8, sunPanel: 5 },
    achievements: ['first_sprout', 'green_thumb'],
    breakthroughs: ['bt_photosynthesis'],
    totalClicks: 4321,
    lifetimeGrowth: 30000,
  };
  const res = P.applyRebirth(before, p0, freshSave());
  ok(res.ok && res.gained > 0, '환생 성공 + 정수 획득', String(res.gained));

  // 지워지는 것
  ok(res.save.growth === 0 && res.save.stageIdx === 0, '성장·단계는 초기화');
  ok(Object.keys(res.save.upgrades).length === 0, '업그레이드는 초기화');
  ok(res.save.water === 0 && res.save.sun === 0, '자원은 초기화 (깊은 뿌리 없을 때)');
  ok(res.save.lifetimeGrowth === 0, '다음 회차 정수는 다시 쌓는다');

  // 남는 것 — 플레이어의 기록을 지우면 안 된다
  ok(res.save.achievements.length === 2, '업적은 남는다');
  ok(res.save.breakthroughs.length === 1, '돌파는 남는다');
  ok(res.save.totalClicks === 4321, '총 클릭 수는 남는다');
  ok(res.save.star === 12, '별(희귀 재화)은 남는다');
  ok(res.prestige.rebirths === 1, '회차가 올라간다');
  ok(res.prestige.essence === res.gained, '정수가 적립된다');
  ok(res.prestige.lifetimeGrowth === 30000, '누적 성장 기록이 환생 상태에 남는다');

  // 원본 불변
  ok(before.growth === 5000 && before.stageIdx === 6, '원본 저장값은 건드리지 않는다');

  // 조건 미달이면 아무것도 지우지 않는다 (제일 중요한 안전장치)
  const notReady = { ...freshSave(), stageIdx: 1, lifetimeGrowth: 5 };
  const blocked = P.applyRebirth(notReady, p0, freshSave());
  ok(!blocked.ok && blocked.gained === 0, '조건 미달이면 환생하지 않는다');
  ok(blocked.save === notReady, '조건 미달이면 저장값을 그대로 돌려준다 (데이터 손실 없음)');
}

console.log('\n[특성]');
{
  let p = P.normalizePrestige({ essence: 100 });
  const r1 = P.buyTrait(p, 'fertile');
  ok(r1.ok && r1.prestige.traits.fertile === 1, '특성 구매');
  ok(r1.prestige.essence === 100 - 3, '정수가 비용만큼 줄어든다', String(r1.prestige.essence));

  ok(!P.buyTrait(P.normalizePrestige({ essence: 0 }), 'fertile').ok, '정수가 없으면 못 산다');
  ok(!P.buyTrait(P.normalizePrestige({ essence: 9999 }), 'nope').ok, '없는 특성은 못 산다');

  // 최대 레벨 제한
  let maxed = P.normalizePrestige({ essence: 99999, traits: { memory: 3 } });
  ok(!P.buyTrait(maxed, 'memory').ok, '최대 레벨이면 더 못 산다');

  // 비용은 레벨이 오를수록 비싸진다
  const c0 = P.traitCost('fertile', P.normalizePrestige({}));
  const c3 = P.traitCost('fertile', P.normalizePrestige({ traits: { fertile: 3 } }));
  ok(c3 > c0, '레벨이 오르면 비용이 오른다', `${c0} → ${c3}`);
}

console.log('\n[특성 효과가 실제로 반영되는가]');
{
  const none = P.bonuses(P.normalizePrestige({}));
  ok(none.growthMult === 1 && none.sunPerSec === 0 && none.startStage === 0, '특성이 없으면 보정도 없다');

  const full = P.bonuses(P.normalizePrestige({ traits: { fertile: 10, photo: 8, roots: 5, memory: 3, bounty: 5 } }));
  ok(full.growthMult > 2, '비옥한 대지 만렙이면 성장 2배 이상', full.growthMult.toFixed(2));
  ok(full.sunPerSec > 3, '광합성 유전자가 초당 햇빛을 준다', full.sunPerSec.toFixed(1));
  ok(full.startResource === 125, '깊은 뿌리가 시작 자원을 준다');
  ok(full.startStage === 3, '기억하는 줄기가 시작 단계를 올린다');

  // 깊은 뿌리 / 기억하는 줄기가 실제 환생 결과에 반영된다
  const p = P.normalizePrestige({ rebirths: 1, traits: { roots: 4, memory: 2 } });
  const res = P.applyRebirth({ ...freshSave(), lifetimeGrowth: 20000 }, p, freshSave());
  ok(res.save.water === 100 && res.save.nutrient === 100, '환생 후 시작 자원이 들어있다', String(res.save.water));
  ok(res.save.stageIdx === 2, '환생 후 시작 단계가 올라가 있다', String(res.save.stageIdx));
}

console.log('\n[저장값 오염 방어]');
{
  const dirty = P.normalizePrestige({ essence: -50, rebirths: -3, lifetimeGrowth: 'abc',
                                      traits: { fertile: 999, bogus: 5, photo: -2 } });
  ok(dirty.essence === 0, '음수 정수는 0');
  ok(dirty.rebirths === 0, '음수 회차는 0');
  ok(dirty.lifetimeGrowth === 0, '숫자가 아닌 누적 성장은 0');
  ok(dirty.traits.fertile === 10, '특성 레벨은 최대치로 제한');
  ok(dirty.traits.bogus === undefined, '알 수 없는 특성은 버림');
  ok(dirty.traits.photo === undefined, '음수 레벨은 무시');
  ok(P.normalizePrestige(null).essence === 0, 'null 도 안전하게 처리');
  ok(P.essenceFor(NaN, dirty) === 0, 'NaN 성장은 정수 0');
}

console.log('\n[회차 진행 시뮬레이션]');
{
  // 특성에 투자하며 5회차를 돌면 회차마다 실제로 강해지는가
  let prestige = P.normalizePrestige({});
  const growthPerRun = [12000, 20000, 34000, 52000, 78000];
  const mults = [];
  for (let i = 0; i < growthPerRun.length; i++) {
    const save = { ...freshSave(), stageIdx: 8, lifetimeGrowth: growthPerRun[i] };
    const res = P.applyRebirth(save, prestige, freshSave());
    prestige = res.prestige;
    // 받은 정수를 성장 특성에 쏟아붓는다
    let guard = 0;
    while (P.buyTrait(prestige, 'fertile').ok && guard++ < 20) prestige = P.buyTrait(prestige, 'fertile').prestige;
    mults.push(P.bonuses(prestige).growthMult);
  }
  ok(prestige.rebirths === 5, '5회차까지 진행');
  ok(mults[4] > mults[0], '회차를 거듭할수록 성장 배율이 커진다', `${mults[0].toFixed(2)} → ${mults[4].toFixed(2)}`);
  ok(prestige.essence >= 0, '정수가 음수가 되지 않는다');
  console.log(`    성장 배율 추이: ${mults.map((m) => m.toFixed(2)).join(' → ')}`);
}

console.log('\n[자원 경제 — 죽은 화폐가 없어야 한다]');
{
  // 햇빛·영양분·별은 전부 "자기 자신이 비용인 업그레이드"로만 늘릴 수 있어서,
  // 클릭·단계 보너스에 기본 수입이 없으면 신규 세이브에서 영원히 0이다.
  // (실제로 그렇게 출시됐었다 — 90초 실플레이에서 셋 다 0으로 확인.)
  ok(P.CLICK_YIELD && P.CLICK_YIELD.sun > 0, '클릭이 햇빛을 조금씩 번다', String(P.CLICK_YIELD && P.CLICK_YIELD.sun));
  ok(P.CLICK_YIELD && P.CLICK_YIELD.nutrient > 0, '클릭이 영양분을 조금씩 번다');

  const b1 = P.stageBundle(1), b4 = P.stageBundle(4);
  ok(b1.water > 0 && b1.sun > 0 && b1.nutrient > 0 && b1.star > 0, '단계 보너스에 네 자원이 모두 있다');
  ok(b4.water > b1.water && b4.nutrient > b1.nutrient, '단계가 오를수록 보너스도 커진다');
  ok(P.stageBundle(0).water === 0, '0단계(씨앗)는 보너스가 없다');
  ok(P.stageBundle(-3).water === 0 && P.stageBundle(NaN).water === 0, '이상한 입력도 안전');

  // 신규 세이브 시뮬레이션: 클릭+단계 보너스만으로 비료(영양분 15)와
  // 태양광 패널(햇빛 20)이 실제로 살 수 있는 가격인가
  let sun = 0, nutrient = 0, clicks = 0;
  for (let stage = 1; stage <= 2; stage++) {
    for (let c = 0; c < 60; c++) { sun += P.CLICK_YIELD.sun; nutrient += P.CLICK_YIELD.nutrient; clicks++; }
    const bd = P.stageBundle(stage); sun += bd.sun; nutrient += bd.nutrient;
  }
  ok(nutrient >= 15, `2단계까지 ${clicks}클릭이면 비료(영양분 15)를 살 수 있다`, nutrient.toFixed(1));
  ok(sun >= 20, '같은 시점에 태양광 패널(햇빛 20)도 살 수 있다', sun.toFixed(1));
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
