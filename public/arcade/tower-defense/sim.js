/* 첨탑 대란 — 타워 디펜스 로그라이트, 순수 규칙 엔진
 *
 * 이 파일은 렌더링 없이 게임 전체를 돌릴 수 있는 헤드리스 심이다.
 * (prototypes/td-rogue-test.js 와 밸런스 스윕이 Node에서 그대로 실행한다)
 *
 * 설계 기둥 — 이 저장소의 도파민 게임들이 실측으로 증명한 것:
 *   1) 선택이 빌드를 만든다: 웨이브를 깰 때마다 3장 중 1장 드래프트
 *   2) 곱연산 시너지: 인접한 같은 종류 Lv3 타워 둘 = ⚡융합 (재료 소모)
 *   3) 위험/보상: 저주 카드 — 즉시 이득, 상시 대가
 *   4) 죽어도 남는다: 판이 끝나면 🔮 마나핵 → 영구 업그레이드 (√점수 정산)
 *
 * 규칙은 틱 기반(초 단위 dt), 타워는 히트스캔 — 투사체는 렌더러의 연출일 뿐이다.
 */
(function () {
  'use strict';

  // ── 격자와 길 ───────────────────────────────────────────────────
  // 세로 화면 7×10. 길은 뱀처럼 세 번 꺾인다 — 타워 자리는 길이 아닌 모든 칸.
  const COLS = 7, ROWS = 10;
  // 융합체 강화는 상한이 없다. 상한을 두면 보드를 다 채운 뒤 금이 완전히 무의미해지고
  // (실측: 판 종료 시 잔금 31,761 · 39칸 만석), 그 순간 경제·보상 관련 모든 선택이
  // 죽는다. 비용은 ×2.2, 피해는 ×1.62로 올라가므로 금은 끝까지 부족하다 — 그게 벽이다.
  const FUSED_COST_STEP = 2.2, FUSED_DMG_STEP = 1.62;
  const PATH = [];
  (function buildPath() {
    // (0,1)→(5,1) → (5,3) → (1,3)→(1,5) → (5,5) → (5,7) → (1,7)→(1,9) 방향 전개
    const pts = [[0, 1], [5, 1], [5, 3], [1, 3], [1, 5], [5, 5], [5, 7], [1, 7], [1, 9], [6, 9]];
    for (let i = 0; i < pts.length - 1; i++) {
      let [x, y] = pts[i];
      const [tx, ty] = pts[i + 1];
      const dx = Math.sign(tx - x), dy = Math.sign(ty - y);
      while (x !== tx || y !== ty) {
        if (!PATH.some((p) => p.x === x && p.y === y)) PATH.push({ x, y });
        x += dx; y += dy;
      }
    }
    PATH.push({ x: 6, y: 9 });
  })();
  const PATH_LEN = PATH.length;
  const onPath = (x, y) => PATH.some((p) => p.x === x && p.y === y);

  // ── 타워 ───────────────────────────────────────────────────────
  // cost: 건설 비용, up: 레벨업 비용 배열(Lv2, Lv3), dmg/rate/range 는 Lv1 기준.
  // 레벨업마다 dmg ×1.6. 융합체는 재료 둘을 소모하고 한 칸에 선다.
  const TOWERS = {
    archer: { name: '궁수탑',  icon: '🏹', cost: 40,  up: [35, 60],  dmg: 10, rate: 1.6, range: 2.2,
              desc: '싸고 빠르다. 초반의 뼈대' },
    cannon: { name: '포격탑',  icon: '💣', cost: 70,  up: [60, 100], dmg: 24, rate: 0.6, range: 2.0, splash: 1.1,
              desc: '광역 폭발 — 무리를 갈아버린다' },
    frost:  { name: '냉각탑',  icon: '❄️', cost: 55,  up: [45, 80],  dmg: 5,  rate: 1.0, range: 2.0, slow: 0.45, slowDur: 1.6,
              desc: '적을 느리게 — 모든 탑의 친구' },
    tesla:  { name: '전격탑',  icon: '⚡', cost: 85,  up: [70, 115], dmg: 15, rate: 1.1, range: 2.2, chain: 3,
              desc: '번개가 3마리를 타고 흐른다' },
    sniper: { name: '저격탑',  icon: '🎯', cost: 100, up: [85, 140], dmg: 78, rate: 0.28, range: 4.6, pierceShield: true,
              desc: '느리지만 확실하게 — 방패 무시' },
    mint:   { name: '금광',    icon: '💰', cost: 60,  up: [55, 90],  dmg: 0,  rate: 0,   range: 0, income: 12,
              desc: '공격 대신 웨이브마다 금을 캔다' },
  };
  const FUSIONS = {
    archer: { id: 'gatling', name: '기관궁',   icon: '🏹⚙️', dmgMult: 2.2, rateMult: 2.0,
              desc: '두 궁수탑이 하나로 — 화살의 폭풍' },
    cannon: { id: 'volcano', name: '화산포',   icon: '🌋',  dmgMult: 2.4, burn: 6, burnDur: 3,
              desc: '맞은 자리가 3초간 불탄다' },
    frost:  { id: 'glacier', name: '빙하탑',   icon: '🧊',  dmgMult: 2.0, freeze: 0.18, slowMult: 1.35,
              desc: '18% 확률로 1초 완전 빙결' },
    tesla:  { id: 'storm',   name: '뇌운탑',   icon: '🌩️', dmgMult: 2.0, chainAdd: 3,
              desc: '번개가 6마리까지 흐른다' },
    sniper: { id: 'railgun', name: '레일건',   icon: '🛤️', dmgMult: 2.6, pierceLine: true,
              desc: '일직선 위 모든 적을 관통' },
    mint:   { id: 'mintcity', name: '조폐국',  icon: '🏦',  incomeMult: 2.2, interest: 0.08,
              desc: '수입 2배 + 보유 금의 8% 이자' },
  };

  // ── 드래프트 카드 ──────────────────────────────────────────────
  // 웨이브 클리어마다 3장 제시. tower 카드는 미보유 타워 해금, perk 는 전역 보정,
  // curse 는 즉시 큰 이득 + 상시 대가 — 스네이크/벽돌깨기에서 검증된 8~12% 비율.
  const PERKS = [
    { id: 'sharp',    name: '날카로운 촉',  icon: '🗡️', kind: 'perk', mod: { dmgMult: 0.15 },   desc: '모든 타워 피해 +15%' },
    { id: 'scope',    name: '망원 조준경',  icon: '🔭', kind: 'perk', mod: { rangeMult: 0.12 }, desc: '모든 타워 사거리 +12%' },
    { id: 'quick',    name: '속사 기어',    icon: '⚙️', kind: 'perk', mod: { rateMult: 0.12 },  desc: '모든 타워 공속 +12%' },
    { id: 'bounty',   name: '현상금 사냥',  icon: '💵', kind: 'perk', mod: { bountyMult: 0.2 }, desc: '처치 보상 +20%' },
    { id: 'coldsnap', name: '한파',         icon: '🌨️', kind: 'perk', mod: { slowBonus: 0.1 },  desc: '냉각탑 감속 +10%p' },
    { id: 'goldpack', name: '전쟁 채권',    icon: '💰', kind: 'perk', once: { gold: 90 },       desc: '즉시 +90 금' },
    { id: 'repair',   name: '성벽 보수',    icon: '🧱', kind: 'perk', once: { lives: 3 },       desc: '생명 +3' },
    { id: 'cheap',    name: '조립 설계도',  icon: '📐', kind: 'perk', mod: { costMult: -0.12 }, desc: '건설 비용 -12%' },
    { id: 'firstaid', name: '급속 냉각수',  icon: '🧯', kind: 'perk', mod: { slowAll: 0.05 },   desc: '모든 타워가 5% 감속을 얻는다' },
  ];
  const CURSES = [
    { id: 'bloodpact', name: '피의 계약',   icon: '🩸', kind: 'curse', once: { gold: 160 }, curse: { hpMult: 0.15 },
      desc: '+160 금. 대가: 적 체력이 15% 늘어난다' },
    { id: 'overclock', name: '과부하 코어', icon: '☢️', kind: 'curse', mod: { dmgMult: 0.35 }, curse: { livesCap: -3 },
      desc: '피해 +35%. 대가: 생명 3을 즉시 잃는다' },
    { id: 'greed',     name: '탐욕의 손',   icon: '🪙', kind: 'curse', mod: { bountyMult: 0.45 }, curse: { speedMult: 0.12 },
      desc: '보상 +45%. 대가: 적이 12% 빨라진다' },
  ];

  // ── 적 ────────────────────────────────────────────────────────
  // 속도는 "길을 완주하는 데 걸리는 초"로 읽어야 한다 (길이 31칸).
  // 초기값(침략병 0.85 = 36초)은 실측 결과 지독하게 루즈했다 — 웨이브 10이
  // 최대 화력으로도 82초. 전부 ~1.75배로 올려 침략병 21초 / 보스 39초로 조인다.
  const ENEMIES = {
    grunt:  { name: '침략병',   icon: '👾', hp: 26,  speed: 1.50, bounty: 6 },
    runner: { name: '질주귀',   icon: '🐺', hp: 15,  speed: 2.60, bounty: 6 },
    tank:   { name: '강철귀',   icon: '🛡️', hp: 88,  speed: 0.95, bounty: 14 },
    shield: { name: '방패병',   icon: '🔰', hp: 34,  speed: 1.40, bounty: 10, shield: 4 },
    regen:  { name: '재생귀',   icon: '🧪', hp: 46,  speed: 1.25, bounty: 12, regen: 3 },
    boss:   { name: '군주',     icon: '👑', hp: 620, speed: 0.80, bounty: 90, shield: 6, boss: true,
              rage: 0.9 },   // 체력이 깎일수록 빨라진다 — 다 잡아가던 보스가 갑자기 뛴다
  };
  // 웨이브 구성 — 5의 배수는 보스. 예고(preview)가 있어야 배치가 '계획'이 된다.
  function waveSpec(n) {
    // 지수 1.34 는 "한 판 = 13분(1배속) / 4.5분(3배속), 중앙값 22웨이브"를 목표로 실측해
    // 고른 값이다. 더 완만하게 두면(1.21) 한 판이 21분으로 늘어져 아케이드가 아니게 된다.
    // 2차 항은 최상단에서 곡선을 한 번 더 꺾어 무한 생존을 막는다.
    const late = Math.max(0, n - 12);
    const hpMult = Math.pow(1.34, n - 1) * (1 + late * late * 0.002);
    const list = [];
    const push = (type, count) => list.push({ type, count });
    if (n % 5 === 0) {
      push('boss', 1 + Math.floor(n / 10));
      push('grunt', 6 + n);
    } else {
      push('grunt', 5 + Math.floor(n * 1.5));
      if (n >= 2) push('runner', 2 + n);
      if (n >= 4) push('tank', Math.floor(n / 2));
      if (n >= 6) push('shield', Math.floor(n / 3) + 1);
      if (n >= 8) push('regen', Math.floor(n / 4));
    }
    return { n, hpMult, list, label: list.map((e) => `${ENEMIES[e.type].icon}×${e.count}`).join(' ') };
  }

  // ── 페이싱 ─────────────────────────────────────────────────────
  // 건설 단계에 시계가 없으면 게임이 아니라 스프레드시트다. 카운트다운이 끝나면
  // 웨이브가 자동으로 출격하고, 남은 시간을 금으로 바꿔 '지금 부르기'를 유혹한다.
  const BUILD_SECONDS = (wave) => Math.max(6, 13 - wave * 0.35);
  // 조기 출격 보너스는 '유혹'이지 '강제'가 아니어야 한다. 처음엔 정규 수입의 2배를
  // 줬는데, 그러자 끝까지 기다리는 플레이는 웨이브 4에서 파산했다 (실측: 탐욕봇 23 vs
  // 신중봇 4). 지금은 기다리는 쪽이 약 2웨이브 더 깊이 가고, 부르는 쪽은 실시간 템포와
  // 보너스를 얻는다 — 어느 쪽도 정답이 아닌 상태.
  const EARLY_GOLD = (wave, secsLeft) => Math.round(secsLeft * (0.5 + wave * 0.14));
  // 연속 격파 — 2.6초 안에 다음을 잡으면 이어진다. 누수 한 번이면 전부 리셋.
  // 문턱과 배율은 실측으로 잡았다. 처음엔 창 2.6초 / 8·20·40연속에 ×1.5·2·3 이었는데,
  // 웨이브마다 수십 마리가 죽으니 연쇄가 아예 끊기질 않아 (실측 최고 연쇄 305) 사실상
  // '상시 ×3 경제'가 됐다. 창을 좁히고 문턱을 올려 상위 등급을 후반의 성취로 만든다.
  const COMBO_WINDOW = 1.6;
  const COMBO_TIERS = [
    { at: 100, mult: 1.7, label: '⚡ 초토화' },
    { at: 45,  mult: 1.4, label: '🔥 맹공' },
    { at: 15,  mult: 1.2, label: '✨ 연속 격파' },
  ];
  const comboTier = (streak) => COMBO_TIERS.find((t) => streak >= t.at) || null;

  // ── 메타 (영구 업그레이드) ─────────────────────────────────────
  const META_KEY = 'td_meta_v1';
  // ⚠ 메타는 반드시 '곱연산'이어야 한다. 처음엔 전부 정액 보너스(시작 금 +90, 생명 +6)
  // 였는데, 적 체력이 1.21^n 으로 자라는 벽 앞에서 정액은 무의미했다 — 다섯 개를 전부
  // 최대로 사도 도달 웨이브가 0.5밖에 안 늘었다 (실측). 지금은 피해·수입이 배율이다.
  const META_UPGRADES = [
    { id: 'forge',   name: '단조 화력', icon: '🔥', max: 3, cost: (l) => 40 + l * 70, desc: (l) => `모든 타워 피해 +${(l + 1) * 8}%` },
    // 웨이브 정산 수입이 아니라 '처치 보상' 배율이다 — 후반 금의 95%는 현상금에서 나오고,
    // 정산 수입(15+2w)은 5%뿐이라 거기에 배율을 걸면 아무 일도 일어나지 않았다 (실측 -0.1웨이브).
    { id: 'tempo',   name: '전리품 감식', icon: '💵', max: 3, cost: (l) => 45 + l * 65, desc: (l) => `적 처치 보상 +${(l + 1) * 9}%` },
    { id: 'walls',   name: '겹성벽',   icon: '🏰', max: 3, cost: (l) => 35 + l * 50, desc: (l) => `시작 생명 +${(l + 1) * 2}` },
    { id: 'lens',    name: '넓은 안목', icon: '🃏', max: 1, cost: () => 150,          desc: () => '드래프트가 4장이 된다' },
    { id: 'armory',  name: '병기고',   icon: '🗝️', max: 2, cost: (l) => 60 + l * 80, desc: (l) => l === 0 ? '저격탑을 처음부터 해금' : '금광을 처음부터 해금' },
    { id: 'echo',    name: '메아리 핵', icon: '🔮', max: 3, cost: (l) => 50 + l * 60, desc: (l) => `마나핵 획득 +${(l + 1) * 15}% (판 밖의 성장)` },
  ];
  function normalizeMeta(raw) {
    const m = raw && typeof raw === 'object' ? raw : {};
    const up = {};
    for (const u of META_UPGRADES) up[u.id] = Math.max(0, Math.min(u.max, (m.upgrades && m.upgrades[u.id]) | 0));
    return { cores: Math.max(0, (m.cores | 0) || 0), best: Math.max(0, (m.best | 0) || 0), upgrades: up };
  }
  function metaCost(id, meta) {
    const u = META_UPGRADES.find((x) => x.id === id);
    if (!u) return Infinity;
    const lv = meta.upgrades[id] || 0;
    return lv >= u.max ? Infinity : u.cost(lv);
  }
  function buyMeta(meta, id) {
    const cost = metaCost(id, meta);
    if (!isFinite(cost) || meta.cores < cost) return { ok: false, meta };
    const m = normalizeMeta(JSON.parse(JSON.stringify(meta)));
    m.cores -= cost; m.upgrades[id] += 1;
    return { ok: true, meta: m };
  }
  // 판 종료 정산 — √점수: 좋은 판은 크게, 신적인 판도 상점 전체보다는 작게 (스네이크의 교훈)
  function coresEarned(wave, score, meta) {
    const m = normalizeMeta(meta);
    const base = Math.floor(Math.sqrt(Math.max(0, score)) / 2) + wave * 3;
    return Math.max(1, Math.round(base * (1 + (m.upgrades.echo || 0) * 0.15)));
  }

  // ── 결정적 RNG ────────────────────────────────────────────────
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  // ── 런(한 판) ─────────────────────────────────────────────────
  class Run {
    constructor(rng, meta) {
      this.rng = rng || makeRng(Date.now() & 0xffffffff);
      const m = normalizeMeta(meta);
      this.gold = 140;
      this.lives = 10 + (m.upgrades.walls || 0) * 2;
      this.incomeMult = 1;
      this.wave = 0;                 // 아직 시작 안 한 상태. startWave()로 1부터
      this.score = 0;
      this.towers = [];              // {x,y,type,lv,fused,cool}
      this.enemies = [];             // {type,hp,maxHp,pos(0..PATH_LEN),slow,slowT,freezeT,burn,burnT,shield}
      this.spawnQueue = [];
      this.spawnT = 0;
      this.phase = 'build';          // build | wave | draft | over
      this.hpMult = 1;               // startWave 전에 스폰돼도 안전
      this.mods = { dmgMult: 1 + (m.upgrades.forge || 0) * 0.08, rangeMult: 1, rateMult: 1,
                    bountyMult: 1 + (m.upgrades.tempo || 0) * 0.09, costMult: 1, slowBonus: 0, slowAll: 0 };
      this.curses = { hpMult: 1, speedMult: 1 };
      this.unlocked = ['archer', 'cannon', 'frost'];
      if ((m.upgrades.armory || 0) >= 1) this.unlocked.push('sniper');
      if ((m.upgrades.armory || 0) >= 2) this.unlocked.push('mint');
      this.draftSize = 3 + ((m.upgrades.lens || 0) ? 1 : 0);
      this.pendingDraft = null;
      this.kills = 0;
      this.buildLeft = BUILD_SECONDS(1);   // 건설 단계 카운트다운
      this.streak = 0;                     // 연속 격파
      this.streakT = 0;                    // 남은 콤보 창
      this.bestStreak = 0;
      this.earlyBonus = 0;                 // 마지막 조기 출격 보너스 (연출용)
      this.log = [];
    }

    towerAt(x, y) { return this.towers.find((t) => t.x === x && t.y === y) || null; }
    canBuild(x, y) {
      return x >= 0 && y >= 0 && x < COLS && y < ROWS && !onPath(x, y) && !this.towerAt(x, y);
    }
    buildCost(type) { return Math.max(10, Math.round(TOWERS[type].cost * (1 + this.mods.costMult - 1))); }

    build(type, x, y) {
      if (this.phase === 'over' || !TOWERS[type] || !this.unlocked.includes(type)) return null;
      if (!this.canBuild(x, y)) return null;
      const cost = this.buildCost(type);
      if (this.gold < cost) return null;
      this.gold -= cost;
      const t = { x, y, type, lv: 1, fused: false, cool: 0 };
      this.towers.push(t);
      return t;
    }
    // 융합체도 계속 강화된다(융합 Lv1~3). 이게 없으면 보드를 Lv3로 채운 순간
    // 화력 천장이 고정돼 금이 무의미해지고 — 실측대로 모든 판이 같은 웨이브에서 끝났다.
    // 후반의 금은 여기로 흘러야 '더 벌어서 더 버틴다'는 선택이 성립한다.
    upgradeCost(t) {
      if (t.fused) {
        const flv = t.flv || 1;
        return Math.round(TOWERS[t.type].cost * 2.6 * Math.pow(FUSED_COST_STEP, flv - 1) * this.mods.costMult);
      }
      if (t.lv >= 3) return Infinity;
      return Math.round(TOWERS[t.type].up[t.lv - 1] * this.mods.costMult);
    }
    upgrade(x, y) {
      const t = this.towerAt(x, y);
      if (!t) return false;
      const cost = this.upgradeCost(t);
      if (!isFinite(cost) || this.gold < cost) return false;
      this.gold -= cost;
      if (t.fused) t.flv = (t.flv || 1) + 1; else t.lv += 1;
      return true;
    }
    sell(x, y) {
      const i = this.towers.findIndex((t) => t.x === x && t.y === y);
      if (i < 0) return false;
      const t = this.towers[i];
      const back = Math.round(TOWERS[t.type].cost * 0.6 * (t.fused ? 4 * (t.flv || 1) : t.lv));
      this.towers.splice(i, 1);
      this.gold += back;
      return back;
    }
    // 융합: 같은 종류 Lv3 둘이 상하좌우로 붙어 있으면, 한쪽을 소모해 융합체가 된다
    canFuse(x, y) {
      const t = this.towerAt(x, y);
      if (!t || t.fused || t.lv < 3) return null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = this.towerAt(x + dx, y + dy);
        if (o && !o.fused && o.type === t.type && o.lv >= 3) return o;
      }
      return null;
    }
    fuse(x, y) {
      const t = this.towerAt(x, y);
      const mate = this.canFuse(x, y);
      if (!t || !mate) return false;
      this.towers.splice(this.towers.indexOf(mate), 1);   // 재료 소모 — 공짜 융합은 융합이 아니다
      t.fused = true; t.flv = 1;
      return true;
    }

    towerStats(t) {
      const base = TOWERS[t.type];
      const lvMult = Math.pow(1.6, t.lv - 1);
      const fu = t.fused ? FUSIONS[t.type] : null;
      const fuLvMult = t.fused ? Math.pow(FUSED_DMG_STEP, (t.flv || 1) - 1) : 1;
      return {
        dmg: base.dmg * lvMult * (fu ? fu.dmgMult : 1) * fuLvMult * this.mods.dmgMult,
        rate: base.rate * (fu && fu.rateMult ? fu.rateMult : 1) * this.mods.rateMult,
        range: base.range * this.mods.rangeMult,
        splash: base.splash || 0,
        slow: (base.slow || this.mods.slowAll || 0) + (base.slow ? this.mods.slowBonus : 0),
        slowDur: base.slowDur || 1.2,
        slowMult: fu && fu.slowMult ? fu.slowMult : 1,
        chain: (base.chain || 0) + (fu && fu.chainAdd ? fu.chainAdd : 0),
        pierceShield: !!base.pierceShield,
        pierceLine: !!(fu && fu.pierceLine),
        burn: fu && fu.burn ? fu.burn : 0, burnDur: fu ? fu.burnDur || 0 : 0,
        freeze: fu && fu.freeze ? fu.freeze : 0,
        income: (base.income || 0) * (t.fused && fu.incomeMult ? fu.incomeMult : 1) * (t.fused ? 3 * (t.flv || 1) : t.lv),
        interest: t.fused && fu.interest ? fu.interest : 0,
      };
    }

    startWave() {
      if (this.phase !== 'build' || this.pendingDraft) return null;
      this.wave += 1;
      const spec = waveSpec(this.wave);
      this.spawnQueue = [];
      for (const grp of spec.list) {
        for (let i = 0; i < grp.count; i++) this.spawnQueue.push(grp.type);
      }
      // 섞되 보스는 마지막에
      for (let i = this.spawnQueue.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
      }
      this.spawnQueue.sort((a, b) => (a === 'boss') - (b === 'boss'));
      this.spawnT = 0;
      this.phase = 'wave';
      this.hpMult = spec.hpMult * this.curses.hpMult;
      this.waveSpeed = 1 + Math.max(0, this.wave - 10) * 0.015;  // 후반 속도 크리프
      // 남은 건설 시간을 금으로 — 준비가 덜 됐어도 부르고 싶게 만드는 유혹
      this.earlyBonus = this.buildLeft > 0.4 ? EARLY_GOLD(this.wave, this.buildLeft) : 0;
      this.gold += this.earlyBonus;
      this.buildLeft = 0;
      return spec;
    }
    nextWavePreview() { return waveSpec(this.wave + 1); }

    _spawn(type) {
      const def = ENEMIES[type];
      this.enemies.push({
        type, hp: def.hp * this.hpMult, maxHp: def.hp * this.hpMult,
        pos: 0, slow: 0, slowT: 0, freezeT: 0, burn: 0, burnT: 0,
        shield: def.shield || 0, regen: def.regen || 0, rage: def.rage || 0,
        speed: def.speed * (1 + (this.curses.speedMult - 1)) * (this.waveSpeed || 1),
      });
    }

    // dt 초 진행. 이벤트 목록을 돌려준다 (렌더러의 연출 훅)
    tick(dt) {
      const ev = [];
      // 건설 단계에도 시계가 흐른다 — 드래프트를 고르는 동안만 멈춘다(그게 숨 돌릴 틈).
      if (this.phase === 'build') {
        if (this.pendingDraft) return ev;
        this.buildLeft = Math.max(0, this.buildLeft - dt);
        if (this.buildLeft <= 0) {
          const spec = this.startWave();
          if (spec) ev.push({ t: 'autowave', wave: spec.n });
        }
        return ev;
      }
      if (this.phase !== 'wave') return ev;
      // 콤보 창 소멸
      if (this.streakT > 0) {
        this.streakT -= dt;
        if (this.streakT <= 0 && this.streak > 0) { this.streak = 0; ev.push({ t: 'streakend' }); }
      }

      // 스폰
      this.spawnT -= dt;
      if (this.spawnQueue.length && this.spawnT <= 0) {
        const type = this.spawnQueue.shift();
        this._spawn(type);
        ev.push({ t: 'spawn', type });
        this.spawnT = type === 'boss' ? 0.9 : Math.max(0.16, 0.42 - this.wave * 0.012);
      }

      // 적 이동/도트
      for (const e of this.enemies) {
        if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burn * dt; }
        if (e.regen && e.hp < e.maxHp && e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
        if (e.freezeT > 0) { e.freezeT -= dt; continue; }
        const slowF = e.slowT > 0 ? (e.slowT -= dt, 1 - Math.min(0.8, e.slow)) : 1;
        // 격노: 보스는 피가 빠질수록 빨라진다 — 다 잡았다 싶을 때 출구로 튄다
        const rage = e.rage ? 1 + e.rage * (1 - Math.max(0, e.hp) / e.maxHp) : 1;
        e.pos += e.speed * slowF * rage * dt;
      }

      // 도착 처리
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.pos >= PATH_LEN - 1) {
          this.enemies.splice(i, 1);
          this.lives -= ENEMIES[e.type].boss ? 3 : 1;
          const lostStreak = this.streak;
          this.streak = 0; this.streakT = 0;   // 누수 한 번이면 연쇄가 통째로 끊긴다
          ev.push({ t: 'leak', type: e.type, lostStreak });
        } else if (e.hp <= 0) {
          this.enemies.splice(i, 1);
          this.streak += 1;
          this.streakT = COMBO_WINDOW;
          if (this.streak > this.bestStreak) this.bestStreak = this.streak;
          const tier = comboTier(this.streak);
          const mult = tier ? tier.mult : 1;
          const bounty = Math.round(ENEMIES[e.type].bounty * (1 + this.wave * 0.06) * this.mods.bountyMult * mult);
          this.gold += bounty;
          this.score += Math.round(ENEMIES[e.type].bounty * this.wave * mult);
          this.kills += 1;
          const p = this.enemyXY(e);
          ev.push({ t: 'kill', type: e.type, bounty, mult, x: p.x, y: p.y });
          // 콤보 등급이 막 올라간 순간 — 연출이 크게 터져야 한다
          const prev = comboTier(this.streak - 1);
          if (tier && (!prev || prev.at !== tier.at)) ev.push({ t: 'combo', tier, streak: this.streak });
        }
      }
      if (this.lives <= 0) { this.phase = 'over'; ev.push({ t: 'gameover' }); return ev; }

      // 타워 공격
      for (const t of this.towers) {
        const st = this.towerStats(t);
        if (st.rate <= 0) continue;
        t.cool -= dt;
        if (t.cool > 0) continue;
        const targets = this._acquire(t, st);
        if (!targets.length) continue;
        t.cool = 1 / st.rate;
        this._strike(t, st, targets, ev);
      }
      return ev;
    }

    enemyXY(e) {
      const i = Math.min(PATH_LEN - 1, Math.floor(e.pos));
      const frac = Math.min(1, e.pos - i);
      const a = PATH[i], b = PATH[Math.min(PATH_LEN - 1, i + 1)];
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    }

    _acquire(t, st) {
      // 출구에 가장 가까운(=pos 최대) 적부터
      const inRange = [];
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const p = this.enemyXY(e);
        const d2 = (p.x - t.x) ** 2 + (p.y - t.y) ** 2;
        if (d2 <= st.range * st.range) inRange.push(e);
      }
      inRange.sort((a, b) => b.pos - a.pos);
      return inRange;
    }

    _hit(e, dmg, st, ev) {
      if (e.shield > 0 && !st.pierceShield) { e.shield -= 1; ev.push({ t: 'block', x: this.enemyXY(e).x, y: this.enemyXY(e).y }); return; }
      e.hp -= dmg;
      if (st.slow > 0) { e.slow = Math.max(e.slow, st.slow * st.slowMult); e.slowT = Math.max(e.slowT, st.slowDur); }
      if (st.burn > 0) { e.burn = st.burn; e.burnT = st.burnDur; }
      if (st.freeze > 0 && this.rng() < st.freeze && !ENEMIES[e.type].boss) e.freezeT = 1.0;
    }

    _strike(t, st, targets, ev) {
      const prime = targets[0];
      const pp = this.enemyXY(prime);
      ev.push({ t: 'shot', tower: t.type, fused: t.fused, from: { x: t.x, y: t.y }, to: pp });
      if (st.pierceLine) {
        // 레일건: 타워→대상 직선 근처(0.6칸)의 모든 적
        for (const e of this.enemies) {
          const p = this.enemyXY(e);
          const d = distToSeg(p, { x: t.x, y: t.y }, pp);
          if (d < 0.6) this._hit(e, st.dmg, st, ev);
        }
      } else if (st.splash > 0) {
        for (const e of this.enemies) {
          const p = this.enemyXY(e);
          if ((p.x - pp.x) ** 2 + (p.y - pp.y) ** 2 <= st.splash * st.splash) this._hit(e, st.dmg, st, ev);
        }
        ev.push({ t: 'boom', x: pp.x, y: pp.y, r: st.splash });
      } else if (st.chain > 0) {
        let cur = prime, hitSet = new Set([prime]);
        this._hit(cur, st.dmg, st, ev);
        for (let c = 1; c < st.chain; c++) {
          const p = this.enemyXY(cur);
          let next = null, nd = 2.2 * 2.2;
          for (const e of this.enemies) {
            if (hitSet.has(e) || e.hp <= 0) continue;
            const q = this.enemyXY(e);
            const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
            if (d2 < nd) { nd = d2; next = e; }
          }
          if (!next) break;
          ev.push({ t: 'chain', from: this.enemyXY(cur), to: this.enemyXY(next) });
          this._hit(next, st.dmg * 0.8, st, ev);
          hitSet.add(next); cur = next;
        }
      } else {
        this._hit(prime, st.dmg, st, ev);
      }
    }

    waveOver() { return this.phase === 'wave' && !this.spawnQueue.length && !this.enemies.length; }
    // 선두 적이 출구에 얼마나 다가왔나 (0~1) — 화면 가장자리 경고에 쓴다
    threat() {
      let worst = 0;
      for (const e of this.enemies) worst = Math.max(worst, e.pos / (PATH_LEN - 1));
      return worst;
    }
    comboTier() { return comboTier(this.streak); }

    // 웨이브 종료 정산 → 드래프트 제시
    settleWave() {
      if (!this.waveOver()) return null;
      let income = 15 + this.wave * 2;
      for (const t of this.towers) {
        const st = this.towerStats(t);
        if (st.income) income += Math.round(st.income);
        if (st.interest) income += Math.round(this.gold * st.interest);
      }
      income = Math.round(income * this.incomeMult);
      this.gold += income;
      this.score += this.wave * 10;
      this.phase = 'build';
      this.buildLeft = BUILD_SECONDS(this.wave + 1);
      this.pendingDraft = this._draftOffers();
      return { income, draft: this.pendingDraft };
    }

    _draftOffers() {
      const pool = [];
      // 미해금 타워 카드
      for (const id of Object.keys(TOWERS)) {
        if (!this.unlocked.includes(id)) pool.push({ id: 'unlock_' + id, name: TOWERS[id].name + ' 해금', icon: TOWERS[id].icon, kind: 'tower', tower: id, desc: TOWERS[id].desc });
      }
      for (const p of PERKS) pool.push(p);
      if (this.wave >= 3) for (const c of CURSES) pool.push(c);
      // 셔플 후 draftSize 장 — 저주는 최대 1장
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const out = [];
      let curseUsed = false;
      for (const c of pool) {
        if (out.length >= this.draftSize) break;
        if (c.kind === 'curse') {
          if (curseUsed) continue;
          // ⚠ 생명을 요구하는 저주는 '실제로 낼 수 있을 때만' 제시한다.
          // pickDraft 의 Math.max(1, ...) 바닥값이 생명 1~3 일 때 대가를 0으로 만들어,
          // 과부하 코어(피해 +35%)가 사실상 공짜가 됐다 — 1.35^n 이 적 체력 1.34^n 을
          // 앞질러 무한 생존이 열렸다 (실측: 강제 선택 시 80/80 판이 웨이브 60 초과).
          if (c.curse && c.curse.livesCap && this.lives + c.curse.livesCap < 1) continue;
          curseUsed = true;
        }
        out.push(c);
      }
      return out;
    }

    pickDraft(id) {
      if (!this.pendingDraft) return false;
      const c = this.pendingDraft.find((x) => x.id === id);
      if (!c) return false;
      if (c.kind === 'tower') this.unlocked.push(c.tower);
      if (c.mod) for (const k of Object.keys(c.mod)) {
        if (k === 'costMult') this.mods.costMult = Math.max(0.5, this.mods.costMult + c.mod[k]);
        else if (k === 'slowBonus' || k === 'slowAll') this.mods[k] += c.mod[k];
        else this.mods[k] *= (1 + c.mod[k]);
      }
      if (c.once) {
        if (c.once.gold) this.gold += c.once.gold;
        if (c.once.lives) this.lives += c.once.lives;
      }
      if (c.curse) {
        if (c.curse.hpMult) this.curses.hpMult *= (1 + c.curse.hpMult);
        if (c.curse.speedMult) this.curses.speedMult *= (1 + c.curse.speedMult);
        if (c.curse.livesCap) this.lives = Math.max(1, this.lives + c.curse.livesCap);
        // 바닥값 1 자체는 '고르자마자 즉사' 를 막으려고 있는 것이라 유지한다.
        // 대신 _draftOffers 가 감당 못 할 저주를 아예 제시하지 않는다 — 아래 참고.
      }
      this.pendingDraft = null;
      return true;
    }
    skipDraft() { if (!this.pendingDraft) return false; this.pendingDraft = null; this.gold += 10; return true; }
  }

  function distToSeg(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
    const qx = a.x + abx * t, qy = a.y + aby * t;
    return Math.hypot(p.x - qx, p.y - qy);
  }

  const api = {
    COLS, ROWS, PATH, PATH_LEN, onPath,
    TOWERS, FUSIONS, PERKS, CURSES, ENEMIES, waveSpec, FUSED_COST_STEP, FUSED_DMG_STEP,
    META_KEY, META_UPGRADES, normalizeMeta, metaCost, buyMeta, coresEarned,
    BUILD_SECONDS, EARLY_GOLD, COMBO_WINDOW, COMBO_TIERS, comboTier,
    makeRng, Run,
  };
  if (typeof window !== 'undefined') window.TDRogue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
