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
  // 레벨업 필요 XP는 xpNeeded() 의 다항식 곡선으로 계산 (무한 레벨 지원)
  const WAVE_INTERVAL  = 3.5;  // 초마다 적 추가 웨이브 (핵앤슬래시 밀도)
  const MAX_ENEMIES    = 400;
  const DASH_COOLDOWN  = 1.8;  // 대쉬 공격 쿨다운(초)
  const DASH_DMG       = 50;   // 대쉬 공격 데미지
  const DASH_RANGE     = 75;   // 대쉬 공격 범위(px)
  const SURVIVE_GOAL   = 600;  // 10분 생존 시 승리

  const BOSS_INTERVAL      = 300;  // 5분마다 보스 등장
  const ITEM_BOX_INTERVAL  = 40;   // 40초마다 아이템 박스
  const ITEM_BOX_LIFETIME  = 28;   // 아이템 박스 수명(초)
  const HORDE_WAVE_EVERY   = 2;    // N번째 웨이브마다 대규모 하드 웨이브 (핵앤슬래시: 더 자주)

  // 무기 강화 한계
  const MAX_WEAPON_LEVEL = 5;   // 같은 무기를 다시 고르면 레벨업 (최대 5)
  const MAX_WEAPONS      = 8;   // 보유 가능한 무기 슬롯 수 (핵앤슬래시: 더 많이)
  const COMBO_MILESTONES = [10, 25, 50, 100, 200];  // 콤보 보너스 지급 구간

  // 무기 정의 (기본 무기 + 진화 무기)
  const WEAPON_DEFS = {
    orb:       { name: '에너지 구',  icon: '🔵', desc: '주위를 회전하며 공격',             dmg: 28, cd: 0.65, range: 85 },
    arrow:     { name: '화살',       icon: '🏹', desc: '가장 가까운 적 관통',               dmg: 30, cd: 0.55, range: 320 },
    nova:      { name: '폭발',       icon: '💥', desc: '범위 폭발 공격',                   dmg: 95, cd: 1.8,  range: 120 },
    shield:    { name: '방패',       icon: '🛡', desc: '주기적 피해 감소',                 dmg: 0,  cd: 8,    range: 0 },
    laser:     { name: '레이저',     icon: '⚡', desc: '전방 레이저 빔',                   dmg: 52, cd: 0.9,  range: 290 },
    boomerang: { name: '부메랑',     icon: '🪃', desc: '전방으로 발사 후 귀환, 왕복 타격', dmg: 46, cd: 1.1,  range: 310 },
    chain:     { name: '번개 사슬',  icon: '🔗', desc: '최대 3연쇄 즉시 타격 번개',        dmg: 68, cd: 1.3,  range: 240 },
    scythe:    { name: '낫',         icon: '🌾', desc: '전방 부채꼴 광역 베기',            dmg: 44, cd: 0.7,  range: 115 },
    bomb:      { name: '폭탄',       icon: '💣', desc: '튕기는 폭탄, 접촉/시한 폭발',      dmg: 80, cd: 1.5,  range: 150 },
    // ── 진화 무기 (evolved) — 기본 무기 최대레벨 + 필요 패시브로 진화 ──
    blackhole: { name: '블랙홀',    icon: '🌀', desc: '적·투사체를 빨아들여 가두는 사건의 지평선', dmg: 48, cd: 0.55, range: 130, evolved: true },
    stormbow:  { name: '폭풍의 활', icon: '🌩', desc: '5연발 강화 관통 화살',        dmg: 42, cd: 0.38, range: 380, evolved: true },
    supernova: { name: '슈퍼노바',  icon: '☀',  desc: '연쇄 대폭발',                dmg: 130,cd: 1.6,  range: 160, evolved: true },
    deathray:  { name: '데스레이',  icon: '☠',  desc: '관통 즉사 광선',              dmg: 110,cd: 0.8,  range: 380, evolved: true },
    aegis:     { name: '이지스',    icon: '🛡', desc: '반사 보호막',                 dmg: 40, cd: 6,    range: 150, evolved: true },
    cyclone:   { name: '사이클론',  icon: '🌪', desc: '3방향 귀환 부메랑, 무한 관통', dmg: 72, cd: 0.9,  range: 380, evolved: true },
    tempest:   { name: '폭풍 사슬', icon: '⛈',  desc: '5연쇄 번개, 적 빙결',         dmg: 98, cd: 1.1,  range: 280, evolved: true },
    reaper:    { name: '사신의 낫', icon: '☠',  desc: '360° 회전 베기, 적 흡입',     dmg: 62, cd: 0.5,  range: 150, evolved: true },
    inferno:   { name: '인페르노', icon: '🔥',  desc: '5발 분열 화염 폭탄',          dmg: 70, cd: 1.2,  range: 175, evolved: true },
  };

  // 무기 레벨업 시 강화되는 부가 효과 설명 (계열 기준) — 레벨업 선택지 표시용
  const WEAPON_LVUP_DESC = {
    orb:       '궤도 구슬 +1(2레벨)·구슬 크기 증가',
    arrow:     '발사 수 +1(2레벨)·관통 +1',
    nova:      '폭발 범위 확대',
    shield:    '보호막 지속시간 증가',
    laser:     '빔 사거리 증가',
    boomerang: '관통 +1·비행 거리 증가',
    chain:     '연쇄 +1(2레벨)·사거리 증가',
    scythe:    '베기 범위·부채꼴 각도 확대',
    bomb:      '폭발 범위 확대·분열 수 증가',
  };

  // 진화 규칙: base 무기가 최대 레벨 + req 패시브 보유 시 evolved(id) 무기로 진화
  const EVOLUTION_DEFS = [
    { id: 'blackhole', base: 'orb',       req: 'magnet',    reqName: '🧲 경험치 자석' },
    { id: 'stormbow',  base: 'arrow',     req: 'cd_up',     reqName: '⏩ 쿨다운 감소' },
    { id: 'supernova', base: 'nova',      req: 'dmg_up',    reqName: '⚔ 공격력' },
    { id: 'deathray',  base: 'laser',     req: 'spd_up',    reqName: '👟 이동 속도' },
    { id: 'aegis',     base: 'shield',    req: 'hp_up',     reqName: '❤ 체력 회복' },
    { id: 'cyclone',   base: 'boomerang', req: 'crit',      reqName: '⚡ 치명타' },
    { id: 'tempest',   base: 'chain',     req: 'pierce_up', reqName: '🔱 관통 강화' },
    { id: 'reaper',    base: 'scythe',    req: 'lifesteal', reqName: '🩸 흡혈' },
    { id: 'inferno',   base: 'bomb',      req: 'ignite',    reqName: '🔥 화염 부착' },
  ];

  // 메인+보조 무기 시스템 — 메인 무기 1개만 독립 발사, 나머지 공격 무기는 보조
  // 방패/이지스(방어 무기)는 항상 독립 발사
  const NON_ATTACK_WEAPONS = new Set(['shield', 'aegis']);

  // 무기 계열 — 진화 무기를 기본 계열로 매핑 (보조 효과 판정용, 진화 후에도 유지)
  const WEAPON_FAMILY = {
    orb: 'orb', blackhole: 'orb',
    arrow: 'arrow', stormbow: 'arrow',
    nova: 'nova', supernova: 'nova',
    shield: 'shield', aegis: 'shield',
    laser: 'laser', deathray: 'laser',
    boomerang: 'boomerang', cyclone: 'boomerang',
    chain: 'chain', tempest: 'chain',
    scythe: 'scythe', reaper: 'scythe',
    bomb: 'bomb', inferno: 'bomb',
  };

  // 보조 무기 계열별 오버레이 효과 — 메인 무기 발사마다 보유한 각 보조 계열 효과가 발동
  // proc: 발동 확률 (1.0 = 항상)
  const AUX_EFFECT_DEFS = {
    bomb:      { icon: '💥', name: '폭발 증폭',   desc: '주 공격마다 소형 폭발 (45% 피해)',           proc: 1.0 },
    chain:     { icon: '⚡', name: '전격 연쇄',   desc: '주 공격마다 2연쇄 번개 (55% 피해)',          proc: 1.0 },
    laser:     { icon: '☀',  name: '섬광 방출',   desc: '주 공격 60% 확률 관통 레이저 (65% 피해)',    proc: 0.6 },
    boomerang: { icon: '🪃', name: '파편 사출',   desc: '주 공격 50% 확률 3방향 파편 (35%×3)',       proc: 0.5 },
    orb:       { icon: '🔵', name: '에너지 파동', desc: '주 공격마다 환형 충격파 (40% 피해)',         proc: 1.0 },
    nova:      { icon: '💥', name: '연쇄 폭발',   desc: '주 공격 70% 확률 2차 폭발 (50% 피해)',      proc: 0.7 },
    scythe:    { icon: '🌾', name: '검기 방출',   desc: '주 공격 80% 확률 부채꼴 베기 (50% 피해)',    proc: 0.8 },
    arrow:     { icon: '🏹', name: '추격 화살',   desc: '주 공격 70% 확률 추가 관통 화살 (50%)',      proc: 0.7 },
    shield:    { icon: '🛡', name: '방어 증폭',   desc: '주 공격마다 0.5초 피해 30% 감소',           proc: 1.0 },
  };

  // 패시브(능력치) 업그레이드 — 진화 재료로도 사용됨
  // max: 최대 스택 수. 도달 시 선택지에서 자동 제외. max:null = 무제한(성장 판타지 핵심 스탯)
  //   무제한: 공격력·체력·관통 → 끝없이 강해지는 재미
  //   상한:   쿨다운(0 방지)·치명타(100%↑ 무의미)·이속(조작 불가 방지)·자석(지수 폭주)·재생(무적 방지)
  const PASSIVE_POOL = [
    { id: 'hp_up',    name: '❤ 체력 회복',   desc: '최대 체력 +20, 체력 회복',     max: null, apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.hp + 30, p.maxHp); } },
    { id: 'spd_up',   name: '👟 이동 속도',   desc: '이동 속도 +12%',               max: 5,    apply: (p) => { p.speed *= 1.12; } },
    { id: 'dmg_up',   name: '⚔ 공격력',      desc: '모든 무기 데미지 +18%',         max: null, apply: (p) => { p.dmgMult *= 1.18; } },
    { id: 'cd_up',    name: '⏩ 쿨다운 감소', desc: '모든 무기 쿨다운 -12%',         max: 5,    apply: (p) => { p.cdMult  *= 0.88; } },
    { id: 'magnet',   name: '🧲 경험치 자석', desc: 'XP 획득 반경 +60%',             max: 4,    apply: (p) => { p.xpRange *= 1.6; } },
    { id: 'crit',     name: '⚡ 치명타',       desc: '15% 확률 2배 피해 (중첩 가능)',  max: 6,    apply: (p) => { p.critChance = (p.critChance || 0) + 0.15; } },
    { id: 'pierce_up',name: '🔱 관통 강화',   desc: '화살·부메랑 관통 +2, 번개 연쇄 +3',           max: null, apply: (p) => { p.pierceBonus = (p.pierceBonus || 0) + 2; } },
    { id: 'regen',    name: '💚 체력 재생',   desc: '초당 최대 체력 2% 자동 회복',    max: 5,    apply: (p) => { p.regenRate = (p.regenRate || 0) + 0.02; } },
    { id: 'range_up', name: '🎯 사거리 확장', desc: '모든 무기 사거리·AoE +18%',      max: 5,    apply: (p) => { p.rangeBonus = (p.rangeBonus || 1) * 1.18; } },
    { id: 'ignite',   name: '🔥 화염 부착',   desc: '20% 확률로 화상(초당 피해, 3중첩)', max: 5,    apply: (p) => { p.igniteChance = (p.igniteChance || 0) + 0.20; } },
    { id: 'venom',    name: '☠ 맹독',        desc: '15% 확률로 중독(긴 지속 피해)',     max: 5,    apply: (p) => { p.venomChance = (p.venomChance || 0) + 0.15; } },
    { id: 'lifesteal',name: '🩸 흡혈',        desc: '입힌 피해의 3% 만큼 체력 회복',     max: 5,    apply: (p) => { p.lifesteal = (p.lifesteal || 0) + 0.03; } },
  ];

  // 패시브 시너지 — 두 패시브를 조합하면 특수 효과 해금
  const SYNERGY_DEFS = [
    {
      id: 'executioner',
      name: '집행자', icon: '🗡',
      desc: '치명타 피해 3배 (기본 2배)',
      requires: [{ id: 'dmg_up', count: 3 }, { id: 'crit', count: 2 }],
    },
    {
      id: 'blitz',
      name: '전격전', icon: '⚡',
      desc: '공격마다 15% 확률로 즉시 재발동',
      requires: [{ id: 'spd_up', count: 2 }, { id: 'cd_up', count: 2 }],
    },
    {
      id: 'iron_fortress',
      name: '철갑 요새', icon: '🛡',
      desc: '모든 피해 30% 감소',
      requires: [{ id: 'regen', count: 2 }, { id: 'hp_up', count: 3 }],
    },
    {
      id: 'vital_surge',
      name: '생명 파동', icon: '💚',
      desc: '적 처치마다 HP +3 회복',
      requires: [{ id: 'regen', count: 3 }, { id: 'cd_up', count: 2 }],
    },
    {
      id: 'armor_breaker',
      name: '갑옷 파쇄', icon: '🔱',
      desc: '관통 투사체 적중 시 40% 범위 피해 추가',
      requires: [{ id: 'pierce_up', count: 3 }, { id: 'dmg_up', count: 2 }],
    },
    {
      id: 'chain_crit',
      name: '연쇄 크리티컬', icon: '🌩',
      desc: '치명타 발동 시 2연쇄 번개 추가 (45% 피해)',
      requires: [{ id: 'crit', count: 3 }, { id: 'pierce_up', count: 2 }],
    },
    {
      id: 'pyromaniac',
      name: '방화광', icon: '🔥',
      desc: '화염 상태 적 사망 시 주변 광역 폭발',
      requires: [{ id: 'ignite', count: 3 }, { id: 'dmg_up', count: 2 }],
    },
    {
      id: 'bloodlust',
      name: '피의 갈증', icon: '🩸',
      desc: '치명타 발동 시 최대 체력 10% 회복',
      requires: [{ id: 'lifesteal', count: 3 }, { id: 'crit', count: 2 }],
    },
    {
      id: 'elemental_burst',
      name: '원소 폭발', icon: '💫',
      desc: '화염+맹독 동시 걸린 적 처치 시 반경 150px 연쇄 폭발 (공격력 800%)',
      requires: [{ id: 'ignite', count: 3 }, { id: 'venom', count: 2 }],
    },
    {
      id: 'cascade_collapse',
      name: '연쇄 붕괴', icon: '💥',
      desc: '5초 내 10처치 달성 시 다음 공격에 반경 250px 충격파 (500 고정피해)',
      requires: [{ id: 'dmg_up', count: 4 }, { id: 'pierce_up', count: 2 }],
    },
    {
      id: 'spectral_blade',
      name: '유령 검기', icon: '👻',
      desc: '낫 계열 적중 위치에 0.8초 잔향 검기 생성 (데미지 60%)',
      requires: [{ id: 'lifesteal', count: 2 }, { id: 'range_up', count: 3 }],
    },
  ];

  // 신규 획득 가능한 기본 무기 목록
  const SLASH_SUPPORT_DEFS = [
    { id: 'cleave',  name: 'Cleave Edge',  desc: '+18% dash-slash damage and a wider cutting path.', max: 3 },
    { id: 'rupture', name: 'Rupture Mark', desc: 'Dash-hit enemies bleed, then burst when killed.', max: 3 },
    { id: 'echo',    name: 'Echo Step',    desc: 'Dash leaves delayed after-slashes along your path.', max: 3 },
  ];
  const WEAPON_POOL = ['orb', 'arrow', 'nova', 'shield', 'laser', 'boomerang', 'chain', 'scythe', 'bomb'];
  const META_KEY = 'vps_meta_v2';
  const RUN_SNAPSHOT_KEY = 'vps_run_snapshot_v1';
  const RUN_SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000;
  const RUN_SNAPSHOT_INTERVAL = 8;
  const CHARACTER_DEFS = [
    {
      id: 'knight',
      name: 'Chess Knight',
      icon: 'N',
      desc: 'Fast starter with bow pressure.',
      startWeapons: ['arrow'],
      speedMult: 1.08,
      hpBonus: 0,
      dmgMult: 1,
      cdMult: 1,
      xpRangeMult: 1,
      unlock: { type: 'free' },
    },
    {
      id: 'omok',
      name: 'Omok Stone',
      icon: 'O',
      desc: 'Tougher bruiser with stone orbit.',
      startWeapons: ['orb', 'nova'],
      speedMult: 0.94,
      hpBonus: 25,
      dmgMult: 1.1,
      cdMult: 1.04,
      xpRangeMult: 0.95,
      unlock: { achievement: 'survive180', cost: 350, label: 'Survive 3:00 or pay 350 coins' },
    },
    {
      id: 'reversi',
      name: 'Reversi Mage',
      icon: 'R',
      desc: 'Cooldown specialist with late-game scaling.',
      startWeapons: ['shield', 'laser'],
      speedMult: 1,
      hpBonus: 10,
      dmgMult: 0.95,
      cdMult: 0.9,
      xpRangeMult: 1.12,
      unlock: { achievement: 'evolve1', cost: 600, premiumProduct: 'reversi', label: 'Evolve a weapon, pay 600 coins, or unlock premium on mobile' },
    },
    {
      id: 'goblin',
      name: 'Goblin Thief',
      icon: '💰',
      desc: 'Fast glass cannon. +30% coins, 2× gear drops. Low HP.',
      startWeapons: ['boomerang', 'chain'],
      speedMult: 1.18,
      hpBonus: -20,
      dmgMult: 1.05,
      cdMult: 1,
      xpRangeMult: 1,
      coinMult: 1.3,
      unlock: { achievement: 'goblinSlayer', cost: 500, label: 'Kill treasure goblin 3× or pay 500 coins' },
    },
  ];
  const DIFFICULTY_DEFS = [
    { id: 'easy', name: 'Easy', desc: 'Practice run.', enemyHpMult: 0.78, enemySpeedMult: 0.92, enemyDmgMult: 0.75, spawnMult: 0.82, bossInterval: 150, coinMult: 0.75 },
    { id: 'normal', name: 'Normal', desc: 'Balanced 10 minute run.', enemyHpMult: 1, enemySpeedMult: 1, enemyDmgMult: 1, spawnMult: 1, bossInterval: 120, coinMult: 1 },
    { id: 'hard', name: 'Hard', desc: 'Higher pressure and rewards.', enemyHpMult: 1.28, enemySpeedMult: 1.1, enemyDmgMult: 1.22, spawnMult: 1.22, bossInterval: 105, coinMult: 1.45 },
    { id: 'nightmare', name: 'Nightmare', desc: 'Elites gain shields. Max pressure. Huge payout.', enemyHpMult: 1.65, enemySpeedMult: 1.25, enemyDmgMult: 1.5, spawnMult: 1.38, bossInterval: 90, coinMult: 2.2 },
  ];
  const META_UPGRADE_DEFS = [
    { id: 'might', name: 'Might', desc: '+4% weapon damage per rank.', max: 5, baseCost: 120, apply: (stats, level) => { stats.dmgMult *= 1 + level * 0.04; } },
    { id: 'vitality', name: 'Vitality', desc: '+8 max HP per rank.', max: 5, baseCost: 110, apply: (stats, level) => { stats.hpBonus += level * 8; } },
    { id: 'magnet', name: 'Magnet', desc: '+8% XP pickup range per rank.', max: 5, baseCost: 100, apply: (stats, level) => { stats.xpRangeMult *= 1 + level * 0.08; } },
    { id: 'haste', name: 'Haste', desc: '-3% cooldown per rank.', max: 5, baseCost: 140, apply: (stats, level) => { stats.cdMult *= Math.max(0.75, 1 - level * 0.03); } },
  ];
  const MAP_DEFS = [
    { id: 'meadow', name: 'Meadow', desc: 'Balanced 10 minute field.', durationSeconds: 600, enemyHpMult: 1, spawnMult: 1, coinMult: 1, bg: '#101827', unlock: { type: 'free' } },
    { id: 'night', name: 'Night Board', desc: 'More enemies after your first clear.', durationSeconds: 600, enemyHpMult: 1.08, spawnMult: 1.12, coinMult: 1.15, bg: '#101222', unlock: { achievement: 'win1', label: 'Clear one run' } },
    { id: 'snow', name: 'Snow Endgame', desc: 'Longer, harder, better payout.', durationSeconds: 720, enemyHpMult: 1.18, spawnMult: 1.18, coinMult: 1.35, bg: '#13212b', unlock: { achievement: 'clearHard', cost: 900, label: 'Clear Hard or pay 900 coins' } },
  ];
  const START_BOOST_COST = 90;
  const HYBRID_TOWER_TYPES = [
    { id: 'cannon', name: 'Cannon', icon: 'C', color: '#3498db', range: 190, dmg: 26, cd: 0.72, projectileSpeed: 430 },
    { id: 'frost', name: 'Frost', icon: 'F', color: '#5dade2', range: 165, dmg: 13, cd: 1.1, projectileSpeed: 330, slow: 1.6 },
    { id: 'tesla', name: 'Tesla', icon: 'T', color: '#f1c40f', range: 150, dmg: 18, cd: 0.9, chain: 2 },
  ];
  const MAX_HYBRID_TOWERS = 8;
  const TOWER_RECHARGE_SECONDS = 45;
  const ACHIEVEMENT_REWARDS = {
    survive180: 120,
    win1: 250,
    clearHard: 350,
    dailyClear: 160,
    evolve3: 260,
    nearMissClear: 220,
    towerBuilder: 180,
    noReviveClear: 180,
    goblinSlayer: 200,
  };

  // 정예(엘리트) 처치 시 떨어지는 즉시 발동 파워업 — 모달 없이 줍는 즉시 적용(핵앤슬래시 흐름 유지)
  const POWERUP_POOL = [
    { id: 'berserk', icon: '⚡', color: '#e74c3c', name: '광폭화', apply: (p) => { p.tempDmgMult = 2.0; p.tempDmgTimer = 8; } },
    { id: 'haste',   icon: '👟', color: '#3498db', name: '쾌속',   apply: (p) => { p.tempSpeedMult = 1.5; p.tempSpeedTimer = 8; } },
    { id: 'heal',    icon: '❤', color: '#2ecc71', name: '회복',   apply: (p) => { p.hp = Math.min(p.hp + p.maxHp * 0.4, p.maxHp); } },
    { id: 'vacuum',  icon: '🧲', color: '#9b59b6', name: '흡수',   apply: (p) => { let s = 0; for (const g of xpGems) s += g.val; xpGems.length = 0; if (s > 0) gainXP(s); } },
  ];

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
    // 진공 청소기 — 맵의 모든 드랍 물품을 흡수: XP 젬·파워업 즉시 적용, 장비·아이템 박스는
    //   플레이어 위치로 끌어당겨 일반 수집 로직이 처리(약한 장비 자동 분해, 보관 장비는 모달 순차 표시)
    { id: 'sweep',   icon: '🌀', name: '진공 청소기', apply: ()  => {
        // 1) XP 젬 전부 즉시 흡수
        let xpTotal = 0;
        for (const g of xpGems) xpTotal += g.val;
        xpGems.length = 0;
        if (xpTotal > 0) gainXP(xpTotal);
        // 2) 파워업 전부 즉시 적용
        for (const pu of powerups) pu.def.apply(player);
        powerups.length = 0;
        // 3) 장비 드롭 — 플레이어 위치로 끌어당김 (다음 프레임 수집 로직이 자동 분해/모달 처리)
        const gearCount = gearDrops.length;
        for (const gd of gearDrops) { gd.x = player.x; gd.y = player.y; }
        // 4) 아이템 박스 — 플레이어 위치로 끌어당김 (수집 시 선택창 순차 표시)
        const boxCount = itemBoxes.length;
        for (const box of itemBoxes) { box.x = player.x; box.y = player.y; }
        const absorbed = gearCount + boxCount;
        floatTexts.push({ text: absorbed > 0 ? `🌀 전체 흡수! (+${absorbed} 드랍)` : '🌀 전체 흡수!', life: 2.0, maxLife: 2.0, screenSpace: true, color: '#9b59b6', size: 22 });
        for (let _k = 0; _k < 20; _k++) spawnParticle(player.x, player.y, '#9b59b6', 6 + Math.random()*6, 0.5);
      }
    },
  ];

  // ── 사운드 (경량 Web Audio 절차적 효과음) ───────────────────────
  // 사용자 제스처(시작 버튼)에서 init() 호출로 AudioContext 생성. M키로 음소거 토글.
  const SFX = (() => {
    let actx = null;
    let muted = false;
    let lastPickup = 0, lastHurt = 0;
    try { muted = localStorage.getItem('vps_muted') === '1'; } catch (_) {}
    function ensure() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { try { actx = new AC(); } catch (_) {} }
      }
      if (actx && actx.state === 'suspended') actx.resume();
      return actx;
    }
    function tone(freq, dur, type, gain, slideTo) {
      if (muted) return;
      const ac = ensure(); if (!ac) return;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(gain || 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + dur);
    }
    return {
      init() { ensure(); },
      toggleMute() {
        muted = !muted;
        try { localStorage.setItem('vps_muted', muted ? '1' : '0'); } catch (_) {}
        return muted;
      },
      isMuted() { return muted; },
      crit()    { tone(540, 0.12, 'sawtooth', 0.10, 220); },
      combo()   { tone(880, 0.09, 'square', 0.09, 1320); },
      levelup() { tone(523, 0.12, 'triangle', 0.12, 784); setTimeout(() => tone(784, 0.18, 'triangle', 0.12, 1046), 90); },
      boss()    { tone(110, 0.45, 'sawtooth', 0.16, 55); },
      pickup()  { const n = performance.now(); if (n - lastPickup < 55) return; lastPickup = n; tone(660, 0.05, 'sine', 0.05, 920); },
      hurt()    { const n = performance.now(); if (n - lastHurt < 200) return; lastHurt = n; tone(170, 0.13, 'sawtooth', 0.10, 70); },
      dash()    { tone(420, 0.16, 'sine', 0.07, 120); },
    };
  })();

  // ── 게임 상태 ───────────────────────────────────────────────────
  let state = 'idle'; // idle | playing | paused | levelup | itembox | dead | win
  let player = null;
  let enemies = [];
  let projectiles = [];
  let xpGems = [];
  let particles = [];
  let playerTrail = [];        // 플레이어 이동 잔상 (질주감 연출, 최대 10개)
  let chainExplosions = [];
  let slashEchoes = [];
  let enemyProjectiles = [];   // 적이 발사한 투사체
  let elapsed = 0;
  let kills = 0;
  let lastKillTime = -1;   // 마지막 처치 elapsed 시간 — AoE 동시 처치 구분용
  let waveTimer = 0;
  let frameId;
  let camera = { x: 0, y: 0 };
  let selectedStageIdx = 0;
  let dashCd = 0;              // 대쉬 잔여 쿨다운
  let dashEffect = null;       // 대쉬 슬래시 시각 효과
  let screenShake = 0;         // 화면 흔들림 강도
  let hitStop = 0;             // 히트스톱(타격 정지) 잔여 시간 — 큰 타격 순간 짧게 정지
  let hurtScreenFlash = 0;     // 피격 시 화면 붉은 플래시 잔여 시간
  let evolveFlash = 0;         // 무기 진화 시 화면 금빛 섬광 잔여 시간
  let rings = [];              // 처치·타격 충격파 링 (시각 전용)
  let powerups = [];           // 정예 처치 시 떨어지는 즉시 발동 파워업
  let overdriveCharge = 0;     // 오버드라이브 게이지 (0–100, 처치마다 충전)
  let overdriveActive = 0;     // 오버드라이브 남은 지속 시간(초)
  let overdriveFlash  = 0;     // 활성화 순간 금빛 섬광 잔여 시간
  let lastMoveDir = { dx: 1, dy: 0 }; // 마지막 이동 방향 (대쉬 방향 결정)
  let itemBoxes     = [];        // 월드에 존재하는 아이템 박스
  let hybridTowers  = [];
  let selectedTowerTypeIdx = 0;
  let towerRecharge = 0;
  let itemBoxTimer  = 0;
  let goblinTimer   = 0;         // 보물 고블린 등장 타이머
  let infiniteMode  = false;     // 10분 후 무한 웨이브 모드 활성화
  let infiniteDialogShown = false; // 무한 모드 다이얼로그 표시 여부
  let infiniteElapsed = 0;       // 무한 모드 경과 시간(초)
  let spectralFields = [];       // spectral_blade 잔향 검기 필드
  let killStreakTimestamps = [];  // cascade_collapse: 5초 내 처치 타임스탬프
  let dashChainWindow = 0;       // 연쇄 대쉬 가능 잔여 시간 (첫 대쉬 적중 후 1초)
  let dashChainCount = 0;        // 현재 연쇄 대쉬 횟수 (최대 2)
  let dashAfterimages = [];      // 대쉬 잔상 폭발 필드 (DoT AoE)
  let autoDismantleEnabled = false; // 자동 분해 활성화 (장비 전투력이 낮으면 자동 분해)
  let _lastDashKeyState = false; // 대쉬 키 이전 프레임 상태 (연쇄 대쉬 중복 방지)
  let nextBossTime  = BOSS_INTERVAL;
  const GOBLIN_INTERVAL = 48;    // 보물 고블린 등장 주기(초)
  let bossActive    = false;
  let bossWarning   = 0;         // 보스 경고 효과 잔여 시간
  let damageNumbers = [];        // 플로팅 데미지 숫자
  let floatTexts    = [];        // 플로팅 텍스트 (알림, 아이템 이름 등)
  let comboCount    = 0;
  let comboTimer    = 0;
  let comboMilestoneIdx = 0;     // 현재 콤보 스트릭에서 지급한 마일스톤 인덱스
  let comboBonusCoins   = 0;     // 콤보 마일스톤 누적 보너스 코인 (런 종료 시 정산)
  let milestones    = new Set(); // 이미 알림한 분 단위 마일스톤
  let waveCount          = 0;     // 총 웨이브 카운터 (horde 판정)
  let freeRerollUsed     = false; // 현재 선택창 무료 리롤 사용 여부 (창마다 초기화)
  let gearDrops          = [];    // 월드에 존재하는 장비 드롭
  let equipUiVisible     = false; // 장비 UI 표시 여부
  let currentChoiceBuilder = null; // 현재 선택지 생성 함수 (리롤 시 재호출)
  let audioCtx = null;
  let evolutionBannerTimer = null;
  const LOW_HP_THRESHOLD = 0.25;
  const CRITICAL_HP_THRESHOLD = 0.15;
  const LOW_HP_ALERT_COOLDOWN = 7.5;
  let lowHpAlertCooldown = 0;
  let lowHpPulse = 0;

  let meta = loadMeta();
  syncAdSettings();
  let selectedCharacterId = meta.lastCharacter || 'knight';
  let selectedDifficultyId = meta.lastDifficulty || 'normal';
  let selectedMapId = meta.lastMap || 'meadow';
  let dailyChallengeEnabled = !!meta.dailyChallengeEnabled;
  let runRewardsGranted = false;
  let lastRunSnapshotAt = 0;
  let allyPlayer = null;
  const coop = {
    socket: null,
    role: 'solo',
    roomId: null,
    guestConnected: false,
    guestInput: { dx: 0, dy: 0, dash: false, tower: false },
    lastInputSentAt: 0,
    lastStateSentAt: 0,
    mirrorSnapshot: null,
  };

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
    if (stage && stage.durationSeconds) return stage.durationSeconds;
    const map = currentMap();
    return map.durationSeconds || SURVIVE_GOAL;
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
    ensureMetaAchievements();
    const character = currentCharacter();
    const difficulty = currentDifficulty();
    const map = currentMap();
    const daily = dailyChallengeEnabled ? dailyChallenge() : null;
    const metaStats = { hpBonus: 0, dmgMult: 1, cdMult: 1, xpRangeMult: 1 };
    META_UPGRADE_DEFS.forEach(def => def.apply(metaStats, upgradeLevel(def.id)));
    const maxHp = BASE_HP + (character.hpBonus || 0) + metaStats.hpBonus + (meta.pendingStartBoost ? 20 : 0);
    player = {
      x: 0, y: 0,
      hp: maxHp, maxHp,
      speed: PLAYER_SPEED * character.speedMult,
      level: 1, xp: 0,
      weapons: [],       // 보유 무기 id 목록
      weaponLevels: {},  // 무기별 레벨 (1~MAX_WEAPON_LEVEL)
      weaponCDs: {},     // 무기별 쿨다운 잔여 시간
      mainWeapon: null,  // 메인 무기 id (첫 공격 무기 자동 지정, E키로 변경 가능)
      passives: {},      // 보유 패시브 id → 스택 수 (진화 조건 판정)
      dmgMult: character.dmgMult * metaStats.dmgMult,
      cdMult:  character.cdMult * metaStats.cdMult,
      xpRange: 80 * character.xpRangeMult * metaStats.xpRangeMult,
      invincible: 0,     // 무적 시간(초)
      shieldTimer: 0,
      tempDmgMult:  1,     // 임시 공격력 배율 (아이템 박스)
      tempDmgTimer: 0,
      tempSpeedMult: 1,    // 임시 속도 배율 (아이템 박스)
      tempSpeedTimer: 0,
      characterId: character.id,
      difficultyId: difficulty.id,
      revived: false,
      mapId: map.id,
      dailyKey: daily ? daily.key : null,
      towerCharges: 2,
      maxTowerCharges: 4,
      towersPlaced: 0,
      slashMods: {},
      lowestHpPct: 1,
      rerolls: 0,          // 추가 리롤권 (몬스터 드롭)
      critChance: 0,        // 치명타 확률 (crit 패시브)
      pierceBonus: 0,       // 화살·부메랑 추가 관통 (pierce_up 패시브)
      regenRate: 0,         // 초당 체력 재생 비율 (regen 패시브)
      rangeBonus: 1,        // 사거리·AoE 배율 (range_up 패시브 + 장비)
      igniteChance: 0,      // 화상 부착 확률 (ignite 패시브)
      venomChance: 0,       // 중독 부착 확률 (venom 패시브)
      lifesteal: 0,         // 흡혈 비율 (lifesteal 패시브)
      equip: { helm: null, armor: null, boots: null, ring: null },
      equipStats: {},       // 캐시: 장비 합산 스탯
      setEffects: [],       // 활성 세트 효과 목록
      crossEffects: [],     // 활성 교차 시너지 목록
      gemEffects: {},       // 캐시: 특수 젬 효과 집계 { effect: {procChance,val,count} }
      setFlags: {},         // 캐시: 활성 세트/교차 효과 플래그 { effectName: true }
    };
    enemies    = [];
    projectiles= [];
    xpGems     = [];
    particles  = [];
    playerTrail = [];
    chainExplosions = [];
    slashEchoes = [];
    enemyProjectiles = [];
    elapsed    = 0;
    kills      = 0;
    lastKillTime = -1;
    waveTimer  = 0;
    camera     = { x: 0, y: 0 };
    dashCd      = 0;
    dashEffect  = null;
    screenShake = 0;
    hitStop = 0;
    hurtScreenFlash = 0;
    evolveFlash = 0;
    rings = [];
    powerups = [];
    overdriveCharge = 0;
    overdriveActive = 0;
    overdriveFlash  = 0;
    lastMoveDir = { dx: 1, dy: 0 };
    itemBoxes     = [];
    hybridTowers  = [];
    allyPlayer = null;
    selectedTowerTypeIdx = 0;
    towerRecharge = 0;
    itemBoxTimer  = 0;
    goblinTimer   = 0;
    infiniteMode  = false;
    infiniteDialogShown = false;
    infiniteElapsed = 0;
    spectralFields = [];
    killStreakTimestamps = [];
    dashChainWindow = 0;
    dashChainCount = 0;
    dashAfterimages = [];
    _lastDashKeyState = false;
    nextBossTime  = difficulty.bossInterval || BOSS_INTERVAL;
    bossActive    = false;
    bossWarning   = 0;
    damageNumbers = [];
    floatTexts    = [];
    lowHpAlertCooldown = 0;
    lowHpPulse = 0;
    comboCount    = 0;
    comboTimer    = 0;
    comboMilestoneIdx = 0;
    comboBonusCoins   = 0;
    milestones    = new Set();
    waveCount     = 0;
    runRewardsGranted = false;
    gearDrops     = [];
    equipUiVisible = false;

    // 시작 무기
    character.startWeapons.forEach(id => addWeapon(id));
    if (coop.role === 'host' && coop.guestConnected) initAllyPlayer();
    if (daily && !player.weapons.includes(daily.forcedWeapon)) addWeapon(daily.forcedWeapon);
    if (meta.pendingStartBoost) {
      player.rerolls += 1;
      const bonusWeapon = WEAPON_POOL.find(id => !player.weapons.includes(id));
      if (bonusWeapon && player.weapons.length < MAX_WEAPONS) addWeapon(bonusWeapon);
      meta.pendingStartBoost = false;
      saveMeta();
    }
    spawnWave();
    updateHUD();
    updateTowerButton();
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
    // 공격 무기 중 메인이 없으면 첫 공격 무기를 자동으로 메인 지정
    if (isAttackWeapon(id) && !player.mainWeapon) {
      player.mainWeapon = id;
    } else if (isAttackWeapon(id)) {
      floatTexts.push({ text: `⚙ ${WEAPON_DEFS[id].name} 보조로 추가 — E키로 메인 변경`, life: 2.6, maxLife: 2.6, screenSpace: true, color: '#74b9ff', size: 15 });
    }
    renderWeaponSlots();
  }

  // 진화: 기본 무기를 진화 무기로 교체 (최대 레벨 상태 유지)
  function evolveWeapon(evo) {
    const baseIdx = player.weapons.indexOf(evo.base);
    if (baseIdx === -1) return;
    const wasActive = isWeaponActive(evo.base);
    player.weapons[baseIdx] = evo.id;
    player.weaponLevels[evo.id] = MAX_WEAPON_LEVEL;
    delete player.weaponLevels[evo.base];
    delete player.weaponCDs[evo.base];
    player.weaponCDs[evo.id] = 0;
    // 진화 전 무기가 메인이었으면 진화 후 무기도 메인으로 유지
    if (player.mainWeapon === evo.base) player.mainWeapon = evo.id;
    showEvolutionCelebration(evo);
    renderWeaponSlots();
    if (!meta.achievements.evolve1) {
      meta.achievements.evolve1 = true;
      ensureMetaAchievements();
      saveMeta();
    }
  }

  function ensureAudioContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playEvolutionChime() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;
    const now = ctxAudio.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.type = idx === 3 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.055 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.055 + 0.42);
      osc.connect(gain).connect(ctxAudio.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.45);
    });
  }

  function showEvolutionCelebration(evo) {
    const evolved = WEAPON_DEFS[evo.id];
    const base = WEAPON_DEFS[evo.base];
    const banner = document.getElementById('evolutionBanner');
    const title = document.getElementById('evolutionBannerTitle');
    const detail = document.getElementById('evolutionBannerDetail');

    for (let i = 0; i < 84; i++) {
      const ring = i % 3;
      spawnParticle(player.x, player.y, ring === 0 ? '#f1c40f' : (ring === 1 ? '#ffffff' : '#8e44ad'), 5 + Math.random() * 10, 0.7 + Math.random() * 0.5);
    }
    screenShake = Math.min(screenShake + 0.65, 0.9);
    hitStop = Math.max(hitStop, 0.16);   // 진화 순간 극적인 정지
    evolveFlash = 0.55;                  // 금빛 섬광 (정지 동안 유지 후 페이드)
    floatTexts.push({
      text: `EVOLVED: ${evolved.icon} ${evolved.name}`,
      life: 3.0,
      maxLife: 3.0,
      screenSpace: true,
      color: '#f1c40f',
      size: 25,
    });
    playEvolutionChime();

    if (!banner || !title || !detail) return;
    title.textContent = `${evolved.icon} ${evolved.name}`;
    detail.textContent = `${base.name} Lv.5 + ${evo.reqName}`;
    banner.classList.add('visible');
    if (evolutionBannerTimer) clearTimeout(evolutionBannerTimer);
    evolutionBannerTimer = setTimeout(() => {
      banner.classList.remove('visible');
      evolutionBannerTimer = null;
    }, 2600);
  }

  // 패시브 적용 + 보유 기록 + 시너지 신규 해금 알림
  function applyPassive(pv) {
    const prevActive = SYNERGY_DEFS.filter(s => hasSynergy(s.id));
    pv.apply(player);
    player.passives[pv.id] = (player.passives[pv.id] || 0) + 1;
    for (const s of SYNERGY_DEFS) {
      if (hasSynergy(s.id) && !prevActive.find(p => p.id === s.id)) {
        floatTexts.push({ text: `✨ 시너지 해금: ${s.icon} ${s.name}!`, life: 3.0, maxLife: 3.0, screenSpace: true, color: '#c39bd3', size: 17 });
        SFX.levelup();
      }
    }
  }

  // 패시브 현재 스택 수
  function passiveLevel(id) {
    return (player && player.passives[id]) || 0;
  }
  // 패시브가 최대 스택에 도달했는지 — 도달하면 선택지에서 제외
  function isPassiveMaxed(pv) {
    return pv.max != null && passiveLevel(pv.id) >= pv.max;
  }

  function slashModLevel(id) {
    return player && player.slashMods ? (player.slashMods[id] || 0) : 0;
  }

  function applySlashSupport(def) {
    if (!player.slashMods) player.slashMods = {};
    const current = slashModLevel(def.id);
    if (current >= def.max) return;
    player.slashMods[def.id] = current + 1;
    renderWeaponSlots();
    floatTexts.push({
      text: `SLASH SUPPORT: ${def.name}`,
      life: 1.8,
      maxLife: 1.8,
      screenSpace: true,
      color: '#f8c8ff',
      size: 17,
    });
  }

  function slashStats() {
    const cleave = slashModLevel('cleave');
    const rupture = slashModLevel('rupture');
    const echo = slashModLevel('echo');
    return {
      cleave,
      rupture,
      echo,
      range: DASH_RANGE + cleave * 18,
      width: 26 + cleave * 9,
      damageMult: 1 + cleave * 0.18 + Math.min(comboCount, 30) * 0.01,
      ruptureDpsMult: rupture ? 0.16 + rupture * 0.08 : 0,
      ruptureTime: rupture ? 1.8 + rupture * 0.35 : 0,
      echoCount: echo,
    };
  }

  // ── 무기 활성화 / 시너지 헬퍼 ────────────────────────────────────
  function weaponFamily(id) { return WEAPON_FAMILY[id] || id; }
  function isAttackWeapon(id) { return !NON_ATTACK_WEAPONS.has(id); }
  // 메인 무기 반환 (미지정 시 첫 번째 공격 무기 자동 선택)
  function getMainWeapon() {
    if (!player) return null;
    if (player.mainWeapon && player.weapons.includes(player.mainWeapon)) return player.mainWeapon;
    return player.weapons.find(w => isAttackWeapon(w)) || null;
  }
  // 해당 무기가 현재 메인인지 여부 (방어 무기는 항상 독립 발사)
  function isWeaponActive(id) {
    if (!player) return true;
    if (!isAttackWeapon(id)) return true;
    return id === getMainWeapon();
  }
  // 보조 무기 계열 목록 (보유 중, 공격 무기, 메인 계열 제외, 중복 제거)
  function getAuxFamilies() {
    if (!player) return [];
    const mainId = getMainWeapon();
    const mainFam = mainId ? weaponFamily(mainId) : null;
    const seen = new Set();
    return player.weapons
      .filter(w => isAttackWeapon(w) && w !== mainId)
      .map(w => weaponFamily(w))
      .filter(f => { if (f === mainFam || seen.has(f)) return false; seen.add(f); return true; });
  }
  function ownsFamily(fam) {
    return !!(player && player.weapons.some(w => weaponFamily(w) === fam));
  }
  // 보조 효과 발동 — 메인 무기 발사 시 각 보조 계열의 오버레이 효과를 적용
  function triggerAuxEffects(target, baseDmg) {
    if (!player || !target) return;
    const auxFams = getAuxFamilies();
    if (!auxFams.length) return;
    const tx = target.x, ty = target.y;
    const rng = (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1);
    for (const fam of auxFams) {
      const def = AUX_EFFECT_DEFS[fam];
      if (!def || Math.random() > def.proc) continue;
      switch (fam) {
        case 'bomb':
          chainExplosions.push({ x: tx, y: ty, range: 65 * rng, dmg: baseDmg * 0.45, delay: 0 });
          rings.push({ x: tx, y: ty, r: 4, maxR: 60 * rng, life: 0.18, maxLife: 0.18, color: '#e67e22' });
          break;
        case 'chain': {
          let cx = tx, cy = ty;
          const hitSet = new Set();
          hitSet.add(target);
          for (let b = 0; b < 2; b++) {
            let best = null, bd2 = 240;
            for (const e of enemies) {
              if (e.dying || hitSet.has(e)) continue;
              const d2 = Math.hypot(e.x - cx, e.y - cy);
              if (d2 < bd2) { bd2 = d2; best = e; }
            }
            if (!best) break;
            hitSet.add(best);
            projectiles.push({ type: 'arc', x: cx, y: cy, tx: best.x, ty: best.y, life: 0.18, dmg: 0 });
            dealDamage(best, baseDmg * 0.55);
            cx = best.x; cy = best.y;
          }
          break;
        }
        case 'laser': {
          const ang = Math.atan2(ty - player.y, tx - player.x);
          projectiles.push({ type: 'laser', x: player.x, y: player.y, angle: ang, r: 5, dmg: baseDmg * 0.65, life: 0.16, length: 160 * rng, noSyn: true });
          break;
        }
        case 'boomerang':
          for (let b = 0; b < 3; b++) {
            const ba = Math.atan2(ty - player.y, tx - player.x) + (b - 1) * 0.38;
            projectiles.push({ type: 'boomerang', x: player.x, y: player.y, vx: Math.cos(ba) * 310, vy: Math.sin(ba) * 310, r: 5, dmg: baseDmg * 0.35, life: 0.9, halfLife: 0.45, flipped: false, pierceOut: 2, pierceIn: 2, hitOut: new Set(), hitIn: new Set(), noSyn: true });
          }
          break;
        case 'orb': {
          const aoeR = 70 * rng;
          for (const e of enemies) {
            if (!e.dying && Math.hypot(e.x - tx, e.y - ty) < aoeR) dealDamage(e, baseDmg * 0.40);
          }
          rings.push({ x: tx, y: ty, r: 4, maxR: aoeR, life: 0.25, maxLife: 0.25, color: '#3498db' });
          break;
        }
        case 'nova':
          chainExplosions.push({ x: tx, y: ty, range: 85 * rng, dmg: baseDmg * 0.50, delay: 0 });
          break;
        case 'scythe': {
          const sAng = Math.atan2(ty - player.y, tx - player.x);
          const sR = 100 * rng;
          for (const e of enemies) {
            if (e.dying) continue;
            const eDist = Math.hypot(e.x - player.x, e.y - player.y);
            if (eDist > sR) continue;
            const eA = Math.atan2(e.y - player.y, e.x - player.x);
            let diff = Math.abs(((eA - sAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (diff < Math.PI * 0.55) dealDamage(e, baseDmg * 0.50);
          }
          rings.push({ x: player.x, y: player.y, r: 6, maxR: sR, life: 0.2, maxLife: 0.2, color: '#ecf0f1' });
          break;
        }
        case 'arrow': {
          const aA = Math.atan2(ty - player.y, tx - player.x);
          projectiles.push({ type: 'arrow', x: player.x, y: player.y, vx: Math.cos(aA) * 420, vy: Math.sin(aA) * 420, r: 5, dmg: baseDmg * 0.50, life: 0.8, pierce: 3 + (player.pierceBonus || 0), noSyn: true });
          break;
        }
        case 'shield':
          player._auxShieldTime = (player._auxShieldTime || 0) + 0.5;
          break;
      }
    }
  }

  // 시너지 조건 충족 여부 확인
  function hasSynergy(id) {
    if (!player) return false;
    const def = SYNERGY_DEFS.find(s => s.id === id);
    if (!def) return false;
    return def.requires.every(r => (player.passives[r.id] || 0) >= r.count);
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

  function evolvedWeaponCount() {
    if (!player) return 0;
    return player.weapons.filter(id => WEAPON_DEFS[id] && WEAPON_DEFS[id].evolved).length;
  }

  function missedEvolutionHints() {
    if (!player) return [];
    const hints = [];
    for (const evo of EVOLUTION_DEFS) {
      if (player.weapons.includes(evo.id)) continue;
      const base = WEAPON_DEFS[evo.base];
      const evolved = WEAPON_DEFS[evo.id];
      const hasBase = player.weapons.includes(evo.base);
      const baseMaxed = hasBase && (player.weaponLevels[evo.base] || 1) >= MAX_WEAPON_LEVEL;
      const hasPassive = !!player.passives[evo.req];
      if (baseMaxed && !hasPassive) {
        hints.push(`${base.name} Lv.5 needed ${evo.reqName} for ${evolved.name}`);
      } else if (hasPassive && hasBase && !baseMaxed) {
        hints.push(`${base.name} needed Lv.5 to evolve with ${evo.reqName}`);
      }
      if (hints.length >= 3) break;
    }
    return hints;
  }

  // Evolution plan state for start, pause, and level-up surfaces.
  function evolutionProgress(evo) {
    const base = WEAPON_DEFS[evo.base];
    const evolved = WEAPON_DEFS[evo.id];
    const starterWeapons = player ? [] : (currentCharacter().startWeapons || []);
    const hasBase = player ? player.weapons.includes(evo.base) : starterWeapons.includes(evo.base);
    const hasEvolved = player ? player.weapons.includes(evo.id) : false;
    const baseLevel = player ? (player.weaponLevels[evo.base] || (hasBase ? 1 : 0)) : (hasBase ? 1 : 0);
    const baseMaxed = hasBase && baseLevel >= MAX_WEAPON_LEVEL;
    const hasPassive = player ? !!player.passives[evo.req] : false;
    let stateText = `Need ${base.name}`;
    let stateClass = 'missing';
    let priority = 5;

    if (hasEvolved) {
      stateText = 'Evolved';
      stateClass = 'evolved';
      priority = 3;
    } else if (baseMaxed && hasPassive) {
      stateText = 'Ready on next level-up';
      stateClass = 'ready';
      priority = 0;
    } else if (hasBase && hasPassive) {
      stateText = `Need ${MAX_WEAPON_LEVEL - baseLevel} more ${base.name} levels`;
      stateClass = 'progress';
      priority = 1;
    } else if (baseMaxed) {
      stateText = `Need ${evo.reqName}`;
      stateClass = 'progress';
      priority = 1;
    } else if (hasBase) {
      stateText = `Lv.${baseLevel}/${MAX_WEAPON_LEVEL} - find ${evo.reqName}`;
      stateClass = 'progress';
      priority = 2;
    } else if (hasPassive) {
      stateText = `Find ${base.name}`;
      stateClass = 'progress';
      priority = 2;
    }

    return { evo, base, evolved, hasBase, hasEvolved, baseLevel, baseMaxed, hasPassive, stateText, stateClass, priority };
  }

  function renderEvolutionPlan(container, options = {}) {
    if (!container) return;
    container.textContent = '';
    const compact = !!options.compact;
    const rows = EVOLUTION_DEFS
      .map(evolutionProgress)
      .sort((a, b) => a.priority - b.priority);
    const visibleRows = compact ? rows.slice(0, 3) : rows;

    const title = document.createElement('div');
    title.className = 'evolution-plan-title';
    title.textContent = compact ? 'Evolution Plan' : 'Evolution Recipes';
    container.appendChild(title);

    visibleRows.forEach(row => {
      const item = document.createElement('div');
      item.className = `evolution-plan-row ${row.stateClass}`;

      const recipe = document.createElement('div');
      recipe.className = 'evolution-recipe';
      recipe.textContent = `${row.base.icon} ${row.base.name} Lv.5 + ${row.evo.reqName}`;

      const result = document.createElement('div');
      result.className = 'evolution-result';
      result.textContent = `${row.evolved.icon} ${row.evolved.name}`;

      const status = document.createElement('div');
      status.className = 'evolution-status';
      status.textContent = row.stateText;

      item.append(recipe, result, status);
      container.appendChild(item);
    });
  }

  // 이지스 진화 효과: 보호막 발동 시 주변 적에게 반사 피해
  function aegisReflect(dmg, range) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (dist(e, player) < range) dealDamage(e, dmg);
    }
    spawnParticle(player.x, player.y, '#5dade2', 30, 0.6);
  }

  // 요소가 없어도(구버전 캐시 등) 죽지 않는 안전한 textContent 설정
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function loadMeta() {
    const fallback = {
      coins: 0,
      bestTime: 0,
      bestKills: 0,
      unlockedCharacters: ['knight'],
      achievements: {},
      upgrades: {},
      unlockedMaps: ['meadow'],
      lastCharacter: 'knight',
      lastDifficulty: 'normal',
      lastMap: 'meadow',
      dailyChallengeEnabled: false,
      dailyCompletions: {},
      pendingStartBoost: false,
      adsRemoved: false,
      premiumCharacters: [],
      goblinKills: 0,
    };
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      return {
        ...fallback,
        ...saved,
        unlockedCharacters: Array.isArray(saved.unlockedCharacters) && saved.unlockedCharacters.length ? saved.unlockedCharacters : fallback.unlockedCharacters,
        achievements: saved.achievements && typeof saved.achievements === 'object' ? saved.achievements : fallback.achievements,
        upgrades: saved.upgrades && typeof saved.upgrades === 'object' ? saved.upgrades : fallback.upgrades,
        unlockedMaps: Array.isArray(saved.unlockedMaps) && saved.unlockedMaps.length ? saved.unlockedMaps : fallback.unlockedMaps,
        dailyCompletions: saved.dailyCompletions && typeof saved.dailyCompletions === 'object' ? saved.dailyCompletions : fallback.dailyCompletions,
        premiumCharacters: Array.isArray(saved.premiumCharacters) ? saved.premiumCharacters : fallback.premiumCharacters,
        adsRemoved: !!saved.adsRemoved,
      };
    } catch (_err) {
      return fallback;
    }
  }

  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (_err) {}
    syncAdSettings();
  }

  function cloneForSnapshot(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function saveRunSnapshot(reason) {
    if (!player || (state !== 'playing' && state !== 'paused')) return false;
    const snapshot = {
      version: 1,
      savedAt: Date.now(),
      reason: reason || 'auto',
      selectedCharacterId,
      selectedDifficultyId,
      selectedMapId,
      dailyChallengeEnabled,
      selectedStageIdx,
      player: cloneForSnapshot(player),
      allyPlayer: allyPlayer ? cloneForSnapshot(allyPlayer) : null,
      enemies: cloneForSnapshot(enemies),
      projectiles: cloneForSnapshot(projectiles),
      xpGems: cloneForSnapshot(xpGems),
      itemBoxes: cloneForSnapshot(itemBoxes),
      hybridTowers: cloneForSnapshot(hybridTowers),
      slashEchoes: cloneForSnapshot(slashEchoes),
      enemyProjectiles: cloneForSnapshot(enemyProjectiles),
      damageNumbers: cloneForSnapshot(damageNumbers),
      floatTexts: cloneForSnapshot(floatTexts.filter(text => !text.screenSpace)),
      elapsed,
      kills,
      waveTimer,
      camera: cloneForSnapshot(camera),
      dashCd,
      dashEffect: dashEffect ? cloneForSnapshot(dashEffect) : null,
      screenShake,
      lastMoveDir: cloneForSnapshot(lastMoveDir),
      selectedTowerTypeIdx,
      towerRecharge,
      itemBoxTimer,
      nextBossTime,
      bossActive,
      bossWarning,
      comboCount,
      comboTimer,
      comboMilestoneIdx,
      comboBonusCoins,
      milestones: Array.from(milestones),
      waveCount,
    };
    try {
      localStorage.setItem(RUN_SNAPSHOT_KEY, JSON.stringify(snapshot));
      lastRunSnapshotAt = elapsed || lastRunSnapshotAt;
      return true;
    } catch (_err) {
      return false;
    }
  }

  function loadRunSnapshot() {
    try {
      const raw = localStorage.getItem(RUN_SNAPSHOT_KEY);
      if (!raw) return null;
      const snapshot = JSON.parse(raw);
      if (!snapshot || snapshot.version !== 1 || !snapshot.player || !Array.isArray(snapshot.player.weapons)) return null;
      if (!snapshot.savedAt || Date.now() - snapshot.savedAt > RUN_SNAPSHOT_MAX_AGE_MS) {
        clearRunSnapshot();
        return null;
      }
      return snapshot;
    } catch (_err) {
      return null;
    }
  }

  function clearRunSnapshot() {
    try { localStorage.removeItem(RUN_SNAPSHOT_KEY); } catch (_err) {}
  }

  function restoreRunSnapshot(snapshot) {
    if (!snapshot || !snapshot.player) return false;
    if (frameId) cancelAnimationFrame(frameId);
    clearEndActions();
    selectedCharacterId = snapshot.selectedCharacterId || selectedCharacterId;
    selectedDifficultyId = snapshot.selectedDifficultyId || selectedDifficultyId;
    selectedMapId = snapshot.selectedMapId || selectedMapId;
    dailyChallengeEnabled = !!snapshot.dailyChallengeEnabled;
    selectedStageIdx = Number(snapshot.selectedStageIdx) || 0;
    player = snapshot.player;
    // 구버전 저장본 호환: mainWeapon 누락 시 첫 공격 무기를 메인으로 자동 지정
    if (player && player.mainWeapon === undefined) {
      player.mainWeapon = (player.weapons || []).find(w => isAttackWeapon(w)) || null;
    }
    // weaponActive 키가 있는 구버전 저장본은 그냥 무시 (새 시스템에서 사용 안 함)
    allyPlayer = snapshot.allyPlayer || null;
    enemies = Array.isArray(snapshot.enemies) ? snapshot.enemies : [];
    projectiles = Array.isArray(snapshot.projectiles) ? snapshot.projectiles : [];
    xpGems = Array.isArray(snapshot.xpGems) ? snapshot.xpGems : [];
    particles = [];
    chainExplosions = [];
    itemBoxes = Array.isArray(snapshot.itemBoxes) ? snapshot.itemBoxes : [];
    hybridTowers = Array.isArray(snapshot.hybridTowers) ? snapshot.hybridTowers : [];
    slashEchoes = Array.isArray(snapshot.slashEchoes) ? snapshot.slashEchoes : [];
    enemyProjectiles = Array.isArray(snapshot.enemyProjectiles) ? snapshot.enemyProjectiles : [];
    damageNumbers = Array.isArray(snapshot.damageNumbers) ? snapshot.damageNumbers : [];
    floatTexts = [{ text: 'Saved run restored', life: 2, maxLife: 2, screenSpace: true, color: '#f1c40f', size: 18 }]
      .concat(Array.isArray(snapshot.floatTexts) ? snapshot.floatTexts : []);
    elapsed = Number(snapshot.elapsed) || 0;
    kills = Number(snapshot.kills) || 0;
    waveTimer = Number(snapshot.waveTimer) || 0;
    camera = snapshot.camera || { x: 0, y: 0 };
    dashCd = Number(snapshot.dashCd) || 0;
    dashEffect = snapshot.dashEffect || null;
    screenShake = Number(snapshot.screenShake) || 0;
    lastMoveDir = snapshot.lastMoveDir || { dx: 1, dy: 0 };
    selectedTowerTypeIdx = Number(snapshot.selectedTowerTypeIdx) || 0;
    towerRecharge = Number(snapshot.towerRecharge) || 0;
    itemBoxTimer = Number(snapshot.itemBoxTimer) || 0;
    nextBossTime = Number(snapshot.nextBossTime) || (currentDifficulty().bossInterval || BOSS_INTERVAL);
    bossActive = !!snapshot.bossActive;
    bossWarning = Number(snapshot.bossWarning) || 0;
    comboCount = Number(snapshot.comboCount) || 0;
    comboTimer = Number(snapshot.comboTimer) || 0;
    comboMilestoneIdx = Number(snapshot.comboMilestoneIdx) || 0;
    comboBonusCoins = Number(snapshot.comboBonusCoins) || 0;
    milestones = new Set(Array.isArray(snapshot.milestones) ? snapshot.milestones : []);
    waveCount = Number(snapshot.waveCount) || 0;
    runRewardsGranted = false;
    currentChoiceBuilder = null;
    freeRerollUsed = false;
    state = 'paused';
    lastRunSnapshotAt = elapsed;
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('levelOverlay').style.display = 'none';
    const pauseOverlay = document.getElementById('pauseOverlay');
    if (pauseOverlay) pauseOverlay.style.display = 'flex';
    const pauseDetail = document.getElementById('pauseDetail');
    if (pauseDetail) pauseDetail.textContent = `Saved at ${fmtTime(elapsed)}. Resume when ready.`;
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = '';
    const towerBtn = document.getElementById('towerBtn');
    if (towerBtn) towerBtn.style.display = '';
    renderStageSelect();
    renderWeaponSlots();
    updateHUD();
    updateTowerButton();
    lastTime = performance.now();
    frameId = requestAnimationFrame(loop);
    return true;
  }

  function syncAdSettings() {
    if (window.AdMobHelper && typeof AdMobHelper.setAdsRemoved === 'function') {
      AdMobHelper.setAdsRemoved(!!meta.adsRemoved);
    }
  }

  function coopShareUrl(roomId) {
    const url = new URL(window.location.href);
    url.searchParams.set('vpsRoom', roomId);
    return url.toString();
  }

  function setCoopStatus(text) {
    const el = document.getElementById('coopStatus');
    if (el) el.textContent = text;
  }

  function ensureCoopSocket() {
    if (coop.socket || typeof io !== 'function') return coop.socket;
    coop.socket = io({ reconnectionAttempts: 10 });
    coop.socket.on('vps:room:created', ({ roomId }) => {
      coop.role = 'host';
      coop.roomId = roomId;
      setCoopStatus(`Co-op room ready. Share: ${coopShareUrl(roomId)}`);
      renderStartOptions();
    });
    coop.socket.on('vps:room:joined', ({ roomId }) => {
      coop.role = 'guest';
      coop.roomId = roomId;
      setCoopStatus('Joined as co-op guest. Use keyboard or touch joystick to control the ally.');
      document.getElementById('overlay').classList.remove('visible');
      state = 'coop-guest';
      renderStartOptions();
    });
    coop.socket.on('vps:guest:joined', () => {
      coop.guestConnected = true;
      setCoopStatus('Guest connected. Start a run and they will control the ally.');
      if (player && !allyPlayer) initAllyPlayer();
      renderStartOptions();
    });
    coop.socket.on('vps:guest:left', () => {
      coop.guestConnected = false;
      setCoopStatus('Guest disconnected. The ally will hold position.');
      renderStartOptions();
    });
    coop.socket.on('vps:guest:input', ({ input }) => {
      coop.guestInput = input || coop.guestInput;
    });
    coop.socket.on('vps:state', ({ snapshot }) => {
      coop.mirrorSnapshot = snapshot;
    });
    coop.socket.on('vps:room:closed', ({ reason }) => {
      setCoopStatus(`Co-op room closed: ${reason || 'ended'}`);
      coop.role = 'solo';
      coop.roomId = null;
      coop.guestConnected = false;
      coop.mirrorSnapshot = null;
      renderStartOptions();
    });
    coop.socket.on('vps:error', ({ message }) => {
      setCoopStatus(message || 'Co-op connection failed.');
    });
    return coop.socket;
  }

  function hostCoopRoom() {
    const socket = ensureCoopSocket();
    if (!socket) {
      setCoopStatus('Co-op requires Socket.io on the server.');
      return;
    }
    socket.emit('vps:room:create');
    setCoopStatus('Creating co-op room...');
  }

  function joinCoopRoom(roomId) {
    const socket = ensureCoopSocket();
    if (!socket || !roomId) return;
    socket.emit('vps:room:join', { roomId });
    setCoopStatus('Joining co-op room...');
  }

  function initAllyPlayer() {
    if (!player) return;
    allyPlayer = {
      x: player.x + 46,
      y: player.y + 12,
      speed: player.speed * 0.98,
      radius: 11,
      dashCd: 0,
      towerCd: 0,
      attackCd: 0,
      lastMoveDir: { dx: 1, dy: 0 },
    };
  }

  function sendGuestInput(force) {
    if (coop.role !== 'guest' || !coop.socket || !coop.roomId) return;
    const now = performance.now();
    if (!force && now - coop.lastInputSentAt < 80) return;
    coop.lastInputSentAt = now;
    const input = getMoveDir();
    coop.socket.emit('vps:guest:input', {
      roomId: coop.roomId,
      input: {
        dx: input.dx,
        dy: input.dy,
        dash: !!(keys[' '] || keys.x || keys.X),
        tower: !!(keys.t || keys.T),
      },
    });
  }

  function sendHostCoopState(force) {
    if (coop.role !== 'host' || !coop.socket || !coop.roomId || !coop.guestConnected || !player) return;
    const now = performance.now();
    if (!force && now - coop.lastStateSentAt < 180) return;
    coop.lastStateSentAt = now;
    coop.socket.emit('vps:host:state', {
      roomId: coop.roomId,
      snapshot: {
        state,
        elapsed,
        kills,
        hp: player.hp,
        maxHp: player.maxHp,
        level: player.level,
        host: { x: player.x, y: player.y },
        guest: allyPlayer ? { x: allyPlayer.x, y: allyPlayer.y } : null,
        enemies: enemies.slice(0, 30).map(e => ({
          x: e.x,
          y: e.y,
          size: e.size,
          hpPct: e.maxHp ? e.hp / e.maxHp : 0,
          color: ENEMY_COLORS[e.type] || '#e74c3c',
        })),
      },
    });
  }

  function renderCoopGuestMirror() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 누적 변환 자가 복구 (render와 동일)
    const W = canvas.width, H = canvas.height;
    const snap = coop.mirrorSnapshot;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#101827';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#dfe6ff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Co-op Guest Controller', W / 2, 48);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#9aa6c7';
    ctx.fillText('Move with WASD / arrows or touch joystick. Space = dash.', W / 2, 74);
    if (!snap) {
      ctx.fillText('Waiting for host run state...', W / 2, H / 2);
      return;
    }
    ctx.fillStyle = '#f1c40f';
    ctx.fillText(`Time ${fmtTime(snap.elapsed || 0)}  Lv.${snap.level || 1}  ${snap.kills || 0} kills  HP ${Math.ceil(snap.hp || 0)}/${Math.ceil(snap.maxHp || 1)}`, W / 2, 104);
    const cx = W / 2, cy = H / 2 + 30;
    const host = snap.host || { x: 0, y: 0 };
    const scale = 0.42;
    function sx(x) { return cx + (x - host.x) * scale; }
    function sy(y) { return cy + (y - host.y) * scale; }
    (snap.enemies || []).forEach(e => {
      ctx.beginPath();
      ctx.arc(sx(e.x), sy(e.y), Math.max(4, e.size * scale), 0, Math.PI * 2);
      ctx.fillStyle = e.color || '#e74c3c';
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    if (snap.guest) {
      ctx.beginPath();
      ctx.arc(sx(snap.guest.x), sy(snap.guest.y), 11, 0, Math.PI * 2);
      ctx.fillStyle = '#2ecc71';
      ctx.fill();
      ctx.fillStyle = '#06130d';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('G', sx(snap.guest.x), sy(snap.guest.y) + 1);
    }
    if (snap.host) {
      ctx.beginPath();
      ctx.arc(sx(snap.host.x), sy(snap.host.y), 12, 0, Math.PI * 2);
      ctx.fillStyle = '#f1c40f';
      ctx.fill();
      ctx.fillStyle = '#1b1300';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('H', sx(snap.host.x), sy(snap.host.y) + 1);
    }
  }

  function currentCharacter() {
    return CHARACTER_DEFS.find(ch => ch.id === selectedCharacterId) || CHARACTER_DEFS[0];
  }

  function currentDifficulty() {
    return DIFFICULTY_DEFS.find(diff => diff.id === selectedDifficultyId) || DIFFICULTY_DEFS[1];
  }

  function currentMap() {
    return MAP_DEFS.find(map => map.id === selectedMapId) || MAP_DEFS[0];
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function seededIndex(seed, length) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    return Math.abs(hash) % length;
  }

  function dailyChallenge() {
    const key = todayKey();
    const forcedWeapon = WEAPON_POOL[seededIndex(`${key}:weapon`, WEAPON_POOL.length)];
    const difficulty = DIFFICULTY_DEFS[1 + seededIndex(`${key}:difficulty`, DIFFICULTY_DEFS.length - 1)];
    return {
      key,
      name: `Daily ${key}`,
      desc: `Forced ${WEAPON_DEFS[forcedWeapon].name}, ${difficulty.name} pressure, +75 coins on clear.`,
      forcedWeapon,
      enemyHpMult: 1.08,
      spawnMult: 1.12,
      coinBonus: 75,
    };
  }

  function isMapUnlocked(def) {
    if (!def || !def.unlock || def.unlock.type === 'free') return true;
    if (meta.unlockedMaps.includes(def.id)) return true;
    return !!(def.unlock.achievement && meta.achievements[def.unlock.achievement]);
  }

  function unlockMap(id) {
    if (!meta.unlockedMaps.includes(id)) meta.unlockedMaps.push(id);
  }

  function upgradeLevel(id) {
    return Math.max(0, Math.min(Number(meta.upgrades[id]) || 0, (META_UPGRADE_DEFS.find(def => def.id === id) || {}).max || 0));
  }

  function upgradeCost(def) {
    const level = upgradeLevel(def.id);
    if (level >= def.max) return null;
    return def.baseCost + level * 80;
  }

  function isCharacterUnlocked(def) {
    if (!def || !def.unlock || def.unlock.type === 'free') return true;
    if (meta.unlockedCharacters.includes(def.id)) return true;
    if (isPremiumCharacterOwned(def.id)) return true;
    return !!(def.unlock.achievement && meta.achievements[def.unlock.achievement]);
  }

  function isPremiumCharacterOwned(id) {
    return Array.isArray(meta.premiumCharacters) && meta.premiumCharacters.includes(id);
  }

  function unlockCharacter(id) {
    if (!meta.unlockedCharacters.includes(id)) meta.unlockedCharacters.push(id);
  }

  async function purchasePremiumCharacter(def) {
    if (!def || !def.unlock || !def.unlock.premiumProduct) return false;
    if (!window.AdMobHelper || typeof AdMobHelper.purchasePremiumCharacter !== 'function') return false;
    const result = await AdMobHelper.purchasePremiumCharacter(def.unlock.premiumProduct);
    if (!result || !result.ok) return false;
    if (!Array.isArray(meta.premiumCharacters)) meta.premiumCharacters = [];
    if (!meta.premiumCharacters.includes(def.id)) meta.premiumCharacters.push(def.id);
    unlockCharacter(def.id);
    selectedCharacterId = def.id;
    meta.lastCharacter = def.id;
    saveMeta();
    return true;
  }

  function ensureMetaAchievements() {
    CHARACTER_DEFS.forEach(def => {
      if (isCharacterUnlocked(def)) unlockCharacter(def.id);
    });
    MAP_DEFS.forEach(def => {
      if (isMapUnlocked(def)) unlockMap(def.id);
    });
  }

  function ensureStartPanels() {
    const overlayBox = document.getElementById('overlayBox');
    if (!overlayBox) return;

    const headerStats = document.getElementById('hdr-stats');
    if (headerStats && !document.getElementById('pauseBtn')) {
      const pauseBtn = document.createElement('button');
      pauseBtn.id = 'pauseBtn';
      pauseBtn.className = 'guide-btn pause-btn';
      pauseBtn.type = 'button';
      pauseBtn.title = 'Pause (P)';
      pauseBtn.textContent = 'II';
      pauseBtn.style.display = 'none';
      pauseBtn.addEventListener('click', () => togglePause());
      const guideBtn = document.getElementById('guideBtn');
      headerStats.insertBefore(pauseBtn, guideBtn || null);
    }

    if (headerStats && !document.getElementById('towerBtn')) {
      const towerBtn = document.createElement('button');
      towerBtn.id = 'towerBtn';
      towerBtn.className = 'guide-btn tower-btn';
      towerBtn.type = 'button';
      towerBtn.title = 'Place tower (T)';
      towerBtn.textContent = 'TW';
      towerBtn.style.display = 'none';
      towerBtn.addEventListener('click', () => placeHybridTower());
      const pauseBtn = document.getElementById('pauseBtn');
      headerStats.insertBefore(towerBtn, pauseBtn || document.getElementById('guideBtn') || null);
    }

    if (headerStats && !document.getElementById('equipBtn')) {
      const equipBtn = document.createElement('button');
      equipBtn.id = 'equipBtn';
      equipBtn.className = 'guide-btn';
      equipBtn.type = 'button';
      equipBtn.title = '장비 창 (E키)';
      equipBtn.textContent = '⚔';
      equipBtn.addEventListener('click', () => toggleEquipUI());
      const guideBtn = document.getElementById('guideBtn');
      headerStats.insertBefore(equipBtn, guideBtn || null);
    }

    if (!document.getElementById('metaPanel')) {
      const metaPanel = document.createElement('div');
      metaPanel.id = 'metaPanel';
      metaPanel.className = 'meta-panel';
      overlayBox.insertBefore(metaPanel, document.getElementById('overlaySub') || document.getElementById('startBtn'));
    }

    if (!document.getElementById('characterSelect')) {
      const wrap = document.createElement('div');
      wrap.id = 'characterSelect';
      wrap.className = 'start-select-wrap';
      const title = document.createElement('div');
      title.className = 'start-select-title';
      title.textContent = 'Character';
      const grid = document.createElement('div');
      grid.className = 'start-select-grid';
      wrap.append(title, grid);
      overlayBox.insertBefore(wrap, document.getElementById('overlaySub') || document.getElementById('startBtn'));
    }

    if (!document.getElementById('difficultySelect')) {
      const wrap = document.createElement('div');
      wrap.id = 'difficultySelect';
      wrap.className = 'start-select-wrap';
      const title = document.createElement('div');
      title.className = 'start-select-title';
      title.textContent = 'Difficulty';
      const grid = document.createElement('div');
      grid.className = 'start-select-grid difficulty-grid';
      wrap.append(title, grid);
      overlayBox.insertBefore(wrap, document.getElementById('overlaySub') || document.getElementById('startBtn'));
    }

    if (!document.getElementById('mapSelect')) {
      const wrap = document.createElement('div');
      wrap.id = 'mapSelect';
      wrap.className = 'start-select-wrap';
      const title = document.createElement('div');
      title.className = 'start-select-title';
      title.textContent = 'Map';
      const grid = document.createElement('div');
      grid.className = 'start-select-grid map-grid';
      wrap.append(title, grid);
      overlayBox.insertBefore(wrap, document.getElementById('overlaySub') || document.getElementById('startBtn'));
    }

    if (!document.getElementById('evolutionPlanPanel')) {
      const panel = document.createElement('div');
      panel.id = 'evolutionPlanPanel';
      panel.className = 'start-select-wrap evolution-plan';
      overlayBox.insertBefore(panel, document.getElementById('overlaySub') || document.getElementById('startBtn'));
    }

    if (!document.getElementById('dailyPanel')) {
      const panel = document.createElement('div');
      panel.id = 'dailyPanel';
      panel.className = 'daily-panel';
      overlayBox.insertBefore(panel, document.getElementById('overlaySub') || document.getElementById('startBtn'));
    }

    if (!document.getElementById('upgradePanel')) {
      const wrap = document.createElement('div');
      wrap.id = 'upgradePanel';
      wrap.className = 'start-select-wrap upgrade-panel';
      const title = document.createElement('div');
      title.className = 'start-select-title';
      title.textContent = 'Permanent Upgrades';
      const grid = document.createElement('div');
      grid.className = 'start-select-grid upgrade-grid';
      wrap.append(title, grid);
      overlayBox.insertBefore(wrap, document.getElementById('overlaySub') || document.getElementById('startBtn'));
    }

    if (!document.getElementById('startBoostPanel')) {
      const panel = document.createElement('div');
      panel.id = 'startBoostPanel';
      panel.className = 'daily-panel start-boost-panel';
      overlayBox.insertBefore(panel, document.getElementById('startBtn'));
    }

    if (!document.getElementById('monetizationPanel')) {
      const panel = document.createElement('div');
      panel.id = 'monetizationPanel';
      panel.className = 'daily-panel monetization-panel';
      overlayBox.insertBefore(panel, document.getElementById('startBtn'));
    }

    if (!document.getElementById('resumePanel')) {
      const panel = document.createElement('div');
      panel.id = 'resumePanel';
      panel.className = 'daily-panel resume-panel';
      overlayBox.insertBefore(panel, document.getElementById('startBtn'));
    }

    if (!document.getElementById('coopPanel')) {
      const panel = document.createElement('div');
      panel.id = 'coopPanel';
      panel.className = 'daily-panel coop-panel';
      overlayBox.insertBefore(panel, document.getElementById('startBtn'));
    }

    const wrapper = document.getElementById('gameWrapper');
    if (wrapper && !document.getElementById('evolutionBanner')) {
      const banner = document.createElement('div');
      banner.id = 'evolutionBanner';
      banner.className = 'evolution-banner';
      const kicker = document.createElement('div');
      kicker.className = 'evolution-banner-kicker';
      kicker.textContent = 'Weapon Evolved';
      const title = document.createElement('div');
      title.id = 'evolutionBannerTitle';
      title.className = 'evolution-banner-title';
      const detail = document.createElement('div');
      detail.id = 'evolutionBannerDetail';
      detail.className = 'evolution-banner-detail';
      banner.append(kicker, title, detail);
      wrapper.appendChild(banner);
    }

    if (wrapper && !document.getElementById('pauseOverlay')) {
      const pauseOverlay = document.createElement('div');
      pauseOverlay.id = 'pauseOverlay';
      pauseOverlay.className = 'pause-overlay';
      pauseOverlay.style.display = 'none';
      const box = document.createElement('div');
      box.id = 'pauseBox';
      const title = document.createElement('div');
      title.className = 'pause-title';
      title.textContent = 'Paused';
      const detail = document.createElement('p');
      detail.id = 'pauseDetail';
      detail.textContent = 'Run is safely paused. Press P or resume to continue.';
      const plan = document.createElement('div');
      plan.id = 'pauseEvolutionPlan';
      plan.className = 'evolution-plan pause-evolution-plan';
      const actions = document.createElement('div');
      actions.className = 'pause-actions';
      const resume = document.createElement('button');
      resume.id = 'resumeBtn';
      resume.type = 'button';
      resume.textContent = 'Resume';
      resume.addEventListener('click', () => setPaused(false));
      const restart = document.createElement('button');
      restart.id = 'restartBtn';
      restart.type = 'button';
      restart.className = 'secondary-btn';
      restart.textContent = 'Restart';
      restart.addEventListener('click', () => {
        setPaused(false);
        endGame('dead');
      });
      actions.append(resume, restart);
      box.append(title, detail, plan, actions);
      pauseOverlay.appendChild(box);
      wrapper.appendChild(pauseOverlay);
    }
  }

  function renderStartOptions() {
    ensureMetaAchievements();
    const metaPanel = document.getElementById('metaPanel');
    if (metaPanel) {
      metaPanel.textContent = '';
      const coins = document.createElement('span');
      coins.textContent = `Coins ${Math.floor(meta.coins || 0)}`;
      const best = document.createElement('span');
      best.textContent = `Best ${fmtTime(meta.bestTime || 0)} / ${meta.bestKills || 0} K`;
      const badges = document.createElement('span');
      badges.textContent = `Achievements ${Object.keys(meta.achievements || {}).filter(id => meta.achievements[id]).length}`;
      const ads = document.createElement('span');
      ads.textContent = meta.adsRemoved ? 'Ads Off' : 'Ads On';
      metaPanel.append(coins, best, badges, ads);
    }

    renderEvolutionPlan(document.getElementById('evolutionPlanPanel'));

    const charGrid = document.querySelector('#characterSelect .start-select-grid');
    if (charGrid) {
      charGrid.textContent = '';
      CHARACTER_DEFS.forEach(def => {
        const unlocked = isCharacterUnlocked(def);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `start-card character-card${def.id === selectedCharacterId ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
        const title = document.createElement('div');
        title.className = 'start-card-title';
        title.textContent = `${def.icon} ${def.name}`;
        const desc = document.createElement('div');
        desc.className = 'start-card-desc';
        desc.textContent = def.desc;
        const metaText = document.createElement('div');
        metaText.className = 'start-card-meta';
        const coinTag = def.coinMult && def.coinMult !== 1 ? ` / ${Math.round(def.coinMult * 100)}% coins` : '';
        metaText.textContent = unlocked
          ? `Starts with ${def.startWeapons.join(', ')}${coinTag}${isPremiumCharacterOwned(def.id) ? ' / Premium owned' : ''}`
          : (def.unlock && def.unlock.label ? def.unlock.label : 'Locked');
        btn.append(title, desc, metaText);
        btn.addEventListener('click', async () => {
          if (!isCharacterUnlocked(def)) {
            const cost = def.unlock && def.unlock.cost ? def.unlock.cost : 0;
            if (cost && meta.coins >= cost) {
              meta.coins -= cost;
              unlockCharacter(def.id);
              saveMeta();
            } else if (await purchasePremiumCharacter(def)) {
              renderStartOptions();
              return;
            } else {
              return;
            }
          }
          selectedCharacterId = def.id;
          meta.lastCharacter = def.id;
          saveMeta();
          renderStartOptions();
        });
        charGrid.appendChild(btn);
      });
    }

    const diffGrid = document.querySelector('#difficultySelect .start-select-grid');
    if (diffGrid) {
      diffGrid.textContent = '';
      DIFFICULTY_DEFS.forEach(def => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `start-card difficulty-card${def.id === selectedDifficultyId ? ' selected' : ''}`;
        const title = document.createElement('div');
        title.className = 'start-card-title';
        title.textContent = def.name;
        const desc = document.createElement('div');
        desc.className = 'start-card-desc';
        desc.textContent = def.desc;
        const metaText = document.createElement('div');
        metaText.className = 'start-card-meta';
        metaText.textContent = `${Math.round(def.coinMult * 100)}% coin reward`;
        btn.append(title, desc, metaText);
        btn.addEventListener('click', () => {
          selectedDifficultyId = def.id;
          meta.lastDifficulty = def.id;
          saveMeta();
          renderStartOptions();
        });
        diffGrid.appendChild(btn);
      });
    }

    const mapGrid = document.querySelector('#mapSelect .start-select-grid');
    if (mapGrid) {
      mapGrid.textContent = '';
      MAP_DEFS.forEach(def => {
        const unlocked = isMapUnlocked(def);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `start-card map-card${def.id === selectedMapId ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
        const title = document.createElement('div');
        title.className = 'start-card-title';
        title.textContent = def.name;
        const desc = document.createElement('div');
        desc.className = 'start-card-desc';
        desc.textContent = def.desc;
        const metaText = document.createElement('div');
        metaText.className = 'start-card-meta';
        metaText.textContent = unlocked ? `${fmtTime(def.durationSeconds)} / ${Math.round(def.coinMult * 100)}% coins` : (def.unlock && def.unlock.label ? def.unlock.label : 'Locked');
        btn.append(title, desc, metaText);
        btn.addEventListener('click', () => {
          if (!isMapUnlocked(def)) {
            const cost = def.unlock && def.unlock.cost ? def.unlock.cost : 0;
            if (cost && meta.coins >= cost) {
              meta.coins -= cost;
              unlockMap(def.id);
              saveMeta();
            } else {
              return;
            }
          }
          selectedMapId = def.id;
          meta.lastMap = def.id;
          saveMeta();
          renderStartOptions();
        });
        mapGrid.appendChild(btn);
      });
    }

    const dailyPanel = document.getElementById('dailyPanel');
    if (dailyPanel) {
      const daily = dailyChallenge();
      dailyPanel.textContent = '';
      const text = document.createElement('div');
      text.className = 'daily-text';
      const completed = !!meta.dailyCompletions[daily.key];
      text.textContent = `${daily.name}: ${daily.desc}${completed ? ' Completed today.' : ''}`;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `secondary-btn${dailyChallengeEnabled ? ' selected-lite' : ''}`;
      toggle.textContent = dailyChallengeEnabled ? 'Daily On' : 'Daily Off';
      toggle.addEventListener('click', () => {
        dailyChallengeEnabled = !dailyChallengeEnabled;
        meta.dailyChallengeEnabled = dailyChallengeEnabled;
        saveMeta();
        renderStartOptions();
      });
      dailyPanel.append(text, toggle);
    }

    const upgradeGrid = document.querySelector('#upgradePanel .start-select-grid');
    if (upgradeGrid) {
      upgradeGrid.textContent = '';
      META_UPGRADE_DEFS.forEach(def => {
        const level = upgradeLevel(def.id);
        const cost = upgradeCost(def);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'start-card upgrade-card';
        const title = document.createElement('div');
        title.className = 'start-card-title';
        title.textContent = `${def.name} ${level}/${def.max}`;
        const desc = document.createElement('div');
        desc.className = 'start-card-desc';
        desc.textContent = def.desc;
        const metaText = document.createElement('div');
        metaText.className = 'start-card-meta';
        metaText.textContent = cost === null ? 'Max rank' : `Buy: ${cost} coins`;
        btn.append(title, desc, metaText);
        btn.addEventListener('click', () => {
          const nextCost = upgradeCost(def);
          if (nextCost === null || (meta.coins || 0) < nextCost) return;
          meta.coins -= nextCost;
          meta.upgrades[def.id] = upgradeLevel(def.id) + 1;
          saveMeta();
          renderStartOptions();
        });
        upgradeGrid.appendChild(btn);
      });
    }

    const startBoostPanel = document.getElementById('startBoostPanel');
    if (startBoostPanel) {
      startBoostPanel.textContent = '';
      const label = document.createElement('div');
      label.className = 'daily-text';
      label.textContent = meta.pendingStartBoost
        ? 'Start boost armed: +20 HP, +1 reroll, and one bonus starter weapon.'
        : `Start boost: +20 HP, +1 reroll, bonus starter weapon. Cost ${START_BOOST_COST} coins or rewarded ad.`;
      const coinBtn = document.createElement('button');
      coinBtn.type = 'button';
      coinBtn.className = 'secondary-btn';
      coinBtn.textContent = meta.pendingStartBoost ? 'Boost Ready' : `Buy Boost (${START_BOOST_COST})`;
      coinBtn.disabled = !!meta.pendingStartBoost;
      coinBtn.addEventListener('click', () => {
        if (meta.pendingStartBoost || (meta.coins || 0) < START_BOOST_COST) return;
        meta.coins -= START_BOOST_COST;
        meta.pendingStartBoost = true;
        saveMeta();
        renderStartOptions();
      });
      const adBtn = document.createElement('button');
      adBtn.type = 'button';
      adBtn.className = 'secondary-btn';
      adBtn.textContent = 'Ad Boost';
      adBtn.disabled = !!meta.pendingStartBoost;
      adBtn.addEventListener('click', async () => {
        if (meta.pendingStartBoost) return;
        const watched = window.AdMobHelper && typeof AdMobHelper.showRewardedStartBoost === 'function'
          ? await AdMobHelper.showRewardedStartBoost()
          : false;
        if (!watched) return;
        meta.pendingStartBoost = true;
        saveMeta();
        renderStartOptions();
      });
      startBoostPanel.append(label, coinBtn, adBtn);
    }

    const monetizationPanel = document.getElementById('monetizationPanel');
    if (monetizationPanel) {
      monetizationPanel.textContent = '';
      const nativePurchases = !!(window.AdMobHelper && typeof AdMobHelper.canUseNativePurchases === 'function' && AdMobHelper.canUseNativePurchases());
      const label = document.createElement('div');
      label.className = 'daily-text';
      label.textContent = meta.adsRemoved
        ? 'Ad removal owned. Interstitial ads stay disabled on this device; rewarded boosts remain opt-in.'
        : 'Remove ads is a native mobile purchase. Web keeps ads as no-op.';
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = `secondary-btn${meta.adsRemoved ? ' selected-lite' : ''}`;
      buyBtn.textContent = meta.adsRemoved ? 'Ads Removed' : (nativePurchases ? 'Remove Ads' : 'Mobile Only');
      buyBtn.disabled = !!meta.adsRemoved || !nativePurchases;
      buyBtn.addEventListener('click', async () => {
        if (meta.adsRemoved || !window.AdMobHelper || typeof AdMobHelper.purchaseAdRemoval !== 'function') return;
        const result = await AdMobHelper.purchaseAdRemoval();
        if (!result || !result.ok) return;
        meta.adsRemoved = true;
        saveMeta();
        renderStartOptions();
      });
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'secondary-btn';
      restoreBtn.textContent = 'Restore';
      restoreBtn.disabled = !!meta.adsRemoved || !nativePurchases;
      restoreBtn.addEventListener('click', async () => {
        if (!window.AdMobHelper || typeof AdMobHelper.restorePurchases !== 'function') return;
        const result = await AdMobHelper.restorePurchases();
        if (!result || !result.ok) return;
        meta.adsRemoved = true;
        saveMeta();
        renderStartOptions();
      });
      monetizationPanel.append(label, buyBtn, restoreBtn);
    }

    const resumePanel = document.getElementById('resumePanel');
    if (resumePanel) {
      resumePanel.textContent = '';
      const snapshot = loadRunSnapshot();
      if (!snapshot) {
        resumePanel.style.display = 'none';
      } else {
        resumePanel.style.display = 'flex';
        const character = CHARACTER_DEFS.find(def => def.id === snapshot.selectedCharacterId) || currentCharacter();
        const difficulty = DIFFICULTY_DEFS.find(def => def.id === snapshot.selectedDifficultyId) || currentDifficulty();
        const label = document.createElement('div');
        label.className = 'daily-text';
        label.textContent = `Saved run: ${fmtTime(snapshot.elapsed || 0)} / Lv.${snapshot.player.level || 1} / ${snapshot.kills || 0} kills / ${character.name} / ${difficulty.name}`;
        const continueBtn = document.createElement('button');
        continueBtn.type = 'button';
        continueBtn.className = 'secondary-btn selected-lite';
        continueBtn.textContent = 'Continue';
        continueBtn.addEventListener('click', () => {
          restoreRunSnapshot(snapshot);
        });
        const discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.className = 'secondary-btn';
        discardBtn.textContent = 'Discard';
        discardBtn.addEventListener('click', () => {
          clearRunSnapshot();
          renderStartOptions();
        });
        resumePanel.append(label, continueBtn, discardBtn);
      }
    }

    const coopPanel = document.getElementById('coopPanel');
    if (coopPanel) {
      coopPanel.textContent = '';
      const queryRoom = new URLSearchParams(window.location.search).get('vpsRoom');
      const label = document.createElement('div');
      label.id = 'coopStatus';
      label.className = 'daily-text';
      if (coop.role === 'host' && coop.roomId) {
        label.textContent = coop.guestConnected
          ? 'Co-op guest connected. Start or continue the run.'
          : `Co-op room ready. Share: ${coopShareUrl(coop.roomId)}`;
      } else if (coop.role === 'guest') {
        label.textContent = 'Joined as co-op guest. Control the ally while the host runs the game.';
      } else if (queryRoom) {
        label.textContent = `Co-op invite ${queryRoom}. Join as guest to control the ally.`;
      } else {
        label.textContent = 'Optional 2-player co-op relay: host a run and share the link with a friend.';
      }
      const hostBtn = document.createElement('button');
      hostBtn.type = 'button';
      hostBtn.className = `secondary-btn${coop.role === 'host' ? ' selected-lite' : ''}`;
      hostBtn.textContent = coop.role === 'host' ? 'Hosting' : 'Host Co-op';
      hostBtn.disabled = coop.role === 'guest';
      hostBtn.addEventListener('click', () => hostCoopRoom());
      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = `secondary-btn${coop.role === 'guest' ? ' selected-lite' : ''}`;
      joinBtn.textContent = coop.role === 'guest' ? 'Joined' : 'Join';
      joinBtn.disabled = !queryRoom || coop.role === 'host';
      joinBtn.addEventListener('click', () => joinCoopRoom(queryRoom));
      coopPanel.append(label, hostBtn, joinBtn);
    }
  }

  function setPaused(paused) {
    const pauseOverlay = document.getElementById('pauseOverlay');
    if (paused) {
      if (state !== 'playing') return;
      state = 'paused';
      saveRunSnapshot('pause');
      renderEvolutionPlan(document.getElementById('pauseEvolutionPlan'), { compact: true });
      if (pauseOverlay) pauseOverlay.style.display = 'flex';
      return;
    }
    if (state !== 'paused') return;
    state = 'playing';
    if (pauseOverlay) pauseOverlay.style.display = 'none';
    lastTime = performance.now();
  }

  function togglePause() {
    if (state === 'playing') setPaused(true);
    else if (state === 'paused') setPaused(false);
  }

  function awardRunRewards(result) {
    if (runRewardsGranted || !player) return { coins: 0, achievements: [] };
    runRewardsGranted = true;
    const diff = currentDifficulty();
    const map = currentMap();
    const daily = dailyChallengeEnabled ? dailyChallenge() : null;
    const baseCoins = Math.max(1, Math.floor(kills / 12 + elapsed / 18 + player.level * 2));
    const winBonus = result === 'win' ? 120 : 0;
    const dailyBonus = result === 'win' && daily && !meta.dailyCompletions[daily.key] ? daily.coinBonus : 0;
    const charCoinMult = currentCharacter().coinMult || 1;
    const goblinLoot = player && player.setEffects && player.setEffects.some(se => se.bonus && se.bonus.effect === 'goblin_loot') ? (player.setEffects.find(se => se.bonus && se.bonus.effect === 'goblin_loot').bonus.val || 1.3) : 1;
    let coins = Math.floor((baseCoins + winBonus + dailyBonus) * diff.coinMult * map.coinMult * charCoinMult * goblinLoot);
    coins += Math.floor(comboBonusCoins || 0);   // 콤보 마일스톤 누적 보너스 정산
    const achievements = [];
    const grantAchievement = (id, label) => {
      if (meta.achievements[id]) return;
      meta.achievements[id] = true;
      const reward = ACHIEVEMENT_REWARDS[id] || 0;
      coins += reward;
      achievements.push(`${label}${reward ? ` +${reward}c` : ''}`);
    };
    if (elapsed > (meta.bestTime || 0)) meta.bestTime = Math.floor(elapsed);
    if (kills > (meta.bestKills || 0)) meta.bestKills = kills;

    if (elapsed >= 180) grantAchievement('survive180', 'Survived 3:00');
    if (result === 'win') grantAchievement('win1', 'First clear');
    if (result === 'win' && selectedDifficultyId === 'hard') grantAchievement('clearHard', 'Hard clear');
    if (result === 'win' && evolvedWeaponCount() >= 3) grantAchievement('evolve3', 'Triple evolution');
    if (result === 'win' && (player.lowestHpPct || 1) <= 0.1) grantAchievement('nearMissClear', 'Near miss clear');
    if ((player.towersPlaced || 0) >= 5) grantAchievement('towerBuilder', 'Defense line');
    if (result === 'win' && !player.revived) grantAchievement('noReviveClear', 'No-revive clear');
    if (result === 'win' && daily && !meta.dailyCompletions[daily.key]) {
      meta.dailyCompletions[daily.key] = true;
      grantAchievement('dailyClear', 'Daily clear');
    }
    meta.coins = Math.max(0, Math.floor(meta.coins || 0) + coins);
    ensureMetaAchievements();
    saveMeta();
    return { coins, achievements };
  }

  async function reviveRun() {
    if (!player || state !== 'dead' || player.revived) return;
    const reviveCost = 120;
    if ((meta.coins || 0) >= reviveCost) {
      meta.coins -= reviveCost;
      saveMeta();
    } else {
      const watched = window.AdMobHelper && typeof AdMobHelper.showRewardedRevive === 'function'
        ? await AdMobHelper.showRewardedRevive()
        : false;
      if (!watched) return;
    }
    player.revived = true;
    player.hp = Math.max(Math.floor(player.maxHp * 0.35), 1);
    player.invincible = 3;
    enemies = enemies.filter(e => dist(e, player) > 180);
    enemyProjectiles = [];
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('levelOverlay').style.display = 'none';
    state = 'playing';
    lastTime = performance.now();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(loop);
    updateHUD();
    saveRunSnapshot('revive');
  }

  function renderEndActions(result, reward) {
    const overlayBox = document.getElementById('overlayBox');
    if (!overlayBox) return;
    const old = document.getElementById('runActions');
    if (old) old.remove();
    const actions = document.createElement('div');
    actions.id = 'runActions';
    actions.className = 'end-actions';
    const rewardText = document.createElement('div');
    rewardText.className = 'reward-line';
    rewardText.textContent = `Earned ${reward.coins || 0} coins${reward.achievements && reward.achievements.length ? ` / ${reward.achievements.join(', ')}` : ''}`;
    actions.appendChild(rewardText);
    const runReport = document.createElement('div');
    runReport.className = 'run-report';
    const summary = document.createElement('div');
    summary.textContent = `Evolutions ${evolvedWeaponCount()} / ${EVOLUTION_DEFS.length} - Towers placed ${player.towersPlaced || 0} - Lowest HP ${Math.round((player.lowestHpPct || 0) * 100)}%`;
    runReport.appendChild(summary);
    // 장비 착용 요약
    if (window.VPS && window.VPS.equipment && player && player.equip) {
      const eq = window.VPS.equipment;
      const wornSlots = eq.SLOTS.filter(s => player.equip[s]);
      if (wornSlots.length > 0) {
        const equipLine = document.createElement('div');
        equipLine.style.cssText = 'margin-top:4px;font-size:0.75rem;color:#a0aec0;';
        equipLine.textContent = '장비: ' + wornSlots.map(s => {
          const item = player.equip[s];
          const base = eq.getItemBase ? eq.getItemBase(item) : null;
          const grade = eq.getGradeData ? eq.getGradeData(item.grade) : null;
          return (grade ? grade.label : item.grade) + ' ' + (base ? base.name : item.baseId);
        }).join(', ');
        runReport.appendChild(equipLine);
        const bonuses = eq.getActiveBonusDescriptions ? eq.getActiveBonusDescriptions(player.equip) : [];
        if (bonuses && bonuses.length) {
          const bonusLine = document.createElement('div');
          bonusLine.style.cssText = 'font-size:0.72rem;color:#81ecec;margin-top:2px;';
          bonusLine.textContent = '세트 효과: ' + bonuses.join(' · ');
          runReport.appendChild(bonusLine);
        }
      }
    }
    const misses = missedEvolutionHints();
    if (misses.length) {
      const hintTitle = document.createElement('div');
      hintTitle.className = 'run-report-title';
      hintTitle.textContent = 'Next-run evolution plan';
      runReport.appendChild(hintTitle);
      misses.forEach(text => {
        const row = document.createElement('div');
        row.textContent = text;
        runReport.appendChild(row);
      });
    }
    actions.appendChild(runReport);
    if (result === 'dead' && player && !player.revived) {
      const revive = document.createElement('button');
      revive.type = 'button';
      revive.className = 'secondary-btn';
      revive.textContent = (meta.coins || 0) >= 120 ? 'Revive -120 coins' : 'Revive with rewarded ad';
      revive.addEventListener('click', () => reviveRun());
      actions.appendChild(revive);
    }
    overlayBox.insertBefore(actions, document.getElementById('startBtn'));
  }

  function clearEndActions() {
    const old = document.getElementById('runActions');
    if (old) old.remove();
  }

  function currentHybridTowerType() {
    return HYBRID_TOWER_TYPES[selectedTowerTypeIdx % HYBRID_TOWER_TYPES.length];
  }

  function cycleHybridTowerType() {
    selectedTowerTypeIdx = (selectedTowerTypeIdx + 1) % HYBRID_TOWER_TYPES.length;
    updateTowerButton();
    if (player) {
      const def = currentHybridTowerType();
      floatTexts.push({ x: player.x, y: player.y - 28, text: `Tower: ${def.name}`, life: 1.2, maxLife: 1.2, color: def.color, size: 13 });
    }
  }

  function placeHybridTower() {
    if (state !== 'playing' || !player) return false;
    if ((player.towerCharges || 0) <= 0) {
      floatTexts.push({ x: player.x, y: player.y - 28, text: 'Tower charge empty', life: 1.1, maxLife: 1.1, color: '#f39c12', size: 12 });
      return false;
    }
    if (hybridTowers.length >= MAX_HYBRID_TOWERS) {
      hybridTowers.shift();
    }
    const def = currentHybridTowerType();
    hybridTowers.push({
      id: Date.now() + Math.random(),
      type: def.id,
      x: player.x,
      y: player.y,
      cd: 0.2,
      life: 90,
      pulse: 0,
      kills: 0,
    });
    player.towerCharges--;
    player.towersPlaced = (player.towersPlaced || 0) + 1;
    for (let i = 0; i < 10; i++) spawnParticle(player.x, player.y, def.color, 4 + Math.random() * 4, 0.35);
    floatTexts.push({ x: player.x, y: player.y - 34, text: `${def.name} placed`, life: 1.4, maxLife: 1.4, color: def.color, size: 13 });
    updateTowerButton();
    return true;
  }

  function placeHybridTowerAt(source, typeIdx) {
    if (!source || !player) return false;
    if ((player.towerCharges || 0) <= 0) return false;
    if (hybridTowers.length >= MAX_HYBRID_TOWERS) {
      hybridTowers.shift();
    }
    const def = HYBRID_TOWER_TYPES[typeIdx % HYBRID_TOWER_TYPES.length] || HYBRID_TOWER_TYPES[0];
    hybridTowers.push({
      id: Date.now() + Math.random(),
      type: def.id,
      x: source.x,
      y: source.y,
      cd: 0,
      life: 40,
      pulse: 0,
      placedBy: 'guest',
    });
    player.towerCharges -= 1;
    player.towersPlaced = (player.towersPlaced || 0) + 1;
    source.towerCd = 1.2;
    for (let i = 0; i < 10; i++) spawnParticle(source.x, source.y, def.color, 4 + Math.random() * 4, 0.35);
    floatTexts.push({ x: source.x, y: source.y - 34, text: `Guest ${def.name}`, life: 1.4, maxLife: 1.4, color: def.color, size: 13 });
    updateTowerButton();
    return true;
  }

  function updateAllyPlayer(dt) {
    if (!allyPlayer || state !== 'playing') return;
    const input = coop.role === 'host' ? coop.guestInput : { dx: 0, dy: 0, dash: false, tower: false };
    const mag = Math.hypot(input.dx || 0, input.dy || 0);
    const dx = mag > 1 ? input.dx / mag : (input.dx || 0);
    const dy = mag > 1 ? input.dy / mag : (input.dy || 0);
    if (dx || dy) allyPlayer.lastMoveDir = { dx, dy };
    allyPlayer.x += dx * allyPlayer.speed * dt;
    allyPlayer.y += dy * allyPlayer.speed * dt;
    if (allyPlayer.dashCd > 0) allyPlayer.dashCd -= dt;
    if (allyPlayer.towerCd > 0) allyPlayer.towerCd -= dt;
    if (allyPlayer.attackCd > 0) allyPlayer.attackCd -= dt;
    if (input.dash && allyPlayer.dashCd <= 0) {
      allyPlayer.dashCd = DASH_COOLDOWN;
      const dir = allyPlayer.lastMoveDir || { dx: 1, dy: 0 };
      allyPlayer.x += dir.dx * 45;
      allyPlayer.y += dir.dy * 45;
      for (const e of enemies) {
        if (dist(e, allyPlayer) < DASH_RANGE) dealDamage(e, DASH_DMG * 0.85 * player.dmgMult);
      }
      spawnParticle(allyPlayer.x, allyPlayer.y, '#2ecc71', 22, 0.35);
    }
    if (input.tower && allyPlayer.towerCd <= 0) {
      placeHybridTowerAt(allyPlayer, selectedTowerTypeIdx);
    }
    if (allyPlayer.attackCd <= 0) {
      const target = nearestEnemyFromPoint(allyPlayer, 260);
      if (target) {
        const ang = Math.atan2(target.y - allyPlayer.y, target.x - allyPlayer.x);
        projectiles.push({ type: 'tower', x: allyPlayer.x, y: allyPlayer.y, vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380, r: 5, dmg: 16 * player.dmgMult, life: 0.85, color: '#2ecc71', source: 'guest' });
        allyPlayer.attackCd = 0.85;
      }
    }
  }

  function nearestEnemyFromPoint(point, range) {
    let best = null;
    let bestD = Infinity;
    for (const enemy of enemies) {
      const d = dist(point, enemy);
      if (d < range && d < bestD) {
        best = enemy;
        bestD = d;
      }
    }
    return best;
  }

  function fireHybridTower(tower, def, target) {
    if (def.id === 'tesla') {
      let current = target;
      const chained = new Set();
      for (let i = 0; i <= (def.chain || 0) && current; i++) {
        chained.add(current);
        dealDamage(current, def.dmg * player.dmgMult);
        spawnParticle(current.x, current.y, def.color, 8, 0.25);
        current = enemies.find(enemy => !chained.has(enemy) && dist(enemy, current) < 120) || null;
      }
      return;
    }
    const ang = Math.atan2(target.y - tower.y, target.x - tower.x);
    projectiles.push({
      type: 'tower',
      towerType: def.id,
      x: tower.x,
      y: tower.y,
      vx: Math.cos(ang) * def.projectileSpeed,
      vy: Math.sin(ang) * def.projectileSpeed,
      r: def.id === 'frost' ? 6 : 5,
      dmg: def.dmg * player.dmgMult,
      life: def.range / def.projectileSpeed + 0.25,
      color: def.color,
      slow: def.slow || 0,
    });
  }

  function updateHybridTowers(dt) {
    if (!player) return;
    if ((player.towerCharges || 0) < (player.maxTowerCharges || 4)) {
      towerRecharge += dt;
      if (towerRecharge >= TOWER_RECHARGE_SECONDS) {
        towerRecharge = 0;
        player.towerCharges++;
        floatTexts.push({ text: 'Tower charge ready', life: 1.8, maxLife: 1.8, screenSpace: true, color: '#5dade2', size: 15 });
      }
    } else {
      towerRecharge = 0;
    }

    for (let i = hybridTowers.length - 1; i >= 0; i--) {
      const tower = hybridTowers[i];
      tower.life -= dt;
      tower.pulse += dt;
      if (tower.life <= 0) {
        hybridTowers.splice(i, 1);
        continue;
      }
      const def = HYBRID_TOWER_TYPES.find(t => t.id === tower.type) || HYBRID_TOWER_TYPES[0];
      tower.cd -= dt;
      if (tower.cd > 0) continue;
      const target = nearestEnemyFromPoint(tower, def.range);
      if (!target) continue;
      fireHybridTower(tower, def, target);
      tower.cd = def.cd;
    }
    updateTowerButton();
  }

  function updateTowerButton() {
    const btn = document.getElementById('towerBtn');
    if (!btn) return;
    const def = currentHybridTowerType();
    const charges = player ? (player.towerCharges || 0) : 0;
    btn.textContent = `${def.icon}${charges}`;
    btn.title = `Place ${def.name} tower (T). Switch type with Y.`;
    btn.style.borderColor = def.color;
  }

  // ── 입력 ────────────────────────────────────────────────────────
  const keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      togglePause();
      return;
    }
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      placeHybridTower();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      const muted = SFX.toggleMute();
      floatTexts.push({ text: muted ? '🔇 음소거' : '🔊 사운드 ON', life: 1.2, maxLife: 1.2, screenSpace: true, color: '#9fb4d8', size: 16 });
      return;
    }
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      cycleHybridTowerType();
      return;
    }
    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      activateOverdrive();
      return;
    }
    // 레벨업 / 아이템 선택 화면에서 숫자키로 선택 / 리롤
    if (state === 'levelup' || state === 'itembox') {
      if (['1','2','3'].includes(e.key)) {
        const btns = document.querySelectorAll('#upgradeList .upgrade-btn');
        const idx  = parseInt(e.key) - 1;
        if (btns[idx]) { e.preventDefault(); btns[idx].click(); }
      } else if (e.key === '0') {
        e.preventDefault();
        doReroll();
      }
    }
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      toggleEquipUI();
      return;
    }
    // ? 키로 조합 가이드 토글
    if (e.key === '?' || e.key === 'h') toggleComboGuide();
    // ESC로 조합 가이드 닫기
    if (e.key === 'Escape') {
      const guide = document.getElementById('comboGuide');
      if (guide && guide.style.display === 'flex') closeComboGuide();
      else togglePause();
    }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') setPaused(true);
  });
  window.addEventListener('beforeunload', () => {
    saveRunSnapshot('beforeunload');
  });

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

  // 모바일: 오버드라이브 게이지 바 탭으로 발동 지원
  canvas.addEventListener('touchstart', (e) => {
    if (overdriveCharge < 100 || overdriveActive > 0 || state !== 'playing') return;
    const t = e.touches[0];
    const r = canvas.getBoundingClientRect();
    const cx = t.clientX - r.left;
    const cy = t.clientY - r.top;
    const W  = canvas.width, H = canvas.height;
    const scaleX = W / r.width, scaleY = H / r.height;
    const gx = cx * scaleX, gy = cy * scaleY;
    const odW = Math.min(180, W * 0.36), odH = 11;
    const odX = W / 2 - odW / 2, odY = H - 58;
    if (gx >= odX - 10 && gx <= odX + odW + 10 && gy >= odY - 16 && gy <= odY + odH + 6) {
      activateOverdrive();
      e.preventDefault();
    }
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
    const runDifficulty = currentDifficulty();
    const map = currentMap();
    const daily = dailyChallengeEnabled ? dailyChallenge() : null;
    const hpMult = runDifficulty.enemyHpMult * map.enemyHpMult * (daily ? daily.enemyHpMult : 1);
    const spawnMult = runDifficulty.spawnMult * map.spawnMult * (daily ? daily.spawnMult : 1);
    const stage = sandboxStage();
    if (stage && Array.isArray(stage.waveSchedule) && stage.waveSchedule.length) {
      const active = stage.waveSchedule.filter(wave => elapsed >= (Number(wave.atSecond) || 0));
      const wave = active.length ? active[active.length - 1] : stage.waveSchedule[0];
      const count = Math.min(Math.ceil((Number(wave.count) || 1) * spawnMult), 24);
      for (let i = 0; i < count; i++) {
        if (enemies.length >= MAX_ENEMIES) break;
        spawnSandboxEnemy(wave.enemyType || 'zombie');
      }
      return;
    }

    waveCount++;
    const isHorde = (waveCount % HORDE_WAVE_EVERY === 0);
    if (isHorde) floatTexts.push({ text: '🔥 HORDE WAVE!', life: 2.0, maxLife: 2.0, screenSpace: true, color: '#e74c3c', size: 20 });
    // 난이도 곡선: PR#23 기준 — 분(m) 기준 가속 성장 (이차항 완화)
    //   1분=1.87, 3분=3.97, 5분=6.25, 10분=13.0, 15분=21.75
    const m = elapsed / 60;
    const difficulty = 1 + 0.9 * m + 0.03 * m * m;
    // 무한 모드 스케일링 — 체력은 초지수(super-exponential)로 폭증
    //   지수에 2차항을 더해 가속 → 25분(무한 15분)쯤이면 어떤 빌드도 뚫을 수 없는 체력의 벽
    //   플레이어 성장은 로그(감쇠)인데 몬스터 체력은 가속하므로 극후반 생존 한계가 명확
    //   infM=5 ⇒ ×18.8 / infM=10 ⇒ ×656 / infM=15 ⇒ ×9.5만 / infM=18 ⇒ ×200만
    const infM = infiniteMode ? infiniteElapsed / 60 : 0;
    const infHpMult  = infiniteMode ? Math.pow(1.5, infM + infM * infM * 0.06) : 1;
    const infSpdMult = infiniteMode ? (1 + infM * 0.22) : 1;
    const infEliteRate = infiniteMode ? Math.min(0.06 + infM * 0.065, 0.55) : 0.06;
    // 무한 모드 메가 호드: 35 웨이브마다 (~2분) 대규모 침공
    const megaHorde = infiniteMode && (waveCount % 35 === 0);
    if (megaHorde) floatTexts.push({ text: '🌀 무한 메가 호드!!', life: 3.0, maxLife: 3.0, screenSpace: true, color: '#9b59b6', size: 28 });
    // 스폰 밀도: PR#23 기준 — 일반 14→70, 호드 35→120 / 무한 모드는 밀도 추가 증가
    const normalMax = infiniteMode ? Math.min(14 + Math.floor(elapsed / 9), 100) : Math.min(14 + Math.floor(elapsed / 9), 70);
    const hordeMax  = (isHorde || megaHorde) ? (infiniteMode ? Math.min(50 + Math.floor(elapsed / 7), 220) : Math.min(35 + Math.floor(elapsed / 8), 120)) : normalMax;
    const baseCount = Math.ceil(hordeMax * spawnMult);
    for (let i = 0; i < baseCount; i++) {
      if (enemies.length >= MAX_ENEMIES) break;
      const angle = Math.random() * Math.PI * 2;
      const spawnDist = 350 + Math.random() * 150;
      const tierRoll = Math.random();
      // 무한 모드: 최소 tier1, 빠르게 tier2 비율 급상승
      const tier = infiniteMode
        ? (tierRoll < Math.min(0.1 + infM * 0.12, 0.7) ? 2 : 1)
        : (elapsed < 45  ? 0
        : elapsed < 120 ? (tierRoll < 0.25 ? 1 : 0)
        : elapsed < 180 ? (tierRoll < 0.35 ? 1 : 0)
        : elapsed < 300 ? (tierRoll < 0.12 ? 2 : tierRoll < 0.45 ? 1 : 0)
        : elapsed < 450 ? (tierRoll < 0.22 ? 2 : tierRoll < 0.5  ? 1 : 0)
        :                 (tierRoll < 0.32 ? 2 : tierRoll < 0.55 ? 1 : 0));
      // 원거리 공격형(archer): tier1 40%, tier2 100%
      const bRoll = Math.random();
      const behavior = (tier === 2 || (tier === 1 && bRoll < 0.4)) ? 'archer' : 'chase';
      const attackBase = behavior === 'archer' ? (tier === 2 ? 4.0 : 3.2) : 0;
      const newEnemy = {
        x: player.x + Math.cos(angle) * spawnDist,
        y: player.y + Math.sin(angle) * spawnDist,
        hp:    [30, 80, 200][tier] * difficulty * hpMult * infHpMult,
        maxHp: [30, 80, 200][tier] * difficulty * hpMult * infHpMult,
        speed: ([75, 55, 35][tier] + Math.random() * 20) * runDifficulty.enemySpeedMult * infSpdMult,
        size:  [10, 15, 22][tier],
        color: ['#e74c3c', behavior === 'archer' ? '#1abc9c' : '#9b59b6', '#c0392b'][tier],
        xpVal: Math.round([5, 13, 30][tier] * (1 + elapsed / 300)),  // XP 보상 증가 → 무기 레벨 빠른 성장으로 난이도 완화
        tier,
        hurtFlash: 0,
        frozen: 0,
        spawnT: 0.35,   // 등장 연출(확대·페이드인) 잔여 시간
        behavior,
        attackCd: Math.random() * attackBase,   // 초기 공격 시간 분산
        attackBase,
        attackRange: behavior === 'archer' ? (tier === 2 ? 280 : 220) : 0,
        attackDmg: Math.round([10, 20, 38][tier] * (1 + elapsed / 500) * runDifficulty.enemyDmgMult),  // 적 공격력 완만 상승 (후반 위협 유지)
      };
      // 정예 승격 — PR#23 기준 6%, 무한 모드는 infEliteRate로 급상승
      if (tier >= 1 && Math.random() < infEliteRate) {
        newEnemy.elite = true;
        // 무한 모드 정예: 랜덤 엘리트 타입
        const eliteType = infiniteMode ? Math.floor(Math.random() * 3) : 0;
        newEnemy.eliteHue = ['#f1c40f', '#ff7675', '#74b9ff'][eliteType];
        newEnemy.eliteType = eliteType; // 0=일반, 1=격노, 2=수호자
        newEnemy.hp *= 2.6 + (infiniteMode ? infM * 0.3 : 0);
        newEnemy.maxHp = newEnemy.hp;
        newEnemy.size += 4 + (infiniteMode ? Math.min(infM * 0.8, 6) : 0);
        newEnemy.speed *= (1.1 + (infiniteMode && eliteType === 1 ? 0.25 : 0));
        newEnemy.xpVal = Math.round(newEnemy.xpVal * 3);
        newEnemy.attackDmg = Math.round(newEnemy.attackDmg * 1.25);
        // 격노형(eliteType=1): 처치 시 주변에 분열 폭발
        if (infiniteMode && eliteType === 1) newEnemy.rageOnDeath = true;
        // 수호자형(eliteType=2): 보호막 + 강화 방어
        if (eliteType === 2 || runDifficulty.id === 'nightmare') {
          newEnemy.shield = Math.round(newEnemy.maxHp * (infiniteMode ? 0.55 : 0.4));
          newEnemy.maxShield = newEnemy.shield;
        }
      }
      enemies.push(newEnemy);
    }
  }

  // 정예 처치 시 무작위 파워업 드롭
  function dropPowerup(x, y) {
    const def = POWERUP_POOL[Math.floor(Math.random() * POWERUP_POOL.length)];
    powerups.push({ x, y, def, life: 16, maxLife: 16, pulseT: 0 });
  }

  // 보물 고블린 — 플레이어에게서 도망치는 황금 적. 처치 시 잭팟(XP·아이템·파워업) / 도망치면 사라짐
  function spawnTreasureGoblin() {
    const ang = Math.random() * Math.PI * 2;
    const hp = (450 + elapsed * 1.6) * currentDifficulty().enemyHpMult;
    enemies.push({
      x: player.x + Math.cos(ang) * 280,
      y: player.y + Math.sin(ang) * 280,
      hp, maxHp: hp,
      speed: 130 * currentDifficulty().enemySpeedMult,
      size: 16,
      color: '#f1c40f',
      xpVal: 40,
      tier: 1,
      hurtFlash: 0,
      frozen: 0,
      spawnT: 0.35,
      behavior: 'goblin',
      goblin: true,
      goblinLife: 13,      // 13초 내에 처치 못하면 도주
      attackCd: 0, attackBase: 0, attackRange: 0, attackDmg: 0,
    });
    floatTexts.push({ text: '💰 보물 고블린 출현! 잡아라!', life: 2.4, maxLife: 2.4, screenSpace: true, color: '#f1c40f', size: 20 });
    SFX.combo();
  }

  // 보물 고블린 잭팟 — 처치 위치에 XP 폭발 + 아이템 박스 2개 + 파워업 2개
  function dropGoblinJackpot(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 60;
      xpGems.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, val: 18 });
    }
    for (let k = 0; k < 2; k++) {
      const a = (k / 2) * Math.PI * 2;
      itemBoxes.push({ x: x + Math.cos(a) * 45, y: y + Math.sin(a) * 45, life: ITEM_BOX_LIFETIME, pulseT: 0 });
    }
    dropPowerup(x + 30, y);
    dropPowerup(x - 30, y);
    rings.push({ x, y, r: 12, maxR: 160, life: 0.5, maxLife: 0.5, color: '#f1c40f' });
    for (let k = 0; k < 30; k++) spawnParticle(x, y, '#f1c40f', 5 + Math.random() * 7, 0.6);
    floatTexts.push({ text: '💰 JACKPOT!', life: 2.2, maxLife: 2.2, screenSpace: true, color: '#f1c40f', size: 26 });
  }

  // 오버드라이브 발동 — Q키 또는 HUD 바 탭으로 활성화 (충전 100% 도달 시)
  function activateOverdrive() {
    if (overdriveCharge < 100 || overdriveActive > 0 || state !== 'playing') return;
    overdriveCharge = 0;
    overdriveActive = 6;
    overdriveFlash  = 0.55;
    // 기존 임시 버프보다 클 때만 덮어씀 (스택 방지)
    player.tempDmgMult   = Math.max(player.tempDmgMult,   3.0);
    player.tempDmgTimer  = Math.max(player.tempDmgTimer,  6);
    player.tempSpeedMult = Math.max(player.tempSpeedMult, 1.3);
    player.tempSpeedTimer= Math.max(player.tempSpeedTimer,6);
    // 화면 청소 노바 폭발 — rangeBonus (range_up 패시브 + 장비) 적용
    const odRange = 280 * (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1);
    spawnExplosion(player.x, player.y, odRange, 80 * player.dmgMult, false);
    for (let _k = 0; _k < 28; _k++) spawnParticle(player.x, player.y, '#f1c40f', 7 + Math.random() * 9, 0.55);
    rings.push({ x: player.x, y: player.y, r: 12, maxR: odRange, life: 0.5, maxLife: 0.5, color: '#f1c40f' });
    rings.push({ x: player.x, y: player.y, r: 12, maxR: odRange * 0.73, life: 0.38, maxLife: 0.38, color: '#fff' });
    screenShake = Math.min(screenShake + 0.45, 0.7);
    floatTexts.push({ text: '⚡ OVERDRIVE!', life: 2.2, maxLife: 2.2, screenSpace: true, color: '#f1c40f', size: 28 });
    SFX.boss();
  }

  function spawnSandboxEnemy(typeKey) {
    const def = sandboxEnemy(typeKey) || sandboxEnemy('zombie');
    if (!def) return;
    const runDifficulty = currentDifficulty();
    const map = currentMap();
    const daily = dailyChallengeEnabled ? dailyChallenge() : null;
    const angle = Math.random() * Math.PI * 2;
    const distFromPlayer = 350 + Math.random() * 150;
    const difficulty = 1 + elapsed / 120;
    const isBoss = def.isBoss || typeKey === 'boss' || def.behavior === 'boss_chase';
    const tier = isBoss ? 2 : (def.hp > 100 ? 1 : 0);
    const hp = (Number(def.hp) || [30, 80, 250][tier]) * difficulty * runDifficulty.enemyHpMult * map.enemyHpMult * (daily ? daily.enemyHpMult : 1);
    enemies.push({
      x: player.x + Math.cos(angle) * distFromPlayer,
      y: player.y + Math.sin(angle) * distFromPlayer,
      hp,
      maxHp: hp,
      speed: (Number(def.speed) || [75, 55, 35][tier]) * runDifficulty.enemySpeedMult,
      size: Math.max(8, (Number(def.size) || [20, 30, 44][tier]) / 2),
      color: ENEMY_COLORS[typeKey] || ENEMY_COLORS.zombie,
      xpVal: Number(def.xpValue) || [3, 8, 20][tier],
      tier,
      hurtFlash: 0,
      spawnT: 0.35,
    });
  }

  // ── 장비 시스템 ─────────────────────────────────────────────────
  function refreshEquipCache() {
    if (!player || !window.VPS || !window.VPS.equipment) return;
    const eq = window.VPS.equipment;
    const combined = { maxHp: 0, dmgMult: 1, cdMult: 1, speedMult: 1, xpRange: 1, rangeBonus: 1, critChance: 0 };
    for (const slot of eq.SLOTS) {
      const item = player.equip[slot];
      if (!item) continue;
      const s = eq.getEquipStats(item);
      combined.maxHp      += (s.maxHp      || 0);
      combined.dmgMult    *= (s.dmgMult    || 1);
      combined.cdMult     *= (s.cdMult     || 1);
      combined.speedMult  *= (s.speedMult  || 1);
      combined.xpRange    *= (s.xpRange    || 1);
      combined.rangeBonus *= (s.rangeBonus || 1);
      combined.critChance += (s.critChance || 0);
    }
    // Apply set bonuses
    const setEffects = eq.getActiveSetEffects(player.equip);
    for (const se of setEffects) {
      if (se.bonus.effect === 'dmgMult')   combined.dmgMult  *= se.bonus.val;
      if (se.bonus.effect === 'cdMult')    combined.cdMult   *= se.bonus.val;
      if (se.bonus.effect === 'speedMult') combined.speedMult *= se.bonus.val;
      if (se.bonus.effect === 'maxHp')     combined.maxHp    += se.bonus.val;
    }
    player.equipStats   = combined;
    player.setEffects   = setEffects;
    player.crossEffects = eq.getActiveCrossEffects(player.equip);
    // 특수 젬 효과 집계
    player.gemEffects   = eq.aggregateGemEffects(player.equip);
    // 세트 4세트 + 교차 시너지의 특수 hit-effect 플래그 집계
    const flags = {};
    for (const se of setEffects) {
      if (se.bonus && se.bonus.effect) flags[se.bonus.effect] = true;
    }
    for (const c of player.crossEffects) {
      if (c.effect) flags[c.effect] = true;
    }
    player.setFlags = flags;
  }

  function equipItem(item) {
    if (!player || !item) return;
    player.equip[item.slot] = item;
    refreshEquipCache();
    // Apply maxHp change
    const hpGain = player.equipStats.maxHp || 0;
    player.maxHp = BASE_HP + hpGain;
    player.hp    = Math.min(player.hp + (hpGain > 0 ? hpGain * 0.5 : 0), player.maxHp);
    updateHUD();
    floatTexts.push({ text: '⚔ 장비 장착!', life: 1.4, maxLife: 1.4, screenSpace: true, color: '#f39c12', size: 15 });
    renderEquipUI();
  }

  // ── 투사체 발사 ─────────────────────────────────────────────────
  function fireWeapon(id, dt) {
    if (player.weaponCDs[id] === undefined) return;   // 미보유 무기 무시
    if (!isWeaponActive(id)) return;                  // 비활성 무기는 발사 안 함 (시너지는 유지)
    player.weaponCDs[id] -= dt;
    if (player.weaponCDs[id] > 0) return;

    const def    = WEAPON_DEFS[id];
    const lvl    = player.weaponLevels[id] || 1;
    const lvlMul = 1 + 0.22 * (lvl - 1);              // 레벨당 데미지 +22%
    const lvlRangeMul = 1 + 0.05 * (lvl - 1);         // 레벨당 사거리·범위 +5% (부가 효과 강화)
    const lvlExtra = lvl - 1;                          // 레벨 추가량 (관통·연쇄 등 정수 보너스 산정용)
    const eqStats = (player.equipStats) || {};
    const cd     = def.cd * player.cdMult * (eqStats.cdMult || 1);
    const dmg    = def.dmg * player.dmgMult * (player.tempDmgMult || 1) * lvlMul * (eqStats.dmgMult || 1);
    const range  = def.range * (player.rangeBonus || 1) * (eqStats.rangeBonus || 1) * lvlRangeMul;
    player.weaponCDs[id] = cd;

    // cascade_collapse: 충전 완료 시 다음 공격에 충격파 폭발
    if (player.cascadeReady) {
      player.cascadeReady = false;
      const cRange = 250 * (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1);
      chainExplosions.push({ x: player.x, y: player.y, range: cRange, dmg: 500 * player.dmgMult, delay: 0 });
      rings.push({ x: player.x, y: player.y, r: 14, maxR: cRange, life: 0.45, maxLife: 0.45, color: '#e67e22' });
      rings.push({ x: player.x, y: player.y, r: 8, maxR: cRange * 0.7, life: 0.3, maxLife: 0.3, color: '#e74c3c' });
      for (let _ci = 0; _ci < 24; _ci++) spawnParticle(player.x, player.y, _ci % 3 === 0 ? '#e67e22' : '#e74c3c', 7 + Math.random() * 8, 0.55);
      screenShake = Math.min(screenShake + 0.35, 0.7);
      floatTexts.push({ text: '💥 연쇄 붕괴!', life: 2.2, maxLife: 2.2, screenSpace: true, color: '#e67e22', size: 28 });
    }

    if (id === 'orb' || id === 'blackhole') {
      const evolved  = id === 'blackhole';
      const orbCount = (evolved ? 5 : 3) + Math.floor((lvl - 1) / 2); // 레벨업 시 궤도 추가
      const orbR     = (evolved ? 12 : 8) + lvlExtra;                  // 레벨업 시 구슬 크기(히트박스) 증가
      const R = range;
      for (let i = 0; i < orbCount; i++) {
        const baseAngle = (elapsed * 1.8) + (i / orbCount) * Math.PI * 2;
        projectiles.push({ type: evolved ? 'blackhole' : 'orb', x: player.x, y: player.y, angle: baseAngle, r: orbR, dmg, life: cd + 0.05, orbIdx: i, orbTotal: orbCount, R });
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
        projectiles.push({ type: 'arrow', x: player.x, y: player.y, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420, r: 5, dmg, life: range / 420, pierce: (evolved ? 6 : 3) + lvl + (player.pierceBonus || 0) });
      }
    } else if (id === 'nova' || id === 'supernova') {
      spawnExplosion(player.x, player.y, range, dmg, id === 'supernova');
    } else if (id === 'shield' || id === 'aegis') {
      const dur = (id === 'aegis' ? 2.2 : 1.5) + 0.15 * (lvl - 1);
      player.invincible = Math.max(player.invincible, dur);
      if (id === 'aegis') aegisReflect(dmg, range);
      spawnParticle(player.x, player.y, '#3498db', 24, 0.8);
    } else if (id === 'laser' || id === 'deathray') {
      const evolved = id === 'deathray';
      const target  = nearestEnemy();
      const ang = target ? Math.atan2(target.y - player.y, target.x - player.x) : 0;
      projectiles.push({ type: evolved ? 'deathray' : 'laser', x: player.x, y: player.y, angle: ang, r: 6, dmg, life: 0.45, length: range });
    } else if (id === 'boomerang' || id === 'cyclone') {
      // 부메랑: 이동 방향(또는 가장 가까운 적 방향)으로 발사 후 반환, 왕복 타격
      const evolved = id === 'cyclone';
      const count   = evolved ? 3 : 1;
      const pierce  = (evolved ? 99 : 4) + (player.pierceBonus || 0) + lvlExtra; // 레벨업 시 관통 +1
      const spd     = 320;
      const halfLife = range / spd;
      const baseAng  = nearestEnemy()
        ? Math.atan2(nearestEnemy().y - player.y, nearestEnemy().x - player.x)
        : Math.atan2(lastMoveDir.dy, lastMoveDir.dx);
      for (let s = 0; s < count; s++) {
        const ang = baseAng + (evolved ? (s / count) * Math.PI * 2 : 0);
        projectiles.push({
          type: 'boomerang', x: player.x, y: player.y,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          r: 7, dmg, life: halfLife * 2, halfLife, flipped: false,
          pierceOut: pierce, pierceIn: pierce,   // 출·귀환 각각 관통 횟수
          hitOut: new Set(), hitIn: new Set(),   // 이미 타격한 적 (방향별)
        });
      }
    } else if (id === 'chain' || id === 'tempest') {
      // 사슬 번개: 가장 가까운 적부터 연쇄 즉시 타격 + 시각적 아크 생성
      const evolved  = id === 'tempest';
      // 관통 강화 패시브: 연쇄 횟수도 증가 (관통 1스택 = 연쇄 +3) + 레벨업 시 2레벨당 +1 연쇄
      const bounces = (evolved ? 5 : 3) + (player.passives['pierce_up'] || 0) * 3 + Math.floor(lvlExtra / 2);
      let cx = player.x, cy = player.y;
      const hit = new Set();
      for (let b = 0; b < bounces; b++) {
        let best = null, bd = Infinity;
        for (const e of enemies) {
          if (hit.has(e)) continue;
          const d = dist({ x: cx, y: cy }, e);
          if (d < range && d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        hit.add(best);
        // 폭풍 사슬: 이미 빙결된 적에게 타격 시 서리 폭발 — 주변 전파 + 빙결
        const frostChain = evolved && (best.frozen || 0) > 0;
        dealDamage(best, dmg);
        if (evolved && best.hp > 0) best.frozen = Math.max(best.frozen || 0, 1.5);
        if (frostChain && player) {
          const frostR = 65 * (player.rangeBonus || 1);
          for (const fe of enemies) {
            if (fe === best || hit.has(fe) || fe.dying) continue;
            if (dist(best, fe) < frostR) {
              dealDamage(fe, dmg * 0.5);
              if (fe.hp > 0) fe.frozen = Math.max(fe.frozen || 0, 0.9);
              hit.add(fe);
              spawnParticle(fe.x, fe.y, '#74b9ff', 5, 0.3);
            }
          }
          rings.push({ x: best.x, y: best.y, r: 5, maxR: frostR, life: 0.22, maxLife: 0.22, color: '#74b9ff' });
          for (let _fi = 0; _fi < 6; _fi++) spawnParticle(best.x, best.y, '#b2d8ff', 4, 0.28);
        }
        projectiles.push({ type: 'arc', x: cx, y: cy, tx: best.x, ty: best.y, life: 0.22, dmg: 0 });
        for (let k = 0; k < 3; k++) spawnParticle(best.x, best.y, evolved ? '#74b9ff' : '#a29bfe', 4, 0.2);
        cx = best.x; cy = best.y;
      }
    } else if (id === 'scythe' || id === 'reaper') {
      // 낫: 전방 부채꼴 광역 베기 / 사신의 낫: 360° 회전 베기 + 흡입
      const evolved  = id === 'reaper';
      const target   = nearestEnemy();
      const baseAng  = target
        ? Math.atan2(target.y - player.y, target.x - player.x)
        : Math.atan2(lastMoveDir.dy, lastMoveDir.dx);
      // 사신: 전방위 / 낫: 약 120° + 레벨업 시 부채꼴 확대 (최대 약 180°)
      const arc      = evolved ? Math.PI * 2 : Math.min(Math.PI, Math.PI * 0.66 + 0.07 * lvlExtra);
      let reaperHits  = 0;
      for (let _i = enemies.length - 1; _i >= 0; _i--) {
        const e = enemies[_i];
        if (!e || e.dying) continue;
        const d = dist(player, e);
        if (d > range) continue;
        const eAng = Math.atan2(e.y - player.y, e.x - player.x);
        let diff = Math.abs(((eAng - baseAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (!evolved && diff > arc / 2) continue;
        // 사신의 낫: 적을 플레이어 쪽으로 흡입
        if (evolved) {
          const pull = Math.min(60, d) * 0.6;
          e.x -= Math.cos(eAng) * pull;
          e.y -= Math.sin(eAng) * pull;
        }
        e._lastHitBy = id;  // spectral_blade & soul_harvest 추적
        dealDamage(e, dmg);
        reaperHits++;
      }
      // 사신의 낫 — 5명 이상 동시 베기 시 영혼 수확: 스펙트럴 파동 폭발
      if (evolved && reaperHits >= 5 && player) {
        const soulRange = range * 1.6;
        chainExplosions.push({ x: player.x, y: player.y, range: soulRange, dmg: dmg * 1.6, delay: 0.16 });
        rings.push({ x: player.x, y: player.y, r: 14, maxR: soulRange, life: 0.42, maxLife: 0.42, color: '#9b59b6' });
        rings.push({ x: player.x, y: player.y, r: 8, maxR: soulRange * 0.65, life: 0.28, maxLife: 0.28, color: '#b388ff' });
        for (let _si = 0; _si < 18; _si++) spawnParticle(player.x, player.y, '#b388ff', 5 + Math.random() * 5, 0.45);
        floatTexts.push({ text: `👻 영혼 수확! (${reaperHits}연)`, life: 1.8, maxLife: 1.8, screenSpace: true, color: '#b388ff', size: 18 });
        screenShake = Math.min(screenShake + 0.2, 0.55);
      }
      // 베기 시각 효과 (확장 링 + 파편) — 적중 수에 비례해 강도 증가
      rings.push({ x: player.x, y: player.y, r: 8, maxR: range, life: 0.25, maxLife: 0.25, color: evolved ? '#9b59b6' : '#bdc3c7' });
      if (evolved && reaperHits >= 3) rings.push({ x: player.x, y: player.y, r: 4, maxR: range * 0.7, life: 0.18, maxLife: 0.18, color: '#d7bfff' });
      for (let k = 0; k < (evolved ? 14 + reaperHits : 7); k++) {
        const pa = baseAng + (Math.random() - 0.5) * arc;
        spawnParticle(player.x + Math.cos(pa) * range * 0.7, player.y + Math.sin(pa) * range * 0.7, evolved ? '#9b59b6' : '#ecf0f1', 4, 0.25);
      }
    } else if (id === 'bomb' || id === 'inferno') {
      // 폭탄: 가장 가까운 적 위치에 시한 폭발 / 인페르노: 5발 분열
      const evolved = id === 'inferno';
      const target  = nearestEnemy();
      const tx = target ? target.x : player.x + lastMoveDir.dx * range;
      const ty = target ? target.y : player.y + lastMoveDir.dy * range;
      // 폭발 범위도 레벨업 시 확대 (lvlRangeMul 반영)
      const aoe = (evolved ? 95 : 80) * (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1) * lvlRangeMul;
      chainExplosions.push({ x: tx, y: ty, range: aoe, dmg, delay: 0.45 });
      // 투척 시각 효과 — 착탄 지점 텔레그래프 링
      rings.push({ x: tx, y: ty, r: aoe, maxR: 6, life: 0.45, maxLife: 0.45, color: '#e67e22' });
      for (let k = 0; k < 5; k++) spawnParticle(player.x, player.y, '#e67e22', 4, 0.3);
      if (evolved) {
        const splits = 5 + Math.floor(lvlExtra / 2); // 레벨업 시 분열 폭발 수 증가
        for (let s = 0; s < splits; s++) {
          const a = (s / splits) * Math.PI * 2;
          chainExplosions.push({ x: tx + Math.cos(a) * aoe * 0.8, y: ty + Math.sin(a) * aoe * 0.8, range: aoe * 0.6, dmg: dmg * 0.6, delay: 0.6 + s * 0.05 });
        }
      }
    }
    // 보조 무기 오버레이 효과 — 메인 무기 발사 시마다 각 보조 계열 효과 함께 발동
    if (id === getMainWeapon()) {
      const auxTarget = nearestEnemy();
      if (auxTarget) triggerAuxEffects(auxTarget, dmg);
    }
    // 블리츠 시너지: 15% 확률로 쿨다운 없이 즉시 재발동
    if (hasSynergy('blitz') && Math.random() < 0.15) {
      player.weaponCDs[id] = 0;
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
    for (let _i = enemies.length - 1; _i >= 0; _i--) {
      const e = enemies[_i];
      if (e && dist({ x, y }, e) < range) dealDamage(e, dmg);
    }
    projectiles.push({ type: 'explosion', x, y, r: 0, maxR: range, life: 0.4, dmg: 0, evolved });
    // 슈퍼노바: 5방향 연쇄 폭발 + 복사열 화상 DoT
    if (evolved) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const d = range * 0.72;
        chainExplosions.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, range: range * 0.58, dmg: dmg * 0.65, delay: 0.09 + i * 0.055 });
      }
      // 복사열: 범위 내 적에게 화상 DoT 부여 (ignite 패시브 없어도 발동)
      if (player) {
        for (const se of enemies) {
          if (dist({ x, y }, se) < range * 1.2) {
            se.burnStacks = Math.min((se.burnStacks || 0) + 2, 5);
            se.burnTimer  = Math.max(se.burnTimer  || 0, 3.5);
            se.burnDmg    = se.burnDmg || (player.dmgMult * 8);
          }
        }
      }
    }
  }

  function spawnParticle(x, y, color, size, life) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 40 + Math.random() * 80;
    particles.push({ x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, color, size, maxLife: life, life });
  }

  function performDashSlash(start, end, angle, stats, source) {
    const dmg = DASH_DMG * (source && source.dmgMult ? source.dmgMult : player.dmgMult) * stats.damageMult;
    let hitCount = 0;
    for (const e of [...enemies]) {
      if (!enemies.includes(e) || e.dying) continue;
      const pathHit = distToSegment(e, start, end) < e.size + stats.width;
      const endHit = dist(e, end) < e.size + stats.range;
      if (!pathHit && !endHit) continue;
      hitCount++;
      dealDamage(e, dmg);
      if (stats.rupture && enemies.includes(e) && e.hp > 0 && !e.dying) {
        e.rupture = {
          time: stats.ruptureTime,
          maxTime: stats.ruptureTime,
          dps: dmg * stats.ruptureDpsMult,
          burst: dmg * (0.28 + stats.rupture * 0.08),
        };
      }
      for (let k = 0; k < 5; k++) spawnParticle(e.x, e.y, stats.rupture ? '#ff6b6b' : '#f8c8ff', 5 + stats.cleave, 0.25);
    }
    if (hitCount >= 5) {
      floatTexts.push({ x: end.x, y: end.y - 38, text: `${hitCount} SLASH`, life: 0.9, maxLife: 0.9, color: '#f8c8ff', size: 15 });
      screenShake = Math.min(screenShake + 0.12, 0.5);
      hitStop = Math.max(hitStop, 0.035);
    }
    return hitCount;
  }

  function queueSlashEchoes(start, end, angle, stats) {
    if (!stats.echoCount) return;
    for (let i = 0; i < stats.echoCount; i++) {
      slashEchoes.push({
        start: { x: start.x, y: start.y },
        end: { x: end.x + Math.cos(angle) * (10 + i * 8), y: end.y + Math.sin(angle) * (10 + i * 8) },
        angle,
        delay: 0.12 + i * 0.1,
        life: 0.28,
        maxLife: 0.28,
        range: stats.range,
        width: stats.width,
        damageMult: stats.damageMult * 0.48,
        cleave: stats.cleave,
        rupture: 0,
        echo: true,
        triggered: false,
      });
    }
  }

  function updateSlashEchoes(dt) {
    for (let i = slashEchoes.length - 1; i >= 0; i--) {
      const echo = slashEchoes[i];
      echo.delay -= dt;
      if (echo.delay <= 0 && !echo.triggered) {
        echo.triggered = true;
        performDashSlash(echo.start, echo.end, echo.angle, echo, player);
      }
      if (echo.triggered) echo.life -= dt;
      if (echo.life <= 0) slashEchoes.splice(i, 1);
    }
  }

  function updateRuptures(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e.rupture || e.rupture.time <= 0 || e.dying) continue;
      e.rupture.time -= dt;
      dealDamage(e, e.rupture.dps * dt);
      if (!enemies.includes(e) || e.dying) continue;
      if (e.rupture.time <= 0) delete e.rupture;
    }
  }

  // spectral_blade 잔향 검기 필드 업데이트 — 지속 피해 + 수명 감소
  function updateSpectralFields(dt) {
    for (let i = spectralFields.length - 1; i >= 0; i--) {
      const sf = spectralFields[i];
      sf.life -= dt;
      if (sf.life <= 0) { spectralFields.splice(i, 1); continue; }
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!e || e.dying) continue;
        if (dist(sf, e) < sf.range) dealDamage(e, sf.dmg * dt);
      }
    }
  }

  // 적 투사체 발사 — 플레이어 방향 + spread 각도
  function fireEnemyProjectile(enemy, spread, target) {
    spread = spread || 0;
    target = target || player;
    const ang = Math.atan2(target.y - enemy.y, target.x - enemy.x) + spread;
    const spd = [220, 260, 190][enemy.tier] || 220;
    const r   = 5 + enemy.tier * 2;
    enemyProjectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, dmg: enemy.attackDmg, life: 1.6 });
    for (let i = 0; i < 2; i++) spawnParticle(enemy.x, enemy.y, '#ff6b35', 3, 0.2);
  }

  // ── 데미지 처리 ─────────────────────────────────────────────────
  // skipChain: chain_crit 연쇄 피해에서 재귀 방지용 플래그
  function dealDamage(enemy, dmg, skipChain, isDot) {
    // 0 이하 피해 무시 — 보스 사망 폭발(dmg=0)이 재귀 호출하는 버그 방지
    if (dmg <= 0) return;
    // 감전(shock) 젬 디버프: 적이 받는 모든 피해 증가
    if ((enemy.shockTimer || 0) > 0 && enemy.shockMult) dmg *= enemy.shockMult;
    // 치명타: critChance 퍼센트로 2배(집행자 시너지 시 3배) 피해 — 도트 피해는 치명타 없음
    let isCritRoll = false;
    if (!isDot && player && (player.critChance || 0) > 0 && Math.random() < player.critChance) {
      dmg *= hasSynergy('executioner') ? 3 : 2;
      isCritRoll = true;
      // bloodlust 시너지: 치명타 발동 시 최대 체력 10% 회복
      if (hasSynergy('bloodlust') && player) {
        player.hp = Math.min(player.hp + player.maxHp * 0.10, player.maxHp);
      }
    }
    // 보호막: 나이트메어 정예 — 보호막이 0이 될 때까지 HP 피해 없음
    if ((enemy.shield || 0) > 0) {
      if (dmg <= enemy.shield) {
        enemy.shield -= dmg;
        enemy.hurtFlash = 0.12;
        damageNumbers.push({ x: enemy.x, y: enemy.y - enemy.size - 8, val: Math.ceil(dmg), life: 0.65, maxLife: 0.65, color: '#74b9ff', isCrit: false });
        return;
      }
      // 초과 피해는 HP로 전달, 보호막 파괴 연출
      dmg -= enemy.shield;
      enemy.shield = 0;
      rings.push({ x: enemy.x, y: enemy.y, r: enemy.size, maxR: enemy.size * 4, life: 0.25, maxLife: 0.25, color: '#74b9ff' });
      floatTexts.push({ x: enemy.x, y: enemy.y - 28, text: '🛡 방어막 파괴!', life: 1.0, maxLife: 1.0, color: '#74b9ff', size: 12 });
    }
    enemy.hp -= dmg;
    enemy.hurtFlash = 0.12;
    // 직접 타격 시에만 상태이상·흡혈 적용 (도트 틱은 제외 — 무한 중첩 방지)
    if (!isDot && player) {
      // 흡혈: 입힌 피해의 일정 비율 회복
      if ((player.lifesteal || 0) > 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.hp + dmg * player.lifesteal, player.maxHp);
      }
      // 화상(ignite): 확률로 화상 부착 — 초당 피해, 최대 3중첩
      if ((player.igniteChance || 0) > 0 && enemy.hp > 0 && Math.random() < player.igniteChance) {
        enemy.burnStacks = Math.min((enemy.burnStacks || 0) + 1, 3);
        enemy.burnTimer  = 3.0;
        enemy.burnDmg    = Math.max(4, dmg * 0.10);
      }
      // 중독(venom): 확률로 중독 부착 — 긴 지속 피해
      if ((player.venomChance || 0) > 0 && enemy.hp > 0 && Math.random() < player.venomChance) {
        enemy.poisonTimer = 6.0;
        enemy.poisonDmg   = Math.max(3, dmg * 0.06);
      }
    }
    // 장비 특수 젬 + 세트/교차 적중 효과 (직접 타격 한정 — 2차 피해/도트는 제외)
    if (!isDot && !skipChain && player) {
      applyEquipHitEffects(enemy, dmg, isCritRoll);
    }
    // 넉백: 피격 충격으로 플레이어 방향 반대로 밀림 (보스는 10% 강도)
    if (player) {
      const kbAng = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const kbStr = Math.min(dmg * 1.5, enemy.isBoss ? 20 : 200) * (enemy.isBoss ? 0.1 : 1);
      enemy.knockVx = (enemy.knockVx || 0) + Math.cos(kbAng) * kbStr;
      enemy.knockVy = (enemy.knockVy || 0) + Math.sin(kbAng) * kbStr;
    }
    if (dmg >= 8) {
      const rounded = Math.round(dmg);
      const isCrit = dmg >= 60;   // 치명타 임계값 완화 (더 자주 오렌지 숫자)
      // 데미지 등급: 0=소(흰색) 1=중(노랑) 2=치명타(주황·대형)
      const tier = isCrit ? 2 : (rounded >= 25 ? 1 : 0);
      damageNumbers.push({
        x: enemy.x + (Math.random() - 0.5) * 10,
        y: enemy.y - enemy.size - 4,
        val: rounded,
        life: 0.65, maxLife: 0.65,
        crit: isCrit,
        tier,
      });
      // 타격 스파크 + 충격파 링 (크릿은 더 강렬하게)
      const sparkCol = isCrit ? '#ff8c00' : (tier === 1 ? '#ffd700' : '#e8e8e8');
      const sparkN = isCrit ? 6 : (tier === 1 ? 4 : 2);
      for (let s = 0; s < sparkN; s++) {
        spawnParticle(enemy.x, enemy.y, sparkCol, 2 + Math.random() * 4, 0.12 + Math.random() * 0.08);
      }
      if (isCrit && enemy.hp > 0) {
        rings.push({ x: enemy.x, y: enemy.y, r: 6, maxR: 36, life: 0.18, maxLife: 0.18, color: '#ff8c00' });
        screenShake = Math.min(screenShake + 0.18, 0.5);
        SFX.crit();
        // chain_crit 시너지: 치명타 발동 시 2연쇄 번개 추가
        if (isCritRoll && !skipChain && hasSynergy('chain_crit')) {
          let cx = enemy.x, cy = enemy.y;
          const chainHit = new Set([enemy]);
          for (let b = 0; b < 2; b++) {
            let best = null, bd = Infinity;
            for (const e of enemies) {
              if (chainHit.has(e) || e.dying) continue;
              const d = dist({ x: cx, y: cy }, e);
              if (d < 200 && d < bd) { bd = d; best = e; }
            }
            if (!best) break;
            chainHit.add(best);
            dealDamage(best, dmg * 0.45, true);   // skipChain=true: 재귀 방지
            projectiles.push({ type: 'arc', x: cx, y: cy, tx: best.x, ty: best.y, life: 0.22, dmg: 0 });
            for (let k = 0; k < 2; k++) spawnParticle(best.x, best.y, '#9b59b6', 4, 0.2);
            cx = best.x; cy = best.y;
          }
        }
      }
    }
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  // ── 장비 특수 젬 + 세트/교차 적중 효과 ──────────────────────────
  //   직접 타격(dealDamage, !isDot && !skipChain) 시에만 호출됨.
  //   2차 피해는 dealDamage(.., skipChain=true)로 호출해 무한 재귀를 막는다.
  function applyEquipHitEffects(enemy, dmg, isCritRoll) {
    const gx = player.gemEffects || {};
    const sf = player.setFlags || {};
    const rb = (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1);

    // ── 특수 젬 ──
    // 🔗 연쇄: 가까운 적에게 번개 연쇄
    if (gx.chain && Math.random() < gx.chain.procChance) {
      let cx = enemy.x, cy = enemy.y;
      const hit = new Set([enemy]);
      const links = gx.chain.val || 2;
      for (let b = 0; b < links; b++) {
        let best = null, bd = Infinity;
        for (const e of enemies) {
          if (hit.has(e) || e.dying) continue;
          const d = dist({ x: cx, y: cy }, e);
          if (d < 220 && d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        hit.add(best);
        dealDamage(best, dmg * 0.6, true);
        projectiles.push({ type: 'arc', x: cx, y: cy, tx: best.x, ty: best.y, life: 0.2, dmg: 0 });
        cx = best.x; cy = best.y;
      }
    }
    // 🪓 가르기: 주변 광역 분할 피해 (상시 발동)
    if (gx.cleave) {
      const r = 70 * rb;
      const cd = dmg * gx.cleave.val;
      for (const e of enemies) {
        if (e === enemy || e.dying) continue;
        if (dist(enemy, e) < r) dealDamage(e, cd, true);
      }
      rings.push({ x: enemy.x, y: enemy.y, r: 4, maxR: r, life: 0.16, maxLife: 0.16, color: '#ff9f43' });
    }
    // ❄ 빙결: 확률로 적 빙결
    if (gx.freeze && enemy.hp > 0 && Math.random() < gx.freeze.procChance) {
      enemy.frozen = Math.max(enemy.frozen || 0, gx.freeze.val || 1.3);
      for (let k = 0; k < 4; k++) spawnParticle(enemy.x, enemy.y, '#74b9ff', 4, 0.3);
      rings.push({ x: enemy.x, y: enemy.y, r: 2, maxR: enemy.size + 14, life: 0.2, maxLife: 0.2, color: '#74b9ff' });
    }
    // 🔱 부채꼴: 확률로 파편 발사
    if (gx.fork && Math.random() < gx.fork.procChance) {
      const n = Math.max(2, Math.round(gx.fork.val || 3));
      const base = Math.random() * Math.PI * 2;
      for (let s = 0; s < n; s++) {
        const a = base + (s - (n - 1) / 2) * 0.42;
        projectiles.push({ type: 'arrow', x: enemy.x, y: enemy.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 4, dmg: dmg * 0.5, life: 0.55, pierce: 2, noGemFx: true });
      }
    }
    // 🔥 점화: 확률로 화상 부착 (화염 패시브 불필요)
    if (gx.combust && enemy.hp > 0 && Math.random() < gx.combust.procChance) {
      enemy.burnStacks = Math.min((enemy.burnStacks || 0) + Math.round(gx.combust.val || 2), 5);
      enemy.burnTimer  = Math.max(enemy.burnTimer || 0, 3.0);
      enemy.burnDmg    = enemy.burnDmg || Math.max(4, dmg * 0.10);
    }
    // ⚡ 감전: 확률로 받피 증가 디버프
    if (gx.shock && enemy.hp > 0 && Math.random() < gx.shock.procChance) {
      enemy.shockTimer = 3.0;
      enemy.shockMult  = gx.shock.val || 1.3;
    }
    // 🩸 흡수: 입힌 피해 비율만큼 회복 (상시)
    if (gx.leech && player.hp < player.maxHp) {
      player.hp = Math.min(player.hp + dmg * gx.leech.val, player.maxHp);
    }
    // ☠ 참수: 체력 비율 이하 적 즉시 처형 (상시, 보스 제외)
    if (gx.culling && enemy.hp > 0 && !enemy.isBoss && enemy.hp <= enemy.maxHp * gx.culling.val) {
      enemy.hp = 0;
      floatTexts.push({ x: enemy.x, y: enemy.y - 30, text: '☠ 처형!', life: 1.0, maxLife: 1.0, color: '#e74c3c', size: 14 });
    }

    // ── 세트 4세트 / 교차 시너지 적중 효과 ──
    // 치명타 시 번개 폭발 (제우스)
    if (isCritRoll && (sf.zeus_nova || sf.zeus_crit_nova)) {
      const r = 60 * rb;
      chainExplosions.push({ x: enemy.x, y: enemy.y, range: r, dmg: dmg * 0.5, delay: 0 });
      rings.push({ x: enemy.x, y: enemy.y, r: 6, maxR: r, life: 0.25, maxLife: 0.25, color: '#f1c40f' });
      for (let k = 0; k < 6; k++) spawnParticle(enemy.x, enemy.y, '#f1c40f', 4, 0.25);
    }
    // 치명타 시 그림자 대쉬 (속도 버스트 + 잔상)
    if (isCritRoll && (sf.shadow_dash || sf.shadow_crit_dash)) {
      player.tempSpeedMult  = Math.max(player.tempSpeedMult || 1, 1.4);
      player.tempSpeedTimer = Math.max(player.tempSpeedTimer || 0, 0.8);
      for (let s = 0; s < 3; s++) playerTrail.push({ x: player.x, y: player.y, life: 0.3 });
    }
    // 화상 적 적중 시 화염 확산 (드래곤)
    if ((sf.dragon_spread || sf.dragon_burn_spread) && (enemy.burnStacks || 0) > 0) {
      const r = 90 * rb;
      for (const e of enemies) {
        if (e === enemy || e.dying) continue;
        if (dist(enemy, e) < r && (e.burnStacks || 0) < (enemy.burnStacks || 1)) {
          e.burnStacks = Math.min((e.burnStacks || 0) + 1, 5);
          e.burnTimer  = Math.max(e.burnTimer || 0, 2.5);
          e.burnDmg    = e.burnDmg || Math.max(4, dmg * 0.08);
        }
      }
    }
    // 적중 시 주변 빙결 (서리)
    if ((sf.frost_freeze || sf.frost_orb_freeze) && Math.random() < 0.18) {
      const r = 75 * rb;
      for (const e of enemies) {
        if (e.dying) continue;
        if (dist(enemy, e) < r) { e.frozen = Math.max(e.frozen || 0, 1.0); spawnParticle(e.x, e.y, '#74b9ff', 3, 0.25); }
      }
    }
    // 화살/구슬 번개 연쇄 (제우스 교차)
    if (sf.zeus_arrow_chain && Math.random() < 0.25) {
      let cx = enemy.x, cy = enemy.y;
      const hit = new Set([enemy]);
      for (let b = 0; b < 2; b++) {
        let best = null, bd = Infinity;
        for (const e of enemies) { if (hit.has(e) || e.dying) continue; const d = dist({ x: cx, y: cy }, e); if (d < 200 && d < bd) { bd = d; best = e; } }
        if (!best) break;
        hit.add(best); dealDamage(best, dmg * 0.5, true);
        projectiles.push({ type: 'arc', x: cx, y: cy, tx: best.x, ty: best.y, life: 0.2, dmg: 0 });
        cx = best.x; cy = best.y;
      }
    }
  }

  // 거인 세트 가시 반격 (titan_thorns) — 피격 시 주변 적에게 폭발 반격
  function triggerThorns() {
    if (!player || !player.setFlags || !player.setFlags.titan_thorns) return;
    const r = 75 * (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1);
    const tdmg = (player.maxHp || BASE_HP) * 0.5 * player.dmgMult;
    for (const e of enemies) {
      if (e.dying) continue;
      if (dist(player, e) < r) dealDamage(e, tdmg, true);
    }
    rings.push({ x: player.x, y: player.y, r: 8, maxR: r, life: 0.3, maxLife: 0.3, color: '#b2bec3' });
    for (let k = 0; k < 10; k++) spawnParticle(player.x, player.y, '#dfe6e9', 5, 0.35);
  }

  // 콤보 마일스톤 보상 — 데미지/처치 경로를 다시 타지 않는 안전한 보상(XP·코인)만 지급
  function awardComboMilestone(enemy) {
    if (comboMilestoneIdx >= COMBO_MILESTONES.length) return;
    if (comboCount < COMBO_MILESTONES[comboMilestoneIdx]) return;
    const reached = COMBO_MILESTONES[comboMilestoneIdx];
    comboMilestoneIdx++;
    const bonusCoins = Math.floor(reached / 5);
    comboBonusCoins += bonusCoins;
    xpGems.push({ x: enemy.x, y: enemy.y, val: Math.round(reached * 0.6) });
    floatTexts.push({ x: enemy.x, y: enemy.y - 28, text: `🔥 ${reached} COMBO! +${bonusCoins}c`, life: 1.6, maxLife: 1.6, color: '#f1c40f', size: 15 });
    SFX.combo();
  }

  function killEnemy(enemy) {
    if (enemy.dying) return;  // 재진입 방지 — 동일 적 중복 처치 방지
    const enemyIdx = enemies.indexOf(enemy);
    if (enemyIdx === -1) return;
    const ruptureBurst = enemy.rupture && enemy.rupture.burst;
    enemy.dying = true;
    kills++;
    comboCount++;
    comboTimer = 1.5;
    // 오버드라이브 게이지 충전 — 보스 +20, 정예 +5, 일반 +1
    if (enemy.isBoss)       overdriveCharge = Math.min(100, overdriveCharge + 20);
    else if (enemy.elite)   overdriveCharge = Math.min(100, overdriveCharge + 5);
    else                    overdriveCharge = Math.min(100, overdriveCharge + 1);
    // vital_surge 시너지: 처치마다 HP 3 회복
    if (hasSynergy('vital_surge') && player) {
      player.hp = Math.min(player.hp + 3, player.maxHp);
    }
    // pyromaniac 시너지: 화염 상태 적 사망 시 광역 폭발
    if (hasSynergy('pyromaniac') && (enemy.burnStacks || 0) > 0 && player) {
      const pyroRange = 85 * (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1);
      chainExplosions.push({ x: enemy.x, y: enemy.y, range: pyroRange, dmg: 28 * player.dmgMult * (enemy.burnStacks || 1), delay: 0 });
      rings.push({ x: enemy.x, y: enemy.y, r: 8, maxR: pyroRange, life: 0.3, maxLife: 0.3, color: '#e67e22' });
    }
    awardComboMilestone(enemy);

    // 연속 처치 스트릭 텍스트 — AoE 동시 처치(같은 프레임)에는 표시 안 함
    const timeSinceLast = elapsed - lastKillTime;
    const STREAK_TEXTS = ['', '', '💀 DOUBLE KILL!', '💀 TRIPLE KILL!', '⚔ QUAD KILL!', '🔥 RAMPAGE!'];
    if (comboCount >= 2 && comboCount <= 5 && timeSinceLast > 0.12) {
      floatTexts.push({ x: enemy.x, y: enemy.y - 36, text: STREAK_TEXTS[comboCount], life: 1.1, maxLife: 1.1, color: comboCount >= 5 ? '#ff2222' : '#ff6b35', size: 13 + comboCount });
    }
    // 대규모 콤보 달성 시 화면 전체 알림
    if (comboCount === 10) floatTexts.push({ text: '🔥 RAMPAGE!', life: 2.2, maxLife: 2.2, screenSpace: true, color: '#ff6b35', size: 24 });
    if (comboCount === 20) { floatTexts.push({ text: '⚡ OBLITERATION!', life: 2.5, maxLife: 2.5, screenSpace: true, color: '#f1c40f', size: 28 }); screenShake = Math.min(screenShake + 0.3, 0.7); }
    if (comboCount === 50) { floatTexts.push({ text: '☠ GODLIKE!', life: 3.0, maxLife: 3.0, screenSpace: true, color: '#e74c3c', size: 34 }); screenShake = Math.min(screenShake + 0.5, 0.8); evolveFlash = 0.35; }
    if (comboCount === 100) { floatTexts.push({ text: '🌟 LEGENDARY!', life: 3.5, maxLife: 3.5, screenSpace: true, color: '#9b59b6', size: 40 }); screenShake = Math.min(screenShake + 0.7, 1.0); evolveFlash = 0.55; }
    lastKillTime = elapsed;
    // cascade_collapse: 5초 내 처치 추적
    killStreakTimestamps.push(elapsed);
    killStreakTimestamps = killStreakTimestamps.filter(t => elapsed - t < 5.0);
    if (hasSynergy('cascade_collapse') && killStreakTimestamps.length >= 10 && player && !player.cascadeReady) {
      player.cascadeReady = true;
      killStreakTimestamps = [];
      floatTexts.push({ text: '💥 연쇄 붕괴 준비!', life: 2.2, maxLife: 2.2, screenSpace: true, color: '#e67e22', size: 20 });
    }

    // elemental_burst: 화염+맹독 동시 적에 처치 시 연쇄 폭발
    if (hasSynergy('elemental_burst') && player && (enemy.burnStacks || 0) > 0 && (enemy.poisonTimer || 0) > 0) {
      const burstRange = 150 * (player.rangeBonus || 1) * ((player.equipStats && player.equipStats.rangeBonus) || 1);
      const burstDmg   = player.dmgMult * WEAPON_DEFS.nova.dmg * 8;
      chainExplosions.push({ x: enemy.x, y: enemy.y, range: burstRange, dmg: burstDmg, delay: 0 });
      rings.push({ x: enemy.x, y: enemy.y, r: 8, maxR: burstRange, life: 0.5, maxLife: 0.5, color: '#a29bfe' });
      rings.push({ x: enemy.x, y: enemy.y, r: 6, maxR: burstRange * 0.6, life: 0.32, maxLife: 0.32, color: '#27ae60' });
      for (let _bi = 0; _bi < 20; _bi++) spawnParticle(enemy.x, enemy.y, _bi % 2 === 0 ? '#e67e22' : '#27ae60', 6 + Math.random() * 6, 0.55);
      floatTexts.push({ x: enemy.x, y: enemy.y - 42, text: '💫 원소 폭발!', life: 1.5, maxLife: 1.5, color: '#a29bfe', size: 16 });
    }
    // spectral_blade: 낫 계열 무기로 처치 시 잔향 검기 필드 생성
    if (hasSynergy('spectral_blade') && player && (enemy._lastHitBy === 'reaper' || enemy._lastHitBy === 'scythe')) {
      const sfRange = 72 * (player.rangeBonus || 1);
      spectralFields.push({ x: enemy.x, y: enemy.y, range: sfRange, dmg: player.dmgMult * WEAPON_DEFS.reaper.dmg * 0.6, life: 0.8, maxLife: 0.8 });
      rings.push({ x: enemy.x, y: enemy.y, r: 6, maxR: sfRange, life: 0.8, maxLife: 0.8, color: '#9b59b6' });
    }

    // 정예 처치 — 파워업 드롭 + 알림 + 강화 연출
    if (enemy.elite) {
      dropPowerup(enemy.x, enemy.y);
      floatTexts.push({ x: enemy.x, y: enemy.y - 30, text: '👑 정예 처치!', life: 1.6, maxLife: 1.6, color: enemy.eliteHue || '#f1c40f', size: 15 });
      rings.push({ x: enemy.x, y: enemy.y, r: enemy.size, maxR: enemy.size * 7, life: 0.45, maxLife: 0.45, color: enemy.eliteHue || '#f1c40f' });
      rings.push({ x: enemy.x, y: enemy.y, r: 4, maxR: enemy.size * 4, life: 0.28, maxLife: 0.28, color: '#fff' });
      screenShake = Math.min(screenShake + 0.12, 0.5);
      hitStop = Math.max(hitStop, 0.04);
      // 무한 모드 격노형: 처치 시 분열 폭발
      if (enemy.rageOnDeath && player) {
        const rageRange = 100 * (player.rangeBonus || 1);
        const rageDmg   = enemy.maxHp * 0.12;
        chainExplosions.push({ x: enemy.x, y: enemy.y, range: rageRange, dmg: rageDmg, delay: 0 });
        rings.push({ x: enemy.x, y: enemy.y, r: 10, maxR: rageRange * 1.2, life: 0.4, maxLife: 0.4, color: '#ff7675' });
        for (let _ri = 0; _ri < 14; _ri++) spawnParticle(enemy.x, enemy.y, '#ff7675', 6 + Math.random() * 5, 0.45);
        floatTexts.push({ x: enemy.x, y: enemy.y - 36, text: '🔴 격노 폭발!', life: 1.2, maxLife: 1.2, color: '#ff7675', size: 13 });
      }
    }

    // 보물 고블린 처치 — 잭팟!
    if (enemy.goblin) {
      dropGoblinJackpot(enemy.x, enemy.y);
      overdriveCharge = Math.min(100, overdriveCharge + 10);
      screenShake = Math.min(screenShake + 0.3, 0.6);
      SFX.boss();
      // 고블린 처치 누적 — 3회 처치 시 고블린 도둑 해금
      meta.goblinKills = (meta.goblinKills || 0) + 1;
      if (meta.goblinKills >= 3 && !meta.achievements.goblinSlayer) {
        meta.achievements.goblinSlayer = true;
        floatTexts.push({ text: '🏆 Goblin Slayer! Goblin Thief 해금!', life: 3.5, maxLife: 3.5, screenSpace: true, color: '#f1c40f', size: 17 });
        ensureMetaAchievements();
      }
      saveMeta();
    }

    // 처치 충격파 링 + 강화 파티클
    const deathR = enemy.size * 5 + 30 + (enemy.tier * 20);
    rings.push({ x: enemy.x, y: enemy.y, r: enemy.size * 0.5, maxR: deathR, life: 0.38, maxLife: 0.38, color: enemy.color });
    const pCount = enemy.isBoss ? 50 : (enemy.tier >= 2 ? 24 : 8 + enemy.tier * 8);
    for (let i = 0; i < pCount; i++) {
      const big = i < pCount * 0.25;  // 상위 25%는 큼직한 파티클
      spawnParticle(enemy.x, enemy.y, enemy.color,
        big ? (enemy.tier + 2) * 7 + Math.random() * 8 : (enemy.tier + 1) * 4 + Math.random() * 5,
        big ? 0.5 + Math.random() * 0.55 : 0.25 + Math.random() * 0.4);
    }
    if (enemy.isBoss) {
      bossActive = false;
      for (let k = 0; k < 4; k++) {
        const ba = (k / 4) * Math.PI * 2;
        itemBoxes.push({ x: enemy.x + Math.cos(ba) * 55, y: enemy.y + Math.sin(ba) * 55, life: ITEM_BOX_LIFETIME, pulseT: 0 });
      }
      spawnExplosion(enemy.x, enemy.y, 200, 0, true);
      screenShake = Math.min(screenShake + 0.5, 0.7);
      hitStop = Math.max(hitStop, 0.13);   // 보스 처치 임팩트
      SFX.boss();
      floatTexts.push({ text: '🏆 BOSS SLAIN!', life: 3.5, maxLife: 3.5, screenSpace: true, color: '#f1c40f', size: 26 });
    }
    xpGems.push({ x: enemy.x, y: enemy.y, val: enemy.xpVal });
    // 일반 몬스터 5% 확률로 리롤권 드롭 (최대 9개 보유)
    if (!enemy.isBoss && Math.random() < 0.05 && player.rerolls < 9) {
      player.rerolls++;
      floatTexts.push({ x: enemy.x, y: enemy.y - 20, text: '🎲 리롤권 획득!', life: 1.8, maxLife: 1.8, color: '#a29bfe', size: 13 });
    }
    // 장비 드롭: 보스 30%→12% (경과 시간 비례 감소), 일반 4%→1.5% 감소 (고블린 2배)
    if (window.VPS && window.VPS.equipment) {
      const progressRatio = Math.min(1, elapsed / getSurviveGoal());
      const baseDropChance = enemy.isBoss
        ? Math.max(0.12, 0.30 - progressRatio * 0.18)
        : Math.max(0.015, 0.04 - progressRatio * 0.025);
      const gearMult = (player && player.characterId === 'goblin') ? 2 : 1;
      const dropChance = baseDropChance * gearMult;
      if (Math.random() < dropChance) {
        const eq = window.VPS.equipment;
        const slot = eq.SLOTS[Math.floor(Math.random() * eq.SLOTS.length)];
        const item = eq.rollItem(slot);
        gearDrops.push({ x: enemy.x, y: enemy.y, item, life: 18, pulseT: 0 });
      }
    }
    if (!enemy.isBoss && kills % 35 === 0 && player.towerCharges < player.maxTowerCharges) {
      player.towerCharges++;
      towerRecharge = 0;
      floatTexts.push({ x: enemy.x, y: enemy.y - 32, text: 'Tower charge +1', life: 1.6, maxLife: 1.6, color: '#5dade2', size: 13 });
    }
    enemies.splice(enemyIdx, 1);
    if (ruptureBurst) {
      spawnExplosion(enemy.x, enemy.y, 46 + slashModLevel('rupture') * 12, ruptureBurst, false);
    }
    document.getElementById('killDisp').textContent = kills;
  }

  function spawnBoss() {
    const runDifficulty = currentDifficulty();
    const map = currentMap();
    const daily = dailyChallengeEnabled ? dailyChallenge() : null;
    bossActive  = true;
    bossWarning = 2.5;
    const bossNum = Math.floor(elapsed / (runDifficulty.bossInterval || BOSS_INTERVAL));
    // 보스 HP는 경과 시간에 비례해 스케일 — 해당 시점 플레이어 DPS로 약 15~25초 교전이 되도록 설계
    //   1번째(5분)≈22.5k, 2번째(10분)≈52k, 3번째(15분)≈93.5k
    const hp = Math.round((5000 + bossNum * 4000) * (1 + elapsed / 200) * runDifficulty.enemyHpMult * map.enemyHpMult * (daily ? daily.enemyHpMult : 1));
    const ang = Math.random() * Math.PI * 2;
    enemies.push({
      x: player.x + Math.cos(ang) * 430,
      y: player.y + Math.sin(ang) * 430,
      hp, maxHp: hp,
      speed: (44 + bossNum * 3) * runDifficulty.enemySpeedMult,
      size: 36,
      color: '#f1c40f',
      xpVal: 80 + bossNum * 25,
      tier: 3,
      isBoss: true,
      hurtFlash: 0,
      spawnT: 0.5,   // 보스는 더 극적인 등장
      behavior: 'boss',
      attackCd: 0.6,
      attackBase: 2.5,
      attackRange: 390,
      attackDmg: Math.round((40 + bossNum * 15) * runDifficulty.enemyDmgMult),
      bossPhase: 0,
      windupActive: false,  // 공격 예비 동작 상태
      windupTimer: 0,
      frozen: 0,
      faceAngle: 0,
    });
    floatTexts.push({ text: '⚠ BOSS APPROACHING ⚠', life: 2.5, maxLife: 2.5, screenSpace: true, color: '#e74c3c', size: 22 });
    SFX.boss();
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

  // XP 곡선: 초반 빠른 성장 → 후반 완만 (lv^1.8). 무한 모드까지 매끄럽게 증가.
  //   Lv1=32, Lv5=237, Lv10=777, Lv15=1571, Lv20=2631, Lv30=5456
  function xpNeeded(lv) {
    return Math.round(20 + 12 * Math.pow(lv, 1.8));
  }

  function showLevelUp() {
    state = 'levelup';
    SFX.levelup();
    document.getElementById('lvDisp').textContent = player.level;
    setText('levelTitle', '⬆ 레벨 업!');
    const builder = () => buildChoices();
    showChoiceOverlay(builder(), builder);
  }

  // 즉시 효과가 무의미한 아이템 제외 (예: 체력 가득일 때 치료킷)
  function usableItemBoxes() {
    return ITEM_BOX_POOL.filter(item => {
      if (item.id === 'medkit' && player.hp >= player.maxHp) return false;
      return true;
    });
  }

  // 아이템 박스 선택 화면 — 3가지 중 선택
  function showItemBoxChoices() {
    state = 'itembox';
    setText('levelTitle', '📦 아이템 선택!');
    const makeItemPicks = () => shuffled(usableItemBoxes()).slice(0, 3).map(item => ({
      kind: 'item',
      name: item.icon + ' ' + item.name,
      desc: '',
      choose: () => { item.apply(player); updateHUD(); },
    }));
    showChoiceOverlay(makeItemPicks(), makeItemPicks);
  }

  function ensureLevelEvolutionPlan() {
    const box = document.getElementById('levelBox');
    const list = document.getElementById('upgradeList');
    if (!box || !list) return null;
    let panel = document.getElementById('levelEvolutionPlan');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'levelEvolutionPlan';
      panel.className = 'evolution-plan level-evolution-plan';
      box.insertBefore(panel, list);
    }
    return panel;
  }

  function appendChoiceButton(list, c, i) {
    const btn = document.createElement('button');
    btn.className = 'upgrade-btn' + (c.kind === 'evolve' ? ' evolution' : '');

    const name = document.createElement('div');
    name.className = 'upgrade-name';
    const badge = document.createElement('span');
    badge.className = 'key-badge';
    badge.textContent = String(i + 1);
    name.appendChild(badge);
    name.appendChild(document.createTextNode(c.name));
    btn.appendChild(name);

    if (c.tag) {
      const tag = document.createElement('div');
      tag.className = `choice-tag ${c.kind}`;
      tag.textContent = c.tag;
      btn.appendChild(tag);
    }

    if (c.desc) {
      const desc = document.createElement('div');
      desc.className = 'upgrade-desc';
      desc.textContent = c.desc;
      btn.appendChild(desc);
    }

    btn.onclick = () => {
      c.choose();
      document.getElementById('levelOverlay').style.display = 'none';
      state = 'playing';
      updateHUD();
    };
    list.appendChild(btn);
  }

  function choiceWeight(choice) {
    const level = choice.weaponId ? (player.weaponLevels[choice.weaponId] || 1) : 1;
    if (choice.kind === 'weapon-lv') {
      const nearEvolution = EVOLUTION_DEFS.some(evo => evo.base === choice.weaponId && player.passives[evo.req]);
      return nearEvolution ? 6 : (level >= MAX_WEAPON_LEVEL - 1 ? 4.8 : 3.2);
    }
    if (choice.kind === 'passive') {
      const completesOwnedWeapon = EVOLUTION_DEFS.some(evo =>
        evo.req === choice.passiveId &&
        player.weapons.includes(evo.base) &&
        (player.weaponLevels[evo.base] || 1) >= MAX_WEAPON_LEVEL
      );
      const supportsOwnedWeapon = EVOLUTION_DEFS.some(evo => evo.req === choice.passiveId && player.weapons.includes(evo.base));
      return completesOwnedWeapon ? 7 : (supportsOwnedWeapon ? 4.4 : 2.2);
    }
    if (choice.kind === 'weapon-new') {
      const earlyRun = player.level <= 4 || player.weapons.length <= 2;
      return earlyRun ? 4 : 2.4;
    }
    if (choice.kind === 'slash-support') {
      const level = slashModLevel(choice.supportId);
      const hasAnySupport = Object.values(player.slashMods || {}).some(Boolean);
      return hasAnySupport ? (3.6 - level * 0.25) : 3.4;
    }
    return 1;
  }

  function weightedPick(pool) {
    const total = pool.reduce((sum, choice) => sum + choiceWeight(choice), 0);
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= choiceWeight(pool[i]);
      if (roll <= 0) return i;
    }
    return pool.length - 1;
  }

  function takeWeightedChoices(pool, limit) {
    const available = [...pool];
    const picks = [];
    while (available.length && picks.length < limit) {
      const idx = weightedPick(available);
      picks.push(available[idx]);
      available.splice(idx, 1);
    }
    return picks;
  }

  function showChoiceOverlay(picks, builder) {
    freeRerollUsed       = false;
    currentChoiceBuilder = builder || null;
    const list = document.getElementById('upgradeList');
    list.innerHTML = '';
    renderEvolutionPlan(ensureLevelEvolutionPlan(), { compact: true });
    picks.forEach((c, i) => {
      appendChoiceButton(list, c, i);
    });
    // 리롤 버튼
    const rerollBtn = document.createElement('button');
    rerollBtn.id        = 'rerollBtn';
    rerollBtn.className = 'reroll-btn';
    rerollBtn.onclick   = doReroll;
    updateRerollBtn(rerollBtn);
    list.appendChild(rerollBtn);

    document.getElementById('levelOverlay').style.display = 'flex';
  }

  function updateRerollBtn(btnEl) {
    const btn = btnEl || document.getElementById('rerollBtn');
    if (!btn) return;
    if (!freeRerollUsed) {
      btn.innerHTML   = '<span class="key-badge">0</span>🎲 리롤 <span class="reroll-tag free">무료</span>';
      btn.disabled    = false;
      btn.classList.remove('reroll-used');
    } else if (player.rerolls > 0) {
      btn.innerHTML   = `<span class="key-badge">0</span>🎲 리롤 <span class="reroll-tag owned">🎲 ${player.rerolls}개 보유</span>`;
      btn.disabled    = false;
      btn.classList.remove('reroll-used');
    } else {
      btn.innerHTML   = '<span class="key-badge muted">0</span>🎲 리롤 <span class="reroll-tag none">없음</span>';
      btn.disabled    = true;
      btn.classList.add('reroll-used');
    }
  }

  function doReroll() {
    if (!currentChoiceBuilder) return;
    if (!freeRerollUsed) {
      freeRerollUsed = true;
    } else if (player.rerolls > 0) {
      player.rerolls--;
    } else {
      return;
    }
    // 새 선택지로 다시 렌더 (리롤 버튼 유지)
    const newPicks = currentChoiceBuilder();
    const list     = document.getElementById('upgradeList');
    list.innerHTML = '';
    renderEvolutionPlan(ensureLevelEvolutionPlan(), { compact: true });
    newPicks.forEach((c, i) => {
      appendChoiceButton(list, c, i);
    });
    const rerollBtn = document.createElement('button');
    rerollBtn.id        = 'rerollBtn';
    rerollBtn.className = 'reroll-btn';
    rerollBtn.onclick   = doReroll;
    updateRerollBtn(rerollBtn);
    list.appendChild(rerollBtn);
  }

  // ── 레벨업 선택지 빌더 (모듈화) ───────────────────────────────────
  // 1) 진화 가능 조합 → 선택지
  function evolutionChoices() {
    return availableEvolutions().map(evo => {
      const w = WEAPON_DEFS[evo.id];
      return {
        kind: 'evolve',
        name: `✨ 진화: ${w.icon} ${w.name}`,
        desc: `${WEAPON_DEFS[evo.base].name} + ${evo.reqName} → ${w.desc}`,
        choose: () => evolveWeapon(evo),
      };
    });
  }

  // 2) 보유 무기 레벨업 — 최대 레벨·진화 무기는 제외
  function weaponLevelChoices() {
    const out = [];
    for (const id of player.weapons) {
      const lvl = player.weaponLevels[id] || 1;
      if (lvl >= MAX_WEAPON_LEVEL || WEAPON_DEFS[id].evolved) continue;
      const w = WEAPON_DEFS[id];
      const extraDesc = WEAPON_LVUP_DESC[weaponFamily(id)] || '';
      out.push({
        kind: 'weapon-lv',
        weaponId: id,
        tag: lvl >= MAX_WEAPON_LEVEL - 1 ? 'Near evolution' : 'Power up',
        name: `${w.icon} ${w.name} Lv.${lvl}→${lvl + 1}`,
        desc: `데미지 +22% · 사거리·범위 +5%${extraDesc ? ' · ' + extraDesc : ''}`,
        choose: () => addWeapon(id),
      });
    }
    return out;
  }

  // 3) 신규 무기 — 슬롯 여유가 있을 때 미보유 무기만
  function newWeaponChoices() {
    if (player.weapons.length >= MAX_WEAPONS) return [];
    const out = [];
    for (const id of WEAPON_POOL) {
      if (player.weapons.includes(id)) continue;
      const w = WEAPON_DEFS[id];
      out.push({
        kind: 'weapon-new',
        weaponId: id,
        tag: player.weapons.length <= 2 ? 'Build starter' : 'New weapon',
        name: `${w.icon} ${w.name} (신규)`,
        desc: w.desc,
        choose: () => addWeapon(id),
      });
    }
    return out;
  }

  // 4) 패시브 — 최대 스택에 도달한 항목은 제외 (무의미한 선택지 방지)
  function passiveChoices() {
    return PASSIVE_POOL.filter(pv => !isPassiveMaxed(pv)).map(pv => {
      const lvl = passiveLevel(pv.id);
      const stack = lvl > 0 ? (pv.max != null ? ` (Lv.${lvl}/${pv.max})` : ` (Lv.${lvl} · 무제한)`) : '';
      return {
        kind: 'passive',
        passiveId: pv.id,
        tag: EVOLUTION_DEFS.some(evo => evo.req === pv.id && player.weapons.includes(evo.base)) ? 'Combo passive' : 'Passive',
        name: pv.name,
        desc: pv.desc + stack,
        choose: () => applyPassive(pv),
      };
    });
  }

  // 모든 항목이 최대치일 때를 위한 안전망 — 소프트락 방지용 보너스
  function overflowBonusChoice() {
    return {
      kind: 'passive',
      tag: 'Maxed out',
      name: '💰 보너스 보상',
      desc: '체력 전체 회복 + 코인 +15',
      choose: () => { player.hp = player.maxHp; comboBonusCoins += 15; },
    };
  }

  // 레벨업 선택지 3개 구성: 진화(최우선) → 무기 레벨업 / 신규 무기 / 패시브
  function slashSupportChoices() {
    return SLASH_SUPPORT_DEFS
      .filter(def => slashModLevel(def.id) < def.max)
      .map(def => {
        const lvl = slashModLevel(def.id);
        return {
          kind: 'slash-support',
          supportId: def.id,
          tag: lvl ? 'Slash combo' : 'Hack support',
          name: `${def.name} Lv.${lvl}->${lvl + 1}`,
          desc: def.desc,
          choose: () => applySlashSupport(def),
        };
      });
  }

  function buildChoices() {
    const result = [];
    const evos = evolutionChoices();
    if (evos.length) result.push(evos[0]);   // 진화 1개 보장

    const hasSlashSupport = Object.values(player.slashMods || {}).some(Boolean);
    if (!hasSlashSupport && result.length < 3) {
      const firstSupport = takeWeightedChoices(slashSupportChoices(), 1)[0];
      if (firstSupport) result.push(firstSupport);
    }

    const alreadyPicked = new Set(result.map(c => `${c.kind}:${c.supportId || c.weaponId || c.passiveId || c.name}`));
    const pool = [...weaponLevelChoices(), ...newWeaponChoices(), ...passiveChoices(), ...slashSupportChoices()]
      .filter(c => !alreadyPicked.has(`${c.kind}:${c.supportId || c.weaponId || c.passiveId || c.name}`));
    result.push(...takeWeightedChoices(pool, 3 - result.length));

    // 후보가 부족하면(전부 최대치) 안전망 보너스로 1개 이상 보장 → 소프트락 방지
    if (!result.length) result.push(overflowBonusChoice());
    return result.slice(0, 3);
  }

  // ── HUD 업데이트 ────────────────────────────────────────────────
  function updateHUD() {
    const hpRatio = getPlayerHpRatio();
    const hpPct = hpRatio * 100;
    player.lowestHpPct = Math.min(player.lowestHpPct ?? 1, hpRatio);
    const hpFill = document.getElementById('hpFill');
    const hpBar = document.getElementById('hpBar');
    hpFill.style.width  = hpPct + '%';
    hpBar.classList.toggle('critical', hpRatio <= LOW_HP_THRESHOLD);
    document.getElementById('hpText').textContent   = `${Math.ceil(player.hp)}/${player.maxHp}`;
    const xpPct = player.xp / xpNeeded(player.level) * 100;
    document.getElementById('xpFill').style.width  = xpPct + '%';
    document.getElementById('xpLabel').textContent  = `Lv.${player.level}`;
    document.getElementById('xpText').textContent   = `${Math.floor(player.xp)}/${xpNeeded(player.level)}`;
  }

  function getPlayerHpRatio() {
    if (!player || !player.maxHp) return 1;
    return Math.max(0, Math.min(1, player.hp / player.maxHp));
  }

  function updateLowHpFeedback(dt) {
    lowHpAlertCooldown = Math.max(0, lowHpAlertCooldown - dt);
    lowHpPulse = Math.max(0, lowHpPulse - dt);

    const hpRatio = getPlayerHpRatio();
    if (hpRatio > LOW_HP_THRESHOLD || lowHpAlertCooldown > 0) return;

    const critical = hpRatio <= CRITICAL_HP_THRESHOLD;
    floatTexts.push({
      text: critical ? 'CRITICAL HP' : 'LOW HP',
      life: critical ? 1.55 : 1.25,
      maxLife: critical ? 1.55 : 1.25,
      screenSpace: true,
      color: critical ? '#ff3b30' : '#f39c12',
      size: critical ? 22 : 18,
    });
    lowHpPulse = critical ? 2.2 : 1.5;
    screenShake = Math.min(screenShake + (critical ? 0.26 : 0.16), critical ? 0.55 : 0.38);
    lowHpAlertCooldown = LOW_HP_ALERT_COOLDOWN;
  }

  function renderLowHpWarning(W, H) {
    if (!player || state !== 'playing') return;
    const hpRatio = getPlayerHpRatio();
    if (hpRatio > LOW_HP_THRESHOLD) return;

    const critical = hpRatio <= CRITICAL_HP_THRESHOLD;
    const pressure = (LOW_HP_THRESHOLD - hpRatio) / LOW_HP_THRESHOLD;
    const pulse = 0.55 + Math.sin(elapsed * (critical ? 13 : 9)) * 0.25 + Math.min(lowHpPulse, 1) * 0.2;
    const alpha = Math.max(0.1, Math.min(0.5, pressure * pulse));
    const color = critical ? '255,59,48' : '243,156,18';

    ctx.save();
    ctx.strokeStyle = `rgba(${color},${alpha})`;
    ctx.lineWidth = critical ? 10 : 7;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(${color},${alpha * 0.34})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function renderWeaponSlots() {
    const el = document.getElementById('weaponSlots');
    el.innerHTML = player.weapons.map(id => {
      const d   = WEAPON_DEFS[id];
      const lvl = player.weaponLevels[id] || 1;
      const star = d.evolved ? '✨' : '';
      const maxed = !d.evolved && lvl >= MAX_WEAPON_LEVEL ? ' weapon-maxed' : '';
      const isMain = isWeaponActive(id) && isAttackWeapon(id);
      const dim = (!isAttackWeapon(id) || isMain) ? '' : 'opacity:0.55;';
      const badge = isMain ? '⭐' : (isAttackWeapon(id) ? '⚙' : '');
      return `<span class="weapon-slot${d.evolved ? ' weapon-evolved' : ''}${maxed}" style="${dim}">${badge}${star}${d.icon} ${d.name} <b>Lv.${lvl}</b></span>`;
    }).join('');
    const supportHtml = SLASH_SUPPORT_DEFS
      .filter(def => slashModLevel(def.id) > 0)
      .map(def => `<span class="weapon-slot slash-support-slot">Slash ${def.name} <b>Lv.${slashModLevel(def.id)}</b></span>`)
      .join('');
    if (supportHtml) el.innerHTML += supportHtml;
  }

  // 메인 무기 지정 (장비창에서 호출) — 공격 무기만 메인으로 지정 가능
  function setMainWeapon(id) {
    if (!player || !WEAPON_DEFS[id] || !isAttackWeapon(id)) return;
    if (!player.weapons.includes(id)) return;
    player.mainWeapon = id;
    floatTexts.push({ text: `⭐ ${WEAPON_DEFS[id].name} 메인 지정`, life: 1.8, maxLife: 1.8, screenSpace: true, color: '#f1c40f', size: 16 });
    renderWeaponSlots();
    renderEquipUI();
  }

  // ── 메인 루프 ───────────────────────────────────────────────────
  let lastTime = 0;

  function loop(ts) {
    frameId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    if (state === 'coop-guest') {
      sendGuestInput();
      renderCoopGuestMirror();
      return;
    }

    if (state !== 'playing') {
      render(dt);
      return;
    }

    // 히트스톱 — 큰 타격 순간 아주 잠깐 전체 정지 → 타격감 강화
    if (hitStop > 0) {
      hitStop -= dt;
      render(dt);
      return;
    }

    elapsed += dt;
    document.getElementById('timeDisp').textContent = fmtTime(elapsed);
    if (elapsed >= getSurviveGoal() && !infiniteMode) {
      if (!infiniteDialogShown) {
        infiniteDialogShown = true;
        showInfiniteWaveDialog();
      }
      return;
    }
    if (infiniteMode) {
      infiniteElapsed = elapsed - getSurviveGoal();
    }

    // 1분마다 마일스톤 알림 (무한 모드)
    const mins = Math.floor(elapsed / 60);
    if (mins > 0 && !milestones.has(mins)) {
      milestones.add(mins);
      floatTexts.push({ text: `⏱ ${mins}분 생존!`, life: 2.5, maxLife: 2.5, screenSpace: true, color: '#2ecc71', size: 18 });
    }

    // update/render를 보호 — 한 프레임에서 예외가 나도 게임 루프가 멈추거나
    // 캔버스 변환이 영구히 깨지지 않도록 격리 (render는 매 프레임 변환을 초기화함)
    try {
      update(dt);
    } catch (err) {
      console.error('[VS] update() 예외:', err);
    }
    try {
      render(dt);
    } catch (err) {
      console.error('[VS] render() 예외:', err);
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 변환 누수 즉시 복구
    }
    updateHUD();
    sendHostCoopState();
    if (elapsed - lastRunSnapshotAt >= RUN_SNAPSHOT_INTERVAL) {
      saveRunSnapshot('auto');
    }
  }

  function update(dt) {
    // 이동
    const { dx, dy } = getMoveDir();
    if (dx !== 0 || dy !== 0) lastMoveDir = { dx, dy };
    const _dashBoostMult = player._dashSpeedBoost > 0 ? 1.35 : 1;
    player.x += dx * player.speed * (player.tempSpeedMult || 1) * _dashBoostMult * dt;
    player.y += dy * player.speed * (player.tempSpeedMult || 1) * _dashBoostMult * dt;

    // 이동 잔상 — 움직일 때만 위치를 찍어 질주감 연출 (최대 10개로 제한)
    if (dx !== 0 || dy !== 0) {
      playerTrail.push({ x: player.x, y: player.y, life: 0.3 });
      if (playerTrail.length > 10) playerTrail.shift();
    }
    for (let i = playerTrail.length - 1; i >= 0; i--) {
      playerTrail[i].life -= dt;
      if (playerTrail[i].life <= 0) playerTrail.splice(i, 1);
    }

    // 대쉬 공격 (Space / X) — 연쇄 대쉬 시스템
    if (dashCd > 0) dashCd -= dt;
    if (dashChainWindow > 0) dashChainWindow -= dt;
    const _dashKeyNow = !!(keys[' '] || keys['x'] || keys['X']);
    const _dashJustPressed = _dashKeyNow && !_lastDashKeyState;
    _lastDashKeyState = _dashKeyNow;
    // 연쇄 대쉬: 직전 대쉬가 적중했을 때, 체인 윈도 내에 다시 누르면 추가 대쉬
    const canChainDash = _dashJustPressed && dashChainWindow > 0 && dashChainCount < 2;
    const canNormalDash = _dashKeyNow && dashCd <= 0;
    if (canChainDash || canNormalDash) {
      const isChain = canChainDash && !canNormalDash;
      const da = Math.atan2(lastMoveDir.dy, lastMoveDir.dx);
      const start = { x: player.x, y: player.y };
      const stats = slashStats();
      // 연쇄 대쉬: 데미지 70%, 이동거리 증가; 일반 대쉬: 이동거리 90px
      const chainMult = isChain ? Math.pow(0.70, dashChainCount + 1) : 1.0;
      const dashDist = isChain ? 105 + dashChainCount * 18 : 90;
      if (isChain) {
        dashChainCount++;
        dashChainWindow = dashChainCount < 2 ? 0.9 : 0;
        dashCd = Math.max(dashCd, 0.2); // 짧은 대기 (연속 발동 방지)
      } else {
        dashCd = DASH_COOLDOWN;
        dashChainCount = 0;
        dashChainWindow = 0;
      }
      SFX.dash();
      // 잔상: 연쇄 색상 변화 (일반=보라, 1차=청, 2차=백)
      const trailColor = isChain ? (dashChainCount === 1 ? '#74b9ff' : '#ffffff') : null;
      for (let s = 1; s <= 6; s++) {
        playerTrail.push({ x: player.x + Math.cos(da) * 13 * s, y: player.y + Math.sin(da) * 13 * s, life: 0.34, chainColor: trailColor });
      }
      while (playerTrail.length > 20) playerTrail.shift();
      player.x += Math.cos(da) * dashDist;
      player.y += Math.sin(da) * dashDist;
      const end = { x: player.x, y: player.y };
      dashEffect = { x: start.x, y: start.y, endX: end.x, endY: end.y, angle: da, life: 0.3, maxLife: 0.3, range: stats.range, width: stats.width, cleave: stats.cleave, isChain, chainIdx: dashChainCount };
      const hitCount = performDashSlash(start, end, da, { ...stats, damageMult: stats.damageMult * chainMult }, player);
      queueSlashEchoes(start, end, da, stats);
      // 잔상 폭발 필드: 도착점에 0.8초 지속 DoT 영역 생성
      dashAfterimages.push({ x: end.x, y: end.y, life: 0.8, maxLife: 0.8, tickTimer: 0,
        dmg: DASH_DMG * player.dmgMult * stats.damageMult * chainMult * 0.28,
        range: 52 + stats.cleave * 10, isChain });
      // 첫 대쉬 적중 시 → 연쇄 윈도 열기
      if (!isChain && hitCount > 0 && dashChainWindow <= 0) {
        dashChainWindow = 1.0;
        floatTexts.push({ text: '⚡ CHAIN!', x: end.x, y: end.y - 30, life: 0.75, maxLife: 0.75, color: '#74b9ff', size: 14 });
      }
      // 5명 이상 동시 적중 → 메인 무기 CD 즉시 초기화 (필드명: weaponCDs)
      if (hitCount >= 5 && player.weaponCDs) {
        const firstW = getMainWeapon() || player.weapons[0];
        if (firstW && (player.weaponCDs[firstW] || 0) > 0) {
          player.weaponCDs[firstW] = 0;
          floatTexts.push({ x: end.x, y: end.y - 46, text: '💥 CD RESET!', life: 1.2, maxLife: 1.2, color: '#f1c40f', size: 14 });
        }
      }
      // 3연쇄 완성 → 충격파 폭발 + 속도 부스트
      if (isChain && dashChainCount >= 2) {
        const burstRange = 90 * (player.rangeBonus || 1);
        chainExplosions.push({ x: end.x, y: end.y, range: burstRange, dmg: DASH_DMG * player.dmgMult * 1.8, delay: 0 });
        rings.push({ x: end.x, y: end.y, r: 10, maxR: burstRange, life: 0.45, maxLife: 0.45, color: '#ffffff' });
        rings.push({ x: end.x, y: end.y, r: 4, maxR: burstRange * 0.5, life: 0.28, maxLife: 0.28, color: '#74b9ff' });
        floatTexts.push({ text: '🌟 TRIPLE DASH!', life: 1.8, maxLife: 1.8, screenSpace: true, color: '#ffffff', size: 22 });
        screenShake = Math.min(screenShake + 0.3, 0.65);
        player._dashSpeedBoost = 0.5; // 0.5초 속도 부스트
        dashChainWindow = 0;
      }
    }
    if (dashEffect) { dashEffect.life -= dt; if (dashEffect.life <= 0) dashEffect = null; }
    updateSlashEchoes(dt);
    updateRuptures(dt);
    updateSpectralFields(dt);
    // 대쉬 잔상 폭발 필드 업데이트 (0.1초마다 DoT 틱)
    for (let i = dashAfterimages.length - 1; i >= 0; i--) {
      const af = dashAfterimages[i];
      af.life -= dt;
      if (af.life <= 0) { dashAfterimages.splice(i, 1); continue; }
      af.tickTimer += dt;
      if (af.tickTimer >= 0.1) {
        af.tickTimer = 0;
        for (const e of [...enemies]) {
          if (e.dying) continue;
          if (dist(af, e) < af.range + e.size) dealDamage(e, af.dmg, false, true);
        }
      }
    }
    // 대쉬 속도 부스트 감소
    if (player._dashSpeedBoost > 0) player._dashSpeedBoost = Math.max(0, player._dashSpeedBoost - dt);

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
      nextBossTime += currentDifficulty().bossInterval || BOSS_INTERVAL;
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

    // 보물 고블린 등장 (45초 첫 등장 이후 주기적, 이미 맵에 있으면 대기)
    goblinTimer += dt;
    if (goblinTimer >= GOBLIN_INTERVAL && elapsed > 40 && !enemies.some(e => e.goblin)) {
      goblinTimer = 0;
      spawnTreasureGoblin();
    }

    // 아이템 박스 업데이트 및 수집
    for (let i = itemBoxes.length - 1; i >= 0; i--) {
      const box = itemBoxes[i];
      box.life -= dt;
      box.pulseT = (box.pulseT || 0) + dt;
      if (box.life <= 0) { itemBoxes.splice(i, 1); continue; }
      if (dist(box, player) < 26 || (allyPlayer && dist(box, allyPlayer) < 26)) {
        for (let k = 0; k < 10; k++) spawnParticle(box.x, box.y, '#f1c40f', 5 + Math.random() * 5, 0.5);
        itemBoxes.splice(i, 1);
        showItemBoxChoices();
        break;  // 한 번에 하나만 처리
      }
    }

    // 장비 드롭 업데이트 및 수집
    for (let i = gearDrops.length - 1; i >= 0; i--) {
      const gd = gearDrops[i];
      gd.life -= dt;
      gd.pulseT = (gd.pulseT || 0) + dt;
      if (gd.life <= 0) { gearDrops.splice(i, 1); continue; }
      if (dist(gd, player) < 28) {
        for (let k = 0; k < 8; k++) spawnParticle(gd.x, gd.y, '#f39c12', 4 + Math.random() * 4, 0.4);
        gearDrops.splice(i, 1);
        // 자동 분해: 현재 장착보다 약한 아이템을 경험치로 즉시 변환
        if (autoDismantleEnabled && window.VPS && window.VPS.equipment) {
          const _eq = window.VPS.equipment;
          const _newPwr = _eq.calcItemPower(gd.item);
          const _curItm = player.equip && player.equip[gd.item.slot];
          const _curPwr = _curItm ? _eq.calcItemPower(_curItm) : 0;
          if (_curItm && _newPwr < _curPwr) {
            const _xpGain = Math.max(1, Math.round(_newPwr / 5));
            gainXP(_xpGain);
            floatTexts.push({ text: `⚗ 자동 분해 +${_xpGain} XP`, life: 1.4, maxLife: 1.4, screenSpace: true, color: '#a78bfa', size: 14 });
            break;
          }
        }
        showGearPickupModal(gd.item);
        break;
      }
    }

    // 파워업 수집 (즉시 적용 — 모달 없음)
    for (let i = powerups.length - 1; i >= 0; i--) {
      const pu = powerups[i];
      pu.life -= dt;
      pu.pulseT += dt;
      if (pu.life <= 0) { powerups.splice(i, 1); continue; }
      // 획득 반경 안이면 플레이어 쪽으로 끌어당김 (자석 효과)
      if (dist(pu, player) < player.xpRange * 0.9) {
        const a = Math.atan2(player.y - pu.y, player.x - pu.x);
        pu.x += Math.cos(a) * 280 * dt;
        pu.y += Math.sin(a) * 280 * dt;
      }
      if (dist(pu, player) < 22 || (allyPlayer && dist(pu, allyPlayer) < 22)) {
        pu.def.apply(player);
        floatTexts.push({ text: `${pu.def.icon} ${pu.def.name}!`, life: 1.5, maxLife: 1.5, screenSpace: true, color: pu.def.color, size: 18 });
        for (let k = 0; k < 12; k++) spawnParticle(pu.x, pu.y, pu.def.color, 4 + Math.random() * 4, 0.4);
        SFX.levelup();
        powerups.splice(i, 1);
      }
    }

    // 임시 버프 타이머
    if (player.tempDmgTimer > 0) { player.tempDmgTimer -= dt; if (player.tempDmgTimer <= 0) { player.tempDmgMult = 1; player.tempDmgTimer = 0; } }
    if (player.tempSpeedTimer > 0) { player.tempSpeedTimer -= dt; if (player.tempSpeedTimer <= 0) { player.tempSpeedMult = 1; player.tempSpeedTimer = 0; } }
    // 보조 방패 버프 (shield 계열 보조 무기 오버레이 효과)
    if ((player._auxShieldTime || 0) > 0) player._auxShieldTime -= dt;
    // 오버드라이브 타이머 (시각적 HUD 상태용, 실제 버프는 tempDmgTimer가 관리)
    if (overdriveActive > 0) overdriveActive = Math.max(0, overdriveActive - dt);
    if (overdriveFlash  > 0) overdriveFlash  = Math.max(0, overdriveFlash  - dt);
    // regen 패시브: 초당 maxHp * regenRate 회복
    if ((player.regenRate || 0) > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.hp + player.maxHp * player.regenRate * dt, player.maxHp);
    }

    // 무기 발사
    for (const id of player.weapons) fireWeapon(id, dt);
    updateAllyPlayer(dt);
    updateHybridTowers(dt);

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
        // 블랙홀: 사건의 지평선(흡입 반경) — 적을 블랙홀 중심으로 빨아들여 유저와 격리
        const captureR = evolved ? p.r + 78 : p.r;
        for (const e of enemies) {
          const de = dist(p, e);
          if (de < p.r + e.size) {
            dealDamage(e, p.dmg * dt * 3);
            // 블랙홀 중력 누적 — 0.3초 쿨다운, 3스택 시 중력 폭발
            if (evolved && !e.isBoss && elapsed - (e._gravLastStack || -1) > 0.3) {
              e._gravLastStack = elapsed;
              e._gravStacks = (e._gravStacks || 0) + 1;
              if (e._gravStacks >= 3) {
                e._gravStacks = 0;
                const gRange = 220 * (player.rangeBonus || 1);
                for (const ge of enemies) {
                  if (ge === e || ge.isBoss) continue;
                  const gd = dist(e, ge);
                  if (gd < gRange) {
                    const ga = Math.atan2(e.y - ge.y, e.x - ge.x);
                    ge.x += Math.cos(ga) * Math.min(gd * 0.5, 75);
                    ge.y += Math.sin(ga) * Math.min(gd * 0.5, 75);
                  }
                }
                chainExplosions.push({ x: e.x, y: e.y, range: gRange * 0.5, dmg: p.dmg * 14, delay: 0.22 });
                rings.push({ x: e.x, y: e.y, r: 14, maxR: gRange * 0.5, life: 0.5, maxLife: 0.5, color: '#b388ff' });
                rings.push({ x: e.x, y: e.y, r: 6, maxR: 28, life: 0.2, maxLife: 0.2, color: '#9b59b6' });
                for (let _gi = 0; _gi < 18; _gi++) spawnParticle(e.x, e.y, '#b388ff', 5 + Math.random() * 6, 0.5);
                floatTexts.push({ x: e.x, y: e.y - 34, text: '🌀 중력 폭발!', life: 1.5, maxLife: 1.5, color: '#b388ff', size: 14 });
                screenShake = Math.min(screenShake + 0.14, 0.5);
              }
            }
          }
          if (evolved && !e.isBoss && de < captureR + e.size) {
            // 가까울수록 강한 흡입력 — 적을 플레이어가 아닌 블랙홀 쪽으로 끌어당김
            const pullStr = 60 + 150 * (1 - de / (captureR + e.size));
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            e.x += Math.cos(a) * pullStr * dt;
            e.y += Math.sin(a) * pullStr * dt;
            // 사건의 지평선 안쪽이면 지속 흡입 피해
            if (de < captureR) {
              dealDamage(e, p.dmg * dt * 1.6);
              if (Math.random() < 0.25) spawnParticle(e.x, e.y, '#b388ff', 3, 0.2);
            }
          }
        }
        // 레벨2+ 오브 / 블랙홀: 적 투사체 흡수 (블랙홀은 사건의 지평선 전체에서 흡수)
        const orbLevel = p.type === 'blackhole'
          ? 5
          : (player.weaponLevels['orb'] || 1);
        if (orbLevel >= 2) {
          const interceptR = evolved ? captureR : p.r + 8;
          for (let j = enemyProjectiles.length - 1; j >= 0; j--) {
            const ep = enemyProjectiles[j];
            if (dist(p, ep) < interceptR + ep.r) {
              rings.push({ x: ep.x, y: ep.y, r: 3, maxR: 22, life: 0.14, maxLife: 0.14, color: evolved ? '#9b59b6' : '#3498db' });
              for (let s = 0; s < 4; s++) spawnParticle(ep.x, ep.y, evolved ? '#b388ff' : '#74b9ff', 3, 0.18);
              enemyProjectiles.splice(j, 1);
            }
          }
        }
      } else if (p.type === 'arrow') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (dist(p, e) < p.r + e.size) {
            // 부채꼴(fork) 젬이 생성한 파편은 젬 효과를 재발동하지 않음 (연쇄 폭주 방지)
            dealDamage(e, p.dmg, p.noGemFx);
            // armor_breaker 시너지: 관통 적중 시 40% 범위 피해
            if (hasSynergy('armor_breaker')) {
              chainExplosions.push({ x: e.x, y: e.y, range: 42, dmg: p.dmg * 0.4, delay: 0 });
            }
            p.pierce--;
            if (p.pierce <= 0) { projectiles.splice(i, 1); break; }
          }
        }
      } else if (p.type === 'laser' || p.type === 'deathray') {
        const evolved = p.type === 'deathray';
        const ex = p.x + Math.cos(p.angle) * p.length;
        const ey = p.y + Math.sin(p.angle) * p.length;
        const mult = evolved ? 9 : 5;          // 데스레이는 훨씬 강한 지속 피해
        const hitW = evolved ? 8 : 6;
        for (const e of enemies) {
          if (distToSegment(e, p, { x: ex, y: ey }) < e.size + hitW) {
            dealDamage(e, p.dmg * dt * mult);
          }
        }
      } else if (p.type === 'explosion') {
        p.r = p.maxR * (1 - p.life / 0.4);
      } else if (p.type === 'boomerang') {
        // 반환점 도달 시 방향 반전 + 히트셋 초기화
        if (!p.flipped && p.life < p.halfLife) {
          p.vx = -p.vx; p.vy = -p.vy;
          p.flipped = true;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const hitSet = p.flipped ? p.hitIn : p.hitOut;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (!hitSet.has(e) && dist(p, e) < p.r + e.size) {
            hitSet.add(e);
            dealDamage(e, p.dmg);
            // armor_breaker 시너지: 관통 적중 시 40% 범위 피해
            if (hasSynergy('armor_breaker')) {
              chainExplosions.push({ x: e.x, y: e.y, range: 42, dmg: p.dmg * 0.4, delay: 0 });
            }
            spawnParticle(p.x, p.y, '#27ae60', 5, 0.2);
          }
        }
      } else if (p.type === 'tower') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (dist(p, e) < p.r + e.size) {
            dealDamage(e, p.dmg);
            if (p.slow && e.hp > 0) e.frozen = Math.max(e.frozen || 0, p.slow);
            projectiles.splice(i, 1);
            break;
          }
        }
      }
      // 'arc' 타입은 시각 효과 전용 — life만 감소, 처리 없음
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
      if (e.spawnT > 0) e.spawnT = Math.max(0, e.spawnT - dt);
      // 상태이상 도트 — 화상(중첩 비례) + 중독. 죽으면 이후 처리 건너뜀
      if ((e.burnTimer || 0) > 0) {
        e.burnTimer -= dt;
        dealDamage(e, (e.burnDmg || 4) * (e.burnStacks || 1) * dt, true, true);
        if (e.burnTimer <= 0) { e.burnStacks = 0; }
        if (Math.random() < 0.25) spawnParticle(e.x, e.y - e.size * 0.5, '#e67e22', 3, 0.25);
      }
      if ((e.poisonTimer || 0) > 0 && (!e.dying)) {
        e.poisonTimer -= dt;
        dealDamage(e, (e.poisonDmg || 3) * dt, true, true);
        if (Math.random() < 0.2) spawnParticle(e.x, e.y - e.size * 0.5, '#27ae60', 3, 0.25);
      }
      // 감전(shock) 디버프 지속 시간 감소
      if ((e.shockTimer || 0) > 0) {
        e.shockTimer -= dt;
        if (Math.random() < 0.15) spawnParticle(e.x, e.y - e.size * 0.5, '#f1c40f', 3, 0.2);
      }
      if (e.dying || e.hp <= 0) continue;
      const targetActor = allyPlayer && dist(e, allyPlayer) < dist(e, player) ? allyPlayer : player;
      const ang = Math.atan2(targetActor.y - e.y, targetActor.x - e.x);
      const d   = dist(e, targetActor);
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
      } else if (e.behavior === 'goblin') {
        // 보물 고블린: 플레이어 반대 방향으로 도주 (지그재그)
        const flee = ang + Math.PI + Math.sin(elapsed * 4) * 0.5;
        e.x += Math.cos(flee) * e.speed * dt;
        e.y += Math.sin(flee) * e.speed * dt;
        e.goblinLife -= dt;
        if (e.goblinLife <= 0) {
          // 도주 성공 — 사라짐 (잭팟 없음)
          floatTexts.push({ text: '💨 고블린이 도망쳤다...', life: 1.8, maxLife: 1.8, screenSpace: true, color: '#95a5a6', size: 16 });
          for (let k = 0; k < 8; k++) spawnParticle(e.x, e.y, '#bdc3c7', 4, 0.4);
          enemies.splice(i, 1);
          continue;
        }
      } else if (e.isBoss) {
        // 보스: 추적 + 예비 동작(telegraph) 후 원형 폭발 발사
        const bSpeed = e.bossPhase === 1 ? e.speed * 1.4 : e.speed;
        // 예비 동작 중에는 속도 25%로 감속 (공격 전 기운 모으기 연출)
        const windupSlow = e.windupActive ? 0.25 : 1.0;
        e.x += Math.cos(ang) * bSpeed * windupSlow * dt;
        e.y += Math.sin(ang) * bSpeed * windupSlow * dt;

        if (e.attackCd > 0) {
          e.attackCd -= dt;
        } else if (!e.windupActive) {
          // 쿨다운 만료 → 예비 동작 시작
          e.windupActive = true;
          e.windupTimer = e.bossPhase === 1 ? 0.5 : 0.75;
        } else {
          // 예비 동작 진행 중
          e.windupTimer -= dt;
          if (e.windupTimer <= 0) {
            // 예비 동작 완료 → 발사
            const shots = (e.bossPhase || 0) === 1 ? 12 : 8;
            for (let b = 0; b < shots; b++) {
              fireEnemyProjectile(e, (b / shots) * Math.PI * 2 - ang, targetActor);
            }
            e.attackCd = (e.bossPhase || 0) === 1 ? 1.5 : 2.5;
            e.windupActive = false;
            e.windupTimer = 0;
          }
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
            fireEnemyProjectile(e, shots > 1 ? (s - (shots - 1) / 2) * 0.22 : 0, targetActor);
          }
          e.attackCd = e.attackBase * (rageActive ? 0.55 : 1.0);
        }
      } else {
        e.x += Math.cos(ang) * e.speed * rageMult * dt;
        e.y += Math.sin(ang) * e.speed * rageMult * dt;
      }

      // 피격 넉백 감속 처리 (빙결 중에는 적용 안 함)
      if (!e.frozen && (e.knockVx || e.knockVy)) {
        e.x += (e.knockVx || 0) * dt;
        e.y += (e.knockVy || 0) * dt;
        const kDecay = Math.exp(-10 * dt);
        e.knockVx = (e.knockVx || 0) * kDecay;
        e.knockVy = (e.knockVy || 0) * kDecay;
        if (Math.abs(e.knockVx) < 0.1 && Math.abs(e.knockVy) < 0.1) {
          e.knockVx = 0; e.knockVy = 0;
        }
      }

      if (!e.goblin && player.invincible <= 0 && d < e.size + 12) {
        const contactDmg = e.isBoss ? 55 : [8, 18, 38][Math.min(e.tier, 2)];
        const auxShieldMult = (player._auxShieldTime || 0) > 0 ? 0.70 : 1.0;
        player.hp -= contactDmg * dt * (hasSynergy('iron_fortress') ? 0.70 : auxShieldMult);
        screenShake = Math.min(screenShake + 0.15, 0.35);
        hurtScreenFlash = 0.28;
        SFX.hurt();
        player.invincible = 0.15;
        triggerThorns();
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
      const projectileTarget = allyPlayer && dist(ep, allyPlayer) < dist(ep, player) ? allyPlayer : player;
      if (player.invincible <= 0 && dist(ep, projectileTarget) < ep.r + 12) {
        player.hp -= ep.dmg * (hasSynergy('iron_fortress') ? 0.70 : 1.0);
        screenShake = Math.min(screenShake + 0.22, 0.45);
        hurtScreenFlash = 0.28;
        SFX.hurt();
        player.invincible = 0.1;
        enemyProjectiles.splice(i, 1);
        triggerThorns();
        if (player.hp <= 0) { endGame('dead'); return; }
      }
    }

    // 콤보 타이머 감쇠
    updateLowHpFeedback(dt);

    if (comboTimer > 0) comboTimer -= dt;
    else if (comboCount > 0) { comboCount = 0; comboMilestoneIdx = 0; }

    if (hurtScreenFlash > 0) hurtScreenFlash = Math.max(0, hurtScreenFlash - dt);
    if (evolveFlash > 0) evolveFlash = Math.max(0, evolveFlash - dt);

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

    // 충격파 링 수명 업데이트 (그리기는 render에서, 수명 갱신은 여기서)
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }

    // XP 수집 — 끌어당김 물리 + 가속
    for (let i = xpGems.length - 1; i >= 0; i--) {
      const g = xpGems[i];
      const d = dist(g, player);
      const attractRange = player.xpRange * 2.2; // 끌어당김 시작 거리 (수집 거리의 2.2배)
      if (d < attractRange) {
        // 끌어당김 가속: 가까울수록 빠르게
        const pull = Math.min(1, 1 - (d / attractRange));
        const speed = 180 + pull * pull * 520;
        const ang = Math.atan2(player.y - g.y, player.x - g.x);
        g.x += Math.cos(ang) * speed * dt;
        g.y += Math.sin(ang) * speed * dt;
        g._attracting = true;
      }
      // 수집 (수집 반경 또는 완전히 도달)
      if (dist(g, player) < Math.max(player.xpRange, 20) || (allyPlayer && dist(g, allyPlayer) < player.xpRange * 0.75)) {
        gainXP(g.val);
        const gc = g.val >= 80 ? '#ffd700' : g.val >= 30 ? '#f39c12' : g.val >= 10 ? '#f1c40f' : '#ffe082';
        spawnParticle(g.x, g.y, gc, 3 + (g.val >= 30 ? 2 : 0), 0.22);
        spawnParticle(g.x, g.y, '#ffe9a8', 2, 0.18);
        SFX.pickup();
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
    // 프레임 시작 시 변환행렬을 항상 단위행렬로 초기화 — 이전 프레임에서 예외 등으로
    // ctx.save()/restore() 균형이 깨져 카메라 translate가 누적·잔류해도 자가 복구됨
    // (이 누적이 "게임은 진행되는데 화면이 렌더링 안 되는" 증상의 원인)
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = currentMap().bg || '#101827';
    ctx.fillRect(0, 0, W, H);

    // player 미생성 시(시작 화면 등) 배경만 그리고 종료 — save 누수 방지를 위해 save 이전에 반환
    if (!player) return;

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

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // XP 젬 — 가치별 크기·색상·광채 구분
    for (const g of xpGems) {
      // 가치 단계: tiny(<5), small(5-14), medium(15-30), large(31-80), huge(81+)
      const isHuge   = g.val >= 81;
      const isLarge  = g.val >= 31;
      const isMedium = g.val >= 15;
      const isSmall  = g.val >= 5;
      const r    = isHuge ? 9 : isLarge ? 7 : isMedium ? 6 : isSmall ? 5 : 3.5;
      const col  = isHuge ? '#ffd700' : isLarge ? '#f39c12' : isMedium ? '#e67e22' : isSmall ? '#f1c40f' : '#ffe082';
      const glow = isHuge ? '#ffd700' : isLarge ? '#f39c12' : isMedium ? '#e67e22' : '#f1c40f';
      ctx.save();
      ctx.shadowBlur = isHuge ? 18 : isLarge ? 12 : isMedium ? 8 : 5;
      ctx.shadowColor = glow;
      // 끌어당김 중 펄스 효과
      const pulse = g._attracting ? 1 + Math.sin(elapsed * 28) * 0.18 : 1;
      ctx.beginPath();
      ctx.arc(g.x, g.y, r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      if (isLarge) {
        ctx.strokeStyle = isHuge ? '#fffacd' : '#f1c40f';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // 거대 XP: 내부 별 표시
      if (isHuge) {
        ctx.fillStyle = '#fffacd';
        ctx.font = '8px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', g.x, g.y);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
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

    // 장비 드롭 렌더 — 등급별 시각 구분 강화
    if (window.VPS && window.VPS.equipment) {
      const eq = window.VPS.equipment;
      const _gradeIdx = { normal: 0, rare: 1, unique: 2, legend: 3, mystic: 4, antique: 5 };
      for (const gd of gearDrops) {
        const pT = gd.pulseT || 0;
        const pulse = 0.8 + Math.sin(pT * 4) * 0.2;
        const fade  = Math.min(gd.life * 0.3, 1);
        const grade = eq.getGradeData(gd.item.grade);
        const base  = eq.getItemBase(gd.item);
        const gi = _gradeIdx[gd.item.grade] || 0;
        ctx.save();
        ctx.translate(gd.x, gd.y);
        ctx.globalAlpha = fade;
        // 등급별 아우라 반경
        const auraR = 12 + gi * 4;
        const spinSpeed = [0, 0.8, 1.2, 2.0, 2.5, 3.2][gi] || 0;
        // 배경 광채 (고등급일수록 넓고 강하게)
        if (gi >= 1) {
          const bgGrad = ctx.createRadialGradient(0, 0, auraR * 0.3, 0, 0, auraR * 1.6);
          bgGrad.addColorStop(0, grade.color + '55');
          bgGrad.addColorStop(1, grade.color + '00');
          ctx.fillStyle = bgGrad;
          ctx.beginPath();
          ctx.arc(0, 0, auraR * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // 외곽 링 (회전, 두껍게)
        ctx.save();
        ctx.rotate(pT * spinSpeed);
        ctx.shadowBlur = 8 + gi * 7;
        ctx.shadowColor = grade.color;
        ctx.strokeStyle = grade.color;
        ctx.lineWidth = 1.5 + gi * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, auraR * pulse, 0, Math.PI * 2);
        ctx.stroke();
        // 고등급: 2차 링
        if (gi >= 2) {
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, (auraR + 6) * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // 전설+: 회전 별 파티클
        if (gi >= 3) {
          const starCount = gi - 1;
          for (let si = 0; si < starCount; si++) {
            const sa = (si / starCount) * Math.PI * 2 + pT * spinSpeed;
            const sr = auraR * 1.4;
            ctx.fillStyle = grade.color;
            ctx.beginPath();
            ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        // 이하 아이템 아이콘
        ctx.shadowBlur = 0;
        ctx.font = `${14 + gi * 1.5}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(base.icon, 0, 0);
        // 등급 배지 (희귀+)
        if (gi >= 1) {
          ctx.font = '8px sans-serif';
          ctx.fillStyle = grade.color;
          ctx.shadowBlur = 4;
          ctx.shadowColor = grade.color;
          ctx.fillText(grade.name, 0, auraR + 10);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }

    // 파워업 젬 렌더 (정예 드롭)
    for (const pu of powerups) {
      const pulse = 1 + Math.sin(pu.pulseT * 6) * 0.16;
      const fade = Math.min(pu.life * 0.5, 1);
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.globalAlpha = fade;
      ctx.shadowBlur = 16;
      ctx.shadowColor = pu.def.color;
      ctx.fillStyle = pu.def.color;
      ctx.beginPath();
      ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pu.def.icon, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';

    // 파티클
    for (const tower of hybridTowers) {
      const def = HYBRID_TOWER_TYPES.find(t => t.id === tower.type) || HYBRID_TOWER_TYPES[0];
      const pulse = 1 + Math.sin((tower.pulse || 0) * 5) * 0.06;
      ctx.save();
      ctx.translate(tower.x, tower.y);
      ctx.globalAlpha = Math.min(1, tower.life / 8);
      ctx.strokeStyle = `rgba(255,255,255,${tower.cd <= 0 ? 0.16 : 0.08})`;
      ctx.beginPath();
      ctx.arc(0, 0, def.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.shadowBlur = 14;
      ctx.shadowColor = def.color;
      ctx.beginPath();
      ctx.rect(-12 * pulse, -12 * pulse, 24 * pulse, 24 * pulse);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#09101c';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, 0, 1);
      ctx.restore();
    }

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
        if (evolved) {
          // 블랙홀 사건의 지평선 — 회전하는 흡입 소용돌이
          const captureR = p.r + 78;
          const swirl = elapsed * 3;
          const hgrad = ctx.createRadialGradient(p.x, p.y, p.r * 0.4, p.x, p.y, captureR);
          hgrad.addColorStop(0, 'rgba(20,0,30,0.85)');
          hgrad.addColorStop(0.5, 'rgba(142,68,173,0.35)');
          hgrad.addColorStop(1, 'rgba(142,68,173,0)');
          ctx.fillStyle = hgrad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, captureR, 0, Math.PI * 2);
          ctx.fill();
          // 나선 팔 2개
          ctx.strokeStyle = 'rgba(179,136,255,0.5)';
          ctx.lineWidth = 2;
          for (let arm = 0; arm < 2; arm++) {
            ctx.beginPath();
            for (let t = 0; t <= 1; t += 0.1) {
              const rr = p.r + t * (captureR - p.r);
              const aa = swirl + arm * Math.PI + t * 5;
              const sx = p.x + Math.cos(aa) * rr;
              const sy = p.y + Math.sin(aa) * rr;
              t === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle  = evolved ? '#1a0a24' : '#3498db';
        ctx.shadowBlur = evolved ? 26 : 12;
        ctx.shadowColor = evolved ? '#9b59b6' : '#3498db';
        ctx.fill();
        if (evolved) {   // 블랙홀 코어 링
          ctx.strokeStyle = 'rgba(179,136,255,0.85)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
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
      } else if (p.type === 'tower') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color || '#5dade2';
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color || '#5dade2';
        ctx.fill();
        ctx.shadowBlur = 0;
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
      } else if (p.type === 'boomerang') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx) + (p.flipped ? Math.PI : 0));
        ctx.fillStyle = '#27ae60';
        ctx.shadowBlur = 10; ctx.shadowColor = '#2ecc71';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (p.type === 'arc') {
        // 번개 사슬 시각 효과 — 구불거리는 아크
        const alpha = p.life / 0.22;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#a29bfe';
        ctx.lineWidth   = 1.5 + alpha * 1.5;
        ctx.shadowBlur  = 12; ctx.shadowColor = '#6c5ce7';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const mx = (p.x + p.tx) / 2 + (Math.random() - 0.5) * 18;
        const my = (p.y + p.ty) / 2 + (Math.random() - 0.5) * 18;
        ctx.quadraticCurveTo(mx, my, p.tx, p.ty);
        ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
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
    for (const echo of slashEchoes) {
      if (!echo.triggered) continue;
      const echoAlpha = Math.max(0, echo.life / echo.maxLife);
      ctx.globalAlpha = echoAlpha * 0.52;
      ctx.strokeStyle = '#ff8fd8';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#ff8fd8';
      const esa = echo.angle;
      for (let sl = 0; sl < 3; sl++) {
        const offset = (sl - 1) * (10 + (echo.cleave || 0) * 3);
        const ox = Math.cos(esa + Math.PI / 2) * offset;
        const oy = Math.sin(esa + Math.PI / 2) * offset;
        ctx.lineWidth = 1.5 + (echo.cleave || 0) * 0.45;
        ctx.beginPath();
        ctx.moveTo(echo.start.x + ox, echo.start.y + oy);
        ctx.lineTo(echo.end.x + ox, echo.end.y + oy);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (dashEffect) {
      const alpha = dashEffect.life / dashEffect.maxLife;
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#f0d0ff';
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#d7a3f5';
      const sa = dashEffect.angle;
      const ex = dashEffect.endX !== undefined ? dashEffect.endX : dashEffect.x + Math.cos(sa) * (dashEffect.range || DASH_RANGE);
      const ey = dashEffect.endY !== undefined ? dashEffect.endY : dashEffect.y + Math.sin(sa) * (dashEffect.range || DASH_RANGE);
      for (let sl = 0; sl < 4; sl++) {
        const offset = (sl - 1.5) * (12 + (dashEffect.cleave || 0) * 3);
        const ox = Math.cos(sa + Math.PI / 2) * offset;
        const oy = Math.sin(sa + Math.PI / 2) * offset;
        ctx.lineWidth = 2 - sl * 0.3 + (dashEffect.cleave || 0) * 0.5;
        ctx.beginPath();
        ctx.moveTo(dashEffect.x + ox - Math.cos(sa) * 20, dashEffect.y + oy - Math.sin(sa) * 20);
        ctx.lineTo(ex + ox, ey + oy);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // 적
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      // 등장 연출: 작게 확대되며 페이드인 (적이 갑자기 튀어나오지 않음)
      if (e.spawnT > 0) {
        const s = 1 - e.spawnT / (e.isBoss ? 0.5 : 0.35);
        ctx.globalAlpha = Math.max(0.15, s);
        ctx.scale(0.4 + s * 0.6, 0.4 + s * 0.6);
      }
      // 플레이어 방향 회전
      if (e.faceAngle !== undefined) ctx.rotate(e.faceAngle + Math.PI / 2);
      const flash = e.hurtFlash > 0;
      const rageActive = e.hp < e.maxHp * 0.3;
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      ctx.shadowBlur = flash ? 20 : (rageActive ? 14 : 8);
      ctx.shadowColor = rageActive ? '#ff4500' : e.color;

      // 적 모양: boss=특수 별형, tier2=육각형, tier1 archer=마름모, tier1=사각형, tier0=원
      if (e.goblin) {
        // 보물 고블린: 황금빛 둥근 몸체
        ctx.fillStyle = flash ? '#ffffff' : '#f1c40f';
        ctx.shadowBlur = 16; ctx.shadowColor = '#f39c12';
        ctx.beginPath();
        ctx.arc(0, 0, e.size, 0, Math.PI * 2);
      } else if (e.isBoss) {
        // 보스: 8각 별 모양 + 맥동 광채
        ctx.shadowBlur = 28; ctx.shadowColor = e.color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a1 = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const a2 = ((i + 0.5) / 8) * Math.PI * 2 - Math.PI / 2;
          const outerR = e.size * (1 + Math.sin(elapsed * 3) * 0.08);
          i === 0 ? ctx.moveTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR)
                  : ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
          ctx.lineTo(Math.cos(a2) * e.size * 0.55, Math.sin(a2) * e.size * 0.55);
        }
        ctx.closePath();
      } else if (e.tier === 2) {
        // 티어2: 육각형 + 강한 광채 + 내부 삼각형 마킹
        ctx.shadowBlur = 16; ctx.shadowColor = e.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          i === 0 ? ctx.moveTo(Math.cos(a)*e.size, Math.sin(a)*e.size)
                  : ctx.lineTo(Math.cos(a)*e.size, Math.sin(a)*e.size);
        }
        ctx.closePath();
      } else if (e.tier === 1 && e.behavior === 'archer') {
        // 마름모 (원거리 유형 구별) + 중간 광채
        ctx.shadowBlur = 10; ctx.shadowColor = '#1abc9c';
        ctx.fillStyle = flash ? '#ffffff' : '#1abc9c';
        ctx.beginPath();
        ctx.moveTo(0, -e.size); ctx.lineTo(e.size * 1.1, 0);
        ctx.lineTo(0, e.size);  ctx.lineTo(-e.size * 1.1, 0);
        ctx.closePath();
      } else if (e.tier === 1) {
        // 티어1: 사각형 + 약한 광채
        ctx.shadowBlur = 8; ctx.shadowColor = e.color;
        ctx.beginPath();
        ctx.rect(-e.size, -e.size, e.size*2, e.size*2);
      } else {
        // 티어0: 원형, 작고 다수
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(0, 0, e.size, 0, Math.PI*2);
      }
      ctx.fill();
      // 티어2: 내부 마킹 (삼각형 무늬)
      if (!flash && e.tier === 2 && !e.isBoss) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        const im = e.size * 0.5;
        ctx.moveTo(0, -im); ctx.lineTo(im * 0.87, im * 0.5); ctx.lineTo(-im * 0.87, im * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      // 분노 상태: 적색 테두리 + 강화 광채
      if (rageActive && !flash) {
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#ff4500';
        ctx.strokeStyle = '#ff4500';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      // 빙결 상태 오버레이
      if (e.frozen > 0 && !flash) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#87ceeb';
        ctx.beginPath();
        ctx.arc(0, 0, e.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (e.rupture && !flash) {
        const rPulse = 1 + Math.sin(elapsed * 10) * 0.08;
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.size * rPulse + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      // 정예 오라 — 맥동하는 이중 링 + 왕관 (회전 변환 없이 별도 렌더)
      if (e.elite && e.spawnT <= 0) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const er = e.size + 6 + Math.sin(elapsed * 5) * 2;
        ctx.strokeStyle = e.eliteHue || '#f1c40f';
        ctx.shadowBlur = 14;
        ctx.shadowColor = e.eliteHue || '#f1c40f';
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, er, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(0, 0, er + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.font = '13px serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', 0, -e.size - 11);
        ctx.restore();
      }

      // 보물 고블린 — 💰 아이콘 + 반짝임 + 남은 시간 게이지
      if (e.goblin && e.spawnT <= 0) {
        ctx.save();
        ctx.translate(e.x, e.y);
        // 반짝이는 후광
        const gr = e.size + 5 + Math.sin(elapsed * 8) * 3;
        ctx.strokeStyle = '#ffd700';
        ctx.shadowBlur = 16; ctx.shadowColor = '#ffd700';
        ctx.globalAlpha = 0.7 + Math.sin(elapsed * 8) * 0.25;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.font = '15px serif';
        ctx.textAlign = 'center';
        ctx.fillText('💰', 0, 5);
        // 남은 시간 게이지 (도주까지)
        const gPct = Math.max(0, e.goblinLife / 13);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-e.size, -e.size - 12, e.size * 2, 4);
        ctx.fillStyle = gPct > 0.35 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(-e.size, -e.size - 12, e.size * 2 * gPct, 4);
        ctx.restore();
      }

      // 보스 공격 예비 동작 경고 (telegraph) — 팽창하는 붉은 경고원
      if (e.isBoss && e.windupActive && e.windupTimer > 0) {
        const dur = e.bossPhase === 1 ? 0.5 : 0.75;
        const progress = 1 - e.windupTimer / dur;  // 0→1
        const warningR  = e.size + 18 + progress * 85;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = 0.25 + progress * 0.55;
        ctx.strokeStyle = '#ff4500';
        ctx.lineWidth = 2 + progress * 5;
        ctx.shadowBlur = 24;
        ctx.shadowColor = '#ff2200';
        ctx.beginPath();
        ctx.arc(0, 0, warningR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.1 + progress * 0.22;
        ctx.fillStyle = '#ff2200';
        ctx.beginPath();
        ctx.arc(0, 0, warningR * 0.72, 0, Math.PI * 2);
        ctx.fill();
        // 경고 느낌표 아이콘
        ctx.globalAlpha = 0.7 + Math.sin(elapsed * 18) * 0.3;
        ctx.fillStyle = '#ff4500';
        ctx.font = `bold ${Math.round(16 + progress * 6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.fillText('⚠', 0, -e.size - 16);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // HP 바 (회전 없이 별도로)
      ctx.save();
      ctx.translate(e.x, e.y);
      const bw = e.size * 2.2, bh = 3;
      ctx.fillStyle = '#333';
      ctx.fillRect(-bw/2, -e.size - 7, bw, bh);
      ctx.fillStyle = rageActive ? '#ff4500' : e.color;
      ctx.fillRect(-bw/2, -e.size - 7, bw * (e.hp/e.maxHp), bh);
      // 보호막 바 (나이트메어 정예 전용) — HP 바 위에 파란색으로 오버레이
      if ((e.shield || 0) > 0 && e.maxShield) {
        ctx.fillStyle = '#74b9ff';
        ctx.fillRect(-bw/2, -e.size - 7, bw * Math.min(e.shield / e.maxShield, 1), bh);
        ctx.strokeStyle = '#0984e3';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-bw/2, -e.size - 7, bw, bh);
      }
      ctx.restore();
    }

    // spectral_blade 잔향 검기 필드 렌더링 — 보라색 맥동 원
    for (let i = 0; i < spectralFields.length; i++) {
      const sf = spectralFields[i];
      const t = sf.life / sf.maxLife;
      ctx.globalAlpha = t * 0.45;
      ctx.fillStyle = '#9b59b6';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#9b59b6';
      ctx.beginPath();
      ctx.arc(sf.x, sf.y, sf.range * (0.6 + Math.sin(elapsed * 8) * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = t * 0.7;
      ctx.strokeStyle = '#d7bfff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sf.x, sf.y, sf.range, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 대쉬 잔상 폭발 필드 렌더
    for (const af of dashAfterimages) {
      const t = af.life / af.maxLife;
      const col = af.isChain ? '#74b9ff' : '#d7a3f5';
      ctx.globalAlpha = t * 0.38;
      ctx.fillStyle = col;
      ctx.shadowBlur = 18;
      ctx.shadowColor = col;
      ctx.beginPath();
      ctx.arc(af.x, af.y, af.range * (0.7 + Math.sin(elapsed * 14) * 0.18), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = t * 0.65;
      ctx.strokeStyle = af.isChain ? '#b0d4ff' : '#f0d0ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(af.x, af.y, af.range, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // 충격파 링 그리기 (수명 갱신은 update에서 처리 — render는 그리기 전용)
    for (let i = 0; i < rings.length; i++) {
      const rg = rings[i];
      const t = 1 - rg.life / rg.maxLife;      // 0→1 (팽창 진행)
      const r = rg.r + (rg.maxR - rg.r) * t;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = Math.max(0.5, 3 - t * 2.5);
      ctx.shadowBlur = 8;
      ctx.shadowColor = rg.color;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // 데미지 숫자 (월드 공간)
    ctx.textAlign = 'center';
    const DN_SIZE  = [12, 15, 21];
    const DN_COLOR = ['#ffffff', '#ffe27a', '#ff8c1a'];
    ctx.textAlign = 'center';
    for (const dn of damageNumbers) {
      const t = dn.life / dn.maxLife;
      const tier = dn.tier || 0;
      // 등장 직후(수명 85%↑) 살짝 커졌다가 안정되는 팝 연출
      const pop = t > 0.85 ? 1 + (t - 0.85) / 0.15 * 0.45 : 1;
      ctx.globalAlpha = Math.min(1, t * 1.7);
      ctx.fillStyle = DN_COLOR[tier];
      ctx.font = `bold ${Math.round(DN_SIZE[tier] * pop)}px sans-serif`;
      ctx.shadowBlur  = tier === 2 ? 10 : tier === 1 ? 4 : 0;
      ctx.shadowColor = '#f39c12';
      ctx.fillText(tier === 2 ? `${dn.val}!` : dn.val, dn.x, dn.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // 부유 텍스트 (월드 공간)
    ctx.textAlign = 'center';
    for (const ft of floatTexts) {
      if (ft.screenSpace) continue;
      const alpha = Math.min(ft.life / ft.maxLife * 2, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color || '#fff';
      ctx.font = `bold ${ft.size || 14}px sans-serif`;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // 플레이어 이동 잔상 (질주감)
    for (const t of playerTrail) {
      ctx.globalAlpha = Math.max(0, t.life / 0.34) * 0.24;
      ctx.fillStyle = t.chainColor || '#d7a3f5';
      ctx.shadowBlur = t.chainColor ? 8 : 0;
      ctx.shadowColor = t.chainColor || 'transparent';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // 플레이어
    ctx.save();
    ctx.translate(player.x, player.y);
    const inv = player.invincible > 0;
    // 콤보 오라 — 콤보가 쌓일수록 강하게 빛나는 링 (게임이 살아있는 느낌)
    if (comboCount >= 10 && comboTimer > 0) {
      const auraCol = comboCount >= 30 ? '#e74c3c' : comboCount >= 20 ? '#f39c12' : '#f1c40f';
      const auraR = 20 + Math.sin(elapsed * 16) * 3 + Math.min(comboCount, 80) * 0.22;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = auraCol;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 16; ctx.shadowColor = auraCol;
      ctx.beginPath();
      ctx.arc(0, 0, auraR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    const hpRatio = getPlayerHpRatio();
    if (hpRatio <= LOW_HP_THRESHOLD) {
      const critical = hpRatio <= CRITICAL_HP_THRESHOLD;
      const pulse = 1 + Math.sin(elapsed * (critical ? 12 : 8)) * 0.08 + lowHpPulse * 0.04;
      ctx.globalAlpha = critical ? 0.42 : 0.28;
      ctx.strokeStyle = critical ? '#ff3b30' : '#f39c12';
      ctx.lineWidth = critical ? 4 : 3;
      ctx.beginPath();
      ctx.arc(0, 0, 25 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
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

    if (allyPlayer) {
      ctx.save();
      ctx.translate(allyPlayer.x, allyPlayer.y);
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#2ecc71';
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(0, 0, allyPlayer.radius || 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#06130d';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', 0, 1);
      ctx.strokeStyle = 'rgba(46,204,113,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, (allyPlayer.radius || 11) + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // camera

    // 피격 화면 플래시 — 맞은 순간 붉게 번쩍 (즉각적 피드백)
    if (hurtScreenFlash > 0) {
      ctx.fillStyle = `rgba(231,76,60,${(hurtScreenFlash / 0.28) * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 진화 금빛 섬광 — 화면 중앙에서 퍼지는 황금빛 (특별한 순간 강조)
    if (evolveFlash > 0) {
      const ef = evolveFlash / 0.55;
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      grad.addColorStop(0, `rgba(255,225,120,${ef * 0.5})`);
      grad.addColorStop(0.5, `rgba(241,196,15,${ef * 0.25})`);
      grad.addColorStop(1, 'rgba(241,196,15,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // 오버드라이브 활성 금빛 섬광 (발동 순간)
    if (overdriveFlash > 0) {
      const of2 = overdriveFlash / 0.55;
      const ogr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
      ogr.addColorStop(0, `rgba(255,215,0,${of2 * 0.65})`);
      ogr.addColorStop(0.45, `rgba(255,165,0,${of2 * 0.35})`);
      ogr.addColorStop(1, 'rgba(255,165,0,0)');
      ctx.fillStyle = ogr;
      ctx.fillRect(0, 0, W, H);
    }

    // 보스 경고 화면 플래시
    if (bossWarning > 0) {
      const wAlpha = (Math.sin(bossWarning * 9) * 0.5 + 0.5) * 0.35;
      ctx.fillStyle = `rgba(231,76,60,${wAlpha})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(231,76,60,${wAlpha * 2})`;
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, W, H);
    }

    // 보스 체력 바 (상단)
    renderLowHpWarning(W, H);

    const bossEnemy = enemies.find(e => e.isBoss);
    if (bossEnemy) {
      const bw = W * 0.55, bh = 14;
      const bx = (W - bw) / 2, by = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      ctx.fillStyle = bossEnemy.bossPhase === 1 ? '#e74c3c' : '#c0392b';
      ctx.fillRect(bx, by, bw * Math.max(0, bossEnemy.hp / bossEnemy.maxHp), bh);
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      // 50% 페이즈 선
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, by); ctx.lineTo(bx + bw * 0.5, by + bh); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 4; ctx.shadowColor = '#000';
      ctx.fillText(`⚠ BOSS  ${Math.ceil(bossEnemy.hp)} / ${bossEnemy.maxHp}`, W / 2, by + bh + 14);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
    }

    // 콤보 화면 비네트 — 높은 콤보에서 화면 가장자리가 발광하며 몰입감 상승
    if (comboCount >= 15 && comboTimer > 0) {
      const vCol = comboCount >= 30 ? '231,76,60' : comboCount >= 20 ? '243,156,18' : '241,196,15';
      const vA = Math.min(0.26, 0.10 + comboCount * 0.0035) * (0.7 + Math.sin(elapsed * 10) * 0.3);
      const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.62);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(${vCol},${vA})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // 무한 모드 비네트 — 붉은 심연 압박감 연출
    if (infiniteMode) {
      const infAge = infiniteElapsed / 60; // 경과 분
      const pulse = 0.5 + Math.sin(elapsed * 3.5) * 0.5;
      const infA = Math.min(0.38, 0.08 + infAge * 0.04) * (0.6 + pulse * 0.4);
      const ig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
      ig.addColorStop(0, 'rgba(0,0,0,0)');
      ig.addColorStop(0.6, 'rgba(80,0,0,0)');
      ig.addColorStop(1, `rgba(155,0,0,${infA})`);
      ctx.fillStyle = ig;
      ctx.fillRect(0, 0, W, H);
      // 진입 직후 3초간 강렬한 섬광
      if (infiniteElapsed < 3) {
        const splashA = Math.max(0, (3 - infiniteElapsed) / 3) * 0.22;
        ctx.fillStyle = `rgba(155,89,182,${splashA})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // 콤보 표시 — 단계별 색상·크기·타이틀 변화
    if (comboCount >= 5 && comboTimer > 0) {
      // 콤보 티어: 0=노랑 1=주황 2=빨강 3=보라 4=빨강(깜빡)
      const cTier = comboCount >= 200 ? 4 : comboCount >= 100 ? 3 : comboCount >= 50 ? 2 : comboCount >= 20 ? 1 : 0;
      const CTIER_COL  = ['#f1c40f', '#f39c12', '#e74c3c', '#9b59b6', '#e74c3c'];
      const CTIER_TAGS = ['', '', '⚡ FRENZY', '🔥 UNSTOPPABLE!', '💀 GODLIKE!!!'];
      const pulseAmt = 0.07 + cTier * 0.03;
      const cPulse = 1 + Math.sin(elapsed * (14 + cTier * 4)) * pulseAmt;
      const baseSize = 22 + cTier * 4;
      ctx.textAlign = 'center';
      ctx.fillStyle = CTIER_COL[cTier];
      ctx.shadowBlur = 14 + cTier * 8; ctx.shadowColor = ctx.fillStyle;
      ctx.font = `bold ${Math.floor(baseSize * cPulse)}px sans-serif`;
      ctx.fillText(`COMBO ×${comboCount}!`, W / 2, 92);
      if (CTIER_TAGS[cTier]) {
        ctx.font = `bold ${Math.floor((11 + cTier * 2) * cPulse)}px sans-serif`;
        ctx.fillText(CTIER_TAGS[cTier], W / 2, 108);
      }
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }

    // 화면 공간 부유 텍스트
    let ftY = H / 2 - 55;
    for (const ft of floatTexts) {
      if (!ft.screenSpace) continue;
      const ftAlpha = Math.min((ft.life / ft.maxLife) * 2, 1);
      ctx.globalAlpha = ftAlpha;
      ctx.fillStyle = ft.color || '#fff';
      ctx.font = `bold ${ft.size || 16}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = ft.color || '#fff';
      ctx.fillText(ft.text, W / 2, ftY);
      ctx.shadowBlur = 0;
      ftY += (ft.size || 16) + 10;
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';

    // 무적 중 화면 가장자리 효과
    if (player.invincible > 0.3) {
      ctx.strokeStyle = 'rgba(142,68,173,0.3)';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, W, H);
    }

    // 대쉬 쿨다운 표시 (우하단) + 연쇄 윈도우 표시
    if (state === 'playing') {
      const dcRatio = dashCd > 0 ? dashCd / DASH_COOLDOWN : 0;
      const chainActive = dashChainWindow > 0;
      const cx = W - 36, cy = H - 36, rad = 18;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      if (chainActive) {
        // 연쇄 대쉬 가능: 청색 맥동 표시
        const chainPulse = 0.7 + Math.sin(elapsed * 18) * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(116,185,255,${chainPulse * 0.9})`;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (dcRatio > 0) {
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
      ctx.fillStyle = chainActive ? '#001a33' : '#fff';
      ctx.font = chainActive ? 'bold 10px sans-serif' : '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(chainActive ? `⚡×${2 - dashChainCount}` : 'DASH', cx, cy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const towerDef = currentHybridTowerType();
      const tx = 38, ty = H - 36;
      ctx.beginPath();
      ctx.arc(tx, ty, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      ctx.strokeStyle = towerDef.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = towerDef.color;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${towerDef.icon}${player.towerCharges || 0}`, tx, ty);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '9px sans-serif';
      ctx.fillText('T/Y', tx, ty + 25);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // 오버드라이브 게이지 바 (하단 중앙)
      const odFull  = overdriveCharge >= 100;
      const odRatio = overdriveCharge / 100;
      const odW = Math.min(180, W * 0.36), odH = 11;
      const odX = W / 2 - odW / 2;
      const odY = H - 58;

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(odX - 2, odY - 2, odW + 4, odH + 4);

      if (overdriveActive > 0) {
        const odPulse = 0.75 + Math.sin(elapsed * 20) * 0.25;
        ctx.fillStyle = `rgba(255,215,0,${odPulse})`;
        ctx.fillRect(odX, odY, odW, odH);
        ctx.shadowBlur = 14; ctx.shadowColor = '#f1c40f';
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(odX, odY, odW, odH);
        ctx.shadowBlur = 0;
      } else {
        const odCol = odFull ? '#f1c40f' : '#b03030';
        ctx.fillStyle = odCol;
        ctx.fillRect(odX, odY, odW * odRatio, odH);
        if (odFull) { ctx.shadowBlur = 10; ctx.shadowColor = '#f1c40f'; }
        ctx.strokeStyle = odFull ? '#f1c40f' : '#555';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(odX, odY, odW, odH);
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = overdriveActive > 0 ? '#fff' : (odFull ? '#f1c40f' : '#aaa');
      ctx.font = `bold 9px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const odLabel = overdriveActive > 0
        ? `⚡ OVERDRIVE ${Math.ceil(overdriveActive)}s`
        : (odFull ? '⚡ OVERDRIVE  [Q]' : `OVERDRIVE  ${Math.floor(overdriveCharge)}%`);
      ctx.shadowBlur = odFull || overdriveActive > 0 ? 8 : 0;
      ctx.shadowColor = '#f1c40f';
      ctx.fillText(odLabel, W / 2, odY - 8);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore(); // 화면 흔들기 종료
  }

  // ── 무한 웨이브 다이얼로그 ─────────────────────────────────────
  function showInfiniteWaveDialog() {
    const dialog = document.getElementById('infiniteDialog');
    if (!dialog) { endGame('win'); return; }
    // 게임 일시 정지
    if (state === 'playing') state = 'paused';
    dialog.style.display = 'flex';
    const yesBtn = document.getElementById('infiniteYesBtn');
    const noBtn  = document.getElementById('infiniteNoBtn');
    function onYes() {
      cleanup();
      infiniteMode = true;
      state = 'playing';
      dialog.style.display = 'none';
      lastTime = performance.now();
      // 무한 모드 돌입 연출
      floatTexts.push({ text: '🌀 무한 웨이브 시작!', life: 3.0, maxLife: 3.0, screenSpace: true, color: '#9b59b6', size: 30 });
      screenShake = Math.min(screenShake + 0.5, 0.8);
      evolveFlash = 0.6;
      SFX.boss();
    }
    function onNo() {
      cleanup();
      dialog.style.display = 'none';
      state = 'playing';
      endGame('win');
    }
    function cleanup() {
      yesBtn && yesBtn.removeEventListener('click', onYes);
      noBtn  && noBtn.removeEventListener('click', onNo);
    }
    if (yesBtn) yesBtn.addEventListener('click', onYes);
    if (noBtn)  noBtn.addEventListener('click', onNo);
  }

  // ── 게임 종료 ───────────────────────────────────────────────────
  function endGame(result) {
    state = result;
    clearRunSnapshot();
    cancelAnimationFrame(frameId);
    const reward = awardRunRewards(result);
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
    sub.textContent = `Lv.${player.level}  -  ${fmtTime(elapsed)}  -  ${kills} kills  -  ${currentCharacter().name} / ${currentDifficulty().name}`;
    renderEndActions(result, reward);
    renderStartOptions();
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = 'none';
    const towerBtn = document.getElementById('towerBtn');
    if (towerBtn) towerBtn.style.display = 'none';
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

  // ── 조합 가이드 모달 ────────────────────────────────────────────
  function buildComboGuideHTML() {
    // 무기 진화 섹션
    let evoRows = EVOLUTION_DEFS.map(evo => {
      const base = WEAPON_DEFS[evo.base];
      const ev   = WEAPON_DEFS[evo.id];
      return `<tr>
        <td class="evolved-name">${ev.icon} ${ev.name}</td>
        <td>${base.icon} ${base.name} Lv.5</td>
        <td class="combo-passive">${evo.reqName}</td>
        <td class="combo-desc">${ev.desc}</td>
      </tr>`;
    }).join('');

    // 패시브 섹션
    let passRows = PASSIVE_POOL.map(pv => {
      const forEvo = EVOLUTION_DEFS.find(e => e.req === pv.id);
      const evoTag = forEvo ? ` <span style="color:#f1c40f;font-size:0.7em">→ ${WEAPON_DEFS[forEvo.id].icon}${WEAPON_DEFS[forEvo.id].name}</span>` : '';
      const maxTag = pv.max != null
        ? ` <span style="color:#7f8c9b;font-size:0.7em">(최대 ${pv.max}중첩)</span>`
        : ` <span style="color:#2ecc71;font-size:0.7em">(무제한 ∞)</span>`;
      return `<tr>
        <td>${pv.name}</td>
        <td class="combo-desc">${pv.desc}${maxTag}${evoTag}</td>
      </tr>`;
    }).join('');

    // 아이템 박스 섹션
    let itemRows = ITEM_BOX_POOL.map(it =>
      `<tr><td class="item-icon">${it.icon}</td><td>${it.name}</td></tr>`
    ).join('');

    // 시너지 섹션
    let synRows = SYNERGY_DEFS.map(s => {
      const active = hasSynergy(s.id);
      const reqStr = s.requires.map(r => {
        const pv = PASSIVE_POOL.find(p => p.id === r.id);
        const have = player ? (player.passives[r.id] || 0) : 0;
        const met  = have >= r.count;
        return `<span style="color:${met ? '#2ecc71' : '#7f8c9b'}">${pv ? pv.name : r.id} ×${r.count}</span>`;
      }).join(' + ');
      return `<tr style="opacity:${active ? 1 : 0.55}">
        <td style="color:${active ? '#f1c40f' : '#aaa'}">${s.icon} ${s.name}</td>
        <td class="combo-desc">${s.desc}</td>
        <td class="combo-desc" style="font-size:0.75em">${reqStr}</td>
      </tr>`;
    }).join('');

    return `
      <div class="combo-section">
        <div class="combo-section-title">⚗️ 무기 진화 조합</div>
        <table class="combo-table">
          <thead><tr><th>진화 무기</th><th>기반 무기</th><th>필요 패시브</th><th>효과</th></tr></thead>
          <tbody>${evoRows}</tbody>
        </table>
      </div>
      <div class="combo-section">
        <div class="combo-section-title">🎖 패시브 능력치</div>
        <table class="combo-table">
          <thead><tr><th>패시브</th><th>효과 · 진화 조건</th></tr></thead>
          <tbody>${passRows}</tbody>
        </table>
      </div>
      <div class="combo-section">
        <div class="combo-section-title">📦 아이템 박스 종류</div>
        <table class="combo-table">
          <thead><tr><th></th><th>아이템</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
      <div class="combo-section">
        <div class="combo-section-title">✨ 패시브 시너지 (조합 특수효과)</div>
        <table class="combo-table">
          <thead><tr><th>시너지</th><th>효과</th><th>필요 조건</th></tr></thead>
          <tbody>${synRows}</tbody>
        </table>
      </div>
    `;
  }

  function toggleComboGuide() {
    const el = document.getElementById('comboGuide');
    if (!el) return;
    if (el.style.display === 'none' || !el.style.display) {
      const content = document.getElementById('comboContent');
      if (content) content.innerHTML = buildComboGuideHTML();
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }
  function closeComboGuide() {
    const el = document.getElementById('comboGuide');
    if (el) el.style.display = 'none';
  }

  // 가이드 버튼 연결 — 요소가 없어도(구버전 캐시 등) 게임이 멈추지 않도록 방어
  const guideBtnEl   = document.getElementById('guideBtn');
  const comboCloseEl = document.getElementById('comboClose');
  if (guideBtnEl)   guideBtnEl.addEventListener('click', toggleComboGuide);
  if (comboCloseEl) comboCloseEl.addEventListener('click', closeComboGuide);

  // ── 버튼 연결 ───────────────────────────────────────────────────
  document.getElementById('startBtn').addEventListener('click', () => {
    SFX.init();   // 사용자 제스처 — 오디오 컨텍스트 활성화
    ensureStartPanels();
    clearEndActions();
    clearRunSnapshot();
    if (!isCharacterUnlocked(currentCharacter())) selectedCharacterId = 'knight';
    if (!isMapUnlocked(currentMap())) selectedMapId = 'meadow';
    meta.lastCharacter = selectedCharacterId;
    meta.lastDifficulty = selectedDifficultyId;
    meta.lastMap = selectedMapId;
    meta.dailyChallengeEnabled = dailyChallengeEnabled;
    saveMeta();
    const select = document.getElementById('stageSelect');
    if (select) selectedStageIdx = parseInt(select.value, 10) || 0;
    if (frameId) cancelAnimationFrame(frameId);
    document.getElementById('overlay').classList.remove('visible');
    const pauseOverlay = document.getElementById('pauseOverlay');
    if (pauseOverlay) pauseOverlay.style.display = 'none';
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = '';
    const towerBtn = document.getElementById('towerBtn');
    if (towerBtn) towerBtn.style.display = '';
    document.getElementById('levelOverlay').style.display = 'none';
    initGame();
    state = 'playing';
    saveRunSnapshot('start');
    lastTime = performance.now();
    frameId = requestAnimationFrame(loop);
  });

  // ── 장비 UI ─────────────────────────────────────────────────────
  function buildEquipUIHTML() {
    if (!player || !window.VPS || !window.VPS.equipment) return '';
    const eq = window.VPS.equipment;
    const slotNames = { helm: '투구', armor: '갑옷', boots: '장화', ring: '반지' };
    let html = '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">';
    for (const slot of eq.SLOTS) {
      const item = player.equip[slot];
      let content = `<div style="font-size:11px;color:#888;">${slotNames[slot]}<br><span style="font-size:20px;">❌</span><br><span style="color:#555;">비어있음</span></div>`;
      if (item) {
        const grade = eq.getGradeData(item.grade);
        const base  = eq.getItemBase(item);
        const stats = eq.getEquipStats(item);
        const statLines = [];
        if (stats.maxHp)      statLines.push(`❤ HP +${Math.round(stats.maxHp)}`);
        if (stats.dmgMult && stats.dmgMult !== 1) statLines.push(`⚔ 데미지 ×${stats.dmgMult.toFixed(2)}`);
        if (stats.cdMult  && stats.cdMult  !== 1) statLines.push(`⏩ CD ×${stats.cdMult.toFixed(2)}`);
        if (stats.speedMult && stats.speedMult !== 1) statLines.push(`👟 속도 ×${stats.speedMult.toFixed(2)}`);
        if (stats.rangeBonus && stats.rangeBonus !== 1) statLines.push(`🎯 사거리 ×${stats.rangeBonus.toFixed(2)}`);
        if (stats.xpRange && stats.xpRange !== 1) statLines.push(`🧲 XP범위 ×${stats.xpRange.toFixed(2)}`);
        if (stats.critChance) statLines.push(`⚡ 치명 +${(stats.critChance*100).toFixed(0)}%`);
        const gemIcons = (item.gems || []).map(g => g.icon || '').join('');
        // 특수 젬 이름 태그 (effect 보유 젬만)
        const specialGemTags = (item.gems || [])
          .map(g => (typeof g === 'object' ? g : eq.GEM_DEFS.find(d => d.id === g)))
          .filter(g => g && g.effect)
          .map(g => `<span style="color:#d7bfff;">${g.icon}${g.name}</span>`)
          .join(' ');
        content = `<div style="font-size:11px;color:#ccc;">${slotNames[slot]}<br><span style="font-size:20px;">${base.icon}</span><br><span style="color:${grade.color};font-weight:bold;">[${grade.name}]</span> ${base.name}<br><span style="color:#aaa;font-size:10px;">${statLines.join(' · ')}</span>${gemIcons ? `<br><span style="font-size:13px;">${gemIcons}</span>` : ''}${specialGemTags ? `<br><span style="font-size:9.5px;">${specialGemTags}</span>` : ''}</div>`;
      }
      html += `<div style="background:#1a2035;border:1px solid #2a3050;border-radius:8px;padding:10px;min-width:90px;text-align:center;">${content}</div>`;
    }
    html += '</div>';
    const bonuses = eq.getActiveBonusDescriptions(player.equip);
    if (bonuses.length) {
      html += `<div style="margin-top:10px;padding:8px;background:#0d1628;border-radius:6px;font-size:11px;color:#f1c40f;">${bonuses.map(b => `✦ ${b}`).join('<br>')}</div>`;
    }
    // 활성 특수 젬 효과 요약
    const gfx = eq.aggregateGemEffects(player.equip);
    const gfxKeys = Object.keys(gfx);
    if (gfxKeys.length) {
      const GFX_LABEL = {
        chain: '🔗 연쇄', cleave: '🪓 가르기', freeze: '❄ 빙결', fork: '🔱 부채꼴',
        combust: '🔥 점화', shock: '⚡ 감전', leech: '🩸 흡수', culling: '☠ 참수',
      };
      const lines = gfxKeys.map(k => {
        const e = gfx[k];
        const pc = e.procChance >= 1 ? '상시' : `${Math.round(e.procChance * 100)}%`;
        return `${GFX_LABEL[k] || k} <span style="color:#9a86c4;">(${pc}${e.count > 1 ? ` ×${e.count}` : ''})</span>`;
      });
      html += `<div style="margin-top:8px;padding:8px;background:#1a1230;border:1px solid #4a2d6e;border-radius:6px;font-size:11px;color:#d7bfff;">💠 특수 젬: ${lines.join(' · ')}</div>`;
    }

    // ── 메인+보조 무기 시스템 ──
    const mainId = getMainWeapon();
    html += `<div style="margin-top:12px;padding:8px;background:#0d1628;border-radius:6px;">`;
    html += `<div style="font-size:11px;color:#9fb4d8;margin-bottom:6px;">⭐ 메인 무기 선택 — 클릭으로 지정 · 보조 무기는 메인 공격에 오버레이 효과 추가</div>`;
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">`;
    for (const id of player.weapons) {
      const d = WEAPON_DEFS[id];
      const isMain = id === mainId;
      const defensive = !isAttackWeapon(id);
      const auxFam = defensive ? null : weaponFamily(id);
      const auxDef = (auxFam && !isMain) ? AUX_EFFECT_DEFS[auxFam] : null;
      const bg = isMain ? '#3b2a0a' : (defensive ? '#1e3a5f' : '#1e2638');
      const bd = isMain ? '#f1c40f' : (defensive ? '#3b82f6' : '#4b5563');
      const badge = isMain ? '⭐ 메인' : (defensive ? '🛡 방어' : '⚙ 보조');
      const badgeColor = isMain ? '#f1c40f' : (defensive ? '#60a5fa' : '#94a3b8');
      const auxHint = auxDef ? `<br><span style="font-size:8.5px;color:#7dd3fc;">${auxDef.icon} ${auxDef.name}</span>` : '';
      html += `<button class="weapon-toggle" data-wid="${id}" style="background:${bg};border:1.5px solid ${bd};color:#fff;border-radius:7px;padding:5px 9px;font-size:11px;cursor:${defensive ? 'default' : 'pointer'};min-width:72px;text-align:center;">${d.icon} ${d.name}<br><span style="font-size:9px;color:${badgeColor};">${badge}</span>${auxHint}</button>`;
    }
    html += `</div></div>`;

    // ── 보조 무기 효과 목록 (현재 발동 중인 오버레이) ──
    const auxFams = getAuxFamilies();
    if (auxFams.length && mainId) {
      const mainDef = WEAPON_DEFS[mainId];
      html += `<div style="margin-top:8px;padding:8px;background:#161d33;border:1px solid #2d3a5e;border-radius:6px;font-size:10.5px;line-height:1.7;">`;
      html += `<div style="color:#f1c40f;margin-bottom:3px;">🔗 보조 오버레이 효과 — <span style="color:#a3e635;">${mainDef.icon} ${mainDef.name}</span> 발사 시 함께 발동</div>`;
      for (const fam of auxFams) {
        const ef = AUX_EFFECT_DEFS[fam];
        if (!ef) continue;
        const procPct = ef.proc >= 1 ? '항상' : `${Math.round(ef.proc * 100)}%`;
        html += `<div style="margin-bottom:1px;"><span style="color:#2ecc71;">${ef.icon} ${ef.name}</span> <span style="color:#cbd5e1;">${ef.desc}</span> <span style="color:#64748b;">(${procPct})</span></div>`;
      }
      html += `</div>`;
    } else if (!mainId && player.weapons.some(w => isAttackWeapon(w))) {
      html += `<div style="margin-top:8px;padding:8px;background:#161d33;border:1px solid #4b5563;border-radius:6px;font-size:10.5px;color:#9ca3af;">위에서 공격 무기를 클릭해 메인으로 지정하세요</div>`;
    }

    // ── 세트 진행도 (장착 조각 수) ──
    if (eq.SET_DEFS) {
      const equippedIds = eq.SLOTS.map(sl => player.equip[sl]).filter(Boolean).map(it => it.baseId);
      const setRows = [];
      for (const set of eq.SET_DEFS) {
        const cnt = set.pieces.filter(p => equippedIds.includes(p)).length;
        if (cnt === 0) continue;
        const c2 = cnt >= 2, c4 = cnt >= 4;
        const bar = `<b style="color:${c4 ? set.color : c2 ? '#2ecc71' : '#9ca3af'};">${cnt}/4</b>`;
        const b2 = `<span style="color:${c2 ? '#2ecc71' : '#6b7280'};">2:${set.bonus2.desc}</span>`;
        const b4 = `<span style="color:${c4 ? set.color : '#6b7280'};">4:${set.bonus4.desc}</span>`;
        setRows.push(`<div style="margin-bottom:2px;">${set.name} ${bar} · ${b2} · ${b4}</div>`);
      }
      if (setRows.length) {
        html += `<div style="margin-top:8px;padding:8px;background:#13182a;border:1px solid #2a3050;border-radius:6px;font-size:10px;line-height:1.6;color:#cbd5e1;"><div style="color:#f1c40f;margin-bottom:3px;">🎽 세트 진행도</div>${setRows.join('')}</div>`;
      }
    }

    return html;
  }

  function renderEquipUI() {
    const body = document.getElementById('equipBody');
    if (body) body.innerHTML = buildEquipUIHTML();
  }

  function toggleEquipUI() {
    if (state === 'levelup' || state === 'itembox' || state === 'dead') return;
    equipUiVisible = !equipUiVisible;
    let panel = document.getElementById('equipPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'equipPanel';
      panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111827;border:2px solid #39445a;border-radius:12px;padding:18px;z-index:900;max-width:420px;width:94%;color:#fff;font-family:sans-serif;';
      panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><strong>⚔ 장비 창 (E키)</strong><button id="equipClose" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button></div><div id="equipBody"></div>`;
      document.body.appendChild(panel);
      document.getElementById('equipClose').addEventListener('click', () => { equipUiVisible = true; toggleEquipUI(); });
      // 메인 무기 지정 — equipBody 에 위임 핸들러 (innerHTML 교체돼도 유지)
      document.getElementById('equipBody').addEventListener('click', (ev) => {
        const btn = ev.target.closest('.weapon-toggle');
        if (btn && btn.dataset.wid) setMainWeapon(btn.dataset.wid);
      });
    }
    panel.style.display = equipUiVisible ? 'block' : 'none';
    if (equipUiVisible) {
      const body = document.getElementById('equipBody');
      if (body) {
        if (!player) {
          body.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">게임을 시작하면 장비를 볼 수 있어요!</p>';
        } else {
          body.innerHTML = buildEquipUIHTML();
        }
      }
      if (state === 'playing') setPaused(true);
    } else {
      if (state === 'paused') setPaused(false);
    }
  }

  function showGearPickupModal(item) {
    if (!item || !window.VPS || !window.VPS.equipment) return;
    const eq = window.VPS.equipment;
    const grade    = eq.getGradeData(item.grade);
    const base     = eq.getItemBase(item);
    const newStats = eq.getEquipStats(item);

    // 현재 장착 아이템 (같은 슬롯)
    const curItem  = player && player.equip && player.equip[item.slot] || null;
    const curBase  = curItem ? eq.getItemBase(curItem)  : null;
    const curGrade = curItem ? eq.getGradeData(curItem.grade) : null;
    const curStats = curItem ? eq.getEquipStats(curItem) : {};

    // 전투력 비교
    const newPower = eq.calcItemPower(item);
    const curPower = curItem ? eq.calcItemPower(curItem) : 0;
    const isWeaker = curItem && newPower < curPower;

    const slotKor = { helm: '투구', armor: '갑옷', boots: '장화', ring: '반지' }[item.slot] || item.slot;
    const gemIcons = (item.gems || []).map(g => g.icon || '').join(' ');
    // 특수 젬 효과 설명 (있을 때만)
    const gemEffectLines = (item.gems || [])
      .map(g => {
        const gd = typeof g === 'object' ? g : eq.GEM_DEFS.find(d => d.id === g);
        return gd && gd.effect && gd.desc ? `${gd.icon} ${gd.desc}` : '';
      })
      .filter(Boolean);

    // 스탯 비교 정의
    const STAT_DEFS = [
      { key: 'maxHp',      label: '❤ HP',      fmt: v => v ? `+${Math.round(v)}` : '0', def: 0,   higherBetter: true  },
      { key: 'dmgMult',    label: '⚔ 데미지',  fmt: v => `×${v.toFixed(2)}`,             def: 1,   higherBetter: true  },
      { key: 'cdMult',     label: '⏩ CD',      fmt: v => `×${v.toFixed(2)}`,             def: 1,   higherBetter: false },
      { key: 'speedMult',  label: '👟 속도',    fmt: v => `×${v.toFixed(2)}`,             def: 1,   higherBetter: true  },
      { key: 'rangeBonus', label: '🎯 사거리',  fmt: v => `×${v.toFixed(2)}`,             def: 1,   higherBetter: true  },
      { key: 'xpRange',    label: '🧲 XP',      fmt: v => `×${v.toFixed(2)}`,             def: 1,   higherBetter: true  },
      { key: 'critChance', label: '⚡ 치명',    fmt: v => `+${(v*100).toFixed(0)}%`,      def: 0,   higherBetter: true  },
    ];

    // 한쪽이라도 의미있는 값이면 표시
    const relevant = STAT_DEFS.filter(sd => {
      const nv = newStats[sd.key] !== undefined ? newStats[sd.key] : sd.def;
      const cv = curStats[sd.key] !== undefined ? curStats[sd.key] : sd.def;
      const eps = sd.key === 'maxHp' ? 0.5 : 0.001;
      return Math.abs(nv - sd.def) > eps || Math.abs(cv - sd.def) > eps;
    });

    const deltaRows = relevant.map(sd => {
      const nv = newStats[sd.key] !== undefined ? newStats[sd.key] : sd.def;
      const cv = curStats[sd.key] !== undefined ? curStats[sd.key] : sd.def;
      const same = Math.abs(nv - cv) < (sd.key === 'maxHp' ? 0.5 : 0.0005);
      let deltaStr = '', deltaColor = '#6b7280';
      if (!same) {
        const newBetter = sd.higherBetter ? nv > cv : nv < cv;
        deltaColor = newBetter ? '#2ecc71' : '#e74c3c';
        if (sd.key === 'maxHp') {
          const d = Math.round(nv - cv);
          deltaStr = `${d > 0 ? '▲ +' : '▼ '}${d}`;
        } else if (sd.key === 'critChance') {
          const d = ((nv - cv) * 100).toFixed(0);
          deltaStr = `${Number(d) > 0 ? '▲ +' : '▼ '}${d}%`;
        } else {
          const pct = Math.round((nv / cv - 1) * 100);
          deltaStr = `${pct > 0 ? '▲ +' : '▼ '}${pct}%`;
        }
      }
      const curStr = curItem ? sd.fmt(cv) : '—';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #1f2937;">
        <span style="color:#9ca3af;width:64px;">${sd.label}</span>
        <span style="color:#6b7280;width:52px;text-align:right;">${curStr}</span>
        <span style="color:#374151;margin:0 4px;">→</span>
        <span style="color:#e5e7eb;width:52px;">${sd.fmt(nv)}</span>
        <span style="color:${deltaColor};font-weight:bold;width:52px;text-align:right;">${deltaStr}</span>
      </div>`;
    }).join('') || `<div style="color:#6b7280;text-align:center;padding:4px;">스탯 없음</div>`;

    let modal = document.getElementById('gearModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gearModal';
      modal.style.cssText = 'display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111827;border:2px solid #39445a;border-radius:12px;padding:14px;z-index:950;max-width:420px;width:96%;color:#fff;font-family:sans-serif;max-height:90vh;overflow-y:auto;';
      document.body.appendChild(modal);
    }
    // 전투력 델타 표시
    const pwrDiff = newPower - curPower;
    const pwrColor = pwrDiff > 0 ? '#2ecc71' : pwrDiff < 0 ? '#e74c3c' : '#9ca3af';
    const pwrDiffStr = pwrDiff > 0 ? `▲ +${pwrDiff}` : pwrDiff < 0 ? `▼ ${pwrDiff}` : '=';
    modal.innerHTML = `
      <div style="font-size:10px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;text-align:center;margin-bottom:10px;">⚔ ${slotKor} 비교</div>
      <div style="display:grid;grid-template-columns:1fr 22px 1fr;gap:5px;align-items:center;margin-bottom:10px;">
        <div style="background:#1a2035;border:1px solid #2a3050;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:9px;color:#6b7280;letter-spacing:1px;margin-bottom:3px;">현재 장착</div>
          ${curItem ? `
            <div style="font-size:20px;">${curBase.icon}</div>
            <div style="color:${curGrade.color};font-size:0.75em;font-weight:bold;">[${curGrade.name}]</div>
            <div style="font-size:0.72em;color:#ccc;">${curBase.name}</div>
            <div style="font-size:0.7em;color:#9ca3af;margin-top:2px;">전투력 ${curPower}</div>
          ` : `
            <div style="font-size:20px;opacity:0.25;">—</div>
            <div style="font-size:0.72em;color:#4b5563;margin-top:2px;">비어있음</div>
          `}
        </div>
        <div style="text-align:center;color:#4b5563;font-size:14px;">→</div>
        <div style="background:#0d1117;border:2px solid ${grade.color};border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:9px;color:#9ca3af;letter-spacing:1px;margin-bottom:3px;">새 아이템</div>
          <div style="font-size:20px;">${base.icon}</div>
          <div style="color:${grade.color};font-size:0.75em;font-weight:bold;">[${grade.name}]</div>
          <div style="font-size:0.72em;color:#ccc;">${base.name}</div>
          ${gemIcons ? `<div style="font-size:11px;margin-top:2px;">${gemIcons}</div>` : ''}
          <div style="font-size:0.7em;color:${pwrColor};margin-top:2px;font-weight:bold;">전투력 ${newPower} <span style="font-size:0.85em;">${pwrDiffStr}</span></div>
        </div>
      </div>
      <div style="background:#0d1117;border-radius:6px;padding:8px;margin-bottom:12px;font-size:11px;">${deltaRows}</div>
      ${gemEffectLines.length ? `<div style="background:#1a1230;border:1px solid #4a2d6e;border-radius:6px;padding:7px 9px;margin-bottom:12px;font-size:10.5px;line-height:1.5;color:#d7bfff;">${gemEffectLines.map(l => `<div>${l}</div>`).join('')}</div>` : ''}
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <button id="gearEquip" style="background:#2563eb;border:none;color:#fff;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;"><strong>[1]</strong> 장착</button>
        ${isWeaker ? `<button id="gearDismantle" style="background:#7c3aed;border:none;color:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;"><strong>[3]</strong> 분해 (+${Math.max(1,Math.round(newPower/5))} XP)</button>` : ''}
        <button id="gearDrop" style="background:#374151;border:none;color:#fff;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;"><strong>[2]</strong> 버리기</button>
      </div>
      <div style="margin-top:8px;text-align:center;">
        <label style="font-size:10px;color:#6b7280;cursor:pointer;">
          <input type="checkbox" id="autoDismantleChk" ${autoDismantleEnabled ? 'checked' : ''} style="margin-right:4px;">
          자동 분해 (약한 장비 자동으로 경험치 변환)
        </label>
      </div>
    `;
    modal.style.display = 'block';
    if (state === 'playing') setPaused(true);

    function doEquip() {
      if (modal.style.display === 'none') return;
      modal.style.display = 'none';
      document.removeEventListener('keydown', gearKeyHandler);
      equipItem(item);
      if (state === 'paused') setPaused(false);
    }
    function doDrop() {
      if (modal.style.display === 'none') return;
      modal.style.display = 'none';
      document.removeEventListener('keydown', gearKeyHandler);
      floatTexts.push({ text: '🗑 버림', life: 1.0, maxLife: 1.0, screenSpace: true, color: '#888', size: 13 });
      if (state === 'paused') setPaused(false);
    }
    function doDismantle() {
      if (modal.style.display === 'none') return;
      modal.style.display = 'none';
      document.removeEventListener('keydown', gearKeyHandler);
      const xpGain = Math.max(1, Math.round(newPower / 5));
      gainXP(xpGain);
      floatTexts.push({ text: `⚗ 분해! +${xpGain} XP`, life: 1.6, maxLife: 1.6, screenSpace: true, color: '#a78bfa', size: 15 });
      if (state === 'paused') setPaused(false);
    }
    function gearKeyHandler(ev) {
      if (ev.key === '1') { ev.preventDefault(); doEquip(); }
      if (ev.key === '2') { ev.preventDefault(); doDrop(); }
      if (ev.key === '3' && isWeaker) { ev.preventDefault(); doDismantle(); }
    }
    document.addEventListener('keydown', gearKeyHandler);
    document.getElementById('gearEquip').onclick = doEquip;
    document.getElementById('gearDrop').onclick  = doDrop;
    if (isWeaker) {
      const dismantleBtn = document.getElementById('gearDismantle');
      if (dismantleBtn) dismantleBtn.onclick = doDismantle;
    }
    // 자동 분해 체크박스
    const chk = document.getElementById('autoDismantleChk');
    if (chk) chk.onchange = () => { autoDismantleEnabled = chk.checked; };
  }

  // 첫 프레임 시작
  ensureStartPanels();
  renderStartOptions();
  renderStageSelect();
  if (new URLSearchParams(window.location.search).has('vpsRoom')) {
    ensureCoopSocket();
  }
  frameId = requestAnimationFrame(loop);
})();
