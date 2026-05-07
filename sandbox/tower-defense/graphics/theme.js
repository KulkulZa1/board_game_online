'use strict';
// graphics/theme.js — Single source of truth for all visual tokens.

window.TOKEN_MAP = {
  // ── Backgrounds ─────────────────────────────────────────────────
  'bg_dawn':        { type: 'color', value: '#0d1520' },
  'bg_dusk':        { type: 'color', value: '#1a1008' },
  'bg_nightfall':   { type: 'color', value: '#0a0d1a' },
  'bg_cursed':      { type: 'color', value: '#110d1a' },
  'bg_storm':       { type: 'color', value: '#0a1010' },
  'bg_abyss':       { type: 'color', value: '#080810' },
  'bg_siege':       { type: 'color', value: '#100808' },
  'bg_chaos':       { type: 'color', value: '#100a08' },
  'bg_apocalypse':  { type: 'color', value: '#100808' },
  'bg_endgame':     { type: 'color', value: '#08080c' },
  'bg_infinity':    { type: 'color', value: '#050508' },

  // ── Base ─────────────────────────────────────────────────────────
  'base':           { type: 'emoji', value: '🏯' },
  'base_color':     { type: 'color', value: '#f1c40f' },
  'base_glow':      { type: 'color', value: 'rgba(241,196,15,0.3)' },
  'base_hit':       { type: 'color', value: 'rgba(231,76,60,0.6)' },

  // ── Tower levels ──────────────────────────────────────────────────
  'tower_lv1':      { type: 'emoji', value: '🗼' },
  'tower_lv2':      { type: 'emoji', value: '🏰' },
  'tower_lv3':      { type: 'emoji', value: '🔫' },
  'tower_lv4':      { type: 'emoji', value: '⚡' },
  'tower_lv5':      { type: 'emoji', value: '💥' },
  'tower_color':    { type: 'color', value: '#3498db' },
  'tower_range':    { type: 'color', value: 'rgba(52,152,219,0.12)' },
  'tower_range_hover': { type: 'color', value: 'rgba(52,152,219,0.25)' },
  'tower_selected': { type: 'color', value: 'rgba(52,152,219,0.35)' },

  // ── Enemies ───────────────────────────────────────────────────────
  'enemy_grunt':        { type: 'emoji', value: '🧟' },
  'enemy_runner':       { type: 'emoji', value: '🦇' },
  'enemy_tank':         { type: 'emoji', value: '🐢' },
  'enemy_boss':         { type: 'emoji', value: '👑' },

  'enemy_grunt_color':  { type: 'color', value: '#7dcea0' },
  'enemy_runner_color': { type: 'color', value: '#8e44ad' },
  'enemy_tank_color':   { type: 'color', value: '#e67e22' },
  'enemy_boss_color':   { type: 'color', value: '#c0392b' },

  // ── Spawn point ──────────────────────────────────────────────────
  'spawn_point':    { type: 'emoji', value: '🔴' },
  'spawn_color':    { type: 'color', value: '#e74c3c' },

  // ── Projectiles ──────────────────────────────────────────────────
  'proj_cannon':    { type: 'color', value: '#fa4' },
  'proj_arc':       { type: 'color', value: '#4af' },
  'proj_void':      { type: 'color', value: '#c39bf7' },
  'proj_chain':     { type: 'color', value: '#00ffee' },
  'proj_slow':      { type: 'color', value: '#88ccff' },
  'proj_void_aoe':  { type: 'color', value: 'rgba(195,59,247,0.4)' },

  // ── Particles ────────────────────────────────────────────────────
  'particle_hit':   { type: 'color', value: '#fff' },
  'particle_gold':  { type: 'color', value: '#f1c40f' },
  'particle_slow':  { type: 'color', value: '#88ddff' },

  // ── HUD ──────────────────────────────────────────────────────────
  'hud_gold':       { type: 'color', value: '#f1c40f' },
  'hud_capacity':   { type: 'color', value: '#e74c3c' },
  'hud_wave':       { type: 'color', value: '#3498db' },
  'hud_text':       { type: 'color', value: '#e0d6f0' },
  'hud_timer':      { type: 'color', value: '#e74c3c' },
  'hud_boss_timer': { type: 'color', value: '#e74c3c' },
  'hud_muted':      { type: 'color', value: '#888' },

  // ── Rarity ───────────────────────────────────────────────────────
  'rarity_common':    { type: 'color', value: '#95a5a6' },
  'rarity_uncommon':  { type: 'color', value: '#27ae60' },
  'rarity_rare':      { type: 'color', value: '#2980b9' },
  'rarity_legendary': { type: 'color', value: '#f39c12' },
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
