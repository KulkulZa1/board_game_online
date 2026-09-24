// 찰나 (CHALNA) — 규칙 엔진. DOM 없음 → 브라우저와 Node(prototypes/chalna-test.js) 가 같은 규칙을 쓴다.
//
// 원 위를 도는 점이 과녁 호 안에 있을 때 누른다. 그게 전부다.
//   · 호 밖에서 누르면 끝 (빗나감) · 호를 그냥 지나쳐도 끝 (놓침) · 빨간 폭탄 호 안에서 누르면 끝 (폭탄)
//   · 맞히면 점이 반대로 돌고, 조금 빨라지고, 다음 호는 조금 좁아진다
//   · 호 한가운데(좁은 띠)에서 누르면 PERFECT — 점수 3배, 5연속이면 FEVER
// 배우긴 1초, 잘하긴 끝이 없다: 속도·폭·방향 전환·폭탄·연쇄 호가 레벨마다 조금씩 섞인다.
//
// 공정성 약속 (테스트가 지킨다):
//   · 새 과녁은 점이 도착하기까지 최소 MIN_REACTION 초가 남는 곳에만 생긴다
//   · 폭탄은 과녁과 겹치지 않고, 생길 때 점 위에 있지 않다
//   · 과녁 한가운데를 누르는 봇은 영원히 죽지 않는다
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const C = {
    START_SPEED: 2.3,        // rad/s
    SPEED_STEP: 0.055,       // 맞힐 때마다
    MAX_SPEED: 7.2,
    START_WIDTH: 0.95,       // rad
    WIDTH_DECAY: 0.972,      // 맞힐 때마다 곱
    MIN_WIDTH: 0.26,
    PERFECT_FRAC: 0.2,       // 호 폭 중 한가운데 이 비율(양쪽 합) = PERFECT
    MIN_PERFECT: 0.05,       // PERFECT 띠의 최소 폭(rad) — 너무 좁아지지 않게
    MIN_REACTION: 0.32,      // s — 새 과녁 앞가장자리까지 최소 시간
    MAX_AHEAD: 2.5,          // rad — 과녁이 너무 멀리(반 바퀴 넘게) 생기지 않게
    FEVER_STREAK: 5,         // PERFECT 연속 → FEVER
    FEVER_HITS: 8,           // FEVER 가 이어지는 적중 수
    BOMB_FROM: 8,            // 이 레벨부터 폭탄
    CHAIN_FROM: 14,          // 이 레벨부터 연쇄 호(방향이 안 바뀐다)
    GOLD_FROM: 4,            // 이 레벨부터 황금 호
    BOMB_WIDTH: 0.22,
  };

  // 시드 난수 (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // (-π, π] 로 접기
  function wrap(a) {
    a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a === -Math.PI ? Math.PI : a;
  }

  function createState(seed) {
    const s = {
      seed: seed >>> 0,
      rand: rng(seed || 1),
      angle: -Math.PI / 2,     // 12시 방향에서 시작
      dir: 1,
      speed: C.START_SPEED,
      width: C.START_WIDTH,
      level: 0,                // 맞힌 수
      score: 0,
      combo: 0,                // 연속 적중
      perfectStreak: 0,
      fever: 0,                // 남은 FEVER 적중 수
      target: null,            // { center, width, kind: 'normal'|'gold'|'chain' }
      bombs: [],               // [{ center, width }]
      alive: true,
      started: false,          // 첫 탭 전에는 점이 멈춰 있다
      death: null,             // { reason, gap }
      stats: { perfects: 0, hits: 0, bestCombo: 0, fevers: 0 },
    };
    spawn(s);
    return s;
  }

  // 점의 진행 방향 기준, 점에서 각도 a 까지 앞으로 남은 거리 (0 ~ 2π)
  function aheadOf(s, a) {
    return ((s.dir * (a - s.angle)) % TAU + TAU) % TAU;
  }

  function spawn(s) {
    const r = s.rand;
    const width = s.width;
    // 앞가장자리까지 최소 반응 시간을 보장하는 거리
    const minD = s.speed * C.MIN_REACTION + width / 2;
    const maxD = Math.max(minD + 0.2, C.MAX_AHEAD);
    const d = minD + r() * (maxD - minD);
    let kind = 'normal';
    const roll = r();
    if (s.level >= C.CHAIN_FROM && roll < 0.22) kind = 'chain';
    else if (s.level >= C.GOLD_FROM && roll > 0.92) kind = 'gold';
    s.target = { center: s.angle + s.dir * d, width, kind };

    // 폭탄 — 점과 과녁 사이 길목에(가짜 과녁), 레벨이 오를수록 자주·많이
    s.bombs = [];
    if (s.level >= C.BOMB_FROM) {
      const chance = Math.min(0.75, 0.3 + (s.level - C.BOMB_FROM) * 0.02);
      const count = s.level >= 30 && r() < 0.4 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        if (r() > chance) continue;
        const bw = C.BOMB_WIDTH;
        // 점 바로 앞(반응 시간 절반)부터 과녁 앞가장자리 직전까지
        const lo = s.speed * C.MIN_REACTION * 0.5 + bw / 2;
        const hi = d - width / 2 - bw / 2 - 0.04;
        if (hi <= lo) continue;
        const bd = lo + r() * (hi - lo);
        const b = { center: s.angle + s.dir * bd, width: bw };
        if (s.bombs.some((o) => Math.abs(wrap(o.center - b.center)) < bw)) continue;
        s.bombs.push(b);
      }
    }
  }

  // 점이 호 안에 있나, 그리고 한가운데에서 얼마나 떨어졌나
  function relTo(s, arc) {
    return s.dir * wrap(s.angle - arc.center);   // 음수 = 아직 오는 중, 양수 = 지나가는 중
  }

  // dt 초 진행. 과녁을 지나쳤으면 죽는다.
  function step(s, dt) {
    if (!s.alive || !s.started || dt <= 0) return null;
    s.angle += s.dir * s.speed * dt;
    const rel = relTo(s, s.target);
    if (rel > s.target.width / 2 && rel < Math.PI - 0.01) {
      return die(s, 'passed', (rel - s.target.width / 2) / s.speed);
    }
    return null;
  }

  function die(s, reason, gap) {
    s.alive = false;
    s.death = { reason, gap: Math.max(0, gap || 0) };
    return { type: 'death', reason, gap: s.death.gap };
  }

  // 누름. 결과: { type:'start' } | { type:'hit', perfect, points, fever, ... } | { type:'death', reason, gap }
  function tap(s) {
    if (!s.alive) return null;
    if (!s.started) { s.started = true; return { type: 'start' }; }

    for (const b of s.bombs) {
      if (Math.abs(relTo(s, b)) <= b.width / 2) return die(s, 'bomb', 0);
    }
    const t = s.target;
    const rel = relTo(s, t);
    const half = t.width / 2;
    if (Math.abs(rel) > half) {
      // 빗나감 — 과녁 가장자리까지 몇 초 차이였나 (약 올리기용)
      return die(s, 'miss', (Math.abs(rel) - half) / s.speed);
    }
    const pHalf = Math.max(C.MIN_PERFECT, t.width * C.PERFECT_FRAC) / 2;
    const perfect = Math.abs(rel) <= pHalf;

    s.level++;
    s.combo++;
    s.stats.hits++;
    if (perfect) { s.perfectStreak++; s.stats.perfects++; } else s.perfectStreak = 0;
    let feverStarted = false;
    if (s.fever > 0) s.fever--;
    if (perfect && s.perfectStreak > 0 && s.perfectStreak % C.FEVER_STREAK === 0 && s.fever === 0) {
      s.fever = C.FEVER_HITS; feverStarted = true; s.stats.fevers++;
    }
    s.stats.bestCombo = Math.max(s.stats.bestCombo, s.combo);

    const mult = 1 + Math.floor(s.combo / 10);
    let points = (perfect ? 3 : 1) * mult;
    if (t.kind === 'gold') points *= 5;
    if (s.fever > 0 || feverStarted) points *= 2;
    s.score += points;

    // 다음 과녁: 연쇄 호면 방향 유지, 아니면 반대로
    if (t.kind !== 'chain') s.dir = -s.dir;
    s.speed = Math.min(C.MAX_SPEED, s.speed + C.SPEED_STEP);
    s.width = Math.max(C.MIN_WIDTH, s.width * C.WIDTH_DECAY);
    spawn(s);
    return {
      type: 'hit', perfect, points, kind: t.kind, mult,
      fever: s.fever > 0, feverStarted, combo: s.combo, offset: rel / half,
    };
  }

  const api = { C, createState, step, tap, wrap, aheadOf, relTo, rng };
  if (typeof window !== 'undefined') window.ChalnaSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
