/* 월세 잭팟 — 동네 지도 (Slay the Spire 식 경로 선택)
 *
 * 원래는 완납할 때마다 2~3개 중 하나를 눈감고 고르는 방식이었다. 그러면
 * "고른다"는 행위는 있어도 "계획한다"는 행위가 없다. 슬더스의 지도가 재미있는 이유는
 * 선택 자체가 아니라 **몇 층 앞이 보여서 경로를 설계할 수 있다**는 점이다 —
 * "지금은 손해지만 두 층 뒤 유물 골목으로 이어지니까 이쪽" 같은 판단.
 *
 * 그래서 판이 시작될 때 지도를 통째로 만들어 보여주고, 매 층 이동 가능한 노드만
 * 고르게 한다. 이 파일은 순수 생성·탐색만 담당한다 (렌더는 game.js, 효과는 sim.js).
 *
 * 브라우저와 node 양쪽에서 쓰인다 (prototypes/jackpot-map-test.js).
 */
(function () {
  'use strict';

  // 노드 종류 — 기존 ROUTES 를 그대로 쓰되, 지도에서만 의미가 생기는 것도 있다
  const NODE_TYPES = {
    normal:     { name: '평범한 동네', icon: '🏠', weight: 34 },
    rich:       { name: '부촌',        icon: '💎', weight: 22 },
    slum:       { name: '달동네',      icon: '🏚️', weight: 24 },
    relicAlley: { name: '유물 골목',   icon: '🏛️', weight: 12 },
    market:     { name: '시장',        icon: '🏪', weight: 8  },   // 지도 전용 — 코인을 준다
  };

  const MIN_LANES = 2;
  const MAX_LANES = 4;

  function pickWeighted(rng, entries) {
    const total = entries.reduce((a, e) => a + e.w, 0);
    let r = rng() * total;
    for (const e of entries) { r -= e.w; if (r <= 0) return e.id; }
    return entries[entries.length - 1].id;
  }

  // ── 지도 생성 ──────────────────────────────────────────────────
  // floors[i] = 그 층의 노드 배열. 각 노드는 다음 층의 노드 인덱스 목록(next)을 갖는다.
  // 마지막 층은 항상 노드 하나 — 슬더스의 보스처럼 모든 경로가 한 점으로 모인다.
  function generate(rng, floorCount, opts) {
    const o = opts || {};
    const n = Math.max(2, Math.floor(floorCount) || 10);
    const floors = [];

    for (let f = 0; f < n; f++) {
      let lanes;
      if (f === 0) lanes = 1;                       // 출발점은 하나
      else if (f === n - 1) lanes = 1;              // 종착점도 하나 (모든 길이 모인다)
      else lanes = MIN_LANES + Math.floor(rng() * (MAX_LANES - MIN_LANES + 1));

      const row = [];
      for (let i = 0; i < lanes; i++) {
        // 첫 층은 늘 평범한 동네에서 시작한다 (첫 월세부터 함정이면 억울하다)
        const type = f === 0 ? 'normal' : pickWeighted(rng,
          Object.keys(NODE_TYPES).map((id) => ({ id, w: NODE_TYPES[id].weight })));
        row.push({ floor: f, lane: i, type, next: [] });
      }
      floors.push(row);
    }

    // ── 간선 연결 ────────────────────────────────────────────────
    // 규칙: 인접한 레인으로만 이어진다(교차 금지). 모든 노드는 최소 1개의 출구를 갖고,
    // 다음 층의 모든 노드는 최소 1개의 입구를 갖는다 — 고립된 노드가 없어야 한다.
    for (let f = 0; f < n - 1; f++) {
      const cur = floors[f];
      const nxt = floors[f + 1];
      const span = (i) => {
        // 현재 레인 비율을 다음 층 레인 위치로 사상해 근처로만 잇는다
        const ratio = cur.length === 1 ? 0.5 : i / (cur.length - 1);
        const center = Math.round(ratio * (nxt.length - 1));
        return center;
      };
      cur.forEach((node, i) => {
        const c = span(i);
        const cand = [c - 1, c, c + 1].filter((x) => x >= 0 && x < nxt.length);
        // 갈림길이 없으면 지도가 아니라 복도다. 가능한 한 2갈래를 주고,
        // 가끔만 1갈래로 좁힌다 (좁아지는 구간도 있어야 지형에 리듬이 생긴다).
        const want = rng() < 0.15 ? 1 : (rng() < 0.20 ? 3 : 2);
        const count = Math.min(cand.length, want);
        const chosen = [];
        // 가운데부터 확정하고 나머지는 무작위로 하나 더
        chosen.push(c);
        while (chosen.length < count) {
          const pick = cand[Math.floor(rng() * cand.length)];
          if (!chosen.includes(pick)) chosen.push(pick);
        }
        node.next = chosen.sort((a, b) => a - b);
      });
      // 입구가 없는 다음 층 노드는 가장 가까운 현재 노드에 매단다
      nxt.forEach((_, j) => {
        const hasIn = cur.some((node) => node.next.includes(j));
        if (hasIn) return;
        let best = 0, bestDist = Infinity;
        cur.forEach((node, i) => {
          const d = Math.abs(span(i) - j);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        cur[best].next = cur[best].next.concat(j).sort((a, b) => a - b);
      });
    }

    return {
      floors,
      pos: { floor: 0, lane: 0 },   // 출발점
      visited: [{ floor: 0, lane: 0 }],
    };
  }

  // ── 탐색 ───────────────────────────────────────────────────────
  function nodeAt(map, floor, lane) {
    const row = map && map.floors && map.floors[floor];
    return row ? row[lane] || null : null;
  }

  // 지금 위치에서 갈 수 있는 다음 층 노드들
  function reachable(map) {
    if (!map) return [];
    const here = nodeAt(map, map.pos.floor, map.pos.lane);
    if (!here) return [];
    const nextFloor = map.pos.floor + 1;
    if (nextFloor >= map.floors.length) return [];
    return here.next
      .map((lane) => nodeAt(map, nextFloor, lane))
      .filter(Boolean)
      .map((nd) => Object.assign({ id: nd.type, floor: nd.floor, lane: nd.lane }, NODE_TYPES[nd.type]));
  }

  function canMove(map, floor, lane) {
    return reachable(map).some((r) => r.floor === floor && r.lane === lane);
  }

  // 이동. 갈 수 없는 곳이면 아무 것도 하지 않고 null 을 돌려준다.
  function move(map, floor, lane) {
    if (!canMove(map, floor, lane)) return null;
    map.pos = { floor, lane };
    map.visited = map.visited.concat({ floor, lane });
    const nd = nodeAt(map, floor, lane);
    return Object.assign({ id: nd.type, floor, lane }, NODE_TYPES[nd.type]);
  }

  // 저장/복원용 — 구조가 깨졌으면 null 을 돌려줘 새로 만들게 한다
  function isValid(map) {
    if (!map || !Array.isArray(map.floors) || map.floors.length < 2) return false;
    if (!map.pos || typeof map.pos.floor !== 'number') return false;
    return map.floors.every((row) => Array.isArray(row) && row.length >= 1
      && row.every((nd) => NODE_TYPES[nd.type] && Array.isArray(nd.next)));
  }

  const api = { NODE_TYPES, MIN_LANES, MAX_LANES, generate, reachable, canMove, move, nodeAt, isValid };
  if (typeof window !== 'undefined') window.JackpotMap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
