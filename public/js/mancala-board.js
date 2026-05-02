// mancala-board.js — 만칼라 보드 렌더러
window.MancalaBoard = (function () {
  const WHITE_STORE = 6, BLACK_STORE = 13;

  let _pits, _myColor, _onAction, _spectator, _myTurn = false;

  function init(opts) {
    _pits      = opts.pits  || new Array(14).fill(0);
    _myColor   = opts.myColor;
    _onAction  = opts.onAction;
    _spectator = opts.spectatorMode || false;
    _myTurn    = false;
    _render();
  }

  function setMyTurn(v) { _myTurn = v && !_spectator; }

  function update(opts) {
    if (opts.pits !== undefined) _pits = opts.pits;
    if (opts.turn !== undefined) _myTurn = !_spectator && (opts.turn === _myColor);
    _render();
  }

  function _render() {
    const container = document.getElementById('mancalaboard');
    if (!container) return;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'mc-wrapper';

    // 상태 메시지
    const status = document.createElement('div');
    status.className = 'mc-status' + (_myTurn ? ' my-turn' : ' opp-turn');
    status.textContent = _myTurn ? '내 차례 — pit을 선택하세요!' : '상대방 차례...';
    wrapper.appendChild(status);

    // 보드
    const board = document.createElement('div');
    board.className = 'mc-board';

    // 흑 창고 (왼쪽)
    board.appendChild(_buildStore('black', _pits[BLACK_STORE]));

    // 중앙 pit 영역
    const center = document.createElement('div');
    center.className = 'mc-center';

    // 흑 진영 (위, pit 12→7, 오른쪽→왼쪽)
    const blackRow = document.createElement('div');
    blackRow.className = 'mc-row';
    for (let i = 12; i >= 7; i--) {
      blackRow.appendChild(_buildPit(i, 'black'));
    }
    center.appendChild(blackRow);

    // 백 진영 (아래, pit 0→5, 왼쪽→오른쪽)
    const whiteRow = document.createElement('div');
    whiteRow.className = 'mc-row';
    for (let i = 0; i <= 5; i++) {
      whiteRow.appendChild(_buildPit(i, 'white'));
    }
    center.appendChild(whiteRow);
    board.appendChild(center);

    // 백 창고 (오른쪽)
    board.appendChild(_buildStore('white', _pits[WHITE_STORE]));
    wrapper.appendChild(board);

    // 점수 정보
    const scoreDiv = document.createElement('div');
    scoreDiv.style.cssText = 'display:flex;gap:20px;font-size:0.85rem;color:#8892a4;';
    scoreDiv.innerHTML = `백(하): <span style="color:#7ac8f0;font-weight:700">${_pits[WHITE_STORE]}</span>씨 &nbsp;|&nbsp; 흑(상): <span style="color:#f07a7a;font-weight:700">${_pits[BLACK_STORE]}</span>씨`;
    wrapper.appendChild(scoreDiv);

    container.appendChild(wrapper);
  }

  function _buildStore(color, count) {
    const el = document.createElement('div');
    el.className = `mc-store ${color}`;
    const lbl = document.createElement('div'); lbl.className = 'mc-store-label';
    lbl.textContent = color === 'white' ? '백\n창고' : '흑\n창고';
    lbl.style.whiteSpace = 'pre';
    const cnt = document.createElement('div'); cnt.className = 'mc-store-count';
    cnt.textContent = count;
    el.appendChild(lbl); el.appendChild(cnt);
    return el;
  }

  function _buildPit(idx, rowColor) {
    const count  = _pits[idx];
    const myPits = _myColor === 'white' ? [0,1,2,3,4,5] : [7,8,9,10,11,12];
    const isMyPit = myPits.includes(idx);
    const canClick = _myTurn && isMyPit && count > 0;

    const el = document.createElement('div');
    el.className = 'mc-pit' + (count === 0 ? ' empty' : '') + (canClick ? ` clickable ${_myColor}` : '');

    const num = document.createElement('div'); num.className = 'mc-pit-num';
    num.textContent = `P${idx < 6 ? idx+1 : 13-idx}`;
    el.appendChild(num);

    const cnt = document.createElement('div'); cnt.className = 'mc-pit-count';
    cnt.textContent = count;
    el.appendChild(cnt);

    // 씨앗 시각화 (최대 12개)
    if (count > 0 && count <= 12) {
      const seeds = document.createElement('div'); seeds.className = 'mc-seeds';
      for (let i = 0; i < Math.min(count, 12); i++) {
        const s = document.createElement('div'); s.className = 'mc-seed'; seeds.appendChild(s);
      }
      el.appendChild(seeds);
    }

    if (canClick) el.addEventListener('click', () => _onAction({ pit: idx }));
    return el;
  }

  return { init, setMyTurn, update };
})();
