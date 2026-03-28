// indian-poker.js — 인디언 포커 UI (window.IndianPoker IIFE)
window.IndianPoker = (function () {
  let _myRole  = null;   // 'host' | 'guest'
  let _onAction = null;  // callback({ action, amount? })
  let _myTurn  = false;

  const container = document.getElementById('indianpoker-board-area');

  // ========== Public API ==========

  function init({ myRole, onAction }) {
    _myRole   = myRole;
    _onAction = onAction;
    _myTurn   = false;
    _renderIdle();
  }

  // setMyTurn: IndianPoker는 배팅 차례 제어이므로 호환 인터페이스만 유지
  function setMyTurn(bool) {
    _myTurn = bool;
  }

  function showDeal({ opponentCard, pot, chips, ante, roundNum }) {
    const area = document.getElementById('ip-area');
    if (!area) return;

    document.getElementById('ip-round-num').textContent  = `라운드 ${roundNum}`;
    document.getElementById('ip-pot').textContent        = `팟: ${pot}칩`;
    _updateChips(chips);
    _renderOpponentCard(opponentCard);
    document.getElementById('ip-my-card-value').textContent = '?';
    document.getElementById('ip-my-card-suit').textContent  = '';
    document.getElementById('ip-actions').style.display     = 'none';
    document.getElementById('ip-result').style.display      = 'none';
    document.getElementById('ip-status').textContent        = '카드가 배분되었습니다...';
  }

  function showBetTurn({ betTurn, pot, chips, lastAction }) {
    const area = document.getElementById('ip-area');
    if (!area) return;

    document.getElementById('ip-pot').textContent = `팟: ${pot}칩`;
    _updateChips(chips);

    const isMyTurn = betTurn === _myRole;
    document.getElementById('ip-actions').style.display = isMyTurn ? 'flex' : 'none';
    document.getElementById('ip-status').textContent = isMyTurn
      ? '당신의 배팅 차례입니다'
      : '상대방이 배팅 중...';

    if (lastAction) {
      const who = lastAction.role === _myRole ? '나' : '상대';
      const actLabel = lastAction.action === 'raise' ? `레이즈 (+5칩)` : '콜';
      document.getElementById('ip-status').textContent =
        `${who}가 ${actLabel}. ${isMyTurn ? '당신의 배팅 차례.' : '상대 배팅 중...'}`;
    }
  }

  function showShowdown({ hostCard, guestCard, winner, reason, pot, chips, roundNum }) {
    const area = document.getElementById('ip-area');
    if (!area) return;

    const myCard  = _myRole === 'host' ? hostCard  : guestCard;
    const oppCard = _myRole === 'host' ? guestCard : hostCard;

    // 내 카드 공개
    document.getElementById('ip-my-card-value').textContent = _rankLabel(myCard.rank);
    document.getElementById('ip-my-card-suit').textContent  = myCard.suit;
    document.getElementById('ip-my-card').className = `ip-card ip-card-revealed ${_suitColor(myCard.suit)}`;

    // 상대 카드 재확인
    _renderOpponentCard(oppCard);

    _updateChips(chips);
    document.getElementById('ip-pot').textContent = '팟: 0칩';
    document.getElementById('ip-actions').style.display = 'none';

    const myWin    = (winner === 'white' && _myRole === 'host') || (winner === 'black' && _myRole === 'guest');
    const isDraw   = winner === 'draw';
    const reasonLabel = reason === 'fold' ? '(상대 폴드)' : '';

    const resultEl = document.getElementById('ip-result');
    resultEl.style.display    = 'block';
    resultEl.style.background = myWin ? '#1a3a1a' : isDraw ? '#2a2a1a' : '#3a1a1a';
    resultEl.textContent      = myWin ? `🏆 승리! ${reasonLabel}` : isDraw ? '🤝 무승부' : `😞 패배 ${reasonLabel}`;

    document.getElementById('ip-status').textContent = chips
      ? `내 칩: ${_myRole === 'host' ? chips.host : chips.guest} / 상대: ${_myRole === 'host' ? chips.guest : chips.host}`
      : '';
  }

  function reset() {
    _renderIdle();
  }

  // ========== Rendering ==========

  function _renderIdle() {
    if (!container) return;
    container.innerHTML = `
      <div id="ip-area" style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;max-width:480px;margin:0 auto;width:100%;">
        <div id="ip-round-num" style="color:#f0c040;font-size:1.1rem;font-weight:700;">라운드 대기 중</div>

        <!-- 상대 카드 (앞면) -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <div style="color:#8892a4;font-size:0.8rem;">상대 카드</div>
          <div id="ip-opp-card" class="ip-card ip-card-revealed ip-suit-black">
            <span id="ip-opp-value" style="font-size:2rem;font-weight:700;">?</span>
            <span id="ip-opp-suit"  style="font-size:1.2rem;"></span>
          </div>
        </div>

        <!-- 팟 / 칩 현황 -->
        <div id="ip-pot" style="color:#f0c040;font-size:1rem;font-weight:600;">팟: 0칩</div>
        <div id="ip-chips-bar" style="display:flex;gap:24px;font-size:0.9rem;color:#c8d0de;">
          <span id="ip-chips-host">🏠 호스트: --칩</span>
          <span id="ip-chips-guest">🎮 게스트: --칩</span>
        </div>

        <!-- 내 카드 (뒷면) -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <div style="color:#8892a4;font-size:0.8rem;">내 카드 (이마에 붙임)</div>
          <div id="ip-my-card" class="ip-card ip-card-back">
            <span id="ip-my-card-value" style="font-size:2rem;font-weight:700;color:#ddd;">?</span>
            <span id="ip-my-card-suit"  style="font-size:1.2rem;"></span>
          </div>
        </div>

        <!-- 배팅 액션 버튼 -->
        <div id="ip-actions" style="display:none;gap:12px;">
          <button class="ip-action-btn ip-fold"  onclick="window._ipAction('fold')">폴드</button>
          <button class="ip-action-btn ip-call"  onclick="window._ipAction('call')">콜</button>
          <button class="ip-action-btn ip-raise" onclick="window._ipAction('raise')">레이즈 (+5)</button>
        </div>

        <!-- 상태 텍스트 -->
        <div id="ip-status" style="color:#8892a4;font-size:0.9rem;min-height:1.2em;text-align:center;"></div>

        <!-- 라운드 결과 -->
        <div id="ip-result" style="display:none;padding:12px 24px;border-radius:12px;font-size:1.1rem;font-weight:700;text-align:center;"></div>
      </div>
    `;

    // 전역 액션 핸들러 (onclick 인라인용) — 1.5초 debounce
    let _ipLastActionTime = 0;
    window._ipAction = function(action) {
      const now = Date.now();
      if (now - _ipLastActionTime < 1500) return;
      _ipLastActionTime = now;
      if (_onAction) _onAction({ action });
    };
  }

  function _renderOpponentCard(card) {
    const el    = document.getElementById('ip-opp-card');
    const valEl = document.getElementById('ip-opp-value');
    const suiEl = document.getElementById('ip-opp-suit');
    if (!el || !valEl || !suiEl) return;
    el.className = `ip-card ip-card-revealed ${_suitColor(card.suit)}`;
    valEl.textContent = _rankLabel(card.rank);
    suiEl.textContent = card.suit;
  }

  function _updateChips(chips) {
    const hEl = document.getElementById('ip-chips-host');
    const gEl = document.getElementById('ip-chips-guest');
    if (hEl && chips) hEl.textContent = `🏠 호스트: ${chips.host}칩`;
    if (gEl && chips) gEl.textContent = `🎮 게스트: ${chips.guest}칩`;
  }

  function _rankLabel(rank) {
    if (rank === 1)  return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return String(rank);
  }

  function _suitColor(suit) {
    return (suit === '♥' || suit === '♦') ? 'ip-suit-red' : 'ip-suit-black';
  }

  return {
    init,
    setMyTurn,
    showDeal,
    showBetTurn,
    showShowdown,
    reset,
    clearSelection: () => {},
    clearHint:      () => {},
  };
})();
