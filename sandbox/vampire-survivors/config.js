'use strict';
// config.js — window.VS_CONFIG + window.VS_DEFAULTS
// All tunable data for the Vampire Survivors Sandbox.
// window.VS_CONFIG is the live mutable object read by game.js every frame.
// window.VS_DEFAULTS is a frozen deep-clone used by the Reset-to-Default button.

(function () {
  var DEFAULTS = {

    // ── Stages ────────────────────────────────────────────────────
    STAGES: [
      {
        id: 'forest', name: 'Haunted Forest',
        durationSeconds: 120,
        backgroundToken: 'bg_forest',
        bossAt: [90],
        waveSchedule: [
          { atSecond: 0,  enemyType: 'zombie',   count: 3, intervalMs: 2000 },
          { atSecond: 10, enemyType: 'bat',       count: 2, intervalMs: 1800 },
          { atSecond: 30, enemyType: 'skeleton',  count: 2, intervalMs: 2200 },
          { atSecond: 60, enemyType: 'elite',     count: 1, intervalMs: 4000 }
        ],
        ambientHazards: [],
        musicToken: 'music_forest'
      },
      {
        id: 'castle', name: 'Cursed Castle',
        durationSeconds: 180,
        backgroundToken: 'bg_castle',
        bossAt: [120, 170],
        waveSchedule: [
          { atSecond: 0,  enemyType: 'skeleton',  count: 3, intervalMs: 1800 },
          { atSecond: 15, enemyType: 'ghost',      count: 2, intervalMs: 2000 },
          { atSecond: 45, enemyType: 'demon',      count: 2, intervalMs: 2500 },
          { atSecond: 90, enemyType: 'elite',      count: 2, intervalMs: 3000 }
        ],
        ambientHazards: [],
        musicToken: 'music_castle'
      },
      {
        id: 'desert', name: 'Scorched Desert',
        durationSeconds: 240,
        backgroundToken: 'bg_desert',
        bossAt: [120, 200, 235],
        waveSchedule: [
          { atSecond: 0,   enemyType: 'demon',    count: 4, intervalMs: 1500 },
          { atSecond: 20,  enemyType: 'bat',       count: 3, intervalMs: 1200 },
          { atSecond: 60,  enemyType: 'elite',     count: 2, intervalMs: 2000 },
          { atSecond: 120, enemyType: 'skeleton',  count: 4, intervalMs: 1500 }
        ],
        ambientHazards: [],
        musicToken: 'music_desert'
      }
    ],

    // ── Skills ────────────────────────────────────────────────────
    SKILLS: [
      {
        id: 'orb', name: 'Magic Orb', icon: 'icon_orb', rarity: 'common',
        tags: ['magic', 'orbit'],
        description: 'Orbiting energy orb that damages nearby enemies.',
        maxLevel: 5,
        perLevel: {
          damage:     [10, 14, 19, 25, 32],
          projectiles:[1,  1,  2,  2,  3],
          cooldownMs: [1500, 1400, 1300, 1200, 1100],
          pierce:     [0,  0,  1,  1,  2]
        },
        synergyBonus: { requiredTag: 'magic', bonusStat: 'damage', bonusPct: 10 },
        evolutionRequires: [],
        evolvesInto: null,
        _editorX: 20, _editorY: 20
      },
      {
        id: 'arrow', name: 'Arrow Rain', icon: 'icon_arrow', rarity: 'common',
        tags: ['physical', 'ranged'],
        description: 'Fires arrows at the nearest enemy.',
        maxLevel: 5,
        perLevel: {
          damage:     [8, 11, 15, 20, 27],
          projectiles:[1,  2,  2,  3,  3],
          cooldownMs: [1200, 1100, 1000, 900, 800],
          pierce:     [0,  0,  0,  1,  1]
        },
        synergyBonus: { requiredTag: 'physical', bonusStat: 'projectiles', bonusPct: 1 },
        evolutionRequires: [],
        evolvesInto: 'laser',
        _editorX: 70, _editorY: 20
      },
      {
        id: 'nova', name: 'Arcane Nova', icon: 'icon_nova', rarity: 'uncommon',
        tags: ['magic', 'aoe'],
        description: 'Radial burst of magic projectiles.',
        maxLevel: 5,
        perLevel: {
          damage:     [15, 20, 27, 35, 45],
          projectiles:[8,  8, 12, 12, 16],
          cooldownMs: [2500, 2300, 2100, 1900, 1700],
          pierce:     [0,  0,  0,  1,  1]
        },
        synergyBonus: { requiredTag: 'aoe', bonusStat: 'damage', bonusPct: 15 },
        evolutionRequires: [],
        evolvesInto: null,
        _editorX: 120, _editorY: 20
      },
      {
        id: 'laser', name: 'Lightning Lance', icon: 'icon_laser', rarity: 'rare',
        tags: ['magic', 'ranged', 'pierce'],
        description: 'High-speed piercing laser beam.',
        maxLevel: 5,
        perLevel: {
          damage:     [25, 34, 45, 58, 74],
          projectiles:[1,  1,  1,  2,  2],
          cooldownMs: [1800, 1600, 1400, 1200, 1000],
          pierce:     [999, 999, 999, 999, 999]
        },
        synergyBonus: { requiredTag: 'pierce', bonusStat: 'damage', bonusPct: 20 },
        evolutionRequires: ['arrow'],
        evolvesInto: null,
        _editorX: 170, _editorY: 20
      },
      {
        id: 'aura', name: 'Aura Ring', icon: 'icon_aura', rarity: 'uncommon',
        tags: ['magic', 'aoe', 'continuous'],
        description: 'Expanding ring that damages all enemies it touches.',
        maxLevel: 5,
        perLevel: {
          damage:     [6,  8, 11, 15, 20],
          projectiles:[1,  1,  1,  1,  1],
          cooldownMs: [1000, 900, 800, 700, 600],
          pierce:     [999, 999, 999, 999, 999]
        },
        synergyBonus: { requiredTag: 'continuous', bonusStat: 'cooldownMs', bonusPct: -5 },
        evolutionRequires: [],
        evolvesInto: null,
        _editorX: 20, _editorY: 80
      },
      {
        id: 'whip', name: 'Fire Whip', icon: 'icon_whip', rarity: 'common',
        tags: ['physical', 'melee'],
        description: 'Sweeping fire attack.',
        maxLevel: 5,
        perLevel: {
          damage:     [12, 17, 23, 30, 40],
          projectiles:[1,  1,  2,  2,  3],
          cooldownMs: [1000, 950, 900, 850, 800],
          pierce:     [2,  2,  3,  3,  4]
        },
        synergyBonus: { requiredTag: 'melee', bonusStat: 'pierce', bonusPct: 1 },
        evolutionRequires: [],
        evolvesInto: null,
        _editorX: 70, _editorY: 80
      },
      {
        id: 'shield', name: 'Holy Shield', icon: 'icon_shield', rarity: 'rare',
        tags: ['holy', 'orbit', 'defense'],
        description: 'Orbiting shields block and damage enemies.',
        maxLevel: 5,
        perLevel: {
          damage:     [20, 26, 34, 44, 56],
          projectiles:[2,  2,  3,  3,  4],
          cooldownMs: [2000, 1900, 1800, 1700, 1600],
          pierce:     [0,  0,  0,  1,  1]
        },
        synergyBonus: { requiredTag: 'holy', bonusStat: 'damage', bonusPct: 25 },
        evolutionRequires: [],
        evolvesInto: null,
        _editorX: 120, _editorY: 80
      },
      {
        id: 'garlic', name: 'Garlic Aura', icon: 'icon_garlic', rarity: 'legendary',
        tags: ['magic', 'continuous', 'aoe'],
        description: 'Continuous garlic aura damages all adjacent enemies.',
        maxLevel: 5,
        perLevel: {
          damage:     [30, 40, 52, 67, 85],
          projectiles:[1,  1,  1,  1,  1],
          cooldownMs: [500, 480, 460, 440, 420],
          pierce:     [999, 999, 999, 999, 999]
        },
        synergyBonus: { requiredTag: 'aoe', bonusStat: 'damage', bonusPct: 30 },
        evolutionRequires: [],
        evolvesInto: null,
        _editorX: 170, _editorY: 80
      }
    ],

    // ── Passives ──────────────────────────────────────────────────
    PASSIVES: [
      { id: 'spinach',     name: 'Spinach',     icon: 'icon_spinach',     rarity: 'common',    value: 1.1,  description: '+10% damage' },
      { id: 'pummarola',   name: 'Pummarola',   icon: 'icon_pummarola',   rarity: 'common',    value: 0.2,  description: '+0.2 HP/s regen' },
      { id: 'hollow_heart',name: 'Hollow Heart',icon: 'icon_hollow_heart',rarity: 'uncommon',  value: 1.2,  description: '+20% max HP' },
      { id: 'spellbinder', name: 'Spellbinder', icon: 'icon_spellbinder', rarity: 'uncommon',  value: 0.9,  description: '-10% cooldowns' },
      { id: 'garlic_ring', name: 'Garlic Ring', icon: 'icon_garlic_ring', rarity: 'rare',      value: 1.25, description: '+25% area' }
    ],

    // ── Consumables ───────────────────────────────────────────────
    CONSUMABLES: [
      { id: 'heart',   name: 'Heart',       icon: 'icon_heart', rarity: 'common',   value: 25,  cooldownSec: 0 },
      { id: 'coin',    name: 'Gold Coin',   icon: 'icon_coin',  rarity: 'common',   value: 10,  cooldownSec: 0 },
      { id: 'xp_gem',  name: 'XP Gem',      icon: 'icon_xp_gem',rarity: 'uncommon', value: 50,  cooldownSec: 0 },
      { id: 'chest',   name: 'Chest',       icon: 'icon_chest', rarity: 'rare',     value: 200, cooldownSec: 0 }
    ],

    // ── Probability ───────────────────────────────────────────────
    PROBABILITY: {
      levelUpPool: { common: 60, uncommon: 28, rare: 10, legendary: 2 },
      pitySystem: {
        enabled: true,
        guaranteedRareAfter: 7,
        guaranteedLegendaryAfter: 4
      },
      enemyDrops: {
        normal: { gold: 0.4,  xp: 0.9, heart: 0.05 },
        elite:  { gold: 0.8,  xp: 1.0, heart: 0.15 },
        boss:   { gold: 1.0,  xp: 1.0, heart: 0.4  }
      },
      critChanceBase:      0.05,
      critMultiplierBase:  1.5,
      offerCount:          3,
      rerollCostBase:      50
    },

    // ── Character definitions ─────────────────────────────────────
    CHARACTER_DEFS: [
      {
        id: 'wizard', name: 'Wizard',
        spriteToken: 'char_wizard',
        baseStats: { hp: 100, speed: 120, might: 1.0, magnet: 1, revivals: 0 },
        passiveId: 'spellbinder',
        description: 'Balanced magic user.'
      },
      {
        id: 'warrior', name: 'Warrior',
        spriteToken: 'char_warrior',
        baseStats: { hp: 180, speed: 100, might: 1.2, magnet: 0, revivals: 1 },
        passiveId: 'hollow_heart',
        description: 'Tanky melee fighter.'
      },
      {
        id: 'rogue', name: 'Rogue',
        spriteToken: 'char_rogue',
        baseStats: { hp: 80, speed: 160, might: 0.9, magnet: 2, revivals: 0 },
        passiveId: 'spinach',
        description: 'Fast XP collector.'
      },
      {
        id: 'cleric', name: 'Cleric',
        spriteToken: 'char_cleric',
        baseStats: { hp: 140, speed: 110, might: 1.0, magnet: 1, revivals: 2 },
        passiveId: 'pummarola',
        description: 'Self-healer with revivals.'
      }
    ],

    // ── Enemy types ───────────────────────────────────────────────
    ENEMY_TYPES: {
      zombie: {
        hp: 30, speed: 55, damage: 8,
        behavior: 'chase',
        spriteToken: 'enemy_zombie', colorToken: 'enemy_zombie_color',
        xpValue: 2, size: 20, isBoss: false
      },
      skeleton: {
        hp: 25, speed: 70, damage: 10,
        behavior: 'chase',
        spriteToken: 'enemy_skeleton', colorToken: 'enemy_skeleton_color',
        xpValue: 3, size: 18, isBoss: false
      },
      bat: {
        hp: 15, speed: 110, damage: 6,
        behavior: 'circle',
        spriteToken: 'enemy_bat', colorToken: 'enemy_bat_color',
        xpValue: 2, size: 14, isBoss: false
      },
      ghost: {
        hp: 20, speed: 80, damage: 12,
        behavior: 'circle',
        spriteToken: 'enemy_ghost', colorToken: 'enemy_ghost_color',
        xpValue: 3, size: 16, isBoss: false
      },
      demon: {
        hp: 50, speed: 65, damage: 15,
        behavior: 'shooter',
        spriteToken: 'enemy_demon', colorToken: 'enemy_demon_color',
        xpValue: 5, size: 22, isBoss: false
      },
      elite: {
        hp: 150, speed: 60, damage: 20,
        behavior: 'boss_chase',
        spriteToken: 'enemy_elite', colorToken: 'enemy_elite_color',
        xpValue: 20, size: 30, isBoss: false
      },
      boss: {
        hp: 800, speed: 45, damage: 35,
        behavior: 'boss_chase',
        spriteToken: 'enemy_boss', colorToken: 'enemy_boss_color',
        xpValue: 100, size: 46, isBoss: true
      }
    },

    // ── XP curve (30 levels) ──────────────────────────────────────
    XP_CURVE: [
      10, 20, 35, 55, 80, 110, 145, 185, 230, 280,
      340, 410, 490, 580, 680, 790, 910, 1040, 1180, 1330,
      1490, 1660, 1840, 2030, 2230, 2440, 2660, 2890, 3130, 3380
    ],

    // ── Meta unlocks (sandbox toggles) ───────────────────────────
    META_UNLOCKS: [
      { id: 'revival_cross', name: 'Revival Cross', unlocked: false, effect: 'revivals+1' },
      { id: 'curse_mode',    name: 'Curse Mode',    unlocked: false, effect: 'enemy_hp*1.5' }
    ],

    // ── Curse modifiers ───────────────────────────────────────────
    CURSE_MODIFIERS: [
      { id: 'hyper',   name: 'Hyper Mode',  enemySpeedMult: 1.5, enemyHpMult: 1.0 },
      { id: 'hurry',   name: 'Hurry Mode',  timerMult: 0.5,      enemyHpMult: 1.0 },
      { id: 'arcana',  name: 'Arcana',      skillModifier: 'randomise' }
    ]
  };

  window.VS_CONFIG  = JSON.parse(JSON.stringify(DEFAULTS));
  window.VS_DEFAULTS = JSON.parse(JSON.stringify(DEFAULTS));
})();
