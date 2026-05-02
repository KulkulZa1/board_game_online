// server/timers.js — 글로벌 타이머 틱 로직
const state = require('./state');
const { log } = require('./utils');

const TICK_INTERVAL = 500;

function startTimerTick() {
  state.tickInterval = setInterval(() => {
    const now = Date.now();
    for (const [, room] of state.rooms) {
      if (room.status !== 'active') continue;
      if (!room.timers.activeColor) continue;
      if (room.timers.white === null) continue;       // unlimited
      if (room.timers.lastTickAt === null) continue;  // paused (player disconnected)

      const elapsed = now - room.timers.lastTickAt;
      room.timers.lastTickAt = now;

      const color = room.timers.activeColor;
      room.timers[color] = Math.max(0, room.timers[color] - elapsed);

      state.io.to(room.id).emit('timer:tick', {
        white:       room.timers.white,
        black:       room.timers.black,
        activeColor: room.timers.activeColor
      });

      if (room.timers[color] <= 0) {
        if (room.gameType === 'indianpoker') {
          // 베팅 시간 초과 → 자동 call
          const timedOutRole = color === 'white' ? 'host' : 'guest';
          const { handleIndianPokerAction } = require('./handlers/indianpoker');
          handleIndianPokerAction(null, room, timedOutRole, { action: 'call' });
        } else {
          const winner = color === 'white' ? 'black' : 'white';
          const { endGame } = require('./endgame');
          endGame(room, winner, 'timeout');
        }
      }
    }
  }, TICK_INTERVAL);
}

function stopTimerTick() {
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
    state.tickInterval = null;
  }
}

// 1시간마다 오래된 rateLimits 항목 자동 정리 (메모리 누수 방지)
function startRateLimitCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [key, times] of state.rateLimits) {
      const recent = times.filter(t => now - t < 60 * 1000);
      if (recent.length === 0) state.rateLimits.delete(key);
      else state.rateLimits.set(key, recent);
    }
  }, 60 * 60 * 1000);
}

module.exports = { startTimerTick, stopTimerTick, startRateLimitCleanup, TICK_INTERVAL };
