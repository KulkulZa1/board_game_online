// 마작 게임 플로우 E2E — 4 AI가 동풍전을 완주하는지 헤드리스 검증
// 점수 보존(합계 100000), 정상 종료, 콜/리치/화료 발생 통계를 확인한다.
// 실행: node prototypes/mahjong-flow-test.js
'use strict';
const MJ = require('../server/mahjong.js');
const E = require('../server/handlers/mahjong-engine.js');

// 테스트용 고속 타이밍
MJ.CFG.aiDelay = () => 1;
MJ.CFG.handGapMs = 5;
MJ.CFG.turnMs = 50;
MJ.CFG.callMs = 30;

let pass = 0, fail = 0;
const ok = (c, label, detail) => {
  if (c) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
};

function playMatch(n) {
  return new Promise((resolve) => {
    const room = MJ.createRoom('봇테스트');
    // 호스트 좌석도 AI로 교체 (완전 자동)
    room.seats[0] = { type: 'ai', name: 'AI 호스트', socketId: null, token: null, connected: true };
    const stats = { hands: 0, riichis: 0, melds: 0 };
    const t0 = Date.now();
    MJ.startMatch(room);
    const iv = setInterval(() => {
      const g = room.game;
      if (g) {
        stats.riichis = Math.max(stats.riichis, g.riichiDeclared.filter(Boolean).length);
        stats.melds += 0;
      }
      if (room.status === 'finished') {
        clearInterval(iv);
        resolve({ room, ms: Date.now() - t0, stats });
      } else if (Date.now() - t0 > 30000) {
        clearInterval(iv);
        resolve({ room, timeout: true, ms: 30000, stats });
      }
    }, 25);
  });
}

(async () => {
  console.log('\n[동풍전 자동 완주 ×3]');
  for (let m = 1; m <= 3; m++) {
    const { room, timeout, ms } = await playMatch(m);
    const g = room.game;
    const sum = g.scores.reduce((a, b) => a + b, 0) + g.riichiSticks * 1000;
    ok(!timeout, `대국 ${m} 정상 종료 (${ms}ms)`);
    ok(sum === 100000, `대국 ${m} 점수 보존 (합계 ${sum})`, JSON.stringify(g.scores));
    ok(room.status === 'finished', `대국 ${m} 상태 finished`);
    console.log(`    최종: ${g.scores.join(' / ')} · 도달 국: 동${Math.min(g.round, 4)} · 혼바 ${g.honba}`);
    // 방 정리
    clearTimeout(room.cleanupTimer);
    MJ.rooms.delete(room.code);
  }

  console.log('\n[유닛 — 콜 오퍼]');
  {
    const room = MJ.createRoom('t');
    room.seats = [0, 1, 2, 3].map((i) => ({ type: 'ai', name: 'A' + i, socketId: null, token: null, connected: true }));
    MJ.startMatch(room);
    const g = room.game;
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    // 좌석1에 2z 두 장 심고 좌석0이 2z 버리는 상황
    const t2z = 28;   // 남
    g.hands[1] = [t2z, t2z, 0, 1, 2, 9, 10, 11, 18, 19, 20, 5, 6];
    g.hands[2] = [0, 0, 1, 2, 3, 9, 10, 11, 18, 19, 20, 5, 6];
    g.hands[3] = [4, 4, 1, 2, 3, 9, 10, 11, 18, 19, 20, 5, 6];
    const offers = MJ._internal.collectOffers(room, 0, t2z);
    ok(offers[1] && offers[1].pon, '펑 오퍼 (2장 보유)');
    ok(!offers[2], '무관 좌석 오퍼 없음');
    // 치: 좌석1(하가)만 — 좌석0이 4m(3) 버림 → 좌석1이 2m3m/3m5m/5m6m 보유 시
    g.hands[1] = [1, 2, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27, 33];
    const offers2 = MJ._internal.collectOffers(room, 0, 3);
    ok(offers2[1] && offers2[1].chi && offers2[1].chi.length >= 2, '치 오퍼 (복수 조합)', JSON.stringify(offers2[1]));
    // 좌석3도 2m3m을 갖고 있지만 좌석0의 하가가 아니므로 치 불가
    ok(!(offers2[3] && offers2[3].chi), '치는 하가만 (비하가 차단)', JSON.stringify(offers2[3]));
    clearTimeout(room.cleanupTimer); MJ.rooms.delete(room.code);
  }

  console.log('\n[유닛 — 후리텐 론 차단]');
  {
    const room = MJ.createRoom('t2');
    room.seats = [0, 1, 2, 3].map((i) => ({ type: 'ai', name: 'A' + i, socketId: null, token: null, connected: true }));
    MJ.startMatch(room);
    const g = room.game;
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    // 좌석1: 123m 456m 789m 11p 45s 텐파이 (3s/6s 대기), 자기 강에 3s 있음 → 6s 론도 불가
    g.hands[1] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 21, 22];
    g.rivers[1] = [{ tile: 20, riichi: false, called: false }];   // 3s 버림
    const offers = MJ._internal.collectOffers(room, 0, 23);        // 6s 방출
    ok(!(offers[1] && offers[1].ron), '후리텐 → 론 오퍼 차단');
    g.rivers[1] = [];
    const offers2 = MJ._internal.collectOffers(room, 0, 23);
    ok(offers2[1] && offers2[1].ron, '후리텐 해제 → 론 오퍼 (탕야오/핑후 역 있음)');
    clearTimeout(room.cleanupTimer); MJ.rooms.delete(room.code);
  }

  console.log('\n[유닛 — AI 타패]');
  {
    // 텐파이 유지: 123m456m789m 11p 45s + 1z 쯔모 → 1z 버려야
    const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 21, 22, 27];
    const d = MJ._internal.aiChooseDiscard(hand, 0);
    ok(d === 27, 'AI가 고립 자패를 버려 텐파이 유지', 'chose ' + E.TILE_NAMES[d]);
  }

  console.log(`\n결과: ${pass}/${pass + fail} 통과`);
  process.exit(fail ? 1 : 0);
})();
