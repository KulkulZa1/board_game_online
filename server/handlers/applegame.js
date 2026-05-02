// server/handlers/applegame.js — 사과 게임 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

function generateAppleBoard() {
  const ROWS = 10, COLS = 17;
  const board = [];
  let total = 0;
  for (let r = 0; r < ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < COLS; c++) {
      const v = Math.floor(Math.random() * 9) + 1;
      board[r][c] = v;
      total += v;
    }
  }
  const rem = total % 10;
  if (rem !== 0) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cur = board[r][c];
        if (cur - rem >= 1)        { board[r][c] -= rem;        return board; }
        if (cur + (10 - rem) <= 9) { board[r][c] += (10 - rem); return board; }
      }
    }
    let r2 = rem;
    for (let r = 0; r < ROWS && r2 > 0; r++)
      for (let c = 0; c < COLS && r2 > 0; c++) {
        const d = Math.min(r2, board[r][c] - 1);
        if (d > 0) { board[r][c] -= d; r2 -= d; }
      }
  }
  return board;
}

function appleGameHasAnyMove(board) {
  const ROWS = board.length, COLS = board[0].length;
  for (let r1 = 0; r1 < ROWS; r1++)
    for (let c1 = 0; c1 < COLS; c1++)
      for (let r2 = r1; r2 < ROWS; r2++)
        for (let c2 = c1; c2 < COLS; c2++) {
          let sum = 0, ok = true;
          outer: for (let r = r1; r <= r2; r++)
            for (let c = c1; c <= c2; c++) {
              if (board[r][c] === null) { ok = false; break outer; }
              sum += board[r][c];
            }
          if (ok && sum === 10) return true;
        }
  return false;
}

function initRoom(base) {
  base.board       = generateAppleBoard(); // 10×17 배열, 값 1-9
  base.currentTurn = 'white';             // 백(host) 선공
  base.scores      = { white: 0, black: 0 };
  base.lastMove    = null;
}

function resetRoom(room) {
  room.board       = generateAppleBoard();
  room.currentTurn = 'white';
  room.scores      = { white: 0, black: 0 };
  room.lastMove    = null;
}

function handleMove(socket, room, role, { row1, col1, row2, col2 }) {
  if (![row1, col1, row2, col2].every(Number.isInteger)) return;
  const ROWS = 10, COLS = 17;
  const r1 = Math.min(row1, row2), r2 = Math.max(row1, row2);
  const c1 = Math.min(col1, col2), c2 = Math.max(col1, col2);
  if (r1 < 0 || r2 >= ROWS || c1 < 0 || c2 >= COLS) return;

  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;

  let sum = 0;
  const cells = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (room.board[r][c] === null) {
        socket.emit('game:move:invalid', { reason: '빈 칸이 포함되어 있습니다.' });
        return;
      }
      sum += room.board[r][c];
      cells.push({ row: r, col: c });
    }
  }
  if (sum !== 10) {
    socket.emit('game:move:invalid', { reason: '합이 10이 아닙니다.' });
    return;
  }

  for (const { row, col } of cells) room.board[row][col] = null;
  room.scores[yourColor] += cells.length;
  room.lastMove = { row1: r1, col1: c1, row2: r2, col2: c2 };

  const moveRecord = {
    row1: r1, col1: c1, row2: r2, col2: c2, color: yourColor,
    cells, count: cells.length,
    moveNum: room.moves.length + 1,
    notation: `(${r1 + 1},${c1 + 1})→(${r2 + 1},${c2 + 1}) +${cells.length}`,
    timestamp: Date.now()
  };
  room.moves.push(moveRecord);

  const nextColor = yourColor === 'white' ? 'black' : 'white';
  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  state.io.to(room.id).emit('game:move:made', {
    move:   moveRecord,
    board:  room.board,
    scores: room.scores,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: nextColor },
    turn:   nextColor
  });

  const { endGame } = require('../endgame');

  if (!appleGameHasAnyMove(room.board)) {
    const { white, black } = room.scores;
    const winner = white > black ? 'white' : black > white ? 'black' : 'draw';
    endGame(room, winner === 'draw' ? null : winner, 'no-moves', { scores: room.scores });
  }
}

module.exports = { initRoom, resetRoom, handleMove, generateAppleBoard, appleGameHasAnyMove };
