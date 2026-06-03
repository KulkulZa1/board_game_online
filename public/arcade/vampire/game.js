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
  const WAVE_INTERVAL  = 5;    // 초마다 적 추가 웨이브
  const MAX_ENEMIES    = 200;
  const DASH_COOLDOWN  = 1.8;  // 대쉬 공격 쿨다운(초)
  const DASH_DMG       = 50;   // 대쉬 공격 데미지
  const DASH_RANGE     = 75;   // 대쉬 공격 범위(px)
  const SURVIVE_GOAL   = 600;  // 10분 생존 시 승리

  const BOSS_INTERVAL      = 300;  // 5분마다 보스 등장
  const ITEM_BOX_INTERVAL  = 40;   // 40초마다 아이템 박스
  const ITEM_BOX_LIFETIME  = 28;   // 아이템 박스 수명(초)
  const HORDE_WAVE_EVERY   = 3;    // N번째 웨이브마다 대규모 하드 웨이브

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

  // 랜덤 아이템 박스 — 40초마다 맵에 등장, 플레이어가 수집
  const ITEM_BOX_POOL = [
    { id: 'medkit',  icon: '💊', name: '긴급 치료',   apply: (p) => { p.hp = Math.min(p.hp + p.maxHp * 0.5, p.maxHp); } },
    { id: 'barrier', icon: '🔰', name: '무적 방패',   apply: (p) => { p.invincible = 5.0; } },
    { id: 'freeze',  icon: '🧊', name: '빙결 폭탄',   apply: ()  => { enemies.forEach(e => { e.frozen = 3.0; }); } },
    { id: 'turbo',   icon: '⚡', name: '급가속',       apply: (p) => { p.tempSpeedMult = 1.5; p.tempSpeedTimer = 20; } },
    { id: 'power',   icon: '🎯', name: '정밀 조준',   apply: (p) => { p.tempDmgMult  = 1.5; p.tempDmgTimer  = 20; } },
    { id: 'hpmax',   icon: '❤',  name: '체력 강화',   apply: (p) => { p.maxHp += 30; p.hp = Math.min(p.hp + 30, p.maxHp); } },
    { id: 'dmgperm', icon: '✨', name: '공격력 강화', apply: (p) => { p.dmgMult *= 1.2; } },
    { id: 'nuke',    icon: '💥', name: '핵폭탄',      apply: ()  => {
        spawnExplosion(player.x, player.y, 230, 120 * player.dmgMult, false);
        for (let _i = 0; _i < 3; _i++) {
          const _a = Math.random() * Math.PI * 2;
          chainExplosions.push({ x: player.x + Math.cos(_a)*90, y: player.y + Math.sin(_a)*90, range: 120, dmg: 60 * player.dmgMult, delay: 0.1 + _i * 0.08 });
        }
      }
    },
  ];

  // ── 게임 상태 ───────────────────────────────────────────────────
  let state = 'idle'; // idle | playing | levelup | dead | win
  let player = null;
  let enemies = [];
  let projectiles = [];
  let xpGems = [];
  let particles = [];
  let chainExplosions = [];
  let enemyProjectiles = [];   // 적이 발사한 투사체
  let elapsed = 0;
  let kills = 0;
  let waveTimer = 0;
  let frameId;
  let camera = { x: 0, y: 0 };
  let selectedStageIdx = 0;
  let dashCd = 0;              // 대쉬 잔여 쿨다운
  let dashEffect = null;       // 대쉬 슬래시 시각 효과
  let screenShake = 0;         // 화면 흔들림 강도
  let lastMoveDir = { dx: 1, dy: 0 }; // 마지막 이동 방향 (대쉬 방향 결정)
  let itemBoxes     = [];        // 월드에 존재하는 아이템 박스
  let itemBoxTimer  = 0;
  let nextBossTime  = BOSS_INTERVAL;
  let bossActive    = false;
  let bossWarning   = 0;         // 보스 경고 효과 잔여 시간
  let damageNumbers = [];        // 플로팅 데미지 숫자
  let floatTexts    = [];        // 플로팅 텍스트 (알림, 아이템 이름 등)
  let comboCount    = 0;
  let comboTimer    = 0;
  let milestones    = new Set(); // 이미 알림한 분 단위 마일스톤
  let waveCount     = 0;         // 총 웨이브 카운터 (horde 판정)

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
      weaponLevels: {},  // 무기별 레벨 (1~MAX_WEAPON_LEVEL)
      weaponCDs: {},     // 무기별 쿨다운 잔여 시간
      passives: {},      // 보유 패시브 id → 스택 수 (진화 조건 판정)
      dmgMult: 1,
      cdMult:  1,
      xpRange: 80,
      invincible: 0,     // 무적 시간(초)
      shieldTimer: 0,
      tempDmgMult:  1,     // 임시 공격력 배율 (아이템 박스)
      tempDmgTimer: 0,
      tempSpeedMult: 1,    // 임시 속도 배율 (아이템 박스)
      tempSpeedTimer: 0,
    };
    enemies    = [];
    projectiles= [];
    xpGems     = [];
    particles  = [];
    chainExplosions = [];
    enemyProjectiles = [];
    elapsed    = 0;
    kills      = 0;
    waveTimer  = 0;
    camera     = { x: 0, y: 0 };
    dashCd      = 0;
    dashEffect  = null;
    screenShake = 0;
    lastMoveDir = { dx: 1, dy: 0 };
    itemBoxes     = [];
    itemBoxTimer  = 0;
    nextBossTime  = BOSS_INTERVAL;
    bossActive    = false;
    bossWarning   = 0;
    damageNumbers = [];
    floatTexts    = [];
    comboCount    = 0;
    comboTimer    = 0;
    milestones    = new Set();
    waveCount     = 0;

    // 시작 무기
    addWeapon('orb');
    addWeapon('arrow');
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

    waveCount++;
    const isHorde = (waveCount % HORDE_WAVE_EVERY === 0);
    if (isHorde) floatTexts.push({ text: '🔥 HORDE WAVE!', life: 2.0, maxLife: 2.0, screenSpace: true, color: '#e74c3c', size: 20 });
    const difficulty = 1 + elapsed / 100;
    const baseCount = isHorde ? Math.min(20 + Math.floor(elapsed / 10), 55) : Math.min(8 + Math.floor(elapsed / 12), 35);
    for (let i = 0; i < baseCount; i++) {
      if (enemies.length >= MAX_ENEMIES) break;
      const angle = Math.random() * Math.PI * 2;
      const spawnDist = 350 + Math.random() * 150;
      const tierRoll = Math.random();
      const tier = elapsed < 45  ? 0
                 : elapsed < 120 ? (tierRoll < 0.25 ? 1 : 0)
                 : elapsed < 240 ? (tierRoll < 0.2 ? 2 : tierRoll < 0.5 ? 1 : 0)
                 : elapsed < 400 ? (tierRoll < 0.3 ? 2 : tierRoll < 0.55 ? 1 : 0)
                 :                 (tierRoll < 0.4 ? 2 : tierRoll < 0.6 ? 1 : 0);
      // 원거리 공격형(archer): tier1 40%, tier2 100%
      const bRoll = Math.random();
      const behavior = (tier === 2 || (tier === 1 && bRoll < 0.4)) ? 'archer' : 'chase';
      const attackBase = behavior === 'archer' ? (tier === 2 ? 3.5 : 2.5) : 0;
      enemies.push({
        x: player.x + Math.cos(angle) * spawnDist,
        y: player.y + Math.sin(angle) * spawnDist,
        hp:    [30, 80, 250][tier] * difficulty,
        maxHp: [30, 80, 250][tier] * difficulty,
        speed: [75, 55, 35][tier] + Math.random() * 20,
        size:  [10, 15, 22][tier],
        color: ['#e74c3c', behavior === 'archer' ? '#1abc9c' : '#9b59b6', '#c0392b'][tier],
        xpVal: [3, 8, 20][tier],
        tier,
        hurtFlash: 0,
        frozen: 0,
        behavior,
        attackCd: Math.random() * attackBase,   // 초기 공격 시간 분산
        attackBase,
        attackRange: behavior === 'archer' ? (tier === 2 ? 280 : 220) : 0,
        attackDmg: [10, 20, 38][tier],
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
    if (player.weaponCDs[id] === undefined) return;   // 미보유 무기 무시
    player.weaponCDs[id] -= dt;
    if (player.weaponCDs[id] > 0) return;

    const def    = WEAPON_DEFS[id];
    const lvl    = player.weaponLevels[id] || 1;
    const lvlMul = 1 + 0.22 * (lvl - 1);              // 레벨당 데미지 +22%
    const cd     = def.cd * player.cdMult;
    const dmg    = def.dmg * player.dmgMult * (player.tempDmgMult || 1) * lvlMul;
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

  // 적 투사체 발사 — 플레이어 방향 + spread 각도
  function fireEnemyProjectile(enemy, spread) {
    spread = spread || 0;
    const ang = Math.atan2(player.y - enemy.y, player.x - enemy.x) + spread;
    const spd = [220, 260, 190][enemy.tier] || 220;
    const r   = 5 + enemy.tier * 2;
    enemyProjectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, dmg: enemy.attackDmg, life: 1.6 });
    for (let i = 0; i < 2; i++) spawnParticle(enemy.x, enemy.y, '#ff6b35', 3, 0.2);
  }

  // ── 데미지 처리 ─────────────────────────────────────────────────
  function dealDamage(enemy, dmg) {
    enemy.hp -= dmg;
    enemy.hurtFlash = 0.12;
    if (dmg >= 8) {
      const rounded = Math.round(dmg);
      damageNumbers.push({
        x: enemy.x + (Math.random() - 0.5) * 10,
        y: enemy.y - enemy.size - 4,
        val: rounded,
        life: 0.65, maxLife: 0.65,
        crit: dmg >= 60,
      });
    }
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    kills++;
    comboCount++;
    comboTimer = 1.5;
    const pCount = enemy.isBoss ? 30 : 3 + enemy.tier * 3;
    for (let i = 0; i < pCount; i++) {
      spawnParticle(enemy.x, enemy.y, enemy.color, (enemy.tier + 1) * 4 + Math.random() * 5, 0.3 + Math.random() * 0.4);
    }
    if (enemy.isBoss) {
      bossActive = false;
      for (let k = 0; k < 4; k++) {
        const ba = (k / 4) * Math.PI * 2;
        itemBoxes.push({ x: enemy.x + Math.cos(ba) * 55, y: enemy.y + Math.sin(ba) * 55, life: ITEM_BOX_LIFETIME, pulseT: 0 });
      }
      spawnExplosion(enemy.x, enemy.y, 200, 0, true);
      screenShake = Math.min(screenShake + 0.5, 0.7);
      floatTexts.push({ text: '🏆 BOSS SLAIN!', life: 3.5, maxLife: 3.5, screenSpace: true, color: '#f1c40f', size: 26 });
    }
    xpGems.push({ x: enemy.x, y: enemy.y, val: enemy.xpVal });
    enemies.splice(enemies.indexOf(enemy), 1);
    document.getElementById('killDisp').textContent = kills;
  }

  function spawnBoss() {
    bossActive  = true;
    bossWarning = 2.5;
    const bossNum = Math.floor(elapsed / BOSS_INTERVAL);
    const hp = 2800 + bossNum * 900;
    const ang = Math.random() * Math.PI * 2;
    enemies.push({
      x: player.x + Math.cos(ang) * 430,
      y: player.y + Math.sin(ang) * 430,
      hp, maxHp: hp,
      speed: 44 + bossNum * 3,
      size: 36,
      color: '#f1c40f',
      xpVal: 80 + bossNum * 25,
      tier: 3,
      isBoss: true,
      hurtFlash: 0,
      behavior: 'boss',
      attackCd: 0.6,
      attackBase: 2.5,
      attackRange: 390,
      attackDmg: 45 + bossNum * 12,
      bossPhase: 0,
      frozen: 0,
      faceAngle: 0,
    });
    floatTexts.push({ text: '⚠ BOSS APPROACHING ⚠', life: 2.5, maxLife: 2.5, screenSpace: true, color: '#e74c3c', size: 22 });
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

    // 1분마다 마일스톤 알림 (무한 모드)
    const mins = Math.floor(elapsed / 60);
    if (mins > 0 && !milestones.has(mins)) {
      milestones.add(mins);
      floatTexts.push({ text: `⏱ ${mins}분 생존!`, life: 2.5, maxLife: 2.5, screenSpace: true, color: '#2ecc71', size: 18 });
    }

    update(dt);
    render(dt);
    updateHUD();
  }

  function update(dt) {
    // 이동
    const { dx, dy } = getMoveDir();
    if (dx !== 0 || dy !== 0) lastMoveDir = { dx, dy };
    player.x += dx * player.speed * (player.tempSpeedMult || 1) * dt;
    player.y += dy * player.speed * (player.tempSpeedMult || 1) * dt;

    // 대쉬 공격 (Space / X)
    if (dashCd > 0) dashCd -= dt;
    if ((keys[' '] || keys['x'] || keys['X']) && dashCd <= 0) {
      const da = Math.atan2(lastMoveDir.dy, lastMoveDir.dx);
      dashEffect = { x: player.x, y: player.y, angle: da, life: 0.3, maxLife: 0.3 };
      dashCd = DASH_COOLDOWN;
      player.x += Math.cos(da) * 55;
      player.y += Math.sin(da) * 55;
      for (const e of enemies) {
        if (dist(e, player) < DASH_RANGE) {
          dealDamage(e, DASH_DMG * player.dmgMult);
          for (let k = 0; k < 3; k++) spawnParticle(e.x, e.y, '#f8c8ff', 5, 0.25);
        }
      }
    }
    if (dashEffect) { dashEffect.life -= dt; if (dashEffect.life <= 0) dashEffect = null; }

    // 화면 흔들림 감쇠
    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 2.5);

    // 카메라
    camera.x = player.x - canvas.width  / 2;
    camera.y = player.y - canvas.height / 2;

    // 무적 감소
    if (player.invincible > 0) player.invincible -= dt;

    // 웨이브 생성
    waveTimer += dt;
    if (waveTimer >= WAVE_INTERVAL) { waveTimer = 0; spawnWave(); }

    // 보스 등장 체크
    if (!bossActive && elapsed >= nextBossTime) {
      nextBossTime += BOSS_INTERVAL;
      spawnBoss();
    }
    if (bossWarning > 0) bossWarning -= dt;

    // 아이템 박스 생성
    itemBoxTimer += dt;
    if (itemBoxTimer >= ITEM_BOX_INTERVAL) {
      itemBoxTimer = 0;
      const _ba = Math.random() * Math.PI * 2;
      const _bd = 240 + Math.random() * 180;
      itemBoxes.push({ x: player.x + Math.cos(_ba) * _bd, y: player.y + Math.sin(_ba) * _bd, life: ITEM_BOX_LIFETIME, pulseT: 0 });
    }

    // 아이템 박스 업데이트 및 수집
    for (let i = itemBoxes.length - 1; i >= 0; i--) {
      const box = itemBoxes[i];
      box.life -= dt;
      box.pulseT = (box.pulseT || 0) + dt;
      if (box.life <= 0) { itemBoxes.splice(i, 1); continue; }
      if (dist(box, player) < 26) {
        const item = ITEM_BOX_POOL[Math.floor(Math.random() * ITEM_BOX_POOL.length)];
        item.apply(player);
        floatTexts.push({ x: box.x, y: box.y - 10, text: item.icon + ' ' + item.name + '!', life: 2.0, maxLife: 2.0, color: '#f1c40f', size: 15 });
        for (let k = 0; k < 10; k++) spawnParticle(box.x, box.y, '#f1c40f', 5 + Math.random() * 5, 0.5);
        itemBoxes.splice(i, 1);
        updateHUD();
      }
    }

    // 임시 버프 타이머
    if (player.tempDmgTimer > 0) { player.tempDmgTimer -= dt; if (player.tempDmgTimer <= 0) { player.tempDmgMult = 1; player.tempDmgTimer = 0; } }
    if (player.tempSpeedTimer > 0) { player.tempSpeedTimer -= dt; if (player.tempSpeedTimer <= 0) { player.tempSpeedMult = 1; player.tempSpeedTimer = 0; } }

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

    // 적 이동 + 행동 + 플레이어 충돌
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.hurtFlash > 0) e.hurtFlash -= dt;
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      const d   = dist(e, player);
      e.faceAngle = ang;

      // 보스 페이즈 전환 체크 (HP 50% 이하 → 격노)
      if (e.isBoss) {
        const expectedPhase = e.hp < e.maxHp * 0.5 ? 1 : 0;
        if (expectedPhase !== (e.bossPhase || 0)) {
          e.bossPhase = expectedPhase;
          floatTexts.push({ x: e.x, y: e.y - 50, text: '⚡ ENRAGE!', life: 1.8, maxLife: 1.8, color: '#e74c3c', size: 18 });
          for (let k = 0; k < 20; k++) spawnParticle(e.x, e.y, '#e74c3c', 8 + Math.random() * 6, 0.6);
          screenShake = Math.min(screenShake + 0.4, 0.5);
        }
      }

      const rageActive = !e.isBoss && e.hp < e.maxHp * 0.3;
      const rageMult   = rageActive ? 1.5 : 1.0;

      if (e.frozen > 0) {
        // 빙결 상태: 이동·공격 없음
        e.frozen -= dt;
      } else if (e.isBoss) {
        // 보스: 추적 + 원형 폭발 발사
        const bSpeed = e.bossPhase === 1 ? e.speed * 1.4 : e.speed;
        e.x += Math.cos(ang) * bSpeed * dt;
        e.y += Math.sin(ang) * bSpeed * dt;
        if (e.attackCd > 0) e.attackCd -= dt;
        if (e.attackCd <= 0) {
          const shots = (e.bossPhase || 0) === 1 ? 12 : 8;
          for (let b = 0; b < shots; b++) {
            fireEnemyProjectile(e, (b / shots) * Math.PI * 2 - ang);
          }
          e.attackCd = (e.bossPhase || 0) === 1 ? 1.5 : 2.5;
        }
      } else if (e.behavior === 'archer') {
        const prefDist = e.tier === 2 ? 200 : 170;
        if (d > prefDist * 1.3) {
          e.x += Math.cos(ang) * e.speed * rageMult * dt;
          e.y += Math.sin(ang) * e.speed * rageMult * dt;
        } else if (d < prefDist * 0.7) {
          e.x -= Math.cos(ang) * e.speed * 0.55 * dt;
          e.y -= Math.sin(ang) * e.speed * 0.55 * dt;
        }
        if (e.attackCd > 0) e.attackCd -= dt;
        if (e.attackCd <= 0 && d < e.attackRange) {
          const shots = e.tier === 2 ? 3 : (rageActive ? 2 : 1);
          for (let s = 0; s < shots; s++) {
            fireEnemyProjectile(e, shots > 1 ? (s - (shots - 1) / 2) * 0.22 : 0);
          }
          e.attackCd = e.attackBase * (rageActive ? 0.55 : 1.0);
        }
      } else {
        e.x += Math.cos(ang) * e.speed * rageMult * dt;
        e.y += Math.sin(ang) * e.speed * rageMult * dt;
      }

      if (player.invincible <= 0 && d < e.size + 12) {
        const contactDmg = e.isBoss ? 55 : [8, 18, 38][Math.min(e.tier, 2)];
        player.hp -= contactDmg * dt;
        screenShake = Math.min(screenShake + 0.15, 0.35);
        player.invincible = 0.15;
        if (player.hp <= 0) { endGame('dead'); return; }
      }
    }

    // 적 투사체 업데이트
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = enemyProjectiles[i];
      ep.life -= dt;
      if (ep.life <= 0) { enemyProjectiles.splice(i, 1); continue; }
      ep.x += ep.vx * dt;
      ep.y += ep.vy * dt;
      if (player.invincible <= 0 && dist(ep, player) < ep.r + 12) {
        player.hp -= ep.dmg;
        screenShake = Math.min(screenShake + 0.22, 0.45);
        player.invincible = 0.1;
        enemyProjectiles.splice(i, 1);
        if (player.hp <= 0) { endGame('dead'); return; }
      }
    }

    // 콤보 타이머 감쇠
    if (comboTimer > 0) comboTimer -= dt;
    else if (comboCount > 0) comboCount = 0;

    // 부유 텍스트 업데이트
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) { floatTexts.splice(i, 1); continue; }
      if (!ft.screenSpace) ft.y -= 32 * dt;
    }

    // 데미지 숫자 업데이트
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      dn.life -= dt;
      if (dn.life <= 0) { damageNumbers.splice(i, 1); continue; }
      dn.y -= 40 * dt;
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

    // 화면 흔들기 (최외곽 save)
    ctx.save();
    if (screenShake > 0) {
      const mag = screenShake * 14;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

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

    // 아이템 박스 렌더
    for (const box of itemBoxes) {
      const pulse = 0.7 + Math.sin((box.pulseT || 0) * 3.5) * 0.3;
      const fadeAlpha = Math.min(box.life * 0.4, 1);
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.rotate((box.pulseT || 0) * 0.6);
      ctx.globalAlpha = fadeAlpha * pulse;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#f1c40f';
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-11, -11, 22, 22);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle = '#fff';
      ctx.font = '14px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📦', 0, 0);
      ctx.restore();
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

    // 적 투사체 (오렌지-빨강 발광 구슬)
    for (const ep of enemyProjectiles) {
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, ep.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b35';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#e74c3c';
      ctx.fill();
      ctx.shadowBlur = 0;
      // 궤적 효과
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(ep.x - ep.vx * 0.025, ep.y - ep.vy * 0.025, ep.r * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b35';
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 대쉬 슬래시 효과
    if (dashEffect) {
      const alpha = dashEffect.life / dashEffect.maxLife;
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#f0d0ff';
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#d7a3f5';
      const sa = dashEffect.angle;
      for (let sl = 0; sl < 4; sl++) {
        const offset = (sl - 1.5) * 12;
        const ox = Math.cos(sa + Math.PI / 2) * offset;
        const oy = Math.sin(sa + Math.PI / 2) * offset;
        ctx.lineWidth = 2 - sl * 0.3;
        ctx.beginPath();
        ctx.moveTo(dashEffect.x + ox - Math.cos(sa) * 20, dashEffect.y + oy - Math.sin(sa) * 20);
        ctx.lineTo(dashEffect.x + ox + Math.cos(sa) * DASH_RANGE, dashEffect.y + oy + Math.sin(sa) * DASH_RANGE);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // 적
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      // 플레이어 방향 회전
      if (e.faceAngle !== undefined) ctx.rotate(e.faceAngle + Math.PI / 2);
      const flash = e.hurtFlash > 0;
      const rageActive = e.hp < e.maxHp * 0.3;
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      ctx.shadowBlur = flash ? 20 : (rageActive ? 14 : 8);
      ctx.shadowColor = rageActive ? '#ff4500' : e.color;

      // 적 모양: tier2=육각형, tier1 archer=마름모, tier1=사각형, tier0=원
      if (e.tier === 2) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          i === 0 ? ctx.moveTo(Math.cos(a)*e.size, Math.sin(a)*e.size)
                  : ctx.lineTo(Math.cos(a)*e.size, Math.sin(a)*e.size);
        }
        ctx.closePath();
      } else if (e.tier === 1 && e.behavior === 'archer') {
        // 마름모 (원거리 유형 구별)
        ctx.beginPath();
        ctx.moveTo(0, -e.size); ctx.lineTo(e.size, 0);
        ctx.lineTo(0, e.size);  ctx.lineTo(-e.size, 0);
        ctx.closePath();
      } else if (e.tier === 1) {
        ctx.beginPath();
        ctx.rect(-e.size, -e.size, e.size*2, e.size*2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, e.size, 0, Math.PI*2);
      }
      ctx.fill();
      // 분노 상태: 적색 테두리
      if (rageActive && !flash) {
        ctx.strokeStyle = '#ff4500';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      // HP 바 (회전 없이 별도로)
      ctx.save();
      ctx.translate(e.x, e.y);
      const bw = e.size * 2.2, bh = 3;
      ctx.fillStyle = '#333';
      ctx.fillRect(-bw/2, -e.size - 7, bw, bh);
      ctx.fillStyle = rageActive ? '#ff4500' : e.color;
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

    // 대쉬 쿨다운 표시 (우하단)
    if (state === 'playing') {
      const dcRatio = dashCd > 0 ? dashCd / DASH_COOLDOWN : 0;
      const cx = W - 36, cy = H - 36, rad = 18;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      if (dcRatio > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + (1 - dcRatio) * Math.PI * 2);
        ctx.fillStyle = 'rgba(215,163,245,0.7)';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(215,163,245,0.9)';
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DASH', cx, cy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore(); // 화면 흔들기 종료
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
