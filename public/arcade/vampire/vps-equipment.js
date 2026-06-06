// 뱀파이어 서바이버 — 장비·젬·세트 효과 시스템 (순수 데이터, 게임 상태 비의존)
// game.js 보다 먼저 로드되어 window.VPS.equipment 로 노출된다.
// 새 세트/젬/교차 시너지 추가: 해당 섹션에 항목만 추가하면 game.js 수정 불필요.
(function () {
  'use strict';
  window.VPS = window.VPS || {};

  // ── 등급 정의 ──────────────────────────────────────────────────────
  const GRADES = {
    normal:  { label: '일반', color: '#9e9e9e', maxGems: 0, statMult: 1.00 },
    rare:    { label: '희귀', color: '#4fc3f7', maxGems: 1, statMult: 1.18 },
    unique:  { label: '고유', color: '#ffd700', maxGems: 2, statMult: 1.35 },
    legend:  { label: '전설', color: '#ff9800', maxGems: 3, statMult: 1.55 },
    mystic:  { label: '신비', color: '#ce93d8', maxGems: 4, statMult: 1.78 },
    antique: { label: '고대', color: '#ef5350', maxGems: 5, statMult: 2.10 },
  };
  const GRADE_ORDER = ['normal', 'rare', 'unique', 'legend', 'mystic', 'antique'];

  // ── 아이템 기본 템플릿 (슬롯별) ────────────────────────────────────
  // stats 키:
  //   dmgMult, rangeMult, cdMult, speedMult — 곱연산 (1보다 큰 값)
  //   hpBonus, defenseAbs, chainBonus        — 덧셈 (절대값)
  //   critChance                             — 덧셈 (확률, 0~1)
  //   xpRangeMult, aoeMult, burnDmgMult,
  //   freezeMult, chainDmgMult, frozenDmgMult — 곱연산
  const EQUIP_BASES = {
    helm: [
      { id: 'iron_helm',    icon: '🪖', name: '철 투구',     set: null,     stats: { hpBonus: 20, xpRangeMult: 1.06 } },
      { id: 'mage_crown',   icon: '👑', name: '마법사 왕관', set: null,     stats: { xpRangeMult: 1.14, cdMult: 0.94 } },
      { id: 'zeus_helm',    icon: '⚡', name: '제우스 투구', set: 'zeus',   stats: { hpBonus: 15, chainBonus: 1 } },
      { id: 'dragon_helm',  icon: '🐉', name: '드래곤 투구', set: 'dragon', stats: { hpBonus: 22, aoeMult: 1.10 } },
      { id: 'shadow_helm',  icon: '🌑', name: '그림자 투구', set: 'shadow', stats: { critChance: 0.08, speedMult: 1.05 } },
      { id: 'frost_helm',   icon: '❄',  name: '서리 투구',   set: 'frost',  stats: { freezeMult: 1.20, hpBonus: 14 } },
      { id: 'titan_helm',   icon: '🏛',  name: '티탄 투구',   set: 'titan',  stats: { hpBonus: 40, defenseAbs: 5 } },
    ],
    armor: [
      { id: 'leather_armor',icon: '🧥', name: '가죽 갑옷',   set: null,     stats: { defenseAbs: 8 } },
      { id: 'robes',        icon: '🧣', name: '마법 로브',   set: null,     stats: { cdMult: 0.92, rangeMult: 1.08 } },
      { id: 'zeus_armor',   icon: '⚡', name: '제우스 갑옷', set: 'zeus',   stats: { defenseAbs: 5, chainBonus: 1 } },
      { id: 'dragon_armor', icon: '🐉', name: '드래곤 갑옷', set: 'dragon', stats: { defenseAbs: 10, burnDmgMult: 1.16 } },
      { id: 'shadow_armor', icon: '🌑', name: '그림자 갑옷', set: 'shadow', stats: { defenseAbs: 4, critChance: 0.06 } },
      { id: 'frost_armor',  icon: '❄',  name: '서리 갑옷',   set: 'frost',  stats: { defenseAbs: 8, freezeMult: 1.15 } },
      { id: 'titan_armor',  icon: '🏛',  name: '티탄 갑옷',   set: 'titan',  stats: { defenseAbs: 18, hpBonus: 20 } },
    ],
    boots: [
      { id: 'leather_boots',icon: '👟', name: '가죽 부츠',   set: null,     stats: { speedMult: 1.08 } },
      { id: 'swift_boots',  icon: '💨', name: '질풍 부츠',   set: null,     stats: { speedMult: 1.15, cdMult: 0.96 } },
      { id: 'zeus_boots',   icon: '⚡', name: '제우스 부츠', set: 'zeus',   stats: { speedMult: 1.10, chainBonus: 1 } },
      { id: 'dragon_boots', icon: '🐉', name: '드래곤 부츠', set: 'dragon', stats: { speedMult: 1.08, aoeMult: 1.08 } },
      { id: 'shadow_boots', icon: '🌑', name: '그림자 부츠', set: 'shadow', stats: { speedMult: 1.12, critChance: 0.05 } },
      { id: 'frost_boots',  icon: '❄',  name: '서리 부츠',   set: 'frost',  stats: { speedMult: 1.06, freezeMult: 1.10 } },
      { id: 'titan_boots',  icon: '🏛',  name: '티탄 부츠',   set: 'titan',  stats: { speedMult: 1.04, defenseAbs: 6 } },
    ],
    ring: [
      { id: 'iron_ring',    icon: '💍', name: '철 반지',     set: null,     stats: { dmgMult: 1.08 } },
      { id: 'sniper_ring',  icon: '🎯', name: '저격수 반지', set: null,     stats: { rangeMult: 1.15, dmgMult: 1.05 } },
      { id: 'zeus_ring',    icon: '⚡', name: '제우스 반지', set: 'zeus',   stats: { dmgMult: 1.10, chainBonus: 1 } },
      { id: 'dragon_ring',  icon: '🐉', name: '드래곤 반지', set: 'dragon', stats: { dmgMult: 1.12, aoeMult: 1.12 } },
      { id: 'shadow_ring',  icon: '🌑', name: '그림자 반지', set: 'shadow', stats: { dmgMult: 1.10, critChance: 0.10 } },
      { id: 'frost_ring',   icon: '❄',  name: '서리 반지',   set: 'frost',  stats: { rangeMult: 1.10, freezeMult: 1.15 } },
      { id: 'titan_ring',   icon: '🏛',  name: '티탄 반지',   set: 'titan',  stats: { dmgMult: 1.06, defenseAbs: 8, hpBonus: 15 } },
    ],
  };

  // ── 젬 정의 ────────────────────────────────────────────────────────
  const GEM_DEFS = [
    { id: 'ruby',       icon: '🔴', name: '루비',       rarity: 'common',    stats: { dmgMult: 1.08 } },
    { id: 'sapphire',   icon: '🔵', name: '사파이어',   rarity: 'common',    stats: { rangeMult: 1.08 } },
    { id: 'topaz',      icon: '🟡', name: '토파즈',     rarity: 'common',    stats: { cdMult: 0.93 } },
    { id: 'emerald',    icon: '🟢', name: '에메랄드',   rarity: 'common',    stats: { speedMult: 1.05 } },
    { id: 'pearl',      icon: '⚪', name: '진주',       rarity: 'uncommon',  stats: { hpBonus: 12 } },
    { id: 'amethyst',   icon: '🟣', name: '자수정',     rarity: 'uncommon',  stats: { xpRangeMult: 1.07 } },
    { id: 'carnelian',  icon: '🔶', name: '홍옥수',     rarity: 'rare',      stats: { critChance: 0.05 } },
    { id: 'obsidian',   icon: '⚫', name: '흑요석',     rarity: 'rare',      stats: { defenseAbs: 4 } },
    { id: 'diamond',    icon: '💎', name: '다이아몬드', rarity: 'epic',      stats: { dmgMult: 1.18, rangeMult: 1.10 } },
    { id: 'void_shard', icon: '🌑', name: '공허 파편',  rarity: 'legendary', stats: { dmgMult: 1.25, critChance: 0.08, cdMult: 0.90 } },
  ];

  // ── 세트 정의 ──────────────────────────────────────────────────────
  // effects 키는 game.js의 setEffects 오브젝트에 병합된다.
  // crossEffect 값은 CROSS_SYNERGIES[*].id 와 매핑된다.
  const SET_DEFS = [
    {
      id: 'zeus', name: '제우스 세트', icon: '⚡',
      pieces: ['zeus_helm', 'zeus_armor', 'zeus_boots', 'zeus_ring'],
      bonuses: [
        { pieces: 2, desc: '번개/연쇄 피해 +20%',                       effects: { chainDmgMult: 1.20 } },
        { pieces: 4, desc: '연쇄 +2, 화살 적중 → 연쇄 번개',            effects: { chainBounceBonus: 2, crossEffect_zeus_arrow_chain: true } },
      ],
    },
    {
      id: 'dragon', name: '드래곤 세트', icon: '🐉',
      pieces: ['dragon_helm', 'dragon_armor', 'dragon_boots', 'dragon_ring'],
      bonuses: [
        { pieces: 2, desc: '화염/폭발 피해 +25%, AoE +20%',              effects: { burnDmgMult: 1.25, novaRangeMult: 1.20 } },
        { pieces: 4, desc: 'AoE +30%, 화상 적 사망 시 주변 점화',         effects: { aoeMult: 1.30, crossEffect_dragon_burn_spread: true } },
      ],
    },
    {
      id: 'shadow', name: '그림자 세트', icon: '🌑',
      pieces: ['shadow_helm', 'shadow_armor', 'shadow_boots', 'shadow_ring'],
      bonuses: [
        { pieces: 2, desc: '치명타 확률 +20%',                            effects: { critChance: 0.20 } },
        { pieces: 4, desc: '치명타 시 0.15초 무적 잔상',                  effects: { crossEffect_shadow_crit_dash: true } },
      ],
    },
    {
      id: 'frost', name: '서리 세트', icon: '❄',
      pieces: ['frost_helm', 'frost_armor', 'frost_boots', 'frost_ring'],
      bonuses: [
        { pieces: 2, desc: '빙결 지속 +30%, 빙결 적 피해 +25%',           effects: { freezeMult: 1.30, frozenDmgMult: 1.25 } },
        { pieces: 4, desc: '궤도 구체 15% 확률 빙결',                     effects: { crossEffect_frost_orb_freeze: true } },
      ],
    },
    {
      id: 'titan', name: '티탄 세트', icon: '🏛',
      pieces: ['titan_helm', 'titan_armor', 'titan_boots', 'titan_ring'],
      bonuses: [
        { pieces: 2, desc: '피해 감소 20%, 최대 체력 +40',                 effects: { damageReductionPct: 0.20, hpBonus: 40 } },
        { pieces: 4, desc: '방패 활성 중 가시 오라 (초당 15 피해)',         effects: { crossEffect_titan_thorns: true } },
      ],
    },
  ];

  // ── 교차 시너지 (세트 + 무기 조합) ───────────────────────────────
  // requires.setEffect 키는 SET_DEFS.bonuses.effects 에서 crossEffect_* 로 기록된다.
  // effect 는 game.js 의 applyCrossEffect(key, ctx) 에서 분기 처리된다.
  const CROSS_SYNERGIES = [
    {
      id: 'zeus_arrow_chain',
      name: '⚡ 번개 화살',
      desc: '화살·폭풍의 활 적중 시 주변 2명에게 45% 피해 연쇄 번개',
      requires: { setEffect: 'crossEffect_zeus_arrow_chain' },
      effect: 'arrow_on_hit_chain',
    },
    {
      id: 'zeus_crit_nova',
      name: '⚡ 제우스의 분노',
      desc: '치명타 발동 시 75px 번개 소폭발',
      requires: { set: 'zeus', minPieces: 4 },
      effect: 'crit_lightning_nova',
    },
    {
      id: 'dragon_burn_spread',
      name: '🐉 용의 숨결',
      desc: '화상 적 사망 시 주변 80px에 화상 전파',
      requires: { setEffect: 'crossEffect_dragon_burn_spread' },
      effect: 'burn_on_kill_spread',
    },
    {
      id: 'shadow_crit_dash',
      name: '🌑 그림자 보법',
      desc: '치명타 발동 시 0.15초 무적 잔상',
      requires: { setEffect: 'crossEffect_shadow_crit_dash' },
      effect: 'crit_shadow_dash',
    },
    {
      id: 'frost_orb_freeze',
      name: '❄ 빙하 구체',
      desc: '궤도 구체 적중 시 15% 확률로 1.2초 빙결',
      requires: { setEffect: 'crossEffect_frost_orb_freeze' },
      effect: 'orb_on_hit_freeze',
    },
    {
      id: 'titan_thorns',
      name: '🏛 티탄의 가시',
      desc: '방패(이지스) 활성 중 근접 적에게 초당 15 피해',
      requires: { setEffect: 'crossEffect_titan_thorns' },
      effect: 'shield_aoe_thorns',
    },
  ];

  // ── 등급 드롭 가중치 ───────────────────────────────────────────────
  const GRADE_WEIGHTS = [
    { grade: 'normal',  weight: 40 },
    { grade: 'rare',    weight: 28 },
    { grade: 'unique',  weight: 16 },
    { grade: 'legend',  weight: 10 },
    { grade: 'mystic',  weight: 4 },
    { grade: 'antique', weight: 2 },
  ];
  const GRADE_TOTAL = GRADE_WEIGHTS.reduce((s, w) => s + w.weight, 0);

  // ── 유틸 함수 ──────────────────────────────────────────────────────

  function rollGrade(forceGrade) {
    if (forceGrade) return forceGrade;
    let r = Math.random() * GRADE_TOTAL;
    for (const { grade, weight } of GRADE_WEIGHTS) {
      r -= weight;
      if (r <= 0) return grade;
    }
    return 'normal';
  }

  // 랜덤 아이템 생성 — 슬롯과 등급을 받아 stat 스케일된 아이템 인스턴스 반환
  function rollItem(slot, forceGrade) {
    const bases = EQUIP_BASES[slot];
    if (!bases || !bases.length) return null;
    const grade   = rollGrade(forceGrade);
    const gradeInfo = GRADES[grade];
    const base    = bases[Math.floor(Math.random() * bases.length)];
    const mult    = gradeInfo.statMult;

    const scaledStats = {};
    for (const [k, v] of Object.entries(base.stats)) {
      if (k === 'chainBonus') {
        scaledStats[k] = v;
        continue;
      }
      // 곱연산 스탯: 1보다 큰 값은 편차(v-1)에 mult 적용, 1보다 작으면 편차(1-v)에 mult
      if (typeof v === 'number') {
        if (v >= 1) {
          scaledStats[k] = Math.round((1 + (v - 1) * mult) * 1000) / 1000;
        } else {
          // critChance, hpBonus, defenseAbs 등 덧셈 스탯은 양수 스케일
          scaledStats[k] = Math.round(v * mult * 1000) / 1000;
        }
      } else {
        scaledStats[k] = v;
      }
    }

    return {
      id:    base.id,
      slot,
      grade,
      name:  `[${gradeInfo.label}] ${base.icon} ${base.name}`,
      icon:  base.icon,
      set:   base.set,
      stats: scaledStats,
      gems:  new Array(gradeInfo.maxGems).fill(null),
    };
  }

  // 랜덤 젬 생성
  function rollGem(forceRarity) {
    const rarityWeights = { common: 60, uncommon: 22, rare: 12, epic: 4, legendary: 2 };
    const total = Object.values(rarityWeights).reduce((a, b) => a + b, 0);
    let rarity = forceRarity;
    if (!rarity) {
      let r = Math.random() * total;
      for (const [key, weight] of Object.entries(rarityWeights)) {
        r -= weight;
        if (r <= 0) { rarity = key; break; }
      }
      rarity = rarity || 'common';
    }
    const pool = GEM_DEFS.filter(g => g.rarity === rarity);
    if (!pool.length) return null;
    return Object.assign({}, pool[Math.floor(Math.random() * pool.length)]);
  }

  // 장착된 아이템(+젬) 전체의 집계 스탯 반환
  // Returns: { rangeMult, dmgMult, cdMult, speedMult, hpBonus, xpRangeMult,
  //            critChance, defenseAbs, chainBonus, aoeMult, burnDmgMult, freezeMult,
  //            chainDmgMult, frozenDmgMult, damageReductionPct, novaRangeMult }
  function getEquipStats(equip) {
    const out = {
      rangeMult: 1, dmgMult: 1, cdMult: 1, speedMult: 1,
      hpBonus: 0,  xpRangeMult: 1, critChance: 0, defenseAbs: 0,
      chainBonus: 0, aoeMult: 1, burnDmgMult: 1, freezeMult: 1,
      chainDmgMult: 1, frozenDmgMult: 1, damageReductionPct: 0, novaRangeMult: 1,
    };
    if (!equip) return out;
    for (const slot of ['helm', 'armor', 'boots', 'ring']) {
      const item = equip[slot];
      if (!item) continue;
      _applyStats(out, item.stats);
      for (const gem of item.gems) {
        if (gem) _applyStats(out, gem.stats);
      }
    }
    return out;
  }

  function _applyStats(out, stats) {
    if (!stats) return;
    for (const [k, v] of Object.entries(stats)) {
      if (!(k in out)) continue;
      // 덧셈 스탯
      if (k === 'hpBonus' || k === 'defenseAbs' || k === 'chainBonus' ||
          k === 'critChance' || k === 'damageReductionPct') {
        out[k] += v;
      } else {
        out[k] *= v;
      }
    }
  }

  // 세트 조각 수 계산
  function countSetPieces(equip, setId) {
    if (!equip) return 0;
    const setDef = SET_DEFS.find(s => s.id === setId);
    if (!setDef) return 0;
    let count = 0;
    for (const slot of ['helm', 'armor', 'boots', 'ring']) {
      if (equip[slot] && equip[slot].set === setId) count++;
    }
    return count;
  }

  // 활성 세트 효과 플랫 오브젝트 반환 — setEffects 로 player 에 캐시됨
  function getActiveSetEffects(equip) {
    const out = {};
    for (const setDef of SET_DEFS) {
      const pieces = countSetPieces(equip, setDef.id);
      for (const bonus of setDef.bonuses) {
        if (pieces >= bonus.pieces) {
          Object.assign(out, bonus.effects);
        }
      }
    }
    return out;
  }

  // 활성 교차 시너지 effect 키 목록
  function getActiveCrossEffects(equip) {
    const setFx = getActiveSetEffects(equip);
    const active = [];
    for (const cs of CROSS_SYNERGIES) {
      if (cs.requires.setEffect && setFx[cs.requires.setEffect]) {
        active.push(cs.effect);
      }
    }
    return active;
  }

  // 세트 정보를 포함한 활성 보너스 목록 (UI 표시용)
  function getActiveBonusDescriptions(equip) {
    const result = [];
    for (const setDef of SET_DEFS) {
      const pieces = countSetPieces(equip, setDef.id);
      for (const bonus of setDef.bonuses) {
        result.push({
          set:  setDef.id,
          icon: setDef.icon,
          name: setDef.name,
          desc: bonus.desc,
          active: pieces >= bonus.pieces,
          need: bonus.pieces,
          have: pieces,
        });
      }
    }
    return result;
  }

  function gradeIndex(grade) { return GRADE_ORDER.indexOf(grade); }

  window.VPS.equipment = {
    GRADES, GRADE_ORDER, EQUIP_BASES, GEM_DEFS, SET_DEFS, CROSS_SYNERGIES,
    rollItem, rollGem,
    getEquipStats, getActiveSetEffects, getActiveCrossEffects,
    getActiveBonusDescriptions, countSetPieces, gradeIndex,
  };
})();
