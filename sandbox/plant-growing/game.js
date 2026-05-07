'use strict';
// game.js — window.PGGame  (tick loop, canvas render, idle logic)

window.PGGame = (function () {

  var STORAGE_KEY = 'sandbox_plant_v1';

  var canvas, ctx;
  var W = 600, H = 600;

  // ── Game state (persisted) ───────────────────────────────────────────────
  var state = {
    coins: 0,
    gems: 0,
    stage: 0,
    xp: 0,
    upgrades: {},      // id → purchase count
    items: {},         // id → { uses:0, lastUsed:0 }
    soilStats: { moisture: 50, nutrients: 50, sunlight: 50 },
    activeEffects: [], // { type, multiplier, expiresAt }
    visitorTimers: {}, // id → nextVisitTime
    missionProgress: {},
    tapCount: 0,
    playtimeSec: 0,
    visitorCount: 0,
    itemUseCount: 0,
    coinsEarnedSession: 0,
    prestigeCount: 0,
    lastSave: Date.now()
  };

  // ── Runtime (not persisted) ──────────────────────────────────────────────
  var tickInterval = null;
  var animId = null;
  var particles = [];
  var visitors = [];         // { id, x, y, token, age, maxAge }
  var plantAnim = 0;         // wiggle phase
  var activeEventMsg = null; // { text, expiresAt }
  var eventTimers = {};      // eventId → nextFireTime

  var TICK_MS = 500;

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────────

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('click', onTap);
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); onTap(e.touches[0]); }, { passive: false });

    loadState();
    applyOfflineProgress();
    startTick();
    startRenderLoop();
  }

  function tap() {
    var stage = currentStage();
    if (!stage) return;
    var val = stage.tapValue * getTapMultiplier();
    state.coins += val;
    state.tapCount++;
    state.missionProgress['tap_100'] = (state.missionProgress['tap_100'] || 0) + 1;

    // XP from tap
    var xpGain = Math.ceil(val * 0.1);
    gainXP(xpGain);

    // Particles
    spawnCoinParticle(W / 2 + (Math.random() - 0.5) * 40, H / 2 + 40);
  }

  function jumpToStage(n) {
    n = Math.max(0, Math.min(n, PG_CONFIG.GROWTH_STAGES.length - 1));
    state.stage = n;
    state.xp = PG_CONFIG.GROWTH_STAGES[n].xpRequired || 0;
    saveState();
    if (window.PGUI && PGUI.onStageChange) PGUI.onStageChange(n);
  }

  function useItem(itemId) {
    var item = getItemDef(itemId);
    if (!item) return;

    var now = Date.now();
    var rec = state.items[itemId] || { uses: 0, lastUsed: 0 };
    if (item.cooldownSec > 0 && now - rec.lastUsed < item.cooldownSec * 1000) return;

    rec.uses++;
    rec.lastUsed = now;
    state.items[itemId] = rec;
    state.itemUseCount++;

    applyItemEffect(item.effect);
    saveState();
  }

  function onConfigChange() {
    // Config changed from panel — re-derive soil bonuses etc.
    // Game re-reads config every tick, so no action needed.
  }

  function getState() { return state; }

  function getParticles() { return particles; }

  function prestige() {
    if (state.stage < PG_CONFIG.GROWTH_STAGES.length - 1) return;
    state.prestigeCount++;
    var keep = (PG_CONFIG.PRESTIGE && PG_CONFIG.PRESTIGE.keepList) || [];
    var keptUpgrades = {};
    keep.forEach(function (id) { if (state.upgrades[id]) keptUpgrades[id] = state.upgrades[id]; });

    var bonus = (PG_CONFIG.PRESTIGE && PG_CONFIG.PRESTIGE.startingCoinBonus) || 0;
    var mult = getPrestigeMultiplier(state.prestigeCount);

    // Reset
    state.coins = bonus * mult;
    state.gems = state.gems; // keep gems
    state.stage = 0;
    state.xp = 0;
    state.upgrades = keptUpgrades;
    state.items = {};
    state.activeEffects = [];
    saveState();
  }

  // ────────────────────────────────────────────────────────────────────────
  // TICK LOOP (every 500ms)
  // ────────────────────────────────────────────────────────────────────────

  function startTick() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(tick, TICK_MS);
  }

  function tick() {
    var now = Date.now();
    var dt = TICK_MS / 1000;

    var stage = currentStage();
    if (!stage) return;

    // Idle income
    var income = stage.idleIncomePerSec * dt * getIdleMultiplier();
    state.coins += income;
    state.coinsEarnedSession += income;

    // Mission: earn_coins
    state.missionProgress['earn_coins'] = (state.missionProgress['earn_coins'] || 0) + income;

    // Playtime
    state.playtimeSec += dt;
    state.missionProgress['playtime_sec'] = state.playtimeSec;

    // Soil decay
    var soil = PG_CONFIG.SOIL_STATS || {};
    var decay = (soil.decayRatePerHour || 5) / 3600 * dt;
    state.soilStats.moisture  = Math.max(0, state.soilStats.moisture  - decay);
    state.soilStats.nutrients = Math.max(0, state.soilStats.nutrients - decay);
    state.soilStats.sunlight  = state.soilStats.sunlight; // sunlight doesn't decay

    // Expire active effects
    state.activeEffects = state.activeEffects.filter(function (e) { return e.expiresAt > now; });

    // XP from idle
    gainXP(income * 0.02);

    // Random events
    checkRandomEvents(dt, now);

    // Visitors
    checkVisitors(now);

    // Gem drop from upgrade
    var gemChance = getUpgradeEffect('gemDropChance') || 0;
    if (gemChance > 0 && Math.random() < gemChance * dt) {
      state.gems += 1;
      spawnGemParticle(W / 2, H / 2);
    }

    // Check daily mission completions
    checkMissions();

    saveState();
  }

  // ── Events ───────────────────────────────────────────────────────────────

  function checkRandomEvents(dt, now) {
    (PG_CONFIG.EVENTS || []).forEach(function (ev) {
      if (ev.triggerType === 'random') {
        var chance = (ev.chancePerTenMin || 0.1) / 600 * (TICK_MS / 1000);
        if (Math.random() < chance) fireEvent(ev);
      } else if (ev.triggerType === 'scheduled') {
        var atMs = (ev.atMinute || 0) * 60000;
        var played = state.playtimeSec * 1000;
        var key = 'ev_' + ev.id;
        if (played >= atMs && !eventTimers[key]) {
          eventTimers[key] = true;
          fireEvent(ev);
        }
      } else if (ev.triggerType === 'condition') {
        var cond = ev.condition || {};
        var statVal = state[cond.stat] || 0;
        var key2 = 'ev_' + ev.id;
        var passed = (cond.op === '>=' && statVal >= cond.value) ||
                     (cond.op === '>' && statVal > cond.value) ||
                     (cond.op === '<=' && statVal <= cond.value);
        if (passed && !eventTimers[key2]) {
          eventTimers[key2] = true;
          fireEvent(ev);
        }
      }
    });
  }

  function fireEvent(ev) {
    applyItemEffect(ev.effect);
    if (ev.message) {
      activeEventMsg = { text: ev.message, expiresAt: Date.now() + 4000 };
    }
    if (window.PGUI && PGUI.onEvent) PGUI.onEvent(ev);
  }

  // ── Visitors ─────────────────────────────────────────────────────────────

  function checkVisitors(now) {
    var stageIdx = state.stage;
    (PG_CONFIG.VISITORS || []).forEach(function (vDef) {
      if ((vDef.condition && vDef.condition.minStage || 0) > stageIdx) return;
      var nextTime = state.visitorTimers[vDef.id] || 0;
      if (now >= nextTime) {
        var freqMs = (vDef.frequencyMin || 5) * 60000 * getUpgradeEffect('visitorFrequencyMultiplier', true, 1);
        state.visitorTimers[vDef.id] = now + freqMs * (0.7 + Math.random() * 0.6);

        // Add visitor to canvas
        visitors.push({
          id: vDef.id, token: vDef.token,
          x: 50 + Math.random() * (W - 100),
          y: 80 + Math.random() * 80,
          age: 0, maxAge: 4,
          reward: vDef.reward,
          message: vDef.message
        });
        state.visitorCount++;
        state.missionProgress['visitor_3'] = (state.missionProgress['visitor_3'] || 0) + 1;
      }
    });

    // Age out visitors and collect rewards
    visitors = visitors.filter(function (v) {
      v.age += TICK_MS / 1000;
      if (v.age >= v.maxAge) {
        collectVisitorReward(v);
        return false;
      }
      return true;
    });
  }

  function collectVisitorReward(v) {
    var r = v.reward || {};
    if (r.type === 'xp') gainXP(r.value || 0);
    else if (r.type === 'coins') state.coins += r.value || 0;
    else if (r.type === 'gems') state.gems += r.value || 0;
    else if (r.type === 'multiplier') {
      state.activeEffects.push({
        type: 'idleMultiplier',
        multiplier: r.value || 1,
        expiresAt: Date.now() + (r.durationSec || 60) * 1000
      });
    }
    if (v.message) {
      activeEventMsg = { text: v.message, expiresAt: Date.now() + 3000 };
    }
  }

  // ── Missions ─────────────────────────────────────────────────────────────

  function checkMissions() {
    (PG_CONFIG.DAILY_MISSIONS || []).forEach(function (m) {
      var prog = state.missionProgress[m.id] || 0;
      var done = state.missionProgress[m.id + '_done'];
      if (!done && prog >= m.target) {
        state.missionProgress[m.id + '_done'] = true;
        collectMissionReward(m.reward);
        activeEventMsg = { text: '🎯 Mission complete: ' + m.name, expiresAt: Date.now() + 3000 };
      }
    });
  }

  function collectMissionReward(reward) {
    if (!reward) return;
    if (reward.coins) state.coins += reward.coins;
    if (reward.xp)    gainXP(reward.xp);
    if (reward.gems)  state.gems += reward.gems;
  }

  // ── XP / Stage ───────────────────────────────────────────────────────────

  function gainXP(amount) {
    if (amount <= 0) return;
    state.xp += amount;

    var stages = PG_CONFIG.GROWTH_STAGES;
    var curve = PG_CONFIG.XP_TO_NEXT || [];
    var nextThreshold = stages[state.stage + 1] ? (stages[state.stage].xpRequired + (curve[state.stage] || 99999)) : Infinity;

    if (state.stage < stages.length - 1 && state.xp >= nextThreshold) {
      state.stage++;
      if (window.PGUI && PGUI.onStageChange) PGUI.onStageChange(state.stage);
      activeEventMsg = { text: '🌱 Advanced to: ' + (stages[state.stage].name || 'Next Stage'), expiresAt: Date.now() + 5000 };
    }
  }

  // ── Offline progress ─────────────────────────────────────────────────────

  function applyOfflineProgress() {
    var now = Date.now();
    var offlineMs = now - (state.lastSave || now);
    if (offlineMs < 5000) return;

    var stage = currentStage();
    if (!stage) return;

    var offlineSec = offlineMs / 1000;
    var capSec = (stage.offlineCapHours || 8) * 3600;
    var effectiveSec = Math.min(offlineSec, capSec);
    var income = stage.offlineIncomePerSec * effectiveSec;

    // Apply offline upgrade multipliers (simpler: only idle upgrades)
    var mult = getUpgradeEffect('offlineIncomeMultiplier') || 1;
    income *= mult;

    state.coins += income;
    state.lastSave = now;

    if (income > 0) {
      activeEventMsg = {
        text: 'Welcome back! Earned ' + formatNum(income) + ' coins while away.',
        expiresAt: Date.now() + 5000
      };
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  function applyItemEffect(effect) {
    if (!effect) return;
    if (effect.type === 'xp_burst') {
      gainXP(effect.value || 0);
    } else if (effect.type === 'coinBurst') {
      state.coins += effect.value || 0;
    } else if (effect.type === 'gemDrop') {
      state.gems += effect.value || 0;
    } else if (effect.type === 'idleMultiplier') {
      state.activeEffects.push({
        type: 'idleMultiplier',
        multiplier: effect.value || 1,
        expiresAt: Date.now() + (effect.durationSec || 60) * 1000
      });
    } else if (effect.type === 'tapMultiplier') {
      state.activeEffects.push({
        type: 'tapMultiplier',
        multiplier: effect.value || 1,
        expiresAt: Date.now() + (effect.durationSec || 30) * 1000
      });
    } else if (effect.type === 'sunlightBonus') {
      state.soilStats.sunlight = Math.min(100, state.soilStats.sunlight + (effect.value || 0));
    }
  }

  function getIdleMultiplier() {
    var base = 1;
    var now = Date.now();

    // Active effects
    state.activeEffects.forEach(function (e) {
      if (e.type === 'idleMultiplier' && e.expiresAt > now) base *= e.multiplier;
    });

    // Upgrade bonuses
    base *= getUpgradeEffect('idleIncomeMultiplier');

    // Soil stats
    var soil = PG_CONFIG.SOIL_STATS || {};
    var m = (state.soilStats.moisture - 50) * (soil.moistureEffect || 0.02);
    var n = (state.soilStats.nutrients - 50) * (soil.nutrientsEffect || 0.015);
    var s = (state.soilStats.sunlight - 50) * (soil.sunlightEffect || 0.025);
    base *= Math.max(0.1, 1 + m + n + s);

    // Season multiplier
    var day = (new Date()).getDay();
    var season = PG_CONFIG.SEASONS && PG_CONFIG.SEASONS[day];
    if (season) base *= (season.idleMultiplier || 1);

    // Prestige
    base *= getPrestigeMultiplier(state.prestigeCount);

    return base;
  }

  function getTapMultiplier() {
    var base = 1;
    var now = Date.now();
    state.activeEffects.forEach(function (e) {
      if (e.type === 'tapMultiplier' && e.expiresAt > now) base *= e.multiplier;
    });
    base *= getUpgradeEffect('tapMultiplier');
    var day = (new Date()).getDay();
    var season = PG_CONFIG.SEASONS && PG_CONFIG.SEASONS[day];
    if (season) base *= (season.tapMultiplier || 1);
    return base;
  }

  function getUpgradeEffect(effectKey, inverse, defaultVal) {
    var val = defaultVal !== undefined ? defaultVal : 1;
    (PG_CONFIG.UPGRADES || []).forEach(function (u) {
      var purchases = state.upgrades[u.id] || 0;
      if (!purchases) return;
      var e = u.effect || {};
      if (e[effectKey] !== undefined) {
        if (inverse) {
          val /= Math.pow(e[effectKey], purchases);
        } else {
          val *= Math.pow(e[effectKey], purchases);
        }
      }
    });
    return val;
  }

  function getPrestigeMultiplier(count) {
    var curve = (PG_CONFIG.PRESTIGE && PG_CONFIG.PRESTIGE.multiplierCurve) || [];
    var mult = 1;
    for (var i = curve.length - 1; i >= 0; i--) {
      if (count >= curve[i].prestige) { mult = curve[i].multiplier; break; }
    }
    return mult;
  }

  function getItemDef(id) {
    var items = PG_CONFIG.ITEMS || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  function currentStage() {
    return PG_CONFIG.GROWTH_STAGES[state.stage] || null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER LOOP
  // ────────────────────────────────────────────────────────────────────────

  function startRenderLoop() {
    function frame() {
      draw();
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
  }

  function draw() {
    var stage = currentStage() || PG_CONFIG.GROWTH_STAGES[0];
    plantAnim += 0.04;

    // Background
    ctx.fillStyle = tokenColor(stage.bgToken || 'bg_garden');
    ctx.fillRect(0, 0, W, H);

    // Ground
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, H - 80, W, 80);

    // Soil bars
    drawSoilBars();

    // Ambient particles
    drawParticles();

    // Plant (centered, animated wiggle)
    drawPlant(stage);

    // Visitors
    drawVisitors();

    // HUD
    drawHUD(stage);

    // Event message
    if (activeEventMsg && activeEventMsg.expiresAt > Date.now()) {
      drawEventMessage(activeEventMsg.text);
    } else {
      activeEventMsg = null;
    }
  }

  function drawPlant(stage) {
    var cx = W / 2, cy = H / 2 + 40;
    var wiggle = Math.sin(plantAnim) * 0.06;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wiggle);

    var fontSize = 60 + state.stage * 8;
    ctx.font = fontSize + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tokenEmoji(stage.spriteToken || 'plant_seed'), 0, 0);

    // Ambient particles around plant
    if (Math.random() < 0.08) {
      var ax = (Math.random() - 0.5) * fontSize;
      var ay = (Math.random() - 0.5) * fontSize;
      particles.push({
        x: cx + ax, y: cy + ay,
        vx: (Math.random() - 0.5) * 30,
        vy: -20 - Math.random() * 20,
        life: 1.5, maxLife: 1.5,
        emoji: tokenEmoji(stage.ambientAnimToken || 'anim_leaves_small'),
        size: 12
      });
    }

    ctx.restore();
  }

  function drawVisitors() {
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    visitors.forEach(function (v) {
      var alpha = Math.min(1, Math.min(v.age / 0.5, (v.maxAge - v.age) / 0.5));
      ctx.globalAlpha = alpha;
      var bob = Math.sin(plantAnim * 2 + v.x) * 4;
      ctx.fillText(tokenEmoji(v.token || 'visitor_bee'), v.x, v.y + bob);
    });
    ctx.globalAlpha = 1;
  }

  function drawSoilBars() {
    var barW = 120, barH = 5;
    var startX = 10, y = H - 70;
    var bars = [
      { label: '💧', val: state.soilStats.moisture,  color: '#2980b9' },
      { label: '🌱', val: state.soilStats.nutrients, color: '#27ae60' },
      { label: '☀️', val: state.soilStats.sunlight,  color: '#f1c40f' }
    ];
    bars.forEach(function (b, i) {
      var bx = startX + i * (barW + 40);
      ctx.font = '12px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, bx, y + 2);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(bx + 18, y - 2, barW, barH);
      ctx.fillStyle = b.color;
      ctx.fillRect(bx + 18, y - 2, barW * Math.max(0, Math.min(1, b.val / 100)), barH);
    });
  }

  function drawHUD(stage) {
    // Coin & gem counts
    ctx.fillStyle = tokenColor('hud_text');
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tokenEmoji('icon_coin') + ' ' + formatNum(state.coins), 10, 10);
    ctx.fillText(tokenEmoji('icon_gem')  + ' ' + state.gems, 10, 32);

    // Stage progress
    var stages = PG_CONFIG.GROWTH_STAGES;
    var xpCurve = PG_CONFIG.XP_TO_NEXT || [];
    var xpNeeded = xpCurve[state.stage] || 99999;
    var stageXP = state.xp - (stage.xpRequired || 0);
    var xpPct = Math.min(1, stageXP / xpNeeded);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(W / 2 - 100, 10, 200, 30);
    ctx.fillStyle = tokenColor('hud_xp_bg');
    ctx.fillRect(W / 2 - 100, 10, 200, 30);
    ctx.fillStyle = tokenColor('hud_xp');
    ctx.fillRect(W / 2 - 100, 10, 200 * xpPct, 30);
    ctx.fillStyle = tokenColor('hud_text');
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stage.name + ' (' + (state.stage + 1) + '/' + stages.length + ')', W / 2, 25);

    // Idle rate
    var idleRate = stage.idleIncomePerSec * getIdleMultiplier();
    ctx.fillStyle = tokenColor('hud_text');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(formatNum(idleRate) + '/s idle', W - 10, 10);
    ctx.fillText('×' + getIdleMultiplier().toFixed(1) + ' boost', W - 10, 24);
  }

  function drawEventMessage(text) {
    var y = H / 2 - 80;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    var tw = ctx.measureText(text).width + 20;
    ctx.fillRect(W / 2 - tw / 2, y - 12, tw, 24);
    ctx.fillStyle = '#ffe88a';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  }

  function drawParticles() {
    particles = particles.filter(function (p) {
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.vy += 15 * 0.016;
      p.life -= 0.016;
      return p.life > 0;
    });

    particles.forEach(function (p) {
      var alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.emoji) {
        ctx.font = (p.size || 12) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, p.x, p.y);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, (p.size || 4) * alpha), 0, Math.PI * 2);
        ctx.fillStyle = p.color || '#fff';
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function onTap(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var cx = ((e.clientX - rect.left) * scaleX);
    var cy = ((e.clientY - rect.top)  * scaleY);

    // Check visitor tap
    var tappedVisitor = false;
    visitors = visitors.filter(function (v) {
      if (Math.abs(cx - v.x) < 30 && Math.abs(cy - v.y) < 30) {
        collectVisitorReward(v);
        tappedVisitor = true;
        return false;
      }
      return true;
    });
    if (!tappedVisitor) tap();

    spawnCoinParticle(cx, cy);
  }

  function spawnCoinParticle(x, y) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 60,
      vy: -40 - Math.random() * 30,
      life: 1, maxLife: 1,
      emoji: tokenEmoji('icon_coin'), size: 14
    });
  }

  function spawnGemParticle(x, y) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 50,
      vy: -50 - Math.random() * 30,
      life: 1.2, maxLife: 1.2,
      emoji: tokenEmoji('icon_gem'), size: 14
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ────────────────────────────────────────────────────────────────────────

  function saveState() {
    state.lastSave = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage full */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      Object.assign(state, parsed);
    } catch (e) { /* bad JSON */ }
  }

  // ────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────────────

  function formatNum(n) {
    if (n >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.floor(n).toString();
  }

  function resizeCanvas() {
    var wrap = canvas.parentElement;
    if (!wrap) return;
    var ww = wrap.clientWidth || W;
    var wh = wrap.clientHeight || H;
    var scale = Math.min(ww / W, wh / H, 1);
    canvas.style.width  = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
  }

  // ────────────────────────────────────────────────────────────────────────
  return {
    init: init,
    tap: tap,
    jumpToStage: jumpToStage,
    useItem: useItem,
    prestige: prestige,
    onConfigChange: onConfigChange,
    getState: getState,
    getIdleMultiplier: getIdleMultiplier,
    getTapMultiplier: getTapMultiplier,
    formatNum: formatNum
  };
})();
