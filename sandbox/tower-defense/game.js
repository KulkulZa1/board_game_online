'use strict';
// game.js — window.TDGame

window.TDGame = (function () {
  var canvas, ctx;
  var W = 800, H = 600;
  var BASE = { x: 400, y: 300 };

  // ── State machine ────────────────────────────────────────────────
  // 'title' | 'prep' | 'wave' | 'wave_end' | 'levelup' | 'stageclear' | 'gameover' | 'infinity'
  var phase = 'title';

  var state = {
    gold: 120,
    stageIdx: 0,
    waveIdx: 0,
    mobsReached: 0,
    capacity: 20,
    wavesCleared: 0,
    totalWavesCleared: 0,
    kills: 0,
    waveKills: 0,
    goldEarned: 0,
    bestInfinity: 0,
    infinityWave: 0,
    bossTimeLeft: 0,
    bossActive: false,
    bossTimerFull: 30,
    placingMode: false,
    chosenPassives: [],
    baseFlash: 0,
    bossSlayerTimer: 0,
    lastBossKilledTime: 0
  };

  var towers = [];
  var enemies = [];
  var projectiles = [];
  var particles = [];
  var toasts = [];
  var spawnQueue = [];
  var spawnTimer = 0;
  var nextTowerId = 1;
  var nextEnemyId = 1;
  var nextProjId = 1;
  var selectedTower = null;
  var hoveredTower = null;
  var contextMenu = null;
  var spawnPoints = [];
  var lastTs = 0;
  var animId = null;
  var voidShotCount = {};

  // passive stacks: { effectKey: totalAddedValue }
  var passiveStacks = {};

  // ── Spawn points ─────────────────────────────────────────────────
  function computeSpawnPoints() {
    var n = TD_CONFIG.SPAWN_COUNT;
    var margin = TD_CONFIG.SPAWN_MARGIN;
    spawnPoints = [];
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      var rx = W / 2 - margin;
      var ry = H / 2 - margin;
      spawnPoints.push({
        x: BASE.x + Math.cos(ang) * rx,
        y: BASE.y + Math.sin(ang) * ry
      });
    }
  }

  // ── Passive helpers ──────────────────────────────────────────────
  function getPassiveMult(key) {
    var base = 1;
    if (passiveStacks[key] === undefined) return base;
    if (key === 'firerate' || key === 'costMult') {
      return 1 + passiveStacks[key];
    }
    return 1 + passiveStacks[key];
  }
  function getPassiveAdd(key) {
    return passiveStacks[key] || 0;
  }
  function applyPassive(passiveId) {
    var p = TD_CONFIG.PASSIVES.find(function (x) { return x.id === passiveId; });
    if (!p) return;
    passiveStacks[p.effectKey] = (passiveStacks[p.effectKey] || 0) + p.effectVal;
    state.chosenPassives.push(passiveId);
  }

  // ── Tower helpers ────────────────────────────────────────────────
  function getTowerEmoji(level) {
    return tokenEmoji('tower_lv' + (level + 1));
  }
  function getTowerRange(tower) {
    var cfg = TD_CONFIG.TOWER;
    var lvl = cfg.upgradeLevels[tower.level];
    return cfg.range * lvl.rangeMult * (1 + getPassiveAdd('range'));
  }
  function getTowerDamage(tower) {
    var cfg = TD_CONFIG.TOWER;
    var lvl = cfg.upgradeLevels[tower.level];
    return cfg.damage * lvl.damageMult * (1 + getPassiveAdd('damage'));
  }
  function getTowerFireRate(tower) {
    var cfg = TD_CONFIG.TOWER;
    return cfg.fireRateMs * (1 + getPassiveAdd('firerate'));
  }
  function getTowerCost() {
    var base = TD_CONFIG.TOWER.cost;
    var mult = 1 + (passiveStacks['costMult'] || 0);
    return Math.max(10, Math.round(base * mult));
  }

  // ── Dist / collision ─────────────────────────────────────────────
  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── Tower placement ──────────────────────────────────────────────
  function placeTower(x, y) {
    var cost = getTowerCost();
    if (state.gold < cost) return false;
    if (dist({x: x, y: y}, BASE) < TD_CONFIG.BASE_RADIUS + 20) return false;
    for (var i = 0; i < towers.length; i++) {
      if (dist({x: x, y: y}, towers[i]) < 30) return false;
    }
    towers.push({ id: nextTowerId++, x: x, y: y, level: 0, cd: 0, voidCount: 0 });
    state.gold -= cost;
    if (window.TDUI && TDUI.markUnsaved) TDUI.markUnsaved();
    return true;
  }

  function sellTower(id) {
    var idx = towers.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return;
    var t = towers[idx];
    var totalSpent = TD_CONFIG.TOWER.cost;
    for (var lv = 1; lv <= t.level; lv++) {
      totalSpent += TD_CONFIG.TOWER.upgradeLevels[lv].cost;
    }
    var refund = Math.round(totalSpent * TD_CONFIG.TOWER.sellRatio);
    state.gold += refund;
    towers.splice(idx, 1);
    if (selectedTower && selectedTower.id === id) selectedTower = null;
    closeContextMenu();
  }

  function upgradeTower(id) {
    var t = towers.find(function (x) { return x.id === id; });
    if (!t) return;
    if (t.level >= TD_CONFIG.TOWER.upgradeLevels.length - 1) return;
    var cost = TD_CONFIG.TOWER.upgradeLevels[t.level + 1].cost;
    if (state.gold < cost) return;
    state.gold -= cost;
    t.level++;
    closeContextMenu();
    if (window.TDUI) TDUI.refresh();
  }

  // ── Spawn ────────────────────────────────────────────────────────
  function buildSpawnQueue(wave) {
    spawnQueue = [];
    var cfg = TD_CONFIG.ENEMY_TYPES[wave.enemyType];
    if (!cfg) return;
    for (var i = 0; i < wave.count; i++) {
      spawnQueue.push({ enemyType: wave.enemyType, hpMult: wave.hpMult, speedMult: wave.speedMult, delay: i * wave.intervalMs });
    }
    spawnTimer = 0;
  }

  function spawnEnemy(enemyType, hpMult, speedMult) {
    var cfg = TD_CONFIG.ENEMY_TYPES[enemyType];
    if (!cfg) return;
    var sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    var angle = Math.atan2(BASE.y - sp.y, BASE.x - sp.x);
    enemies.push({
      id: nextEnemyId++,
      x: sp.x, y: sp.y,
      type: enemyType,
      maxHp: cfg.hp * hpMult,
      hp: cfg.hp * hpMult,
      speed: cfg.speed * speedMult,
      reward: cfg.reward,
      damage: cfg.damage,
      size: cfg.size,
      colorToken: cfg.colorToken,
      spriteToken: cfg.spriteToken,
      isBoss: cfg.isBoss,
      angle: angle,
      frozen: 0,
      slowed: 0,
      slowFactor: 1.0
    });
  }

  // ── Wave management ──────────────────────────────────────────────
  function getCurrentWaves() {
    var s = TD_CONFIG.STAGES[state.stageIdx];
    return s ? s.waves : null;
  }

  function startWave() {
    if (phase === 'gameover') return;
    var waves = getCurrentWaves();
    if (phase === 'infinity') {
      startInfinityWave();
      return;
    }
    if (!waves || state.waveIdx >= waves.length) return;
    var wave = waves[state.waveIdx];
    buildSpawnQueue(wave);
    state.waveKills = 0;
    if (wave.isBoss) {
      state.bossActive = true;
      state.bossTimeLeft = wave.bossTimerSec;
      state.bossTimerFull = wave.bossTimerSec;
      state.bossSlayerTimer = wave.bossTimerSec;
    }
    phase = 'wave';
    if (window.TDUI) TDUI.refresh();
  }

  function startInfinityWave() {
    var inf = TD_CONFIG.INFINITY;
    state.infinityWave++;
    var wv = state.infinityWave;
    var isBoss = (wv % inf.bossEveryNWaves === 0);
    var hpMult = 1 + wv * inf.hpScalePerWave;
    var speedMult = 1 + wv * inf.speedScalePerWave;
    var count = inf.countBase + wv * inf.countPerWave;
    var interval = Math.max(inf.intervalMinMs, inf.intervalMs - wv * 20);
    var enemyType = isBoss ? 'boss' : (wv % 3 === 0 ? 'tank' : (wv % 2 === 0 ? 'runner' : 'grunt'));
    spawnQueue = [];
    for (var i = 0; i < count; i++) {
      spawnQueue.push({ enemyType: enemyType, hpMult: hpMult, speedMult: speedMult, delay: i * interval });
    }
    spawnTimer = 0;
    state.waveKills = 0;
    if (isBoss) {
      state.bossActive = true;
      state.bossTimeLeft = inf.bossTimerSec;
      state.bossTimerFull = inf.bossTimerSec;
      state.bossSlayerTimer = inf.bossTimerSec;
    }
    if (window.TDUI) TDUI.refresh();
  }

  function onWaveEnd() {
    state.waveIdx++;
    state.wavesCleared++;
    state.totalWavesCleared++;
    checkLiveEvents();

    var waves = getCurrentWaves();
    var stageComplete = !waves || state.waveIdx >= waves.length;

    if (stageComplete && phase !== 'infinity') {
      phase = 'stageclear';
      if (state.stageIdx >= TD_CONFIG.STAGES.length - 1) {
        addToast('🏆 All Stages Cleared! Infinity Mode Unlocked!', '#f39c12', 4000);
        setTimeout(function () {
          phase = 'infinity';
          state.infinityWave = 0;
          if (window.TDUI) TDUI.showInfinityModal();
        }, 2000);
      } else {
        addToast('⭐ Stage ' + (state.stageIdx + 1) + ' Complete!', '#f1c40f', 3000);
        setTimeout(function () {
          phase = 'prep';
          if (window.TDUI) TDUI.showStageClearModal(state.stageIdx);
        }, 2000);
      }
    } else {
      phase = 'levelup';
      if (window.TDUI) TDUI.showPassiveModal();
    }
  }

  function checkLiveEvents() {
    var ev = TD_CONFIG.LIVE_EVENTS;

    // Blessing every N waves
    if (state.wavesCleared % ev.blessingEveryNWaves === 0) {
      state.capacity += ev.blessingCapacityBonus;
      addToast('🌟 Blessing! +' + ev.blessingCapacityBonus + ' capacity restored', '#f1c40f', 2500);
    }
    // Perfect wave
    if (state.waveKills > 0) {
      var wave = phase === 'infinity' ? null : (getCurrentWaves() ? getCurrentWaves()[state.waveIdx - 1] : null);
      var hadPerfect = state.mobsReached === 0 || (wave && state.waveKills > 0);
    }
    // Bounty
    if (state.waveKills >= ev.bountyKillTarget) {
      state.capacity += ev.bountyCapacityBonus;
      addToast('💰 Bounty Hunt! +' + ev.bountyCapacityBonus + ' capacity', '#f1c40f', 2000);
    }
    // Supply drop
    if (Math.random() < ev.supplyDropChance) {
      state.capacity += ev.supplyDropCapacityBonus;
      state.gold += ev.supplyDropGold;
      addToast('🎁 Supply Drop! +' + ev.supplyDropCapacityBonus + ' capacity +' + ev.supplyDropGold + 'g', '#27ae60', 2500);
    }
  }

  // ── Boss ─────────────────────────────────────────────────────────
  function onBossKilled() {
    var ev = TD_CONFIG.LIVE_EVENTS;
    var elapsed = state.bossTimerFull - state.bossTimeLeft;
    state.bossActive = false;
    if (state.bossTimeLeft > 0 && elapsed < state.bossTimerFull * ev.bossSlayerThresholdPct) {
      state.capacity += ev.bossSlayerCapacityBonus;
      state.gold += ev.bossSlayerGold;
      addToast('🛡️ Boss Slayer! +' + ev.bossSlayerCapacityBonus + ' capacity +' + ev.bossSlayerGold + 'g', '#f39c12', 3000);
    }
  }

  function onBossTimerExpired() {
    state.bossActive = false;
    var penalty = 5;
    state.mobsReached += penalty;
    addToast('⏰ Boss escaped! -' + penalty + ' capacity!', '#e74c3c', 3000);
    checkGameOver();
  }

  // ── Projectile firing ─────────────────────────────────────────────
  function fireTower(tower, target, dt) {
    var cfg = TD_CONFIG.TOWER;
    var lvlCfg = cfg.upgradeLevels[tower.level];
    var special = lvlCfg.special;
    var dmg = getTowerDamage(tower);
    var spd = cfg.projectileSpeed;
    var critRoll = Math.random() < (getPassiveAdd('crit') || 0);
    if (critRoll) dmg *= 2;

    var dx = target.x - tower.x;
    var dy = target.y - tower.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;

    // multishot passive
    var shots = 1 + (passiveStacks['multishot'] || 0);
    for (var s = 0; s < shots; s++) {
      var spreadAngle = (s - (shots - 1) / 2) * 0.15;
      var cos = Math.cos(spreadAngle), sin_ = Math.sin(spreadAngle);
      var vx = (dx / len * cos - dy / len * sin_) * spd;
      var vy = (dy / len * cos + dx / len * sin_) * spd;

      var isVoid = (special === 'void') && ((tower.voidCount || 0) % cfg.voidInterval === cfg.voidInterval - 1);

      projectiles.push({
        id: nextProjId++,
        x: tower.x, y: tower.y,
        vx: vx, vy: vy,
        dmg: dmg * (isVoid ? cfg.voidDamageMult : 1),
        pierce: (special === 'pierce' ? 1 : 0) + (passiveStacks['pierce'] || 0),
        pierced: 0,
        splash: passiveStacks['splash'] || 0,
        slowChance: passiveStacks['slowChance'] || 0,
        special: isVoid ? 'void' : special,
        arcChain: (special === 'arc' || special === 'void') ? (cfg.arcChainCount + (passiveStacks['chain'] || 0)) : 0,
        arcRadius: cfg.arcChainRadius,
        hitSet: {},
        towerId: tower.id,
        life: 2.0
      });
    }

    tower.voidCount = ((tower.voidCount || 0) + 1);
  }

  // ── Hit enemy ────────────────────────────────────────────────────
  function hitEnemy(proj, enemy) {
    if (proj.hitSet[enemy.id]) return false;
    proj.hitSet[enemy.id] = true;

    enemy.hp -= proj.dmg;

    // slow
    if (proj.slowChance > 0 && Math.random() < proj.slowChance) {
      enemy.slowed = 2.0;
      enemy.slowFactor = 0.5;
    }

    // freeze passive
    if (passiveStacks['freeze'] && enemy.hp <= 0) {
      var fr = 60;
      enemies.forEach(function (e) {
        if (dist(e, enemy) < fr && !e.isBoss) {
          e.frozen = 1.5;
        }
      });
    }

    spawnParticle(enemy.x, enemy.y, tokenColor('particle_hit'), 6, 0.3);

    if (enemy.hp <= 0) {
      killEnemy(enemy, proj);
      return 'killed';
    }
    return true;
  }

  function killEnemy(enemy, proj) {
    var goldMult = 1 + (passiveStacks['gold'] || 0);
    var earned = Math.round(enemy.reward * goldMult);
    state.gold += earned;
    state.goldEarned += earned;
    state.kills++;
    state.waveKills++;
    spawnParticle(enemy.x, enemy.y, tokenColor('particle_gold'), 12, 0.6);
    if (enemy.isBoss) onBossKilled();
    enemies = enemies.filter(function (e) { return e.id !== enemy.id; });
  }

  // ── Arc chain ─────────────────────────────────────────────────────
  function doArcChain(proj, sourceEnemy) {
    if (!proj.arcChain || proj.arcChain <= 0) return;
    var chainRange = proj.arcRadius;
    var targets = enemies
      .filter(function (e) { return !proj.hitSet[e.id] && dist(e, sourceEnemy) < chainRange; })
      .sort(function (a, b) { return dist(a, sourceEnemy) - dist(b, sourceEnemy); })
      .slice(0, proj.arcChain);

    targets.forEach(function (t) {
      var dmg = proj.dmg * 0.6;
      t.hp -= dmg;
      spawnParticle(t.x, t.y, tokenColor('proj_chain'), 8, 0.4);
      proj.hitSet[t.id] = true;
      if (t.hp <= 0) killEnemy(t, proj);
    });
  }

  // ── Void AoE ─────────────────────────────────────────────────────
  function doVoidAoe(proj, x, y) {
    var r = TD_CONFIG.TOWER.voidSplashRadius + (proj.splash || 0);
    enemies.forEach(function (e) {
      if (proj.hitSet[e.id]) return;
      if (dist({x: x, y: y}, e) < r) {
        proj.hitSet[e.id] = true;
        e.hp -= proj.dmg * 0.5;
        e.slowed = TD_CONFIG.TOWER.voidSlowDur;
        e.slowFactor = 0.4;
        spawnParticle(e.x, e.y, tokenColor('proj_void'), 10, 0.5);
        if (e.hp <= 0) killEnemy(e, proj);
      }
    });
    // visual ring
    particles.push({ type: 'ring', x: x, y: y, r: 0, maxR: r, life: 0.5, maxLife: 0.5, color: tokenColor('proj_void_aoe') });
  }

  // ── Particles ────────────────────────────────────────────────────
  function spawnParticle(x, y, color, count, life) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 30 + Math.random() * 60;
      particles.push({
        type: 'dot', x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: life, maxLife: life, color: color, r: 2 + Math.random() * 2
      });
    }
  }

  // ── Toasts ───────────────────────────────────────────────────────
  function addToast(text, color, dur) {
    toasts.push({ text: text, color: color || '#fff', life: (dur || 2000) / 1000, maxLife: (dur || 2000) / 1000, y: 0 });
  }

  // ── Game over ────────────────────────────────────────────────────
  function checkGameOver() {
    if (state.mobsReached >= state.capacity) {
      phase = 'gameover';
      if (window.TDUI) TDUI.showGameOver();
    }
  }

  // ── Main update loop ─────────────────────────────────────────────
  function update(dt) {
    if (phase !== 'wave' && phase !== 'infinity') return;

    // Boss timer
    if (state.bossActive) {
      state.bossTimeLeft -= dt;
      var bossAlive = enemies.some(function (e) { return e.isBoss; });
      if (!bossAlive && state.bossActive) {
        state.bossActive = false;
      }
      if (state.bossTimeLeft <= 0 && state.bossActive) {
        state.bossTimeLeft = 0;
        onBossTimerExpired();
      }
    }

    // Spawn queue
    if (spawnQueue.length > 0) {
      spawnTimer += dt * 1000;
      while (spawnQueue.length > 0 && spawnTimer >= spawnQueue[0].delay) {
        var sq = spawnQueue.shift();
        spawnEnemy(sq.enemyType, sq.hpMult, sq.speedMult);
      }
    }

    // Enemies move
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.frozen > 0) { e.frozen -= dt; continue; }
      if (e.slowed > 0) { e.slowed -= dt; if (e.slowed <= 0) e.slowFactor = 1.0; }
      var ang = Math.atan2(BASE.y - e.y, BASE.x - e.x);
      var spd = e.speed * e.slowFactor;
      e.x += Math.cos(ang) * spd * dt;
      e.y += Math.sin(ang) * spd * dt;
      if (dist(e, BASE) < TD_CONFIG.BASE_RADIUS + e.size / 2) {
        state.mobsReached += e.damage;
        state.baseFlash = 0.4;
        enemies.splice(i, 1);
        checkGameOver();
      }
    }

    // Towers fire
    towers.forEach(function (tower) {
      tower.cd = (tower.cd || 0) - dt * 1000;
      if (tower.cd > 0) return;
      var range = getTowerRange(tower);
      var target = null, minDist = Infinity;
      enemies.forEach(function (e) {
        var d = dist(tower, e);
        if (d < range && d < minDist) { minDist = d; target = e; }
      });
      if (!target) return;
      fireTower(tower, target, dt);
      tower.cd = getTowerFireRate(tower);
    });

    // Projectiles move
    for (var j = projectiles.length - 1; j >= 0; j--) {
      var p = projectiles[j];
      p.life -= dt;
      if (p.life <= 0) { projectiles.splice(j, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Off canvas
      if (p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) {
        projectiles.splice(j, 1);
        continue;
      }
      var killed = false;
      for (var k = enemies.length - 1; k >= 0; k--) {
        var en = enemies[k];
        if (p.hitSet[en.id]) continue;
        if (dist(p, en) < en.size) {
          var res = hitEnemy(p, en);
          if (res === 'killed') {
            doArcChain(p, {x: p.x, y: p.y});
            if (p.special === 'void') doVoidAoe(p, p.x, p.y);
          }
          if (p.splash > 0) {
            enemies.forEach(function (se) {
              if (!p.hitSet[se.id] && dist(p, se) < p.splash) hitEnemy(p, se);
            });
          }
          p.pierced++;
          if (p.pierced > p.pierce) {
            projectiles.splice(j, 1);
            killed = true;
            break;
          }
        }
      }
    }

    // Particles
    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var pt = particles[pi];
      pt.life -= dt;
      if (pt.life <= 0) { particles.splice(pi, 1); continue; }
      if (pt.type === 'dot') {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
      } else if (pt.type === 'ring') {
        pt.r += (pt.maxR / pt.maxLife) * dt;
      }
    }

    // Toasts
    for (var ti = toasts.length - 1; ti >= 0; ti--) {
      toasts[ti].life -= dt;
      if (toasts[ti].life <= 0) toasts.splice(ti, 1);
    }

    if (state.baseFlash > 0) state.baseFlash -= dt;

    // Wave end: all enemies dead and spawn queue empty
    if (enemies.length === 0 && spawnQueue.length === 0 && phase === 'wave') {
      onWaveEnd();
    }
    if (enemies.length === 0 && spawnQueue.length === 0 && phase === 'infinity') {
      if (state.infinityWave > state.bestInfinity) state.bestInfinity = state.infinityWave;
      try { localStorage.setItem('td_best_infinity', state.bestInfinity); } catch(e) {}
      state.wavesCleared++;
      checkLiveEvents();
      phase = 'levelup';
      if (window.TDUI) TDUI.showPassiveModal();
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Background
    var bgKey = 'bg_dawn';
    if (phase === 'infinity') {
      bgKey = 'bg_infinity';
    } else if (TD_CONFIG.STAGES[state.stageIdx]) {
      bgKey = TD_CONFIG.STAGES[state.stageIdx].backgroundToken;
    }
    ctx.fillStyle = tokenColor(bgKey);
    ctx.fillRect(0, 0, W, H);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    // Spawn points
    spawnPoints.forEach(function (sp) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(231,76,60,0.3)';
      ctx.fill();
      ctx.strokeStyle = tokenColor('spawn_color');
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Tower range rings (hover / selected)
    towers.forEach(function (t) {
      if (t === hoveredTower || t === selectedTower) {
        var r = getTowerRange(t);
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fillStyle = t === selectedTower ? tokenColor('tower_selected') : tokenColor('tower_range_hover');
        ctx.fill();
        ctx.strokeStyle = tokenColor('tower_color');
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // Projectiles
    projectiles.forEach(function (p) {
      var col = p.special === 'void' ? tokenColor('proj_void') :
                (p.special === 'arc'  ? tokenColor('proj_arc') : tokenColor('proj_cannon'));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.special === 'void' ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      if (p.special === 'void') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    // Particles
    particles.forEach(function (pt) {
      var a = pt.life / pt.maxLife;
      ctx.globalAlpha = a;
      if (pt.type === 'dot') {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fillStyle = pt.color;
        ctx.fill();
      } else if (pt.type === 'ring') {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });

    // Enemies
    enemies.forEach(function (e) {
      var col = tokenColor(e.colorToken);
      // shadow for frozen
      if (e.frozen > 0) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(136,204,255,0.4)';
        ctx.fill();
      }
      // enemy circle
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fillStyle = col + '44';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = e.isBoss ? 3 : 2;
      ctx.stroke();
      // emoji
      ctx.font = e.size + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(tokenEmoji(e.spriteToken), e.x, e.y);
      // HP bar
      if (e.hp < e.maxHp) {
        var bw = e.size * 2;
        var bh = 4;
        var bx = e.x - bw / 2;
        var by = e.y - e.size - 8;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = e.isBoss ? '#e74c3c' : col;
        ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
      }
    });

    // Towers
    towers.forEach(function (t) {
      var isHovered = (t === hoveredTower);
      ctx.beginPath();
      ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgba(52,152,219,0.35)' : 'rgba(52,152,219,0.2)';
      ctx.fill();
      ctx.strokeStyle = tokenColor('tower_color');
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      ctx.stroke();
      ctx.font = '18px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getTowerEmoji(t.level), t.x, t.y);
    });

    // Base
    var baseR = TD_CONFIG.BASE_RADIUS;
    // Glow
    var gradient = ctx.createRadialGradient(BASE.x, BASE.y, 0, BASE.x, BASE.y, baseR * 2.5);
    var flashColor = state.baseFlash > 0 ? 'rgba(231,76,60,' + Math.min(state.baseFlash * 3, 0.6) + ')' : tokenColor('base_glow');
    gradient.addColorStop(0, flashColor);
    gradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(BASE.x, BASE.y, baseR * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    // Base circle
    ctx.beginPath();
    ctx.arc(BASE.x, BASE.y, baseR, 0, Math.PI * 2);
    ctx.fillStyle = state.baseFlash > 0 ? 'rgba(180,30,30,0.5)' : 'rgba(30,30,60,0.8)';
    ctx.fill();
    ctx.strokeStyle = tokenColor('base_color');
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tokenEmoji('base'), BASE.x, BASE.y);

    // HUD
    drawHUD();

    // Placing mode hint
    if (state.placingMode) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, H - 30, W, 30);
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Click to place tower (' + getTowerCost() + 'g) — Right-click to cancel', W / 2, H - 15);
    }

    // Toasts
    var ty = H / 2 - 60;
    toasts.forEach(function (toast) {
      var a = Math.min(toast.life / 0.5, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var tw2 = ctx.measureText(toast.text).width / 2 + 12;
      ctx.fillRect(W / 2 - tw2, ty - 14, tw2 * 2, 28);
      ctx.fillStyle = toast.color;
      ctx.fillText(toast.text, W / 2, ty);
      ctx.globalAlpha = 1;
      ty += 36;
    });

    // Title screen
    if (phase === 'title') drawTitleScreen();
    // Prep overlay
    if (phase === 'prep') drawPrepOverlay();
  }

  function drawHUD() {
    var pad = 10;
    var cfg = TD_CONFIG;

    // Left: capacity bar
    var capPct = 1 - state.mobsReached / state.capacity;
    var barW = 180, barH = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(pad, pad, barW + 80, barH + 4);
    ctx.fillStyle = '#333';
    ctx.fillRect(pad + 2, pad + 2, barW, barH);
    var hpColor = capPct > 0.5 ? '#27ae60' : (capPct > 0.25 ? '#f39c12' : '#e74c3c');
    ctx.fillStyle = hpColor;
    ctx.fillRect(pad + 2, pad + 2, barW * Math.max(0, capPct), barH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛡 ' + state.mobsReached + ' / ' + state.capacity, pad + barW + 6, pad + barH / 2 + 2);

    // Right: gold
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W - 130, pad, 120, 22);
    ctx.fillStyle = tokenColor('hud_gold');
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('💰 ' + state.gold + 'g', W - pad, pad + 11);

    // Stage / wave info
    var stageText = phase === 'infinity'
      ? 'Infinity Wave ' + state.infinityWave
      : 'Stage ' + (state.stageIdx + 1) + '/' + TD_CONFIG.STAGES.length + '  Wave ' + Math.min(state.waveIdx + 1, (getCurrentWaves() || []).length) + '/' + ((getCurrentWaves() || []).length);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(pad, pad + 28, 260, 20);
    ctx.fillStyle = tokenColor('hud_text');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(stageText, pad + 4, pad + 38);

    // Boss timer
    if (state.bossActive && state.bossTimeLeft > 0) {
      var bossAlive = enemies.some(function (e) { return e.isBoss; });
      if (bossAlive) {
        var tx = W / 2, ty2 = 40;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(tx - 80, ty2 - 14, 160, 28);
        var urgent = state.bossTimeLeft < 10;
        ctx.fillStyle = urgent ? '#e74c3c' : '#f39c12';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⏱ BOSS ' + Math.ceil(state.bossTimeLeft) + 's', tx, ty2);
      }
    }

    // Phase label
    if (phase === 'prep') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(W / 2 - 60, H - 38, 120, 28);
      ctx.fillStyle = '#27ae60';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶ Start Wave', W / 2, H - 24);
    }
  }

  function drawTitleScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('🏰 Tower Defense', W / 2, H / 2 - 60);
    ctx.fillStyle = '#aaa';
    ctx.font = '16px sans-serif';
    ctx.fillText('Click "Play Stage 1" in the Stages tab to begin', W / 2, H / 2);
    ctx.fillStyle = '#666';
    ctx.font = '13px sans-serif';
    ctx.fillText('Place towers · Defend the base · Survive all waves', W / 2, H / 2 + 30);
  }

  function drawPrepOverlay() {
    // Handled by HUD "▶ Start Wave" hint
  }

  // ── Input ─────────────────────────────────────────────────────────
  function onCanvasClick(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var cx = (e.clientX - rect.left) * scaleX;
    var cy = (e.clientY - rect.top) * scaleY;

    closeContextMenu();

    if (state.placingMode) {
      if (phase === 'prep' || phase === 'wave' || phase === 'infinity') {
        var placed = placeTower(cx, cy);
        if (placed) {
          if (window.TDUI) TDUI.refresh();
        }
      }
      return;
    }

    // Prep: click canvas center → start wave
    if (phase === 'prep') {
      if (dist({x: cx, y: cy}, BASE) < 80) {
        startWave();
        return;
      }
    }

    // Select tower
    selectedTower = null;
    for (var i = 0; i < towers.length; i++) {
      if (dist({x: cx, y: cy}, towers[i]) < 18) {
        selectedTower = towers[i];
        break;
      }
    }
    if (window.TDUI) TDUI.refresh();
  }

  function onCanvasRightClick(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var cx = (e.clientX - rect.left) * scaleX;
    var cy = (e.clientY - rect.top) * scaleY;

    if (state.placingMode) {
      state.placingMode = false;
      if (window.TDUI) TDUI.refresh();
      return;
    }

    for (var i = 0; i < towers.length; i++) {
      if (dist({x: cx, y: cy}, towers[i]) < 18) {
        showContextMenu(towers[i], e.clientX, e.clientY);
        return;
      }
    }
  }

  function onCanvasMouseMove(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var cx = (e.clientX - rect.left) * scaleX;
    var cy = (e.clientY - rect.top) * scaleY;
    hoveredTower = null;
    for (var i = 0; i < towers.length; i++) {
      if (dist({x: cx, y: cy}, towers[i]) < 18) {
        hoveredTower = towers[i];
        break;
      }
    }
  }

  function showContextMenu(tower, clientX, clientY) {
    closeContextMenu();
    var div = document.createElement('div');
    div.id = 'td-ctx-menu';
    div.style.cssText = 'position:fixed;z-index:9999;background:#12121a;border:1px solid #2a2a3a;border-radius:8px;padding:6px;min-width:140px;';
    div.style.left = clientX + 'px';
    div.style.top = clientY + 'px';

    var lvlCfg = TD_CONFIG.TOWER.upgradeLevels[tower.level];
    var info = document.createElement('div');
    info.style.cssText = 'color:#aaa;font-size:0.75rem;padding:3px 6px 6px;border-bottom:1px solid #2a2a3a;margin-bottom:4px;';
    info.textContent = 'Lv' + (tower.level + 1) + ' ' + lvlCfg.label;
    div.appendChild(info);

    if (tower.level < TD_CONFIG.TOWER.upgradeLevels.length - 1) {
      var nextCost = TD_CONFIG.TOWER.upgradeLevels[tower.level + 1].cost;
      var canUpgrade = state.gold >= nextCost;
      var upBtn = document.createElement('button');
      upBtn.textContent = '⬆ Upgrade (' + nextCost + 'g)';
      upBtn.disabled = !canUpgrade;
      upBtn.style.cssText = 'display:block;width:100%;background:rgba(52,152,219,0.15);border:1px solid #2980b9;border-radius:5px;color:#3498db;padding:5px 8px;cursor:pointer;font-size:0.8rem;margin-bottom:4px;text-align:left;';
      if (!canUpgrade) upBtn.style.opacity = '0.4';
      upBtn.addEventListener('click', function () { upgradeTower(tower.id); });
      div.appendChild(upBtn);
    }

    var sellRefund = Math.round(TD_CONFIG.TOWER.cost * TD_CONFIG.TOWER.sellRatio);
    var sellBtn = document.createElement('button');
    sellBtn.textContent = '💸 Sell (+' + sellRefund + 'g)';
    sellBtn.style.cssText = 'display:block;width:100%;background:rgba(231,76,60,0.1);border:1px solid #e74c3c44;border-radius:5px;color:#e74c3c;padding:5px 8px;cursor:pointer;font-size:0.8rem;text-align:left;';
    sellBtn.addEventListener('click', function () { sellTower(tower.id); });
    div.appendChild(sellBtn);

    document.body.appendChild(div);
    contextMenu = div;
    setTimeout(function () {
      document.addEventListener('click', closeContextMenuOnOutside, { once: true });
    }, 0);
  }

  function closeContextMenuOnOutside(e) {
    if (contextMenu && !contextMenu.contains(e.target)) closeContextMenu();
  }

  function closeContextMenu() {
    if (contextMenu) { contextMenu.remove(); contextMenu = null; }
  }

  // ── RAF loop ──────────────────────────────────────────────────────
  function loop(ts) {
    animId = requestAnimationFrame(loop);
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    update(dt);
    draw();
    if (window.TDUI && TDUI.updateAnalytics) TDUI.updateAnalytics();
  }

  // ── Public API ────────────────────────────────────────────────────
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
    BASE = { x: W / 2, y: H / 2 };
    computeSpawnPoints();

    // Load best infinity
    try { state.bestInfinity = parseInt(localStorage.getItem('td_best_infinity') || '0'); } catch(e) {}

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('contextmenu', onCanvasRightClick);
    canvas.addEventListener('mousemove', onCanvasMouseMove);

    lastTs = performance.now();
    animId = requestAnimationFrame(loop);
  }

  function startStage(idx) {
    state.stageIdx = idx;
    state.waveIdx = 0;
    state.mobsReached = 0;
    state.capacity = TD_CONFIG.BASE_CAPACITY;
    state.gold = TD_CONFIG.STARTING_GOLD;
    state.kills = 0;
    state.waveKills = 0;
    state.goldEarned = 0;
    state.wavesCleared = 0;
    state.bossActive = false;
    state.bossTimeLeft = 0;
    state.baseFlash = 0;
    state.chosenPassives = [];
    towers = [];
    enemies = [];
    projectiles = [];
    particles = [];
    toasts = [];
    spawnQueue = [];
    passiveStacks = {};
    computeSpawnPoints();
    phase = 'prep';
    if (window.TDUI) TDUI.refresh();
  }

  function startInfinity() {
    phase = 'infinity';
    state.infinityWave = 0;
    startWave();
    if (window.TDUI) TDUI.refresh();
  }

  function onConfigChange() {
    computeSpawnPoints();
    state.capacity = TD_CONFIG.BASE_CAPACITY;
  }

  function getState() {
    return {
      phase: phase,
      gold: state.gold,
      stageIdx: state.stageIdx,
      waveIdx: state.waveIdx,
      mobsReached: state.mobsReached,
      capacity: state.capacity,
      wavesCleared: state.wavesCleared,
      kills: state.kills,
      goldEarned: state.goldEarned,
      bestInfinity: state.bestInfinity,
      infinityWave: state.infinityWave,
      bossTimeLeft: state.bossTimeLeft,
      bossActive: state.bossActive,
      placingMode: state.placingMode,
      towers: towers,
      passiveStacks: passiveStacks,
      chosenPassives: state.chosenPassives
    };
  }

  function getStats() {
    return {
      kills: state.kills,
      goldEarned: state.goldEarned,
      wavesCleared: state.totalWavesCleared,
      mobsReached: state.mobsReached,
      bestInfinity: state.bestInfinity,
      towersPlaced: towers.length,
      passiveCount: state.chosenPassives.length
    };
  }

  function setPlacingMode(on) {
    state.placingMode = on;
  }

  function resumeFromPassive() {
    if (phase !== 'levelup') return;
    var waves = getCurrentWaves();
    var stageComplete = !waves || state.waveIdx >= waves.length;
    if (phase === 'infinity' || (stageComplete && state.stageIdx < TD_CONFIG.STAGES.length - 1)) {
      phase = 'prep';
    } else if (!stageComplete) {
      phase = 'prep';
    }
    if (window.TDUI) TDUI.refresh();
  }

  function advanceStage() {
    state.stageIdx++;
    state.waveIdx = 0;
    phase = 'prep';
    if (window.TDUI) TDUI.refresh();
  }

  return {
    init: init,
    startStage: startStage,
    startInfinity: startInfinity,
    startWave: startWave,
    placeTower: placeTower,
    sellTower: sellTower,
    upgradeTower: upgradeTower,
    applyPassive: applyPassive,
    onConfigChange: onConfigChange,
    getState: getState,
    getStats: getStats,
    setPlacingMode: setPlacingMode,
    resumeFromPassive: resumeFromPassive,
    advanceStage: advanceStage,
    addToast: addToast,
    getTowerCost: getTowerCost
  };
})();
