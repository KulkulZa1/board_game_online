'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const tests = [
  'prototypes/mahjong-engine-test.js',
  'prototypes/mahjong-flow-test.js',
  'prototypes/mahjong-timer-test.js',
  'prototypes/bang-flow-test.js',
  'prototypes/newer-games-handler-test.js',
  'prototypes/core-games-handler-test.js',
  'prototypes/snake-rogue-test.js',
  'prototypes/breakout-rogue-test.js',
];

for (const test of tests) {
  console.log(`\n=== ${test} ===`);
  const result = spawnSync(process.execPath, [test], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\nGame flow suite passed: ${tests.length} scripts`);
