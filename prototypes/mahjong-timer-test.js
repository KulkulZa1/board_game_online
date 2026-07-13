// 리치 자동 타패 + 체스식 시간 은행 — 결정적 격리 검증
// 다른 좌석이 움직이지 않도록 모든 좌석을 '접속 끊긴 사람'으로 두고(discAutoMs 크게),
// 관찰 대상 좌석만 connected로 만들어 단일 스텝을 검증한다.
'use strict';
const MJ = require('../server/mahjong.js');
MJ.CFG.aiDelay = () => 99999;
MJ.CFG.handGapMs = 99999;
MJ.CFG.riichiAutoMs = 60;
MJ.CFG.graceMs = 100;
MJ.CFG.bankMs = 500;
MJ.CFG.discAutoMs = 99999;   // 비관찰 좌석 동결

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkFrozenRoom() {
  const room = MJ.createRoom('P0');
  for (let i = 0; i < 4; i++) {
    room.seats[i] = { type: 'human', name: 'P' + i, socketId: null, token: null, connected: false };
  }
  MJ.startMatch(room);
  clearTimeout(room.actionTimer);
  clearTimeout(room.aiTimer);
  return room;
}
function cleanup(room) {
  clearTimeout(room.cleanupTimer); clearTimeout(room.actionTimer); clearTimeout(room.aiTimer);
  MJ.rooms.delete(room.code);
}

(async () => {
  console.log('\n[리치 자동 타패 — 단일 스텝]');
  {
    const room = mkFrozenRoom();
    const g = room.game;
    room.seats[0].connected = true;
    // 좌석0: 리치 텐파이(3s/6s 대기) + 화료 불가 쯔모(1z)
    g.hands[0] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 21, 22, 27];
    g.riichiDeclared[0] = true;
    g.turn = 0; g.phase = 'turn'; g.drawnTile = 27; g.rinshan = false;
    const before = g.rivers[0].length;
    MJ._internal.armTurnTimer(room, 0);
    await sleep(30);
    ok(g.rivers[0].length === before, '딜레이 전에는 버리지 않음');
    await sleep(MJ.CFG.riichiAutoMs + 60);
    ok(g.rivers[0].length === before + 1 && g.rivers[0][before].tile === 27,
       '리치 중 화료 불가 → 딜레이 후 자동 쯔모기리', JSON.stringify(g.rivers[0]));
    cleanup(room);
  }
  {
    // 쯔모 가능하면 자동으로 버리지 않는다 (플레이어가 결정)
    const room = mkFrozenRoom();
    const g = room.game;
    room.seats[0].connected = true;
    g.hands[0] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 21, 22, 20];   // 3s 쯔모 = 화료(핑후/탕야오급)
    g.riichiDeclared[0] = true;
    g.turn = 0; g.phase = 'turn'; g.drawnTile = 20; g.rinshan = false;
    const before = g.rivers[0].length;
    MJ._internal.armTurnTimer(room, 0);
    await sleep(MJ.CFG.riichiAutoMs + 80);
    ok(g.rivers[0].length === before, '쯔모 가능 시 자동 타패 안 함 (은행 타이머로 전환)');
    cleanup(room);
  }

  console.log('\n[시간 은행 차감]');
  {
    const room = mkFrozenRoom();
    const g = room.game;
    room.seats[0].connected = true;
    ok(g.timeBank.every((b) => b === MJ.CFG.bankMs), '은행 초기화');
    g.turn = 0; g.phase = 'turn';
    g.drawnTile = g.hands[0][g.hands[0].length - 1];
    g.turnStartedAt = Date.now() - (MJ.CFG.graceMs + 150);   // 유예 150ms 초과
    MJ._internal.chargeTime(room, 0);
    ok(g.timeBank[0] <= 500 - 140 && g.timeBank[0] >= 500 - 260,
       `유예 초과분만 차감 (500 → ${g.timeBank[0]})`);
    // 유예 내 행동은 무료
    g.timeBank[1] = 500;
    g.turnStartedAt = Date.now() - 40;
    MJ._internal.chargeTime(room, 1);
    ok(g.timeBank[1] === 500, '유예(100ms) 내 행동은 무료');
    cleanup(room);
  }

  console.log('\n[무효 행동 시간 은행 보호]');
  {
    const room = mkFrozenRoom();
    const g = room.game;
    room.seats[0].connected = true;
    g.hands[0] = [0, 0, 0, 0, 1, 3, 5, 7, 9, 11, 18, 22, 27, 33];
    g.turn = 0; g.phase = 'turn'; g.drawnTile = 33;
    g.timeBank[0] = 500;
    g.turnStartedAt = Date.now() - (MJ.CFG.graceMs + 150);
    const bankBefore = g.timeBank[0];
    const turnStartBefore = g.turnStartedAt;
    ok(MJ._internal.doDiscard(room, 0, 33, true) === false, '텐파이가 아닌 리치 선언 거부');
    ok(g.timeBank[0] === bankBefore && g.turnStartedAt === turnStartBefore,
       '거부된 리치 선언은 시간 은행 유지');
    ok(MJ._internal.doTsumo(room, 0) === false, '화료형이 아닌 쯔모 선언 거부');
    ok(g.timeBank[0] === bankBefore && g.turnStartedAt === turnStartBefore,
       '거부된 쯔모 선언은 시간 은행 유지');
    ok(MJ._internal.doDiscard(room, 0, 33, false) === true, '유효한 타패 허용');
    ok(g.timeBank[0] < bankBefore, '유효한 타패만 시간 은행 차감');
    cleanup(room);
  }

  console.log('\n[은행 소진 → 자동 쯔모기리]');
  {
    const room = mkFrozenRoom();
    const g = room.game;
    room.seats[0].connected = true;
    g.timeBank[0] = 80;
    g.turn = 0; g.phase = 'turn';
    g.drawnTile = g.hands[0][g.hands[0].length - 1];
    const before = g.rivers[0].length;
    MJ._internal.armTurnTimer(room, 0);   // grace 100 + bank 80 = 180ms 후 자동
    await sleep(100);
    ok(g.rivers[0].length === before, '유예+은행 내에는 대기');
    await sleep(160);
    ok(g.rivers[0].length === before + 1, '소진 시 자동 쯔모기리', JSON.stringify(g.rivers.map((r) => r.length)));
    ok(g.timeBank[0] === 0, '은행 0 고정');
    cleanup(room);
  }

  console.log(`\n결과: ${pass}/${pass + fail} 통과`);
  process.exit(fail ? 1 : 0);
})();
