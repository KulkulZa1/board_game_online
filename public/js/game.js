// game.js — Main game controller (체스 + 오목 통합)

// ========== 게임 규칙 데이터 (로비와 동일) ==========
const GAME_RULES = {
  chess: {
    title: '♟ 체스 규칙',
    sections: [
      { head: '목표', text: '상대방 킹을 체크메이트(포위)하면 승리합니다.' },
      { head: '이동', text: '이동할 기물을 클릭하면 이동 가능한 칸이 표시됩니다. 목적지를 클릭해 이동하세요.' },
      { head: '특수 규칙', text: '• 캐슬링: 킹과 룩이 동시에 이동하는 특수 수\n• 앙파상: 폰 특수 포획\n• 승급: 폰이 끝줄 도달 시 퀸·룩·비숍·나이트 중 선택' },
      { head: '무승부 제안', text: '상대방에게 무승부를 제안할 수 있습니다. (5초 딜레이, 3회 초과 시 60초 비활성)' },
      { head: '타이머', text: '시간 초과 시 상대방 승리. 게임 종료 후 복기 모드(← →)로 수 복습 가능.' },
    ]
  },
  omok: {
    title: '⬤ 오목 규칙 (렌주)',
    sections: [
      { head: '목표', text: '가로·세로·대각선으로 정확히 5개의 돌을 연속으로 놓으면 승리합니다.' },
      { head: '장목 금지', text: '6개 이상 연속은 승리로 인정되지 않습니다 (렌주 룰).' },
      { head: '선공', text: '흑(어두운 색)이 먼저 둡니다.' },
      { head: '이동', text: '빈 교차점을 클릭해 돌을 놓습니다.' },
    ]
  },
  connect4: {
    title: '🔴 사목 규칙',
    sections: [
      { head: '목표', text: '가로·세로·대각선으로 4개의 돌을 연속으로 놓으면 승리합니다.' },
      { head: '이동', text: '상단 화살표 버튼이나 열을 클릭하면 돌이 중력에 의해 아래로 떨어집니다.' },
      { head: '색상', text: '호스트: 빨강(선공) / 게스트: 노랑(후공)' },
    ]
  },
  othello: {
    title: '⬜ 오셀로 (리버시) 규칙',
    sections: [
      { head: '목표', text: '게임 종료 시 자신의 색 돌이 더 많으면 승리합니다.' },
      { head: '이동', text: '상대 돌을 사이에 끼울 수 있는 칸(점으로 표시)에만 놓을 수 있습니다. 끼인 상대 돌은 모두 내 색으로 뒤집힙니다.' },
      { head: '패스', text: '유효한 수가 없으면 자동으로 패스됩니다. 양쪽 모두 유효 수가 없으면 게임 종료.' },
      { head: '선공', text: '흑이 먼저 둡니다.' },
    ]
  },
  indianpoker: {
    title: '🃏 인디언 포커 규칙',
    sections: [
      { head: '기본', text: '자신의 카드는 이마에 대고 보지 않습니다. 화면에 "?"로 표시됩니다. 상대방의 카드는 볼 수 있습니다.' },
      { head: '배팅', text: '게스트가 먼저 배팅 → 호스트 → 쇼다운 순서로 진행됩니다.' },
      { head: '액션', text: '• 콜: 상대 배팅에 맞춤\n• 레이즈: 5칩 추가 (최대 3회)\n• 폴드: 포기, 상대방 승리' },
      { head: '승패', text: '쇼다운 시 높은 숫자가 이깁니다 (A < 2 < … < K). 동점이면 호스트 승리.' },
      { head: '쿨다운', text: '각 액션은 1.5초에 1번만 가능합니다.' },
    ]
  },
  checkers: {
    title: '🔴 체커 규칙',
    sections: [
      { head: '목표', text: '상대방 말을 전멸시키거나 이동 불가 상태로 만들면 승리합니다.' },
      { head: '이동', text: '어두운 칸에서만 이동합니다. 기물을 클릭하면 이동 가능한 칸이 표시됩니다.' },
      { head: '점프', text: '상대 말을 대각선으로 뛰어넘어 잡을 수 있습니다. 점프 가능하면 반드시 해야 합니다 (강제 점프). 연속 점프 가능하면 계속 이어갑니다.' },
      { head: '킹 승격', text: '상대 진영 끝줄에 도달하면 킹(♛)으로 승격됩니다. 킹은 앞뒤 모두 이동 가능합니다.' },
      { head: '색상', text: '호스트: 빨강(선공) / 게스트: 검정(후공)' },
    ]
  },
};

(function () {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');

  if (!roomId) {
    location.href = '/';
    return;
  }

  // ========== State ==========
  let gameType     = null;        // 'chess' | 'omok' | 'connect4' | 'othello' | 'indianpoker' | 'checkers'
  let ActiveBoard  = null;        // Board, OmokBoard, Connect4Board, OthelloBoard, IndianPoker, CheckersBoard
  let myColor      = null;
  let myRole       = null;        // 'host' | 'guest' | 'spectator'
  let gameStatus   = 'connecting';
  let isUnlimited  = false;
  let chess        = null;        // chess.js 인스턴스 (체스 전용)
  let drawOfferPending = false;
  let pendingSpectatorSocketId = null;

  // ========== 버튼 중복/도배 방지 ==========
  let drawOfferCount    = 0;     // 게임당 무승부 제안 누적 횟수
  let drawLastOfferTime = 0;     // 마지막 무승부 제안 시각 (ms)
  let drawBtnDisabled   = false; // 임시 비활성 여부 (횟수 초과 시)
  let resignLastClick   = 0;     // 마지막 기권 버튼 클릭 시각
  let resignEmitted     = false; // 기권 이중 전송 방지 플래그

  // ========== Socket ==========
  const socket = io({ reconnectionAttempts: 20 });

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

  // ========== Board area switcher ==========
  function switchBoardArea(type) {
    ['chess','omok','connect4','othello','indianpoker','checkers'].forEach(t => {
      const el = document.getElementById(`${t}-board-area`);
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

    const titleMap = { chess:'체스 대국', omok:'오목 대국', connect4:'사목 대국', othello:'오셀로 대국', indianpoker:'인디언 포커', checkers:'체커 대국' };
    document.title = titleMap[gameType] || '대국';
    switchBoardArea(gameType);
    setupPlayerBars();
    Chat.init({ role: myRole, socket });
    Chat.loadHistory(state.chat || []);

    if (gameType === 'chess') {
      chess = new Chess();
      if (state.fen) chess.load(state.fen);
      Board.init({ chess, orientation: myColor, myColor, onMove: handleMyMove });
      ActiveBoard = Board;
    } else if (gameType === 'omok') {
      OmokBoard.init({ board: state.board || _emptyOmokBoard(), myColor, onMove: handleMyMove });
      ActiveBoard = OmokBoard;
    } else if (gameType === 'connect4') {
      Connect4Board.init({ board: state.board, myColor, onMove: handleMyMove, colHeights: state.colHeights });
      ActiveBoard = Connect4Board;
    } else if (gameType === 'othello') {
      const validMoves = computeOthelloValidMoves(state.board, myColor);
      OthelloBoard.init({ board: state.board, myColor, onMove: handleMyMove, validMoves });
      ActiveBoard = OthelloBoard;
    } else if (gameType === 'indianpoker') {
      IndianPoker.init({ myRole, onAction: handleIPAction });
      ActiveBoard = IndianPoker;
    } else if (gameType === 'checkers') {
      const validMoves = state.validMoves || getAllCheckersValidMovesClient(state.board, myColor);
      CheckersBoard.init({ board: state.board, myColor, onMove: handleMyMove, validMoves, mustJump: state.mustJump });
      ActiveBoard = CheckersBoard;
    }

    // 플레이어 전용 컨트롤 표시
    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = gameType === 'chess' ? '' : 'none';
    // 수 기록/복기 패널 — 체스는 SAN 복기 지원
    document.getElementById('moves-panel').style.display = gameType === 'indianpoker' ? 'none' : '';

    if (state.status === 'active') {
      gameStatus = 'active';
      if (gameType === 'chess') {
        ActiveBoard.setMyTurn(chess.turn() === myColor[0]);
      } else if (gameType === 'indianpoker') {
        // 인디언 포커는 indianpoker:dealt 이벤트로 배팅 차례 제어
      } else {
        ActiveBoard.setMyTurn(state.currentTurn === myColor);
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
    if (gameType === 'chess') {
      chess.load(fen);
      Board.updateAfterMove(fen, move);
      if (typeof Sound !== 'undefined' && !chess.in_check()) {
        Sound.play(move.captured ? 'capture' : 'move');
      }
    } else if (gameType === 'omok') {
      OmokBoard.updateAfterMove(board, move);
      if (typeof Sound !== 'undefined') Sound.play('move');
    } else if (gameType === 'connect4') {
      Connect4Board.updateAfterMove(board, move, colHeights);
      if (typeof Sound !== 'undefined') Sound.play('move');
    } else if (gameType === 'othello') {
      OthelloBoard.updateAfterMove(board, move, validMoves);
      if (typeof Sound !== 'undefined') Sound.play('move');
      if (pass) showToastMsg('상대방이 패스했습니다. 계속 두세요.');
    } else if (gameType === 'checkers') {
      CheckersBoard.updateAfterMove(board, move, validMoves, mustJump);
      if (typeof Sound !== 'undefined') Sound.play(move.captured ? 'capture' : 'move');
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
      const data = GAME_RULES[gameType] || GAME_RULES['chess'];
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

    const specTitleMap = { chess:'체스 관전', omok:'오목 관전', connect4:'사목 관전', othello:'오셀로 관전', indianpoker:'인디언 포커 관전', checkers:'체커 관전' };
    document.title = specTitleMap[gameType] || '관전';
    switchBoardArea(gameType);

    const spectatorOrientation = state.hostColor || 'white';

    Chat.init({ role: 'spectator', socket });
    Chat.loadHistory(state.chat || []);

    if (gameType === 'chess') {
      chess = new Chess();
      if (state.fen) chess.load(state.fen);
      Board.init({
        chess,
        orientation:   spectatorOrientation,
        myColor:       spectatorOrientation,
        onMove:        handleSpectatorHintMove,
        spectatorMode: true,
      });
      Board.setMyTurn(false);
      ActiveBoard = Board;
    } else if (gameType === 'omok') {
      OmokBoard.init({
        board:         state.board || _emptyOmokBoard(),
        myColor:       'black',
        onMove:        handleSpectatorHintMove,
        spectatorMode: true,
      });
      OmokBoard.setMyTurn(false);
      ActiveBoard = OmokBoard;
    } else if (gameType === 'connect4') {
      Connect4Board.init({
        board:         state.board,
        myColor:       'white',
        onMove:        handleSpectatorHintMove,
        spectatorMode: true,
        colHeights:    state.colHeights,
      });
      Connect4Board.setMyTurn(false);
      ActiveBoard = Connect4Board;
    } else if (gameType === 'othello') {
      OthelloBoard.init({
        board:         state.board,
        myColor:       'black',
        onMove:        handleSpectatorHintMove,
        spectatorMode: true,
      });
      OthelloBoard.setMyTurn(false);
      ActiveBoard = OthelloBoard;
    } else if (gameType === 'indianpoker') {
      IndianPoker.init({ myRole: 'spectator', onAction: () => {} });
      // 관전자에게 두 카드 모두 공개
      if (state.hands && state.hands.host && state.hands.guest) {
        // 관전자 모드: showDeal 사용하여 양쪽 카드 표시
        IndianPoker.showDeal({ opponentCard: state.hands.guest, pot: state.pot || 0, chips: state.chips || {}, ante: 5, roundNum: 1 });
      }
      ActiveBoard = IndianPoker;
    } else if (gameType === 'checkers') {
      CheckersBoard.init({
        board:         state.board,
        myColor:       'white',
        onMove:        handleSpectatorHintMove,
        spectatorMode: true,
        validMoves:    [],
        mustJump:      state.mustJump,
      });
      CheckersBoard.setMyTurn(false);
      ActiveBoard = CheckersBoard;
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
  function _emptyOmokBoard() {
    return Array(15).fill(null).map(() => Array(15).fill(null));
  }

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
    if (gameType === 'chess' || move.san) {
      appendChessMoveToList(move);
    } else {
      appendOmokMoveToList(move);
    }
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
    const rowLabel   = 15 - move.row;
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
      'chips-depleted': '칩 소진',
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

    if (gameType === 'chess') {
      chess = new Chess();
      Board.init({ chess, orientation: myColor, myColor, onMove: handleMyMove });
      Board.setMyTurn(myColor === 'white');
      ActiveBoard = Board;
    } else if (gameType === 'omok') {
      OmokBoard.init({ board: _emptyOmokBoard(), myColor, onMove: handleMyMove });
      OmokBoard.setMyTurn(myColor === 'black');
      ActiveBoard = OmokBoard;
    } else if (gameType === 'connect4') {
      Connect4Board.init({ board: state.board, myColor, onMove: handleMyMove, colHeights: state.colHeights });
      Connect4Board.setMyTurn(myColor === 'white'); // host(white)=red 선공
      ActiveBoard = Connect4Board;
    } else if (gameType === 'othello') {
      const validMoves = computeOthelloValidMoves(state.board, myColor);
      OthelloBoard.init({ board: state.board, myColor, onMove: handleMyMove, validMoves });
      OthelloBoard.setMyTurn(myColor === 'black');
      ActiveBoard = OthelloBoard;
    } else if (gameType === 'indianpoker') {
      IndianPoker.init({ myRole, onAction: handleIPAction });
      ActiveBoard = IndianPoker;
      // 첫 라운드 딜은 서버에서 indianpoker:dealt 이벤트로 수신
    } else if (gameType === 'checkers') {
      CheckersBoard.init({ board: state.board, myColor, onMove: handleMyMove, validMoves: state.validMoves || [], mustJump: state.mustJump });
      CheckersBoard.setMyTurn(myColor === (state.currentTurn || 'white'));
      ActiveBoard = CheckersBoard;
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

  // ========== Client-side helpers for board games ==========
  function computeOthelloValidMoves(board, color) {
    if (!board) return [];
    const opp = color === 'white' ? 'black' : 'white';
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

  function getAllCheckersValidMovesClient(board, color) {
    if (!board) return [];
    // 간단 버전: 서버에서 validMoves 받아오면 그걸 씀
    return [];
  }
})();
