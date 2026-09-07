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
  const ampOverlay = document.getElementById('ampOverlay');
  const ampCards = document.getElementById('ampCards');
  const ampSub = document.getElementById('ampSub');
  const ampTray = document.getElementById('ampTray');
  const ampBanner = document.getElementById('ampBanner');

  // 증폭기 상한(4장)은 사라졌다. 이제 빌드를 멈추는 건 상한이 아니라 '사슬'이다 —
  // 라운드마다 할당량이 있고 못 채우면 끝난다. 상한이 아니라 실패가 빌드를 끝낸다.
  let run = null;

  function ownedList() { return run ? run.owned : []; }

  function renderAmpTray() {
    if (!ampTray) return;
    ampTray.innerHTML = ownedList().map((id) => {
      const d = Sim.ampDef(id);
      if (!d) return '';
      const fused = Sim.AMP_FUSIONS.some((f) => f.id === id);
      return `<span class="amp-chip${fused ? ' fused' : ''}${d.kind === 'cursed' ? ' curse' : ''}" title="${d.name} — ${d.desc}">${d.icon}</span>`;
    }).join('');
  }

  function showAmpBanner(item) {
    if (!ampBanner) return;
    ampBanner.innerHTML = `<div class="amp-inner"><span class="amp-icon">${item.icon}</span>` +
      `<strong>${item.name}</strong><span class="amp-desc">${item.desc}</span></div>`;
    ampBanner.classList.add('show');
    setTimeout(() => ampBanner.classList.remove('show'), 1700);
  }

  // 라운드 전에 증폭기를 고르게 한 뒤 시작한다
  function openAmpDraft(onDone) {
    const offers = Sim.runOffers(run, 3);
    if (!offers.length) { onDone(); return; }
    ampSub.textContent = run.owned.length
      ? `보유 ${run.owned.length}장 — 하나를 더 고르세요`
      : '하나를 골라 이번 라운드를 시작합니다';
    if (ampQuota) {
      ampQuota.innerHTML = `라운드 ${run.round} 할당량 <b>${formatScore(run.quota)}</b>` +
        (run.prestige ? ` · 유산 ×${Sim.legacyMult(run.prestige).toFixed(2)}` : '');
    }
    ampCards.innerHTML = offers.map((o, i) => `
      <button class="amp-card ${o.kind}" data-i="${i}">
        <span class="ac-icon">${o.icon}</span>
        <span class="ac-name">${o.name}</span>
        <span class="ac-desc">${o.desc}</span>
        ${o.kind === 'cursed' ? '<span class="ac-tag curse">저주</span>' : ''}
        ${o.kind === 'rare' ? '<span class="ac-tag rare">희귀</span>' : ''}
        ${o.fusesInto ? `<span class="ac-fuse">⚡ ${o.fusesInto.icon} ${o.fusesInto.name} 완성!</span>` : ''}
      </button>`).join('');
    ampOverlay.classList.add('visible');
    const armed = performance.now() + 320;      // 실수 방지
    ampCards.onclick = (e) => {
      const btn = e.target.closest('.amp-card');
      if (!btn) return;
      if (e.detail !== 0 && performance.now() < armed) return;
      const fused = Sim.takeAmp(run, offers[+btn.dataset.i].id);
      ampOverlay.classList.remove('visible');
      renderAmpTray();
      if (fused) showAmpBanner(fused);
      onDone();
    };
  }
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
  const roundEl = document.getElementById('roundDisplay');
  const cycleEl = document.getElementById('cycleDisplay');
  const quotaEl = document.getElementById('quotaDisplay');
  const quotaFill = document.getElementById('quotaFill');
  const ampQuota = document.getElementById('ampQuota');
  const runStats = document.getElementById('runStats');
  const muteBtn = document.getElementById('muteBtn');

  const DEPTH_KEY = 'neon_cascade_depth_v1';
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
  let bestDepth = readNumber(DEPTH_KEY);
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
    run = Sim.createRun((Date.now() ^ 0x9e3779b9) | 0);
    renderAmpTray();
    renderLadder();
    openAmpDraft(beginRound);
  }

  // 이어가기 — 라운드를 넘겼을 때. 런은 유지하고 드래프트부터 다시.
  function nextRound() {
    renderLadder();
    overlay.classList.remove('visible');
    openAmpDraft(beginRound);
  }

  function renderLadder() {
    if (!run || !roundEl) return;
    roundEl.textContent = `라운드 ${run.round} / ${Sim.ROUNDS_PER_CYCLE}`;
    if (cycleEl) {
      cycleEl.textContent = `환생 ${run.prestige}`;
      cycleEl.classList.toggle('hidden', run.prestige === 0);
    }
  }

  function beginRound() {
    state = Sim.createState((Date.now() ^ run.seed) | 0, run.owned, Sim.legacyMult(run.prestige));
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
    renderQuota(timestamp);
  }

  // 할당량 게이지 — 이 게임에서 유일하게 '지는' 곳이라, 남은 시간과 함께
  // 가장 크게 보여야 한다. 못 채운 채 시간이 줄면 붉게 뛴다.
  function renderQuota(timestamp) {
    if (!run || !quotaFill) return;
    const pct = Math.min(100, state.score / run.quota * 100);
    const met = state.score >= run.quota;
    quotaFill.style.width = `${pct}%`;
    quotaFill.classList.toggle('met', met);
    if (quotaEl) quotaEl.textContent = `${formatScore(state.score)} / ${formatScore(run.quota)}`;
    const danger = !met && state.time < 12;
    quotaFill.classList.toggle('danger', danger);
    if (quotaEl) {
      quotaEl.classList.toggle('met', met);
      quotaEl.classList.toggle('danger', danger && !!timestamp && Math.floor(timestamp / 220) % 2 === 0);
    }
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

  // 라운드가 끝났다 = 시간이 다 됐다. 여기서 할당량을 정산한다.
  // 넘겼으면 다음 라운드, 8라운드를 넘겼으면 환생, 못 채웠으면 런 종료.
  function finishGame() {
    running = false;
    cancelAnimationFrame(animationId);
    smartPulseBtn.disabled = true;

    if (state.score > highScore) {
      highScore = state.score;
      saveNumber(HIGH_KEY, highScore);
      highEl.textContent = formatScore(highScore);
    }
    if (state.bestChain > recordChain) {
      recordChain = state.bestChain;
      saveNumber(CHAIN_KEY, recordChain);
    }

    const res = Sim.settleRound(run, state.score);
    const depth = res.prestige * Sim.ROUNDS_PER_CYCLE + res.round;
    if (depth > bestDepth) { bestDepth = depth; saveNumber(DEPTH_KEY, bestDepth); }
    renderLadder();
    renderQuota(0);

    const line = `${formatScore(res.score)} / ${formatScore(res.quota)}`;
    const legend = document.getElementById('legend');
    if (legend) legend.classList.add('hidden');
    if (runStats) {
      runStats.classList.remove('hidden');
      runStats.innerHTML =
        `<span><b>${line}</b><small>할당량</small></span>` +
        `<span><b>×${state.bestChain}</b><small>최고 연쇄</small></span>` +
        `<span><b>${run.owned.length}장</b><small>증폭기</small></span>` +
        `<span><b>${depth}</b><small>도달 (최고 ${bestDepth})</small></span>`;
    }

    if (res.rebirth) {
      // 환생 — 여기까지 온 건 드문 일이다. 잃는 것과 얻는 것을 분명히 보여준다.
      overlayIcon.textContent = '♾️';
      overlayTitle.textContent = `환생 ${res.prestige}`;
      overlayMsg.innerHTML = `사슬 ${Sim.ROUNDS_PER_CYCLE}라운드를 모두 넘겼습니다. ` +
        `증폭기 <b>전부</b>를 내려놓고 처음으로 돌아가되, 영구 배율 <b>×${Sim.legacyMult(res.prestige).toFixed(2)}</b>를 얻습니다. ` +
        `다음 순환의 할당량은 <b>×${Sim.PRESTIGE_STEP}</b> — 유산보다 가파릅니다.`;
      startBtn.textContent = '♾️ 환생하기';
      startBtn.dataset.act = 'next';
      renderAmpTray();
      Sound.end();
    } else if (res.cleared) {
      overlayIcon.textContent = '✅';
      overlayTitle.textContent = `라운드 ${res.round} 통과`;
      overlayMsg.innerHTML = `할당량 <b>${line}</b> — 다음 라운드 할당량은 <b>${formatScore(run.quota)}</b>입니다.`;
      startBtn.textContent = '▶ 다음 라운드';
      startBtn.dataset.act = 'next';
      Sound.end();
    } else {
      overlayIcon.textContent = '💀';
      overlayTitle.textContent = `라운드 ${res.round} 실패`;
      overlayMsg.innerHTML = `할당량 <b>${line}</b> — ${formatScore(res.quota - res.score)} 모자랍니다.`;
      startBtn.textContent = '다시 점화';
      startBtn.dataset.act = 'restart';
      Sound.end();
      if (window.AdMobHelper && state.score > 0) AdMobHelper.showAfterGame();
    }
    overlay.classList.add('visible');
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

  // 자동화 테스트 훅 — ?debug=1 일 때만. 한 라운드가 실제로 90초라 사슬 전체(8라운드,
  // 환생까지)를 실시간으로 도는 건 브라우저 검증에선 비현실적이다.
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__neon = {
      run: () => run,
      state: () => state ? {
        score: state.score, wave: state.wave, time: state.time,
        charges: state.charges, ended: state.ended,
      } : null,
      ladder: () => run ? {
        round: run.round, prestige: run.prestige, quota: run.quota,
        owned: run.owned.slice(), alive: run.alive, bestDepth: bestDepth,
      } : null,
      // 남은 시간을 깎아 라운드를 즉시 끝낸다 (점수는 그대로 — 통과/실패가 진짜로 갈린다)
      endRound: () => { if (state) state.time = 0; },
      // 할당량을 채운 셈 치고 끝낸다 — 환생 경로 확인용
      forceClear: () => { if (state && run) { state.score = run.quota; state.time = 0; } },
    };
  }

  // 시작 버튼은 상황에 따라 셋을 겸한다: 첫 점화 / 다음 라운드(런 유지) / 재시작
  startBtn.addEventListener('click', () => {
    if (startBtn.dataset.act === 'next' && run && run.alive) { nextRound(); return; }
    if (runStats) runStats.classList.add('hidden');
    startBtn.dataset.act = 'restart';
    startGame();
  });
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
