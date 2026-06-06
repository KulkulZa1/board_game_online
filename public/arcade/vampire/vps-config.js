// 뱀파이어 서바이버 — 정적 설정/데이터 (순수 상수·정의, 게임 상태 비의존)
// game.js 보다 먼저 로드되어 window.VPS.config 로 노출된다.
// 여기에는 게임 런타임 상태(player/enemies 등)를 참조하지 않는 순수 데이터만 둔다.
//   apply() 콜백은 모두 인자(p, stats)만 다루므로 클로저 의존이 없다.
(function () {
  'use strict';
  window.VPS = window.VPS || {};

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
    // ── 진화 무기 (evolved) — 기본 무기 최대레벨 + 필요 패시브로 진화 ──
    blackhole: { name: '블랙홀',    icon: '🌀', desc: '적·투사체를 빨아들여 가두는 사건의 지평선', dmg: 48, cd: 0.55, range: 130, evolved: true },
    stormbow:  { name: '폭풍의 활', icon: '🌩', desc: '5연발 강화 관통 화살',        dmg: 42, cd: 0.38, range: 380, evolved: true },
    supernova: { name: '슈퍼노바',  icon: '☀',  desc: '연쇄 대폭발',                dmg: 130,cd: 1.6,  range: 160, evolved: true },
    deathray:  { name: '데스레이',  icon: '☠',  desc: '관통 즉사 광선',              dmg: 110,cd: 0.8,  range: 380, evolved: true },
    aegis:     { name: '이지스',    icon: '🛡', desc: '반사 보호막',                 dmg: 40, cd: 6,    range: 150, evolved: true },
    cyclone:   { name: '사이클론',  icon: '🌪', desc: '3방향 귀환 부메랑, 무한 관통', dmg: 72, cd: 0.9,  range: 380, evolved: true },
    tempest:   { name: '폭풍 사슬', icon: '⛈',  desc: '5연쇄 번개, 적 빙결',         dmg: 98, cd: 1.1,  range: 280, evolved: true },
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
  ];

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
    { id: 'ignite',   name: '🔥 점화',        desc: '적중 시 10% 확률로 화상 (초당 피해, 중첩)',          max: 5,    apply: (p) => { p.igniteChance = (p.igniteChance || 0) + 0.10; } },
    { id: 'venom',    name: '☠ 맹독',         desc: '적중 시 10% 확률로 독 (빠른 약한 틱, 중첩)',         max: 5,    apply: (p) => { p.venomChance  = (p.venomChance  || 0) + 0.10; } },
    { id: 'range_up', name: '🎯 사거리 확장', desc: '모든 무기 사거리·투사체 크기·AoE +18%',              max: 5,    apply: (p) => { p.rangeBonus = (p.rangeBonus || 1) * 1.18; } },
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
  ];

  const WEAPON_POOL = ['orb', 'arrow', 'nova', 'shield', 'laser', 'boomerang', 'chain'];
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
  ];
  const DIFFICULTY_DEFS = [
    { id: 'easy', name: 'Easy', desc: 'Practice run.', enemyHpMult: 0.78, enemySpeedMult: 0.92, enemyDmgMult: 0.75, spawnMult: 0.82, bossInterval: 150, coinMult: 0.75 },
    { id: 'normal', name: 'Normal', desc: 'Balanced 10 minute run.', enemyHpMult: 1, enemySpeedMult: 1, enemyDmgMult: 1, spawnMult: 1, bossInterval: 120, coinMult: 1 },
    { id: 'hard', name: 'Hard', desc: 'Higher pressure and rewards.', enemyHpMult: 1.28, enemySpeedMult: 1.1, enemyDmgMult: 1.22, spawnMult: 1.22, bossInterval: 105, coinMult: 1.45 },
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
  };

  window.VPS.config = {
    PLAYER_SPEED, BASE_HP, WAVE_INTERVAL, MAX_ENEMIES, DASH_COOLDOWN, DASH_DMG, DASH_RANGE,
    SURVIVE_GOAL, BOSS_INTERVAL, ITEM_BOX_INTERVAL, ITEM_BOX_LIFETIME, HORDE_WAVE_EVERY,
    MAX_WEAPON_LEVEL, MAX_WEAPONS, COMBO_MILESTONES,
    WEAPON_DEFS, EVOLUTION_DEFS, PASSIVE_POOL, SYNERGY_DEFS, WEAPON_POOL,
    META_KEY, RUN_SNAPSHOT_KEY, RUN_SNAPSHOT_MAX_AGE_MS, RUN_SNAPSHOT_INTERVAL,
    CHARACTER_DEFS, DIFFICULTY_DEFS, META_UPGRADE_DEFS, MAP_DEFS, START_BOOST_COST,
    HYBRID_TOWER_TYPES, MAX_HYBRID_TOWERS, TOWER_RECHARGE_SECONDS, ACHIEVEMENT_REWARDS,
  };
})();
