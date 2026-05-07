'use strict';
// graphics/theme.js — Single source of truth for all visual tokens.
// Swap values here to completely retheme without touching game.js or ui.js.

window.TOKEN_MAP = {
  // ── Backgrounds ─────────────────────────────────────────────────
  'bg_forest':        { type: 'color', value: '#0d1a0d' },
  'bg_castle':        { type: 'color', value: '#1a1a2e' },
  'bg_desert':        { type: 'color', value: '#2e1a0d' },
  'bg_snow':          { type: 'color', value: '#0d1a2e' },
  'bg_crypt':         { type: 'color', value: '#120a1a' },

  // ── Player ──────────────────────────────────────────────────────
  'player':           { type: 'emoji', value: '🧙' },
  'player_color':     { type: 'color', value: '#d7a3f5' },
  'player_trail':     { type: 'color', value: 'rgba(215,163,245,0.18)' },

  // ── Enemies ─────────────────────────────────────────────────────
  'enemy_zombie':       { type: 'emoji', value: '🧟' },
  'enemy_skeleton':     { type: 'emoji', value: '💀' },
  'enemy_bat':          { type: 'emoji', value: '🦇' },
  'enemy_ghost':        { type: 'emoji', value: '👻' },
  'enemy_demon':        { type: 'emoji', value: '👿' },
  'enemy_elite':        { type: 'emoji', value: '👹' },
  'enemy_boss':         { type: 'emoji', value: '🐉' },

  'enemy_zombie_color':    { type: 'color', value: '#7dcea0' },
  'enemy_skeleton_color':  { type: 'color', value: '#d5d8dc' },
  'enemy_bat_color':       { type: 'color', value: '#8e44ad' },
  'enemy_ghost_color':     { type: 'color', value: '#abebc6' },
  'enemy_demon_color':     { type: 'color', value: '#e74c3c' },
  'enemy_elite_color':     { type: 'color', value: '#e67e22' },
  'enemy_boss_color':      { type: 'color', value: '#c0392b' },

  // ── Skill / weapon icons ─────────────────────────────────────────
  'icon_orb':         { type: 'emoji', value: '🔵' },
  'icon_arrow':       { type: 'emoji', value: '🏹' },
  'icon_nova':        { type: 'emoji', value: '💥' },
  'icon_shield':      { type: 'emoji', value: '🛡' },
  'icon_laser':       { type: 'emoji', value: '⚡' },
  'icon_aura':        { type: 'emoji', value: '✨' },
  'icon_whip':        { type: 'emoji', value: '🔥' },
  'icon_bible':       { type: 'emoji', value: '📖' },
  'icon_knife':       { type: 'emoji', value: '🗡' },
  'icon_garlic':      { type: 'emoji', value: '🧄' },

  // ── Projectile / effect colors ───────────────────────────────────
  'proj_orb':         { type: 'color', value: '#4af' },
  'proj_arrow':       { type: 'color', value: '#fa4' },
  'proj_nova':        { type: 'color', value: '#f44' },
  'proj_laser':       { type: 'color', value: '#ff0' },
  'proj_aura':        { type: 'color', value: 'rgba(200,100,255,0.25)' },
  'particle_hit':     { type: 'color', value: '#fff' },
  'particle_xp':      { type: 'color', value: '#f1c40f' },
  'particle_exp':     { type: 'color', value: '#e74c3c' },

  // ── Passive / consumable icons ───────────────────────────────────
  'icon_heart':       { type: 'emoji', value: '❤️' },
  'icon_coin':        { type: 'emoji', value: '🪙' },
  'icon_xp_gem':      { type: 'emoji', value: '💎' },
  'icon_chest':       { type: 'emoji', value: '📦' },
  'icon_garlic_ring': { type: 'emoji', value: '🧄' },
  'icon_spinach':     { type: 'emoji', value: '🥬' },
  'icon_pummarola':   { type: 'emoji', value: '🍅' },
  'icon_hollow_heart':{ type: 'emoji', value: '💜' },
  'icon_spellbinder': { type: 'emoji', value: '🔮' },

  // ── HUD colors ───────────────────────────────────────────────────
  'hud_hp':           { type: 'color', value: '#e74c3c' },
  'hud_hp_bg':        { type: 'color', value: 'rgba(231,76,60,0.2)' },
  'hud_xp':           { type: 'color', value: '#f39c12' },
  'hud_xp_bg':        { type: 'color', value: 'rgba(243,156,18,0.2)' },
  'hud_text':         { type: 'color', value: '#e0d6f0' },
  'hud_timer':        { type: 'color', value: '#aaa' },

  // ── Rarity colors ────────────────────────────────────────────────
  'rarity_common':    { type: 'color', value: '#95a5a6' },
  'rarity_uncommon':  { type: 'color', value: '#27ae60' },
  'rarity_rare':      { type: 'color', value: '#2980b9' },
  'rarity_legendary': { type: 'color', value: '#f39c12' },

  // ── Character icons ──────────────────────────────────────────────
  'char_wizard':      { type: 'emoji', value: '🧙' },
  'char_warrior':     { type: 'emoji', value: '🧝' },
  'char_rogue':       { type: 'emoji', value: '🧛' },
  'char_cleric':      { type: 'emoji', value: '🧝‍♀️' },
};

// ── Core resolver ────────────────────────────────────────────────────────────
window.resolveToken = function (key) {
  var t = window.TOKEN_MAP[key];
  if (!t) return { type: 'color', value: '#888888' };
  return t;
};

// Shorthand helpers used by game.js draw functions
window.tokenColor = function (key) {
  var t = resolveToken(key);
  return t.type === 'color' ? t.value : '#888888';
};

window.tokenEmoji = function (key) {
  var t = resolveToken(key);
  return t.type === 'emoji' ? t.value : '?';
};
