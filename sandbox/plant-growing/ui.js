'use strict';
// ui.js — window.PGUI  (panel: 7 tabs + persistence)

window.PGUI = (function () {

  var activeTab = 'stages';
  var TABS = ['stages', 'upgrades', 'items', 'events', 'visitors', 'seasons', 'prestige'];
  var _saveTimer = null;

  // ────────────────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────────────────

  function init() {
    loadFromStorage();
    buildPanelHTML();
    bindTabSwitching();
    bindToolbar();
    renderActiveTab();
    startAutosave();
  }

  function buildPanelHTML() {
    var panel = document.getElementById('editor-panel');
    if (!panel) return;
    panel.innerHTML =
      '<div id="tab-bar">' +
        TABS.map(function (t) {
          return '<button class="tab-btn' + (t === activeTab ? ' active' : '') +
                 '" data-tab="' + t + '">' + tabLabel(t) + '</button>';
        }).join('') +
      '</div>' +
      '<div id="tab-content"></div>';
  }

  function tabLabel(t) {
    var labels = { stages:'Stages', upgrades:'Upgrades', items:'Items',
      events:'Events', visitors:'Visitors', seasons:'Seasons', prestige:'Prestige' };
    return labels[t] || t;
  }

  function bindTabSwitching() {
    var bar = document.getElementById('tab-bar');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      activeTab = btn.dataset.tab;
      bar.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.tab === activeTab);
      });
      renderActiveTab();
    });
  }

  function bindToolbar() {
    var tb = document.getElementById('toolbar');
    if (!tb) return;
    tb.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'export')   exportJSON();
      if (action === 'import')   importJSON();
      if (action === 'snapshot') {
        var name = prompt('Snapshot name:');
        if (name) saveSnapshot(name);
      }
      if (action === 'snapshots') showSnapshotManager();
      if (action === 'reset')    resetToDefault();
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER ACTIVE TAB
  // ────────────────────────────────────────────────────────────────────────

  function renderActiveTab() {
    var el = document.getElementById('tab-content');
    if (!el) return;
    var renderers = {
      stages:   renderStages,
      upgrades: renderUpgrades,
      items:    renderItems,
      events:   renderEvents,
      visitors: renderVisitors,
      seasons:  renderSeasons,
      prestige: renderPrestige
    };
    var fn = renderers[activeTab];
    el.innerHTML = fn ? fn() : '';
    bindTabControls();
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: STAGES
  // ────────────────────────────────────────────────────────────────────────

  function renderStages() {
    var stages = PG_CONFIG.GROWTH_STAGES || [];
    var gameState = PGGame.getState();
    var html = '<div class="tab-section"><h3>Growth Stages</h3>';
    html += '<button class="btn-small stage-add" style="margin-bottom:8px">+ Stage</button>';

    // XP bar chart (draggable concept — editable inputs)
    html += '<div class="field-label">XP to Next Stage</div>';
    var xpCurve = PG_CONFIG.XP_TO_NEXT || [];
    var xpLabels = stages.slice(0, -1).map(function (s) { return s.id; });
    html += svgBarChart(xpLabels, xpCurve, { color: '#27ae60', h: 70 });
    html += '<div class="level-inputs">';
    xpCurve.forEach(function (v, i) {
      html += '<input type="number" class="xp-input level-input" min="1" max="999999" value="' + v +
              '" data-idx="' + i + '" title="' + (stages[i] ? stages[i].name : '') + '">';
    });
    html += '</div>';

    html += '<h3>Stage Details</h3>';
    stages.forEach(function (s, si) {
      var isCurrent = (gameState.stage === si);
      html += '<div class="stage-block' + (isCurrent ? ' current-stage' : '') + '">';
      html += '<div class="stage-header">';
      html += '<span>' + tokenEmoji(s.spriteToken || 'plant_seed') + '</span>';
      html += '<input type="text" class="stage-name-input" data-si="' + si + '" value="' + esc(s.name || ('Stage ' + (si + 1))) + '" style="flex:1;min-width:0;background:#111827;color:#fff;border:1px solid #2a3344;border-radius:5px;padding:3px 6px;">';
      html += '<button class="btn-small stage-duplicate" data-si="' + si + '">Copy</button>';
      if (stages.length > 1) html += '<button class="btn-small stage-delete" data-si="' + si + '">Del</button>';
      html += '<button class="btn-small btn-jump" data-si="' + si + '">Jump</button>';
      html += '</div>';

      html += sliderField('Idle/s', s.idleIncomePerSec, 0.1, 5000, 0.1, 'PG_CONFIG.GROWTH_STAGES[' + si + '].idleIncomePerSec');
      html += sliderField('Offline/s', s.offlineIncomePerSec, 0.05, 2500, 0.05, 'PG_CONFIG.GROWTH_STAGES[' + si + '].offlineIncomePerSec');
      html += sliderField('Offline Cap (h)', s.offlineCapHours, 1, 72, 1, 'PG_CONFIG.GROWTH_STAGES[' + si + '].offlineCapHours');
      html += sliderField('Tap Value', s.tapValue, 1, 10000, 1, 'PG_CONFIG.GROWTH_STAGES[' + si + '].tapValue');

      if (s.unlocks && s.unlocks.length) {
        html += '<div class="field-label">Unlocks: ' + s.unlocks.map(esc).join(', ') + '</div>';
      }
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: UPGRADES
  // ────────────────────────────────────────────────────────────────────────

  function renderUpgrades() {
    var upgrades = PG_CONFIG.UPGRADES || [];
    var gameState = PGGame.getState();
    var html = '<div class="tab-section"><h3>Upgrade Tree</h3>';

    html += buildUpgradeNodeGraph(upgrades, gameState.upgrades);

    html += '<h3>Upgrade List</h3>';
    [1, 2, 3].forEach(function (tier) {
      var group = upgrades.filter(function (u) { return u.tier === tier; });
      if (!group.length) return;
      html += '<div class="tier-' + tier + '" style="margin-bottom:8px">';
      html += '<div class="field-label">TIER ' + tier + '</div>';
      group.forEach(function (u, ui) {
        var idx = upgrades.indexOf(u);
        var purchased = gameState.upgrades[u.id] || 0;
        html += '<div class="upgrade-block rarity-' + (u.rarity || 'common') + '">';
        html += '<div class="upgrade-header">';
        html += '<span>' + tokenEmoji(u.icon || 'icon_leaves') + '</span>';
        html += '<span class="upgrade-name">' + esc(u.name) + '</span>';
        html += '<span class="upgrade-count">' + purchased + '/' + (u.maxPurchases || 1) + '</span>';
        html += '</div>';
        html += '<div style="font-size:0.7rem;color:#7a7a9a;margin:2px 0">' + esc(u.flavour || '') + '</div>';

        // Cost sliders
        html += sliderField('Cost (coins)', u.cost.coins || 0, 0, 100000, 10,
          'PG_CONFIG.UPGRADES[' + idx + '].cost.coins');
        html += sliderField('Max purchases', u.maxPurchases || 1, 1, 10, 1,
          'PG_CONFIG.UPGRADES[' + idx + '].maxPurchases');

        // Effect preview
        var effects = Object.keys(u.effect || {});
        if (effects.length) {
          html += '<div class="effect-preview">';
          effects.forEach(function (k) {
            html += '<span class="effect-tag">' + esc(k) + ': ×' + u.effect[k] + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function buildUpgradeNodeGraph(upgrades, purchased) {
    var w = 260, h = 180;
    var html = '<div class="node-graph-wrap" style="position:relative;width:' + w + 'px;height:' + h + 'px;margin-bottom:8px">';

    // SVG lines
    var lines = '';
    upgrades.forEach(function (u) {
      if (!u.requires || !u._editorX) return;
      u.requires.forEach(function (reqId) {
        var req = upgrades.find(function (r) { return r.id === reqId; });
        if (!req || !req._editorX) return;
        lines += '<line x1="' + req._editorX + '" y1="' + req._editorY + '" x2="' + u._editorX +
                 '" y2="' + u._editorY + '" stroke="#2a4a2a" stroke-width="1.5"/>';
      });
    });
    html += '<svg style="position:absolute;top:0;left:0;pointer-events:none" width="' + w + '" height="' + h + '">' + lines + '</svg>';

    upgrades.forEach(function (u) {
      var x = u._editorX || 20;
      var y = u._editorY || 20;
      var bought = purchased[u.id] || 0;
      var cls = 'graph-node' + (bought > 0 ? ' node-bought' : '');
      html += '<div class="' + cls + '" style="left:' + x + 'px;top:' + y + 'px" title="' + esc(u.name) + '">' +
              tokenEmoji(u.icon || 'icon_leaves') + '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: ITEMS
  // ────────────────────────────────────────────────────────────────────────

  function renderItems() {
    var items = PG_CONFIG.ITEMS || [];
    var gameState = PGGame.getState();
    var html = '<div class="tab-section"><h3>Items</h3>';

    var categories = ['tool', 'fertilizer', 'decoration', 'seed'];
    categories.forEach(function (cat) {
      var group = items.filter(function (i) { return i.category === cat; });
      if (!group.length) return;
      html += '<div class="field-label">' + cat.toUpperCase() + '</div>';
      group.forEach(function (item) {
        var idx = items.indexOf(item);
        var rec = gameState.items[item.id] || { uses: 0, lastUsed: 0 };
        var now = Date.now();
        var cdLeft = Math.max(0, Math.ceil((rec.lastUsed + item.cooldownSec * 1000 - now) / 1000));
        html += '<div class="item-block rarity-' + (item.rarity || 'common') + '">';
        html += '<div class="item-header">';
        html += '<span>' + tokenEmoji(item.icon || 'icon_water') + '</span>';
        html += '<span class="item-name">' + esc(item.name) + '</span>';
        html += '<span style="font-size:0.7rem;color:#7a7a9a">x' + rec.uses + '</span>';
        html += '<button class="btn-small btn-use-item' + (cdLeft > 0 ? ' btn-disabled' : '') +
                '" data-id="' + item.id + '">' + (cdLeft > 0 ? cdLeft + 's' : 'Use') + '</button>';
        html += '</div>';

        html += sliderField('Cooldown (s)', item.cooldownSec, 0, 3600, 5,
          'PG_CONFIG.ITEMS[' + idx + '].cooldownSec');

        // Effect type/value
        var ef = item.effect || {};
        html += '<div class="field-row"><label>Effect type</label>' +
                '<select class="item-effect-type" data-idx="' + idx + '">' +
                ['xp_burst','coinBurst','gemDrop','idleMultiplier','tapMultiplier','sunlightBonus'].map(function (t) {
                  return '<option value="' + t + '"' + (ef.type === t ? ' selected' : '') + '>' + t + '</option>';
                }).join('') + '</select></div>';
        html += sliderField('Value', ef.value || 1, 0.1, 1000, 0.1,
          'PG_CONFIG.ITEMS[' + idx + '].effect.value');
        if (ef.durationSec !== undefined) {
          html += sliderField('Duration (s)', ef.durationSec, 5, 3600, 5,
            'PG_CONFIG.ITEMS[' + idx + '].effect.durationSec');
        }
        html += '</div>';
      });
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: EVENTS
  // ────────────────────────────────────────────────────────────────────────

  function renderEvents() {
    var events = PG_CONFIG.EVENTS || [];
    var html = '<div class="tab-section"><h3>Events</h3>';

    events.forEach(function (ev, ei) {
      html += '<div class="event-block">';
      html += '<div class="event-header">';
      html += '<span>' + tokenEmoji(ev.icon || 'event_rain') + '</span>';
      html += '<span class="event-name">' + esc(ev.name) + '</span>';
      html += '<span class="trigger-badge trigger-' + ev.triggerType + '">' + ev.triggerType + '</span>';
      html += '<button class="btn-small btn-fire-event" data-id="' + ev.id + '">Fire</button>';
      html += '</div>';

      if (ev.triggerType === 'random') {
        var perDay = ((ev.chancePerTenMin || 0) * 144).toFixed(1);
        html += sliderField('Chance/10min', Math.round((ev.chancePerTenMin || 0) * 100), 0, 100, 1,
          'PG_CONFIG.EVENTS[' + ei + '].chancePerTenMin', 0.01);
        html += '<div class="field-label">Expected: ~' + perDay + '/day</div>';
      } else if (ev.triggerType === 'scheduled') {
        html += sliderField('At minute', ev.atMinute || 0, 0, 240, 5,
          'PG_CONFIG.EVENTS[' + ei + '].atMinute');
      }

      html += '<div class="field-label">Message</div>';
      html += '<input type="text" class="event-msg" value="' + esc(ev.message || '') +
              '" data-idx="' + ei + '" style="width:100%">';

      // Effect preview
      var ef = ev.effect || {};
      html += '<div class="effect-preview"><span class="effect-tag">' +
              esc(ef.type || '?') + ': ' + (ef.value || '') +
              (ef.durationSec ? ' for ' + ef.durationSec + 's' : '') +
              '</span></div>';

      html += '</div>';
    });

    // 24h timeline
    html += '<h3>24h Timeline</h3>';
    html += buildEventTimeline(events);

    html += '</div>';
    return html;
  }

  function buildEventTimeline(events) {
    var w = 260, h = 40;
    var svg = '<svg width="' + w + '" height="' + h + '" style="display:block;margin-bottom:6px">';
    svg += '<rect x="0" y="16" width="' + w + '" height="6" fill="#1a1a2a" rx="3"/>';

    events.forEach(function (ev) {
      if (ev.triggerType !== 'scheduled') return;
      var x = ((ev.atMinute || 0) / 240) * w;
      svg += '<line x1="' + x + '" y1="12" x2="' + x + '" y2="28" stroke="#27ae60" stroke-width="2"/>';
      svg += '<text x="' + x + '" y="8" font-size="8" text-anchor="middle" fill="#7a7a9a">' + (ev.atMinute || 0) + 'm</text>';
    });

    // Random events as blur marks
    events.forEach(function (ev) {
      if (ev.triggerType !== 'random') return;
      var prob = ev.chancePerTenMin || 0;
      svg += '<rect x="0" y="17" width="' + w + '" height="4" fill="rgba(243,156,18,' + (prob * 0.5) + ')"/>';
    });

    svg += '</svg>';
    return svg;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: VISITORS
  // ────────────────────────────────────────────────────────────────────────

  function renderVisitors() {
    var visitors = PG_CONFIG.VISITORS || [];
    var html = '<div class="tab-section"><h3>Visitors</h3>';

    visitors.forEach(function (v, vi) {
      html += '<div class="visitor-block">';
      html += '<div class="visitor-header">';
      html += '<span>' + tokenEmoji(v.token || 'visitor_bee') + '</span>';
      html += '<span class="visitor-name">' + esc(v.name) + '</span>';
      html += '</div>';

      html += '<div class="field-label">Required stage: ' + (v.condition && v.condition.minStage !== undefined ? v.condition.minStage : 0) + '</div>';
      html += '<div class="field-row"><label>Min stage</label>' +
              '<input type="number" class="visitor-stage" min="0" max="8" value="' +
              ((v.condition && v.condition.minStage) || 0) + '" data-vi="' + vi + '"></div>';

      html += sliderField('Frequency (min)', v.frequencyMin, 1, 120, 1,
        'PG_CONFIG.VISITORS[' + vi + '].frequencyMin');

      // Reward
      var r = v.reward || {};
      html += '<div class="field-row"><label>Reward type</label>' +
              '<select class="visitor-reward-type" data-vi="' + vi + '">' +
              ['xp','coins','gems','multiplier'].map(function (t) {
                return '<option value="' + t + '"' + (r.type === t ? ' selected' : '') + '>' + t + '</option>';
              }).join('') + '</select></div>';
      html += sliderField('Reward value', r.value || 1, 1, 10000, 1,
        'PG_CONFIG.VISITORS[' + vi + '].reward.value');

      // Token picker
      html += '<div class="field-row"><label>Token</label>' +
              '<select class="visitor-token" data-vi="' + vi + '">' +
              Object.keys(window.TOKEN_MAP).filter(function (k) { return k.startsWith('visitor_'); }).map(function (k) {
                return '<option value="' + k + '"' + (v.token === k ? ' selected' : '') + '>' + tokenEmoji(k) + ' ' + k + '</option>';
              }).join('') + '</select></div>';

      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: SEASONS
  // ────────────────────────────────────────────────────────────────────────

  function renderSeasons() {
    var seasons = PG_CONFIG.SEASONS || [];
    var html = '<div class="tab-section"><h3>Weekly Season Cycle</h3>';

    // Preview bar chart
    var idleVals = seasons.map(function (s) { return (s.idleMultiplier || 1) * 100; });
    var labels   = seasons.map(function (s) { return s.name ? s.name.slice(0, 3) : '?'; });
    html += '<div class="field-label">Idle multiplier preview</div>';
    html += svgBarChart(labels, idleVals, { color: '#27ae60', h: 70 });

    html += '<h3>Day Settings</h3>';
    seasons.forEach(function (s, si) {
      html += '<div class="season-day-block">';
      html += '<div class="season-day-header">';
      html += '<span>' + tokenEmoji(s.weatherToken || 'weather_sunny') + '</span>';
      html += '<span class="season-day-name">' + esc(s.name || 'Day ' + si) + '</span>';
      html += '</div>';

      html += '<div class="field-row"><label>Weather</label>' +
              '<select class="season-weather" data-si="' + si + '">' +
              ['weather_sunny','weather_cloudy','weather_rainy','weather_stormy','weather_snowy','weather_foggy','weather_windy'].map(function (w) {
                return '<option value="' + w + '"' + (s.weatherToken === w ? ' selected' : '') + '>' + tokenEmoji(w) + ' ' + w.replace('weather_','') + '</option>';
              }).join('') + '</select></div>';

      html += sliderField('Idle ×', s.idleMultiplier, 0.1, 5, 0.1,
        'PG_CONFIG.SEASONS[' + si + '].idleMultiplier');
      html += sliderField('Tap ×', s.tapMultiplier, 0.1, 5, 0.1,
        'PG_CONFIG.SEASONS[' + si + '].tapMultiplier');
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: PRESTIGE + MISSIONS
  // ────────────────────────────────────────────────────────────────────────

  function renderPrestige() {
    var prestige = PG_CONFIG.PRESTIGE || {};
    var upgrades = PG_CONFIG.UPGRADES || [];
    var gameState = PGGame.getState();
    var html = '<div class="tab-section">';

    html += '<h3>Prestige</h3>';
    html += '<div class="field-label">Current prestiges: <b>' + gameState.prestigeCount + '</b></div>';
    html += '<div class="field-label">Multiplier: <b>×' + PGGame.getIdleMultiplier().toFixed(2) + '</b></div>';

    html += sliderField('Starting coin bonus', prestige.startingCoinBonus || 1000, 0, 100000, 100,
                        'PG_CONFIG.PRESTIGE.startingCoinBonus');

    html += '<button class="btn-small btn-prestige" style="margin:6px 0;border-color:#8e44ad;color:#8e44ad">⭐ Prestige Now</button>';

    // Multiplier curve
    html += '<h3>Multiplier Curve</h3>';
    var curve = prestige.multiplierCurve || [];
    var curveVals = curve.map(function (p) { return p.multiplier; });
    var curveLabels = curve.map(function (p) { return String(p.prestige); });
    html += svgLineChart(curveVals, { color: '#8e44ad' });
    html += '<div class="field-label">Prestige → Multiplier</div>';
    html += '<div class="curve-inputs">';
    curve.forEach(function (pt, ci) {
      html += '<div class="field-row">';
      html += '<input type="number" class="curve-prestige" min="0" max="100" value="' + pt.prestige + '" data-ci="' + ci + '">';
      html += '<span style="color:#7a7a9a;font-size:0.78rem">→ ×</span>';
      html += '<input type="number" class="curve-mult" min="1" max="1000" step="0.1" value="' + pt.multiplier + '" data-ci="' + ci + '">';
      html += '</div>';
    });
    html += '</div>';

    // Keep/sacrifice lists
    html += '<h3>Keep on Prestige</h3>';
    upgrades.forEach(function (u) {
      var kept = (prestige.keepList || []).includes(u.id);
      html += '<label class="field-row"><input type="checkbox" class="keep-upgrade" data-id="' + u.id + '"' +
              (kept ? ' checked' : '') + '> ' + tokenEmoji(u.icon || 'icon_leaves') + ' ' + esc(u.name) + '</label>';
    });

    // Daily missions
    html += '<h3>Daily Missions</h3>';
    (PG_CONFIG.DAILY_MISSIONS || []).forEach(function (m, mi) {
      var prog = gameState.missionProgress[m.id] || 0;
      var done = gameState.missionProgress[m.id + '_done'];
      var pct = Math.min(1, prog / (m.target || 1));
      html += '<div class="mission-block' + (done ? ' mission-done' : '') + '">';
      html += '<div class="mission-name">' + esc(m.name) + (done ? ' ✓' : '') + '</div>';

      // Progress bar
      html += '<div style="background:#1a1a2a;border-radius:3px;height:4px;margin:3px 0">';
      html += '<div style="background:#27ae60;height:4px;border-radius:3px;width:' + (pct * 100).toFixed(0) + '%"></div></div>';

      html += '<div style="font-size:0.7rem;color:#7a7a9a">' + Math.floor(prog) + ' / ' + m.target + '</div>';
      html += sliderField('Target', m.target, 1, 10000, 1, 'PG_CONFIG.DAILY_MISSIONS[' + mi + '].target');
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // BIND CONTROLS
  // ────────────────────────────────────────────────────────────────────────

  function bindTabControls() {
    var content = document.getElementById('tab-content');
    if (!content) return;

    // Generic config sliders/numbers
    content.querySelectorAll('.config-slider, .config-number').forEach(function (el) {
      el.addEventListener('input', function () {
        var path = el.dataset.path;
        var scale = parseFloat(el.dataset.scale || '1');
        var val = parseFloat(el.value) * scale;
        if (isNaN(val)) return;
        setNestedPath(PG_CONFIG, path, val);
        var twin = content.querySelector('[data-path="' + path + '"]' +
          (el.classList.contains('config-slider') ? '.config-number' : '.config-slider'));
        if (twin) twin.value = el.value;
        scheduleSave();
        if (window.PGGame && PGGame.onConfigChange) PGGame.onConfigChange();
      });
    });

    content.querySelectorAll('.stage-name-input').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.GROWTH_STAGES[parseInt(el.dataset.si)].name = el.value || ('Stage ' + (parseInt(el.dataset.si) + 1));
        scheduleSave();
        renderActiveTab();
      });
    });

    content.querySelectorAll('.stage-add').forEach(function (el) {
      el.addEventListener('click', function () {
        addGrowthStage();
        scheduleSave();
        renderActiveTab();
      });
    });

    content.querySelectorAll('.stage-duplicate').forEach(function (el) {
      el.addEventListener('click', function () {
        duplicateGrowthStage(parseInt(el.dataset.si));
        scheduleSave();
        renderActiveTab();
      });
    });

    content.querySelectorAll('.stage-delete').forEach(function (el) {
      el.addEventListener('click', function () {
        removeGrowthStage(parseInt(el.dataset.si));
        scheduleSave();
        renderActiveTab();
      });
    });

    // XP curve inputs
    content.querySelectorAll('.xp-input').forEach(function (el) {
      el.addEventListener('change', function () {
        var idx = parseInt(el.dataset.idx);
        PG_CONFIG.XP_TO_NEXT[idx] = parseFloat(el.value);
        scheduleSave();
        renderActiveTab();
      });
    });

    // Jump to stage
    content.querySelectorAll('.btn-jump').forEach(function (el) {
      el.addEventListener('click', function () { PGGame.jumpToStage(parseInt(el.dataset.si)); });
    });

    // Use item
    content.querySelectorAll('.btn-use-item').forEach(function (el) {
      el.addEventListener('click', function () {
        if (!el.classList.contains('btn-disabled')) {
          PGGame.useItem(el.dataset.id);
          renderActiveTab();
        }
      });
    });

    // Item effect type
    content.querySelectorAll('.item-effect-type').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.ITEMS[parseInt(el.dataset.idx)].effect.type = el.value;
        scheduleSave();
      });
    });

    // Fire event
    content.querySelectorAll('.btn-fire-event').forEach(function (el) {
      el.addEventListener('click', function () {
        var ev = (PG_CONFIG.EVENTS || []).find(function (e) { return e.id === el.dataset.id; });
        if (ev) {
          var state = PGGame.getState();
          // Direct apply
          applyEventEffect(ev);
        }
      });
    });

    // Event message
    content.querySelectorAll('.event-msg').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.EVENTS[parseInt(el.dataset.idx)].message = el.value;
        scheduleSave();
      });
    });

    // Season weather
    content.querySelectorAll('.season-weather').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.SEASONS[parseInt(el.dataset.si)].weatherToken = el.value;
        scheduleSave();
        renderActiveTab();
      });
    });

    // Visitor stage
    content.querySelectorAll('.visitor-stage').forEach(function (el) {
      el.addEventListener('change', function () {
        if (!PG_CONFIG.VISITORS[el.dataset.vi].condition) PG_CONFIG.VISITORS[el.dataset.vi].condition = {};
        PG_CONFIG.VISITORS[el.dataset.vi].condition.minStage = parseInt(el.value);
        scheduleSave();
      });
    });

    // Visitor reward type
    content.querySelectorAll('.visitor-reward-type').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.VISITORS[el.dataset.vi].reward.type = el.value;
        scheduleSave();
      });
    });

    // Visitor token
    content.querySelectorAll('.visitor-token').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.VISITORS[el.dataset.vi].token = el.value;
        scheduleSave();
      });
    });

    // Prestige button
    var prestigeBtn = content.querySelector('.btn-prestige');
    if (prestigeBtn) {
      prestigeBtn.addEventListener('click', function () {
        if (confirm('Prestige now? Progress resets, multiplier increases!')) {
          PGGame.prestige();
          renderActiveTab();
        }
      });
    }

    // Multiplier curve inputs
    content.querySelectorAll('.curve-prestige').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.PRESTIGE.multiplierCurve[parseInt(el.dataset.ci)].prestige = parseInt(el.value);
        scheduleSave();
      });
    });
    content.querySelectorAll('.curve-mult').forEach(function (el) {
      el.addEventListener('change', function () {
        PG_CONFIG.PRESTIGE.multiplierCurve[parseInt(el.dataset.ci)].multiplier = parseFloat(el.value);
        scheduleSave();
        renderActiveTab();
      });
    });

    // Keep upgrade checkboxes
    content.querySelectorAll('.keep-upgrade').forEach(function (el) {
      el.addEventListener('change', function () {
        var keepList = PG_CONFIG.PRESTIGE.keepList || [];
        if (el.checked) {
          if (!keepList.includes(el.dataset.id)) keepList.push(el.dataset.id);
        } else {
          PG_CONFIG.PRESTIGE.keepList = keepList.filter(function (id) { return id !== el.dataset.id; });
        }
        scheduleSave();
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // GAME CALLBACKS
  // ────────────────────────────────────────────────────────────────────────

  function onStageChange(newStage) {
    if (activeTab === 'stages') renderActiveTab();
    // Update timeline scrubber
    var scrubber = document.getElementById('stage-scrubber');
    if (scrubber) scrubber.value = newStage;
    var stageLabel = document.getElementById('stage-label');
    if (stageLabel) {
      var s = PG_CONFIG.GROWTH_STAGES[newStage];
      stageLabel.textContent = s ? s.name : '';
    }
  }

  function onEvent(ev) {
    // Could highlight the event row in Events tab, but simple approach: just leave the message on canvas
  }

  function applyEventEffect(ev) {
    // Minimal bridge — replicate applyItemEffect via the game's useItem mechanism
    // by calling the game's internal; since it's private, we fire via config
    // Simplest: trigger via a dummy item path
    var st = PGGame.getState();
    var ef = ev.effect || {};
    if (ef.type === 'xp_burst') PGGame.getState; // no direct API; announce on canvas via message
    // Instead use the scheduled fire in tick by faking the condition:
    // (This approach is intentionally simple — in production would expose a fireEvent API)
    alert('Event "' + ev.name + '" would fire: ' + (ev.message || ''));
  }

  // ────────────────────────────────────────────────────────────────────────
  // SVG CHARTS
  // ────────────────────────────────────────────────────────────────────────

  function svgLineChart(values, opts) {
    opts = opts || {};
    var w = opts.w || 260, h = opts.h || 70, color = opts.color || '#27ae60';
    if (!values || !values.length) return '';
    var max = Math.max.apply(null, values.concat([1]));
    var n = values.length;
    var pts = values.map(function (v, i) {
      return ((i / Math.max(n - 1, 1)) * w).toFixed(1) + ',' + (h - (v / max) * (h - 4)).toFixed(1);
    }).join(' ');
    var dots = values.map(function (v, i) {
      var cx2 = ((i / Math.max(n - 1, 1)) * w).toFixed(1);
      var cy2 = (h - (v / max) * (h - 4)).toFixed(1);
      return '<circle cx="' + cx2 + '" cy="' + cy2 + '" r="3" fill="' + color + '"/>';
    }).join('');
    return '<svg width="' + w + '" height="' + h + '" style="display:block;margin-bottom:4px">' +
           '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2"/>' +
           dots + '</svg>';
  }

  function svgBarChart(labels, values, opts) {
    opts = opts || {};
    var w = opts.w || 260, h = opts.h || 80, color = opts.color || '#27ae60';
    if (!values || !values.length) return '';
    var max = Math.max.apply(null, values.concat([1]));
    var bw = Math.floor(w / values.length) - 2;
    var bars = values.map(function (v, i) {
      var bh = Math.floor((v / max) * (h - 16));
      var x = i * (bw + 2);
      var y = h - 16 - bh;
      return '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" fill="' + color + '" rx="1"/>' +
             '<text x="' + (x + bw / 2).toFixed(0) + '" y="' + (h - 2) + '" font-size="9" text-anchor="middle" fill="#888">' +
             esc(String(labels[i] || '')) + '</text>';
    }).join('');
    return '<svg width="' + w + '" height="' + h + '" style="display:block;margin-bottom:4px">' + bars + '</svg>';
  }

  // ────────────────────────────────────────────────────────────────────────
  // SLIDER FIELD HELPER
  // ────────────────────────────────────────────────────────────────────────

  function sliderField(label, value, min, max, step, path, scale) {
    scale = scale || 1;
    var displayVal = value;
    var id = 'pg_' + Math.random().toString(36).slice(2, 7);
    return '<div class="field-row">' +
           '<label for="' + id + '_r" title="' + esc(label) + '">' + esc(label) + '</label>' +
           '<input type="range" id="' + id + '_r" class="config-slider"' +
           ' min="' + min + '" max="' + max + '" step="' + step + '" value="' + displayVal + '"' +
           ' data-path="' + path + '" data-scale="' + scale + '">' +
           '<input type="number" id="' + id + '_n" class="config-number"' +
           ' min="' + min + '" max="' + max + '" step="' + step + '" value="' + displayVal + '"' +
           ' data-path="' + path + '" data-scale="' + scale + '">' +
           '</div>';
  }

  // ────────────────────────────────────────────────────────────────────────
  // DEEP PATH SETTER
  // ────────────────────────────────────────────────────────────────────────

  function setNestedPath(obj, path, val) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      var arrMatch = p.match(/^(\w+)\[(\d+)\]$/);
      if (arrMatch) { cur = cur[arrMatch[1]][parseInt(arrMatch[2])]; }
      else { cur = cur[p]; }
      if (!cur) return;
    }
    var last = parts[parts.length - 1];
    var lastMatch = last.match(/^(\w+)\[(\d+)\]$/);
    if (lastMatch) { cur[lastMatch[1]][parseInt(lastMatch[2])] = val; }
    else { cur[last] = val; }
  }

  // ────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ────────────────────────────────────────────────────────────────────────

  var KEY_CONFIG    = 'sandbox_pg_config';
  var KEY_SNAPSHOTS = 'sandbox_pg_snapshots';

  function scheduleSave() {
    clearTimeout(_saveTimer);
    var dot = document.getElementById('unsaved-dot');
    if (dot) dot.style.display = 'inline';
    _saveTimer = setTimeout(save, 2000);
  }

  function save() {
    try {
      localStorage.setItem(KEY_CONFIG, JSON.stringify(PG_CONFIG));
      var dot = document.getElementById('unsaved-dot');
      if (dot) dot.style.display = 'none';
    } catch (e) { /* storage full */ }
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function addGrowthStage() {
    PG_CONFIG.GROWTH_STAGES = PG_CONFIG.GROWTH_STAGES || [];
    var stages = PG_CONFIG.GROWTH_STAGES;
    var prev = stages[stages.length - 1] || {};
    var nextXp = lastXpStep();
    var stage = clone(prev);
    stage.id = 'custom_' + Date.now();
    stage.name = 'Custom Stage ' + (stages.length + 1);
    stage.xpRequired = (Number(prev.xpRequired) || 0) + nextXp;
    stage.idleIncomePerSec = Math.max(1, Number(prev.idleIncomePerSec) || 1);
    stage.offlineIncomePerSec = Math.max(0.5, Number(prev.offlineIncomePerSec) || 0.5);
    stage.tapValue = Math.max(1, Number(prev.tapValue) || 1);
    stage.unlocks = [];
    stages.push(stage);
    PG_CONFIG.XP_TO_NEXT = PG_CONFIG.XP_TO_NEXT || [];
    PG_CONFIG.XP_TO_NEXT.push(nextXp);
    normalizeGrowthCurve();
  }

  function duplicateGrowthStage(idx) {
    var stages = PG_CONFIG.GROWTH_STAGES || [];
    var src = stages[idx];
    if (!src) return;
    var copy = clone(src);
    copy.id = 'custom_' + Date.now();
    copy.name = (src.name || 'Stage') + ' Copy';
    stages.splice(idx + 1, 0, copy);
    PG_CONFIG.XP_TO_NEXT = PG_CONFIG.XP_TO_NEXT || [];
    PG_CONFIG.XP_TO_NEXT.splice(idx + 1, 0, lastXpStep());
    normalizeGrowthCurve();
  }

  function removeGrowthStage(idx) {
    var stages = PG_CONFIG.GROWTH_STAGES || [];
    if (stages.length <= 1) return;
    stages.splice(idx, 1);
    if (PG_CONFIG.XP_TO_NEXT && PG_CONFIG.XP_TO_NEXT.length) {
      PG_CONFIG.XP_TO_NEXT.splice(Math.min(idx, PG_CONFIG.XP_TO_NEXT.length - 1), 1);
    }
    normalizeGrowthCurve();
    if (window.PGGame) PGGame.jumpToStage(Math.min(idx, stages.length - 1));
  }

  function lastXpStep() {
    var curve = PG_CONFIG.XP_TO_NEXT || [];
    return Math.max(1, Number(curve[curve.length - 1]) || 100);
  }

  function normalizeGrowthCurve() {
    var stages = PG_CONFIG.GROWTH_STAGES || [];
    PG_CONFIG.XP_TO_NEXT = PG_CONFIG.XP_TO_NEXT || [];
    while (PG_CONFIG.XP_TO_NEXT.length < Math.max(0, stages.length - 1)) PG_CONFIG.XP_TO_NEXT.push(lastXpStep());
    if (PG_CONFIG.XP_TO_NEXT.length > Math.max(0, stages.length - 1)) {
      PG_CONFIG.XP_TO_NEXT.length = Math.max(0, stages.length - 1);
    }
  }

  function startAutosave() {
    setInterval(save, 10000);
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(KEY_CONFIG);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      deepMerge(PG_CONFIG, parsed);
    } catch (e) { /* bad JSON */ }
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(PG_CONFIG, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pg-config.json';
    a.click();
  }

  function importJSON() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var parsed = JSON.parse(ev.target.result);
          deepMerge(PG_CONFIG, parsed);
          renderActiveTab();
          if (window.PGGame && PGGame.onConfigChange) PGGame.onConfigChange();
          scheduleSave();
        } catch (err) { alert('Invalid JSON: ' + err.message); }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  function saveSnapshot(name) {
    try {
      var snaps = JSON.parse(localStorage.getItem(KEY_SNAPSHOTS) || '{}');
      if (Object.keys(snaps).length >= 10 && !snaps[name]) { alert('Max 10 snapshots.'); return; }
      snaps[name] = JSON.parse(JSON.stringify(PG_CONFIG));
      localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(snaps));
      alert('Snapshot "' + name + '" saved.');
    } catch (e) { alert('Could not save.'); }
  }

  function showSnapshotManager() {
    try {
      var snaps = JSON.parse(localStorage.getItem(KEY_SNAPSHOTS) || '{}');
      var names = Object.keys(snaps);
      if (!names.length) { alert('No snapshots.'); return; }
      var choice = prompt('Snapshots:\n' + names.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n') +
                          '\n\nLoad name (or "del:<name>"):');
      if (!choice) return;
      if (choice.startsWith('del:')) {
        delete snaps[choice.slice(4).trim()];
        localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(snaps));
      } else if (snaps[choice]) {
        deepMerge(PG_CONFIG, snaps[choice]);
        renderActiveTab();
        if (window.PGGame && PGGame.onConfigChange) PGGame.onConfigChange();
        scheduleSave();
      }
    } catch (e) { alert('Error: ' + e.message); }
  }

  function resetToDefault() {
    if (!confirm('Reset config to defaults?')) return;
    deepMerge(PG_CONFIG, PG_DEFAULTS);
    renderActiveTab();
    if (window.PGGame && PGGame.onConfigChange) PGGame.onConfigChange();
    scheduleSave();
  }

  // ────────────────────────────────────────────────────────────────────────
  // UTIL
  // ────────────────────────────────────────────────────────────────────────

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return;
    Object.keys(source).forEach(function (k) {
      if (source[k] !== null && typeof source[k] === 'object' && !Array.isArray(source[k])) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        deepMerge(target[k], source[k]);
      } else { target[k] = source[k]; }
    });
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ────────────────────────────────────────────────────────────────────────
  return {
    init: init,
    onStageChange: onStageChange,
    onEvent: onEvent,
    exportJSON: exportJSON,
    importJSON: importJSON,
    saveSnapshot: saveSnapshot,
    resetToDefault: resetToDefault
  };
})();
