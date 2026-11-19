// 뱀파이어 서바이버 Godot 이식 드리프트 검사 — 실행: node prototypes/godot-vampire-port-test.js
//
// godot/vampire 의 GDScript 가 웹판(public/arcade/vampire/game.js) 규칙에서 벗어나지 않았는지, Godot 없이 CI 에서 본다.
//  1) vs_rules.gd 의 데이터 표는 JSON 으로도 읽히게 써 두었다 — 그대로 뽑아 game.js 의 같은 표와 비교.
//     Godot 판은 웹판에서 갈라져 나왔다 (새 무기·드롭률 등). 그래서 '웹판에 있는 것'은 그대로 같아야 하고,
//     달라진 값은 GODOT_OVERRIDES, Godot 에만 있는 항목은 GODOT_ONLY 에 사유와 함께 적혀 있어야 통과한다 —
//     목록에 없는 차이는 실수로 본다.
//  2) 패시브·파워업·아이템 효과(JS 에선 apply 함수)는 vs_run.gd 의 match 분기에 있다 — 그 GDScript 줄을
//     '그 텍스트 그대로' JS 식으로 바꿔 가짜 플레이어에 실행하고, JS 의 apply 결과와 비교
//  3) XP 곡선 식도 같은 방식으로 실행해 비교
//  4) 규칙 함수가 빠짐없이 옮겨졌는지 (camelCase → snake_case), tests/sim_test.gd 가 있는지
//  5) GDScript 들여쓰기가 탭으로만 되어 있는지 (섞이면 Godot 이 파싱을 거부한다)
// 실제 GDScript 실행 검증은 Godot 이 있을 때: godot --headless --path godot/vampire --script res://tests/sim_test.gd
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gdDir = path.join(root, 'godot/vampire');
const read = (rel) => fs.readFileSync(path.join(gdDir, rel), 'utf8');
const rules = read('scripts/vs_rules.gd');
const runSrc = read('scripts/vs_run.gd');
const gameJs = fs.readFileSync(path.join(root, 'public/arcade/vampire/game.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

// `const NAME := <JSON>` 을 괄호 짝을 맞춰 잘라낸다 (godot-port-test.js 와 같은 방식)
function gdConst(name) {
  const head = new RegExp(`^const ${name} := `, 'm').exec(rules);
  if (!head) throw new Error(`vs_rules.gd 에 const ${name} 가 없다`);
  const i = head.index + head[0].length;
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

// game.js 는 DOM 을 만지는 IIFE 라 require 할 수 없다. 최상위(들여쓰기 2칸) `const NAME = …;` 의 리터럴만
// 잘라 vm 에서 평가한다 — 여러 줄이면 같은 들여쓰기의 `};` / `];` 줄에서 끝난다. apply 함수는 평가만 되고
// 불리지 않으므로 그 안의 전역(player, xpGems …)은 없어도 된다.
function jsConst(name) {
  const lines = gameJs.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^  const ${name}\\s*=\\s*`).test(l));
  if (start === -1) throw new Error(`game.js 에 const ${name} 가 없다`);
  let src = lines[start].replace(new RegExp(`^  const ${name}\\s*=\\s*`), '');
  if (!/;\s*(\/\/.*)?$/.test(src)) {
    let end = start + 1;
    while (!/^  [}\]];/.test(lines[end])) end++;
    src = [src, ...lines.slice(start + 1, end + 1)].join('\n');
  }
  src = src.replace(/;\s*(\/\/.*)?$/, '');
  const value = vm.runInNewContext(`(${src})`, { Math, Set });
  return value instanceof Set ? [...value] : value;
}

const plain = (v) => JSON.parse(JSON.stringify(v));    // apply 같은 함수 제거
const omit = (list, keys) => list.map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))));
function firstDiff(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${p || '(값)'}: GD ${JSON.stringify(a)} ≠ JS ${JSON.stringify(b)}`;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (!Array.isArray(a) && JSON.stringify(ka) !== JSON.stringify(kb)) {
    const missing = kb.filter((k) => !ka.includes(k)), extra = ka.filter((k) => !kb.includes(k));
    if (missing.length || extra.length) return `${p || '(표)'}: 키 GD에 없음 [${missing}] / GD에만 있음 [${extra}]`;
    return `${p || '(표)'}: 키 순서가 다르다 — 순서가 선택지 풀·표시 순서다`;
  }
  for (const k of new Set([...ka, ...kb])) {
    const d = firstDiff(a[k], b[k], p ? `${p}.${k}` : k);
    if (d) return d;
  }
  return null;
}

// Godot 판에서 일부러 바꾼 값 — { 이름: [GD 값, JS 값, 사유] }
const GODOT_OVERRIDES = {
  ITEM_BOX_INTERVAL: [75, 40, '아이템 상자가 너무 자주 나와 흐름이 끊긴다는 피드백 (보스 상자 4→1, 고블린 2→1 과 함께)'],
};
// Godot 판에만 있는 무기 — 표마다 이 항목들은 GD 에만 있어도 된다
const GODOT_ONLY = {
  weapons: ['whip', 'axe', 'storm', 'bloodtear', 'deathspiral', 'judgment'],
  families: ['whip', 'axe', 'storm'],
  projTypes: ['axe'],
};

console.log('\n[수치 상수 — vs_rules.gd 와 game.js 가 같다]');
for (const name of ['PLAYER_SPEED', 'BASE_HP', 'WAVE_INTERVAL', 'MAX_ENEMIES', 'DASH_COOLDOWN', 'DASH_DMG', 'DASH_RANGE',
  'SURVIVE_GOAL', 'BOSS_INTERVAL', 'ITEM_BOX_INTERVAL', 'ITEM_BOX_LIFETIME', 'HORDE_WAVE_EVERY', 'MAX_WEAPON_LEVEL',
  'MAX_WEAPONS', 'GOBLIN_INTERVAL', 'GRID_CELL', 'LOW_HP_THRESHOLD', 'CRITICAL_HP_THRESHOLD', 'LOW_HP_ALERT_COOLDOWN',
  'COMBO_MILESTONES']) {
  const gd = gdConst(name), js = jsConst(name);
  if (GODOT_OVERRIDES[name]) {
    const [gdWant, jsWant, why] = GODOT_OVERRIDES[name];
    ok(gd === gdWant && js === jsWant, `${name} = ${gd} (웹판 ${js}) — 의도적 변경: ${why}`,
      `GD ${gd} / JS ${js} — 목록의 값(${gdWant}/${jsWant})과 다르다`);
    continue;
  }
  ok(JSON.stringify(gd) === JSON.stringify(js), `${name} = ${JSON.stringify(js)}`, `GD ${JSON.stringify(gd)}`);
}

console.log('\n[데이터 표 — 웹판 항목은 통째로 같다, Godot 전용 추가분만 허용]');
for (const name of ['NON_ATTACK_WEAPONS', 'SYNERGY_DEFS', 'SLASH_SUPPORT_DEFS']) {
  const d = firstDiff(gdConst(name), plain(jsConst(name)));
  ok(!d, name, d);
}
// 객체 표: 웹판 키는 같은 순서·같은 값, 나머지 키는 GODOT_ONLY 에 있어야 한다
for (const [name, extra] of [['WEAPON_DEFS', GODOT_ONLY.weapons], ['WEAPON_LVUP_DESC', GODOT_ONLY.families],
  ['WEAPON_FAMILY', GODOT_ONLY.weapons], ['PROJ_TYPE_FAMILY', GODOT_ONLY.projTypes], ['AUX_EFFECT_DEFS', GODOT_ONLY.families]]) {
  const gd = gdConst(name), js = plain(jsConst(name));
  const shared = Object.fromEntries(Object.keys(gd).filter((k) => k in js).map((k) => [k, gd[k]]));
  const d = firstDiff(shared, js);
  const unknown = Object.keys(gd).filter((k) => !(k in js) && !extra.includes(k));
  ok(!d && !unknown.length, `${name} (Godot 전용 ${Object.keys(gd).length - Object.keys(shared).length}개)`, d || `목록에 없는 추가 키: ${unknown}`);
}
// 배열 표: 웹판 배열이 앞부분과 같고, 뒤에 붙은 것은 Godot 전용
for (const [name, extra, key] of [['EVOLUTION_DEFS', GODOT_ONLY.weapons, (x) => x.id], ['WEAPON_POOL', GODOT_ONLY.weapons, (x) => x]]) {
  const gd = gdConst(name), js = plain(jsConst(name));
  const d = firstDiff(gd.slice(0, js.length), js);
  const unknown = gd.slice(js.length).map(key).filter((k) => !extra.includes(k));
  ok(!d && !unknown.length, `${name} — 웹판 ${js.length}개가 앞에 그대로, Godot 전용 ${gd.length - js.length}개`, d || `목록에 없는 추가: ${unknown}`);
}

console.log('\n[데이터 표 — 옮기지 않은 메타 진행 필드(해금·코인)만 빼고 같다]');
for (const [name, skip] of [['PASSIVE_POOL', ['apply']], ['CHARACTER_DEFS', ['unlock', 'coinMult']],
  ['DIFFICULTY_DEFS', ['coinMult']], ['MAP_DEFS', ['unlock', 'coinMult']], ['POWERUP_POOL', ['apply']],
  ['ITEM_BOX_POOL', ['apply']]]) {
  const d = firstDiff(gdConst(name), plain(omit(jsConst(name), skip)));
  ok(!d, `${name} (${skip.join('·')} 제외)`, d);
}

// ── 효과 코드: vs_run.gd 의 match 분기 줄을 JS 로 바꿔 실행 ─────────────────────
const FIELD = {
  max_hp: 'maxHp', hp: 'hp', speed: 'speed', dmg_mult: 'dmgMult', cd_mult: 'cdMult', xp_range: 'xpRange',
  crit_chance: 'critChance', pierce_bonus: 'pierceBonus', regen_rate: 'regenRate', range_bonus: 'rangeBonus',
  ignite_chance: 'igniteChance', venom_chance: 'venomChance', lifesteal: 'lifesteal', invincible: 'invincible',
  temp_dmg_mult: 'tempDmgMult', temp_dmg_timer: 'tempDmgTimer', temp_speed_mult: 'tempSpeedMult', temp_speed_timer: 'tempSpeedTimer',
};
// `func NAME(...)` 안의 `match …:` 분기들 → { id: ['p.x += 1.0', …] }
function gdMatchArms(funcName) {
  const body = new RegExp(`^func ${funcName}\\([^)]*\\)[^\\n]*:\\n((?:\\t.*\\n|\\n)+)`, 'm').exec(runSrc);
  if (!body) throw new Error(`vs_run.gd 에 func ${funcName} 가 없다`);
  const arms = {};
  let cur = null;
  for (const line of body[1].split('\n')) {
    const arm = /^\t\t"([a-z_]+)":\s*$/.exec(line);
    if (arm) { cur = arm[1]; arms[cur] = []; continue; }
    if (cur && /^\t\t\t\S/.test(line)) arms[cur].push(line.trim().replace(/\s+#.*$/, ''));
    else if (cur && /^\t{0,2}\S/.test(line)) cur = null;
  }
  return arms;
}
// 단순 대입문만 옮긴다: p.<field> (=|+=|*=) <식>. 그 밖의 문장(반복·호출)이 있으면 null — 비교 대상에서 뺀다
function gdArmToJs(lines) {
  const out = [];
  for (const l of lines) {
    const m = /^p\.(\w+) (=|\+=|\*=) (.+)$/.exec(l);
    if (!m || !FIELD[m[1]]) return null;
    const expr = m[3].replace(/\bp\.(\w+)/g, (_, f) => {
      if (!FIELD[f]) throw new Error(`모르는 필드 p.${f}`);
      return `p.${FIELD[f]}`;
    }).replace(/\bminf\(/g, 'Math.min(').replace(/\bmaxf\(/g, 'Math.max(');
    out.push(`p.${FIELD[m[1]]} ${m[2]} ${expr};`);
  }
  return out.join('\n');
}
const mockPlayer = () => ({
  hp: 40, maxHp: 100, speed: 160, dmgMult: 1.1, cdMult: 0.9, xpRange: 80, critChance: 0.15, pierceBonus: 2,
  regenRate: 0.02, rangeBonus: 1.18, igniteChance: 0.2, venomChance: 0.15, lifesteal: 0.03, invincible: 0,
  tempDmgMult: 1, tempDmgTimer: 0, tempSpeedMult: 1, tempSpeedTimer: 0,
});
function compareEffects(label, jsPool, funcName, simpleIds) {
  const arms = gdMatchArms(funcName);
  const missing = jsPool.map((d) => d.id).filter((id) => !(id in arms));
  ok(!missing.length, `${label}: ${jsPool.length}개 효과가 ${funcName}() 에 모두 있다`, missing.join(', '));
  const bad = [];
  let compared = 0;
  for (const def of jsPool) {
    if (!(def.id in arms)) continue;
    const js = gdArmToJs(arms[def.id]);
    if (js === null) { if (simpleIds.includes(def.id)) bad.push(`${def.id}: 단순 대입이 아니다`); continue; }
    compared++;
    const a = mockPlayer(), b = mockPlayer();
    def.apply(a);
    vm.runInNewContext(js, { p: b, Math });
    const d = firstDiff(b, a);
    if (d) bad.push(`${def.id} → ${d}`);
  }
  ok(!bad.length && compared >= simpleIds.length, `${label}: 대입식 ${compared}개가 JS apply 와 같은 결과`, bad.join('; '));
}

console.log('\n[효과 코드 — GDScript 대입식을 그대로 실행해 JS apply 와 비교]');
compareEffects('패시브', jsConst('PASSIVE_POOL'), 'apply_passive',
  ['hp_up', 'spd_up', 'dmg_up', 'cd_up', 'magnet', 'crit', 'pierce_up', 'regen', 'range_up', 'ignite', 'venom', 'lifesteal']);
compareEffects('파워업', jsConst('POWERUP_POOL'), 'apply_powerup', ['berserk', 'haste', 'heal']);
compareEffects('아이템 박스', jsConst('ITEM_BOX_POOL'), 'apply_item_box', ['medkit', 'barrier', 'turbo', 'power', 'hpmax', 'dmgperm']);

console.log('\n[XP 곡선 — 두 식을 그대로 실행]');
{
  const jsBody = /function xpNeeded\(lv\) \{\s*return ([^;]+);/.exec(gameJs);
  const gdBody = /^static func xp_needed\(lv: int\) -> int:\n\treturn (.+)$/m.exec(rules);
  ok(!!jsBody && !!gdBody, 'xpNeeded / xp_needed 본문을 찾았다');
  if (jsBody && gdBody) {
    const jsFn = new Function('lv', `return ${jsBody[1]};`);
    // GDScript 의 round() 는 동률을 0 에서 먼 쪽으로 — 양수에선 Math.round 와 같다
    const gdFn = new Function('lv', `return ${gdBody[1].replace(/\bint\(round\(/, 'Math.trunc(Math.round(').replace(/\bpow\(/g, 'Math.pow(')};`);
    const diff = [];
    for (let lv = 1; lv <= 120; lv++) if (jsFn(lv) !== gdFn(lv)) diff.push(`Lv${lv}: ${gdFn(lv)} ≠ ${jsFn(lv)}`);
    ok(!diff.length, 'Lv1~120 필요 XP 가 같다', diff.slice(0, 3).join(', '));
  }
}

console.log('\n[규칙 함수 — game.js 의 것이 vs_run.gd 에 다 있다]');
{
  // 한 판의 규칙을 이루는 함수들. UI·메타·협동·장비·타워 함수는 옮기지 않았다 (godot/vampire/README.md)
  const ported = ['addWeapon', 'evolveWeapon', 'applyPassive', 'passiveLevel', 'isPassiveMaxed', 'slashModLevel',
    'applySlashSupport', 'slashStats', 'getMainWeapon', 'isWeaponActive', 'getAuxFamilies', 'triggerAuxEffects',
    'hasSynergy', 'availableEvolutions', 'aegisReflect', 'spawnWave', 'dropPowerup', 'spawnTreasureGoblin',
    'dropGoblinJackpot', 'spawnGoldRush', 'dropMiniJackpot', 'activateOverdrive', 'fireWeapon', 'nearestEnemy',
    'spawnExplosion', 'spawnMeteorStrike', 'spawnParticle', 'performDashSlash', 'queueSlashEchoes',
    'updateSlashEchoes', 'updateRuptures', 'updateSpectralFields', 'updateToxicFields', 'fireEnemyProjectile',
    'dealDamage', 'awardComboMilestone', 'killEnemy', 'spawnBoss', 'gainXP', 'showLevelUp', 'usableItemBoxes',
    'showItemBoxChoices', 'choiceWeight', 'weightedPick', 'takeWeightedChoices', 'doReroll', 'evolutionChoices',
    'weaponLevelChoices', 'newWeaponChoices', 'passiveChoices', 'overflowBonusChoice', 'slashSupportChoices',
    'buildChoices', 'setMainWeapon', 'getPlayerHpRatio', 'updateLowHpFeedback', 'update', 'endGame',
    'buildEnemyGrid', 'nearestEnemyNear', 'getSurviveGoal'];
  const snake = (n) => ({ gainXP: 'gain_xp' }[n] || n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase());
  const jsMissing = ported.filter((n) => !new RegExp(`function ${n}\\(`).test(gameJs));
  ok(!jsMissing.length, `대조 목록의 ${ported.length}개 함수가 game.js 에 있다 (목록이 낡지 않았다)`, jsMissing.join(', '));
  const gdMissing = ported.filter((n) => !new RegExp(`^(static )?func ${snake(n)}\\(`, 'm').test(runSrc));
  ok(!gdMissing.length, `${ported.length}개 규칙 함수가 vs_run.gd 에 있다`, gdMissing.map((n) => `${n}→${snake(n)}`).join(', '));
}

console.log('\n[Godot 프로젝트 구성]');
{
  const project = read('project.godot');
  ok(/run\/main_scene="res:\/\/scenes\/main\.tscn"/.test(project) && fs.existsSync(path.join(gdDir, 'scenes/main.tscn')), '메인 씬이 있다');
  ok(/res:\/\/scripts\/main\.gd/.test(read('scenes/main.tscn')), 'main.tscn 이 main.gd 를 붙인다');
  ok(fs.existsSync(path.join(gdDir, 'tests/sim_test.gd')), 'tests/sim_test.gd (Godot 헤드리스 검사)가 있다');
  const ignore = read('.gitignore');
  ok(/^\.godot\/$/m.test(ignore) && /^export_presets\.cfg$/m.test(ignore), '.godot/ 캐시와 export_presets.cfg 는 커밋하지 않는다');
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
