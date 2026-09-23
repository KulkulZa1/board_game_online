// server/events.js — Socket.io 이벤트 핸들러
const { v4: uuidv4 } = require('uuid');
const state = require('./state');
const {
  log, rateCheck, cleanRateLimit, sanitizeNickname,
  getRoleColor, getOpponentRole,
  getRoomBySocketId, getSpectatorBySocketId
} = require('./utils');
const { createRoomState, resetForRematch } = require('./rooms');
const { endGame, startGame, approveSpectator } = require('./endgame');
const handlers = require('./handlers');
const { handleIndianPokerAction } = require('./handlers/indianpoker');
const { getValidCheckersMovesForPiece, getAllCheckersValidMoves } = require('./handlers/checkers');
const { Chess } = require('chess.js');
const mahjong = require('./mahjong');
const bang = require('./bang');

function payloadObject(value) {
  return value && typeof value === 'object' ? value : {};
}

// 소켓 리스너 하나가 던진 예외가 프로세스 전체를 죽이면 안 된다.
// socket.io 는 리스너 예외를 잡지 않고, 여기엔 uncaughtException 처리기도 없다 —
// 실제로 관전자 훈수 좌표 하나(오목 {row:0.5})와 뱅 리액션 pick 하나(0.5)가 서버를
// 통째로 내렸다. 그러면 진행 중인 모든 방(마작·뱅 포함)이 메모리째 사라진다.
// 근본 원인은 각 핸들러에서 고친다. 이 가드는 '아직 모르는 다음 버그'를 위한 안전망이다.
function guardSocketHandlers(socket) {
  const on = socket.on.bind(socket);
  socket.on = (event, listener) => on(event, function guarded(...args) {
    try {
      const result = listener.apply(this, args);
      if (result && typeof result.then === 'function') {
        result.catch((err) => reportHandlerError(socket, event, err));
      }
      return result;
    } catch (err) {
      reportHandlerError(socket, event, err);
      return undefined;
    }
  });
}

function reportHandlerError(socket, event, err) {
  const where = err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : String(err);
  log(`[!] 소켓 핸들러 예외 — ${event} (socket ${String(socket.id).slice(0, 8)}): ${where}`);
}

// 좌표가 정수이고 판 안인지 — 훈수처럼 보드를 직접 인덱싱하는 곳은 반드시 이걸 거친다.
// typeof === 'number' 만 보면 0.5 가 통과해 board[0.5] 가 undefined 가 된다.
function isCell(row, col, rows, cols) {
  return Number.isInteger(row) && Number.isInteger(col) &&
    row >= 0 && row < rows && col >= 0 && col < cols;
}

// 이 소켓이 호스트인 '대기 중' 방을 지운다. 한 소켓이 대기방을 여러 개 쥐고 있으면
// (방 만들기 → 뒤로 → 또 만들기) 연결이 살아 있는 한 30분 동안 정리되지 않아
// 서버 방 상한(20)을 채운다 — 일반 사용자도, 소켓 하나로 막으려는 사람도.
function releaseWaitingRoomsHostedBy(socket) {
  for (const [roomId, room] of state.rooms) {
    if (room.status !== 'waiting' || room.players.host.socketId !== socket.id) continue;
    clearTimeout(room.cleanupTimer);
    if (room.hostToken) state.tokenMap.delete(room.hostToken);
    state.rooms.delete(roomId);
    socket.leave(roomId);
    log(`대기 중 방 교체 — ${roomId.slice(0, 8)} (같은 소켓이 새 방을 요청)`);
  }
}

// 관전 중인 모든 방에서 이 소켓을 뺀다 (한 소켓 = 관전 방 하나).
function removeSpectatorEverywhere(io, socket, exceptRoomId) {
  for (const room of state.rooms.values()) {
    if (room.id === exceptRoomId) continue;
    const spec = room.spectators.get(socket.id);
    if (!spec) continue;
    room.spectators.delete(socket.id);
    socket.leave(room.id);
    if (spec.approved) {
      const remaining = [...room.spectators.values()].filter(s => s.approved).length;
      io.to(room.id).emit('spectator:left', { nickname: spec.nickname, count: remaining });
    }
  }
}

function registerEvents(io) {
  io.on('connection', (socket) => {
    // 모든 리스너 등록(마작·뱅 포함)보다 먼저 감싸야 한다
    guardSocketHandlers(socket);

    // 실제 클라이언트 IP (Cloudflare 경유 시 CF-Connecting-IP 헤더 사용)
    // ⚠ 헤더는 클라이언트가 위조할 수 있다 — 로그 표시용으로만 쓰고 보안 판단에 쓰지 않는다.
    const clientIp = socket.handshake.headers['cf-connecting-ip']
      || socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || socket.handshake.address;
    socket._clientIp = clientIp;
    log(`소켓 연결 — id=${socket.id.slice(0,8)} ip=${clientIp}`);

    // 4인 리치 마작 — 자립형 모듈 (전용 이벤트 mahjong:*, 기존 방 시스템과 분리)
    mahjong.register(io, socket);
    // BANG! (4~7인) — 자립형 모듈 (전용 이벤트 bang:*)
    bang.register(io, socket);

    // --- Room: Create ---
    socket.on('room:create', (payload) => {
      let { hostColor, timeControl, gameType, boardSize, indianPokerOpts } = payloadObject(payload);
      // Rate limit: 1분 내 5회
      if (!rateCheck(socket.id, 'create', 5, 60 * 1000)) {
        socket.emit('room:error', { code: 'RATE_LIMIT', message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
        return;
      }

      // 입력 검증
      if (!handlers.has(gameType)) {
        socket.emit('room:error', { code: 'INVALID_GAME_TYPE', message: '잘못된 게임 타입입니다.' });
        return;
      }
      if (gameType === 'connect4' || gameType === 'indianpoker' ||
          gameType === 'applegame' || gameType === 'battleship' || gameType === 'texasholdem') {
        hostColor = 'white'; // host=white, guest=black
      } else if (!['white', 'black'].includes(hostColor)) {
        return;
      }
      if (!timeControl || typeof timeControl !== 'object') return;
      if (timeControl.minutes !== null && timeControl.minutes !== undefined) {
        const mins = Number(timeControl.minutes);
        if (!Number.isFinite(mins) || mins < 1 || mins > 120) return;
        timeControl.minutes = mins;
      } else {
        timeControl.minutes = null;
      }

      // 보드 크기 검증
      let validatedBoardSize = null;
      if (gameType === 'omok') {
        const sz = boardSize && Number(boardSize.size);
        validatedBoardSize = { size: [13, 15, 17, 19].includes(sz) ? sz : 15 };
      } else if (gameType === 'connect4') {
        const rows = boardSize && Number(boardSize.rows);
        const cols = boardSize && Number(boardSize.cols);
        validatedBoardSize = {
          rows: (Number.isInteger(rows) && rows >= 4 && rows <= 9)  ? rows : 6,
          cols: (Number.isInteger(cols) && cols >= 4 && cols <= 10) ? cols : 7,
        };
      }

      // 같은 소켓이 쥔 대기방은 새 방으로 교체한다 (상한을 조용히 갉아먹지 않게)
      releaseWaitingRoomsHostedBy(socket);
      // 이미 다른 방의 플레이어면 새 방을 만들 수 없다 — getRoomBySocketId 는 첫 방만
      // 돌려주므로, 한 소켓이 두 방에 걸치면 수(game:move)가 엉뚱한 방으로 간다.
      if (getRoomBySocketId(socket.id)) {
        socket.emit('room:error', { code: 'ALREADY_IN_ROOM', message: '이미 참여 중인 게임이 있습니다.' });
        return;
      }

      // 방 개수 제한 (개인 PC 보호)
      if (state.rooms.size >= 20) {
        socket.emit('room:error', { code: 'SERVER_FULL', message: '서버가 가득 찼습니다. 잠시 후 다시 시도하세요.' });
        return;
      }

      const roomId    = uuidv4();
      const hostToken = uuidv4();

      // 인디언 포커 옵션 검증
      let validatedIpOpts = undefined;
      if (gameType === 'indianpoker' && indianPokerOpts && typeof indianPokerOpts === 'object') {
        validatedIpOpts = {
          numDecks:     (Number.isInteger(Number(indianPokerOpts.numDecks)) && Number(indianPokerOpts.numDecks) >= 1 && Number(indianPokerOpts.numDecks) <= 5) ? Number(indianPokerOpts.numDecks) : 2,
          winCondition: indianPokerOpts.winCondition === 1 ? 1 : 2,
        };
      }
      const room = createRoomState(hostColor, timeControl, hostToken, gameType, validatedBoardSize, validatedIpOpts);
      room.id = roomId;
      state.rooms.set(roomId, room);
      state.tokenMap.set(hostToken, { roomId, role: 'host' });

      room.players.host.socketId  = socket.id;
      room.players.host.connected = true;
      room.players.host.ip        = socket._clientIp;
      socket.join(roomId);

      log(`방 생성 — ${roomId.slice(0,8)} (${hostColor}, ${timeControl.minutes ?? '무제한'}분, 방 수: ${state.rooms.size})`);

      // Set cleanup for waiting room (30 min)
      room.cleanupTimer = setTimeout(() => {
        if (room.status === 'waiting') {
          state.tokenMap.delete(room.hostToken);
          state.rooms.delete(roomId);
          log(`대기 중 방 정리 — ${roomId.slice(0,8)}`);
        }
      }, 30 * 60 * 1000);

      socket.emit('room:created', { roomId, playerToken: hostToken, hostColor, gameType });
    });

    // --- Room: Join (guest) ---
    socket.on('room:join', (payload) => {
      const { roomId } = payloadObject(payload);
      // Rate limit: 1분에 10회
      if (!rateCheck(socket.id, 'join', 10, 60 * 1000)) return;
      // 입력 검증
      if (!roomId || typeof roomId !== 'string' || roomId.length > 36) return;

      const room = state.rooms.get(roomId);
      if (!room) {
        socket.emit('room:error', { code: 'NOT_FOUND', message: '방을 찾을 수 없습니다.' });
        return;
      }
      if (room.status !== 'waiting') {
        socket.emit('room:error', { code: 'ROOM_FULL', message: '이미 게임이 진행 중입니다.' });
        return;
      }
      if (room.players.host.socketId === socket.id) {
        socket.emit('room:error', { code: 'SELF_JOIN', message: '자기 방에는 게스트로 들어갈 수 없습니다.' });
        return;
      }
      if (room.guestToken) {
        socket.emit('room:error', { code: 'ROOM_FULL', message: '방이 가득 찼습니다.' });
        return;
      }
      // 검증을 모두 통과한 뒤에만 내 대기방을 정리한다 — 실패한 참가가 방을 지우면 안 된다
      releaseWaitingRoomsHostedBy(socket);
      if (getRoomBySocketId(socket.id)) {
        socket.emit('room:error', { code: 'ALREADY_IN_ROOM', message: '이미 참여 중인 게임이 있습니다.' });
        return;
      }

      const guestToken = uuidv4();
      room.guestToken = guestToken;
      state.tokenMap.set(guestToken, { roomId, role: 'guest' });

      room.players.guest.socketId  = socket.id;
      room.players.guest.connected = true;
      room.players.guest.ip        = socket._clientIp;
      socket.join(roomId);

      clearTimeout(room.cleanupTimer);

      log(`게스트 참가 — 방 ${roomId.slice(0,8)}`);

      socket.emit('room:joined', { playerToken: guestToken, guestColor: room.guestColor, roomId, gameType: room.gameType });
      io.to(roomId).emit('room:guest:joined', { guestColor: room.guestColor });

      startGame(room);
    });

    // --- Room: Reconnect ---
    socket.on('room:reconnect', (payload) => {
      const { playerToken } = payloadObject(payload);
      // Rate limit: 1분에 5회
      if (!rateCheck(socket.id, 'reconnect', 5, 60 * 1000)) return;
      if (!playerToken || typeof playerToken !== 'string') return;

      const entry = state.tokenMap.get(playerToken);
      if (!entry) {
        socket.emit('room:error', { code: 'INVALID_TOKEN', message: '유효하지 않은 토큰입니다.' });
        return;
      }

      const { roomId, role } = entry;
      const room = state.rooms.get(roomId);
      if (!room) {
        socket.emit('room:error', { code: 'NOT_FOUND', message: '방을 찾을 수 없습니다.' });
        return;
      }

      // 이전 소켓이 있으면 room에서 분리
      const prevSocketId = room.players[role].socketId;
      if (prevSocketId && prevSocketId !== socket.id) {
        const prevSocket = io.sockets.sockets.get(prevSocketId);
        if (prevSocket) prevSocket.leave(roomId);
      }

      room.players[role].socketId  = socket.id;
      room.players[role].connected = true;
      room.players[role].ip        = socket._clientIp;
      socket.join(roomId);

      const bothPlayersConnected = room.players.host.connected && room.players.guest.connected;

      if (room.status === 'active') {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;

        if (!bothPlayersConnected) {
          const missingRole = role === 'host' ? 'guest' : 'host';
          room.cleanupTimer = setTimeout(() => {
            if (room.status !== 'active' || room.players[missingRole].connected) return;
            const missingColor = getRoleColor(room, missingRole);
            const winner = missingColor === 'white' ? 'black' : 'white';
            endGame(room, winner, 'disconnect');
          }, 10 * 60 * 1000);
        }
      } else if (room.status === 'waiting') {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = setTimeout(() => {
          if (room.status !== 'waiting') return;
          state.tokenMap.delete(room.hostToken);
          state.rooms.delete(room.id);
          log(`Waiting room cleanup - ${room.id.slice(0, 8)}`);
        }, 30 * 60 * 1000);
      }

      if (room.status === 'active' && bothPlayersConnected && room.timers.lastTickAt === null) {
        room.timers.lastTickAt = Date.now();
      }

      const yourColor = getRoleColor(room, role);

      socket.emit('game:state', {
        roomId,
        status:      room.status,
        gameType:    room.gameType,
        fen:         room.fen   || null,
        pgn:         room.pgn   || null,
        board:       room.board || null,
        currentTurn: room.currentTurn || null,
        moves:       room.moves,
        timers: {
          white:       room.timers.white,
          black:       room.timers.black,
          activeColor: room.timers.activeColor,
          paused:      room.timers.lastTickAt === null,
        },
        peerConnected: room.players[getOpponentRole(role)].connected,
        yourColor,
        hostColor:   room.hostColor,
        timeControl: room.timeControl,
        chat:        room.chat,
        winner:      room.winner,
        boardSize:   room.boardSize   || null,
        colHeights:  room.colHeights  || null,
        mustJump:    room.mustJump    || null,
        scores:      room.scores      || null,
        validMoves:  room.gameType === 'checkers' && room.board && room.currentTurn
                       ? (room.mustJump
                           ? getValidCheckersMovesForPiece(room.board, room.mustJump.row, room.mustJump.col, room.board[room.mustJump.row][room.mustJump.col], true)
                           : getAllCheckersValidMoves(room.board, room.currentTurn))
                       : null,
        chips:          room.chips          || null,
        pot:            room.pot !== undefined ? room.pot : null,
        phase:          room.phase          || null,
        hands:          null, // reconnect시 인디언 포커 손패는 재발급 필요
        hand:           room.gameType === 'texasholdem' && room.hands ? room.hands[role] || null : null,
        roundNum:       room.roundNum       || 0,
        roundBet:       room.roundBet       || 0,
        betTurn:        room.betTurn        || null,
        raiseCount:     room.raiseCount     || 0,
        button:         room.button         || null,
        toCall:         room.gameType === 'texasholdem' && room.betTurn
                          ? Math.max(0, (room.roundBet || 0) - (room.bets[room.betTurn] || 0))
                          : 0,
        pits:           room.pits           || null,
        edges:          room.edges          || null,
        boxes:          room.boxes          || null,
        dice:           room.dice           || null,
        remainingMoves: room.remainingMoves || null,
        attackGrids:    room.attackGrids    || null,
        // 배틀십 재접속 — 내 함선 위치가 없으면 새로고침한 플레이어는 배치 화면으로 돌아가
        // (서버는 재배치를 거부) 함대도 못 보고 포격도 못 했다. 자기 격자만 보낸다.
        myShipGrid:     room.gameType === 'battleship' && room.shipGrids ? (room.shipGrids[yourColor] || null) : null,
        community:      room.community      || null,
        bets:           room.bets           || null,
      });

      const opponentRole     = getOpponentRole(role);
      const opponentSocketId = room.players[opponentRole].socketId;
      if (opponentSocketId) {
        io.to(opponentSocketId).emit('player:reconnected', { role });
      }
    });

    // --- Game: Move ---
    socket.on('game:move', (data) => {
      if (!data || typeof data !== 'object') return;
      // Rate limit: 10초 내 30회
      if (!rateCheck(socket.id, 'move', 30, 10 * 1000)) return;

      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'active') return;

      const handler = handlers.get(room.gameType);
      const movesBefore = room.moves.length;
      if (handler) handler.handleMove(socket, room, role, data);
      // 무승부 제안은 '받은 쪽'이 수를 두면 소멸한다 (체스 관례). 제안한 쪽이 두는 건 무관.
      if (room.drawOffer && room.drawOffer !== role && room.moves.length > movesBefore) {
        room.drawOffer = null;
      }
    });

    // --- Indian Poker: Action ---
    socket.on('indianpoker:action', (data) => {
      if (!data || typeof data !== 'object') return;
      if (!rateCheck(socket.id, 'ipaction', 10, 30 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.gameType !== 'indianpoker') return;
      if (room.status !== 'active') return;
      handleIndianPokerAction(socket, room, role, data);
    });

    // --- Game: Resign ---
    socket.on('game:resign', () => {
      if (!rateCheck(socket.id, 'resign', 3, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'active') return;

      const yourColor = getRoleColor(room, role);
      const winner    = yourColor === 'white' ? 'black' : 'white';
      endGame(room, winner, 'resign');
    });

    // --- Game: Draw offer ---
    socket.on('game:draw:offer', () => {
      if (!rateCheck(socket.id, 'drawOffer', 5, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'active') return;

      const opponentRole     = getOpponentRole(role);
      const opponentSocketId = room.players[opponentRole].socketId;
      // 서버가 제안을 기억해야 '수락'을 검증할 수 있다
      room.drawOffer = role;
      if (opponentSocketId) io.to(opponentSocketId).emit('game:draw:offered');
    });

    socket.on('game:draw:respond', (payload) => {
      const { accept } = payloadObject(payload);
      if (!rateCheck(socket.id, 'draw_respond', 5, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'active') return;
      // ⚠ 상대가 제안하지 않았는데 '수락'을 보내면 안 된다. 예전엔 검증이 없어서
      //   지고 있는 쪽이 devtools 에서 emit 한 줄로 언제든 무승부를 만들 수 있었다.
      if (!room.drawOffer || room.drawOffer === role) return;
      room.drawOffer = null;

      if (accept) {
        endGame(room, 'draw', 'agreement');
      } else {
        const opponentRole     = getOpponentRole(role);
        const opponentSocketId = room.players[opponentRole].socketId;
        if (opponentSocketId) io.to(opponentSocketId).emit('game:draw:declined');
      }
    });

    // --- Game: Rematch ---
    socket.on('game:rematch:request', () => {
      if (!rateCheck(socket.id, 'rematch_req', 3, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'finished') return;

      room.rematchRequest[role] = true;

      const opponentRole     = getOpponentRole(role);
      const opponentSocketId = room.players[opponentRole].socketId;
      if (opponentSocketId) io.to(opponentSocketId).emit('rematch:requested');

      if (room.rematchRequest.host && room.rematchRequest.guest) {
        resetForRematch(room);
      }
    });

    socket.on('game:rematch:respond', (payload) => {
      const { accept } = payloadObject(payload);
      if (!rateCheck(socket.id, 'rematch_res', 3, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'finished') return;

      if (accept) {
        room.rematchRequest[role] = true;
        if (room.rematchRequest.host && room.rematchRequest.guest) {
          resetForRematch(room);
        }
      } else {
        const opponentRole     = getOpponentRole(role);
        const opponentSocketId = room.players[opponentRole].socketId;
        if (opponentSocketId) io.to(opponentSocketId).emit('rematch:declined');
        room.rematchRequest = { host: false, guest: false };
      }
    });

    // --- Spectator: Join ---
    socket.on('spectator:join', (payload) => {
      let { roomId, nickname } = payloadObject(payload);
      if (!roomId || typeof roomId !== 'string' || roomId.length > 36) return;
      // 제어문자·꺾쇠를 걷어낸다 — 개행이 섞이면 서버 로그에 가짜 줄을 끼워 넣을 수 있다
      nickname = sanitizeNickname(nickname, '관전자', 20);

      const room = state.rooms.get(roomId);
      if (!room) {
        socket.emit('spectator:error', { message: '방을 찾을 수 없습니다.' });
        return;
      }
      if (room.status === 'waiting') {
        socket.emit('spectator:error', { message: '아직 게임이 시작되지 않았습니다.' });
        return;
      }
      if (!rateCheck(socket.id, 'spectator', 5, 60 * 1000)) {
        socket.emit('spectator:error', { message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
        return;
      }

      // 이 방의 플레이어는 자기 방을 관전할 수 없다 (연결 해제 정리가 꼬인다)
      if (room.players.host.socketId === socket.id || room.players.guest.socketId === socket.id) {
        socket.emit('spectator:error', { message: '이미 이 방의 플레이어입니다.' });
        return;
      }
      // 한 소켓은 한 방만 관전한다 — 다른 방에 남은 흔적은 지운다
      removeSpectatorEverywhere(io, socket, roomId);
      room.spectators.delete(socket.id);
      room.spectators.set(socket.id, { nickname, approved: false, socketId: socket.id });
      // ⚠ 여기서 socket.join(roomId) 하면 안 된다. 방장이 승인하기 전부터 수·채팅이
      //   전부 흘러 들어가 승인 절차가 무의미해진다. 방 입장은 approveSpectator 가 한다.

      const hostSocketId = room.players.host.socketId;
      if (hostSocketId && room.players.host.connected) {
        io.to(hostSocketId).emit('spectator:request', { socketId: socket.id, nickname });
        socket.emit('spectator:pending', { message: `방장의 승인을 기다리는 중...` });
        log(`관전 요청 — ${nickname} → 방 ${roomId.slice(0,8)}`);
      } else {
        // 방장이 오프라인이면 자동 승인
        approveSpectator(room, socket.id);
      }
    });

    // --- Spectator: Approve/Deny (host only) ---
    socket.on('spectator:approve', (payload) => {
      const { socketId } = payloadObject(payload);
      if (!rateCheck(socket.id, 'spec_approve', 10, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found || found.role !== 'host') return;
      const { room } = found;
      if (!room.spectators.has(socketId)) return;
      approveSpectator(room, socketId);
    });

    socket.on('spectator:deny', (payload) => {
      const { socketId } = payloadObject(payload);
      if (!rateCheck(socket.id, 'spec_deny', 10, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found || found.role !== 'host') return;
      const { room } = found;
      const spec = room.spectators.get(socketId);
      if (!spec) return;

      room.spectators.delete(socketId);
      const specSocket = io.sockets.sockets.get(socketId);
      if (specSocket) {
        specSocket.leave(room.id);
        specSocket.emit('spectator:denied', { message: '방장이 관전을 거부했습니다.' });
      }
      log(`관전 거부 — ${spec.nickname} → 방 ${room.id.slice(0,8)}`);
    });

    // --- Spectator: Hint ---
    socket.on('spectator:hint', (payload) => {
      const { from, to, row, col } = payloadObject(payload);
      if (!rateCheck(socket.id, 'hint', 3, 60 * 1000)) {
        socket.emit('spectator:hint:ratelimit', { message: '훈수는 1분에 3회로 제한됩니다.' });
        return;
      }
      const specFound = getSpectatorBySocketId(socket.id);
      if (!specFound || !specFound.spectator.approved) return;
      const { room, spectator } = specFound;
      if (room.status !== 'active') return;

      if (room.gameType === 'chess') {
        if (typeof from !== 'string' || typeof to !== 'string') return;
        if (!room.chess) return;
        let move;
        try {
          const chessCopy = new Chess(room.fen);
          move = chessCopy.move({ from, to });
        } catch (e) { move = null; }
        if (!move) {
          socket.emit('spectator:hint:invalid', { message: '유효하지 않은 수입니다.' });
          return;
        }
        io.to(room.id).emit('spectator:hint', { from, to, san: move.san, nickname: spectator.nickname });
        log(`관전자 훈수(체스) — ${spectator.nickname}: ${move.san} (방 ${room.id.slice(0,8)})`);

      } else if (room.gameType === 'omok') {
        // ⚠ 예전엔 typeof 만 보고 0~14 로 고정했다 — {row:0.5} 나 13×13 판의 row 14 가
        //   board[행] 이 undefined 인 채로 인덱싱돼 서버 프로세스가 죽었다.
        const size = (room.boardSize && room.boardSize.size) || 15;
        if (!isCell(row, col, size, size)) return;
        if (room.board[row][col] !== null) {
          socket.emit('spectator:hint:invalid', { message: '이미 돌이 있는 곳입니다.' });
          return;
        }
        const colLetter = String.fromCharCode(65 + col);
        const rowLabel  = size - row;
        io.to(room.id).emit('spectator:hint', { row, col, label: `${colLetter}${rowLabel}`, nickname: spectator.nickname });
        log(`관전자 훈수(오목) — ${spectator.nickname}: ${colLetter}${rowLabel} (방 ${room.id.slice(0,8)})`);
      } else if (room.gameType === 'connect4') {
        // 판 크기는 4~9행 × 4~10열 — 7열·6행 고정이면 큰 판의 오른쪽은 훈수가 안 되고
        // 9행 판의 여섯 칸 찬 열은 '꽉 참'으로 잘못 거절됐다
        const rows = (room.boardSize && room.boardSize.rows) || 6;
        const cols = (room.boardSize && room.boardSize.cols) || 7;
        if (!Number.isInteger(col) || col < 0 || col >= cols) return;
        if (room.colHeights[col] >= rows) {
          socket.emit('spectator:hint:invalid', { message: '이미 꽉 찬 열입니다.' });
          return;
        }
        io.to(room.id).emit('spectator:hint', { col, nickname: spectator.nickname });
      } else if (room.gameType === 'othello') {
        if (!isCell(row, col, 8, 8)) return;
        io.to(room.id).emit('spectator:hint', { row, col, nickname: spectator.nickname });
      } else if (room.gameType === 'checkers') {
        // 훈수: from 좌표 하이라이트 (범위 검사가 없어 어떤 숫자든 그대로 중계됐다)
        if (!isCell(row, col, 8, 8)) return;
        io.to(room.id).emit('spectator:hint', { row, col, nickname: spectator.nickname });
      }
    });

    // --- Chat ---
    socket.on('chat:send', (payload) => {
      const { text } = payloadObject(payload);
      // 타입 검증
      if (typeof text !== 'string') return;
      if (!text.trim().length) return;

      // Rate limit: keep chat usable while preventing bubble/log flooding.
      if (!rateCheck(socket.id, 'chat', 8, 10 * 1000)) {
        socket.emit('chat:ratelimit', { message: 'Chat is limited to 8 messages every 10 seconds.' });
        return;
      }

      const found     = getRoomBySocketId(socket.id);
      const specFound = !found ? getSpectatorBySocketId(socket.id) : null;
      if (!found && (!specFound || !specFound.spectator.approved)) return;

      const room = found ? found.room : specFound.room;
      const role = found ? found.role : 'spectator';
      const nick = role === 'spectator' ? specFound.spectator.nickname : undefined;

      const msg = {
        role,
        nickname: nick,
        text: text.trim().slice(0, 200),
        ts:   Date.now()
      };
      room.chat.push(msg);
      if (room.chat.length > 200) room.chat.shift();

      io.to(room.id).emit('chat:message', msg);
    });

    // --- Arcade Vampire Survivors co-op relay ---
    socket.on('vps:room:create', () => {
      if (!rateCheck(socket.id, 'vps_create', 3, 60 * 1000)) {
        socket.emit('vps:error', { code: 'RATE_LIMIT', message: 'Too many co-op room requests.' });
        return;
      }
      if (state.arcadeVampireRooms.size >= 30) {
        socket.emit('vps:error', { code: 'SERVER_FULL', message: 'Co-op relay is full. Try again later.' });
        return;
      }
      const roomId = uuidv4().slice(0, 8);
      const room = {
        id: roomId,
        hostSocketId: socket.id,
        guestSocketId: null,
        createdAt: Date.now(),
        lastStateAt: 0,
        cleanupTimer: null,
      };
      state.arcadeVampireRooms.set(roomId, room);
      socket.join(`vps:${roomId}`);
      room.cleanupTimer = setTimeout(() => {
        const current = state.arcadeVampireRooms.get(roomId);
        if (current && !current.guestSocketId) {
          state.arcadeVampireRooms.delete(roomId);
          io.to(socket.id).emit('vps:room:closed', { reason: 'timeout' });
        }
      }, 30 * 60 * 1000);
      socket.emit('vps:room:created', { roomId });
    });

    socket.on('vps:room:join', (payload) => {
      const { roomId } = payloadObject(payload);
      if (!rateCheck(socket.id, 'vps_join', 8, 60 * 1000)) return;
      if (!roomId || typeof roomId !== 'string' || !/^[a-f0-9-]{4,36}$/i.test(roomId)) {
        socket.emit('vps:error', { code: 'INVALID_ROOM', message: 'Invalid co-op room.' });
        return;
      }
      const room = state.arcadeVampireRooms.get(roomId);
      if (!room) {
        socket.emit('vps:error', { code: 'NOT_FOUND', message: 'Co-op room not found.' });
        return;
      }
      if (room.hostSocketId === socket.id) {
        socket.emit('vps:error', { code: 'HOST_SELF_JOIN', message: 'Open the share link in another browser.' });
        return;
      }
      if (room.guestSocketId && room.guestSocketId !== socket.id) {
        socket.emit('vps:error', { code: 'ROOM_FULL', message: 'This co-op room already has a guest.' });
        return;
      }
      room.guestSocketId = socket.id;
      clearTimeout(room.cleanupTimer);
      socket.join(`vps:${roomId}`);
      socket.emit('vps:room:joined', { roomId });
      io.to(room.hostSocketId).emit('vps:guest:joined', { roomId });
    });

    socket.on('vps:guest:input', (payload) => {
      const { roomId, input } = payloadObject(payload);
      if (!rateCheck(socket.id, 'vps_input', 40, 5 * 1000)) return;
      const room = state.arcadeVampireRooms.get(roomId);
      if (!room || room.guestSocketId !== socket.id) return;
      const safe = {
        dx: Math.max(-1, Math.min(1, Number(input && input.dx) || 0)),
        dy: Math.max(-1, Math.min(1, Number(input && input.dy) || 0)),
        dash: !!(input && input.dash),
        tower: !!(input && input.tower),
      };
      io.to(room.hostSocketId).emit('vps:guest:input', { roomId, input: safe });
    });

    socket.on('vps:host:state', (payload) => {
      const { roomId, snapshot } = payloadObject(payload);
      const room = state.arcadeVampireRooms.get(roomId);
      if (!room || room.hostSocketId !== socket.id || !room.guestSocketId) return;
      const now = Date.now();
      if (now - room.lastStateAt < 120) return;
      room.lastStateAt = now;
      const safe = {
        state: String(snapshot && snapshot.state || '').slice(0, 16),
        elapsed: Math.max(0, Number(snapshot && snapshot.elapsed) || 0),
        kills: Math.max(0, Number(snapshot && snapshot.kills) || 0),
        hp: Math.max(0, Number(snapshot && snapshot.hp) || 0),
        maxHp: Math.max(1, Number(snapshot && snapshot.maxHp) || 1),
        level: Math.max(1, Number(snapshot && snapshot.level) || 1),
        host: snapshot && snapshot.host ? {
          x: Number(snapshot.host.x) || 0,
          y: Number(snapshot.host.y) || 0,
        } : null,
        guest: snapshot && snapshot.guest ? {
          x: Number(snapshot.guest.x) || 0,
          y: Number(snapshot.guest.y) || 0,
        } : null,
        enemies: Array.isArray(snapshot && snapshot.enemies)
          ? snapshot.enemies.slice(0, 30).map(e => ({
              x: Number(e.x) || 0,
              y: Number(e.y) || 0,
              size: Math.max(4, Math.min(60, Number(e.size) || 10)),
              hpPct: Math.max(0, Math.min(1, Number(e.hpPct) || 0)),
              color: typeof e.color === 'string' ? e.color.slice(0, 24) : '#e74c3c',
            }))
          : [],
      };
      io.to(room.guestSocketId).emit('vps:state', { roomId, snapshot: safe });
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      cleanRateLimit(socket.id);

      for (const [roomId, vpsRoom] of state.arcadeVampireRooms.entries()) {
        if (vpsRoom.hostSocketId === socket.id) {
          if (vpsRoom.guestSocketId) io.to(vpsRoom.guestSocketId).emit('vps:room:closed', { reason: 'host-disconnected' });
          clearTimeout(vpsRoom.cleanupTimer);
          state.arcadeVampireRooms.delete(roomId);
        } else if (vpsRoom.guestSocketId === socket.id) {
          vpsRoom.guestSocketId = null;
          io.to(vpsRoom.hostSocketId).emit('vps:guest:left', { roomId });
          vpsRoom.cleanupTimer = setTimeout(() => {
            const current = state.arcadeVampireRooms.get(roomId);
            if (current && !current.guestSocketId) state.arcadeVampireRooms.delete(roomId);
          }, 10 * 60 * 1000);
        }
      }

      // 관전자 정리 — 모든 방에서. 예전엔 첫 방만 지우고 return 해서,
      // 관전자이면서 다른 방 플레이어인 소켓은 플레이어 정리를 건너뛰었다.
      removeSpectatorEverywhere(io, socket, null);

      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;

      room.players[role].connected = false;
      room.players[role].socketId  = null;

      // Pause timer
      if (room.status === 'active' && room.timers.lastTickAt !== null) {
        const now     = Date.now();
        const elapsed = now - room.timers.lastTickAt;
        if (room.timers.activeColor && room.timers[room.timers.activeColor] !== null) {
          room.timers[room.timers.activeColor] = Math.max(0, room.timers[room.timers.activeColor] - elapsed);
        }
        room.timers.lastTickAt = null;
      }

      io.to(room.id).emit('player:disconnected', { role });

      // ── 양측 모두 연결 끊김 여부 확인 ──────────────────────────────
      const bothGone = !room.players.host.connected && !room.players.guest.connected;

      if (bothGone) {
        // 양측 모두 없음 → 짧은 유예 시간(5분) 후 방 즉시 삭제
        clearTimeout(room.cleanupTimer);
        log(`방 ${room.id.slice(0,8)} 양측 연결 끊김 — 5분 후 자동 삭제 예약`);
        room.cleanupTimer = setTimeout(() => {
          if (!room.players.host.connected && !room.players.guest.connected) {
            if (room.hostToken)  state.tokenMap.delete(room.hostToken);
            if (room.guestToken) state.tokenMap.delete(room.guestToken);
            state.rooms.delete(room.id);
            log(`방 ${room.id.slice(0,8)} 자동 삭제 완료 (양측 미연결, 현재 방 수: ${state.rooms.size})`);
          }
        }, 5 * 60 * 1000);

      } else if (room.status === 'active' || room.status === 'waiting') {
        // 한쪽만 끊김 → 기존 로직 (10분 유예 후 forfeit)
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = setTimeout(() => {
          if (!room.players[role].connected) {
            if (room.status === 'active') {
              const yourColor = getRoleColor(room, role);
              const winner    = yourColor === 'white' ? 'black' : 'white';
              endGame(room, winner, 'disconnect');
            } else {
              state.tokenMap.delete(room.hostToken);
              state.rooms.delete(room.id);
              log(`방 ${room.id.slice(0,8)} 대기 중 방 삭제 (호스트 미복귀)`);
            }
          }
        }, 10 * 60 * 1000);
      }
    });
  });
}

module.exports = { registerEvents, _internal: { guardSocketHandlers, isCell } };
