'use strict';
// game.js — window.VSGame  (canvas loop, ECS-lite, collision)
// Reads VS_CONFIG every frame — never caches config values.
// All colors/emoji via tokenColor() / tokenEmoji() from graphics/theme.js

window.VSGame = (function () {

  // ── Canvas / context ────────────────────────────────────────────────────
  var canvas, ctx;
  var W = 800, H = 600;

  // ── Game state ───────────────────────────────────────────────────────────
  var state = 'title';   // title | playing | paused | levelup | dead | win
  var stageIdx = 0;
  var elapsed = 0;       // seconds since stage start
  var waveTimers = {};   // waveIdx → ms since last spawn
  var animId = null;
  var lastTs = 0;

  // ── Entities ─────────────────────────────────────────────────────────────
  var player = null;
  var enemies = [];
  var projectiles = [];
  var particles = [];
  var groundItems = [];
  var nextEnemyId = 1;
  var analyticsData = { kills: 0, dmgDealt: 0, dmgTaken: 0, xpCollected: 0,
                        levelUps: 0, peakEnemies: 0, wavesCompleted: 0 };

  // ── Input ────────────────────────────────────────────────────────────────
  var keys = {};

  // ── Analytics overlay ────────────────────────────────────────────────────
  var showAnalytics = false;

  // ── Pending level-up choices ──────────────────────────────────────────────
  var levelUpChoices = [];

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────────

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('keydown', function (e) { keys[e.key] = true; });
    window.addEventListener('keyup',   function (e) { keys[e.key] = false; });
    drawTitle();
  }

  function startStage(idx) {
    stageIdx = idx || 0;
    resetState();
    state = 'playing';
    lastTs = 0;
    animId = requestAnimationFrame(loop);
  }

  function pause() {
    if (state === 'playing') {
      state = 'paused';
      cancelAnimationFrame(animId);
      animId = null;
      drawPauseOverlay();
    }
  }

  function resume() {
    if (state === 'paused') {
      state = 'playing';
      lastTs = 0;
      animId = requestAnimationFrame(loop);
    }
  }

  function spawnEnemy(typeKey) {
    var def = VS_CONFIG.ENEMY_TYPES[typeKey];
    if (!def) return;
    spawnEnemyFromDef(typeKey, def);
  }

  function forceKillAll() {
    enemies = [];
  }

  function setAnalyticsOverlay(on) {
    showAnalytics = on;
  }

  function getState() { return state; }

  function getPlayer() { return player; }

  function getAnalytics() { return analyticsData; }

  function onConfigChange() {
    // Re-read character stats if on title, otherwise let game loop pick up changes naturally
    if (state === 'playing' && player) {
      var charDef = getActiveCharDef();
      if (charDef) {
        player.maxHp = charDef.baseStats.hp;
        if (player.hp > player.maxHp) player.hp = player.maxHp;
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // INTERNAL — RESET
  // ────────────────────────────────────────────────────────────────────────

  function resetState() {
    enemies = [];
    projectiles = [];
    particles = [];
    groundItems = [];
    waveTimers = {};
    nextEnemyId = 1;
    elapsed = 0;
    analyticsData = { kills: 0, dmgDealt: 0, dmgTaken: 0, xpCollected: 0,
                      levelUps: 0, peakEnemies: 0, wavesCompleted: 0 };

    var charDef = getActiveCharDef();
    var baseHp  = charDef ? charDef.baseStats.hp    : 100;
    var baseSp  = charDef ? charDef.baseStats.speed : 120;

    player = {
      x: W / 2, y: H / 2,
      hp: baseHp, maxHp: baseHp,
      level: 1, xp: 0,
      weapons: ['orb'],
      weaponCDs: { orb: 0 },
      speed: baseSp,
      dmgMult: 1,
      cdMult:  1,
      xpRange: charDef ? charDef.baseStats.magnet * 30 + 60 : 80,
      revivals: charDef ? charDef.baseStats.revivals : 0,
      appliedPassives: [],
      appliedSkills: {}
    };
    levelUpChoices = [];
  }

  function getActiveCharDef() {
    var chars = VS_CONFIG.CHARACTER_DEFS;
    if (!chars || !chars.length) return null;
    return chars[0];
  }

  // ────────────────────────────────────────────────────────────────────────
  // MAIN LOOP
  // ────────────────────────────────────────────────────────────────────────

  function loop(ts) {
    if (state !== 'playing') return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05); // clamp to 50ms
    lastTs = ts;

    elapsed += dt;

    update(dt);
    draw();

    animId = requestAnimationFrame(loop);
  }

  // ────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ────────────────────────────────────────────────────────────────────────

  function update(dt) {
    var stage = VS_CONFIG.STAGES[stageIdx];
    if (!stage) return;

    movePlayer(dt);
    spawnWaves(dt, stage);
    updateEnemies(dt);
    fireWeapons(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updateGroundItems();
    checkPlayerEnemyCollision();

    if (enemies.length > analyticsData.peakEnemies)
      analyticsData.peakEnemies = enemies.length;

    // Check stage end
    if (elapsed >= stage.durationSeconds) {
      state = 'win';
      cancelAnimationFrame(animId);
      animId = null;
      if (window.VSUI && VSUI.onGameEnd) VSUI.onGameEnd('win');
    }

    // Check player death
    if (player.hp <= 0) {
      if (player.revivals > 0) {
        player.revivals--;
        player.hp = Math.floor(player.maxHp * 0.3);
        spawnParticle(player.x, player.y, tokenColor('particle_hit'), 20);
      } else {
        state = 'dead';
        cancelAnimationFrame(animId);
        animId = null;
        if (window.VSUI && VSUI.onGameEnd) VSUI.onGameEnd('dead');
      }
    }
  }

  // ── Player movement ──────────────────────────────────────────────────────

  function movePlayer(dt) {
    var dx = 0, dy = 0;
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) dy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) dy += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    var spd = player.speed;
    player.x = clamp(player.x + dx * spd * dt, 16, W - 16);
    player.y = clamp(player.y + dy * spd * dt, 16, H - 16);

    // Trail particle occasionally
    if (Math.random() < 0.15) {
      spawnParticle(player.x + (Math.random() - 0.5) * 8,
                    player.y + (Math.random() - 0.5) * 8,
                    tokenColor('player_trail'), 3 + Math.random() * 4, 0.4);
    }
  }

  // ── Wave spawning ────────────────────────────────────────────────────────

  function spawnWaves(dt, stage) {
    var schedule = stage.waveSchedule || [];
    schedule.forEach(function (wave, idx) {
      if (elapsed < wave.atSecond) return;

      if (!waveTimers[idx]) waveTimers[idx] = 0;
      waveTimers[idx] += dt * 1000;

      var interval = wave.intervalMs || 2000;
      if (waveTimers[idx] >= interval) {
        waveTimers[idx] = 0;
        for (var i = 0; i < (wave.count || 1); i++) {
          spawnEnemyAtEdge(wave.enemyType);
        }
      }
    });

    // Boss pins
    var bossAt = stage.bossAt || [];
    bossAt.forEach(function (sec) {
      var key = 'boss_' + sec;
      if (elapsed >= sec && elapsed < sec + dt + 0.1 && !waveTimers[key]) {
        waveTimers[key] = true;
        spawnEnemyAtEdge('boss');
      }
    });
  }

  function spawnEnemyAtEdge(typeKey) {
    var def = VS_CONFIG.ENEMY_TYPES[typeKey];
    if (!def) def = VS_CONFIG.ENEMY_TYPES['zombie'];
    if (!def) return;

    var side = Math.floor(Math.random() * 4);
    var x, y;
    var pad = 20;
    if (side === 0) { x = Math.random() * W; y = -pad; }
    else if (side === 1) { x = W + pad; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = H + pad; }
    else { x = -pad; y = Math.random() * H; }

    spawnEnemyFromDef(typeKey, def, x, y);
  }

  function spawnEnemyFromDef(typeKey, def, x, y) {
    if (x === undefined) x = Math.random() < 0.5 ? -20 : W + 20;
    if (y === undefined) y = Math.random() * H;

    enemies.push({
      id: nextEnemyId++,
      x: x, y: y,
      hp: def.hp, maxHp: def.hp,
      def: def,        // live reference — panel edits propagate automatically
      typeKey: typeKey,
      angle: 0,
      hitFlash: 0,
      shootCd: 0,
      dead: false
    });
  }

  // ── Enemy movement & behavior ────────────────────────────────────────────

  function updateEnemies(dt) {
    enemies.forEach(function (e) {
      var def = e.def;
      var spd = def.speed || 60;
      var behavior = def.behavior || 'chase';

      if (behavior === 'chase' || behavior === 'boss_chase') {
        var dx = player.x - e.x;
        var dy = player.y - e.y;
        var d = Math.hypot(dx, dy);
        if (d > 0) {
          e.x += (dx / d) * spd * dt;
          e.y += (dy / d) * spd * dt;
        }
      } else if (behavior === 'circle') {
        e.angle = (e.angle || 0) + dt * 1.5;
        var dx2 = player.x - e.x;
        var dy2 = player.y - e.y;
        var d2 = Math.hypot(dx2, dy2);
        var targetDist = 120;
        if (d2 > targetDist + 10) {
          e.x += (dx2 / d2) * spd * dt;
          e.y += (dy2 / d2) * spd * dt;
        } else if (d2 < targetDist - 10) {
          e.x -= (dx2 / d2) * spd * dt;
          e.y -= (dy2 / d2) * spd * dt;
        }
        e.x += Math.cos(e.angle) * 30 * dt;
        e.y += Math.sin(e.angle) * 30 * dt;
      } else if (behavior === 'shooter') {
        // Move to medium range then shoot
        var dx3 = player.x - e.x;
        var dy3 = player.y - e.y;
        var d3 = Math.hypot(dx3, dy3);
        if (d3 > 200) {
          e.x += (dx3 / d3) * spd * dt;
          e.y += (dy3 / d3) * spd * dt;
        }
        e.shootCd = (e.shootCd || 0) + dt;
        if (e.shootCd >= 2) {
          e.shootCd = 0;
          // Fire a projectile toward player
          var nx = dx3 / (d3 || 1), ny = dy3 / (d3 || 1);
          projectiles.push({ x: e.x, y: e.y, vx: nx * 140, vy: ny * 140,
            dmg: def.damage || 5, color: tokenColor('proj_nova'),
            size: 5, life: 2, fromEnemy: true });
        }
      }

      if (e.hitFlash > 0) e.hitFlash -= dt * 6;
    });
  }

  // ── Weapon firing ─────────────────────────────────────────────────────────

  function fireWeapons(dt) {
    player.weapons.forEach(function (skillId) {
      var skill = getSkillDef(skillId);
      if (!skill) return;

      var lv = (player.appliedSkills[skillId] || 1) - 1;
      var cd = (skill.perLevel.cooldownMs[lv] || 1500) / 1000 * player.cdMult;

      if (!player.weaponCDs[skillId]) player.weaponCDs[skillId] = cd; // start pre-charged
      player.weaponCDs[skillId] -= dt;

      if (player.weaponCDs[skillId] <= 0) {
        player.weaponCDs[skillId] = cd;
        fireSkill(skillId, skill, lv);
      }
    });
  }

  function getSkillDef(id) {
    var skills = VS_CONFIG.SKILLS || [];
    for (var i = 0; i < skills.length; i++) {
      if (skills[i].id === id) return skills[i];
    }
    return null;
  }

  function fireSkill(id, skill, lv) {
    var dmg   = (skill.perLevel.damage[lv]      || 10) * player.dmgMult;
    var count = skill.perLevel.projectiles[lv]  || 1;
    var pierce = skill.perLevel.pierce[lv]       || 0;

    // Find nearest enemy for targeting
    var target = nearestEnemy();

    if (id === 'orb') {
      // Orbiting projectile — spawn at offset
      for (var i = 0; i < count; i++) {
        var angle = (Math.PI * 2 / count) * i;
        projectiles.push({
          x: player.x + Math.cos(angle) * 40,
          y: player.y + Math.sin(angle) * 40,
          orbitAngle: angle, orbitRadius: 55, orbitSpeed: 2.5,
          orbits: true, dmg: dmg, color: tokenColor('proj_orb'),
          size: 8, life: 999, pierce: pierce, hits: new Set()
        });
      }
    } else if (id === 'nova') {
      // Radial burst
      for (var j = 0; j < Math.max(count, 8); j++) {
        var a2 = (Math.PI * 2 / Math.max(count, 8)) * j;
        projectiles.push({
          x: player.x, y: player.y,
          vx: Math.cos(a2) * 180, vy: Math.sin(a2) * 180,
          dmg: dmg, color: tokenColor('proj_nova'),
          size: 6, life: 0.6, pierce: pierce, hits: new Set()
        });
      }
    } else if (id === 'laser') {
      // Instant beam toward nearest enemy
      if (target) {
        var ddx = target.x - player.x, ddy = target.y - player.y;
        var dd = Math.hypot(ddx, ddy) || 1;
        projectiles.push({
          x: player.x, y: player.y,
          vx: (ddx / dd) * 500, vy: (ddy / dd) * 500,
          dmg: dmg, color: tokenColor('proj_laser'),
          size: 4, life: 0.25, pierce: 999, hits: new Set()
        });
      }
    } else if (id === 'aura') {
      // Expand ring
      projectiles.push({
        x: player.x, y: player.y, vx: 0, vy: 0,
        aura: true, auraRadius: 0, auraMaxRadius: 80,
        dmg: dmg, color: tokenColor('proj_aura'),
        size: 80, life: 0.5, pierce: 999, hits: new Set()
      });
    } else {
      // Default: aimed at nearest enemy
      var tx = target ? target.x : player.x + 1;
      var ty = target ? target.y : player.y;
      for (var k = 0; k < count; k++) {
        var dx4 = tx - player.x, dy4 = ty - player.y;
        var d4 = Math.hypot(dx4, dy4) || 1;
        var spread = (k - (count - 1) / 2) * 0.18;
        var projColor = tokenColor('proj_' + id) || tokenColor('proj_arrow');
        projectiles.push({
          x: player.x, y: player.y,
          vx: (Math.cos(Math.atan2(dy4, dx4) + spread)) * 260,
          vy: (Math.sin(Math.atan2(dy4, dx4) + spread)) * 260,
          dmg: dmg, color: projColor,
          size: 5, life: 1.4, pierce: pierce, hits: new Set()
        });
      }
    }
  }

  // ── Projectile update ────────────────────────────────────────────────────

  function updateProjectiles(dt) {
    var toRemove = [];
    projectiles.forEach(function (p, pi) {
      p.life -= dt;
      if (p.life <= 0) { toRemove.push(pi); return; }

      if (p.orbits) {
        p.orbitAngle += p.orbitSpeed * dt;
        p.x = player.x + Math.cos(p.orbitAngle) * p.orbitRadius;
        p.y = player.y + Math.sin(p.orbitAngle) * p.orbitRadius;
      } else if (p.aura) {
        p.auraRadius += (p.auraMaxRadius / 0.5) * dt;
        p.x = player.x; p.y = player.y;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) {
          toRemove.push(pi); return;
        }
      }

      // Hit enemies
      var hitRadius = p.aura ? p.auraRadius : p.size;
      enemies.forEach(function (e, ei) {
        if (e.dead || p.hits.has(e.id)) return;
        var hitR = (e.def.size || 14) / 2 + hitRadius;
        if (dist(p, e) < hitR) {
          var dmg = p.dmg;
          // Crit check
          var crit = VS_CONFIG.PROBABILITY && VS_CONFIG.PROBABILITY.critChanceBase || 0.05;
          if (Math.random() < crit) {
            var mult = VS_CONFIG.PROBABILITY.critMultiplierBase || 1.5;
            dmg = Math.floor(dmg * mult);
            spawnParticle(e.x, e.y - 16, '#ffff00', 0, 0.6, '⚡');
          }
          e.hp -= dmg;
          e.hitFlash = 1;
          analyticsData.dmgDealt += dmg;
          spawnParticle(e.x + (Math.random()-0.5)*10, e.y + (Math.random()-0.5)*10,
                        tokenColor('particle_hit'), 4, 0.3);

          p.hits.add(e.id);
          var pierceLeft = (p.pierce || 0);
          if (p.hits.size > pierceLeft + 1) { toRemove.push(pi); }

          if (e.hp <= 0) killEnemy(e, ei);
        }
      });
    });

    // Remove dead projectiles in reverse order
    toRemove.sort(function (a, b) { return b - a; });
    var seen = new Set();
    toRemove.forEach(function (i) {
      if (!seen.has(i)) { seen.add(i); projectiles.splice(i, 1); }
    });

  }

  // ── Kill enemy ───────────────────────────────────────────────────────────

  function killEnemy(e, idx) {
    if (e.dead) return;
    e.dead = true;
    analyticsData.kills++;

    // Drop XP gem
    var xpVal = e.def.xpValue || 1;
    groundItems.push({ x: e.x, y: e.y, type: 'xp', value: xpVal, age: 0 });

    // Drop particles
    var col = tokenColor(e.def.colorToken || 'enemy_zombie_color');
    for (var i = 0; i < 5; i++) {
      spawnParticle(e.x + (Math.random()-0.5)*16,
                    e.y + (Math.random()-0.5)*16,
                    col, 4 + Math.random()*4, 0.5);
    }

    // Drop gold/heart based on enemy type config
    var drops = VS_CONFIG.PROBABILITY && VS_CONFIG.PROBABILITY.enemyDrops;
    if (drops) {
      var dropCfg = e.def.isBoss ? drops.boss : (e.def.behavior === 'boss_chase' ? drops.boss : drops.normal);
      if (dropCfg) {
        if (Math.random() < (dropCfg.gold || 0.4))
          groundItems.push({ x: e.x + (Math.random()-0.5)*20, y: e.y, type: 'gold', value: 1, age: 0 });
        if (Math.random() < (dropCfg.heart || 0.05))
          groundItems.push({ x: e.x, y: e.y + 10, type: 'heart', value: 10, age: 0 });
      }
    }

    if (idx >= 0 && enemies[idx] && enemies[idx].id === e.id) {
      enemies.splice(idx, 1);
    } else {
      enemies = enemies.filter(function (enemy) { return enemy.id !== e.id; });
    }
  }

  // ── Ground items / XP pickup ─────────────────────────────────────────────

  function updateGroundItems() {
    var toRemove = [];
    groundItems.forEach(function (item, i) {
      item.age += 0.016;
      if (item.age > 20) { toRemove.push(i); return; }

      // Magnet toward player if within range
      var d = dist(player, item);
      if (d < player.xpRange) {
        var speed = 200;
        var dx = player.x - item.x, dy = player.y - item.y;
        var dd = Math.hypot(dx, dy) || 1;
        item.x += (dx / dd) * speed * 0.016;
        item.y += (dy / dd) * speed * 0.016;
      }

      if (d < 14) {
        if (item.type === 'xp') {
          player.xp += item.value;
          analyticsData.xpCollected += item.value;
          spawnParticle(item.x, item.y, tokenColor('particle_xp'), 3, 0.25);
          checkLevelUp();
        } else if (item.type === 'heart') {
          player.hp = Math.min(player.hp + item.value, player.maxHp);
        }
        toRemove.push(i);
      }
    });

    toRemove.sort(function (a, b) { return b - a; });
    var seen2 = new Set();
    toRemove.forEach(function (i) { if (!seen2.has(i)) { seen2.add(i); groundItems.splice(i, 1); } });
  }

  // ── Level up ─────────────────────────────────────────────────────────────

  function checkLevelUp() {
    var curve = VS_CONFIG.XP_CURVE || [];
    var needed = curve[Math.min(player.level - 1, curve.length - 1)] || (player.level * 50);
    if (player.xp >= needed) {
      player.xp -= needed;
      player.level++;
      analyticsData.levelUps++;

      levelUpChoices = buildLevelUpChoices();
      state = 'levelup';
      cancelAnimationFrame(animId);
      animId = null;

      if (window.VSUI && VSUI.showLevelUpModal) {
        VSUI.showLevelUpModal(levelUpChoices, applyLevelUpChoice);
      }
    }
  }

  function buildLevelUpChoices() {
    var pool = VS_CONFIG.PROBABILITY && VS_CONFIG.PROBABILITY.levelUpPool || { common:60, uncommon:28, rare:10, legendary:2 };
    var skills = VS_CONFIG.SKILLS || [];
    var passives = VS_CONFIG.PASSIVES || [];
    var allOptions = skills.concat(passives);

    // Weight by rarity
    var weighted = [];
    allOptions.forEach(function (s) {
      var w = pool[s.rarity] || pool.common || 30;
      for (var i = 0; i < w; i++) weighted.push(s);
    });

    var count = VS_CONFIG.PROBABILITY && VS_CONFIG.PROBABILITY.offerCount || 3;
    var chosen = [];
    var seen = new Set();
    var tries = 0;
    while (chosen.length < count && weighted.length > 0 && tries < 200) {
      tries++;
      var pick = weighted[Math.floor(Math.random() * weighted.length)];
      if (!seen.has(pick.id)) {
        seen.add(pick.id);
        chosen.push(pick);
      }
    }
    return chosen;
  }

  function applyLevelUpChoice(skillId) {
    var skill = getSkillDef(skillId);
    if (skill) {
      if (!player.appliedSkills[skillId]) player.appliedSkills[skillId] = 0;
      player.appliedSkills[skillId]++;
      if (!player.weapons.includes(skillId)) {
        player.weapons.push(skillId);
        player.weaponCDs[skillId] = 0;
      }
      player.dmgMult *= 1.05; // slight global buff per pick
    }

    state = 'playing';
    lastTs = 0;
    animId = requestAnimationFrame(loop);
  }

  // ── Player–enemy collision ────────────────────────────────────────────────

  function checkPlayerEnemyCollision() {
    enemies.forEach(function (e) {
      var hitR = (e.def.size || 14) / 2 + 12;
      if (dist(player, e) < hitR) {
        var dmg = e.def.damage || 5;
        player.hp -= dmg * 0.016 * 60; // per-frame damage (normalised to 60fps)
        analyticsData.dmgTaken += dmg * 0.016 * 60;
        if (player.hp < 0) player.hp = 0;
      }
    });
  }

  // ── Particles ────────────────────────────────────────────────────────────

  function spawnParticle(x, y, color, size, life, emoji) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60 - 20,
      color: color, size: size || 4,
      life: life || 0.5, maxLife: life || 0.5,
      emoji: emoji || null
    });
  }

  function updateParticles(dt) {
    particles = particles.filter(function (p) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt; // gravity
      p.life -= dt;
      return p.life > 0;
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // DRAW
  // ────────────────────────────────────────────────────────────────────────

  function draw() {
    var stage = VS_CONFIG.STAGES[stageIdx] || {};

    // Background
    ctx.fillStyle = tokenColor(stage.backgroundToken || 'bg_forest');
    ctx.fillRect(0, 0, W, H);

    // Subtle grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    var gridSz = 40;
    for (var gx = 0; gx < W; gx += gridSz) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += gridSz) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    drawGroundItems();
    drawProjectiles();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawHUD(stage);

    if (showAnalytics) drawAnalyticsOverlay();
  }

  function drawGroundItems() {
    groundItems.forEach(function (item) {
      if (item.type === 'xp') {
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = Math.max(0.3, 1 - item.age / 20);
        ctx.fillText(tokenEmoji('icon_xp_gem'), item.x, item.y);
        ctx.globalAlpha = 1;
      } else if (item.type === 'heart') {
        ctx.font = '13px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tokenEmoji('icon_heart'), item.x, item.y);
      }
    });
  }

  function drawProjectiles() {
    projectiles.forEach(function (p) {
      if (p.aura) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.auraRadius, 0, Math.PI * 2);
        ctx.strokeStyle = tokenColor('proj_aura');
        ctx.lineWidth = 3;
        ctx.globalAlpha = p.life * 2;
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    });
  }

  function drawEnemies() {
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    enemies.forEach(function (e) {
      ctx.save();
      if (e.hitFlash > 0) {
        ctx.globalAlpha = 0.5 + 0.5 * e.hitFlash;
      }
      ctx.fillText(tokenEmoji(e.def.spriteToken || 'enemy_zombie'), e.x, e.y);

      // HP bar
      if (e.hp < e.maxHp) {
        var bw = (e.def.size || 22);
        var bx = e.x - bw / 2;
        var by = e.y - (e.def.size || 22) / 2 - 6;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = tokenColor(e.def.colorToken || 'enemy_zombie_color');
        ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 3);
      }
      ctx.restore();
    });
  }

  function drawPlayer() {
    ctx.save();
    ctx.font = '26px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Damage flash on low hp
    if (player.hp < player.maxHp * 0.25) {
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 150);
    }

    ctx.fillText(tokenEmoji('player'), player.x, player.y);
    ctx.restore();

    // XP range indicator (subtle)
    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.xpRange, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(function (p) {
      var alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.emoji) {
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, p.x, p.y);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * alpha), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawHUD(stage) {
    var hudText  = tokenColor('hud_text');
    var hudTimer = tokenColor('hud_timer');

    // HP bar
    var hpPct = Math.max(0, player.hp / player.maxHp);
    var hpW = 160;
    ctx.fillStyle = tokenColor('hud_hp_bg');
    ctx.fillRect(10, 10, hpW, 10);
    ctx.fillStyle = tokenColor('hud_hp');
    ctx.fillRect(10, 10, hpW * hpPct, 10);
    ctx.fillStyle = hudText;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(Math.ceil(player.hp) + '/' + player.maxHp + ' HP', 12, 23);

    // XP bar
    var curve = VS_CONFIG.XP_CURVE || [];
    var needed = curve[Math.min(player.level - 1, curve.length - 1)] || (player.level * 50);
    var xpPct = Math.min(1, player.xp / needed);
    ctx.fillStyle = tokenColor('hud_xp_bg');
    ctx.fillRect(10, 36, hpW, 6);
    ctx.fillStyle = tokenColor('hud_xp');
    ctx.fillRect(10, 36, hpW * xpPct, 6);
    ctx.fillStyle = hudText;
    ctx.fillText('Lv.' + player.level + '  ' + player.xp + '/' + needed + ' XP', 12, 45);

    // Timer
    var timeLeft = Math.max(0, (stage.durationSeconds || 300) - elapsed);
    var mm = Math.floor(timeLeft / 60), ss = Math.floor(timeLeft % 60);
    ctx.fillStyle = hudTimer;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText((mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss, W / 2, 10);

    // Kill count
    ctx.fillStyle = hudText;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('Kills: ' + analyticsData.kills, W - 10, 10);
    ctx.fillText('Enemies: ' + enemies.length, W - 10, 24);

    // Weapon icons
    var iconX = 10;
    var iconY = H - 30;
    ctx.font = '18px serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    player.weapons.forEach(function (wid) {
      var skill = getSkillDef(wid);
      if (!skill) return;
      var icon = tokenEmoji(skill.icon || 'icon_orb');
      // CD shade
      var cd = player.weaponCDs[wid] || 0;
      var maxCd = skill.perLevel.cooldownMs[0] / 1000 || 1;
      if (cd > 0) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#000';
        ctx.fillRect(iconX - 2, iconY - 12, 22, 22);
        ctx.globalAlpha = 1;
      }
      ctx.fillText(icon, iconX, iconY);
      iconX += 28;
    });
  }

  function drawAnalyticsOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(W - 170, 60, 160, 120);
    ctx.fillStyle = '#adf';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var lines = [
      'ANALYTICS',
      'Kills:    ' + analyticsData.kills,
      'DmgOut:   ' + Math.floor(analyticsData.dmgDealt),
      'DmgIn:    ' + Math.floor(analyticsData.dmgTaken),
      'XP:       ' + analyticsData.xpCollected,
      'Lvl-ups:  ' + analyticsData.levelUps,
      'PeakEnemy:' + analyticsData.peakEnemies,
    ];
    lines.forEach(function (l, i) {
      ctx.fillText(l, W - 165, 65 + i * 15);
    });
    ctx.restore();
  }

  function drawTitle() {
    ctx.fillStyle = '#0a0014';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d7a3f5';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧛 Vampire Survivors Sandbox', W / 2, H / 2 - 30);
    ctx.fillStyle = '#888';
    ctx.font = '16px sans-serif';
    ctx.fillText('Click "Play Stage" in the Stages tab to begin', W / 2, H / 2 + 20);
    ctx.fillText('WASD / Arrow keys to move', W / 2, H / 2 + 46);
  }

  function drawPauseOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⏸  PAUSED', W / 2, H / 2);
    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────────────

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function nearestEnemy() {
    var best = null, bestD = Infinity;
    enemies.forEach(function (e) {
      var d = dist(player, e);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  function resizeCanvas() {
    var wrap = canvas.parentElement;
    if (!wrap) return;
    var ww = wrap.clientWidth || 800;
    var wh = wrap.clientHeight || 600;
    // Keep 4:3ish aspect, fit inside wrap
    var scale = Math.min(ww / W, wh / H);
    canvas.style.width  = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
  }

  // ────────────────────────────────────────────────────────────────────────
  return {
    init: init,
    startStage: startStage,
    pause: pause,
    resume: resume,
    spawnEnemy: spawnEnemy,
    forceKillAll: forceKillAll,
    setAnalyticsOverlay: setAnalyticsOverlay,
    onConfigChange: onConfigChange,
    getState: getState,
    getPlayer: getPlayer,
    getAnalytics: getAnalytics
  };
})();
