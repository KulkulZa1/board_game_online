// battleship-board.js — 배틀십 보드 렌더러
window.BattleshipBoard = (function () {
  const ROWS = 10, COLS = 10;
  const COL_LABELS = ['A','B','C','D','E','F','G','H','I','J'];
  const ROW_LABELS = ['1','2','3','4','5','6','7','8','9','10'];

  const SHIPS_DEF = [
    { name: 'carrier',    size: 5, label: '항공모함' },
    { name: 'battleship', size: 4, label: '전함'     },
    { name: 'cruiser',    size: 3, label: '순양함'   },
    { name: 'submarine',  size: 3, label: '잠수함'   },
    { name: 'destroyer',  size: 2, label: '구축함'   },
  ];

  // ===== 내부 상태 =====
  let _myColor       = 'white';
  let _phase         = 'placement';   // 'placement' | 'active'
  let _onMove        = null;
  let _spectatorMode = false;
  let _myTurn        = false;

  // 배치 상태
  let _placedShips      = {};    // shipName → { name, cells }
  let _selectedShip     = null;  // 현재 선택된 함선 이름
  let _orientation      = 'H';   // 'H' | 'V'
  let _previewCells     = [];    // 미리보기 셀 좌표
  let _previewValid     = false;

  // 활성 단계 상태
  let _attackGrids      = { white: null, black: null };
  let _myShipGrid       = null;   // 내 함선 위치 (배치 후 저장)
  let _lastShot         = null;   // { row, col } 마지막 포격

  // ===== 공개 API =====

  function init({ myColor, onMove, spectatorMode }) {
    _myColor       = myColor || 'white';
    _onMove        = onMove  || function () {};
    _spectatorMode = !!spectatorMode;
    _phase         = 'placement';
    _placedShips   = {};
    _selectedShip  = null;
    _orientation   = 'H';
    _lastShot      = null;
    _attackGrids   = { white: _emptyGrid(), black: _emptyGrid() };
    _myShipGrid    = null;

    _renderPlacement();
  }

  function setPhase(phase) {
    _phase = phase;
    if (phase === 'active') {
      _renderActive();
    } else {
      _renderPlacement();
    }
  }

  function setMyTurn(bool) {
    _myTurn = bool;
    _updateStatusMsg();
    _refreshAttackGridInteractivity();
  }

  function updateAfterShot(attackGrids, move) {
    _attackGrids = attackGrids;
    _lastShot    = move ? { row: move.row, col: move.col } : null;
    _renderActive();
  }

  // 관전자용: 양쪽 공격 그리드 업데이트
  function updateSpectator(attackGrids, move) {
    _attackGrids = attackGrids;
    _lastShot    = move ? { row: move.row, col: move.col } : null;
    _renderActive();
  }

  // ===== 배치 단계 렌더 =====

  function _renderPlacement() {
    const container = document.getElementById('battleshipboard');
    if (!container) return;
    container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'bs-layout';

    // 왼쪽: 배치 격자
    const gridWrap = _buildGridWrap('내 함대 배치', 'mine');
    const grid = _buildGrid('placement-grid', _buildPlacementGridCells());
    gridWrap.querySelector('.bs-grid-wrap').appendChild(grid);
    layout.appendChild(gridWrap);

    // 오른쪽: 함선 팔레트 + 컨트롤
    const palette = _buildPalette();
    layout.appendChild(palette);

    container.appendChild(layout);

    // 이벤트 연결
    _attachPlacementEvents(grid);
    _attachPaletteEvents(palette);
    _attachKeyboardEvents();
  }

  function _buildGridWrap(title, titleClass) {
    const outer = document.createElement('div');
    outer.style.display = 'flex';
    outer.style.flexDirection = 'column';
    outer.style.alignItems = 'center';
    outer.style.gap = '4px';

    const t = document.createElement('div');
    t.className = 'bs-grid-title ' + (titleClass ? 'bs-' + titleClass : '');
    t.textContent = title;
    outer.appendChild(t);

    // 열 레이블
    const colRow = document.createElement('div');
    colRow.style.display = 'flex';
    colRow.style.paddingLeft = '22px';
    for (const lbl of COL_LABELS) {
      const el = document.createElement('div');
      el.className = 'bs-col-label';
      el.textContent = lbl;
      colRow.appendChild(el);
    }
    outer.appendChild(colRow);

    // 행 레이블 + 격자 감싸기
    const gridWrap = document.createElement('div');
    gridWrap.className = 'bs-grid-wrap';
    gridWrap.style.display = 'flex';

    const rowLabels = document.createElement('div');
    rowLabels.className = 'bs-row-labels';
    rowLabels.style.display = 'flex';
    rowLabels.style.flexDirection = 'column';
    for (const lbl of ROW_LABELS) {
      const el = document.createElement('div');
      el.className = 'bs-row-label';
      el.textContent = lbl;
      rowLabels.appendChild(el);
    }
    gridWrap.appendChild(rowLabels);

    outer.appendChild(gridWrap);
    return outer;
  }

  function _buildGrid(id, cells) {
    const grid = document.createElement('div');
    grid.className = 'bs-grid';
    if (id) grid.id = id;
    for (const cell of cells) grid.appendChild(cell);
    return grid;
  }

  function _buildPlacementGridCells() {
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'bs-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        _applyPlacementCellClass(cell, r, c);
        cells.push(cell);
      }
    }
    return cells;
  }

  function _applyPlacementCellClass(cell, r, c) {
    cell.className = 'bs-cell';
    // 배치된 함선 표시
    for (const [shipName, ship] of Object.entries(_placedShips)) {
      if (ship.cells.some(({ r: sr, c: sc }) => sr === r && sc === c)) {
        cell.classList.add('bs-ship-' + shipName);
        return;
      }
    }
    // 미리보기
    const previewIdx = _previewCells.findIndex(p => p.r === r && p.c === c);
    if (previewIdx >= 0) {
      cell.classList.add(_previewValid ? 'bs-preview-valid' : 'bs-preview-invalid');
    }
  }

  function _refreshPlacementGrid() {
    const grid = document.getElementById('placement-grid');
    if (!grid) return;
    for (const cell of grid.querySelectorAll('.bs-cell')) {
      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      _applyPlacementCellClass(cell, r, c);
    }
    _updatePlaceBtn();
    _refreshPaletteItems();
  }

  function _attachPlacementEvents(grid) {
    if (_spectatorMode) return;

    grid.addEventListener('mousemove', (e) => {
      const cell = e.target.closest('.bs-cell');
      if (!cell || !_selectedShip) { _clearPreview(); return; }
      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      _updatePreview(r, c);
    });

    grid.addEventListener('mouseleave', () => {
      _clearPreview();
    });

    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.bs-cell');
      if (!cell || !_selectedShip) return;
      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      _placeShip(r, c);
    });

    // 우클릭으로 방향 전환
    grid.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      _toggleOrientation();
    });
  }

  function _attachKeyboardEvents() {
    // 기존 리스너 제거 후 재등록
    if (window._bsKeydownHandler) {
      document.removeEventListener('keydown', window._bsKeydownHandler);
    }
    window._bsKeydownHandler = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        if (_phase === 'placement') _toggleOrientation();
      }
    };
    document.addEventListener('keydown', window._bsKeydownHandler);
  }

  function _updatePreview(r, c) {
    if (!_selectedShip) { _clearPreview(); return; }
    const def = SHIPS_DEF.find(d => d.name === _selectedShip);
    if (!def) return;

    const cells = _calcShipCells(r, c, def.size, _orientation);
    _previewCells = cells;
    _previewValid = _isPlacementValid(cells, _selectedShip);
    _refreshPlacementGrid();
  }

  function _clearPreview() {
    if (_previewCells.length === 0) return;
    _previewCells = [];
    _previewValid = false;
    _refreshPlacementGrid();
  }

  function _calcShipCells(r, c, size, orientation) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      if (orientation === 'H') {
        cells.push({ r, c: c + i });
      } else {
        cells.push({ r: r + i, c });
      }
    }
    return cells;
  }

  function _isPlacementValid(cells, shipName) {
    for (const { r, c } of cells) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      // 다른 함선과 겹치는지
      for (const [name, ship] of Object.entries(_placedShips)) {
        if (name === shipName) continue;
        if (ship.cells.some(s => s.r === r && s.c === c)) return false;
      }
    }
    return true;
  }

  function _placeShip(r, c) {
    if (!_selectedShip) return;
    const def = SHIPS_DEF.find(d => d.name === _selectedShip);
    if (!def) return;

    const cells = _calcShipCells(r, c, def.size, _orientation);
    if (!_isPlacementValid(cells, _selectedShip)) return;

    _placedShips[_selectedShip] = { name: _selectedShip, cells };

    // 다음 미배치 함선 자동 선택
    const next = SHIPS_DEF.find(d => !_placedShips[d.name] && d.name !== _selectedShip);
    _selectedShip = next ? next.name : null;
    _previewCells = [];
    _previewValid = false;

    _refreshPlacementGrid();
  }

  function _toggleOrientation() {
    _orientation = _orientation === 'H' ? 'V' : 'H';
    const btn = document.querySelector('.bs-rotate-btn');
    if (btn) btn.textContent = `🔄 방향: ${_orientation === 'H' ? '가로' : '세로'}`;
    if (_previewCells.length > 0 && _selectedShip) {
      const firstCell = _previewCells[0];
      _updatePreview(firstCell.r, firstCell.c);
    }
  }

  function _buildPalette() {
    const palette = document.createElement('div');
    palette.className = 'bs-palette';

    const title = document.createElement('div');
    title.className = 'bs-palette-title';
    title.textContent = '함선 선택';
    palette.appendChild(title);

    for (const def of SHIPS_DEF) {
      const item = document.createElement('div');
      item.className = 'bs-palette-item';
      item.dataset.ship = def.name;

      const preview = document.createElement('div');
      preview.className = 'bs-palette-ship-preview';
      for (let i = 0; i < def.size; i++) {
        const dot = document.createElement('div');
        dot.className = `bs-palette-ship-cell bs-palette-${def.name}`;
        preview.appendChild(dot);
      }
      item.appendChild(preview);

      const name = document.createElement('div');
      name.className = 'bs-palette-ship-name';
      name.textContent = def.label;
      item.appendChild(name);

      const size = document.createElement('div');
      size.className = 'bs-palette-ship-size';
      size.textContent = `(${def.size})`;
      item.appendChild(size);

      palette.appendChild(item);
    }

    // 컨트롤 버튼
    const controls = document.createElement('div');
    controls.className = 'bs-placement-controls';

    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'bs-rotate-btn';
    rotateBtn.textContent = '🔄 방향: 가로';
    controls.appendChild(rotateBtn);

    const randomBtn = document.createElement('button');
    randomBtn.className = 'bs-random-btn';
    randomBtn.textContent = '🎲 랜덤 배치';
    controls.appendChild(randomBtn);

    const placeBtn = document.createElement('button');
    placeBtn.className = 'bs-place-btn';
    placeBtn.textContent = '⚓ 배치 완료';
    controls.appendChild(placeBtn);

    palette.appendChild(controls);
    return palette;
  }

  function _attachPaletteEvents(palette) {
    if (_spectatorMode) return;

    // 함선 선택
    palette.addEventListener('click', (e) => {
      const item = e.target.closest('.bs-palette-item');
      if (!item) return;
      const shipName = item.dataset.ship;
      if (_placedShips[shipName]) return;  // 이미 배치됨
      _selectedShip = shipName;
      _refreshPaletteItems();
    });

    // 방향 전환 버튼
    const rotateBtn = palette.querySelector('.bs-rotate-btn');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleOrientation();
      });
    }

    // 랜덤 배치 버튼
    const randomBtn = palette.querySelector('.bs-random-btn');
    if (randomBtn) {
      randomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _randomPlaceAll();
      });
    }

    // 배치 완료 버튼
    const placeBtn = palette.querySelector('.bs-place-btn');
    if (placeBtn) {
      placeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _confirmPlacement();
      });
    }
  }

  function _refreshPaletteItems() {
    const items = document.querySelectorAll('.bs-palette-item');
    items.forEach(item => {
      const name = item.dataset.ship;
      item.classList.toggle('bs-palette-item-placed',   !!_placedShips[name]);
      item.classList.toggle('bs-palette-item-selected', name === _selectedShip);
    });
  }

  function _updatePlaceBtn() {
    const placeBtn = document.querySelector('.bs-place-btn');
    if (!placeBtn) return;
    const allPlaced = SHIPS_DEF.every(d => _placedShips[d.name]);
    placeBtn.classList.toggle('bs-place-btn-ready', allPlaced);
  }

  function _randomPlaceAll() {
    if (typeof AIBattleship === 'undefined') return;
    const ships = AIBattleship.randomPlacement();
    if (!ships) return;

    _placedShips = {};
    for (const ship of ships) {
      // AI는 { r, c } 형식을 사용
      _placedShips[ship.name] = {
        name: ship.name,
        cells: ship.cells.map(({ r, c }) => ({ r, c })),
      };
    }
    _selectedShip = null;
    _previewCells = [];
    _refreshPlacementGrid();
  }

  function _confirmPlacement() {
    const allPlaced = SHIPS_DEF.every(d => _placedShips[d.name]);
    if (!allPlaced) return;

    // 내 함선 그리드 저장 (활성 단계에서 피격 표시용)
    _myShipGrid = _emptyGrid();
    const shipsArr = [];
    for (const def of SHIPS_DEF) {
      const ship = _placedShips[def.name];
      for (const { r, c } of ship.cells) {
        _myShipGrid[r][c] = def.name;
      }
      shipsArr.push({ name: def.name, cells: ship.cells });
    }

    if (_onMove) {
      _onMove({ action: 'place', ships: shipsArr });
    }
  }

  // ===== 활성 단계 렌더 =====

  function _renderActive() {
    const container = document.getElementById('battleshipboard');
    if (!container) return;
    container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'bs-fleet-layout';

    // 내 함대 그리드 (피격 표시)
    const myWrap = _buildFleetGridSection('내 함대', 'mine', _buildMyFleetCells());
    layout.appendChild(myWrap);

    // 상대 공격 그리드
    const enemyWrap = _buildFleetGridSection('적 함대', 'enemy', _buildEnemyGridCells());
    layout.appendChild(enemyWrap);

    container.appendChild(layout);

    // 상태 메시지
    const statusMsg = document.createElement('div');
    statusMsg.className = 'bs-status-msg' + (_myTurn ? ' bs-my-turn' : '');
    statusMsg.id = 'bs-status-msg';
    statusMsg.textContent = _myTurn ? '내 차례 — 적 격자를 클릭해 공격하세요' : '상대방 차례...';
    container.appendChild(statusMsg);

    _attachAttackEvents();
  }

  function _buildFleetGridSection(title, titleClass, cells) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '4px';

    const t = document.createElement('div');
    t.className = 'bs-grid-title bs-' + titleClass;
    t.textContent = title;
    wrap.appendChild(t);

    // 열 레이블
    const colRow = document.createElement('div');
    colRow.style.display = 'flex';
    colRow.style.paddingLeft = '22px';
    for (const lbl of COL_LABELS) {
      const el = document.createElement('div');
      el.className = 'bs-col-label';
      el.textContent = lbl;
      colRow.appendChild(el);
    }
    wrap.appendChild(colRow);

    const gridBody = document.createElement('div');
    gridBody.style.display = 'flex';

    const rowLabels = document.createElement('div');
    rowLabels.style.display = 'flex';
    rowLabels.style.flexDirection = 'column';
    for (const lbl of ROW_LABELS) {
      const el = document.createElement('div');
      el.className = 'bs-row-label';
      el.textContent = lbl;
      rowLabels.appendChild(el);
    }
    gridBody.appendChild(rowLabels);

    const gridId = titleClass === 'enemy' ? 'bs-attack-grid' : 'bs-fleet-grid';
    const grid = document.createElement('div');
    grid.className = 'bs-grid' + (titleClass === 'enemy' ? ' bs-attack-grid' : '');
    grid.id = gridId;
    for (const cell of cells) grid.appendChild(cell);
    gridBody.appendChild(grid);

    wrap.appendChild(gridBody);
    return wrap;
  }

  function _buildMyFleetCells() {
    const opponentColor = _myColor === 'white' ? 'black' : 'white';
    const attackedByOpponent = _attackGrids[opponentColor];  // 상대방이 나한테 한 공격

    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'bs-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        // 내 함선 표시
        if (_myShipGrid && _myShipGrid[r][c]) {
          cell.classList.add('bs-ship-' + _myShipGrid[r][c]);
        }

        // 피격 표시
        if (attackedByOpponent && attackedByOpponent[r][c]) {
          const result = attackedByOpponent[r][c];
          if (result === 'hit' || result === 'sunk') {
            cell.classList.add('bs-own-hit');
          }
        }

        cells.push(cell);
      }
    }
    return cells;
  }

  function _buildEnemyGridCells() {
    const myAttacks = _attackGrids[_myColor];
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'bs-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (myAttacks) {
          const result = myAttacks[r][c];
          if (result === 'hit')  cell.classList.add('bs-hit');
          else if (result === 'sunk') cell.classList.add('bs-sunk');
          else if (result === 'miss') cell.classList.add('bs-miss');
          else if (_myTurn)           cell.classList.add('bs-available');
        } else if (_myTurn) {
          cell.classList.add('bs-available');
        }

        // 마지막 포격 강조
        if (_lastShot && _lastShot.row === r && _lastShot.col === c) {
          cell.classList.add('bs-last-shot');
        }

        cells.push(cell);
      }
    }
    return cells;
  }

  function _attachAttackEvents() {
    if (_spectatorMode) return;

    const grid = document.getElementById('bs-attack-grid');
    if (!grid) return;

    grid.addEventListener('click', (e) => {
      if (!_myTurn) return;
      const cell = e.target.closest('.bs-cell');
      if (!cell || !cell.classList.contains('bs-available')) return;
      const row = parseInt(cell.dataset.r);
      const col = parseInt(cell.dataset.c);
      if (_onMove) _onMove({ row, col });
    });
  }

  function _refreshAttackGridInteractivity() {
    const statusEl = document.getElementById('bs-status-msg');
    if (statusEl) {
      statusEl.className = 'bs-status-msg' + (_myTurn ? ' bs-my-turn' : '');
      statusEl.textContent = _myTurn ? '내 차례 — 적 격자를 클릭해 공격하세요' : '상대방 차례...';
    }

    const grid = document.getElementById('bs-attack-grid');
    if (!grid) return;
    const myAttacks = _attackGrids[_myColor];
    for (const cell of grid.querySelectorAll('.bs-cell')) {
      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      const attacked = myAttacks && myAttacks[r][c] !== null;
      cell.classList.toggle('bs-available', _myTurn && !attacked);
    }
  }

  function _updateStatusMsg() {
    const el = document.getElementById('bs-status-msg');
    if (!el) return;
    el.className = 'bs-status-msg' + (_myTurn ? ' bs-my-turn' : '');
    el.textContent = _myTurn ? '내 차례 — 적 격자를 클릭해 공격하세요' : '상대방 차례...';
  }

  // ===== 헬퍼 =====

  function _emptyGrid() {
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
  }

  // 관전 모드: 내 함선 그리드 없이 양측 공격 결과만 표시
  function initSpectator({ onMove }) {
    _myColor       = 'white';
    _onMove        = onMove || function () {};
    _spectatorMode = true;
    _phase         = 'active';
    _myShipGrid    = null;
    _attackGrids   = { white: _emptyGrid(), black: _emptyGrid() };
    _lastShot      = null;

    _renderSpectatorActive();
  }

  function _renderSpectatorActive() {
    const container = document.getElementById('battleshipboard');
    if (!container) return;
    container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'bs-fleet-layout';

    // 백(white) 공격 결과
    const whiteWrap = _buildSpectatorSide('백(white) 공격', _attackGrids.white);
    layout.appendChild(whiteWrap);

    // 흑(black) 공격 결과
    const blackWrap = _buildSpectatorSide('흑(black) 공격', _attackGrids.black);
    layout.appendChild(blackWrap);

    container.appendChild(layout);
  }

  function _buildSpectatorSide(title, attackGrid) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '4px';

    const t = document.createElement('div');
    t.className = 'bs-grid-title';
    t.textContent = title;
    wrap.appendChild(t);

    const colRow = document.createElement('div');
    colRow.style.display = 'flex';
    colRow.style.paddingLeft = '22px';
    for (const lbl of COL_LABELS) {
      const el = document.createElement('div');
      el.className = 'bs-col-label';
      el.textContent = lbl;
      colRow.appendChild(el);
    }
    wrap.appendChild(colRow);

    const gridBody = document.createElement('div');
    gridBody.style.display = 'flex';

    const rowLabels = document.createElement('div');
    rowLabels.style.display = 'flex';
    rowLabels.style.flexDirection = 'column';
    for (const lbl of ROW_LABELS) {
      const el = document.createElement('div');
      el.className = 'bs-row-label';
      el.textContent = lbl;
      rowLabels.appendChild(el);
    }
    gridBody.appendChild(rowLabels);

    const grid = document.createElement('div');
    grid.className = 'bs-grid';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'bs-cell';
        if (attackGrid) {
          const result = attackGrid[r][c];
          if (result === 'hit')  cell.classList.add('bs-hit');
          else if (result === 'sunk') cell.classList.add('bs-sunk');
          else if (result === 'miss') cell.classList.add('bs-miss');
        }
        grid.appendChild(cell);
      }
    }
    gridBody.appendChild(grid);
    wrap.appendChild(gridBody);
    return wrap;
  }

  return {
    init,
    initSpectator,
    setPhase,
    setMyTurn,
    updateAfterShot,
    updateSpectator,
  };
})();
