// server/state.js — 공유 가변 상태 (모든 모듈이 이 객체를 참조)
const state = {
  io: null,             // Socket.io 서버 인스턴스 (초기화 후 설정)
  rooms: new Map(),     // roomId → RoomState
  arcadeVampireRooms: new Map(), // roomId → lightweight co-op relay state
  tokenMap: new Map(),  // token  → { roomId, role }
  rateLimits: new Map(),// `${socketId}:${type}` → [timestamps]
  shutdownKey: null,    // UUID shutdown key
  tickInterval: null,   // setInterval handle for timer tick
};

module.exports = state;
