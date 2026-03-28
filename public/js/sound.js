// sound.js — Web Audio API sound engine (no external files needed)
window.Sound = (function () {
  let ctx = null;
  let masterGain = null;
  let _muted = false;
  let _volume = 0.7;

  function ensureCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = _muted ? 0 : _volume;
        masterGain.connect(ctx.destination);
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type, gainVal, startDelay) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime + (startDelay || 0);
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainVal || 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  function noise(duration, gainVal, startDelay) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime + (startDelay || 0);
    const size   = Math.floor(c.sampleRate * duration);
    const buf    = c.createBuffer(1, size, c.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src  = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainVal || 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(gain);
    gain.connect(masterGain);
    src.start(now);
  }

  // ── Sound definitions ──────────────────────────────────────────────────────
  const sounds = {
    move: () => {
      tone(440, 0.07, 'square', 0.12);
    },
    capture: () => {
      tone(220, 0.10, 'sawtooth', 0.18);
      noise(0.07, 0.10);
    },
    check: () => {
      tone(660, 0.10, 'sine', 0.22);
      tone(880, 0.14, 'sine', 0.22, 0.12);
    },
    win: () => {
      // C-E-G ascending
      tone(523, 0.14, 'sine', 0.28);
      tone(659, 0.14, 'sine', 0.28, 0.18);
      tone(784, 0.30, 'sine', 0.28, 0.36);
    },
    lose: () => {
      tone(392, 0.18, 'sine', 0.22);
      tone(311, 0.30, 'sine', 0.22, 0.22);
    },
    draw: () => {
      tone(440, 0.14, 'sine', 0.20);
      tone(440, 0.14, 'sine', 0.20, 0.22);
    },
    notify: () => {
      tone(880, 0.09, 'sine', 0.18);
      tone(1100, 0.12, 'sine', 0.15, 0.10);
    },
    chat: () => {
      tone(660, 0.06, 'sine', 0.12);
    }
  };

  function play(name) {
    if (_muted) return;
    const fn = sounds[name];
    if (!fn) return;
    try { fn(); } catch (e) { /* ignore audio errors */ }
  }

  function setVolume(val) {
    _volume = Math.max(0, Math.min(1, val / 100));
    if (masterGain && !_muted) masterGain.gain.value = _volume;
    localStorage.setItem('chess_sound_vol', String(Math.round(val)));
  }

  function setMuted(val) {
    _muted = !!val;
    if (masterGain) masterGain.gain.value = _muted ? 0 : _volume;
    localStorage.setItem('chess_sound_muted', _muted ? '1' : '0');
  }

  // Load persisted settings
  (function loadSettings() {
    const savedVol   = localStorage.getItem('chess_sound_vol');
    const savedMuted = localStorage.getItem('chess_sound_muted');
    if (savedVol   !== null) _volume = Math.max(0, Math.min(100, parseInt(savedVol))) / 100;
    if (savedMuted !== null) _muted  = savedMuted === '1';
  })();

  return {
    play,
    setVolume,
    setMuted,
    get muted()  { return _muted; },
    get volume() { return Math.round(_volume * 100); }
  };
})();
