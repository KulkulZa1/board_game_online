// guest.js — UUID 기반 게스트 프로필 (localStorage, 30일 비활동 시 초기화)
window.Guest = (function () {
  const ID_KEY       = 'guest_uuid';
  const NAME_KEY     = 'guest_nickname';
  const ACTIVE_KEY   = 'guest_last_active';
  const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000; // 30일

  function _uuidv4() {
    return 'xxxxxxxx'.replace(/x/g, () =>
      (Math.random() * 16 | 0).toString(16)
    );
  }

  function _check30DayReset() {
    const last = parseInt(localStorage.getItem(ACTIVE_KEY) || '0', 10);
    if (last && Date.now() - last > INACTIVITY_MS) {
      localStorage.removeItem(ID_KEY);
      localStorage.removeItem(NAME_KEY);
      if (typeof Stats !== 'undefined') Stats.reset();
    }
  }

  function _ensureId() {
    _check30DayReset();
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = 'guest_' + _uuidv4();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  }

  function getId() {
    return _ensureId();
  }

  function getShortId() {
    const id = _ensureId();
    return id.slice(-4).toUpperCase();
  }

  function getName() {
    return localStorage.getItem(NAME_KEY) || ('게스트#' + getShortId());
  }

  function setName(name) {
    const trimmed = (name || '').trim().slice(0, 16);
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
  }

  function updateActive() {
    localStorage.setItem(ACTIVE_KEY, String(Date.now()));
  }

  // 초기화 시 활동 시각 갱신
  updateActive();

  return { getId, getName, setName, updateActive, getShortId };
})();
