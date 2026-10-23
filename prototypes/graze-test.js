// 스침 (GRAZE) 규칙·공정성 검사 — 실행: node prototypes/graze-test.js
// '피하지 말고 스쳐라' 가 말뿐이 아니게, 그리고 '어렵지만 억울하지 않게' — 봇으로 잰다:
//   · 보이지 않는 안전 통로를 따라가는 봇은 절대 죽지 않는다 (길은 언제나 있다)
//   · 어떤 위험물도 그 통로에 들어오지 않는다 — 생성된 모든 블록·벽·레이저를 직접 검사한다
//   · 생긴 것만 보고, 본 지 0.22초가 지나야 반응하는 '사람 같은' 봇도 오래 버틴다
//   · 가만히 있기·벽에 붙기·아무렇게나 움직이기는 금방 죽는다
//   · 스치는 봇은 안전한 봇보다 훨씬 많은 점수를 벌지만 더 자주 죽는다 (욕심의 값)
'use strict';

const S = require('../public/arcade/graze/sim.js');
const { C } = S;

let passed = 0, failed = 0;
function ok(cond, label, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${label}`); }
  else      { failed++; console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}

const DT = 1 / 120;
// 한 판 — 생성된 위험물을 순서대로 모아 둔다 (코스 비교·속성 검사용)
function run(seed, bot, maxT, dt = DT, onStep) {
  const s = S.createState(seed);
  const spawned = [];
  let seen = 0;
  const events = [];
  while (s.alive && s.t < maxT) {
    for (const e of S.step(s, dt, bot(s))) events.push(e);
    for (const hz of s.hazards) if (hz.id > seen) { spawned.push({ ...hz }); seen = hz.id; }
    if (onStep) onStep(s);
  }
  return { s, spawned, events };
}
const follower = () => (s) => ({ targetX: S.corridorAt(s, s.t + DT) });
const still = () => () => ({});
const edge = (x) => () => ({ targetX: x });
function wander(seed) {
  const r = S.rng(seed); let next = 0, tx = C.W / 2;
  return (s) => { if (s.real >= next) { next = s.real + 0.2 + r() * 0.6; tx = r() * C.W; } return { targetX: tx }; };
}

// 보이는 것만으로 계획하는 봇. 움직임은 완벽하지만, 생긴 지 lag 초가 안 된 위험물은 아직 못 본 것으로 친다.
//   mode 'safe'   — 앞으로 0.9초 동안 가장 넓은 여유를 남기는 곳으로
//   mode 'greedy' — 여유 margin 을 지키는 곳들 중 가장 많이 스치는 곳으로
function planner(mode, lag, margin) {
  const H = 0.9, N = 54;
  let nextAt = 0, target = C.W / 2;
  const blockedAt = (s, t) => {
    const iv = [];
    for (const hz of s.hazards) {
      if (s.t - hz.ts < lag) continue;
      if (hz.kind === 'beam') {
        if (t >= hz.fireAt - 0.02 && t <= hz.endAt + 0.02) iv.push([hz.x - C.PR, hz.x + hz.w + C.PR]);
      } else {
        const top = S.blockTop(hz, t);
        if (top + hz.h > C.FALL - C.PR && top < C.FALL + C.PR) iv.push([hz.x - C.PR, hz.x + hz.w + C.PR]);
      }
    }
    return iv;
  };
  return function (s) {
    if (s.real < nextAt) return { targetX: target };
    nextAt = s.real + 1 / 20;
    const vw = C.V_MAX / (s.overdrive > 0 ? C.OD_SCALE : 1);
    const samples = [];
    for (let j = 1; j <= N; j++) samples.push({ tau: (j / N) * H, iv: blockedAt(s, s.t + (j / N) * H) });
    let bestKey = -Infinity;
    for (let cand = C.PR; cand <= C.W - C.PR + 1e-9; cand += 0.5) {
      let survive = 0, minClear = Infinity, grazeSum = 0;
      for (const sm of samples) {
        const d = cand - s.px;
        const px = s.px + Math.sign(d) * Math.min(Math.abs(d), vw * sm.tau);
        let hit = false, clear = Infinity;
        for (const [a, b] of sm.iv) {
          if (px > a && px < b) { hit = true; break; }
          clear = Math.min(clear, px <= a ? a - px : px - b);
        }
        if (hit) break;
        survive++;
        minClear = Math.min(minClear, clear);
        if (clear < C.GRAZE_R) { const k = 1 - clear / C.GRAZE_R; grazeSum += k * k; }
      }
      let key;
      if (survive < samples.length) key = survive * 100 - 1e6;
      else if (mode === 'safe') key = Math.min(minClear, 8) * 10 - Math.abs(cand - C.W / 2) * 0.05;
      else key = minClear >= margin ? 1000 + grazeSum - Math.abs(cand - s.px) * 0.01 : Math.min(minClear, 8) * 10;
      if (key > bestKey) { bestKey = key; target = cand; }
    }
    return { targetX: target };
  };
}
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const courseKey = (spawned) => spawned.map((h) => `${h.kind}:${h.x.toFixed(9)}:${h.w.toFixed(9)}:${h.ts.toFixed(9)}`).join('|');

console.log('\n[기본 규칙]');
{
  const s = S.createState(1);
  ok(s.px === C.W / 2 && s.alive && s.score === 0 && s.hazards.length === 0, '가운데에서 시작한다');
  S.step(s, 0.1, { dir: 1 });
  ok(Math.abs(s.px - (C.W / 2 + C.V_MAX * 0.1)) < 1e-9, `키보드: 최고 속도 ${C.V_MAX}u/s 로 움직인다`);
  const f = S.createState(1); S.step(f, 0.1, { dir: -1, focus: true });
  ok(Math.abs(f.px - (C.W / 2 - C.V_MAX * C.FOCUS * 0.1)) < 1e-9, '정밀 이동(Shift)은 느리다');
  const e = S.createState(1); for (let i = 0; i < 20; i++) S.step(e, 0.1, { dir: -1 });
  ok(e.px === C.PR, '벽 밖으로 나가지 않는다');
  const g = S.createState(1); S.step(g, 0.1, { targetX: C.W / 2 + 3 });
  ok(Math.abs(g.px - (C.W / 2 + 3)) < 1e-9, '포인터: 목표에 닿으면 멈춘다 (넘어가지 않는다)');
  const h = S.createState(1); S.step(h, 0.1, { targetX: 0 });
  ok(Math.abs(h.px - (C.W / 2 - C.V_MAX * 0.1)) < 1e-9, '포인터: 멀리 있어도 최고 속도 이상으로는 못 간다');
  const q = S.createState(1);
  while (q.t < C.START_GRACE - 0.02) S.step(q, DT, {});
  const before = q.hazards.length;
  S.step(q, 0.05, {});
  ok(before === 0 && q.hazards.length > 0, `처음 ${C.START_GRACE}초는 비어 있고 그다음 첫 줄이 생긴다`);

  const a = run(5, follower(), 40), b = run(5, follower(), 40);
  ok(a.s.score === b.s.score && courseKey(a.spawned) === courseKey(b.spawned), '같은 시드 = 같은 판');
  const c60 = run(5, follower(), 40, 1 / 60), c144 = run(5, follower(), 40, 1 / 144);
  ok(courseKey(c60.spawned) === courseKey(c144.spawned), '코스는 프레임 속도와 무관하다 (60Hz·144Hz 가 같은 위험물을 같은 때 만든다)');
  const peek = run(5, follower(), 40, DT, (s) => S.corridorAt(s, s.t + 50));
  ok(courseKey(peek.spawned) === courseKey(a.spawned), '안전 통로를 미리 물어봐도 위험물 순서가 바뀌지 않는다 (따로 쓰는 난수)');
}

console.log('\n[공정성 — 길은 언제나 있다]');
const followRuns = [];
{
  for (let seed = 1; seed <= 20; seed++) followRuns.push(run(seed, follower(), 150));
  const deaths = followRuns.filter((r) => !r.s.alive).length;
  const ods = followRuns.reduce((n, r) => n + r.s.stats.overdrives, 0);
  ok(deaths === 0, '안전 통로를 따라가는 봇은 20판 × 150초 동안 한 번도 죽지 않는다', `deaths ${deaths}`);
  ok(ods > 0, `그동안 OVERDRIVE(슬로모션)도 일어난다 — 슬로모션이 통로를 깨지 않는다 (${ods}회)`);

  // 생성된 모든 위험물을 직접 검사: 플레이어 띠를 지나는 동안 통로(폭 corridorWidth(t))와 겹치지 않는다
  let checked = 0, intrusions = 0, worst = '';
  for (const r of followRuns) {
    const probe = S.createState(r.s.seed);   // 같은 시드의 통로 (통로는 따로 쓰는 난수라 위험물과 무관하게 같다)
    for (const hz of r.spawned) {
      let a, b;
      if (hz.kind === 'beam') { a = hz.fireAt; b = hz.endAt; }
      else { a = hz.ts + (C.FALL - C.PR) / hz.v; b = hz.ts + (C.FALL + C.PR + hz.h) / hz.v; }
      checked++;
      for (let t = a; t <= b; t += 0.005) {
        const c = S.corridorAt(probe, t), half = S.corridorWidth(t) / 2;
        if (hz.x < c + half && hz.x + hz.w > c - half) { intrusions++; worst = `${hz.kind} t=${t.toFixed(2)} x=${hz.x.toFixed(2)}..${(hz.x + hz.w).toFixed(2)} corridor ${(c - half).toFixed(2)}..${(c + half).toFixed(2)}`; break; }
      }
    }
  }
  ok(checked > 5000 && intrusions === 0, `위험물 ${checked}개 중 어느 것도 지나는 동안 안전 통로에 들어오지 않는다`, worst);

  const p = S.createState(3); S.corridorAt(p, 400);
  let maxSlope = 0, inBounds = true;
  for (let i = 1; i < p.knots.length; i++) {
    maxSlope = Math.max(maxSlope, Math.abs(p.knots[i] - p.knots[i - 1]) / C.CORR_KNOT);
    const half = S.corridorWidth(i * C.CORR_KNOT) / 2;
    if (p.knots[i] < half || p.knots[i] > C.W - half) inBounds = false;
  }
  // 약속은 상수가 아니라 숫자로 고정한다 — 상수와 비교하면 상수를 바꿔도 검사가 따라 바뀐다
  ok(maxSlope <= C.V_MAX * 0.5 && maxSlope > C.V_MAX * 0.2,
    `통로는 플레이어 최고 속도의 절반 이하로만 움직인다 — 그래도 가만히 있을 수는 없을 만큼 움직인다 (최대 ${maxSlope.toFixed(1)}u/s, 내 속도 ${C.V_MAX})`);
  ok(inBounds, '통로는 화면 안에 있다');
  ok(S.corridorWidth(1e6) / 2 >= C.PR + 1, '가장 좁은 통로도 판정보다 양쪽 1u 이상 넓다');

  const beams = followRuns.flatMap((r) => r.spawned.filter((h) => h.kind === 'beam'));
  const blocks = followRuns.flatMap((r) => r.spawned.filter((h) => h.kind !== 'beam'));
  ok((C.FALL - C.PR) / S.fallSpeed(1e6) >= 0.6 && blocks.every((h) => (C.FALL - C.PR) / h.v >= 0.6),
    `모든 블록은 닿기 0.6초 전부터 보인다 (가장 빠를 때 ${((C.FALL - C.PR) / S.fallSpeed(1e6)).toFixed(2)}초)`);
  ok(beams.length > 50 && beams.every((h) => h.fireAt - h.ts >= 0.6 - 1e-9), `모든 레이저는 켜지기 0.6초 전에 경고한다 (${beams.length}개)`);
}

console.log('\n[사람처럼 — 보이는 것만 보고 0.22초 늦게 반응해도]');
const safeRuns = [], greedyRuns = [];
{
  for (let seed = 1; seed <= 6; seed++) safeRuns.push(run(seed, planner('safe', 0.22), 60).s);
  const lives = safeRuns.map((s) => s.t);
  ok(safeRuns.filter((s) => s.alive).length >= 5 && Math.min(...lives) >= 30,
    `조심스러운 봇은 6판 중 5판 이상 60초를 버틴다 (${lives.map((t) => t.toFixed(0)).join(', ')}초)`);
}

console.log('\n[운·게으름으로는 안 된다]');
{
  const lifeOf = (mk) => Array.from({ length: 20 }, (_, i) => run(1 + i, mk(1 + i), 120).s.t);
  const stillL = lifeOf(still), leftL = lifeOf(() => edge(0)), rightL = lifeOf(() => edge(C.W)), wanderL = lifeOf(wander);
  // 처음 몇 초는 일부러 한산하다 (안전 통로도 가운데에서 출발) — 그래서 운 좋은 판은 가만히 있어도 15초쯤 간다
  ok(median(stillL) < 8 && Math.max(...stillL) < 20, `가만히 있으면 금방 죽는다 (중앙값 ${median(stillL).toFixed(1)}초, 최장 ${Math.max(...stillL).toFixed(1)}초)`);
  ok(Math.max(...leftL) < 40 && Math.max(...rightL) < 40, `벽에 붙어 있어도 숨을 곳은 없다 (최장 ${Math.max(...leftL, ...rightL).toFixed(1)}초)`);
  ok(median(wanderL) < 10, `아무렇게나 움직이면 금방 죽는다 (중앙값 ${median(wanderL).toFixed(1)}초)`);
}

console.log('\n[위험과 보상 — 스칠수록 번다]');
{
  for (let seed = 1; seed <= 6; seed++) greedyRuns.push(run(seed, planner('greedy', 0.22, 0.6), 60).s);
  const rate = (s) => s.score / s.t;
  const g = median(greedyRuns.map(rate)), sf = median(safeRuns.map(rate));
  ok(g >= sf * 5, `스치는 봇은 안전한 봇보다 초당 5배 이상 번다 (${g.toFixed(0)} vs ${sf.toFixed(0)} 점/초)`);
  const gDeaths = greedyRuns.filter((s) => !s.alive).length, sDeaths = safeRuns.filter((s) => !s.alive).length;
  ok(gDeaths >= 2 && gDeaths > sDeaths, `대신 더 자주 죽는다 — 욕심의 값 (60초 안에 ${gDeaths}/6 vs ${sDeaths}/6)`);
  ok(Math.max(...greedyRuns.map((s) => s.stats.maxMult)) > 5, '스치기로 배율이 ×5 를 넘는다');

  // 손으로 만든 장면: 플레이어 옆에서 켜진 레이저
  const s = S.createState(1);
  s.nextRowAt = Infinity;
  const px = s.px;
  s.hazards.push({ id: 999, kind: 'beam', x: px + C.PR + 0.5, w: 3, ts: 0, fireAt: 0, endAt: 1 });
  const ev = S.step(s, DT, {});
  const types = ev.map((e) => e.type);
  ok(types.includes('graze') && types.includes('perfect') && Math.abs(s.mult - (1 + C.MULT_GRAZE + C.MULT_PERFECT)) < 1e-9,
    `${C.PERFECT_R}u 안으로 스치면 PERFECT — 배율 +${C.MULT_GRAZE + C.MULT_PERFECT}`, JSON.stringify(types));
  ok(s.score > C.PERFECT_BONUS, 'PERFECT 보너스가 들어온다');
  const before = S.step(s, DT, {}).length;
  ok(before === 0, '같은 위험물은 스침·PERFECT 를 한 번씩만 센다 (점수는 계속 쌓인다)');

  const far = S.createState(1); far.nextRowAt = Infinity;
  far.hazards.push({ id: 1, kind: 'beam', x: far.px + C.PR + 3, w: 3, ts: 0, fireAt: 0, endAt: 1 });
  const fe = S.step(far, DT, {}).map((e) => e.type);
  ok(fe.includes('graze') && !fe.includes('perfect'), '3u 떨어져 지나가면 스침이지만 PERFECT 는 아니다');

  const warn = S.createState(1); warn.nextRowAt = Infinity;
  warn.hazards.push({ id: 1, kind: 'beam', x: warn.px - 1, w: 2, ts: 0, fireAt: 5, endAt: 6 });
  S.step(warn, DT, {});
  ok(warn.alive, '경고 중인 레이저는 아직 아프지 않다');
  const fire = S.createState(1); fire.nextRowAt = Infinity;
  fire.hazards.push({ id: 1, kind: 'beam', x: fire.px - 1, w: 2, ts: 0, fireAt: 0, endAt: 1 });
  const de = S.step(fire, DT, {});
  ok(!fire.alive && de[0].type === 'death' && de[0].cause === 'beam', '켜진 레이저에 닿으면 끝');

  const fall = S.createState(1); fall.nextRowAt = Infinity;
  fall.hazards.push({ id: 1, kind: 'block', x: fall.px - 2, w: 4, h: 4, ts: 0, v: 60 });
  let death = null;
  for (let i = 0; i < 500 && !death; i++) death = S.step(fall, DT, {}).find((e) => e.type === 'death') || null;
  ok(death && death.cause === 'block' && death.depth > 0 && death.depth < C.PR, '떨어지는 블록에 닿으면 끝 — 얼마나 깊이 닿았는지도 알려 준다');

  const d = S.createState(1); d.nextRowAt = Infinity; d.mult = 5; d.lastGrazeAt = 0;
  for (let i = 0; i < 120 * C.MULT_HOLD * 0.9; i++) S.step(d, DT, {});
  const held = d.mult;
  for (let i = 0; i < 120 * 2; i++) S.step(d, DT, {});
  ok(held === 5 && d.mult < 5 && d.mult >= 1, `${C.MULT_HOLD}초 동안은 배율이 버티다가, 안 스치면 새어 나간다 (5 → ${d.mult.toFixed(2)})`);
  for (let i = 0; i < 120 * 10; i++) S.step(d, DT, {});
  ok(d.mult === 1, '배율은 1 아래로는 안 내려간다');
}

console.log('\n[OVERDRIVE]');
{
  const s = S.createState(1); s.nextRowAt = Infinity; s.meter = 100;
  const ev = S.step(s, DT, {});
  ok(ev.some((e) => e.type === 'overdrive') && s.overdrive === C.OD_TIME && s.meter === 0, '게이지가 차면 OVERDRIVE');
  const t0 = s.t, x0 = s.px, sc0 = s.score;
  for (let i = 0; i < 120; i++) S.step(s, DT, { dir: 1 });
  ok(s.t - t0 <= 0.7 && Math.abs(s.t - t0 - C.OD_SCALE) < 1e-6, `세상이 확실히 느려진다 (실시간 1초 → 세계 ${(s.t - t0).toFixed(3)}초)`);
  ok(Math.abs(s.px - Math.min(C.W - C.PR, x0 + C.V_MAX)) < 1e-6, '내 움직임은 그대로다');
  ok(Math.abs(s.score - sc0 - C.SURVIVE_PPS * C.OD_SCALE * 2) < 1e-6, '점수는 2배');
  let ended = false;
  for (let i = 0; i < 120 * C.OD_TIME && !ended; i++) ended = S.step(s, DT, {}).some((e) => e.type === 'overdrive-end');
  ok(ended && s.overdrive === 0, `${C.OD_TIME}초 뒤에 끝난다`);
  s.meter = 0; s.overdrive = 1;
  s.hazards.push({ id: 7, kind: 'beam', x: s.px + C.PR + 0.3, w: 2, ts: 0, fireAt: 0, endAt: 99 });
  S.step(s, DT, {});
  ok(s.meter === 0, 'OVERDRIVE 동안은 게이지가 차지 않는다 (연달아 발동 금지)');
}

console.log('\n[난이도 곡선]');
{
  const ts = Array.from({ length: 400 }, (_, i) => i);
  const mono = (f, dir) => ts.every((t, i) => i === 0 || (dir > 0 ? f(t) >= f(ts[i - 1]) : f(t) <= f(ts[i - 1])));
  ok(mono(S.fallSpeed, 1) && S.fallSpeed(1e6) === C.FALL_VMAX, '낙하 속도는 오르기만 하고 상한이 있다');
  ok(mono(S.rowInterval, -1) && S.rowInterval(1e6) === C.ROW_IMIN, '줄 간격은 줄기만 하고 하한이 있다');
  ok(mono(S.corridorWidth, -1) && S.corridorWidth(1e6) === C.CORR_WMIN, '안전 통로는 좁아지기만 하고 하한이 있다');
  const all = followRuns.flatMap((r) => r.spawned);
  const firstWall = Math.min(...all.filter((h) => h.kind === 'wall').map((h) => h.ts));
  const firstBeam = Math.min(...all.filter((h) => h.kind === 'beam').map((h) => h.ts));
  ok(firstWall >= C.WALL_FROM && firstWall < C.WALL_FROM + 15, `벽은 ${C.WALL_FROM}초부터 (처음 ${firstWall.toFixed(1)}초)`);
  ok(firstBeam >= C.BEAM_FROM && firstBeam < C.BEAM_FROM + 15, `레이저는 ${C.BEAM_FROM}초부터 (처음 ${firstBeam.toFixed(1)}초)`);
}

console.log(`\n결과: ${passed}/${passed + failed} 통과`);
process.exit(failed ? 1 : 0);
