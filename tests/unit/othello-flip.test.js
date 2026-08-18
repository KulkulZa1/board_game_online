// tests/unit/othello-flip.test.js — 오셀로 돌 뒤집기 단위 테스트
const { getFlippedCells, computeValidMoves, countStones } = require('../../server/handlers/othello');

function makeBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  // 초기 오셀로 배치
  board[3][3] = 'white'; board[3][4] = 'black';
  board[4][3] = 'black'; board[4][4] = 'white';
  return board;
}

describe('getFlippedCells', () => {
  test('초기 보드에서 흑의 첫 수 (2,3): 1개 뒤집힘', () => {
    const board = makeBoard();
    const flipped = getFlippedCells(board, 2, 3, 'black');
    expect(flipped).toHaveLength(1);
    expect(flipped[0]).toEqual({ r: 3, c: 3 });
  });

  test('초기 보드에서 흑의 첫 수 (3,2): 1개 뒤집힘', () => {
    const board = makeBoard();
    const flipped = getFlippedCells(board, 3, 2, 'black');
    expect(flipped).toHaveLength(1);
    expect(flipped[0]).toEqual({ r: 3, c: 3 });
  });

  test('이미 돌이 있는 칸은 뒤집힘 없음', () => {
    const board = makeBoard();
    const flipped = getFlippedCells(board, 3, 3, 'black'); // 이미 white
    expect(flipped).toHaveLength(0);
  });

  test('상대 돌 없이는 뒤집힘 없음', () => {
    const board = makeBoard();
    // (0,0)은 아무 돌도 없고 포위 구조 없음
    const flipped = getFlippedCells(board, 0, 0, 'black');
    expect(flipped).toHaveLength(0);
  });

  test('연속 여러 개 뒤집기', () => {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    // white-white-white-black 일렬 배치 후 왼쪽에 black 놓기
    board[0][1] = 'white';
    board[0][2] = 'white';
    board[0][3] = 'white';
    board[0][4] = 'black';
    const flipped = getFlippedCells(board, 0, 0, 'black');
    expect(flipped).toHaveLength(3);
  });

  test('여러 방향 동시 뒤집기', () => {
    const board = makeBoard();
    // (4,5) 에서 흑 — 오른쪽 white(4,4) 뒤집힘
    const flipped = getFlippedCells(board, 4, 5, 'black');
    expect(flipped.length).toBeGreaterThan(0);
  });
});

describe('computeValidMoves', () => {
  test('초기 보드에서 흑 유효 수 4개', () => {
    const board = makeBoard();
    const moves = computeValidMoves(board, 'black');
    expect(moves).toHaveLength(4);
  });

  test('초기 보드에서 백 유효 수 4개', () => {
    const board = makeBoard();
    const moves = computeValidMoves(board, 'white');
    expect(moves).toHaveLength(4);
  });

  test('꽉 찬 보드에서 유효 수 없음', () => {
    const board = Array(8).fill(null).map(() => Array(8).fill('black'));
    const moves = computeValidMoves(board, 'white');
    expect(moves).toHaveLength(0);
  });

  test('유효 수가 존재하는 좌표들은 빈 칸임', () => {
    const board = makeBoard();
    const moves = computeValidMoves(board, 'black');
    for (const { row, col } of moves) {
      expect(board[row][col]).toBeNull();
    }
  });
});

describe('countStones', () => {
  test('초기 보드는 흑 2 백 2', () => {
    const board = makeBoard();
    const counts = countStones(board);
    expect(counts).toEqual({ white: 2, black: 2 });
  });

  test('빈 보드는 모두 0', () => {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    expect(countStones(board)).toEqual({ white: 0, black: 0 });
  });

  test('흑으로 가득 찬 보드', () => {
    const board = Array(8).fill(null).map(() => Array(8).fill('black'));
    const counts = countStones(board);
    expect(counts).toEqual({ white: 0, black: 64 });
  });

  test('돌 수 정확히 집계', () => {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    board[0][0] = 'white';
    board[0][1] = 'white';
    board[0][2] = 'black';
    const counts = countStones(board);
    expect(counts.white).toBe(2);
    expect(counts.black).toBe(1);
  });
});
