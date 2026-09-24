// 찰나 (CHALNA) — 렌더링·입력·소리. 규칙은 전부 sim.js (ChalnaSim) 에 있다.
(function () {
  'use strict';

  const Sim = window.ChalnaSim;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const wrapper = document.getElementById('gameWrapper');
  const overlay = document.getElementById('overlay');
  const $ = (id) => document.getElementById(id);

  // ── 저장 ──────────────────────────────────────────────────────
  const KEY_HIGH = 'arcade_chalna_high', KEY_TRIES = 'arcade_chalna_tries', KEY_MUTE = 'arcade_chalna_mute';
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (_) {} };
  let high = parseInt(load(KEY_HIGH, '0'), 10) || 0;
  let tries = parseInt(load(KEY_TRIES, '0'), 10) || 0;
  let muted = load(KEY_MUTE, '0') === '1';
  $('highDisplay').textContent = high;
  $('triesDisplay').textContent = tries;
  $('muteBtn').textContent = muted ? '🔇' : '🔊';

  // ── 상태 ──────────────────────────────────────────────────────
  let s = null;                 // 시뮬 상태
  let mode = 'menu';            // menu | playing | dead
  let lastStep = 0;             // 시뮬이 진행된 시각 (ms)
  let deadAt = 0;
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 0;
  let shake = 0, flash = 0, flashColor = '255,255,255', pulse = 0, hue = 0;
  let particles = [], floaters = [], trail = [];
  let announced = {};

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = wrapper.clientWidth; H = wrapper.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    cx = W / 2; cy = H / 2 + 10;
    R = Math.min(W, H) * 0.34;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── 소리 (WebAudio 합성 — 파일 없음) ──────────────────────────
  let ac = null;
  function audio() {
    if (muted) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    const a = audio(); if (!a) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), g = a.createGain();
    g.gain.value = vol; src.buffer = buf; src.connect(g).connect(a.destination); src.start();
  }
  // 콤보가 오를수록 음이 반음씩 올라간다 (두 옥타브에서 다시 감긴다) — 손이 멈추지 않게
  function hitSound(ev) {
    const step = ev.combo % 24;
    const f = 262 * Math.pow(2, step / 12);
    tone(f, 0.12, 'triangle', 0.18);
    if (ev.perfect) { tone(f * 2, 0.16, 'sine', 0.12, 0.01); tone(f * 3, 0.1, 'sine', 0.05, 0.03); }
    if (ev.kind === 'gold') [0, 0.05, 0.1].forEach((w, i) => tone(f * (1.5 + i * 0.5), 0.15, 'square', 0.06, w));
    if (ev.feverStarted) [0, 0.07, 0.14, 0.21].forEach((w, i) => tone(523 * Math.pow(2, i * 4 / 12), 0.22, 'sawtooth', 0.07, w));
  }
  function deathSound(reason) {
    noise(0.35, reason === 'bomb' ? 0.5 : 0.25);
    tone(reason === 'bomb' ? 180 : 220, 0.5, 'sawtooth', 0.15, 0, 45);
  }
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} };

  // ── 효과 ──────────────────────────────────────────────────────
  function burst(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * speed;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color, size: 1.5 + Math.random() * 3 });
    }
  }
  function float(text, color, size, dy) {
    const base = cy + (dy || -R * 0.45);
    // 같은 자리에 아직 떠 있는 글자가 있으면 그 위로 쌓는다 — 연속 PERFECT 가 한 줄로 겹치지 않게
    const stacked = floaters.filter((f) => f.base === base && f.life > 0.4).length;
    floaters.push({ text, color, size, base, y: base - stacked * size * 1.1, life: 1 });
  }
  const pos = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];

  // ── 게임 흐름 ─────────────────────────────────────────────────
  function newRun() {
    s = Sim.createState((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    mode = 'playing';
    particles = []; floaters = []; trail = []; announced = {};
    shake = 0; flash = 0; pulse = 0;
    overlay.classList.remove('visible');
    lastStep = performance.now();
    canvas.focus();
  }

  function press() {
    if (mode === 'menu') { newRun(); return; }
    if (mode === 'dead') {
      if (performance.now() - deadAt < 450) return;   // 죽자마자 연타로 다음 판이 시작되지 않게
      newRun(); return;
    }
    // 누른 '그 순간'까지 시뮬을 당겨서 판정 — 프레임 사이 입력도 정확하게
    const now = performance.now();
    const ev0 = Sim.step(s, (now - lastStep) / 1000);
    lastStep = now;
    if (ev0) { onDeath(ev0); return; }
    const ev = Sim.tap(s);
    if (!ev) return;
    if (ev.type === 'start') { tone(392, 0.08, 'sine', 0.1); return; }
    if (ev.type === 'death') { onDeath(ev); return; }
    onHit(ev);
  }

  function onHit(ev) {
    const [x, y] = pos(s.angle, R);
    const color = ev.kind === 'gold' ? '#ffd23f' : ev.perfect ? '#3dfcff' : '#ffffff';
    hitSound(ev);
    pulse = 1;
    if (ev.perfect) {
      shake = Math.min(14, 5 + ev.combo * 0.15);
      flash = 0.18; flashColor = '61,252,255';
      burst(x, y, 26, color, 5.5);
      float(ev.kind === 'gold' ? `GOLD +${ev.points}` : `PERFECT +${ev.points}`, color, 30);
      buzz(12);
    } else {
      shake = 3;
      burst(x, y, 10, color, 3);
      // 빨랐나 늦었나 — 무엇을 고쳐야 할지 알려 준다
      float(`+${ev.points} · ${ev.offset < 0 ? '빨랐다' : '늦었다'}`, '#c8c2ea', 20);
    }
    if (ev.feverStarted) {
      flash = 0.45; flashColor = '255,79,216';
      float('🔥 FEVER ×2', '#ff4fd8', 40, -R * 0.75);
      burst(cx, cy, 60, '#ff4fd8', 7);
      buzz([20, 30, 20]);
    }
    if (ev.combo > 0 && ev.combo % 10 === 0) float(`${ev.combo} COMBO!`, '#ffd23f', 36, R * 0.55);
    // 새 규칙이 섞이는 순간을 알린다
    const lv = s.level;
    if (lv === Sim.C.BOMB_FROM && !announced.bomb) { announced.bomb = 1; float('💣 폭탄 등장 — 누르지 마!', '#ff2e63', 22, R * 0.8); }
    if (lv === Sim.C.CHAIN_FROM && !announced.chain) { announced.chain = 1; float('🔗 연쇄 호 — 방향 유지!', '#7cf7ff', 22, R * 0.8); }
    if (high > 0 && s.score > high && !announced.best) { announced.best = 1; float('👑 최고 기록 돌파', '#ffd23f', 26, R * 0.95); tone(784, 0.3, 'sine', 0.12); }
  }

  const TAUNTS = {
    miss: ['손가락이 먼저 나갔다', '조급함은 병이다', '그건 과녁이 아니라 허공이다', '너무 빨랐다. 인생처럼.', '눈보다 손이 급했다'],
    passed: ['기다리다 늙었다', '보고만 있었지?', '손가락 어디 갔어?', '망설임은 곧 패배', '점은 기다려 주지 않는다'],
    bomb: ['폭탄은 누르라고 있는 게 아니다', '빨간색 = 위험. 유치원에서 배웠잖아', '펑.', '욕심이 화를 불렀다', '그건 함정이었다'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function onDeath(ev) {
    mode = 'dead'; deadAt = performance.now();
    tries++; save(KEY_TRIES, tries); $('triesDisplay').textContent = tries;
    const [x, y] = pos(s.angle, R);
    burst(x, y, 70, '#ff2e63', 8);
    shake = 22; flash = 0.6; flashColor = '255,46,99';
    deathSound(ev.reason); buzz(ev.reason === 'bomb' ? [60, 40, 120] : 120);

    const prevHigh = high;
    const isBest = s.score > high;
    if (isBest) { high = s.score; save(KEY_HIGH, high); $('highDisplay').textContent = high; }

    let taunt = pick(TAUNTS[ev.reason] || TAUNTS.miss);
    let gapLine = '';
    if (ev.reason === 'miss') {
      // 빗나감은 늘 '너무 일찍' 이다 (지나친 뒤엔 이미 '놓침'으로 끝났다) — 얼마나 아까웠는지 재서 보여 준다
      gapLine = `<div class="gap">${ev.gap.toFixed(3)}초 일렀다</div>`;
      if (ev.gap < 0.04) taunt = `${ev.gap.toFixed(3)}초. 이건 억울하다.`;
    } else if (ev.reason === 'passed') {
      gapLine = '<div class="gap">놓침 — 누르지 않았다</div>';   // gap 은 감지 지연(한 프레임)일 뿐이라 보여 주지 않는다
    } else gapLine = '<div class="gap">💣 폭탄</div>';
    let chase = '';
    if (isBest) chase = prevHigh > 0 ? '<div class="newbest">NEW BEST!</div><div class="dim">…근데 더 할 수 있잖아?</div>' : '<div class="newbest">첫 기록!</div>';
    else if (prevHigh > 0) chase = `<div class="dim">최고까지 <b>${prevHigh - s.score}</b>점. 딱 한 판만 더?</div>`;

    $('deathStats').innerHTML = `
      <div class="big">${s.score}</div>
      ${chase}
      <div class="taunt">${taunt}</div>
      ${gapLine}
      <div class="row"><span>적중</span><b>${s.stats.hits}</b></div>
      <div class="row"><span>PERFECT</span><b>${s.stats.perfects}${s.stats.hits ? ` (${Math.round(s.stats.perfects / s.stats.hits * 100)}%)` : ''}</b></div>
      <div class="row"><span>최대 콤보</span><b>${s.stats.bestCombo}</b></div>
      <div class="row"><span>FEVER</span><b>${s.stats.fevers}회</b></div>`;
    $('deathStats').classList.remove('hidden');
    $('overlayIcon').textContent = ev.reason === 'bomb' ? '💥' : '💀';
    $('overlayTitle').classList.add('hidden');
    $('overlayMsg').classList.add('hidden');
    $('startBtn').textContent = '다시 (Space)';
    $('retryHint').classList.remove('hidden');
    // 폭발이 보이도록 잠깐 뒤에 결과 창
    setTimeout(() => { if (mode === 'dead') overlay.classList.add('visible'); }, 380);
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
  }

  // ── 입력 ──────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
  overlay.addEventListener('pointerdown', (e) => {
    if (mode === 'dead' || e.target === $('startBtn')) { e.preventDefault(); press(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
  });
  $('muteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    muted = !muted; save(KEY_MUTE, muted ? '1' : '0');
    $('muteBtn').textContent = muted ? '🔇' : '🔊';
  });

  // ── 그리기 ────────────────────────────────────────────────────
  function arc(center, width, rad, lw, color, glow) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.beginPath(); ctx.arc(cx, cy, rad, center - width / 2, center + width / 2); ctx.stroke();
    ctx.restore();
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const fever = s && s.fever > 0 && mode === 'playing';
    // 배경
    if (fever) {
      hue = (hue + 3) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
      g.addColorStop(0, `hsl(${hue},80%,16%)`); g.addColorStop(1, '#07060d');
      ctx.fillStyle = g;
    } else ctx.fillStyle = '#07060d';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const ringR = R * (1 + pulse * 0.04);

    // 트랙
    ctx.strokeStyle = fever ? `hsla(${hue},90%,60%,0.25)` : '#1b1630'; ctx.lineWidth = R * 0.1;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();

    if (s) {
      // 폭탄
      const blink = 0.6 + 0.4 * Math.sin(now / 90);
      for (const b of s.bombs) arc(b.center, b.width, ringR, R * 0.13, `rgba(255,46,99,${blink})`, 18);
      // 과녁 + PERFECT 띠
      const t = s.target;
      const col = t.kind === 'gold' ? '#ffd23f' : t.kind === 'chain' ? '#7cf7ff' : '#ffffff';
      arc(t.center, t.width, ringR, R * 0.13, col, 22);
      const pw = Math.max(Sim.C.MIN_PERFECT, t.width * Sim.C.PERFECT_FRAC);
      arc(t.center, pw, ringR, R * 0.17, fever ? `hsl(${(hue + 180) % 360},100%,65%)` : '#3dfcff', 26);
      if (t.kind === 'chain') {   // 방향 유지 표시 — 화살표
        const [ax, ay] = pos(t.center, ringR + R * 0.2);
        ctx.fillStyle = '#7cf7ff'; ctx.font = `${Math.round(R * 0.14)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.dir > 0 ? '↻' : '↺', ax, ay);
      }

      // 점 + 꼬리
      const [dx, dy] = pos(s.angle, ringR);
      trail.push([dx, dy]); if (trail.length > 14) trail.shift();
      for (let i = 0; i < trail.length; i++) {
        const a = i / trail.length;
        ctx.fillStyle = fever ? `hsla(${(hue + i * 12) % 360},100%,65%,${a * 0.5})` : `rgba(61,252,255,${a * 0.35})`;
        ctx.beginPath(); ctx.arc(trail[i][0], trail[i][1], R * 0.05 * a, 0, Math.PI * 2); ctx.fill();
      }
      if (mode !== 'dead') {
        ctx.save(); ctx.shadowColor = '#3dfcff'; ctx.shadowBlur = 20; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(dx, dy, R * 0.065, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }

      // 가운데: 점수 · 콤보
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f4f1ff'; ctx.font = `900 ${Math.round(R * 0.42)}px system-ui, sans-serif`;
      ctx.fillText(String(s.score), cx, cy - R * 0.05);
      ctx.font = `700 ${Math.round(R * 0.11)}px system-ui, sans-serif`;
      if (s.combo >= 2) {
        const mult = 1 + Math.floor(s.combo / 10);
        ctx.fillStyle = fever ? '#ff4fd8' : '#ffd23f';
        ctx.fillText(`${s.combo} COMBO${mult > 1 ? ` · ×${mult}` : ''}${fever ? ' · FEVER' : ''}`, cx, cy + R * 0.3);
      }
      if (mode === 'playing' && !s.started) {
        ctx.fillStyle = `rgba(244,241,255,${0.5 + 0.5 * Math.sin(now / 200)})`;
        ctx.fillText('눌러서 시작', cx, cy + R * 0.3);
      }
      // PERFECT 연속 게이지 (FEVER 까지)
      if (!fever && s.perfectStreak > 0) {
        const n = Sim.C.FEVER_STREAK, k = s.perfectStreak % n;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i < k ? '#3dfcff' : '#2a2446';
          ctx.fillRect(cx - (n * 14) / 2 + i * 14, cy + R * 0.46, 10, 4);
        }
      }
    }

    // 파티클
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // 떠오르는 글자
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
      ctx.fillStyle = f.color; ctx.font = `900 ${f.size}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(f.text, cx, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (flash > 0.01) { ctx.fillStyle = `rgba(${flashColor},${flash})`; ctx.fillRect(0, 0, W, H); }
  }

  // ── 루프 ──────────────────────────────────────────────────────
  let prev = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (mode === 'playing' && s) {
      const ev = Sim.step(s, (now - lastStep) / 1000);
      lastStep = now;
      if (ev) onDeath(ev);
    }
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt * 1.4; }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) { f.y -= 40 * dt; f.life -= dt * 1.1; }
    floaters = floaters.filter((f) => f.life > 0);
    shake *= 0.85; flash *= 0.88; pulse *= 0.85;
    draw(now);
    requestAnimationFrame(loop);
  }

  // 메뉴 화면에서도 링이 보이게 — 멈춘 판 하나를 깔아 둔다
  s = Sim.createState(7);
  // ?debug=1 일 때만 읽기 전용 상태 창 — 브라우저 자동 플레이 검사용 (평소엔 아무것도 노출하지 않는다)
  if (/[?&]debug=1\b/.test(location.search)) window.ChalnaDebug = { state: () => s, mode: () => mode };
  $('startBtn').addEventListener('click', (e) => { e.preventDefault(); });
  requestAnimationFrame(loop);
})();
