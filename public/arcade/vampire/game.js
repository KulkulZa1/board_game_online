// 뱀파이어 서바이버 — 아케이드 솔로 게임
(function () {
  'use strict';

  // ── 캔버스 설정 ─────────────────────────────────────────────────
  const canvas  = document.getElementById('c');
  const ctx     = canvas.getContext('2d');
  const wrapper = document.getElementById('gameWrapper');

  function resizeCanvas() {
    canvas.width  = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ── 게임 상수 ───────────────────────────────────────────────────
  const PLAYER_SPEED   = 160;  // px/s
  const BASE_HP        = 100;
  const XP_PER_LEVEL   = [0, 30, 60, 100, 150, 220, 300, 400, 520, 660, 820];
  const WAVE_INTERVAL  = 8;    // 초마다 적 추가 웨이브
  const MAX_ENEMIES    = 120;
  const SURVIVE_GOAL   = 600;  // 10분 생존 시 승리

  // 무기 정의
  const WEAPON_DEFS = {
    orb:    { name: '에너지 구', icon: '🔵', desc: '주위를 회전하며 공격', dmg: 15, cd: 0.8,  range: 80 },
    arrow:  { name: '화살',     icon: '🏹', desc: '가장 가까운 적 관통', dmg: 22, cd: 0.6,  range: 320 },
    nova:   { name: '폭발',     icon: '💥', desc: '범위 폭발 공격',       dmg: 40, cd: 2.5,  range: 100 },
    shield: { name: '방패',     icon: '🛡', desc: '주기적 피해 감소',     dmg: 0,  cd: 8,    range: 0 },
    laser:  { name: '레이저',   icon: '⚡', desc: '전방 레이저 빔',       dmg: 30, cd: 1.2,  range: 280 },
  };

  // 업그레이드 풀
  const UPGRADE_POOL = [
    { id: 'hp_up',     name: '❤ 체력 회복',    desc: '최대 체력 +20, 현재 체력 회복',  apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.hp + 30, p.maxHp); } },
    { id: 'spd_up',    name: '👟 이동 속도',    desc: '이동 속도 +15%',                  apply: (p) => { p.speed *= 1.15; } },
    { id: 'orb',       name: '🔵 에너지 구',    desc: '에너지 구 획득',                  weapon: 'orb' },
    { id: 'arrow',     name: '🏹 화살',          desc: '화살 획득',                       weapon: 'arrow' },
    { id: 'nova',      name: '💥 폭발',          desc: '범위 폭발 획득',                  weapon: 'nova' },
    { id: 'shield',    name: '🛡 방패',          desc: '방어막 획득 (피격 시 잠시 무적)', weapon: 'shield' },
    { id: 'laser',     name: '⚡ 레이저',        desc: '레이저 빔 획득',                  weapon: 'laser' },
    { id: 'dmg_up',    name: '⚔ 공격력',        desc: '모든 무기 데미지 +20%',           apply: (p) => { p.dmgMult *= 1.2; } },
    { id: 'cd_up',     name: '⏩ 쿨다운 감소',  desc: '모든 무기 쿨다운 -15%',          apply: (p) => { p.cdMult  *= 0.85; } },
    { id: 'magnet',    name: '🧲 경험치 자석',  desc: 'XP 획득 반경 2배',               apply: (p) => { p.xpRange *= 2; } },
  ];

  // ── 게임 상태 ───────────────────────────────────────────────────
  let state = 'idle'; // idle | playing | levelup | dead | win
  let player = null;
  let enemies = [];
  let projectiles = [];
  let xpGems = [];
  let particles = [];
  let elapsed = 0;
  let kills = 0;
  let waveTimer = 0;
  let frameId;
  let camera = { x: 0, y: 0 };
  let selectedStageIdx = 0;

  const SANDBOX_CONFIG = window.VS_CONFIG || null;
  const ENEMY_COLORS = {
    zombie: '#e74c3c',
    skeleton: '#9b59b6',
    bat: '#2ecc71',
    ghost: '#95a5a6',
    demon: '#e67e22',
    elite: '#c0392b',
    boss: '#f1c40f'
  };

  function sandboxStage() {
    if (!SANDBOX_CONFIG || !Array.isArray(SANDBOX_CONFIG.STAGES) || !SANDBOX_CONFIG.STAGES.length) return null;
    selectedStageIdx = Math.max(0, Math.min(selectedStageIdx, SANDBOX_CONFIG.STAGES.length - 1));
    return SANDBOX_CONFIG.STAGES[selectedStageIdx];
  }

  function sandboxEnemy(typeKey) {
    return SANDBOX_CONFIG && SANDBOX_CONFIG.ENEMY_TYPES && SANDBOX_CONFIG.ENEMY_TYPES[typeKey];
  }

  function sandboxSkill(id) {
    const skills = SANDBOX_CONFIG && SANDBOX_CONFIG.SKILLS;
    return Array.isArray(skills) ? skills.find(skill => skill.id === id) : null;
  }

  function syncSandboxWeaponStats() {
    Object.keys(WEAPON_DEFS).forEach((id) => {
      const skill = sandboxSkill(id);
      if (!skill || !skill.perLevel) return;
      if (Array.isArray(skill.perLevel.damage)) {
        WEAPON_DEFS[id].dmg = Number(skill.perLevel.damage[0]) || WEAPON_DEFS[id].dmg;
      }
      if (Array.isArray(skill.perLevel.cooldownMs)) {
        WEAPON_DEFS[id].cd = (Number(skill.perLevel.cooldownMs[0]) || WEAPON_DEFS[id].cd * 1000) / 1000;
      }
    });
  }

  function getSurviveGoal() {
    const stage = sandboxStage();
    return stage && stage.durationSeconds ? stage.durationSeconds : SURVIVE_GOAL;
  }

  function renderStageSelect() {
    const wrap = document.getElementById('stageSelectWrap');
    const select = document.getElementById('stageSelect');
    if (!wrap || !select || !SANDBOX_CONFIG || !Array.isArray(SANDBOX_CONFIG.STAGES)) return;
    if (SANDBOX_CONFIG.STAGES.length <= 1) {
      wrap.style.display = 'none';
      return;
    }
    select.textContent = '';
    SANDBOX_CONFIG.STAGES.forEach((stage, idx) => {
      const name = stage && stage.name ? stage.name : `Stage ${idx + 1}`;
      const option = document.createElement('option');
      option.value = String(idx);
      option.textContent = name;
      select.appendChild(option);
    });
    select.value = String(selectedStageIdx);
    wrap.style.display = 'block';
  }

  function initGame() {
    syncSandboxWeaponStats();
    player = {
      x: 0, y: 0,
      hp: BASE_HP, maxHp: BASE_HP,
      speed: PLAYER_SPEED,
      level: 1, xp: 0,
      weapons: [],       // 보유 무기 id 목록
      weaponCDs: {},     // 무기별 쿨다운 잔여 시간
      dmgMult: 1,
      cdMult:  1,
      xpRange: 80,
      invincible: 0,     // 무적 시간(초)
      shieldTimer: 0,
    };
    enemies    = [];
    projectiles= [];
    xpGems     = [];
    particles  = [];
    elapsed    = 0;
    kills      = 0;
    waveTimer  = 0;
    camera     = { x: 0, y: 0 };

    // 시작 무기
    addWeapon('orb');
    addWeapon('arrow');
    spawnWave();
    updateHUD();
  }

  function addWeapon(id) {
    if (player.weapons.includes(id)) return;
    player.weapons.push(id);
    player.weaponCDs[id] = 0;
    renderWeaponSlots();
  }

  // ── 입력 ────────────────────────────────────────────────────────
  const keys = {};
  document.addEventListener('keydown', e => { keys[e.key] = true; });
  document.addEventListener('keyup',   e => { keys[e.key] = false; });

  // 조이스틱
  let joyActive = false, joyDx = 0, joyDy = 0;
  const joyZone  = document.getElementById('joystickZone');
  const joyBase  = document.getElementById('joystickBase');
  const joyKnob  = document.getElementById('joystickKnob');
  const JOY_R    = 30;

  function joyPos(e) {
    const t = e.touches[0];
    const r = joyBase.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    const dx = t.clientX - cx;
    const dy = t.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, JOY_R);
    const angle = Math.atan2(dy, dx);
    joyDx = Math.cos(angle) * (clamp / JOY_R);
    joyDy = Math.sin(angle) * (clamp / JOY_R);
    joyKnob.style.transform = `translate(${Math.cos(angle)*clamp}px, ${Math.sin(angle)*clamp}px)`;
  }

  joyZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joyActive = true;
    joyPos(e);
  }, { passive: false });

  joyZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (joyActive) joyPos(e);
  }, { passive: false });

  joyZone.addEventListener('touchend', (e) => {
    e.preventDefault();
    joyActive = false;
    joyDx = joyDy = 0;
    joyKnob.style.transform = '';
  }, { passive: false });

  function getMoveDir() {
    let dx = 0, dy = 0;
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) dy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) dy += 1;
    if (joyActive) { dx += joyDx; dy += joyDy; }
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  // ── 적 생성 ─────────────────────────────────────────────────────
  function spawnWave() {
    const stage = sandboxStage();
    if (stage && Array.isArray(stage.waveSchedule) && stage.waveSchedule.length) {
      const active = stage.waveSchedule.filter(wave => elapsed >= (Number(wave.atSecond) || 0));
      const wave = active.length ? active[active.length - 1] : stage.waveSchedule[0];
      const count = Math.min(Number(wave.count) || 1, 20);
      for (let i = 0; i < count; i++) {
        if (enemies.length >= MAX_ENEMIES) break;
        spawnSandboxEnemy(wave.enemyType || 'zombie');
      }
      return;
    }

    const difficulty = 1 + elapsed / 120;
    const count = Math.min(5 + Math.floor(elapsed / 20), 20);
    for (let i = 0; i < count; i++) {
      if (enemies.length >= MAX_ENEMIES) break;
      const angle = Math.random() * Math.PI * 2;
      const dist  = 350 + Math.random() * 150;
      const tier  = elapsed < 60 ? 0 : elapsed < 180 ? (Math.random() < 0.3 ? 1 : 0) : (Math.random() < 0.15 ? 2 : Math.random() < 0.35 ? 1 : 0);
      enemies.push({
        x: player.x + Math.cos(angle) * dist,
        y: player.y + Math.sin(angle) * dist,
        hp:    [30, 80, 250][tier] * difficulty,
        maxHp: [30, 80, 250][tier] * difficulty,
        speed: [75, 55, 35][tier] + Math.random() * 20,
        size:  [10, 15, 22][tier],
        color: ['#e74c3c', '#9b59b6', '#c0392b'][tier],
        xpVal: [3, 8, 20][tier],
        tier,
        hurtFlash: 0,
      });
    }
  }

  function spawnSandboxEnemy(typeKey) {
    const def = sandboxEnemy(typeKey) || sandboxEnemy('zombie');
    if (!def) return;
    const angle = Math.random() * Math.PI * 2;
    const distFromPlayer = 350 + Math.random() * 150;
    const difficulty = 1 + elapsed / 120;
    const isBoss = def.isBoss || typeKey === 'boss' || def.behavior === 'boss_chase';
    const tier = isBoss ? 2 : (def.hp > 100 ? 1 : 0);
    const hp = (Number(def.hp) || [30, 80, 250][tier]) * difficulty;
    enemies.push({
      x: player.x + Math.cos(angle) * distFromPlayer,
      y: player.y + Math.sin(angle) * distFromPlayer,
      hp,
      maxHp: hp,
      speed: Number(def.speed) || [75, 55, 35][tier],
      size: Math.max(8, (Number(def.size) || [20, 30, 44][tier]) / 2),
      color: ENEMY_COLORS[typeKey] || ENEMY_COLORS.zombie,
      xpVal: Number(def.xpValue) || [3, 8, 20][tier],
      tier,
      hurtFlash: 0,
    });
  }

  // ── 투사체 발사 ─────────────────────────────────────────────────
  function fireWeapon(id, dt) {
    if (player.weaponCDs[id] === undefined) return;
    player.weaponCDs[id] -= dt;
    if (player.weaponCDs[id] > 0) return;

    const def = WEAPON_DEFS[id];
    const cd  = def.cd * player.cdMult;
    const dmg = def.dmg * player.dmgMult;
    player.weaponCDs[id] = cd;

    if (id === 'orb') {
      const orbCount = 3;
      for (let i = 0; i < orbCount; i++) {
        const baseAngle = (elapsed * 1.8) + (i / orbCount) * Math.PI * 2;
        projectiles.push({ type: 'orb', x: player.x, y: player.y, angle: baseAngle, speed: 0, r: 8, dmg, life: cd + 0.05, orbIdx: i, orbTotal: orbCount });
      }
    } else if (id === 'arrow') {
      const target = nearestEnemy();
      if (!target) return;
      const ang = Math.atan2(target.y - player.y, target.x - player.x);
      projectiles.push({ type: 'arrow', x: player.x, y: player.y, vx: Math.cos(ang) * 400, vy: Math.sin(ang) * 400, r: 5, dmg, life: def.range / 400, pierce: 3 });
    } else if (id === 'nova') {
      spawnExplosion(player.x, player.y, def.range, dmg);
    } else if (id === 'shield') {
      player.invincible = Math.max(player.invincible, 1.5);
      spawnParticle(player.x, player.y, '#3498db', 24, 0.8);
    } else if (id === 'laser') {
      const target = nearestEnemy();
      const ang = target ? Math.atan2(target.y - player.y, target.x - player.x) : 0;
      projectiles.push({ type: 'laser', x: player.x, y: player.y, angle: ang, r: 6, dmg, life: 0.35, length: def.range });
    }
  }

  function nearestEnemy() {
    let best = null, bd = Infinity;
    for (const e of enemies) {
      const d = dist(player, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function spawnExplosion(x, y, range, dmg) {
    for (let i = 0; i < 12; i++) spawnParticle(x, y, '#e74c3c', 6 + Math.random() * 8, 0.5 + Math.random() * 0.4);
    for (const e of enemies) {
      if (dist({ x, y }, e) < range) dealDamage(e, dmg);
    }
    projectiles.push({ type: 'explosion', x, y, r: 0, maxR: range, life: 0.4, dmg: 0 });
  }

  function spawnParticle(x, y, color, size, life) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 40 + Math.random() * 80;
    particles.push({ x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, color, size, maxLife: life, life });
  }

  // ── 데미지 처리 ─────────────────────────────────────────────────
  function dealDamage(enemy, dmg) {
    enemy.hp -= dmg;
    enemy.hurtFlash = 0.12;
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    kills++;
    for (let i = 0; i < 3; i++) spawnParticle(enemy.x, enemy.y, enemy.color, 4, 0.35);
    xpGems.push({ x: enemy.x, y: enemy.y, val: enemy.xpVal });
    enemies.splice(enemies.indexOf(enemy), 1);
    document.getElementById('killDisp').textContent = kills;
  }

  // ── XP / 레벨업 ─────────────────────────────────────────────────
  function gainXP(val) {
    player.xp += val;
    const needed = xpNeeded(player.level);
    if (player.xp >= needed) {
      player.xp -= needed;
      player.level++;
      showLevelUp();
    }
  }

  function xpNeeded(lv) {
    return XP_PER_LEVEL[Math.min(lv, XP_PER_LEVEL.length - 1)] || (lv * 100);
  }

  function showLevelUp() {
    state = 'levelup';
    document.getElementById('lvDisp').textContent = player.level;
    const pool  = UPGRADE_POOL.filter(u => !u.weapon || !player.weapons.includes(u.weapon));
    const picks = shuffled(pool).slice(0, 3);
    const list  = document.getElementById('upgradeList');
    list.innerHTML = '';
    for (const u of picks) {
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn';
      btn.innerHTML = `<div class="upgrade-name">${u.name}</div><div class="upgrade-desc">${u.desc}</div>`;
      btn.onclick = () => {
        if (u.weapon) addWeapon(u.weapon);
        else if (u.apply) u.apply(player);
        document.getElementById('levelOverlay').style.display = 'none';
        state = 'playing';
        updateHUD();
      };
      list.appendChild(btn);
    }
    document.getElementById('levelOverlay').style.display = 'flex';
  }

  // ── HUD 업데이트 ────────────────────────────────────────────────
  function updateHUD() {
    const hpPct = player.hp / player.maxHp * 100;
    document.getElementById('hpFill').style.width  = hpPct + '%';
    document.getElementById('hpText').textContent   = `${Math.ceil(player.hp)}/${player.maxHp}`;
    const xpPct = player.xp / xpNeeded(player.level) * 100;
    document.getElementById('xpFill').style.width  = xpPct + '%';
    document.getElementById('xpLabel').textContent  = `Lv.${player.level}`;
    document.getElementById('xpText').textContent   = `${Math.floor(player.xp)}/${xpNeeded(player.level)}`;
  }

  function renderWeaponSlots() {
    const el = document.getElementById('weaponSlots');
    el.innerHTML = player.weapons.map(id => {
      const d = WEAPON_DEFS[id];
      return `<span class="weapon-slot">${d.icon} ${d.name}</span>`;
    }).join('');
  }

  // ── 메인 루프 ───────────────────────────────────────────────────
  let lastTime = 0;

  function loop(ts) {
    frameId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    if (state !== 'playing') {
      render(dt);
      return;
    }

    elapsed += dt;
    document.getElementById('timeDisp').textContent = fmtTime(elapsed);

    if (elapsed >= getSurviveGoal()) { endGame('win'); return; }

    update(dt);
    render(dt);
    updateHUD();
  }

  function update(dt) {
    // 이동
    const { dx, dy } = getMoveDir();
    player.x += dx * player.speed * dt;
    player.y += dy * player.speed * dt;

    // 카메라
    camera.x = player.x - canvas.width  / 2;
    camera.y = player.y - canvas.height / 2;

    // 무적 감소
    if (player.invincible > 0) player.invincible -= dt;

    // 웨이브 생성
    waveTimer += dt;
    if (waveTimer >= WAVE_INTERVAL) { waveTimer = 0; spawnWave(); }

    // 무기 발사
    for (const id of player.weapons) fireWeapon(id, dt);

    // 투사체 업데이트
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { projectiles.splice(i, 1); continue; }

      if (p.type === 'orb') {
        const baseAngle = (elapsed * 1.8) + (p.orbIdx / p.orbTotal) * Math.PI * 2;
        const R = WEAPON_DEFS.orb.range;
        p.x = player.x + Math.cos(baseAngle) * R;
        p.y = player.y + Math.sin(baseAngle) * R;
        for (const e of enemies) {
          if (dist(p, e) < p.r + e.size) dealDamage(e, p.dmg * dt * 3);
        }
      } else if (p.type === 'arrow') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (dist(p, e) < p.r + e.size) {
            dealDamage(e, p.dmg);
            p.pierce--;
            if (p.pierce <= 0) { projectiles.splice(i, 1); break; }
          }
        }
      } else if (p.type === 'laser') {
        const ex = p.x + Math.cos(p.angle) * p.length;
        const ey = p.y + Math.sin(p.angle) * p.length;
        for (const e of enemies) {
          if (distToSegment(e, p, { x: ex, y: ey }) < e.size + 4) {
            dealDamage(e, p.dmg * dt * 5);
          }
        }
      } else if (p.type === 'explosion') {
        p.r = p.maxR * (1 - p.life / 0.4);
      }
    }

    // 적 이동 + 플레이어 충돌
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.hurtFlash > 0) e.hurtFlash -= dt;
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      e.x += Math.cos(ang) * e.speed * dt;
      e.y += Math.sin(ang) * e.speed * dt;

      if (player.invincible <= 0 && dist(e, player) < e.size + 12) {
        const dmg = [8, 16, 35][e.tier] * dt;
        player.hp -= dmg;
        player.invincible = 0.15;
        if (player.hp <= 0) { endGame('dead'); return; }
      }
    }

    // XP 수집
    for (let i = xpGems.length - 1; i >= 0; i--) {
      const g = xpGems[i];
      if (dist(g, player) < player.xpRange) {
        gainXP(g.val);
        xpGems.splice(i, 1);
      }
    }

    // 파티클
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
  }

  // ── 렌더링 ──────────────────────────────────────────────────────
  function render() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // 배경 그리드
    ctx.save();
    ctx.translate(-camera.x % 60, -camera.y % 60);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = -60; x < W + 60; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, -60); ctx.lineTo(x, H + 60); ctx.stroke();
    }
    for (let y = -60; y < H + 60; y += 60) {
      ctx.beginPath(); ctx.moveTo(-60, y); ctx.lineTo(W + 60, y); ctx.stroke();
    }
    ctx.restore();

    if (!player) return;

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // XP 젬
    for (const g of xpGems) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f39c12';
      ctx.fill();
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 파티클
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 투사체
    for (const p of projectiles) {
      if (p.type === 'orb') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = '#3498db';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#3498db';
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (p.type === 'arrow') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(-12, -2, 24, 4);
        ctx.restore();
      } else if (p.type === 'laser') {
        const ex = p.x + Math.cos(p.angle) * p.length;
        const ey = p.y + Math.sin(p.angle) * p.length;
        const alpha = p.life / 0.35;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else if (p.type === 'explosion') {
        const alpha = p.life / 0.4;
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // 적
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const flash = e.hurtFlash > 0;
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      ctx.shadowBlur = flash ? 20 : 8;
      ctx.shadowColor = e.color;

      // 적 모양: tier별
      if (e.tier === 2) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          i === 0 ? ctx.moveTo(Math.cos(a)*e.size, Math.sin(a)*e.size)
                  : ctx.lineTo(Math.cos(a)*e.size, Math.sin(a)*e.size);
        }
        ctx.closePath();
      } else if (e.tier === 1) {
        ctx.beginPath();
        ctx.rect(-e.size, -e.size, e.size*2, e.size*2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, e.size, 0, Math.PI*2);
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // HP 바
      const bw = e.size * 2.2, bh = 3;
      ctx.fillStyle = '#333';
      ctx.fillRect(-bw/2, -e.size - 7, bw, bh);
      ctx.fillStyle = e.color;
      ctx.fillRect(-bw/2, -e.size - 7, bw * (e.hp/e.maxHp), bh);
      ctx.restore();
    }

    // 플레이어
    ctx.save();
    ctx.translate(player.x, player.y);
    const inv = player.invincible > 0;
    ctx.globalAlpha = inv ? 0.5 + Math.sin(elapsed * 30) * 0.3 : 1;
    ctx.shadowBlur  = 18;
    ctx.shadowColor = '#8e44ad';
    ctx.fillStyle   = '#d7a3f5';
    ctx.beginPath();
    // 별 모양 플레이어
    for (let i = 0; i < 5; i++) {
      const a1 = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
      i === 0 ? ctx.moveTo(Math.cos(a1)*14, Math.sin(a1)*14)
              : ctx.lineTo(Math.cos(a1)*14, Math.sin(a1)*14);
      ctx.lineTo(Math.cos(a2)*7, Math.sin(a2)*7);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.restore(); // camera

    // 무적 중 화면 가장자리 효과
    if (player.invincible > 0.3) {
      ctx.strokeStyle = 'rgba(142,68,173,0.3)';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, W, H);
    }
  }

  // ── 게임 종료 ───────────────────────────────────────────────────
  function endGame(result) {
    state = result;
    cancelAnimationFrame(frameId);
    const icon  = document.getElementById('overlayIcon');
    const msg   = document.getElementById('overlayMsg');
    const sub   = document.getElementById('overlaySub');
    const btn   = document.getElementById('startBtn');
    const ov    = document.getElementById('overlay');

    if (result === 'win') {
      icon.textContent = '🏆';
      msg.textContent  = '10분 생존 성공! 승리!';
    } else {
      icon.textContent = '💀';
      msg.textContent  = '게임 오버';
    }
    sub.textContent = `Lv.${player.level}  ·  ${fmtTime(elapsed)}  ·  ${kills}마리 처치`;
    btn.textContent = '다시하기';
    ov.classList.add('visible');

    if (window.AdMobHelper) AdMobHelper.showAfterGame();
  }

  // ── 유틸 ────────────────────────────────────────────────────────
  function dist(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }

  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx*dx + dy*dy;
    if (lenSq === 0) return dist(p, a);
    let t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return dist(p, { x: a.x + t*dx, y: a.y + t*dy });
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  }

  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── 버튼 연결 ───────────────────────────────────────────────────
  document.getElementById('startBtn').addEventListener('click', () => {
    const select = document.getElementById('stageSelect');
    if (select) selectedStageIdx = parseInt(select.value, 10) || 0;
    if (frameId) cancelAnimationFrame(frameId);
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('levelOverlay').style.display = 'none';
    initGame();
    state = 'playing';
    lastTime = performance.now();
    frameId = requestAnimationFrame(loop);
  });

  // 첫 프레임 시작
  renderStageSelect();
  frameId = requestAnimationFrame(loop);
})();
