// server/handlers/backgammon.js — 백가몬 핸들러
const state = require('../state');
const { getRoleColor } = require('../utils');

// 표준 백가몬 초기 배치 (1-indexed, 0번 미사용)
function initBGBoard() {
  const points = new Array(25).fill(null).map(() => ({ color: null, count: 0 }));
  points[1]  = { color: 'black', count: 2 };
  points[6]  = { color: 'white', count: 5 };
  points[8]  = { color: 'white', count: 3 };
  points[12] = { color: 'black', count: 5 };
  points[13] = { color: 'white', count: 5 };
  points[17] = { color: 'black', count: 3 };
  points[19] = { color: 'black', count: 5 };
  points[24] = { color: 'white', count: 2 };
  return {
    points,
    bar:      { white: 0, black: 0 },
    borneOff: { white: 0, black: 0 },
  };
}

function rollDice() {
  return [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
}

function initRoom(base) {
  base.board          = initBGBoard();
  base.currentTurn    = 'white';
  base.phase          = 'rolling';
  base.dice           = [0, 0];
  base.remainingMoves = [];
}

function resetRoom(room) {
  room.board          = initBGBoard();
  room.currentTurn    = room.hostColor;
  room.phase          = 'rolling';
  room.dice           = [0, 0];
  room.remainingMoves = [];
}

function handleMove(socket, room, role, data) {
  const { io } = state;
  if (!data || !data.type) return;
  const yourColor = getRoleColor(room, role);

  // ── 주사위 굴리기 ──────────────────────────────────────────────
  if (data.type === 'roll') {
    if (room.currentTurn !== yourColor) return;
    if (room.phase !== 'rolling') return;

    const [d1, d2] = rollDice();
    room.dice = [d1, d2];
    room.remainingMoves = (d1 === d2) ? [d1, d1, d1, d1] : [d1, d2];
    room.phase = 'moving';

    const valids = getValidMoves(room.board, yourColor, room.remainingMoves);
    if (valids.length === 0) {
      // 유효한 수 없음 — 자동 패스
      _switchTurn(room);
      io.to(room.id).emit('game:move:made', {
        move:           { type: 'roll', dice: [d1, d2], color: yourColor, noMoves: true },
        board:          room.board,
        dice:           [d1, d2],
        remainingMoves: [],
        phase:          'rolling',
        turn:           room.currentTurn,
        validMoves:     [],
        timers:         _timers(room),
      });
      return;
    }

    io.to(room.id).emit('game:move:made', {
      move:           { type: 'roll', dice: [d1, d2], color: yourColor },
      board:          room.board,
      dice:           [d1, d2],
      remainingMoves: room.remainingMoves,
      phase:          'moving',
      turn:           yourColor,
      validMoves:     valids,
      timers:         _timers(room),
    });
    return;
  }

  // ── 말 이동 ────────────────────────────────────────────────────
  if (data.type === 'move') {
    if (room.currentTurn !== yourColor) return;
    if (room.phase !== 'moving') return;

    const { from, to, dieUsed } = data;
    if (!Number.isInteger(dieUsed) || dieUsed < 1 || dieUsed > 6) return;

    const dieIdx = room.remainingMoves.indexOf(dieUsed);
    if (dieIdx === -1) return;

    // 서버 측 유효성 검사
    const valids = getValidMoves(room.board, yourColor, [dieUsed]);
    const isValid = valids.some(m => m.from === from && m.to === to && m.dieUsed === dieUsed);
    if (!isValid) {
      socket.emit('game:move:invalid', { reason: '유효하지 않은 수입니다.' });
      return;
    }

    // 이동 적용
    const bg = room.board;
    const oppColor = yourColor === 'white' ? 'black' : 'white';
    let hitPiece = false;

    if (from === 'bar') {
      bg.bar[yourColor]--;
    } else {
      bg.points[from].count--;
      if (bg.points[from].count === 0) bg.points[from].color = null;
    }

    if (to === 'off') {
      bg.borneOff[yourColor]++;
    } else {
      if (bg.points[to].color === oppColor && bg.points[to].count === 1) {
        bg.points[to].count = 0;
        bg.points[to].color = null;
        bg.bar[oppColor]++;
        hitPiece = true;
      }
      bg.points[to].count++;
      bg.points[to].color = yourColor;
    }

    room.remainingMoves.splice(dieIdx, 1);

    const moveRecord = {
      type: 'move', from, to, dieUsed,
      color: yourColor, hitPiece,
      moveNum:   room.moves.length + 1,
      timestamp: Date.now(),
    };
    room.moves.push(moveRecord);

    // 승리 확인
    const { endGame } = require('../endgame');
    if (bg.borneOff[yourColor] >= 15) {
      io.to(room.id).emit('game:move:made', {
        move: moveRecord, board: bg,
        dice: room.dice, remainingMoves: [],
        phase: 'rolling', turn: yourColor, validMoves: [],
        timers: { white: room.timers.white, black: room.timers.black, activeColor: null },
      });
      endGame(room, yourColor, 'all-borne-off');
      return;
    }

    // 남은 주사위로 유효 수 확인
    let nextValids = [];
    if (room.remainingMoves.length > 0) {
      nextValids = getValidMoves(bg, yourColor, room.remainingMoves);
    }

    if (room.remainingMoves.length === 0 || nextValids.length === 0) {
      room.remainingMoves = [];
      _switchTurn(room);
    }

    const nextValidsForOpponent = (room.phase === 'rolling')
      ? [] // 다음 플레이어는 굴리기 전 유효 수 없음
      : getValidMoves(bg, yourColor, room.remainingMoves);

    io.to(room.id).emit('game:move:made', {
      move: moveRecord, board: bg,
      dice:           room.dice,
      remainingMoves: room.remainingMoves,
      phase:          room.phase,
      turn:           room.currentTurn,
      validMoves:     room.phase === 'moving' ? getValidMoves(bg, yourColor, room.remainingMoves) : [],
      timers:         _timers(room),
    });
  }
}

function _switchTurn(room) {
  room.currentTurn        = room.currentTurn === 'white' ? 'black' : 'white';
  room.phase              = 'rolling';
  room.timers.activeColor = room.currentTurn;
  room.timers.lastTickAt  = Date.now();
}

function _timers(room) {
  return { white: room.timers.white, black: room.timers.black, activeColor: room.timers.activeColor };
}

// 주어진 색과 주사위로 가능한 모든 이동 반환
function getValidMoves(bg, color, remainingMoves) {
  if (!remainingMoves || remainingMoves.length === 0) return [];
  const unique   = [...new Set(remainingMoves)];
  const oppColor = color === 'white' ? 'black' : 'white';
  const dir      = color === 'white' ? -1 : 1;
  const moves    = [];

  if (bg.bar[color] > 0) {
    // 바에서 입장 (최우선)
    for (const die of unique) {
      const entry = color === 'white' ? (25 - die) : die;
      if (entry < 1 || entry > 24) continue;
      if (_isBlocked(bg, entry, oppColor)) continue;
      moves.push({ from: 'bar', to: entry, dieUsed: die });
    }
    return moves;
  }

  const allHome = isAllInHomeBoard(bg, color);

  for (let p = 1; p <= 24; p++) {
    if (bg.points[p].color !== color || bg.points[p].count === 0) continue;
    for (const die of unique) {
      const dest = p + dir * die;
      if (color === 'white' && dest <= 0) {
        if (allHome && canBearOff(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
      } else if (color === 'black' && dest >= 25) {
        if (allHome && canBearOff(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
      } else if (dest >= 1 && dest <= 24) {
        if (!_isBlocked(bg, dest, oppColor)) moves.push({ from: p, to: dest, dieUsed: die });
      }
    }
  }

  // 중복 제거
  const seen = new Set();
  return moves.filter(m => {
    const k = `${m.from}|${m.to}|${m.dieUsed}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function _isBlocked(bg, point, oppColor) {
  return bg.points[point].color === oppColor && bg.points[point].count >= 2;
}

function isAllInHomeBoard(bg, color) {
  if (bg.bar[color] > 0) return false;
  const [lo, hi] = color === 'white' ? [1, 6] : [19, 24];
  for (let p = 1; p <= 24; p++) {
    if (p >= lo && p <= hi) continue;
    if (bg.points[p].color === color && bg.points[p].count > 0) return false;
  }
  return true;
}

function canBearOff(bg, color, fromPoint, die) {
  const dir  = color === 'white' ? -1 : 1;
  const dest = fromPoint + dir * die;
  if (color === 'white') {
    if (dest >= 1) return false; // dest still on board — not bearing off
    if (dest === 0) return true; // exact
    // over-bear: no piece on higher home point
    for (let p = fromPoint + 1; p <= 6; p++) {
      if (bg.points[p].color === 'white' && bg.points[p].count > 0) return false;
    }
    return true;
  } else {
    if (dest <= 24) return false;
    if (dest === 25) return true;
    for (let p = 19; p < fromPoint; p++) {
      if (bg.points[p].color === 'black' && bg.points[p].count > 0) return false;
    }
    return true;
  }
}

module.exports = { initRoom, resetRoom, handleMove, getValidMoves, isAllInHomeBoard, canBearOff };
