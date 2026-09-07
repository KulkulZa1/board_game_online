// 골든런 이식 계약 검증 — 실행: node prototypes/golden-run-test.js
//
// prototypes/golden/*.json 에 박제된 값과 지금 sim.js 가 내는 값을 대조한다.
//
//   Tier B 가 깨졌다 = 규칙이 바뀌었다. 다른 엔진으로 이식한 쪽도 같이 고쳐야 한다.
//   Tier A 가 깨졌다 = 같은 시드가 같은 결과를 안 낸다. 밸런스를 건드렸거나,
//                      sim 이 비결정적이 됐다(Date.now / Math.random / 순회 순서).
//
// 의도한 변경이면 `node scripts/record-golden-runs.js` 로 다시 기록한다.
'use strict';

const fs = require('fs');
const path = require('path');
const { build, SPEC_VERSION } = require('./golden-spec.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

// 어긋난 첫 지점을 경로로 알려준다 — 통째로 "다르다"만 나오면 고칠 수가 없다
function firstDiff(a, b, p) {
  p = p || '';
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return `${p || '(root)'}: 기록 ${JSON.stringify(b)} → 현재 ${JSON.stringify(a)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${p}: 배열/객체 형태가 다름`;
  if (Array.isArray(a) && a.length !== b.length) return `${p}.length: 기록 ${b.length} → 현재 ${a.length}`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], p ? `${p}.${k}` : k);
    if (d) return d;
  }
  return null;
}

const spec = build();
const dir = path.join(__dirname, 'golden');

for (const [game, current] of Object.entries(spec.games)) {
  console.log(`\n[${game}]`);
  const file = path.join(dir, `${game}.json`);
  if (!fs.existsSync(file)) {
    ok(false, `골든런 파일 존재 (${game}.json)`, 'node scripts/record-golden-runs.js 로 기록하세요');
    continue;
  }
  const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(golden.specVersion === SPEC_VERSION, `specVersion 일치 (${SPEC_VERSION})`, `기록 ${golden.specVersion}`);

  // Tier B — 엔진을 넘어 반드시 같아야 하는 이산값
  const bDiff = firstDiff(current.tierB, golden.tierB, 'tierB');
  ok(!bDiff, 'Tier B — 이식 동등성 (난수열·구성표·할당량·카드 id)', bDiff);

  // Tier A — 같은 엔진 안에서의 결정론
  const aDiff = firstDiff(current.tierA, golden.tierA, 'tierA');
  ok(!aDiff, 'Tier A — 결정론 (같은 시드 → 같은 이벤트 스트림)', aDiff);
}

// 계약이 실제로 '고정'인지 — 두 번 만들면 두 번 다 같아야 한다
console.log('\n[계약 자체의 결정성]');
{
  const again = build();
  const d = firstDiff(again, spec, 'spec');
  ok(!d, '같은 코드로 두 번 만들면 완전히 같다 (숨은 비결정성 없음)', d);
}

// Tier B 는 정수/이산값만 담아야 한다 — 실수가 섞이면 이식 대조가 헛경보를 낸다
console.log('\n[Tier B 형태 규약]');
{
  const suspicious = [];
  (function walk(v, p) {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) suspicious.push(`${p}=${v}`);
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`);
    }
  })(spec.games, 'games');
  ok(suspicious.length === 0, '계약에 NaN/Infinity 가 없다 (JSON 이 담지 못한다)', suspicious.join(', '));

  for (const [game, cur] of Object.entries(spec.games)) {
    const ints = cur.tierB.rng.flatMap((r) => r.ints);
    ok(ints.length > 0 && ints.every((n) => Number.isInteger(n) && n >= 0 && n <= 4294967295),
      `${game}: 난수열이 uint32 정수다 (다른 엔진에서 재현 가능)`);
  }
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail) {
  console.log('\n의도한 규칙 변경이라면: node scripts/record-golden-runs.js');
  process.exit(1);
}
