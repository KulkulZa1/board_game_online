// game-othello.js — Othello GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.othello = (function () {

  function computeValidMoves(board, color) {
    if (!board) return [];
    const opp  = color === 'white' ? 'black' : 'white';
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const moves = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] !== null) continue;
        let valid = false;
        for (const [dr, dc] of dirs) {
          let r = row+dr, c = col+dc, cnt = 0;
          while (r>=0&&r<8&&c>=0&&c<8&&board[r][c]===opp) { r+=dr; c+=dc; cnt++; }
          if (cnt > 0 && r>=0&&r<8&&c>=0&&c<8&&board[r][c]===color) { valid=true; break; }
        }
        if (valid) moves.push({ row, col });
      }
    }
    return moves;
  }

  function initBoard(state, myColor, handleAction /*, myRole */) {
    const validMoves = computeValidMoves(state.board, myColor);
    OthelloBoard.init({ board: state.board, myColor, onMove: handleAction, validMoves });
    return { board: OthelloBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    OthelloBoard.init({
      board:         state.board,
      myColor:       'black',
      onMove:        handleAction,
      spectatorMode: true,
    });
    OthelloBoard.setMyTurn(false);
    return { board: OthelloBoard };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    const validMoves = computeValidMoves(state.board, myColor);
    OthelloBoard.init({ board: state.board, myColor, onMove: handleAction, validMoves });
    OthelloBoard.setMyTurn(myColor === 'black');
    return { board: OthelloBoard };
  }

  function onMoveMade({ board, move, validMoves, pass }, showToastMsg) {
    OthelloBoard.updateAfterMove(board, move, validMoves);
    if (typeof Sound !== 'undefined') Sound.play('move');
    if (pass && showToastMsg) showToastMsg('상대방이 패스했습니다. 계속 두세요.');
  }

  function getMyTurn(state, myColor) {
    return state.currentTurn === myColor;
  }

  function startSolo(playerColor, helpers) {
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
    } = helpers;

    const aiColor = playerColor === 'black' ? 'white' : 'black';
    let soloBoard = [
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,'white','black',null,null,null],
      [null,null,null,'black','white',null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
    ];
    let soloTurn   = 'black';
    let soloGameOver = false;
    let aiThinking   = false;

    setGameStatus('active');
    switchBoardArea('othello');

    const playerMoves = computeValidMoves(soloBoard, playerColor);
    OthelloBoard.init({ board: soloBoard, myColor: playerColor, onMove: handlePlayerMove, validMoves: playerMoves });
    OthelloBoard.setMyTurn(playerColor === 'black');

    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';

    const colorLabel = playerColor === 'black' ? '흑 (선공)' : '백 (후공)';
    myLabel.textContent  = `나 (${colorLabel})`;
    oppLabel.textContent = 'AI 봇';
    myDot.className      = 'player-color-dot ' + playerColor;
    oppDot.className     = 'player-color-dot ' + aiColor;

    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('leave-btn').style.display  = '';

    setActiveBoard(OthelloBoard);
    updateTurnIndicator(soloTurn);

    document.getElementById('resign-btn').onclick = () => {
      if (soloGameOver) return;
      if (!confirm('게임을 포기하시겠습니까?')) return;
      endSoloGame(aiColor, 'resign');
    };

    if (playerColor !== 'black') setTimeout(aiMove, 600);

    function applyOthelloMove(board, row, col, color) {
      const b = board.map(r => [...r]);
      const opp  = color==='white'?'black':'white';
      const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      b[row][col] = color;
      for (const [dr,dc] of dirs) {
        const flip = [];
        let r=row+dr, c=col+dc;
        while (r>=0&&r<8&&c>=0&&c<8&&b[r][c]===opp) { flip.push([r,c]); r+=dr; c+=dc; }
        if (flip.length&&r>=0&&r<8&&c>=0&&c<8&&b[r][c]===color)
          flip.forEach(([fr,fc]) => { b[fr][fc]=color; });
      }
      return b;
    }

    function isGameOver(board) {
      return computeValidMoves(board,'black').length===0 && computeValidMoves(board,'white').length===0;
    }

    function countWinner(board) {
      let b=0, w=0;
      for (const row of board) for (const c of row) { if(c==='black')b++; else if(c==='white')w++; }
      if (b>w) return 'black';
      if (w>b) return 'white';
      return 'draw';
    }

    function handlePlayerMove({ row, col }) {
      if (soloGameOver || aiThinking) return;
      if (soloTurn !== playerColor) return;
      soloBoard = applyOthelloMove(soloBoard, row, col, playerColor);
      const nextMoves = computeValidMoves(soloBoard, playerColor);
      OthelloBoard.updateAfterMove(soloBoard, { row, col }, nextMoves);
      if (typeof Sound !== 'undefined') Sound.play('move');
      if (isGameOver(soloBoard)) { endSoloGame(countWinner(soloBoard), 'board-full'); return; }
      const aiMoves = computeValidMoves(soloBoard, aiColor);
      if (!aiMoves.length) {
        // AI passes — player gets another turn
        const pm = computeValidMoves(soloBoard, playerColor);
        OthelloBoard.updateAfterMove(soloBoard, null, pm);
        return;
      }
      soloTurn = aiColor;
      updateTurnIndicator(soloTurn);
      OthelloBoard.setMyTurn(false);
      aiThinking = true;
      setTimeout(aiMove, 400 + Math.random() * 300);
    }

    function aiMove() {
      if (soloGameOver) return;
      const move = AIOthello.getBestMove(soloBoard, aiColor);
      if (!move) {
        // AI passes
        aiThinking = false;
        soloTurn = playerColor;
        updateTurnIndicator(soloTurn);
        const pm = computeValidMoves(soloBoard, playerColor);
        OthelloBoard.updateAfterMove(soloBoard, null, pm);
        OthelloBoard.setMyTurn(true);
        return;
      }
      soloBoard = applyOthelloMove(soloBoard, move.row, move.col, aiColor);
      const pm = computeValidMoves(soloBoard, playerColor);
      OthelloBoard.updateAfterMove(soloBoard, move, pm);
      if (typeof Sound !== 'undefined') Sound.play('move');
      aiThinking = false;
      if (isGameOver(soloBoard)) { endSoloGame(countWinner(soloBoard), 'board-full'); return; }
      soloTurn = playerColor;
      updateTurnIndicator(soloTurn);
      OthelloBoard.setMyTurn(true);
    }

    function endSoloGame(winner, reason) {
      soloGameOver = true;
      setGameStatus('finished');
      OthelloBoard.setMyTurn(false);
      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('othello', result);
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

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, computeValidMoves, startSolo };
})();
