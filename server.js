const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { Chess } = require('chess.js');
const path = require('path');
const fs = require('fs');
const { networkInterfaces } = require('os');

const app = express();
const server = http.createServer(app);

// ========== CORS ==========
// 개인 PC 호스팅 + Cloudflare Tunnel 사용 시 외부 접속 허용
// 보안은 UUID 방 ID + rate limit으로 충분히 보장됨
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());
// TWA assetlinks.json — Play Store 도메인 연결 필수 (Content-Type: application/json)
app.use('/.well-known', express.static(
  path.join(__dirname, 'public/.well-known'),
  { setHeaders: (res) => res.set('Content-Type', 'application/json') }
));
app.use(express.static(path.join(__dirname, 'public')));

// Cloudflare Tunnel 경유 시 실제 클라이언트 IP를 X-Forwarded-For / CF-Connecting-IP 로 전달
// trust proxy 활성화로 req.ip 가 실제 IP를 반환
app.set('trust proxy', true);

// ========== 서버 시작 시각 ==========
const SERVER_START_TIME = Date.now();

// ========== 서버 셧다운 키 ==========
const SHUTDOWN_KEY = uuidv4();
const KEY_FILE = path.join(__dirname, '.shutdown-key');
fs.writeFileSync(KEY_FILE, SHUTDOWN_KEY, { encoding: 'utf8', mode: 0o600 });

// GET /api/status — 서버 현황 (localhost 접속 시 shutdown 키 포함)
app.get('/api/status', (req, res) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  const list = [...rooms.values()];

  // 방 상세 목록 (민감 정보 제외)
  const roomList = list.map(r => {
    const moveCount = r.moves ? r.moves.length : 0;
    let lastMove = null;
    if (moveCount > 0) {
      const lm = r.moves[moveCount - 1];
      if (lm.san) {
        lastMove = lm.san;
      } else if (lm.col !== undefined && lm.row === undefined) {
        // connect4: col only
        lastMove = `Col ${lm.col + 1}`;
      } else if (lm.color !== undefined && lm.row !== undefined) {
        const colLetter = String.fromCharCode(65 + lm.col);
        if (r.gameType === 'omok') {
          const rowLabel = 15 - lm.row;
          lastMove = `${lm.color === 'black' ? '●' : '○'} ${colLetter}${rowLabel}`;
        } else {
          lastMove = `${colLetter}${8 - lm.row}`;
        }
      } else if (lm.from && lm.to) {
        // checkers
        const fromCol = String.fromCharCode(65 + lm.from.col);
        const toCol   = String.fromCharCode(65 + lm.to.col);
        lastMove = `${fromCol}${8-lm.from.row}→${toCol}${8-lm.to.row}`;
      }
    }
    return {
      id:        r.id,
      shortId:   r.id.slice(0, 8),
      status:    r.status,
      gameType:  r.gameType || 'chess',
      hostColor: r.hostColor,
      timeControl: r.timeControl || null,
      timers: r.timers ? {
        white:       r.timers.white !== null ? Math.round(r.timers.white / 1000) : null,
        black:       r.timers.black !== null ? Math.round(r.timers.black / 1000) : null,
        activeColor: r.timers.activeColor,
      } : null,
      players: {
        host: {
          socketId:  r.players.host.socketId  || null,
          connected: r.players.host.connected  || false,
          ip: r.players.host.ip  || null,
        },
        guest: {
          socketId:  r.players.guest.socketId || null,
          connected: r.players.guest.connected || false,
          ip: r.players.guest.ip || null,
        },
      },
      moveCount,
      lastMove,
      fen: r.fen || null,
      spectatorCount: r.spectators ? [...r.spectators.values()].filter(s => s.approved).length : 0,
      domain: TUNNEL_URL || ('http://localhost:' + PORT),
    };
  });

  const data = {
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    tunnelUrl: TUNNEL_URL,
    rooms: {
      active:  list.filter(r => r.status === 'active').length,
      waiting: list.filter(r => r.status === 'waiting').length,
      total:   list.length,
    },
    players: {
      connected: list.reduce((n, r) =>
        n + (r.players.host.connected  ? 1 : 0)
          + (r.players.guest.connected ? 1 : 0), 0),
    },
    roomList,
  };
  if (isLocal) data.shutdownKey = SHUTDOWN_KEY;
  res.json(data);
});

// POST /admin/shutdown — body에 key 전달 (URL 히스토리에 키 노출 방지)
app.post('/admin/shutdown', (req, res) => {
  if (!req.body || req.body.key !== SHUTDOWN_KEY) {
    return res.status(401).json({ error: '잘못된 셧다운 키입니다.' });
  }
  res.json({ message: '서버를 종료합니다.' });
  log('[!] 관리자 명령으로 서버가 종료됩니다...');
  setTimeout(() => gracefulShutdown('ADMIN'), 200);
});

// POST /admin/terminate — 특정 방 게임 강제 종료
app.post('/admin/terminate', (req, res) => {
  if (!req.body || req.body.key !== SHUTDOWN_KEY) {
    return res.status(401).json({ error: '잘못된 셧다운 키입니다.' });
  }
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId 필요' });
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  if (room.status !== 'active') return res.status(400).json({ error: '진행 중인 게임이 아닙니다.' });
  endGame(room, 'draw', 'admin');
  log(`[관리자] 방 ${roomId.slice(0,8)} 강제 종료`);
  res.json({ message: '게임이 강제 종료되었습니다.' });
});

// ========== In-memory state ==========
const rooms    = new Map(); // roomId  -> RoomState
const tokenMap = new Map(); // token   -> { roomId, role }

// ========== Rate limiting (서드파티 불필요) ==========
const rateLimits = new Map(); // `${socketId}:${type}` -> [timestamps]

function rateCheck(socketId, type, limit, windowMs) {
  const now = Date.now();
  const key = `${socketId}:${type}`;
  const history = rateLimits.get(key) || [];
  const recent = history.filter(t => now - t < windowMs);
  if (recent.length >= limit) return false;
  rateLimits.set(key, [...recent, now]);
  return true;
}

function cleanRateLimit(socketId) {
  for (const key of rateLimits.keys()) {
    if (key.startsWith(socketId + ':')) rateLimits.delete(key);
  }
}

// 1시간마다 오래된 rateLimits 항목 자동 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of rateLimits) {
    const recent = times.filter(t => now - t < 60 * 1000);
    if (recent.length === 0) rateLimits.delete(key);
    else rateLimits.set(key, recent);
  }
}, 60 * 60 * 1000);

// ========== Helpers ==========
function log(msg) {
  const ts = new Date().toLocaleTimeString('ko-KR');
  console.log(`[${ts}] ${msg}`);
}

function createRoomState(hostColor, timeControl, hostToken, gameType) {
  const minutes = timeControl.minutes;
  const ms = minutes ? minutes * 60 * 1000 : null;
  const base = {
    id: null,
    hostToken,
    guestToken: null,
    hostColor,
    guestColor: hostColor === 'white' ? 'black' : 'white',
    timeControl,
    gameType,
    status: 'waiting',
    moves: [],
    timers: {
      white: ms,
      black: ms,
      activeColor: null,
      lastTickAt: null
    },
    players: {
      host:  { socketId: null, connected: false },
      guest: { socketId: null, connected: false }
    },
    chat: [],
    winner: null,
    rematchRequest: { host: false, guest: false },
    spectators: new Map(), // socketId → { nickname, approved }
    cleanupTimer: null
  };

  if (gameType === 'chess') {
    base.chess = new Chess();
    base.fen   = new Chess().fen();
    base.pgn   = '';
  } else if (gameType === 'omok') {
    base.board       = Array(15).fill(null).map(() => Array(15).fill(null));
    base.currentTurn = 'black'; // 흑 선공
    base.lastMove    = null;
  } else if (gameType === 'connect4') {
    base.board       = Array(6).fill(null).map(() => Array(7).fill(null));
    base.currentTurn = 'white'; // host(white)가 항상 red, guest(black)가 항상 yellow
    base.colHeights  = Array(7).fill(0);
    base.lastMove    = null;
  } else if (gameType === 'othello') {
    base.board = Array(8).fill(null).map(() => Array(8).fill(null));
    base.board[3][3] = 'white'; base.board[3][4] = 'black';
    base.board[4][3] = 'black'; base.board[4][4] = 'white';
    base.currentTurn = 'black'; // 흑 선공
    base.lastMove    = null;
    base.consecutivePasses = 0;
  } else if (gameType === 'indianpoker') {
    base.phase      = 'waiting';
    base.deck       = shuffleDeck();
    base.hands      = { host: null, guest: null };
    base.chips      = { host: 100, guest: 100 };
    base.pot        = 0;
    base.bets       = { host: 0, guest: 0 };
    base.ante       = 5;
    base.roundNum   = 0;
    base.betTurn    = null;
    base.raiseCount = 0;
  } else if (gameType === 'checkers') {
    base.board       = initCheckersBoard();
    base.currentTurn = hostColor; // 호스트 색이 선공 (기본 white=red)
    base.mustJump    = null;
    base.lastMove    = null;
  }

  return base;
}

function getTimerMs(timeControl) {
  if (!timeControl.minutes) return null;
  return timeControl.minutes * 60 * 1000;
}

function getRoomBySocketId(socketId) {
  for (const [roomId, room] of rooms) {
    if (room.players.host.socketId  === socketId) return { room, role: 'host' };
    if (room.players.guest.socketId === socketId) return { room, role: 'guest' };
  }
  return null;
}

function getRoleColor(room, role) {
  return role === 'host' ? room.hostColor : room.guestColor;
}

function getOpponentRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

function getSpectatorBySocketId(socketId) {
  for (const [, room] of rooms) {
    if (room.spectators.has(socketId)) {
      return { room, spectator: room.spectators.get(socketId) };
    }
  }
  return null;
}

function approveSpectator(room, spectatorSocketId) {
  const spec = room.spectators.get(spectatorSocketId);
  if (!spec) return;
  spec.approved = true;

  const specSocket = io.sockets.sockets.get(spectatorSocketId);
  if (!specSocket) {
    room.spectators.delete(spectatorSocketId);
    return;
  }

  const approvedCount = [...room.spectators.values()].filter(s => s.approved).length;

  specSocket.emit('spectator:approved', {
    roomId:      room.id,
    status:      room.status,
    gameType:    room.gameType,
    fen:         room.fen   || null,
    board:       room.board || null,
    currentTurn: room.currentTurn || null,
    moves:       room.moves,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor,
    },
    hostColor:   room.hostColor,
    timeControl: room.timeControl,
    chat:        room.chat,
    winner:      room.winner,
    spectatorCount: approvedCount,
    hands:       room.hands || null,          // 인디언 포커: 관전자는 두 카드 모두 공개
    chips:       room.chips || null,
    pot:         room.pot   !== undefined ? room.pot : null,
    phase:       room.phase || null,
    colHeights:  room.colHeights || null,
    mustJump:    room.mustJump   || null,
  });

  io.to(room.id).emit('spectator:joined', {
    nickname: spec.nickname,
    count:    approvedCount,
  });

  log(`관전자 승인 — ${spec.nickname} → 방 ${room.id.slice(0,8)}`);
}

function endGame(room, winner, reason, extras = {}) {
  room.status = 'finished';
  room.winner = winner;
  room.timers.activeColor = null;
  room.timers.lastTickAt  = null;
  if (room.chess) room.chess = null; // free memory (chess only)

  log(`방 ${room.id.slice(0,8)} 게임 종료 — 승자: ${winner}, 이유: ${reason}`);

  io.to(room.id).emit('game:over', {
    winner,
    reason,
    pgn:   room.pgn  || null,
    moves: room.moves,
    ...extras
  });

  // Clean up room after 10 minutes
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    if (room.hostToken)  tokenMap.delete(room.hostToken);
    if (room.guestToken) tokenMap.delete(room.guestToken);
    rooms.delete(room.id);
    log(`방 ${room.id.slice(0,8)} 정리 완료 (현재 방 수: ${rooms.size})`);
  }, 10 * 60 * 1000);
}

function startGame(room) {
  room.status = 'active';
  const ms = getTimerMs(room.timeControl);
  room.timers.white       = ms;
  room.timers.black       = ms;
  if (room.gameType === 'omok' || room.gameType === 'othello') {
    room.timers.activeColor = 'black'; // 흑 선공
  } else if (room.gameType === 'indianpoker') {
    room.timers.activeColor = null; // 카드게임: 별도 처리
  } else {
    room.timers.activeColor = room.currentTurn || 'white';
  }
  room.timers.lastTickAt  = Date.now();

  log(`방 ${room.id.slice(0,8)} 게임 시작 — ${room.gameType} / ${room.hostColor} vs ${room.guestColor}`);

  io.to(room.id).emit('game:start', {
    gameType:    room.gameType,
    fen:         room.fen   || null,
    board:       room.board || null,
    currentTurn: room.currentTurn || null,
    colHeights:  room.colHeights || null,
    mustJump:    room.mustJump   || null,
    moves: room.moves,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor
    }
  });

  // 인디언 포커: 게임 시작 후 첫 라운드 딜
  if (room.gameType === 'indianpoker') {
    setTimeout(() => startIndianPokerRound(room), 500);
  }
}

// Global timer tick every 500ms
const TICK_INTERVAL = 500;
setInterval(() => {
  const now = Date.now();
  for (const [, room] of rooms) {
    if (room.status !== 'active') continue;
    if (!room.timers.activeColor) continue;
    if (room.timers.white === null) continue;       // unlimited
    if (room.timers.lastTickAt === null) continue;  // paused (player disconnected)

    const elapsed = now - room.timers.lastTickAt;
    room.timers.lastTickAt = now;

    const color = room.timers.activeColor;
    room.timers[color] = Math.max(0, room.timers[color] - elapsed);

    io.to(room.id).emit('timer:tick', {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor
    });

    if (room.timers[color] <= 0) {
      if (room.gameType === 'indianpoker') {
        // 베팅 시간 초과 → 자동 call
        const timedOutRole = color === 'white' ? 'host' : 'guest';
        handleIndianPokerAction(null, room, timedOutRole, { action: 'call' });
      } else {
        const winner = color === 'white' ? 'black' : 'white';
        endGame(room, winner, 'timeout');
      }
    }
  }
}, TICK_INTERVAL);

// ========== Socket.io handlers ==========

io.on('connection', (socket) => {
  // 실제 클라이언트 IP (Cloudflare 경유 시 CF-Connecting-IP 헤더 사용)
  const clientIp = socket.handshake.headers['cf-connecting-ip']
    || socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || socket.handshake.address;
  socket._clientIp = clientIp;
  log(`소켓 연결 — id=${socket.id.slice(0,8)} ip=${clientIp}`);

  // --- Room: Create ---
  socket.on('room:create', ({ hostColor, timeControl, gameType }) => {
    // Rate limit: 1분 내 5회
    if (!rateCheck(socket.id, 'create', 5, 60 * 1000)) {
      socket.emit('room:error', { code: 'RATE_LIMIT', message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
      return;
    }

    // 입력 검증
    if (!['chess', 'omok', 'connect4', 'othello', 'indianpoker', 'checkers'].includes(gameType)) {
      socket.emit('room:error', { code: 'INVALID_GAME_TYPE', message: '잘못된 게임 타입입니다.' });
      return;
    }
    if (gameType === 'connect4' || gameType === 'indianpoker') {
      hostColor = 'white'; // host=white(red/dealer), guest=black(yellow/player2)
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

    // 방 개수 제한 (개인 PC 보호)
    if (rooms.size >= 20) {
      socket.emit('room:error', { code: 'SERVER_FULL', message: '서버가 가득 찼습니다. 잠시 후 다시 시도하세요.' });
      return;
    }

    const roomId    = uuidv4();
    const hostToken = uuidv4();

    const room = createRoomState(hostColor, timeControl, hostToken, gameType);
    room.id = roomId;
    rooms.set(roomId, room);
    tokenMap.set(hostToken, { roomId, role: 'host' });

    room.players.host.socketId  = socket.id;
    room.players.host.connected = true;
    room.players.host.ip        = socket._clientIp;
    socket.join(roomId);

    log(`방 생성 — ${roomId.slice(0,8)} (${hostColor}, ${timeControl.minutes ?? '무제한'}분, 방 수: ${rooms.size})`);

    // Set cleanup for waiting room (30 min)
    room.cleanupTimer = setTimeout(() => {
      if (room.status === 'waiting') {
        tokenMap.delete(room.hostToken);
        rooms.delete(roomId);
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

    const room = rooms.get(roomId);
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
    tokenMap.set(guestToken, { roomId, role: 'guest' });

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

    const entry = tokenMap.get(playerToken);
    if (!entry) {
      socket.emit('room:error', { code: 'INVALID_TOKEN', message: '유효하지 않은 토큰입니다.' });
      return;
    }

    const { roomId, role } = entry;
    const room = rooms.get(roomId);
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
      colHeights:  room.colHeights  || null,
      mustJump:    room.mustJump    || null,
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

    if (room.gameType === 'chess') {
      handleChessMove(socket, room, role, data);
    } else if (room.gameType === 'omok') {
      handleOmokMove(socket, room, role, data);
    } else if (room.gameType === 'connect4') {
      handleConnect4Move(socket, room, role, data);
    } else if (room.gameType === 'othello') {
      handleOthelloMove(socket, room, role, data);
    } else if (room.gameType === 'checkers') {
      handleCheckersMove(socket, room, role, data);
    }
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

    const room = rooms.get(roomId);
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
    const found = getRoomBySocketId(socket.id);
    if (!found || found.role !== 'host') return;
    const { room } = found;
    if (!room.spectators.has(socketId)) return;
    approveSpectator(room, socketId);
  });

  socket.on('spectator:deny', ({ socketId }) => {
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
          if (room.hostToken)  tokenMap.delete(room.hostToken);
          if (room.guestToken) tokenMap.delete(room.guestToken);
          rooms.delete(room.id);
          log(`방 ${room.id.slice(0,8)} 자동 삭제 완료 (양측 미연결, 현재 방 수: ${rooms.size})`);
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
            tokenMap.delete(room.hostToken);
            rooms.delete(room.id);
            log(`방 ${room.id.slice(0,8)} 대기 중 방 삭제 (호스트 미복귀)`);
          }
        }
      }, 10 * 60 * 1000);
    }
  });
});

// ========== Chess Move Handler ==========
function handleChessMove(socket, room, role, { from, to, promotion }) {
  if (!room.chess) return;

  const yourColor = getRoleColor(room, role);
  if (room.chess.turn() !== yourColor[0]) return;

  if (typeof from !== 'string' || typeof to !== 'string') return;
  if (promotion !== undefined && promotion !== null && !['q','r','b','n'].includes(promotion)) return;

  let move;
  try {
    move = room.chess.move({ from, to, promotion: promotion || undefined });
  } catch (e) { move = null; }

  if (!move) {
    socket.emit('game:move:invalid', { reason: '유효하지 않은 수입니다.' });
    return;
  }

  room.fen = room.chess.fen();
  room.pgn = room.chess.pgn();

  const moveRecord = {
    san:       move.san,
    from:      move.from,
    to:        move.to,
    fen:       room.fen,
    captured:  move.captured || null,
    timestamp: Date.now()
  };
  room.moves.push(moveRecord);

  const nextColor = yourColor === 'white' ? 'black' : 'white';
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  io.to(room.id).emit('game:move:made', {
    move:   moveRecord,
    fen:    room.fen,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor
    },
    turn: nextColor
  });

  if (room.chess.in_checkmate()) {
    endGame(room, yourColor, 'checkmate');
  } else if (room.chess.in_draw()) {
    let reason = 'draw';
    if (room.chess.in_stalemate())                  reason = 'stalemate';
    else if (room.chess.in_threefold_repetition())  reason = 'repetition';
    else if (room.chess.insufficient_material())    reason = 'insufficient';
    endGame(room, 'draw', reason);
  }
}

// ========== Omok Move Handler ==========
function handleOmokMove(socket, room, role, { row, col }) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;
  if (row < 0 || row > 14 || col < 0 || col > 14) return;

  const yourColor = getRoleColor(room, role);

  // 턴 확인 (오목에서 hostColor/guestColor는 'black'/'white')
  if (room.currentTurn !== yourColor) return;

  // 빈 칸 확인
  if (room.board[row][col] !== null) {
    socket.emit('game:move:invalid', { reason: '이미 돌이 있는 곳입니다.' });
    return;
  }

  // 돌 배치
  room.board[row][col] = yourColor;
  const moveNum = room.moves.length + 1;
  const moveRecord = { row, col, color: yourColor, moveNum, timestamp: Date.now() };
  room.moves.push(moveRecord);
  room.lastMove = { row, col };

  // 턴 전환
  const nextColor = yourColor === 'black' ? 'white' : 'black';
  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  io.to(room.id).emit('game:move:made', {
    move:  moveRecord,
    board: room.board,
    timers: {
      white:       room.timers.white,
      black:       room.timers.black,
      activeColor: room.timers.activeColor
    },
    turn: nextColor
  });

  // 승리 체크 (렌주룰: 정확히 5개)
  if (checkOmokWin(room.board, row, col, yourColor)) {
    const winCells = getWinCells(room.board, row, col, yourColor);
    endGame(room, yourColor, 'five-in-a-row', { winCells });
    return;
  }

  // 무승부 체크 (225수 모두 소진)
  if (room.moves.length >= 225) {
    endGame(room, 'draw', 'board-full');
  }
}

function checkOmokWin(board, row, col, color) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let i = 1; i <= 4; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r > 14 || c < 0 || c > 14 || board[r][c] !== color) break;
      count++;
    }
    for (let i = 1; i <= 4; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r > 14 || c < 0 || c > 14 || board[r][c] !== color) break;
      count++;
    }
    // 렌주룰: 정확히 5개만 승리 (6목 이상은 불계)
    if (count === 5) return true;
  }
  return false;
}

function getWinCells(board, row, col, color) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const cells = [{ row, col }];
    for (let i = 1; i <= 4; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r > 14 || c < 0 || c > 14 || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    for (let i = 1; i <= 4; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r > 14 || c < 0 || c > 14 || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    if (cells.length === 5) return cells;
  }
  return [];
}

// ========== Rematch ==========
function resetForRematch(room) {
  const tmp      = room.hostColor;
  room.hostColor  = room.guestColor;
  room.guestColor = tmp;

  room.moves  = [];
  room.winner = null;
  room.rematchRequest = { host: false, guest: false };

  if (room.gameType === 'chess') {
    room.chess  = new Chess();
    room.fen    = room.chess.fen();
    room.pgn    = '';
  } else if (room.gameType === 'omok') {
    room.board       = Array(15).fill(null).map(() => Array(15).fill(null));
    room.currentTurn = 'black';
    room.lastMove    = null;
  } else if (room.gameType === 'connect4') {
    room.board       = Array(6).fill(null).map(() => Array(7).fill(null));
    room.currentTurn = 'white';
    room.colHeights  = Array(7).fill(0);
    room.lastMove    = null;
  } else if (room.gameType === 'othello') {
    room.board = Array(8).fill(null).map(() => Array(8).fill(null));
    room.board[3][3] = 'white'; room.board[3][4] = 'black';
    room.board[4][3] = 'black'; room.board[4][4] = 'white';
    room.currentTurn = 'black';
    room.lastMove    = null;
    room.consecutivePasses = 0;
  } else if (room.gameType === 'indianpoker') {
    room.deck       = shuffleDeck();
    room.hands      = { host: null, guest: null };
    room.chips      = { host: 100, guest: 100 };
    room.pot        = 0;
    room.bets       = { host: 0, guest: 0 };
    room.roundNum   = 0;
    room.betTurn    = null;
    room.raiseCount = 0;
    room.phase      = 'waiting';
  } else if (room.gameType === 'checkers') {
    room.board       = initCheckersBoard();
    room.currentTurn = room.hostColor; // 재대국 후 호스트 색 교체됨
    room.mustJump    = null;
    room.lastMove    = null;
  }

  clearTimeout(room.cleanupTimer);
  startGame(room);
}

// ========== shuffleDeck ==========
function shuffleDeck() {
  const ranks = [1,2,3,4,5,6,7,8,9,10,11,12,13];
  const suits = ['♠','♥','♦','♣'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ========== initCheckersBoard ==========
function initCheckersBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { color: 'black', king: false };
      }
    }
  }
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { color: 'white', king: false };
      }
    }
  }
  return board;
}

// ========== Connect4 Move Handler ==========
function handleConnect4Move(socket, room, role, { col }) {
  if (!Number.isInteger(col) || col < 0 || col > 6) return;
  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;
  if (room.colHeights[col] >= 6) {
    socket.emit('game:move:invalid', { reason: '이미 꽉 찬 열입니다.' });
    return;
  }

  const row = 5 - room.colHeights[col];
  room.board[row][col] = yourColor; // 'white'=red, 'black'=yellow (display mapping in frontend)
  room.colHeights[col]++;
  room.lastMove = { row, col };

  const moveRecord = { col, row, color: yourColor, moveNum: room.moves.length + 1, timestamp: Date.now() };
  room.moves.push(moveRecord);

  const nextColor = yourColor === 'white' ? 'black' : 'white';
  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  io.to(room.id).emit('game:move:made', {
    move:  moveRecord,
    board: room.board,
    colHeights: room.colHeights,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: room.timers.activeColor },
    turn:  nextColor
  });

  if (checkConnect4Win(room.board, row, col, yourColor)) {
    const winCells = getConnect4WinCells(room.board, row, col, yourColor);
    endGame(room, yourColor, 'four-in-a-row', { winCells });
    return;
  }

  if (room.colHeights.every(h => h >= 6)) {
    endGame(room, 'draw', 'board-full');
  }
}

function checkConnect4Win(board, row, col, color) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let i = 1; i <= 3; i++) {
      const r = row + dr*i, c = col + dc*i;
      if (r < 0 || r > 5 || c < 0 || c > 6 || board[r][c] !== color) break;
      count++;
    }
    for (let i = 1; i <= 3; i++) {
      const r = row - dr*i, c = col - dc*i;
      if (r < 0 || r > 5 || c < 0 || c > 6 || board[r][c] !== color) break;
      count++;
    }
    if (count >= 4) return true;
  }
  return false;
}

function getConnect4WinCells(board, row, col, color) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    const cells = [{ row, col }];
    for (let i = 1; i <= 3; i++) {
      const r = row + dr*i, c = col + dc*i;
      if (r < 0 || r > 5 || c < 0 || c > 6 || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    for (let i = 1; i <= 3; i++) {
      const r = row - dr*i, c = col - dc*i;
      if (r < 0 || r > 5 || c < 0 || c > 6 || board[r][c] !== color) break;
      cells.push({ row: r, col: c });
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

// ========== Othello Move Handler ==========
function handleOthelloMove(socket, room, role, { row, col }) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;
  if (row < 0 || row > 7 || col < 0 || col > 7) return;

  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;

  const flipped = getFlippedCells(room.board, row, col, yourColor);
  if (flipped.length === 0) {
    socket.emit('game:move:invalid', { reason: '유효하지 않은 수입니다.' });
    return;
  }

  room.board[row][col] = yourColor;
  for (const { r, c } of flipped) {
    room.board[r][c] = yourColor;
  }
  room.lastMove = { row, col };

  const moveRecord = { row, col, color: yourColor, flipped, moveNum: room.moves.length + 1, timestamp: Date.now() };
  room.moves.push(moveRecord);

  const oppColor = yourColor === 'white' ? 'black' : 'white';
  const oppValid = computeValidMoves(room.board, oppColor);
  const myValid  = computeValidMoves(room.board, yourColor);

  let nextColor, pass = false;
  if (oppValid.length > 0) {
    nextColor = oppColor;
    room.consecutivePasses = 0;
  } else if (myValid.length > 0) {
    nextColor = yourColor;
    room.consecutivePasses++;
    pass = true;
  } else {
    // 양쪽 다 수 없음 → 종료
    room.consecutivePasses++;
    const counts = countStones(room.board);
    let winner;
    if (counts.white > counts.black) winner = 'white';
    else if (counts.black > counts.white) winner = 'black';
    else winner = 'draw';

    room.currentTurn        = null;
    room.timers.activeColor = null;

    io.to(room.id).emit('game:move:made', {
      move:       moveRecord,
      board:      room.board,
      validMoves: [],
      timers:     { white: room.timers.white, black: room.timers.black, activeColor: null },
      turn:       null,
      scores:     counts,
      pass:       false
    });

    endGame(room, winner, 'board-full', { scores: counts });
    return;
  }

  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  const nextValid = nextColor === oppColor ? oppValid : myValid;

  io.to(room.id).emit('game:move:made', {
    move:       moveRecord,
    board:      room.board,
    validMoves: nextValid,
    timers:     { white: room.timers.white, black: room.timers.black, activeColor: nextColor },
    turn:       nextColor,
    scores:     countStones(room.board),
    pass
  });
}

function getFlippedCells(board, row, col, color) {
  if (board[row][col] !== null) return [];
  const opp = color === 'white' ? 'black' : 'white';
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const result = [];
  for (const [dr, dc] of dirs) {
    const line = [];
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === opp) {
      line.push({ r, c });
      r += dr; c += dc;
    }
    if (line.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === color) {
      result.push(...line);
    }
  }
  return result;
}

function computeValidMoves(board, color) {
  const moves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === null && getFlippedCells(board, row, col, color).length > 0) {
        moves.push({ row, col });
      }
    }
  }
  return moves;
}

function countStones(board) {
  let white = 0, black = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 'white') white++;
      else if (cell === 'black') black++;
    }
  }
  return { white, black };
}

// ========== Checkers Move Handler ==========
function handleCheckersMove(socket, room, role, { from, to }) {
  if (!from || !to) return;
  const fr = parseInt(from.row), fc = parseInt(from.col);
  const tr = parseInt(to.row),   tc = parseInt(to.col);
  if (isNaN(fr)||isNaN(fc)||isNaN(tr)||isNaN(tc)) return;
  if (fr<0||fr>7||fc<0||fc>7||tr<0||tr>7||tc<0||tc>7) return;

  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;

  // mustJump 체크
  if (room.mustJump && (room.mustJump.row !== fr || room.mustJump.col !== fc)) {
    socket.emit('game:move:invalid', { reason: '연속 점프 중입니다.' });
    return;
  }

  const piece = room.board[fr][fc];
  if (!piece || piece.color !== yourColor) return;

  // 강제 점프 여부
  const boardHasJumps = hasCheckersJumps(room.board, yourColor);

  // 이 말의 유효 이동 목록
  const validMoves = getValidCheckersMovesForPiece(room.board, fr, fc, piece, boardHasJumps);
  const move = validMoves.find(m => m.to.row === tr && m.to.col === tc);

  if (!move) {
    socket.emit('game:move:invalid', { reason: '유효하지 않은 수입니다.' });
    return;
  }

  // 이동 적용
  room.board[tr][tc] = piece;
  room.board[fr][fc] = null;

  let captured = null;
  if (move.isJump) {
    const capRow = (fr + tr) / 2;
    const capCol = (fc + tc) / 2;
    captured = { row: capRow, col: capCol };
    room.board[capRow][capCol] = null;
  }

  // 킹 승격
  let promoted = false;
  if (!piece.king && ((yourColor === 'white' && tr === 0) || (yourColor === 'black' && tr === 7))) {
    piece.king = true;
    promoted = true;
  }

  // 연속 점프 체크
  let mustJump = null;
  if (move.isJump && !promoted) {
    const moreJumps = getJumpCheckersMovesForPiece(room.board, tr, tc, piece);
    if (moreJumps.length > 0) {
      mustJump = { row: tr, col: tc };
    }
  }

  const moveRecord = {
    from:     { row: fr, col: fc },
    to:       { row: tr, col: tc },
    captured,
    promoted,
    color:    yourColor,
    moveNum:  room.moves.length + 1,
    timestamp: Date.now()
  };
  room.moves.push(moveRecord);
  room.lastMove = { row: tr, col: tc };
  room.mustJump = mustJump;

  let nextTurn;
  if (mustJump) {
    nextTurn = yourColor; // 같은 플레이어 계속
  } else {
    nextTurn = yourColor === 'white' ? 'black' : 'white';
    room.currentTurn        = nextTurn;
    room.timers.activeColor = nextTurn;
    room.timers.lastTickAt  = Date.now();
  }

  // 승리 체크
  const oppColor = yourColor === 'white' ? 'black' : 'white';
  const oppPieces = room.board.flat().filter(p => p && p.color === oppColor);
  const oppMoves  = mustJump ? [] : getAllCheckersValidMoves(room.board, oppColor);

  if (oppPieces.length === 0 || (!mustJump && oppMoves.length === 0)) {
    io.to(room.id).emit('game:move:made', {
      move: moveRecord, board: room.board, mustJump: null,
      timers: { white: room.timers.white, black: room.timers.black, activeColor: null },
      turn: nextTurn, validMoves: []
    });
    endGame(room, yourColor, 'no-pieces');
    return;
  }

  // 다음 유효 이동 목록
  const nextValidMoves = mustJump
    ? getValidCheckersMovesForPiece(room.board, tr, tc, piece, true)
    : getAllCheckersValidMoves(room.board, nextTurn);

  io.to(room.id).emit('game:move:made', {
    move: moveRecord,
    board: room.board,
    mustJump,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: room.timers.activeColor },
    turn:  nextTurn,
    validMoves: nextValidMoves
  });
}

function hasCheckersJumps(board, color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color && getJumpCheckersMovesForPiece(board, row, col, piece).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function getJumpCheckersMovesForPiece(board, row, col, piece) {
  const moves = [];
  const opp = piece.color === 'white' ? 'black' : 'white';
  const dirs = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]]
             : piece.color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  for (const [dr, dc] of dirs) {
    const mr = row+dr, mc = col+dc, er = row+2*dr, ec = col+2*dc;
    if (er<0||er>7||ec<0||ec>7) continue;
    const mid = board[mr][mc], end = board[er][ec];
    if (mid && mid.color === opp && !end) {
      moves.push({ to: { row: er, col: ec }, isJump: true });
    }
  }
  return moves;
}

function getSimpleCheckersMovesForPiece(board, row, col, piece) {
  const moves = [];
  const dirs = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]]
             : piece.color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  for (const [dr, dc] of dirs) {
    const tr = row+dr, tc = col+dc;
    if (tr<0||tr>7||tc<0||tc>7) continue;
    if (!board[tr][tc]) moves.push({ to: { row: tr, col: tc }, isJump: false });
  }
  return moves;
}

function getValidCheckersMovesForPiece(board, row, col, piece, forceJump) {
  const jumps = getJumpCheckersMovesForPiece(board, row, col, piece);
  if (forceJump) return jumps;
  if (jumps.length > 0) return jumps;
  return getSimpleCheckersMovesForPiece(board, row, col, piece);
}

function getAllCheckersValidMoves(board, color) {
  const hasJumps = hasCheckersJumps(board, color);
  const moves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        const pm = getValidCheckersMovesForPiece(board, row, col, piece, hasJumps);
        pm.forEach(m => moves.push({ from: { row, col }, ...m }));
      }
    }
  }
  return moves;
}

// ========== Indian Poker ==========
function startIndianPokerRound(room) {
  if (room.status !== 'active') return;
  // 앤티 차감
  if (room.chips.host < room.ante || room.chips.guest < room.ante) {
    // 칩 부족 → 게임 종료
    let winner;
    if (room.chips.host < room.ante && room.chips.guest < room.ante) {
      // 양측 모두 앤티 부족 → 칩 많은 쪽 승리, 동일하면 무승부(null)
      if (room.chips.host > room.chips.guest) winner = 'white';
      else if (room.chips.guest > room.chips.host) winner = 'black';
      else winner = null;
    } else {
      winner = room.chips.host < room.ante ? 'black' : 'white';
    }
    endGame(room, winner, 'chips-depleted');
    return;
  }
  room.chips.host  -= room.ante;
  room.chips.guest -= room.ante;
  room.pot          = room.ante * 2;
  room.bets         = { host: 0, guest: 0 };
  room.raiseCount   = 0;
  room.roundNum++;

  // 덱 소진 시 리셔플
  if (room.deck.length < 2) room.deck = shuffleDeck();

  room.hands.host  = room.deck.pop();
  room.hands.guest = room.deck.pop();
  room.phase = 'bet';
  room.betTurn = 'guest'; // 게스트 먼저

  // 타이머 설정 (베팅 타임: 30초 고정)
  room.timers.white       = 30 * 1000;
  room.timers.black       = 30 * 1000;
  room.timers.activeColor = 'black'; // guest=black
  room.timers.lastTickAt  = Date.now();

  // 각자에게 상대 카드만 전송
  const hostSocketId  = room.players.host.socketId;
  const guestSocketId = room.players.guest.socketId;

  if (hostSocketId)  io.to(hostSocketId).emit('indianpoker:dealt',  { opponentCard: room.hands.guest, pot: room.pot, chips: room.chips, ante: room.ante, roundNum: room.roundNum });
  if (guestSocketId) io.to(guestSocketId).emit('indianpoker:dealt', { opponentCard: room.hands.host,  pot: room.pot, chips: room.chips, ante: room.ante, roundNum: room.roundNum });

  io.to(room.id).emit('indianpoker:bet:turn', { betTurn: 'guest', pot: room.pot, chips: room.chips });
  log(`인디언 포커 라운드 ${room.roundNum} 시작 — 방 ${room.id.slice(0,8)}, pot=${room.pot}`);
}

function handleIndianPokerAction(socket, room, role, { action, amount }) {
  if (room.phase !== 'bet') return;
  if (room.betTurn !== role) {
    if (socket) socket.emit('game:move:invalid', { reason: '아직 당신의 차례가 아닙니다.' });
    return;
  }
  if (!['fold','call','raise'].includes(action)) return;

  const hostSocketId  = room.players.host.socketId;
  const guestSocketId = room.players.guest.socketId;

  if (action === 'fold') {
    // 폴드: 상대가 팟 획득
    const winner = role === 'host' ? 'black' : 'white';
    const winnerRole = role === 'host' ? 'guest' : 'host';
    room.chips[winnerRole] += room.pot;
    room.pot = 0;
    room.phase = 'showdown';

    io.to(room.id).emit('indianpoker:showdown', {
      hostCard:  room.hands.host,
      guestCard: room.hands.guest,
      winner,
      reason: 'fold',
      pot:   0,
      chips: room.chips
    });

    log(`인디언 포커 폴드 — ${role} 폴드, 방 ${room.id.slice(0,8)}`);

    if (room.chips.host <= 0 || room.chips.guest <= 0) {
      setTimeout(() => endGame(room, room.chips.host <= 0 ? 'black' : 'white', 'chips-depleted'), 3000);
    } else {
      setTimeout(() => startIndianPokerRound(room), 4000);
    }
    return;
  }

  if (action === 'raise') {
    if (room.raiseCount >= 3) {
      // 최대 raise 초과 → 자동 call
      action = 'call';
    } else {
      const raiseAmount = 5; // 고정 레이즈
      if (room.chips[role] < raiseAmount) {
        if (socket) socket.emit('game:move:invalid', { reason: '칩이 부족합니다.' });
        return;
      }
      room.chips[role] -= raiseAmount;
      room.bets[role]  += raiseAmount;
      room.pot         += raiseAmount;
      room.raiseCount++;

      const nextBetTurn = role === 'host' ? 'guest' : 'host';
      room.betTurn = nextBetTurn;

      // 타이머 리셋 — 상대 차례
      const nextTimerColor = nextBetTurn === 'host' ? 'white' : 'black';
      room.timers.activeColor = nextTimerColor;
      room.timers[nextTimerColor] = 30 * 1000;
      room.timers.lastTickAt = Date.now();

      io.to(room.id).emit('indianpoker:bet:turn', { betTurn: nextBetTurn, pot: room.pot, chips: room.chips, lastAction: { role, action: 'raise', amount: raiseAmount } });
      return;
    }
  }

  if (action === 'call') {
    // call: 베팅 차이 맞추기
    const myBet   = room.bets[role];
    const oppRole = role === 'host' ? 'guest' : 'host';
    const oppBet  = room.bets[oppRole];
    const diff    = oppBet - myBet;
    if (diff > 0) {
      if (room.chips[role] < diff) {
        // 올인
        const allIn = room.chips[role];
        room.chips[role] -= allIn;
        room.bets[role]  += allIn;
        room.pot         += allIn;
      } else {
        room.chips[role] -= diff;
        room.bets[role]  += diff;
        room.pot         += diff;
      }
    }

    // showdown: 두 플레이어가 같은 베팅 = 진행
    // 게스트가 call했으면 → 호스트도 action 필요 (호스트 차례)
    // 호스트가 call했으면 → showdown
    if (role === 'guest') {
      room.betTurn = 'host';
      const nextTimerColor = 'white';
      room.timers.activeColor = nextTimerColor;
      room.timers[nextTimerColor] = 30 * 1000;
      room.timers.lastTickAt = Date.now();
      io.to(room.id).emit('indianpoker:bet:turn', { betTurn: 'host', pot: room.pot, chips: room.chips, lastAction: { role, action: 'call' } });
    } else {
      // 호스트 call → showdown
      doShowdown(room);
    }
  }
}

function doShowdown(room) {
  room.phase = 'showdown';
  room.timers.activeColor = null;
  room.timers.lastTickAt  = null;

  const hCard = room.hands.host;
  const gCard = room.hands.guest;
  let winner, reason = 'showdown';

  if (hCard.rank > gCard.rank) {
    winner = 'white'; // host wins
    room.chips.host += room.pot;
  } else if (gCard.rank > hCard.rank) {
    winner = 'black'; // guest wins
    room.chips.guest += room.pot;
  } else {
    // 같으면 호스트 승 (이마에 대는 게임 특성: 이마에 있는 자기 카드 더 잘 보이는 사람)
    winner = 'white';
    room.chips.host += room.pot;
  }
  room.pot = 0;

  const moveRecord = {
    hostCard: hCard, guestCard: gCard, winner,
    chips: { ...room.chips }, roundNum: room.roundNum,
    timestamp: Date.now()
  };
  room.moves.push(moveRecord);

  io.to(room.id).emit('indianpoker:showdown', {
    hostCard: hCard, guestCard: gCard, winner, reason,
    pot: 0, chips: room.chips, roundNum: room.roundNum
  });

  log(`인디언 포커 쇼다운 — host:${hCard.rank} vs guest:${gCard.rank}, 승자:${winner}, 방 ${room.id.slice(0,8)}`);

  if (room.chips.host <= 0 || room.chips.guest <= 0) {
    setTimeout(() => endGame(room, room.chips.host <= 0 ? 'black' : 'white', 'chips-depleted'), 3000);
  } else {
    setTimeout(() => startIndianPokerRound(room), 4000);
  }
}

// ========== Graceful Shutdown ==========
function gracefulShutdown(signal) {
  log(`${signal} 수신 — 서버를 안전하게 종료합니다...`);
  io.emit('server:shutdown', { message: '서버가 종료됩니다.' });
  server.close(() => {
    try { fs.unlinkSync(KEY_FILE); } catch (_) {}
    log('서버 종료 완료');
    process.exit(0);
  });
  // 5초 내 강제 종료
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ========== LAN IP 감지 ==========
function getLanIp() {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

// ========== 서버 시작 ==========
const PORT       = process.env.PORT       || 3000;
const TUNNEL_URL = process.env.TUNNEL_URL || null;

server.listen(PORT, () => {
  const lanIp = getLanIp();
  console.log('');
  console.log('========================================');
  console.log('       게임 플랫폼 서버 실행 중');
  console.log('========================================');
  console.log(`  로컬:   http://localhost:${PORT}`);
  if (lanIp) {
    console.log(`  LAN:    http://${lanIp}:${PORT}`);
  }
  if (TUNNEL_URL) {
    console.log('');
    console.log(`  공개:   ${TUNNEL_URL}`);
    console.log('  ↑ 이 주소를 카카오톡으로 공유하세요 (어디서든 접속 가능)');
  } else {
    if (lanIp) console.log('  ↑ 같은 WiFi에서만 접속 가능 (외부 공개는 start-public.bat)');
  }
  console.log('========================================');
  console.log('  종료: Ctrl+C 또는 stop.bat 실행');
  console.log('========================================');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[!] 포트 ${PORT}가 이미 사용 중입니다.`);
    console.error('    stop.bat을 실행하여 기존 서버를 종료한 후 다시 시도하세요.\n');
  } else {
    console.error('[!] 서버 오류:', err.message);
  }
  process.exit(1);
});
