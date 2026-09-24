// game-checkers.js — Checkers GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.checkers = (function () {

  function initBoard(state, myColor, handleAction /*, myRole */) {
    const validMoves = state.validMoves || [];
    CheckersBoard.init({ board: state.board, myColor, onMove: handleAction, validMoves, mustJump: state.mustJump });
    return { board: CheckersBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    CheckersBoard.init({
      board:         state.board,
      myColor:       'white',
      onMove:        handleAction,
      spectatorMode: true,
      validMoves:    [],
      mustJump:      state.mustJump,
    });
    CheckersBoard.setMyTurn(false);
    return { board: CheckersBoard };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    CheckersBoard.init({
      board:      state.board,
      myColor,
      onMove:     handleAction,
      validMoves: state.validMoves || [],
      mustJump:   state.mustJump,
    });
    CheckersBoard.setMyTurn(myColor === (state.currentTurn || 'white'));
    return { board: CheckersBoard };
  }

  function onMoveMade({ board, move, validMoves, mustJump }) {
    CheckersBoard.updateAfterMove(board, move, validMoves, mustJump);
    if (typeof Sound !== 'undefined') Sound.play(move.captured ? 'capture' : 'move');
  }

  function getMyTurn(state, myColor) {
    return state.currentTurn === myColor;
  }

  function startSolo(playerColor, helpers) {
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot, setupUndo,
    } = helpers;

    const aiColor = playerColor === 'white' ? 'black' : 'white';
    const history = [];   // 무르기용 — 내 턴이 시작될 때의 판 (연속 점프 중간은 저장하지 않는다)

    function makeInitialBoard() {
      const b = Array.from({length:8}, () => Array(8).fill(null));
      for (let r=0; r<3; r++) for (let c=0; c<8; c++)
        if ((r+c)%2===1) b[r][c] = { color:'black', king:false };
      for (let r=5; r<8; r++) for (let c=0; c<8; c++)
        if ((r+c)%2===1) b[r][c] = { color:'white', king:false };
      return b;
    }

    let soloBoard  = makeInitialBoard();
    let soloTurn   = 'white';
    let soloGameOver = false;
    let aiThinking   = false;

    setGameStatus('active');
    switchBoardArea('checkers');

    // 규칙·좌표는 AICheckers(= 서버와 같은 규칙, { row, col })가 정한다.
    // ⚠ 예전 혼자하기는 { r, c } 이동을 { row, col } 을 기대하는 보드에 넘겨 갈 곳이 하나도 표시되지 않았고
    //   (한 수도 둘 수 없었다), 연속 점프도 없어서 점프 한 번이면 차례가 AI 로 넘어갔다.
    let mustJumpFrom = null;   // 연속 점프 중인 내 말
    CheckersBoard.init({ board: soloBoard, myColor: playerColor, onMove: handlePlayerMove,
                         validMoves: AICheckers.getValidMoves(soloBoard, playerColor).moves, mustJump: null });
    CheckersBoard.setMyTurn(playerColor === 'white');

    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';

    const colorLabel = playerColor === 'white' ? '빨강 (선공)' : '검정 (후공)';
    myLabel.textContent  = `나 (${colorLabel})`;
    oppLabel.textContent = 'AI 봇';
    myDot.className      = 'player-color-dot ' + playerColor;
    oppDot.className     = 'player-color-dot ' + aiColor;

    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('leave-btn').style.display  = '';

    setActiveBoard(CheckersBoard);
    updateTurnIndicator(soloTurn);

    document.getElementById('resign-btn').onclick = () => {
      if (soloGameOver) return;
      if (!confirm('게임을 포기하시겠습니까?')) return;
      endSoloGame(aiColor, 'resign');
    };

    if (playerColor !== 'white') setTimeout(aiMove, 600);

    const hasPieces = (color) => soloBoard.some((row) => row.some((p) => p && p.color === color));

    // 무르기 — 내 마지막 턴(연속 점프 전체)과 AI 응수를 되돌린다. 연속 점프 도중에 누르면 그 턴의 시작으로.
    // (예전엔 무르기 버튼이 보였지만 등록된 동작이 없어 눌러도 아무 일도 없었다)
    if (typeof setupUndo === 'function') {
      setupUndo(() => {
        if (soloGameOver || aiThinking || soloTurn !== playerColor || !history.length) return;
        soloBoard = history.pop();
        mustJumpFrom = null;
        CheckersBoard.updateAfterMove(soloBoard, null, AICheckers.getValidMoves(soloBoard, playerColor).moves, null);
        CheckersBoard.setMyTurn(true);
        updateTurnIndicator(playerColor);
      });
    }

    function handlePlayerMove({ from, to }) {
      if (soloGameOver || aiThinking || soloTurn !== playerColor) return;
      const step = AICheckers.getValidMoves(soloBoard, playerColor, mustJumpFrom).moves
        .find((m) => m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col);
      if (!step) return;
      if (!mustJumpFrom) history.push(soloBoard);   // applyStep 은 새 판을 만든다
      const r = AICheckers.applyStep(soloBoard, step);
      soloBoard = r.board;
      if (typeof Sound !== 'undefined') Sound.play(step.isJump ? 'capture' : 'move');
      if (r.continueFrom) {   // 같은 말로 계속 잡는다 — 차례는 넘어가지 않는다
        mustJumpFrom = r.continueFrom;
        CheckersBoard.updateAfterMove(soloBoard, step, AICheckers.getValidMoves(soloBoard, playerColor, mustJumpFrom).moves, mustJumpFrom);
        return;
      }
      mustJumpFrom = null;
      CheckersBoard.updateAfterMove(soloBoard, step, [], null);
      if (!hasPieces(aiColor)) { endSoloGame(playerColor, 'no-pieces'); return; }
      if (!AICheckers.getValidMoves(soloBoard, aiColor).moves.length) { endSoloGame(playerColor, 'no-moves'); return; }
      soloTurn = aiColor;
      updateTurnIndicator(soloTurn);
      CheckersBoard.setMyTurn(false);
      aiThinking = true;
      setTimeout(aiMove, 400 + Math.random() * 300);
    }

    // AI 턴 — 연속 점프는 한 걸음씩 보여 준다
    function aiMove() {
      if (soloGameOver) return;
      const steps = AICheckers.getBestTurn(soloBoard, aiColor);
      if (!steps) { endSoloGame(playerColor, 'no-moves'); return; }
      (function play(i) {
        if (soloGameOver) return;
        const step = steps[i];
        soloBoard = AICheckers.applyStep(soloBoard, step).board;
        if (typeof Sound !== 'undefined') Sound.play(step.isJump ? 'capture' : 'move');
        if (i + 1 < steps.length) {
          CheckersBoard.updateAfterMove(soloBoard, step, [], null);
          setTimeout(() => play(i + 1), 450);
          return;
        }
        const next = AICheckers.getValidMoves(soloBoard, playerColor).moves;
        CheckersBoard.updateAfterMove(soloBoard, step, next, null);
        aiThinking = false;
        if (!hasPieces(playerColor)) { endSoloGame(aiColor, 'no-pieces'); return; }
        if (!next.length) { endSoloGame(aiColor, 'no-moves'); return; }
        soloTurn = playerColor;
        updateTurnIndicator(soloTurn);
        CheckersBoard.setMyTurn(true);
      })(0);
    }

    function endSoloGame(winner, reason) {
      soloGameOver = true;
      setGameStatus('finished');
      CheckersBoard.setMyTurn(false);
      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('checkers', result);
      }
      if (typeof Sound !== 'undefined') {
        if (winner === 'draw') Sound.play('draw');
        else if (winner === playerColor) Sound.play('win');
        else Sound.play('lose');
      }
      showGameOver(winner, reason);
      document.getElementById('rematch-btn').textContent = '다시하기';
      document.getElementById('rematch-btn').onclick = () => location.reload();
    }
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
