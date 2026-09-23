// Godot 이식 드리프트 검사 — 실행: node prototypes/godot-port-test.js
//
// godot/tower-defense 의 GDScript 가 sim.js 규칙에서 벗어나지 않았는지, Godot 없이 CI 에서 본다.
//  1) td_rules.gd 의 데이터 표는 JSON 으로도 읽히게 써 두었다 — 그대로 뽑아 sim.js 표와 비교
//  2) td_rng.gd 의 next_uint 세 줄을 '그 텍스트 그대로' 64비트 정수 의미(BigInt)로 실행해
//     계약 파일의 난수열과 비교 — JS 로 다시 쓴 흉내가 아니라 GDScript 식 자체를 검사한다
//  3) td_run.gd 가 JS Run 의 메서드를 빠짐없이 옮겼는지 (camelCase → snake_case)
//  4) tests/contract_test.gd 가 계약 파일의 Tier B 항목을 전부 검사하는지
//  5) GDScript 들여쓰기가 탭으로만 되어 있는지 (섞이면 Godot 이 파싱을 거부한다)
// 실제 GDScript 실행 검증은 Godot 이 있을 때: godot --headless --path godot/tower-defense --script res://tests/contract_test.gd
'use strict';

const fs = require('fs');
const path = require('path');
const TD = require('../public/arcade/tower-defense/sim.js');

const root = path.join(__dirname, '..');
const gdDir = path.join(root, 'godot/tower-defense');
const read = (rel) => fs.readFileSync(path.join(gdDir, rel), 'utf8');
const rules = read('scripts/td_rules.gd');
const rngSrc = read('scripts/td_rng.gd');
const runSrc = read('scripts/td_run.gd');
const contractSrc = read('tests/contract_test.gd');
const golden = JSON.parse(fs.readFileSync(path.join(root, 'prototypes/golden/tower-defense.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

// `const NAME := <JSON>` 을 괄호 짝을 맞춰 잘라낸다
function gdConst(name) {
  const head = new RegExp(`^const ${name} := `, 'm').exec(rules);
  if (!head) throw new Error(`td_rules.gd 에 const ${name} 가 없다`);
  let i = head.index + head[0].length;
  const open = rules[i];
  if (open !== '{' && open !== '[') {
    const line = rules.slice(i, rules.indexOf('\n', i)).trim();
    return JSON.parse(line.replace(/#.*$/, '').trim());
  }
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false;
  for (let j = i; j < rules.length; j++) {
    const ch = rules[j];
    if (inStr) { if (ch === '\\') j++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(rules.slice(i, j + 1));
  }
  throw new Error(`const ${name} 가 닫히지 않았다`);
}
const plain = (v) => JSON.parse(JSON.stringify(v));    // 함수 등 JSON 이 못 담는 값 제거
function firstDiff(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${p || '(값)'}: GD ${JSON.stringify(a)} ≠ JS ${JSON.stringify(b)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[k], b[k], p ? `${p}.${k}` : k);
    if (d) return d;
  }
  return null;
}

console.log('\n[데이터 표 — td_rules.gd 와 sim.js 가 같다]');
for (const [gdName, jsValue] of [['TOWERS', TD.TOWERS], ['FUSIONS', TD.FUSIONS], ['ENEMIES', TD.ENEMIES],
  ['PERKS', TD.PERKS], ['CURSES', TD.CURSES], ['COMBO_TIERS', TD.COMBO_TIERS]]) {
  const d = firstDiff(gdConst(gdName), plain(jsValue));
  ok(!d, `${gdName}`, d);
}
ok(JSON.stringify(gdConst('TOWER_ORDER')) === JSON.stringify(Object.keys(TD.TOWERS)), 'TOWER_ORDER 가 JS 객체 키 순서와 같다 (드래프트 풀 순서)');
{
  const gd = gdConst('META_UPGRADES');
  const bad = [];
  for (const u of TD.META_UPGRADES) {
    const g = gd.find((x) => x.id === u.id);
    if (!g) { bad.push(`${u.id} 없음`); continue; }
    if (g.max !== u.max || g.name !== u.name || g.icon !== u.icon) bad.push(`${u.id} 머리값`);
    for (let l = 0; l < u.max; l++) if (g.costBase + l * g.costStep !== u.cost(l)) bad.push(`${u.id} Lv${l} 비용`);
  }
  ok(!bad.length && gd.length === TD.META_UPGRADES.length, 'META_UPGRADES (비용 함수 → base+step)', bad.join(', '));
}
{
  const pts = gdConst('PATH_POINTS');
  const cells = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let [x, y] = pts[i]; const [tx, ty] = pts[i + 1];
    const dx = Math.sign(tx - x), dy = Math.sign(ty - y);
    while (x !== tx || y !== ty) { if (!cells.some((c) => c.x === x && c.y === y)) cells.push({ x, y }); x += dx; y += dy; }
  }
  cells.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
  ok(JSON.stringify(cells) === JSON.stringify(TD.PATH), `PATH_POINTS 가 JS 와 같은 길을 만든다 (${cells.length}칸)`);
}
for (const [name, js] of [['COLS', TD.COLS], ['ROWS', TD.ROWS], ['FUSED_COST_STEP', TD.FUSED_COST_STEP], ['FUSED_DMG_STEP', TD.FUSED_DMG_STEP], ['COMBO_WINDOW', TD.COMBO_WINDOW], ['META_KEY', TD.META_KEY]]) {
  ok(gdConst(name) === js, `${name} = ${JSON.stringify(js)}`, `GD ${JSON.stringify(gdConst(name))}`);
}

console.log('\n[난수 — td_rng.gd 의 식을 64비트 정수 의미로 그대로 실행]');
{
  const body = /func next_uint\(\) -> int:\n((?:\t.*\n)+)/.exec(rngSrc);
  ok(!!body, 'next_uint 본문을 찾았다');
  const lines = body[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('_s ='));
  ok(lines.length === 3, 'xorshift 세 단계', `${lines.length}줄`);
  // GDScript 식 → BigInt 식. int 는 64비트 부호 있는 정수이므로 BigInt 의 >> (산술) 와 일치한다.
  const js = lines.map((l) => l
    .replace(/0x[0-9A-Fa-f]+|\b\d+\b/g, (m) => `${m}n`)
    .replace(/\b_as_i32\(/g, 'asI32(')
    .replace(/\b_s\b/g, 's')
    .replace(/\bMASK\b/g, 'MASK') + ';').join('\n');
  const MASK = 0xFFFFFFFFn;
  const asI32 = (x) => { x &= MASK; return x >= 0x80000000n ? x - 0x100000000n : x; };
  // eslint 가 없으니 new Function 으로 충분 — 입력은 저장소 파일이다
  const step = new Function('s', 'MASK', 'asI32', `${js}\nreturn s;`);
  let allSame = true, detail = '';
  for (const c of golden.tierB.rng) {
    let s = BigInt(c.seed >>> 0) & MASK; if (s === 0n) s = 1n;
    for (let k = 0; k < c.ints.length; k++) {
      s = step(s, MASK, asI32);
      if (s !== BigInt(c.ints[k])) { allSame = false; detail = `seed ${c.seed} #${k}: ${s} ≠ ${c.ints[k]}`; break; }
    }
    if (!allSame) break;
  }
  ok(allSame, '계약 파일의 uint32 난수열과 비트 단위로 같다', detail);
}

console.log('\n[Run 메서드 — JS 의 것이 GDScript 에 다 있다]');
{
  const jsMethods = Object.getOwnPropertyNames(TD.Run.prototype).filter((n) => n !== 'constructor');
  const snake = (n) => ({ enemyXY: 'enemy_xy' }[n] ||
    n.replace(/^_/, '__').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^__/, '_'));
  const missing = jsMethods.filter((n) => !new RegExp(`^(static )?func ${snake(n)}\\(`, 'm').test(runSrc));
  ok(!missing.length, `${jsMethods.length}개 메서드가 모두 옮겨졌다`, missing.map((n) => `${n}→${snake(n)}`).join(', '));
}

console.log('\n[계약 검사 스크립트 — Tier B 항목을 전부 본다]');
{
  const keys = Object.keys(golden.tierB);
  const unchecked = keys.filter((k) => !contractSrc.includes(`b["${k}"]`));
  ok(!unchecked.length, `tests/contract_test.gd 가 Tier B ${keys.length}개 항목을 모두 검사한다`, unchecked.join(', '));
}

console.log('\n[GDScript 들여쓰기 — 탭만]');
{
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.godot') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.gd')) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (/^\t* +\S/.test(line) && !/^\s*#/.test(line)) bad.push(`${path.relative(gdDir, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(gdDir);
  ok(!bad.length, '스페이스 들여쓰기 없음 (섞이면 Godot 이 파싱을 거부한다)', bad.slice(0, 5).join(', '));
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
