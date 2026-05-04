// applegame-board.js — 사과게임 보드 렌더러 (드래그 선택 지원)
window.AppleGameBoard = (function () {
  const ROWS = 10;
  const COLS = 17;

  let _board     = null;
  let _myColor   = null;
  let _myTurn    = false;
  let _onMove    = null;
  let _scores    = { white: 0, black: 0 };
  let _spectator = false;

  let _container = null;
  let _grid      = null;
  let _scoreBar  = null;
  let _sumDisplay = null;

  // 드래그 상태
  let _dragging  = false;
  let _dragStart = null;
  let _dragEnd   = null;
  let _selDiv    = null;

  // ===== 공개 API =====

  function init({ board, myColor, onMove, spectatorMode, scores }) {
    _board     = board || _emptyBoard();
    _myColor   = myColor;
    _onMove    = onMove;
    _spectator = spectatorMode || false;
    _myTurn    = false;
    _scores    = scores ? { white: scores.white || 0, black: scores.black || 0 } : { white: 0, black: 0 };

    _container = document.getElementById('applegameboard');
    if (!_container) return;
    _render();
  }

  function setMyTurn(bool) {
    _myTurn = bool;
    if (_container) _container.classList.toggle('ag-my-turn', bool);
  }

  function updateAfterMove(newBoard, move, newScores) {
    _board  = newBoard;
    if (newScores) _scores = { white: newScores.white || 0, black: newScores.black || 0 };
    _render();
  }

  function clearSelection() {
    _cancelDrag();
  }

  // ===== 렌더링 =====

  function _emptyBoard() {
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
  }

  function _render() {
    if (!_container) return;
    _container.innerHTML = '';
    _container.className = 'ag-wrapper';

    // 점수 바
    _scoreBar = document.createElement('div');
    _scoreBar.className = 'ag-scorebar';
    _updateScoreBar();
    _container.appendChild(_scoreBar);

    // 합계 표시
    _sumDisplay = document.createElement('div');
    _sumDisplay.className = 'ag-sum-display';
    _sumDisplay.textContent = '';
    _container.appendChild(_sumDisplay);

    // 그리드 래퍼 (선택 오버레이 포지셔닝용)
    const gridWrap = document.createElement('div');
    gridWrap.className = 'ag-grid-wrap';

    _grid = document.createElement('div');
    _grid.className = 'ag-grid';
    _grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    _grid.style.gridTemplateRows    = `repeat(${ROWS}, 1fr)`;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const val  = _board[row][col];
        const cell = document.createElement('div');
        cell.className   = 'ag-cell' + (val === null ? ' ag-empty' : ` ag-num-${val}`);
        cell.dataset.row = row;
        cell.dataset.col = col;

        if (val !== null) {
          const span = document.createElement('span');
          span.textContent = val;
          cell.appendChild(span);
        }

        _grid.appendChild(cell);
      }
    }

    // 선택 오버레이
    _selDiv = document.createElement('div');
    _selDiv.className = 'ag-selection';
    _selDiv.style.display = 'none';
    _selDiv.style.pointerEvents = 'none';

    gridWrap.appendChild(_grid);
    gridWrap.appendChild(_selDiv);
    _container.appendChild(gridWrap);

    if (!_spectator) {
      _attachEvents();
    }
    _container.classList.toggle('ag-my-turn', _myTurn);
  }

  function _updateScoreBar() {
    if (!_scoreBar) return;
    _scoreBar.innerHTML =
      `<span class="ag-score-white">백 🍎 ${_scores.white}개</span>` +
      `<span class="ag-score-sep">VS</span>` +
      `<span class="ag-score-black">흑 🍎 ${_scores.black}개</span>`;
  }

  // ===== 드래그 선택 =====

  function _getCellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = el.closest ? el.closest('.ag-cell') : null;
    if (!cell) return null;
    const row = parseInt(cell.dataset.row, 10);
    const col = parseInt(cell.dataset.col, 10);
    if (isNaN(row) || isNaN(col)) return null;
    return { row, col };
  }

  function _attachEvents() {
    // 마우스 이벤트
    _grid.addEventListener('mousedown', (e) => {
      if (!_myTurn) return;
      e.preventDefault();
      const pos = _getCellAt(e.clientX, e.clientY);
      if (!pos) return;
      _startDrag(pos);
    });

    window.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('mouseup',   _onMouseUp);

    // 터치 이벤트
    _grid.addEventListener('touchstart', (e) => {
      if (!_myTurn) return;
      e.preventDefault();
      const t = e.touches[0];
      const pos = _getCellAt(t.clientX, t.clientY);
      if (!pos) return;
      _startDrag(pos);
    }, { passive: false });

    _grid.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!_dragging) return;
      const t = e.touches[0];
      const pos = _getCellAt(t.clientX, t.clientY);
      if (!pos) return;
      _dragEnd = pos;
      _updateOverlay();
    }, { passive: false });

    _grid.addEventListener('touchend', (e) => {
      e.preventDefault();
      _finishDrag();
    });
  }

  function _onMouseMove(e) {
    if (!_dragging) return;
    const pos = _getCellAt(e.clientX, e.clientY);
    if (pos) { _dragEnd = pos; _updateOverlay(); }
  }

  function _onMouseUp() {
    if (!_dragging) return;
    _finishDrag();
  }

  function _startDrag(pos) {
    _dragging  = true;
    _dragStart = pos;
    _dragEnd   = pos;
    if (_selDiv) _selDiv.style.display = '';
    _updateOverlay();
  }

  function _cancelDrag() {
    _dragging  = false;
    _dragStart = null;
    _dragEnd   = null;
    if (_selDiv) _selDiv.style.display = 'none';
    if (_sumDisplay) _sumDisplay.textContent = '';
  }

  function _getRect() {
    if (!_dragStart || !_dragEnd) return null;
    return {
      row1: Math.min(_dragStart.row, _dragEnd.row),
      col1: Math.min(_dragStart.col, _dragEnd.col),
      row2: Math.max(_dragStart.row, _dragEnd.row),
      col2: Math.max(_dragStart.col, _dragEnd.col),
    };
  }

  function _computeSum(rect) {
    let sum = 0;
    for (let r = rect.row1; r <= rect.row2; r++) {
      for (let c = rect.col1; c <= rect.col2; c++) {
        if (_board[r][c] === null) continue; // 빈 칸 건너뜀
        sum += _board[r][c];
      }
    }
    return sum;
  }

  function _updateOverlay() {
    const rect = _getRect();
    if (!rect || !_grid || !_selDiv) return;

    const firstCell = _grid.querySelector(`[data-row="${rect.row1}"][data-col="${rect.col1}"]`);
    const lastCell  = _grid.querySelector(`[data-row="${rect.row2}"][data-col="${rect.col2}"]`);
    if (!firstCell || !lastCell) return;

    const gridRect = _grid.getBoundingClientRect();
    const c1Rect   = firstCell.getBoundingClientRect();
    const c2Rect   = lastCell.getBoundingClientRect();

    _selDiv.style.left   = (c1Rect.left   - gridRect.left)  + 'px';
    _selDiv.style.top    = (c1Rect.top    - gridRect.top)   + 'px';
    _selDiv.style.width  = (c2Rect.right  - c1Rect.left)    + 'px';
    _selDiv.style.height = (c2Rect.bottom - c1Rect.top)     + 'px';

    const sum = _computeSum(rect);
    const cellCount = (rect.row2 - rect.row1 + 1) * (rect.col2 - rect.col1 + 1);

    _selDiv.classList.toggle('ag-sel-valid',   sum === 10);
    _selDiv.classList.toggle('ag-sel-invalid', sum !== 10);
    _selDiv.classList.remove('ag-sel-null');

    if (_sumDisplay) {
      _sumDisplay.textContent = `합: ${sum}${sum === 10 ? ` ✓ (${cellCount}개)` : ''}`;
      _sumDisplay.className = 'ag-sum-display' + (sum === 10 ? ' ag-sum-valid' : ' ag-sum-invalid');
    }
  }

  function _finishDrag() {
    if (!_dragging) return;
    const rect = _getRect();
    _cancelDrag();
    if (!rect) return;
    const sum = _computeSum(rect);
    if (sum === 10 && _onMove) {
      _onMove(rect);
    }
  }

  return {
    init,
    setMyTurn,
    updateAfterMove,
    clearSelection,
    clearHint: clearSelection,
  };
})();
