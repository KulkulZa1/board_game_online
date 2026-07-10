// 월세 잭팟 — 슬롯 로그라이트 시뮬레이션 코어 v2
// 순수 로직(심볼·시너지·유물·루트·월드 이벤트·월세)만 담아 UI와 분리한다.
// 헤드리스 밸런스 검증: node prototypes/jackpot-autoplay.js
(function () {
  'use strict';

  const COLS = 4, ROWS = 3, CELLS = COLS * ROWS;
  const BASE_SPINS_PER_RENT = 4;   // 월세 주기(연장 계약서 유물로 +1)
  const WIN_STAGE = 10;            // 10번 완납 → 내 집 마련(승리), 이후 무한 모드
  const DECK_CAP = 30;             // 덱 상한(닭 폭주 방지)
  const SKIP_COINS = 2;            // 심볼 안 뽑고 넘기면 +2코인 (희석 관리)
  const EVENT_CHANCE = 0.10;       // 스핀당 월드 이벤트 확률(달동네 ×2)
  const MAX_FIXTURES = 2;          // 📌 붙박이 — 항상 지정 칸에 나타나는 심볼(배치 전략의 핵심)

  // 월세 곡선 — 완납할수록 가파르게 오른다 (잉여 이월을 감안해 후반 급등)
  const rentFor = (stage) => Math.round(22 * Math.pow(1.50, stage - 1));

  // ── 심볼 정의 ──────────────────────────────────────────────────
  //  base: 스핀당 기본 지급. ev: 봇/추천용 기대값 추정치.
  //  특수 행동·조합은 Run.spin()에서 id별로 구현된다.
  const SYMBOLS = {
    // 커먼 — 생활의 기본기
    rice:    { name: '밥',       icon: '🍚', rarity: 'common',   base: 1, ev: 1.2, desc: '+1. 할머니 옆이면 +2 추가' },
    gimbap:  { name: '김밥',     icon: '🍙', rarity: 'common',   base: 2, ev: 2.2, desc: '+2. 할머니 옆이면 +2 추가' },
    milk:    { name: '우유',     icon: '🥛', rarity: 'common',   base: 1, ev: 1.4, desc: '+1. 고양이가 마시면 +9 (우유 소멸)' },
    cat:     { name: '고양이',   icon: '🐱', rarity: 'common',   base: 1, ev: 1.8, desc: '+1. 옆의 우유를 마셔 +9' },
    egg:     { name: '알',       icon: '🥚', rarity: 'common',   base: 1, ev: 1.6, desc: '+1. 12% 확률로 닭으로 부화. 옆 라면을 계란라면으로' },
    sock:    { name: '양말',     icon: '🧦', rarity: 'common',   base: 0, ev: 0.4, desc: '0. 청소부가 정리하면 +6 (양말 소멸)' },
    ramen:   { name: '라면',     icon: '🍜', rarity: 'common',   base: 2, ev: 2.0, desc: '+2. 옆의 알마다 +2 (계란 라면)' },
    soju:    { name: '소주',     icon: '🍺', rarity: 'common',   base: 2, ev: 1.8, desc: '+2. 옆 라면이 있으면 해장 +2. 옆 회사원은 숙취' },
    dumpling:{ name: '만두',     icon: '🥟', rarity: 'common',   base: 2, ev: 2.0, desc: '+2. 든든하다' },
    dog:     { name: '강아지',   icon: '🐶', rarity: 'common',   base: 3, ev: 2.2, desc: '+3. 옆에 고양이가 있으면 싸워서 둘 다 0 (우유도 못 마심)' },

    // 언커먼 — 시너지 엔진
    worker:  { name: '회사원',   icon: '💼', rarity: 'uncommon', base: 3, ev: 2.8, desc: '+3. 옆 소주는 숙취(+1로), 옆 사장님은 보너스 +3' },
    granny:  { name: '할머니',   icon: '👵', rarity: 'uncommon', base: 1, ev: 2.6, desc: '+1. 옆의 밥·김밥마다 +2, 옆 아기 돌봄 +3' },
    chicken: { name: '닭',       icon: '🐔', rarity: 'uncommon', base: 2, ev: 2.8, desc: '+2. 30% 확률로 알을 낳는다(덱 추가)' },
    piggy:   { name: '저금통',   icon: '🐷', rarity: 'uncommon', base: 0, ev: 1.6, desc: '매 스핀 +1 적립. 망치에 깨지면 적립×3 지급' },
    hammer:  { name: '망치',     icon: '🔨', rarity: 'uncommon', base: 1, ev: 1.8, desc: '+1. 옆의 저금통·보석을 깨서 정산한다' },
    gem:     { name: '보석',     icon: '💎', rarity: 'uncommon', base: 3, ev: 3.2, desc: '+3. 광부·망치에 캐이면 +12 (보석 소멸)' },
    miner:   { name: '광부',     icon: '⛏️', rarity: 'uncommon', base: 2, ev: 2.6, desc: '+2. 옆의 보석을 캐서 +12' },
    cleaner: { name: '청소부',   icon: '🧹', rarity: 'uncommon', base: 1, ev: 1.8, desc: '+1. 옆의 양말을 정리해 +6' },
    clover:  { name: '클로버',   icon: '🍀', rarity: 'uncommon', base: 1, ev: 1.6, desc: '+1. 옆 슬롯머신·로또의 당첨 확률 2배' },
    baby:    { name: '아기',     icon: '👶', rarity: 'uncommon', base: 0, ev: 2.6, desc: '3스핀마다 +9. 옆에 할머니가 있으면 매 스핀 +3' },
    chef:    { name: '요리사',   icon: '👨‍🍳', rarity: 'uncommon', base: 1, ev: 2.8, desc: '+1. 옆의 음식(밥·김밥·우유·알·라면·만두)마다 +2' },

    // 레어 — 한 방
    slotm:   { name: '슬롯머신', icon: '🎰', rarity: 'rare',     base: 0, ev: 5.0, desc: '12.5% 확률로 +40' },
    lotto:   { name: '로또',     icon: '🎟️', rarity: 'rare',     base: 0, ev: 4.5, desc: '10% 확률로 +70, 당첨되면 소멸' },
    bank:    { name: '은행',     icon: '🏦', rarity: 'rare',     base: 0, ev: 4.0, desc: '보유 코인 15당 +1 이자 (최대 +10)' },
    moon:    { name: '보름달',   icon: '🌕', rarity: 'rare',     base: 0, ev: 3.5, desc: '옆 8칸의 심볼마다 +1씩 비춘다' },
    king:    { name: '사장님',   icon: '👑', rarity: 'rare',     base: 5, ev: 5.0, desc: '+5. 옆 회사원에게 보너스 +3을 준다' },
    sebae:   { name: '세뱃돈',   icon: '🧧', rarity: 'rare',     base: 0, ev: 5.0, desc: '첫 등장에서 +20 지급 후 소멸 (한 방)' },
    dragon:  { name: '용',       icon: '🐉', rarity: 'rare',     base: 0, ev: 3.5, desc: '옆 8칸이 모두 차 있으면 +25 — 판 가운데(8이웃 칸)에서만 잠에서 깬다' },
  };

  const RARITY_WEIGHT = { common: 60, uncommon: 30, rare: 10 };
  const RARITY_ORDER = ['common', 'uncommon', 'rare'];
  const FOOD_IDS = ['rice', 'gimbap', 'ramen', 'dumpling', 'milk', 'egg'];

  // ── 유물 — 이득과 저주가 한 몸 ─────────────────────────────────
  const RELICS = {
    cheese:    { name: '치즈 숙성고',    icon: '🧀', good: '우유가 치즈가 되어 +3 지급',        bad: '고양이가 마실 우유가 없다' },
    stock:     { name: '주식 계좌',      icon: '📈', good: '매 스핀 보유 코인의 4% 이자',        bad: '월세 정산마다 수수료 -8' },
    dice:      { name: '도박사의 주사위', icon: '🎲', good: '로또·슬롯머신 당첨 확률 +50%',      bad: '꽝이 나올 때마다 -1코인' },
    mart:      { name: '대형마트 회원권', icon: '🛒', good: '뽑기가 4장 제시된다',               bad: '건너뛰기 보상이 사라진다' },
    catfeeder: { name: '길고양이 급식소', icon: '🐈', good: '고양이 +2, 우유를 마시면 +14',      bad: '매 스핀 사료값 -1' },
    basement:  { name: '반지하 계약서',  icon: '🕳️', good: '월세 -20%',                        bad: '잭팟 당첨금이 절반이 된다' },
    extend:    { name: '연장 계약서',    icon: '⏰', good: '월세 주기가 5스핀으로 늘어난다',     bad: '월세 +15%' },
    angel:     { name: '전세 수호천사',  icon: '👼', good: '퇴거를 1회 무효화한다',             bad: '발동 시 덱에서 랜덤 2장 압류' },
    anvil:     { name: '대장장이의 모루', icon: '⚒️', good: '월세 완납마다 랜덤 카드 1장 강화(+Lv)', bad: '완납마다 공임비 -5' },
    clone:     { name: '복제 배양기',    icon: '🧬', good: '뽑은 카드가 2장씩 들어온다',          bad: '30% 확률로 양말이 덤으로 딸려온다' },
    minimal:   { name: '미니멀리스트의 서약', icon: '🗑️', good: '완납 후 카드 1장을 골라 버릴 수 있다', bad: '뽑기 선택지가 1장 줄어든다' },
  };

  // ── 스테이지 루트 — 완납 후 다음 동네를 고른다 (분기점) ─────────
  const ROUTES = {
    normal:     { name: '평범한 동네', icon: '🏠', desc: '무난하다. 월세 기본, 특별할 것 없음.',            rentMult: 1.0 },
    rich:       { name: '부촌',        icon: '💎', desc: '월세 +35%. 뽑기에 레어가 잘 나온다.',             rentMult: 1.35, rareBoost: true },
    slum:       { name: '달동네',      icon: '🏚️', desc: '월세 -15%. 특수 이벤트가 2배로 잦다.',            rentMult: 0.85, eventMult: 2 },
    relicAlley: { name: '유물 골목',   icon: '🏛️', desc: '월세 +25%. 입주하며 유물을 하나 얻는다.',         rentMult: 1.25, relic: true },
  };

  // ── 월드 이벤트 — 스핀 중 무작위로 세상이 요동친다 ─────────────
  const WORLD_EVENTS = {
    depression: { name: '세계 대공황',  icon: '📉', desc: '3스핀 동안 모든 심볼 지급 -1',          duration: 3, kind: 'bad' },
    boom:       { name: '경제 호황',    icon: '📊', desc: '3스핀 동안 총지급 +25%',               duration: 3, kind: 'good' },
    lucky:      { name: '행운의 날',    icon: '🌈', desc: '2스핀 동안 당첨 확률 2배',             duration: 2, kind: 'good' },
    moving:     { name: '이삿짐 정리',  icon: '📦', desc: '덱에서 카드 1장을 골라 버릴 수 있다',   kind: 'choice' },
    gift:       { name: '이웃의 선물',  icon: '🎁', desc: '이웃이 반찬을 나눠줬다 (+월세의 15%)',  kind: 'good' },
    rats:       { name: '쥐 소동',      icon: '🐀', desc: '쥐가 덱의 음식 하나를 훔쳐갔다',        kind: 'bad' },
    phishing:   { name: '보이스피싱',   icon: '📱', desc: '보유 코인의 8%를 뜯겼다',              kind: 'bad' },
    mentor:     { name: '길거리 스승',  icon: '✨', desc: '무작위 카드 1장이 강화됐다 (+Lv)',      kind: 'good' },
    box:        { name: '버려진 상자',  icon: '🎁', desc: '상자에서 심볼이 나와 덱에 들어왔다',    kind: 'good' },
    doppel:     { name: '도플갱어',     icon: '👯', desc: '무작위 카드 1장이 복제됐다 (Lv·황금 포함)', kind: 'good' },
  };

  // 시작 덱 — 고양이×우유로 파괴 시너지를 첫 판부터 가르친다
  const STARTER_DECK = ['rice', 'rice', 'rice', 'milk', 'milk', 'cat', 'gimbap', 'sock', 'sock'];

  // ── 8방향 이웃 테이블 (4×3 그리드) ─────────────────────────────
  const NEIGHBORS = [];
  for (let i = 0; i < CELLS; i++) {
    const r = Math.floor(i / COLS), c = i % COLS, list = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) list.push(nr * COLS + nc);
    }
    NEIGHBORS.push(list);
  }

  // ── 런(한 판) ───────────────────────────────────────────────────
  class Run {
    constructor(rng) {
      this.rng = rng || Math.random;
      this.coins = 0;
      this.stage = 1;
      this.spinNo = 0;
      this.spinsIntoStage = 0;
      this.state = 'playing';        // playing | dead
      this.won = false;
      this.rentsPaid = 0;
      this.totalEarned = 0;
      this.bestSpin = 0;
      this._uid = 0;
      this.deck = STARTER_DECK.map((id) => this._mk(id));
      // v2: 유물 / 루트 / 이벤트
      this.relics = new Set();
      this.angelUsed = false;
      this.route = 'normal';
      this.pendingRoutes = null;     // 완납 후 다음 동네 선택지
      this.pendingRelics = null;     // 유물 골목 입주 보상 선택지
      this.pendingRemoval = false;   // 이삿짐 정리 — 해소 전엔 스핀 불가
      this.activeEvent = null;       // { id, remaining }
      // 피버 — 좋은 스핀(총 15+)을 3연속 만들면 다음 스핀 당첨 확률 2배
      this.feverStreak = 0;
      this.feverArmed = false;
      // 📌 붙박이 — 지정한 심볼이 항상 지정 칸에 나타난다 (인접 시너지를 설계하는 수단)
      this.fixtures = [];   // [{uid, cell}] 최대 MAX_FIXTURES
    }

    // ── 붙박이 API ────────────────────────────────────────────────
    setFixture(uid, cell) {
      if (cell < 0 || cell >= CELLS) return false;
      if (!this.deck.some((d) => d.uid === uid)) return false;
      this.fixtures = this.fixtures.filter((f) => f.uid !== uid && f.cell !== cell);
      if (this.fixtures.length >= MAX_FIXTURES) return false;
      this.fixtures.push({ uid, cell });
      return true;
    }
    clearFixture(uid) { this.fixtures = this.fixtures.filter((f) => f.uid !== uid); }
    fixtureAt(cell) { return this.fixtures.find((f) => f.cell === cell) || null; }
    isFixed(uid) { return this.fixtures.some((f) => f.uid === uid); }

    // ── 강화/합성 — 덱 빌딩의 척추 ────────────────────────────────
    _upgradeRandom() {
      const cands = this.deck.filter((d) => d.lv < 3);
      if (!cands.length) return null;
      const c = cands[Math.floor(this.rng() * cands.length)];
      c.lv++;
      return c;
    }
    // 같은 심볼·같은 Lv 3장 → 1장 Lv+1 (최대 Lv3). 황금은 하나라도 있으면 승계.
    // 붙박이었던 카드가 합성되면 결과물이 그 칸을 승계한다.
    _mergeCheck() {
      const merges = [];
      let changed = true;
      while (changed) {
        changed = false;
        const groups = {};
        for (const d of this.deck) {
          if (d.lv >= 3) continue;
          const k = d.id + ':' + d.lv;
          (groups[k] = groups[k] || []).push(d);
        }
        for (const k in groups) {
          const g = groups[k];
          if (g.length < 3) continue;
          const three = g.slice(0, 3);
          const uids = three.map((d) => d.uid);
          const gold = three.some((d) => d.gold);
          const fx = this.fixtures.find((f) => uids.includes(f.uid));
          this.deck = this.deck.filter((d) => !uids.includes(d.uid));
          this.fixtures = this.fixtures.filter((f) => !uids.includes(f.uid));
          const merged = this._mk(three[0].id);
          merged.lv = three[0].lv + 1;
          merged.gold = gold;
          this.deck.push(merged);
          if (fx) this.fixtures.push({ uid: merged.uid, cell: fx.cell });
          merges.push({ id: merged.id, lv: merged.lv, gold });
          changed = true;
        }
      }
      if (merges.length) this.lastMerges = (this.lastMerges || []).concat(merges);
      return merges;
    }

    _mk(id) { return { uid: ++this._uid, id, bank: 0, tick: 0, lv: 1, gold: false }; }
    _chance(p) { return this.rng() < p; }
    _shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    has(relic) { return this.relics.has(relic); }
    spinsPerRent() { return BASE_SPINS_PER_RENT + (this.has('extend') ? 1 : 0); }

    rent() {
      let r = rentFor(this.stage) * ROUTES[this.route].rentMult;
      if (this.has('basement')) r *= 0.8;
      if (this.has('extend')) r *= 1.15;
      return Math.round(r);
    }

    // 표시용 아이콘 — 치즈 숙성고가 있으면 우유는 치즈다
    displayIcon(item) {
      if (item.id === 'milk' && this.has('cheese')) return '🧀';
      return SYMBOLS[item.id].icon;
    }

    // ── 스핀 한 번을 완전히 해석한다 ──────────────────────────────
    spin() {
      if (this.state !== 'playing' || this.pendingRemoval || this.pendingRoutes || this.pendingRelics) return null;
      this.spinNo++;
      this.spinsIntoStage++;
      const coinsAtStart = this.coins;
      const extra = [];   // 전역 가감 내역 [{label, amt}] — UI 표시용
      const feverNow = this.feverArmed;   // 이번 스핀이 피버인가
      if (feverNow) this.feverArmed = false;
      this.lastMerges = [];               // 이번 스핀에서 발생한 합성(UI 연출용)

      // 0) 월드 이벤트 발동 판정 (지속 이벤트 중엔 새로 안 뜸)
      let firedEvent = null;
      const evMult = ROUTES[this.route].eventMult || 1;
      if (!this.activeEvent && this.spinNo > 2 && this._chance(EVENT_CHANCE * evMult)) {
        const ids = Object.keys(WORLD_EVENTS);
        const id = ids[Math.floor(this.rng() * ids.length)];
        const def = WORLD_EVENTS[id];
        firedEvent = { id, name: def.name, icon: def.icon, desc: def.desc, kind: def.kind };
        if (def.duration) {
          this.activeEvent = { id, remaining: def.duration };
        } else if (id === 'gift') {
          const amt = Math.ceil(this.rent() * 0.15);
          this.coins += amt;
          extra.push({ label: '🎁 이웃의 선물', amt });
        } else if (id === 'rats') {
          const foods = this.deck.filter((d) => FOOD_IDS.includes(d.id));
          if (foods.length) {
            const victim = foods[Math.floor(this.rng() * foods.length)];
            this.deck = this.deck.filter((d) => d.uid !== victim.uid);
            firedEvent.detail = `${SYMBOLS[victim.id].icon} ${SYMBOLS[victim.id].name} 도난!`;
          } else firedEvent.detail = '훔칠 음식이 없었다';
        } else if (id === 'phishing') {
          const amt = Math.ceil(this.coins * 0.08);
          this.coins = Math.max(0, this.coins - amt);
          extra.push({ label: '📱 보이스피싱', amt: -amt });
        } else if (id === 'mentor') {
          const c = this._upgradeRandom();
          firedEvent.detail = c ? `${SYMBOLS[c.id].icon} ${SYMBOLS[c.id].name} → Lv${c.lv}!` : '강화할 카드가 없다';
        } else if (id === 'box') {
          if (this.deck.length < DECK_CAP) {
            const rarity = this._chance(0.25) ? 'rare' : (this._chance(0.5) ? 'uncommon' : 'common');
            const pool = Object.keys(SYMBOLS).filter((k) => SYMBOLS[k].rarity === rarity);
            const nid = pool[Math.floor(this.rng() * pool.length)];
            const item = this._mk(nid);
            if (this._chance(0.05)) item.gold = true;
            this.deck.push(item);
            firedEvent.detail = `${SYMBOLS[nid].icon} ${SYMBOLS[nid].name}${item.gold ? ' ✨황금!' : ''} 획득!`;
            this._mergeCheck();
          } else firedEvent.detail = '덱이 가득 찼다';
        } else if (id === 'doppel') {
          if (this.deck.length < DECK_CAP && this.deck.length) {
            const src = this.deck[Math.floor(this.rng() * this.deck.length)];
            const cp = this._mk(src.id); cp.lv = src.lv; cp.gold = src.gold;
            this.deck.push(cp);
            firedEvent.detail = `${SYMBOLS[src.id].icon} ${SYMBOLS[src.id].name}${src.lv > 1 ? ' Lv' + src.lv : ''}${src.gold ? ' ✨' : ''} 복제!`;
            this._mergeCheck();
          } else firedEvent.detail = '복제 실패 — 덱이 가득 찼다';
        } else if (id === 'moving') {
          this.pendingRemoval = true;   // 스핀 후 UI가 제거 선택을 해소한다
        }
      }
      const evActive = (id) => this.activeEvent && this.activeEvent.id === id;

      // 1) 보드 샘플 — 📌 붙박이를 먼저 지정 칸에, 나머지 덱을 남은 칸에 무작위 배치
      const board = new Array(CELLS).fill(null);
      const fixedUids = new Set();
      for (const f of this.fixtures) {
        const item = this.deck.find((d) => d.uid === f.uid);
        if (item && board[f.cell] === null) { board[f.cell] = item; fixedUids.add(f.uid); }
      }
      const rest = this._shuffle(this.deck.filter((d) => !fixedUids.has(d.uid)));
      const freeCells = this._shuffle([...Array(CELLS).keys()].filter((i) => board[i] === null));
      for (let k = 0; k < rest.length && k < freeCells.length; k++) board[freeCells[k]] = rest[k];

      const pays = [];
      const events = [];
      const destroyed = new Set();
      const bonus = new Array(CELLS).fill(0);
      const at = (i) => (board[i] && !destroyed.has(board[i].uid)) ? board[i] : null;
      // 강화(Lv)·황금(×3) 스케일 — 모든 지급에 일관 적용되는 단일 규칙
      const scaleOf = (item) => (item.lv || 1) * (item.gold ? 3 : 1);
      const adjHas = (i, id) => NEIGHBORS[i].some((n) => { const t = at(n); return t && t.id === id; });
      const adjCount = (i, id) => NEIGHBORS[i].reduce((s, n) => { const t = at(n); return s + (t && t.id === id ? 1 : 0); }, 0);

      // 2) 파괴 페이즈 — 보드 순서대로, 먼저 선언한 쪽이 가져간다
      for (let i = 0; i < CELLS; i++) {
        const it = at(i); if (!it) continue;
        // 치즈 숙성고: 우유가 치즈라 못 마심 / 옆에 강아지: 싸우느라 못 마심
        if (it.id === 'cat' && !this.has('cheese') && !adjHas(i, 'dog')) {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && t.id === 'milk') {
              destroyed.add(t.uid);
              const amt = (this.has('catfeeder') ? 14 : 9) * scaleOf(it);
              pays.push({ idx: i, amt });
              events.push({ type: 'eat', idx: i, targetIdx: n, amt });
              break;
            }
          }
        } else if (it.id === 'miner') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && t.id === 'gem') {
              destroyed.add(t.uid);
              const amt = 12 * scaleOf(t);
              pays.push({ idx: n, amt });
              events.push({ type: 'mine', idx: i, targetIdx: n, amt });
            }
          }
        } else if (it.id === 'hammer') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (!t) continue;
            if (t.id === 'piggy') {
              destroyed.add(t.uid);
              const amt = Math.max(3, t.bank * 3) * scaleOf(t);
              pays.push({ idx: n, amt });
              events.push({ type: 'break', idx: i, targetIdx: n, amt });
            } else if (t.id === 'gem') {
              destroyed.add(t.uid);
              const amt = 12 * scaleOf(t);
              pays.push({ idx: n, amt });
              events.push({ type: 'break', idx: i, targetIdx: n, amt });
            }
          }
        } else if (it.id === 'cleaner') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && t.id === 'sock') {
              destroyed.add(t.uid);
              const amt = 6 * scaleOf(t);
              pays.push({ idx: n, amt });
              events.push({ type: 'clean', idx: i, targetIdx: n, amt });
            }
          }
        }
      }

      // 3) 인접 가산 집계 (할머니·보름달)
      for (let i = 0; i < CELLS; i++) {
        const it = at(i); if (!it) continue;
        if (it.id === 'granny') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && (t.id === 'rice' || t.id === 'gimbap')) bonus[n] += 2;
          }
        } else if (it.id === 'moon') {
          for (const n of NEIGHBORS[i]) if (at(n)) bonus[n] += 1;
        } else if (it.id === 'king') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && t.id === 'worker') bonus[n] += 3;   // 사장님 보너스
          }
        }
      }

      // 4) 지급 페이즈
      let probMisses = 0;   // 도박사의 주사위 저주 계산용
      for (let i = 0; i < CELLS; i++) {
        const it = at(i); if (!it) continue;
        const def = SYMBOLS[it.id];
        let amt = def.base;

        if (it.id === 'milk' && this.has('cheese')) {
          amt = 3;   // 치즈 — 고양이는 못 먹지만 비싸다
        } else if (it.id === 'cat') {
          if (this.has('catfeeder')) amt = 3;   // 급식소 고양이는 통통하다
          if (adjHas(i, 'dog')) amt = 0;        // 개와 싸우는 중
        } else if (it.id === 'dog') {
          if (adjHas(i, 'cat')) amt = 0;        // 고양이와 싸우는 중 — 배치로 피하라
        } else if (it.id === 'chef') {
          // 요리사 — 옆의 음식마다 +2 (음식 밀집 배치를 보상)
          amt += 2 * NEIGHBORS[i].reduce((s, n) => {
            const t = at(n); return s + (t && FOOD_IDS.includes(t.id) ? 1 : 0);
          }, 0);
        } else if (it.id === 'worker') {
          if (adjHas(i, 'soju')) amt = 1;   // 숙취 (사장님 보너스는 bonus로 별도 가산)
        } else if (it.id === 'ramen') {
          amt += 2 * adjCount(i, 'egg');    // 계란 라면
        } else if (it.id === 'soju') {
          if (adjHas(i, 'ramen')) amt += 2; // 해장 세트
        } else if (it.id === 'baby') {
          it.tick += 1;
          if (adjHas(i, 'granny')) amt += 3;   // 할머니의 돌봄
          if (it.tick % 3 === 0) { amt += 9; events.push({ type: 'grow', idx: i, amt: 9 }); }
        } else if (it.id === 'slotm' || it.id === 'lotto') {
          let p = it.id === 'slotm' ? 0.125 : 0.10;
          if (adjHas(i, 'clover')) p *= 2;
          if (this.has('dice')) p *= 1.5;
          if (evActive('lucky')) p *= 2;
          if (feverNow) p *= 2;   // 🔥 피버 스핀
          p = Math.min(0.6, p);
          if (this._chance(p)) {
            amt = it.id === 'slotm' ? 40 : 70;
            if (this.has('basement')) amt = Math.ceil(amt / 2);   // 반지하의 곰팡이가 운을 갉아먹는다
            events.push({ type: 'jackpot', idx: i, amt: amt * scaleOf(it) });
            if (it.id === 'lotto') destroyed.add(it.uid);
          } else {
            probMisses++;
          }
        } else if (it.id === 'bank') {
          amt = Math.min(10, Math.floor(coinsAtStart / 15));
        } else if (it.id === 'piggy') {
          it.bank += 1;
        } else if (it.id === 'sebae') {
          amt = 20;
          destroyed.add(it.uid);
          events.push({ type: 'burst', idx: i, amt });
        } else if (it.id === 'dragon') {
          // 용 — 8이웃이 모두 차 있어야 깨어난다 (가운데 칸 + 붙박이 빌드어라운드)
          const ns = NEIGHBORS[i];
          if (ns.length === 8 && ns.every((n) => at(n))) {
            amt = 25;
            events.push({ type: 'dragon', idx: i, amt });
          }
        }

        amt += bonus[i];
        amt *= scaleOf(it);   // 강화 Lv × 황금 ×3 — 밸런스 파괴 조합의 통로
        if (evActive('depression')) amt = Math.max(0, amt - 1);   // 세계 대공황
        if (amt > 0) pays.push({ idx: i, amt });
      }

      // 대공황은 파괴·잭팟 지급에도 그림자를 드리운다
      if (evActive('depression')) {
        for (const p of pays) if (p.amt > 0) p.amt = Math.max(0, p.amt);   // (심볼 지급에서 이미 반영)
      }

      // 5) 성장 페이즈 — 닭이 알을 낳고, 알이 부화한다
      for (let i = 0; i < CELLS; i++) {
        const it = at(i); if (!it) continue;
        if (it.id === 'chicken' && this.deck.length < DECK_CAP && this._chance(0.30)) {
          this.deck.push(this._mk('egg'));
          events.push({ type: 'lay', idx: i });
        } else if (it.id === 'egg' && this._chance(0.12)) {
          it.id = 'chicken';
          events.push({ type: 'hatch', idx: i });
        }
      }

      if (destroyed.size) {
        this.deck = this.deck.filter((d) => !destroyed.has(d.uid));
        this.fixtures = this.fixtures.filter((f) => !destroyed.has(f.uid));   // 부서진 붙박이 해제
      }
      this._mergeCheck();   // 닭이 낳은 알 등 성장 페이즈 산물 합성

      let total = pays.reduce((s, p) => s + p.amt, 0);
      if (evActive('boom')) {   // 경제 호황
        const boost = Math.round(total * 0.25);
        if (boost > 0) { total += boost; extra.push({ label: '📊 경제 호황', amt: boost }); }
      }

      // 유물 전역 효과
      if (this.has('stock')) {
        const interest = Math.floor(coinsAtStart * 0.04);
        if (interest > 0) { total += interest; extra.push({ label: '📈 주식 이자', amt: interest }); }
      }
      if (this.has('dice') && probMisses > 0) {
        total -= probMisses; extra.push({ label: '🎲 주사위 저주', amt: -probMisses });
      }
      if (this.has('catfeeder')) {
        total -= 1; extra.push({ label: '🐈 사료값', amt: -1 });
      }

      this.coins = Math.max(0, this.coins + total);
      this.totalEarned += Math.max(0, total);
      if (total > this.bestSpin) this.bestSpin = total;

      // 피버 게이지 — 총 15+ 스핀 3연속이면 다음 스핀 점화
      if (feverNow) extra.push({ label: '🔥 피버 스핀', amt: 0 });
      if (total >= 15) {
        this.feverStreak++;
        if (this.feverStreak >= 3 && !this.feverArmed) { this.feverArmed = true; this.feverStreak = 0; }
      } else {
        this.feverStreak = 0;
      }

      // 지속 이벤트 소진
      if (this.activeEvent) {
        this.activeEvent.remaining--;
        if (this.activeEvent.remaining <= 0) this.activeEvent = null;
      }

      // 6) 월세 정산
      let settle = null;
      if (this.spinsIntoStage >= this.spinsPerRent()) {
        const rent = this.rent();
        if (this.has('stock')) { this.coins = Math.max(0, this.coins - 8); extra.push({ label: '📈 증권사 수수료', amt: -8 }); }
        if (this.coins >= rent) {
          this.coins -= rent;
          if (this.has('anvil')) {   // 대장장이의 모루 — 강화와 공임비
            const c = this._upgradeRandom();
            this.coins = Math.max(0, this.coins - 5);
            extra.push({ label: c ? `⚒️ ${SYMBOLS[c.id].name} Lv${c.lv} 강화` : '⚒️ 강화 대상 없음', amt: -5 });
          }
          if (this.has('minimal')) this.pendingRemoval = true;   // 미니멀리스트 — 완납 후 정리
          const surplus = this.coins;
          this.rentsPaid++;
          settle = {
            type: this.stage >= WIN_STAGE && !this.won ? 'won' : 'paid',
            rent, stage: this.stage, surplus,
            bonus: surplus >= Math.ceil(rent * 0.5),
          };
          if (settle.type === 'won') this.won = true;
          this._advanceStage();
        } else if (this.has('angel') && !this.angelUsed) {
          // 전세 수호천사 — 퇴거 무효, 대신 덱 2장 압류
          this.angelUsed = true;
          this.relics.delete('angel');
          const seized = [];
          for (let k = 0; k < 2 && this.deck.length > 1; k++) {
            const idx = Math.floor(this.rng() * this.deck.length);
            seized.push(SYMBOLS[this.deck[idx].id].name);
            this.deck.splice(idx, 1);
          }
          this.coins = 0;
          settle = { type: 'revived', rent, stage: this.stage, seized };
          this._advanceStage();
        } else {
          settle = { type: 'evicted', rent, stage: this.stage, shortfall: rent - this.coins };
          this.state = 'dead';
        }
      }

      return {
        board, pays, events, total, coins: this.coins, spinNo: this.spinNo, settle,
        firedEvent, activeEvent: this.activeEvent, extra, destroyed,
        feverNow, feverStreak: this.feverStreak, feverArmed: this.feverArmed,
        merges: this.lastMerges || [],
      };
    }

    _advanceStage() {
      this.stage++;
      this.spinsIntoStage = 0;
      this.pendingRoutes = this._routeOptions();   // 분기점 — 다음 동네를 고른다
    }

    // ── 루트 분기 — 유물 골목은 가끔만 나타난다(희소성) ────────────
    _routeOptions() {
      let pool = ['normal', 'rich', 'slum'];
      if (this._chance(0.45)) pool.push('relicAlley');
      const ids = this._shuffle(pool).slice(0, 3);
      return ids.map((id) => Object.assign({ id }, ROUTES[id]));
    }
    chooseRoute(id) {
      if (!this.pendingRoutes || !ROUTES[id]) return;
      this.route = id;
      this.pendingRoutes = null;
      if (ROUTES[id].relic) {
        const unowned = Object.keys(RELICS).filter((r) => !this.relics.has(r) && !(r === 'angel' && this.angelUsed));
        if (unowned.length) {
          this.pendingRelics = this._shuffle(unowned).slice(0, 2).map((r) => Object.assign({ id: r }, RELICS[r]));
        } else {
          this.coins += 15;   // 모든 유물 보유 — 골동품을 판다
        }
      }
    }
    chooseRelic(id) {
      if (!this.pendingRelics || !RELICS[id]) return;
      this.relics.add(id);
      this.pendingRelics = null;
    }

    // ── 이삿짐 정리 해소 ──────────────────────────────────────────
    removeCard(uid) {
      if (!this.pendingRemoval) return false;
      const before = this.deck.length;
      if (before > 1) this.deck = this.deck.filter((d) => d.uid !== uid);
      this.pendingRemoval = false;
      return this.deck.length < before;
    }
    declineRemoval() { this.pendingRemoval = false; }

    // ── 심볼 제안 (마트 회원권: 4장 / 부촌·보너스: 레어 부스트) ────
    offers(rareBoost) {
      const boosted = rareBoost || !!ROUTES[this.route].rareBoost;
      const w = boosted ? { common: 20, uncommon: 45, rare: 35 } : RARITY_WEIGHT;
      const count = Math.max(2, 3 + (this.has('mart') ? 1 : 0) - (this.has('minimal') ? 1 : 0));
      const ids = Object.keys(SYMBOLS);
      const out = [];
      let guard = 0;
      while (out.length < count && guard++ < 80) {
        const roll = this.rng() * (w.common + w.uncommon + w.rare);
        const rarity = roll < w.common ? 'common' : (roll < w.common + w.uncommon ? 'uncommon' : 'rare');
        const pool = ids.filter((id) => SYMBOLS[id].rarity === rarity && !out.includes(id));
        if (!pool.length) continue;
        out.push(pool[Math.floor(this.rng() * pool.length)]);
      }
      // ✨ 황금 변이(5%) — 지급 ×3. 황금 레어 등장이 드래프트의 잭팟이다
      return out.map((id) => ({ id, gold: this._chance(0.05) }));
    }

    skipReward() { return this.has('mart') ? 0 : SKIP_COINS; }
    pick(id, gold) {
      if (id && SYMBOLS[id] && this.deck.length < DECK_CAP) {
        const item = this._mk(id);
        item.gold = !!gold;
        this.deck.push(item);
        if (this.has('clone')) {   // 복제 배양기 — 2장씩, 가끔 양말 덤
          if (this.deck.length < DECK_CAP) {
            const cp = this._mk(id); cp.gold = !!gold;
            this.deck.push(cp);
          }
          if (this._chance(0.3) && this.deck.length < DECK_CAP) this.deck.push(this._mk('sock'));
        }
        return this._mergeCheck();
      }
      this.coins += this.skipReward();
      return [];
    }

    deckSummary() {
      const m = {};
      for (const d of this.deck) {
        const k = d.id + ':' + d.lv + ':' + (d.gold ? 1 : 0);
        if (!m[k]) m[k] = { id: d.id, lv: d.lv, gold: d.gold, n: 0, def: SYMBOLS[d.id] };
        m[k].n++;
      }
      return Object.values(m).sort((a, b) =>
        RARITY_ORDER.indexOf(b.def.rarity) - RARITY_ORDER.indexOf(a.def.rarity) ||
        (b.lv - a.lv) || (b.gold - a.gold) || (b.n - a.n));
    }
  }

  const api = {
    Run, SYMBOLS, RELICS, ROUTES, WORLD_EVENTS, NEIGHBORS, STARTER_DECK, RARITY_WEIGHT,
    COLS, ROWS, CELLS, BASE_SPINS_PER_RENT, WIN_STAGE, DECK_CAP, SKIP_COINS, EVENT_CHANCE,
    MAX_FIXTURES, rentFor,
  };
  if (typeof window !== 'undefined') window.Jackpot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
