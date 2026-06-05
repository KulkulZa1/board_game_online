// 뱀파이어 서바이버 — 사운드 모듈 (경량 Web Audio 절차적 효과음)
// game.js 보다 먼저 로드되어 window.VPS.SFX 싱글톤으로 노출된다.
// 사용자 제스처(시작 버튼)에서 init() 호출로 AudioContext 생성. M키로 음소거 토글.
(function () {
  'use strict';
  window.VPS = window.VPS || {};

  window.VPS.SFX = (() => {
    let actx = null;
    let muted = false;
    let lastPickup = 0, lastHurt = 0;
    try { muted = localStorage.getItem('vps_muted') === '1'; } catch (_) {}
    function ensure() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { try { actx = new AC(); } catch (_) {} }
      }
      if (actx && actx.state === 'suspended') actx.resume();
      return actx;
    }
    function tone(freq, dur, type, gain, slideTo) {
      if (muted) return;
      const ac = ensure(); if (!ac) return;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(gain || 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + dur);
    }
    return {
      init() { ensure(); },
      toggleMute() {
        muted = !muted;
        try { localStorage.setItem('vps_muted', muted ? '1' : '0'); } catch (_) {}
        return muted;
      },
      isMuted() { return muted; },
      crit()    { tone(540, 0.12, 'sawtooth', 0.10, 220); },
      combo()   { tone(880, 0.09, 'square', 0.09, 1320); },
      levelup() { tone(523, 0.12, 'triangle', 0.12, 784); setTimeout(() => tone(784, 0.18, 'triangle', 0.12, 1046), 90); },
      boss()    { tone(110, 0.45, 'sawtooth', 0.16, 55); },
      pickup()  { const n = performance.now(); if (n - lastPickup < 55) return; lastPickup = n; tone(660, 0.05, 'sine', 0.05, 920); },
      hurt()    { const n = performance.now(); if (n - lastHurt < 200) return; lastHurt = n; tone(170, 0.13, 'sawtooth', 0.10, 70); },
      dash()    { tone(420, 0.16, 'sine', 0.07, 120); },
    };
  })();
})();
