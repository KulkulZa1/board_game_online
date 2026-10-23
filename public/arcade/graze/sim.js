// 스침 (GRAZE) — 규칙 엔진. DOM 없음 → 브라우저와 Node(prototypes/graze-test.js) 가 같은 규칙을 쓴다.
//
// 아래에서 좌우로만 움직이며 위에서 떨어지는 것들을 피한다. 닿으면 끝.
// 비틀기: '피하기'는 점수가 거의 없다. 가까이 '스칠수록' 점수와 배율이 오른다.
//   · 판정 가장자리에서 GRAZE_R 안 = 스침 → 그동안 점수가 쌓이고, 처음 스칠 때 배율 +
//   · PERFECT_R 안 = PERFECT 스침 → 보너스 + 배율 크게 +
//   · 한동안 아무것도 안 스치면 배율이 줄어든다 — 안전하게만 하면 배율이 새어 나간다
//   · 스침 게이지가 차면 OVERDRIVE: 세상이 느려지고(내 움직임은 그대로) 점수 2배
//
// 공정성 약속 (prototypes/graze-test.js 가 지킨다):
//   · 보이지 않는 '안전 통로' c(t) 가 플레이어가 따라갈 수 있는 속도로만 움직이고,
//     어떤 위험물도 플레이어 선을 지나는 동안 그 통로에 들어오지 않는다 → 길은 언제나 있다
//   · 모든 블록은 플레이어 선에 닿기 전 MIN_SIGHT 초 이상 보이고, 레이저는 그만큼 미리 경고한다
//   · 생성은 시드와 '세계 시간'만으로 정해진다 — 같은 시드는 누가 하든 같은 코스다
(function (root) {
  'use strict';

  const C = {
    W: 60,                 // 세계 너비 (단위)
    FALL: 100,             // 생성선(y=0)에서 플레이어 선까지
    VIEW_H: 108,           // 그리는 높이 (플레이어 아래 여백 포함)
    PR: 1.2,               // 플레이어 판정 반지름 — 그림(빛)보다 작다. 그래서 아슬아슬하게 스칠 수 있다
    GRAZE_R: 4.5,          // 판정 가장자리에서 이 거리 안이면 스침
    PERFECT_R: 0.8,        // 이 거리 안이면 PERFECT 스침
    V_MAX: 70,             // 플레이어 최고 속도 (u/s, 실시간)
    FOCUS: 0.42,           // 정밀 이동(Shift) 속도 배율
    START_GRACE: 1.0,      // 첫 줄이 생기기까지 (세계 초)

    // 난이도 (세계 시간 t 의 함수 — 아래 함수들)
    FALL_V0: 52, FALL_VK: 0.5, FALL_VMAX: 120,          // 낙하 속도
    ROW_I0: 0.5, ROW_IK: 0.0028, ROW_IMIN: 0.17,          // 줄 간격
    CORR_W0: 13, CORR_WK: 0.06, CORR_WMIN: 6,             // 안전 통로 폭
    CORR_KNOT: 0.6, CORR_SLOPE: 0.45,                     // 통로가 꺾이는 간격, 최고 속도 대비 기울기 상한
    WALL_FROM: 12, BEAM_FROM: 22,
    BEAM_ON: 0.32,                                        // 레이저가 켜져 있는 시간
    MIN_SIGHT: 0.6,                                       // 보이기 시작해서 닿기까지 최소 시간 (블록·레이저 공통)

    // 점수
    SURVIVE_PPS: 10,       // 버틴 1초당 (배율 무관)
    GRAZE_PPS: 60,         // 스치는 동안 1초당 (× 가까움² × 배율)
    PERFECT_BONUS: 25,     // PERFECT 한 번 (× 배율)
    MULT_GRAZE: 0.1, MULT_PERFECT: 0.3, MULT_MAX: 9.9,
    MULT_HOLD: 1.2,        // 이만큼 안 스치면 배율이 줄기 시작 (세계 초)
    MULT_DECAY: 0.8,       // 초당 감소
    METER_GRAZE: 3, METER_PERFECT: 10,                    // OVERDRIVE 게이지 (100 이면 발동)
    OD_TIME: 4.5,          // OVERDRIVE 지속 (실시간 초)
    OD_SCALE: 0.55,        // OVERDRIVE 동안 세계 속도
  };

  // 난이도 곡선
  const fallSpeed = (t) => Math.min(C.FALL_VMAX, C.FALL_V0 + C.FALL_VK * t);
  const rowInterval = (t) => Math.max(C.ROW_IMIN, C.ROW_I0 - C.ROW_IK * t);
  const corridorWidth = (t) => Math.max(C.CORR_WMIN, C.CORR_W0 - C.CORR_WK * t);
  const maxBlocks = (t) => Math.min(4, 1 + Math.floor(t / 18));
  const wallChance = (t) => (t < C.WALL_FROM ? 0 : Math.min(0.16, 0.06 + (t - C.WALL_FROM) * 0.0015));
  const beamChance = (t) => (t < C.BEAM_FROM ? 0 : Math.min(0.14, 0.05 + (t - C.BEAM_FROM) * 0.0012));
  const beamWarn = (t) => Math.max(C.MIN_SIGHT, 0.95 - 0.003 * t);

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

  function createState(seed) {
    seed = (seed >>> 0) || 1;
    return {
      seed,
      hrand: rng(seed),                  // 위험물 생성 전용
      crand: rng(seed ^ 0x9E3779B9),     // 안전 통로 전용 — 누가 통로를 미리 물어봐도 위험물 순서가 바뀌지 않게
      knots: [C.W / 2],                  // 통로 중심, CORR_KNOT 초마다
      t: 0,                              // 세계 시간
      real: 0,                           // 실시간 (OVERDRIVE 동안 세계보다 빠르다)
      px: C.W / 2, targetX: C.W / 2,
      hazards: [],                       // block: {id,kind:'block'|'wall',x,w,h,ts,v} · beam: {id,kind:'beam',x,w,ts,fireAt,endAt}
      nextId: 1,
      nextRowAt: C.START_GRACE,
      score: 0,
      mult: 1,
      lastGrazeAt: -99,
      meter: 0,
      overdrive: 0,                      // 남은 실시간 초
      grazing: 0,                        // 이번 프레임 스침 세기 (0~1) — 소리·불꽃용
      alive: true,
      death: null,
      stats: { grazes: 0, perfects: 0, maxMult: 1, overdrives: 0, closest: Infinity, rows: 0 },
    };
  }

  // ── 안전 통로 ───────────────────────────────────────────────────
  function ensureKnots(s, t) {
    const need = Math.ceil(t / C.CORR_KNOT) + 1;
    while (s.knots.length <= need) {
      const i = s.knots.length;
      const prev = s.knots[i - 1];
      const half = corridorWidth(i * C.CORR_KNOT) / 2 + 0.5;
      const step = C.V_MAX * C.CORR_KNOT * C.CORR_SLOPE;
      let next = prev + (s.crand() * 2 - 1) * step;
      next = Math.max(half, Math.min(C.W - half, next));
      s.knots.push(next);
    }
  }

  function corridorAt(s, t) {
    if (t <= 0) return s.knots[0];
    ensureKnots(s, t);
    const f = t / C.CORR_KNOT, i = Math.floor(f);
    return s.knots[i] + (s.knots[i + 1] - s.knots[i]) * (f - i);
  }

  // [a, b] 동안 통로 중심의 최소·최대 (구간 선형이라 끝점과 마디만 보면 된다)
  function corridorRange(s, a, b) {
    let lo = Math.min(corridorAt(s, a), corridorAt(s, b)), hi = Math.max(corridorAt(s, a), corridorAt(s, b));
    for (let k = Math.ceil(a / C.CORR_KNOT); k * C.CORR_KNOT < b; k++) {
      if (k * C.CORR_KNOT <= a) continue;
      ensureKnots(s, k * C.CORR_KNOT);
      lo = Math.min(lo, s.knots[k]); hi = Math.max(hi, s.knots[k]);
    }
    return [lo, hi];
  }

  // 블록이 플레이어 띠(FALL±PR)를 지나는 세계 시간 구간 — 시간 오차를 조금 넉넉히
  function passWindow(hz) {
    return [hz.ts + (C.FALL - C.PR) / hz.v - 0.03, hz.ts + (C.FALL + C.PR + hz.h) / hz.v + 0.03];
  }

  // 통로가 [a, b] 동안 차지하는 x 범위 밖의 빈 구간들
  function freeSpans(s, a, b, widthAt) {
    const [lo, hi] = corridorRange(s, a, b);
    const half = widthAt / 2;
    const spans = [];
    if (lo - half > 0.5) spans.push([0, lo - half]);
    if (hi + half < C.W - 0.5) spans.push([hi + half, C.W]);
    return spans;
  }

  function pickInSpans(r, spans, w) {
    const fit = spans.filter(([a, b]) => b - a >= w);
    if (!fit.length) return null;
    const total = fit.reduce((n, [a, b]) => n + (b - a - w), 0);
    let k = r() * total;
    for (const [a, b] of fit) {
      const room = b - a - w;
      if (k <= room) return a + k;
      k -= room;
    }
    const [a, b] = fit[fit.length - 1];
    return b - w;
  }

  // ── 생성 (세계 시간 순서대로 — 프레임 속도와 무관) ──────────────────
  function spawnRow(s, ts) {
    const r = s.hrand;
    const v = fallSpeed(ts);
    const g = corridorWidth(ts);
    s.stats.rows++;

    if (r() < wallChance(ts)) {
      // 벽: 통로(+여유)만 비운 가로막
      const h = 3;
      const probe = { ts, v, h };
      const [a, b] = passWindow(probe);
      const [lo, hi] = corridorRange(s, a, b);
      const left = Math.max(0, lo - g / 2 - r() * 4);
      const right = Math.min(C.W, hi + g / 2 + r() * 4);
      if (left > 0.5) s.hazards.push({ id: s.nextId++, kind: 'wall', x: 0, w: left, h, ts, v });
      if (right < C.W - 0.5) s.hazards.push({ id: s.nextId++, kind: 'wall', x: right, w: C.W - right, h, ts, v });
    } else {
      const n = 1 + Math.floor(r() * maxBlocks(ts));
      const placed = [];
      for (let i = 0; i < n; i++) {
        const w = 3 + r() * (5 + Math.min(6, ts * 0.05));
        const h = 2.5 + r() * 5;
        const probe = { ts, v, h };
        const [a, b] = passWindow(probe);
        const x = pickInSpans(r, freeSpans(s, a, b, g), w);
        if (x === null) continue;
        if (placed.some((p) => x < p.x + p.w + 0.6 && x + w > p.x - 0.6)) continue;   // 같은 줄끼리 겹치지 않게
        const hz = { id: s.nextId++, kind: 'block', x, w, h, ts, v };
        placed.push(hz);
        s.hazards.push(hz);
      }
    }

    if (r() < beamChance(ts)) {
      const fireAt = ts + beamWarn(ts);
      const endAt = fireAt + C.BEAM_ON;
      const w = 2 + r() * 3.5;
      const x = pickInSpans(r, freeSpans(s, fireAt - 0.03, endAt + 0.03, g), w);
      if (x !== null) s.hazards.push({ id: s.nextId++, kind: 'beam', x, w, ts, fireAt, endAt });
    }
  }

  // ── 질의 ─────────────────────────────────────────────────────────
  const blockTop = (hz, t) => -hz.h + hz.v * (t - hz.ts);
  const beamActive = (hz, t) => t >= hz.fireAt && t <= hz.endAt;

  // 플레이어 중심(px, FALL)에서 위험물까지 거리. 0 이면 겹침. 관계없으면 Infinity
  function hazardDist(hz, px, t) {
    if (hz.kind === 'beam') {
      if (!beamActive(hz, t)) return Infinity;
      return Math.max(0, Math.abs(px - (hz.x + hz.w / 2)) - hz.w / 2);
    }
    const top = blockTop(hz, t);
    const dx = Math.max(hz.x - px, 0, px - (hz.x + hz.w));
    const dy = Math.max(top - C.FALL, 0, C.FALL - (top + hz.h));
    return Math.sqrt(dx * dx + dy * dy);   // hypot 은 엔진마다 끝자리가 다를 수 있다 — sqrt 는 IEEE 로 정확하다
  }

  // ── 진행 ─────────────────────────────────────────────────────────
  // input: { dir: -1|0|1 } (키보드) 또는 { targetX } (포인터), focus: 정밀 이동
  function step(s, dt, input) {
    const events = [];
    if (!s.alive || dt <= 0) return events;
    input = input || {};

    // 플레이어는 실시간으로 움직인다 — OVERDRIVE 동안 세상만 느려진다
    const speed = C.V_MAX * (input.focus ? C.FOCUS : 1);
    if (input.dir) {
      s.px += input.dir * speed * dt;
      s.targetX = s.px;
    } else if (typeof input.targetX === 'number' && isFinite(input.targetX)) {
      s.targetX = Math.max(0, Math.min(C.W, input.targetX));
      const d = s.targetX - s.px;
      s.px += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
    }
    s.px = Math.max(C.PR, Math.min(C.W - C.PR, s.px));

    const od = s.overdrive > 0;
    const wdt = dt * (od ? C.OD_SCALE : 1);
    s.t += wdt;
    s.real += dt;
    if (od) {
      s.overdrive = Math.max(0, s.overdrive - dt);
      if (s.overdrive === 0) events.push({ type: 'overdrive-end' });
    }

    while (s.nextRowAt <= s.t) {
      spawnRow(s, s.nextRowAt);
      s.nextRowAt += rowInterval(s.nextRowAt);
    }

    const t = s.t;
    const pts = od ? 2 : 1;
    s.score += C.SURVIVE_PPS * wdt * pts;
    let grazing = 0;
    for (const hz of s.hazards) {
      const d = hazardDist(hz, s.px, t);
      if (d === Infinity) continue;
      if (d < C.PR) {
        s.alive = false;
        s.death = { cause: hz.kind, depth: C.PR - d, mult: s.mult, t, id: hz.id };
        events.push({ type: 'death', cause: hz.kind, depth: C.PR - d, mult: s.mult });
        return events;
      }
      const gap = d - C.PR;
      if (gap >= C.GRAZE_R) continue;
      const k = 1 - gap / C.GRAZE_R;               // 가까움 0~1
      grazing = Math.max(grazing, k);
      s.lastGrazeAt = t;
      s.score += C.GRAZE_PPS * k * k * s.mult * pts * dt;
      if (gap < s.stats.closest) s.stats.closest = gap;
      if (!hz.grazed) {
        hz.grazed = true;
        s.stats.grazes++;
        s.mult = Math.min(C.MULT_MAX, s.mult + C.MULT_GRAZE);
        if (!od) s.meter += C.METER_GRAZE;
        events.push({ type: 'graze', id: hz.id, k, x: hz.kind === 'beam' ? hz.x + hz.w / 2 : Math.max(hz.x, Math.min(hz.x + hz.w, s.px)) });
      }
      if (!hz.perfect && gap < C.PERFECT_R) {
        hz.perfect = true;
        s.stats.perfects++;
        s.mult = Math.min(C.MULT_MAX, s.mult + C.MULT_PERFECT);
        const bonus = C.PERFECT_BONUS * s.mult * pts;
        s.score += bonus;
        if (!od) s.meter += C.METER_PERFECT;
        events.push({ type: 'perfect', id: hz.id, gap, points: bonus, mult: s.mult });
      }
    }
    s.grazing = grazing;
    s.stats.maxMult = Math.max(s.stats.maxMult, s.mult);

    // 배율은 안 스치면 새어 나간다
    if (t - s.lastGrazeAt > C.MULT_HOLD && s.mult > 1) s.mult = Math.max(1, s.mult - C.MULT_DECAY * wdt);

    if (!od && s.meter >= 100) {
      s.meter = 0;
      s.overdrive = C.OD_TIME;
      s.stats.overdrives++;
      events.push({ type: 'overdrive' });
    }

    // 지나간 것 치우기
    s.hazards = s.hazards.filter((hz) => (hz.kind === 'beam' ? t <= hz.endAt : blockTop(hz, t) < C.VIEW_H + 2));
    return events;
  }

  const api = {
    C, rng, createState, step, corridorAt, corridorRange, corridorWidth, passWindow, hazardDist,
    blockTop, beamActive, fallSpeed, rowInterval, beamWarn, maxBlocks,
  };
  if (typeof window !== 'undefined') window.GrazeSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
