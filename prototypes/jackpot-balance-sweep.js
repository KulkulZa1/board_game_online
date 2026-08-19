// 월세 잭팟 — 승급/세입자 밸런스 쓸기 (밸런스 조정용 도구, npm 스크립트에는 없음)
// 실행: node prototypes/jackpot-balance-sweep.js [판수]
// jackpot-autoplay.js 의 튜닝된 그리디 봇을 그대로 재사용해 승급 0~10 과
// 세입자 6인의 승률을 측정한다. 수치를 바꾼 뒤에는 이걸로 확인할 것.
//
// 원본 헤더:
// 월세 잭팟 — 헤드리스 자동 플레이 밸런스 검증 v2
// 그리디 봇(EV 최대 픽 + 희석 관리 + 루트/유물/이벤트 대응)으로 승률을 측정한다.
// 목표: 그리디 봇 승률 20~45% (사람은 시너지 배치를 계획하므로 더 높다)
// 실행: node prototypes/jackpot-autoplay.js
'use strict';
const { Run, SYMBOLS, WIN_STAGE, CELLS } = require('../public/arcade/jackpot/sim.js');
const META = require('../public/arcade/jackpot/meta.js');

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

function play(seed, maxSpins, opts) {
  const run = new Run(mulberry32(seed), opts);
  let relicsTaken = 0, eventsSeen = 0;
  for (let i = 0; i < (maxSpins || 300); i++) {
    botResolvePending(run);
    const r = run.spin();
    if (!r) { botResolvePending(run); continue; }
    if (r.firedEvent) eventsSeen++;
    if (r.settle && r.settle.type === 'evicted') break;
    if (run.won) return { won: true, stage: run.winStage(), spins: run.spinNo, relics: run.relics.size + (run.angelUsed ? 1 : 0), eventsSeen };
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


// ── 승급 / 세입자 밸런스 쓸기 ──────────────────────────────────
const N = Number(process.argv[2] || 300);

function sweep(tenant, asc) {
  const opts = META.runOptions(tenant, asc);
  let wins = 0, stageSum = 0;
  for (let s = 1; s <= N; s++) {
    const r = play(s * 7 + asc * 101, 400, opts);
    if (r.won) wins++;
    stageSum += r.won ? (opts.winStage || WIN_STAGE) : r.stage;
  }
  return { winRate: wins / N, avgStage: stageSum / N };
}

console.log(`=== 잭팟 승급 사다리 밸런스 (튜닝 봇, 승급별 ${N}판) ===`);
console.log('승급  승률    평균단계');
const rows = [];
for (let asc = 0; asc <= META.MAX_ASCENSION; asc++) {
  const r = sweep('laborer', asc);
  rows.push({ asc, ...r });
  console.log(`  ${String(asc).padStart(2)}  ${(r.winRate * 100).toFixed(1).padStart(5)}%  ${r.avgStage.toFixed(2).padStart(6)}`);
}

console.log(`\n=== 세입자 밸런스 (승급 0, 각 ${N}판) ===`);
console.log('세입자        승률    평균단계');
for (const t of META.TENANTS) {
  const r = sweep(t.id, 0);
  console.log(`${(t.icon + ' ' + t.name).padEnd(14)} ${(r.winRate * 100).toFixed(1).padStart(5)}%  ${r.avgStage.toFixed(2).padStart(6)}`);
}

// 진단
const a0 = rows[0], top = rows[rows.length - 1];
console.log('');
if (a0.winRate < 0.15 || a0.winRate > 0.55) console.log(`⚠ 승급0 승률 ${(a0.winRate*100).toFixed(1)}% — 목표 15~55% 벗어남`);
else console.log(`✅ 승급0 승률 ${(a0.winRate*100).toFixed(1)}% (목표 15~55%)`);
let mono = true;
for (let i = 1; i < rows.length; i++) if (rows[i].winRate > rows[i-1].winRate + 0.08) mono = false;
console.log(mono ? '✅ 승급이 오를수록 승률이 (요동 없이) 내려간다' : '⚠ 승급 곡선이 뒤집히는 구간이 있다');
if (top.winRate > 0.05) console.log(`⚠ 최고 승급 승률 ${(top.winRate*100).toFixed(1)}% — 너무 쉽다`);
else console.log(`✅ 최고 승급 승률 ${(top.winRate*100).toFixed(1)}% — 최상단이 실제로 벽이다`);
