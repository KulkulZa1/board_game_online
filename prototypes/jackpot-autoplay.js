// 월세 잭팟 — 헤드리스 자동 플레이 밸런스 검증
// 그리디 봇(EV 최대 픽 + 희석 관리)으로 승률·생존 단계 분포를 측정한다.
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

// 그리디 픽: 희석(덱>12) 반영한 한계 EV가 스킵 보상(+2 상당)보다 낮으면 스킵
function botPick(run, offers) {
  const deckN = run.deck.length;
  const dilution = Math.min(1, CELLS / (deckN + 1));
  let best = null, bestVal = 1.2;   // 스킵 +2코인 ≈ EV 1.2/스핀 상당
  for (const id of offers) {
    const val = SYMBOLS[id].ev * dilution;
    if (val > bestVal) { bestVal = val; best = id; }
  }
  run.pick(best);   // null이면 스킵(+2)
}

function play(seed, maxSpins) {
  const run = new Run(mulberry32(seed));
  for (let i = 0; i < (maxSpins || 200); i++) {
    const r = run.spin();
    if (!r) break;
    if (r.settle && r.settle.type === 'evicted') break;
    if (run.won) return { won: true, stage: run.stage - 1, spins: run.spinNo };
    botPick(run, run.offers(r.settle && r.settle.bonus));
    if (r.settle && r.settle.bonus) botPick(run, run.offers(true));   // 보너스 뽑기
  }
  return { won: run.won, stage: run.stage - (run.state === 'dead' ? 0 : 1), spins: run.spinNo };
}

const N = 400;
let wins = 0, stageSum = 0;
const stageDist = {};
for (let s = 1; s <= N; s++) {
  const r = play(s);
  if (r.won) wins++;
  const st = r.won ? WIN_STAGE : r.stage;
  stageSum += st;
  stageDist[st] = (stageDist[st] || 0) + 1;
}
console.log(`\n=== 월세 잭팟 밸런스 (${N}판, 그리디 봇) ===`);
console.log(`승률(10단계 완납): ${(wins / N * 100).toFixed(1)}%`);
console.log(`평균 도달 단계: ${(stageSum / N).toFixed(2)}`);
console.log('단계 분포:', Object.entries(stageDist).map(([k, v]) => `${k}단계:${v}`).join(' '));
const ok = wins / N >= 0.15 && wins / N <= 0.55;
console.log(ok ? '✅ 목표 승률 범위(15~55%) 충족' : '❌ 승률 범위 밖 — 월세 곡선 조정 필요');
process.exit(ok ? 0 : 1);
