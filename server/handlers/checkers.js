// server/handlers/checkers.js — 체커스 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

function initCheckersBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { color: 'black', king: false };
      }
    }
  }
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { color: 'white', king: false };
      }
    }
  }
  return board;
}

// 선공은 항상 백(white)이다 — 규칙 안내문('백이 먼저 둡니다')·혼자하기('항상 백 선공')와 같다.
// 예전 서버는 '호스트 색'을 선공으로 두어 두 가지가 틀렸다: 호스트가 흑을 고르면 흑이 먼저 둬
// 안내문과 달랐고, 재대국은 색을 바꾼 뒤 resetRoom 을 부르므로 선공이 영원히 호스트였다.
// 고정 색 선공이면 재대국의 색 교체만으로 선공이 번갈아 간다 (체스·사목과 같은 방식).
function initRoom(base, opts) {
  base.board       = initCheckersBoard();
  base.currentTurn = 'white'; // 빨강(=white) 선공
  base.mustJump    = null;
  base.lastMove    = null;
}

function resetRoom(room) {
  room.board       = initCheckersBoard();
  room.currentTurn = 'white';
  room.mustJump    = null;
  room.lastMove    = null;
}

function handleMove(socket, room, role, { from, to }) {
  if (!from || !to) return;
  const fr = from.row, fc = from.col;
  const tr = to.row,   tc = to.col;
  if (!Number.isInteger(fr)||!Number.isInteger(fc)||!Number.isInteger(tr)||!Number.isInteger(tc)) return;
  if (fr<0||fr>7||fc<0||fc>7||tr<0||tr>7||tc<0||tc>7) return;

  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;

  // mustJump 체크
  if (room.mustJump && (room.mustJump.row !== fr || room.mustJump.col !== fc)) {
    socket.emit('game:move:invalid', { reason: '연속 점프 중입니다.' });
    return;
  }

  const piece = room.board[fr][fc];
  if (!piece || piece.color !== yourColor) return;

  // 강제 점프 여부
  const boardHasJumps = hasCheckersJumps(room.board, yourColor);

  // 이 말의 유효 이동 목록
  const validMoves = getValidCheckersMovesForPiece(room.board, fr, fc, piece, boardHasJumps);
  const move = validMoves.find(m => m.to.row === tr && m.to.col === tc);

  if (!move) {
    socket.emit('game:move:invalid', { reason: '유효하지 않은 수입니다.' });
    return;
  }

  // 이동 적용
  room.board[tr][tc] = piece;
  room.board[fr][fc] = null;

  let captured = null;
  if (move.isJump) {
    const capRow = (fr + tr) / 2;
    const capCol = (fc + tc) / 2;
    captured = { row: capRow, col: capCol };
    room.board[capRow][capCol] = null;
  }

  // 킹 승격
  let promoted = false;
  if (!piece.king && ((yourColor === 'white' && tr === 0) || (yourColor === 'black' && tr === 7))) {
    piece.king = true;
    promoted = true;
  }

  // 연속 점프 체크
  let mustJump = null;
  if (move.isJump && !promoted) {
    const moreJumps = getJumpCheckersMovesForPiece(room.board, tr, tc, piece);
    if (moreJumps.length > 0) {
      mustJump = { row: tr, col: tc };
    }
  }

  const moveRecord = {
    from:     { row: fr, col: fc },
    to:       { row: tr, col: tc },
    captured,
    promoted,
    color:    yourColor,
    moveNum:  room.moves.length + 1,
    timestamp: Date.now()
  };
  room.moves.push(moveRecord);
  room.lastMove = { row: tr, col: tc };
  room.mustJump = mustJump;

  let nextTurn;
  if (mustJump) {
    nextTurn = yourColor; // 같은 플레이어 계속
  } else {
    nextTurn = yourColor === 'white' ? 'black' : 'white';
    room.currentTurn        = nextTurn;
    room.timers.activeColor = nextTurn;
    room.timers.lastTickAt  = Date.now();
  }

  // 승리 체크
  const oppColor = yourColor === 'white' ? 'black' : 'white';
  const oppPieces = room.board.flat().filter(p => p && p.color === oppColor);
  const oppMoves  = mustJump ? [] : getAllCheckersValidMoves(room.board, oppColor);

  const { endGame } = require('../endgame');

  if (oppPieces.length === 0 || (!mustJump && oppMoves.length === 0)) {
    state.io.to(room.id).emit('game:move:made', {
      move: moveRecord, board: room.board, mustJump: null,
      timers: { white: room.timers.white, black: room.timers.black, activeColor: null },
      turn: nextTurn, validMoves: []
    });
    // 전멸과 '말은 남았는데 둘 곳이 없음'은 다른 결말이다 — 예전엔 둘 다 '상대 말 전멸'로 표시됐다
    endGame(room, yourColor, oppPieces.length === 0 ? 'no-pieces' : 'no-moves');
    return;
  }

  // 다음 유효 이동 목록
  const nextValidMoves = mustJump
    ? getValidCheckersMovesForPiece(room.board, tr, tc, piece, true)
    : getAllCheckersValidMoves(room.board, nextTurn);

  state.io.to(room.id).emit('game:move:made', {
    move: moveRecord,
    board: room.board,
    mustJump,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: room.timers.activeColor },
    turn:  nextTurn,
    validMoves: nextValidMoves
  });
}

function hasCheckersJumps(board, color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color && getJumpCheckersMovesForPiece(board, row, col, piece).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function getJumpCheckersMovesForPiece(board, row, col, piece) {
  const moves = [];
  const opp = piece.color === 'white' ? 'black' : 'white';
  const dirs = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]]
             : piece.color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  for (const [dr, dc] of dirs) {
    const mr = row+dr, mc = col+dc, er = row+2*dr, ec = col+2*dc;
    if (er<0||er>7||ec<0||ec>7) continue;
    const mid = board[mr][mc], end = board[er][ec];
    if (mid && mid.color === opp && !end) {
      moves.push({ to: { row: er, col: ec }, isJump: true });
    }
  }
  return moves;
}

function getSimpleCheckersMovesForPiece(board, row, col, piece) {
  const moves = [];
  const dirs = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]]
             : piece.color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  for (const [dr, dc] of dirs) {
    const tr = row+dr, tc = col+dc;
    if (tr<0||tr>7||tc<0||tc>7) continue;
    if (!board[tr][tc]) moves.push({ to: { row: tr, col: tc }, isJump: false });
  }
  return moves;
}

function getValidCheckersMovesForPiece(board, row, col, piece, forceJump) {
  const jumps = getJumpCheckersMovesForPiece(board, row, col, piece);
  if (forceJump) return jumps;
  if (jumps.length > 0) return jumps;
  return getSimpleCheckersMovesForPiece(board, row, col, piece);
}

function getAllCheckersValidMoves(board, color) {
  const hasJumps = hasCheckersJumps(board, color);
  const moves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        const pm = getValidCheckersMovesForPiece(board, row, col, piece, hasJumps);
        pm.forEach(m => moves.push({ from: { row, col }, ...m }));
      }
    }
  }
  return moves;
}

module.exports = {
  initRoom,
  resetRoom,
  handleMove,
  initCheckersBoard,
  hasCheckersJumps,
  getJumpCheckersMovesForPiece,
  getSimpleCheckersMovesForPiece,
  getValidCheckersMovesForPiece,
  getAllCheckersValidMoves,
};
