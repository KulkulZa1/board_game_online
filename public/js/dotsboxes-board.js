// dotsboxes-board.js — 도트앤박스 SVG 보드 렌더러
window.DotsBoxesBoard = (function () {
  const CELL = 60;  // 점 간격 (px)
  const DOT  = 5;   // 점 반지름
  const PAD  = 20;  // 여백

  let _size, _edges, _boxes, _scores, _myColor, _onAction, _spectator;
  let _myTurn = false;
  let _hoveredEdge = null;

  // ── 초기화 ──────────────────────────────────────────────────────
  function init(opts) {
    _size      = opts.size  || 5;
    _edges     = opts.edges || _emptyEdges(_size);
    _boxes     = opts.boxes || _emptyBoxes(_size);
    _scores    = opts.scores || { white: 0, black: 0 };
    _myColor   = opts.myColor;
    _onAction  = opts.onAction;
    _spectator = opts.spectatorMode || false;
    _myTurn    = false;
    _render();
  }

  function setMyTurn(v) { _myTurn = v && !_spectator; }

  function update(opts) {
    if (opts.edges  !== undefined) _edges  = opts.edges;
    if (opts.boxes  !== undefined) _boxes  = opts.boxes;
    if (opts.scores !== undefined) _scores = opts.scores;
    if (opts.turn   !== undefined) _myTurn = !_spectator && (opts.turn === _myColor);
    _render();
  }

  // ── 렌더링 ──────────────────────────────────────────────────────
  function _render() {
    const container = document.getElementById('dotsboxesboard');
    if (!container) return;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'db-wrapper';

    // 점수판
    wrapper.appendChild(_buildScoreboard());

    // 상태 메시지
    wrapper.appendChild(_buildStatus());

    // SVG 보드
    wrapper.appendChild(_buildSVG());

    container.appendChild(wrapper);
  }

  function _buildScoreboard() {
    const sb = document.createElement('div');
    sb.className = 'db-scoreboard';

    const ws = document.createElement('div'); ws.className = 'db-score-side';
    const wd = document.createElement('div'); wd.className = 'db-score-dot white';
    const wv = document.createElement('div'); wv.className = 'db-score-val';
    wv.textContent = _scores.white;
    ws.appendChild(wd); ws.appendChild(wv);

    const sep = document.createElement('div'); sep.style.cssText = 'color:#555;font-size:1.2rem;';
    sep.textContent = ':';

    const bs = document.createElement('div'); bs.className = 'db-score-side';
    const bd = document.createElement('div'); bd.className = 'db-score-dot black';
    const bv = document.createElement('div'); bv.className = 'db-score-val';
    bv.textContent = _scores.black;
    bs.appendChild(bd); bs.appendChild(bv);

    sb.appendChild(ws); sb.appendChild(sep); sb.appendChild(bs);
    return sb;
  }

  function _buildStatus() {
    const el = document.createElement('div');
    el.className = 'db-status' + (_myTurn ? ' my-turn' : ' opp-turn');
    el.textContent = _myTurn ? '내 차례 — 선을 클릭하세요!' : '상대방 차례...';
    return el;
  }

  function _buildSVG() {
    const s = _size;
    const svgW = PAD * 2 + CELL * s;
    const svgH = PAD * 2 + CELL * s;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    svg.setAttribute('width',  '100%');
    svg.setAttribute('class', 'db-board-svg');
    svg.setAttribute('role', 'img');

    // 박스 채우기
    for (let r = 0; r < s; r++) {
      for (let c = 0; c < s; c++) {
        const v = _boxes[r][c];
        if (v !== 0) {
          const rect = document.createElementNS(ns, 'rect');
          rect.setAttribute('x', PAD + c * CELL + 3);
          rect.setAttribute('y', PAD + r * CELL + 3);
          rect.setAttribute('width',  CELL - 6);
          rect.setAttribute('height', CELL - 6);
          rect.setAttribute('rx', 4);
          rect.setAttribute('class', `db-box ${v === 1 ? 'white' : 'black'}`);
          svg.appendChild(rect);
        }
      }
    }

    // 가로 선분
    for (let r = 0; r <= s; r++) {
      for (let c = 0; c < s; c++) {
        const drawn = _edges.hLines[r][c];
        const x1 = PAD + c * CELL + DOT + 2;
        const y1 = PAD + r * CELL;
        const x2 = PAD + (c+1) * CELL - DOT - 2;
        const y2 = y1;

        if (drawn) {
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('x1', x1); line.setAttribute('y1', y1);
          line.setAttribute('x2', x2); line.setAttribute('y2', y2);
          line.setAttribute('class', `db-line ${drawn === 1 ? 'white' : 'black'}`);
          svg.appendChild(line);
        } else if (_myTurn) {
          // 기본 선 (빈)
          const base = document.createElementNS(ns, 'line');
          base.setAttribute('x1', x1); base.setAttribute('y1', y1);
          base.setAttribute('x2', x2); base.setAttribute('y2', y2);
          base.setAttribute('class', 'db-line');
          svg.appendChild(base);
          // 호버 클릭 영역
          _attachEdgeHandlers(svg, ns, { type:'h', row:r, col:c }, x1, y1, x2, y2);
        } else {
          // 내 차례 아님: 그냥 빈 선 표시
          const base = document.createElementNS(ns, 'line');
          base.setAttribute('x1', x1); base.setAttribute('y1', y1);
          base.setAttribute('x2', x2); base.setAttribute('y2', y2);
          base.setAttribute('class', 'db-line');
          svg.appendChild(base);
        }
      }
    }

    // 세로 선분
    for (let r = 0; r < s; r++) {
      for (let c = 0; c <= s; c++) {
        const drawn = _edges.vLines[r][c];
        const x1 = PAD + c * CELL;
        const y1 = PAD + r * CELL + DOT + 2;
        const x2 = x1;
        const y2 = PAD + (r+1) * CELL - DOT - 2;

        if (drawn) {
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('x1', x1); line.setAttribute('y1', y1);
          line.setAttribute('x2', x2); line.setAttribute('y2', y2);
          line.setAttribute('class', `db-line ${drawn === 1 ? 'white' : 'black'}`);
          svg.appendChild(line);
        } else if (_myTurn) {
          const base = document.createElementNS(ns, 'line');
          base.setAttribute('x1', x1); base.setAttribute('y1', y1);
          base.setAttribute('x2', x2); base.setAttribute('y2', y2);
          base.setAttribute('class', 'db-line');
          svg.appendChild(base);
          _attachEdgeHandlers(svg, ns, { type:'v', row:r, col:c }, x1, y1, x2, y2);
        } else {
          const base = document.createElementNS(ns, 'line');
          base.setAttribute('x1', x1); base.setAttribute('y1', y1);
          base.setAttribute('x2', x2); base.setAttribute('y2', y2);
          base.setAttribute('class', 'db-line');
          svg.appendChild(base);
        }
      }
    }

    // 점 (맨 위에)
    for (let r = 0; r <= s; r++) {
      for (let c = 0; c <= s; c++) {
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', PAD + c * CELL);
        dot.setAttribute('cy', PAD + r * CELL);
        dot.setAttribute('r',  DOT);
        dot.setAttribute('class', 'db-dot');
        svg.appendChild(dot);
      }
    }

    return svg;
  }

  function _attachEdgeHandlers(svg, ns, edgeData, x1, y1, x2, y2) {
    const hitLine = document.createElementNS(ns, 'line');
    hitLine.setAttribute('x1', x1); hitLine.setAttribute('y1', y1);
    hitLine.setAttribute('x2', x2); hitLine.setAttribute('y2', y2);
    hitLine.setAttribute('class', 'db-line-hover');

    hitLine.addEventListener('mouseenter', () => {
      hitLine.setAttribute('class', 'db-line-hover');
      // 하이라이트 — find base line and add hover class
      hitLine.previousSibling && (hitLine.previousSibling.setAttribute('class', 'db-line hover'));
    });
    hitLine.addEventListener('mouseleave', () => {
      hitLine.previousSibling && (hitLine.previousSibling.setAttribute('class', 'db-line'));
    });
    hitLine.addEventListener('click', () => {
      if (_myTurn) _onAction({ edge: edgeData });
    });
    svg.appendChild(hitLine);
  }

  // ── 유틸 ────────────────────────────────────────────────────────
  function _emptyEdges(size) {
    return {
      hLines: Array(size+1).fill(null).map(()=>Array(size).fill(0)),
      vLines: Array(size).fill(null).map(()=>Array(size+1).fill(0)),
    };
  }

  function _emptyBoxes(size) {
    return Array(size).fill(null).map(()=>Array(size).fill(0));
  }

  return { init, setMyTurn, update };
})();
