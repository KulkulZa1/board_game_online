// connect4-board.js — 사목 보드 렌더러 (window.Connect4Board IIFE)
window.Connect4Board = (function () {
  const ROWS = 6;
  const COLS = 7;

  let _board      = null; // 2D array [row][col] = 'white'|'black'|null
  let _myColor    = null; // 'white'(=red) | 'black'(=yellow)
  let _myTurn     = false;
  let _onMove     = null; // callback({ col })
  let _spectatorMode = false;
  let _colHeights = null; // [0..6] 각 열의 쌓인 돌 수

  const container = document.getElementById('connect4board');

  // Color display mapping: 내부 'white' = 빨강, 'black' = 노랑
  function getPieceClass(color) {
    return color === 'white' ? 'c4-red' : 'c4-yellow';
  }

  // ========== Public API ==========

  function init({ board, myColor, onMove, spectatorMode, colHeights }) {
    _board         = board || _emptyBoard();
    _myColor       = myColor;
    _onMove        = onMove;
    _spectatorMode = spectatorMode || false;
    _myTurn        = false;
    _colHeights    = colHeights || Array(COLS).fill(0);
    _render();
  }

  function setMyTurn(bool) {
    _myTurn = bool;
    _updateCursor();
  }

  function updateAfterMove(newBoard, move, newColHeights) {
    _board      = newBoard;
    _colHeights = newColHeights || _colHeights;
    _render();
    // 낙하 애니메이션
    if (move) {
      const cell = _getCell(move.row, move.col);
      if (cell) {
        cell.classList.add('c4-drop');
        requestAnimationFrame(() => cell.classList.add('c4-dropped'));
      }
    }
  }

  function highlightWin(winCells) {
    if (!winCells || !winCells.length) return;
    winCells.forEach(({ row, col }) => {
      const cell = _getCell(row, col);
      if (cell) cell.classList.add('c4-win');
    });
  }

  function clearSelection() {
    container.querySelectorAll('.c4-ghost').forEach(el => el.classList.remove('c4-ghost'));
  }

  // ========== Rendering ==========

  function _emptyBoard() {
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
  }

  function _render() {
    container.innerHTML = '';
    container.className = 'c4-grid';

    // 열 버튼 (위에 화살표)
    const arrowRow = document.createElement('div');
    arrowRow.className = 'c4-arrows';
    for (let col = 0; col < COLS; col++) {
      const arrow = document.createElement('button');
      arrow.className = 'c4-arrow-btn';
      arrow.textContent = '▼';
      arrow.dataset.col = col;
      arrow.addEventListener('click', () => _onColClick(col));
      arrowRow.appendChild(arrow);
    }
    container.appendChild(arrowRow);

    // 보드 격자
    const grid = document.createElement('div');
    grid.className = 'c4-board';
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = document.createElement('div');
        cell.className = 'c4-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        const piece = document.createElement('div');
        const stone = _board[row][col];
        piece.className = 'c4-piece' + (stone ? ' ' + getPieceClass(stone) : '');
        cell.appendChild(piece);

        grid.appendChild(cell);
      }
    }
    container.appendChild(grid);
    _updateCursor();
  }

  function _getCell(row, col) {
    return container.querySelector(`.c4-cell[data-row="${row}"][data-col="${col}"]`);
  }

  function _updateCursor() {
    container.classList.toggle('c4-my-turn', _myTurn);
    container.querySelectorAll('.c4-arrow-btn').forEach((btn, col) => {
      const full = _colHeights && _colHeights[col] >= ROWS;
      btn.disabled = !_myTurn || full;
      btn.classList.toggle('c4-arrow-disabled', full);
    });
  }

  // ========== Interaction ==========

  function _onColClick(col) {
    if (!_myTurn) return;
    if (_colHeights && _colHeights[col] >= ROWS) return;
    _onMove && _onMove({ col });
  }

  return {
    init,
    setMyTurn,
    updateAfterMove,
    highlightWin,
    clearSelection,
    clearHint: clearSelection,
  };
})();
