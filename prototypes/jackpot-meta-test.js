// 월세 잭팟 로그라이크 메타 검증 — 실행: node prototypes/jackpot-meta-test.js
'use strict';
const M = require('../public/arcade/jackpot/meta.js');
const J = require('../public/arcade/jackpot/sim.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

console.log('\n[세입자]');
{
  ok(M.TENANTS.length >= 6, `세입자 ${M.TENANTS.length}인 정의`);
  const free = M.TENANTS.filter((t) => t.cost === 0);
  ok(free.length >= 2, '무료 세입자가 2인 이상 (처음부터 선택지가 있다)');

  const m0 = M.normalize({});
  free.forEach((t) => ok(M.isUnlocked(m0, t.id), `${t.name} 은 처음부터 열려 있다`));
  const paid = M.TENANTS.find((t) => t.cost > 0);
  ok(!M.isUnlocked(m0, paid.id), `${paid.name} 은 잠겨 있다`);

  // 해금
  const rich = M.normalize({ deeds: 1000 });
  const res = M.unlockTenant(rich, paid.id);
  ok(res.ok && M.isUnlocked(res.meta, paid.id), '조각으로 세입자 해금');
  ok(res.meta.deeds === 1000 - paid.cost, '조각이 값만큼 줄어든다', String(res.meta.deeds));
  ok(!M.unlockTenant(res.meta, paid.id).ok, '이미 해금한 세입자는 다시 못 산다');
  ok(!M.unlockTenant(M.normalize({ deeds: 0 }), paid.id).ok, '조각이 없으면 해금 불가');
  ok(!M.unlockTenant(rich, 'nope').ok, '없는 세입자는 해금 불가');
}

console.log('\n[승급 사다리]');
{
  ok(M.ASCENSIONS.length === M.MAX_ASCENSION, `승급 ${M.MAX_ASCENSION}단 정의`);
  const m0 = M.normalize({});
  ok(M.availableAscension(m0) === 0, '처음엔 승급 0만 가능');
  ok(M.canPlayAscension(m0, 0) && !M.canPlayAscension(m0, 1), '도달하지 않은 승급은 선택 불가');

  // 이겨야 다음 승급이 열린다
  let m = m0;
  m = M.finishRun(m, { stage: 10, won: false, ascension: 0 }).meta;
  ok(M.availableAscension(m) === 0, '지면 승급이 열리지 않는다');
  m = M.finishRun(m, { stage: 10, won: true, ascension: 0 }).meta;
  ok(M.availableAscension(m) === 1, '이기면 다음 승급이 열린다');

  // 낮은 승급을 다시 이겨도 사다리가 앞서가지 않는다
  const before = M.availableAscension(m);
  m = M.finishRun(m, { stage: 10, won: true, ascension: 0 }).meta;
  ok(M.availableAscension(m) === before, '이미 깬 승급을 다시 이겨도 사다리는 그대로');

  // 끝까지 올라가면 멈춘다
  let top = M.normalize({ maxAscension: M.MAX_ASCENSION });
  top = M.finishRun(top, { stage: 12, won: true, ascension: M.MAX_ASCENSION }).meta;
  ok(top.maxAscension === M.MAX_ASCENSION, '최대 승급을 넘지 않는다');

  ok(M.describeAscension(5).length === 5, '승급 5는 1~5의 설명을 모두 보여준다 (누적)');
  ok(M.describeAscension(0).length === 0, '승급 0은 설명이 없다');
}

console.log('\n[조각 정산 — 져도 남는다]');
{
  ok(M.deedsEarned({ stage: 0, won: false, ascension: 0 }) >= 1, '최악의 판에서도 최소 1조각 (헛수고 방지)');
  const lose = M.deedsEarned({ stage: 5, won: false, ascension: 0 });
  const win = M.deedsEarned({ stage: 10, won: true, ascension: 0 });
  ok(win > lose, '이기면 더 많이 받는다', `${lose} → ${win}`);
  const highAsc = M.deedsEarned({ stage: 10, won: true, ascension: 8 });
  ok(highAsc > win, '높은 승급일수록 더 많이 받는다', `${win} → ${highAsc}`);

  const r = M.finishRun(M.normalize({}), { stage: 7, won: false, ascension: 2 });
  ok(r.meta.deeds === r.gained, '조각이 실제로 적립된다');
  ok(r.meta.runs === 1 && r.meta.bestStage === 7, '판 수·최고 기록이 남는다');
  const r2 = M.finishRun(r.meta, { stage: 3, won: false, ascension: 0 });
  ok(r2.meta.bestStage === 7, '최고 기록은 더 낮은 판에 덮이지 않는다');
}

console.log('\n[저장값 오염 방어]');
{
  const dirty = M.normalize({ deeds: -50, maxAscension: 999, runs: 'abc',
                              unlocked: ['gambler', 'nonexistent', 42] });
  ok(dirty.deeds === 0, '음수 조각은 0');
  ok(dirty.maxAscension === M.MAX_ASCENSION, '승급은 최대치로 제한');
  ok(dirty.runs === 0, '숫자가 아닌 판 수는 0');
  ok(!dirty.unlocked.includes('nonexistent') && !dirty.unlocked.includes(42), '없는 세입자 id 는 버린다');
  ok(dirty.unlocked.includes('gambler'), '유효한 해금은 유지');
  ok(M.normalize(null).deeds === 0, 'null 도 안전하게 처리');
  ok(!M.canPlayAscension(M.normalize({}), -3), '음수 승급은 거부');
}

console.log('\n[옵션이 실제 Run 에 반영되는가]');
{
  const base = new J.Run(rng(1));
  ok(base.coins === 0 && base.deckCap() === J.DECK_CAP && base.winStage() === J.WIN_STAGE,
     '옵션 없이 만든 Run 은 기존과 동일 (하위호환)');

  // 정확한 수치가 아니라 성질을 본다 — 밸런스 조정 때마다 테스트가 깨지면 안 된다
  const laborer = new J.Run(rng(1), M.runOptions('laborer', 0));
  ok(laborer.coins > base.coins, '막노동꾼은 코인을 들고 시작한다', String(laborer.coins));
  ok(laborer.coins === M.TEN.laborer.opts.startCoins, '시작 코인이 선언된 값과 일치');

  const collector = new J.Run(rng(1), M.runOptions('collector', 0));
  ok(collector.deckCap() === J.DECK_CAP + 10, '수집가 덱 상한 +10', String(collector.deckCap()));
  ok(collector.offers().length > base.offers().length, '수집가 드래프트 선택지가 더 많다');

  const gambler = new J.Run(rng(1), M.runOptions('gambler', 0));
  ok(gambler.deck.length > base.deck.length, '도박꾼은 시작 덱이 더 무겁다 (대가가 실재한다)');
  ok(gambler.opts.jackpotMult > 1, '도박꾼 잭팟 확률이 기본보다 높다', String(gambler.opts.jackpotMult));

  const cook = new J.Run(rng(1), M.runOptions('cook', 0));
  ok(cook.deck.filter((d) => d.id === 'gimbap').length === 2, '요리사는 김밥을 2장 들고 시작');

  const miser = new J.Run(rng(1), M.runOptions('miser', 0));
  ok(miser.rent() < base.rent(), '구두쇠는 월세가 싸다', `${base.rent()} → ${miser.rent()}`);
  ok(miser.skipReward() > base.skipReward(), '구두쇠는 스킵 코인이 많다');

  // 승급이 실제로 조인다
  const a10 = new J.Run(rng(1), M.runOptions('laborer', 10));
  ok(a10.winStage() > base.winStage(), '최상단 승급 — 결승선이 더 멀어진다', String(a10.winStage()));
  ok(a10.deckCap() < J.DECK_CAP, '승급 — 덱 상한이 줄어든다');
  ok(a10.skipReward() === 0, '승급 — 스킵 코인이 사라진다');
  ok(a10.rent() > base.rent(), '승급 — 월세가 비싸진다', `${base.rent()} → ${a10.rent()}`);
  // 어떤 승급도 플레이어를 유리하게 만들면 안 된다
  let noHelp = true;
  for (let lv = 1; lv <= M.MAX_ASCENSION; lv++) {
    const r = new J.Run(rng(5), M.runOptions('laborer', lv));
    if (r.deckCap() > J.DECK_CAP || r.skipReward() > base.skipReward() || r.winStage() < base.winStage()) noHelp = false;
  }
  ok(noHelp, '어떤 승급 단계도 플레이어를 유리하게 만들지 않는다');

  // 승급이 올라갈수록 월세는 단조 증가해야 한다
  let mono = true, prev = 0;
  for (let lv = 0; lv <= M.MAX_ASCENSION; lv++) {
    const r = new J.Run(rng(2), M.runOptions('laborer', lv));
    r.stage = 5;
    const rent = r.rent();
    if (rent < prev) mono = false;
    prev = rent;
  }
  ok(mono, '승급이 오를수록 월세가 줄지 않는다');

  // 플레이 불가 방지
  const worst = new J.Run(rng(3), M.runOptions('gambler', M.MAX_ASCENSION));
  ok(worst.spinsPerRent() >= 2, '최악 조합에서도 스핀 주기 하한 유지', String(worst.spinsPerRent()));
  ok(worst.deckCap() >= 10, '최악 조합에서도 덱 상한 하한 유지', String(worst.deckCap()));
  ok(worst.coins >= 0, '시작 코인이 음수가 되지 않는다', String(worst.coins));
}

console.log('\n[승급이 실제로 어렵게 만드는가 — 자동 플레이]');
{
  // 같은 전략(그리디 봇)으로 승급 0과 승급 6을 각각 120판 돌려 도달 스테이지를 비교한다.
  function playRun(seed, tenant, asc) {
    const run = new J.Run(rng(seed), M.runOptions(tenant, asc));
    let guard = 0;
    while (run.state === 'playing' && !run.won && guard++ < 400) {
      // 대기 중인 선택은 먼저 치운다 (실제 게임과 같은 순서)
      if (run.pendingRoutes) { run.chooseRoute(run.pendingRoutes[0].id); continue; }
      if (run.pendingRelics) { run.chooseRelic(run.pendingRelics[0].id); continue; }
      if (run.pendingRemoval) {
        const sock = run.deck.find((d) => d.id === 'sock');
        if (sock && run.deck.length > 10) run.removeCard(sock.uid); else run.declineRemoval();
        continue;
      }
      const r = run.spin();
      if (!r) break;
      if (run.won) break;
      if (run.state !== 'playing') break;
      // 드래프트 — 가장 단순한 그리디: 첫 후보를 집는다
      const offs = run.offers(r.settle && r.settle.bonus);
      if (offs && offs.length) run.pick(offs[0].id, offs[0].gold); else run.skip();
    }
    return { stage: run.won ? run.stage : Math.max(1, run.stage - (run.state === 'dead' ? 0 : 1)), won: run.won };
  }

  const avg = (asc) => {
    let total = 0, wins = 0;
    const N = 120;
    for (let i = 1; i <= N; i++) { const r = playRun(i * 31 + asc, 'laborer', asc); total += r.stage; if (r.won) wins++; }
    return { stage: total / N, winRate: wins / N };
  };
  const a0 = avg(0), a6 = avg(6);
  console.log(`    승급0 평균 스테이지 ${a0.stage.toFixed(2)} (승률 ${(a0.winRate * 100).toFixed(0)}%)`);
  console.log(`    승급6 평균 스테이지 ${a6.stage.toFixed(2)} (승률 ${(a6.winRate * 100).toFixed(0)}%)`);
  ok(a6.stage < a0.stage, '승급6이 승급0보다 실제로 덜 나아간다',
     `${a0.stage.toFixed(2)} → ${a6.stage.toFixed(2)}`);
  ok(a0.stage > 1, '승급0에서는 최소한 진행은 된다 (봇이 즉사하지 않는다)', a0.stage.toFixed(2));
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
