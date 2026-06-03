'use strict';
// config.js — window.TD_CONFIG + window.TD_DEFAULTS

(function () {
  var DEFAULTS = {

    // ── Stages (10 stages) ────────────────────────────────────────
    STAGES: [
      {
        id: 'dawn', name: 'Dawn', backgroundToken: 'bg_dawn',
        waves: [
          { count: 6,  enemyType: 'grunt',  intervalMs: 1200, hpMult: 1.0, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 8,  enemyType: 'grunt',  intervalMs: 1100, hpMult: 1.0, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 8,  enemyType: 'grunt',  intervalMs: 1000, hpMult: 1.1, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 10, enemyType: 'grunt',  intervalMs: 1000, hpMult: 1.1, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 10, enemyType: 'grunt',  intervalMs: 900,  hpMult: 1.2, speedMult: 1.1, isBoss: false, bossTimerSec: 30 }
        ]
      },
      {
        id: 'dusk', name: 'Dusk', backgroundToken: 'bg_dusk',
        waves: [
          { count: 8,  enemyType: 'grunt',  intervalMs: 1000, hpMult: 1.2, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 6,  enemyType: 'runner', intervalMs: 800,  hpMult: 1.0, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 10, enemyType: 'grunt',  intervalMs: 900,  hpMult: 1.2, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 8,  enemyType: 'runner', intervalMs: 700,  hpMult: 1.1, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 12, enemyType: 'grunt',  intervalMs: 800,  hpMult: 1.3, speedMult: 1.1, isBoss: false, bossTimerSec: 30 }
        ]
      },
      {
        id: 'nightfall', name: 'Nightfall', backgroundToken: 'bg_nightfall',
        waves: [
          { count: 10, enemyType: 'grunt',  intervalMs: 900,  hpMult: 1.3, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 8,  enemyType: 'runner', intervalMs: 700,  hpMult: 1.1, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 12, enemyType: 'grunt',  intervalMs: 800,  hpMult: 1.4, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 10, enemyType: 'runner', intervalMs: 600,  hpMult: 1.2, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 6,  enemyType: 'grunt',  intervalMs: 700,  hpMult: 1.4, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 1.0, speedMult: 1.0, isBoss: true,  bossTimerSec: 35 }
        ]
      },
      {
        id: 'cursed', name: 'Cursed Field', backgroundToken: 'bg_cursed',
        waves: [
          { count: 12, enemyType: 'grunt',  intervalMs: 800,  hpMult: 1.4, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 6,  enemyType: 'runner', intervalMs: 600,  hpMult: 1.2, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 2,  enemyType: 'tank',   intervalMs: 2000, hpMult: 1.0, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 10, enemyType: 'runner', intervalMs: 600,  hpMult: 1.3, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 3,  enemyType: 'tank',   intervalMs: 1800, hpMult: 1.1, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 14, enemyType: 'grunt',  intervalMs: 700,  hpMult: 1.5, speedMult: 1.2, isBoss: false, bossTimerSec: 30 }
        ]
      },
      {
        id: 'storm', name: 'Storm', backgroundToken: 'bg_storm',
        waves: [
          { count: 14, enemyType: 'grunt',  intervalMs: 700,  hpMult: 1.6, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 10, enemyType: 'runner', intervalMs: 550,  hpMult: 1.3, speedMult: 1.3, isBoss: false, bossTimerSec: 30 },
          { count: 3,  enemyType: 'tank',   intervalMs: 1600, hpMult: 1.2, speedMult: 1.0, isBoss: false, bossTimerSec: 30 },
          { count: 12, enemyType: 'runner', intervalMs: 500,  hpMult: 1.4, speedMult: 1.3, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 1.3, speedMult: 1.1, isBoss: true,  bossTimerSec: 30 },
          { count: 16, enemyType: 'grunt',  intervalMs: 600,  hpMult: 1.6, speedMult: 1.2, isBoss: false, bossTimerSec: 30 }
        ]
      },
      {
        id: 'abyss', name: 'Abyss', backgroundToken: 'bg_abyss',
        waves: [
          { count: 16, enemyType: 'grunt',  intervalMs: 600,  hpMult: 1.8, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 12, enemyType: 'runner', intervalMs: 500,  hpMult: 1.4, speedMult: 1.4, isBoss: false, bossTimerSec: 30 },
          { count: 4,  enemyType: 'tank',   intervalMs: 1500, hpMult: 1.3, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 1.5, speedMult: 1.1, isBoss: true,  bossTimerSec: 28 },
          { count: 14, enemyType: 'runner', intervalMs: 450,  hpMult: 1.5, speedMult: 1.4, isBoss: false, bossTimerSec: 30 },
          { count: 5,  enemyType: 'tank',   intervalMs: 1400, hpMult: 1.4, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 1.6, speedMult: 1.2, isBoss: true,  bossTimerSec: 25 }
        ]
      },
      {
        id: 'siege', name: 'Siege', backgroundToken: 'bg_siege',
        waves: [
          { count: 18, enemyType: 'grunt',  intervalMs: 550,  hpMult: 2.0, speedMult: 1.3, isBoss: false, bossTimerSec: 30 },
          { count: 14, enemyType: 'runner', intervalMs: 450,  hpMult: 1.6, speedMult: 1.5, isBoss: false, bossTimerSec: 30 },
          { count: 6,  enemyType: 'tank',   intervalMs: 1300, hpMult: 1.5, speedMult: 1.1, isBoss: false, bossTimerSec: 30 },
          { count: 16, enemyType: 'grunt',  intervalMs: 500,  hpMult: 2.1, speedMult: 1.3, isBoss: false, bossTimerSec: 30 },
          { count: 12, enemyType: 'runner', intervalMs: 400,  hpMult: 1.7, speedMult: 1.5, isBoss: false, bossTimerSec: 30 },
          { count: 5,  enemyType: 'tank',   intervalMs: 1200, hpMult: 1.6, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 1.8, speedMult: 1.2, isBoss: true,  bossTimerSec: 25 }
        ]
      },
      {
        id: 'chaos', name: 'Chaos', backgroundToken: 'bg_chaos',
        waves: [
          { count: 20, enemyType: 'grunt',  intervalMs: 500,  hpMult: 2.2, speedMult: 1.4, isBoss: false, bossTimerSec: 30 },
          { count: 16, enemyType: 'runner', intervalMs: 400,  hpMult: 1.8, speedMult: 1.6, isBoss: false, bossTimerSec: 30 },
          { count: 7,  enemyType: 'tank',   intervalMs: 1200, hpMult: 1.7, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 2.0, speedMult: 1.3, isBoss: true,  bossTimerSec: 25 },
          { count: 18, enemyType: 'runner', intervalMs: 350,  hpMult: 1.9, speedMult: 1.6, isBoss: false, bossTimerSec: 30 },
          { count: 8,  enemyType: 'tank',   intervalMs: 1100, hpMult: 1.8, speedMult: 1.2, isBoss: false, bossTimerSec: 30 },
          { count: 22, enemyType: 'grunt',  intervalMs: 450,  hpMult: 2.4, speedMult: 1.4, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 2.2, speedMult: 1.3, isBoss: true,  bossTimerSec: 22 }
        ]
      },
      {
        id: 'apocalypse', name: 'Apocalypse', backgroundToken: 'bg_apocalypse',
        waves: [
          { count: 22, enemyType: 'grunt',  intervalMs: 450,  hpMult: 2.5, speedMult: 1.4, isBoss: false, bossTimerSec: 30 },
          { count: 18, enemyType: 'runner', intervalMs: 350,  hpMult: 2.0, speedMult: 1.7, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 2.4, speedMult: 1.3, isBoss: true,  bossTimerSec: 22 },
          { count: 10, enemyType: 'tank',   intervalMs: 1000, hpMult: 2.0, speedMult: 1.3, isBoss: false, bossTimerSec: 30 },
          { count: 20, enemyType: 'runner', intervalMs: 300,  hpMult: 2.2, speedMult: 1.7, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 2.6, speedMult: 1.4, isBoss: true,  bossTimerSec: 20 },
          { count: 24, enemyType: 'grunt',  intervalMs: 400,  hpMult: 2.8, speedMult: 1.5, isBoss: false, bossTimerSec: 30 },
          { count: 12, enemyType: 'tank',   intervalMs: 900,  hpMult: 2.2, speedMult: 1.3, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 3.0, speedMult: 1.5, isBoss: true,  bossTimerSec: 20 }
        ]
      },
      {
        id: 'endgame', name: 'Endgame', backgroundToken: 'bg_endgame',
        waves: [
          { count: 25, enemyType: 'grunt',  intervalMs: 400,  hpMult: 3.0, speedMult: 1.5, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 3.0, speedMult: 1.5, isBoss: true,  bossTimerSec: 22 },
          { count: 20, enemyType: 'runner', intervalMs: 300,  hpMult: 2.5, speedMult: 1.8, isBoss: false, bossTimerSec: 30 },
          { count: 14, enemyType: 'tank',   intervalMs: 900,  hpMult: 2.5, speedMult: 1.4, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 3.5, speedMult: 1.6, isBoss: true,  bossTimerSec: 20 },
          { count: 28, enemyType: 'grunt',  intervalMs: 350,  hpMult: 3.2, speedMult: 1.5, isBoss: false, bossTimerSec: 30 },
          { count: 22, enemyType: 'runner', intervalMs: 280,  hpMult: 2.8, speedMult: 1.9, isBoss: false, bossTimerSec: 30 },
          { count: 1,  enemyType: 'boss',   intervalMs: 0,    hpMult: 4.0, speedMult: 1.7, isBoss: true,  bossTimerSec: 18 }
        ]
      }
    ],

    // ── Tower ──────────────────────────────────────────────────────
    TOWER: {
      name: 'Cannon',
      cost: 80,
      sellRatio: 0.7,
      range: 150,
      damage: 35,
      fireRateMs: 800,
      projectileSpeed: 420,
      upgradeLevels: [
        { cost: 0,   damageMult: 1.0,  rangeMult: 1.0,  label: 'Basic Cannon',  special: null },
        { cost: 100, damageMult: 1.25, rangeMult: 1.1,  label: 'Iron Cannon',   special: null },
        { cost: 150, damageMult: 1.6,  rangeMult: 1.2,  label: 'Steel Cannon',  special: 'pierce' },
        { cost: 220, damageMult: 2.0,  rangeMult: 1.3,  label: 'Arc Cannon',    special: 'arc' },
        { cost: 350, damageMult: 2.8,  rangeMult: 1.45, label: 'Void Cannon',   special: 'void' }
      ],
      arcChainCount: 2,
      arcChainRadius: 80,
      voidInterval: 4,
      voidSlowDur: 2.0,
      voidSplashRadius: 70,
      voidDamageMult: 3.0,
      attack: 'projectile'   // 기본 캐논: 투사체 발사
    },

    // ── Tower types (캐논 외 추가 타워) ─────────────────────────────
    // 각 타입은 TOWER 와 동일한 필드 구조 + attack 모드로 동작한다.
    // attack: 'projectile'(캐논) | 'frost'(둔화 투사체) | 'tesla'(즉시 연쇄 번개)
    TOWER_TYPES: {
      frost: {
        name: 'Frost Tower',
        type: 'frost',
        emoji: '❄️',
        cost: 70,
        sellRatio: 0.7,
        range: 100,
        damage: 8,
        fireRateMs: 900,
        projectileSpeed: 280,
        attack: 'frost',
        frostSlowFactor: 0.5,   // 적 속도 50%로 둔화
        frostSlowDur: 1.6,      // 둔화 지속(초)
        frostSplashRadius: 45,  // 명중 지점 주변 둔화 반경
        upgradeLevels: [
          { cost: 0,   damageMult: 1.0, rangeMult: 1.0,  label: 'Frost Spire',   special: null },
          { cost: 90,  damageMult: 1.2, rangeMult: 1.1,  label: 'Ice Spire',     special: null },
          { cost: 140, damageMult: 1.5, rangeMult: 1.2,  label: 'Glacier Spire', special: null },
          { cost: 200, damageMult: 1.9, rangeMult: 1.3,  label: 'Blizzard',      special: 'deepfreeze' },
          { cost: 320, damageMult: 2.4, rangeMult: 1.4,  label: 'Absolute Zero', special: 'deepfreeze' }
        ]
      },
      tesla: {
        name: 'Tesla Tower',
        type: 'tesla',
        emoji: '⚡',
        cost: 110,
        sellRatio: 0.7,
        range: 120,
        damage: 16,
        fireRateMs: 700,
        projectileSpeed: 0,        // 즉시 명중(투사체 없음)
        attack: 'tesla',
        teslaChainCount: 3,        // 기본 연쇄 대상 수
        teslaChainRadius: 90,
        teslaChainFalloff: 0.75,   // 연쇄마다 데미지 75%
        upgradeLevels: [
          { cost: 0,   damageMult: 1.0, rangeMult: 1.0,  label: 'Spark Coil',   special: null },
          { cost: 120, damageMult: 1.3, rangeMult: 1.1,  label: 'Arc Coil',     special: null },
          { cost: 170, damageMult: 1.7, rangeMult: 1.2,  label: 'Storm Coil',   special: null },
          { cost: 240, damageMult: 2.2, rangeMult: 1.3,  label: 'Tempest Coil', special: 'megachain' },
          { cost: 380, damageMult: 3.0, rangeMult: 1.45, label: 'Thunder God',  special: 'megachain' }
        ]
      },
      amplifier: {
        name: 'Amplifier Tower',
        type: 'amplifier',
        emoji: 'AMP',
        cost: 130,
        sellRatio: 0.7,
        range: 135,
        damage: 0,
        fireRateMs: 1000,
        projectileSpeed: 0,
        attack: 'support',
        auraDamageMult: 0.25,
        auraRangeMult: 0.15,
        upgradeLevels: [
          { cost: 0,   damageMult: 1.0, rangeMult: 1.0,  label: 'Signal Post', special: null },
          { cost: 120, damageMult: 1.0, rangeMult: 1.1,  label: 'Relay Post',  special: null },
          { cost: 180, damageMult: 1.0, rangeMult: 1.2,  label: 'Relay Grid',  special: null },
          { cost: 260, damageMult: 1.0, rangeMult: 1.3,  label: 'Overclock',   special: 'strong-aura' },
          { cost: 400, damageMult: 1.0, rangeMult: 1.45, label: 'Command Hub', special: 'wide-aura' }
        ]
      }
    },

    // ── Adjacency Synergies (인접 타워 조합 보너스) ────────────────
    // 서로 다른(또는 같은) 타입의 타워가 radius 안에 함께 있으면 발동.
    SYNERGIES: [
      {
        id: 'shatter', name: 'Shatter', icon: '💥',
        a: 'frost', b: 'cannon', radius: 130,
        desc: 'Cannons next to a Frost tower deal +60% damage to slowed/frozen enemies.',
        bonus: { shatterDmg: 0.6 }
      },
      {
        id: 'overload', name: 'Overload', icon: '🌩️',
        a: 'tesla', b: 'tesla', radius: 150,
        desc: 'Two Tesla towers near each other chain to +2 extra targets.',
        bonus: { teslaChainAdd: 2 }
      },
      {
        id: 'cryocharge', name: 'Cryo-Charge', icon: '❄️⚡',
        a: 'frost', b: 'tesla', radius: 130,
        desc: 'Tesla near Frost: lightning chains also slow every enemy they hit.',
        bonus: { teslaSlow: true }
      },
      {
        id: 'barrage', name: 'Barrage', icon: 'BRG',
        a: 'cannon', b: 'cannon', radius: 120,
        desc: 'Cannons placed in pairs reload 18% faster.',
        bonus: { fireRateMult: -0.18 }
      },
      {
        id: 'supercharge', name: 'Supercharge', icon: 'AMP',
        a: 'amplifier', b: 'tesla', radius: 145,
        desc: 'Amplifiers near Tesla towers increase chain damage and add one chain.',
        bonus: { teslaDamageMult: 0.25, teslaChainAdd: 1 }
      }
    ],

    // ── Enemy types ───────────────────────────────────────────────
    ENEMY_TYPES: {
      grunt:  { hp: 60,   speed: 70,  reward: 10,  damage: 1, size: 16, spriteToken: 'enemy_grunt',  colorToken: 'enemy_grunt_color',  isBoss: false },
      runner: { hp: 30,   speed: 140, reward: 8,   damage: 1, size: 12, spriteToken: 'enemy_runner', colorToken: 'enemy_runner_color', isBoss: false },
      tank:   { hp: 400,  speed: 35,  reward: 50,  damage: 3, size: 24, spriteToken: 'enemy_tank',   colorToken: 'enemy_tank_color',   isBoss: false },
      boss:   { hp: 2000, speed: 50,  reward: 200, damage: 5, size: 38, spriteToken: 'enemy_boss',   colorToken: 'enemy_boss_color',   isBoss: true  }
    },

    // ── Passives ──────────────────────────────────────────────────
    PASSIVES: [
      { id: 'range_up',    name: 'Extended Barrel', icon: '📡', rarity: 'common',    effectKey: 'range',      effectVal: 0.15, description: '×1.15 range for all towers' },
      { id: 'damage_up',   name: 'Steel Shot',      icon: '💪', rarity: 'common',    effectKey: 'damage',     effectVal: 0.20, description: '×1.20 damage for all towers' },
      { id: 'fire_rate_up',name: 'Auto-Loader',     icon: '⚙️', rarity: 'common',    effectKey: 'firerate',   effectVal: -0.15,description: '×0.85 cooldown (faster fire rate)' },
      { id: 'gold_up',     name: 'Gilded Touch',    icon: '💰', rarity: 'uncommon',  effectKey: 'gold',       effectVal: 0.25, description: '×1.25 gold per kill' },
      { id: 'crit',        name: 'Critical Aim',    icon: '🎯', rarity: 'uncommon',  effectKey: 'crit',       effectVal: 0.10, description: '+10% critical hit chance' },
      { id: 'slow',        name: 'Frostbite Shell', icon: '❄️', rarity: 'uncommon',  effectKey: 'slowChance', effectVal: 0.30, description: '30% chance to slow enemies on hit' },
      { id: 'splash',      name: 'Explosive Round', icon: '💣', rarity: 'rare',      effectKey: 'splash',     effectVal: 40,   description: '+40px splash radius on hit' },
      { id: 'pierce',      name: 'Piercing Round',  icon: '🏹', rarity: 'rare',      effectKey: 'pierce',     effectVal: 1,    description: '+1 pierce (projectile passes through extra enemy)' },
      { id: 'chain',       name: 'Chain Lightning', icon: '⚡', rarity: 'rare',      effectKey: 'chain',      effectVal: 1,    description: '+1 arc chain count for Arc Cannon' },
      { id: 'freeze',      name: 'Deep Freeze',     icon: '🧊', rarity: 'legendary', effectKey: 'freeze',     effectVal: 1,    description: 'On kill: freeze all enemies in 60px for 1.5s' },
      { id: 'multishot',   name: 'Triple Barrel',   icon: '🔱', rarity: 'legendary', effectKey: 'multishot',  effectVal: 2,    description: 'Fire 3 projectiles per shot in a spread' },
      { id: 'cost_down',   name: 'Mass Production', icon: '🏭', rarity: 'legendary', effectKey: 'costMult',   effectVal: -0.30,description: '×0.70 tower placement cost' }
    ],

    // ── Probability ────────────────────────────────────────────────
    PROBABILITY: {
      passivePool: { common: 60, uncommon: 25, rare: 12, legendary: 3 },
      offerCount: 3,
      rerollCost: 50
    },

    // ── Live Events ────────────────────────────────────────────────
    LIVE_EVENTS: {
      blessingEveryNWaves: 3,
      blessingCapacityBonus: 2,
      bountyKillTarget: 30,
      bountyCapacityBonus: 1,
      perfectWaveBonus: 1,
      bossSlayerCapacityBonus: 3,
      bossSlayerGold: 100,
      bossSlayerThresholdPct: 0.5,
      supplyDropChance: 0.10,
      supplyDropGold: 50,
      supplyDropCapacityBonus: 1
    },

    // ── Infinity Mode ──────────────────────────────────────────────
    INFINITY: {
      hpScalePerWave: 0.12,
      speedScalePerWave: 0.04,
      countBase: 6,
      countPerWave: 2,
      intervalMs: 1000,
      intervalMinMs: 400,
      bossEveryNWaves: 5,
      bossHpScale: 0.15,
      bossTimerSec: 30
    },

    // ── Base / Economy ─────────────────────────────────────────────
    BASE_CAPACITY: 20,
    BASE_RADIUS: 35,
    SPAWN_COUNT: 8,
    SPAWN_MARGIN: 40,
    STARTING_GOLD: 120
  };

  window.TD_CONFIG   = JSON.parse(JSON.stringify(DEFAULTS));
  window.TD_DEFAULTS = JSON.parse(JSON.stringify(DEFAULTS));
})();
