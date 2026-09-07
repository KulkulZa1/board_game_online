// 이식 계약(port contract) — sim.js 를 '엔진 중립 규칙 명세'로 고정한다.
//
// 왜 필요한가: 규칙은 sim.js 한 곳에 있는데, 이걸 Godot(GDScript) 등으로 옮기면
// 규칙이 두 벌이 된다. 두 벌이 조용히 갈라지는 걸 막는 유일한 방법은
// "같은 시드 → 같은 결과"를 기계가 대조하는 것이다.
//
// 두 층으로 나눈다. 층을 나누는 이유는 부동소수점이다.
//
//   Tier A — 결정론 (같은 엔진 안에서만)
//     이벤트 스트림 전체의 해시. JS 안에서 sim 이 실수로 비결정적이 되는 걸(Date.now,
//     Math.random, 객체 순회 순서) 잡는다. 다른 엔진과는 비교하지 않는다 —
//     GDScript 의 float 연산은 비트 단위로 같지 않기 때문이다.
//
//   Tier B — 이식 동등성 (엔진을 넘어 반드시 일치해야 하는 값)
//     정수와 이산 식별자만 담는다. 난수열(uint32), 드래프트로 나온 카드 id 순서,
//     웨이브 구성표, 할당량 값. 이건 GDScript 로 옮겨도 '정확히' 같아야 한다.
//     포팅한 쪽에서 Tier B 가 어긋나면 규칙이 달라진 것이다.
'use strict';

const crypto = require('crypto');
const TD = require('../public/arcade/tower-defense/sim.js');
const NEON = require('../public/arcade/neon-cascade/sim.js');

const SPEC_VERSION = 1;

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}
// 부동소수점을 계약에 넣을 땐 자릿수를 고정한다 — 안 하면 표현 차이로 헛경보가 난다
const fx = (n, d) => Number(Number(n).toFixed(d === undefined ? 6 : d));

// ── 첨탑 대란 ────────────────────────────────────────────────────
// makeRng 는 부동소수를 돌려주지만 내부 상태는 uint32 다. ×2^32 로 되돌려
// 정수열로 기록한다 — 이식할 땐 이 정수열이 일치해야 한다.
function tdRngInts(seed, n) {
  const r = TD.makeRng(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round(r() * 4294967296) >>> 0);
  return out;
}

function tdTierB() {
  return {
    // ⚠ 이 xorshift 는 `s >> 17`(산술 시프트)를 쓴다. NEON 쪽은 `>>> 17`(논리)다.
    //   옮길 때 통일해버리면 규칙은 같은데 수열이 전부 달라진다.
    rng: [1, 20260907, 777].map((seed) => ({ seed, ints: tdRngInts(seed, 16) })),
    waves: Array.from({ length: 30 }, (_, i) => {
      const spec = TD.waveSpec(i + 1);
      return { n: spec.n, hpMult: fx(spec.hpMult), list: spec.list };
    }),
    pacing: Array.from({ length: 30 }, (_, i) => ({
      wave: i + 1,
      build: fx(TD.BUILD_SECONDS(i + 1), 4),
      early10: TD.EARLY_GOLD(i + 1, 10),
    })),
    combo: [0, 14, 15, 44, 45, 99, 100, 400].map((n) => {
      const tier = TD.comboTier(n);
      return { streak: n, mult: tier ? fx(tier.mult, 4) : 1, label: tier ? tier.label : null };
    }),
    fusion: { costStep: fx(TD.FUSED_COST_STEP, 4), dmgStep: fx(TD.FUSED_DMG_STEP, 4) },
    meta: TD.META_UPGRADES.map((u) => ({
      id: u.id,
      max: u.max,
      costs: [0, 1, 2, 3, 4].map((lv) => {
        const m = TD.normalizeMeta({ upgrades: { [u.id]: lv } });
        const c = TD.metaCost(u.id, m);
        return isFinite(c) ? c : null;   // 최대 레벨은 Infinity — JSON 이 못 담는다
      }),
    })),
    cores: [[1, 0], [8, 5000], [22, 250000], [40, 9000000]].map(([wave, score]) => ({
      wave, score, cores: TD.coresEarned(wave, score, {}),
    })),
    path: { len: TD.PATH_LEN, cols: TD.COLS, rows: TD.ROWS, cells: TD.PATH.length },
  };
}

// 결정적 봇 — 길이 아닌 칸에 궁수탑을 채우고, 웨이브마다 첫 카드를 고른다.
function tdRun(seed, waves) {
  const run = new TD.Run(TD.makeRng(seed));
  const trail = [];
  for (let w = 0; w < waves; w++) {
    for (let y = 0; y < TD.ROWS && run.gold >= 40; y++) {
      for (let x = 0; x < TD.COLS && run.gold >= 40; x++) {
        if (!TD.onPath(x, y)) run.build('archer', x, y);
      }
    }
    if (!run.startWave()) break;
    let guard = 0;
    while (!run.waveOver() && run.phase === 'wave' && guard++ < 20000) run.tick(0.05);
    if (run.phase === 'over') { trail.push({ wave: run.wave, dead: true }); break; }
    const settle = run.settleWave();
    trail.push({
      wave: run.wave,
      lives: run.lives,
      gold: Math.round(run.gold),
      towers: run.towers ? run.towers.length : 0,
      income: settle ? Math.round(settle.income) : 0,
    });
    if (run.pendingDraft && run.pendingDraft.length) run.pickDraft(run.pendingDraft[0].id);
  }
  return { seed, waves: trail.length, digest: sha(trail), tail: trail.slice(-3) };
}

// ── NEON CASCADE ─────────────────────────────────────────────────
function neonTierB() {
  const offerSeeds = [11, 20260907, 4242];
  return {
    // ⚠ 이 xorshift 는 `value >>> 17`(논리 시프트)다. 첨탑 쪽과 다르다.
    rng: [1, 20260907, 777].map((seed) => ({ seed, ints: NEON.rngSequence(seed, 16) })),
    // 임계 사슬 — 할당량은 정수이므로 엔진을 넘어 그대로 같아야 한다
    ladder: {
      roundsPerCycle: NEON.ROUNDS_PER_CYCLE,
      quota: [0, 1, 2].map((p) => ({
        prestige: p,
        rounds: Array.from({ length: NEON.ROUNDS_PER_CYCLE }, (_, i) => NEON.quotaFor(i + 1, p)),
      })),
      legacy: [0, 1, 2, 3].map((p) => ({ prestige: p, mult: fx(NEON.legacyMult(p), 6) })),
    },
    amps: NEON.AMPS.map((a) => ({ id: a.id, kind: a.kind, mods: a.mods })),
    fusions: NEON.AMP_FUSIONS.map((f) => ({ id: f.id, from: f.from, mods: f.mods })),
    // 드래프트가 뽑아내는 카드 id 순서 — 이산값이라 이식해도 같아야 한다
    offers: offerSeeds.map((seed) => {
      const run = NEON.createRun(seed);
      const picks = [];
      for (let i = 0; i < 8; i++) {
        const offer = NEON.runOffers(run, 3);
        if (!offer.length) break;
        picks.push({ shown: offer.map((o) => o.id), took: offer[0].id });
        NEON.takeAmp(run, offer[0].id);
      }
      return { seed, picks, owned: run.owned, consumed: run.consumed };
    }),
    // 웨이브 구성 — 오브 타입 순서는 정수 난수에서 나오므로 이식해도 같아야 한다
    waves: [7, 20260907].map((seed) => {
      const st = NEON.createState(seed, []);
      const out = [];
      for (let w = 0; w < 4; w++) {
        out.push({ wave: st.wave, target: st.target, count: st.orbs.length, types: st.orbs.map((o) => o.type) });
        st.wave++;
        NEON.spawnWave(st);
      }
      return { seed, waves: out };
    }),
  };
}

function neonRun(seed, amps, legacy) {
  const st = NEON.createState(seed, amps, legacy);
  const dt = 1 / 30;
  const trail = [];
  let guard = 0;
  while (!st.ended && guard++ < 30 * 600) {
    if (st.charges > 0) {
      const t = NEON.bestPulseTarget(st);
      NEON.pulse(st, t.x, t.y);
    }
    NEON.step(st, dt);
    if (guard % 150 === 0) {
      trail.push({ t: fx(st.elapsed, 3), score: st.score, wave: st.wave, orbs: st.orbs.length, charges: st.charges });
    }
  }
  return {
    seed, amps, legacy: fx(legacy || 1, 4),
    score: st.score, wave: st.wave, bestChain: st.bestChain,
    secs: fx(st.elapsed, 3), digest: sha(trail),
  };
}

function build() {
  return {
    specVersion: SPEC_VERSION,
    games: {
      'tower-defense': {
        tierB: tdTierB(),
        tierA: [1, 20260907, 4242].map((seed) => tdRun(seed, 12)),
      },
      'neon-cascade': {
        tierB: neonTierB(),
        tierA: [
          neonRun(7, [], 1),
          neonRun(20260907, ['overcharge', 'widepulse'], 1),
          neonRun(4242, ['prism', 'bloom', 'greed'], NEON.legacyMult(2)),
        ],
      },
    },
  };
}

module.exports = { build, SPEC_VERSION, sha };
