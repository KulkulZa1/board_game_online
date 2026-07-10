// 월세 잭팟 — 헤드리스 자동 플레이 밸런스 검증 v2
// 그리디 봇(EV 최대 픽 + 희석 관리 + 루트/유물/이벤트 대응)으로 승률을 측정한다.
// 목표: 그리디 봇 승률 20~45% (사람은 시너지 배치를 계획하므로 더 높다)
// 실행: node prototypes/jackpot-autoplay.js
'use strict';
const { Run, SYMBOLS, WIN_STAGE, CELLS } = require('../public/arcade/jackpot/sim.js');

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 그리디 픽: 희석(덱>12) 반영한 한계 EV가 스킵 보상보다 낮으면 스킵
function botPick(run, offers) {
  const deckN = run.deck.length;
  const dilution = Math.min(1, CELLS / (deckN + 1));
  let best = null, bestVal = run.skipReward() * 0.6;
  for (const o of offers) {
    const val = SYMBOLS[o.id].ev * dilution * (o.gold ? 2.5 : 1);   // 황금 = ×3 지급이므로 크게 선호
    if (val > bestVal) { bestVal = val; best = o; }
  }
  run.pick(best && best.id, best && best.gold);
}

// 📌 붙박이 전략 — 시너지 쌍을 인접 칸(5,6)에 고정
function botFixtures(run) {
  if (run.fixtures.length >= 2) return;
  const find = (id) => run.deck.find((d) => d.id === id && !run.isFixed(d.uid));
  const pairs = [['clover', 'slotm'], ['clover', 'lotto'], ['granny', 'gimbap'], ['chef', 'gimbap'], ['chef', 'ramen']];
  for (const [a, b] of pairs) {
    const A = find(a), B = find(b);
    if (A && B) { run.setFixture(A.uid, 5); run.setFixture(B.uid, 6); return; }
  }
}

// 분기·유물·이삿짐 대응
function botResolvePending(run) {
  if (run.pendingRoutes) {
    const ids = run.pendingRoutes.map((r) => r.id);
    // 가난하면 달동네(할인), 여유 있으면 유물 골목, 아니면 평범/첫 옵션
    let choice;
    if (run.coins < 45 && ids.includes('slum')) choice = 'slum';
    else if (ids.includes('relicAlley')) choice = 'relicAlley';
    else if (ids.includes('normal')) choice = 'normal';
    else choice = ids[0];
    run.chooseRoute(choice);
  }
  if (run.pendingRelics) {
    // 저주가 순한 유물 선호 순서
    const pref = ['mart', 'stock', 'catfeeder', 'cheese', 'dice', 'angel', 'basement', 'extend'];
    const ids = run.pendingRelics.map((r) => r.id);
    run.chooseRelic(pref.find((p) => ids.includes(p)) || ids[0]);
  }
  if (run.pendingRemoval) {
    const sock = run.deck.find((d) => d.id === 'sock');
    if (sock && run.deck.length > 10) run.removeCard(sock.uid);
    else run.declineRemoval();
  }
}

function play(seed, maxSpins) {
  const run = new Run(mulberry32(seed));
  let relicsTaken = 0, eventsSeen = 0;
  for (let i = 0; i < (maxSpins || 300); i++) {
    botResolvePending(run);
    const r = run.spin();
    if (!r) { botResolvePending(run); continue; }
    if (r.firedEvent) eventsSeen++;
    if (r.settle && r.settle.type === 'evicted') break;
    if (run.won) return { won: true, stage: WIN_STAGE, spins: run.spinNo, relics: run.relics.size + (run.angelUsed ? 1 : 0), eventsSeen };
    botResolvePending(run);
    if (run.state !== 'playing') break;
    botPick(run, run.offers(r.settle && r.settle.bonus));
    if (r.settle && r.settle.bonus) botPick(run, run.offers(true));
    botFixtures(run);
  }
  return {
    won: run.won,
    stage: run.state === 'dead' ? run.stage : run.stage - 1,
    spins: run.spinNo,
    relics: run.relics.size + (run.angelUsed ? 1 : 0),
    eventsSeen,
  };
}

const N = 400;
let wins = 0, stageSum = 0, relicSum = 0, eventSum = 0;
const stageDist = {};
for (let s = 1; s <= N; s++) {
  const r = play(s);
  if (r.won) wins++;
  const st = r.won ? WIN_STAGE : r.stage;
  stageSum += st;
  relicSum += r.relics;
  eventSum += r.eventsSeen;
  stageDist[st] = (stageDist[st] || 0) + 1;
}
console.log(`\n=== 월세 잭팟 밸런스 v2 (${N}판, 그리디 봇) ===`);
console.log(`승률(10단계 완납): ${(wins / N * 100).toFixed(1)}%`);
console.log(`평균 도달 단계: ${(stageSum / N).toFixed(2)} · 평균 유물 ${(relicSum / N).toFixed(2)}개 · 평균 이벤트 ${(eventSum / N).toFixed(1)}회`);
console.log('단계 분포:', Object.entries(stageDist).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
const ok = wins / N >= 0.15 && wins / N <= 0.55;
console.log(ok ? '✅ 목표 승률 범위(15~55%) 충족' : '❌ 승률 범위 밖 — 조정 필요');
process.exit(ok ? 0 : 1);
