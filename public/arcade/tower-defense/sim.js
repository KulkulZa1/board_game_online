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
    archer: { name: '궁수탑',  icon: '🏹', cost: 40,  up: [35, 60],  dmg: 6,  rate: 1.6, range: 2.2,
              desc: '싸고 빠르다. 초반의 뼈대' },
    cannon: { name: '포격탑',  icon: '💣', cost: 70,  up: [60, 100], dmg: 14, rate: 0.6, range: 2.0, splash: 1.1,
              desc: '광역 폭발 — 무리를 갈아버린다' },
    frost:  { name: '냉각탑',  icon: '❄️', cost: 55,  up: [45, 80],  dmg: 3,  rate: 1.0, range: 2.0, slow: 0.45, slowDur: 1.6,
              desc: '적을 느리게 — 모든 탑의 친구' },
    tesla:  { name: '전격탑',  icon: '⚡', cost: 85,  up: [70, 115], dmg: 9,  rate: 1.1, range: 2.2, chain: 3,
              desc: '번개가 3마리를 타고 흐른다' },
    sniper: { name: '저격탑',  icon: '🎯', cost: 100, up: [85, 140], dmg: 46, rate: 0.28, range: 4.6, pierceShield: true,
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
  const ENEMIES = {
    grunt:  { name: '침략병',   icon: '👾', hp: 26,  speed: 0.85, bounty: 6 },
    runner: { name: '질주귀',   icon: '🐺', hp: 15,  speed: 1.55, bounty: 6 },
    tank:   { name: '강철귀',   icon: '🛡️', hp: 88,  speed: 0.5,  bounty: 14 },
    shield: { name: '방패병',   icon: '🔰', hp: 34,  speed: 0.8,  bounty: 10, shield: 4 },
    regen:  { name: '재생귀',   icon: '🧪', hp: 46,  speed: 0.72, bounty: 12, regen: 3 },
    boss:   { name: '군주',     icon: '👑', hp: 620, speed: 0.42, bounty: 90, shield: 6, boss: true },
  };
  // 웨이브 구성 — 5의 배수는 보스. 예고(preview)가 있어야 배치가 '계획'이 된다.
  function waveSpec(n) {
    // 후반은 지수 위에 2차 램프를 더한다 — 이게 없으면 어떤 빌드든 40웨이브를
    // 무한히 버텼다 (스윕 실측: 메타0 봇의 48%가 상한 도달). 벽은 있어야 한다.
    const late = Math.max(0, n - 12);
    const hpMult = Math.pow(1.17, n - 1) * (1 + late * late * 0.016);
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

  // ── 메타 (영구 업그레이드) ─────────────────────────────────────
  const META_KEY = 'td_meta_v1';
  const META_UPGRADES = [
    { id: 'vault',   name: '개전 자금', icon: '💰', max: 3, cost: (l) => 30 + l * 45, desc: (l) => `시작 금 +${(l + 1) * 30}` },
    { id: 'walls',   name: '겹성벽',   icon: '🏰', max: 3, cost: (l) => 35 + l * 50, desc: (l) => `시작 생명 +${(l + 1) * 2}` },
    { id: 'lens',    name: '넓은 안목', icon: '🃏', max: 1, cost: () => 180,          desc: () => '드래프트가 4장이 된다' },
    { id: 'armory',  name: '병기고',   icon: '🗝️', max: 2, cost: (l) => 60 + l * 80, desc: (l) => l === 0 ? '저격탑을 처음부터 해금' : '금광을 처음부터 해금' },
    { id: 'echo',    name: '메아리 핵', icon: '🔮', max: 3, cost: (l) => 50 + l * 60, desc: (l) => `마나핵 획득 +${(l + 1) * 15}%` },
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
      this.gold = 100 + (m.upgrades.vault || 0) * 30;
      this.lives = 10 + (m.upgrades.walls || 0) * 2;
      this.wave = 0;                 // 아직 시작 안 한 상태. startWave()로 1부터
      this.score = 0;
      this.towers = [];              // {x,y,type,lv,fused,cool}
      this.enemies = [];             // {type,hp,maxHp,pos(0..PATH_LEN),slow,slowT,freezeT,burn,burnT,shield}
      this.spawnQueue = [];
      this.spawnT = 0;
      this.phase = 'build';          // build | wave | draft | over
      this.hpMult = 1;               // startWave 전에 스폰돼도 안전
      this.mods = { dmgMult: 1, rangeMult: 1, rateMult: 1, bountyMult: 1, costMult: 1, slowBonus: 0, slowAll: 0 };
      this.curses = { hpMult: 1, speedMult: 1 };
      this.unlocked = ['archer', 'cannon', 'frost'];
      if ((m.upgrades.armory || 0) >= 1) this.unlocked.push('sniper');
      if ((m.upgrades.armory || 0) >= 2) this.unlocked.push('mint');
      this.draftSize = 3 + ((m.upgrades.lens || 0) ? 1 : 0);
      this.pendingDraft = null;
      this.kills = 0;
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
    upgradeCost(t) { return t.fused || t.lv >= 3 ? Infinity : Math.round(TOWERS[t.type].up[t.lv - 1] * (1 + this.mods.costMult - 1)); }
    upgrade(x, y) {
      const t = this.towerAt(x, y);
      if (!t) return false;
      const cost = this.upgradeCost(t);
      if (!isFinite(cost) || this.gold < cost) return false;
      this.gold -= cost; t.lv += 1;
      return true;
    }
    sell(x, y) {
      const i = this.towers.findIndex((t) => t.x === x && t.y === y);
      if (i < 0) return false;
      const t = this.towers[i];
      const back = Math.round(TOWERS[t.type].cost * 0.6 * t.lv);
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
      t.fused = true;
      return true;
    }

    towerStats(t) {
      const base = TOWERS[t.type];
      const lvMult = Math.pow(1.6, t.lv - 1);
      const fu = t.fused ? FUSIONS[t.type] : null;
      return {
        dmg: base.dmg * lvMult * (fu ? fu.dmgMult : 1) * this.mods.dmgMult,
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
        income: (base.income || 0) * (t.fused && fu.incomeMult ? fu.incomeMult : 1) * t.lv,
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
      this.waveSpeed = 1 + Math.max(0, this.wave - 10) * 0.01;   // 후반 속도 크리프
      return spec;
    }
    nextWavePreview() { return waveSpec(this.wave + 1); }

    _spawn(type) {
      const def = ENEMIES[type];
      this.enemies.push({
        type, hp: def.hp * this.hpMult, maxHp: def.hp * this.hpMult,
        pos: 0, slow: 0, slowT: 0, freezeT: 0, burn: 0, burnT: 0,
        shield: def.shield || 0, regen: def.regen || 0,
        speed: def.speed * (1 + (this.curses.speedMult - 1)) * (this.waveSpeed || 1),
      });
    }

    // dt 초 진행. 이벤트 목록을 돌려준다 (렌더러의 연출 훅)
    tick(dt) {
      const ev = [];
      if (this.phase !== 'wave') return ev;

      // 스폰
      this.spawnT -= dt;
      if (this.spawnQueue.length && this.spawnT <= 0) {
        const type = this.spawnQueue.shift();
        this._spawn(type);
        ev.push({ t: 'spawn', type });
        this.spawnT = type === 'boss' ? 1.2 : Math.max(0.28, 0.75 - this.wave * 0.02);
      }

      // 적 이동/도트
      for (const e of this.enemies) {
        if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burn * dt; }
        if (e.regen && e.hp < e.maxHp && e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
        if (e.freezeT > 0) { e.freezeT -= dt; continue; }
        const slowF = e.slowT > 0 ? (e.slowT -= dt, 1 - Math.min(0.8, e.slow)) : 1;
        e.pos += e.speed * slowF * dt;
      }

      // 도착 처리
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.pos >= PATH_LEN - 1) {
          this.enemies.splice(i, 1);
          this.lives -= ENEMIES[e.type].boss ? 3 : 1;
          ev.push({ t: 'leak', type: e.type });
        } else if (e.hp <= 0) {
          this.enemies.splice(i, 1);
          const bounty = Math.round(ENEMIES[e.type].bounty * this.mods.bountyMult);
          this.gold += bounty;
          this.score += Math.round(ENEMIES[e.type].bounty * this.wave);
          this.kills += 1;
          ev.push({ t: 'kill', type: e.type, bounty, x: this.enemyXY(e).x, y: this.enemyXY(e).y });
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

    // 웨이브 종료 정산 → 드래프트 제시
    settleWave() {
      if (!this.waveOver()) return null;
      let income = 15 + this.wave * 2;
      for (const t of this.towers) {
        const st = this.towerStats(t);
        if (st.income) income += Math.round(st.income);
        if (st.interest) income += Math.round(this.gold * st.interest);
      }
      this.gold += income;
      this.score += this.wave * 10;
      this.phase = 'build';
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
        if (c.kind === 'curse') { if (curseUsed) continue; curseUsed = true; }
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
    TOWERS, FUSIONS, PERKS, CURSES, ENEMIES, waveSpec,
    META_KEY, META_UPGRADES, normalizeMeta, metaCost, buyMeta, coresEarned,
    makeRng, Run,
  };
  if (typeof window !== 'undefined') window.TDRogue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
