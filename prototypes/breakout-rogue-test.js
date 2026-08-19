// BREAKOUT ROGUE 로직/밸런스 검증 — 실행: node prototypes/breakout-rogue-test.js
'use strict';
const B = require('../public/arcade/breakout/sim.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

console.log('\n[장비 / 드래프트]');
{
  const run = B.createRun({ seed: 5 });
  ok(run.owned.length === 0, '기본 시작은 장비 없음');
  ok(B.draftOffers(run).length === 3, '기본 선택지 3장');
  ok(B.draftOffers(B.createRun({ seed: 5, meta: { upgrades: { widedraft: 1 } } })).length === 4,
     '넓은 선택 업그레이드로 4장');

  const r2 = B.createRun({ seed: 8 });
  B.grant(r2, 'widepad');
  ok(!B.draftOffers(r2, 99).some((o) => o.id === 'widepad'), '보유 장비는 선택지에서 제외');

  let seededOk = true;
  for (let i = 1; i <= 40; i++) {
    const r = B.createRun({ seed: i, meta: { upgrades: { headgear: 1 } } });
    if (r.owned.length !== 1 || B.defOf(r.owned[0]).kind === 'cursed') { seededOk = false; break; }
  }
  ok(seededOk, '선행 장비는 항상 1개, 저주는 주지 않음');
}

console.log('\n[합성 — 조합 발견]');
{
  const run = B.createRun({ seed: 3 });
  B.grant(run, 'splitshot');
  const f = B.grant(run, 'bombball');
  ok(f && f.id === 'shrapnel', '분열탄 + 폭발탄 → 산탄 폭풍', f ? f.id : 'none');
  ok(run.owned.includes('shrapnel'), '합성 결과가 보유 목록에 들어감');
  ok(!run.owned.includes('splitshot') && !run.owned.includes('bombball'), '재료 장비는 소모됨');
  ok(run.fused.length === 1, '합성 기록 남김');

  const solo = B.createRun({ seed: 3 });
  B.grant(solo, 'bombball');
  ok(B.stats(run).bombChance > B.stats(solo).bombChance, '합성이 재료 하나보다 강함');

  let all = true;
  for (const fu of B.FUSIONS) {
    const r = B.createRun({ seed: 2 });
    let got = null;
    for (const src of fu.from) got = B.grant(r, src) || got;
    if (!got || got.id !== fu.id) { all = false; console.log('    문제 조합:', fu.id); }
  }
  ok(all, `정의된 합성 ${B.FUSIONS.length}종 모두 성립`);

  const r3 = B.createRun({ seed: 9 });
  B.grant(r3, 'steelball');
  const offers = B.draftOffers(r3, 99);
  const hint = offers.find((o) => o.id === 'pierce');
  ok(hint && hint.fusesInto && hint.fusesInto.id === 'armorpiercer', '합성 예고 표시');
  ok(offers.filter((o) => o.fusesInto).length === 1, '합성 예고는 실제로 완성되는 카드에만');
}

console.log('\n[저주 — 위험/보상]');
{
  const base = B.createRun({ seed: 11 });
  const glass = B.createRun({ seed: 11 });
  B.grant(glass, 'glasscannon');
  ok(B.brickScore(glass, { level: 3, combo: 5, brickHp: 2 }) > B.brickScore(base, { level: 3, combo: 5, brickHp: 2 }),
     '유리 대포는 점수를 크게 올린다');
  ok(B.startingLives(glass) === 1, '유리 대포는 목숨을 1로 고정');
  ok(B.startingLives(base) === 3, '기본 목숨 3');

  // 목숨 강화가 있어도 저주는 이긴다 (대가가 진짜여야 도박이 성립한다)
  const glassPlus = B.createRun({ seed: 11, meta: { upgrades: { extralife: 2 } } });
  B.grant(glassPlus, 'glasscannon');
  ok(B.startingLives(glassPlus) === 1, '영구 강화보다 저주가 우선 — 대가는 진짜다');

  const narrow = B.createRun({ seed: 12 });
  B.grant(narrow, 'narrowpad');
  ok(B.paddleScale(narrow) < 1, '좁은 판은 실제로 패들을 줄인다');

  const frenzy = B.createRun({ seed: 13 });
  B.grant(frenzy, 'frenzyball');
  ok(B.stats(frenzy).ballSpeedMult > 1, '광란의 공은 실제로 공을 빠르게 한다');
}

console.log('\n[안전장치 — 플레이 불가 방지]');
{
  // 패들 축소가 겹쳐도 사라지면 안 되고, 공이 멈춰도 안 된다
  const r = B.createRun({ seed: 21 });
  B.grant(r, 'narrowpad');
  ok(B.stats(r).paddleMult >= 0.45, '패들 배율 하한 유지');
  const slow = B.createRun({ seed: 22 });
  B.grant(slow, 'lightball');
  ok(B.stats(slow).ballSpeedMult >= 0.5, '공 속도 하한 유지');

  const dirty = B.normalizeMeta({ shards: -100, upgrades: { extralife: 99, nope: 4 } });
  ok(dirty.shards === 0, '음수 조각은 0으로 정규화');
  ok(dirty.upgrades.extralife === 2, '업그레이드 레벨은 최대치로 제한');
  ok(dirty.upgrades.nope === undefined, '알 수 없는 업그레이드는 버림');
}

console.log('\n[메타 진행]');
{
  const run = B.createRun({ seed: 6 });
  run.score = 3000; run.level = 7; run.bestCombo = 14; run.fused = ['shrapnel'];
  const earned = B.shardsEarned(run);
  ok(earned > 0, '판이 끝나면 조각이 남는다', String(earned));

  const weak = B.createRun({ seed: 6 });
  ok(B.shardsEarned(weak) >= 1, '최악의 판에서도 최소 1조각');
  ok(earned > B.shardsEarned(weak), '잘한 판이 더 많은 조각');

  // 인플레이션 방지 — 스네이크에서 실측된 리스크(곱연산 점수 × 선형 정산)의 대칭 방어
  const god = B.createRun({ seed: 6 });
  god.score = 500000; god.level = 20; god.bestCombo = 40; god.fused = ['a','b','c','d','e'];
  const shopTotal = B.UPGRADES.reduce((a2, u) => {
    let t = 0; for (let l = 0; l < u.max; l++) t += u.cost(l); return a2 + t;
  }, 0);
  const godPay = B.shardsEarned(god);
  ok(godPay < shopTotal, '신적인 판도 상점 전체보다 적게 준다', `${godPay} < ${shopTotal}`);
  ok(godPay > 250, '그래도 신적인 판은 확실히 크게 보상한다', String(godPay));

  let res = B.buyUpgrade(B.normalizeMeta({ shards: 100 }), 'bigpaddle');
  ok(res.ok && res.meta.upgrades.bigpaddle === 1, '업그레이드 구매');
  ok(res.meta.shards === 100 - 35, '비용만큼 조각 차감', String(res.meta.shards));
  ok(!B.buyUpgrade(B.normalizeMeta({ shards: 5 }), 'widedraft').ok, '조각이 모자라면 구매 실패');
  ok(!B.buyUpgrade(B.normalizeMeta({ shards: 99999, upgrades: { widedraft: 1 } }), 'widedraft').ok,
     '최대 레벨이면 더 못 산다');

  // 영구 강화가 실제로 시작 상태에 반영된다
  const buffed = B.createRun({ seed: 7, meta: { upgrades: { extralife: 2, bigpaddle: 3 } } });
  ok(B.startingLives(buffed) === 5, '예비 목숨이 시작 목숨에 반영', String(B.startingLives(buffed)));
  ok(B.paddleScale(buffed) > 1.2, '큰 패들이 시작 패들에 반영', B.paddleScale(buffed).toFixed(2));
}

console.log('\n[밸런스 시뮬레이션]');
{
  const builds = new Map();
  let fusedRuns = 0, cursedPicks = 0, totalPicks = 0;
  const RUNS = 200, STAGES = 8;
  for (let seed = 1; seed <= RUNS; seed++) {
    const run = B.createRun({ seed: seed * 7919 });
    for (let st = 0; st < STAGES; st++) {
      const offers = B.draftOffers(run);
      if (!offers.length) break;
      const pick = offers[Math.floor(run.rng() * offers.length)];
      if (pick.kind === 'cursed') cursedPicks++;
      totalPicks++;
      B.grant(run, pick.id);
    }
    if (run.fused.length) fusedRuns++;
    builds.set(run.owned.slice().sort().join('+'), true);
  }
  const fuseRate = fusedRuns / RUNS;
  const cursedRate = cursedPicks / totalPicks;
  console.log(`    고유 빌드 ${builds.size}/${RUNS}, 합성 발생 판 ${(fuseRate * 100).toFixed(0)}%, 저주 선택 ${(cursedRate * 100).toFixed(0)}%`);
  ok(builds.size > RUNS * 0.5, '빌드가 판마다 갈라진다', `${builds.size}/${RUNS}`);
  ok(fuseRate > 0.15 && fuseRate < 0.9, '합성이 가끔 터진다 (항상도 전무도 아님)', (fuseRate * 100).toFixed(0) + '%');
  ok(cursedRate > 0.02 && cursedRate < 0.35, '저주는 섞이되 흔하지 않다', (cursedRate * 100).toFixed(0) + '%');

  const naked = B.createRun({ seed: 99 });
  const built = B.createRun({ seed: 99 });
  ['widepad', 'steelball', 'luckydrop'].forEach((id) => B.grant(built, id));
  ok(B.brickScore(built, { level: 5, combo: 6, brickHp: 2 }) >= B.brickScore(naked, { level: 5, combo: 6, brickHp: 2 }),
     '빌드를 갖춰도 점수가 후퇴하지 않는다');
  const scoring = B.createRun({ seed: 99 });
  ['glasscannon', 'narrowpad'].forEach((id) => B.grant(scoring, id));
  ok(B.brickScore(scoring, { level: 5, combo: 6, brickHp: 2 }) > B.brickScore(naked, { level: 5, combo: 6, brickHp: 2 }) * 2,
     '점수 특화 빌드는 확실히 더 번다');

  const a = B.draftOffers(B.createRun({ seed: 321 })).map((o) => o.id).join(',');
  const b = B.draftOffers(B.createRun({ seed: 321 })).map((o) => o.id).join(',');
  ok(a === b, '같은 시드는 같은 선택지 (결정적)');
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
