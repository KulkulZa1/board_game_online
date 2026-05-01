// game.js — Main game controller (체스 + 오목 통합)

(function () {
  const params = new URLSearchParams(location.search);
  const roomId       = params.get('room');
  const soloGame     = params.get('solo');   // 'connect4' | (향후 다른 게임)
  const soloColor    = params.get('color') || 'white';
  const isSoloMode   = !!soloGame;
  // 솔로 모드 추가 옵션
  const soloBoardSizeParam = params.get('boardSize');
  const soloBoardRows      = params.get('boardRows');
  const soloBoardCols      = params.get('boardCols');
  const soloNumDecks       = parseInt(params.get('numDecks'))     || 2;
  const soloWinCondition   = parseInt(params.get('winCondition')) || 2;
  const soloOptions = {
    numDecks:     soloNumDecks,
    winCondition: soloWinCondition,
    boardSize:    soloBoardSizeParam ? { size: parseInt(soloBoardSizeParam) }
                : soloBoardRows     ? { rows: parseInt(soloBoardRows), cols: parseInt(soloBoardCols) }
                : null,
  };

  if (!roomId && !isSoloMode) {
    location.href = '/';
    return;
  }

  // ========== State ==========
  let gameType     = isSoloMode ? soloGame : null;
  let ActiveBoard  = null;
  let myColor      = isSoloMode ? soloColor : null;
  let myRole       = isSoloMode ? 'host' : null;  // solo에서는 항상 host
  let gameStatus   = 'connecting';
  let isUnlimited  = true;  // solo는 타이머 없음
  let chess        = null;
  let drawOfferPending = false;
  let pendingSpectatorSocketId = null;

  // ========== 버튼 중복/도배 방지 ==========
  let drawOfferCount    = 0;
  let drawLastOfferTime = 0;
  let drawBtnDisabled   = false;
  let resignLastClick   = 0;
  let resignEmitted     = false;

  // ========== Socket (솔로 모드에서는 더미 사용) ==========
  const socket = isSoloMode
    ? { on: () => {}, emit: () => {}, connected: false, disconnect: () => {} }
    : io({ reconnectionAttempts: 20 });

  // ========== DOM ==========
  const connectingOverlay       = document.getElementById('connecting-overlay');
  const spectatorJoinOverlay    = document.getElementById('spectator-join-overlay');
  const spectatorPendingOverlay = document.getElementById('spectator-pending-overlay');
  const spectatorRequestToast   = document.getElementById('spectator-request-toast');
  const disconnectBanner        = document.getElementById('disconnect-banner');
  const disconnectMsg           = document.getElementById('disconnect-msg');
  const turnIndicator           = document.getElementById('turn-indicator');
  const gameoverModal           = document.getElementById('gameover-modal');
  const drawModal               = document.getElementById('draw-modal');
  const resignModal             = document.getElementById('resign-modal');
  const myLabel   = document.getElementById('my-label');
  const oppLabel  = document.getElementById('opponent-label');
  const myDot     = document.getElementById('my-dot');
  const oppDot    = document.getElementById('opponent-dot');

  // 솔로 모드: 연결 오버레이 즉시 숨김
  if (isSoloMode) {
    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';
  }

  // ========== Board area switcher ==========
  function switchBoardArea(type) {
    GameRegistry.getAllIds().forEach(t => {
      const meta = GameRegistry.getGame(t);
      const el = meta ? document.getElementById(meta.boardAreaId) : null;
      if (el) el.style.display = t === type ? '' : 'none';
    });
  }

  // ========== Connection flow ==========
  socket.on('connect', () => {
    const token = localStorage.getItem(`chess_token_${roomId}`);
    if (token) {
      socket.emit('room:reconnect', { playerToken: token });
    } else {
      connectingOverlay.style.display = 'none';
      spectatorJoinOverlay.style.display = 'flex';
    }
  });

  socket.on('connect_error', () => {
    showBanner('서버 연결 중...', false);
    if (ActiveBoard) ActiveBoard.setMyTurn(false);
  });

  socket.on('disconnect', () => {
    if (ActiveBoard) ActiveBoard.setMyTurn(false);
  });

  socket.on('reconnect', () => {
    const token = localStorage.getItem(`chess_token_${roomId}`);
    if (token) socket.emit('room:reconnect', { playerToken: token });
  });

  socket.on('server:shutdown', () => {
    if (ActiveBoard) ActiveBoard.setMyTurn(false);
    Timer.stopLoop();
    showBanner('서버가 종료되었습니다. 잠시 후 다시 시도하세요.', true);
  });

  // ========== Room events ==========
  socket.on('room:error', ({ message }) => {
    connectingOverlay.style.display = 'none';
    alert(message);
    location.href = '/';
  });

  // ========== Chat ==========
  socket.on('chat:message', (msg) => {
    Chat.addMessage(msg);
  });

  // ========== Game start (게스트 참가 → host의 game:start 수신) ==========
  socket.on('game:start', (state) => {
    if (myColor) initGame(state);
  });

  // ========== game:state (재접속 시 서버에서 현재 상태 전달) ==========
  socket.on('game:state', (state) => {
    connectingOverlay.style.display = 'none';
    hideBanner();

    gameType    = state.gameType || 'chess';
    myColor     = state.yourColor;
    myRole      = state.hostColor === myColor ? 'host' : 'guest';
    isUnlimited = !state.timeControl.minutes;

    const _gameMeta = GameRegistry.getGame(gameType);
    document.title = (_gameMeta ? _gameMeta.gameTitle : null) || '대국';
    switchBoardArea(gameType);
    setupPlayerBars();
    Chat.init({ role: myRole, socket });
    Chat.loadHistory(state.chat || []);

    if (GameHandlers[gameType]) {
      const handleAction = gameType === 'indianpoker' ? handleIPAction : handleMyMove;
      const init = GameHandlers[gameType].initBoard(state, myColor, handleAction, myRole);
      ActiveBoard = init.board;
      if (init.chess !== undefined) chess = init.chess;
    }

    // 플레이어 전용 컨트롤 표시
    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = gameType === 'chess' ? '' : 'none';
    document.getElementById('undo-btn').style.display   = gameType === 'indianpoker' ? 'none' : '';
    // 수 기록/복기 패널 — 체스는 SAN 복기 지원
    document.getElementById('moves-panel').style.display = gameType === 'indianpoker' ? 'none' : '';
    // 자동 거절 패널 표시 (관전자 제외, 인디언 포커 제외)
    const autoDeclinePanel = document.getElementById('auto-decline-panel');
    if (autoDeclinePanel && gameType !== 'indianpoker') autoDeclinePanel.style.display = '';

    if (state.status === 'active') {
      gameStatus = 'active';
      if (gameType !== 'indianpoker' && ActiveBoard && GameHandlers[gameType]) {
        const handler = GameHandlers[gameType];
        const myTurn  = handler.getMyTurn ? handler.getMyTurn(state, myColor) : (state.currentTurn === myColor);
        ActiveBoard.setMyTurn(myTurn);
      }
      updateTurnIndicator(state.currentTurn || (state.timers && state.timers.activeColor));
      Timer.update(state.timers, myColor, isUnlimited);
      Timer.startLoop();
      if (state.moves && state.moves.length > 0) {
        state.moves.forEach(m => appendMoveToList(m));
      }
    } else if (state.status === 'finished') {
      gameStatus = 'finished';
      ActiveBoard.setMyTurn(false);
      if (state.moves) state.moves.forEach(m => appendMoveToList(m));
      if (gameType === 'chess' && state.moves && state.moves.length > 0) {
        Review.init(state.moves);
      }
    } else if (state.status === 'waiting') {
      location.href = `/?room=${roomId}`;
    }
  });

  // ========== Move events ==========
  function handleMyMove(data) {
    if (!socket.connected) return;
    if (myRole === 'spectator') {
      handleSpectatorHintMove(data);
      return;
    }
    socket.emit('game:move', data);
  }

  socket.on('game:move:made', ({ move, fen, board, timers, turn, validMoves, colHeights, mustJump, scores, pass }) => {
    if (GameHandlers[gameType]) {
      if (gameType === 'othello') {
        GameHandlers.othello.onMoveMade({ board, move, validMoves, pass }, showToastMsg);
      } else {
        GameHandlers[gameType].onMoveMade({ move, fen, board, colHeights, validMoves, mustJump, scores });
      }
    }

    if (gameType !== 'indianpoker') appendMoveToList(move);

    if (myRole === 'spectator') {
      if (ActiveBoard) ActiveBoard.setMyTurn(gameStatus === 'active');
    } else if (gameType === 'indianpoker') {
      // 인디언 포커 턴은 indianpoker:bet:turn 으로 처리
    } else {
      const isMyTurn = turn === myColor;
      ActiveBoard.setMyTurn(isMyTurn);
      if (gameType === 'othello' && isMyTurn && validMoves) {
        OthelloBoard.setValidMoves(validMoves);
      }
      if (gameType === 'checkers') {
        CheckersBoard.setValidMoves(validMoves, mustJump);
      }
    }

    updateTurnIndicator(turn);
    Timer.update(timers, myColor || 'white', isUnlimited);

    // 관전자 힌트 초기화
    if (myRole === 'spectator') {
      if (ActiveBoard && ActiveBoard.clearHint) ActiveBoard.clearHint();
    }
  });

  socket.on('game:move:invalid', ({ reason }) => {
    console.warn('Invalid move:', reason);
  });

  // ========== Timer ==========
  socket.on('timer:tick', (timers) => {
    Timer.update(timers, myColor || 'white', isUnlimited);
  });

  // ========== Game over ==========
  socket.on('game:over', ({ winner, reason, pgn, moves, winCells }) => {
    gameStatus = 'finished';
    if (ActiveBoard) ActiveBoard.setMyTurn(false);
    Timer.stopLoop();

    // 버튼 보호 상태 초기화
    drawOfferCount = 0; drawBtnDisabled = false; drawLastOfferTime = 0;
    const drawBtnEl = document.getElementById('draw-btn');
    if (drawBtnEl) { drawBtnEl.disabled = false; drawBtnEl.textContent = '무승부 제안'; }

    // 승리 돌 강조
    if (gameType === 'omok' && winCells && winCells.length) {
      OmokBoard.highlightWin(winCells);
    } else if (gameType === 'connect4' && winCells && winCells.length) {
      Connect4Board.highlightWin(winCells);
    }

    if (myRole !== 'spectator') {
      // 개인 전적 저장
      if (typeof Stats !== 'undefined') {
        let result;
        if (winner === 'draw') result = 'draw';
        else result = (winner === myColor) ? 'win' : 'loss';
        Stats.record(gameType, result);
      }

      showGameOver(winner, reason);
      if (typeof Sound !== 'undefined') {
        if (winner === 'draw')        Sound.play('draw');
        else if (winner === myColor)  Sound.play('win');
        else                          Sound.play('lose');
      }
    } else {
      const winLabel = winner === 'draw' ? '무승부' :
                       (winner === 'black' ? '흑 승리' : '백 승리');
      showToastMsg('게임이 종료되었습니다: ' + winLabel);
    }

    if (gameType === 'chess' && moves && moves.length > 0) {
      Review.init(moves);
    }

    setTimeout(() => {
      localStorage.removeItem(`chess_token_${roomId}`);
      if (localStorage.getItem('chess_room_active') === roomId) {
        localStorage.removeItem('chess_room_active');
      }
    }, 10 * 60 * 1000);
  });

  // ========== Disconnect / reconnect ==========
  socket.on('player:disconnected', ({ role }) => {
    if (role !== myRole) {
      showBanner('상대방 연결이 끊겼습니다. 재접속 대기 중...', true);
    }
  });

  socket.on('player:reconnected', ({ role }) => {
    if (role !== myRole) {
      hideBanner();
      if (typeof Sound !== 'undefined') Sound.play('notify');
    }
  });

  // ========== Draw (체스 전용) ==========
  socket.on('game:draw:offered', () => {
    if (gameType !== 'chess') return;
    if (drawOfferPending) return;
    drawOfferPending = true;
    // 자동 거절 설정 확인
    const autoDeclineDraw = document.getElementById('auto-decline-draw');
    if (autoDeclineDraw && autoDeclineDraw.checked) {
      drawOfferPending = false;
      socket.emit('game:draw:respond', { accept: false });
      showToastMsg('무승부 제안을 자동으로 거절했습니다.');
      return;
    }
    drawModal.style.display = 'flex';
  });

  socket.on('game:draw:declined', () => {
    showToastMsg('상대방이 무승부를 거절했습니다.');
  });

  document.getElementById('draw-accept-btn').addEventListener('click', () => {
    drawModal.style.display = 'none';
    drawOfferPending = false;
    socket.emit('game:draw:respond', { accept: true });
  });

  document.getElementById('draw-decline-btn').addEventListener('click', () => {
    drawModal.style.display = 'none';
    drawOfferPending = false;
    socket.emit('game:draw:respond', { accept: false });
  });

  document.getElementById('draw-btn').addEventListener('click', () => {
    if (gameType !== 'chess' || gameStatus !== 'active' || myRole === 'spectator') return;
    if (drawBtnDisabled) return;
    const now = Date.now();
    if (now - drawLastOfferTime < 5000) {
      showToastMsg('무승부 제안은 5초에 한 번만 가능합니다.');
      return;
    }
    drawLastOfferTime = now;
    drawOfferCount++;
    if (drawOfferCount >= 3) {
      drawBtnDisabled = true;
      const btn = document.getElementById('draw-btn');
      btn.disabled = true;
      btn.textContent = '무승부 제안 (대기 중)';
      showToastMsg('무승부 제안이 너무 많습니다. 60초 후 재사용 가능합니다.');
      setTimeout(() => {
        drawBtnDisabled = false;
        drawOfferCount  = 0;
        btn.disabled    = false;
        btn.textContent = '무승부 제안';
      }, 60000);
      return;
    }
    socket.emit('game:draw:offer');
    showToastMsg('무승부를 제안했습니다.');
  });

  // ========== Resign ==========
  document.getElementById('resign-btn').addEventListener('click', () => {
    if (gameStatus !== 'active' || myRole === 'spectator') return;
    const now = Date.now();
    if (now - resignLastClick < 3000) return;   // 3초 쿨다운
    resignLastClick = now;
    resignModal.style.display = 'flex';
  });

  document.getElementById('resign-confirm-btn').addEventListener('click', () => {
    if (resignEmitted) return;                  // 이중 전송 방지
    resignEmitted = true;
    resignModal.style.display = 'none';
    socket.emit('game:resign');
  });

  document.getElementById('resign-cancel-btn').addEventListener('click', () => {
    resignModal.style.display = 'none';
  });

  // ========== Leave ==========
  // ========== 규칙 모달 (게임 중) ==========
  (function setupRulesModal() {
    const rulesBtn      = document.getElementById('rules-btn');
    const rulesModal    = document.getElementById('game-rules-modal');
    const rulesTitle    = document.getElementById('game-rules-title');
    const rulesBody     = document.getElementById('game-rules-body');
    const rulesCloseBtn = document.getElementById('game-rules-close-btn');

    function openRules() {
      const data = (GameRegistry.getGame(gameType) || GameRegistry.getGame('chess')).rules;
      rulesTitle.textContent = data.title;
      rulesBody.innerHTML = data.sections.map(s =>
        `<div style="margin-bottom:14px;">
           <div style="font-size:13px;font-weight:700;color:#4a9eff;margin-bottom:4px;">${s.head}</div>
           <div style="font-size:13px;color:#c0cad8;line-height:1.65;">${s.text.replace(/\n/g,'<br>')}</div>
         </div>`
      ).join('');
      rulesModal.style.display = 'flex';
    }

    rulesBtn.addEventListener('click', openRules);
    rulesCloseBtn.addEventListener('click', () => { rulesModal.style.display = 'none'; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && rulesModal.style.display !== 'none') {
        rulesModal.style.display = 'none';
      }
    });
  })();

  document.getElementById('leave-btn').addEventListener('click', () => {
    let msg = '게임에서 나가시겠습니까?';
    if (gameStatus === 'active' && myRole !== 'spectator') {
      msg = '게임이 진행 중입니다. 나가면 기권 처리됩니다.\n계속하시겠습니까?';
    }
    if (!confirm(msg)) return;
    if (gameStatus === 'active' && myRole !== 'spectator') {
      socket.emit('game:resign');
    }
    localStorage.removeItem(`chess_token_${roomId}`);
    if (localStorage.getItem('chess_room_active') === roomId) {
      localStorage.removeItem('chess_room_active');
    }
    location.href = '/';
  });

  // ========== Rematch ==========
  socket.on('rematch:requested', () => {
    const rematchBtn = document.getElementById('rematch-btn');
    rematchBtn.textContent = '재대국 수락';
    rematchBtn.onclick = () => {
      socket.emit('game:rematch:respond', { accept: true });
      gameoverModal.style.display = 'none';
    };
  });

  socket.on('rematch:declined', () => {
    showToastMsg('상대방이 재대국을 거절했습니다.');
  });

  socket.on('rematch:accepted', () => {
    gameoverModal.style.display = 'none';
    location.reload();
  });

  document.getElementById('rematch-btn').addEventListener('click', () => {
    socket.emit('game:rematch:request');
    document.getElementById('rematch-btn').textContent = '대기 중...';
    document.getElementById('rematch-btn').disabled = true;
  });

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    gameoverModal.style.display = 'none';
  });

  // ========== Spectator: 닉네임 입력 ==========
  document.getElementById('spectator-join-submit').addEventListener('click', submitSpectatorJoin);
  document.getElementById('spectator-nickname-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitSpectatorJoin();
  });

  function submitSpectatorJoin() {
    const nick = document.getElementById('spectator-nickname-input').value.trim() || '관전자';
    spectatorJoinOverlay.style.display = 'none';
    spectatorPendingOverlay.style.display = 'flex';
    socket.emit('spectator:join', { roomId, nickname: nick });
  }

  socket.on('spectator:error', ({ message }) => {
    spectatorJoinOverlay.style.display = 'none';
    spectatorPendingOverlay.style.display = 'none';
    alert(message);
    location.href = '/';
  });

  socket.on('spectator:pending', () => { /* already showing overlay */ });

  // ========== Spectator: 승인됨 ==========
  socket.on('spectator:approved', (state) => {
    spectatorPendingOverlay.style.display = 'none';
    connectingOverlay.style.display = 'none';

    myRole      = 'spectator';
    myColor     = null;
    gameType    = state.gameType || 'chess';
    isUnlimited = !state.timeControl.minutes;

    const _specMeta = GameRegistry.getGame(gameType);
    document.title = (_specMeta ? _specMeta.specTitle : null) || '관전';
    switchBoardArea(gameType);

    const spectatorOrientation = state.hostColor || 'white';

    Chat.init({ role: 'spectator', socket });
    Chat.loadHistory(state.chat || []);

    if (GameHandlers[gameType]) {
      const init = GameHandlers[gameType].initSpectatorBoard(state, spectatorOrientation, handleSpectatorHintMove);
      ActiveBoard = init.board;
      if (init.chess !== undefined) chess = init.chess;
    }

    // 플레이어 바
    const hostColorLabel  = state.hostColor === 'white' ? '백' : '흑';
    const guestColorLabel = state.hostColor === 'white' ? '흑' : '백';
    myDot.className      = 'player-color-dot ' + state.hostColor;
    myLabel.textContent  = `호스트 (${hostColorLabel})`;
    oppDot.className     = 'player-color-dot ' + (state.hostColor === 'white' ? 'black' : 'white');
    oppLabel.textContent = `게스트 (${guestColorLabel})`;

    // 컨트롤 표시 조정
    document.getElementById('resign-btn').style.display = 'none';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('spectator-controls').style.display = 'flex';
    // 수 기록 패널
    document.getElementById('moves-panel').style.display = gameType === 'chess' ? '' : '';
    updateSpectatorCount(state.spectatorCount || 1);

    if (state.status === 'active') {
      gameStatus = 'active';
      const activeTurn = state.currentTurn || (state.timers && state.timers.activeColor);
      updateTurnIndicator(activeTurn);
      Timer.update(state.timers, spectatorOrientation, isUnlimited);
      Timer.startLoop();
      if (state.moves && state.moves.length > 0) {
        state.moves.forEach(m => appendMoveToList(m));
      }
      // 관전자 훈수 활성화
      if (ActiveBoard) ActiveBoard.setMyTurn(true);
      updateSpectatorHintLabel();
    } else if (state.status === 'finished') {
      gameStatus = 'finished';
      if (ActiveBoard) ActiveBoard.setMyTurn(false);
      if (state.moves) state.moves.forEach(m => appendMoveToList(m));
      if (gameType === 'chess' && state.moves && state.moves.length > 0) Review.init(state.moves);
    }

    showToastMsg('관전을 시작합니다! 훈수를 제안할 수 있습니다.');
  });

  socket.on('spectator:denied', ({ message }) => {
    spectatorPendingOverlay.style.display = 'none';
    alert(message || '방장이 관전을 거부했습니다.');
    location.href = '/';
  });

  // ========== Spectator: 방장이 요청 알림 ==========
  let spectatorRequestQueue = [];
  let showingRequest = false;

  socket.on('spectator:request', ({ socketId, nickname }) => {
    if (myRole !== 'host') return;
    spectatorRequestQueue.push({ socketId, nickname });
    showNextSpectatorRequest();
  });

  function showNextSpectatorRequest() {
    if (showingRequest || spectatorRequestQueue.length === 0) return;
    showingRequest = true;
    const { socketId, nickname } = spectatorRequestQueue.shift();
    pendingSpectatorSocketId = socketId;
    document.getElementById('spectator-request-name').textContent =
      `"${nickname}" 님이 관전을 요청합니다.`;
    spectatorRequestToast.style.display = 'block';
  }

  document.getElementById('spectator-approve-btn').addEventListener('click', () => {
    if (!pendingSpectatorSocketId) return;
    socket.emit('spectator:approve', { socketId: pendingSpectatorSocketId });
    closeSpectatorRequestToast();
  });

  document.getElementById('spectator-deny-btn').addEventListener('click', () => {
    if (!pendingSpectatorSocketId) return;
    socket.emit('spectator:deny', { socketId: pendingSpectatorSocketId });
    closeSpectatorRequestToast();
  });

  function closeSpectatorRequestToast() {
    spectatorRequestToast.style.display = 'none';
    pendingSpectatorSocketId = null;
    showingRequest = false;
    setTimeout(showNextSpectatorRequest, 500);
  }

  // ========== Spectator: 입장/퇴장 ==========
  socket.on('spectator:joined', ({ nickname, count }) => {
    updateSpectatorCount(count);
    showToastMsg(`👁 ${nickname}님이 관전을 시작합니다.`);
  });

  socket.on('spectator:left', ({ nickname, count }) => {
    updateSpectatorCount(count);
  });

  function updateSpectatorCount(count) {
    const el    = document.getElementById('spectator-count');
    const badge = document.getElementById('spectator-count-badge');
    if (el)    el.textContent    = count;
    if (badge) badge.style.display = count > 0 ? '' : 'none';
  }

  // ========== Spectator: 훈수 처리 ==========
  function handleSpectatorHintMove(data) {
    if (!socket.connected) return;
    if (gameType === 'chess') {
      socket.emit('spectator:hint', { from: data.from, to: data.to });
    } else if (gameType === 'omok' || gameType === 'othello' || gameType === 'checkers') {
      socket.emit('spectator:hint', { row: data.row, col: data.col });
    } else if (gameType === 'connect4') {
      socket.emit('spectator:hint', { col: data.col });
    }
  }

  function updateSpectatorHintLabel() {
    const statusEl = document.getElementById('spectator-hint-status');
    if (!statusEl) return;
    const labelMap = {
      chess:       '기물을 클릭하여 수를 선택하세요',
      omok:        '교차점을 클릭하여 훈수 위치를 선택하세요',
      connect4:    '열 버튼을 클릭하여 훈수를 제안하세요',
      othello:     '빈 칸을 클릭하여 훈수를 제안하세요',
      checkers:    '말을 클릭하여 훈수 위치를 선택하세요',
      indianpoker: '인디언 포커는 훈수 불가',
    };
    statusEl.textContent = labelMap[gameType] || '훈수 위치를 선택하세요';
  }

  document.getElementById('spectator-cancel-hint').addEventListener('click', () => {
    if (ActiveBoard && ActiveBoard.clearSelection) ActiveBoard.clearSelection();
    if (ActiveBoard && ActiveBoard.clearHint)      ActiveBoard.clearHint();
    updateSpectatorHintLabel();
    document.getElementById('spectator-cancel-hint').style.display = 'none';
  });

  // 훈수 수신 (플레이어/관전자 모두 수신)
  socket.on('spectator:hint', ({ from, to, san, row, col, label, nickname }) => {
    if (gameType === 'chess') {
      showToastMsg(`💡 ${nickname}: ${san}`);
      if (ActiveBoard && ActiveBoard.showHint) ActiveBoard.showHint(from, to);
    } else if (gameType === 'connect4') {
      showToastMsg(`💡 ${nickname}: ${col + 1}열`);
      if (ActiveBoard && ActiveBoard.showHint) ActiveBoard.showHint(0, col);
    } else {
      showToastMsg(`💡 ${nickname}: ${label || (row !== undefined ? String.fromCharCode(65+col)+(8-row) : '')}`);
      if (ActiveBoard && ActiveBoard.showHint) ActiveBoard.showHint(row, col);
    }
  });

  socket.on('spectator:hint:ratelimit', ({ message }) => {
    showToastMsg('⏳ ' + message);
  });

  socket.on('spectator:hint:invalid', ({ message }) => {
    showToastMsg('❌ ' + message);
  });

  // ========== Helpers ==========
  function setupPlayerBars() {
    const myColorLabel  = myColor === 'white' ? '백' : '흑';
    const oppColor      = myColor === 'white' ? 'black' : 'white';
    const oppColorLabel = oppColor === 'white' ? '백' : '흑';

    myDot.className      = 'player-color-dot ' + myColor;
    myLabel.textContent  = `나 (${myColorLabel})`;
    oppDot.className     = 'player-color-dot ' + oppColor;
    oppLabel.textContent = `상대방 (${oppColorLabel})`;
  }

  function updateTurnIndicator(turn) {
    // turn 은 'white' | 'black' | 'w' | 'b' | undefined
    let color = turn;
    if (!color && gameType === 'chess' && chess) {
      color = chess.turn() === 'w' ? 'white' : 'black';
    }
    if (color === 'w') color = 'white';
    if (color === 'b') color = 'black';

    if (!color) return;

    if (myRole === 'spectator') {
      turnIndicator.textContent = color === 'white' ? '백 차례' : '흑 차례';
      turnIndicator.style.color = '#8892a4';
      return;
    }
    const isMyTurn = color === myColor;
    turnIndicator.textContent = isMyTurn ? '내 차례' : '상대방 차례';
    turnIndicator.style.color = isMyTurn ? '#f0c040' : '#8892a4';
  }

  function appendMoveToList(move) {
    if (!move) return;  // 패스 이벤트 등 수(手) 없는 경우 (예: 오셀로 패스)
    if (gameType === 'chess' || (move.san && !move.notation)) {
      appendChessMoveToList(move);
    } else if (move.notation) {
      appendGenericMoveToList(move);
    } else if (move.from && move.to) {
      // 체커: { from: {row,col}, to: {row,col}, captured, moveNum, color }
      const fromLabel = String.fromCharCode(65 + move.from.col) + (8 - move.from.row);
      const toLabel   = String.fromCharCode(65 + move.to.col)   + (8 - move.to.row);
      appendGenericMoveToList({
        moveNum:  move.moveNum,
        color:    move.color,
        notation: `${fromLabel}→${toLabel}${move.captured ? ' ✕' : ''}`,
      });
    } else {
      appendOmokMoveToList(move);
    }
  }

  function appendGenericMoveToList(move) {
    // 체커 등 notation 필드가 있는 경우 (예: "B6→A5")
    const moveListEl = document.getElementById('move-list');
    const stone = move.color === 'black' ? '⬤' : '○';
    const text  = `${move.moveNum}. ${stone} ${move.notation}`;

    const row = document.createElement('div');
    row.className = 'move-row';
    row.style.gridTemplateColumns = '1fr';

    const el = document.createElement('span');
    el.className   = 'move-san';
    el.textContent = text;
    el.style.color = move.color === 'black' ? '#ccc' : '#fff';
    row.appendChild(el);

    moveListEl.appendChild(row);
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function appendChessMoveToList(move) {
    const moveListEl = document.getElementById('move-list');
    const idx        = moveListEl.querySelectorAll('.move-san').length;
    const moveNum    = Math.floor(idx / 2) + 1;
    const isWhite    = idx % 2 === 0;

    if (isWhite) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const numEl = document.createElement('span');
      numEl.className  = 'move-num';
      numEl.textContent = moveNum + '.';
      row.appendChild(numEl);

      const wEl = document.createElement('span');
      wEl.className  = 'move-san';
      wEl.textContent = move.san;
      wEl.dataset.idx = idx;
      row.appendChild(wEl);

      row.appendChild(document.createElement('span')); // placeholder
      moveListEl.appendChild(row);
    } else {
      const lastRow   = moveListEl.lastElementChild;
      if (lastRow) {
        const ph = lastRow.children[2];
        ph.className  = 'move-san';
        ph.textContent = move.san;
        ph.dataset.idx = idx;
      }
    }
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function appendOmokMoveToList(move) {
    const moveListEl = document.getElementById('move-list');
    const colLetter  = String.fromCharCode(65 + move.col);
    const boardRows  = move.boardRows || 15;
    const rowLabel   = boardRows - move.row;
    const stone      = move.color === 'black' ? '●' : '○';
    const notation   = `${move.moveNum}. ${stone} ${colLetter}${rowLabel}`;

    const row = document.createElement('div');
    row.className  = 'move-row';
    row.style.gridTemplateColumns = '1fr';

    const el = document.createElement('span');
    el.className   = 'move-san';
    el.textContent = notation;
    el.style.color = move.color === 'black' ? '#ccc' : '#fff';
    row.appendChild(el);

    moveListEl.appendChild(row);
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function showGameOver(winner, reason) {
    const reasonMap = {
      checkmate:        '체크메이트',
      'five-in-a-row':  '5목 완성',
      'four-in-a-row':  '4목 완성',
      'board-full':     '무승부 (보드 꽉 참)',
      'no-pieces':      '상대 말 전멸',
      'no-moves':       '이동 불가 (상대 말 전멸)',
      'chips-depleted': '칩 소진',
      'out-of-chips':   '칩 소진',
      resign:           '기권',
      timeout:          '시간 초과',
      agreement:        '합의 무승부',
      stalemate:        '스테일메이트',
      repetition:       '반복',
      insufficient:     '기물 부족',
      disconnect:       '연결 끊김',
      admin:            '관리자 강제 종료',
      draw:             '무승부'
    };

    const icon     = document.getElementById('gameover-icon');
    const title    = document.getElementById('gameover-title');
    const subtitle = document.getElementById('gameover-subtitle');

    if (winner === 'draw') {
      icon.textContent  = '🤝';
      title.textContent = '무승부';
    } else if (winner === myColor) {
      icon.textContent  = '🏆';
      title.textContent = '승리!';
    } else {
      icon.textContent  = '😞';
      title.textContent = '패배';
    }

    subtitle.textContent = reasonMap[reason] || reason;
    gameoverModal.style.display = 'flex';
  }

  function showBanner(msg, persistent) {
    disconnectBanner.style.display = 'flex';
    disconnectMsg.textContent = msg;
  }

  function hideBanner() {
    disconnectBanner.style.display = 'none';
  }

  function showToastMsg(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#333;color:#fff;padding:10px 20px;border-radius:20px;
      font-size:14px;z-index:9999;white-space:nowrap;pointer-events:none;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) document.body.removeChild(toast); }, 3000);
  }

  // 게스트 참가 후 host 측 initGame (game:start 이벤트)
  function initGame(state) {
    gameStatus = 'active';

    if (GameHandlers[gameType]) {
      const handleAction = gameType === 'indianpoker' ? handleIPAction : handleMyMove;
      const init = GameHandlers[gameType].initGame(state, myColor, handleAction, myRole);
      ActiveBoard = init.board;
      if (init.chess !== undefined) chess = init.chess;
    }

    const activeTurn = state.currentTurn || (state.timers && state.timers.activeColor);
    updateTurnIndicator(activeTurn);
    Timer.update(state.timers, myColor, isUnlimited);
    Timer.startLoop();
    connectingOverlay.style.display = 'none';
  }

  // ========== Indian Poker events ==========
  function handleIPAction({ action, amount }) {
    if (!socket.connected) return;
    socket.emit('indianpoker:action', { action, amount });
  }

  socket.on('indianpoker:dealt', (data) => {
    if (ActiveBoard && ActiveBoard.showDeal) ActiveBoard.showDeal(data);
    updateTurnIndicator(null);
  });

  socket.on('indianpoker:bet:turn', (data) => {
    if (ActiveBoard && ActiveBoard.showBetTurn) {
      const isMyTurn = data.betTurn === myRole;
      ActiveBoard.showBetTurn({ ...data, isMyTurn });
    }
    // 인디언 포커는 turn indicator 대신 UI로 표시
  });

  socket.on('indianpoker:showdown', (data) => {
    if (ActiveBoard && ActiveBoard.showShowdown) ActiveBoard.showShowdown(data);
  });

  // =========================================================
  // ========== 솔로 모드 (vs AI) — game-connect4.js에 위임 ==========
  // =========================================================
  if (isSoloMode) {
    // 무르기 버튼: 무르기 지원 게임에서만 표시 (connect4·indianpoker 제외)
    // 솔로 모드는 상대방 승인 불필요 — 쿨다운 없이 즉시 작동
    const UNDO_SUPPORTED = ['chess', 'omok', 'othello', 'checkers'];
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
      undoBtn.style.display = UNDO_SUPPORTED.includes(gameType) ? '' : 'none';
      undoBtn.addEventListener('click', () => {
        if (window._soloUndoCallback) window._soloUndoCallback();
      });
    }

    // 수기록 패널 표시 (인디언 포커 제외)
    const movesPanel = document.getElementById('moves-panel');
    if (movesPanel) movesPanel.style.display = gameType === 'indianpoker' ? 'none' : '';

    const handler = GameHandlers[gameType];
    if (handler && typeof handler.startSolo === 'function') {
      handler.startSolo(soloColor, {
        switchBoardArea,
        updateTurnIndicator,
        showGameOver,
        setActiveBoard:  (b) => { ActiveBoard = b; },
        setGameStatus:   (s) => { gameStatus  = s; },
        connectingOverlay,
        spectatorJoinOverlay,
        myLabel, oppLabel, myDot, oppDot,
        appendMoveToList,
        showToastMsg,
        setupUndo: (fn) => { window._soloUndoCallback = fn; },
      }, soloOptions);
    }
  }

  // 멀티플레이어 무르기 소켓 이벤트 (향후 서버 구현 대응)
  const undoModal = document.getElementById('undo-modal');
  if (undoModal) {
    document.getElementById('undo-accept-btn').addEventListener('click', () => {
      undoModal.style.display = 'none';
      socket.emit('game:undo:respond', { accept: true });
    });
    document.getElementById('undo-decline-btn').addEventListener('click', () => {
      undoModal.style.display = 'none';
      socket.emit('game:undo:respond', { accept: false });
    });
  }
  socket.on('game:undo:requested', () => {
    // 자동 거절 설정 확인
    const autoDeclineUndo = document.getElementById('auto-decline-undo');
    if (autoDeclineUndo && autoDeclineUndo.checked) {
      socket.emit('game:undo:respond', { accept: false });
      showToastMsg('무르기 요청을 자동으로 거절했습니다.');
      return;
    }
    if (undoModal) undoModal.style.display = 'flex';
  });
  socket.on('game:undo:declined', () => {
    showToastMsg('상대방이 무르기를 거절했습니다.');
  });
  socket.on('game:undo:applied', (state) => {
    showToastMsg('무르기가 적용되었습니다.');
    // 서버에서 새 상태 받으면 보드 재초기화
    if (state && GameHandlers[gameType]) {
      const handleAction = gameType === 'indianpoker' ? handleIPAction : handleMyMove;
      const init = GameHandlers[gameType].initBoard(state, myColor, handleAction, myRole);
      ActiveBoard = init.board;
      if (ActiveBoard) ActiveBoard.setMyTurn(state.currentTurn === myColor);
    }
  });

  // 멀티플레이어 무르기 버튼 (비솔로)
  if (!isSoloMode) {
    let undoReqTime = 0;
    let undoRequested = false;
    const undoBtnMulti = document.getElementById('undo-btn');
    if (undoBtnMulti) {
      undoBtnMulti.addEventListener('click', () => {
        if (gameStatus !== 'active' || myRole === 'spectator') return;
        const now = Date.now();
        if (now - undoReqTime < 30000) {
          showToastMsg('무르기는 30초에 한 번만 요청할 수 있습니다.');
          return;
        }
        if (undoRequested) return;
        undoReqTime = now;
        undoRequested = true;
        socket.emit('game:undo:request');
        showToastMsg('무르기를 요청했습니다. 상대방 수락을 기다립니다.');
        undoBtnMulti.textContent = '무르기 대기 중...';
        undoBtnMulti.disabled = true;
        setTimeout(() => {
          undoRequested = false;
          undoBtnMulti.textContent = '↩ 무르기';
          undoBtnMulti.disabled = false;
        }, 30000);
      });
    }
  }
  // =========================================================
})();
