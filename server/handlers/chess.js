// server/handlers/chess.js — 체스 핸들러
const { Chess } = require('chess.js');
const state = require('../state');
const { getRoleColor } = require('../utils');

function initRoom(base) {
  base.chess = new Chess();
  base.fen   = new Chess().fen();
  base.pgn   = '';
}

function resetRoom(room) {
  room.chess = new Chess();
  room.fen   = room.chess.fen();
  room.pgn   = '';
}

function handleMove(socket, room, role, { from, to, promotion }) {
  if (!room.chess) return;

  const yourColor = getRoleColor(room, role);
  if (room.chess.turn() !== yourColor[0]) return;

  if (typeof from !== 'string' || typeof to !== 'string') return;
  if (promotion !== undefined && promotion !== null && !['q','r','b','n'].includes(promotion)) return;

  let move;
  try {
    move = room.chess.move({ from, to, promotion: promotion || undefined });
  } catch (e) { move = null; }

  if (!move) {
    socket.emit('game:move:invalid', { reason: '유효하지 않은 수입니다.' });
    return;
  }

  room.fen = room.chess.fen();
  room.pgn = room.chess.pgn();

  const moveRecord = {
    san:       move.san,
    from:      move.from,
    to:        move.to,
    fen:       room.fen,
    captured:  move.captured || null,
    timestamp: Date.now()
  };
  room.moves.push(moveRecord);

  const nextColor = yourColor === 'white' ? 'black' : 'white';
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  state.io.to(room.id).emit('game:move:made', {
    move:   moveRecord,
    fen:    room.fen,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor
    },
    turn: nextColor
  });

  // endGame은 순환참조 방지를 위해 지연 require
  const { endGame } = require('../endgame');

  if (room.chess.in_checkmate()) {
    endGame(room, yourColor, 'checkmate');
  } else if (room.chess.in_draw()) {
    let reason = 'draw';
    if (room.chess.in_stalemate())                 reason = 'stalemate';
    else if (room.chess.in_threefold_repetition()) reason = 'repetition';
    else if (room.chess.insufficient_material())   reason = 'insufficient';
    endGame(room, 'draw', reason);
  }
}

module.exports = { initRoom, resetRoom, handleMove };
