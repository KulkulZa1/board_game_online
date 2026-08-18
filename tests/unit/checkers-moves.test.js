// tests/unit/checkers-moves.test.js — 체커스 이동 규칙 단위 테스트
const {
  initCheckersBoard,
  getJumpCheckersMovesForPiece,
  getSimpleCheckersMovesForPiece,
  getValidCheckersMovesForPiece,
  getAllCheckersValidMoves,
  hasCheckersJumps,
} = require('../../server/handlers/checkers');

function emptyBoard() {
  return Array(8).fill(null).map(() => Array(8).fill(null));
}

describe('initCheckersBoard', () => {
  test('흑 말 12개 배치됨', () => {
    const board = initCheckersBoard();
    const blacks = board.flat().filter(p => p && p.color === 'black');
    expect(blacks).toHaveLength(12);
  });

  test('백 말 12개 배치됨', () => {
    const board = initCheckersBoard();
    const whites = board.flat().filter(p => p && p.color === 'white');
    expect(whites).toHaveLength(12);
  });

  test('모든 말은 홀수 칸에만 배치 (row+col 홀수)', () => {
    const board = initCheckersBoard();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]) {
          expect((r + c) % 2).toBe(1);
        }
      }
    }
  });

  test('흑은 위쪽 3행, 백은 아래쪽 3행', () => {
    const board = initCheckersBoard();
    for (let r = 0; r < 3; r++) {
      board[r].forEach(p => { if (p) expect(p.color).toBe('black'); });
    }
    for (let r = 5; r < 8; r++) {
      board[r].forEach(p => { if (p) expect(p.color).toBe('white'); });
    }
  });

  test('초기 말은 모두 킹 아님', () => {
    const board = initCheckersBoard();
    board.flat().filter(Boolean).forEach(p => expect(p.king).toBe(false));
  });
});

describe('getJumpCheckersMovesForPiece', () => {
  test('점프 가능한 상대 말이 있으면 점프 이동 반환', () => {
    const board = emptyBoard();
    board[4][4] = { color: 'white', king: false };
    board[3][3] = { color: 'black', king: false }; // 상대
    // white는 위로 이동 (-1행) — 점프 결과는 (2,2)
    const moves = getJumpCheckersMovesForPiece(board, 4, 4, { color: 'white', king: false });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ to: { row: 2, col: 2 }, isJump: true });
  });

  test('착지 칸이 막혀 있으면 점프 없음', () => {
    const board = emptyBoard();
    board[4][4] = { color: 'white', king: false };
    board[3][3] = { color: 'black', king: false };
    board[2][2] = { color: 'white', king: false }; // 착지 칸 막힘
    const moves = getJumpCheckersMovesForPiece(board, 4, 4, { color: 'white', king: false });
    expect(moves).toHaveLength(0);
  });

  test('같은 색 말은 점프 대상 아님', () => {
    const board = emptyBoard();
    board[4][4] = { color: 'white', king: false };
    board[3][3] = { color: 'white', king: false }; // 같은 색
    const moves = getJumpCheckersMovesForPiece(board, 4, 4, { color: 'white', king: false });
    expect(moves).toHaveLength(0);
  });

  test('킹은 앞뒤 모두 점프 가능', () => {
    const board = emptyBoard();
    board[4][4] = { color: 'white', king: true };
    board[3][3] = { color: 'black', king: false }; // 앞
    board[5][3] = { color: 'black', king: false }; // 뒤
    const moves = getJumpCheckersMovesForPiece(board, 4, 4, { color: 'white', king: true });
    expect(moves.length).toBeGreaterThanOrEqual(2);
  });

  test('일반 흑 말은 아래 방향으로만 점프', () => {
    const board = emptyBoard();
    board[3][3] = { color: 'black', king: false };
    board[4][4] = { color: 'white', king: false }; // 아래 오른쪽
    board[2][2] = { color: 'white', king: false }; // 위 왼쪽 (일반 말은 이쪽 불가)
    const moves = getJumpCheckersMovesForPiece(board, 3, 3, { color: 'black', king: false });
    // 착지 칸 (5,5)은 비어 있어야 함
    expect(moves.some(m => m.to.row === 5)).toBe(true);
    expect(moves.every(m => m.to.row > 3)).toBe(true); // 아래 방향만
  });
});

describe('getSimpleCheckersMovesForPiece', () => {
  test('두 방향 모두 비어 있으면 이동 2개', () => {
    const board = emptyBoard();
    const piece = { color: 'white', king: false };
    const moves = getSimpleCheckersMovesForPiece(board, 4, 4, piece);
    expect(moves).toHaveLength(2);
    moves.forEach(m => expect(m.isJump).toBe(false));
  });

  test('한쪽이 막혀 있으면 이동 1개', () => {
    const board = emptyBoard();
    board[3][3] = { color: 'black', king: false }; // 왼쪽 위 막힘
    const piece = { color: 'white', king: false };
    const moves = getSimpleCheckersMovesForPiece(board, 4, 4, piece);
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual({ row: 3, col: 5 });
  });

  test('보드 끝에 있으면 이동 없음', () => {
    const board = emptyBoard();
    const piece = { color: 'white', king: false };
    // (0, 0) — white는 위로 가야 하는데 이미 경계
    const moves = getSimpleCheckersMovesForPiece(board, 0, 0, piece);
    expect(moves).toHaveLength(0);
  });
});

describe('getAllCheckersValidMoves', () => {
  test('초기 보드에서 흑 이동 가능', () => {
    const board = initCheckersBoard();
    const moves = getAllCheckersValidMoves(board, 'black');
    expect(moves.length).toBeGreaterThan(0);
  });

  test('초기 보드에서 백 이동 가능', () => {
    const board = initCheckersBoard();
    const moves = getAllCheckersValidMoves(board, 'white');
    expect(moves.length).toBeGreaterThan(0);
  });

  test('점프가 있으면 일반 이동은 포함 안 됨 (강제 점프)', () => {
    const board = emptyBoard();
    board[5][1] = { color: 'white', king: false };
    board[4][2] = { color: 'black', king: false }; // 점프 대상
    // (3,3) 착지 칸은 비어 있음
    const moves = getAllCheckersValidMoves(board, 'white');
    // 모두 점프여야 함
    moves.forEach(m => expect(m.isJump).toBe(true));
  });
});

describe('hasCheckersJumps', () => {
  test('점프 가능한 말이 있으면 true', () => {
    const board = emptyBoard();
    board[5][1] = { color: 'white', king: false };
    board[4][2] = { color: 'black', king: false };
    expect(hasCheckersJumps(board, 'white')).toBe(true);
  });

  test('점프 가능한 말이 없으면 false', () => {
    const board = emptyBoard();
    board[5][1] = { color: 'white', king: false };
    expect(hasCheckersJumps(board, 'white')).toBe(false);
  });

  test('초기 보드에서는 양쪽 모두 점프 불가', () => {
    const board = initCheckersBoard();
    expect(hasCheckersJumps(board, 'white')).toBe(false);
    expect(hasCheckersJumps(board, 'black')).toBe(false);
  });
});
