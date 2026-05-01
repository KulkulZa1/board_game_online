// stats.js — 개인 전적 localStorage 관리
window.Stats = (function () {
  const STORAGE_KEY = 'boardgame_stats';

  const GAME_NAMES = {
    chess:       '♟ 체스',
    omok:        '⬤ 오목',
    connect4:    '🔴 사목',
    othello:     '⬜ 오셀로',
    indianpoker: '🃏 인디언 포커',
    checkers:    '🔴 체커',
    applegame:   '🍎 사과게임',
    battleship:  '🚢 배틀십',
    backgammon:  '🎲 백가몬',
  };

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _defaultStats();
      const parsed = JSON.parse(raw);
      // 새 게임 타입이 추가된 경우 누락 키 보완
      const defaults = _defaultStats();
      for (const k of Object.keys(defaults)) {
        if (!parsed[k]) parsed[k] = defaults[k];
      }
      return parsed;
    } catch (e) {
      return _defaultStats();
    }
  }

  function _defaultStats() {
    const obj = {};
    for (const k of Object.keys(GAME_NAMES)) {
      obj[k] = { wins: 0, losses: 0, draws: 0 };
    }
    return obj;
  }

  function _save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* 저장 실패 무시 */ }
  }

  /**
   * 결과 기록
   * @param {string} gameType - 'chess' | 'omok' | ...
   * @param {string} result   - 'win' | 'loss' | 'draw'
   */
  function record(gameType, result) {
    if (!GAME_NAMES[gameType]) return;
    const data = _load();
    if (result === 'win')       data[gameType].wins++;
    else if (result === 'loss') data[gameType].losses++;
    else if (result === 'draw') data[gameType].draws++;
    _save(data);
  }

  /** 전체 통계 반환 */
  function getAll() {
    return _load();
  }

  /** 전체 초기화 */
  function reset() {
    _save(_defaultStats());
  }

  /** 게임명 레이블 맵 */
  function getGameNames() {
    return GAME_NAMES;
  }

  return { record, getAll, reset, getGameNames };
})();
