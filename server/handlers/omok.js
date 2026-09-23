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

  // 승리 체크 (정확히 5목 — 장목 불계)
  if (checkOmokWin(room.board, row, col, yourColor, omokSize)) {
    const winCells = getWinCells(room.board, row, col, yourColor, omokSize);
    endGame(room, yourColor, 'five-in-a-row', { winCells });
    return;
  }

  // 무승부 체크 — 보드가 꽉 찼을 때. 크기가 13/15/17/19로 바뀌므로 225 고정이면
  // 13×13은 영영 끝나지 않고 19×19는 판이 남았는데 무승부가 된다.
  if (room.moves.length >= omokSize * omokSize) {
    endGame(room, 'draw', 'board-full');
  }
}

// 놓은 돌을 지나는 한 방향의 연속 돌을 끝까지 센다.
// ⚠ 예전엔 양쪽을 4칸까지만 셌다. 그러면 이미 있던 장목(6목)에 한 점을 이어 7목을
//   만들어도 한쪽이 4에서 잘려 '정확히 5'로 읽히고 승리가 됐다 — 규칙(장목 불계)과 반대.
function lineThrough(board, row, col, color, sz, dr, dc) {
  const cells = [{ row, col }];
  for (let r = row + dr, c = col + dc; r >= 0 && r < sz && c >= 0 && c < sz && board[r][c] === color; r += dr, c += dc) {
    cells.push({ row: r, col: c });
  }
  for (let r = row - dr, c = col - dc; r >= 0 && r < sz && c >= 0 && c < sz && board[r][c] === color; r -= dr, c -= dc) {
    cells.push({ row: r, col: c });
  }
  return cells;
}

const OMOK_DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// 흑백 모두 '정확히 5목'만 승리 (6목 이상 장목은 불계). 렌주의 금수(3-3·4-4)는 없다 —
// 이 규칙은 엄밀히는 렌주가 아니라 표준 고모쿠다.
function checkOmokWin(board, row, col, color, size) {
  const sz = size || 15;
  return OMOK_DIRECTIONS.some(([dr, dc]) => lineThrough(board, row, col, color, sz, dr, dc).length === 5);
}

function getWinCells(board, row, col, color, size) {
  const sz = size || board.length || 15;
  for (const [dr, dc] of OMOK_DIRECTIONS) {
    const cells = lineThrough(board, row, col, color, sz, dr, dc);
    if (cells.length === 5) return cells;
  }
  return [];
}

module.exports = { initRoom, resetRoom, handleMove, checkOmokWin };
