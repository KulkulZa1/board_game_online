#!/usr/bin/env node
// 골든런 기록기 — prototypes/golden/*.json 을 다시 만든다.
//   node scripts/record-golden-runs.js
//
// 규칙을 '의도적으로' 바꿨을 때만 실행한다. 테스트가 깨졌다고 습관적으로 다시 기록하면
// 계약이 계약이 아니게 된다. 다시 기록했다면 커밋 메시지에 무엇이 왜 바뀌었는지 남긴다.
'use strict';

const fs = require('fs');
const path = require('path');
const { build, SPEC_VERSION } = require('../prototypes/golden-spec.js');

const OUT_DIR = path.join(__dirname, '..', 'prototypes', 'golden');
const spec = build();

fs.mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const [game, data] of Object.entries(spec.games)) {
  const file = path.join(OUT_DIR, `${game}.json`);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = JSON.stringify({ game, specVersion: SPEC_VERSION, ...data }, null, 2) + '\n';
  fs.writeFileSync(file, next);
  console.log(`  ${prev === next ? '=' : '±'} prototypes/golden/${game}.json  (${(next.length / 1024).toFixed(1)} KB)`);
  count++;
}
console.log(`\n골든런 ${count}개 기록 완료 (specVersion ${SPEC_VERSION})`);
