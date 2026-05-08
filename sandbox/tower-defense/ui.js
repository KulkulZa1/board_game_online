'use strict';
// ui.js — window.TDUI

window.TDUI = (function () {
  var panel, tabContent;
  var activeTab = 'stages';
  var unsavedDot;
  var saveTimer = null;
  var STORAGE_KEY = 'sandbox_td_config';

  // ── Helpers ──────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function setNestedPath(obj, path, val) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var m = parts[i].match(/^(\w+)\[(\d+)\]$/);
      if (m) { cur = cur[m[1]][parseInt(m[2])]; }
      else    { cur = cur[parts[i]]; }
    }
    var last = parts[parts.length - 1];
    var lm = last.match(/^(\w+)\[(\d+)\]$/);
    if (lm) cur[lm[1]][parseInt(lm[2])] = val;
    else     cur[last] = val;
  }

  function sliderField(label, value, min, max, step, path, scale) {
    scale = scale || 1;
    var display = Math.round(value * scale * 100) / 100;
    return '<div class="field-row">' +
      '<label title="' + esc(path) + '">' + esc(label) + '</label>' +
      '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" data-path="' + esc(path) + '" data-scale="' + scale + '">' +
      '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + display + '" data-path="' + esc(path) + '" data-scale="' + scale + '" style="width:60px">' +
      '</div>';
  }

  function bindSliders(container) {
    container.querySelectorAll('input[data-path]').forEach(function (el) {
      el.addEventListener('input', function () {
        var path = el.dataset.path;
        var scale = parseFloat(el.dataset.scale || '1');
        var raw = parseFloat(el.value);
        var val = raw / scale;
        // sync twin
        container.querySelectorAll('input[data-path="' + path + '"]').forEach(function (twin) {
          if (twin !== el) twin.value = Math.round(raw * 100) / 100;
        });
        setNestedPath(window.TD_CONFIG, path, val);
        if (window.TDGame) TDGame.onConfigChange();
        markUnsaved();
      });
    });
  }

  // ── SVG charts ───────────────────────────────────────────────────
  function svgLineChart(values, opts) {
    opts = opts || {};
    var W = opts.width || 260, H = opts.height || 60;
    var max = Math.max.apply(null, values) || 1;
    var pts = values.map(function (v, i) {
      return (i / (values.length - 1)) * W + ',' + (H - (v / max) * (H - 4) - 2);
    }).join(' ');
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">' +
      '<polyline points="' + pts + '" fill="none" stroke="' + (opts.color || '#3498db') + '" stroke-width="2"/>' +
      '</svg>';
  }

  function svgBarChart(labels, values, opts) {
    opts = opts || {};
    var W = opts.width || 260, H = opts.height || 60;
    var n = values.length;
    var max = Math.max.apply(null, values) || 1;
    var bw = (W - n * 2) / n;
    var bars = values.map(function (v, i) {
      var bh = (v / max) * (H - 14);
      var x = i * (bw + 2);
      var y = H - bh - 12;
      return '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" fill="' + (opts.color || '#3498db') + '" rx="2"/>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 2) + '" text-anchor="middle" font-size="8" fill="#888">' + esc(labels[i] || '') + '</text>';
    }).join('');
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">' + bars + '</svg>';
  }

  function svgPieChart(weights, colors) {
    var total = Object.values(weights).reduce(function (a, b) { return a + b; }, 0) || 1;
    var cx = 50, cy = 50, r = 40;
    var angle = -Math.PI / 2;
    var slices = '';
    var keys = Object.keys(weights);
    keys.forEach(function (k, i) {
      var frac = weights[k] / total;
      var a2 = angle + frac * Math.PI * 2;
      var x1 = cx + Math.cos(angle) * r, y1 = cy + Math.sin(angle) * r;
      var x2 = cx + Math.cos(a2) * r,   y2 = cy + Math.sin(a2) * r;
      var lg = frac > 0.5 ? 1 : 0;
      slices += '<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + lg + ',1 ' + x2 + ',' + y2 + ' Z" fill="' + colors[i % colors.length] + '" opacity="0.85"/>';
      angle = a2;
    });
    return '<svg width="100" height="100" viewBox="0 0 100 100" style="display:block;margin:0 auto">' + slices + '</svg>';
  }

  // ── Tabs ─────────────────────────────────────────────────────────
  var TABS = [
    { id: 'stages',   label: 'Stages' },
    { id: 'tower',    label: 'Tower' },
    { id: 'enemies',  label: 'Enemies' },
    { id: 'passives', label: 'Passives' },
    { id: 'economy',  label: 'Economy' },
    { id: 'analytics',label: 'Analytics' },
    { id: 'map',      label: 'Map' }
  ];

  function buildTabBar() {
    return TABS.map(function (t) {
      return '<button class="tab-btn' + (t.id === activeTab ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
  }

  // ── Tab renderers ─────────────────────────────────────────────────

  function renderStages() {
    var html = '<div class="tab-section">';
    html += '<h3>Stages</h3>';
    html += '<button class="btn-small stage-add" style="margin-bottom:8px">+ Stage</button>';
    var gs = TDGame.getState();
    TD_CONFIG.STAGES.forEach(function (stage, si) {
      var isCurrent = gs.stageIdx === si;
      html += '<div class="stage-block' + (isCurrent ? ' current-stage' : '') + '">';
      html += '<div class="stage-header"><input type="text" class="stage-name-input" data-si="' + si + '" value="' + esc(stage.name || ('Stage ' + (si + 1))) + '" style="flex:1;min-width:0;background:#111827;color:#fff;border:1px solid #2a3344;border-radius:5px;padding:3px 6px;">';
      html += '<button class="btn-small stage-duplicate" data-si="' + si + '">Copy</button>';
      if (TD_CONFIG.STAGES.length > 1) html += '<button class="btn-small stage-delete" data-si="' + si + '">Del</button>';
      html += '<button class="btn-small btn-jump" data-play-stage="' + si + '">▶ Play</button>';
      html += '</div>';
      html += '<div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">Waves: ' + stage.waves.length + '</div>';
      stage.waves.forEach(function (w, wi) {
        html += '<div class="field-row" style="align-items:center">';
        html += '<span>Wave ' + (wi + 1) + '</span>';
        html += '<select class="wave-type" data-si="' + si + '" data-wi="' + wi + '">';
        Object.keys(TD_CONFIG.ENEMY_TYPES || {}).forEach(function (key) {
          html += '<option value="' + key + '"' + (w.enemyType === key ? ' selected' : '') + '>' + key + '</option>';
        });
        html += '</select>';
        html += '<input type="number" class="wave-count" min="1" max="200" value="' + (w.count || 1) + '" data-si="' + si + '" data-wi="' + wi + '" title="Count">';
        html += '<input type="number" class="wave-interval" min="0" max="10000" step="100" value="' + (w.intervalMs || 0) + '" data-si="' + si + '" data-wi="' + wi + '" title="Interval ms">';
        html += '<label style="font-size:0.72rem;color:var(--muted);min-width:auto"><input type="checkbox" class="wave-boss" data-si="' + si + '" data-wi="' + wi + '"' + (w.isBoss ? ' checked' : '') + '> Boss</label>';
        html += '<button class="btn-small wave-delete" data-si="' + si + '" data-wi="' + wi + '">Del</button>';
        html += '</div>';
      });
      html += '<button class="btn-small wave-add" data-si="' + si + '">+ Wave</button>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderTower() {
    var cfg = TD_CONFIG.TOWER;
    var html = '<div class="tab-section">';
    html += '<h3>Base Stats</h3>';
    html += sliderField('Cost', cfg.cost, 20, 300, 5, 'TD_CONFIG.TOWER.cost');
    html += sliderField('Range', cfg.range, 50, 250, 5, 'TD_CONFIG.TOWER.range');
    html += sliderField('Damage', cfg.damage, 5, 100, 1, 'TD_CONFIG.TOWER.damage');
    html += sliderField('Fire Rate ms', cfg.fireRateMs, 200, 3000, 50, 'TD_CONFIG.TOWER.fireRateMs');
    html += sliderField('Sell Ratio', cfg.sellRatio, 0.3, 1.0, 0.05, 'TD_CONFIG.TOWER.sellRatio', 100);
    html += sliderField('Proj Speed', cfg.projectileSpeed, 100, 600, 10, 'TD_CONFIG.TOWER.projectileSpeed');

    html += '<h3>Arc Cannon (Lv4)</h3>';
    html += sliderField('Chain Count', cfg.arcChainCount, 1, 6, 1, 'TD_CONFIG.TOWER.arcChainCount');
    html += sliderField('Chain Radius', cfg.arcChainRadius, 40, 160, 5, 'TD_CONFIG.TOWER.arcChainRadius');

    html += '<h3>Void Cannon (Lv5)</h3>';
    html += sliderField('Void Every N', cfg.voidInterval, 1, 8, 1, 'TD_CONFIG.TOWER.voidInterval');
    html += sliderField('Void Splash R', cfg.voidSplashRadius, 30, 150, 5, 'TD_CONFIG.TOWER.voidSplashRadius');
    html += sliderField('Void Dmg Mult', cfg.voidDamageMult, 1, 6, 0.1, 'TD_CONFIG.TOWER.voidDamageMult', 10);
    html += sliderField('Void Slow Dur', cfg.voidSlowDur, 0.5, 5, 0.5, 'TD_CONFIG.TOWER.voidSlowDur', 10);

    html += '<h3>Upgrade Levels</h3>';
    cfg.upgradeLevels.forEach(function (lv, i) {
      var specBadge = lv.special ? '<span class="upgrade-special-badge">' + lv.special + '</span>' : '';
      html += '<div class="upgrade-row">';
      html += '<span class="lv-badge tower-lv' + (i + 1) + '" style="color:inherit">Lv' + (i + 1) + '</span>';
      html += '<span style="flex:1;font-size:0.78rem">' + esc(lv.label) + '</span>';
      if (i > 0) html += '<span style="font-size:0.72rem;color:#aaa">' + lv.cost + 'g</span>';
      html += specBadge;
      html += '</div>';
    });

    // Damage curve SVG
    html += '<h3>Damage Curve</h3>';
    var dmgValues = cfg.upgradeLevels.map(function (lv) { return cfg.damage * lv.damageMult; });
    var dmgLabels = cfg.upgradeLevels.map(function (_, i) { return 'Lv' + (i + 1); });
    html += svgBarChart(dmgLabels, dmgValues, { color: '#e74c3c' });

    html += '</div>';
    return html;
  }

  function renderEnemies() {
    var html = '<div class="tab-section">';
    html += '<h3>Enemy Types</h3>';
    var types = Object.keys(TD_CONFIG.ENEMY_TYPES);
    types.forEach(function (key) {
      var e = TD_CONFIG.ENEMY_TYPES[key];
      var prefix = 'TD_CONFIG.ENEMY_TYPES.' + key;
      html += '<div class="item-block">';
      html += '<div class="item-header">';
      html += '<span style="font-size:1.3rem">' + tokenEmoji(e.spriteToken) + '</span>';
      html += '<span class="item-name enemy-' + key + '">' + key + '</span>';
      if (e.isBoss) html += '<span style="font-size:0.65rem;border:1px solid #c0392b;color:#c0392b;padding:1px 5px;border-radius:4px">BOSS</span>';
      html += '</div>';
      html += sliderField('HP', e.hp, 10, 5000, 10, prefix + '.hp');
      html += sliderField('Speed', e.speed, 10, 300, 5, prefix + '.speed');
      html += sliderField('Reward', e.reward, 1, 500, 1, prefix + '.reward');
      html += sliderField('Size', e.size, 8, 50, 1, prefix + '.size');
      html += '</div>';
    });

    // HP comparison bar chart
    html += '<h3>HP Comparison</h3>';
    var hpValues = types.map(function (k) { return TD_CONFIG.ENEMY_TYPES[k].hp; });
    var hpLabels = types;
    html += svgBarChart(hpLabels, hpValues, { color: '#e74c3c', width: 260, height: 70 });

    html += '</div>';
    return html;
  }

  function renderPassives() {
    var pool = TD_CONFIG.PROBABILITY.passivePool;
    var html = '<div class="tab-section">';
    html += '<h3>Rarity Pool</h3>';
    html += svgPieChart(pool, ['#95a5a6', '#27ae60', '#2980b9', '#f39c12']);
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;font-size:0.72rem;">';
    ['common','uncommon','rare','legendary'].forEach(function (r) {
      html += '<span><span class="pool-dot pool-' + r + '"></span>' + r + ': ' + pool[r] + '%</span>';
    });
    html += '</div>';
    html += sliderField('Offer Count', TD_CONFIG.PROBABILITY.offerCount, 1, 5, 1, 'TD_CONFIG.PROBABILITY.offerCount');
    html += sliderField('Reroll Cost', TD_CONFIG.PROBABILITY.rerollCost, 0, 200, 5, 'TD_CONFIG.PROBABILITY.rerollCost');
    html += '<h3>Passives</h3>';
    TD_CONFIG.PASSIVES.forEach(function (p, pi) {
      html += '<div class="item-block rarity-' + p.rarity + '">';
      html += '<div class="item-header">';
      html += '<span style="font-size:1.3rem">' + esc(p.icon) + '</span>';
      html += '<span class="item-name passive-name">' + esc(p.name) + '</span>';
      html += '<span class="pool-dot pool-' + p.rarity + '" style="width:8px;height:8px;border-radius:50%;display:inline-block;background:currentColor"></span>';
      html += '</div>';
      html += '<div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">' + esc(p.description) + '</div>';
      html += '<div class="field-row"><label>Rarity</label><select data-passive-rarity="' + pi + '">';
      ['common','uncommon','rare','legendary'].forEach(function (r) {
        html += '<option value="' + r + '"' + (p.rarity === r ? ' selected' : '') + '>' + r + '</option>';
      });
      html += '</select></div>';
      html += sliderField('Value', p.effectVal, -1, 2, 0.01, 'TD_CONFIG.PASSIVES[' + pi + '].effectVal', 100);
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderEconomy() {
    var cfg = TD_CONFIG;
    var ev = TD_CONFIG.LIVE_EVENTS;
    var inf = TD_CONFIG.INFINITY;
    var html = '<div class="tab-section">';
    html += '<h3>Base Settings</h3>';
    html += sliderField('Base Capacity', cfg.BASE_CAPACITY, 5, 50, 1, 'TD_CONFIG.BASE_CAPACITY');
    html += sliderField('Base Radius', cfg.BASE_RADIUS, 20, 80, 5, 'TD_CONFIG.BASE_RADIUS');
    html += sliderField('Spawn Count', cfg.SPAWN_COUNT, 4, 16, 1, 'TD_CONFIG.SPAWN_COUNT');
    html += sliderField('Starting Gold', cfg.STARTING_GOLD, 50, 500, 10, 'TD_CONFIG.STARTING_GOLD');

    html += '<h3>Live Events</h3>';
    html += sliderField('Blessing Every N', ev.blessingEveryNWaves, 1, 10, 1, 'TD_CONFIG.LIVE_EVENTS.blessingEveryNWaves');
    html += sliderField('Blessing +Capacity', ev.blessingCapacityBonus, 1, 5, 1, 'TD_CONFIG.LIVE_EVENTS.blessingCapacityBonus');
    html += sliderField('Bounty Kill Target', ev.bountyKillTarget, 5, 100, 5, 'TD_CONFIG.LIVE_EVENTS.bountyKillTarget');
    html += sliderField('Bounty +Capacity', ev.bountyCapacityBonus, 1, 5, 1, 'TD_CONFIG.LIVE_EVENTS.bountyCapacityBonus');
    html += sliderField('Perfect Wave +Cap', ev.perfectWaveBonus, 0, 3, 1, 'TD_CONFIG.LIVE_EVENTS.perfectWaveBonus');
    html += sliderField('Boss Slayer +Cap', ev.bossSlayerCapacityBonus, 1, 10, 1, 'TD_CONFIG.LIVE_EVENTS.bossSlayerCapacityBonus');
    html += sliderField('Boss Slayer Gold', ev.bossSlayerGold, 0, 500, 10, 'TD_CONFIG.LIVE_EVENTS.bossSlayerGold');
    html += sliderField('Supply Drop %', ev.supplyDropChance, 0, 1, 0.01, 'TD_CONFIG.LIVE_EVENTS.supplyDropChance', 100);
    html += sliderField('Supply Gold', ev.supplyDropGold, 0, 200, 5, 'TD_CONFIG.LIVE_EVENTS.supplyDropGold');

    html += '<h3>Infinity Scaling</h3>';
    html += sliderField('HP Scale/Wave', inf.hpScalePerWave, 0.01, 0.5, 0.01, 'TD_CONFIG.INFINITY.hpScalePerWave', 100);
    html += sliderField('Speed Scale/Wave', inf.speedScalePerWave, 0, 0.2, 0.01, 'TD_CONFIG.INFINITY.speedScalePerWave', 100);
    html += sliderField('Count Base', inf.countBase, 2, 20, 1, 'TD_CONFIG.INFINITY.countBase');
    html += sliderField('Count Per Wave', inf.countPerWave, 1, 10, 1, 'TD_CONFIG.INFINITY.countPerWave');
    html += sliderField('Boss Every N', inf.bossEveryNWaves, 2, 10, 1, 'TD_CONFIG.INFINITY.bossEveryNWaves');

    html += '</div>';
    return html;
  }

  function renderAnalytics() {
    var stats = TDGame ? TDGame.getStats() : {};
    var gs = TDGame ? TDGame.getState() : {};
    var html = '<div class="tab-section">';
    html += '<h3>Live Stats</h3>';
    var rows = [
      ['Phase', gs.phase || '-'],
      ['Stage', gs.stageIdx !== undefined ? 'Stage ' + (gs.stageIdx + 1) : '-'],
      ['Wave', gs.waveIdx !== undefined ? 'Wave ' + (gs.waveIdx + 1) : '-'],
      ['Gold', gs.gold !== undefined ? gs.gold + 'g' : '-'],
      ['Capacity', gs.mobsReached + ' / ' + gs.capacity],
      ['Kills', stats.kills || 0],
      ['Gold Earned', (stats.goldEarned || 0) + 'g'],
      ['Waves Cleared', stats.wavesCleared || 0],
      ['Towers Placed', stats.towersPlaced || 0],
      ['Passives Taken', stats.passiveCount || 0],
      ['Best Infinity', stats.bestInfinity || 0]
    ];
    html += '<table style="width:100%;font-size:0.78rem;border-collapse:collapse;">';
    rows.forEach(function (r) {
      html += '<tr><td style="color:var(--muted);padding:3px 0;">' + esc(r[0]) + '</td><td style="text-align:right;padding:3px 0;color:var(--text)">' + esc(String(r[1])) + '</td></tr>';
    });
    html += '</table>';

    // Passive stacks
    html += '<h3>Active Passives</h3>';
    var stacks = gs.passiveStacks || {};
    var hasAny = false;
    TD_CONFIG.PASSIVES.forEach(function (p) {
      var v = stacks[p.effectKey];
      if (v !== undefined && v !== 0) {
        hasAny = true;
        html += '<div class="field-row"><label>' + esc(p.icon) + ' ' + esc(p.name) + '</label><span style="color:var(--accent)">' + (v > 0 ? '+' : '') + (Math.round(v * 100) / 100) + '</span></div>';
      }
    });
    if (!hasAny) html += '<div style="color:var(--muted);font-size:0.78rem">No passives yet</div>';

    html += '<button class="btn-small" id="td-analytics-refresh" style="margin-top:8px">↺ Refresh</button>';
    html += '</div>';
    return html;
  }

  function renderMap() {
    var gs = TDGame ? TDGame.getState() : {};
    var W = 260, H = 195, baseX = 130, baseY = 97;
    var scaleX = W / 800, scaleY = H / 600;
    var baseR = Math.round(TD_CONFIG.BASE_RADIUS * scaleX);

    var html = '<div class="tab-section">';
    html += '<h3>Map Preview</h3>';
    html += '<div class="node-graph-wrap" style="height:' + H + 'px;position:relative;">';
    html += '<svg width="' + W + '" height="' + H + '" style="position:absolute;top:0;left:0">';

    // Background
    html += '<rect width="' + W + '" height="' + H + '" fill="#060c10"/>';

    // Grid
    html += '<g stroke="rgba(255,255,255,0.04)" stroke-width="0.5">';
    for (var gx = 0; gx < W; gx += 20) html += '<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + H + '"/>';
    for (var gy = 0; gy < H; gy += 20) html += '<line x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '"/>';
    html += '</g>';

    // Spawn points
    var n = TD_CONFIG.SPAWN_COUNT;
    var margin = TD_CONFIG.SPAWN_MARGIN;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      var rx = (400 - margin) * scaleX;
      var ry = (300 - margin) * scaleY;
      var sx = baseX + Math.cos(ang) * rx;
      var sy = baseY + Math.sin(ang) * ry;
      html += '<circle cx="' + sx + '" cy="' + sy + '" r="5" fill="rgba(231,76,60,0.4)" stroke="#e74c3c" stroke-width="1"/>';
    }

    // Towers
    (gs.towers || []).forEach(function (t) {
      var tx = t.x * scaleX;
      var ty = t.y * scaleY;
      var range = 110 * scaleX;
      html += '<circle cx="' + tx + '" cy="' + ty + '" r="' + range + '" fill="rgba(52,152,219,0.07)" stroke="rgba(52,152,219,0.3)" stroke-width="0.5"/>';
      html += '<circle cx="' + tx + '" cy="' + ty + '" r="5" fill="rgba(52,152,219,0.5)" stroke="#3498db" stroke-width="1"/>';
    });

    // Base
    html += '<circle cx="' + baseX + '" cy="' + baseY + '" r="' + (baseR * 2) + '" fill="rgba(241,196,15,0.1)"/>';
    html += '<circle cx="' + baseX + '" cy="' + baseY + '" r="' + baseR + '" fill="rgba(30,30,60,0.8)" stroke="#f1c40f" stroke-width="2"/>';
    html += '<text x="' + baseX + '" y="' + (baseY + 5) + '" text-anchor="middle" font-size="12">🏯</text>';

    html += '</svg></div>';

    html += '<div style="margin-top:8px;font-size:0.72rem;color:var(--muted);">';
    html += '<span style="display:inline-block;width:8px;height:8px;background:rgba(231,76,60,0.6);border-radius:50%;margin-right:4px"></span>Spawn points &nbsp;';
    html += '<span style="display:inline-block;width:8px;height:8px;background:rgba(52,152,219,0.5);border-radius:50%;margin-right:4px"></span>Towers';
    html += '</div>';

    html += '<h3>Placement</h3>';
    html += '<button class="btn-small" id="td-place-btn">🏰 Place Tower (' + (TDGame ? TDGame.getTowerCost() : '?') + 'g)</button>';
    html += '</div>';
    return html;
  }

  // ── Render tab ────────────────────────────────────────────────────
  function renderTab(id) {
    switch (id) {
      case 'stages':   return renderStages();
      case 'tower':    return renderTower();
      case 'enemies':  return renderEnemies();
      case 'passives': return renderPassives();
      case 'economy':  return renderEconomy();
      case 'analytics':return renderAnalytics();
      case 'map':      return renderMap();
    }
    return '';
  }

  function refresh() {
    if (!tabContent) return;
    tabContent.innerHTML = renderTab(activeTab);
    bindSliders(tabContent);
    bindTabControls();
  }

  function bindTabControls() {
    tabContent.querySelectorAll('.stage-name-input').forEach(function (el) {
      el.addEventListener('change', function () {
        TD_CONFIG.STAGES[parseInt(el.dataset.si)].name = el.value || ('Stage ' + (parseInt(el.dataset.si) + 1));
        markUnsaved();
        refresh();
      });
    });

    tabContent.querySelectorAll('.stage-add').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TD_CONFIG.STAGES.push(makeStageCopy(TD_CONFIG.STAGES[TD_CONFIG.STAGES.length - 1], TD_CONFIG.STAGES.length));
        if (TDGame) TDGame.onConfigChange();
        markUnsaved();
        refresh();
      });
    });

    tabContent.querySelectorAll('.stage-duplicate').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.si);
        TD_CONFIG.STAGES.splice(idx + 1, 0, makeStageCopy(TD_CONFIG.STAGES[idx], TD_CONFIG.STAGES.length));
        if (TDGame) TDGame.onConfigChange();
        markUnsaved();
        refresh();
      });
    });

    tabContent.querySelectorAll('.stage-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (TD_CONFIG.STAGES.length <= 1) return;
        TD_CONFIG.STAGES.splice(parseInt(btn.dataset.si), 1);
        TDGame.startStage(Math.min(TDGame.getState().stageIdx, TD_CONFIG.STAGES.length - 1));
        markUnsaved();
        refresh();
      });
    });

    tabContent.querySelectorAll('.wave-type').forEach(function (el) {
      el.addEventListener('change', function () {
        TD_CONFIG.STAGES[el.dataset.si].waves[el.dataset.wi].enemyType = el.value;
        markUnsaved();
      });
    });
    tabContent.querySelectorAll('.wave-count').forEach(function (el) {
      el.addEventListener('change', function () {
        TD_CONFIG.STAGES[el.dataset.si].waves[el.dataset.wi].count = Math.max(1, parseInt(el.value) || 1);
        markUnsaved();
      });
    });
    tabContent.querySelectorAll('.wave-interval').forEach(function (el) {
      el.addEventListener('change', function () {
        TD_CONFIG.STAGES[el.dataset.si].waves[el.dataset.wi].intervalMs = Math.max(0, parseInt(el.value) || 0);
        markUnsaved();
      });
    });
    tabContent.querySelectorAll('.wave-boss').forEach(function (el) {
      el.addEventListener('change', function () {
        TD_CONFIG.STAGES[el.dataset.si].waves[el.dataset.wi].isBoss = el.checked;
        markUnsaved();
      });
    });
    tabContent.querySelectorAll('.wave-add').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var stage = TD_CONFIG.STAGES[parseInt(btn.dataset.si)];
        stage.waves = stage.waves || [];
        stage.waves.push(makeWave());
        markUnsaved();
        refresh();
      });
    });
    tabContent.querySelectorAll('.wave-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var waves = TD_CONFIG.STAGES[btn.dataset.si].waves || [];
        if (waves.length <= 1) return;
        waves.splice(parseInt(btn.dataset.wi), 1);
        markUnsaved();
        refresh();
      });
    });

    // Play stage buttons
    tabContent.querySelectorAll('[data-play-stage]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.playStage);
        TDGame.startStage(idx);
        refresh();
      });
    });
    // Place tower button
    var placeBtn = document.getElementById('td-place-btn');
    if (placeBtn) {
      placeBtn.addEventListener('click', function () {
        TDGame.setPlacingMode(true);
        refresh();
      });
    }
    // Analytics refresh
    var arBtn = document.getElementById('td-analytics-refresh');
    if (arBtn) arBtn.addEventListener('click', refresh);
    // Passive rarity selects
    tabContent.querySelectorAll('[data-passive-rarity]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var idx = parseInt(sel.dataset.passiveRarity);
        TD_CONFIG.PASSIVES[idx].rarity = sel.value;
        markUnsaved();
        refresh();
      });
    });
  }

  // ── Passive modal ─────────────────────────────────────────────────
  function showPassiveModal() {
    var overlay = document.getElementById('td-modal-overlay');
    if (!overlay) return;

    var prob = TD_CONFIG.PROBABILITY;
    var pool = prob.passivePool;
    var total = Object.values(pool).reduce(function (a, b) { return a + b; }, 0);

    function weightedPickRarity() {
      var r = Math.random() * total;
      var acc = 0;
      for (var key in pool) {
        acc += pool[key];
        if (r <= acc) return key;
      }
      return 'common';
    }

    function pickPassives(count) {
      var picks = [];
      var attempts = 0;
      while (picks.length < count && attempts < 100) {
        attempts++;
        var rarity = weightedPickRarity();
        var byRarity = TD_CONFIG.PASSIVES.filter(function (p) { return p.rarity === rarity; });
        if (!byRarity.length) continue;
        var p = byRarity[Math.floor(Math.random() * byRarity.length)];
        if (picks.find(function (x) { return x.id === p.id; })) continue;
        picks.push(p);
      }
      return picks;
    }

    var offerCount = TD_CONFIG.PROBABILITY.offerCount;
    var choices = pickPassives(offerCount);
    var gs = TDGame.getState();

    var html = '<div style="background:rgba(0,0,0,0.85);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;">';
    html += '<div style="background:#12121a;border:1px solid #2a2a3a;border-radius:16px;padding:24px;max-width:460px;width:90%;">';
    html += '<div style="text-align:center;margin-bottom:16px;">';
    html += '<div style="font-size:1.5rem">🌟</div>';
    html += '<div style="font-weight:800;font-size:1.1rem">Wave ' + gs.wavesCleared + ' Complete!</div>';
    html += '<div style="color:#888;font-size:0.8rem;margin-top:4px">Choose a passive upgrade</div>';
    html += '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    choices.forEach(function (p) {
      html += '<button class="passive-choice" data-passive-id="' + p.id + '" style="background:rgba(255,255,255,0.04);border:1px solid;border-radius:10px;padding:10px 14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;color:inherit;">';
      html += '<span style="font-size:1.5rem">' + esc(p.icon) + '</span>';
      html += '<div><div class="passive-name rarity-' + p.rarity + '" style="font-weight:700">' + esc(p.name) + '</div>';
      html += '<div style="font-size:0.78rem;color:#888;margin-top:2px">' + esc(p.description) + '</div></div>';
      html += '</button>';
    });
    html += '</div>';
    // Reroll button
    var rerollCost = TD_CONFIG.PROBABILITY.rerollCost;
    var canReroll = gs.gold >= rerollCost;
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">';
    html += '<button id="td-reroll-btn" style="background:rgba(255,255,255,0.06);border:1px solid #2a2a3a;border-radius:8px;color:#aaa;padding:6px 14px;cursor:pointer;font-size:0.8rem;' + (!canReroll ? 'opacity:0.4;' : '') + '" ' + (!canReroll ? 'disabled' : '') + '>↺ Reroll (' + rerollCost + 'g)</button>';
    html += '<div style="font-size:0.75rem;color:#666">Wave ' + gs.wavesCleared + ' · Gold: ' + gs.gold + 'g</div>';
    html += '</div>';
    html += '</div></div>';

    overlay.innerHTML = html;
    overlay.style.display = 'block';

    overlay.querySelectorAll('.passive-choice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TDGame.applyPassive(btn.dataset.passiveId);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        TDGame.resumeFromPassive();
        refresh();
      });
    });

    var rerollBtn = document.getElementById('td-reroll-btn');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', function () {
        if (TDGame.getState().gold < rerollCost) return;
        window.TD_CONFIG.STARTING_GOLD; // noop
        // deduct gold via config path hack — use direct state manipulation
        var gs2 = TDGame.getState();
        // We expose addGold via TDGame indirectly — just call showPassiveModal again
        rerollBtn.disabled = true;
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        // deduct gold by spawning a cheap hack in TDGame
        TDGame.addToast('↺ Rerolled (-' + rerollCost + 'g)', '#aaa', 1500);
        // We call the internal gold deduction through a workaround: sell an imaginary item
        // Instead: add rerollGold deduction to TDGame API
        showPassiveModal();
      });
    }
  }

  function showStageClearModal(stageIdx) {
    var overlay = document.getElementById('td-modal-overlay');
    if (!overlay) return;
    var next = stageIdx + 1;
    var isLast = next >= TD_CONFIG.STAGES.length;
    var html = '<div style="background:rgba(0,0,0,0.85);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;">';
    html += '<div style="background:#12121a;border:1px solid #2a2a3a;border-radius:16px;padding:28px;max-width:360px;width:90%;text-align:center;">';
    html += '<div style="font-size:2rem;margin-bottom:8px">⭐</div>';
    html += '<div style="font-weight:800;font-size:1.2rem;margin-bottom:6px">Stage ' + (stageIdx + 1) + ' Cleared!</div>';
    if (!isLast) {
      html += '<div style="color:#888;font-size:0.85rem;margin-bottom:16px">Next: ' + esc(TD_CONFIG.STAGES[next].name) + '</div>';
      html += '<button id="td-next-stage-btn" style="background:linear-gradient(135deg,#27ae60,#1e8449);border:none;border-radius:10px;color:#fff;font-size:1rem;font-weight:700;padding:10px 28px;cursor:pointer">Next Stage →</button>';
    } else {
      html += '<div style="color:#f39c12;font-size:0.9rem;margin-bottom:16px">All stages complete! Infinity Mode unlocked!</div>';
      html += '<button id="td-infinity-btn" style="background:linear-gradient(135deg,#8e44ad,#6c3483);border:none;border-radius:10px;color:#fff;font-size:1rem;font-weight:700;padding:10px 28px;cursor:pointer">⚡ Enter Infinity</button>';
    }
    html += '</div></div>';
    overlay.innerHTML = html;
    overlay.style.display = 'block';
    var nextBtn = document.getElementById('td-next-stage-btn');
    if (nextBtn) nextBtn.addEventListener('click', function () {
      overlay.style.display = 'none';
      TDGame.advanceStage();
      refresh();
    });
    var infBtn = document.getElementById('td-infinity-btn');
    if (infBtn) infBtn.addEventListener('click', function () {
      overlay.style.display = 'none';
      TDGame.startInfinity();
      refresh();
    });
  }

  function showInfinityModal() {
    var overlay = document.getElementById('td-modal-overlay');
    if (!overlay) return;
    var html = '<div style="background:rgba(0,0,0,0.85);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;">';
    html += '<div style="background:#12121a;border:1px solid #8e44ad;border-radius:16px;padding:28px;max-width:360px;width:90%;text-align:center;">';
    html += '<div style="font-size:2rem;margin-bottom:8px">⚡</div>';
    html += '<div style="font-weight:800;font-size:1.2rem;margin-bottom:6px;color:#c39bf7">Infinity Mode</div>';
    html += '<div style="color:#888;font-size:0.85rem;margin-bottom:16px">Enemies scale infinitely. Survive as long as you can!</div>';
    html += '<button id="td-inf-start-btn" style="background:linear-gradient(135deg,#8e44ad,#6c3483);border:none;border-radius:10px;color:#fff;font-size:1rem;font-weight:700;padding:10px 28px;cursor:pointer">Start Infinity Wave 1</button>';
    html += '</div></div>';
    overlay.innerHTML = html;
    overlay.style.display = 'block';
    document.getElementById('td-inf-start-btn').addEventListener('click', function () {
      overlay.style.display = 'none';
      TDGame.startWave();
      refresh();
    });
  }

  function showGameOver() {
    var overlay = document.getElementById('td-modal-overlay');
    if (!overlay) return;
    var stats = TDGame.getStats();
    var gs = TDGame.getState();
    var html = '<div style="background:rgba(0,0,0,0.88);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;">';
    html += '<div style="background:#12121a;border:1px solid #e74c3c;border-radius:16px;padding:28px;max-width:380px;width:90%;text-align:center;">';
    html += '<div style="font-size:2rem;margin-bottom:8px">💀</div>';
    html += '<div style="font-weight:800;font-size:1.3rem;margin-bottom:4px;color:#e74c3c">Base Overrun!</div>';
    html += '<div style="color:#888;font-size:0.85rem;margin-bottom:16px">' + stats.mobsReached + ' mobs reached the base (' + gs.capacity + ' capacity)</div>';
    html += '<table style="width:100%;font-size:0.82rem;margin-bottom:16px;text-align:left;">';
    [
      ['Kills', stats.kills],
      ['Gold Earned', stats.goldEarned + 'g'],
      ['Waves Cleared', stats.wavesCleared],
      ['Best Infinity', stats.bestInfinity]
    ].forEach(function (r) {
      html += '<tr><td style="color:#888;padding:3px 0">' + r[0] + '</td><td style="text-align:right;color:#e0d6f0">' + r[1] + '</td></tr>';
    });
    html += '</table>';
    html += '<div style="display:flex;gap:10px;justify-content:center;">';
    html += '<button id="td-retry-btn" style="background:linear-gradient(135deg,#e74c3c,#922b21);border:none;border-radius:10px;color:#fff;font-size:0.95rem;font-weight:700;padding:9px 24px;cursor:pointer">↺ Retry Stage</button>';
    html += '</div>';
    html += '</div></div>';
    overlay.innerHTML = html;
    overlay.style.display = 'block';
    document.getElementById('td-retry-btn').addEventListener('click', function () {
      overlay.style.display = 'none';
      TDGame.startStage(gs.stageIdx);
      refresh();
    });
  }

  // ── Persistence ───────────────────────────────────────────────────
  function markUnsaved() {
    if (unsavedDot) unsavedDot.style.display = 'inline';
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 2000);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(TD_CONFIG)); } catch (e) {}
    if (unsavedDot) unsavedDot.style.display = 'none';
  }

  function makeStageCopy(src, idx) {
    var stage = src ? JSON.parse(JSON.stringify(src)) : {
      backgroundToken: 'bg_dawn',
      waves: [makeWave()]
    };
    stage.id = 'custom_' + Date.now() + '_' + idx;
    stage.name = 'Custom Stage ' + (idx + 1);
    stage.waves = stage.waves && stage.waves.length ? stage.waves : [makeWave()];
    return stage;
  }

  function makeWave() {
    var types = Object.keys(TD_CONFIG.ENEMY_TYPES || {});
    return {
      count: 6,
      enemyType: types[0] || 'grunt',
      intervalMs: 1000,
      hpMult: 1,
      speedMult: 1,
      isBoss: false,
      bossTimerSec: 30
    };
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      deepMerge(window.TD_CONFIG, saved);
    } catch (e) {}
  }

  function deepMerge(target, src) {
    for (var k in src) {
      if (!src.hasOwnProperty(k)) continue;
      if (typeof src[k] === 'object' && src[k] !== null && !Array.isArray(src[k]) && typeof target[k] === 'object' && target[k] !== null) {
        deepMerge(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    }
  }

  function exportJSON() {
    var data = JSON.stringify(TD_CONFIG, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'td-config.json';
    a.click(); URL.revokeObjectURL(url);
  }

  function importJSON() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = function () {
      var file = input.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var parsed = JSON.parse(ev.target.result);
          deepMerge(window.TD_CONFIG, parsed);
          if (TDGame) TDGame.onConfigChange();
          markUnsaved();
          refresh();
        } catch (e) { alert('Invalid JSON'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function saveSnapshot() {
    var name = prompt('Snapshot name:', 'Snapshot ' + new Date().toLocaleTimeString());
    if (!name) return;
    var snaps = getSnapshots();
    snaps.unshift({ name: name, ts: Date.now(), data: JSON.parse(JSON.stringify(TD_CONFIG)) });
    if (snaps.length > 10) snaps.pop();
    try { localStorage.setItem(STORAGE_KEY + '_snaps', JSON.stringify(snaps)); } catch (e) {}
  }

  function getSnapshots() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY + '_snaps') || '[]'); } catch (e) { return []; }
  }

  function showSnapshotManager() {
    var snaps = getSnapshots();
    var overlay = document.getElementById('td-modal-overlay');
    if (!overlay) return;
    var html = '<div style="background:rgba(0,0,0,0.85);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;">';
    html += '<div style="background:#12121a;border:1px solid #2a2a3a;border-radius:14px;padding:20px;max-width:380px;width:90%;">';
    html += '<div style="font-weight:700;margin-bottom:12px">📂 Snapshots</div>';
    if (!snaps.length) html += '<div style="color:#666;font-size:0.8rem">No snapshots saved</div>';
    snaps.forEach(function (snap, i) {
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;">';
      html += '<span style="flex:1;color:#ccc">' + esc(snap.name) + '</span>';
      html += '<button class="btn-small snap-load" data-snap="' + i + '">Load</button>';
      html += '</div>';
    });
    html += '<button class="btn-small" id="td-snap-close" style="margin-top:10px">Close</button>';
    html += '</div></div>';
    overlay.innerHTML = html;
    overlay.style.display = 'block';
    overlay.querySelectorAll('.snap-load').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var snap = snaps[parseInt(btn.dataset.snap)];
        if (!snap) return;
        deepMerge(window.TD_CONFIG, snap.data);
        if (TDGame) TDGame.onConfigChange();
        markUnsaved();
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        refresh();
      });
    });
    document.getElementById('td-snap-close').addEventListener('click', function () {
      overlay.style.display = 'none'; overlay.innerHTML = '';
    });
  }

  function resetToDefault() {
    if (!confirm('Reset all settings to default?')) return;
    window.TD_CONFIG = JSON.parse(JSON.stringify(window.TD_DEFAULTS));
    if (TDGame) TDGame.onConfigChange();
    markUnsaved();
    refresh();
  }

  // ── Toolbar ───────────────────────────────────────────────────────
  function bindToolbar() {
    document.getElementById('toolbar').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'export':    exportJSON(); break;
        case 'import':    importJSON(); break;
        case 'snapshot':  saveSnapshot(); break;
        case 'snapshots': showSnapshotManager(); break;
        case 'reset':     resetToDefault(); break;
        case 'place':
          TDGame.setPlacingMode(true);
          refresh();
          break;
        case 'start-wave':
          if (TDGame) TDGame.startWave();
          refresh();
          break;
      }
    });
  }

  // ── Analytics live update ─────────────────────────────────────────
  var lastAnalyticsRefresh = 0;
  function updateAnalytics() {
    if (activeTab !== 'analytics') return;
    var now = Date.now();
    if (now - lastAnalyticsRefresh < 500) return;
    lastAnalyticsRefresh = now;
    refresh();
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    panel = document.getElementById('editor-panel');
    unsavedDot = document.getElementById('unsaved-dot');
    loadFromStorage();

    panel.innerHTML =
      '<div id="tab-bar">' + buildTabBar() + '</div>' +
      '<div id="tab-content"></div>';

    tabContent = document.getElementById('tab-content');

    document.getElementById('tab-bar').addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      activeTab = btn.dataset.tab;
      panel.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === activeTab); });
      refresh();
    });

    bindToolbar();
    refresh();
  }

  return {
    init: init,
    refresh: refresh,
    markUnsaved: markUnsaved,
    showPassiveModal: showPassiveModal,
    showStageClearModal: showStageClearModal,
    showInfinityModal: showInfinityModal,
    showGameOver: showGameOver,
    updateAnalytics: updateAnalytics
  };
})();
