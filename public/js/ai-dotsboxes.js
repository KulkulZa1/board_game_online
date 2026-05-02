// ai-dotsboxes.js — 도트앤박스 AI (체인·박스 완성 전략)
window.AIDotsBoxes = (function () {

  // 최선의 수 반환: { type, row, col }
  function getBestMove(edges, boxes, size, myColor) {
    const available = _getAvailable(edges, size);
    if (available.length === 0) return null;

    // 우선순위 1: 박스를 완성시키는 수
    for (const e of available) {
      if (_completesBox(edges, boxes, size, e) > 0) return e;
    }

    // 우선순위 2: 상대방에게 박스 완성 기회를 주지 않는 수
    const safe = available.filter(e => _dangersCreated(edges, boxes, size, e) === 0);
    if (safe.length > 0) return safe[Math.floor(Math.random() * safe.length)];

    // 우선순위 3: 위험이 최소화되는 수
    let best = null, bestDanger = Infinity;
    for (const e of available) {
      const d = _dangersCreated(edges, boxes, size, e);
      if (d < bestDanger) { bestDanger = d; best = e; }
    }
    return best || available[Math.floor(Math.random() * available.length)];
  }

  // 사용 가능한 선분 목록
  function _getAvailable(edges, size) {
    const list = [];
    for (let r = 0; r <= size; r++) for (let c = 0; c < size; c++) {
      if (edges.hLines[r][c] === 0) list.push({ type: 'h', row: r, col: c });
    }
    for (let r = 0; r < size; r++) for (let c = 0; c <= size; c++) {
      if (edges.vLines[r][c] === 0) list.push({ type: 'v', row: r, col: c });
    }
    return list;
  }

  // 해당 선분을 그으면 몇 개의 박스가 완성되는가
  function _completesBox(edges, boxes, size, edge) {
    const test = _applyEdge(edges, size, edge);
    let count = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (boxes[r][c] === 0 && _boxComplete(test, r, c)) count++;
    }
    return count;
  }

  // 해당 선분을 그으면 상대방에게 박스 기회를 몇 개 주는가
  function _dangersCreated(edges, boxes, size, edge) {
    const test = _applyEdge(edges, size, edge);
    let danger = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (boxes[r][c] === 0 && !_boxComplete(test, r, c) && _edgesAround(test, r, c) === 3) {
        danger++;
      }
    }
    return danger;
  }

  function _edgesAround(edges, r, c) {
    let n = 0;
    if (edges.hLines[r][c]) n++;
    if (edges.hLines[r+1][c]) n++;
    if (edges.vLines[r][c]) n++;
    if (edges.vLines[r][c+1]) n++;
    return n;
  }

  function _boxComplete(edges, r, c) {
    return edges.hLines[r][c] && edges.hLines[r+1][c] && edges.vLines[r][c] && edges.vLines[r][c+1];
  }

  function _applyEdge(edges, size, edge) {
    const h = edges.hLines.map(row => [...row]);
    const v = edges.vLines.map(row => [...row]);
    if (edge.type === 'h') h[edge.row][edge.col] = 1;
    else                   v[edge.row][edge.col] = 1;
    return { hLines: h, vLines: v };
  }

  // 이동 적용 (솔로 모드에서 로컬 상태에 적용)
  function applyMove(edges, boxes, scores, size, edge, colorCode) {
    const hLines = edges.hLines.map(row => [...row]);
    const vLines = edges.vLines.map(row => [...row]);
    const newBoxes = boxes.map(row => [...row]);
    const newScores = { ...scores };

    if (edge.type === 'h') hLines[edge.row][edge.col] = colorCode;
    else                   vLines[edge.row][edge.col] = colorCode;

    const newEdges = { hLines, vLines };
    let completed = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (newBoxes[r][c] === 0 && _boxComplete(newEdges, r, c)) {
        newBoxes[r][c] = colorCode;
        const color = colorCode === 1 ? 'white' : 'black';
        newScores[color]++;
        completed++;
      }
    }
    return { edges: newEdges, boxes: newBoxes, scores: newScores, completed };
  }

  return { getBestMove, applyMove };
})();
