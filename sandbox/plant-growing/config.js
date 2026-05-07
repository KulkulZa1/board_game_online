'use strict';
// config.js — window.PG_CONFIG + window.PG_DEFAULTS
// All tunable values for the Plant Growing Sandbox.
// window.PG_CONFIG is the live mutable object — edit it from the panel.
// window.PG_DEFAULTS is a frozen deep-clone for Reset-to-Default.

(function () {
  var DEFAULTS = {

    // ── Growth stages ─────────────────────────────────────────────
    GROWTH_STAGES: [
      {
        id: 'seed', name: 'Seed', spriteToken: 'plant_seed',
        bgToken: 'bg_garden',
        xpRequired: 0,
        idleIncomePerSec: 1,
        offlineIncomePerSec: 0.5,
        offlineCapHours: 8,
        tapValue: 2,
        ambientAnimToken: 'anim_leaves_small',
        soilMoistureBonus: 0,
        unlocks: []
      },
      {
        id: 'sprout', name: 'Sprout', spriteToken: 'plant_sprout',
        bgToken: 'bg_garden',
        xpRequired: 50,
        idleIncomePerSec: 3,
        offlineIncomePerSec: 1.5,
        offlineCapHours: 10,
        tapValue: 5,
        ambientAnimToken: 'anim_leaves_small',
        soilMoistureBonus: 5,
        unlocks: ['deeper_roots']
      },
      {
        id: 'sapling', name: 'Sapling', spriteToken: 'plant_sapling',
        bgToken: 'bg_garden',
        xpRequired: 200,
        idleIncomePerSec: 8,
        offlineIncomePerSec: 4,
        offlineCapHours: 12,
        tapValue: 12,
        ambientAnimToken: 'anim_leaves_large',
        soilMoistureBonus: 10,
        unlocks: ['sturdy_stem', 'leaf_canopy']
      },
      {
        id: 'bush', name: 'Bush', spriteToken: 'plant_bush',
        bgToken: 'bg_greenhouse',
        xpRequired: 600,
        idleIncomePerSec: 18,
        offlineIncomePerSec: 9,
        offlineCapHours: 14,
        tapValue: 25,
        ambientAnimToken: 'anim_leaves_large',
        soilMoistureBonus: 15,
        unlocks: ['dense_foliage']
      },
      {
        id: 'flower', name: 'Flower', spriteToken: 'plant_flower',
        bgToken: 'bg_greenhouse',
        xpRequired: 1500,
        idleIncomePerSec: 40,
        offlineIncomePerSec: 20,
        offlineCapHours: 16,
        tapValue: 50,
        ambientAnimToken: 'anim_petals',
        soilMoistureBonus: 20,
        unlocks: ['petal_shower', 'nectar_glands']
      },
      {
        id: 'bloom', name: 'Full Bloom', spriteToken: 'plant_bloom',
        bgToken: 'bg_forest',
        xpRequired: 4000,
        idleIncomePerSec: 90,
        offlineIncomePerSec: 45,
        offlineCapHours: 18,
        tapValue: 110,
        ambientAnimToken: 'anim_petals',
        soilMoistureBonus: 25,
        unlocks: ['root_network', 'photosynthesis_pro']
      },
      {
        id: 'fruit', name: 'Fruit Bearer', spriteToken: 'plant_fruit',
        bgToken: 'bg_forest',
        xpRequired: 10000,
        idleIncomePerSec: 200,
        offlineIncomePerSec: 100,
        offlineCapHours: 20,
        tapValue: 250,
        ambientAnimToken: 'anim_fruit_drop',
        soilMoistureBonus: 30,
        unlocks: ['fruit_drop_rate', 'seed_cannon']
      },
      {
        id: 'ancient', name: 'Ancient Tree', spriteToken: 'plant_ancient',
        bgToken: 'bg_forest',
        xpRequired: 30000,
        idleIncomePerSec: 500,
        offlineIncomePerSec: 250,
        offlineCapHours: 24,
        tapValue: 600,
        ambientAnimToken: 'anim_sparkle',
        soilMoistureBonus: 40,
        unlocks: ['ley_lines', 'elder_sap']
      },
      {
        id: 'mythic', name: 'Mythic Grove', spriteToken: 'plant_mythic',
        bgToken: 'bg_magical',
        xpRequired: 100000,
        idleIncomePerSec: 1500,
        offlineIncomePerSec: 750,
        offlineCapHours: 48,
        tapValue: 2000,
        ambientAnimToken: 'anim_sparkle',
        soilMoistureBonus: 60,
        unlocks: ['infinity_roots']
      }
    ],

    // ── Upgrades ──────────────────────────────────────────────────
    UPGRADES: [
      {
        id: 'deeper_roots', name: 'Deeper Roots', tier: 1,
        icon: 'icon_roots', rarity: 'common',
        cost: { coins: 100, gems: 0 },
        requires: [],
        effect: { idleIncomeMultiplier: 1.1, offlineCapHours: 1 },
        maxPurchases: 3,
        flavour: 'Roots reach further into the soil.',
        _editorX: 20, _editorY: 20
      },
      {
        id: 'sturdy_stem', name: 'Sturdy Stem', tier: 1,
        icon: 'icon_bark', rarity: 'common',
        cost: { coins: 150, gems: 0 },
        requires: ['deeper_roots'],
        effect: { tapMultiplier: 1.2 },
        maxPurchases: 3,
        flavour: 'A stronger stem means harder taps.',
        _editorX: 80, _editorY: 20
      },
      {
        id: 'leaf_canopy', name: 'Leaf Canopy', tier: 2,
        icon: 'icon_leaves', rarity: 'uncommon',
        cost: { coins: 500, gems: 0 },
        requires: ['sturdy_stem'],
        effect: { idleIncomeMultiplier: 1.25, sunlightBonus: 10 },
        maxPurchases: 2,
        flavour: 'More leaves capture more sunlight.',
        _editorX: 140, _editorY: 20
      },
      {
        id: 'dense_foliage', name: 'Dense Foliage', tier: 2,
        icon: 'icon_leaves', rarity: 'uncommon',
        cost: { coins: 1000, gems: 2 },
        requires: ['leaf_canopy'],
        effect: { offlineIncomeMultiplier: 1.3 },
        maxPurchases: 2,
        flavour: 'Dense leaves protect against drought.',
        _editorX: 200, _editorY: 20
      },
      {
        id: 'petal_shower', name: 'Petal Shower', tier: 2,
        icon: 'icon_flowers', rarity: 'uncommon',
        cost: { coins: 2000, gems: 3 },
        requires: ['dense_foliage'],
        effect: { tapXpMultiplier: 1.5 },
        maxPurchases: 1,
        flavour: 'Each tap releases a shower of petals.',
        _editorX: 20, _editorY: 80
      },
      {
        id: 'nectar_glands', name: 'Nectar Glands', tier: 2,
        icon: 'icon_nectar', rarity: 'rare',
        cost: { coins: 3000, gems: 5 },
        requires: ['petal_shower'],
        effect: { visitorFrequencyMultiplier: 2 },
        maxPurchases: 1,
        flavour: 'Attracts more visitors with sweet nectar.',
        _editorX: 80, _editorY: 80
      },
      {
        id: 'root_network', name: 'Root Network', tier: 3,
        icon: 'icon_roots', rarity: 'rare',
        cost: { coins: 8000, gems: 10 },
        requires: ['nectar_glands'],
        effect: { idleIncomeMultiplier: 1.5, offlineCapHours: 4 },
        maxPurchases: 1,
        flavour: 'Underground root network links all soil nutrients.',
        _editorX: 140, _editorY: 80
      },
      {
        id: 'photosynthesis_pro', name: 'Photosynthesis Pro', tier: 3,
        icon: 'icon_sun', rarity: 'rare',
        cost: { coins: 10000, gems: 15 },
        requires: ['root_network'],
        effect: { sunlightBonus: 25, idleIncomeMultiplier: 1.4 },
        maxPurchases: 1,
        flavour: 'Maximises light absorption.',
        _editorX: 200, _editorY: 80
      },
      {
        id: 'fruit_drop_rate', name: 'Fruit Drop Rate', tier: 3,
        icon: 'icon_fruits', rarity: 'legendary',
        cost: { coins: 25000, gems: 20 },
        requires: ['photosynthesis_pro'],
        effect: { gemDropChance: 0.05, tapValue: 500 },
        maxPurchases: 1,
        flavour: 'Ripe fruit occasionally contains gemstones.',
        _editorX: 20, _editorY: 140
      },
      {
        id: 'ley_lines', name: 'Ley Lines', tier: 3,
        icon: 'icon_crystal', rarity: 'legendary',
        cost: { coins: 50000, gems: 30 },
        requires: ['fruit_drop_rate'],
        effect: { idleIncomeMultiplier: 2, offlineCapHours: 12 },
        maxPurchases: 1,
        flavour: 'Tap into ancient magical energy lines.',
        _editorX: 80, _editorY: 140
      }
    ],

    // ── Items ─────────────────────────────────────────────────────
    ITEMS: [
      {
        id: 'watering_can', name: 'Watering Can', category: 'tool',
        icon: 'icon_water', rarity: 'common',
        effect: { type: 'xp_burst', value: 20 },
        cooldownSec: 30,
        cost: { coins: 50 }
      },
      {
        id: 'fertilizer_bag', name: 'Fertilizer Bag', category: 'fertilizer',
        icon: 'icon_fertilizer', rarity: 'uncommon',
        effect: { type: 'idleMultiplier', value: 2, durationSec: 60 },
        cooldownSec: 120,
        cost: { coins: 200 }
      },
      {
        id: 'golden_spade', name: 'Golden Spade', category: 'tool',
        icon: 'icon_coin', rarity: 'rare',
        effect: { type: 'tapMultiplier', value: 5, durationSec: 30 },
        cooldownSec: 180,
        cost: { coins: 500, gems: 1 }
      },
      {
        id: 'moon_dust', name: 'Moon Dust', category: 'fertilizer',
        icon: 'icon_gem', rarity: 'legendary',
        effect: { type: 'idleMultiplier', value: 10, durationSec: 120 },
        cooldownSec: 3600,
        cost: { gems: 5 }
      },
      {
        id: 'sun_crystal', name: 'Sun Crystal', category: 'decoration',
        icon: 'icon_sun', rarity: 'rare',
        effect: { type: 'sunlightBonus', value: 20 },
        cooldownSec: 0,
        cost: { gems: 3 }
      }
    ],

    // ── Events ────────────────────────────────────────────────────
    EVENTS: [
      {
        id: 'spring_rain', name: 'Spring Rain', icon: 'event_rain',
        triggerType: 'random',
        chancePerTenMin: 0.15,
        effect: { type: 'idleMultiplier', value: 1.5, durationSec: 120 },
        message: 'A gentle rain nourishes your plant! +50% income for 2 min.'
      },
      {
        id: 'pest_attack', name: 'Pest Attack', icon: 'event_pest',
        triggerType: 'random',
        chancePerTenMin: 0.08,
        effect: { type: 'idleMultiplier', value: 0.5, durationSec: 60 },
        message: 'Pests are attacking! -50% income for 1 min.'
      },
      {
        id: 'divine_blessing', name: 'Divine Blessing', icon: 'event_blessing',
        triggerType: 'condition',
        condition: { stat: 'coins', op: '>=', value: 10000 },
        effect: { type: 'xp_burst', value: 500 },
        message: 'The gods notice your thriving garden! +500 XP.'
      },
      {
        id: 'harvest_festival', name: 'Harvest Festival', icon: 'event_harvest',
        triggerType: 'scheduled',
        atMinute: 30,
        effect: { type: 'coinBurst', value: 5000 },
        message: 'Harvest Festival! +5000 coins.'
      },
      {
        id: 'drought', name: 'Drought', icon: 'event_drought',
        triggerType: 'random',
        chancePerTenMin: 0.06,
        effect: { type: 'idleMultiplier', value: 0.3, durationSec: 90 },
        message: 'Drought strikes! -70% income for 90 seconds.'
      },
      {
        id: 'magical_storm', name: 'Magical Storm', icon: 'event_storm',
        triggerType: 'random',
        chancePerTenMin: 0.04,
        effect: { type: 'gemDrop', value: 3 },
        message: 'A magical storm passes through, scattering gems!'
      }
    ],

    // ── Visitors ──────────────────────────────────────────────────
    VISITORS: [
      {
        id: 'bee', name: 'Bee', token: 'visitor_bee',
        condition: { minStage: 4 },
        reward: { type: 'xp', value: 50 },
        frequencyMin: 5,
        idleAnimToken: 'anim_sparkle',
        message: 'A bee visits and pollinates your flower! +50 XP'
      },
      {
        id: 'butterfly', name: 'Butterfly', token: 'visitor_butterfly',
        condition: { minStage: 5 },
        reward: { type: 'coins', value: 200 },
        frequencyMin: 8,
        idleAnimToken: 'anim_petals',
        message: 'A beautiful butterfly rests on your bloom! +200 coins'
      },
      {
        id: 'bird', name: 'Bird', token: 'visitor_bird',
        condition: { minStage: 3 },
        reward: { type: 'xp', value: 30 },
        frequencyMin: 4,
        idleAnimToken: 'anim_leaves_small',
        message: 'A bird perches on a branch and sings! +30 XP'
      },
      {
        id: 'rabbit', name: 'Rabbit', token: 'visitor_rabbit',
        condition: { minStage: 2 },
        reward: { type: 'coins', value: 50 },
        frequencyMin: 3,
        idleAnimToken: 'anim_leaves_small',
        message: 'A rabbit nibbles near your plant... and drops coins! +50'
      },
      {
        id: 'merchant', name: 'Merchant', token: 'visitor_merchant',
        condition: { minStage: 6 },
        reward: { type: 'gems', value: 1 },
        frequencyMin: 20,
        idleAnimToken: 'anim_sparkle',
        message: 'A travelling merchant trades for a gem! +1 gem'
      },
      {
        id: 'fairy', name: 'Fairy', token: 'visitor_fairy',
        condition: { minStage: 8 },
        reward: { type: 'multiplier', value: 2, durationSec: 60 },
        frequencyMin: 30,
        idleAnimToken: 'anim_sparkle',
        message: 'A fairy blesses your ancient tree! 2× income for 1 min'
      }
    ],

    // ── Seasons (7-day cycle) ────────────────────────────────────
    SEASONS: [
      { day: 0, name: 'Monday',    weatherToken: 'weather_sunny',  idleMultiplier: 1.2, tapMultiplier: 1.0 },
      { day: 1, name: 'Tuesday',   weatherToken: 'weather_cloudy', idleMultiplier: 1.0, tapMultiplier: 1.1 },
      { day: 2, name: 'Wednesday', weatherToken: 'weather_rainy',  idleMultiplier: 1.4, tapMultiplier: 0.9 },
      { day: 3, name: 'Thursday',  weatherToken: 'weather_sunny',  idleMultiplier: 1.3, tapMultiplier: 1.0 },
      { day: 4, name: 'Friday',    weatherToken: 'weather_windy',  idleMultiplier: 0.8, tapMultiplier: 1.2 },
      { day: 5, name: 'Saturday',  weatherToken: 'weather_stormy', idleMultiplier: 0.5, tapMultiplier: 1.5 },
      { day: 6, name: 'Sunday',    weatherToken: 'weather_sunny',  idleMultiplier: 1.5, tapMultiplier: 1.3 }
    ],

    // ── Prestige ─────────────────────────────────────────────────
    PRESTIGE: {
      keepList: ['deeper_roots', 'sturdy_stem'],
      sacrificeList: ['ley_lines', 'fruit_drop_rate'],
      startingCoinBonus: 1000,
      multiplierCurve: [
        { prestige: 0, multiplier: 1.0 },
        { prestige: 1, multiplier: 1.5 },
        { prestige: 2, multiplier: 2.2 },
        { prestige: 3, multiplier: 3.0 },
        { prestige: 5, multiplier: 5.0 },
        { prestige: 10, multiplier: 10.0 },
        { prestige: 20, multiplier: 25.0 }
      ]
    },

    // ── Daily missions ────────────────────────────────────────────
    DAILY_MISSIONS: [
      {
        id: 'tap_100', name: 'Tap 100 times',
        type: 'tap_count', target: 100,
        reward: { coins: 500 }, refreshDaily: true
      },
      {
        id: 'earn_coins', name: 'Earn 2000 coins',
        type: 'earn_coins', target: 2000,
        reward: { xp: 100 }, refreshDaily: true
      },
      {
        id: 'survive_30min', name: 'Be active 30 minutes',
        type: 'playtime_sec', target: 1800,
        reward: { gems: 1 }, refreshDaily: true
      },
      {
        id: 'visitor_3', name: 'Receive 3 visitors',
        type: 'visitor_count', target: 3,
        reward: { coins: 1000 }, refreshDaily: true
      },
      {
        id: 'use_item_5', name: 'Use items 5 times',
        type: 'item_use_count', target: 5,
        reward: { xp: 200, coins: 300 }, refreshDaily: true
      }
    ],

    // ── Soil stats (tunable baseline) ────────────────────────────
    SOIL_STATS: {
      moistureBase: 50,
      nutrientsBase: 50,
      sunlightBase: 50,
      decayRatePerHour: 5,
      moistureEffect: 0.02,   // per point above 50 → extra idle%
      nutrientsEffect: 0.015,
      sunlightEffect: 0.025
    },

    // ── XP curve (per stage) ──────────────────────────────────────
    // XP needed to advance FROM stage[i] TO stage[i+1]
    XP_TO_NEXT: [50, 150, 400, 900, 2500, 6000, 20000, 70000]
  };

  window.PG_CONFIG  = JSON.parse(JSON.stringify(DEFAULTS));
  window.PG_DEFAULTS = JSON.parse(JSON.stringify(DEFAULTS));
})();
