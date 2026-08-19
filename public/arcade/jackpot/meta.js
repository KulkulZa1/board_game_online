/* 월세 잭팟 — 로그라이크 메타 레이어 (세입자 · 승급 · 해금)
 *
 * 왜 필요한가: 잭팟은 한 판이 잘 만들어져 있지만 "판 사이" 가 비어 있었다.
 * 10번 완납하면 이기고, 그 다음엔 무한 모드뿐이라 오래 붙잡을 이유가 없다.
 * 로그라이크가 사람을 길게 잡아두는 장치는 대체로 셋이다:
 *
 *   1) 세입자 — 시작 조건이 다른 캐릭터. 같은 게임을 다르게 시작하게 만든다.
 *   2) 승급   — 이긴 뒤에 열리는 난이도 사다리. 이게 "한 번 더" 의 진짜 엔진이다.
 *   3) 해금   — 판이 끝날 때마다 쌓이는 재화로 새 세입자/심볼/유물을 연다.
 *
 * 이 파일은 순수 데이터·계산만 담는다. Run 은 runOptions() 결과만 읽는다.
 * 브라우저와 node 양쪽에서 쓰인다 (prototypes/jackpot-meta-test.js).
 */
(function () {
  'use strict';

  const MAX_ASCENSION = 10;

  // ── 세입자 (시작 조건이 다른 캐릭터) ───────────────────────────
  // locked: true 면 해금해야 쓸 수 있다.
  const TENANTS = [
    { id: 'laborer', name: '막노동꾼', icon: '🔨', cost: 0,
      desc: '기본기에 충실. 시작 코인 +10',
      opts: { startCoins: 10 } },
    { id: 'collector', name: '수집가', icon: '🧺', cost: 0,
      desc: '덱 상한 +10, 드래프트 선택지 +1 — 넓게 모아 조합한다',
      opts: { deckCapBonus: 10, draftBonus: 1 } },
    { id: 'gambler', name: '도박꾼', icon: '🎲', cost: 60,
      desc: '잭팟 확률 2배 — 대신 시작 덱에 양말 2장이 더 섞인다',
      opts: { jackpotMult: 2, extraStart: ['sock', 'sock'] } },
    { id: 'miser', name: '구두쇠', icon: '🪙', cost: 90,
      desc: '월세 -12%, 스킵 코인 2배 — 느리지만 단단하다',
      opts: { rentMult: 0.88, skipMult: 2 } },
    { id: 'cook', name: '요리사', icon: '👨‍🍳', cost: 140,
      desc: '시작 덱이 음식 위주 + 김밥 한 장 추가',
      opts: { startDeck: ['rice', 'rice', 'rice', 'gimbap', 'gimbap', 'milk', 'milk', 'cat', 'sock'] } },
    { id: 'fortune', name: '점쟁이', icon: '🔮', cost: 180,
      desc: '이벤트 확률 2배 — 판이 요동친다',
      opts: { eventMult: 2 } },
  ];
  const TEN = Object.fromEntries(TENANTS.map((t) => [t.id, t]));

  // ── 승급 (이긴 뒤 열리는 난이도 사다리) ────────────────────────
  // 누적이다. 승급 5 는 1~5 의 효과를 모두 받는다.
  const ASCENSIONS = [
    { lv: 1,  desc: '월세가 10% 더 비싸다',            opts: { rentMult: 1.10 } },
    { lv: 2,  desc: '시작 코인 -10',                    opts: { startCoins: -10 } },
    { lv: 3,  desc: '덱 상한 -5',                       opts: { deckCapBonus: -5 } },
    { lv: 4,  desc: '유물 선택지가 2개 → 1개로 줄어든다', opts: { relicChoices: -1 } },
    { lv: 5,  desc: '월세 주기가 1스핀 짧다',           opts: { spinsPerRent: -1 } },
    { lv: 6,  desc: '월세 곡선이 더 가파르다',          opts: { rentGrowth: 0.05 } },
    { lv: 7,  desc: '잭팟 확률이 절반',                 opts: { jackpotMult: 0.5 } },
    { lv: 8,  desc: '시작 덱에 빈 양말 2장이 섞인다',   opts: { extraStart: ['sock', 'sock'] } },
    { lv: 9,  desc: '스킵 코인이 없다',                 opts: { skipMult: 0 } },
    { lv: 10, desc: '완납 목표가 12회로 늘어난다',      opts: { winStage: 12 } },
  ];

  // ── 저장값 ─────────────────────────────────────────────────────
  function normalize(raw) {
    const m = raw && typeof raw === 'object' ? raw : {};
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
    const unlocked = Array.isArray(m.unlocked) ? m.unlocked.filter((id) => TEN[id]) : [];
    // 기본 세입자는 항상 열려 있다
    for (const t of TENANTS) if (t.cost === 0 && !unlocked.includes(t.id)) unlocked.push(t.id);
    return {
      deeds: num(m.deeds),                                   // 🏠 집문서 조각 (메타 재화)
      unlocked,
      maxAscension: Math.max(0, Math.min(MAX_ASCENSION, num(m.maxAscension))),  // 도달한 승급
      runs: num(m.runs),
      wins: num(m.wins),
      bestStage: num(m.bestStage),
    };
  }

  function isUnlocked(meta, tenantId) {
    return normalize(meta).unlocked.includes(tenantId);
  }
  function unlockCost(tenantId) {
    const t = TEN[tenantId];
    return t ? t.cost : Infinity;
  }
  function unlockTenant(meta, tenantId) {
    const m = normalize(meta);
    const t = TEN[tenantId];
    if (!t || m.unlocked.includes(tenantId)) return { ok: false, meta: m };
    if (m.deeds < t.cost) return { ok: false, meta: m };
    m.deeds -= t.cost;
    m.unlocked = m.unlocked.concat(tenantId);
    return { ok: true, meta: m };
  }

  // 승급은 이겨야 열린다. maxAscension 은 "다음에 도전 가능한 최고 단계".
  function availableAscension(meta) {
    return normalize(meta).maxAscension;
  }
  function canPlayAscension(meta, lv) {
    const n = Math.floor(Number(lv) || 0);
    return n >= 0 && n <= availableAscension(meta);
  }

  // ── 판 종료 정산 ───────────────────────────────────────────────
  // 이기든 지든 조각이 남아야 "한 판 더" 가 성립한다.
  function deedsEarned(result) {
    const r = result && typeof result === 'object' ? result : {};
    const stage = Math.max(0, Math.floor(Number(r.stage) || 0));
    const asc = Math.max(0, Math.floor(Number(r.ascension) || 0));
    const base = stage * 4;
    const winBonus = r.won ? 30 : 0;
    const ascBonus = Math.round((base + winBonus) * asc * 0.15);   // 높은 승급일수록 더 준다
    return Math.max(1, base + winBonus + ascBonus);
  }

  // 판이 끝났을 때 메타를 갱신한다 (조각 지급 + 기록 + 승급 해금)
  function finishRun(meta, result) {
    const m = normalize(meta);
    const r = result && typeof result === 'object' ? result : {};
    const gained = deedsEarned(r);
    m.deeds += gained;
    m.runs += 1;
    const stage = Math.max(0, Math.floor(Number(r.stage) || 0));
    if (stage > m.bestStage) m.bestStage = stage;
    if (r.won) {
      m.wins += 1;
      // 이 승급을 이겼으면 다음 승급이 열린다
      const asc = Math.max(0, Math.floor(Number(r.ascension) || 0));
      if (asc >= m.maxAscension && m.maxAscension < MAX_ASCENSION) m.maxAscension += 1;
    }
    return { meta: m, gained };
  }

  // ── Run 에 넘길 옵션 합성 ──────────────────────────────────────
  // 세입자 + 승급 누적을 하나로 합친다. Run 은 이 결과만 읽는다.
  function runOptions(tenantId, ascension) {
    const o = {
      startCoins: 0, deckCapBonus: 0, draftBonus: 0, jackpotMult: 1,
      rentMult: 1, rentGrowth: 0, skipMult: 1, eventMult: 1,
      spinsPerRent: 0, relicChoices: 0, winStage: 0,
      startDeck: null, extraStart: [],
    };
    const merge = (src) => {
      if (!src) return;
      if (src.startCoins)    o.startCoins += src.startCoins;
      if (src.deckCapBonus)  o.deckCapBonus += src.deckCapBonus;
      if (src.draftBonus)    o.draftBonus += src.draftBonus;
      if (src.jackpotMult != null) o.jackpotMult *= src.jackpotMult;
      if (src.rentMult)      o.rentMult *= src.rentMult;
      if (src.rentGrowth)    o.rentGrowth += src.rentGrowth;
      if (src.skipMult != null)    o.skipMult *= src.skipMult;
      if (src.eventMult)     o.eventMult *= src.eventMult;
      if (src.spinsPerRent)  o.spinsPerRent += src.spinsPerRent;
      if (src.relicChoices)  o.relicChoices += src.relicChoices;
      if (src.winStage)      o.winStage = src.winStage;
      if (src.startDeck)     o.startDeck = src.startDeck.slice();
      if (src.extraStart)    o.extraStart = o.extraStart.concat(src.extraStart);
    };
    merge(TEN[tenantId] && TEN[tenantId].opts);
    const asc = Math.max(0, Math.min(MAX_ASCENSION, Math.floor(Number(ascension) || 0)));
    for (const a of ASCENSIONS) if (a.lv <= asc) merge(a.opts);
    o.ascension = asc;
    o.tenant = TEN[tenantId] ? tenantId : TENANTS[0].id;
    return o;
  }

  // 지금 고른 조합이 실제로 무엇을 바꾸는지 사람 말로 (선택 화면에서 보여준다)
  function describeAscension(lv) {
    const n = Math.max(0, Math.min(MAX_ASCENSION, Math.floor(Number(lv) || 0)));
    return ASCENSIONS.filter((a) => a.lv <= n).map((a) => `승급 ${a.lv} — ${a.desc}`);
  }

  const api = {
    TENANTS, TEN, ASCENSIONS, MAX_ASCENSION,
    normalize, isUnlocked, unlockCost, unlockTenant,
    availableAscension, canPlayAscension,
    deedsEarned, finishRun, runOptions, describeAscension,
  };
  if (typeof window !== 'undefined') window.JackpotMeta = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
