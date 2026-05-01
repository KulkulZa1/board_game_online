// backgammon-board.js — 백가몬 보드 렌더러
window.BackgammonBoard = (function () {
  const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  let _board, _myColor, _onAction, _spectator;
  let _phase = 'rolling', _turn = 'white', _dice = [0, 0], _remaining = [];
  let _selected = null; // number | 'bar' | null
  let _validMoves = []; // [{ from, to, dieUsed }]
  let _myTurn = false;
  let _container = null;

  // ── 초기화 ──────────────────────────────────────────────────────
  function init(opts) {
    _board     = opts.board;
    _myColor   = opts.myColor;
    _onAction  = opts.onAction;
    _spectator = opts.spectatorMode || false;
    _phase     = opts.phase     || 'rolling';
    _turn      = opts.turn      || 'white';
    _dice      = opts.dice      || [0, 0];
    _remaining = opts.remaining || [];
    _myTurn    = !_spectator && (_turn === _myColor);
    _validMoves = [];
    _selected   = null;
    _render();
  }

  function setMyTurn(v) {
    _myTurn = v && !_spectator;
  }

  function update(opts) {
    _board     = opts.board;
    _phase     = opts.phase;
    _turn      = opts.turn;
    _dice      = opts.dice;
    _remaining = opts.remaining || [];
    _myTurn    = !_spectator && (_turn === _myColor);
    if (opts.validMoves !== undefined) _validMoves = opts.validMoves;
    _selected  = null;
    _render();
  }

  // ── 렌더링 ───────────────────────────────────────────────────────
  function _render() {
    _container = document.getElementById('backgammonboard');
    if (!_container) return;
    _container.innerHTML = '';

    const wrapper = _ce('div', 'bg-wrapper');

    // 상태 메시지
    const statusEl = _ce('div', 'bg-status-msg');
    if (_spectator) {
      statusEl.textContent = (_turn === 'white' ? '백(흰색)' : '흑') + ' 차례';
    } else if (_myTurn) {
      statusEl.className = 'bg-status-msg my-turn';
      statusEl.textContent = _phase === 'rolling' ? '🎲 주사위를 굴리세요!' : '말을 선택해 이동하세요';
    } else {
      statusEl.className = 'bg-status-msg opp-turn';
      statusEl.textContent = '상대방 차례...';
    }
    wrapper.appendChild(statusEl);

    // 보드 + borne-off 가로 배치
    const outerDiv = _ce('div', 'bg-outer');

    // 메인 보드
    const boardDiv = _ce('div', 'bg-board');
    const rowsDiv  = _ce('div', 'bg-rows');
    rowsDiv.appendChild(_buildRow('top',    [13,14,15,16,17,18], [19,20,21,22,23,24]));
    rowsDiv.appendChild(_buildDivider());
    rowsDiv.appendChild(_buildRow('bottom', [12,11,10,9,8,7],    [6,5,4,3,2,1]));
    boardDiv.appendChild(rowsDiv);
    outerDiv.appendChild(boardDiv);

    // borne-off 영역
    outerDiv.appendChild(_buildBorneOff());
    wrapper.appendChild(outerDiv);

    // 컨트롤 (주사위)
    wrapper.appendChild(_buildControls());

    _container.appendChild(wrapper);
  }

  // ── 상단/하단 포인트 행 ──────────────────────────────────────────
  function _buildRow(pos, leftPts, rightPts) {
    const row = _ce('div', `bg-row ${pos}`);

    // 왼쪽 6개 포인트
    const halfL = _ce('div', 'bg-half');
    leftPts.forEach(p => halfL.appendChild(_buildPoint(p, pos)));
    row.appendChild(halfL);

    // 중앙 바
    row.appendChild(_buildBarSection(pos));

    // 오른쪽 6개 포인트
    const halfR = _ce('div', 'bg-half');
    rightPts.forEach(p => halfR.appendChild(_buildPoint(p, pos)));
    row.appendChild(halfR);

    return row;
  }

  function _buildDivider() {
    const d = _ce('div', 'bg-divider');
    d.textContent = '— BAR —';
    return d;
  }

  function _buildPoint(ptNum, rowPos) {
    const triColor = ptNum % 2 === 0 ? 'light' : 'dark';
    const pt = _ce('div', 'bg-point');
    pt.dataset.point = ptNum;
    pt.dataset.tri   = triColor;

    // 삼각형 배경
    const inner = _ce('div', 'bg-point-inner');
    pt.appendChild(inner);

    // 번호
    const numEl = _ce('div', 'bg-pt-num');
    numEl.textContent = ptNum;
    pt.appendChild(numEl);

    // 말 렌더링
    const ptData = _board && _board.points[ptNum];
    if (ptData && ptData.color && ptData.count > 0) {
      const max = Math.min(ptData.count, 5);
      for (let i = 0; i < max; i++) {
        const checker = _buildChecker(ptData.color, ptData.count > 5 && i === 4 ? `+${ptData.count - 4}` : null);
        if (_selected === ptNum && ptData.color === _myColor) checker.classList.add('selected');
        pt.appendChild(checker);
      }
    }

    // 유효 이동 목적지 하이라이트
    if (_selected !== null && _validDests().includes(ptNum)) {
      pt.classList.add('valid-dest');
    }

    // 클릭 핸들러
    if (!_spectator) pt.addEventListener('click', () => _onPointClick(ptNum));
    return pt;
  }

  function _buildBarSection(pos) {
    const barDiv = _ce('div', `bg-bar bg-bar-${pos}`);
    if (pos === 'top') {
      const lbl = _ce('div', 'bg-bar-label'); lbl.textContent = 'BAR'; barDiv.appendChild(lbl);
      _renderBarPieces(barDiv, 'white');
    } else {
      _renderBarPieces(barDiv, 'black');
      const lbl = _ce('div', 'bg-bar-label'); lbl.textContent = 'BAR'; barDiv.appendChild(lbl);
    }
    if (_selected === 'bar') barDiv.classList.add('selected-bar');

    // 바 말 클릭 가능 (내 말이 바에 있을 때)
    if (!_spectator && _board && _board.bar[_myColor] > 0 && (
      (pos === 'top'    && _myColor === 'white') ||
      (pos === 'bottom' && _myColor === 'black')
    )) {
      barDiv.style.cursor = 'pointer';
      barDiv.addEventListener('click', _onBarClick);
    }
    return barDiv;
  }

  function _renderBarPieces(container, color) {
    if (!_board) return;
    const cnt = _board.bar[color];
    if (cnt === 0) return;
    const max = Math.min(cnt, 3);
    for (let i = 0; i < max; i++) {
      const ch = _buildChecker(color, cnt > 3 && i === 2 ? `+${cnt - 2}` : null);
      container.appendChild(ch);
    }
  }

  function _buildChecker(color, label) {
    const ch = _ce('div', `bg-checker ${color}`);
    if (label) ch.textContent = label;
    return ch;
  }

  function _buildBorneOff() {
    const area = _ce('div', 'bg-borne-off-area');

    const topSec = _ce('div', 'bg-off-section');
    const topLbl = _ce('div', 'bg-off-label'); topLbl.textContent = '탈출';
    const topCnt = _ce('div', 'bg-off-count white');
    topCnt.textContent = _board ? _board.borneOff.white : 0;
    topSec.appendChild(topLbl); topSec.appendChild(topCnt);

    const sep = _ce('div', '');
    sep.style.cssText = 'flex:1; border-top: 1px solid #444; width:80%; align-self:center;';

    const botSec = _ce('div', 'bg-off-section');
    const botLbl = _ce('div', 'bg-off-label'); botLbl.textContent = '탈출';
    const botCnt = _ce('div', 'bg-off-count black');
    botCnt.textContent = _board ? _board.borneOff.black : 0;
    botSec.appendChild(botLbl); botSec.appendChild(botCnt);

    area.appendChild(topSec);
    area.appendChild(sep);
    area.appendChild(botSec);
    return area;
  }

  function _buildControls() {
    const ctrl = _ce('div', 'bg-controls');

    // 주사위
    const diceGrp = _ce('div', 'bg-dice-group');
    const maxDice = _remaining.length === 4 ? 4 : 2;
    if (_dice[0] > 0) {
      for (let i = 0; i < maxDice; i++) {
        const die = _ce('div', 'bg-die');
        const diceVal = _dice[i < 2 ? i : 0]; // doubles repeat die[0]
        die.textContent = DICE_FACES[diceVal] || diceVal;
        // 사용된 주사위 체크
        if (!_diceIsRemaining(i, maxDice)) die.classList.add('used');
        diceGrp.appendChild(die);
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const die = _ce('div', 'bg-die empty'); die.textContent = '?'; diceGrp.appendChild(die);
      }
    }
    ctrl.appendChild(diceGrp);

    // 굴리기 버튼
    if (!_spectator) {
      const btn = _ce('button', 'bg-roll-btn');
      btn.textContent = '🎲 주사위 굴리기';
      btn.disabled = !(_myTurn && _phase === 'rolling');
      btn.addEventListener('click', () => {
        if (!btn.disabled) _onAction({ type: 'roll' });
      });
      ctrl.appendChild(btn);
    }

    return ctrl;
  }

  // 남은 주사위에서 index i에 해당하는 값이 남아있는지
  function _diceIsRemaining(dieIndex, maxDice) {
    if (_remaining.length === 0) return false;
    if (maxDice === 4) return dieIndex < _remaining.length;
    // 일반 (2개): 남은 주사위 목록에 dice[dieIndex]가 있는지
    const val = _dice[dieIndex];
    return _remaining.includes(val);
  }

  // ── 이동 로직 ────────────────────────────────────────────────────
  function _validDests() {
    if (_selected === null) return [];
    return _validMoves
      .filter(m => m.from === _selected)
      .map(m => m.to)
      .filter(t => t !== 'off');
  }

  function _canBearOff() {
    return _selected !== null && _validMoves.some(m => m.from === _selected && m.to === 'off');
  }

  function _onBarClick() {
    if (!_myTurn || _phase !== 'moving') return;
    if (!_board || _board.bar[_myColor] === 0) return;
    _selected = 'bar';
    _validMoves = _clientValidMoves(); // 클라이언트측 유효 수 계산
    _render();
  }

  function _onPointClick(ptNum) {
    if (!_myTurn || _phase !== 'moving') return;
    if (_board.bar[_myColor] > 0) {
      // 바에 말이 있을 때: 목적지 클릭
      if (_selected === 'bar') {
        _tryMove('bar', ptNum);
        return;
      }
      // 바 말부터 내려야 함 — 선택 무시
      return;
    }

    if (_selected === null) {
      // 말 선택
      if (_board.points[ptNum] && _board.points[ptNum].color === _myColor && _board.points[ptNum].count > 0) {
        _selected = ptNum;
        _validMoves = _clientValidMoves();
        _render();
      }
    } else {
      // 이동 시도
      if (ptNum === _selected) {
        // 선택 해제
        _selected = null; _render(); return;
      }
      if (_validDests().includes(ptNum)) {
        _tryMove(_selected, ptNum);
      } else if (_board.points[ptNum] && _board.points[ptNum].color === _myColor) {
        // 다른 말 선택
        _selected = ptNum;
        _validMoves = _clientValidMoves();
        _render();
      } else {
        _selected = null; _render();
      }
    }
  }

  function _tryMove(from, to) {
    const matchingMoves = _validMoves.filter(m => m.from === from && m.to === to);
    if (matchingMoves.length === 0) return;
    // 여러 주사위 값이 가능할 경우 첫 번째 선택
    const move = matchingMoves[0];
    _selected = null;
    _onAction({ type: 'move', from, to, dieUsed: move.dieUsed });
  }

  // 클라이언트측 유효 수 계산 (렌더링용)
  function _clientValidMoves() {
    if (!_board || !_myTurn || _phase !== 'moving') return [];
    return _bgGetValidMoves(_board, _myColor, _remaining);
  }

  // ── 클라이언트측 이동 유효성 로직 (서버 로직 미러) ──────────────
  function _bgGetValidMoves(bg, color, remainingMoves) {
    if (!remainingMoves || remainingMoves.length === 0) return [];
    const unique   = [...new Set(remainingMoves)];
    const oppColor = color === 'white' ? 'black' : 'white';
    const dir      = color === 'white' ? -1 : 1;
    const moves    = [];

    if (bg.bar[color] > 0) {
      for (const die of unique) {
        const entry = color === 'white' ? (25 - die) : die;
        if (entry < 1 || entry > 24) continue;
        if (_ptIsBlocked(bg, entry, oppColor)) continue;
        moves.push({ from: 'bar', to: entry, dieUsed: die });
      }
      return moves;
    }

    const allHome = _allInHome(bg, color);
    for (let p = 1; p <= 24; p++) {
      if (bg.points[p].color !== color || bg.points[p].count === 0) continue;
      for (const die of unique) {
        const dest = p + dir * die;
        if (color === 'white' && dest <= 0) {
          if (allHome && _canBO(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
        } else if (color === 'black' && dest >= 25) {
          if (allHome && _canBO(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
        } else if (dest >= 1 && dest <= 24) {
          if (!_ptIsBlocked(bg, dest, oppColor)) moves.push({ from: p, to: dest, dieUsed: die });
        }
      }
    }
    const seen = new Set();
    return moves.filter(m => { const k=`${m.from}|${m.to}|${m.dieUsed}`; if(seen.has(k))return false; seen.add(k);return true; });
  }

  function _ptIsBlocked(bg, p, oppColor) {
    return bg.points[p].color === oppColor && bg.points[p].count >= 2;
  }

  function _allInHome(bg, color) {
    if (bg.bar[color] > 0) return false;
    const [lo, hi] = color === 'white' ? [1, 6] : [19, 24];
    for (let p = 1; p <= 24; p++) {
      if (p >= lo && p <= hi) continue;
      if (bg.points[p].color === color && bg.points[p].count > 0) return false;
    }
    return true;
  }

  function _canBO(bg, color, fromP, die) {
    const dir  = color === 'white' ? -1 : 1;
    const dest = fromP + dir * die;
    if (color === 'white') {
      if (dest >= 1) return false;
      if (dest === 0) return true;
      for (let p = fromP + 1; p <= 6; p++) {
        if (bg.points[p].color === 'white' && bg.points[p].count > 0) return false;
      }
      return true;
    } else {
      if (dest <= 24) return false;
      if (dest === 25) return true;
      for (let p = 19; p < fromP; p++) {
        if (bg.points[p].color === 'black' && bg.points[p].count > 0) return false;
      }
      return true;
    }
  }

  // ── 유틸 ─────────────────────────────────────────────────────────
  function _ce(tag, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  return { init, setMyTurn, update };
})();
