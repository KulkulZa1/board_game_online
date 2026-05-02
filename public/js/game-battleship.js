// game-battleship.js — 배틀십 GameHandler + 솔로 모드
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.battleship = (function () {

  // ===== 멀티플레이어: 보드 초기화 =====

  function initBoard(state, myColor, handleAction) {
    BattleshipBoard.init({
      myColor,
      onMove:  handleAction,
    });
    BattleshipBoard.setPhase('placement');
    return { board: BattleshipBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    BattleshipBoard.initSpectator({
      onMove: handleAction,
    });
    return { board: BattleshipBoard };
  }

  function initGame(state, myColor, handleAction) {
    BattleshipBoard.init({
      myColor,
      onMove: handleAction,
    });
    if (state.phase === 'active') {
      BattleshipBoard.setPhase('active');
      BattleshipBoard.setMyTurn(state.currentTurn === myColor);
    } else {
      BattleshipBoard.setPhase('placement');
    }
    return { board: BattleshipBoard };
  }

  function onMoveMade({ move, attackGrids }) {
    if (attackGrids) {
      BattleshipBoard.updateAfterShot(attackGrids, move);
    }
    if (typeof Sound !== 'undefined' && move) {
      if (move.result === 'hit' || move.result === 'sunk') {
        Sound.play('capture');
      } else {
        Sound.play('move');
      }
    }
  }

  function getMyTurn(state, myColor) {
    return state.phase === 'active' && state.currentTurn === myColor;
  }

  // ===== 솔로 모드 =====

  function startSolo(playerColor, helpers, options) {
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
      appendMoveToList,
    } = helpers;

    const aiColor = playerColor === 'white' ? 'black' : 'white';
    const SOLO_DURATION_MS = 3 * 60 * 1000;

    // 솔로 상태
    let soloPhase        = 'placement';  // 'placement' | 'active'
    let soloGameOver     = false;
    let soloTurn         = 'white';      // 배틀십은 항상 white 먼저
    let timerMs          = SOLO_DURATION_MS;
    let timerInterval    = null;
    let moveNum          = 0;

    // 공격 그리드 (자신의 공격 결과)
    const soloAttackGrids = {
      white: _emptyGrid(),
      black: _emptyGrid(),
    };

    // 함선 그리드
    let playerShipGrid = null;
    let aiShipGrid     = null;
    const playerShipStatus = {};
    const aiShipStatus     = {};

    setGameStatus('active');
    switchBoardArea('battleship');

    // 레이블 설정
    const colorLabelW = '백 (선공)';
    const colorLabelB = '흑 (후공)';
    myLabel.textContent  = `나 (${playerColor === 'white' ? colorLabelW : colorLabelB})`;
    oppLabel.textContent = `AI 함대 (${aiColor === 'white' ? colorLabelW : colorLabelB})`;
    if (myDot)  myDot.className  = 'player-color-dot ' + playerColor;
    if (oppDot) oppDot.className = 'player-color-dot ' + aiColor;

    const resignBtn = document.getElementById('resign-btn');
    const drawBtn   = document.getElementById('draw-btn');
    const leaveBtn  = document.getElementById('leave-btn');
    if (resignBtn) resignBtn.style.display = '';
    if (drawBtn)   drawBtn.style.display   = 'none';
    if (leaveBtn)  leaveBtn.style.display  = '';

    if (connectingOverlay)    connectingOverlay.style.display    = 'none';
    if (spectatorJoinOverlay) spectatorJoinOverlay.style.display = 'none';

    // 보드 초기화 (배치 단계)
    BattleshipBoard.init({
      myColor: playerColor,
      onMove:  handleSoloAction,
    });
    BattleshipBoard.setPhase('placement');

    setActiveBoard(BattleshipBoard);
    updateTurnIndicator(soloTurn);

    if (resignBtn) {
      resignBtn.onclick = () => {
        if (soloGameOver) return;
        if (!confirm('게임을 포기하시겠습니까?')) return;
        endSoloGame('resign');
      };
    }

    // AI는 즉시 랜덤 배치
    const aiShips = (typeof AIBattleship !== 'undefined') ? AIBattleship.randomPlacement() : _defaultAIPlacement();
    _buildShipGrid(aiShips, aiShipGrid = _emptyGrid(), aiShipStatus);

    // ---- 솔로 액션 핸들러 ----

    function handleSoloAction(data) {
      if (soloGameOver) return;

      if (data.action === 'place') {
        // 플레이어 배치 완료
        _buildShipGrid(data.ships, playerShipGrid = _emptyGrid(), playerShipStatus);
        soloPhase = 'active';

        BattleshipBoard.setPhase('active');

        // 타이머 시작
        _updateTimerDisplay();
        timerInterval = setInterval(() => {
          if (soloGameOver) { clearInterval(timerInterval); return; }
          timerMs -= 1000;
          _updateTimerDisplay();
          if (timerMs <= 0) {
            clearInterval(timerInterval);
            endSoloGame('timeout');
          }
        }, 1000);

        soloTurn = 'white';
        updateTurnIndicator(soloTurn);

        if (playerColor === 'white') {
          BattleshipBoard.setMyTurn(true);
        } else {
          BattleshipBoard.setMyTurn(false);
          updateTurnIndicator(aiColor);
          setTimeout(soloAIShot, 800);
        }
        return;
      }

      // 포격 처리
      if (soloPhase !== 'active') return;
      if (soloTurn !== playerColor) return;
      if (soloGameOver) return;

      const { row, col } = data;
      _applyShot(playerColor, row, col);
    }

    function _applyShot(shooter, row, col) {
      const opponent    = shooter === 'white' ? 'black' : 'white';
      const targetGrid  = shooter === playerColor ? aiShipGrid : playerShipGrid;
      const targetStatus = shooter === playerColor ? aiShipStatus : playerShipStatus;

      if (soloAttackGrids[shooter][row][col] !== null) return;  // 이미 공격

      const hitShipName = targetGrid[row][col];
      let result = 'miss';
      let sunkShip = null;

      if (hitShipName) {
        result = 'hit';
        targetStatus[hitShipName]--;
        if (targetStatus[hitShipName] === 0) {
          result = 'sunk';
          sunkShip = hitShipName;
        }
      }

      soloAttackGrids[shooter][row][col] = result;
      moveNum++;

      const moveRecord = {
        row, col,
        color:    shooter,
        result,
        sunkShip: sunkShip || null,
        moveNum,
        notation: `${String.fromCharCode(65 + col)}${row + 1}`,
        timestamp: Date.now(),
      };

      // 서버 공격 그리드 포맷과 동일하게 BattleshipBoard에 전달
      BattleshipBoard.updateAfterShot({ ...soloAttackGrids }, moveRecord);

      if (typeof Sound !== 'undefined') {
        Sound.play(result === 'hit' || result === 'sunk' ? 'capture' : 'move');
      }

      if (typeof appendMoveToList === 'function') {
        appendMoveToList({
          moveNum,
          color:    shooter,
          notation: `${moveRecord.notation} ${result === 'sunk' ? '💥격침!' : result === 'hit' ? '🔴적중' : '⚪빗나감'}`,
        });
      }

      // 승리 확인
      if (_allSunk(targetStatus)) {
        endSoloGame('all-ships-sunk');
        return;
      }

      // 턴 전환
      soloTurn = opponent;
      updateTurnIndicator(soloTurn);

      if (soloTurn === playerColor) {
        BattleshipBoard.setMyTurn(true);
      } else {
        BattleshipBoard.setMyTurn(false);
        setTimeout(soloAIShot, 600 + Math.random() * 400);
      }
    }

    function soloAIShot() {
      if (soloGameOver) return;
      if (typeof AIBattleship === 'undefined') return;

      const shot = AIBattleship.getBestShot(soloAttackGrids[aiColor]);
      if (!shot) { endSoloGame('all-ships-sunk'); return; }

      _applyShot(aiColor, shot.r, shot.c);
    }

    function endSoloGame(reason) {
      if (soloGameOver) return;
      soloGameOver = true;
      clearInterval(timerInterval);
      setGameStatus('finished');
      BattleshipBoard.setMyTurn(false);

      let winner;
      if (reason === 'resign') {
        winner = aiColor;
      } else if (reason === 'timeout') {
        // 격침 수 비교
        const playerHits = _countHits(soloAttackGrids[playerColor]);
        const aiHits     = _countHits(soloAttackGrids[aiColor]);
        if (playerHits > aiHits)      winner = playerColor;
        else if (aiHits > playerHits) winner = aiColor;
        else                          winner = 'draw';
      } else {
        // all-ships-sunk
        winner = soloTurn === playerColor ? playerColor : aiColor;
        // 실제 격침 확인
        if (_allSunk(aiShipStatus))     winner = playerColor;
        else if (_allSunk(playerShipStatus)) winner = aiColor;
      }

      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('battleship', result);
      }
      if (typeof Sound !== 'undefined') {
        if (winner === 'draw')            Sound.play('draw');
        else if (winner === playerColor)  Sound.play('win');
        else                              Sound.play('lose');
      }

      showGameOver(winner, reason === 'all-ships-sunk' ? 'all-ships-sunk' : reason);

      const rematchBtn = document.getElementById('rematch-btn');
      if (rematchBtn) {
        rematchBtn.textContent = '다시하기';
        rematchBtn.onclick = () => location.reload();
      }
    }

    function _updateTimerDisplay() {
      const sec = Math.max(0, Math.ceil(timerMs / 1000));
      const m   = Math.floor(sec / 60);
      const s   = sec % 60;
      const str = `${m}:${s.toString().padStart(2, '0')}`;
      const timerEl = document.getElementById('my-timer');
      if (timerEl) timerEl.textContent = str;
      const oppEl = document.getElementById('opponent-timer');
      if (oppEl)   oppEl.textContent   = '-';
    }
  }

  // ===== 내부 헬퍼 =====

  function _emptyGrid() {
    return Array(10).fill(null).map(() => Array(10).fill(null));
  }

  function _buildShipGrid(ships, grid, statusObj) {
    for (const ship of ships) {
      statusObj[ship.name] = ship.cells.length;
      for (const { r, c } of ship.cells) {
        grid[r][c] = ship.name;
      }
    }
  }

  function _allSunk(statusObj) {
    return Object.keys(statusObj).length > 0 &&
           Object.values(statusObj).every(v => v === 0);
  }

  function _countHits(attackGrid) {
    let count = 0;
    for (const row of attackGrid) {
      for (const cell of row) {
        if (cell === 'hit' || cell === 'sunk') count++;
      }
    }
    return count;
  }

  function _defaultAIPlacement() {
    return [
      { name: 'carrier',    cells: [{ r:0,c:0 },{ r:0,c:1 },{ r:0,c:2 },{ r:0,c:3 },{ r:0,c:4 }] },
      { name: 'battleship', cells: [{ r:2,c:0 },{ r:2,c:1 },{ r:2,c:2 },{ r:2,c:3 }] },
      { name: 'cruiser',    cells: [{ r:4,c:0 },{ r:4,c:1 },{ r:4,c:2 }] },
      { name: 'submarine',  cells: [{ r:6,c:0 },{ r:6,c:1 },{ r:6,c:2 }] },
      { name: 'destroyer',  cells: [{ r:8,c:0 },{ r:8,c:1 }] },
    ];
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
