/* BREAKOUT ROGUE — 순수 로직 레이어 (렌더/입력 없음)
 *
 * 스네이크와 같은 진단이다: 손맛(콤보·피버·파워업)은 있는데 매 판이 똑같고
 * 죽으면 아무것도 남지 않았다. 성공한 로그라이트가 공유하는 두 기둥 —
 * "내가 고른 선택으로 빌드가 갈린다" 와 "죽어도 남는 게 있다" — 를 넣는다.
 *
 * 다만 스네이크의 복제는 아니다. 벽돌깨기의 리듬은 "스테이지 클리어"이므로
 * 드래프트는 스테이지 사이에 열리고, 장비는 공·패들·벽돌이라는 이 게임의
 * 명사들 위에서만 작동한다.
 *
 * 브라우저와 node 양쪽에서 쓰인다 (prototypes/breakout-rogue-test.js).
 */
(function () {
  'use strict';

  // ── 장비 풀 ────────────────────────────────────────────────────
  // 효과는 전부 stats() 가 읽는 데이터다. 게임 루프는 stats() 결과만 본다.
  const GEAR = [
    // 흔함 — 안정적으로 판을 넓혀주는 것들
    { id: 'widepad',  name: '넓은 판',   icon: '🏓', kind: 'common',
      desc: '패들이 25% 넓어진다', mods: { paddleMult: 0.25 } },
    { id: 'lightball', name: '가벼운 공', icon: '🎈', kind: 'common',
      desc: '공 속도 12% 감소 (다루기 쉬워진다)', mods: { ballSpeedMult: -0.12 } },
    { id: 'sparelife', name: '여벌 목숨', icon: '❤️', kind: 'common',
      desc: '목숨 +1', mods: { lives: 1 } },
    { id: 'steelball', name: '강철 공',   icon: '⚫', kind: 'common',
      desc: '벽돌을 한 번에 2칸 깎는다', mods: { brickDamage: 1 } },
    { id: 'magnet',   name: '자석 패들', icon: '🧲', kind: 'common',
      desc: '떨어지는 아이템을 끌어당긴다', mods: { magnet: 1 } },
    { id: 'luckydrop', name: '행운의 낙하', icon: '🎁', kind: 'common',
      desc: '아이템 등장 확률 +12%', mods: { dropChance: 0.12 } },
    { id: 'longfever', name: '긴 열기',  icon: '🌡️', kind: 'common',
      desc: '피버 지속 시간 +50%', mods: { feverMult: 0.5 } },
    // 희귀 — 판의 성격을 바꾸는 것들
    { id: 'splitshot', name: '분열탄',   icon: '🔱', kind: 'rare',
      desc: '벽돌 8개마다 공이 1개 늘어난다', mods: { splitEvery: 8 } },
    { id: 'bombball', name: '폭발탄',    icon: '💣', kind: 'rare',
      desc: '벽돌을 깰 때 15% 확률로 주변까지 터진다', mods: { bombChance: 0.15 } },
    { id: 'pierce',   name: '관통',      icon: '➡️', kind: 'rare',
      desc: '공이 벽돌을 튕기지 않고 뚫는다 (스테이지당 3회)', mods: { pierceCharges: 3 } },
    { id: 'rebound',  name: '되돌리기',  icon: '🔁', kind: 'rare',
      desc: '공을 놓쳐도 스테이지마다 1번 되살린다', mods: { revives: 1 } },
    { id: 'sticky',   name: '끈끈이',    icon: '🕸️', kind: 'rare',
      desc: '공이 패들에 붙는다 — 원하는 각도로 쏜다', mods: { sticky: 1 } },
    // 합성 재료가 아닌 순수 강화 — 이게 있어야 아무거나 집어도 합성이 완성되지 않는다.
    // (합성을 "노려서" 만들어야 발견의 맛이 산다)
    { id: 'thickpad', name: '두꺼운 판', icon: '🛡️', kind: 'common',
      desc: '패들 +15%, 공 속도 -5%', mods: { paddleMult: 0.15, ballSpeedMult: -0.05 } },
    { id: 'satchel',  name: '수집 가방', icon: '🧺', kind: 'common',
      desc: '아이템 등장 +8%, 피버 지속 +25%', mods: { dropChance: 0.08, feverMult: 0.25 } },
    { id: 'chainamp', name: '연쇄 증폭', icon: '🔗', kind: 'rare',
      desc: '연쇄가 길수록 점수가 더 가파르게 오른다', mods: { comboBonus: 0.25 } },
    // 저주 — 확실히 세지만 대가가 분명하다 (도박 선택지)
    { id: 'glasscannon', name: '유리 대포', icon: '💎', kind: 'cursed',
      desc: '점수 2배 — 대신 목숨이 1로 고정된다', mods: { scoreMult: 1.0, lockLives: 1 } },
    { id: 'frenzyball', name: '광란의 공', icon: '🔥', kind: 'cursed',
      desc: '점수 +60% — 대신 공이 30% 빨라진다', mods: { scoreMult: 0.60, ballSpeedMult: 0.30 } },
    { id: 'narrowpad', name: '좁은 판',  icon: '📏', kind: 'cursed',
      desc: '점수 +90% — 대신 패들이 30% 좁아진다', mods: { scoreMult: 0.90, paddleMult: -0.30 } },
  ];
  const G = Object.fromEntries(GEAR.map((g) => [g.id, g]));

  // ── 진화 (조합 발견) ───────────────────────────────────────────
  // 두 장비를 모두 가지면 둘이 사라지고 더 강한 하나로 합쳐진다.
  const FUSIONS = [
    { id: 'shrapnel', name: '산탄 폭풍', icon: '💥', from: ['splitshot', 'bombball'],
      desc: '폭발이 공을 하나씩 더 만든다', mods: { splitEvery: 6, bombChance: 0.25, bombSplits: 1 } },
    { id: 'armorpiercer', name: '철갑탄', icon: '🗡️', from: ['steelball', 'pierce'],
      desc: '벽돌을 2칸 깎으며 항상 뚫고 지나간다', mods: { brickDamage: 1, alwaysPierce: 1 } },
    { id: 'aimedshot', name: '조준 사격', icon: '🎯', from: ['magnet', 'sticky'],
      desc: '붙잡아 조준 + 아이템을 멀리서도 끌어온다', mods: { sticky: 1, magnet: 2, dropChance: 0.10 } },
    { id: 'supernova', name: '초신성',   icon: '☄️', from: ['glasscannon', 'frenzyball'],
      desc: '점수 4배 — 목숨 1, 공은 더 빠르다', mods: { scoreMult: 3.0, lockLives: 1, ballSpeedMult: 0.30 } },
    { id: 'phoenix',  name: '불사조',    icon: '🐦', from: ['sparelife', 'rebound'],
      desc: '목숨 +1, 스테이지마다 2번 되살아난다', mods: { lives: 1, revives: 2 } },
  ];
  const F = Object.fromEntries(FUSIONS.map((f) => [f.id, f]));

  // ── 영구 강화 (죽어도 남는 것) ─────────────────────────────────
  const UPGRADES = [
    { id: 'extralife', name: '예비 목숨', icon: '❤️', max: 2, cost: (l) => 45 + l * 70,
      desc: (l) => `시작 목숨 +${l}` },
    { id: 'bigpaddle', name: '큰 패들',   icon: '🏓', max: 3, cost: (l) => 35 + l * 50,
      desc: (l) => `시작 패들 크기 +${l * 8}%` },
    { id: 'widedraft', name: '넓은 선택', icon: '🃏', max: 1, cost: () => 230,
      desc: () => '장비 선택지 3 → 4장' },
    { id: 'scavenger', name: '수집가',    icon: '🍀', max: 3, cost: (l) => 55 + l * 60,
      desc: (l) => `희귀 장비 등장률 +${l * 10}%` },
    { id: 'headgear',  name: '선행 장비', icon: '🎒', max: 1, cost: () => 270,
      desc: () => '시작할 때 장비 1개를 무작위로 얻는다' },
  ];
  const U = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

  // ── 결정적 RNG ─────────────────────────────────────────────────
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
    const rng = o.rng || makeRng(o.seed || 4242);
    const run = { rng, meta, owned: [], fused: [], level: 1, score: 0, bestCombo: 0, bricksBroken: 0 };
    if (meta.upgrades.headgear) {
      const pool = GEAR.filter((g) => g.kind !== 'cursed');
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
    return { shards: Math.max(0, (m.shards | 0) || 0), upgrades: up };
  }

  // ── 드래프트 ───────────────────────────────────────────────────
  function draftOffers(run, count) {
    const n = count || (run.meta.upgrades.widedraft ? 4 : 3);
    const owned = new Set(run.owned);
    const pool = GEAR.filter((g) => !owned.has(g.id));
    const rareBoost = (run.meta.upgrades.scavenger || 0) * 0.10;
    const weightOf = (g) => {
      if (g.kind === 'cursed') return 0.9;
      if (g.kind === 'rare')   return 1.6 + rareBoost * 4;
      return 3.2;
    };
    const picks = [];
    const left = pool.slice();
    while (picks.length < n && left.length) {
      const total = left.reduce((a, g) => a + weightOf(g), 0);
      let r = run.rng() * total, idx = 0;
      for (let i = 0; i < left.length; i++) { r -= weightOf(left[i]); if (r <= 0) { idx = i; break; } idx = i; }
      picks.push(left.splice(idx, 1)[0]);
    }
    // 지금 고르면 합쳐지는 카드에 표시를 달아 "노리는 재미" 를 만든다
    return picks.map((g) => ({ ...g, fusesInto: fusionFor(run.owned.concat(g.id), g.id) }));
  }

  function fusionFor(ownedIds, addedId) {
    const set = new Set(ownedIds);
    for (const f of FUSIONS) {
      if (!f.from.includes(addedId)) continue;
      if (f.from.every((x) => set.has(x))) return f;
    }
    return null;
  }

  function grant(run, id) {
    if (!G[id] || run.owned.includes(id)) return null;
    run.owned.push(id);
    const fus = fusionFor(run.owned, id);
    if (fus) {
      run.owned = run.owned.filter((x) => !fus.from.includes(x));
      run.owned.push(fus.id);
      run.fused.push(fus.id);
      return fus;
    }
    return null;
  }

  function defOf(id) { return G[id] || F[id] || null; }

  // ── 보유 효과 합산 ─────────────────────────────────────────────
  function stats(run) {
    const s = {
      paddleMult: 1, ballSpeedMult: 1, scoreMult: 1, lives: 0, brickDamage: 1,
      magnet: 0, dropChance: 0, feverMult: 1, splitEvery: 0, bombChance: 0,
      bombSplits: 0, pierceCharges: 0, alwaysPierce: 0, revives: 0, sticky: 0,
      lockLives: 0, comboBonus: 0,
    };
    for (const id of run.owned) {
      const d = defOf(id);
      if (!d) continue;
      const m = d.mods || {};
      if (m.paddleMult)    s.paddleMult += m.paddleMult;
      if (m.ballSpeedMult) s.ballSpeedMult += m.ballSpeedMult;
      if (m.scoreMult)     s.scoreMult += m.scoreMult;
      if (m.lives)         s.lives += m.lives;
      if (m.brickDamage)   s.brickDamage += m.brickDamage;
      if (m.magnet)        s.magnet = Math.max(s.magnet, m.magnet);
      if (m.dropChance)    s.dropChance += m.dropChance;
      if (m.feverMult)     s.feverMult += m.feverMult;
      if (m.splitEvery)    s.splitEvery = s.splitEvery ? Math.min(s.splitEvery, m.splitEvery) : m.splitEvery;
      if (m.bombChance)    s.bombChance = Math.max(s.bombChance, m.bombChance);
      if (m.bombSplits)    s.bombSplits = Math.max(s.bombSplits, m.bombSplits);
      if (m.pierceCharges) s.pierceCharges += m.pierceCharges;
      if (m.alwaysPierce)  s.alwaysPierce = 1;
      if (m.revives)       s.revives += m.revives;
      if (m.sticky)        s.sticky = 1;
      if (m.lockLives)     s.lockLives = 1;
      if (m.comboBonus)    s.comboBonus += m.comboBonus;
    }
    // 패들이 사라지거나 공이 멈추면 게임이 아니다 — 하한을 둔다
    s.paddleMult = Math.max(0.45, s.paddleMult);
    s.ballSpeedMult = Math.max(0.5, s.ballSpeedMult);
    return s;
  }

  // 시작 목숨 — 저주(유리 대포/초신성)는 1로 고정한다
  function startingLives(run) {
    const s = stats(run);
    if (s.lockLives) return 1;
    return 3 + s.lives + (run.meta.upgrades.extralife || 0);
  }

  // 시작 패들 배율 (영구 강화 포함)
  function paddleScale(run) {
    return stats(run).paddleMult * (1 + (run.meta.upgrades.bigpaddle || 0) * 0.08);
  }

  // 벽돌 1개 점수
  function brickScore(run, opts) {
    const o = opts || {};
    const s = stats(run);
    const combo = Math.max(1, o.combo || 1);
    const chain = 1 + Math.floor((combo - 1) / 4) * (0.5 + s.comboBonus);
    const fever = o.fever ? 3 : 1;
    return Math.round(10 * (o.level || 1) * (o.brickHp || 1) * chain * fever * s.scoreMult);
  }

  // ── 판 종료 → 조각 정산 ────────────────────────────────────────
  function shardsEarned(run) {
    // 점수는 콤보·피버·×4 장비로 곱연산으로 뛴다 — 선형 정산은 인플레이션이 된다
    // (스네이크에서 실측된 것과 같은 실패 형태라 같은 √ 정산을 쓴다)
    const base = Math.floor(Math.sqrt(Math.max(0, run.score)) / 2);
    const lvBonus = run.level * 6;
    const comboBonus = run.bestCombo * 2;
    const fuseBonus = run.fused.length * 30;
    return Math.max(1, base + lvBonus + comboBonus + fuseBonus);
  }

  function upgradeCost(id, meta) {
    const u = U[id];
    if (!u) return Infinity;
    const lv = meta.upgrades[id] || 0;
    if (lv >= u.max) return Infinity;
    return u.cost(lv);
  }
  function buyUpgrade(meta, id) {
    const m = normalizeMeta(meta);
    const cost = upgradeCost(id, m);
    if (!isFinite(cost) || m.shards < cost) return { ok: false, meta: m };
    m.shards -= cost;
    m.upgrades[id] = (m.upgrades[id] || 0) + 1;
    return { ok: true, meta: m };
  }

  const api = {
    GEAR, FUSIONS, UPGRADES, G, F,
    makeRng, createRun, normalizeMeta, draftOffers, fusionFor, grant, defOf,
    stats, startingLives, paddleScale, brickScore, shardsEarned, upgradeCost, buyUpgrade,
  };
  if (typeof window !== 'undefined') window.BreakoutRogue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
