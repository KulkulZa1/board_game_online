'use strict';

const state = require('../server/state');
const { createRoomState } = require('../server/rooms');
const { approveSpectator } = require('../server/endgame');
const backgammon = require('../server/handlers/backgammon');
const texasholdem = require('../server/handlers/texasholdem');
const dotsboxes = require('../server/handlers/dotsboxes');

let passed = 0;
let failed = 0;

function ok(condition, label, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

function createTestRoom(gameType, hostColor = 'white', boardSize = null) {
  const room = createRoomState(
    hostColor,
    { type: 'timed', minutes: 10 },
    `${gameType}-host-token`,
    gameType,
    boardSize,
  );
  room.id = `${gameType}-test-room`;
  room.status = 'active';
  room.players.host = { socketId: `${gameType}-host`, connected: true };
  room.players.guest = { socketId: `${gameType}-guest`, connected: true };
  room.timers.activeColor = hostColor;
  room.timers.lastTickAt = Date.now();
  return room;
}

function installIoCapture() {
  const events = [];
  state.io = {
    to(target) {
      return {
        emit(event, payload) {
          events.push({ target, event, payload });
        },
      };
    },
  };
  return events;
}

function socketCapture() {
  const events = [];
  return {
    events,
    socket: {
      emit(event, payload) {
        events.push({ event, payload });
      },
    },
  };
}

function installSpectatorCapture(socketId) {
  const events = [];
  const spectatorSocket = {
    emit(event, payload) {
      events.push({ target: socketId, event, payload });
    },
  };
  state.io = {
    sockets: { sockets: new Map([[socketId, spectatorSocket]]) },
    to(target) {
      return {
        emit(event, payload) {
          events.push({ target, event, payload });
        },
      };
    },
  };
  return events;
}

function withoutScheduledCallbacks(run) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    return run();
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

console.log('\n[Backgammon server rules]');
{
  installIoCapture();
  const room = createTestRoom('backgammon');
  const points = new Array(25).fill(null).map(() => ({ color: null, count: 0 }));
  points[2] = { color: 'white', count: 1 };
  room.board = {
    points,
    bar: { white: 0, black: 0 },
    borneOff: { white: 13, black: 0 },
  };
  room.currentTurn = 'white';
  room.phase = 'moving';
  room.dice = [1, 2];
  room.remainingMoves = [1, 2];

  const firstMoves = backgammon.getValidMoves(room.board, 'white', room.remainingMoves);
  ok(
    firstMoves.some((move) => move.from === 2 && move.to === 1 && move.dieUsed === 1),
    'offers the first move of the two-die bearing-off sequence',
  );
  ok(
    !firstMoves.some((move) => move.from === 2 && move.to === 'off' && move.dieUsed === 2),
    'rejects a first move that wastes a playable die',
    JSON.stringify(firstMoves),
  );

  const captured = socketCapture();
  backgammon.handleMove(captured.socket, room, 'host', {
    type: 'move',
    from: 2,
    to: 'off',
    dieUsed: 2,
  });
  ok(room.moves.length === 0, 'does not apply the illegal shortened sequence');
  ok(captured.events.some((entry) => entry.event === 'game:move:invalid'), 'reports the invalid move');
}

{
  const room = createTestRoom('backgammon');
  const points = new Array(25).fill(null).map(() => ({ color: null, count: 0 }));
  points[1] = { color: 'white', count: 1 };
  room.board = {
    points,
    bar: { white: 0, black: 0 },
    borneOff: { white: 14, black: 0 },
  };

  const firstMoves = backgammon.getValidMoves(room.board, 'white', [1, 2]);
  ok(
    firstMoves.length === 1 && firstMoves[0].dieUsed === 2,
    'requires the higher die when only one die can be played',
    JSON.stringify(firstMoves),
  );
}

console.log('\n[Texas Holdem role and all-in rules]');
{
  const events = installIoCapture();
  const room = createTestRoom('texasholdem', 'black');
  texasholdem.startTHRound(room);
  ok(room.timers.activeColor === 'black', 'maps the host betting timer to the selected black color');
  let invalidPayloadThrew = false;
  try {
    texasholdem.handleMove(socketCapture().socket, room, 'host', null);
  } catch {
    invalidPayloadThrew = true;
  }
  ok(!invalidPayloadThrew, 'ignores a null betting payload without throwing');

  const captured = socketCapture();
  withoutScheduledCallbacks(() => {
    texasholdem.handleMove(captured.socket, room, 'host', { action: 'fold' });
  });
  const showdown = events.find((entry) => entry.event === 'texasholdem:showdown');
  ok(showdown && showdown.payload.winner === 'white', 'awards a black-host fold to the white guest');
  ok(showdown && showdown.payload.timers && showdown.payload.timers.activeColor === null, 'broadcasts a stopped clock with the fold result');
  ok(events.some((entry) => entry.event === 'timer:tick' && entry.payload.activeColor === null), 'pushes the stopped clock through the shared timer channel');
  ok(room.timers.activeColor === null, 'stops the game clock while the fold result is visible');
  ok(room.betTurn === null, 'clears the betting turn after a fold');
}

{
  const events = installIoCapture();
  const room = createTestRoom('texasholdem', 'black');
  texasholdem.startTHRound(room);
  room.phase = 'preflop';
  room.betTurn = 'host';
  room.chips = { host: 5, guest: 980 };
  room.bets = { host: 0, guest: 20 };
  room.roundBet = 20;
  room.pot = 20;
  room.acted = { host: false, guest: true };
  room.hands = {
    host: [{ rank: 14, suit: 's' }, { rank: 14, suit: 'h' }],
    guest: [{ rank: 2, suit: 's' }, { rank: 3, suit: 'h' }],
  };
  room.deck = [
    { rank: 13, suit: 'd' }, { rank: 11, suit: 'c' }, { rank: 9, suit: 'h' },
    { rank: 7, suit: 'd' }, { rank: 4, suit: 'c' },
  ];
  const totalChips = room.chips.host + room.chips.guest + room.pot;

  withoutScheduledCallbacks(() => {
    texasholdem.handleMove(socketCapture().socket, room, 'host', { action: 'call' });
  });

  ok(room.phase === 'showdown', 'runs out the board after a short all-in call', room.phase);
  ok(room.betTurn === null, 'clears the betting turn at showdown');
  ok(room.community.length === 5, 'deals all five community cards for the all-in showdown');
  ok(room.pot === 0, 'settles the all-in pot at showdown');
  ok(room.bets.host === room.bets.guest, 'returns the unmatched portion before showdown');
  ok(room.chips.host + room.chips.guest === totalChips, 'preserves chips while returning unmatched bets');
  const showdown = events.find((entry) => entry.event === 'texasholdem:showdown');
  ok(showdown, 'broadcasts the all-in showdown');
  ok(showdown && showdown.payload.timers && showdown.payload.timers.paused === true, 'marks the all-in result clock as paused');
  ok(showdown && showdown.payload.winner === 'black', 'maps a black-host showdown win to black');
}

{
  const events = installIoCapture();
  const room = createTestRoom('texasholdem', 'white');
  room.chips = { host: 5, guest: 1000 };
  const totalChips = room.chips.host + room.chips.guest;

  withoutScheduledCallbacks(() => {
    texasholdem.startTHRound(room);
  });

  ok(room.phase === 'showdown', 'runs out immediately when the small blind is all-in');
  ok(room.community.length === 5, 'deals a complete board for a blind all-in');
  ok(room.chips.host + room.chips.guest === totalChips, 'preserves chips through blind settlement');
  ok(events.some((entry) => entry.event === 'texasholdem:showdown'), 'broadcasts the blind all-in showdown');
}

console.log('\n[Texas Holdem spectator privacy]');
{
  const room = createTestRoom('texasholdem', 'white');
  room.phase = 'preflop';
  room.hands = {
    host: [{ rank: 14, suit: 's' }, { rank: 13, suit: 's' }],
    guest: [{ rank: 2, suit: 'h' }, { rank: 3, suit: 'h' }],
  };
  const spectatorId = 'texasholdem-spectator';
  room.spectators.set(spectatorId, { nickname: 'Observer', approved: false });
  const events = installSpectatorCapture(spectatorId);

  approveSpectator(room, spectatorId);
  const activeApproval = events.find((entry) => entry.event === 'spectator:approved');
  ok(activeApproval && activeApproval.payload.hands === null, 'redacts both private hands during an active betting round');

  const showdownSpectatorId = 'texasholdem-showdown-spectator';
  room.phase = 'showdown';
  room.spectators.set(showdownSpectatorId, { nickname: 'Late Observer', approved: false });
  state.io.sockets.sockets.set(showdownSpectatorId, {
    emit(event, payload) {
      events.push({ target: showdownSpectatorId, event, payload });
    },
  });
  approveSpectator(room, showdownSpectatorId);
  const showdownApproval = events.find((entry) => entry.target === showdownSpectatorId && entry.event === 'spectator:approved');
  ok(showdownApproval && showdownApproval.payload.hands === room.hands, 'reveals hands to a spectator after showdown begins');
}

console.log('\n[Texas Holdem hand evaluation]');
{
  const cards = (ranks, suit = 's') => ranks.map((rank) => ({ rank, suit }));
  const wheel = texasholdem.evaluate5(cards([14, 2, 3, 4, 5], 'mixed').map((card, index) => ({
    ...card,
    suit: ['s', 'h', 'd', 'c', 's'][index],
  })));
  const sixHigh = texasholdem.evaluate5(cards([2, 3, 4, 5, 6], 'mixed').map((card, index) => ({
    ...card,
    suit: ['s', 'h', 'd', 'c', 's'][index],
  })));
  ok(wheel.value[0] === 4 && wheel.value[1] === 5, 'recognizes an ace-low straight');
  ok(texasholdem.compareHandValues(sixHigh.value, wheel.value) > 0, 'ranks a six-high straight above a wheel');

  const best = texasholdem.evaluateBestHand([
    { rank: 14, suit: 's' }, { rank: 14, suit: 'h' },
    { rank: 14, suit: 'd' }, { rank: 13, suit: 's' },
    { rank: 13, suit: 'h' }, { rank: 2, suit: 'c' },
    { rank: 3, suit: 'c' },
  ]);
  ok(best.value[0] === 6, 'selects a full house from seven cards');
}

console.log('\n[Dots and Boxes server rules]');
{
  const events = installIoCapture();
  const room = createTestRoom('dotsboxes', 'white', 3);
  let invalidPayloadThrew = false;
  try {
    dotsboxes.handleMove(socketCapture().socket, room, 'host', null);
  } catch {
    invalidPayloadThrew = true;
  }
  ok(!invalidPayloadThrew, 'ignores a null edge payload without throwing');
  room.currentTurn = 'white';
  room.edges.hLines[0][0] = 2;
  room.edges.hLines[1][0] = 1;
  room.edges.vLines[0][0] = 2;
  room.edges.hLines[0][1] = 1;
  room.edges.hLines[1][1] = 2;
  room.edges.vLines[0][2] = 1;

  dotsboxes.handleMove(socketCapture().socket, room, 'host', {
    edge: { type: 'v', row: 0, col: 1 },
  });
  ok(room.scores.white === 2, 'awards both boxes completed by one shared edge');
  ok(room.currentTurn === 'white', 'keeps the turn after completing boxes');
  ok(room.moves.at(-1).boxesCompleted === 2, 'records the double-box completion');

  const moveCount = room.moves.length;
  dotsboxes.handleMove(socketCapture().socket, room, 'host', {
    edge: { type: 'v', row: 0, col: 1 },
  });
  ok(room.moves.length === moveCount, 'ignores an already-drawn edge without changing state');
  ok(events.some((entry) => entry.event === 'game:move:made'), 'broadcasts the accepted edge');
}

console.log(`\nResult: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
