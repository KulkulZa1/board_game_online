// ai-battleship.js — 배틀십 AI (헌트-타깃 전략)
window.AIBattleship = (function () {
  const ROWS = 10, COLS = 10;

  const SHIPS_DEF = [
    { name: 'carrier',    size: 5 },
    { name: 'battleship', size: 4 },
    { name: 'cruiser',    size: 3 },
    { name: 'submarine',  size: 3 },
    { name: 'destroyer',  size: 2 },
  ];

  // ===== 랜덤 함선 배치 =====
  function randomPlacement() {
    const MAX_ATTEMPTS = 1000;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const result = _tryPlacement();
      if (result) return result;
    }
    // 폴백: 항상 성공하는 고정 배치
    return _fixedPlacement();
  }

  function _tryPlacement() {
    const grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
    const ships = [];

    for (const def of SHIPS_DEF) {
      const placed = _placeShipRandom(grid, def.name, def.size);
      if (!placed) return null;
      ships.push(placed);
    }
    return ships;
  }

  function _placeShipRandom(grid, name, size) {
    const MAX_TRIES = 200;
    for (let i = 0; i < MAX_TRIES; i++) {
      const horizontal = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (horizontal ? ROWS : ROWS - size + 1));
      const c = Math.floor(Math.random() * (horizontal ? COLS - size + 1 : COLS));

      const cells = [];
      let valid = true;
      for (let k = 0; k < size; k++) {
        const cr = horizontal ? r     : r + k;
        const cc = horizontal ? c + k : c;
        if (grid[cr][cc]) { valid = false; break; }
        cells.push({ r: cr, c: cc });
      }
      if (!valid) continue;

      // 그리드 마킹
      for (const { r: cr, c: cc } of cells) grid[cr][cc] = true;
      return { name, cells };
    }
    return null;
  }

  // 항상 성공하는 고정 배치 (폴백용)
  function _fixedPlacement() {
    return [
      { name: 'carrier',    cells: [{ r:0,c:0 },{ r:0,c:1 },{ r:0,c:2 },{ r:0,c:3 },{ r:0,c:4 }] },
      { name: 'battleship', cells: [{ r:2,c:0 },{ r:2,c:1 },{ r:2,c:2 },{ r:2,c:3 }] },
      { name: 'cruiser',    cells: [{ r:4,c:0 },{ r:4,c:1 },{ r:4,c:2 }] },
      { name: 'submarine',  cells: [{ r:6,c:0 },{ r:6,c:1 },{ r:6,c:2 }] },
      { name: 'destroyer',  cells: [{ r:8,c:0 },{ r:8,c:1 }] },
    ];
  }

  // ===== 최선의 사격 위치 결정 (헌트-타깃 전략) =====
  function getBestShot(attackGrid) {
    const hits = [];
    const available = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (attackGrid[r][c] === null) {
          available.push({ r, c });
        } else if (attackGrid[r][c] === 'hit') {
          hits.push({ r, c });
        }
      }
    }

    if (available.length === 0) return null;

    // 타깃 모드: 적중한 셀이 있으면 인접 셀 공격
    if (hits.length > 0) {
      const targets = _getTargetCells(attackGrid, hits);
      if (targets.length > 0) {
        return targets[Math.floor(Math.random() * targets.length)];
      }
    }

    // 헌트 모드: 체커보드 패턴 우선 (홀수 칸)
    const checkerboard = available.filter(({ r, c }) => (r + c) % 2 === 0);
    if (checkerboard.length > 0) {
      return checkerboard[Math.floor(Math.random() * checkerboard.length)];
    }

    // 체커보드 칸이 소진되면 나머지 중 랜덤
    return available[Math.floor(Math.random() * available.length)];
  }

  // 적중된 셀 주변의 공격 가능 셀 반환
  function _getTargetCells(attackGrid, hits) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const candidates = new Set();

    // 직선 방향으로 정렬된 hits 그룹 탐지
    const lineHits = _findAlignedHits(hits);

    if (lineHits.length >= 2) {
      // 같은 방향으로 연장 시도
      const dr = lineHits[1].r - lineHits[0].r;
      const dc = lineHits[1].c - lineHits[0].c;
      const minHit = lineHits[0];
      const maxHit = lineHits[lineHits.length - 1];

      const extR1 = minHit.r - dr, extC1 = minHit.c - dc;
      const extR2 = maxHit.r + dr, extC2 = maxHit.c + dc;

      if (_inBounds(extR1, extC1) && attackGrid[extR1][extC1] === null) {
        candidates.add(`${extR1},${extC1}`);
      }
      if (_inBounds(extR2, extC2) && attackGrid[extR2][extC2] === null) {
        candidates.add(`${extR2},${extC2}`);
      }
    } else {
      // 단독 hit: 4방향 모두 탐색
      for (const h of hits) {
        for (const [dr, dc] of dirs) {
          const nr = h.r + dr, nc = h.c + dc;
          if (_inBounds(nr, nc) && attackGrid[nr][nc] === null) {
            candidates.add(`${nr},${nc}`);
          }
        }
      }
    }

    return [...candidates].map(key => {
      const [r, c] = key.split(',').map(Number);
      return { r, c };
    });
  }

  // 직선으로 정렬된 hit 그룹 반환 (가장 긴 것)
  function _findAlignedHits(hits) {
    if (hits.length < 2) return hits;

    // 행 기준 그룹
    const rowGroups = {};
    for (const h of hits) {
      if (!rowGroups[h.r]) rowGroups[h.r] = [];
      rowGroups[h.r].push(h);
    }
    // 열 기준 그룹
    const colGroups = {};
    for (const h of hits) {
      if (!colGroups[h.c]) colGroups[h.c] = [];
      colGroups[h.c].push(h);
    }

    let best = [];
    for (const group of [...Object.values(rowGroups), ...Object.values(colGroups)]) {
      if (group.length >= 2 && group.length > best.length) {
        best = group.slice().sort((a, b) => a.r - b.r || a.c - b.c);
      }
    }
    return best.length >= 2 ? best : hits;
  }

  function _inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  return { randomPlacement, getBestShot };
})();
