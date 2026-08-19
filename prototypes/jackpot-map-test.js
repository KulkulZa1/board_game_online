// 월세 잭팟 동네 지도 검증 — 실행: node prototypes/jackpot-map-test.js
'use strict';
const MAP = require('../public/arcade/jackpot/map.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

console.log('\n[지도 생성]');
{
  const m = MAP.generate(rng(1), 10);
  ok(m.floors.length === 10, '요청한 층 수만큼 만든다');
  ok(m.floors[0].length === 1, '출발점은 노드 하나');
  ok(m.floors[9].length === 1, '종착점도 노드 하나 (모든 길이 모인다)');
  ok(m.pos.floor === 0 && m.pos.lane === 0, '시작 위치는 출발점');
  ok(m.floors[0][0].type === 'normal', '첫 동네는 평범한 동네 (첫 월세부터 함정이면 억울하다)');
  ok(MAP.isValid(m), '생성된 지도는 유효하다');

  const sameA = JSON.stringify(MAP.generate(rng(7), 10).floors);
  const sameB = JSON.stringify(MAP.generate(rng(7), 10).floors);
  ok(sameA === sameB, '같은 시드는 같은 지도 (결정적)');
  ok(JSON.stringify(MAP.generate(rng(8), 10).floors) !== sameA, '다른 시드는 다른 지도');

  // 층 수를 아무렇게나 줘도 깨지지 않는다
  ok(MAP.generate(rng(2), 0).floors.length >= 2, '층 수가 0이어도 최소 2층은 만든다');
  ok(MAP.isValid(MAP.generate(rng(3), 12)), '12층 지도도 유효');
}

console.log('\n[연결 — 막다른 길이 없어야 한다]');
{
  // 이게 이 파일에서 제일 중요한 검사다. 고립된 노드가 하나라도 있으면
  // 플레이어가 그 칸에 갇히거나, 아예 갈 수 없는 칸이 지도에 그려진다.
  let noDeadEnd = true, noOrphan = true, noCross = true, allReachable = true;
  for (let seed = 1; seed <= 300; seed++) {
    const m = MAP.generate(rng(seed * 31), 8 + (seed % 5));
    const n = m.floors.length;

    for (let f = 0; f < n - 1; f++) {
      // 모든 노드는 출구가 있어야 한다
      for (const nd of m.floors[f]) {
        if (!nd.next.length) noDeadEnd = false;
        // 다음 층 범위를 벗어난 간선이 없어야 한다
        if (nd.next.some((x) => x < 0 || x >= m.floors[f + 1].length)) noDeadEnd = false;
      }
      // 다음 층의 모든 노드는 입구가 있어야 한다
      for (let j = 0; j < m.floors[f + 1].length; j++) {
        if (!m.floors[f].some((nd) => nd.next.includes(j))) noOrphan = false;
      }
    }

    // 출발점에서 실제로 종착점까지 갈 수 있는가 (BFS)
    let front = [0];
    for (let f = 0; f < n - 1 && front.length; f++) {
      const nxt = new Set();
      for (const lane of front) for (const x of m.floors[f][lane].next) nxt.add(x);
      front = [...nxt];
    }
    if (!front.length) allReachable = false;
  }
  ok(noDeadEnd, '300개 지도에서 출구 없는 노드가 없다');
  ok(noOrphan, '300개 지도에서 입구 없는 노드가 없다');
  ok(allReachable, '300개 지도 모두 출발점에서 종착점까지 이어진다');
}

console.log('\n[이동 규칙]');
{
  const m = MAP.generate(rng(5), 8);
  const opts = MAP.reachable(m);
  ok(opts.length >= 1, '출발점에서 갈 곳이 있다', String(opts.length));
  ok(opts.every((o) => o.floor === 1), '갈 수 있는 곳은 바로 다음 층뿐');
  ok(opts.every((o) => o.name && o.icon), '선택지에 이름·아이콘이 실려 있다 (UI 가 그대로 쓴다)');

  // 연결되지 않은 곳으로는 못 간다
  ok(MAP.move(m, 3, 0) === null, '두 층 건너뛰기 불가');
  ok(MAP.move(m, 1, 99) === null, '없는 레인으로 이동 불가');
  ok(m.pos.floor === 0, '실패한 이동은 위치를 바꾸지 않는다');

  // 정상 이동
  const target = opts[0];
  const moved = MAP.move(m, target.floor, target.lane);
  ok(moved && moved.id === target.id, '연결된 노드로 이동 성공');
  ok(m.pos.floor === 1 && m.pos.lane === target.lane, '위치가 갱신된다');
  ok(m.visited.length === 2, '지나온 길이 기록된다');

  // 끝까지 걸어갈 수 있다
  let guard = 0;
  while (MAP.reachable(m).length && guard++ < 50) {
    const nx = MAP.reachable(m)[0];
    MAP.move(m, nx.floor, nx.lane);
  }
  ok(m.pos.floor === m.floors.length - 1, '종착점까지 도달한다', `floor=${m.pos.floor}`);
  ok(MAP.reachable(m).length === 0, '종착점에서는 갈 곳이 없다');
}

console.log('\n[노드 종류]');
{
  const ids = Object.keys(MAP.NODE_TYPES);
  ok(ids.length >= 5, `노드 종류 ${ids.length}종`);
  ok(ids.every((id) => MAP.NODE_TYPES[id].icon && MAP.NODE_TYPES[id].name), '모든 종류에 이름·아이콘');
  ok(ids.every((id) => MAP.NODE_TYPES[id].weight > 0), '모든 종류에 등장 가중치');

  // 충분히 많은 지도를 만들면 모든 종류가 실제로 등장한다 (가중치가 죽어 있지 않다)
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const m = MAP.generate(rng(seed * 13), 10);
    m.floors.forEach((row) => row.forEach((nd) => seen.add(nd.type)));
  }
  ok(ids.every((id) => seen.has(id)), '200개 지도에서 모든 노드 종류가 실제로 등장한다',
     ids.filter((id) => !seen.has(id)).join(',') || '-');
}

console.log('\n[저장값 검증]');
{
  ok(!MAP.isValid(null), 'null 은 무효');
  ok(!MAP.isValid({}), '빈 객체는 무효');
  ok(!MAP.isValid({ floors: [] }), '층이 없으면 무효');
  ok(!MAP.isValid({ floors: [[{ type: 'nope', next: [] }], [{ type: 'normal', next: [] }]], pos: { floor: 0, lane: 0 } }),
     '모르는 노드 종류가 있으면 무효 (구버전 저장 방어)');
  const good = MAP.generate(rng(9), 6);
  ok(MAP.isValid(JSON.parse(JSON.stringify(good))), 'JSON 왕복 후에도 유효 (저장/복원 가능)');
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
