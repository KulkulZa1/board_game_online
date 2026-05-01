// server/endgame.js — 게임 종료, 시작, 관전자 승인
const state = require('./state');
const { log, getTimerMs } = require('./utils');

function endGame(room, winner, reason, extras = {}) {
  room.status = 'finished';
  room.winner = winner;
  room.timers.activeColor = null;
  room.timers.lastTickAt  = null;
  if (room.chess) room.chess = null; // free memory (chess only)

  log(`방 ${room.id.slice(0,8)} 게임 종료 — 승자: ${winner}, 이유: ${reason}`);

  state.io.to(room.id).emit('game:over', {
    winner,
    reason,
    pgn:   room.pgn  || null,
    moves: room.moves,
    ...extras
  });

  // Clean up room after 10 minutes
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    if (room.hostToken)  state.tokenMap.delete(room.hostToken);
    if (room.guestToken) state.tokenMap.delete(room.guestToken);
    state.rooms.delete(room.id);
    log(`방 ${room.id.slice(0,8)} 정리 완료 (현재 방 수: ${state.rooms.size})`);
  }, 10 * 60 * 1000);
}

function startGame(room) {
  room.status = 'active';
  const ms = getTimerMs(room.timeControl);
  room.timers.white       = ms;
  room.timers.black       = ms;
  if (room.gameType === 'omok' || room.gameType === 'othello') {
    room.timers.activeColor = 'black'; // 흑 선공
  } else if (room.gameType === 'indianpoker') {
    room.timers.activeColor = null; // 카드게임: 별도 처리
  } else if (room.gameType === 'battleship') {
    room.timers.activeColor = null; // 배틀십: 배치 단계 완료 후 타이머 시작
  } else {
    room.timers.activeColor = room.currentTurn || 'white';
  }
  room.timers.lastTickAt  = Date.now();

  log(`방 ${room.id.slice(0,8)} 게임 시작 — ${room.gameType} / ${room.hostColor} vs ${room.guestColor}`);

  state.io.to(room.id).emit('game:start', {
    gameType:    room.gameType,
    boardSize:   room.boardSize  || null,
    fen:         room.fen   || null,
    board:       room.board || null,
    currentTurn: room.currentTurn || null,
    colHeights:  room.colHeights || null,
    mustJump:    room.mustJump   || null,
    scores:      room.scores     || null,
    moves: room.moves,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor
    }
  });

  // 인디언 포커: 게임 시작 후 첫 라운드 딜
  if (room.gameType === 'indianpoker') {
    const { startIndianPokerRound } = require('./handlers/indianpoker');
    setTimeout(() => startIndianPokerRound(room), 500);
  }
}

function approveSpectator(room, spectatorSocketId) {
  const spec = room.spectators.get(spectatorSocketId);
  if (!spec) return;
  spec.approved = true;

  const specSocket = state.io.sockets.sockets.get(spectatorSocketId);
  if (!specSocket) {
    room.spectators.delete(spectatorSocketId);
    return;
  }

  const approvedCount = [...room.spectators.values()].filter(s => s.approved).length;

  specSocket.emit('spectator:approved', {
    roomId:      room.id,
    status:      room.status,
    gameType:    room.gameType,
    fen:         room.fen   || null,
    board:       room.board || null,
    currentTurn: room.currentTurn || null,
    moves:       room.moves,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor,
    },
    hostColor:   room.hostColor,
    timeControl: room.timeControl,
    chat:        room.chat,
    winner:      room.winner,
    spectatorCount: approvedCount,
    hands:       room.hands || null,          // 인디언 포커: 관전자는 두 카드 모두 공개
    chips:       room.chips || null,
    pot:         room.pot   !== undefined ? room.pot : null,
    phase:       room.phase || null,
    colHeights:  room.colHeights || null,
    mustJump:    room.mustJump   || null,
    scores:      room.scores     || null,
  });

  state.io.to(room.id).emit('spectator:joined', {
    nickname: spec.nickname,
    count:    approvedCount,
  });

  log(`관전자 승인 — ${spec.nickname} → 방 ${room.id.slice(0,8)}`);
}

module.exports = { endGame, startGame, approveSpectator };
