// game-mancala.js — 만칼라 프론트엔드 핸들러
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.mancala = (function () {
  const WHITE_STORE = 6, BLACK_STORE = 13;

  function _defaultPits() {
    const p = new Array(14).fill(0);
    for (let i = 0; i <= 5; i++) p[i] = 4;
    for (let i = 7; i <= 12; i++) p[i] = 4;
    return p;
  }

  function initBoard(st, myColor, handleAction) {
    MancalaBoard.init({
      pits:         st.pits || _defaultPits(),
      myColor,
      onAction:     handleAction,
      spectatorMode: false,
    });
    return { board: MancalaBoard };
  }

  function initSpectatorBoard(st, hostColor, handleAction) {
    MancalaBoard.init({
      pits:         st.pits || _defaultPits(),
      myColor:      hostColor,
      onAction:     handleAction,
      spectatorMode: true,
    });
    return { board: MancalaBoard };
  }

  function initGame(st, myColor, handleAction) {
    return initBoard(st, myColor, handleAction);
  }

  function onMoveMade({ move, pits, turn }) {
    MancalaBoard.update({ pits, turn });
    if (window.Sound) Sound.play('move');
    if (move && move.bonusTurn) {
      // 보너스 턴 알림
      if (window.Sound) Sound.play('capture');
    }
  }

  function getMyTurn(st, myColor) {
    return st.currentTurn === myColor;
  }

  // ── 솔로 (vs AI) 모드 ────────────────────────────────────────────
  function startSolo(playerColor, helpers, options) {
    const { showGameOver, updateTurnIndicator } = helpers;
    const aiColor   = playerColor === 'white' ? 'black' : 'white';
    const SOLO_TIME = (options && options.timerSeconds) || 300;

    let pits    = _defaultPits();
    let curTurn = 'white'; // 항상 백 선공
    let ended   = false;
    let timeLeft = SOLO_TIME;
    let timerInt = null;

    timerInt = setInterval(() => {
      if (ended) return;
      timeLeft--;
      if (window.Timer) Timer.setTime(playerColor, timeLeft);
      if (timeLeft <= 0) {
        ended = true; clearInterval(timerInt);
        _collectRemaining(pits);
        const result = _getResult(pits, playerColor);
        if (window.Stats) Stats.record('mancala', result);
        showGameOver({ winner: result==='win'?playerColor:result==='loss'?aiColor:null, reason:'시간 초과', isDraw:result==='draw' });
      }
    }, 1000);

    function handleAction(data) {
      if (ended || curTurn !== playerColor) return;
      const { pit } = data;
      if (pits[pit] === 0) return;
      const res = AIMancala.applyMove(pits, playerColor, pit);
      pits = res.pits;
      if (window.Sound) Sound.play(res.bonusTurn ? 'capture' : 'move');
      curTurn = res.bonusTurn ? playerColor : aiColor;
      MancalaBoard.update({ pits, turn: curTurn });
      updateTurnIndicator && updateTurnIndicator(curTurn);
      if (_isOver(pits)) { _finish(); return; }
      if (curTurn === aiColor) setTimeout(doAITurn, 700);
    }

    function doAITurn() {
      if (ended || curTurn !== aiColor) return;
      const pit = AIMancala.getBestPit(pits, aiColor);
      if (pit === null) { _finish(); return; }
      const res = AIMancala.applyMove(pits, aiColor, pit);
      pits = res.pits;
      if (window.Sound) Sound.play(res.bonusTurn ? 'capture' : 'move');
      curTurn = res.bonusTurn ? aiColor : playerColor;
      MancalaBoard.update({ pits, turn: curTurn });
      updateTurnIndicator && updateTurnIndicator(curTurn);
      if (_isOver(pits)) { _finish(); return; }
      if (curTurn === aiColor) setTimeout(doAITurn, 700);
    }

    function _isOver(pits) {
      const wEmpty = [0,1,2,3,4,5].every(i=>pits[i]===0);
      const bEmpty = [7,8,9,10,11,12].every(i=>pits[i]===0);
      return wEmpty || bEmpty;
    }

    function _collectRemaining(pits) {
      for (let i=0;i<=5;i++){pits[WHITE_STORE]+=pits[i];pits[i]=0;}
      for (let i=7;i<=12;i++){pits[BLACK_STORE]+=pits[i];pits[i]=0;}
    }

    function _getResult(pits, pc) {
      const pw = pits[WHITE_STORE], pb = pits[BLACK_STORE];
      const myScore = pc==='white'?pw:pb, oppScore = pc==='white'?pb:pw;
      return myScore>oppScore?'win':myScore<oppScore?'loss':'draw';
    }

    function _finish() {
      if (ended) return;
      ended = true; clearInterval(timerInt);
      _collectRemaining(pits);
      MancalaBoard.update({ pits, turn: null });
      const result = _getResult(pits, playerColor);
      if (window.Stats) Stats.record('mancala', result);
      showGameOver({
        winner: result==='win'?playerColor:result==='loss'?aiColor:null,
        reason: `${pits[WHITE_STORE]}:${pits[BLACK_STORE]} — ${result==='win'?'승리':result==='loss'?'패배':'무승부'}`,
        isDraw: result==='draw',
      });
    }

    MancalaBoard.init({ pits, myColor: playerColor, onAction: handleAction, spectatorMode: false });
    MancalaBoard.setMyTurn(curTurn === playerColor);
    if (curTurn === aiColor) setTimeout(doAITurn, 800);
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
