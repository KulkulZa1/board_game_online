// BANG! 클라이언트 — 전용 페이지(/bang.html), 전용 이벤트(bang:*)
// 서버가 좌석별 개인화 상태를 보낸다. 여기는 렌더/타겟팅/리액션 입력만.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
  const socket = io();

  // 카드 메타 (서버 CARD_DEFS와 동일한 표시용 사본)
  const CARDS = {
    bang: ['BANG!', '💥', 'brown'], missed: ['빗나감!', '💨', 'brown'], beer: ['맥주', '🍺', 'brown'],
    panic: ['패닉!', '😱', 'brown'], catbalou: ['캣 발루', '🐈', 'brown'], stagecoach: ['역마차', '🚃', 'brown'],
    wellsfargo: ['웰스파고', '💰', 'brown'], gatling: ['개틀링', '🔫', 'brown'], duel: ['결투', '⚔️', 'brown'],
    indians: ['인디언!', '🏹', 'brown'], store: ['잡화점', '🏪', 'brown'], saloon: ['살룬', '🥃', 'brown'],
    jail: ['감옥', '⛓️', 'blue'], dynamite: ['다이너마이트', '🧨', 'blue'], barrel: ['술통', '🛢️', 'blue'],
    mustang: ['무스탕', '🐎', 'blue'], scope: ['조준경', '🔭', 'blue'],
    volcanic: ['볼캐닉 (1)', '🌋', 'weapon'], schofield: ['스코필드 (2)', '🔵', 'weapon'],
    remington: ['레밍턴 (3)', '🟤', 'weapon'], carabine: ['카빈 (4)', '🟠', 'weapon'], winchester: ['윈체스터 (5)', '🟡', 'weapon'],
  };
  const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const VAL = (v) => v <= 10 ? v : ['J', 'Q', 'K', 'A'][v - 11];
  const ROLE_KO = { sheriff: '⭐보안관', deputy: '🛡️부관', outlaw: '🔫무법자', renegade: '🐍배신자' };
  const ROLE_ICON = { sheriff: '⭐', deputy: '🛡️', outlaw: '🔫', renegade: '🐍' };
  const CHAR_ICON = {
    bart: '🤠', blackjack: '🎩', calamity: '💃', gringo: '🌵', lucky: '🍀',
    paul: '🕶️', rose: '🎯', slab: '💀', suzy: '🌷', willy: '⚡',
  };
  const NEED_TARGET = ['bang', 'panic', 'catbalou', 'duel', 'jail'];

  // 원탁 좌석 좌표 — 내 좌석(하단) 기준으로 상대를 뒤쪽 호(弧)를 따라 배치.
  // 가장자리(인접 좌석)는 크고 아래쪽에, 맞은편 좌석은 작고 위쪽에 — 원근감 = 거리감.
  function seatPositions(nOpp) {
    const pts = [];
    for (let j = 0; j < nOpp; j++) {
      const t = nOpp === 1 ? 0.5 : j / (nOpp - 1);
      const arc = Math.sin(Math.PI * t);
      pts.push({ left: 8 + t * 84, top: 60 - 46 * arc, scale: 1.04 - 0.24 * arc });
    }
    return pts;
  }
  // ── 서부 사운드 (Web Audio 절차 생성 — 외부 파일 없음) ────────────
  const Audio = (function () {
    let ctx = null, master = null;
    let muted = false;
    try { muted = localStorage.getItem('bang_muted') === '1'; } catch (e) {}
    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return ctx;
    }
    function noise(dur, freq, q, gain, decay) {
      const c = ensure(); if (!c) return;
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay || 2);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
      const g = c.createGain(); g.gain.value = gain == null ? 0.6 : gain;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    }
    function tone(freq, dur, type, gain, slideTo) {
      const c = ensure(); if (!c) return;
      const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain == null ? 0.2 : gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(c.currentTime + dur);
    }
    const bank = {
      shot: () => { noise(0.18, 1400, 0.8, 0.75, 3); tone(180, 0.14, 'square', 0.14, 60); },
      hit: () => { noise(0.22, 320, 1.2, 0.55, 2); tone(110, 0.2, 'sawtooth', 0.16, 50); },
      explode: () => { noise(0.7, 180, 0.6, 0.9, 1.4); tone(70, 0.6, 'sawtooth', 0.25, 28); },
      heal: () => { tone(520, 0.14, 'sine', 0.16); setTimeout(() => tone(780, 0.2, 'sine', 0.14), 90); },
      flip: () => { noise(0.09, 2600, 2.5, 0.3, 3); },
      death: () => { tone(300, 0.5, 'sawtooth', 0.2, 60); noise(0.4, 240, 1, 0.35, 2); },
      duel: () => { tone(880, 0.1, 'square', 0.12); setTimeout(() => tone(660, 0.16, 'square', 0.12), 110); },
      turn: () => { tone(660, 0.09, 'sine', 0.12); setTimeout(() => tone(990, 0.11, 'sine', 0.1), 80); },
    };
    return {
      play(name) { if (muted) return; try { bank[name] && bank[name](); } catch (e) {} },
      toggle() {
        muted = !muted;
        if (master) master.gain.value = muted ? 0 : 0.5;
        try { localStorage.setItem('bang_muted', muted ? '1' : '0'); } catch (e) {}
        return muted;
      },
      get muted() { return muted; },
    };
  })();

  function cardFanHTML(n) {
    if (!n) return '';
    const shown = Math.min(n, 5);
    let html = '';
    for (let k = 0; k < shown; k++) {
      html += `<span class="fan-card" style="--r:${((k - (shown - 1) / 2) * 11).toFixed(0)}deg; --z:${k}"></span>`;
    }
    if (n > 5) html += `<span class="fan-count">+${n - 5}</span>`;
    return html;
  }

  function cardHTML(c, extra, idx) {
    if (!c) return '';
    const [name, icon, kind] = CARDS[c.id] || [c.id, '❓', 'brown'];
    const red = c.suit === 'h' || c.suit === 'd';
    return `<div class="card ${kind}${extra ? ' ' + extra : ''}"${idx != null ? ` data-i="${idx}"` : ''}>
      <span class="c-ico">${icon}</span><span class="c-name">${name}</span>
      <span class="c-suit ${red ? 'red' : ''}">${SUIT[c.suit] || ''}${VAL(c.v) || ''}</span></div>`;
  }
  const hearts = (hp, max) => '❤️'.repeat(Math.max(0, hp)) + '🖤'.repeat(Math.max(0, max - hp));

  // ── 상태 ──────────────────────────────────────────────────────────
  let mySeat = null, roomCode = null, isHost = false, cur = null;
  let targetMode = null;     // { idx } — 대상 선택 중인 손패 인덱스
  let reactSel = new Set();  // 리액션 카드 다중 선택
  let size = 5;
  let reconnectPending = false;

  const store = {
    get token() { try { return localStorage.getItem('bang_token'); } catch (e) { return null; } },
    set(t) { try { localStorage.setItem('bang_token', t); } catch (e) {} },
    clear() { try { localStorage.removeItem('bang_token'); } catch (e) {} },
  };
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }
  function setLobbyVisible(visible) {
    const overlay = $('lobbyOverlay');
    overlay.classList.toggle('visible', visible);
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    overlay.inert = !visible;
  }

  // ── 입장 흐름 ─────────────────────────────────────────────────────
  const nick = () => $('nickInput').value.trim() || '카우보이';
  document.querySelectorAll('#sizeBtns button').forEach((b) => b.addEventListener('click', () => {
    size = +b.dataset.n;
    document.querySelectorAll('#sizeBtns button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  let soloAuto = false;
  $('createBtn').addEventListener('click', () => socket.emit('bang:create', { nickname: nick(), size }));
  $('soloBtn').addEventListener('click', () => { soloAuto = true; socket.emit('bang:create', { nickname: nick(), size }); });
  $('joinBtn').addEventListener('click', () => {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length < 4) { $('entryError').textContent = '방 코드를 입력하세요'; return; }
    socket.emit('bang:join', { code, nickname: nick() });
  });
  $('startBtn').addEventListener('click', () => socket.emit('bang:start'));
  $('copyLink').addEventListener('click', async () => {
    const url = `${location.origin}/bang.html?room=${roomCode}`;
    try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했습니다'); }
    catch (e) { prompt('초대 링크', url); }
  });
  $('againBtn').addEventListener('click', () => { store.clear(); location.href = '/bang.html'; });

  socket.on('bang:created', ({ code, token, seat }) => {
    roomCode = code; mySeat = seat; isHost = true;
    store.set(token);
    showWaitPane();
    if (soloAuto) { soloAuto = false; socket.emit('bang:start'); }
  });
  socket.on('bang:joined', ({ code, token, seat }) => {
    roomCode = code; mySeat = seat; isHost = false;
    store.set(token);
    showWaitPane();
  });
  socket.on('bang:error', ({ message, fatal }) => {
    const resumeFailed = fatal && reconnectPending;
    reconnectPending = false;
    if (!resumeFailed) {
      if ($('lobbyOverlay').classList.contains('visible')) $('entryError').textContent = message || '오류';
      toast(message || '오류');
    }
    if (fatal) { store.clear(); showEntryPane(); }
  });
  socket.on('bang:room', renderSeats);
  socket.on('bang:begin', () => {
    setLobbyVisible(false);
    $('table').classList.remove('hidden');
  });
  socket.on('bang:reconnected', ({ code, seat, status }) => {
    reconnectPending = false;
    roomCode = code; mySeat = seat;
    $('roomChip').textContent = code;
    $('roomChip').classList.remove('hidden');
    if (status === 'active') {
      setLobbyVisible(false);
      $('table').classList.remove('hidden');
    } else showWaitPane();
  });

  function showEntryPane() {
    $('entryPane').classList.remove('hidden');
    $('waitPane').classList.add('hidden');
    setLobbyVisible(true);
  }
  function showWaitPane() {
    $('entryPane').classList.add('hidden');
    $('waitPane').classList.remove('hidden');
    $('waitCode').textContent = roomCode;
    $('roomChip').textContent = roomCode;
    $('roomChip').classList.remove('hidden');
    $('startBtn').classList.toggle('hidden', !isHost);
    $('waitHint').classList.toggle('hidden', isHost);
    setLobbyVisible(true);
  }
  function renderSeats(ls) {
    const wrap = $('seatList'); wrap.innerHTML = '';
    ls.seats.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'seat-row' + (i === mySeat ? ' me' : '');
      d.innerHTML = s
        ? `<span>${s.type === 'ai' ? '🤖' : '🙂'} ${escapeHtml(s.name)}${i === ls.hostSeat ? ' 👑' : ''}</span><span class="${s.connected ? 'on' : 'off'}">${s.connected ? '접속' : '대기'}</span>`
        : `<span class="dim">빈 자리 — 시작 시 AI</span><span></span>`;
      wrap.appendChild(d);
    });
    if (ls.status === 'waiting') $('startBtn').classList.toggle('hidden', !isHost);
  }

  // ── 게임 렌더 ─────────────────────────────────────────────────────
  socket.on('bang:state', (st) => {
    if (!st) return;
    const wasMyTurn = cur && cur.turn === cur.seat && cur.phase === 'turn';
    maybeAnimateDiscard(cur, st);
    cur = st;
    targetMode = null;
    reactSel = new Set();
    render(st);
    // 렌더 후에 연출을 올린다 — 좌표를 새 배치 기준으로 잡아야 한다
    playFx(st.fx);
    const isMyTurn = st.turn === st.seat && st.phase === 'turn' && !st.pending;
    if (isMyTurn && !wasMyTurn) Audio.play('turn');
  });

  function render(st) {
    document.body.classList.toggle('targeting', !!targetMode);
    renderPlayers(st);
    renderCenter(st);
    renderMe(st);
    renderHand(st);
    renderPrompt(st);
    startClock(st);
    updateRangeLines();
  }

  function playerPanelHTML(st, i, pos) {
    const p = st.players[i];
    const active = st.turn === i && st.phase === 'turn';
    const acting = st.pending && st.pending.actor === i;
    const dead = !p.alive;
    const icon = CHAR_ICON[p.character] || '🤠';
    const inRange = p.dist != null && st.myRange != null && p.dist <= st.myRange;
    const rangeCls = p.dist == null ? '' : (inRange ? ' in-range' : ' out-range');
    const equip = p.equip.map((c) => `<span title="${(CARDS[c.id] || [c.id])[0]}">${(CARDS[c.id] || ['', '❓'])[1]}</span>`).join('');
    const style = pos ? ` style="left:${pos.left}%; top:${pos.top}%; --sc:${pos.scale.toFixed(2)}"` : '';
    return `<div class="pp${active ? ' active' : ''}${acting ? ' acting' : ''}${dead ? ' dead' : ''}${rangeCls}" data-seat="${i}"${style}>
      <div class="pp-fan">${dead ? '' : cardFanHTML(p.handCount)}</div>
      <div class="pp-avatar" title="${p.characterName}${p.characterDesc ? ' — ' + p.characterDesc : ''}">
        <span>${dead ? '☠️' : icon}</span>
        ${p.role ? `<span class="pp-role-badge">${ROLE_ICON[p.role]}</span>` : ''}
        ${p.jail ? '<span class="badge-mark jail" title="감옥">⛓️</span>' : ''}
        ${p.dynamite ? '<span class="badge-mark dyn" title="다이너마이트">🧨</span>' : ''}
      </div>
      <div class="pp-name">${escapeHtml(p.name)}${p.ai ? ' 🤖' : ''}</div>
      <div class="pp-hp">${dead ? '' : hearts(p.hp, p.maxHp)}</div>
      <div class="pp-meta">
        ${p.dist != null ? `<span class="pp-dist-chip${rangeCls}">📏${p.dist}</span>` : ''}
        <span class="pp-bank" data-seat="${i}"></span>
      </div>
      <div class="pp-equip">${equip}</div>
    </div>`;
  }
  function renderPlayers(st) {
    const others = [];
    for (let k = 1; k < st.players.length; k++) others.push((st.seat + k) % st.players.length);
    const pts = seatPositions(others.length);
    $('playersGrid').innerHTML = others.map((i, j) => playerPanelHTML(st, i, pts[j])).join('');
  }
  function renderMe(st) {
    const p = st.players[st.seat];
    const icon = CHAR_ICON[p.character] || '🤠';
    const equip = p.equip.map((c) => `<span title="${(CARDS[c.id] || [c.id])[0]}">${(CARDS[c.id] || ['', '❓'])[1]}</span>`).join('');
    $('myPanel').innerHTML = `
      <div class="me-avatar" title="${p.characterName}${p.characterDesc ? ' — ' + p.characterDesc : ''}">
        <span>${p.alive ? icon : '☠️'}</span>
        ${p.jail ? '<span class="badge-mark jail" title="감옥">⛓️</span>' : ''}
        ${p.dynamite ? '<span class="badge-mark dyn" title="다이너마이트">🧨</span>' : ''}
      </div>
      <div class="me-info">
        <div class="me-top"><b>${escapeHtml(p.name)} (나)</b>${p.role ? `<span class="me-role">${ROLE_ICON[p.role]} ${ROLE_KO[p.role]}</span>` : ''}</div>
        <div class="me-hp">${p.alive ? hearts(p.hp, p.maxHp) : '☠️ 탈락'}</div>
        <div class="me-sub">
          <span class="me-equip">${equip}</span>
          <span class="pp-bank me-bank" data-seat="${st.seat}"></span>
        </div>
      </div>`;
  }
  function renderCenter(st) {
    $('deckCount').textContent = st.deckCount;
    $('deckPile').classList.toggle('hidden', st.deckCount === 0);
    $('discardTop').innerHTML = st.discardTop ? cardHTML(st.discardTop, 'mini') : '<div class="pile-empty">—</div>';
    const last = st.log[st.log.length - 1] || '';
    $('logTicker').textContent = last;
    $('logDrawer').innerHTML = st.log.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
    if (!$('logDrawer').classList.contains('hidden')) $('logDrawer').scrollTop = $('logDrawer').scrollHeight;
  }

  // ── 카드 버림 애니메이션 ─────────────────────────────────────────
  function sameCard(a, b) { return !!a && !!b && a.id === b.id && a.suit === b.suit && a.v === b.v; }
  function maybeAnimateDiscard(prev, st) {
    if (!prev || !st.discardTop) return;
    if (sameCard(prev.discardTop, st.discardTop)) return;
    const originSeat = (prev.pending && prev.pending.actor != null) ? prev.pending.actor
      : (st.pending && st.pending.actor != null) ? st.pending.actor
      : prev.turn;
    spawnFlyCard(originSeat, st.discardTop);
  }
  function spawnFlyCard(originSeat, card) {
    const layer = $('flyLayer');
    const target = $('discardPile');
    if (!layer || !target) return;
    const originEl = (originSeat === (cur ? cur.seat : mySeat))
      ? $('myPanel')
      : document.querySelector(`.pp[data-seat="${originSeat}"] .pp-avatar`);
    if (!originEl) return;
    const oRect = originEl.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const lRect = layer.getBoundingClientRect();
    if (!oRect.width || !lRect.width) return;
    const startX = oRect.left + oRect.width / 2 - lRect.left;
    const startY = oRect.top + oRect.height / 2 - lRect.top;
    const endX = tRect.left + tRect.width / 2 - lRect.left;
    const endY = tRect.top + tRect.height / 2 - lRect.top;
    const el = document.createElement('div');
    el.className = 'fly-card';
    el.innerHTML = cardHTML(card, 'mini');
    el.style.left = startX + 'px';
    el.style.top = startY + 'px';
    layer.appendChild(el);
    requestAnimationFrame(() => {
      el.style.left = endX + 'px';
      el.style.top = endY + 'px';
      el.style.transform = `translate(-50%,-50%) rotate(${(Math.random() * 50 - 25).toFixed(0)}deg) scale(0.8)`;
      el.style.opacity = '0.15';
    });
    setTimeout(() => el.remove(), 560);
  }

  // ── 연출(FX) — 서버가 보낸 "무슨 일이 일어났는지"를 화면에 그린다 ──
  // 좌석의 화면 좌표 (아바타 중심). 내 좌석은 하단 패널.
  function seatPoint(seat) {
    const layer = $('flyLayer');
    if (!layer) return null;
    const lRect = layer.getBoundingClientRect();
    if (!lRect.width) return null;
    const el = (cur && seat === cur.seat)
      ? document.querySelector('#myPanel .me-avatar')
      : document.querySelector(`.pp[data-seat="${seat}"] .pp-avatar`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - lRect.left, y: r.top + r.height / 2 - lRect.top, el };
  }

  function playFx(list) {
    if (!list || !list.length) return;
    list.forEach((ev, i) => setTimeout(() => runFx(ev), i * 260));
  }
  function runFx(ev) {
    if (!ev) return;
    if (ev.k === 'shot' || ev.k === 'duel') {
      tracer(ev.from, ev.to, ev.k === 'duel');
      Audio.play(ev.k === 'duel' ? 'duel' : 'shot');
    } else if (ev.k === 'damage') {
      hitSeat(ev.seat, '-' + ev.amount, 'dmg');
      Audio.play('hit');
    } else if (ev.k === 'heal') {
      hitSeat(ev.seat, '+1', 'heal');
      Audio.play('heal');
    } else if (ev.k === 'explode') {
      burst(ev.seat, '💥');
      Audio.play('explode');
    } else if (ev.k === 'death') {
      burst(ev.seat, '☠️');
      Audio.play('death');
    } else if (ev.k === 'draw') {
      drawReveal(ev);
      Audio.play('flip');
    }
  }

  // 총알 궤적 — 쏜 사람에서 맞은 사람으로 선이 뻗고 사라진다
  function tracer(from, to, isDuel) {
    const a = seatPoint(from), b = seatPoint(to);
    if (!a || !b) return;
    const layer = $('flyLayer');
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const el = document.createElement('div');
    el.className = 'tracer' + (isDuel ? ' duel' : '');
    el.style.left = a.x + 'px';
    el.style.top = a.y + 'px';
    el.style.width = len + 'px';
    el.style.transform = `rotate(${ang}deg)`;
    layer.appendChild(el);
    // 총구 섬광
    const flash = document.createElement('div');
    flash.className = 'muzzle';
    flash.style.left = a.x + 'px';
    flash.style.top = a.y + 'px';
    layer.appendChild(flash);
    setTimeout(() => { el.remove(); flash.remove(); }, 460);
  }

  // 피격/회복 — 아바타가 흔들리고 숫자가 떠오른다
  function hitSeat(seat, text, cls) {
    const pt = seatPoint(seat);
    if (!pt) return;
    pt.el.classList.remove('shake', 'flash-dmg', 'flash-heal');
    void pt.el.offsetWidth;
    pt.el.classList.add(cls === 'heal' ? 'flash-heal' : 'shake', cls === 'heal' ? 'flash-heal' : 'flash-dmg');
    setTimeout(() => pt.el.classList.remove('shake', 'flash-dmg', 'flash-heal'), 620);
    floatText(pt.x, pt.y, text, cls);
  }
  function floatText(x, y, text, cls) {
    const layer = $('flyLayer');
    const el = document.createElement('div');
    el.className = 'float-num ' + (cls || '');
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    layer.appendChild(el);
    requestAnimationFrame(() => { el.style.top = (y - 38) + 'px'; el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 900);
  }
  function burst(seat, icon) {
    const pt = seatPoint(seat);
    if (!pt) return;
    const layer = $('flyLayer');
    const el = document.createElement('div');
    el.className = 'burst';
    el.textContent = icon;
    el.style.left = pt.x + 'px';
    el.style.top = pt.y + 'px';
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('go'));
    setTimeout(() => el.remove(), 800);
  }

  // Draw! 판정 — 중앙에 카드가 뒤집히며 성공/실패 도장이 찍힌다
  const DRAW_LABEL = { dynamite: '🧨 다이너마이트', jail: '⛓️ 감옥', barrel: '🛢️ 술통' };
  function drawReveal(ev) {
    const layer = $('flyLayer');
    if (!layer) return;
    const lRect = layer.getBoundingClientRect();
    if (!lRect.width) return;
    const box = document.createElement('div');
    box.className = 'draw-reveal';
    box.style.left = (lRect.width / 2) + 'px';
    box.style.top = (lRect.height * 0.42) + 'px';
    box.innerHTML = `
      <div class="dr-tag">${DRAW_LABEL[ev.tag] || 'Draw!'}</div>
      <div class="dr-card">${cardHTML(ev.card, 'mini')}</div>
      <div class="dr-verdict ${ev.ok ? 'ok' : 'no'}">${ev.ok ? '✔ 성공' : '✘ 실패'}</div>`;
    layer.appendChild(box);
    requestAnimationFrame(() => box.classList.add('go'));
    setTimeout(() => box.remove(), 1500);
  }

  // ── 거리선 (원탁 위 SVG 오버레이) ───────────────────────────────────
  function updateRangeLines() {
    const svg = $('rangeSvg');
    if (!svg) return;
    if (!targetMode || !cur) { svg.innerHTML = ''; return; }
    const wrap = $('tableWrap');
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    const originX = rect.width / 2;
    const originY = rect.height;
    let html = '';
    document.querySelectorAll('#playersGrid .pp:not(.dead)').forEach((el) => {
      const seat = +el.dataset.seat;
      const avatar = el.querySelector('.pp-avatar') || el;
      const r = avatar.getBoundingClientRect();
      const x = (r.left + r.width / 2 - rect.left).toFixed(1);
      const y = (r.top + r.height / 2 - rect.top).toFixed(1);
      const p = cur.players[seat];
      const ok = p.dist != null && cur.myRange != null && p.dist <= cur.myRange;
      html += `<line x1="${originX}" y1="${originY}" x2="${x}" y2="${y}" class="range-line ${ok ? 'in' : 'out'}" />`;
      if (p.dist != null) html += `<text x="${x}" y="${(+y - 16).toFixed(1)}" class="dist-tag ${ok ? 'in' : 'out'}">${p.dist}</text>`;
    });
    svg.innerHTML = html;
  }
  window.addEventListener('resize', updateRangeLines);

  // ── 로그 서랍 / 소리 ──────────────────────────────────────────────
  $('logToggle').addEventListener('click', () => $('logDrawer').classList.toggle('hidden'));
  (function initMute() {
    const b = $('muteBtn');
    if (!b) return;
    b.textContent = Audio.muted ? '🔇' : '🔊';
    b.addEventListener('click', () => { b.textContent = Audio.toggle() ? '🔇' : '🔊'; });
  })();

  function renderHand(st) {
    const wrap = $('myHand');
    const myTurn = st.turn === st.seat && st.phase === 'turn' && !st.pending;
    const reacting = st.pending && st.pending.actor === st.seat;
    wrap.innerHTML = st.myHand.map((c, i) => {
      let extra = '';
      if (reacting) {
        if (reactUsable(st.pending, c)) extra = 'selectable' + (reactSel.has(i) ? ' selected' : '');
        else extra = 'dim';
      } else if (myTurn) {
        if (targetMode && targetMode.idx === i) extra = 'selected';
      } else extra = 'idle';
      return cardHTML(c, extra, i);
    }).join('');
    $('endTurnBtn').classList.toggle('hidden', !myTurn);
  }
  // 리액션에서 이 카드를 쓸 수 있나 (캘러미티 호환 포함)
  function reactUsable(p, c) {
    const me = cur.players[cur.seat];
    const cal = me.character === 'calamity';
    if (p.type === 'bang' || p.type === 'gatling') return c.id === 'missed' || (cal && c.id === 'bang');
    if (p.type === 'indians' || p.type === 'duel') return c.id === 'bang' || (cal && c.id === 'missed');
    if (p.type === 'lethal') return c.id === 'beer';
    if (p.type === 'discard') return true;
    return false;
  }

  // ── 프롬프트/리액션 UI ────────────────────────────────────────────
  function renderPrompt(st) {
    const bar = $('promptBar');
    const area = $('reactArea');
    area.innerHTML = ''; area.classList.add('hidden');
    const p = st.pending;

    if (!p) {
      if (st.turn === st.seat && st.phase === 'turn') {
        bar.textContent = targetMode
          ? '🎯 대상을 탭하세요 (카드 다시 탭 = 취소)'
          : '내 턴 — 카드를 탭해 사용하세요';
        bar.classList.remove('hidden');
        document.body.classList.add('my-turn');
      } else {
        bar.textContent = `${st.players[st.turn].name}의 턴...`;
        bar.classList.remove('hidden');
        document.body.classList.remove('my-turn');
      }
      return;
    }
    if (p.waiting) {
      bar.textContent = `⏳ ${st.players[p.actor].name} 응답 대기...`;
      bar.classList.remove('hidden');
      return;
    }
    // 내가 응답할 차례
    bar.classList.remove('hidden');
    const btn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'rbtn ' + (cls || '');
      b.textContent = label;
      b.addEventListener('click', fn);
      area.appendChild(b);
    };
    const sel = () => [...reactSel];
    if (p.type === 'bang' || p.type === 'gatling') {
      bar.textContent = `💥 ${st.players[p.from].name}의 ${p.type === 'gatling' ? '개틀링' : 'BANG!'} — 빗나감! ${p.needMissed}장 필요`;
      btn(`💨 회피 (${reactSel.size}/${p.needMissed})`, 'ok', () => socket.emit('bang:action', { a: 'react', cards: sel() }));
      btn('💔 맞는다', 'no', () => socket.emit('bang:action', { a: 'react', pass: true }));
    } else if (p.type === 'indians') {
      bar.textContent = `🏹 인디언 습격 — BANG!을 버리거나 피해 1`;
      btn('💥 BANG! 버리기', 'ok', () => socket.emit('bang:action', { a: 'react', cards: sel() }));
      btn('💔 피해 받기', 'no', () => socket.emit('bang:action', { a: 'react', pass: true }));
    } else if (p.type === 'duel') {
      bar.textContent = `⚔️ 결투! BANG!을 버리거나 패배 (피해 1)`;
      btn('💥 응사!', 'ok', () => socket.emit('bang:action', { a: 'react', cards: sel() }));
      btn('🏳️ 패배', 'no', () => socket.emit('bang:action', { a: 'react', pass: true }));
    } else if (p.type === 'lethal') {
      bar.textContent = `☠️ 치명상! 맥주 ${p.beersNeeded}잔으로 회생할 수 있습니다`;
      btn(`🍺 맥주 사용 (${reactSel.size}/${p.beersNeeded})`, 'ok', () => socket.emit('bang:action', { a: 'react', cards: sel() }));
      btn('☠️ 포기', 'no', () => socket.emit('bang:action', { a: 'react', pass: true }));
    } else if (p.type === 'store') {
      bar.textContent = '🏪 잡화점 — 가져갈 카드를 고르세요';
      const row = document.createElement('div');
      row.className = 'store-row';
      row.innerHTML = p.cards.map((c, i) => cardHTML(c, 'selectable', i)).join('');
      row.addEventListener('click', (e) => {
        const el = e.target.closest('.card');
        if (el) socket.emit('bang:action', { a: 'react', pick: +el.dataset.i });
      });
      area.appendChild(row);
    } else if (p.type === 'discard') {
      bar.textContent = `🃏 손패 정리 — ${p.mustDiscard}장을 버려야 합니다 (손패 한도 = 체력)`;
      btn(`버리기 (${reactSel.size}/${p.mustDiscard})`, 'ok', () => socket.emit('bang:action', { a: 'react', cards: sel() }));
    }
    area.classList.remove('hidden');
  }

  // ── 입력: 손패/타겟/턴 종료 ───────────────────────────────────────
  $('myHand').addEventListener('click', (e) => {
    const el = e.target.closest('.card');
    if (!el || !cur) return;
    const i = +el.dataset.i;
    const reacting = cur.pending && cur.pending.actor === cur.seat && !cur.pending.waiting;
    if (reacting) {
      if (!reactUsable(cur.pending, cur.myHand[i])) return;
      if (reactSel.has(i)) reactSel.delete(i); else reactSel.add(i);
      renderHand(cur); renderPrompt(cur);
      return;
    }
    if (!(cur.turn === cur.seat && cur.phase === 'turn' && !cur.pending)) return;
    const card = cur.myHand[i];
    if (!card) return;
    const cal = cur.players[cur.seat].character === 'calamity';
    const needsTarget = NEED_TARGET.includes(card.id) || (cal && card.id === 'missed');
    if (targetMode && targetMode.idx === i) {
      targetMode = null;
      document.body.classList.remove('targeting');
      renderHand(cur); renderPrompt(cur); updateRangeLines();
      return;
    }
    if (needsTarget) {
      targetMode = { idx: i };
      document.body.classList.add('targeting');
      renderHand(cur); renderPrompt(cur); updateRangeLines();
      return;
    }
    socket.emit('bang:action', { a: 'play', idx: i });
  });

  // 플레이어 패널 탭 = 타겟 지정
  document.addEventListener('click', (e) => {
    const pp = e.target.closest('.pp');
    if (!pp || !targetMode || !cur) return;
    const seat = +pp.dataset.seat;
    if (seat === cur.seat) return;
    socket.emit('bang:action', { a: 'play', idx: targetMode.idx, target: seat });
    targetMode = null;
    document.body.classList.remove('targeting');
    updateRangeLines();
  });

  $('endTurnBtn').addEventListener('click', () => socket.emit('bang:action', { a: 'end' }));

  // ── 시간 은행 ─────────────────────────────────────────────────────
  let clockIv = null, clockSkew = 0;
  function bankRemain(st, seat) {
    if (!st.timeBanks) return null;
    let ms = st.timeBanks[seat];
    if (st.turn === seat && st.phase === 'turn' && !st.pending && st.turnStartedAt) {
      ms -= Math.max(0, (Date.now() + clockSkew) - st.turnStartedAt - (st.graceMs || 0));
    }
    return Math.max(0, ms);
  }
  const fmtBank = (ms) => ms == null ? '' : `⏱${Math.floor(ms / 60000)}:${String(Math.ceil(ms / 1000) % 60).padStart(2, '0')}`;
  function startClock(st) {
    clearInterval(clockIv);
    if (st.serverNow) clockSkew = st.serverNow - Date.now();
    document.querySelectorAll('.pp-bank').forEach((el) => {
      const s = +el.dataset.seat;
      el.textContent = fmtBank(st.timeBanks ? st.timeBanks[s] : null);
    });
    clockIv = setInterval(() => {
      if (!cur) return;
      const el = document.querySelector(`.pp-bank[data-seat="${cur.turn}"]`);
      if (!el) return;
      const rem = bankRemain(cur, cur.turn);
      el.textContent = fmtBank(rem);
      el.classList.toggle('low', rem != null && rem < 12000);
    }, 400);
  }

  // ── 종료 ──────────────────────────────────────────────────────────
  socket.on('bang:over', ({ winners, label, players }) => {
    $('overTitle').textContent = `🏆 ${label} 승리!`;
    $('roleReveal').innerHTML = players.map((p) => `
      <div class="rank-row${p.won ? ' me' : ''}">
        <span>${p.alive ? '🙂' : '☠️'} ${escapeHtml(p.name)}${p.ai ? ' 🤖' : ''}</span>
        <span>${ROLE_KO[p.role]}</span>
        <b>${p.won ? '승리' : ''}</b>
      </div>`).join('');
    $('overOverlay').classList.remove('hidden');
    $('overOverlay').classList.add('visible');
    store.clear();
  });

  // ── 초기화 ────────────────────────────────────────────────────────
  (function init() {
    const params = new URLSearchParams(location.search);
    const roomParam = params.get('room');
    socket.on('connect', () => {
      const token = store.token;
      if (!token) return;
      reconnectPending = true;
      socket.emit('bang:reconnect', { token });
    });
    if (roomParam) {
      $('codeInput').value = roomParam.toUpperCase();
      $('entryError').textContent = '닉네임을 입력하고 참가를 누르세요';
    }
    try {
      const saved = localStorage.getItem('bang_nick');
      if (saved) $('nickInput').value = saved;
      $('nickInput').addEventListener('change', () => localStorage.setItem('bang_nick', $('nickInput').value));
    } catch (e) {}
  })();
})();
