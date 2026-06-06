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
    ],
  };

  Object.assign(SLOT_ITEMS, {
    weapon: [
      { id: 'thunder_bow', name: 'Thunder Bow', icon: 'TB', stats: { dmgMult: 1.10, rangeBonus: 1.08 } },
      { id: 'storm_lance', name: 'Storm Lance', icon: 'SL', stats: { dmgMult: 1.12, cdMult: 0.96 } },
      { id: 'dragon_bow', name: 'Dragon Bow', icon: 'DB', stats: { dmgMult: 1.16, critChance: 0.04 } },
      { id: 'frost_focus', name: 'Frost Focus', icon: 'FF', stats: { rangeBonus: 1.14, cdMult: 0.94 } },
      { id: 'shadow_blade', name: 'Shadow Blade', icon: 'SB', stats: { speedMult: 1.10, critChance: 0.06 } },
      { id: 'titan_core', name: 'Titan Core', icon: 'TC', stats: { maxHp: 35, dmgMult: 1.05 } },
    ],
    head: SLOT_ITEMS.helm.slice(),
    shoes: SLOT_ITEMS.boots.slice(),
  });

  const SLOT_ALIASES = { helm: 'head', boots: 'shoes' };

  function normalizeSlot(slot) {
    return SLOT_ALIASES[slot] || slot;
  }

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
  ];

  // 5 set definitions — each with 2-piece and 4-piece bonuses
  GEM_DEFS.push(
    { id: 'storm_rune', icon: 'SR', name: 'Storm Rune', rarity: 'rare', stat: 'dmgMult', val: 1.04, effect: 'gem_storm_chain', desc: 'Arrow hits can arc lightning.' },
    { id: 'frost_rune', icon: 'FR', name: 'Frost Rune', rarity: 'rare', stat: 'rangeBonus', val: 1.05, effect: 'gem_frost_lock', desc: 'Orb and laser hits chill enemies.' },
    { id: 'blood_rune', icon: 'BR', name: 'Blood Rune', rarity: 'epic', stat: 'critChance', val: 0.04, effect: 'gem_blood_surge', desc: 'Kills restore a small amount of HP.' },
    { id: 'echo_rune', icon: 'ER', name: 'Echo Rune', rarity: 'epic', stat: 'speedMult', val: 1.04, effect: 'gem_echo_slash', desc: 'Dash slash leaves an extra afterimage.' }
  );

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
  ];

  // Cross-synergies: combining 2 different set pieces triggers special hit effects
  const SET_WEAPON_PIECES = {
    zeus: ['thunder_bow', 'storm_lance'],
    dragon: ['dragon_bow'],
    shadow: ['shadow_blade'],
    frost: ['frost_focus'],
    titan: ['titan_core'],
  };

  for (const set of SET_DEFS) {
    set.pieces = set.pieces.concat(SET_WEAPON_PIECES[set.id] || []);
  }

  const CROSS_SYNERGIES = [
    { id: 'zeus_arrow_chain',  sets: ['zeus', 'shadow'],  desc: '화살 적중 시 번개 연쇄 발동', effect: 'zeus_arrow_chain' },
    { id: 'zeus_crit_nova',    sets: ['zeus', 'dragon'],  desc: '치명타 적중 시 전기 폭발(40px)', effect: 'zeus_crit_nova' },
    { id: 'dragon_burn_spread',sets: ['dragon', 'titan'], desc: '화염 피해 적중 시 넓은 화상 확산', effect: 'dragon_burn_spread' },
    { id: 'shadow_crit_dash',  sets: ['shadow', 'frost'], desc: '치명타마다 짧은 텔레포트 대쉬', effect: 'shadow_crit_dash' },
    { id: 'frost_orb_freeze',  sets: ['frost', 'zeus'],   desc: '구슬 회전 중 적 자동 빙결', effect: 'frost_orb_freeze' },
    { id: 'titan_thorns',      sets: ['titan', 'dragon'], desc: '피격 시 주변 60px 폭발 반격', effect: 'titan_thorns' },
  ];

  const WEAPON_SET_COMBOS = [
    {
      id: 'zeus_arrow_chain',
      set: 'zeus',
      minPieces: 2,
      weapons: ['arrow', 'stormbow'],
      desc: 'Zeus set + Arrow: arrow hits chain lightning through nearby enemies.',
      effect: 'zeus_arrow_chain',
    },
    {
      id: 'dragon_nova_spread',
      set: 'dragon',
      minPieces: 2,
      weapons: ['nova', 'supernova'],
      desc: 'Dragon set + Nova: explosions leave delayed burning bursts.',
      effect: 'dragon_nova_spread',
    },
    {
      id: 'frost_orb_lock',
      set: 'frost',
      minPieces: 2,
      weapons: ['orb', 'blackhole', 'laser', 'deathray'],
      desc: 'Frost set + Orb/Laser: repeated hits chill and briefly freeze.',
      effect: 'frost_orb_lock',
    },
    {
      id: 'shadow_dash_echo',
      set: 'shadow',
      minPieces: 2,
      weapons: ['boomerang', 'cyclone'],
      desc: 'Shadow set + Boomerang: dash slash gains extra echo cuts.',
      effect: 'shadow_dash_echo',
    },
    {
      id: 'titan_aegis_retaliate',
      set: 'titan',
      minPieces: 2,
      weapons: ['shield', 'aegis'],
      desc: 'Titan set + Shield: contact and projectile hits retaliate with a pulse.',
      effect: 'titan_aegis_retaliate',
    },
  ];

  const GRADE_DROP_WEIGHTS = [55, 25, 11, 5, 3, 1]; // normal→antique
  const GEM_RARITY_WEIGHTS = { common: 55, uncommon: 28, rare: 13, epic: 4 };
  const SLOTS = ['weapon', 'head', 'armor', 'shoes', 'ring'];

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
    const normalizedSlot = normalizeSlot(slot);
    const slotItems = SLOT_ITEMS[normalizedSlot] || SLOT_ITEMS.head;
    const base = slotItems[Math.floor(Math.random() * slotItems.length)];
    const grade = forceGrade
      ? GRADES.find(g => g.id === forceGrade) || GRADES[0]
      : weightedPick(GRADES, GRADE_DROP_WEIGHTS);
    const gemCount = Math.floor(Math.random() * (grade.maxGems + 1));
    const gems = [];
    for (let i = 0; i < gemCount; i++) gems.push(rollGem());
    return { slot: normalizedSlot, baseId: base.id, grade: grade.id, gems };
  }

  function rollGem(forceRarity) {
    const rarities = Object.keys(GEM_RARITY_WEIGHTS);
    const weights = rarities.map(r => GEM_RARITY_WEIGHTS[r]);
    const rarity = forceRarity || weightedPick(rarities, weights);
    const pool = GEM_DEFS.filter(g => g.rarity === rarity);
    return pool[Math.floor(Math.random() * pool.length)] || GEM_DEFS[0];
  }

  function getItemBase(item) {
    const slot = normalizeSlot(item.slot);
    const slotItems = SLOT_ITEMS[slot] || SLOT_ITEMS.head;
    return slotItems.find(b => b.id === item.baseId) || slotItems[0];
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
    // Apply gems additively
    for (const gem of (item.gems || [])) {
      const g = typeof gem === 'object' ? gem : GEM_DEFS.find(d => d.id === gem);
      if (!g) continue;
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

  function equippedItems(equipMap) {
    return Object.values(equipMap || {}).filter(Boolean);
  }

  function equippedBaseIds(equipMap) {
    return equippedItems(equipMap).map(item => item.baseId);
  }

  function activeSetCounts(equipMap) {
    const equippedIds = equippedBaseIds(equipMap);
    const counts = {};
    for (const set of SET_DEFS) {
      counts[set.id] = set.pieces.filter(p => equippedIds.includes(p)).length;
    }
    return counts;
  }

  function ownedWeaponIds(weapons) {
    if (!Array.isArray(weapons)) return new Set();
    return new Set(weapons.filter(Boolean));
  }

  // Returns which set bonuses are active given current equip map
  function getActiveSetEffects(equipMap) {
    const active = [];
    const counts = activeSetCounts(equipMap);
    for (const set of SET_DEFS) {
      const count = counts[set.id] || 0;
      if (count >= 2) active.push({ setId: set.id, level: 2, bonus: set.bonus2 });
      if (count >= 4) active.push({ setId: set.id, level: 4, bonus: set.bonus4 });
    }
    return active;
  }

  // Returns which cross-synergies are active
  function getActiveCrossEffects(equipMap) {
    const activeSets = new Set();
    const counts = activeSetCounts(equipMap);
    for (const set of SET_DEFS) {
      if ((counts[set.id] || 0) >= 2) activeSets.add(set.id);
    }
    const active = [];
    for (const syn of CROSS_SYNERGIES) {
      if (syn.sets.every(s => activeSets.has(s))) active.push(syn);
    }
    return active;
  }

  function getActiveWeaponCombos(equipMap, weapons) {
    const counts = activeSetCounts(equipMap);
    const owned = ownedWeaponIds(weapons);
    return WEAPON_SET_COMBOS.filter(combo =>
      (counts[combo.set] || 0) >= combo.minPieces &&
      combo.weapons.some(weaponId => owned.has(weaponId))
    );
  }

  function getActiveGemEffects(equipMap) {
    const effects = [];
    for (const item of equippedItems(equipMap)) {
      for (const gem of (item.gems || [])) {
        const g = typeof gem === 'object' ? gem : GEM_DEFS.find(d => d.id === gem);
        if (g && g.effect) effects.push({ id: g.id, effect: g.effect, desc: g.desc || g.name });
      }
    }
    return effects;
  }

  // Human-readable bonus descriptions for UI
  function getActiveBonusDescriptions(equipMap, weapons) {
    const lines = [];
    const setEffects = getActiveSetEffects(equipMap);
    for (const e of setEffects) {
      const set = SET_DEFS.find(s => s.id === e.setId);
      lines.push(`${set.name} ${e.level}세트: ${e.bonus.desc}`);
    }
    const cross = getActiveCrossEffects(equipMap);
    for (const c of cross) lines.push(`✦ 교차: ${c.desc}`);
    const weaponCombos = getActiveWeaponCombos(equipMap, weapons);
    for (const c of weaponCombos) lines.push(`Weapon combo: ${c.desc}`);
    const gemEffects = getActiveGemEffects(equipMap);
    for (const g of gemEffects) lines.push(`Gem: ${g.desc}`);
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
    WEAPON_SET_COMBOS,
    SLOTS,
    SLOT_ALIASES,
    gradeIndex,
    normalizeSlot,
    rollItem,
    rollGem,
    getItemBase,
    getGradeData,
    getEquipStats,
    getActiveSetEffects,
    getActiveCrossEffects,
    getActiveWeaponCombos,
    getActiveGemEffects,
    getActiveBonusDescriptions,
    itemDisplayName,
  };
})();
