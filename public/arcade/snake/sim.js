/* SNAKE ROGUE — 순수 로직 레이어 (렌더/입력 없음)
 *
 * 왜 이런 게 필요한가: 원래 스네이크는 매 판이 완전히 똑같았다. 성공한 로그라이트
 * (뱀서·발라트로·슬더스)의 공통점은 "매 판 다른 빌드를 내가 골라서 만든다"와
 * "죽어도 남는 게 있다" 두 가지다. 그래서
 *   1) 레벨업마다 돌연변이 3장을 뽑아 고르게 하고 (빌드 정체성)
 *   2) 특정 조합은 진화로 합쳐지며 (발견의 쾌감 — 곱셈 시너지)
 *   3) 저주는 강력하지만 대가가 있고 (위험/보상 도박)
 *   4) 판이 끝나면 비늘이 남아 영구 강화를 산다 (다음 판 이유)
 *
 * 이 파일은 브라우저와 node 양쪽에서 쓰인다 (prototypes/snake-rogue-test.js).
 */
(function () {
  'use strict';

  const FOODS_PER_LEVEL = 5;

  // ── 돌연변이 풀 ────────────────────────────────────────────────
  // kind: 'common' | 'rare' | 'cursed'
  // 효과는 전부 stats() 가 읽는 순수 데이터다. 게임 루프는 stats() 결과만 본다.
  const MUTATIONS = [
    { id: 'magnet',    name: '자석 혀',     icon: '🧲', kind: 'common',
      desc: '주변 1칸 안의 먹이를 끌어당긴다', mods: { magnet: 1 } },
    { id: 'goldtongue', name: '황금 혀',    icon: '👅', kind: 'common',
      desc: '황금 먹이 확률 +12%', mods: { goldChance: 0.12 } },
    { id: 'resonance', name: '연쇄 공명',   icon: '🔔', kind: 'common',
      desc: '연쇄 유지 시간 +1.5초', mods: { comboWindowMs: 1500 } },
    { id: 'molt',      name: '탈피',        icon: '🍂', kind: 'common',
      desc: '10마리째마다 꼬리 3칸이 떨어진다', mods: { moltEvery: 10, moltAmount: 3 } },
    { id: 'thickskin', name: '두꺼운 비늘', icon: '🛡️', kind: 'common',
      desc: '치명적 충돌을 1번 버틴다', mods: { shields: 1 } },
    { id: 'timewarp',  name: '시간 왜곡',   icon: '⏳', kind: 'rare',
      desc: '속도 15% 느려지고 점수 +30%', mods: { speedMult: 1.15, scoreMult: 0.30 } },
    { id: 'phase',     name: '유령',        icon: '👻', kind: 'rare',
      desc: '벽을 통과해 반대편으로 나온다', mods: { wrap: 1 } },
    { id: 'venom',     name: '독니',        icon: '🦷', kind: 'rare',
      desc: '황금 먹이를 먹으면 꼬리 2칸이 녹는다', mods: { goldMolt: 2 } },
    { id: 'split',     name: '분열',        icon: '🍎', kind: 'rare',
      desc: '황금 먹이가 일반 먹이 2개를 더 뿌린다', mods: { splitSpawn: 2 } },
    { id: 'gluttony',  name: '포식',        icon: '🍖', kind: 'rare',
      desc: '먹을 때 2칸 자라지만 점수 +50%', mods: { growth: 1, scoreMult: 0.50 } },
    // 진화 재료가 아닌 순수 강화들 — 이게 있어야 무작정 집어도 진화가 완성되지 않는다.
    // (진화를 "노려서" 만들어야 발견의 맛이 산다)
    { id: 'nimble',    name: '민첩한 몸놀림', icon: '🪶', kind: 'common',
      desc: '속도가 10% 느려진다 (생존)', mods: { speedMult: 1.10 } },
    { id: 'ravenous',  name: '탐식',        icon: '🍯', kind: 'common',
      desc: '황금 확률 +6%, 점수 +12%', mods: { goldChance: 0.06, scoreMult: 0.12 } },
    { id: 'ironclad',  name: '철갑',        icon: '⚙️', kind: 'common',
      desc: '방어막 +1, 대신 속도 6% 느려진다', mods: { shields: 1, speedMult: 1.06 } },
    { id: 'longshadow', name: '긴 그림자',  icon: '🌘', kind: 'common',
      desc: '연쇄 유지 시간 +0.8초', mods: { comboWindowMs: 800 } },
    { id: 'colossus',  name: '거대화',      icon: '🐲', kind: 'rare',
      desc: '먹을 때 3칸 자라지만 점수 +75%', mods: { growth: 2, scoreMult: 0.75 } },
    // 저주 — 강하지만 확실한 대가가 있다 (도박 선택지)
    { id: 'starving',  name: '굶주린 송곳니', icon: '🩸', kind: 'cursed',
      desc: '점수 2배 — 대신 연쇄 유지 시간 절반', mods: { scoreMult: 1.0, comboWindowMult: 0.5 } },
    { id: 'frenzy',    name: '광란',        icon: '🔥', kind: 'cursed',
      desc: '연쇄 1단마다 점수 +8% — 대신 속도도 빨라진다', mods: { comboScorePer: 0.08, comboSpeedPer: 0.03 } },
    { id: 'brittle',   name: '유리 몸',     icon: '💎', kind: 'cursed',
      desc: '점수 +80% — 대신 방어막을 모두 잃는다', mods: { scoreMult: 0.80, loseShields: 1 } },
  ];
  const MUT = Object.fromEntries(MUTATIONS.map((m) => [m.id, m]));

  // ── 진화 (조합 발견의 쾌감) ────────────────────────────────────
  // 두 돌연변이를 모두 가지면 그 둘이 사라지고 더 강한 하나로 합쳐진다.
  const EVOLUTIONS = [
    { id: 'goldenstorm', name: '황금 폭풍', icon: '🌟', from: ['magnet', 'goldtongue'],
      desc: '자석 범위 2칸 + 황금 확률 +25%', mods: { magnet: 2, goldChance: 0.25 } },
    { id: 'voidserpent', name: '공허의 뱀', icon: '🕳️', from: ['phase', 'venom'],
      desc: '벽 통과 + 자기 몸에 부딪혀도 꼬리 4칸만 잃는다', mods: { wrap: 1, selfEat: 4 } },
    { id: 'endlessfeast', name: '끝없는 만찬', icon: '🍽️', from: ['gluttony', 'split'],
      desc: '2칸 성장 + 점수 +90% + 황금이 먹이 3개를 뿌린다', mods: { growth: 1, scoreMult: 0.90, splitSpawn: 3 } },
    { id: 'frozenworld', name: '정지 세계', icon: '❄️', from: ['timewarp', 'resonance'],
      desc: '연쇄가 풀리지 않는다 + 점수 +45%', mods: { comboNeverExpires: 1, scoreMult: 0.45, speedMult: 1.10 } },
    { id: 'bloodmoon',  name: '핏빛 달',   icon: '🌑', from: ['starving', 'frenzy'],
      desc: '점수 3배 — 대신 속도가 계속 빨라진다', mods: { scoreMult: 2.0, comboSpeedPer: 0.05 } },
  ];

  // ── 영구 강화 (죽어도 남는 것) ─────────────────────────────────
  const UPGRADES = [
    { id: 'shortstart', name: '짧은 시작', icon: '📏', max: 2, cost: (l) => 40 + l * 60,
      desc: (l) => `시작 길이 -${l} (더 안전하게 출발)` },
    { id: 'headstart',  name: '선행 충전', icon: '⚡', max: 3, cost: (l) => 30 + l * 45,
      desc: (l) => `시작 RUSH 충전 +${l * 25}%` },
    { id: 'widedraft',  name: '넓은 선택', icon: '🃏', max: 1, cost: () => 220,
      desc: () => '돌연변이 선택지 3 → 4장' },
    { id: 'luckyblood', name: '행운의 피', icon: '🍀', max: 3, cost: (l) => 50 + l * 55,
      desc: (l) => `희귀 돌연변이 등장률 +${l * 10}%` },
    { id: 'seeded',     name: '타고난 변이', icon: '🧬', max: 1, cost: () => 260,
      desc: () => '시작할 때 돌연변이 1개를 무작위로 얻는다' },
  ];
  const UPG = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

  // ── 결정적 RNG (테스트에서 시드 고정) ──────────────────────────
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function rng() {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  // ── 런 상태 ────────────────────────────────────────────────────
  function createRun(opts) {
    const o = opts || {};
    const meta = normalizeMeta(o.meta);
    const rng = o.rng || makeRng(o.seed || 12345);
    const run = {
      rng, meta,
      owned: [],          // 보유 돌연변이/진화 id
      evolved: [],        // 이번 판에 터진 진화 id (연출용)
      level: 1,
      foodEaten: 0,
      score: 0,
      bestCombo: 0,
      shieldsUsed: 0,
      pendingDraft: null,
    };
    // 영구 강화: 타고난 변이
    if (meta.upgrades.seeded) {
      const pool = MUTATIONS.filter((m) => m.kind !== 'cursed');
      grant(run, pool[Math.floor(rng() * pool.length)].id);
    }
    return run;
  }

  function normalizeMeta(meta) {
    const m = meta && typeof meta === 'object' ? meta : {};
    const up = {};
    for (const u of UPGRADES) {
      const lv = Math.max(0, Math.min(u.max, (m.upgrades && m.upgrades[u.id]) | 0));
      if (lv > 0) up[u.id] = lv;
    }
    return { scales: Math.max(0, (m.scales | 0) || 0), upgrades: up };
  }

  // ── 드래프트 ───────────────────────────────────────────────────
  // 이미 가진 것/진화로 소모된 것은 제외. 저주는 확률적으로 섞인다.
  function draftOffers(run, count) {
    const n = count || (run.meta.upgrades.widedraft ? 4 : 3);
    // ⚠ owned 만으로 거르면 안 된다. grant() 가 진화 시 재료를 owned 에서 빼기 때문에
    // 소모된 재료가 풀로 되돌아오고, 같은 진화를 무한히 재양산할 수 있다.
    // (실측: 점수 중앙 123만 → 469만, 3.8배 인플레 / 진화 중앙 28회 — 진화는 총 5종뿐)
    const seen = new Set([...run.owned, ...(run.consumed || [])]);
    const avail = MUTATIONS.filter((m) => !seen.has(m.id));
    const rareBoost = (run.meta.upgrades.luckyblood || 0) * 0.10;

    const weightOf = (m) => {
      if (m.kind === 'cursed') return 0.9;
      if (m.kind === 'rare')   return 1.6 + rareBoost * 4;
      return 3.2;
    };
    const picks = [];
    const pool = avail.slice();
    while (picks.length < n && pool.length) {
      const total = pool.reduce((a, m) => a + weightOf(m), 0);
      let r = run.rng() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= weightOf(pool[i]); if (r <= 0) { idx = i; break; } idx = i; }
      picks.push(pool.splice(idx, 1)[0]);
    }
    // 지금 고르면 바로 진화가 터지는 선택지에 표시를 달아준다 (발견을 유도)
    return picks.map((m) => ({ ...m, evolvesInto: evolutionFor(run.owned.concat(m.id), m.id) }));
  }

  // 이 id 를 더했을 때 완성되는 진화가 있으면 반환
  function evolutionFor(ownedIds, addedId) {
    const set = new Set(ownedIds);
    for (const e of EVOLUTIONS) {
      if (!e.from.includes(addedId)) continue;
      if (e.from.every((f) => set.has(f))) return e;
    }
    return null;
  }

  // 돌연변이 획득 → 진화 조건이 맞으면 즉시 합쳐진다
  function grant(run, id) {
    if (!MUT[id] || run.owned.includes(id)) return null;
    run.owned.push(id);
    const evo = evolutionFor(run.owned, id);
    if (evo) {
      // 소모한 재료를 영구 기록 — 드래프트 풀로 되돌아오면 안 된다
      run.consumed = (run.consumed || []).concat(evo.from);
      run.owned = run.owned.filter((x) => !evo.from.includes(x));
      run.owned.push(evo.id);
      run.evolved.push(evo.id);
      return evo;
    }
    return null;
  }

  const EVO = Object.fromEntries(EVOLUTIONS.map((e) => [e.id, e]));
  function defOf(id) { return MUT[id] || EVO[id] || null; }

  // ── 보유 효과 합산 ─────────────────────────────────────────────
  // 게임 루프는 이 결과만 읽는다. 여기서 규칙이 한 곳으로 모인다.
  function stats(run) {
    const s = {
      magnet: 0, goldChance: 0, comboWindowMs: 0, comboWindowMult: 1,
      speedMult: 1, scoreMult: 1, growth: 1, shields: 0,
      wrap: 0, selfEat: 0, splitSpawn: 0, goldMolt: 0,
      moltEvery: 0, moltAmount: 0, comboScorePer: 0, comboSpeedPer: 0,
      comboNeverExpires: 0,
    };
    let loseShields = false;
    for (const id of run.owned) {
      const d = defOf(id);
      if (!d) continue;
      const m = d.mods || {};
      if (m.magnet)            s.magnet = Math.max(s.magnet, m.magnet);
      if (m.goldChance)        s.goldChance += m.goldChance;
      if (m.comboWindowMs)     s.comboWindowMs += m.comboWindowMs;
      if (m.comboWindowMult)   s.comboWindowMult *= m.comboWindowMult;
      if (m.speedMult)         s.speedMult *= m.speedMult;
      if (m.scoreMult)         s.scoreMult += m.scoreMult;
      if (m.growth)            s.growth += m.growth;
      if (m.shields)           s.shields += m.shields;
      if (m.wrap)              s.wrap = 1;
      if (m.selfEat)           s.selfEat = Math.max(s.selfEat, m.selfEat);
      if (m.splitSpawn)        s.splitSpawn = Math.max(s.splitSpawn, m.splitSpawn);
      if (m.goldMolt)          s.goldMolt = Math.max(s.goldMolt, m.goldMolt);
      if (m.moltEvery)         { s.moltEvery = m.moltEvery; s.moltAmount = m.moltAmount; }
      if (m.comboScorePer)     s.comboScorePer += m.comboScorePer;
      if (m.comboSpeedPer)     s.comboSpeedPer += m.comboSpeedPer;
      if (m.comboNeverExpires) s.comboNeverExpires = 1;
      if (m.loseShields)       loseShields = true;
    }
    if (loseShields) s.shields = 0;
    s.shields = Math.max(0, s.shields - run.shieldsUsed);
    return s;
  }

  // 실제 연쇄 유지 시간 (ms)
  function comboWindow(run, baseMs) {
    const s = stats(run);
    if (s.comboNeverExpires) return Infinity;
    return Math.max(800, (baseMs + s.comboWindowMs) * s.comboWindowMult);
  }

  // 먹이 1개 점수
  function foodScore(run, opts) {
    const o = opts || {};
    const s = stats(run);
    const combo = Math.max(1, o.combo || 1);
    const chain = 1 + Math.min(8, combo - 1) * 0.25 + s.comboScorePer * (combo - 1);
    const rush = o.rush ? 2 : 1;
    const gold = o.gold ? 5 : 1;
    return Math.round(10 * (o.level || 1) * chain * rush * gold * s.scoreMult);
  }

  // 장애물 수 — 레벨 5부터 서서히 조여든다 (긴장감)
  function obstacleCount(level) {
    return level < 5 ? 0 : Math.min(14, (level - 4) * 2);
  }

  // ── 판 종료 → 비늘 정산 ────────────────────────────────────────
  function scalesEarned(run) {
    // 점수는 콤보×배율로 기하급수로 뛰므로 선형 정산은 인플레이션이 된다.
    // (실측: 잘 굴린 한 판이 score/120 만으로 +5,400비늘 — 상점 전체(~1,160)를
    //  다섯 번 살 돈이라 메타 진행이 한 판만에 끝나버렸다.) 제곱근으로 눌러서
    //  좋은 판은 여전히 크게, 신적인 판은 "크지만 전부는 아닌" 보상으로 만든다.
    const base = Math.floor(Math.sqrt(Math.max(0, run.score)) / 2);
    const lvBonus = run.level * 4;
    const comboBonus = run.bestCombo * 3;
    const evoBonus = run.evolved.length * 25;
    return Math.max(1, base + lvBonus + comboBonus + evoBonus);
  }

  // ── 메타 저장/구매 ─────────────────────────────────────────────
  function upgradeCost(id, meta) {
    const u = UPG[id];
    if (!u) return Infinity;
    const lv = (meta.upgrades[id] || 0);
    if (lv >= u.max) return Infinity;
    return u.cost(lv);
  }
  function buyUpgrade(meta, id) {
    const m = normalizeMeta(meta);
    const cost = upgradeCost(id, m);
    if (!isFinite(cost) || m.scales < cost) return { ok: false, meta: m };
    m.scales -= cost;
    m.upgrades[id] = (m.upgrades[id] || 0) + 1;
    return { ok: true, meta: m };
  }

  const api = {
    FOODS_PER_LEVEL, MUTATIONS, EVOLUTIONS, UPGRADES, MUT, EVO,
    makeRng, createRun, normalizeMeta, draftOffers, evolutionFor, grant, defOf,
    stats, comboWindow, foodScore, obstacleCount, scalesEarned, upgradeCost, buyUpgrade,
  };
  if (typeof window !== 'undefined') window.SnakeRogue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
