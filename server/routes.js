// server/routes.js — HTTP 라우트 (/api/status, /admin/*)
const state = require('./state');
const { log } = require('./utils');
const { endGame } = require('./endgame');

function gracefulShutdown(signal, server) {
  log(`${signal} 수신 — 서버를 안전하게 종료합니다...`);
  state.io.emit('server:shutdown', { message: '서버가 종료됩니다.' });
  server.close(() => {
    const fs = require('fs');
    const path = require('path');
    const KEY_FILE = path.join(__dirname, '..', '.shutdown-key');
    try { fs.unlinkSync(KEY_FILE); } catch (_) {}
    log('서버 종료 완료');
    process.exit(0);
  });
  // 5초 내 강제 종료
  setTimeout(() => process.exit(1), 5000);
}

function registerRoutes(app, server, PORT, TUNNEL_URL, SERVER_START_TIME) {
  // GET /api/status — 서버 현황 (localhost 접속 시 shutdown 키 포함)
  app.get('/api/status', (req, res) => {
    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const list = [...state.rooms.values()];

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
          host:  { connected: r.players.host.connected  || false },
          guest: { connected: r.players.guest.connected || false },
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
    if (isLocal) data.shutdownKey = state.shutdownKey;
    res.json(data);
  });

  // POST /admin/shutdown — body에 key 전달 (URL 히스토리에 키 노출 방지)
  app.post('/admin/shutdown', (req, res) => {
    if (!req.body || req.body.key !== state.shutdownKey) {
      return res.status(401).json({ error: '잘못된 셧다운 키입니다.' });
    }
    res.json({ message: '서버를 종료합니다.' });
    log('[!] 관리자 명령으로 서버가 종료됩니다...');
    setTimeout(() => gracefulShutdown('ADMIN', server), 200);
  });

  // POST /admin/terminate — 특정 방 게임 강제 종료
  app.post('/admin/terminate', (req, res) => {
    if (!req.body || req.body.key !== state.shutdownKey) {
      return res.status(401).json({ error: '잘못된 셧다운 키입니다.' });
    }
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId 필요' });
    const room = state.rooms.get(roomId);
    if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    if (room.status !== 'active') return res.status(400).json({ error: '진행 중인 게임이 아닙니다.' });
    endGame(room, 'draw', 'admin');
    log(`[관리자] 방 ${roomId.slice(0,8)} 강제 종료`);
    res.json({ message: '게임이 강제 종료되었습니다.' });
  });
}

module.exports = { registerRoutes, gracefulShutdown };
