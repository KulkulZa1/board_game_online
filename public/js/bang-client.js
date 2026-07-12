// BANG! 클라이언트 — 전용 페이지(/bang.html), 전용 이벤트(bang:*)
// 서버가 좌석별 개인화 상태를 보낸다. 여기는 렌더/타겟팅/리액션 입력만.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
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
  const NEED_TARGET = ['bang', 'panic', 'catbalou', 'duel', 'jail'];

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
    if ($('lobbyOverlay').classList.contains('visible')) $('entryError').textContent = message || '오류';
    toast(message || '오류');
    if (fatal) { store.clear(); showEntryPane(); }
  });
  socket.on('bang:room', renderSeats);
  socket.on('bang:begin', () => {
    $('lobbyOverlay').classList.remove('visible');
    $('table').classList.remove('hidden');
  });
  socket.on('bang:reconnected', ({ code, seat, status }) => {
    roomCode = code; mySeat = seat;
    $('roomChip').textContent = code;
    $('roomChip').classList.remove('hidden');
    if (status === 'active') {
      $('lobbyOverlay').classList.remove('visible');
      $('table').classList.remove('hidden');
    } else showWaitPane();
  });

  function showEntryPane() {
    $('entryPane').classList.remove('hidden');
    $('waitPane').classList.add('hidden');
    $('lobbyOverlay').classList.add('visible');
  }
  function showWaitPane() {
    $('entryPane').classList.add('hidden');
    $('waitPane').classList.remove('hidden');
    $('waitCode').textContent = roomCode;
    $('roomChip').textContent = roomCode;
    $('roomChip').classList.remove('hidden');
    $('startBtn').classList.toggle('hidden', !isHost);
    $('waitHint').classList.toggle('hidden', isHost);
  }
  function renderSeats(ls) {
    const wrap = $('seatList'); wrap.innerHTML = '';
    ls.seats.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'seat-row' + (i === mySeat ? ' me' : '');
      d.innerHTML = s
        ? `<span>${s.type === 'ai' ? '🤖' : '🙂'} ${s.name}${i === ls.hostSeat ? ' 👑' : ''}</span><span class="${s.connected ? 'on' : 'off'}">${s.connected ? '접속' : '대기'}</span>`
        : `<span class="dim">빈 자리 — 시작 시 AI</span><span></span>`;
      wrap.appendChild(d);
    });
    if (ls.status === 'waiting') $('startBtn').classList.toggle('hidden', !isHost);
  }

  // ── 게임 렌더 ─────────────────────────────────────────────────────
  socket.on('bang:state', (st) => {
    if (!st) return;
    cur = st;
    targetMode = null;
    reactSel = new Set();
    render(st);
  });

  function render(st) {
    document.body.classList.toggle('targeting', !!targetMode);
    renderPlayers(st);
    renderCenter(st);
    renderMe(st);
    renderHand(st);
    renderPrompt(st);
    startClock(st);
  }

  function playerPanelHTML(st, i) {
    const p = st.players[i];
    const me = i === st.seat;
    const active = st.turn === i && st.phase === 'turn';
    const acting = st.pending && st.pending.actor === i;
    const dead = !p.alive;
    const role = p.role ? ROLE_KO[p.role] : '❔';
    const equip = p.equip.map((c) => `<span title="${(CARDS[c.id] || [c.id])[0]}">${(CARDS[c.id] || ['', '❓'])[1]}</span>`).join('');
    const marks = `${p.jail ? '⛓️' : ''}${p.dynamite ? '🧨' : ''}`;
    return `<div class="pp${me ? ' me' : ''}${active ? ' active' : ''}${acting ? ' acting' : ''}${dead ? ' dead' : ''}" data-seat="${i}">
      <div class="pp-top"><b>${p.name}</b><span class="pp-role">${role}</span></div>
      <div class="pp-char" title="${p.characterDesc || ''}">${p.characterName}</div>
      <div class="pp-hp">${dead ? '☠️' : hearts(p.hp, p.maxHp)}</div>
      <div class="pp-sub">
        <span title="손패">🂠${p.handCount}</span>
        ${p.dist != null ? `<span class="pp-dist" title="거리">📏${p.dist}</span>` : ''}
        <span class="pp-bank" data-seat="${i}"></span>
      </div>
      <div class="pp-equip">${equip}${marks}</div>
    </div>`;
  }
  function renderPlayers(st) {
    const others = [];
    for (let k = 1; k < st.players.length; k++) others.push((st.seat + k) % st.players.length);
    $('playersGrid').innerHTML = others.map((i) => playerPanelHTML(st, i)).join('');
  }
  function renderMe(st) {
    $('myPanel').innerHTML = playerPanelHTML(st, st.seat);
  }
  function renderCenter(st) {
    $('deckCount').textContent = `🂠 산 ${st.deckCount}`;
    $('discardTop').innerHTML = st.discardTop ? '버림: ' + cardHTML(st.discardTop, 'mini') : '';
    $('logBox').innerHTML = st.log.map((l) => `<div>${l}</div>`).join('');
    $('logBox').scrollTop = $('logBox').scrollHeight;
  }

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
      renderHand(cur); renderPrompt(cur);
      return;
    }
    if (needsTarget) {
      targetMode = { idx: i };
      document.body.classList.add('targeting');
      renderHand(cur); renderPrompt(cur);
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
        <span>${p.alive ? '🙂' : '☠️'} ${p.name}${p.ai ? ' 🤖' : ''}</span>
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
    const token = store.token;
    if (token) socket.on('connect', () => socket.emit('bang:reconnect', { token }));
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
