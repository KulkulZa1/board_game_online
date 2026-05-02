// server/handlers/omok.js — 오목 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

function initRoom(base, { boardSize }) {
  const sz = (boardSize && boardSize.size) || 15;
  base.boardSize   = { size: sz };
  base.board       = Array(sz).fill(null).map(() => Array(sz).fill(null));
  base.currentTurn = 'black'; // 흑 선공
  base.lastMove    = null;
}

function resetRoom(room) {
  const sz = (room.boardSize && room.boardSize.size) || 15;
  room.board       = Array(sz).fill(null).map(() => Array(sz).fill(null));
  room.currentTurn = 'black';
  room.lastMove    = null;
}

function handleMove(socket, room, role, { row, col }) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;
  const omokSize = (room.boardSize && room.boardSize.size) || 15;
  if (row < 0 || row >= omokSize || col < 0 || col >= omokSize) return;

  const yourColor = getRoleColor(room, role);

  // 턴 확인
  if (room.currentTurn !== yourColor) return;

  // 빈 칸 확인
  if (room.board[row][col] !== null) {
    socket.emit('game:move:invalid', { reason: '이미 돌이 있는 곳입니다.' });
    return;
  }

  // 돌 배치
  room.board[row][col] = yourColor;
  const moveNum = room.moves.length + 1;
  const moveRecord = { row, col, color: yourColor, moveNum, timestamp: Date.now() };
  room.moves.push(moveRecord);
  room.lastMove = { row, col };

  // 턴 전환
  const nextColor = yourColor === 'black' ? 'white' : 'black';
  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  state.io.to(room.id).emit('game:move:made', {
    move:  moveRecord,
    board: room.board,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor
    },
    turn: nextColor
  });

  const { endGame } = require('../endgame');

  // 승리 체크 (렌주룰: 정확히 5개)
  if (checkOmokWin(room.board, row, col, yourColor, omokSize)) {
    const winCells = getWinCells(room.board, row, col, yourColor, omokSize);
    endGame(room, yourColor, 'five-in-a-row', { winCells });
    return;
  }

  // 무승부 체크 (225수 모두 소진)
  if (room.moves.length >= 225) {
    endGame(room, 'draw', 'board-full');
  }
}

function checkOmokWin(board, row, col, color, size) {
  const sz = size || 15;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let i = 1; i <= 4; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= sz || c < 0 || c >= sz || board[r][c] !== color) break;
      count++;
    }
    for (let i = 1; i <= 4; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r >= sz || c < 0 || c >= sz || board[r][c] !== color) break;
      count++;
    }
    // 렌주룰: 정확히 5개만 승리 (6목 이상은 불계)
    if (count === 5) return true;
  }
  return false;
}

function getWinCells(board, row, col, color, size) {
  const sz = size || board.length || 15;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const cells = [{ row, col }];
    for (let i = 1; i <= 4; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= sz || c < 0 || c >= sz || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    for (let i = 1; i <= 4; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r >= sz || c < 0 || c >= sz || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    if (cells.length === 5) return cells;
  }
  return [];
}

module.exports = { initRoom, resetRoom, handleMove };
