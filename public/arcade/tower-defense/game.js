/* 첨탑 대란 — 렌더러/입력/연출. 규칙은 전부 sim.js(window.TDRogue)가 가진다.
 * 여기는 도파민 담당: 타격 플래시, 부유 텍스트, 사운드, 융합 번쩍임. */
(function () {
  'use strict';
  const TD = window.TDRogue;
  const FAST = !!window.__TD_FAST;   // 헤드리스 테스트용 — 연출 시간 0

  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d');

  // ── 레이아웃 ────────────────────────────────────────────────────
  let CELL = 56, W = 0, H = 0;
  function resize() {
    const avail = Math.min(460, canvas.parentElement.clientWidth || 420);
    CELL = Math.floor(avail / TD.COLS);
    W = CELL * TD.COLS; H = CELL * TD.ROWS;
    canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener('resize', resize);

  // ── 사운드 (절차 합성 — 다른 아케이드와 같은 패턴) ──────────────
  const Sound = (() => {
    let ac, muted = false;
    try { muted = localStorage.getItem('td_muted') === '1'; } catch (e) {}
    const ctx2 = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
    function tone(f, dur, type, vol, delay) {
      if (muted) return;
      try {
        const c = ctx2(), o = c.createOscillator(), g = c.createGain();
        o.type = type || 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(vol || 0.06, c.currentTime + (delay || 0));
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (delay || 0) + dur);
        o.connect(g); g.connect(c.destination);
        o.start(c.currentTime + (delay || 0)); o.stop(c.currentTime + (delay || 0) + dur);
      } catch (e) {}
    }
    return {
      toggle() { muted = !muted; try { localStorage.setItem('td_muted', muted ? '1' : '0'); } catch (e) {} return muted; },
      muted: () => muted,
      build() { tone(330, 0.08, 'square', 0.05); tone(440, 0.1, 'square', 0.05, 0.06); },
      shot() { tone(880, 0.03, 'square', 0.018); },
      boom() { tone(120, 0.18, 'sawtooth', 0.06); },
      kill() { tone(660, 0.05, 'triangle', 0.04); },
      leak() { tone(180, 0.25, 'sawtooth', 0.08); tone(140, 0.3, 'sawtooth', 0.07, 0.1); },
      wave() { [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, i * 0.08)); },
      pick() { tone(523, 0.08, 'triangle', 0.06); tone(784, 0.1, 'triangle', 0.06, 0.07); },
      fuse() { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.06)); },
      over() { [330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.07, i * 0.16)); },
    };
  })();

  // ── 메타/저장 ──────────────────────────────────────────────────
  function loadMeta() {
    try { return TD.normalizeMeta(JSON.parse(localStorage.getItem(TD.META_KEY) || '{}')); }
    catch (e) { return TD.normalizeMeta({}); }
  }
  function saveMeta() { try { localStorage.setItem(TD.META_KEY, JSON.stringify(meta)); } catch (e) {} }
  let meta = loadMeta();

  // ── 런 상태 ────────────────────────────────────────────────────
  let run = null;
  let speed = 1;
  let selected = null;         // {x,y} 선택된 칸
  let floaters = [];           // {x,y,text,color,life}
  let beams = [];              // {from,to,color,life}
  let booms = [];              // {x,y,r,life}
  let shakeT = 0;
  let lastTs = 0;

  // ── HUD ────────────────────────────────────────────────────────
  function renderHUD() {
    $('waveDisp').textContent = run ? run.wave : 0;
    $('livesDisp').textContent = run ? run.lives : '-';
    $('goldDisp').textContent = run ? Math.floor(run.gold) : '-';
    $('bestDisp').textContent = meta.best;
    if (run) {
      const p = run.nextWavePreview();
      $('previewText').textContent = `${p.n}웨이브 — ${p.label}${p.n % 5 === 0 ? ' ⚠ 군주!' : ''}`;
    }
    const mb = $('modBar'); mb.innerHTML = '';
    if (run) {
      const chips = [];
      const m = run.mods;
      if (m.dmgMult > 1) chips.push(['🗡️ 피해 +' + Math.round((m.dmgMult - 1) * 100) + '%']);
      if (m.rateMult > 1) chips.push(['⚙️ 공속 +' + Math.round((m.rateMult - 1) * 100) + '%']);
      if (m.rangeMult > 1) chips.push(['🔭 사거리 +' + Math.round((m.rangeMult - 1) * 100) + '%']);
      if (m.bountyMult > 1) chips.push(['💵 보상 +' + Math.round((m.bountyMult - 1) * 100) + '%']);
      if (m.costMult < 1) chips.push(['📐 비용 ' + Math.round((m.costMult - 1) * 100) + '%']);
      if (run.curses.hpMult > 1) chips.push(['🩸 적 체력 +' + Math.round((run.curses.hpMult - 1) * 100) + '%', true]);
      if (run.curses.speedMult > 1) chips.push(['🪙 적 속도 +' + Math.round((run.curses.speedMult - 1) * 100) + '%', true]);
      for (const [text, curse] of chips) {
        const el = document.createElement('span');
        el.className = 'mod-chip' + (curse ? ' curse' : '');
        el.textContent = text;
        mb.appendChild(el);
      }
    }
    const wb = $('waveBtn');
    if (!run || run.phase === 'over') { wb.disabled = true; wb.textContent = '—'; }
    else if (run.phase === 'wave') { wb.disabled = true; wb.textContent = `⚔ ${run.wave}웨이브 방어 중…`; }
    else if (run.pendingDraft) { wb.disabled = true; wb.textContent = '🃏 전리품을 고르세요'; }
    else {
      wb.disabled = false;
      const next = run.wave + 1;
      wb.textContent = `⚔ ${next}웨이브 시작`;
      wb.classList.toggle('danger', next % 5 === 0);
    }
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 1500);
  }

  // ── 그리기 ─────────────────────────────────────────────────────
  const px = (gx) => gx * CELL + CELL / 2;
  function draw() {
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
    ctx.fillStyle = '#0c1224';
    ctx.fillRect(-8, -8, W + 16, H + 16);

    // 격자
    for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) {
      const path = TD.onPath(x, y);
      ctx.fillStyle = path ? '#242f52' : '#111a33';
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      if (path) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x * CELL + 6, y * CELL + 6, CELL - 12, CELL - 12);
      }
    }
    // 입구/출구
    const s0 = TD.PATH[0], s1 = TD.PATH[TD.PATH_LEN - 1];
    ctx.font = `${CELL * 0.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🚪', px(s0.x), px(s0.y));
    ctx.fillText('🏰', px(s1.x), px(s1.y));

    if (!run) { ctx.restore(); return; }

    // 선택 칸 + 사거리
    if (selected) {
      const t = run.towerAt(selected.x, selected.y);
      ctx.strokeStyle = '#6ea8ff'; ctx.lineWidth = 2;
      ctx.strokeRect(selected.x * CELL + 2, selected.y * CELL + 2, CELL - 4, CELL - 4);
      if (t) {
        const st = run.towerStats(t);
        if (st.range > 0) {
          ctx.beginPath();
          ctx.arc(px(t.x), px(t.y), st.range * CELL, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(110,168,255,0.35)'; ctx.setLineDash([6, 6]);
          ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }

    // 타워
    for (const t of run.towers) {
      const def = TD.TOWERS[t.type];
      const fu = t.fused ? TD.FUSIONS[t.type] : null;
      ctx.font = `${CELL * (t.fused ? 0.58 : 0.5)}px serif`;
      ctx.fillText(fu ? fu.icon : def.icon, px(t.x), px(t.y) - 3);
      if (!t.fused) {
        ctx.font = `${CELL * 0.2}px sans-serif`;
        ctx.fillStyle = t.lv === 3 ? '#ffd166' : '#9fb4e8';
        ctx.fillText('★'.repeat(t.lv), px(t.x), t.y * CELL + CELL - 8);
      }
      if (run.canFuse(t.x, t.y)) {   // 융합 가능 — 금테 점멸
        ctx.strokeStyle = `rgba(255,209,102,${0.5 + 0.4 * Math.sin(performance.now() / 200)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x * CELL + 3, t.y * CELL + 3, CELL - 6, CELL - 6);
      }
    }

    // 적
    for (const e of run.enemies) {
      const p = run.enemyXY(e);
      const def = TD.ENEMIES[e.type];
      const ex = px(p.x), ey = px(p.y);
      ctx.font = `${CELL * (def.boss ? 0.62 : 0.42)}px serif`;
      ctx.fillText(def.icon, ex, ey);
      // 체력바
      const w = CELL * (def.boss ? 0.8 : 0.55);
      ctx.fillStyle = '#000a';
      ctx.fillRect(ex - w / 2, ey - CELL * 0.34, w, 4);
      ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#6be675' : e.hp / e.maxHp > 0.25 ? '#ffd166' : '#ff5d6c';
      ctx.fillRect(ex - w / 2, ey - CELL * 0.34, w * Math.max(0, e.hp / e.maxHp), 4);
      if (e.shield > 0) { ctx.font = `${CELL * 0.2}px serif`; ctx.fillText('🔰'.repeat(Math.min(3, e.shield)), ex, ey + CELL * 0.28); }
      if (e.freezeT > 0) { ctx.font = `${CELL * 0.3}px serif`; ctx.fillText('🧊', ex, ey - CELL * 0.1); }
      else if (e.slowT > 0) { ctx.fillStyle = 'rgba(110,200,255,0.5)'; ctx.beginPath(); ctx.arc(ex, ey, CELL * 0.28, 0, Math.PI * 2); ctx.stroke(); }
      if (e.burnT > 0) { ctx.font = `${CELL * 0.22}px serif`; ctx.fillText('🔥', ex + CELL * 0.2, ey - CELL * 0.2); }
    }

    // 빔/폭발/부유 텍스트
    for (const b of beams) {
      ctx.strokeStyle = b.color; ctx.globalAlpha = Math.max(0, b.life / 0.12);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px(b.from.x), px(b.from.y)); ctx.lineTo(px(b.to.x), px(b.to.y)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const b of booms) {
      ctx.strokeStyle = `rgba(255,160,80,${Math.max(0, b.life / 0.3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px(b.x), px(b.y), b.r * CELL * (1 - b.life / 0.3 + 0.4), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.font = `${CELL * 0.26}px sans-serif`;
    for (const f of floaters) {
      ctx.fillStyle = f.color; ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillText(f.text, px(f.x), px(f.y) - (1 - f.life) * 22);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ── 이벤트 소화 (심 → 연출) ────────────────────────────────────
  function consume(evts) {
    for (const e of evts) {
      if (e.t === 'shot') {
        const color = e.tower === 'tesla' ? '#8ff' : e.tower === 'frost' ? '#9df' : e.tower === 'sniper' ? '#fd6' : '#cbd7ff';
        beams.push({ from: e.from, to: e.to, color, life: 0.12 });
        if (Math.random() < 0.3) Sound.shot();
      } else if (e.t === 'chain') beams.push({ from: e.from, to: e.to, color: '#8ff', life: 0.12 });
      else if (e.t === 'boom') { booms.push({ x: e.x, y: e.y, r: e.r, life: 0.3 }); Sound.boom(); }
      else if (e.t === 'kill') { floaters.push({ x: e.x, y: e.y, text: '+' + e.bounty, color: '#ffd166', life: 1 }); Sound.kill(); }
      else if (e.t === 'block') floaters.push({ x: e.x, y: e.y, text: '🔰', color: '#9fb4e8', life: 0.7 });
      else if (e.t === 'leak') { shakeT = 0.3; Sound.leak(); }
      else if (e.t === 'gameover') gameOver();
    }
  }

  // ── 루프 ───────────────────────────────────────────────────────
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (run && run.phase === 'wave') {
      for (let i = 0; i < speed; i++) consume(run.tick(dt));
      if (run.waveOver()) {
        const settle = run.settleWave();
        if (settle) {
          floaters.push({ x: TD.COLS / 2 - 0.5, y: TD.ROWS / 2, text: `+${settle.income} 금 (수입)`, color: '#ffd166', life: 1.4 });
          Sound.wave();
          showDraft();
        }
      }
    }
    for (const f of floaters) f.life -= dt * 0.9;
    floaters = floaters.filter((f) => f.life > 0);
    for (const b of beams) b.life -= dt;
    beams = beams.filter((b) => b.life > 0);
    for (const b of booms) b.life -= dt;
    booms = booms.filter((b) => b.life > 0);
    if (shakeT > 0) shakeT -= dt;
    renderHUD();
    draw();
  }

  // ── 드래프트 ───────────────────────────────────────────────────
  function showDraft() {
    const cards = run.pendingDraft;
    if (!cards) return;
    const wrap = $('draftCards'); wrap.innerHTML = '';
    cards.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'pick-card' + (c.kind === 'curse' ? ' curse' : c.kind === 'tower' ? ' tower' : '');
      btn.dataset.id = c.id;
      btn.innerHTML = `<span class="pick-ico">${c.icon}</span>
        <span><span class="pick-name">${c.name}</span><span class="pick-desc">${c.desc}</span></span>`;
      btn.addEventListener('click', () => {
        run.pickDraft(c.id);
        Sound.pick();
        $('draftModal').classList.add('hidden');
        renderHUD();
      });
      wrap.appendChild(btn);
    });
    $('draftModal').classList.remove('hidden');
  }
  $('draftSkip').addEventListener('click', () => {
    if (run && run.skipDraft()) { $('draftModal').classList.add('hidden'); renderHUD(); }
  });

  // ── 건설 메뉴 ──────────────────────────────────────────────────
  function showBuildMenu() {
    const menu = $('buildMenu');
    const btns = $('buildBtns');
    btns.innerHTML = '';
    if (!selected || !run || run.phase === 'over') { menu.classList.remove('open'); return; }
    const t = run.towerAt(selected.x, selected.y);
    if (t) {
      const def = TD.TOWERS[t.type];
      const fu = t.fused ? TD.FUSIONS[t.type] : null;
      $('buildTitle').textContent = `${fu ? fu.icon + ' ' + fu.name : def.icon + ' ' + def.name} ${t.fused ? '' : 'Lv' + t.lv}`;
      if (!t.fused && t.lv < 3) {
        const cost = run.upgradeCost(t);
        const b = mkBtn(`⬆<br>강화<br><span class="t-cost">${cost}금</span>`, run.gold < cost);
        b.classList.add('action');
        b.onclick = () => { if (run.upgrade(t.x, t.y)) { Sound.build(); showBuildMenu(); } };
        btns.appendChild(b);
      }
      if (run.canFuse(t.x, t.y)) {
        const fdef = TD.FUSIONS[t.type];
        const b = mkBtn(`${fdef.icon}<br>융합!<br><span class="t-cost">${fdef.name}</span>`, false);
        b.classList.add('fuse-ready');
        b.onclick = () => {
          if (run.fuse(t.x, t.y)) {
            Sound.fuse(); shakeT = 0.25;
            floaters.push({ x: t.x, y: t.y, text: `⚡ ${fdef.name}!`, color: '#ffd166', life: 1.6 });
            toast(`⚡ 융합! ${fdef.name} — ${fdef.desc}`);
            showBuildMenu();
          }
        };
        btns.appendChild(b);
      }
      const back = Math.round(TD.TOWERS[t.type].cost * 0.6 * t.lv);
      const sb = mkBtn(`🗑<br>판매<br><span class="t-cost">+${back}금</span>`, false);
      sb.classList.add('danger');
      sb.onclick = () => { run.sell(t.x, t.y); Sound.build(); selected = null; showBuildMenu(); };
      btns.appendChild(sb);
    } else if (run.canBuild(selected.x, selected.y)) {
      $('buildTitle').textContent = '타워 건설';
      for (const id of run.unlocked) {
        const def = TD.TOWERS[id];
        const cost = run.buildCost(id);
        const b = mkBtn(`<span class="t-ico">${def.icon}</span>${def.name}<br><span class="t-cost">${cost}금</span>`, run.gold < cost);
        b.title = def.desc;
        b.onclick = () => {
          if (run.build(id, selected.x, selected.y)) { Sound.build(); showBuildMenu(); }
        };
        btns.appendChild(b);
      }
    } else { menu.classList.remove('open'); return; }
    menu.classList.add('open');
  }
  function mkBtn(html, disabled) {
    const b = document.createElement('button');
    b.className = 'tower-btn';
    b.innerHTML = html;
    b.disabled = !!disabled;
    return b;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!run) return;
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left) / rect.width * TD.COLS);
    const gy = Math.floor((e.clientY - rect.top) / rect.height * TD.ROWS);
    if (gx < 0 || gy < 0 || gx >= TD.COLS || gy >= TD.ROWS) return;
    selected = (selected && selected.x === gx && selected.y === gy) ? null : { x: gx, y: gy };
    showBuildMenu();
  });

  // ── 웨이브/배속 ────────────────────────────────────────────────
  $('waveBtn').addEventListener('click', () => {
    if (!run || run.phase !== 'build' || run.pendingDraft) return;
    const spec = run.startWave();
    if (spec) { Sound.wave(); toast(`⚔ ${spec.n}웨이브: ${spec.label}`); renderHUD(); }
  });
  $('speedBtn').addEventListener('click', () => {
    speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
    $('speedBtn').textContent = speed + '×';
  });
  $('muteBtn').addEventListener('click', () => { $('muteBtn').textContent = Sound.toggle() ? '🔇' : '🔊'; });

  // ── 메타 상점 ──────────────────────────────────────────────────
  function renderMeta() {
    $('coresDisp').textContent = `보유 🔮 ${meta.cores}`;
    const list = $('metaList'); list.innerHTML = '';
    for (const u of TD.META_UPGRADES) {
      const lv = meta.upgrades[u.id] || 0;
      const cost = TD.metaCost(u.id, meta);
      const maxed = !isFinite(cost);
      const row = document.createElement('button');
      row.className = 'meta-row' + (maxed ? ' maxed' : '');
      row.disabled = maxed || meta.cores < cost;
      row.innerHTML = `<span class="m-ico">${u.icon}</span>
        <span><span class="m-name">${u.name} ${lv}/${u.max}</span><br><span class="m-desc">${u.desc(lv >= u.max ? u.max - 1 : lv)}</span></span>
        <span class="m-cost">${maxed ? 'MAX' : '🔮 ' + cost}</span>`;
      row.addEventListener('click', () => {
        const r = TD.buyMeta(meta, u.id);
        if (r.ok) { meta = r.meta; saveMeta(); Sound.pick(); renderMeta(); }
      });
      list.appendChild(row);
    }
  }
  $('metaBtn').addEventListener('click', () => { renderMeta(); $('metaModal').classList.remove('hidden'); });
  $('metaClose').addEventListener('click', () => $('metaModal').classList.add('hidden'));

  // ── 시작/종료 ──────────────────────────────────────────────────
  function start() {
    run = new TD.Run(undefined, meta);
    selected = null; floaters = []; beams = []; booms = [];
    $('overlay').classList.remove('visible');
    $('buildMenu').classList.remove('open');
    renderHUD();
    toast('길이 아닌 칸을 눌러 타워를 지으세요');
  }
  function gameOver() {
    Sound.over();
    const earned = TD.coresEarned(run.wave, run.score, meta);
    meta.cores += earned;
    if (run.wave > meta.best) meta.best = run.wave;
    saveMeta();
    $('ovIcon').textContent = '💥';
    $('ovTitle').textContent = `${run.wave}웨이브에서 함락`;
    $('ovMsg').innerHTML =
      `처치 <b>${run.kills}</b> · 점수 <b>${run.score}</b><br>` +
      `🔮 <b>+${earned}</b> 마나핵 획득 — 연구에 쓰세요.<br>` +
      (run.wave >= 20 ? '대단한 방어전이었습니다!' : '융합(같은 타워 Lv3 두 개를 붙이기)이 후반의 답입니다.');
    $('bestLine').textContent = `🏆 최고 기록: ${meta.best}웨이브`;
    $('startBtn').textContent = '🔄 다시 방어';
    $('overlay').classList.add('visible');
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
    else if (window.AdMob) AdMob.showInterstitial();
  }
  $('startBtn').addEventListener('click', start);
  $('bestLine').textContent = meta.best ? `🏆 최고 기록: ${meta.best}웨이브` : '';

  // 자동화 테스트용 훅 — ?debug=1 일 때만
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__td = {
      run: () => run,
      state: () => run ? { phase: run.phase, wave: run.wave, lives: run.lives, gold: Math.floor(run.gold), towers: run.towers.length, draft: !!run.pendingDraft } : null,
      setSpeed: (v) => { speed = v; },
    };
  }

  resize();
  renderHUD();
  requestAnimationFrame(loop);
})();
