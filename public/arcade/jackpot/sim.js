// 월세 잭팟 — 슬롯 로그라이트 시뮬레이션 코어
// 순수 로직(심볼·스핀 해석·시너지·월세)만 담아 UI와 분리한다.
// 헤드리스 밸런스 검증: node prototypes/jackpot-autoplay.js
(function () {
  'use strict';

  const COLS = 4, ROWS = 3, CELLS = COLS * ROWS;
  const SPINS_PER_RENT = 4;   // 4스핀마다 월세 정산
  const WIN_STAGE = 10;       // 10번 완납 → 내 집 마련(승리), 이후 무한 모드
  const DECK_CAP = 30;        // 덱 상한(닭 폭주 방지)
  const SKIP_COINS = 2;       // 심볼 안 뽑고 넘기면 +2코인 (희석 관리)

  // 월세 곡선 — 완납할수록 가파르게 오른다 (잉여 이월을 감안해 후반 급등)
  const rentFor = (stage) => Math.round(22 * Math.pow(1.40, stage - 1));

  // ── 심볼 정의 ──────────────────────────────────────────────────
  //  base: 스핀당 기본 지급. ev: 봇/추천용 기대값 추정치.
  //  특수 행동은 Run._resolve()에서 id별로 구현된다.
  const SYMBOLS = {
    // 커먼 — 생활의 기본기
    rice:    { name: '밥',       icon: '🍚', rarity: 'common',   base: 1, ev: 1.2, desc: '+1. 할머니 옆이면 +2 추가' },
    gimbap:  { name: '김밥',     icon: '🍙', rarity: 'common',   base: 2, ev: 2.2, desc: '+2. 할머니 옆이면 +2 추가' },
    milk:    { name: '우유',     icon: '🥛', rarity: 'common',   base: 1, ev: 1.4, desc: '+1. 고양이가 마시면 +9 (우유 소멸)' },
    cat:     { name: '고양이',   icon: '🐱', rarity: 'common',   base: 1, ev: 1.8, desc: '+1. 옆의 우유를 마셔 +9' },
    egg:     { name: '알',       icon: '🥚', rarity: 'common',   base: 1, ev: 1.6, desc: '+1. 12% 확률로 닭으로 부화' },
    sock:    { name: '양말',     icon: '🧦', rarity: 'common',   base: 0, ev: 0.4, desc: '0. 청소부가 정리하면 +6 (양말 소멸)' },
    ramen:   { name: '라면',     icon: '🍜', rarity: 'common',   base: 2, ev: 2.0, desc: '+2. 야근의 동반자' },
    soju:    { name: '소주',     icon: '🍺', rarity: 'common',   base: 2, ev: 1.8, desc: '+2. 옆 회사원은 숙취로 지급 급감' },
    dumpling:{ name: '만두',     icon: '🥟', rarity: 'common',   base: 2, ev: 2.0, desc: '+2. 든든하다' },

    // 언커먼 — 시너지 엔진
    worker:  { name: '회사원',   icon: '💼', rarity: 'uncommon', base: 3, ev: 2.8, desc: '+3. 옆에 소주가 있으면 숙취로 +1' },
    granny:  { name: '할머니',   icon: '👵', rarity: 'uncommon', base: 1, ev: 2.6, desc: '+1. 옆의 밥·김밥마다 +2씩 얹어준다' },
    chicken: { name: '닭',       icon: '🐔', rarity: 'uncommon', base: 2, ev: 2.8, desc: '+2. 30% 확률로 알을 낳는다(덱 추가)' },
    piggy:   { name: '저금통',   icon: '🐷', rarity: 'uncommon', base: 0, ev: 1.6, desc: '매 스핀 +1 적립. 망치에 깨지면 적립×3 지급' },
    hammer:  { name: '망치',     icon: '🔨', rarity: 'uncommon', base: 1, ev: 1.8, desc: '+1. 옆의 저금통·보석을 깨서 정산한다' },
    gem:     { name: '보석',     icon: '💎', rarity: 'uncommon', base: 3, ev: 3.2, desc: '+3. 광부·망치에 캐이면 +12 (보석 소멸)' },
    miner:   { name: '광부',     icon: '⛏️', rarity: 'uncommon', base: 2, ev: 2.6, desc: '+2. 옆의 보석을 캐서 +12' },
    cleaner: { name: '청소부',   icon: '🧹', rarity: 'uncommon', base: 1, ev: 1.8, desc: '+1. 옆의 양말을 정리해 +6' },
    clover:  { name: '클로버',   icon: '🍀', rarity: 'uncommon', base: 1, ev: 1.6, desc: '+1. 옆 슬롯머신·로또의 당첨 확률 2배' },
    baby:    { name: '아기',     icon: '👶', rarity: 'uncommon', base: 0, ev: 2.6, desc: '3스핀마다 +9 (무럭무럭)' },

    // 레어 — 한 방
    slotm:   { name: '슬롯머신', icon: '🎰', rarity: 'rare',     base: 0, ev: 5.0, desc: '12.5% 확률로 +40' },
    lotto:   { name: '로또',     icon: '🎟️', rarity: 'rare',     base: 0, ev: 4.5, desc: '10% 확률로 +70, 당첨되면 소멸' },
    bank:    { name: '은행',     icon: '🏦', rarity: 'rare',     base: 0, ev: 4.0, desc: '보유 코인 15당 +1 이자 (최대 +10)' },
    moon:    { name: '보름달',   icon: '🌕', rarity: 'rare',     base: 0, ev: 3.5, desc: '옆 8칸의 심볼마다 +1씩 비춘다' },
    king:    { name: '사장님',   icon: '👑', rarity: 'rare',     base: 5, ev: 5.0, desc: '+5. 그냥 돈이 많다' },
    sebae:   { name: '세뱃돈',   icon: '🧧', rarity: 'rare',     base: 0, ev: 5.0, desc: '첫 등장에서 +20 지급 후 소멸 (한 방)' },
  };

  const RARITY_WEIGHT = { common: 60, uncommon: 30, rare: 10 };
  const RARITY_ORDER = ['common', 'uncommon', 'rare'];

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
      this.stage = 1;              // 현재 월세 단계(1부터)
      this.spinNo = 0;             // 총 스핀 수
      this.spinsIntoStage = 0;     // 이번 단계에서 돈 스핀 수
      this.state = 'playing';      // playing | dead
      this.won = false;            // 10단계 완납 여부(무한 모드에서도 유지)
      this.rentsPaid = 0;
      this.totalEarned = 0;
      this.bestSpin = 0;
      this._uid = 0;
      this.deck = STARTER_DECK.map((id) => this._mk(id));
    }

    _mk(id) { return { uid: ++this._uid, id, bank: 0, tick: 0 }; }
    rent() { return rentFor(this.stage); }
    _chance(p) { return this.rng() < p; }
    _shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // ── 스핀 한 번을 완전히 해석한다 ──────────────────────────────
    spin() {
      if (this.state !== 'playing') return null;
      this.spinNo++;
      this.spinsIntoStage++;
      const coinsAtStart = this.coins;

      // 1) 보드 샘플 — 덱을 섞어 최대 12칸에 무작위 배치(빈칸도 무작위)
      const drawn = this._shuffle(this.deck.slice()).slice(0, CELLS);
      const board = new Array(CELLS).fill(null);
      const cellsOrder = this._shuffle([...Array(CELLS).keys()]);
      drawn.forEach((item, k) => { board[cellsOrder[k]] = item; });

      const pays = [];     // {idx, amt} — UI 팝 연출용
      const events = [];   // {type, idx, targetIdx?, amt?} — 파괴/잭팟 연출용
      const destroyed = new Set();   // uid
      const bonus = new Array(CELLS).fill(0);   // 할머니·보름달 등 인접 가산

      const at = (i) => (board[i] && !destroyed.has(board[i].uid)) ? board[i] : null;

      // 2) 파괴 페이즈 — 보드 순서대로, 먼저 선언한 쪽이 가져간다
      for (let i = 0; i < CELLS; i++) {
        const it = at(i); if (!it) continue;
        if (it.id === 'cat') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && t.id === 'milk') {
              destroyed.add(t.uid);
              pays.push({ idx: i, amt: 9 });
              events.push({ type: 'eat', idx: i, targetIdx: n, amt: 9 });
              break;   // 스핀당 한 잔만
            }
          }
        } else if (it.id === 'miner') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && t.id === 'gem') {
              destroyed.add(t.uid);
              pays.push({ idx: n, amt: 12 });
              events.push({ type: 'mine', idx: i, targetIdx: n, amt: 12 });
            }
          }
        } else if (it.id === 'hammer') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (!t) continue;
            if (t.id === 'piggy') {
              destroyed.add(t.uid);
              const amt = Math.max(3, t.bank * 3);
              pays.push({ idx: n, amt });
              events.push({ type: 'break', idx: i, targetIdx: n, amt });
            } else if (t.id === 'gem') {
              destroyed.add(t.uid);
              pays.push({ idx: n, amt: 12 });
              events.push({ type: 'break', idx: i, targetIdx: n, amt: 12 });
            }
          }
        } else if (it.id === 'cleaner') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && t.id === 'sock') {
              destroyed.add(t.uid);
              pays.push({ idx: n, amt: 6 });
              events.push({ type: 'clean', idx: i, targetIdx: n, amt: 6 });
            }
          }
        }
      }

      // 3) 지급 페이즈 — 생존 심볼의 기본 지급 + 인접 보정
      //    먼저 가산 심볼(할머니·보름달)을 집계한다
      for (let i = 0; i < CELLS; i++) {
        const it = at(i); if (!it) continue;
        if (it.id === 'granny') {
          for (const n of NEIGHBORS[i]) {
            const t = at(n);
            if (t && (t.id === 'rice' || t.id === 'gimbap')) bonus[n] += 2;
          }
        } else if (it.id === 'moon') {
          for (const n of NEIGHBORS[i]) if (at(n)) bonus[n] += 1;
        }
      }

      for (let i = 0; i < CELLS; i++) {
        const it = at(i); if (!it) continue;
        const def = SYMBOLS[it.id];
        let amt = def.base;

        if (it.id === 'worker') {
          const hungover = NEIGHBORS[i].some((n) => { const t = at(n); return t && t.id === 'soju'; });
          if (hungover) amt = 1;
        } else if (it.id === 'slotm' || it.id === 'lotto') {
          const luck = NEIGHBORS[i].some((n) => { const t = at(n); return t && t.id === 'clover'; });
          let p = it.id === 'slotm' ? 0.125 : 0.10;
          if (luck) p = Math.min(0.45, p * 2);
          if (this._chance(p)) {
            amt = it.id === 'slotm' ? 40 : 70;
            events.push({ type: 'jackpot', idx: i, amt });
            if (it.id === 'lotto') destroyed.add(it.uid);   // 당첨된 로또는 소멸
          }
        } else if (it.id === 'bank') {
          amt = Math.min(10, Math.floor(coinsAtStart / 15));
        } else if (it.id === 'piggy') {
          it.bank += 1;   // 지급 없이 적립
        } else if (it.id === 'baby') {
          it.tick += 1;
          if (it.tick % 3 === 0) { amt = 9; events.push({ type: 'grow', idx: i, amt }); }
        } else if (it.id === 'sebae') {
          amt = 20;
          destroyed.add(it.uid);
          events.push({ type: 'burst', idx: i, amt });
        }

        amt += bonus[i];
        if (amt > 0) pays.push({ idx: i, amt });
      }

      // 4) 성장 페이즈 — 닭이 알을 낳고, 알이 부화한다
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

      // 파괴 확정 — 덱에서 영구 제거
      if (destroyed.size) this.deck = this.deck.filter((d) => !destroyed.has(d.uid));

      const total = pays.reduce((s, p) => s + p.amt, 0);
      this.coins += total;
      this.totalEarned += total;
      if (total > this.bestSpin) this.bestSpin = total;

      // 5) 월세 정산 — 이번 단계 4번째 스핀이면 즉시
      let settle = null;
      if (this.spinsIntoStage >= SPINS_PER_RENT) {
        const rent = this.rent();
        if (this.coins >= rent) {
          this.coins -= rent;
          const surplus = this.coins;
          this.rentsPaid++;
          settle = {
            type: this.stage >= WIN_STAGE && !this.won ? 'won' : 'paid',
            rent, stage: this.stage, surplus,
            bonus: surplus >= Math.ceil(rent * 0.5),   // 잉여 50%↑ → 보너스 뽑기
          };
          if (settle.type === 'won') this.won = true;
          this.stage++;
          this.spinsIntoStage = 0;
        } else {
          settle = { type: 'evicted', rent, stage: this.stage, shortfall: rent - this.coins };
          this.state = 'dead';
        }
      }

      return { board, pays, events, total, coins: this.coins, spinNo: this.spinNo, settle, destroyed };
    }

    // ── 심볼 제안 3장 (rareBoost: 보너스 뽑기 — 레어 확률 상승) ──
    offers(rareBoost) {
      const w = rareBoost
        ? { common: 20, uncommon: 45, rare: 35 }
        : RARITY_WEIGHT;
      const ids = Object.keys(SYMBOLS);
      const out = [];
      let guard = 0;
      while (out.length < 3 && guard++ < 60) {
        const roll = this.rng() * (w.common + w.uncommon + w.rare);
        const rarity = roll < w.common ? 'common' : (roll < w.common + w.uncommon ? 'uncommon' : 'rare');
        const pool = ids.filter((id) => SYMBOLS[id].rarity === rarity && !out.includes(id));
        if (!pool.length) continue;
        out.push(pool[Math.floor(this.rng() * pool.length)]);
      }
      return out;
    }

    pick(id) {
      if (id && SYMBOLS[id] && this.deck.length < DECK_CAP) this.deck.push(this._mk(id));
      else this.coins += SKIP_COINS;   // 건너뛰기 보상
    }

    // 덱 요약(UI 덱 뷰어용): id → 개수
    deckSummary() {
      const m = {};
      for (const d of this.deck) m[d.id] = (m[d.id] || 0) + 1;
      return Object.entries(m)
        .map(([id, n]) => ({ id, n, def: SYMBOLS[id] }))
        .sort((a, b) => RARITY_ORDER.indexOf(b.def.rarity) - RARITY_ORDER.indexOf(a.def.rarity) || b.n - a.n);
    }
  }

  const api = {
    Run, SYMBOLS, NEIGHBORS, STARTER_DECK, RARITY_WEIGHT,
    COLS, ROWS, CELLS, SPINS_PER_RENT, WIN_STAGE, DECK_CAP, SKIP_COINS,
    rentFor,
  };
  if (typeof window !== 'undefined') window.Jackpot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
