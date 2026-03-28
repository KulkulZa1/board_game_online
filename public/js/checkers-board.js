// checkers-board.js — 체커 보드 렌더러 (window.CheckersBoard IIFE)
window.CheckersBoard = (function () {
  const SIZE = 8;

  let _board       = null; // 2D [row][col] = { color:'white'|'black', king:false } | null
  let _myColor     = null;
  let _myTurn      = false;
  let _onMove      = null; // callback({ from: {row,col}, to: {row,col} })
  let _spectatorMode = false;
  let _validMoves  = [];   // [{ from:{row,col}, to:{row,col}, isJump }]
  let _mustJump    = null; // { row, col } — 연속 점프 중인 말 위치
  let _selected    = null; // { row, col } — 선택된 말

  const container = document.getElementById('checkersboard');

  // ========== Public API ==========

  function init({ board, myColor, onMove, spectatorMode, validMoves, mustJump }) {
    _board         = board  || _emptyBoard();
    _myColor       = myColor;
    _onMove        = onMove;
    _spectatorMode = spectatorMode || false;
    _myTurn        = false;
    _validMoves    = validMoves || [];
    _mustJump      = mustJump   || null;
    _selected      = null;
    _render();
  }

  function setMyTurn(bool) {
    _myTurn = bool;
    if (!bool) {
      _selected = null;
      _clearHighlights();
    }
    _updateCursor();
  }

  function updateAfterMove(newBoard, move, newValidMoves, newMustJump) {
    _board      = newBoard;
    _validMoves = newValidMoves || [];
    _mustJump   = newMustJump   || null;
    _selected   = null;
    _render();
    // 이동 애니메이션
    if (move && move.to) {
      const cell = _getCell(move.to.row, move.to.col);
      if (cell) cell.classList.add('ck-last');
    }
  }

  function setValidMoves(moves, mustJump) {
    _validMoves = moves  || [];
    _mustJump   = mustJump || null;
    _selected   = null;
    _clearHighlights();
    _updateCursor();
  }

  function highlightWin(winCells) {
    // 체커는 별도 win cell 없음
  }

  function clearSelection() {
    _selected = null;
    _clearHighlights();
  }

  // ========== Rendering ==========

  function _emptyBoard() {
    return Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
  }

  function _render() {
    container.innerHTML = '';
    container.className = 'ck-grid';

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const isDark = (row + col) % 2 === 1;
        const cell = document.createElement('div');
        cell.className = 'ck-cell ' + (isDark ? 'ck-dark' : 'ck-light');
        cell.dataset.row = row;
        cell.dataset.col = col;

        if (isDark) {
          const piece = _board[row][col];
          if (piece) {
            const dot = document.createElement('div');
            dot.className = `ck-piece ck-${piece.color}` + (piece.king ? ' ck-king' : '');
            if (piece.king) {
              const crown = document.createElement('span');
              crown.className = 'ck-crown';
              crown.textContent = '♛';
              dot.appendChild(crown);
            }
            cell.appendChild(dot);
          }
          cell.addEventListener('click', () => _onCellClick(row, col));
        }

        container.appendChild(cell);
      }
    }
    _updateCursor();
  }

  function _getCell(row, col) {
    return container.querySelector(`.ck-cell[data-row="${row}"][data-col="${col}"]`);
  }

  function _updateCursor() {
    container.classList.toggle('ck-my-turn', _myTurn);
  }

  function _clearHighlights() {
    container.querySelectorAll('.ck-selected, .ck-movable, .ck-can-move').forEach(el => {
      el.classList.remove('ck-selected', 'ck-movable', 'ck-can-move');
    });
  }

  // ========== Interaction ==========

  function _onCellClick(row, col) {
    if (_spectatorMode) {
      _onMove && _onMove({ from: { row, col }, to: { row, col } });
      return;
    }
    if (!_myTurn) return;

    const piece = _board[row][col];

    // 이미 선택된 말이 있는 경우 → 목적지 선택
    if (_selected) {
      const target = _validMoves.find(m =>
        m.from.row === _selected.row && m.from.col === _selected.col &&
        m.to.row === row && m.to.col === col
      );
      if (target) {
        _clearHighlights();
        _onMove && _onMove({ from: _selected, to: { row, col } });
        _selected = null;
        return;
      }
    }

    // 내 말 선택
    if (piece && piece.color === _myColor) {
      // mustJump 중이면 해당 말만 선택 가능
      if (_mustJump && (_mustJump.row !== row || _mustJump.col !== col)) return;

      _clearHighlights();
      _selected = { row, col };

      const cell = _getCell(row, col);
      if (cell) cell.classList.add('ck-selected');

      // 이 말의 이동 가능 칸 하이라이트
      const myMoves = _validMoves.filter(m => m.from.row === row && m.from.col === col);
      myMoves.forEach(m => {
        const dest = _getCell(m.to.row, m.to.col);
        if (dest) dest.classList.add('ck-movable');
      });
      return;
    }

    // 빈 칸 클릭 (말 선택 해제)
    _clearHighlights();
    _selected = null;
  }

  return {
    init,
    setMyTurn,
    updateAfterMove,
    setValidMoves,
    highlightWin,
    clearSelection,
    clearHint: clearSelection,
    showHint: (row, col) => {
      const cell = _getCell(row, col);
      if (cell) {
        cell.classList.add('ck-hint');
        setTimeout(() => cell.classList.remove('ck-hint'), 3500);
      }
    },
  };
})();
