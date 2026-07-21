'use strict';

function getValidMoves(board, color, remainingMoves) {
  if (!remainingMoves || remainingMoves.length === 0) return [];

  const sequences = collectMoveSequences(board, color, remainingMoves);
  const maxLength = sequences.reduce((max, sequence) => Math.max(max, sequence.length), 0);
  if (maxLength === 0) return [];

  let optimalSequences = sequences.filter((sequence) => sequence.length === maxLength);
  if (maxLength === 1 && new Set(remainingMoves).size > 1) {
    const highestPlayableDie = Math.max(...optimalSequences.map((sequence) => sequence[0].dieUsed));
    optimalSequences = optimalSequences.filter((sequence) => sequence[0].dieUsed === highestPlayableDie);
  }

  return uniqueMoves(optimalSequences.map((sequence) => sequence[0]));
}

function getImmediateMoves(board, color, remainingMoves) {
  if (!remainingMoves || remainingMoves.length === 0) return [];
  const uniqueDice = [...new Set(remainingMoves)];
  const opponentColor = color === 'white' ? 'black' : 'white';
  const direction = color === 'white' ? -1 : 1;
  const moves = [];

  if (board.bar[color] > 0) {
    for (const die of uniqueDice) {
      const entry = color === 'white' ? 25 - die : die;
      if (entry < 1 || entry > 24 || isBlocked(board, entry, opponentColor)) continue;
      moves.push({ from: 'bar', to: entry, dieUsed: die });
    }
    return moves;
  }

  const allHome = isAllInHomeBoard(board, color);
  for (let point = 1; point <= 24; point++) {
    if (board.points[point].color !== color || board.points[point].count === 0) continue;
    for (const die of uniqueDice) {
      const destination = point + direction * die;
      if (color === 'white' && destination <= 0) {
        if (allHome && canBearOff(board, color, point, die)) {
          moves.push({ from: point, to: 'off', dieUsed: die });
        }
      } else if (color === 'black' && destination >= 25) {
        if (allHome && canBearOff(board, color, point, die)) {
          moves.push({ from: point, to: 'off', dieUsed: die });
        }
      } else if (destination >= 1 && destination <= 24 && !isBlocked(board, destination, opponentColor)) {
        moves.push({ from: point, to: destination, dieUsed: die });
      }
    }
  }

  return uniqueMoves(moves);
}

function collectMoveSequences(board, color, remainingMoves) {
  const immediateMoves = getImmediateMoves(board, color, remainingMoves);
  if (immediateMoves.length === 0) return [[]];

  const sequences = [];
  for (const move of immediateMoves) {
    const nextBoard = cloneBoard(board);
    applyBoardMove(nextBoard, color, move);

    const nextMoves = [...remainingMoves];
    nextMoves.splice(nextMoves.indexOf(move.dieUsed), 1);
    for (const suffix of collectMoveSequences(nextBoard, color, nextMoves)) {
      sequences.push([move, ...suffix]);
    }
  }
  return sequences;
}

function cloneBoard(board) {
  return {
    points: board.points.map((point) => ({ ...point })),
    bar: { ...board.bar },
    borneOff: { ...board.borneOff },
  };
}

function applyBoardMove(board, color, move) {
  const { from, to } = move;
  const opponentColor = color === 'white' ? 'black' : 'white';
  let hitPiece = false;

  if (from === 'bar') {
    board.bar[color]--;
  } else {
    board.points[from].count--;
    if (board.points[from].count === 0) board.points[from].color = null;
  }

  if (to === 'off') {
    board.borneOff[color]++;
  } else {
    if (board.points[to].color === opponentColor && board.points[to].count === 1) {
      board.points[to].count = 0;
      board.points[to].color = null;
      board.bar[opponentColor]++;
      hitPiece = true;
    }
    board.points[to].count++;
    board.points[to].color = color;
  }

  return hitPiece;
}

function uniqueMoves(moves) {
  const seen = new Set();
  return moves.filter((move) => {
    const key = `${move.from}|${move.to}|${move.dieUsed}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isBlocked(board, point, opponentColor) {
  return board.points[point].color === opponentColor && board.points[point].count >= 2;
}

function isAllInHomeBoard(board, color) {
  if (board.bar[color] > 0) return false;
  const [low, high] = color === 'white' ? [1, 6] : [19, 24];
  for (let point = 1; point <= 24; point++) {
    if (point >= low && point <= high) continue;
    if (board.points[point].color === color && board.points[point].count > 0) return false;
  }
  return true;
}

function canBearOff(board, color, fromPoint, die) {
  const direction = color === 'white' ? -1 : 1;
  const destination = fromPoint + direction * die;
  if (color === 'white') {
    if (destination >= 1) return false;
    if (destination === 0) return true;
    for (let point = fromPoint + 1; point <= 6; point++) {
      if (board.points[point].color === 'white' && board.points[point].count > 0) return false;
    }
    return true;
  }

  if (destination <= 24) return false;
  if (destination === 25) return true;
  for (let point = 19; point < fromPoint; point++) {
    if (board.points[point].color === 'black' && board.points[point].count > 0) return false;
  }
  return true;
}

module.exports = { applyBoardMove, canBearOff, getValidMoves, isAllInHomeBoard };
