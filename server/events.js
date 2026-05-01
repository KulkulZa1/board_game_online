// server/events.js — Socket.io 이벤트 핸들러
const { v4: uuidv4 } = require('uuid');
const state = require('./state');
const {
  log, rateCheck, cleanRateLimit,
  getRoleColor, getOpponentRole,
  getRoomBySocketId, getSpectatorBySocketId
} = require('./utils');
const { createRoomState, resetForRematch } = require('./rooms');
const { endGame, startGame, approveSpectator } = require('./endgame');
const handlers = require('./handlers');
const { handleIndianPokerAction } = require('./handlers/indianpoker');
const { getValidCheckersMovesForPiece, getAllCheckersValidMoves } = require('./handlers/checkers');
const { Chess } = require('chess.js');

function registerEvents(io) {
  io.on('connection', (socket) => {
    // 실제 클라이언트 IP (Cloudflare 경유 시 CF-Connecting-IP 헤더 사용)
    const clientIp = socket.handshake.headers['cf-connecting-ip']
      || socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || socket.handshake.address;
    socket._clientIp = clientIp;
    log(`소켓 연결 — id=${socket.id.slice(0,8)} ip=${clientIp}`);

    // --- Room: Create ---
    socket.on('room:create', ({ hostColor, timeControl, gameType, boardSize, indianPokerOpts }) => {
      // Rate limit: 1분 내 5회
      if (!rateCheck(socket.id, 'create', 5, 60 * 1000)) {
        socket.emit('room:error', { code: 'RATE_LIMIT', message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
        return;
      }

      // 입력 검증
      if (!['chess', 'omok', 'connect4', 'othello', 'indianpoker', 'checkers', 'applegame', 'battleship'].includes(gameType)) {
        socket.emit('room:error', { code: 'INVALID_GAME_TYPE', message: '잘못된 게임 타입입니다.' });
        return;
      }
      if (gameType === 'connect4' || gameType === 'indianpoker' || gameType === 'applegame' || gameType === 'battleship') {
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
    socket.on('room:join', ({ roomId }) => {
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
      if (room.guestToken) {
        socket.emit('room:error', { code: 'ROOM_FULL', message: '방이 가득 찼습니다.' });
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
    socket.on('room:reconnect', ({ playerToken }) => {
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

      // Resume timer if both connected
      if (room.status === 'active' && room.timers.lastTickAt === null) {
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
          activeColor: room.timers.activeColor
        },
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
        chips:       room.chips       || null,
        pot:         room.pot !== undefined ? room.pot : null,
        phase:       room.phase       || null,
        hands:       null, // reconnect시 인디언 포커 손패는 재발급 필요
      });

      const opponentRole     = getOpponentRole(role);
      const opponentSocketId = room.players[opponentRole].socketId;
      if (opponentSocketId) {
        io.to(opponentSocketId).emit('player:reconnected', { role });
      }
    });

    // --- Game: Move ---
    socket.on('game:move', (data) => {
      // Rate limit: 10초 내 30회
      if (!rateCheck(socket.id, 'move', 30, 10 * 1000)) return;

      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'active') return;

      const handler = handlers.get(room.gameType);
      if (handler) handler.handleMove(socket, room, role, data);
    });

    // --- Indian Poker: Action ---
    socket.on('indianpoker:action', (data) => {
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
      if (opponentSocketId) io.to(opponentSocketId).emit('game:draw:offered');
    });

    socket.on('game:draw:respond', ({ accept }) => {
      if (!rateCheck(socket.id, 'draw_respond', 5, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found) return;
      const { room, role } = found;
      if (room.status !== 'active') return;

      if (accept) {
        endGame(room, 'draw', 'agreement');
      } else {
        const opponentRole     = getOpponentRole(role);
        const opponentSocketId = room.players[opponentRole].socketId;
        if (opponentSocketId) io.to(opponentSocketId).emit('game:draw:declined');
        room.rematchRequest = { host: false, guest: false };
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

    socket.on('game:rematch:respond', ({ accept }) => {
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
    socket.on('spectator:join', ({ roomId, nickname }) => {
      if (!roomId || typeof roomId !== 'string' || roomId.length > 36) return;
      if (!nickname || typeof nickname !== 'string') nickname = '관전자';
      nickname = nickname.trim().slice(0, 20) || '관전자';

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

      // 이미 관전 중이거나 플레이어인 경우 제거
      room.spectators.delete(socket.id);
      room.spectators.set(socket.id, { nickname, approved: false, socketId: socket.id });
      socket.join(roomId);

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
    socket.on('spectator:approve', ({ socketId }) => {
      if (!rateCheck(socket.id, 'spec_approve', 10, 60 * 1000)) return;
      const found = getRoomBySocketId(socket.id);
      if (!found || found.role !== 'host') return;
      const { room } = found;
      if (!room.spectators.has(socketId)) return;
      approveSpectator(room, socketId);
    });

    socket.on('spectator:deny', ({ socketId }) => {
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
    socket.on('spectator:hint', ({ from, to, row, col }) => {
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
        if (typeof row !== 'number' || typeof col !== 'number') return;
        if (row < 0 || row > 14 || col < 0 || col > 14) return;
        if (room.board[row][col] !== null) {
          socket.emit('spectator:hint:invalid', { message: '이미 돌이 있는 곳입니다.' });
          return;
        }
        const colLetter = String.fromCharCode(65 + col);
        const rowLabel  = 15 - row;
        io.to(room.id).emit('spectator:hint', { row, col, label: `${colLetter}${rowLabel}`, nickname: spectator.nickname });
        log(`관전자 훈수(오목) — ${spectator.nickname}: ${colLetter}${rowLabel} (방 ${room.id.slice(0,8)})`);
      } else if (room.gameType === 'connect4') {
        if (typeof col !== 'number') return;
        if (col < 0 || col > 6) return;
        if (room.colHeights[col] >= 6) {
          socket.emit('spectator:hint:invalid', { message: '이미 꽉 찬 열입니다.' });
          return;
        }
        io.to(room.id).emit('spectator:hint', { col, nickname: spectator.nickname });
      } else if (room.gameType === 'othello') {
        if (typeof row !== 'number' || typeof col !== 'number') return;
        if (row < 0 || row > 7 || col < 0 || col > 7) return;
        io.to(room.id).emit('spectator:hint', { row, col, nickname: spectator.nickname });
      } else if (room.gameType === 'checkers') {
        // 훈수: from 좌표 하이라이트
        if (typeof row !== 'number' || typeof col !== 'number') return;
        io.to(room.id).emit('spectator:hint', { row, col, nickname: spectator.nickname });
      }
    });

    // --- Chat ---
    socket.on('chat:send', ({ text }) => {
      // 타입 검증
      if (typeof text !== 'string') return;
      if (!text.trim().length) return;

      // Rate limit: 10초 내 20회
      if (!rateCheck(socket.id, 'chat', 20, 10 * 1000)) return;

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

    // --- Disconnect ---
    socket.on('disconnect', () => {
      cleanRateLimit(socket.id);

      // 관전자 정리
      const specFound = getSpectatorBySocketId(socket.id);
      if (specFound) {
        const { room, spectator } = specFound;
        room.spectators.delete(socket.id);
        if (spectator.approved) {
          const remaining = [...room.spectators.values()].filter(s => s.approved).length;
          io.to(room.id).emit('spectator:left', { nickname: spectator.nickname, count: remaining });
        }
        return;
      }

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

module.exports = { registerEvents };
