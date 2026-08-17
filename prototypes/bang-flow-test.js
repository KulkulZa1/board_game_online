// BANG! 플로우 검증 — 4/5/7인 AI 대국 완주 + 핵심 규칙 유닛
// 실행: node prototypes/bang-flow-test.js
'use strict';
const BG = require('../server/bang.js');
const E = require('../server/handlers/bang-engine.js');

BG.CFG.aiDelay = () => 1;
BG.CFG.aiReactDelay = () => 1;
BG.CFG.graceMs = 30;
BG.CFG.bankMs = 60;
BG.CFG.reactMs = 40;
BG.CFG.discAutoMs = 30;

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function allAiRoom(n) {
  const room = BG.createRoom('t', n);
  for (let i = 0; i < n; i++) {
    room.seats[i] = { type: 'ai', name: 'AI' + i, socketId: null, token: null, connected: true };
  }
  return room;
}
function cleanup(room) {
  clearTimeout(room.cleanupTimer); clearTimeout(room.actionTimer); clearTimeout(room.aiTimer);
  BG.rooms.delete(room.code);
}

function playMatch(n) {
  return new Promise((resolve) => {
    const room = allAiRoom(n);
    const t0 = Date.now();
    let lastSignature = '';
    let lastProgressAt = t0;
    BG.startMatch(room);
    const iv = setInterval(() => {
      const g = room.game;
      const signature = JSON.stringify([
        g.turn,
        g.phase,
        g.queue[0] ? [g.queue[0].type, g.queue[0].actor] : null,
        g.players.map((p) => [p.hp, p.hand.length, p.equip.length]),
        g.deck.length,
        g.discard.length,
        g.log[g.log.length - 1] || '',
      ]);
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastProgressAt = Date.now();
      }
      if (room.status === 'finished') { clearInterval(iv); resolve({ room, ms: Date.now() - t0 }); }
      else if (Date.now() - t0 > 40000) {
        clearInterval(iv);
        resolve({
          room,
          timeout: true,
          snapshot: {
            stableForMs: Date.now() - lastProgressAt,
            turn: g.turn,
            phase: g.phase,
            queue: g.queue.map((item) => ({ type: item.type, actor: item.actor })),
            players: g.players.map((p) => ({ seat: p.seat, role: p.role, hp: p.hp, hand: p.hand.length })),
            recentLog: g.log.slice(-5),
          },
        });
      }
    }, 20);
  });
}

(async () => {
  console.log('\n[AI 대국 완주 — 4/5/7인]');
  for (const n of [4, 5, 7]) {
    const { room, timeout, ms, snapshot } = await playMatch(n);
    const g = room.game;
    ok(!timeout, `${n}인 대국 정상 종료 (${ms}ms)`, timeout ? JSON.stringify(snapshot) : '');
    ok(['sheriff', 'outlaw', 'renegade'].includes(g.winners), `${n}인 승자 진영 유효: ${g.winners}`);
    // 승리 조건 정합
    const sheriffAlive = g.players.some((p) => p.role === 'sheriff' && p.hp > 0);
    if (g.winners === 'sheriff') ok(sheriffAlive, `${n}인 보안관 승리 시 보안관 생존`);
    if (g.winners === 'outlaw') ok(!sheriffAlive, `${n}인 무법자 승리 시 보안관 사망`);
    if (g.winners === 'renegade') {
      const alive = g.players.filter((p) => p.hp > 0);
      ok(alive.length === 1 && alive[0].role === 'renegade', `${n}인 배신자 승리 = 최후 1인`);
    }
    ok(g.players.every((p) => p.hp >= 0 && p.hp <= p.maxHp), `${n}인 HP 범위 정상`);
    cleanup(room);
  }

  console.log('\n[거리/사거리]');
  {
    const room = allAiRoom(5);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    g.queue = [];
    // 5인 원형: 0에서 2까지 기본 거리 2
    for (const p of g.players) { p.equip = []; p.character = 'x'; }
    ok(E.distance(g.players, 0, 1) === 1 && E.distance(g.players, 0, 2) === 2, '원형 최단 거리');
    g.players[2].equip.push({ id: 'mustang', suit: 's', v: 5 });
    ok(E.distance(g.players, 0, 2) === 3, '무스탕 +1');
    g.players[0].equip.push({ id: 'scope', suit: 's', v: 5 });
    ok(E.distance(g.players, 0, 2) === 2, '조준경 -1');
    ok(E.weaponRange(g.players[0]) === 1, '기본 사거리 1');
    g.players[0].equip.push({ id: 'winchester', suit: 's', v: 5 });
    ok(E.weaponRange(g.players[0]) === 5, '윈체스터 사거리 5');
    cleanup(room);
  }

  console.log('\n[BANG! 응답 규칙]');
  {
    const room = allAiRoom(4);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    g.queue = [];
    const P = BG._internal;
    // 좌석0 → 좌석1 BANG!, 좌석1은 missed 1장 보유 → 회피
    for (const p of g.players) { p.character = 'x'; p.equip = []; }
    g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 0;
    g.players[0].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    g.players[1].hand = [{ id: 'missed', suit: 'c', v: 5 }];
    const hpBefore = g.players[1].hp;
    P.playCard(room, 0, 0, 1);
    clearTimeout(room.aiTimer);   // AI 자동응답 차단하고 수동 검증
    ok(g.queue.length === 1 && g.queue[0].type === 'bang' && g.queue[0].needMissed === 1, 'BANG! 리액션 큐 생성');
    P.resolveReact(room, 1, { cards: [0] });
    ok(g.players[1].hp === hpBefore && g.players[1].hand.length === 0, 'Missed!로 회피');
    // 회피 불가 시 피해
    g.queue = []; g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 0;
    g.players[0].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    P.playCard(room, 0, 0, 1);
    clearTimeout(room.aiTimer);
    P.resolveReact(room, 1, { pass: true });
    ok(g.players[1].hp === hpBefore - 1, '응답 실패 → 피해 1');
    // 턴당 1장 제한
    g.queue = []; g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 1;
    g.players[0].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    ok(P.playCard(room, 0, 0, 1) === false, 'BANG! 턴당 1장 제한');
    cleanup(room);
  }

  console.log('\n[다이너마이트 치명상 턴 재개]');
  {
    const room = allAiRoom(4);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    const P = BG._internal;
    // 시작 좌석이 키트/제시/페드로면 드로우 선택이 큐에 남아 있다 — 시나리오 전제를 맞춘다
    g.queue = [];
    const seat = g.turn;
    const p = g.players[seat];
    room.seats[seat].type = 'human';
    room.seats[seat].connected = true;
    p.character = 'x';
    p.hp = 3;
    p.maxHp = 4;
    p.hand = [{ id: 'beer', suit: 'h', v: 6 }];
    p.dynamite = { id: 'dynamite', suit: 's', v: 2 };
    g.deck.unshift(
      { id: 'bang', suit: 's', v: 5 },
      { id: 'missed', suit: 'c', v: 4 },
      { id: 'bang', suit: 'd', v: 8 },
    );

    P.beginTurn(room, seat);
    P.resolveReact(room, seat, { cards: [0] });
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);

    ok(p.hp === 1, '다이너마이트 치명상에서 맥주로 생존');
    ok(g.queue.length === 0, '치명상 응답 큐 정상 종료');
    ok(g.turn === seat && p.hand.length === 2, '생존 후 원래 턴의 카드 드로우 재개');
    cleanup(room);
  }

  console.log('\n[무효 행동 시간 은행 보호]');
  {
    const room = BG.createRoom('P0', 4);
    room.seats[0].connected = true;
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    const P = BG._internal;
    g.queue = [];
    g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 0;
    for (const p of g.players) { p.character = 'x'; p.equip = []; }
    g.players[0].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    g.timeBank[0] = 1000;
    g.turnStartedAt = Date.now() - (BG.CFG.graceMs + 50);
    const bankBefore = g.timeBank[0];
    const turnStartBefore = g.turnStartedAt;
    ok(P.playCard(room, 0, 0, 0) === false, '자기 자신을 향한 BANG! 거부');
    ok(g.timeBank[0] === bankBefore && g.turnStartedAt === turnStartBefore,
       '거부된 행동은 시간 은행과 기준 시각을 유지');
    ok(P.playCard(room, 0, 0, 1) === true, '유효한 BANG! 허용');
    ok(g.timeBank[0] < bankBefore && g.turnStartedAt > turnStartBefore,
       '유효한 행동만 시간 은행 차감');
    cleanup(room);
  }

  console.log('\n[슬랩 더 킬러 / 캘러미티]');
  {
    const room = allAiRoom(4);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    const P = BG._internal;
    g.queue = [];
    for (const p of g.players) { p.character = 'x'; p.equip = []; }
    g.players[0].character = 'slab';
    g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 0;
    g.players[0].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    g.players[1].hand = [{ id: 'missed', suit: 'c', v: 5 }];
    const hp1 = g.players[1].hp;
    P.playCard(room, 0, 0, 1);
    clearTimeout(room.aiTimer);
    ok(g.queue[0] && g.queue[0].needMissed === 2, '슬랩의 BANG!은 Missed! 2장 요구');
    P.resolveReact(room, 1, { cards: [0] });   // 1장뿐 → 명중
    ok(g.players[1].hp === hp1 - 1, 'Missed! 1장으로는 부족');
    // 캘러미티: bang을 missed로 사용
    g.queue = []; g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 0;
    g.players[0].character = 'x';
    g.players[1].character = 'calamity';
    g.players[0].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    g.players[1].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    const hp2 = g.players[1].hp;
    P.playCard(room, 0, 0, 1);
    clearTimeout(room.aiTimer);
    P.resolveReact(room, 1, { cards: [0] });
    ok(g.players[1].hp === hp2, '캘러미티 — BANG!을 Missed!로 사용');
    cleanup(room);
  }

  console.log('\n[치명상 맥주 회생 / 처치 보상]');
  {
    const room = allAiRoom(5);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    const P = BG._internal;
    g.queue = [];
    for (const p of g.players) { p.character = 'x'; p.equip = []; }
    g.players[1].hp = 1;
    g.players[1].hand = [{ id: 'beer', suit: 'h', v: 5 }];
    P.applyDamage(room, 1, 1, 0);
    clearTimeout(room.aiTimer);
    ok(g.queue[0] && g.queue[0].type === 'lethal', '치명상 → 맥주 회생 창');
    P.resolveReact(room, 1, { cards: [0] });
    ok(g.players[1].hp === 1, '맥주로 HP 1 회생');
    // 무법자 처치 보상 3장
    const outlaw = g.players.find((p) => p.role === 'outlaw' && p.hp > 0);
    const killer = g.players.find((p) => p.hp > 0 && p !== outlaw && p.role !== 'outlaw');
    outlaw.hp = 1; outlaw.hand = [];
    const handBefore = killer.hand.length;
    g.queue = [];
    P.applyDamage(room, outlaw.seat, 1, killer.seat);
    ok(outlaw.hp === 0, '무법자 사망');
    ok(killer.hand.length === handBefore + 3, '처치 보상 3장 드로우', `${handBefore} → ${killer.hand.length}`);
    cleanup(room);
  }

  console.log('\n[덱 순환]');
  {
    const room = allAiRoom(4);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    g.queue = [];
    g.discard = g.deck.splice(0, g.deck.length - 1).concat(g.discard);   // 산 1장만 남김
    const total = g.deck.length + g.discard.length;
    for (let i = 0; i < 5; i++) {
      if (!g.deck.length) E.reshuffle(g);
      g.discard.push(g.deck.shift());
    }
    ok(g.deck.length + g.discard.length === total, '리셔플 후 카드 총량 보존');
    cleanup(room);
  }

  console.log('\n[패닉!/캣 발루 — 노릴 곳 선택]');
  {
    const room = allAiRoom(4);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    const P = BG._internal;
    g.queue = [];
    for (const p of g.players) { p.equip = []; p.character = 'x'; p.jail = null; p.dynamite = null; }
    g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 0;
    room.seats[0].type = 'human'; room.seats[0].connected = true;

    // 손패도 있고 술통도 깔린 상대 → 선택지가 2개 이상이면 고를 수 있어야 한다
    g.players[1].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    g.players[1].equip = [{ id: 'barrel', suit: 'h', v: 9 }];
    g.players[0].hand = [{ id: 'panic', suit: 'd', v: 3 }];
    P.playCard(room, 0, 0, 1);
    const it = g.queue[0];
    ok(it && it.type === 'steal' && it.options.length === 2, '패닉! — 손패/장비 선택지 제시', it && it.type);
    const barrelIx = it.options.findIndex((o) => o.kind === 'equip' && o.card.id === 'barrel');
    ok(barrelIx >= 0, '깔린 술통이 선택지에 포함');
    P.resolveReact(room, 0, { pick: barrelIx });
    ok(g.players[1].equip.length === 0 && g.players[0].hand.some((c) => c.id === 'barrel'),
       '지정한 장비를 정확히 빼앗음');
    ok(g.players[1].hand.length === 1, '손패는 그대로 (지정한 곳만 영향)');

    // 캣 발루로 감옥 제거 — 규칙상 깔린 카드이므로 대상이 된다
    g.queue = [];
    g.turn = 0; g.phase = 'turn';
    g.players[2].hand = []; g.players[2].jail = { id: 'jail', suit: 's', v: 4 };
    g.players[0].hand = [{ id: 'catbalou', suit: 'c', v: 7 }];
    P.playCard(room, 0, 0, 2);
    ok(g.players[2].jail === null, '캣 발루 — 유일 선택지(감옥) 즉시 제거');
    cleanup(room);
  }

  console.log('\n[신규 캐릭터]');
  {
    ok(E.CHARACTERS.length === 16, '기본판 캐릭터 16인 전원', String(E.CHARACTERS.length));
    const ids = E.CHARACTERS.map((c) => c.id);
    ok(['jourdonnais', 'vulture', 'sid', 'kit', 'jesse', 'pedro'].every((i) => ids.includes(i)), '신규 6인 등록');

    // 주르도네 — 술통 없이도 하트 판정으로 회피
    const room = allAiRoom(4);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    const P = BG._internal;
    g.queue = [];
    for (const p of g.players) { p.equip = []; p.character = 'x'; p.jail = null; p.dynamite = null; p.hand = []; }
    g.players[1].character = 'jourdonnais';
    g.players[1].hp = 4;
    g.deck.unshift({ id: 'beer', suit: 'h', v: 9 });   // 하트 → 판정 성공
    g.turn = 0; g.phase = 'turn'; g.bangsPlayed = 0;
    g.players[0].hand = [{ id: 'bang', suit: 'c', v: 5 }];
    P.playCard(room, 0, 0, 1);
    ok(g.players[1].hp === 4 && !g.queue.length, '주르도네 — 내장 술통으로 BANG! 자동 회피');

    // 벌처 샘 — 탈락자의 카드를 전부 가져간다
    g.queue = [];
    g.players[2].character = 'vulture';
    g.players[2].hand = [];
    // 맥주를 쥐고 있으면 치명상 회생 창으로 빠지므로 제외한다
    g.players[3].hand = [{ id: 'bang', suit: 'c', v: 2 }, { id: 'missed', suit: 'd', v: 3 }];
    g.players[3].equip = [{ id: 'mustang', suit: 's', v: 8 }];
    g.players[3].hp = 1;
    P.applyDamage(room, 3, 1, 0);
    ok(g.players[2].hand.length === 3, '벌처 샘 — 탈락자의 손패+장비 3장 회수', String(g.players[2].hand.length));
    ok(g.players[3].hand.length === 0 && g.players[3].equip.length === 0, '탈락자 카드 정리');
    cleanup(room);
  }

  console.log('\n[시드 케첨 / 드로우 선택 캐릭터]');
  {
    const room = allAiRoom(4);
    BG.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    const g = room.game;
    const P = BG._internal;
    g.queue = [];
    for (const p of g.players) { p.equip = []; p.character = 'x'; p.jail = null; p.dynamite = null; }
    room.seats[0].type = 'human'; room.seats[0].connected = true;
    g.turn = 0; g.phase = 'turn';

    // 시드 케첨 — 카드 2장 버리고 체력 1 회복
    g.players[0].character = 'sid';
    g.players[0].hp = 2; g.players[0].maxHp = 4;
    g.players[0].hand = [
      { id: 'bang', suit: 'c', v: 2 }, { id: 'missed', suit: 'd', v: 3 }, { id: 'beer', suit: 'h', v: 4 },
    ];
    BG._internal.sidHeal(room, 0, [0, 1]);
    ok(g.players[0].hp === 3 && g.players[0].hand.length === 1, '시드 케첨 — 2장 버리고 체력 +1');
    BG._internal.sidHeal(room, 0, [0]);
    ok(g.players[0].hp === 3, '시드 케첨 — 카드가 부족하면 발동하지 않음');

    // 키트 칼슨 — 3장 중 1장을 산으로 되돌린다
    g.queue = [];
    g.players[1].character = 'kit';
    g.players[1].hand = [];
    g.players[1].hp = 4; g.players[1].jail = null; g.players[1].dynamite = null;
    const deckBefore = g.deck.length;
    P.beginTurn(room, 1);
    const kitItem = g.queue[0];
    ok(kitItem && kitItem.type === 'kit' && kitItem.cards.length === 3, '키트 칼슨 — 3장 공개 선택 대기');
    P.resolveReact(room, 1, { pick: 0 });
    ok(g.players[1].hand.length === 2, '키트 칼슨 — 2장 획득');
    ok(g.deck.length === deckBefore - 2, '키트 칼슨 — 1장은 산으로 복귀', `${g.deck.length} vs ${deckBefore - 2}`);

    // 제시 존스 — 첫 장을 상대 손에서
    g.queue = [];
    g.players[2].character = 'jesse';
    g.players[2].hand = []; g.players[2].hp = 4; g.players[2].jail = null; g.players[2].dynamite = null;
    g.players[3].hand = [{ id: 'wellsfargo', suit: 'd', v: 6 }];
    P.beginTurn(room, 2);
    const jItem = g.queue[0];
    ok(jItem && jItem.type === 'jesse', '제시 존스 — 드로우 출처 선택 대기');
    const pIx = jItem.options.findIndex((o) => o.kind === 'player' && o.seat === 3);
    P.resolveReact(room, 2, { pick: pIx });
    ok(g.players[3].hand.length === 0 && g.players[2].hand.some((c) => c.id === 'wellsfargo'),
       '제시 존스 — 상대 손에서 1장 + 산에서 1장');
    ok(g.players[2].hand.length === 2, '제시 존스 — 총 2장 드로우');

    // 페드로 라미레즈 — 첫 장을 버림패에서
    g.queue = [];
    g.players[0].character = 'pedro';
    g.players[0].hand = []; g.players[0].hp = 4; g.players[0].jail = null; g.players[0].dynamite = null;
    g.discard.push({ id: 'gatling', suit: 'h', v: 10 });
    P.beginTurn(room, 0);
    const pItem = g.queue[0];
    ok(pItem && pItem.type === 'pedro', '페드로 — 버림패/산 선택 대기');
    const dIx = pItem.options.findIndex((o) => o.kind === 'discard');
    P.resolveReact(room, 0, { pick: dIx });
    ok(g.players[0].hand.some((c) => c.id === 'gatling'), '페드로 — 버림패 맨 위 카드 획득');
    ok(g.players[0].hand.length === 2, '페드로 — 총 2장 드로우');
    cleanup(room);
  }

  console.log(`\n결과: ${pass}/${pass + fail} 통과`);
  process.exit(fail ? 1 : 0);
})();
