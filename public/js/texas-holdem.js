// texas-holdem.js — 텍사스 홀덤 UI 렌더러
window.TexasHoldemBoard = (function () {
  const SUIT_COLOR = { '♥': 'red', '♦': 'red', '♠': 'black', '♣': 'black' };
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const HAND_NAMES = ['하이카드','원 페어','투 페어','트리플스','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시','로열 플러시'];
  const PHASE_KO   = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운', waiting: '대기 중' };

  let _myColor, _myRole, _onAction, _spectator;
  let _myHand     = [];
  let _oppHand    = null; // null = 뒤집어진 카드, [] = 쇼다운 공개
  let _community  = [];
  let _pot        = 0;
  let _chips      = { host: 1000, guest: 1000 };
  let _bets       = { host: 0, guest: 0 };
  let _roundBet   = 0;
  let _betTurn    = null;
  let _phase      = 'waiting';
  let _toCall     = 0;
  let _raiseCount = 0;
  let _myTurn     = false;
  let _button     = 'host'; // 딜러/SB
  let _showdown   = null;
  let _myHandName = '';

  // ── 초기화 ──────────────────────────────────────────────────────
  function init(opts) {
    _myColor   = opts.myColor;
    _myRole    = opts.myRole   || 'host';
    _onAction  = opts.onAction;
    _spectator = opts.spectatorMode || false;
    _myHand    = [];
    _oppHand   = null;
    _community = [];
    _pot = 0; _chips = { host: 1000, guest: 1000 };
    _bets = { host: 0, guest: 0 }; _roundBet = 0;
    _betTurn = null; _phase = 'waiting'; _toCall = 0; _raiseCount = 0;
    _myTurn = false; _showdown = null; _myHandName = '';
    _render();
  }

  function setMyTurn(v) { _myTurn = v && !_spectator; }

  // 서버에서 내 홀 카드 수신
  function showDeal(data) {
    _myHand    = data.hand || [];
    _oppHand   = null; // 상대 카드는 뒤집혀 있음
    _showdown  = null;
    _myHandName = '';
    _render();
  }

  // game:move:made 데이터 처리
  function update(data) {
    _phase      = data.phase      || _phase;
    _community  = data.community  || _community;
    _pot        = data.pot        !== undefined ? data.pot : _pot;
    _chips      = data.chips      || _chips;
    _bets       = data.bets       || _bets;
    _roundBet   = data.roundBet   || 0;
    _betTurn    = data.betTurn    || null;
    _toCall     = data.toCall     !== undefined ? data.toCall : _toCall;
    _raiseCount = data.raiseCount || 0;
    if (data.button !== undefined) _button = data.button;
    _myTurn = !_spectator && (_betTurn === _myRole);
    _render();
  }

  // 쇼다운 수신
  function showShowdown(data) {
    _showdown  = data;
    _community = data.community || _community;
    _oppHand   = _myRole === 'host' ? data.hands.guest : data.hands.host;
    _phase     = 'showdown';
    _myTurn    = false;
    _render();
  }

  // ── 렌더링 ──────────────────────────────────────────────────────
  function _render() {
    const el = document.getElementById('texasholdemboard');
    if (!el) return;
    el.innerHTML = '';

    const table = _ce('div', 'th-table');

    // 상대 영역
    table.appendChild(_buildOppZone());

    // 커뮤니티 + 팟
    table.appendChild(_buildCommunityZone());

    // 내 영역
    table.appendChild(_buildMyZone());

    // 액션 버튼
    if (!_spectator) table.appendChild(_buildActionZone());
    else table.appendChild(_buildSpecWaiting());

    el.appendChild(table);
  }

  function _buildOppZone() {
    const zone = _ce('div', 'th-opponent-zone');

    const lbl = _ce('div', 'th-opponent-label');
    const isButton = (_myRole === 'host' && _button === 'guest') || (_myRole === 'guest' && _button === 'host');
    lbl.innerHTML = `상대방${isButton ? ' <span class="th-dealer-btn">D</span>' : ''}`;
    zone.appendChild(lbl);

    const cards = _ce('div', 'th-community-cards');
    if (_oppHand && _oppHand.length > 0) {
      // 쇼다운: 공개
      _oppHand.forEach(c => cards.appendChild(_buildCard(c, true)));
    } else {
      // 뒤집어진 2장
      for (let i = 0; i < 2; i++) cards.appendChild(_buildBackCard());
    }
    zone.appendChild(cards);

    if (_showdown) {
      const hn = _ce('div', 'th-hand-name');
      hn.textContent = _myRole === 'host' ? (_showdown.guestHandName || '') : (_showdown.hostHandName || '');
      zone.appendChild(hn);
    }

    const chipDiv = _ce('div', 'th-chip-info');
    const oppRole = _myRole === 'host' ? 'guest' : 'host';
    const oppBet = _bets[oppRole] || 0;
    chipDiv.innerHTML = `칩: <span>${(_chips[oppRole] || 0).toLocaleString()}</span>` + (oppBet > 0 ? ` | 베팅: <span>${oppBet}</span>` : '');
    zone.appendChild(chipDiv);

    return zone;
  }

  function _buildCommunityZone() {
    const zone = _ce('div', 'th-community-zone');

    const pot = _ce('div', 'th-pot-label');
    pot.textContent = `팟: ${_pot.toLocaleString()} 칩`;
    zone.appendChild(pot);

    const phase = _ce('div', 'th-phase-label');
    phase.textContent = PHASE_KO[_phase] || _phase;
    zone.appendChild(phase);

    const cards = _ce('div', 'th-community-cards');
    for (let i = 0; i < 5; i++) {
      if (i < _community.length) {
        cards.appendChild(_buildCard(_community[i], true));
      } else {
        cards.appendChild(_buildPlaceholder());
      }
    }
    zone.appendChild(cards);

    if (_showdown && _showdown.reason) {
      const banner = _ce('div', 'th-showdown-banner');
      const wnr = _showdown.winner === 'white' ? '백 승리' : _showdown.winner === 'black' ? '흑 승리' : '타이';
      banner.textContent = `${wnr} — ${_showdown.reason}`;
      zone.appendChild(banner);
    }

    return zone;
  }

  function _buildMyZone() {
    const zone = _ce('div', 'th-my-zone');

    const lbl = _ce('div', 'th-my-label');
    const isButton = (_myRole === 'host' && _button === 'host') || (_myRole === 'guest' && _button === 'guest');
    lbl.innerHTML = `나${isButton ? ' <span class="th-dealer-btn">D</span>' : ''}`;
    zone.appendChild(lbl);

    const cards = _ce('div', 'th-community-cards');
    if (_myHand.length > 0) {
      _myHand.forEach(c => cards.appendChild(_buildCard(c, true)));
    } else {
      for (let i = 0; i < 2; i++) cards.appendChild(_buildPlaceholder());
    }
    zone.appendChild(cards);

    if (_myHandName) {
      const hn = _ce('div', 'th-hand-name'); hn.textContent = _myHandName; zone.appendChild(hn);
    } else if (_showdown) {
      const hn = _ce('div', 'th-hand-name');
      hn.textContent = _myRole === 'host' ? (_showdown.hostHandName || '') : (_showdown.guestHandName || '');
      zone.appendChild(hn);
    }

    const chipDiv = _ce('div', 'th-chip-info');
    const myBet = _bets[_myRole] || 0;
    chipDiv.innerHTML = `칩: <span>${(_chips[_myRole] || 0).toLocaleString()}</span>` + (myBet > 0 ? ` | 베팅: <span>${myBet}</span>` : '');
    zone.appendChild(chipDiv);

    return zone;
  }

  function _buildActionZone() {
    const zone = _ce('div', 'th-action-zone');

    const canAct = _myTurn && _phase !== 'showdown' && _phase !== 'waiting';
    const myBet  = _bets[_myRole] || 0;
    const canCheck = _toCall === 0;
    const canRaise = _raiseCount < 4 && (_chips[_myRole] || 0) >= _toCall + 20;

    if (canAct) {
      const betInfo = _ce('div', 'th-bet-info');
      betInfo.textContent = _toCall > 0 ? `콜: ${_toCall} 칩` : '체크 또는 레이즈 가능';
      zone.appendChild(betInfo);

      const btns = _ce('div', 'th-bet-buttons');

      const fold = _mkBtn('폴드', 'th-btn th-btn-fold', () => _onAction({ action: 'fold' }));
      btns.appendChild(fold);

      if (canCheck) {
        const check = _mkBtn('체크', 'th-btn th-btn-check', () => _onAction({ action: 'check' }));
        btns.appendChild(check);
      } else {
        const call = _mkBtn(`콜 (${_toCall})`, 'th-btn th-btn-call', () => _onAction({ action: 'call' }));
        btns.appendChild(call);
      }

      if (canRaise) {
        const raise = _mkBtn('레이즈 +20', 'th-btn th-btn-raise', () => _onAction({ action: 'raise' }));
        btns.appendChild(raise);
      }

      zone.appendChild(btns);
    } else {
      const msg = _ce('div', 'th-waiting-msg');
      if (_phase === 'waiting') {
        msg.textContent = '게임 시작을 기다리는 중...';
      } else if (_phase === 'showdown') {
        msg.textContent = '다음 라운드 준비 중...';
      } else {
        msg.textContent = '상대방 차례...';
      }
      zone.appendChild(msg);
    }

    return zone;
  }

  function _buildSpecWaiting() {
    const d = _ce('div', 'th-waiting-msg');
    d.textContent = _betTurn ? (_betTurn === 'host' ? '호스트' : '게스트') + ' 차례' : '';
    return d;
  }

  // ── 카드 빌더 ────────────────────────────────────────────────────
  function _buildCard(card, faceUp) {
    const el = _ce('div', `th-card ${SUIT_COLOR[card.suit] || 'black'}`);
    const r = _ce('div', 'th-card-rank');
    r.textContent = RANK_LABEL[card.rank] || card.rank;
    const s = _ce('div', 'th-card-suit');
    s.textContent = card.suit;
    el.appendChild(r); el.appendChild(s);
    return el;
  }

  function _buildBackCard() {
    return _ce('div', 'th-card back');
  }

  function _buildPlaceholder() {
    return _ce('div', 'th-card placeholder');
  }

  // ── 핸드 평가 (클라이언트측, 솔로 AI·디스플레이용) ───────────────
  function evaluateBest(cards) {
    if (!cards || cards.length < 5) return null;
    let best = null;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const five = cards.filter((_, idx) => idx !== i && idx !== j);
        const val = _eval5(five);
        if (!best || _cmp(val.value, best.value) > 0) best = val;
      }
    }
    return best;
  }

  function _eval5(cards) {
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = new Set(suits).size === 1;
    let isStraight = false, sh = 0;
    if (new Set(ranks).size === 5) {
      if (ranks[0] - ranks[4] === 4) { isStraight = true; sh = ranks[0]; }
      if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { isStraight = true; sh = 5; }
    }
    if (isFlush && isStraight) return { value: [sh===14?9:8, sh], name: HAND_NAMES[sh===14?9:8] };
    const freq = {};
    ranks.forEach(r => { freq[r] = (freq[r]||0)+1; });
    const gs = Object.entries(freq).map(([r,c])=>({r:+r,c})).sort((a,b)=>b.c-a.c||b.r-a.r);
    const [g0,g1] = gs;
    if (g0.c===4) return { value:[7,g0.r,g1.r], name:HAND_NAMES[7] };
    if (g0.c===3&&g1&&g1.c===2) return { value:[6,g0.r,g1.r], name:HAND_NAMES[6] };
    if (isFlush) return { value:[5,...ranks], name:HAND_NAMES[5] };
    if (isStraight) return { value:[4,sh], name:HAND_NAMES[4] };
    if (g0.c===3) return { value:[3,g0.r,...gs.slice(1).map(g=>g.r)], name:HAND_NAMES[3] };
    if (g0.c===2&&g1&&g1.c===2) { const p=[g0.r,g1.r].sort((a,b)=>b-a); return { value:[2,...p,gs.find(g=>g.c===1).r], name:HAND_NAMES[2] }; }
    if (g0.c===2) return { value:[1,g0.r,...gs.slice(1).map(g=>g.r)], name:HAND_NAMES[1] };
    return { value:[0,...ranks], name:HAND_NAMES[0] };
  }

  function _cmp(a, b) {
    for (let i=0; i<Math.max(a.length,b.length); i++) { const d=(a[i]||0)-(b[i]||0); if(d!==0)return d; } return 0;
  }

  // ── 유틸 ────────────────────────────────────────────────────────
  function _ce(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }
  function _mkBtn(text, cls, cb) { const b = _ce('button', cls); b.textContent = text; b.addEventListener('click', cb); return b; }

  return { init, setMyTurn, update, showDeal, showShowdown, evaluateBest };
})();
