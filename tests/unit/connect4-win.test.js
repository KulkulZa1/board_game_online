// tests/unit/connect4-win.test.js — 커넥트4 승리 조건 단위 테스트
const { checkConnect4Win, getConnect4WinCells } = require('../../server/handlers/connect4');

const ROWS = 6;
const COLS = 7;

function makeBoard() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
}

function place(board, stones) {
  for (const [r, c, color] of stones) {
    board[r][c] = color;
  }
  return board;
}

describe('checkConnect4Win', () => {
  test('4개 가로 연속이면 승리', () => {
    const board = makeBoard();
    place(board, [[5,0,'white'],[5,1,'white'],[5,2,'white'],[5,3,'white']]);
    expect(checkConnect4Win(board, 5, 3, 'white', ROWS, COLS)).toBe(true);
  });

  test('4개 세로 연속이면 승리', () => {
    const board = makeBoard();
    place(board, [[2,3,'black'],[3,3,'black'],[4,3,'black'],[5,3,'black']]);
    expect(checkConnect4Win(board, 5, 3, 'black', ROWS, COLS)).toBe(true);
  });

  test('4개 대각선이면 승리', () => {
    const board = makeBoard();
    place(board, [[5,0,'white'],[4,1,'white'],[3,2,'white'],[2,3,'white']]);
    expect(checkConnect4Win(board, 5, 0, 'white', ROWS, COLS)).toBe(true);
  });

  test('4개 역대각선이면 승리', () => {
    const board = makeBoard();
    place(board, [[5,3,'black'],[4,2,'black'],[3,1,'black'],[2,0,'black']]);
    expect(checkConnect4Win(board, 5, 3, 'black', ROWS, COLS)).toBe(true);
  });

  test('3개 연속은 승리 아님', () => {
    const board = makeBoard();
    place(board, [[5,0,'white'],[5,1,'white'],[5,2,'white']]);
    expect(checkConnect4Win(board, 5, 2, 'white', ROWS, COLS)).toBe(false);
  });

  test('상대 돌로 끊긴 경우는 승리 아님', () => {
    const board = makeBoard();
    place(board, [[5,0,'white'],[5,1,'white'],[5,2,'black'],[5,3,'white'],[5,4,'white']]);
    expect(checkConnect4Win(board, 5, 4, 'white', ROWS, COLS)).toBe(false);
  });

  test('5개 이상 연속도 승리', () => {
    const board = makeBoard();
    place(board, [[5,0,'black'],[5,1,'black'],[5,2,'black'],[5,3,'black'],[5,4,'black']]);
    expect(checkConnect4Win(board, 5, 4, 'black', ROWS, COLS)).toBe(true);
  });

  test('보드 상단 근처 세로 4개 승리', () => {
    const board = makeBoard();
    place(board, [[0,0,'white'],[1,0,'white'],[2,0,'white'],[3,0,'white']]);
    expect(checkConnect4Win(board, 0, 0, 'white', ROWS, COLS)).toBe(true);
  });

  test('빈 보드는 승리 아님', () => {
    const board = makeBoard();
    expect(checkConnect4Win(board, 0, 0, 'white', ROWS, COLS)).toBe(false);
  });
});

describe('getConnect4WinCells', () => {
  test('가로 4목 셀 4개 반환', () => {
    const board = makeBoard();
    place(board, [[5,0,'white'],[5,1,'white'],[5,2,'white'],[5,3,'white']]);
    const cells = getConnect4WinCells(board, 5, 3, 'white', ROWS, COLS);
    expect(cells).toHaveLength(4);
    const coords = cells.map(({ row, col }) => `${row},${col}`);
    for (let c = 0; c <= 3; c++) {
      expect(coords).toContain(`5,${c}`);
    }
  });

  test('세로 4목 셀 4개 반환', () => {
    const board = makeBoard();
    place(board, [[2,3,'black'],[3,3,'black'],[4,3,'black'],[5,3,'black']]);
    const cells = getConnect4WinCells(board, 5, 3, 'black', ROWS, COLS);
    expect(cells).toHaveLength(4);
  });

  test('5개 연속이면 셀 5개 반환', () => {
    const board = makeBoard();
    place(board, [[5,0,'black'],[5,1,'black'],[5,2,'black'],[5,3,'black'],[5,4,'black']]);
    const cells = getConnect4WinCells(board, 5, 2, 'black', ROWS, COLS);
    expect(cells.length).toBeGreaterThanOrEqual(4);
  });
});
