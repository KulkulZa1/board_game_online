// NEON CASCADE 증폭기 검증 — 실행: node prototypes/neon-amp-test.js
// sim.js 는 브라우저 전역(window)에 붙으므로 vm 으로 로드한다.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public/arcade/neon-cascade/sim.js'), 'utf8');
const ctx = vm.createContext({ window: {}, Date });
vm.runInContext(src, ctx, { filename: 'sim.js' });
const S = ctx.window.NeonCascade;

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

// 결정적 rng
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const runFor = (state, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) S.step(state, dt); return state; };

console.log('\n[증폭기 기본]');
{
  ok(Array.isArray(S.AMPS) && S.AMPS.length >= 10, `증폭기 ${S.AMPS.length}종 정의`);
  ok(S.AMP_FUSIONS.length === 3, `융합 ${S.AMP_FUSIONS.length}종 정의`);

  const offers = S.ampOffers(rng(7), []);
  ok(offers.length === 3, '기본 선택지 3장');
  ok(new Set(offers.map((o) => o.id)).size === offers.length, '선택지 중복 없음');
  ok(S.ampOffers(rng(7), [], 4).length === 4, '선택지 수 조절 가능');

  const all = S.ampOffers(rng(3), ['overcharge'], 99);
  ok(!all.some((o) => o.id === 'overcharge'), '보유 증폭기는 선택지에서 제외');

  const a = S.ampOffers(rng(55), []).map((o) => o.id).join(',');
  const b = S.ampOffers(rng(55), []).map((o) => o.id).join(',');
  ok(a === b, '같은 시드는 같은 선택지 (결정적)');
}

console.log('\n[융합]');
{
  let owned = [];
  owned = S.grantAmp(owned, 'widepulse').owned;
  const res = S.grantAmp(owned, 'novacore');
  ok(res.fused && res.fused.id === 'shockwave', '넓은 파동 + 초신성 코어 → 충격파', res.fused ? res.fused.id : 'none');
  ok(res.owned.includes('shockwave'), '융합 결과가 보유 목록에 들어감');
  ok(!res.owned.includes('widepulse') && !res.owned.includes('novacore'), '재료는 소모됨');
  ok(S.ampStats(res.owned).pulseRadius > S.ampStats(['widepulse']).pulseRadius, '융합이 재료 하나보다 강함');

  let allOk = true;
  for (const f of S.AMP_FUSIONS) {
    let o = [], got = null;
    for (const src2 of f.from) { const r = S.grantAmp(o, src2); o = r.owned; got = r.fused || got; }
    if (!got || got.id !== f.id) { allOk = false; console.log('    문제 조합:', f.id); }
  }
  ok(allOk, '정의된 융합 3종 모두 성립');

  const hinted = S.ampOffers(rng(4), ['overcharge'], 99).find((o) => o.id === 'fastcharge');
  ok(hinted && hinted.fusesInto && hinted.fusesInto.id === 'perpetual', '융합 예고 표시');
  ok(S.grantAmp(['overcharge'], 'overcharge').owned.length === 1, '같은 증폭기를 두 번 얻지 않는다');
}

console.log('\n[실제 시뮬레이션에 반영되는가]');
{
  // 상한에 막혀 약속한 +2 가 조용히 깎이면 안 된다 (한 번 그랬다)
  ok(S.createState(1, ['overcharge']).charges === 5, '과충전 — 시작 충전이 실제로 +2', String(S.createState(1, ['overcharge']).charges));
  ok(S.createState(1, ['overcharge']).maxCharges === S.MAX_CHARGES + 1, '과충전은 충전 상한도 올린다');
  ok(S.createState(1, []).charges === 3, '기본 시작 충전 3');

  // 불안정 코어 — 충전 최대치가 실제로 줄어든다
  const unstable = S.createState(1, ['unstable']);
  ok(unstable.maxCharges === S.MAX_CHARGES - 1, '불안정 코어 — 충전 최대치 -1', String(unstable.maxCharges));
  ok(unstable.charges <= unstable.maxCharges, '시작 충전이 최대치를 넘지 않는다');

  // 압축 시간 — 라운드가 실제로 짧다
  ok(S.createState(1, ['compressed']).time === S.ROUND_SECONDS - 6, '압축 시간 — 라운드 6초 단축');
  ok(S.createState(1, []).time === S.ROUND_SECONDS, '기본 라운드 길이 유지');

  // 안전장치: 라운드가 사라지거나 충전이 0이 되면 안 된다
  const worst = S.createState(1, ['collapse']);
  ok(worst.time >= 15 && worst.maxCharges >= 1, '최악 조합에서도 플레이 가능한 하한 유지',
     `time=${worst.time} maxCharges=${worst.maxCharges}`);

  // 재충전 속도
  const fast = S.createState(2, ['fastcharge']);
  const slow = S.createState(2, []);
  fast.charges = 0; slow.charges = 0;
  runFor(fast, 5); runFor(slow, 5);
  ok(fast.charges >= slow.charges, '빠른 재충전이 더 빨리 찬다', `${slow.charges} → ${fast.charges}`);

  // 점수 배율이 실제 플레이 점수에 반영된다 (같은 시드/같은 입력)
  const playFor = (amps) => {
    const st = S.createState(4242, amps);
    for (let i = 0; i < 6; i++) { S.pulse(st, 300 + i * 20, 400 + i * 30); runFor(st, 1.2); }
    return st.score;
  };
  const plain = playFor([]);
  const boosted = playFor(['unstable']);
  ok(boosted > plain, '불안정 코어는 실제 점수를 올린다', `${plain} → ${boosted}`);
}

console.log('\n[기존 동작 보존]');
{
  // 증폭기를 넘기지 않아도 예전과 똑같이 동작해야 한다
  const st = S.createState(9);
  ok(st.time === S.ROUND_SECONDS && st.charges === 3 && st.wave === 1, '증폭기 없이 만든 상태는 기존과 동일');
  ok(S.pulse(st, 300, 400) === true, '펄스 정상 동작');
  runFor(st, 3);
  ok(st.elapsed > 0, 'step 정상 진행');
  const ended = S.createState(9);
  runFor(ended, S.ROUND_SECONDS + 2);
  ok(ended.ended === true, '라운드 시간이 끝나면 종료된다');
  ok(S.pulse(ended, 300, 400) === false, '종료 후에는 펄스가 먹지 않는다');
}

console.log('\n[밸런스 시뮬레이션]');
{
  const builds = new Map();
  let fusedRuns = 0, cursedPicks = 0, totalPicks = 0;
  const RUNS = 200, PICKS = 4;   // 게임의 MAX_AMPS 와 같은 상한 (라운드마다 1장씩)
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = rng(seed * 7717);
    let owned = [];
    for (let i = 0; i < PICKS; i++) {
      const offers = S.ampOffers(r, owned);
      if (!offers.length) break;
      const pick = offers[Math.floor(r() * offers.length)];
      if (pick.kind === 'cursed') cursedPicks++;
      totalPicks++;
      const res = S.grantAmp(owned, pick.id);
      owned = res.owned;
      if (res.fused) fusedRuns++;
    }
    builds.set(owned.slice().sort().join('+'), true);
  }
  console.log(`    고유 빌드 ${builds.size}/${RUNS}, 융합 발생 ${(fusedRuns / RUNS * 100).toFixed(0)}%, 저주 선택 ${(cursedPicks / totalPicks * 100).toFixed(0)}%`);
  ok(builds.size > RUNS * 0.3, '빌드가 갈라진다', `${builds.size}/${RUNS}`);
  ok(cursedPicks / totalPicks > 0.02 && cursedPicks / totalPicks < 0.35, '저주는 섞이되 흔하지 않다');
  ok(fusedRuns / RUNS < 0.7, '상한(4장) 안에서 융합이 남발되지 않는다', (fusedRuns / RUNS * 100).toFixed(0) + '%');
}

console.log('\n[시간 경제 — 라운드는 끝나야 한다]');
{
  // 웨이브 클리어 +6초 고정이던 시절, 숙련 플레이는 시간 수입이 소모를 앞질러
  // 한 라운드가 영원히 끝나지 않았다 (실측 200초+, 930만 점). 보너스는 말라야 한다.
  const st = S.createState(1, []);
  const bonusAt = (w) => { const s2 = S.createState(1, []); s2.wave = w; s2.time = 10;
    s2.waveHits = 99; s2.target = 1; s2.pendingWave = true; s2.orbs = []; s2.explosions = [];
    S.step(s2, 0.001); return s2.time - 10; };
  const early = bonusAt(1), late = bonusAt(10);
  ok(early > late, '웨이브 시간 보너스는 후반으로 갈수록 준다', `w1 +${early.toFixed(1)} vs w10 +${late.toFixed(1)}`);
  ok(late <= 2.05, '후반 웨이브 보너스는 +2초 이하로 마른다', `+${late.toFixed(1)}`);
  ok(early <= 8, '초반 보너스도 상한이 있다');

  // 피버는 시간을 주지 않는다 — 3배 점수·광역 반경이 보상. 시간까지 주면
  // (웨이브당 수 회 발동) 어떤 감쇠로도 라운드가 끝나지 않았다 (실측 300초+).
  const f = S.createState(1, []);
  f.time = 20; f.overdrive = 99; f.charges = 1;
  f.orbs = [{ id: 'o', type: 'core', x: 200, y: 300, vx: 0, vy: 0, radius: 13, dead: false, phase: 0 }];
  f.explosions = [];
  S.pulse(f, 200, 300);
  for (let i = 0; i < 20 && f.fever <= 0; i++) S.step(f, 0.05);
  ok(f.fever > 0, '오버드라이브가 차면 오브 격발로 피버 발동');
  ok(f.time <= 20.01, '피버 발동이 시간을 주지 않는다', `time=${f.time.toFixed(2)}`);
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
