(function () {
  'use strict';

  const Sim = window.NeonCascade;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const wrapper = document.getElementById('gameWrapper');
  const overlay = document.getElementById('overlay');
  const overlayIcon = document.getElementById('overlayIcon');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMsg = document.getElementById('overlayMsg');
  const startBtn = document.getElementById('startBtn');
  const scoreEl = document.getElementById('scoreDisplay');
  const highEl = document.getElementById('highDisplay');
  const timeEl = document.getElementById('timeDisplay');
  const waveEl = document.getElementById('waveDisplay');
  const targetEl = document.getElementById('targetDisplay');
  const chargePips = document.getElementById('chargePips');
  const chargeFill = document.getElementById('chargeFill');
  const overdriveLabel = document.getElementById('overdriveLabel');
  const overdriveFill = document.getElementById('overdriveFill');
  const chainBanner = document.getElementById('chainBanner');
  const toast = document.getElementById('toast');
  const smartPulseBtn = document.getElementById('smartPulseBtn');
  const muteBtn = document.getElementById('muteBtn');

  const HIGH_KEY = 'neon_cascade_high_v1';
  const CHAIN_KEY = 'neon_cascade_chain_v1';
  const MUTE_KEY = 'neon_cascade_mute_v1';

  let state = null;
  let running = false;
  let lastTime = 0;
  let animationId = 0;
  let particles = [];
  let floaters = [];
  let shake = 0;
  let toastUntil = 0;
  let highScore = readNumber(HIGH_KEY);
  let recordChain = readNumber(CHAIN_KEY);
  let muted = readNumber(MUTE_KEY) === 1;
  let audioContext = null;

  const stars = Array.from({ length: 72 }, (_, index) => ({
    x: (index * 97 % Sim.WIDTH) + (index % 3) * 7,
    y: (index * 173 % Sim.HEIGHT),
    radius: 0.5 + (index % 4) * 0.35,
    alpha: 0.12 + (index % 5) * 0.05,
  }));

  for (let i = 0; i < Sim.MAX_CHARGES; i++) {
    const pip = document.createElement('span');
    pip.className = 'charge-pip';
    chargePips.appendChild(pip);
  }
  highEl.textContent = formatScore(highScore);
  muteBtn.textContent = muted ? '🔇' : '🔊';

  function readNumber(key) {
    try { return Number(localStorage.getItem(key) || 0) || 0; } catch (_) { return 0; }
  }

  function saveNumber(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }

  function startGame() {
    state = Sim.createState(Date.now());
    particles = [];
    floaters = [];
    shake = 0;
    running = true;
    lastTime = performance.now();
    overlay.classList.remove('visible');
    Sound.resume();
    if (window.AdMobHelper) AdMobHelper.init();
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
    canvas.focus();
  }

  function loop(timestamp) {
    if (!running || !state) return;
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastTime) / 1000));
    lastTime = timestamp;
    Sim.step(state, dt);
    updateFx(dt);
    consumeEvents();
    renderHud(timestamp);
    draw(timestamp);
    if (state.ended) {
      finishGame();
      return;
    }
    animationId = requestAnimationFrame(loop);
  }

  function pulseAt(x, y) {
    if (!running || !state) return;
    if (!Sim.pulse(state, x, y)) {
      showToast('펄스 충전 중');
      Sound.empty();
      vibrate(18);
      return;
    }
    Sound.pulse();
    vibrate(12);
  }

  function autoPulse() {
    if (!running || !state) return;
    const target = Sim.bestPulseTarget(state);
    pulseAt(target.x, target.y);
  }

  function consumeEvents() {
    for (const event of Sim.drainEvents(state)) {
      if (event.type === 'hit') handleHit(event);
      if (event.type === 'wave') {
        showBanner(`WAVE ${event.wave}`, `${event.target} CORE TARGET`);
        Sound.wave();
      }
      if (event.type === 'fever') {
        showBanner('OVERDRIVE', 'SCORE ×3 · PULSE RANGE UP');
        Sound.fever();
        vibrate([30, 35, 30, 55]);
      }
      if (event.type === 'charge') {
        showToast(event.chainReward ? '8연쇄 보너스 · 펄스 +1' : '펄스 재충전');
        Sound.charge();
      }
      if (event.type === 'time') showToast('+2.5초');
      if (event.type === 'chainEnd' && event.chain >= 4) {
        const title = event.chain >= 24 ? 'CATASTROPHIC' : event.chain >= 14 ? 'MEGA CHAIN' : 'CHAIN';
        showBanner(`${title} ×${event.chain}`, event.chain >= 14 ? 'CHARGE FEEDBACK ONLINE' : 'KEEP CASCADING');
      }
    }
  }

  function handleHit(event) {
    const def = Sim.ORB_TYPES[event.orbType];
    const count = Math.min(40, 10 + event.chain);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * (180 + event.chain * 3);
      particles.push({
        x: event.x,
        y: event.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.45,
        maxLife: 0.9,
        radius: 2 + Math.random() * 4,
        color: def.color,
      });
    }
    floaters.push({ x: event.x, y: event.y, text: `+${formatScore(event.score)}`, life: 0.8, color: def.color });
    shake = Math.min(15, shake + 1.2 + event.chain * 0.12);
    Sound.hit(event.chain, event.orbType);
    if (event.chain === 5 || event.chain === 10 || event.chain === 20 || event.chain === 30) {
      showBanner(`×${event.chain} CHAIN`, event.chain >= 20 ? 'ABSOLUTE CASCADE' : 'SIGNAL AMPLIFIED');
      vibrate(event.chain >= 20 ? [20, 25, 20, 35] : 16);
    }
  }

  function updateFx(dt) {
    shake = Math.max(0, shake - dt * 22);
    particles = particles.filter((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
      return particle.life > 0;
    });
    floaters = floaters.filter((floater) => {
      floater.life -= dt;
      floater.y -= dt * 54;
      return floater.life > 0;
    });
    if (performance.now() > toastUntil) toast.textContent = '';
  }

  function renderHud(timestamp) {
    scoreEl.textContent = formatScore(state.score);
    timeEl.textContent = state.time.toFixed(1);
    waveEl.textContent = `WAVE ${state.wave}`;
    targetEl.textContent = `${Math.min(state.waveHits, state.target)} / ${state.target}`;
    chargePips.querySelectorAll('.charge-pip').forEach((pip, index) => pip.classList.toggle('on', index < state.charges));
    chargeFill.style.width = `${state.charges >= Sim.MAX_CHARGES ? 100 : state.chargeProgress / Sim.RECHARGE_SECONDS * 100}%`;
    const feverActive = state.fever > 0;
    overdriveLabel.textContent = feverActive ? `OVERDRIVE ${state.fever.toFixed(1)}` : 'OVERDRIVE';
    overdriveLabel.classList.toggle('active', feverActive);
    overdriveFill.style.width = `${feverActive ? state.fever / 6 * 100 : state.overdrive}%`;
    wrapper.classList.toggle('fever', feverActive);
    smartPulseBtn.disabled = state.charges <= 0;
    if (timestamp && state.time < 8) timeEl.style.color = Math.floor(timestamp / 250) % 2 ? '#ff5d8f' : '#ffd166';
    else timeEl.style.color = '';
  }

  function draw(timestamp) {
    ctx.save();
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(sx, sy);
    drawBackground(timestamp);
    drawOrbs(timestamp);
    drawExplosions();
    drawParticles();
    drawFloaters();
    ctx.restore();
  }

  function drawBackground(timestamp) {
    const gradient = ctx.createLinearGradient(0, 0, 0, Sim.HEIGHT);
    gradient.addColorStop(0, state && state.fever > 0 ? '#161405' : '#06141b');
    gradient.addColorStop(0.55, '#050b10');
    gradient.addColorStop(1, '#071218');
    ctx.fillStyle = gradient;
    ctx.fillRect(-20, -20, Sim.WIDTH + 40, Sim.HEIGHT + 40);

    for (const star of stars) {
      const pulse = 0.75 + Math.sin((timestamp || 0) * 0.0015 + star.x) * 0.25;
      ctx.globalAlpha = star.alpha * pulse;
      ctx.fillStyle = '#d9fbff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(53,242,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= Sim.WIDTH; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Sim.HEIGHT); ctx.stroke();
    }
    for (let y = 0; y <= Sim.HEIGHT; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Sim.WIDTH, y); ctx.stroke();
    }
  }

  function drawOrbs(timestamp) {
    if (!state) return;
    for (const orb of state.orbs) {
      const def = Sim.ORB_TYPES[orb.type];
      const pulse = 1 + Math.sin(orb.phase + (timestamp || 0) * 0.002) * 0.12;
      const radius = orb.radius * pulse;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = orb.type === 'gold' ? 22 : 13;
      ctx.fillStyle = def.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius * 0.68, 0, Math.PI * 2);
      ctx.stroke();

      if (orb.type !== 'core') {
        ctx.fillStyle = '#061015';
        ctx.font = `900 ${Math.max(13, radius)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(orb.type === 'gold' ? '★' : orb.type === 'nova' ? '✦' : '+', orb.x, orb.y + 1);
      }
    }
    ctx.shadowBlur = 0;
  }

  function drawExplosions() {
    if (!state) return;
    for (const explosion of state.explosions) {
      const alpha = Math.max(0, 1 - explosion.age / explosion.duration);
      const color = explosion.source === 'nova' ? '#ff5d8f' : explosion.source === 'pulse' ? '#35f2ff' : '#d9fbff';
      ctx.globalAlpha = alpha * 0.24;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.currentRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = explosion.source === 'pulse' ? 5 : 3;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.currentRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 22px system-ui';
    for (const floater of floaters) {
      ctx.globalAlpha = Math.min(1, floater.life * 2);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.globalAlpha = 1;
  }

  function showBanner(title, subtitle) {
    chainBanner.innerHTML = `${title}<small>${subtitle || ''}</small>`;
    chainBanner.classList.remove('show');
    void chainBanner.offsetWidth;
    chainBanner.classList.add('show');
  }

  function showToast(message) {
    toast.textContent = message;
    toastUntil = performance.now() + 1500;
  }

  function finishGame() {
    running = false;
    cancelAnimationFrame(animationId);
    if (state.score > highScore) {
      highScore = state.score;
      saveNumber(HIGH_KEY, highScore);
      highEl.textContent = formatScore(highScore);
    }
    if (state.bestChain > recordChain) {
      recordChain = state.bestChain;
      saveNumber(CHAIN_KEY, recordChain);
    }
    overlayIcon.textContent = state.score >= highScore && state.score > 0 ? '🏆' : '⚛';
    overlayTitle.textContent = `WAVE ${state.wave} 종료`;
    overlayMsg.textContent = `점수 ${formatScore(state.score)} · 최고 연쇄 ×${state.bestChain} · 기록 연쇄 ×${recordChain}`;
    startBtn.textContent = '다시 점화';
    overlay.classList.add('visible');
    smartPulseBtn.disabled = true;
    Sound.end();
    if (window.AdMobHelper && state.score > 0) AdMobHelper.showAfterGame();
  }

  function formatScore(value) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(Math.round(value));
  }

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
  }

  const Sound = (() => {
    function context() {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      return audioContext;
    }

    function tone(frequency, duration, type, volume, delay) {
      if (muted) return;
      try {
        const audio = context();
        const start = audio.currentTime + (delay || 0);
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.type = type || 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(volume || 0.08, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        oscillator.start(start);
        oscillator.stop(start + duration);
      } catch (_) {}
    }

    return {
      resume() { try { const audio = context(); if (audio.state === 'suspended') audio.resume(); } catch (_) {} },
      pulse() { tone(150, 0.16, 'sine', 0.16); tone(420, 0.1, 'triangle', 0.08, 0.05); },
      empty() { tone(90, 0.08, 'square', 0.07); },
      hit(chain, orbType) {
        const base = orbType === 'gold' ? 880 : orbType === 'nova' ? 330 : orbType === 'time' ? 660 : 420;
        tone(base + Math.min(chain, 24) * 18, 0.09, orbType === 'nova' ? 'sawtooth' : 'sine', 0.055);
      },
      charge() { tone(660, 0.12, 'triangle', 0.08); tone(990, 0.16, 'triangle', 0.07, 0.08); },
      wave() { [330, 440, 660].forEach((frequency, index) => tone(frequency, 0.2, 'triangle', 0.08, index * 0.07)); },
      fever() { [523, 659, 784, 1047, 1319].forEach((frequency, index) => tone(frequency, 0.32, 'sawtooth', 0.09, index * 0.06)); },
      end() { [440, 330, 220].forEach((frequency, index) => tone(frequency, 0.28, 'triangle', 0.08, index * 0.12)); },
    };
  })();

  canvas.addEventListener('pointerdown', (event) => {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * Sim.WIDTH;
    const y = (event.clientY - rect.top) / rect.height * Sim.HEIGHT;
    pulseAt(x, y);
    event.preventDefault();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !running) {
      startGame();
      event.preventDefault();
      return;
    }
    if ((event.key === ' ' || event.key === 'Enter') && running) {
      autoPulse();
      event.preventDefault();
    }
  });

  startBtn.addEventListener('click', startGame);
  smartPulseBtn.addEventListener('click', autoPulse);
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    saveNumber(MUTE_KEY, muted ? 1 : 0);
    muteBtn.textContent = muted ? '🔇' : '🔊';
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastTime = performance.now();
  });

  state = Sim.createState(20260710);
  Sim.drainEvents(state);
  renderHud(0);
  draw(0);
  smartPulseBtn.disabled = true;
})();
