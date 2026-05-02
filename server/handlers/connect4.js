// server/handlers/connect4.js — 커넥트4 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

function initRoom(base, { boardSize }) {
  const rows = (boardSize && boardSize.rows) || 6;
  const cols = (boardSize && boardSize.cols) || 7;
  base.boardSize   = { rows, cols };
  base.board       = Array(rows).fill(null).map(() => Array(cols).fill(null));
  base.currentTurn = 'white'; // host(white)가 항상 red, guest(black)가 항상 yellow
  base.colHeights  = Array(cols).fill(0);
  base.lastMove    = null;
}

function resetRoom(room) {
  const rows = (room.boardSize && room.boardSize.rows) || 6;
  const cols = (room.boardSize && room.boardSize.cols) || 7;
  room.board       = Array(rows).fill(null).map(() => Array(cols).fill(null));
  room.currentTurn = 'white';
  room.colHeights  = Array(cols).fill(0);
  room.lastMove    = null;
}

function handleMove(socket, room, role, { col }) {
  const c4rows = (room.boardSize && room.boardSize.rows) || 6;
  const c4cols = (room.boardSize && room.boardSize.cols) || 7;
  if (!Number.isInteger(col) || col < 0 || col >= c4cols) return;
  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;
  if (room.colHeights[col] >= c4rows) {
    socket.emit('game:move:invalid', { reason: '이미 꽉 찬 열입니다.' });
    return;
  }

  const row = c4rows - 1 - room.colHeights[col];
  room.board[row][col] = yourColor; // 'white'=red, 'black'=yellow (display mapping in frontend)
  room.colHeights[col]++;
  room.lastMove = { row, col };

  const colLetter = String.fromCharCode(65 + col);
  const moveRecord = { col, row, color: yourColor, moveNum: room.moves.length + 1, notation: colLetter, timestamp: Date.now() };
  room.moves.push(moveRecord);

  const nextColor = yourColor === 'white' ? 'black' : 'white';
  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  state.io.to(room.id).emit('game:move:made', {
    move:  moveRecord,
    board: room.board,
    colHeights: room.colHeights,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: room.timers.activeColor },
    turn:  nextColor
  });

  const { endGame } = require('../endgame');

  if (checkConnect4Win(room.board, row, col, yourColor, c4rows, c4cols)) {
    const winCells = getConnect4WinCells(room.board, row, col, yourColor, c4rows, c4cols);
    endGame(room, yourColor, 'four-in-a-row', { winCells });
    return;
  }

  if (room.colHeights.every(h => h >= c4rows)) {
    endGame(room, 'draw', 'board-full');
  }
}

function checkConnect4Win(board, row, col, color, rows, cols) {
  const maxR = (rows || 6) - 1;
  const maxC = (cols || 7) - 1;
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let i = 1; i <= 3; i++) {
      const r = row + dr*i, c = col + dc*i;
      if (r < 0 || r > maxR || c < 0 || c > maxC || board[r][c] !== color) break;
      count++;
    }
    for (let i = 1; i <= 3; i++) {
      const r = row - dr*i, c = col - dc*i;
      if (r < 0 || r > maxR || c < 0 || c > maxC || board[r][c] !== color) break;
      count++;
    }
    if (count >= 4) return true;
  }
  return false;
}

function getConnect4WinCells(board, row, col, color, rows, cols) {
  const maxR = (rows || 6) - 1;
  const maxC = (cols || 7) - 1;
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    const cells = [{ row, col }];
    for (let i = 1; i <= 3; i++) {
      const r = row + dr*i, c = col + dc*i;
      if (r < 0 || r > maxR || c < 0 || c > maxC || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    for (let i = 1; i <= 3; i++) {
      const r = row - dr*i, c = col - dc*i;
      if (r < 0 || r > maxR || c < 0 || c > maxC || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

module.exports = { initRoom, resetRoom, handleMove };
