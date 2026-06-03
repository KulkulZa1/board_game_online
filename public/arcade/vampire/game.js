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

  // 무기 강화 한계
  const MAX_WEAPON_LEVEL = 5;   // 같은 무기를 다시 고르면 레벨업 (최대 5)
  const MAX_WEAPONS      = 6;   // 보유 가능한 무기 슬롯 수

  // 무기 정의 (기본 무기 + 진화 무기)
  const WEAPON_DEFS = {
    orb:    { name: '에너지 구', icon: '🔵', desc: '주위를 회전하며 공격', dmg: 15, cd: 0.8,  range: 80 },
    arrow:  { name: '화살',     icon: '🏹', desc: '가장 가까운 적 관통', dmg: 22, cd: 0.6,  range: 320 },
    nova:   { name: '폭발',     icon: '💥', desc: '범위 폭발 공격',       dmg: 40, cd: 2.5,  range: 100 },
    shield: { name: '방패',     icon: '🛡', desc: '주기적 피해 감소',     dmg: 0,  cd: 8,    range: 0 },
    laser:  { name: '레이저',   icon: '⚡', desc: '전방 레이저 빔',       dmg: 30, cd: 1.2,  range: 280 },
    // ── 진화 무기 (evolved) — 기본 무기 최대레벨 + 필요 패시브로 진화 ──
    blackhole: { name: '블랙홀',    icon: '🌀', desc: '적을 끌어당기는 거대 궤도', dmg: 28, cd: 0.7,  range: 120, evolved: true },
    stormbow:  { name: '폭풍의 활', icon: '🌩', desc: '5연발 강화 관통 화살',     dmg: 30, cd: 0.45, range: 360, evolved: true },
    supernova: { name: '슈퍼노바',  icon: '☀', desc: '연쇄 대폭발',              dmg: 70, cd: 2.0,  range: 150, evolved: true },
    deathray:  { name: '데스레이',  icon: '☠', desc: '관통 즉사 광선',           dmg: 60, cd: 1.0,  range: 360, evolved: true },
    aegis:     { name: '이지스',    icon: '🛡', desc: '반사 보호막',              dmg: 30, cd: 6,    range: 140, evolved: true },
  };

  // 진화 규칙: base 무기가 최대 레벨 + req 패시브 보유 시 evolved(id) 무기로 진화
  const EVOLUTION_DEFS = [
    { id: 'blackhole', base: 'orb',    req: 'magnet', reqName: '🧲 경험치 자석' },
    { id: 'stormbow',  base: 'arrow',  req: 'cd_up',  reqName: '⏩ 쿨다운 감소' },
    { id: 'supernova', base: 'nova',   req: 'dmg_up', reqName: '⚔ 공격력' },
    { id: 'deathray',  base: 'laser',  req: 'spd_up', reqName: '👟 이동 속도' },
    { id: 'aegis',     base: 'shield', req: 'hp_up',  reqName: '❤ 체력 회복' },
  ];

  // 패시브(능력치) 업그레이드 — 진화 재료로도 사용됨
  const PASSIVE_POOL = [
    { id: 'hp_up',  name: '❤ 체력 회복',   desc: '최대 체력 +20, 체력 회복',  apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.hp + 30, p.maxHp); } },
    { id: 'spd_up', name: '👟 이동 속도',   desc: '이동 속도 +12%',            apply: (p) => { p.speed *= 1.12; } },
    { id: 'dmg_up', name: '⚔ 공격력',      desc: '모든 무기 데미지 +18%',     apply: (p) => { p.dmgMult *= 1.18; } },
    { id: 'cd_up',  name: '⏩ 쿨다운 감소', desc: '모든 무기 쿨다운 -12%',     apply: (p) => { p.cdMult  *= 0.88; } },
    { id: 'magnet', name: '🧲 경험치 자석', desc: 'XP 획득 반경 +60%',         apply: (p) => { p.xpRange *= 1.6; } },
  ];

  // 신규 획득 가능한 기본 무기 목록
  const WEAPON_POOL = ['orb', 'arrow', 'nova', 'shield', 'laser'];

  // ── 게임 상태 ───────────────────────────────────────────────────
  let state = 'idle'; // idle | playing | levelup | dead | win
  let player, enemies, projectiles, xpGems, particles, chainExplosions;
  let elapsed, kills, waveTimer, frameId;
  let camera;

  function initGame() {
    player = {
      x: 0, y: 0,
      hp: BASE_HP, maxHp: BASE_HP,
      speed: PLAYER_SPEED,
      level: 1, xp: 0,
      weapons: [],       // 보유 무기 id 목록
      weaponLevels: {},  // 무기별 레벨 (1~MAX_WEAPON_LEVEL)
      weaponCDs: {},     // 무기별 쿨다운 잔여 시간
      passives: {},      // 보유 패시브 id → 스택 수 (진화 조건 판정)
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
    chainExplosions = [];
    elapsed    = 0;
    kills      = 0;
    waveTimer  = 0;
    camera     = { x: 0, y: 0 };

    // 시작 무기
    addWeapon('orb');
    spawnWave();
    updateHUD();
  }

  function addWeapon(id) {
    if (player.weapons.includes(id)) {
      // 이미 보유 → 레벨업 (최대 레벨까지)
      if ((player.weaponLevels[id] || 1) < MAX_WEAPON_LEVEL) player.weaponLevels[id]++;
      renderWeaponSlots();
      return;
    }
    player.weapons.push(id);
    player.weaponLevels[id] = 1;
    player.weaponCDs[id] = 0;
    renderWeaponSlots();
  }

  // 진화: 기본 무기를 진화 무기로 교체 (최대 레벨 상태 유지)
  function evolveWeapon(evo) {
    const baseIdx = player.weapons.indexOf(evo.base);
    if (baseIdx === -1) return;
    player.weapons[baseIdx] = evo.id;
    player.weaponLevels[evo.id] = MAX_WEAPON_LEVEL;
    delete player.weaponLevels[evo.base];
    delete player.weaponCDs[evo.base];
    player.weaponCDs[evo.id] = 0;
    for (let i = 0; i < 30; i++) spawnParticle(player.x, player.y, '#f1c40f', 6 + Math.random() * 6, 0.9);
    renderWeaponSlots();
  }

  // 패시브 적용 + 보유 기록 (진화 조건 판정용)
  function applyPassive(pv) {
    pv.apply(player);
    player.passives[pv.id] = (player.passives[pv.id] || 0) + 1;
  }

  // 현재 진화 가능한 조합 목록
  function availableEvolutions() {
    return EVOLUTION_DEFS.filter(evo =>
      player.weapons.includes(evo.base) &&
      (player.weaponLevels[evo.base] || 1) >= MAX_WEAPON_LEVEL &&
      player.passives[evo.req] &&
      !player.weapons.includes(evo.id)
    );
  }

  // 이지스 진화 효과: 보호막 발동 시 주변 적에게 반사 피해
  function aegisReflect(dmg, range) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (dist(e, player) < range) dealDamage(e, dmg);
    }
    spawnParticle(player.x, player.y, '#5dade2', 30, 0.6);
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

  // ── 투사체 발사 ─────────────────────────────────────────────────
  function fireWeapon(id, dt) {
    if (player.weaponCDs[id] === undefined) return;   // 미보유 무기 무시
    player.weaponCDs[id] -= dt;
    if (player.weaponCDs[id] > 0) return;

    const def    = WEAPON_DEFS[id];
    const lvl    = player.weaponLevels[id] || 1;
    const lvlMul = 1 + 0.22 * (lvl - 1);              // 레벨당 데미지 +22%
    const cd     = def.cd * player.cdMult;
    const dmg    = def.dmg * player.dmgMult * lvlMul;
    player.weaponCDs[id] = cd;

    if (id === 'orb' || id === 'blackhole') {
      const evolved  = id === 'blackhole';
      const orbCount = (evolved ? 5 : 3) + Math.floor((lvl - 1) / 2); // 레벨업 시 궤도 추가
      const R = def.range;
      for (let i = 0; i < orbCount; i++) {
        const baseAngle = (elapsed * 1.8) + (i / orbCount) * Math.PI * 2;
        projectiles.push({ type: evolved ? 'blackhole' : 'orb', x: player.x, y: player.y, angle: baseAngle, r: evolved ? 12 : 8, dmg, life: cd + 0.05, orbIdx: i, orbTotal: orbCount, R });
      }
    } else if (id === 'arrow' || id === 'stormbow') {
      const evolved = id === 'stormbow';
      const shots   = evolved ? 5 : 1 + Math.floor((lvl - 1) / 2);
      const target  = nearestEnemy();
      if (!target) return;
      const baseAng = Math.atan2(target.y - player.y, target.x - player.x);
      for (let s = 0; s < shots; s++) {
        const spread = (s - (shots - 1) / 2) * 0.12;
        const ang = baseAng + spread;
        projectiles.push({ type: 'arrow', x: player.x, y: player.y, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420, r: 5, dmg, life: def.range / 420, pierce: (evolved ? 6 : 3) + lvl });
      }
    } else if (id === 'nova' || id === 'supernova') {
      spawnExplosion(player.x, player.y, def.range, dmg, id === 'supernova');
    } else if (id === 'shield' || id === 'aegis') {
      const dur = (id === 'aegis' ? 2.2 : 1.5) + 0.15 * (lvl - 1);
      player.invincible = Math.max(player.invincible, dur);
      if (id === 'aegis') aegisReflect(dmg, def.range);
      spawnParticle(player.x, player.y, '#3498db', 24, 0.8);
    } else if (id === 'laser' || id === 'deathray') {
      const evolved = id === 'deathray';
      const target  = nearestEnemy();
      const ang = target ? Math.atan2(target.y - player.y, target.x - player.x) : 0;
      projectiles.push({ type: evolved ? 'deathray' : 'laser', x: player.x, y: player.y, angle: ang, r: 6, dmg, life: 0.35, length: def.range });
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

  function spawnExplosion(x, y, range, dmg, evolved) {
    const col = evolved ? '#f1c40f' : '#e74c3c';
    for (let i = 0; i < 12; i++) spawnParticle(x, y, col, 6 + Math.random() * 8, 0.5 + Math.random() * 0.4);
    for (const e of enemies) {
      if (dist({ x, y }, e) < range) dealDamage(e, dmg);
    }
    projectiles.push({ type: 'explosion', x, y, r: 0, maxR: range, life: 0.4, dmg: 0, evolved });
    // 슈퍼노바: 주변에 연쇄 2차 폭발 큐 등록 (게임 루프에서 처리)
    if (evolved) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = range * 0.7;
        chainExplosions.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, range: range * 0.6, dmg: dmg * 0.6, delay: 0.09 + i * 0.07 });
      }
    }
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
    const picks = buildChoices();
    const list  = document.getElementById('upgradeList');
    list.innerHTML = '';
    for (const c of picks) {
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn' + (c.kind === 'evolve' ? ' evolution' : '');
      btn.innerHTML = `<div class="upgrade-name">${c.name}</div><div class="upgrade-desc">${c.desc}</div>`;
      btn.onclick = () => {
        c.choose();
        document.getElementById('levelOverlay').style.display = 'none';
        state = 'playing';
        updateHUD();
      };
      list.appendChild(btn);
    }
    document.getElementById('levelOverlay').style.display = 'flex';
  }

  // 레벨업 선택지 3개 구성: 진화(최우선) → 무기 레벨업 / 신규 무기 / 패시브
  function buildChoices() {
    // 1) 진화 가능 조합 (있으면 반드시 1개 포함)
    const evoChoices = availableEvolutions().map(evo => {
      const w = WEAPON_DEFS[evo.id];
      return {
        kind: 'evolve',
        name: `✨ 진화: ${w.icon} ${w.name}`,
        desc: `${WEAPON_DEFS[evo.base].name} + ${evo.reqName} → ${w.desc}`,
        choose: () => evolveWeapon(evo),
      };
    });

    // 2) 보유 무기 레벨업 (진화 무기는 제외)
    const levelable = [];
    for (const id of player.weapons) {
      const lvl = player.weaponLevels[id] || 1;
      if (lvl < MAX_WEAPON_LEVEL && !WEAPON_DEFS[id].evolved) {
        const w = WEAPON_DEFS[id];
        levelable.push({
          kind: 'weapon-lv',
          name: `${w.icon} ${w.name} Lv.${lvl}→${lvl + 1}`,
          desc: w.desc + ' 강화',
          choose: () => addWeapon(id),
        });
      }
    }

    // 3) 신규 무기 (슬롯 여유 시)
    const newWeapons = [];
    if (player.weapons.length < MAX_WEAPONS) {
      for (const id of WEAPON_POOL) {
        if (!player.weapons.includes(id)) {
          const w = WEAPON_DEFS[id];
          newWeapons.push({
            kind: 'weapon-new',
            name: `${w.icon} ${w.name} (신규)`,
            desc: w.desc,
            choose: () => addWeapon(id),
          });
        }
      }
    }

    // 4) 패시브 (항상 후보)
    const passives = PASSIVE_POOL.map(pv => ({
      kind: 'passive',
      name: pv.name,
      desc: pv.desc,
      choose: () => applyPassive(pv),
    }));

    const result = [];
    if (evoChoices.length) result.push(evoChoices[0]);   // 진화 1개 보장
    const rest = shuffled([...levelable, ...newWeapons, ...passives]);
    for (const c of rest) {
      if (result.length >= 3) break;
      result.push(c);
    }
    // 항상 3개 보장 (부족 시 첫 패시브로 채움)
    while (result.length < 3) {
      const pv = PASSIVE_POOL[0];
      result.push({ kind: 'passive', name: pv.name, desc: pv.desc, choose: () => applyPassive(pv) });
    }
    return result.slice(0, 3);
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
      const d   = WEAPON_DEFS[id];
      const lvl = player.weaponLevels[id] || 1;
      const star = d.evolved ? '✨' : '';
      const maxed = !d.evolved && lvl >= MAX_WEAPON_LEVEL ? ' weapon-maxed' : '';
      return `<span class="weapon-slot${d.evolved ? ' weapon-evolved' : ''}${maxed}">${star}${d.icon} ${d.name} <b>Lv.${lvl}</b></span>`;
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

    if (elapsed >= SURVIVE_GOAL) { endGame('win'); return; }

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

      if (p.type === 'orb' || p.type === 'blackhole') {
        const baseAngle = (elapsed * 1.8) + (p.orbIdx / p.orbTotal) * Math.PI * 2;
        const R = p.R || WEAPON_DEFS.orb.range;
        p.x = player.x + Math.cos(baseAngle) * R;
        p.y = player.y + Math.sin(baseAngle) * R;
        const evolved = p.type === 'blackhole';
        for (const e of enemies) {
          if (dist(p, e) < p.r + e.size) dealDamage(e, p.dmg * dt * 3);
          if (evolved) {   // 블랙홀: 주변 적을 플레이어 쪽으로 끌어당김
            const a = Math.atan2(player.y - e.y, player.x - e.x);
            e.x += Math.cos(a) * 45 * dt;
            e.y += Math.sin(a) * 45 * dt;
          }
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
      } else if (p.type === 'laser' || p.type === 'deathray') {
        const evolved = p.type === 'deathray';
        const ex = p.x + Math.cos(p.angle) * p.length;
        const ey = p.y + Math.sin(p.angle) * p.length;
        const mult = evolved ? 9 : 5;          // 데스레이는 훨씬 강한 지속 피해
        const hitW = evolved ? 8 : 4;
        for (const e of enemies) {
          if (distToSegment(e, p, { x: ex, y: ey }) < e.size + hitW) {
            dealDamage(e, p.dmg * dt * mult);
          }
        }
      } else if (p.type === 'explosion') {
        p.r = p.maxR * (1 - p.life / 0.4);
      }
    }

    // 슈퍼노바 연쇄 폭발 처리
    for (let i = chainExplosions.length - 1; i >= 0; i--) {
      const c = chainExplosions[i];
      c.delay -= dt;
      if (c.delay <= 0) {
        spawnExplosion(c.x, c.y, c.range, c.dmg, false);
        chainExplosions.splice(i, 1);
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
      if (p.type === 'orb' || p.type === 'blackhole') {
        const evolved = p.type === 'blackhole';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle  = evolved ? '#8e44ad' : '#3498db';
        ctx.shadowBlur = evolved ? 22 : 12;
        ctx.shadowColor = evolved ? '#9b59b6' : '#3498db';
        ctx.fill();
        if (evolved) {   // 블랙홀 소용돌이 링
          ctx.strokeStyle = 'rgba(155,89,182,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      } else if (p.type === 'arrow') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(-12, -2, 24, 4);
        ctx.restore();
      } else if (p.type === 'laser' || p.type === 'deathray') {
        const evolved = p.type === 'deathray';
        const ex = p.x + Math.cos(p.angle) * p.length;
        const ey = p.y + Math.sin(p.angle) * p.length;
        const alpha = p.life / 0.35;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = evolved ? '#e74c3c' : '#f1c40f';
        ctx.lineWidth  = evolved ? 7 : 4;
        ctx.shadowBlur = evolved ? 20 : 14;
        ctx.shadowColor = evolved ? '#e74c3c' : '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else if (p.type === 'explosion') {
        const col = p.evolved ? '#f1c40f' : '#e74c3c';
        const alpha = p.life / 0.4;
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = col;
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
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('levelOverlay').style.display = 'none';
    initGame();
    state = 'playing';
    lastTime = performance.now();
    frameId = requestAnimationFrame(loop);
  });

  // 첫 프레임 시작
  frameId = requestAnimationFrame(loop);
})();
