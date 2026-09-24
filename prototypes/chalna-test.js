// 찰나 (CHALNA) 규칙·공정성 검사 — 실행: node prototypes/chalna-test.js
// '쉽게 배우고 어렵게 마스터' 가 말로만 남지 않게, 봇으로 잰다:
//   · 과녁 한가운데를 정확히 누르는 봇은 죽지 않는다 (게임이 불가능해지지 않는다)
//   · 60Hz 로 보고 누르는 봇도 살아남는다 (사람 반응 해상도에서도 공정하다)
//   · 아무 때나 누르는 봇은 금방 죽는다 (운으로는 안 된다)
//   · 새 과녁·폭탄은 반응할 시간이 있는 곳에만 생긴다
'use strict';

const S = require('../public/arcade/chalna/sim.js');
const { C } = S;

let passed = 0, failed = 0;
function ok(cond, label, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${label}`); }
  else      { failed++; console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}

// 과녁 한가운데까지 정확히 가서 누른다
function exactHit(s) {
  const dist = S.aheadOf(s, s.target.center);
  const ev = S.step(s, dist / s.speed);
  if (ev) return ev;
  return S.tap(s);
}

// 한 프레임씩 보다가, 이번 프레임이 과녁 한가운데에 가장 가까우면 누른다 (60Hz 사람 흉내)
function frameBot(s, hz) {
  const dt = 1 / hz;
  for (let i = 0; i < 100000; i++) {
    const rel = S.relTo(s, s.target);
    const nextRel = rel + s.speed * dt;
    if (rel >= -s.target.width / 2 && Math.abs(rel) <= Math.abs(nextRel)) return S.tap(s);
    const ev = S.step(s, dt);
    if (ev) return ev;
  }
  return null;
}

console.log('\n[기본 규칙]');
{
  const s = S.createState(1);
  ok(S.tap(s).type === 'start', '첫 누름은 시작 — 그 전엔 점이 멈춰 있다');
  ok(S.step(S.createState(2), 5) === null, '시작 전에는 시간이 흘러도 죽지 않는다');

  const a = S.createState(3); S.tap(a);
  const ev = exactHit(a);
  ok(ev.type === 'hit' && ev.perfect, '한가운데를 누르면 PERFECT', JSON.stringify(ev));
  ok(a.dir === -1, '맞히면 방향이 바뀐다');
  ok(a.speed > C.START_SPEED && a.width < C.START_WIDTH, '맞히면 빨라지고 과녁이 좁아진다');

  const b = S.createState(4); S.tap(b);
  const edge = S.aheadOf(b, b.target.center) - b.target.width / 2 + 0.01;   // 앞가장자리 바로 안
  S.step(b, edge / b.speed);
  const e2 = S.tap(b);
  ok(e2.type === 'hit' && !e2.perfect, '가장자리는 맞지만 PERFECT 는 아니다');

  const c = S.createState(5); S.tap(c);
  const e3 = S.tap(c);   // 과녁 한참 앞
  ok(e3.type === 'death' && e3.reason === 'miss' && e3.gap > 0, '호 밖에서 누르면 빗나감 — 몇 초 차이였는지 알려 준다', JSON.stringify(e3));

  const d = S.createState(6); S.tap(d);
  let death = null;
  for (let i = 0; i < 2000 && !death; i++) death = S.step(d, 1 / 120);
  ok(death && death.reason === 'passed', '과녁을 그냥 지나치면 놓침');

  const x = S.createState(7), y = S.createState(7);
  S.tap(x); S.tap(y);
  for (let i = 0; i < 30; i++) { exactHit(x); exactHit(y); }
  ok(x.score === y.score && x.angle === y.angle && x.target.center === y.target.center, '같은 시드면 같은 판이다');
}

console.log('\n[공정성]');
{
  let worstReaction = Infinity, bombOverlap = 0, bombOnDot = 0, bombs = 0, maxLevel = 0, deaths = 0;
  let sawChain = false, chainKeptDir = true, sawGold = false, fevers = 0, allPerfect = true;
  for (let seed = 1; seed <= 25; seed++) {
    const s = S.createState(seed); S.tap(s);
    for (let i = 0; i < 400; i++) {
      // 생긴 직후 검사
      const lead = S.aheadOf(s, s.target.center) - s.target.width / 2;
      worstReaction = Math.min(worstReaction, lead / s.speed);
      for (const b of s.bombs) {
        bombs++;
        if (Math.abs(S.wrap(b.center - s.target.center)) < (b.width + s.target.width) / 2) bombOverlap++;
        if (Math.abs(S.relTo(s, b)) <= b.width / 2) bombOnDot++;
      }
      const kind = s.target.kind, dirBefore = s.dir;
      const ev = exactHit(s);
      if (ev.type !== 'hit') { deaths++; break; }
      if (!ev.perfect) allPerfect = false;
      if (kind === 'chain') { sawChain = true; if (s.dir !== dirBefore) chainKeptDir = false; }
      if (kind === 'gold') sawGold = true;
      if (ev.feverStarted) fevers++;
    }
    maxLevel = Math.max(maxLevel, s.level);
  }
  ok(deaths === 0, '한가운데를 누르는 봇은 25판 × 400번 동안 한 번도 죽지 않는다', `deaths ${deaths}`);
  ok(allPerfect, '정확한 한가운데는 언제나 PERFECT 다 (속도가 최고일 때도)');
  ok(worstReaction >= C.MIN_REACTION - 1e-9, `새 과녁 앞가장자리까지 최소 ${C.MIN_REACTION}s 가 남는다`, `${worstReaction.toFixed(3)}s`);
  ok(bombs > 100 && bombOverlap === 0, `폭탄은 과녁과 겹치지 않는다 (${bombs}개 검사)`, `겹침 ${bombOverlap}`);
  ok(bombOnDot === 0, '폭탄은 생길 때 점 위에 있지 않다');
  ok(sawChain && chainKeptDir, '연쇄 호는 방향을 바꾸지 않는다');
  ok(sawGold, '황금 호가 나온다');
  ok(fevers > 0, 'PERFECT 5연속이면 FEVER');
}

console.log('\n[사람 해상도 — 60Hz]');
{
  // 60Hz 로 보고 '가장 가까운 프레임'에 누르는 봇. 최고 속도에서도 과녁이 두 프레임 이상 걸쳐야 공정하다.
  ok(C.MIN_WIDTH / (C.MAX_SPEED / 60) >= 2, '가장 좁은 과녁도 최고 속도에서 60Hz 두 프레임 이상 걸친다',
    `${(C.MIN_WIDTH / (C.MAX_SPEED / 60)).toFixed(2)} frames`);
  let min = Infinity, perfectRate = 0, n = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = S.createState(seed); S.tap(s);
    let i = 0;
    for (; i < 300; i++) {
      const ev = frameBot(s, 60);
      if (!ev || ev.type !== 'hit') break;
      n++; if (ev.perfect) perfectRate++;
    }
    min = Math.min(min, i);
  }
  ok(min >= 300, '60Hz 로 반응하는 봇은 20판 모두 300번을 넘긴다', `min ${min}`);
  const rate = perfectRate / n;
  ok(rate > 0.3 && rate < 0.95, `60Hz 봇의 PERFECT 비율은 높지만 완벽하지 않다 — 마스터할 여지 (${(rate * 100).toFixed(0)}%)`);
}

console.log('\n[운으로는 안 된다]');
{
  const rand = S.rng(99);
  const lives = [];
  for (let g = 0; g < 200; g++) {
    const s = S.createState(1000 + g); S.tap(s);
    let hits = 0;
    for (let k = 0; k < 10000 && s.alive; k++) {
      // 0~1.2초 뒤 아무 때나 누른다
      const ev = S.step(s, rand() * 1.2);
      if (ev) break;
      const t = S.tap(s);
      if (t && t.type === 'hit') hits++;
    }
    lives.push(hits);
  }
  lives.sort((a, b) => a - b);
  ok(lives[100] <= 2, `아무 때나 누르면 금방 죽는다 (중앙값 ${lives[100]}번)`);
  ok(lives[199] < 25, `운이 아주 좋아도 25번을 못 넘긴다 (최고 ${lives[199]}번)`);
}

console.log('\n[난이도 곡선]');
{
  const s = S.createState(11); S.tap(s);
  const speeds = [], widths = [];
  let bombAt = null, chainAt = null;
  for (let i = 0; i < 200; i++) {
    if (bombAt === null && s.bombs.length) bombAt = s.level;
    if (chainAt === null && s.target.kind === 'chain') chainAt = s.level;
    speeds.push(s.speed); widths.push(s.width);
    exactHit(s);
  }
  ok(speeds.every((v, i) => i === 0 || v >= speeds[i - 1]) && Math.max(...speeds) <= C.MAX_SPEED, '속도는 오르기만 하고 상한이 있다');
  ok(widths.every((v, i) => i === 0 || v <= widths[i - 1]) && Math.min(...widths) >= C.MIN_WIDTH, '과녁은 좁아지기만 하고 하한이 있다');
  ok(bombAt !== null && bombAt >= C.BOMB_FROM, `폭탄은 ${C.BOMB_FROM}번째부터 (처음 ${bombAt})`);
  ok(chainAt !== null && chainAt >= C.CHAIN_FROM, `연쇄 호는 ${C.CHAIN_FROM}번째부터 (처음 ${chainAt})`);
  // 점수: PERFECT·콤보·FEVER 가 실제로 차이를 만든다
  const center = S.createState(12); S.tap(center);
  const early = S.createState(12); S.tap(early);
  for (let i = 0; i < 60; i++) {
    exactHit(center);
    const lead = S.aheadOf(early, early.target.center) - early.target.width * 0.45;
    S.step(early, lead / early.speed); S.tap(early);
  }
  ok(early.alive && early.stats.perfects === 0, '가장자리만 노리는 봇도 살 수는 있지만 PERFECT 는 없다');
  ok(center.score > early.score * 3, `한가운데 봇 점수가 가장자리 봇의 3배를 넘는다 (${center.score} vs ${early.score})`);
}

console.log(`\n결과: ${passed}/${passed + failed} 통과`);
process.exit(failed ? 1 : 0);
