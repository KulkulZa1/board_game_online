// server/rooms.js — 방 상태 생성 및 리셋
const { v4: uuidv4 } = require('uuid');
const state = require('./state');
const { getTimerMs, log } = require('./utils');
const handlers = require('./handlers');

function createRoomState(hostColor, timeControl, hostToken, gameType, boardSize, indianPokerOpts) {
  const minutes = timeControl.minutes;
  const ms = minutes ? minutes * 60 * 1000 : null;
  const base = {
    id: null,
    hostToken,
    guestToken: null,
    hostColor,
    guestColor: hostColor === 'white' ? 'black' : 'white',
    timeControl,
    gameType,
    boardSize: boardSize || null,
    status: 'waiting',
    moves: [],
    timers: {
      white: ms,
      black: ms,
      activeColor: null,
      lastTickAt: null
    },
    players: {
      host:  { socketId: null, connected: false },
      guest: { socketId: null, connected: false }
    },
    chat: [],
    winner: null,
    rematchRequest: { host: false, guest: false },
    spectators: new Map(), // socketId → { nickname, approved }
    cleanupTimer: null
  };

  const handler = handlers.get(gameType);
  if (handler && handler.initRoom) {
    handler.initRoom(base, { boardSize, ...(indianPokerOpts || {}) });
  }

  return base;
}

function resetForRematch(room) {
  const tmp       = room.hostColor;
  room.hostColor  = room.guestColor;
  room.guestColor = tmp;

  room.moves  = [];
  room.winner = null;
  room.rematchRequest = { host: false, guest: false };

  const handler = handlers.get(room.gameType);
  if (handler && handler.resetRoom) {
    handler.resetRoom(room);
  }

  clearTimeout(room.cleanupTimer);
  const { startGame } = require('./endgame');
  startGame(room);
}

module.exports = { createRoomState, resetForRematch };
