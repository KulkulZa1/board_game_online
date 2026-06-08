// vps-equipment.js — PoE-style equipment system (data + logic only)
// Loaded before game.js; exposes window.VPS.equipment
(function () {
  'use strict';

  const GRADES = [
    { id: 'normal',  name: '일반',   color: '#aaa',    statMult: 1.00, maxGems: 0 },
    { id: 'rare',    name: '희귀',   color: '#3498db', statMult: 1.25, maxGems: 1 },
    { id: 'unique',  name: '고유',   color: '#e67e22', statMult: 1.50, maxGems: 2 },
    { id: 'legend',  name: '전설',   color: '#9b59b6', statMult: 1.75, maxGems: 3 },
    { id: 'mystic',  name: '신비',   color: '#1abc9c', statMult: 1.90, maxGems: 4 },
    { id: 'antique', name: '유물',   color: '#f1c40f', statMult: 2.10, maxGems: 5 },
  ];

  // Base item definitions per slot
  const SLOT_ITEMS = {
    helm: [
      { id: 'iron_helm',    name: '철 투구',    icon: '⛑',  stats: { maxHp: 30 } },
      { id: 'leather_cap',  name: '가죽 모자',  icon: '🎩',  stats: { cdMult: 0.94 } },
      { id: 'arcane_crown', name: '마법 왕관',  icon: '👑',  stats: { dmgMult: 1.12 } },
      { id: 'war_helm',     name: '전쟁 투구',  icon: '🪖',  stats: { maxHp: 20, dmgMult: 1.06 } },
      { id: 'scout_hood',   name: '정찰병 후드', icon: '🧢',  stats: { xpRange: 1.15 } },
      { id: 'sage_diadem',  name: '현자의 왕관', icon: '💎',  stats: { cdMult: 0.90, xpRange: 1.10 } },
      { id: 'void_helm',    name: '공허 투구',  icon: '🌑',  stats: { dmgMult: 1.18, maxHp: -10 } },
    ],
    armor: [
      { id: 'iron_armor',   name: '철 갑옷',    icon: '🛡',  stats: { maxHp: 40 } },
      { id: 'silk_robe',    name: '비단 로브',  icon: '👘',  stats: { cdMult: 0.92 } },
      { id: 'chain_mail',   name: '체인 갑옷',  icon: '⚙',   stats: { maxHp: 25, dmgMult: 1.07 } },
      { id: 'battle_plate', name: '전투 판금',  icon: '🪤',  stats: { maxHp: 60 } },
      { id: 'mage_coat',    name: '마법사 코트', icon: '🧥',  stats: { dmgMult: 1.14, cdMult: 0.96 } },
      { id: 'shadow_vest',  name: '그림자 조끼', icon: '🦺',  stats: { xpRange: 1.12, cdMult: 0.93 } },
      { id: 'titan_plate',  name: '거인 판금',  icon: '🏛',  stats: { maxHp: 80, dmgMult: 0.95 } },
    ],
    boots: [
      { id: 'iron_boots',   name: '철 장화',    icon: '👢',  stats: { speedMult: 1.08 } },
      { id: 'swift_shoes',  name: '빠른 신발',  icon: '👟',  stats: { speedMult: 1.15 } },
      { id: 'heavy_greaves',name: '중갑 경갑',  icon: '🥾',  stats: { maxHp: 20, speedMult: 1.04 } },
      { id: 'winged_boots', name: '날개 신발',  icon: '🪶',  stats: { speedMult: 1.20, rangeBonus: 1.06 } },
      { id: 'arcane_steps', name: '마법 발걸음', icon: '✨',  stats: { cdMult: 0.93, speedMult: 1.08 } },
      { id: 'sprint_boots', name: '질주 장화',  icon: '⚡',  stats: { speedMult: 1.18, xpRange: 1.08 } },
      { id: 'titan_sabatons',name: '거인 발판', icon: '🪨',  stats: { maxHp: 35, speedMult: 1.05 } },
    ],
    ring: [
      { id: 'iron_ring',    name: '철 반지',    icon: '⭕',  stats: { dmgMult: 1.08 } },
      { id: 'ruby_ring',    name: '루비 반지',  icon: '💍',  stats: { dmgMult: 1.12 } },
      { id: 'sapphire_ring',name: '사파이어 반지', icon: '🔵', stats: { rangeBonus: 1.12 } },
      { id: 'topaz_ring',   name: '황옥 반지',  icon: '🟡',  stats: { cdMult: 0.91 } },
      { id: 'emerald_ring', name: '에메랄드 반지', icon: '🟢', stats: { xpRange: 1.20 } },
      { id: 'obsidian_ring',name: '흑요석 반지', icon: '⚫',  stats: { dmgMult: 1.06, maxHp: 15 } },
      { id: 'void_ring',    name: '공허 반지',  icon: '🌑',  stats: { dmgMult: 1.20, cdMult: 0.88 } },
      { id: 'goblin_lucky_ring', name: '고블린 행운 반지', icon: '🍀', stats: { xpRange: 1.18, cdMult: 0.92 } },
    ],
  };
  // 고블린 세트 전용 아이템 — 기존 슬롯 배열에 추가
  SLOT_ITEMS.helm.push({ id: 'goblin_mask',  name: '고블린 마스크', icon: '🎭', stats: { xpRange: 1.15, cdMult: 0.94 } });
  SLOT_ITEMS.armor.push({ id: 'goblin_vest', name: '고블린 조끼',   icon: '🧤', stats: { speedMult: 1.10, dmgMult: 1.06 } });
  SLOT_ITEMS.boots.push({ id: 'goblin_boots',name: '고블린 단검화', icon: '👡', stats: { speedMult: 1.14, xpRange: 1.08 } });
  // 천공 세트 전용 아이템 — 사거리·공격력 중심
  SLOT_ITEMS.helm.push({ id: 'star_circlet',  name: '별빛 서클릿', icon: '⭐', stats: { rangeBonus: 1.10, dmgMult: 1.06 } });
  SLOT_ITEMS.armor.push({ id: 'comet_cloak',  name: '혜성 망토',   icon: '☄', stats: { dmgMult: 1.12, maxHp: 15 } });
  SLOT_ITEMS.boots.push({ id: 'astral_treads',name: '천체 보행화', icon: '🌠', stats: { speedMult: 1.10, rangeBonus: 1.08 } });
  SLOT_ITEMS.ring.push({ id: 'nebula_ring',   name: '성운 반지',   icon: '🌌', stats: { rangeBonus: 1.14, cdMult: 0.93 } });

  const GEM_DEFS = [
    { id: 'ruby',      icon: '🔴', name: '루비',       rarity: 'common',    stat: 'dmgMult',   val: 1.08 },
    { id: 'sapphire',  icon: '🔵', name: '사파이어',   rarity: 'common',    stat: 'rangeBonus',val: 1.08 },
    { id: 'topaz',     icon: '🟡', name: '황옥',       rarity: 'common',    stat: 'cdMult',    val: 0.93 },
    { id: 'emerald',   icon: '🟢', name: '에메랄드',   rarity: 'common',    stat: 'speedMult', val: 1.07 },
    { id: 'pearl',     icon: '⚪', name: '진주',       rarity: 'uncommon',  stat: 'maxHp',     val: 20 },
    { id: 'amethyst',  icon: '🟣', name: '자수정',     rarity: 'uncommon',  stat: 'xpRange',   val: 1.12 },
    { id: 'carnelian', icon: '🔶', name: '홍옥수',     rarity: 'uncommon',  stat: 'critChance',val: 0.08 },
    { id: 'obsidian',  icon: '⚫', name: '흑요석',     rarity: 'rare',      stat: 'maxHp',     val: 35 },
    { id: 'diamond',   icon: '💎', name: '다이아몬드', rarity: 'rare',      stat: 'dmgMult',   val: 1.12, also: { stat: 'rangeBonus', val: 1.06 } },
    { id: 'void_shard',icon: '🌑', name: '공허 파편',  rarity: 'epic',      stat: 'dmgMult',   val: 1.15, also: { stat: 'cdMult', val: 0.91 } },
    // ── 특수 젬 (Path of Exile 영감) — 스탯 대신 적중 시 특수 효과 부여 ──
    //   stat 없음 → getEquipStats 는 건너뛰고, game.js 가 effect 를 집계해 전투에 적용
    { id: 'chain_gem',   icon: '🔗', name: '연쇄',   rarity: 'special', effect: 'chain',   procChance: 0.28, val: 2,    desc: '28% 확률로 가까운 적 2명에게 번개 연쇄 (60% 피해)' },
    { id: 'cleave_gem',  icon: '🪓', name: '가르기', rarity: 'special', effect: 'cleave',  procChance: 1.0,  val: 0.45, desc: '적중 시 주변 적에게 45% 광역 분할 피해' },
    { id: 'freeze_gem',  icon: '❄',  name: '빙결',   rarity: 'special', effect: 'freeze',  procChance: 0.22, val: 1.3,  desc: '22% 확률로 1.3초 빙결' },
    { id: 'fork_gem',    icon: '🔱', name: '부채꼴', rarity: 'special', effect: 'fork',    procChance: 0.30, val: 3,    desc: '30% 확률로 3갈래 파편 발사 (50% 피해)' },
    { id: 'combust_gem', icon: '🔥', name: '점화',   rarity: 'special', effect: 'combust', procChance: 0.30, val: 2,    desc: '30% 확률로 화상 2중첩 부착 (화염 패시브 불필요)' },
    { id: 'shock_gem',   icon: '⚡', name: '감전',   rarity: 'special', effect: 'shock',   procChance: 0.25, val: 1.30, desc: '25% 확률로 3초간 적이 받는 피해 +30%' },
    { id: 'leech_gem',   icon: '🩸', name: '흡수',   rarity: 'special', effect: 'leech',   procChance: 1.0,  val: 0.04, desc: '적중 피해의 4%만큼 체력 회복' },
    { id: 'culling_gem', icon: '☠',  name: '참수',   rarity: 'special', effect: 'culling', procChance: 1.0,  val: 0.12, desc: '체력 12% 이하 적 즉시 처형' },
  ];

  // 5 set definitions — each with 2-piece and 4-piece bonuses
  const SET_DEFS = [
    {
      id: 'zeus', name: '⚡ 제우스', color: '#f1c40f',
      pieces: ['arcane_crown', 'silk_robe', 'arcane_steps', 'void_ring'],
      bonus2: { desc: '번개 연쇄 +2', effect: 'zeus_chain', val: 2 },
      bonus4: { desc: '치명타 적중 시 주변에 번개 폭발', effect: 'zeus_nova' },
    },
    {
      id: 'dragon', name: '🐉 드래곤', color: '#e74c3c',
      pieces: ['void_helm', 'mage_coat', 'winged_boots', 'ruby_ring'],
      bonus2: { desc: '공격력 +15%', effect: 'dmgMult', val: 1.15 },
      bonus4: { desc: '화염 적중 시 주변에 화염 확산', effect: 'dragon_spread' },
    },
    {
      id: 'shadow', name: '🌑 그림자', color: '#636e72',
      pieces: ['scout_hood', 'shadow_vest', 'swift_shoes', 'obsidian_ring'],
      bonus2: { desc: '이동 속도 +12%', effect: 'speedMult', val: 1.12 },
      bonus4: { desc: '치명타 적중 시 잔상 대쉬 발동', effect: 'shadow_dash' },
    },
    {
      id: 'frost', name: '❄ 서리', color: '#74b9ff',
      pieces: ['leather_cap', 'chain_mail', 'sprint_boots', 'sapphire_ring'],
      bonus2: { desc: '쿨다운 -10%', effect: 'cdMult', val: 0.90 },
      bonus4: { desc: '구슬 적중 시 주변 빙결', effect: 'frost_freeze' },
    },
    {
      id: 'titan', name: '🏛 거인', color: '#b2bec3',
      pieces: ['war_helm', 'titan_plate', 'titan_sabatons', 'topaz_ring'],
      bonus2: { desc: '최대 체력 +60', effect: 'maxHp', val: 60 },
      bonus4: { desc: '피격 시 주변에 가시 반격', effect: 'titan_thorns' },
    },
    {
      id: 'goblin', name: '💰 고블린', color: '#f1c40f',
      pieces: ['goblin_mask', 'goblin_vest', 'goblin_boots', 'goblin_lucky_ring'],
      bonus2: { desc: '이동 속도 +20%', effect: 'speedMult', val: 1.20 },
      bonus4: { desc: '획득 코인 +30%', effect: 'goblin_loot', val: 1.30 },
    },
    {
      id: 'celestial', name: '☄ 천공', color: '#00cec9',
      pieces: ['star_circlet', 'comet_cloak', 'astral_treads', 'nebula_ring'],
      bonus2: { desc: '사거리·AoE +12%', effect: 'rangeBonus', val: 1.12 },
      bonus4: { desc: '주 공격마다 10% 확률로 운석 낙하', effect: 'celestial_rain' },
    },
  ];

  // Cross-synergies: combining 2 different set pieces triggers special hit effects
  const CROSS_SYNERGIES = [
    { id: 'zeus_arrow_chain',  sets: ['zeus', 'shadow'],  desc: '화살 적중 시 번개 연쇄 발동', effect: 'zeus_arrow_chain' },
    { id: 'zeus_crit_nova',    sets: ['zeus', 'dragon'],  desc: '치명타 적중 시 전기 폭발(40px)', effect: 'zeus_crit_nova' },
    { id: 'dragon_burn_spread',sets: ['dragon', 'titan'], desc: '화염 피해 적중 시 넓은 화상 확산', effect: 'dragon_burn_spread' },
    { id: 'shadow_crit_dash',  sets: ['shadow', 'frost'], desc: '치명타마다 짧은 텔레포트 대쉬', effect: 'shadow_crit_dash' },
    { id: 'frost_orb_freeze',  sets: ['frost', 'zeus'],   desc: '구슬 회전 중 적 자동 빙결', effect: 'frost_orb_freeze' },
    { id: 'titan_thorns',      sets: ['titan', 'dragon'], desc: '피격 시 주변 60px 폭발 반격', effect: 'titan_thorns' },
    { id: 'celestial_inferno', sets: ['celestial', 'dragon'], desc: '적중 시 운석 낙하 + 화상 부착', effect: 'celestial_inferno' },
  ];

  const GRADE_DROP_WEIGHTS = [55, 25, 11, 5, 3, 1]; // normal→antique
  const GEM_RARITY_WEIGHTS = { common: 50, uncommon: 26, rare: 13, epic: 4, special: 7 };
  const SLOTS = ['helm', 'armor', 'boots', 'ring'];

  function gradeIndex(grade) {
    return GRADES.findIndex(g => g.id === grade);
  }

  function weightedPick(arr, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  function rollItem(slot, forceGrade) {
    const slotItems = SLOT_ITEMS[slot];
    const base = slotItems[Math.floor(Math.random() * slotItems.length)];
    const grade = forceGrade
      ? GRADES.find(g => g.id === forceGrade) || GRADES[0]
      : weightedPick(GRADES, GRADE_DROP_WEIGHTS);
    const gemCount = Math.floor(Math.random() * (grade.maxGems + 1));
    const gems = [];
    for (let i = 0; i < gemCount; i++) gems.push(rollGem());
    return { slot, baseId: base.id, grade: grade.id, gems };
  }

  function rollGem(forceRarity) {
    const rarities = Object.keys(GEM_RARITY_WEIGHTS);
    const weights = rarities.map(r => GEM_RARITY_WEIGHTS[r]);
    const rarity = forceRarity || weightedPick(rarities, weights);
    const pool = GEM_DEFS.filter(g => g.rarity === rarity);
    return pool[Math.floor(Math.random() * pool.length)] || GEM_DEFS[0];
  }

  function getItemBase(item) {
    return (SLOT_ITEMS[item.slot] || []).find(b => b.id === item.baseId) || SLOT_ITEMS[item.slot][0];
  }

  function getGradeData(gradeId) {
    return GRADES.find(g => g.id === gradeId) || GRADES[0];
  }

  // Returns flat stats for a single equipped item (grade mult + gems)
  function getEquipStats(item) {
    const base = getItemBase(item);
    const grade = getGradeData(item.grade);
    const stats = {};
    // Apply base stats scaled by grade mult
    for (const [k, v] of Object.entries(base.stats)) {
      if (k === 'maxHp') {
        stats[k] = (stats[k] || 0) + Math.round(v * grade.statMult);
      } else if (k === 'dmgMult' || k === 'cdMult' || k === 'xpRange' || k === 'speedMult' || k === 'rangeBonus') {
        // Multiplicative: scale distance from 1.0 by statMult
        const base1 = v - 1.0;
        stats[k] = (stats[k] || 1.0) * (1.0 + base1 * grade.statMult);
      } else {
        stats[k] = (stats[k] || 0) + v * grade.statMult;
      }
    }
    // Apply gems additively (특수 젬은 stat 이 없으므로 건너뜀 — effect 는 game.js 가 처리)
    for (const gem of (item.gems || [])) {
      const g = typeof gem === 'object' ? gem : GEM_DEFS.find(d => d.id === gem);
      if (!g || !g.stat) continue;
      if (g.stat === 'maxHp') {
        stats[g.stat] = (stats[g.stat] || 0) + g.val;
      } else if (g.stat === 'critChance') {
        stats[g.stat] = (stats[g.stat] || 0) + g.val;
      } else {
        const d = g.val - 1.0;
        stats[g.stat] = (stats[g.stat] || 1.0) * (1.0 + d);
      }
      if (g.also) {
        const d2 = g.also.val - 1.0;
        stats[g.also.stat] = (stats[g.also.stat] || 1.0) * (1.0 + d2);
      }
    }
    return stats;
  }

  // 아이템 전투력 점수 (분해 비교, 자동 분해 판정용)
  function calcItemPower(item) {
    if (!item) return 0;
    const stats = getEquipStats(item);
    let power = 0;
    if (stats.dmgMult)    power += (stats.dmgMult - 1) * 1000;
    if (stats.cdMult && stats.cdMult < 1) power += (1 - stats.cdMult) * 800;
    if (stats.rangeBonus) power += (stats.rangeBonus - 1) * 400;
    if (stats.maxHp)      power += stats.maxHp * 1.5;
    if (stats.speedMult)  power += (stats.speedMult - 1) * 250;
    if (stats.critChance) power += stats.critChance * 250;
    if (stats.xpRange)    power += (stats.xpRange - 1) * 150;
    const gemBonus = { common: 15, uncommon: 30, rare: 55, epic: 90, special: 75 };
    for (const gem of (item.gems || [])) {
      const gd = typeof gem === 'object' ? gem : GEM_DEFS.find(d => d.id === gem);
      if (gd) power += gemBonus[gd.rarity] || 15;
    }
    return Math.round(power);
  }

  // 세트/교차 보너스를 전투력 점수로 환산 (calcItemPower 와 동일 척도)
  //   단일 아이템 점수에는 세트 효과가 안 잡히므로, 빌드 전체 점수 계산에 합산한다.
  function calcSetBonusPower(equipMap) {
    let power = 0;
    for (const e of getActiveSetEffects(equipMap)) {
      const b = e.bonus;
      if (b.effect === 'dmgMult')         power += (b.val - 1) * 1000;
      else if (b.effect === 'cdMult')     power += (1 - b.val) * 800;
      else if (b.effect === 'speedMult')  power += (b.val - 1) * 250;
      else if (b.effect === 'rangeBonus') power += (b.val - 1) * 400;
      else if (b.effect === 'xpRange')    power += (b.val - 1) * 150;
      else if (b.effect === 'maxHp')      power += b.val * 1.5;
      else                                power += (e.level === 4 ? 360 : 220); // 특수 효과(번개 폭발 등)
    }
    // 교차 시너지: 각 250점
    power += getActiveCrossEffects(equipMap).length * 250;
    return Math.round(power);
  }

  // 빌드 전체 전투력 — 각 장비 점수 합 + 세트/교차 보너스 점수
  //   업그레이드/자동분해 판정은 "이 아이템을 끼웠을 때 빌드 점수가 오르는가"로 평가해야
  //   세트 완성 직전의 약한 조각이 자동분해되는 버그를 막을 수 있다.
  function calcBuildPower(equipMap) {
    let power = 0;
    for (const slot of SLOTS) {
      if (equipMap[slot]) power += calcItemPower(equipMap[slot]);
    }
    return power + calcSetBonusPower(equipMap);
  }

  // 특정 아이템을 해당 슬롯에 장착했을 때 빌드 점수 증가량 (세트 효과 포함)
  //   양수면 업그레이드, 0 이하면 분해 후보
  function equipPowerDelta(equipMap, item) {
    if (!item) return 0;
    const cur = calcBuildPower(equipMap);
    const testMap = Object.assign({}, equipMap);
    testMap[item.slot] = item;
    return calcBuildPower(testMap) - cur;
  }

  // Returns which set bonuses are active given current equip map {helm,armor,boots,ring}
  function getActiveSetEffects(equipMap) {
    const active = [];
    for (const set of SET_DEFS) {
      const equippedIds = Object.values(equipMap)
        .filter(Boolean)
        .map(item => item.baseId);
      const count = set.pieces.filter(p => equippedIds.includes(p)).length;
      if (count >= 2) active.push({ setId: set.id, level: 2, bonus: set.bonus2 });
      if (count >= 4) active.push({ setId: set.id, level: 4, bonus: set.bonus4 });
    }
    return active;
  }

  // Returns which cross-synergies are active
  function getActiveCrossEffects(equipMap) {
    const activeSets = new Set();
    for (const set of SET_DEFS) {
      const equippedIds = Object.values(equipMap).filter(Boolean).map(i => i.baseId);
      const count = set.pieces.filter(p => equippedIds.includes(p)).length;
      if (count >= 2) activeSets.add(set.id);
    }
    const active = [];
    for (const syn of CROSS_SYNERGIES) {
      if (syn.sets.every(s => activeSets.has(s))) active.push(syn);
    }
    return active;
  }

  // 장착된 모든 아이템의 특수 젬 효과를 집계 → { effect: { procChance, val, count } }
  //   같은 효과 젬을 여러 개 박으면 procChance 합산(상한 적용), val 은 누적/최대
  function aggregateGemEffects(equipMap) {
    const fx = {};
    for (const slot of SLOTS) {
      const item = equipMap[slot];
      if (!item || !item.gems) continue;
      for (const gem of item.gems) {
        const g = typeof gem === 'object' ? gem : GEM_DEFS.find(d => d.id === gem);
        if (!g || !g.effect) continue;
        if (!fx[g.effect]) fx[g.effect] = { procChance: 0, val: 0, count: 0 };
        // procChance 1.0(상시)인 효과는 누적하지 않고 1.0 유지, 그 외는 합산(상한 0.85)
        if (g.procChance >= 1) fx[g.effect].procChance = 1;
        else fx[g.effect].procChance = Math.min(0.85, fx[g.effect].procChance + (g.procChance || 0));
        // val: leech/cleave/culling 등은 누적, freeze 지속 등은 최대값
        if (g.effect === 'leech' || g.effect === 'cleave' || g.effect === 'fork') {
          fx[g.effect].val += (g.val || 0);
        } else {
          fx[g.effect].val = Math.max(fx[g.effect].val, g.val || 0);
        }
        fx[g.effect].count++;
      }
    }
    return fx;
  }

  // 젬 단일 효과 설명 (UI 툴팁용)
  function gemEffectDesc(gemOrId) {
    const g = typeof gemOrId === 'object' ? gemOrId : GEM_DEFS.find(d => d.id === gemOrId);
    return g && g.desc ? g.desc : '';
  }

  // Human-readable bonus descriptions for UI
  function getActiveBonusDescriptions(equipMap) {
    const lines = [];
    const setEffects = getActiveSetEffects(equipMap);
    for (const e of setEffects) {
      const set = SET_DEFS.find(s => s.id === e.setId);
      lines.push(`${set.name} ${e.level}세트: ${e.bonus.desc}`);
    }
    const cross = getActiveCrossEffects(equipMap);
    for (const c of cross) lines.push(`✦ 교차: ${c.desc}`);
    return lines;
  }

  // Item display name
  function itemDisplayName(item) {
    const base = getItemBase(item);
    const grade = getGradeData(item.grade);
    return `${base.icon} [${grade.name}] ${base.name}`;
  }

  // Expose public API
  window.VPS = window.VPS || {};
  window.VPS.equipment = {
    GRADES,
    SLOT_ITEMS,
    GEM_DEFS,
    SET_DEFS,
    CROSS_SYNERGIES,
    SLOTS,
    gradeIndex,
    rollItem,
    rollGem,
    getItemBase,
    getGradeData,
    getEquipStats,
    getActiveSetEffects,
    getActiveCrossEffects,
    getActiveBonusDescriptions,
    aggregateGemEffects,
    gemEffectDesc,
    itemDisplayName,
    calcItemPower,
    calcSetBonusPower,
    calcBuildPower,
    equipPowerDelta,
  };
})();
