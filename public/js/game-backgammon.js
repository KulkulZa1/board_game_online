// game-backgammon.js — 백가몬 프론트엔드 핸들러
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.backgammon = (function () {

  // ── 공통 초기화 헬퍼 ──────────────────────────────────────────────
  function _init(st, myColor, handleAction, spectatorMode) {
    BackgammonBoard.init({
      board:       st.board,
      myColor:     myColor,
      onAction:    handleAction,
      spectatorMode,
      phase:       st.phase       || 'rolling',
      turn:        st.turn        || st.currentTurn,
      dice:        st.dice        || [0, 0],
      remaining:   st.remainingMoves || [],
    });
    return { board: BackgammonBoard };
  }

  function initBoard(st, myColor, handleAction) {
    return _init(st, myColor, handleAction, false);
  }

  function initSpectatorBoard(st, hostColor, handleAction) {
    return _init(st, hostColor, handleAction, true);
  }

  function initGame(st, myColor, handleAction) {
    return initBoard(st, myColor, handleAction);
  }

  // ── 이동 후 업데이트 ─────────────────────────────────────────────
  function onMoveMade(data) {
    const { move, board, dice, remainingMoves, phase, turn, validMoves } = data;

    BackgammonBoard.update({
      board,
      dice:       dice       || [0, 0],
      remaining:  remainingMoves || [],
      phase:      phase      || 'rolling',
      turn:       turn,
      validMoves: validMoves || [],
    });

    if (move && move.type === 'roll' && !move.noMoves) {
      if (window.Sound) Sound.play('move');
    }
    if (move && move.type === 'move') {
      if (window.Sound) Sound.play(move.hitPiece ? 'capture' : 'move');
    }
    if (move && move.noMoves) {
      if (window.Sound) Sound.play('invalid');
    }
  }

  function getMyTurn(st, myColor) {
    return st.currentTurn === myColor && st.phase !== undefined;
  }

  // ── 솔로 (vs AI) 모드 ────────────────────────────────────────────
  function startSolo(playerColor, helpers, options) {
    const { showGameOver, updateTurnIndicator } = helpers;
    const aiColor   = playerColor === 'white' ? 'black' : 'white';
    const SOLO_TIME = (options && options.timerSeconds) || 180; // 3분

    // 로컬 게임 상태
    let board = _initBGBoard();
    let currentTurn    = 'white'; // 항상 백이 선공
    let phase          = 'rolling';
    let dice           = [0, 0];
    let remainingMoves = [];
    let ended          = false;
    let timeLeft       = SOLO_TIME;
    let timerInterval  = null;

    function cleanup() {
      ended = true;
      if (timerInterval) clearInterval(timerInterval);
    }

    // 타이머
    timerInterval = setInterval(() => {
      if (ended) return;
      timeLeft--;
      if (window.Timer) Timer.setTime(playerColor, timeLeft);
      if (timeLeft <= 0) {
        cleanup();
        showGameOver({ winner: null, reason: '시간 초과 — 무승부', isDraw: true });
      }
    }, 1000);

    // 핸들러: 플레이어의 주사위/이동 이벤트 처리
    function handleAction(data) {
      if (ended || currentTurn !== playerColor) return;

      if (data.type === 'roll') {
        if (phase !== 'rolling') return;
        const [d1, d2] = _roll();
        dice           = [d1, d2];
        remainingMoves = (d1 === d2) ? [d1,d1,d1,d1] : [d1,d2];
        phase          = 'moving';

        const valids = AIBackgammon._getValidMoves ? [] : _getValidMovesClient(board, playerColor, remainingMoves);
        BackgammonBoard.update({ board, dice, remaining: remainingMoves, phase, turn: playerColor, validMoves: _getValidMovesClient(board, playerColor, remainingMoves) });
        if (window.Sound) Sound.play('move');

        // 유효 수 없으면 자동 패스
        if (_getValidMovesClient(board, playerColor, remainingMoves).length === 0) {
          setTimeout(() => { if (!ended) _endPlayerTurn(); }, 800);
        }
        return;
      }

      if (data.type === 'move' && phase === 'moving') {
        const { from, to, dieUsed } = data;
        const dieIdx = remainingMoves.indexOf(dieUsed);
        if (dieIdx === -1) return;

        board = _applyMove(board, playerColor, from, to);
        remainingMoves.splice(dieIdx, 1);

        if (window.Sound) Sound.play('move');

        // 승리 확인
        if (board.borneOff[playerColor] >= 15) {
          cleanup();
          BackgammonBoard.update({ board, dice, remaining: [], phase: 'rolling', turn: playerColor, validMoves: [] });
          if (window.Stats) Stats.record('backgammon', 'win');
          showGameOver({ winner: playerColor, reason: '모든 말 탈출!' });
          return;
        }

        const moreValids = remainingMoves.length > 0 ? _getValidMovesClient(board, playerColor, remainingMoves) : [];
        if (remainingMoves.length === 0 || moreValids.length === 0) {
          remainingMoves = [];
          BackgammonBoard.update({ board, dice, remaining: [], phase: 'rolling', turn: playerColor, validMoves: [] });
          setTimeout(() => { if (!ended) _endPlayerTurn(); }, 500);
        } else {
          BackgammonBoard.update({ board, dice, remaining: remainingMoves, phase: 'moving', turn: playerColor, validMoves: moreValids });
        }
      }
    }

    function _endPlayerTurn() {
      currentTurn = aiColor;
      phase       = 'rolling';
      updateTurnIndicator && updateTurnIndicator(aiColor);
      BackgammonBoard.update({ board, dice: [0,0], remaining: [], phase: 'rolling', turn: aiColor, validMoves: [] });
      setTimeout(_doAITurn, 700);
    }

    function _doAITurn() {
      if (ended) return;
      // AI 주사위 굴리기
      const [d1, d2] = _roll();
      const aiRemaining = (d1 === d2) ? [d1,d1,d1,d1] : [d1,d2];
      dice = [d1, d2];
      BackgammonBoard.update({ board, dice, remaining: aiRemaining, phase: 'moving', turn: aiColor, validMoves: [] });
      if (window.Sound) Sound.play('move');

      // AI가 모든 주사위 소진할 때까지 순차 이동
      _doAIMoves(aiRemaining, 0);
    }

    function _doAIMoves(aiRemaining, delay) {
      if (ended) return;
      setTimeout(() => {
        if (ended) return;
        const move = AIBackgammon.getBestMove(board, aiColor, aiRemaining);
        if (!move) {
          _endAITurn(aiRemaining);
          return;
        }
        board = AIBackgammon.applyMove(board, aiColor, move);
        if (window.Sound) Sound.play(move.to === 'off' ? 'move' : 'move');

        const dieIdx = aiRemaining.indexOf(move.dieUsed);
        if (dieIdx !== -1) aiRemaining.splice(dieIdx, 1);

        // AI 승리 확인
        if (board.borneOff[aiColor] >= 15) {
          cleanup();
          BackgammonBoard.update({ board, dice, remaining: [], phase: 'rolling', turn: aiColor, validMoves: [] });
          if (window.Stats) Stats.record('backgammon', 'loss');
          showGameOver({ winner: aiColor, reason: 'AI가 모든 말을 탈출시켰습니다' });
          return;
        }

        const moreValids = aiRemaining.length > 0 ? _getValidMovesClient(board, aiColor, aiRemaining) : [];
        BackgammonBoard.update({ board, dice, remaining: aiRemaining, phase: 'moving', turn: aiColor, validMoves: [] });

        if (aiRemaining.length === 0 || moreValids.length === 0) {
          _endAITurn([]);
        } else {
          _doAIMoves(aiRemaining, 600);
        }
      }, delay || 600);
    }

    function _endAITurn(remaining) {
      currentTurn = playerColor;
      phase       = 'rolling';
      remainingMoves = [];
      updateTurnIndicator && updateTurnIndicator(playerColor);
      BackgammonBoard.update({ board, dice: [0,0], remaining: [], phase: 'rolling', turn: playerColor, validMoves: [] });
    }

    // 보드 초기화 및 렌더링
    BackgammonBoard.init({
      board:       board,
      myColor:     playerColor,
      onAction:    handleAction,
      spectatorMode: false,
      phase:       'rolling',
      turn:        'white',
      dice:        [0, 0],
      remaining:   [],
    });
  }

  // ── 로컬 게임 헬퍼 ──────────────────────────────────────────────
  function _roll() {
    return [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
  }

  function _initBGBoard() {
    const pts = new Array(25).fill(null).map(() => ({ color: null, count: 0 }));
    pts[1]  = { color: 'black', count: 2 };
    pts[6]  = { color: 'white', count: 5 };
    pts[8]  = { color: 'white', count: 3 };
    pts[12] = { color: 'black', count: 5 };
    pts[13] = { color: 'white', count: 5 };
    pts[17] = { color: 'black', count: 3 };
    pts[19] = { color: 'black', count: 5 };
    pts[24] = { color: 'white', count: 2 };
    return { points: pts, bar: { white: 0, black: 0 }, borneOff: { white: 0, black: 0 } };
  }

  function _applyMove(board, color, from, to) {
    return AIBackgammon.applyMove(board, color, { from, to });
  }

  function _getValidMovesClient(bg, color, remainingMoves) {
    if (!remainingMoves || remainingMoves.length === 0) return [];
    const unique   = [...new Set(remainingMoves)];
    const oppColor = color === 'white' ? 'black' : 'white';
    const dir      = color === 'white' ? -1 : 1;
    const moves    = [];

    if (bg.bar[color] > 0) {
      for (const die of unique) {
        const entry = color === 'white' ? (25 - die) : die;
        if (entry < 1 || entry > 24) continue;
        if (bg.points[entry].color === oppColor && bg.points[entry].count >= 2) continue;
        moves.push({ from: 'bar', to: entry, dieUsed: die });
      }
      return moves;
    }

    const allHome = _allHomeClient(bg, color);
    for (let p = 1; p <= 24; p++) {
      if (bg.points[p].color !== color || bg.points[p].count === 0) continue;
      for (const die of unique) {
        const dest = p + dir * die;
        if (color === 'white' && dest <= 0) {
          if (allHome && _canBOClient(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
        } else if (color === 'black' && dest >= 25) {
          if (allHome && _canBOClient(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
        } else if (dest >= 1 && dest <= 24) {
          if (!(bg.points[dest].color === oppColor && bg.points[dest].count >= 2))
            moves.push({ from: p, to: dest, dieUsed: die });
        }
      }
    }
    const seen = new Set();
    return moves.filter(m => { const k=`${m.from}|${m.to}|${m.dieUsed}`; if(seen.has(k))return false; seen.add(k);return true; });
  }

  function _allHomeClient(bg, color) {
    if (bg.bar[color] > 0) return false;
    const [lo, hi] = color === 'white' ? [1, 6] : [19, 24];
    for (let p = 1; p <= 24; p++) {
      if (p >= lo && p <= hi) continue;
      if (bg.points[p].color === color && bg.points[p].count > 0) return false;
    }
    return true;
  }

  function _canBOClient(bg, color, fromP, die) {
    const dest = fromP + (color === 'white' ? -1 : 1) * die;
    if (color === 'white') {
      if (dest >= 1) return false;
      if (dest === 0) return true;
      for (let p = fromP + 1; p <= 6; p++) {
        if (bg.points[p].color === 'white' && bg.points[p].count > 0) return false;
      }
      return true;
    } else {
      if (dest <= 24) return false;
      if (dest === 25) return true;
      for (let p = 19; p < fromP; p++) {
        if (bg.points[p].color === 'black' && bg.points[p].count > 0) return false;
      }
      return true;
    }
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
