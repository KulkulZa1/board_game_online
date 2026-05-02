// game-dotsboxes.js — 도트앤박스 프론트엔드 핸들러
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.dotsboxes = (function () {
  const DEFAULT_SIZE = 5;

  function _buildInitState(st) {
    return {
      size:   st.size  || DEFAULT_SIZE,
      edges:  st.edges || { hLines: [], vLines: [] },
      boxes:  st.boxes || [],
      scores: st.scores || { white: 0, black: 0 },
    };
  }

  function initBoard(st, myColor, handleAction) {
    const s = _buildInitState(st);
    DotsBoxesBoard.init({
      size:         s.size,
      edges:        s.edges,
      boxes:        s.boxes,
      scores:       s.scores,
      myColor,
      onAction:     handleAction,
      spectatorMode: false,
    });
    return { board: DotsBoxesBoard };
  }

  function initSpectatorBoard(st, hostColor, handleAction) {
    const s = _buildInitState(st);
    DotsBoxesBoard.init({
      size:         s.size,
      edges:        s.edges,
      boxes:        s.boxes,
      scores:       s.scores,
      myColor:      hostColor,
      onAction:     handleAction,
      spectatorMode: true,
    });
    return { board: DotsBoxesBoard };
  }

  function initGame(st, myColor, handleAction) {
    return initBoard(st, myColor, handleAction);
  }

  function onMoveMade({ move, edges, boxes, scores, turn }) {
    DotsBoxesBoard.update({ edges, boxes, scores, turn });
    if (window.Sound) Sound.play(move && move.boxesCompleted > 0 ? 'capture' : 'move');
  }

  function getMyTurn(st, myColor) {
    return st.currentTurn === myColor;
  }

  // ── 솔로 (vs AI) 모드 ────────────────────────────────────────────
  function startSolo(playerColor, helpers, options) {
    const { showGameOver, updateTurnIndicator } = helpers;
    const aiColor    = playerColor === 'white' ? 'black' : 'white';
    const playerCode = playerColor === 'white' ? 1 : 2;
    const aiCode     = playerColor === 'white' ? 2 : 1;
    const size       = 5;
    const SOLO_TIME  = (options && options.timerSeconds) || 300; // 5분

    let edges  = { hLines: Array(size+1).fill(null).map(()=>Array(size).fill(0)), vLines: Array(size).fill(null).map(()=>Array(size+1).fill(0)) };
    let boxes  = Array(size).fill(null).map(()=>Array(size).fill(0));
    let scores = { white: 0, black: 0 };
    let currentTurn = 'white'; // 항상 백 선공
    let ended       = false;
    let timeLeft    = SOLO_TIME;
    let timerInt    = null;

    timerInt = setInterval(() => {
      if (ended) return;
      timeLeft--;
      if (window.Timer) Timer.setTime(playerColor, timeLeft);
      if (timeLeft <= 0) {
        ended = true;
        clearInterval(timerInt);
        const result = scores[playerColor] > scores[aiColor] ? 'win'
                     : scores[playerColor] < scores[aiColor] ? 'loss' : 'draw';
        if (window.Stats) Stats.record('dotsboxes', result);
        showGameOver({
          winner: result === 'win' ? playerColor : result === 'loss' ? aiColor : null,
          reason: `시간 초과 — ${scores[playerColor]}:${scores[aiColor]}`,
          isDraw: result === 'draw',
        });
      }
    }, 1000);

    function handleAction(data) {
      if (ended || currentTurn !== playerColor) return;
      const edge = data.edge;
      const colorCode = playerCode;
      const result = AIDotsBoxes.applyMove(edges, boxes, scores, size, edge, colorCode);
      edges = result.edges; boxes = result.boxes; scores = result.scores;

      if (window.Sound) Sound.play(result.completed > 0 ? 'capture' : 'move');

      if (result.completed > 0) {
        currentTurn = playerColor; // 박스 완성 시 계속
      } else {
        currentTurn = aiColor;
      }

      DotsBoxesBoard.update({ edges, boxes, scores, turn: currentTurn });
      updateTurnIndicator && updateTurnIndicator(currentTurn);

      if (_isOver(edges, size)) { _finish(); return; }
      if (currentTurn === aiColor) setTimeout(doAITurn, 600);
    }

    function doAITurn() {
      if (ended || currentTurn !== aiColor) return;
      const move = AIDotsBoxes.getBestMove(edges, boxes, size, aiColor);
      if (!move) { _finish(); return; }

      const result = AIDotsBoxes.applyMove(edges, boxes, scores, size, move, aiCode);
      edges = result.edges; boxes = result.boxes; scores = result.scores;
      if (window.Sound) Sound.play(result.completed > 0 ? 'capture' : 'move');

      if (result.completed > 0) {
        currentTurn = aiColor;
      } else {
        currentTurn = playerColor;
      }

      DotsBoxesBoard.update({ edges, boxes, scores, turn: currentTurn });
      updateTurnIndicator && updateTurnIndicator(currentTurn);

      if (_isOver(edges, size)) { _finish(); return; }
      if (currentTurn === aiColor) setTimeout(doAITurn, 600);
    }

    function _isOver(edges, size) {
      for (let r = 0; r <= size; r++) for (let c = 0; c < size; c++) if (edges.hLines[r][c] === 0) return false;
      for (let r = 0; r < size; r++) for (let c = 0; c <= size; c++) if (edges.vLines[r][c] === 0) return false;
      return true;
    }

    function _finish() {
      if (ended) return;
      ended = true;
      clearInterval(timerInt);
      const result = scores[playerColor] > scores[aiColor] ? 'win'
                   : scores[playerColor] < scores[aiColor] ? 'loss' : 'draw';
      if (window.Stats) Stats.record('dotsboxes', result);
      showGameOver({
        winner: result === 'win' ? playerColor : result === 'loss' ? aiColor : null,
        reason: `${scores.white}:${scores.black} — ${result === 'win' ? '승리' : result === 'loss' ? '패배' : '무승부'}`,
        isDraw: result === 'draw',
      });
    }

    DotsBoxesBoard.init({
      size, edges, boxes, scores,
      myColor:      playerColor,
      onAction:     handleAction,
      spectatorMode: false,
    });
    DotsBoxesBoard.setMyTurn(currentTurn === playerColor);

    if (currentTurn === aiColor) setTimeout(doAITurn, 800);
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
