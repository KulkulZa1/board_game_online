// server/handlers/battleship.js — 배틀십 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

// 함선 정의: name, size
const SHIPS_DEF = [
  { name: 'carrier',    size: 5 },
  { name: 'battleship', size: 4 },
  { name: 'cruiser',    size: 3 },
  { name: 'submarine',  size: 3 },
  { name: 'destroyer',  size: 2 },
];
const ROWS = 10, COLS = 10;

// 10×10 null 그리드 생성
function createEmptyGrid() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
}

// 함선 배치 정보에서 그리드와 shipStatus 생성
function buildGridAndStatus(ships) {
  const grid = createEmptyGrid();
  const status = {}; // shipName → 남은 셀 수
  for (const ship of ships) {
    const { name, cells } = ship;
    status[name] = cells.length;
    for (const { r, c } of cells) {
      grid[r][c] = name;
    }
  }
  return { grid, status };
}

function initRoom(base) {
  base.phase        = 'placement';
  base.currentTurn  = 'white';
  base.shipGrids    = { white: null, black: null }; // null = 아직 배치 안 함
  base.attackGrids  = { white: createEmptyGrid(), black: createEmptyGrid() };
  base.shipStatus   = { white: {}, black: {} }; // shipName → 남은 셀 수
}

function resetRoom(room) {
  room.phase        = 'placement';
  room.currentTurn  = room.hostColor;
  room.shipGrids    = { white: null, black: null };
  room.attackGrids  = { white: createEmptyGrid(), black: createEmptyGrid() };
  room.shipStatus   = { white: {}, black: {} };
}

function handleMove(socket, room, role, data) {
  const yourColor = getRoleColor(room, role);
  if (data.action === 'place') {
    _handlePlacement(socket, room, yourColor, data.ships);
  } else if (room.phase === 'active') {
    _handleShot(socket, room, yourColor, data);
  }
}

function _handlePlacement(socket, room, yourColor, ships) {
  // 이미 배치한 경우
  if (room.shipGrids[yourColor]) {
    socket.emit('game:move:invalid', { reason: '이미 배치를 완료했습니다.' });
    return;
  }
  // 유효성 검사
  if (!_validateShips(ships)) {
    socket.emit('game:move:invalid', { reason: '올바르지 않은 함선 배치입니다.' });
    return;
  }

  // 그리드 및 상태 구성
  const { grid, status } = buildGridAndStatus(ships);
  room.shipGrids[yourColor]  = grid;
  room.shipStatus[yourColor] = status;

  // 이 플레이어에게 배치 완료 확인
  socket.emit('battleship:placed', { color: yourColor });

  // 상대방도 배치했으면 게임 시작
  const opponentColor = yourColor === 'white' ? 'black' : 'white';
  if (room.shipGrids[opponentColor]) {
    room.phase = 'active';
    // 타이머 시작 (배치 단계가 끝났으므로 activeColor 설정)
    room.timers.activeColor = room.currentTurn;
    room.timers.lastTickAt  = Date.now();
    state.io.to(room.id).emit('battleship:game-start', { currentTurn: room.currentTurn });
  }
}

function _handleShot(socket, room, yourColor, { row, col }) {
  // 턴 확인
  if (room.currentTurn !== yourColor) return;

  // 범위 확인
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row >= ROWS || col < 0 || col >= COLS) {
    socket.emit('game:move:invalid', { reason: '범위를 벗어난 좌표입니다.' });
    return;
  }

  // 이미 공격한 칸인지 확인
  if (room.attackGrids[yourColor][row][col] !== null) {
    socket.emit('game:move:invalid', { reason: '이미 공격한 좌표입니다.' });
    return;
  }

  // 상대방 함선 그리드 조회
  const opponentColor = yourColor === 'white' ? 'black' : 'white';
  const opponentGrid  = room.shipGrids[opponentColor];
  const hitShipName   = opponentGrid[row][col]; // null이면 빗나감

  let result;
  let sunkShip = null;

  if (hitShipName) {
    // 적중
    result = 'hit';
    room.attackGrids[yourColor][row][col] = 'hit';
    room.shipStatus[opponentColor][hitShipName]--;

    if (room.shipStatus[opponentColor][hitShipName] === 0) {
      // 격침
      result = 'sunk';
      sunkShip = hitShipName;
    }
  } else {
    // 빗나감
    result = 'miss';
    room.attackGrids[yourColor][row][col] = 'miss';
  }

  const moveNum = room.moves.length + 1;
  const moveRecord = {
    moveNum,
    color:    yourColor,
    row,
    col,
    result,
    sunkShip,
    notation: `${String.fromCharCode(65 + col)}${row + 1}`,
    timestamp: Date.now(),
  };
  room.moves.push(moveRecord);

  // 모든 함선 격침 → 게임 종료
  const allSunk = Object.values(room.shipStatus[opponentColor]).every(v => v === 0);
  if (allSunk) {
    // 턴 교체 전 종료
    state.io.to(room.id).emit('game:move:made', {
      move:        moveRecord,
      attackGrids: room.attackGrids,
      turn:        yourColor,
      timers: {
        white:       room.timers.white,
        black:       room.timers.black,
        activeColor: yourColor,
      },
    });

    const { endGame } = require('../endgame');
    endGame(room, yourColor, 'all-ships-sunk');
    return;
  }

  // 턴 교체
  const nextColor = opponentColor;
  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  state.io.to(room.id).emit('game:move:made', {
    move:        moveRecord,
    attackGrids: room.attackGrids,
    turn:        nextColor,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: nextColor,
    },
  });
}

// 함선 배치 유효성 검사
function _validateShips(ships) {
  if (!Array.isArray(ships) || ships.length !== SHIPS_DEF.length) return false;

  // 이름별 크기 매핑
  const sizeMap = {};
  for (const def of SHIPS_DEF) sizeMap[def.name] = def.size;

  const occupiedCells = new Set();

  for (const ship of ships) {
    if (!ship || typeof ship.name !== 'string' || !Array.isArray(ship.cells)) return false;
    const expectedSize = sizeMap[ship.name];
    if (!expectedSize) return false; // 알 수 없는 함선
    if (ship.cells.length !== expectedSize) return false;

    // 각 셀이 경계 내인지 확인
    for (const cell of ship.cells) {
      if (!cell || !Number.isInteger(cell.r) || !Number.isInteger(cell.c)) return false;
      if (cell.r < 0 || cell.r >= ROWS || cell.c < 0 || cell.c >= COLS) return false;
      const key = `${cell.r},${cell.c}`;
      if (occupiedCells.has(key)) return false; // 겹침
      occupiedCells.add(key);
    }

    // 직선 배치 확인 (가로 또는 세로)
    const rows = ship.cells.map(c => c.r);
    const cols = ship.cells.map(c => c.c);
    const minR = Math.min(...rows), maxR = Math.max(...rows);
    const minC = Math.min(...cols), maxC = Math.max(...cols);

    const isHorizontal = minR === maxR;
    const isVertical   = minC === maxC;
    if (!isHorizontal && !isVertical) return false;

    // 연속 배치 확인
    if (isHorizontal) {
      if (maxC - minC + 1 !== expectedSize) return false;
    } else {
      if (maxR - minR + 1 !== expectedSize) return false;
    }
  }

  // 모든 5종류 함선이 하나씩 있는지 확인
  const nameSet = new Set(ships.map(s => s.name));
  if (nameSet.size !== SHIPS_DEF.length) return false;

  return true;
}

module.exports = { initRoom, resetRoom, handleMove };
