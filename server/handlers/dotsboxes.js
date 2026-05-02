// server/handlers/dotsboxes.js — 도트앤박스 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

// 기본 보드 크기: 5×5 박스 (6×6 점, 60개 선분)
const DEFAULT_SIZE = 5;

function initEdges(size) {
  // 가로 선: (size+1) × size 개
  // 세로 선: size × (size+1) 개
  const hLines = Array(size + 1).fill(null).map(() => Array(size).fill(0));
  const vLines = Array(size).fill(null).map(() => Array(size + 1).fill(0));
  return { hLines, vLines };
}

function initRoom(base, opts) {
  const size = (opts && Number.isInteger(opts.boardSize) && opts.boardSize >= 3 && opts.boardSize <= 7)
    ? opts.boardSize : DEFAULT_SIZE;
  base.size        = size;
  base.edges       = initEdges(size);
  base.boxes       = Array(size).fill(null).map(() => Array(size).fill(0)); // 0=none, 1=white, 2=black
  base.scores      = { white: 0, black: 0 };
  base.currentTurn = base.hostColor; // 호스트 선공
}

function resetRoom(room) {
  room.edges   = initEdges(room.size);
  room.boxes   = Array(room.size).fill(null).map(() => Array(room.size).fill(0));
  room.scores  = { white: 0, black: 0 };
  room.currentTurn = room.hostColor;
}

function handleMove(socket, room, role, { edge }) {
  if (!edge) return;
  const { type, row, col } = edge;
  if (!['h', 'v'].includes(type)) return;
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;

  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;

  const { hLines, vLines } = room.edges;
  const size = room.size;

  // 범위 확인
  if (type === 'h') {
    if (row < 0 || row > size || col < 0 || col >= size) return;
    if (hLines[row][col] !== 0) return; // 이미 선 있음
    hLines[row][col] = yourColor === 'white' ? 1 : 2;
  } else {
    if (row < 0 || row >= size || col < 0 || col > size) return;
    if (vLines[row][col] !== 0) return;
    vLines[row][col] = yourColor === 'white' ? 1 : 2;
  }

  // 완성된 박스 확인
  const colorCode = yourColor === 'white' ? 1 : 2;
  let boxesCompleted = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (room.boxes[r][c] === 0 && _isBoxComplete(hLines, vLines, r, c)) {
        room.boxes[r][c] = colorCode;
        room.scores[yourColor]++;
        boxesCompleted++;
      }
    }
  }

  // 박스 완성 시 같은 플레이어 계속, 아니면 교대
  let nextTurn;
  if (boxesCompleted > 0) {
    nextTurn = yourColor;
  } else {
    nextTurn = yourColor === 'white' ? 'black' : 'white';
  }
  room.currentTurn        = nextTurn;
  room.timers.activeColor = nextTurn;
  room.timers.lastTickAt  = Date.now();

  const moveRecord = {
    edge, color: yourColor, boxesCompleted,
    scores: { ...room.scores },
    moveNum: room.moves.length + 1,
    timestamp: Date.now(),
  };
  room.moves.push(moveRecord);

  // 총 선분 수 체크 → 게임 종료
  const totalLines = (size + 1) * size + size * (size + 1);
  const usedLines  = _countUsedLines(hLines, vLines, size);

  const { endGame } = require('../endgame');

  if (usedLines >= totalLines) {
    // 모든 선분 사용 → 점수로 승패
    let winner;
    if (room.scores.white > room.scores.black)        winner = 'white';
    else if (room.scores.black > room.scores.white)   winner = 'black';
    else                                               winner = null; // 무승부

    state.io.to(room.id).emit('game:move:made', {
      move: moveRecord, edges: room.edges, boxes: room.boxes,
      scores: room.scores, turn: null,
      timers: { white: room.timers.white, black: room.timers.black, activeColor: null },
    });
    endGame(room, winner, 'all-lines-drawn');
    return;
  }

  state.io.to(room.id).emit('game:move:made', {
    move: moveRecord,
    edges:  room.edges,
    boxes:  room.boxes,
    scores: room.scores,
    turn:   nextTurn,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: nextTurn },
  });
}

function _isBoxComplete(hLines, vLines, r, c) {
  return hLines[r][c] !== 0     // 위
      && hLines[r+1][c] !== 0   // 아래
      && vLines[r][c] !== 0     // 왼쪽
      && vLines[r][c+1] !== 0;  // 오른쪽
}

function _countUsedLines(hLines, vLines, size) {
  let count = 0;
  for (let r = 0; r <= size; r++) for (let c = 0; c < size; c++)  if (hLines[r][c]) count++;
  for (let r = 0; r < size; r++)  for (let c = 0; c <= size; c++) if (vLines[r][c]) count++;
  return count;
}

module.exports = { initRoom, resetRoom, handleMove };
