// timer.js — Clock display with client-side interpolation
window.Timer = (function () {
  let _white = null, _black = null, _activeColor = null;
  let _myColor = null, _isUnlimited = false;
  let _syncedAt = null;  // performance.now() at last server tick
  let _rafId = null;

  function formatTime(ms) {
    if (ms === null || ms === undefined) return '∞';
    if (ms <= 0) return '0:00';

    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    // Show tenths when under 60 seconds
    if (totalSec < 60) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${s}.${tenths}`;
    }
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  // Called on every server timer:tick event
  function update(timers, myColor, isUnlimited) {
    _white      = timers.white;
    _black      = timers.black;
    _activeColor = timers.activeColor;
    _myColor    = myColor;
    _isUnlimited = isUnlimited;
    _syncedAt   = performance.now();
    render(); // Immediate render on server tick
  }

  function render() {
    if (!_myColor) return;

    const myEl  = document.getElementById('my-timer');
    const oppEl = document.getElementById('opponent-timer');
    const myBar  = document.getElementById('my-bar');
    const oppBar = document.getElementById('opponent-bar');

    if (_isUnlimited) {
      myEl.textContent  = '∞';
      oppEl.textContent = '∞';
      myBar.classList.toggle('active-turn',  _activeColor === _myColor);
      oppBar.classList.toggle('active-turn', _activeColor !== _myColor);
      return;
    }

    const opponentColor = _myColor === 'white' ? 'black' : 'white';
    const elapsed = _syncedAt !== null ? performance.now() - _syncedAt : 0;

    // Interpolate only the currently active color
    const whiteMs = _white !== null
      ? Math.max(0, _white - (_activeColor === 'white' ? elapsed : 0))
      : null;
    const blackMs = _black !== null
      ? Math.max(0, _black - (_activeColor === 'black' ? elapsed : 0))
      : null;

    const myMs  = _myColor === 'white' ? whiteMs : blackMs;
    const oppMs = _myColor === 'white' ? blackMs : whiteMs;

    myEl.textContent  = formatTime(myMs);
    oppEl.textContent = formatTime(oppMs);

    myEl.classList.toggle('critical',  myMs  !== null && myMs  < 10000);
    oppEl.classList.toggle('critical', oppMs !== null && oppMs < 10000);

    myBar.classList.toggle('active-turn',  _activeColor === _myColor);
    oppBar.classList.toggle('active-turn', _activeColor === opponentColor);
  }

  // Start continuous interpolation loop (call when game is active)
  function startLoop() {
    if (_rafId) return;
    function tick() {
      if (!_isUnlimited && _activeColor) render();
      _rafId = requestAnimationFrame(tick);
    }
    _rafId = requestAnimationFrame(tick);
  }

  // Stop loop (call on game over or disconnect)
  function stopLoop() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  return { update, formatTime, startLoop, stopLoop };
})();
