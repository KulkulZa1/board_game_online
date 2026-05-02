// server/index.js — Express + Socket.io 초기화, 라우트/이벤트 등록, 서버 시작
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { networkInterfaces } = require('os');

const state = require('./state');
const { log } = require('./utils');
const { registerRoutes, gracefulShutdown } = require('./routes');
const { registerEvents } = require('./events');
const { startTimerTick, startRateLimitCleanup } = require('./timers');

const app = express();
const server = http.createServer(app);

// ========== CORS ==========
// ALLOWED_ORIGINS 환경변수로 허용 도메인 제한 가능 (쉼표 구분)
// 미설정 시 전체 허용 (Cloudflare Tunnel / Render.com 자동 URL 대응)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : '*';
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] }
});

// state.io 에 Socket.io 인스턴스 주입
state.io = io;

app.use(express.json());
// TWA assetlinks.json — Play Store 도메인 연결 필수 (Content-Type: application/json)
app.use('/.well-known', express.static(
  path.join(__dirname, '..', 'public/.well-known'),
  { setHeaders: (res) => res.set('Content-Type', 'application/json') }
));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Cloudflare Tunnel 경유 시 실제 클라이언트 IP를 X-Forwarded-For / CF-Connecting-IP 로 전달
// trust proxy 활성화로 req.ip 가 실제 IP를 반환
app.set('trust proxy', true);

// ========== 서버 시작 시각 ==========
const SERVER_START_TIME = Date.now();

// ========== 서버 셧다운 키 ==========
const SHUTDOWN_KEY = uuidv4();
state.shutdownKey = SHUTDOWN_KEY;
const KEY_FILE = path.join(__dirname, '..', '.shutdown-key');
fs.writeFileSync(KEY_FILE, SHUTDOWN_KEY, { encoding: 'utf8', mode: 0o600 });

// ========== 포트 / 터널 URL ==========
const PORT       = process.env.PORT       || 3000;
const TUNNEL_URL = process.env.TUNNEL_URL || null;

// ========== 라우트 등록 ==========
registerRoutes(app, server, PORT, TUNNEL_URL, SERVER_START_TIME);

// ========== 소켓 이벤트 등록 ==========
registerEvents(io);

// ========== 타이머 틱 시작 ==========
startTimerTick();
startRateLimitCleanup();

// ========== 종료 시그널 ==========
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
process.on('SIGINT',  () => gracefulShutdown('SIGINT',  server));

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
