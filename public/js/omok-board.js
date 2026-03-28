// omok-board.js — 오목 보드 렌더러 (window.OmokBoard IIFE)
window.OmokBoard = (function () {
  let _size = 15; // 동적 크기 (13|15|17|19)

  let _board       = null; // 2D array [row][col] = 'black'|'white'|null
  let _myColor     = null; // 'black' | 'white'
  let _myTurn      = false;
  let _onMove      = null; // callback({ row, col })
  let _spectatorMode = false;

  let _selected    = null; // { row, col } for spectator hint selection
  let _hintTimeout = null;

  const container  = document.getElementById('omokboard');

  // ========== Public API ==========

  function init({ board, myColor, onMove, spectatorMode, boardSize }) {
    if (boardSize && boardSize.size) _size = boardSize.size;
    else if (board && board.length) _size = board.length;
    _board        = board || _emptyBoard();
    _myColor      = myColor;
    _onMove       = onMove;
    _spectatorMode = spectatorMode || false;
    _myTurn       = false;
    _selected     = null;

    _render();
  }

  function setMyTurn(bool) {
    _myTurn = bool;
    _updateCursor();
  }

  function updateAfterMove(newBoard, move) {
    _board = newBoard;
    _render();
    // Animate last stone
    if (move) {
      const cell = _getCell(move.row, move.col);
      if (cell) {
        cell.classList.add('omok-last');
        requestAnimationFrame(() => cell.classList.add('omok-placed'));
      }
    }
  }

  function highlightWin(winCells) {
    if (!winCells || !winCells.length) return;
    winCells.forEach(({ row, col }) => {
      const cell = _getCell(row, col);
      if (cell) cell.classList.add('omok-win');
    });
  }

  // Spectator hint: highlight two cells (from=row/col suggestion)
  function showHint(row, col) {
    clearHint();
    const cell = _getCell(row, col);
    if (cell) {
      cell.classList.add('omok-hint');
      _hintTimeout = setTimeout(clearHint, 3500);
    }
  }

  function clearHint() {
    clearTimeout(_hintTimeout);
    container.querySelectorAll('.omok-hint').forEach(el => el.classList.remove('omok-hint'));
    _selected = null;
    _updateHintBar();
  }

  function clearSelection() {
    _selected = null;
    container.querySelectorAll('.omok-selected').forEach(el => el.classList.remove('omok-selected'));
  }

  // ========== Rendering ==========

  function _emptyBoard() {
    return Array(_size).fill(null).map(() => Array(_size).fill(null));
  }

  function _render() {
    container.innerHTML = '';
    container.className = 'omok-grid';
    // 보드 크기에 따라 열 수 동적 설정
    container.style.gridTemplateColumns = `repeat(${_size}, 36px)`;
    // 격자선 간격도 보드 크기에 맞게 동적 설정
    const gaps = _size - 1;
    container.style.backgroundImage = [
      `repeating-linear-gradient(0deg,transparent,transparent calc(100% / ${gaps} - 1px),#8b6c34 calc(100% / ${gaps} - 1px),#8b6c34 calc(100% / ${gaps}))`,
      `repeating-linear-gradient(90deg,transparent,transparent calc(100% / ${gaps} - 1px),#8b6c34 calc(100% / ${gaps} - 1px),#8b6c34 calc(100% / ${gaps}))`
    ].join(',');

    for (let row = 0; row < _size; row++) {
      for (let col = 0; col < _size; col++) {
        const cell = document.createElement('div');
        cell.className   = 'omok-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        // Grid line classes for border corners/edges
        const edgeClass = _getEdgeClass(row, col);
        if (edgeClass) cell.classList.add(edgeClass);

        const stone = _board[row][col];
        if (stone) {
          const dot = document.createElement('div');
          dot.className = `omok-stone omok-${stone}`;
          cell.appendChild(dot);
          // Center star point (tengen + hoshi)
          if (_isStarPoint(row, col)) {
            cell.classList.add('omok-star');
          }
        } else if (_isStarPoint(row, col)) {
          cell.classList.add('omok-star');
        }

        cell.addEventListener('click', () => _onCellClick(row, col));
        cell.addEventListener('mouseenter', () => _onCellHover(row, col, true));
        cell.addEventListener('mouseleave', () => _onCellHover(row, col, false));

        container.appendChild(cell);
      }
    }
  }

  function _getEdgeClass(row, col) {
    const top    = row === 0;
    const bottom = row === _size - 1;
    const left   = col === 0;
    const right  = col === _size - 1;
    if (top && left)     return 'omok-corner-tl';
    if (top && right)    return 'omok-corner-tr';
    if (bottom && left)  return 'omok-corner-bl';
    if (bottom && right) return 'omok-corner-br';
    if (top)             return 'omok-edge-top';
    if (bottom)          return 'omok-edge-bottom';
    if (left)            return 'omok-edge-left';
    if (right)           return 'omok-edge-right';
    return null;
  }

  function _isStarPoint(row, col) {
    const starMap = { 13: [3, 6, 9], 15: [3, 7, 11], 17: [3, 8, 13], 19: [3, 9, 15] };
    const stars = starMap[_size] || [3, Math.floor(_size / 2), _size - 4];
    return stars.includes(row) && stars.includes(col);
  }

  function _getCell(row, col) {
    return container.querySelector(`.omok-cell[data-row="${row}"][data-col="${col}"]`);
  }

  function _updateCursor() {
    container.classList.toggle('omok-my-turn', _myTurn);
  }

  // ========== Interaction ==========

  function _onCellClick(row, col) {
    if (_spectatorMode) {
      _handleSpectatorClick(row, col);
      return;
    }
    if (!_myTurn) return;
    if (_board[row][col] !== null) return;
    _onMove && _onMove({ row, col });
  }

  function _onCellHover(row, col, entering) {
    if (!_myTurn || _spectatorMode) return;
    const cell = _getCell(row, col);
    if (!cell || _board[row][col] !== null) return;
    if (entering) {
      cell.classList.add('omok-ghost');
      cell.dataset.ghostColor = _myColor;
    } else {
      cell.classList.remove('omok-ghost');
    }
  }

  // Spectator hint: click to immediately suggest a position
  function _handleSpectatorClick(row, col) {
    if (_board[row][col] !== null) return; // occupied
    // 시각적 피드백
    clearSelection();
    _selected = { row, col };
    const cell = _getCell(row, col);
    if (cell) cell.classList.add('omok-selected');
    _updateHintBar();
    // 즉시 훈수 전송
    _onMove && _onMove({ row, col });
    // 잠깐 후 선택 해제
    setTimeout(() => clearSelection(), 600);
  }

  function _updateHintBar() {
    const label  = document.getElementById('spectator-hint-status');
    const cancel = document.getElementById('spectator-cancel-hint');
    if (!label || !cancel) return;

    if (_selected) {
      const colLetter = String.fromCharCode(65 + _selected.col);
      const rowLabel  = _size - _selected.row;
      label.textContent  = `제안: ${colLetter}${rowLabel} — 전송 버튼을 누르세요`;
      cancel.style.display = '';
    } else {
      label.textContent  = '교차점을 클릭하여 훈수 위치를 선택하세요';
      cancel.style.display = 'none';
    }
  }

  // Called by game.js when spectator clicks "send hint"
  function getSelectedHint() {
    return _selected ? { ..._selected } : null;
  }

  return {
    init,
    setMyTurn,
    updateAfterMove,
    highlightWin,
    showHint,
    clearHint,
    clearSelection,
    getSelectedHint,
  };
})();
