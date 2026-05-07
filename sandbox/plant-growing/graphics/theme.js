'use strict';
// graphics/theme.js — Token map for Plant Growing Sandbox

window.TOKEN_MAP = {
  // ── Growth stage sprites ────────────────────────────────────────
  'plant_seed':        { type: 'emoji', value: '🌱' },
  'plant_sprout':      { type: 'emoji', value: '🌿' },
  'plant_sapling':     { type: 'emoji', value: '🪴' },
  'plant_bush':        { type: 'emoji', value: '🌳' },
  'plant_flower':      { type: 'emoji', value: '🌸' },
  'plant_bloom':       { type: 'emoji', value: '🌺' },
  'plant_fruit':       { type: 'emoji', value: '🍎' },
  'plant_ancient':     { type: 'emoji', value: '🌲' },
  'plant_mythic':      { type: 'emoji', value: '🎋' },

  // ── Ambient animations ──────────────────────────────────────────
  'anim_leaves_small': { type: 'emoji', value: '🍃' },
  'anim_leaves_large': { type: 'emoji', value: '🍀' },
  'anim_petals':       { type: 'emoji', value: '🌸' },
  'anim_sparkle':      { type: 'emoji', value: '✨' },
  'anim_fruit_drop':   { type: 'emoji', value: '🍏' },

  // ── Resources ───────────────────────────────────────────────────
  'icon_coin':         { type: 'emoji', value: '🪙' },
  'icon_gem':          { type: 'emoji', value: '💎' },
  'icon_water':        { type: 'emoji', value: '💧' },
  'icon_sun':          { type: 'emoji', value: '☀️' },
  'icon_fertilizer':   { type: 'emoji', value: '🧪' },
  'icon_seed_bag':     { type: 'emoji', value: '🌾' },
  'icon_heart':        { type: 'emoji', value: '❤️' },

  // ── Upgrade icons ───────────────────────────────────────────────
  'icon_roots':        { type: 'emoji', value: '🌵' },
  'icon_leaves':       { type: 'emoji', value: '🍃' },
  'icon_bark':         { type: 'emoji', value: '🪵' },
  'icon_flowers':      { type: 'emoji', value: '🌸' },
  'icon_fruits':       { type: 'emoji', value: '🍎' },
  'icon_nectar':       { type: 'emoji', value: '🍯' },
  'icon_spores':       { type: 'emoji', value: '🍄' },
  'icon_crystal':      { type: 'emoji', value: '💠' },

  // ── Weather tokens ──────────────────────────────────────────────
  'weather_sunny':     { type: 'emoji', value: '☀️' },
  'weather_cloudy':    { type: 'emoji', value: '⛅' },
  'weather_rainy':     { type: 'emoji', value: '🌧️' },
  'weather_stormy':    { type: 'emoji', value: '⛈️' },
  'weather_snowy':     { type: 'emoji', value: '❄️' },
  'weather_foggy':     { type: 'emoji', value: '🌫️' },
  'weather_windy':     { type: 'emoji', value: '💨' },

  // ── Visitor tokens ──────────────────────────────────────────────
  'visitor_bee':       { type: 'emoji', value: '🐝' },
  'visitor_butterfly': { type: 'emoji', value: '🦋' },
  'visitor_bird':      { type: 'emoji', value: '🐦' },
  'visitor_rabbit':    { type: 'emoji', value: '🐰' },
  'visitor_fairy':     { type: 'emoji', value: '🧚' },
  'visitor_gnome':     { type: 'emoji', value: '🧙' },
  'visitor_merchant':  { type: 'emoji', value: '🛒' },

  // ── Background colors ───────────────────────────────────────────
  'bg_garden':         { type: 'color', value: '#0d1f0d' },
  'bg_greenhouse':     { type: 'color', value: '#0d1a0a' },
  'bg_forest':         { type: 'color', value: '#071407' },
  'bg_desert':         { type: 'color', value: '#1f1a0a' },
  'bg_winter':         { type: 'color', value: '#0a1225' },
  'bg_magical':        { type: 'color', value: '#110a1f' },

  // ── HUD colors ───────────────────────────────────────────────────
  'hud_coins':         { type: 'color', value: '#f1c40f' },
  'hud_gems':          { type: 'color', value: '#9b59b6' },
  'hud_xp':            { type: 'color', value: '#27ae60' },
  'hud_xp_bg':         { type: 'color', value: 'rgba(39,174,96,0.2)' },
  'hud_text':          { type: 'color', value: '#d5f0d5' },

  // ── Event icons ──────────────────────────────────────────────────
  'event_rain':        { type: 'emoji', value: '🌧️' },
  'event_pest':        { type: 'emoji', value: '🐛' },
  'event_blessing':    { type: 'emoji', value: '🌟' },
  'event_drought':     { type: 'emoji', value: '🏜️' },
  'event_harvest':     { type: 'emoji', value: '🌽' },
  'event_festival':    { type: 'emoji', value: '🎉' },
  'event_storm':       { type: 'emoji', value: '⛈️' },

  // ── Prestige ─────────────────────────────────────────────────────
  'icon_prestige':     { type: 'emoji', value: '⭐' },

  // ── Particle colors ──────────────────────────────────────────────
  'particle_xp':       { type: 'color', value: '#27ae60' },
  'particle_coin':     { type: 'color', value: '#f1c40f' },
  'particle_gem':      { type: 'color', value: '#9b59b6' },
  'particle_leaf':     { type: 'color', value: '#2ecc71' },
};

window.resolveToken = function (key) {
  var t = window.TOKEN_MAP[key];
  if (!t) return { type: 'color', value: '#888888' };
  return t;
};

window.tokenColor = function (key) {
  var t = resolveToken(key);
  return t.type === 'color' ? t.value : '#888888';
};

window.tokenEmoji = function (key) {
  var t = resolveToken(key);
  return t.type === 'emoji' ? t.value : '?';
};
