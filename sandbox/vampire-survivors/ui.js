'use strict';
// ui.js — window.VSUI  (panel: 7 tabs + persistence)

window.VSUI = (function () {

  var activeTab = 'stages';
  var TABS = ['stages', 'skills', 'items', 'probability', 'characters', 'enemies', 'analytics'];
  var _saveTimer = null;
  var _levelUpCallback = null;

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
    var labels = { stages:'Stages', skills:'Skills', items:'Items',
      probability:'Prob', characters:'Chars', enemies:'Enemies', analytics:'Analytics' };
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
      if (action === 'pause')    togglePause(btn);
    });
  }

  function togglePause(btn) {
    var st = VSGame.getState();
    if (st === 'playing') { VSGame.pause(); btn.textContent = '▶'; }
    else if (st === 'paused') { VSGame.resume(); btn.textContent = '⏸'; }
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER ACTIVE TAB
  // ────────────────────────────────────────────────────────────────────────

  function renderActiveTab() {
    var el = document.getElementById('tab-content');
    if (!el) return;
    var renderers = {
      stages:      renderStages,
      skills:      renderSkills,
      items:       renderItems,
      probability: renderProbability,
      characters:  renderCharacters,
      enemies:     renderEnemies,
      analytics:   renderAnalytics
    };
    var fn = renderers[activeTab];
    el.innerHTML = fn ? fn() : '';
    bindTabControls();
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: STAGES
  // ────────────────────────────────────────────────────────────────────────

  function renderStages() {
    var stages = VS_CONFIG.STAGES || [];
    var html = '<div class="tab-section">';
    html += '<h3>Stages</h3>';

    stages.forEach(function (s, si) {
      html += '<div class="stage-block" data-si="' + si + '">';
      html += '<div class="stage-header">' +
              '<span class="stage-name">' + esc(s.name) + '</span>' +
              '<button class="btn-small btn-play" data-si="' + si + '">▶ Play</button></div>';

      html += sliderField('Duration (s)', s.durationSeconds, 30, 600, 10,
        'VS_CONFIG.STAGES[' + si + '].durationSeconds');

      // Boss pins
      html += '<div class="field-label">Boss pins (seconds)</div>';
      html += '<div class="boss-pins" data-si="' + si + '">';
      (s.bossAt || []).forEach(function (sec, bi) {
        html += '<span class="pin-tag">' + sec + 's' +
                '<button class="pin-del" data-si="' + si + '" data-bi="' + bi + '">×</button></span>';
      });
      html += '<button class="btn-small pin-add" data-si="' + si + '">+ Pin</button>';
      html += '</div>';

      // Wave timeline SVG
      html += '<div class="field-label">Wave Timeline</div>';
      html += buildWaveTimeline(s, si);

      // Wave schedule list
      html += '<div class="field-label">Waves</div>';
      (s.waveSchedule || []).forEach(function (w, wi) {
        html += '<div class="wave-row">';
        html += '<span class="wave-at">@' + w.atSecond + 's</span>';
        html += '<select class="wave-type" data-si="' + si + '" data-wi="' + wi + '">' +
                Object.keys(VS_CONFIG.ENEMY_TYPES || {}).map(function (k) {
                  return '<option value="' + k + '"' + (w.enemyType === k ? ' selected' : '') + '>' + k + '</option>';
                }).join('') + '</select>';
        html += '<input type="number" class="wave-count" min="1" max="30" value="' + w.count + '"' +
                ' data-si="' + si + '" data-wi="' + wi + '">';
        html += '</div>';
      });
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function buildWaveTimeline(stage, si) {
    var dur = stage.durationSeconds || 300;
    var w = 260, h = 48;
    var svg = '<svg class="wave-timeline" width="' + w + '" height="' + h +
              '" data-si="' + si + '" data-dur="' + dur + '">';
    svg += '<rect x="0" y="20" width="' + w + '" height="8" fill="#1a1a2a" rx="4"/>';

    var colors = { zombie:'#7dcea0', skeleton:'#d5d8dc', bat:'#8e44ad',
                   ghost:'#abebc6', demon:'#e74c3c', elite:'#e67e22', boss:'#c0392b' };

    (stage.waveSchedule || []).forEach(function (wave) {
      var x = (wave.atSecond / dur) * w;
      var col = colors[wave.enemyType] || '#888';
      svg += '<rect x="' + (x - 2) + '" y="18" width="4" height="12" fill="' + col + '" rx="1"/>';
    });

    (stage.bossAt || []).forEach(function (sec) {
      var x = (sec / dur) * w;
      svg += '<circle cx="' + x + '" cy="24" r="6" fill="#c0392b" stroke="#fff" stroke-width="1.5"/>';
      svg += '<text x="' + x + '" y="12" text-anchor="middle" font-size="9" fill="#e77">boss</text>';
    });

    svg += '</svg>';
    return svg;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: SKILLS
  // ────────────────────────────────────────────────────────────────────────

  function renderSkills() {
    var skills = VS_CONFIG.SKILLS || [];
    var rarityOrder = ['legendary', 'rare', 'uncommon', 'common'];
    var html = '<div class="tab-section">';
    html += '<h3>Skills</h3>';

    rarityOrder.forEach(function (rarity) {
      var group = skills.filter(function (s) { return s.rarity === rarity; });
      if (!group.length) return;
      html += '<div class="rarity-group rarity-' + rarity + '">';
      html += '<div class="rarity-label">' + rarity.toUpperCase() + '</div>';

      group.forEach(function (skill, si) {
        var idx = skills.indexOf(skill);
        html += '<div class="skill-block">';
        html += '<div class="skill-header">';
        html += '<span class="skill-icon">' + tokenEmoji(skill.icon || 'icon_orb') + '</span>';
        html += '<span class="skill-name">' + esc(skill.name) + '</span>';
        html += '<select class="skill-rarity" data-idx="' + idx + '">' +
                ['common','uncommon','rare','legendary'].map(function (r) {
                  return '<option value="' + r + '"' + (skill.rarity === r ? ' selected' : '') + '>' + r + '</option>';
                }).join('') + '</select>';
        html += '</div>';

        // Damage per level
        html += '<div class="field-label">Damage per level</div>';
        html += '<div class="level-inputs">';
        (skill.perLevel.damage || []).forEach(function (v, lv) {
          html += '<input type="number" class="level-input" min="1" max="9999" value="' + v + '"' +
                  ' data-idx="' + idx + '" data-stat="damage" data-lv="' + lv + '">';
        });
        html += '</div>';
        html += '<div class="chart-wrap">' + svgLineChart(skill.perLevel.damage, { color: '#4af' }) + '</div>';

        // Cooldown per level
        html += '<div class="field-label">Cooldown (ms) per level</div>';
        html += '<div class="level-inputs">';
        (skill.perLevel.cooldownMs || []).forEach(function (v, lv) {
          html += '<input type="number" class="level-input" min="100" max="10000" value="' + v + '"' +
                  ' data-idx="' + idx + '" data-stat="cooldownMs" data-lv="' + lv + '">';
        });
        html += '</div>';

        // Projectiles per level
        html += '<div class="field-label">Projectiles per level</div>';
        html += '<div class="level-inputs">';
        (skill.perLevel.projectiles || []).forEach(function (v, lv) {
          html += '<input type="number" class="level-input" min="1" max="20" value="' + v + '"' +
                  ' data-idx="' + idx + '" data-stat="projectiles" data-lv="' + lv + '">';
        });
        html += '</div>';

        // Evolution
        if (skill.evolvesInto) {
          html += '<div class="evolve-tag">Evolves → ' + esc(skill.evolvesInto) + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    });

    // Skill node graph (evolution chains)
    html += '<h3 style="margin-top:12px">Evolution Graph</h3>';
    html += buildSkillNodeGraph(skills);

    html += '</div>';
    return html;
  }

  function buildSkillNodeGraph(skills) {
    var w = 260, h = 160;
    var html = '<div class="node-graph-wrap" style="position:relative;width:' + w + 'px;height:' + h + 'px">';

    // SVG lines
    var lines = '';
    skills.forEach(function (s) {
      if (!s.evolvesInto || !s._editorX) return;
      var target = skills.find(function (t) { return t.id === s.evolvesInto; });
      if (!target || !target._editorX) return;
      lines += '<line x1="' + s._editorX + '" y1="' + s._editorY + '" x2="' + target._editorX +
               '" y2="' + target._editorY + '" stroke="#f39c12" stroke-width="1.5" stroke-dasharray="4"/>';
    });
    html += '<svg style="position:absolute;top:0;left:0;pointer-events:none" width="' + w + '" height="' + h + '">' + lines + '</svg>';

    skills.forEach(function (s, idx) {
      var x = s._editorX || (idx % 5) * 50 + 20;
      var y = s._editorY || Math.floor(idx / 5) * 40 + 20;
      html += '<div class="graph-node" style="left:' + x + 'px;top:' + y + 'px" title="' + esc(s.name) + '">' +
              tokenEmoji(s.icon || 'icon_orb') + '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: ITEMS
  // ────────────────────────────────────────────────────────────────────────

  function renderItems() {
    var html = '<div class="tab-section">';
    html += '<h3>Passives</h3>';

    (VS_CONFIG.PASSIVES || []).forEach(function (p, pi) {
      html += '<div class="item-block rarity-' + (p.rarity || 'common') + '">';
      html += '<span class="item-icon">' + tokenEmoji(p.icon || 'icon_spinach') + '</span>';
      html += '<span class="item-name">' + esc(p.name) + '</span>';
      html += sliderField('Value', p.value || 1, 0.1, 10, 0.1, 'VS_CONFIG.PASSIVES[' + pi + '].value');
      html += '</div>';
    });

    html += '<h3>Consumables</h3>';
    (VS_CONFIG.CONSUMABLES || []).forEach(function (c, ci) {
      html += '<div class="item-block rarity-' + (c.rarity || 'common') + '">';
      html += '<span class="item-icon">' + tokenEmoji(c.icon || 'icon_heart') + '</span>';
      html += '<span class="item-name">' + esc(c.name) + '</span>';
      html += sliderField('Value', c.value || 1, 1, 500, 1, 'VS_CONFIG.CONSUMABLES[' + ci + '].value');
      html += sliderField('Cooldown (s)', c.cooldownSec || 30, 5, 300, 5,
                          'VS_CONFIG.CONSUMABLES[' + ci + '].cooldownSec');
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: PROBABILITY
  // ────────────────────────────────────────────────────────────────────────

  function renderProbability() {
    var prob = VS_CONFIG.PROBABILITY || {};
    var pool = prob.levelUpPool || { common: 60, uncommon: 28, rare: 10, legendary: 2 };
    var pity = prob.pitySystem || {};
    var html = '<div class="tab-section">';
    html += '<h3>Level-up Pool</h3>';

    var pieColors = { common:'#95a5a6', uncommon:'#27ae60', rare:'#2980b9', legendary:'#f39c12' };
    html += '<div style="display:flex;gap:12px;align-items:flex-start">';
    html += '<div>' + svgPieChart(pool, pieColors) + '</div>';
    html += '<div style="flex:1">';
    Object.keys(pool).forEach(function (rarity) {
      html += sliderField(rarity, pool[rarity], 0, 100, 1, 'VS_CONFIG.PROBABILITY.levelUpPool.' + rarity);
    });
    html += '</div></div>';

    html += '<h3>Pity System</h3>';
    html += '<label class="field-row"><span>Enabled</span>' +
            '<input type="checkbox" class="pity-enabled"' + (pity.enabled ? ' checked' : '') + '></label>';
    html += sliderField('Guaranteed Rare after', pity.guaranteedRareAfter || 7, 1, 30, 1,
                        'VS_CONFIG.PROBABILITY.pitySystem.guaranteedRareAfter');
    html += sliderField('Guaranteed Legendary after', pity.guaranteedLegendaryAfter || 4, 1, 20, 1,
                        'VS_CONFIG.PROBABILITY.pitySystem.guaranteedLegendaryAfter');

    html += '<h3>Drop Rates</h3>';
    ['normal', 'elite', 'boss'].forEach(function (tier) {
      var drops = (prob.enemyDrops || {})[tier] || {};
      html += '<div class="field-label">' + tier + '</div>';
      ['gold', 'xp', 'heart'].forEach(function (drop) {
        var val = drops[drop] !== undefined ? drops[drop] : 0.3;
        html += sliderField(drop + ' drop%', Math.round(val * 100), 0, 100, 1,
          'VS_CONFIG.PROBABILITY.enemyDrops.' + tier + '.' + drop, 0.01);
      });
    });

    html += '<h3>Crit</h3>';
    html += sliderField('Crit chance %', Math.round((prob.critChanceBase || 0.05) * 100), 0, 100, 1,
                        'VS_CONFIG.PROBABILITY.critChanceBase', 0.01);
    html += sliderField('Crit multiplier', prob.critMultiplierBase || 1.5, 1, 5, 0.1,
                        'VS_CONFIG.PROBABILITY.critMultiplierBase');
    html += sliderField('Choices per level-up', prob.offerCount || 3, 1, 6, 1,
                        'VS_CONFIG.PROBABILITY.offerCount');

    // Pity simulation
    html += '<h3>Pity Simulation</h3>';
    html += buildPitySim(pool, pity);

    html += '</div>';
    return html;
  }

  function buildPitySim(pool, pity) {
    var RUNS = 1000;
    var raresAt = [];
    for (var i = 0; i < RUNS; i++) {
      var run = 0; var got = false;
      while (!got) {
        run++;
        var r = Math.random() * 100;
        if (pity.enabled && run >= (pity.guaranteedRareAfter || 7)) got = true;
        else if (r < (pool.rare || 10) + (pool.legendary || 2)) got = true;
      }
      raresAt.push(run);
    }
    var avg = raresAt.reduce(function (a, b) { return a + b; }, 0) / RUNS;
    var hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    raresAt.forEach(function (v) { if (v <= 10) hist[v - 1]++; });
    var labels = ['1','2','3','4','5','6','7','8','9','10+'];
    return '<div class="field-label">Avg rolls to rare/legendary: <b>' + avg.toFixed(1) + '</b></div>' +
           svgBarChart(labels, hist, { color: '#2980b9', h: 80 });
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: CHARACTERS
  // ────────────────────────────────────────────────────────────────────────

  function renderCharacters() {
    var chars = VS_CONFIG.CHARACTER_DEFS || [];
    var html = '<div class="tab-section"><h3>Characters</h3>';

    chars.forEach(function (c, ci) {
      html += '<div class="char-block">';
      html += '<div class="char-header"><span>' + tokenEmoji('char_' + c.id) + '</span>' +
              '<span class="char-name">' + esc(c.name) + '</span></div>';
      var stats = c.baseStats || {};
      ['hp','speed','might','magnet','revivals'].forEach(function (stat) {
        var min = stat === 'hp' ? 50 : stat === 'speed' ? 60 : 0;
        var max = stat === 'hp' ? 500 : stat === 'speed' ? 300 : stat === 'revivals' ? 5 : 10;
        var step = stat === 'hp' ? 10 : stat === 'speed' ? 10 : 0.1;
        html += sliderField(stat, stats[stat] || 0, min, max, step,
          'VS_CONFIG.CHARACTER_DEFS[' + ci + '].baseStats.' + stat);
      });
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: ENEMIES
  // ────────────────────────────────────────────────────────────────────────

  function renderEnemies() {
    var types = VS_CONFIG.ENEMY_TYPES || {};
    var html = '<div class="tab-section"><h3>Enemy Types</h3>';

    Object.keys(types).forEach(function (key) {
      var e = types[key];
      html += '<div class="enemy-block">';
      html += '<div class="enemy-header">';
      html += '<span>' + tokenEmoji(e.spriteToken || 'enemy_zombie') + '</span>';
      html += '<span class="enemy-name">' + key + '</span>';
      html += '<button class="btn-small btn-spawn" data-enemy="' + key + '">Spawn</button>';
      html += '</div>';

      html += sliderField('HP', e.hp, 1, 5000, 1, 'VS_CONFIG.ENEMY_TYPES.' + key + '.hp');
      html += sliderField('Speed', e.speed, 10, 400, 5, 'VS_CONFIG.ENEMY_TYPES.' + key + '.speed');
      html += sliderField('Damage', e.damage, 1, 200, 1, 'VS_CONFIG.ENEMY_TYPES.' + key + '.damage');
      html += sliderField('XP value', e.xpValue, 1, 100, 1, 'VS_CONFIG.ENEMY_TYPES.' + key + '.xpValue');
      html += sliderField('Size', e.size, 8, 80, 2, 'VS_CONFIG.ENEMY_TYPES.' + key + '.size');

      html += '<div class="field-row"><label>Behavior</label>' +
              '<select class="enemy-behavior" data-key="' + key + '">' +
              ['chase','circle','shooter','boss_chase'].map(function (b) {
                return '<option value="' + b + '"' + (e.behavior === b ? ' selected' : '') + '>' + b + '</option>';
              }).join('') + '</select></div>';

      html += '<button class="btn-small btn-kill-all" style="margin-top:4px">Kill All</button>';
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // TAB: ANALYTICS
  // ────────────────────────────────────────────────────────────────────────

  function renderAnalytics() {
    var data = VSGame.getAnalytics ? VSGame.getAnalytics() : {};
    var player = VSGame.getPlayer ? VSGame.getPlayer() : null;
    var html = '<div class="tab-section"><h3>Analytics</h3>';

    html += '<label class="field-row"><span>Show overlay on canvas</span>' +
            '<input type="checkbox" id="analytics-toggle"></label>';

    html += '<div class="analytics-grid">';
    var stats = {
      'Kills': data.kills || 0,
      'Dmg Dealt': Math.floor(data.dmgDealt || 0),
      'Dmg Taken': Math.floor(data.dmgTaken || 0),
      'XP Collected': data.xpCollected || 0,
      'Level-ups': data.levelUps || 0,
      'Peak Enemies': data.peakEnemies || 0,
    };
    Object.keys(stats).forEach(function (k) {
      html += '<div class="stat-chip"><div class="stat-val">' + stats[k] + '</div><div class="stat-lbl">' + k + '</div></div>';
    });
    html += '</div>';

    if (player) {
      html += '<h3>Player</h3>';
      html += '<div class="analytics-grid">';
      [['Level', player.level],['HP', Math.ceil(player.hp)+'/'+player.maxHp],
       ['Weapons', player.weapons.length],['Speed', player.speed.toFixed(0)],
       ['DmgMult', player.dmgMult.toFixed(2)],['XPRange', player.xpRange.toFixed(0)]
      ].forEach(function (pair) {
        html += '<div class="stat-chip"><div class="stat-val">' + pair[1] + '</div><div class="stat-lbl">' + pair[0] + '</div></div>';
      });
      html += '</div>';
    }

    html += '<button class="btn-small" style="margin-top:8px" id="btn-refresh-analytics">↻ Refresh</button>';
    html += '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────
  // BIND CONTROLS (after innerHTML set)
  // ────────────────────────────────────────────────────────────────────────

  function bindTabControls() {
    var content = document.getElementById('tab-content');
    if (!content) return;

    // Generic inline-config sliders and number inputs
    content.querySelectorAll('.config-slider, .config-number').forEach(function (el) {
      el.addEventListener('input', function () {
        var path = el.dataset.path;
        var scale = parseFloat(el.dataset.scale || '1');
        var val = parseFloat(el.value) * scale;
        if (isNaN(val)) return;
        setNestedPath(VS_CONFIG, path, val);
        // Sync twin input
        var twin = content.querySelector('[data-path="' + path + '"]' + (el.classList.contains('config-slider') ? '.config-number' : '.config-slider'));
        if (twin) twin.value = el.value;
        scheduleSave();
        if (window.VSGame && VSGame.onConfigChange) VSGame.onConfigChange();
      });
    });

    // Level inputs (skill per-level arrays)
    content.querySelectorAll('.level-input').forEach(function (el) {
      el.addEventListener('change', function () {
        var idx = parseInt(el.dataset.idx);
        var stat = el.dataset.stat;
        var lv = parseInt(el.dataset.lv);
        VS_CONFIG.SKILLS[idx].perLevel[stat][lv] = parseFloat(el.value);
        scheduleSave();
        if (activeTab === 'skills') renderActiveTab();
      });
    });

    // Skill rarity
    content.querySelectorAll('.skill-rarity').forEach(function (el) {
      el.addEventListener('change', function () {
        VS_CONFIG.SKILLS[parseInt(el.dataset.idx)].rarity = el.value;
        scheduleSave();
        renderActiveTab();
      });
    });

    // Wave type / count
    content.querySelectorAll('.wave-type').forEach(function (el) {
      el.addEventListener('change', function () {
        VS_CONFIG.STAGES[el.dataset.si].waveSchedule[el.dataset.wi].enemyType = el.value;
        scheduleSave();
      });
    });
    content.querySelectorAll('.wave-count').forEach(function (el) {
      el.addEventListener('change', function () {
        VS_CONFIG.STAGES[el.dataset.si].waveSchedule[el.dataset.wi].count = parseInt(el.value);
        scheduleSave();
      });
    });

    // Enemy behavior
    content.querySelectorAll('.enemy-behavior').forEach(function (el) {
      el.addEventListener('change', function () {
        VS_CONFIG.ENEMY_TYPES[el.dataset.key].behavior = el.value;
        scheduleSave();
      });
    });

    // Play stage buttons
    content.querySelectorAll('.btn-play').forEach(function (el) {
      el.addEventListener('click', function () {
        VSGame.startStage(parseInt(el.dataset.si));
        var pauseBtn = document.querySelector('[data-action="pause"]');
        if (pauseBtn) pauseBtn.textContent = '⏸';
      });
    });

    // Spawn enemy buttons
    content.querySelectorAll('.btn-spawn').forEach(function (el) {
      el.addEventListener('click', function () { VSGame.spawnEnemy(el.dataset.enemy); });
    });

    // Kill all
    content.querySelectorAll('.btn-kill-all').forEach(function (el) {
      el.addEventListener('click', function () { VSGame.forceKillAll(); });
    });

    // Boss pin add/del
    content.querySelectorAll('.pin-add').forEach(function (el) {
      el.addEventListener('click', function () {
        var si = parseInt(el.dataset.si);
        var sec = parseInt(prompt('Add boss pin at second:') || '0');
        if (!isNaN(sec) && sec > 0) {
          if (!VS_CONFIG.STAGES[si].bossAt) VS_CONFIG.STAGES[si].bossAt = [];
          VS_CONFIG.STAGES[si].bossAt.push(sec);
          VS_CONFIG.STAGES[si].bossAt.sort(function (a, b) { return a - b; });
          scheduleSave();
          renderActiveTab();
        }
      });
    });
    content.querySelectorAll('.pin-del').forEach(function (el) {
      el.addEventListener('click', function () {
        VS_CONFIG.STAGES[el.dataset.si].bossAt.splice(parseInt(el.dataset.bi), 1);
        scheduleSave();
        renderActiveTab();
      });
    });

    // Pity enabled checkbox
    var pityCheck = content.querySelector('.pity-enabled');
    if (pityCheck) {
      pityCheck.addEventListener('change', function () {
        VS_CONFIG.PROBABILITY.pitySystem.enabled = pityCheck.checked;
        scheduleSave();
      });
    }

    // Analytics toggle
    var analyticsToggle = content.querySelector('#analytics-toggle');
    if (analyticsToggle) {
      analyticsToggle.addEventListener('change', function () {
        VSGame.setAnalyticsOverlay(analyticsToggle.checked);
      });
    }
    var refreshBtn = content.querySelector('#btn-refresh-analytics');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { renderActiveTab(); });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // GAME CALLBACKS
  // ────────────────────────────────────────────────────────────────────────

  function showLevelUpModal(choices, onSelect) {
    _levelUpCallback = onSelect;
    var overlay = document.getElementById('levelup-overlay');
    if (!overlay) return;

    var html = '<div class="levelup-box">';
    html += '<h2>Level Up!</h2>';
    html += '<div class="levelup-choices">';
    choices.forEach(function (choice) {
      html += '<button class="levelup-choice rarity-' + (choice.rarity || 'common') + '"' +
              ' data-id="' + choice.id + '">';
      html += '<span class="choice-icon">' + tokenEmoji(choice.icon || 'icon_orb') + '</span>';
      html += '<span class="choice-name">' + esc(choice.name) + '</span>';
      if (typeof choice.description === 'string') {
        html += '<span class="choice-desc">' + esc(choice.description) + '</span>';
      }
      html += '</button>';
    });
    html += '</div></div>';

    overlay.innerHTML = html;
    overlay.style.display = 'flex';

    overlay.querySelectorAll('.levelup-choice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.style.display = 'none';
        if (_levelUpCallback) _levelUpCallback(btn.dataset.id);
      });
    });
  }

  function onGameEnd(result) {
    var overlay = document.getElementById('levelup-overlay');
    if (!overlay) return;
    overlay.innerHTML = '<div class="levelup-box">' +
      '<h2>' + (result === 'win' ? '🎉 Stage Clear!' : '💀 Game Over') + '</h2>' +
      '<p style="color:#aaa;margin:8px 0">Check the Analytics tab for stats.</p>' +
      '<button id="btn-restart-after">Play Again</button>' +
      '</div>';
    overlay.style.display = 'flex';
    document.getElementById('btn-restart-after').addEventListener('click', function () {
      overlay.style.display = 'none';
      VSGame.startStage(0);
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // SVG CHART HELPERS
  // ────────────────────────────────────────────────────────────────────────

  function svgLineChart(values, opts) {
    opts = opts || {};
    var w = opts.w || 260, h = opts.h || 70, color = opts.color || '#4af';
    if (!values || !values.length) return '';
    var max = Math.max.apply(null, values.concat([1]));
    var n = values.length;
    var pts = values.map(function (v, i) {
      return ((i / Math.max(n - 1, 1)) * w).toFixed(1) + ',' + (h - (v / max) * (h - 4)).toFixed(1);
    }).join(' ');
    var dots = values.map(function (v, i) {
      var cx = ((i / Math.max(n - 1, 1)) * w).toFixed(1);
      var cy = (h - (v / max) * (h - 4)).toFixed(1);
      return '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="' + color + '"/>';
    }).join('');
    return '<svg width="' + w + '" height="' + h + '" style="display:block">' +
           '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2"/>' +
           dots + '</svg>';
  }

  function svgBarChart(labels, values, opts) {
    opts = opts || {};
    var w = opts.w || 260, h = opts.h || 80, color = opts.color || '#27ae60';
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
    return '<svg width="' + w + '" height="' + h + '" style="display:block">' + bars + '</svg>';
  }

  function svgPieChart(weights, colors) {
    var keys = Object.keys(weights);
    var total = keys.reduce(function (s, k) { return s + (weights[k] || 0); }, 0);
    if (!total) return '';
    var cx = 50, cy = 50, r = 44;
    var angle = -Math.PI / 2;
    var paths = keys.map(function (k) {
      var slice = (weights[k] / total) * Math.PI * 2;
      var x1 = cx + r * Math.cos(angle);
      var y1 = cy + r * Math.sin(angle);
      angle += slice;
      var x2 = cx + r * Math.cos(angle);
      var y2 = cy + r * Math.sin(angle);
      var large = slice > Math.PI ? 1 : 0;
      var col = (colors && colors[k]) || '#888';
      return '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
             ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
             ' Z" fill="' + col + '" stroke="#111" stroke-width="1"/>';
    }).join('');
    return '<svg width="100" height="100" style="display:block">' + paths + '</svg>';
  }

  // ────────────────────────────────────────────────────────────────────────
  // SLIDER FIELD HELPER
  // ────────────────────────────────────────────────────────────────────────

  function sliderField(label, value, min, max, step, path, scale) {
    scale = scale || 1;
    var displayVal = (scale !== 1) ? (value / scale).toFixed(0) : value;
    var id = 'sf_' + Math.random().toString(36).slice(2, 7);
    return '<div class="field-row">' +
           '<label for="' + id + '_r" title="' + esc(label) + '">' + esc(label) + '</label>' +
           '<input type="range" id="' + id + '_r" class="config-slider"' +
           ' min="' + (min * (scale !== 1 ? 1 / scale : 1)).toFixed(0) + '"' +
           ' max="' + (max * (scale !== 1 ? 1 / scale : 1)).toFixed(0) + '"' +
           ' step="' + (step * (scale !== 1 ? 1 / scale : 1)) + '"' +
           ' value="' + displayVal + '"' +
           ' data-path="' + path + '" data-scale="' + scale + '">' +
           '<input type="number" id="' + id + '_n" class="config-number"' +
           ' min="' + (min * (scale !== 1 ? 1 / scale : 1)).toFixed(0) + '"' +
           ' max="' + (max * (scale !== 1 ? 1 / scale : 1)).toFixed(0) + '"' +
           ' step="' + (step * (scale !== 1 ? 1 / scale : 1)) + '"' +
           ' value="' + displayVal + '"' +
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
      // Handle array index in path like STAGES[0]
      var arrMatch = p.match(/^(\w+)\[(\d+)\]$/);
      if (arrMatch) {
        cur = cur[arrMatch[1]][parseInt(arrMatch[2])];
      } else {
        cur = cur[p];
      }
      if (!cur) return;
    }
    var last = parts[parts.length - 1];
    var lastMatch = last.match(/^(\w+)\[(\d+)\]$/);
    if (lastMatch) {
      cur[lastMatch[1]][parseInt(lastMatch[2])] = val;
    } else {
      cur[last] = val;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ────────────────────────────────────────────────────────────────────────

  var KEY_CONFIG    = 'sandbox_vs_config';
  var KEY_SNAPSHOTS = 'sandbox_vs_snapshots';

  function scheduleSave() {
    clearTimeout(_saveTimer);
    var dot = document.getElementById('unsaved-dot');
    if (dot) dot.style.display = 'inline';
    _saveTimer = setTimeout(save, 2000);
  }

  function save() {
    try {
      localStorage.setItem(KEY_CONFIG, JSON.stringify(VS_CONFIG));
      var dot = document.getElementById('unsaved-dot');
      if (dot) dot.style.display = 'none';
    } catch (e) { /* storage full */ }
  }

  function startAutosave() {
    setInterval(save, 10000);
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(KEY_CONFIG);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      deepMerge(VS_CONFIG, parsed);
    } catch (e) { /* bad JSON */ }
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(VS_CONFIG, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vs-config.json';
    a.click();
  }

  function importJSON() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var parsed = JSON.parse(ev.target.result);
          deepMerge(VS_CONFIG, parsed);
          renderActiveTab();
          if (window.VSGame && VSGame.onConfigChange) VSGame.onConfigChange();
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
      if (Object.keys(snaps).length >= 10 && !snaps[name]) {
        alert('Max 10 snapshots. Delete one first.');
        return;
      }
      snaps[name] = JSON.parse(JSON.stringify(VS_CONFIG));
      localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(snaps));
      alert('Snapshot "' + name + '" saved.');
    } catch (e) { alert('Could not save snapshot.'); }
  }

  function showSnapshotManager() {
    try {
      var snaps = JSON.parse(localStorage.getItem(KEY_SNAPSHOTS) || '{}');
      var names = Object.keys(snaps);
      if (!names.length) { alert('No snapshots saved.'); return; }
      var choice = prompt('Snapshots:\n' + names.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n') +
                          '\n\nEnter name to LOAD (or type "del:<name>" to delete):');
      if (!choice) return;
      if (choice.startsWith('del:')) {
        var del = choice.slice(4).trim();
        delete snaps[del];
        localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(snaps));
        alert('Deleted.');
      } else if (snaps[choice]) {
        deepMerge(VS_CONFIG, snaps[choice]);
        renderActiveTab();
        if (window.VSGame && VSGame.onConfigChange) VSGame.onConfigChange();
        scheduleSave();
      } else {
        alert('Not found: ' + choice);
      }
    } catch (e) { alert('Error: ' + e.message); }
  }

  function resetToDefault() {
    if (!confirm('Reset all config to defaults?')) return;
    deepMerge(VS_CONFIG, VS_DEFAULTS);
    renderActiveTab();
    if (window.VSGame && VSGame.onConfigChange) VSGame.onConfigChange();
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
      } else {
        target[k] = source[k];
      }
    });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ────────────────────────────────────────────────────────────────────────
  return {
    init: init,
    showLevelUpModal: showLevelUpModal,
    onGameEnd: onGameEnd,
    exportJSON: exportJSON,
    importJSON: importJSON,
    saveSnapshot: saveSnapshot,
    resetToDefault: resetToDefault
  };
})();
