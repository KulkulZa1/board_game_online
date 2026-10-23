// 스침 (GRAZE) — 렌더링·입력·소리. 규칙은 전부 sim.js (GrazeSim) 에 있다.
(function () {
  'use strict';

  const Sim = window.GrazeSim;
  const C = Sim.C;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const wrapper = document.getElementById('gameWrapper');
  const overlay = document.getElementById('overlay');
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ── 저장 ──────────────────────────────────────────────────────
  const KEY_HIGH = 'arcade_graze_high', KEY_TRIES = 'arcade_graze_tries', KEY_MUTE = 'arcade_graze_mute';
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (_) {} };
  let high = parseInt(load(KEY_HIGH, '0'), 10) || 0;
  let tries = parseInt(load(KEY_TRIES, '0'), 10) || 0;
  let muted = load(KEY_MUTE, '0') === '1';
  $('highDisplay').textContent = high.toLocaleString();
  $('triesDisplay').textContent = tries;
  $('muteBtn').textContent = muted ? '🔇' : '🔊';

  // ── 상태 ──────────────────────────────────────────────────────
  let s = null;                 // 지금 판
  let demo = null;              // 메뉴 뒤에서 혼자 스치는 데모 판
  let mode = 'menu';            // menu | playing | dead
  let deadAt = 0;
  let W = 0, H = 0, DPR = 1, scale = 1, ox = 0, oy = 0;   // 세계 (x, y) → 화면 (ox + x·scale, oy + y·scale)
  let shake = 0, flash = 0, flashColor = '255,255,255', hue = 0, scroll = 0;
  let multPulse = 0, perfectStreak = 0, lastPerfectReal = -9, passedBest = false;
  let particles = [], floaters = [];
  const fx = new Map();         // 위험물 id → { perfectAt, fired }
  let killerId = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = wrapper.clientWidth; H = wrapper.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    const top = 70, bottom = 14;
    scale = Math.max(1, Math.min(W / C.W, (H - top - bottom) / C.VIEW_H));
    ox = (W - C.W * scale) / 2;
    oy = H - bottom - C.VIEW_H * scale;
  }
  window.addEventListener('resize', resize);
  resize();
  const X = (x) => ox + x * scale, Y = (y) => oy + y * scale;

  // ── 소리 (WebAudio 합성 — 파일 없음) ──────────────────────────
  let ac = null, sizzle = null;
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
  // 스치는 동안 계속 나는 '지지직' — 가까울수록 크고, 배율이 높을수록 높다
  function startSizzle() {
    const a = audio(); if (!a || sizzle) return;
    const buf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 6;
    const g = a.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(a.destination); src.start();
    sizzle = { bp, g };
  }
  function updateSizzle(intensity, mult) {
    if (!sizzle || !ac) return;
    const target = muted || mode !== 'playing' ? 0 : intensity * intensity * 0.22;
    sizzle.g.gain.setTargetAtTime(target, ac.currentTime, 0.03);
    sizzle.bp.frequency.setTargetAtTime(1500 + mult * 260 + intensity * 900, ac.currentTime, 0.05);
  }
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} };

  // ── 효과 ──────────────────────────────────────────────────────
  function burst(x, y, n, color, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * speed;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life || 1, color, size: 1.5 + Math.random() * 2.5 });
    }
  }
  function float(text, color, size, x, y) {
    const stacked = floaters.filter((f) => Math.abs(f.y - y) < size && f.life > 0.5).length;
    floaters.push({ text, color, size, x, y: y - stacked * size * 1.1, life: 1 });
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // 플레이어에게 가장 가까운 위험물의 닿는 점 (불꽃이 튀는 곳)
  function contactPoint(st) {
    let best = null, bd = Infinity;
    for (const hz of st.hazards) {
      const d = Sim.hazardDist(hz, st.px, st.t);
      if (d < bd) { bd = d; best = hz; }
    }
    if (!best || bd - C.PR > C.GRAZE_R) return null;
    if (best.kind === 'beam') {
      const edge = st.px < best.x + best.w / 2 ? best.x : best.x + best.w;
      return { x: edge, y: C.FALL };
    }
    const top = Sim.blockTop(best, st.t);
    return { x: clamp(st.px, best.x, best.x + best.w), y: clamp(C.FALL, top, top + best.h) };
  }

  // ── 게임 흐름 ─────────────────────────────────────────────────
  // 메뉴 뒤 데모: '잘하는 사람'처럼 논다 — 앞으로 0.8초 동안 0.9u 여유를 지키는 곳들 중 가장 많이 스칠 곳으로.
  // (prototypes/graze-test.js 의 greedy 봇과 같은 생각. 가끔 죽는다 — 그것도 보여 준다)
  let demoTarget = C.W / 2, demoNext = 0;
  function newDemo() { demo = Sim.createState((Date.now() * 7919) >>> 0); demoTarget = C.W / 2; demoNext = 0; }
  function demoInput(st) {
    if (st.real < demoNext) return { targetX: demoTarget };
    demoNext = st.real + 0.05;
    const N = 30, HOR = 0.8, samples = [];
    for (let j = 1; j <= N; j++) {
      const t = st.t + (j / N) * HOR, iv = [];
      for (const hz of st.hazards) {
        if (hz.kind === 'beam') { if (t >= hz.fireAt - 0.02 && t <= hz.endAt + 0.02) iv.push([hz.x - C.PR, hz.x + hz.w + C.PR]); }
        else { const top = Sim.blockTop(hz, t); if (top + hz.h > C.FALL - C.PR && top < C.FALL + C.PR) iv.push([hz.x - C.PR, hz.x + hz.w + C.PR]); }
      }
      samples.push({ tau: (j / N) * HOR, iv });
    }
    const vw = C.V_MAX / (st.overdrive > 0 ? C.OD_SCALE : 1);
    let bestKey = -Infinity;
    for (let cand = C.PR; cand <= C.W - C.PR; cand += 0.75) {
      let alive = 0, minClear = Infinity, gz = 0;
      for (const sm of samples) {
        const d = cand - st.px;
        const px = st.px + Math.sign(d) * Math.min(Math.abs(d), vw * sm.tau);
        let hit = false, clear = Infinity;
        for (const [a, b] of sm.iv) { if (px > a && px < b) { hit = true; break; } clear = Math.min(clear, px <= a ? a - px : px - b); }
        if (hit) break;
        alive++; minClear = Math.min(minClear, clear);
        if (clear < C.GRAZE_R) { const k = 1 - clear / C.GRAZE_R; gz += k * k; }
      }
      const key = alive < N ? alive * 100 - 1e6 : minClear >= 0.9 ? 1000 + gz - Math.abs(cand - st.px) * 0.01 : minClear * 10;
      if (key > bestKey) { bestKey = key; demoTarget = cand; }
    }
    return { targetX: demoTarget };
  }

  function newRun() {
    s = Sim.createState((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    mode = 'playing';
    particles = []; floaters = []; fx.clear(); killerId = null;
    shake = 0; flash = 0; multPulse = 0; perfectStreak = 0; passedBest = false;
    pointerTarget = null; drag = null;
    overlay.classList.remove('visible');
    startSizzle();
    canvas.focus();
  }

  // 시작/다시. 판을 새로 시작했으면 true
  function press() {
    if (mode === 'playing') return false;
    if (mode === 'dead' && performance.now() - deadAt < 450) return false;   // 죽자마자 연타로 다음 판이 시작되지 않게
    newRun();
    return true;
  }

  function handle(ev, st, live) {
    const py = Y(C.FALL);
    if (ev.type === 'graze') {
      burst(X(ev.x), py, live ? 6 : 4, '#ffd23f', 2.2, 0.6);
      multPulse = 1;
      if (live) tone(1700 + ev.k * 1100, 0.035, 'triangle', 0.03);
    } else if (ev.type === 'perfect') {
      fx.set(ev.id, Object.assign(fx.get(ev.id) || {}, { perfectAt: performance.now() }));
      burst(X(st.px), py, 22, '#ffffff', 4.5);
      burst(X(st.px), py, 14, '#3dfcff', 3);
      if (ev.gap < 0.25) float(`털끝! +${Math.round(ev.points)}`, '#ffffff', 26, X(st.px), py - 36);   // 0.25 안쪽은 따로 부른다
      else float(`PERFECT +${Math.round(ev.points)}`, '#3dfcff', 22, X(st.px), py - 36);
      multPulse = 1.6;
      if (!live) return;
      const now = performance.now() / 1000;
      perfectStreak = now - lastPerfectReal < 2.5 ? perfectStreak + 1 : 0;
      lastPerfectReal = now;
      const f = 523 * Math.pow(2, Math.min(perfectStreak, 15) / 12);   // 연속 PERFECT 마다 반음씩 올라간다
      tone(f, 0.14, 'sine', 0.13); tone(f * 1.5, 0.12, 'sine', 0.06, 0.03); tone(f * 2, 0.1, 'triangle', 0.04, 0.06);
      shake = Math.max(shake, 4); flash = Math.max(flash, 0.1); flashColor = '61,252,255';
      buzz(12);
    } else if (ev.type === 'overdrive') {
      flash = 0.45; flashColor = '139,92,255';
      float('OVERDRIVE ×2', '#ffd23f', 34, W / 2, Y(C.FALL * 0.45));
      burst(X(st.px), py, 50, '#8b5cff', 6);
      if (!live) return;
      tone(220, 0.5, 'sawtooth', 0.08, 0, 880); tone(110, 0.6, 'sine', 0.2);
      buzz([20, 40, 20]);
    } else if (ev.type === 'overdrive-end') {
      if (live) tone(660, 0.4, 'sine', 0.06, 0, 220);
    } else if (ev.type === 'death') {
      if (live) onDeath(ev);
      else burst(X(st.px), py, 40, '#ff2e63', 6);   // 데모가 죽으면 터지고 새 판
    }
  }

  const TAUNTS = {
    block: ['스치라고 했지 박으라고는 안 했다', '욕심이 부른 참사', '아슬아슬의 끝은 결국 충돌', '그건 스침이 아니라 정면충돌', '조금만 덜 욕심냈더라면'],
    wall: ['구멍은 저쪽이었다', '벽은 피하는 거다', '갇혔다. 스스로.', '길은 있었다. 네가 못 갔을 뿐'],
    beam: ['경고는 충분히 했다', '빛보다 느렸다', '빨간 줄 = 곧 아픔', '레이저랑 눈싸움하지 마라'],
  };
  const CAUSE = { block: '블록에 닿음', wall: '벽에 막힘', beam: '레이저에 닿음' };

  function onDeath(ev) {
    mode = 'dead'; deadAt = performance.now();
    killerId = s.death ? s.death.id : null;
    tries++; save(KEY_TRIES, tries); $('triesDisplay').textContent = tries;
    const px = X(s.px), py = Y(C.FALL);
    burst(px, py, 80, '#ff2e63', 8);
    burst(px, py, 30, '#ffffff', 5);
    shake = 22; flash = 0.6; flashColor = '255,46,99';
    noise(0.4, 0.4); tone(200, 0.6, 'sawtooth', 0.15, 0, 40);
    buzz(140);

    const score = Math.floor(s.score);
    const prevHigh = high;
    const isBest = score > high;
    if (isBest) { high = score; save(KEY_HIGH, high); $('highDisplay').textContent = high.toLocaleString(); }

    let taunt = pick(TAUNTS[ev.cause] || TAUNTS.block);
    if (s.real < 6) taunt = '몸풀기도 안 끝났는데?';
    if (ev.depth < 0.25) taunt = `${ev.depth.toFixed(2)} 차이. 털끝 하나였다.`;
    const detail = ev.mult >= 3 ? `×${ev.mult.toFixed(1)} 배율이 증발했다` : CAUSE[ev.cause] || '';
    let chase = '';
    if (isBest) chase = prevHigh > 0 ? '<div class="newbest">NEW BEST!</div><div class="dim">…근데 더 스칠 수 있었잖아?</div>' : '<div class="newbest">첫 기록!</div>';
    else if (prevHigh > 0) chase = `<div class="dim">최고까지 <b>${(prevHigh - score).toLocaleString()}</b>점. 딱 한 판만 더?</div>`;
    const st = s.stats;
    $('deathStats').innerHTML = `
      <div class="big">${score.toLocaleString()}</div>
      ${chase}
      <div class="taunt">${taunt}</div>
      <div class="detail">${detail}</div>
      <div class="row"><span>버틴 시간</span><b>${s.real.toFixed(1)}초</b></div>
      <div class="row"><span>스침</span><b>${st.grazes}</b></div>
      <div class="row"><span>PERFECT</span><b>${st.perfects}</b></div>
      <div class="row"><span>최대 배율</span><b>×${st.maxMult.toFixed(1)}</b></div>
      <div class="row"><span>OVERDRIVE</span><b>${st.overdrives}회</b></div>
      <div class="row"><span>가장 아슬아슬했던 스침</span><b>${isFinite(st.closest) ? st.closest.toFixed(2) : '—'}</b></div>`;
    $('deathStats').classList.remove('hidden');
    $('overlayIcon').textContent = '💥';
    $('overlayTitle').classList.add('hidden');
    $('overlayMsg').classList.add('hidden');
    $('startBtn').textContent = '다시 (Space)';
    $('retryHint').classList.remove('hidden');
    setTimeout(() => { if (mode === 'dead') overlay.classList.add('visible'); }, 450);   // 터지는 모습이 보이게
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
  }

  // ── 입력 ──────────────────────────────────────────────────────
  // 키보드: ←→/A D (Shift = 정밀). 마우스: 커서를 따라간다. 터치: '상대' 드래그 — 손가락이 점을 가리지 않는다.
  const keys = { left: false, right: false, focus: false };
  let pointerTarget = null;
  let drag = null;              // { id, lastX }
  const TOUCH_GAIN = 1.3;       // 손가락을 조금만 움직여도 되게

  function currentInput() {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) return { dir, focus: keys.focus };
    if (pointerTarget !== null) return { targetX: pointerTarget, focus: keys.focus };
    return { focus: keys.focus };
  }
  function worldX(clientX) {
    const r = canvas.getBoundingClientRect();
    return (clientX - r.left - ox) / scale;
  }
  function beginDrag(e) {
    if (e.pointerType === 'mouse') { if (mode === 'playing') pointerTarget = clamp(worldX(e.clientX), 0, C.W); return; }
    drag = { id: e.pointerId, lastX: e.clientX };
    if (s && pointerTarget === null) pointerTarget = s.px;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; pointerTarget = null; e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; pointerTarget = null; e.preventDefault(); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.focus = true;
    else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.focus = false;
  });
  window.addEventListener('blur', () => { keys.left = keys.right = keys.focus = false; drag = null; });

  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'playing') beginDrag(e); });
  overlay.addEventListener('pointerdown', (e) => {
    if (mode === 'dead' || mode === 'menu') {
      e.preventDefault();
      if (press()) beginDrag(e);   // 시작한 손가락 그대로 바로 조종한다
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (mode !== 'playing') return;
    if (e.pointerType === 'mouse') { pointerTarget = clamp(worldX(e.clientX), 0, C.W); return; }
    if (drag && e.pointerId === drag.id) {
      const base = pointerTarget === null ? s.px : pointerTarget;
      pointerTarget = clamp(base + ((e.clientX - drag.lastX) / scale) * TOUCH_GAIN, 0, C.W);
      drag.lastX = e.clientX;
    }
  }, { passive: true });
  const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  $('muteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    muted = !muted; save(KEY_MUTE, muted ? '1' : '0');
    $('muteBtn').textContent = muted ? '🔇' : '🔊';
    if (!muted && mode === 'playing') startSizzle();
  });

  // ── 그리기 ────────────────────────────────────────────────────
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawBlock(hz, t, nowMs) {
    const top = Sim.blockTop(hz, t);
    const x = X(hz.x), y = Y(top), w = hz.w * scale, h = hz.h * scale;
    const wall = hz.kind === 'wall';
    const base = wall ? '255,138,0' : '255,46,99';
    ctx.fillStyle = `rgba(${base},0.18)`;
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);             // 값싼 빛 번짐
    ctx.fillStyle = `rgba(${base},0.95)`;
    roundRect(x, y, w, h, 3); ctx.fill();
    const f = fx.get(hz.id);
    if (f && f.perfectAt && nowMs - f.perfectAt < 260) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; roundRect(x, y, w, h, 3); ctx.stroke();
    } else if (hz.grazed) {
      ctx.strokeStyle = 'rgba(255,210,63,0.9)'; ctx.lineWidth = 1.5; roundRect(x, y, w, h, 3); ctx.stroke();
    }
    if (hz.id === killerId && Math.floor(nowMs / 120) % 2 === 0) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; roundRect(x - 2, y - 2, w + 4, h + 4, 4); ctx.stroke();
    }
  }

  function drawBeam(hz, t, nowMs, live) {
    const cx = X(hz.x + hz.w / 2), w = hz.w * scale, top = Y(0), bottom = Y(C.VIEW_H);
    if (t < hz.fireAt) {
      const p = clamp((t - hz.ts) / (hz.fireAt - hz.ts), 0, 1);
      ctx.fillStyle = `rgba(255,46,99,${0.05 + 0.13 * p})`;
      ctx.fillRect(cx - w / 2, top, w, bottom - top);
      ctx.strokeStyle = `rgba(255,46,99,${0.35 + 0.35 * Math.abs(Math.sin(nowMs / (90 - 50 * p)))})`;
      ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bottom); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const f = fx.get(hz.id) || {};
    if (!f.fired) {
      f.fired = true; fx.set(hz.id, f);
      if (live) { noise(0.12, 0.07); tone(180, 0.18, 'sawtooth', 0.05, 0, 90); shake = Math.max(shake, 3); }
    }
    ctx.fillStyle = 'rgba(255,79,216,0.35)';
    ctx.fillRect(cx - w / 2 - 4, top, w + 8, bottom - top);
    ctx.fillStyle = 'rgba(255,79,216,0.85)';
    ctx.fillRect(cx - w / 2, top, w, bottom - top);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - w * 0.18, top, w * 0.36, bottom - top);
  }

  function drawPlayer(st, nowMs) {
    const px = X(st.px), py = Y(C.FALL);
    const gz = st.grazing;
    // 스침 범위 — 이 원 안을 지나가게 하면 번다
    ctx.strokeStyle = `rgba(255,210,63,${0.13 + gz * 0.6})`;
    ctx.lineWidth = 1 + gz * 2;
    ctx.beginPath(); ctx.arc(px, py, (C.PR + C.GRAZE_R) * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(61,252,255,${0.08 + gz * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, (C.PR + C.PERFECT_R) * scale, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(px, py, 0, px, py, 3.4 * scale);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(61,252,255,0.45)'); g.addColorStop(1, 'rgba(61,252,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, 3.4 * scale, 0, Math.PI * 2); ctx.fill();
    // 판정 = 하얀 심 (빛보다 훨씬 작다)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, C.PR * scale, 0, Math.PI * 2); ctx.fill();
  }

  function drawHud(st, live) {
    const od = st.overdrive > 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f1ff';
    ctx.font = `900 ${Math.round(clamp(W * 0.085, 26, 44))}px system-ui, sans-serif`;
    ctx.fillText(Math.floor(st.score).toLocaleString(), W / 2, 24);
    if (st.mult > 1.01 || multPulse > 0.05) {
      const holdLeft = clamp(1 - (st.t - st.lastGrazeAt) / C.MULT_HOLD, 0, 1);
      ctx.save();
      ctx.translate(W / 2, 52);
      ctx.scale(1 + multPulse * 0.25, 1 + multPulse * 0.25);
      ctx.fillStyle = holdLeft > 0 ? '#ffd23f' : '#ff6b8b';
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.fillText(`×${st.mult.toFixed(1)}`, 0, 0);
      ctx.restore();
      ctx.fillStyle = holdLeft > 0 ? 'rgba(255,210,63,0.8)' : 'rgba(255,107,139,0.6)';
      ctx.fillRect(W / 2 - 24, 63, 48 * (holdLeft > 0 ? holdLeft : (st.mult - 1) / (C.MULT_MAX - 1)), 2);
    }
    // 최고 기록까지 — 세계 상자 위쪽 가는 막대
    if (live && high > 0) {
      const p = clamp(st.score / high, 0, 1);
      ctx.fillStyle = p >= 1 ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(X(0), Y(0) - 3, C.W * scale * p, 2);
    }
    // OVERDRIVE 게이지 / 남은 시간 — 세계 상자 아래
    const bw = C.W * scale, by = Y(C.VIEW_H) + 4;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(X(0), by, bw, 4);
    if (od) {
      ctx.fillStyle = `hsl(${(hue + 40) % 360},90%,62%)`;
      ctx.fillRect(X(0), by, bw * (st.overdrive / C.OD_TIME), 4);
      ctx.fillStyle = '#ffd23f'; ctx.font = '800 13px system-ui, sans-serif';
      ctx.fillText('OVERDRIVE ×2', W / 2, Y(C.FALL) + 22);
    } else {
      ctx.fillStyle = st.meter > 80 ? '#ffd23f' : '#8b5cff';
      ctx.fillRect(X(0), by, bw * clamp(st.meter / 100, 0, 1), 4);
    }
  }

  function draw(nowMs) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const st = mode === 'menu' ? demo : s;
    const live = mode !== 'menu';
    const od = st.overdrive > 0;
    ctx.fillStyle = '#030208';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // 세계 상자
    ctx.fillStyle = od ? `hsl(${hue},55%,9%)` : '#08061a';
    ctx.fillRect(X(0), Y(0), C.W * scale, C.VIEW_H * scale);
    ctx.save();
    ctx.beginPath(); ctx.rect(X(0), Y(0), C.W * scale, C.VIEW_H * scale); ctx.clip();
    // 속도선
    ctx.strokeStyle = od ? 'rgba(255,210,63,0.10)' : 'rgba(150,140,255,0.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const x = (i * 37.3 + 11) % C.W;
      const y = (scroll * (0.4 + (i % 3) * 0.25) + i * 23) % C.VIEW_H;
      ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x), Y(y + 7)); ctx.stroke();
    }
    // 플레이어 선
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(X(0), Y(C.FALL)); ctx.lineTo(X(C.W), Y(C.FALL)); ctx.stroke();

    for (const hz of st.hazards) if (hz.kind === 'beam') drawBeam(hz, st.t, nowMs, live);
    for (const hz of st.hazards) if (hz.kind !== 'beam') drawBlock(hz, st.t, nowMs);
    // 생성선 쪽은 서서히 나타나게
    const fade = ctx.createLinearGradient(0, Y(0), 0, Y(7));
    fade.addColorStop(0, od ? `hsl(${hue},55%,9%)` : '#08061a'); fade.addColorStop(1, 'rgba(8,6,26,0)');
    ctx.fillStyle = fade; ctx.fillRect(X(0), Y(0), C.W * scale, 7 * scale);
    if (st.alive) drawPlayer(st, nowMs);
    ctx.restore();

    // 세계 가장자리
    ctx.strokeStyle = od ? 'rgba(255,210,63,0.35)' : 'rgba(139,92,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(X(0) + 0.5, Y(0) + 0.5, C.W * scale - 1, C.VIEW_H * scale - 1);

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life, 0, 1); ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.life * 1.5, 0, 1);
      ctx.fillStyle = f.color; ctx.font = `900 ${f.size}px system-ui, sans-serif`; ctx.textAlign = 'center';
      const half = ctx.measureText(f.text).width / 2 + 6;   // 벽 가까이에서 스쳐도 글자가 잘리지 않게
      ctx.fillText(f.text, clamp(f.x, half, Math.max(half, W - half)), f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (mode !== 'menu') drawHud(st, live);
    if (flash > 0.01) { ctx.fillStyle = `rgba(${flashColor},${flash})`; ctx.fillRect(0, 0, W, H); }
  }

  // ── 루프 ──────────────────────────────────────────────────────
  // 한 프레임은 최대 0.05초만 진행한다 — 탭을 떠났다 돌아오면 그 사이를 건너뛰지 않고 멈춰 있던 것처럼 이어진다
  function advance(st, dt, inp, live) {
    const n = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < n && st.alive; i++) {
      const evs = Sim.step(st, dt / n, inp);
      for (const ev of evs) handle(ev, st, live);
    }
    scroll += Sim.fallSpeed(st.t) * dt * (st.overdrive > 0 ? C.OD_SCALE : 1);
  }

  let prev = performance.now();
  function loop(nowMs) {
    const dt = clamp((nowMs - prev) / 1000, 0, 0.05); prev = nowMs;
    if (mode === 'playing') {
      advance(s, dt, currentInput(), true);
      if (high > 0 && !passedBest && s.score > high && s.alive) {
        passedBest = true;
        float('👑 최고 기록 돌파', '#ffd23f', 24, W / 2, Y(C.FALL * 0.3));
        [784, 988, 1175].forEach((f, i) => tone(f, 0.2, 'sine', 0.1, i * 0.07));
      }
    } else if (mode === 'menu') {
      advance(demo, dt, demoInput(demo), false);
      if (!demo.alive || demo.t > 45) newDemo();
    }
    const st = mode === 'menu' ? demo : s;
    if (st.alive && st.grazing > 0) {
      const cp = contactPoint(st);
      if (cp && Math.random() < st.grazing * 1.4) burst(X(cp.x), Y(cp.y), 1 + Math.floor(st.grazing * 3), Math.random() < 0.5 ? '#ffd23f' : '#ffffff', 2.5, 0.5);
    }
    updateSizzle(mode === 'playing' && st.alive ? st.grazing : 0, st.mult);
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt * 1.6; }
    if (particles.length > 600) particles = particles.slice(-600);
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) { f.y -= 40 * dt; f.life -= dt * 1.1; }
    floaters = floaters.filter((f) => f.life > 0);
    shake *= 0.85; flash *= 0.88; multPulse *= 0.85;
    if (st.overdrive > 0) hue = (hue + 2) % 360;
    draw(nowMs);
    requestAnimationFrame(loop);
  }

  newDemo();
  // ?debug=1 일 때만 읽기 전용 상태 창 — 브라우저 자동 플레이 검사용 (평소엔 아무것도 노출하지 않는다)
  if (/[?&]debug=1\b/.test(location.search)) window.GrazeDebug = { state: () => s, mode: () => mode, demo: () => demo };
  requestAnimationFrame(loop);
})();
