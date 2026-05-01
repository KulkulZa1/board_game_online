// server/handlers/othello.js — 오셀로 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

function initRoom(base) {
  base.board = Array(8).fill(null).map(() => Array(8).fill(null));
  base.board[3][3] = 'white'; base.board[3][4] = 'black';
  base.board[4][3] = 'black'; base.board[4][4] = 'white';
  base.currentTurn = 'black'; // 흑 선공
  base.lastMove    = null;
  base.consecutivePasses = 0;
}

function resetRoom(room) {
  room.board = Array(8).fill(null).map(() => Array(8).fill(null));
  room.board[3][3] = 'white'; room.board[3][4] = 'black';
  room.board[4][3] = 'black'; room.board[4][4] = 'white';
  room.currentTurn = 'black';
  room.lastMove    = null;
  room.consecutivePasses = 0;
}

function handleMove(socket, room, role, { row, col }) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;
  if (row < 0 || row > 7 || col < 0 || col > 7) return;

  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;

  const flipped = getFlippedCells(room.board, row, col, yourColor);
  if (flipped.length === 0) {
    socket.emit('game:move:invalid', { reason: '유효하지 않은 수입니다.' });
    return;
  }

  room.board[row][col] = yourColor;
  for (const { r, c } of flipped) {
    room.board[r][c] = yourColor;
  }
  room.lastMove = { row, col };

  const moveRecord = { row, col, color: yourColor, flipped, moveNum: room.moves.length + 1, boardRows: 8, timestamp: Date.now() };
  room.moves.push(moveRecord);

  const oppColor = yourColor === 'white' ? 'black' : 'white';
  const oppValid = computeValidMoves(room.board, oppColor);
  const myValid  = computeValidMoves(room.board, yourColor);

  let nextColor, pass = false;
  if (oppValid.length > 0) {
    nextColor = oppColor;
    room.consecutivePasses = 0;
  } else if (myValid.length > 0) {
    nextColor = yourColor;
    room.consecutivePasses++;
    pass = true;
  } else {
    // 양쪽 다 수 없음 → 종료
    room.consecutivePasses++;
    const counts = countStones(room.board);
    let winner;
    if (counts.white > counts.black) winner = 'white';
    else if (counts.black > counts.white) winner = 'black';
    else winner = 'draw';

    room.currentTurn        = null;
    room.timers.activeColor = null;

    state.io.to(room.id).emit('game:move:made', {
      move:       moveRecord,
      board:      room.board,
      validMoves: [],
      timers:     { white: room.timers.white, black: room.timers.black, activeColor: null },
      turn:       null,
      scores:     counts,
      pass:       false
    });

    const { endGame } = require('../endgame');
    endGame(room, winner, 'board-full', { scores: counts });
    return;
  }

  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  const nextValid = nextColor === oppColor ? oppValid : myValid;

  state.io.to(room.id).emit('game:move:made', {
    move:       moveRecord,
    board:      room.board,
    validMoves: nextValid,
    timers:     { white: room.timers.white, black: room.timers.black, activeColor: nextColor },
    turn:       nextColor,
    scores:     countStones(room.board),
    pass
  });
}

function getFlippedCells(board, row, col, color) {
  if (board[row][col] !== null) return [];
  const opp = color === 'white' ? 'black' : 'white';
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const result = [];
  for (const [dr, dc] of dirs) {
    const line = [];
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === opp) {
      line.push({ r, c });
      r += dr; c += dc;
    }
    if (line.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === color) {
      result.push(...line);
    }
  }
  return result;
}

function computeValidMoves(board, color) {
  const moves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === null && getFlippedCells(board, row, col, color).length > 0) {
        moves.push({ row, col });
      }
    }
  }
  return moves;
}

function countStones(board) {
  let white = 0, black = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 'white') white++;
      else if (cell === 'black') black++;
    }
  }
  return { white, black };
}

module.exports = { initRoom, resetRoom, handleMove };
