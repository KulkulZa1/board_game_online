// tests/unit/omok-win.test.js — 오목 승리 조건 단위 테스트
const { checkOmokWin, getWinCells } = require('../../server/handlers/omok');

function makeBoard(size = 15) {
  return Array(size).fill(null).map(() => Array(size).fill(null));
}

function place(board, stones) {
  for (const [r, c, color] of stones) {
    board[r][c] = color;
  }
  return board;
}

describe('checkOmokWin', () => {
  test('정확히 5개 가로 줄이면 승리', () => {
    const board = makeBoard();
    place(board, [[7,5,'black'],[7,6,'black'],[7,7,'black'],[7,8,'black'],[7,9,'black']]);
    expect(checkOmokWin(board, 7, 9, 'black', 15)).toBe(true);
  });

  test('정확히 5개 세로 줄이면 승리', () => {
    const board = makeBoard();
    place(board, [[3,7,'white'],[4,7,'white'],[5,7,'white'],[6,7,'white'],[7,7,'white']]);
    expect(checkOmokWin(board, 7, 7, 'white', 15)).toBe(true);
  });

  test('정확히 5개 대각선이면 승리', () => {
    const board = makeBoard();
    place(board, [[3,3,'black'],[4,4,'black'],[5,5,'black'],[6,6,'black'],[7,7,'black']]);
    expect(checkOmokWin(board, 7, 7, 'black', 15)).toBe(true);
  });

  test('정확히 5개 역대각선이면 승리', () => {
    const board = makeBoard();
    place(board, [[3,7,'white'],[4,6,'white'],[5,5,'white'],[6,4,'white'],[7,3,'white']]);
    expect(checkOmokWin(board, 7, 3, 'white', 15)).toBe(true);
  });

  test('렌주룰: 6목 이상은 승리 아님', () => {
    const board = makeBoard();
    // 6개 연속 — 렌주룰 위반, 승리 아니어야 함
    place(board, [[7,4,'black'],[7,5,'black'],[7,6,'black'],[7,7,'black'],[7,8,'black'],[7,9,'black']]);
    expect(checkOmokWin(board, 7, 7, 'black', 15)).toBe(false);
  });

  test('4개 연속은 승리 아님', () => {
    const board = makeBoard();
    place(board, [[5,5,'black'],[5,6,'black'],[5,7,'black'],[5,8,'black']]);
    expect(checkOmokWin(board, 5, 8, 'black', 15)).toBe(false);
  });

  test('상대 돌로 가로막힌 경우는 승리 아님', () => {
    const board = makeBoard();
    place(board, [
      [7,5,'black'],[7,6,'black'],[7,7,'black'],[7,8,'black'],
      [7,9,'white'], // 상대 돌
      [7,10,'black']
    ]);
    expect(checkOmokWin(board, 7, 8, 'black', 15)).toBe(false);
  });

  test('보드 경계 근처 5개 연속 승리', () => {
    const board = makeBoard();
    place(board, [[0,0,'white'],[0,1,'white'],[0,2,'white'],[0,3,'white'],[0,4,'white']]);
    expect(checkOmokWin(board, 0, 0, 'white', 15)).toBe(true);
  });

  test('돌이 하나뿐이면 승리 아님', () => {
    const board = makeBoard();
    board[7][7] = 'black';
    expect(checkOmokWin(board, 7, 7, 'black', 15)).toBe(false);
  });
});

describe('getWinCells', () => {
  test('가로 5목의 셀 5개 반환', () => {
    const board = makeBoard();
    place(board, [[7,5,'black'],[7,6,'black'],[7,7,'black'],[7,8,'black'],[7,9,'black']]);
    const cells = getWinCells(board, 7, 9, 'black', 15);
    expect(cells).toHaveLength(5);
    const coords = cells.map(({ row, col }) => `${row},${col}`);
    for (let c = 5; c <= 9; c++) {
      expect(coords).toContain(`7,${c}`);
    }
  });

  test('세로 5목의 셀 5개 반환', () => {
    const board = makeBoard();
    place(board, [[3,7,'white'],[4,7,'white'],[5,7,'white'],[6,7,'white'],[7,7,'white']]);
    const cells = getWinCells(board, 5, 7, 'white', 15);
    expect(cells).toHaveLength(5);
  });

  test('승리 라인 없으면 빈 배열', () => {
    const board = makeBoard();
    place(board, [[7,5,'black'],[7,6,'black'],[7,7,'black'],[7,8,'black']]);
    const cells = getWinCells(board, 7, 8, 'black', 15);
    expect(cells).toHaveLength(0);
  });
});
