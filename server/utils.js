// server/utils.js — 순수 헬퍼 함수
const state = require('./state');

// ========== 로그 ==========
function log(msg) {
  const ts = new Date().toLocaleTimeString('ko-KR');
  console.log(`[${ts}] ${msg}`);
}

// ========== 레이트 리밋 ==========
function rateCheck(socketId, type, limit, windowMs) {
  const now = Date.now();
  const key = `${socketId}:${type}`;
  const history = state.rateLimits.get(key) || [];
  const recent = history.filter(t => now - t < windowMs);
  if (recent.length >= limit) return false;
  state.rateLimits.set(key, [...recent, now]);
  return true;
}

function cleanRateLimit(socketId) {
  for (const key of state.rateLimits.keys()) {
    if (key.startsWith(socketId + ':')) state.rateLimits.delete(key);
  }
}

// ========== 타이머 헬퍼 ==========
function getTimerMs(timeControl) {
  if (!timeControl.minutes) return null;
  return timeControl.minutes * 60 * 1000;
}

// ========== 역할/색상 헬퍼 ==========
function getRoleColor(room, role) {
  return role === 'host' ? room.hostColor : room.guestColor;
}

function getOpponentRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

// ========== 방 조회 ==========
function getRoomBySocketId(socketId) {
  for (const [, room] of state.rooms) {
    if (room.players.host.socketId  === socketId) return { room, role: 'host' };
    if (room.players.guest.socketId === socketId) return { room, role: 'guest' };
  }
  return null;
}

function getSpectatorBySocketId(socketId) {
  for (const [, room] of state.rooms) {
    if (room.spectators.has(socketId)) {
      return { room, spectator: room.spectators.get(socketId) };
    }
  }
  return null;
}

module.exports = {
  log,
  rateCheck,
  cleanRateLimit,
  getTimerMs,
  getRoleColor,
  getOpponentRole,
  getRoomBySocketId,
  getSpectatorBySocketId,
};
