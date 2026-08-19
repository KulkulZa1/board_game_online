/* 식물 키우기 — 환생(Prestige) 순수 로직
 *
 * 왜 드래프트가 아니라 환생인가: 이 게임은 이미 방치형 업그레이드 구조를 갖고 있다.
 * 여기에 스네이크/벽돌깨기식 드래프트를 얹으면 성격이 어긋난다. 클리커에서
 * "다시 처음부터"를 즐겁게 만드는 정석은 환생이다 — 진행을 리셋하는 대신
 * 영구히 남는 힘을 얻어, 다음 회차가 눈에 띄게 빨라지는 구조.
 *
 * 리셋은 플레이어의 진행을 지우는 행위라 함부로 하면 안 된다. 그래서
 *   - 환생은 반드시 명시적으로 확인받고 (게임 쪽 UI 책임)
 *   - 얻을 정수를 미리 보여주며
 *   - 업적·특성·정수·회차는 절대 지우지 않는다 (아래 applyRebirth 가 보장)
 *
 * 브라우저와 node 양쪽에서 쓰인다 (prototypes/plant-prestige-test.js).
 */
(function () {
  'use strict';

  // 첫 환생은 게임을 충분히 본 뒤에 열린다 (꽃 단계 = index 4)
  const FIRST_REBIRTH_STAGE = 4;
  const ESSENCE_DIVISOR = 150;

  // ── 영구 특성 ──────────────────────────────────────────────────
  const TRAITS = [
    { id: 'fertile', name: '비옥한 대지', icon: '🌍', max: 10,
      cost: (lv) => 3 + lv * 2,
      desc: (lv) => `성장 속도 +${lv * 12}%` },
    { id: 'photo',   name: '광합성 유전자', icon: '☀️', max: 8,
      cost: (lv) => 4 + lv * 3,
      desc: (lv) => `초당 햇빛 +${(lv * 0.4).toFixed(1)}` },
    { id: 'roots',   name: '깊은 뿌리', icon: '🌿', max: 5,
      cost: (lv) => 5 + lv * 4,
      desc: (lv) => `환생 후 물·햇빛·양분 각 +${lv * 25}로 시작` },
    { id: 'bounty',  name: '풍요의 씨앗', icon: '🌰', max: 5,
      cost: (lv) => 8 + lv * 6,
      desc: (lv) => `환생 시 정수 획득 +${lv * 20}%` },
    { id: 'memory',  name: '기억하는 줄기', icon: '🧬', max: 3,
      cost: (lv) => 12 + lv * 10,
      desc: (lv) => `환생 후 ${lv}단계부터 시작` },
  ];
  const T = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

  // 저장값은 조작되거나 깨질 수 있다 — 항상 정규화해서 읽는다
  function normalizePrestige(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const traits = {};
    for (const t of TRAITS) {
      const lv = Math.max(0, Math.min(t.max, (p.traits && p.traits[t.id]) | 0));
      if (lv > 0) traits[t.id] = lv;
    }
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
    return {
      essence: Math.floor(num(p.essence)),
      lifetimeGrowth: num(p.lifetimeGrowth),
      rebirths: Math.floor(num(p.rebirths)),
      traits,
    };
  }

  function traitLevel(prestige, id) {
    return normalizePrestige(prestige).traits[id] || 0;
  }

  // ── 정수 계산 ──────────────────────────────────────────────────
  // 누적 성장에 제곱근을 씌워 초반은 빠르게, 후반은 완만하게 오른다.
  function essenceFor(lifetimeGrowth, prestige) {
    const g = Number(lifetimeGrowth);
    if (!Number.isFinite(g) || g <= 0) return 0;
    const bonus = 1 + traitLevel(prestige, 'bounty') * 0.20;
    return Math.floor(Math.sqrt(g / ESSENCE_DIVISOR) * bonus);
  }

  // 지금 환생하면 얼마를 받는가 (미리보기용 — UI 가 그대로 보여준다)
  function pendingEssence(save, prestige) {
    return essenceFor((save && save.lifetimeGrowth) || 0, prestige);
  }

  // 환생 가능한가. 첫 회차는 꽃 단계를 봐야 열리고, 이후엔 정수가 1 이상이면 된다.
  function canRebirth(save, prestige) {
    const p = normalizePrestige(prestige);
    const gain = pendingEssence(save, p);
    if (gain < 1) return false;
    if (p.rebirths === 0 && ((save && save.stageIdx) | 0) < FIRST_REBIRTH_STAGE) return false;
    return true;
  }

  function rebirthBlockReason(save, prestige) {
    const p = normalizePrestige(prestige);
    if (p.rebirths === 0 && ((save && save.stageIdx) | 0) < FIRST_REBIRTH_STAGE) {
      return '꽃 단계까지 키우면 환생할 수 있습니다';
    }
    if (pendingEssence(save, p) < 1) return '조금 더 키우면 정수를 얻을 수 있습니다';
    return null;
  }

  // ── 환생 실행 ──────────────────────────────────────────────────
  // 새 저장값과 새 환생 상태를 함께 돌려준다. 원본은 건드리지 않는다.
  // 지워지는 것: 자원·성장·단계·업그레이드
  // 남는 것: 업적·돌파·정수·특성·회차·누적 성장·총 클릭
  function applyRebirth(save, prestige, freshSave) {
    const p = normalizePrestige(prestige);
    const gain = pendingEssence(save, p);
    if (!canRebirth(save, p)) return { ok: false, save, prestige: p, gained: 0 };

    const base = freshSave && typeof freshSave === 'object' ? freshSave : {};
    const startRes = (p.traits.roots || 0) * 25;
    const next = {
      ...base,
      water: startRes,
      sun: startRes,
      nutrient: startRes,
      star: (save && save.star) | 0,          // 별은 희귀 재화라 유지한다
      growth: 0,
      stageIdx: Math.min(p.traits.memory || 0, (base.stageIdx | 0) + (p.traits.memory || 0)),
      upgrades: {},
      // 아래는 플레이어의 기록이다 — 환생으로 지우지 않는다
      achievements: Array.isArray(save && save.achievements) ? save.achievements.slice() : [],
      breakthroughs: Array.isArray(save && save.breakthroughs) ? save.breakthroughs.slice() : [],
      totalClicks: (save && save.totalClicks) | 0,
      lifetimeGrowth: 0,                       // 다음 회차의 정수는 다시 쌓는다
      lastSave: Date.now(),
    };
    const nextPrestige = {
      essence: p.essence + gain,
      lifetimeGrowth: p.lifetimeGrowth + (((save && save.lifetimeGrowth) || 0)),
      rebirths: p.rebirths + 1,
      traits: { ...p.traits },
    };
    return { ok: true, save: next, prestige: nextPrestige, gained: gain };
  }

  // ── 특성 구매 ──────────────────────────────────────────────────
  function traitCost(id, prestige) {
    const t = T[id];
    if (!t) return Infinity;
    const p = normalizePrestige(prestige);
    const lv = p.traits[id] || 0;
    if (lv >= t.max) return Infinity;
    return t.cost(lv);
  }
  function buyTrait(prestige, id) {
    const p = normalizePrestige(prestige);
    const cost = traitCost(id, p);
    if (!isFinite(cost) || p.essence < cost) return { ok: false, prestige: p };
    p.essence -= cost;
    p.traits[id] = (p.traits[id] || 0) + 1;
    return { ok: true, prestige: p };
  }

  // ── 특성이 주는 보정 (게임 루프가 이것만 읽는다) ────────────────
  // ── 자원 경제 부트스트랩 ──────────────────────────────────────
  // 클릭은 물만이 아니라 햇빛·영양분도 조금씩 벌어야 한다. 셋 다 "자기 자신이
  // 비용인 업그레이드"로만 벌리기 때문에, 여기 기본 수입이 없으면 신규 세이브에서
  // 업그레이드 7종 중 5종·돌파 5종 중 3종·성장 폭발이 전부 영구 잠금이 된다
  // (실제로 그렇게 출시됐었다 — 회귀 테스트가 이 값을 지킨다).
  const CLICK_YIELD = { sun: 0.3, nutrient: 0.15 };

  // 단계 달성 보너스 — 축하 + 다음 티어 업그레이드의 마중물
  function stageBundle(idx) {
    const i = Math.max(0, idx | 0);
    if (!i) return { water: 0, sun: 0, nutrient: 0, star: 0 };
    return { water: 15 * i, sun: 10 * i, nutrient: 7 * i, star: 0.4 * i };
  }

  function bonuses(prestige) {
    const p = normalizePrestige(prestige);
    return {
      growthMult: 1 + (p.traits.fertile || 0) * 0.12,
      sunPerSec: (p.traits.photo || 0) * 0.4,
      startResource: (p.traits.roots || 0) * 25,
      startStage: p.traits.memory || 0,
      essenceMult: 1 + (p.traits.bounty || 0) * 0.20,
    };
  }

  const api = {
    TRAITS, T, FIRST_REBIRTH_STAGE, ESSENCE_DIVISOR, CLICK_YIELD, stageBundle,
    normalizePrestige, traitLevel, essenceFor, pendingEssence,
    canRebirth, rebirthBlockReason, applyRebirth, traitCost, buyTrait, bonuses,
  };
  if (typeof window !== 'undefined') window.PlantPrestige = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
