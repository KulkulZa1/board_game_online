// othello-board.js — 오셀로 보드 렌더러 (window.OthelloBoard IIFE)
window.OthelloBoard = (function () {
  const SIZE = 8;

  let _board       = null; // 2D array [row][col] = 'white'|'black'|null
  let _myColor     = null;
  let _myTurn      = false;
  let _onMove      = null; // callback({ row, col })
  let _spectatorMode = false;
  let _validMoves  = [];   // [{ row, col }]
  let _lastMove    = null; // { row, col }

  const container = document.getElementById('othelloboard');

  // ========== Public API ==========

  function init({ board, myColor, onMove, spectatorMode, validMoves }) {
    _board         = board || _emptyBoard();
    _myColor       = myColor;
    _onMove        = onMove;
    _spectatorMode = spectatorMode || false;
    _myTurn        = false;
    _validMoves    = validMoves || [];
    _lastMove      = null;
    _render();
  }

  function setMyTurn(bool) {
    _myTurn = bool;
    _updateValidMoves();
  }

  function setValidMoves(moves) {
    _validMoves = moves || [];
    _updateValidMoves();
  }

  function updateAfterMove(newBoard, move, newValidMoves) {
    _board      = newBoard;
    _lastMove   = move ? { row: move.row, col: move.col } : null;
    _validMoves = newValidMoves || [];
    _render();
    // 뒤집기 애니메이션
    if (move && move.flipped) {
      move.flipped.forEach(({ r, c }) => {
        const cell = _getCell(r, c);
        if (cell) {
          const piece = cell.querySelector('.othello-piece');
          if (piece) {
            piece.classList.add('othello-flip');
            setTimeout(() => piece.classList.remove('othello-flip'), 400);
          }
        }
      });
    }
    _updateScores(newBoard);
  }

  function clearSelection() {
    _validMoves = [];
    _updateValidMoves();
  }

  // ========== Rendering ==========

  function _emptyBoard() {
    const b = Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
    b[3][3] = 'white'; b[3][4] = 'black';
    b[4][3] = 'black'; b[4][4] = 'white';
    return b;
  }

  function _render() {
    container.innerHTML = '';
    container.className = 'othello-wrapper';

    // 점수 표시줄
    const scoreBar = document.createElement('div');
    scoreBar.className = 'othello-scorebar';
    scoreBar.id = 'othello-scorebar';

    const blackScore = document.createElement('span');
    blackScore.className = 'othello-score-black';
    blackScore.id = 'othello-score-black';

    const whiteScore = document.createElement('span');
    whiteScore.className = 'othello-score-white';
    whiteScore.id = 'othello-score-white';

    scoreBar.appendChild(blackScore);
    scoreBar.appendChild(whiteScore);
    container.appendChild(scoreBar);

    // 보드
    const grid = document.createElement('div');
    grid.className = 'othello-grid';
    grid.id = 'othello-grid';

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const cell = document.createElement('div');
        cell.className = 'othello-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        const stone = _board[row][col];
        if (stone) {
          const piece = document.createElement('div');
          piece.className = `othello-piece othello-${stone}`;
          if (_lastMove && _lastMove.row === row && _lastMove.col === col) {
            piece.classList.add('othello-last');
          }
          cell.appendChild(piece);
        }

        cell.addEventListener('click', () => _onCellClick(row, col));
        cell.addEventListener('mouseenter', () => _onCellHover(row, col, true));
        cell.addEventListener('mouseleave', () => _onCellHover(row, col, false));

        grid.appendChild(cell);
      }
    }
    container.appendChild(grid);

    _updateValidMoves();
    _updateScores(_board);
  }

  function _getCell(row, col) {
    const grid = container.querySelector('.othello-grid');
    return grid ? grid.querySelector(`.othello-cell[data-row="${row}"][data-col="${col}"]`) : null;
  }

  function _updateValidMoves() {
    const grid = container.querySelector('.othello-grid');
    if (!grid) return;
    // 모든 valid 클래스 제거
    grid.querySelectorAll('.othello-valid').forEach(el => el.classList.remove('othello-valid'));

    if (!_myTurn) return;
    _validMoves.forEach(({ row, col }) => {
      const cell = _getCell(row, col);
      if (cell && !cell.querySelector('.othello-piece')) {
        cell.classList.add('othello-valid');
      }
    });
  }

  function _updateScores(board) {
    let white = 0, black = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell === 'white') white++;
        else if (cell === 'black') black++;
      }
    }
    const bEl = document.getElementById('othello-score-black');
    const wEl = document.getElementById('othello-score-white');
    if (bEl) bEl.textContent = `⬤ ${black}`;
    if (wEl) wEl.textContent = `○ ${white}`;
  }

  // ========== Interaction ==========

  function _onCellClick(row, col) {
    if (_spectatorMode) {
      _onMove && _onMove({ row, col });
      return;
    }
    if (!_myTurn) return;
    if (_board[row][col] !== null) return;
    const isValid = _validMoves.some(m => m.row === row && m.col === col);
    if (!isValid) return;
    _onMove && _onMove({ row, col });
  }

  function _onCellHover(row, col, entering) {
    if (!_myTurn || _spectatorMode) return;
    const cell = _getCell(row, col);
    if (!cell) return;
    if (entering) cell.classList.add('othello-hover');
    else          cell.classList.remove('othello-hover');
  }

  return {
    init,
    setMyTurn,
    setValidMoves,
    updateAfterMove,
    clearSelection,
    clearHint: clearSelection,
    showHint: (row, col) => {
      const cell = _getCell(row, col);
      if (cell) {
        cell.classList.add('othello-hint');
        setTimeout(() => cell.classList.remove('othello-hint'), 3500);
      }
    },
  };
})();
