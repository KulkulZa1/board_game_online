// SNAKE ROGUE 로직/밸런스 검증 — 실행: node prototypes/snake-rogue-test.js
'use strict';
const S = require('../public/arcade/snake/sim.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

console.log('\n[돌연변이 / 드래프트]');
{
  const run = S.createRun({ seed: 7 });
  ok(run.owned.length === 0, '기본 시작은 돌연변이 없음');

  const offers = S.draftOffers(run);
  ok(offers.length === 3, '기본 선택지 3장', String(offers.length));
  ok(new Set(offers.map((o) => o.id)).size === offers.length, '선택지 중복 없음');

  // 넓은 선택 업그레이드 → 4장
  const run4 = S.createRun({ seed: 7, meta: { upgrades: { widedraft: 1 } } });
  ok(S.draftOffers(run4).length === 4, '넓은 선택 업그레이드로 4장');

  // 이미 가진 건 다시 안 나온다
  const r2 = S.createRun({ seed: 3 });
  S.grant(r2, 'magnet');
  const off2 = S.draftOffers(r2, 12);
  ok(!off2.some((o) => o.id === 'magnet'), '보유한 돌연변이는 선택지에서 제외');

  // 타고난 변이: 시작부터 1개, 저주는 아님
  let seededOk = true;
  for (let i = 1; i <= 40; i++) {
    const r = S.createRun({ seed: i, meta: { upgrades: { seeded: 1 } } });
    if (r.owned.length !== 1) { seededOk = false; break; }
    if (S.defOf(r.owned[0]).kind === 'cursed') { seededOk = false; break; }
  }
  ok(seededOk, '타고난 변이는 항상 1개, 저주는 주지 않음');
}

console.log('\n[진화 — 조합 발견]');
{
  const run = S.createRun({ seed: 11 });
  S.grant(run, 'magnet');
  const evo = S.grant(run, 'goldtongue');
  ok(evo && evo.id === 'goldenstorm', '자석 + 황금 혀 → 황금 폭풍', evo ? evo.id : 'none');
  ok(run.owned.includes('goldenstorm'), '진화가 보유 목록에 들어감');
  ok(!run.owned.includes('magnet') && !run.owned.includes('goldtongue'), '재료 돌연변이는 소모됨');
  ok(run.evolved.length === 1, '진화 기록 남김');

  // 진화 스탯이 재료보다 확실히 세다
  const solo = S.createRun({ seed: 11 });
  S.grant(solo, 'magnet');
  ok(S.stats(run).goldChance > S.stats(solo).goldChance, '진화가 재료 하나보다 강함');

  // 모든 진화가 실제로 성립하는지 (조합 정의 정합성)
  let allEvo = true;
  for (const e of S.EVOLUTIONS) {
    const r = S.createRun({ seed: 5 });
    let got = null;
    for (const f of e.from) got = S.grant(r, f) || got;
    if (!got || got.id !== e.id) { allEvo = false; console.log('    문제 조합:', e.id); }
  }
  ok(allEvo, `정의된 진화 ${S.EVOLUTIONS.length}종 모두 성립`);

  // 드래프트가 "지금 고르면 진화" 를 알려준다
  const r3 = S.createRun({ seed: 2 });
  S.grant(r3, 'phase');
  const all = S.draftOffers(r3, 99);   // 남은 풀 전체를 받아 결정적으로 확인
  const hint = all.find((o) => o.id === 'venom');
  ok(hint && hint.evolvesInto && hint.evolvesInto.id === 'voidserpent', '진화 예고 표시');
  ok(all.filter((o) => o.evolvesInto).length === 1, '진화 예고는 실제로 완성되는 카드에만 붙는다');
}

console.log('\n[저주 — 위험/보상]');
{
  const base = S.createRun({ seed: 21 });
  const cursed = S.createRun({ seed: 21 });
  S.grant(cursed, 'starving');
  const b = S.foodScore(base,   { level: 3, combo: 4 });
  const c = S.foodScore(cursed, { level: 3, combo: 4 });
  ok(c > b, '굶주린 송곳니는 점수를 크게 올린다', `${b} → ${c}`);
  ok(S.comboWindow(cursed, 3500) < S.comboWindow(base, 3500), '대가로 연쇄 유지 시간이 줄어든다');

  // 유리 몸은 방어막을 실제로 없앤다
  const glass = S.createRun({ seed: 4 });
  S.grant(glass, 'thickskin');
  ok(S.stats(glass).shields === 1, '두꺼운 비늘 → 방어막 1');
  S.grant(glass, 'brittle');
  ok(S.stats(glass).shields === 0, '유리 몸은 방어막을 모두 잃게 한다');

  // 정지 세계는 연쇄가 안 풀린다
  const frozen = S.createRun({ seed: 9 });
  S.grant(frozen, 'timewarp'); S.grant(frozen, 'resonance');
  ok(frozen.owned.includes('frozenworld'), '시간 왜곡 + 연쇄 공명 → 정지 세계');
  ok(S.comboWindow(frozen, 3500) === Infinity, '정지 세계는 연쇄가 풀리지 않음');
}

console.log('\n[성장 곡선 / 장애물]');
{
  ok(S.obstacleCount(1) === 0 && S.obstacleCount(4) === 0, '레벨 4까지는 장애물 없음');
  ok(S.obstacleCount(5) === 2, '레벨 5부터 장애물 등장');
  let mono = true;
  for (let lv = 1; lv < 30; lv++) if (S.obstacleCount(lv + 1) < S.obstacleCount(lv)) mono = false;
  ok(mono, '장애물 수는 줄어들지 않음');
  ok(S.obstacleCount(99) <= 14, '장애물 수에 상한이 있음 (플레이 불가 방지)');

  // 점수는 레벨·연쇄·황금에 대해 단조 증가
  const r = S.createRun({ seed: 1 });
  ok(S.foodScore(r, { level: 5, combo: 1 }) > S.foodScore(r, { level: 1, combo: 1 }), '레벨이 높을수록 점수 증가');
  ok(S.foodScore(r, { level: 1, combo: 5 }) > S.foodScore(r, { level: 1, combo: 1 }), '연쇄가 길수록 점수 증가');
  ok(S.foodScore(r, { level: 1, combo: 1, gold: true }) > S.foodScore(r, { level: 1, combo: 1 }), '황금 먹이가 더 높은 점수');
}

console.log('\n[메타 진행 — 죽어도 남는 것]');
{
  const run = S.createRun({ seed: 6 });
  run.score = 2400; run.level = 9; run.bestCombo = 7; run.evolved = ['goldenstorm'];
  const earned = S.scalesEarned(run);
  ok(earned > 0, '판이 끝나면 비늘이 남는다', String(earned));

  const weak = S.createRun({ seed: 6 });
  weak.score = 0; weak.level = 1; weak.bestCombo = 0;
  ok(S.scalesEarned(weak) >= 1, '최악의 판에서도 최소 1비늘 (헛수고 방지)');
  ok(earned > S.scalesEarned(weak), '잘한 판이 더 많은 비늘');

  // 인플레이션 방지 — 신적인 판(65만점)도 상점 전체 가격(~1,160)을 넘게 주면 안 된다.
  // 한때 score/120 선형 정산으로 한 판에 +6,086이 나와 메타가 한 판만에 끝났다.
  const god = S.createRun({ seed: 6 });
  god.score = 651219; god.level = 26; god.bestCombo = 40; god.evolved = ['a','b','c','d','e','f','g'];
  const shopTotal = S.UPGRADES.reduce((a, u) => {
    let t = 0; for (let l = 0; l < u.max; l++) t += u.cost(l); return a + t;
  }, 0);
  const godPay = S.scalesEarned(god);
  ok(godPay < shopTotal, '신적인 판도 상점 전체보다 적게 준다', `${godPay} < ${shopTotal}`);
  ok(godPay > 300, '그래도 신적인 판은 확실히 크게 보상한다', String(godPay));
  const typical = S.createRun({ seed: 6 });
  typical.score = 4000; typical.level = 5; typical.bestCombo = 8;
  const typPay = S.scalesEarned(typical);
  ok(typPay >= 30 && typPay <= 120, '평범한 판은 30~120비늘 (첫 업그레이드는 첫 판에 산다)', String(typPay));

  // 구매
  let meta = S.normalizeMeta({ scales: 100 });
  let res = S.buyUpgrade(meta, 'headstart');
  ok(res.ok && res.meta.upgrades.headstart === 1, '업그레이드 구매');
  ok(res.meta.scales === 100 - 30, '비용만큼 비늘 차감', String(res.meta.scales));

  res = S.buyUpgrade(S.normalizeMeta({ scales: 5 }), 'widedraft');
  ok(!res.ok, '비늘이 모자라면 구매 실패');

  // 최대 레벨 초과 불가
  let capped = S.normalizeMeta({ scales: 99999, upgrades: { widedraft: 1 } });
  ok(!S.buyUpgrade(capped, 'widedraft').ok, '최대 레벨이면 더 못 산다');

  // 저장값 오염 방어
  const dirty = S.normalizeMeta({ scales: -50, upgrades: { headstart: 999, bogus: 3 } });
  ok(dirty.scales === 0, '음수 비늘은 0으로 정규화');
  ok(dirty.upgrades.headstart === 3, '업그레이드 레벨은 최대치로 제한');
  ok(dirty.upgrades.bogus === undefined, '알 수 없는 업그레이드는 버림');
}

console.log('\n[밸런스 시뮬레이션]');
{
  // 매 레벨 무작위로 하나씩 고르는 봇 200판 — 빌드가 실제로 갈라지는지,
  // 진화가 "가끔" 터지는지(항상도 전무도 아님) 확인한다.
  const builds = new Map();
  let evoRuns = 0, totalEvos = 0, cursedPicks = 0, totalPicks = 0;
  const RUNS = 200, LEVELS = 8;
  for (let seed = 1; seed <= RUNS; seed++) {
    const run = S.createRun({ seed: seed * 977 });
    for (let lv = 0; lv < LEVELS; lv++) {
      const offers = S.draftOffers(run);
      if (!offers.length) break;
      const pick = offers[Math.floor(run.rng() * offers.length)];
      if (pick.kind === 'cursed') cursedPicks++;
      totalPicks++;
      S.grant(run, pick.id);
    }
    if (run.evolved.length) { evoRuns++; totalEvos += run.evolved.length; }
    builds.set(run.owned.slice().sort().join('+'), true);
  }
  const evoRate = evoRuns / RUNS;
  const cursedRate = cursedPicks / totalPicks;
  console.log(`    고유 빌드 ${builds.size}/${RUNS}, 진화 발생 판 ${(evoRate * 100).toFixed(0)}%, 저주 선택 비율 ${(cursedRate * 100).toFixed(0)}%`);
  ok(builds.size > RUNS * 0.5, '빌드가 판마다 실제로 갈라진다', `${builds.size}/${RUNS}`);
  ok(evoRate > 0.15 && evoRate < 0.95, '진화가 가끔 터진다 (항상도 전무도 아님)', (evoRate * 100).toFixed(0) + '%');
  ok(cursedRate > 0.02 && cursedRate < 0.35, '저주는 섞이되 흔하지 않다', (cursedRate * 100).toFixed(0) + '%');

  // 빌드를 쌓을수록 점수가 실제로 성장한다
  const naked = S.createRun({ seed: 42 });
  const built = S.createRun({ seed: 42 });
  ['gluttony', 'split', 'goldtongue'].forEach((id) => S.grant(built, id));
  const a = S.foodScore(naked, { level: 6, combo: 5 });
  const b = S.foodScore(built, { level: 6, combo: 5 });
  ok(b > a * 1.3, '빌드를 갖추면 점수가 뚜렷이 높아진다', `${a} → ${b}`);

  // 시드가 같으면 결과도 같다 (결정적)
  const s1 = S.draftOffers(S.createRun({ seed: 555 })).map((o) => o.id).join(',');
  const s2 = S.draftOffers(S.createRun({ seed: 555 })).map((o) => o.id).join(',');
  ok(s1 === s2, '같은 시드는 같은 선택지 (결정적)');
}

console.log('\n[소모된 재료는 드래프트 풀로 돌아오지 않는다]');
{
  // grant() 가 진화 시 재료를 owned 에서 빼기 때문에, draftOffers 가 owned 만으로
  // 거르면 재료가 풀로 복귀해 같은 진화를 무한 재양산할 수 있었다.
  // 실측 영향: 점수 중앙 123만 → 469만 (3.8배 인플레), 진화 중앙 28회 (진화는 총 5종).
  const evo = S.EVOLUTIONS[0];
  const run = S.createRun({ seed: 4242 });
  evo.from.forEach((id) => S.grant(run, id));
  ok(run.evolved.includes(evo.id), '재료를 모두 얻으면 진화한다', evo.id);
  ok(evo.from.every((f) => !run.owned.includes(f)), '진화가 재료를 소모한다');

  const seen = new Set();
  for (let i = 0; i < 500; i++) S.draftOffers(run, 3).forEach((o) => seen.add(o.id));
  const returned = evo.from.filter((f) => seen.has(f));
  ok(returned.length === 0, '500회 드래프트해도 소모된 재료가 다시 나오지 않는다', returned.join(',') || '-');

  // 진화체 자체도 다시 제시되면 안 된다
  ok(!seen.has(evo.id), '이미 만든 진화체도 다시 제시되지 않는다');
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
