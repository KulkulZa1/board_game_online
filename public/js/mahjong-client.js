// 리치 마작 클라이언트 — 전용 페이지(/mahjong.html), 전용 소켓 이벤트(mahjong:*)
// 서버가 좌석별로 개인화한 상태를 보내므로 여기서는 렌더와 입력만 담당한다.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const socket = io();

  // ── 타일 렌더 ─────────────────────────────────────────────────────
  // 0-8 만 / 9-17 통 / 18-26 삭 / 27-33 자패(東南西北白發中)
  const HONOR_CH = ['東', '南', '西', '北', '白', '發', '中'];
  const WIND_KO = ['동', '남', '서', '북'];
  function tileHTML(t, extra) {
    if (t == null) return '';
    let cls = 'tile', body = '';
    if (t < 9) { cls += ' man'; body = `${t + 1}<i>만</i>`; }
    else if (t < 18) { cls += ' pin'; body = `${t - 8}<i>통</i>`; }
    else if (t < 27) { cls += ' sou'; body = `${t - 17}<i>삭</i>`; }
    else {
      const h = t - 27;
      cls += ' honor' + (h === 5 ? ' green' : h === 6 ? ' red' : '');
      body = HONOR_CH[h];
    }
    return `<div class="${cls}${extra ? ' ' + extra : ''}" data-t="${t}">${body}</div>`;
  }
  const tilesHTML = (arr, extra) => arr.map((t) => tileHTML(t, extra)).join('');

  // ── 상태 ──────────────────────────────────────────────────────────
  let mySeat = null;
  let roomCode = null;
  let isHost = false;
  let cur = null;          // 마지막 mahjong:state
  let riichiMode = false;  // 리치 선언용 타일 선택 중
  let resultTimer = null;

  const store = {
    get token() { try { return localStorage.getItem('mahjong_token'); } catch (e) { return null; } },
    set(token, code) { try { localStorage.setItem('mahjong_token', token); localStorage.setItem('mahjong_code', code); } catch (e) {} },
    clear() { try { localStorage.removeItem('mahjong_token'); localStorage.removeItem('mahjong_code'); } catch (e) {} },
  };

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  // ── 입장 흐름 ─────────────────────────────────────────────────────
  function nick() { return $('nickInput').value.trim() || '플레이어'; }

  $('createBtn').addEventListener('click', () => socket.emit('mahjong:create', { nickname: nick() }));
  $('soloBtn').addEventListener('click', () => {
    socket.emit('mahjong:create', { nickname: nick() });
    soloAuto = true;
  });
  let soloAuto = false;
  $('joinBtn').addEventListener('click', () => {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length < 4) { $('entryError').textContent = '방 코드를 입력하세요'; return; }
    socket.emit('mahjong:join', { code, nickname: nick() });
  });
  $('startBtn').addEventListener('click', () => socket.emit('mahjong:start'));
  $('copyLink').addEventListener('click', async () => {
    const url = `${location.origin}/mahjong.html?room=${roomCode}`;
    try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했습니다'); }
    catch (e) { prompt('초대 링크', url); }
  });
  $('againBtn').addEventListener('click', () => { store.clear(); location.href = '/mahjong.html'; });

  socket.on('mahjong:created', ({ code, token, seat }) => {
    roomCode = code; mySeat = seat; isHost = true;
    store.set(token, code);
    showWaitPane();
    if (soloAuto) { soloAuto = false; socket.emit('mahjong:start'); }
  });
  socket.on('mahjong:joined', ({ code, token, seat }) => {
    roomCode = code; mySeat = seat; isHost = false;
    store.set(token, code);
    showWaitPane();
  });
  socket.on('mahjong:error', ({ message, fatal }) => {
    $('entryError').textContent = message || '오류';
    toast(message || '오류');
    if (fatal) { store.clear(); showEntryPane(); }
  });
  socket.on('mahjong:room', (ls) => {
    renderSeats(ls);
    if (ls.status === 'waiting') $('startBtn').classList.toggle('hidden', !isHost);
  });
  socket.on('mahjong:begin', () => {
    $('lobbyOverlay').classList.remove('visible');
    $('table').classList.remove('hidden');
  });
  socket.on('mahjong:reconnected', ({ code, seat, status }) => {
    roomCode = code; mySeat = seat;
    $('roomChip').textContent = code;
    $('roomChip').classList.remove('hidden');
    if (status === 'active') {
      $('lobbyOverlay').classList.remove('visible');
      $('table').classList.remove('hidden');
    } else {
      showWaitPane();
    }
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
  }

  // ── 게임 상태 렌더 ────────────────────────────────────────────────
  socket.on('mahjong:state', (st) => {
    if (!st) return;
    cur = st;
    riichiMode = false;
    renderTable(st);
  });

  function rel(seat) { return (seat - mySeat + 4) % 4; }   // 0=나, 1=하가(우), 2=대면, 3=상가(좌)

  function renderTable(st) {
    // 중앙 정보
    $('roundInfo').textContent = `동${Math.min(st.round, 4)}국`;
    $('honbaInfo').textContent = st.honba ? `${st.honba}본장` : '';
    $('stickInfo').textContent = st.riichiSticks ? `공탁 ${st.riichiSticks}` : '';
    $('wallInfo').textContent = `잔여 ${st.wallCount}`;
    $('doraTiles').innerHTML = tilesHTML(st.doraIndicators, 'mini');

    // 상대 3인 — data-rel 1(하가) 2(대면) 3(상가)
    document.querySelectorAll('.opp').forEach((el) => {
      const r = +el.dataset.rel;
      const seat = (mySeat + r) % 4;
      el.querySelector('.opp-name').textContent = st.names[seat];
      el.querySelector('.opp-wind').textContent = WIND_KO[st.seatWinds[seat]];
      el.querySelector('.opp-score').textContent = st.scores[seat].toLocaleString();
      el.querySelector('.opp-tiles').textContent = `패 ${st.handCounts[seat]}`;
      el.querySelector('.opp-riichi').classList.toggle('hidden', !st.riichi[seat]);
      el.classList.toggle('active', st.turn === seat && st.phase === 'turn');
      el.querySelector('.opp-melds').innerHTML = st.melds[seat]
        .map((m) => `<span class="meld">${tilesHTML(m.tiles, 'mini')}</span>`).join('');
      el.querySelector('.opp-river').innerHTML = st.rivers[seat]
        .map((r2) => tileHTML(r2.tile, 'mini' + (r2.riichi ? ' riichi-tile' : '') + (r2.called ? ' called' : ''))).join('');
    });

    // 내 정보
    $('myName').textContent = st.names[mySeat];
    $('myWind').textContent = WIND_KO[st.seatWinds[mySeat]];
    $('myScore').textContent = st.scores[mySeat].toLocaleString();
    $('myRiichi').classList.toggle('hidden', !st.riichi[mySeat]);
    $('myRiver').innerHTML = st.rivers[mySeat]
      .map((r2) => tileHTML(r2.tile, (r2.riichi ? 'riichi-tile' : '') + (r2.called ? ' called' : ''))).join('');
    $('myMelds').innerHTML = st.melds[mySeat]
      .map((m) => `<span class="meld">${tilesHTML(m.tiles)}</span>`).join('');

    renderHand(st);
    renderActions(st);

    const myTurn = st.turn === mySeat && st.phase === 'turn';
    document.body.classList.toggle('my-turn', myTurn);
    $('turnHint').textContent = st.phase === 'calls'
      ? (st.offers ? '콜 하시겠습니까?' : '다른 플레이어 응답 대기...')
      : myTurn ? (st.riichi[mySeat] ? '리치 중 — 쯔모기리' : '버릴 패를 선택하세요') : `${st.names[st.turn]} 차례`;
  }

  function renderHand(st) {
    const wrap = $('myHand');
    const hand = st.hand.slice();
    // 쯔모패는 분리 표시
    let drawn = null;
    if (st.drawnTile != null) {
      const ix = hand.indexOf(st.drawnTile);
      if (ix >= 0) { hand.splice(ix, 1); drawn = st.drawnTile; }
    }
    const myTurn = st.turn === mySeat && st.phase === 'turn';
    const riichiTiles = riichiMode && st.canActions && st.canActions.riichi ? st.canActions.riichi : null;
    const locked = st.riichi[mySeat];
    const cls = (t) => {
      if (!myTurn) return 'idle';
      if (riichiTiles) return riichiTiles.includes(t) ? 'riichi-pick' : 'dim';
      if (locked) return t === st.drawnTile ? '' : 'dim';
      return '';
    };
    wrap.innerHTML = tilesHTML(hand.map((t) => t), '').replace(/class="tile/g, 'class="tile hand-tile');
    // 클래스 개별 적용을 위해 다시 구성
    wrap.innerHTML = hand.map((t) => tileHTML(t, 'hand-tile ' + cls(t))).join('') +
      (drawn != null ? `<span class="drawn-gap"></span>${tileHTML(drawn, 'hand-tile drawn ' + cls(drawn))}` : '');
  }

  function renderActions(st) {
    const bar = $('actionBar'); bar.innerHTML = '';
    const add = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'act-btn ' + (cls || '');
      b.textContent = label;
      b.addEventListener('click', fn);
      bar.appendChild(b);
    };
    if (st.phase === 'calls' && st.offers) {
      const o = st.offers;
      if (o.ron) add('론!', 'ron', () => socket.emit('mahjong:action', { a: 'ron' }));
      if (o.pon) add('펑', 'call', () => socket.emit('mahjong:action', { a: 'pon' }));
      if (o.chi) {
        o.chi.forEach((pair) => {
          add(`치 ${pair.map((t) => tileText(t)).join('')}`, 'call',
            () => socket.emit('mahjong:action', { a: 'chi', tiles: pair }));
        });
      }
      add('패스', 'pass', () => socket.emit('mahjong:action', { a: 'pass' }));
      return;
    }
    if (st.phase === 'turn' && st.turn === mySeat && st.canActions) {
      const a = st.canActions;
      if (a.tsumo) add('쯔모!', 'ron', () => socket.emit('mahjong:action', { a: 'tsumo' }));
      if (a.riichi && !riichiMode) add('리치', 'riichi', () => { riichiMode = true; renderTable(cur); });
      if (riichiMode) add('리치 취소', 'pass', () => { riichiMode = false; renderTable(cur); });
      if (a.ankan) a.ankan.forEach((t) => add(`깡 ${tileText(t)}`, 'call', () => socket.emit('mahjong:action', { a: 'ankan', t })));
    }
  }
  function tileText(t) {
    if (t < 9) return (t + 1) + '만';
    if (t < 18) return (t - 8) + '통';
    if (t < 27) return (t - 17) + '삭';
    return HONOR_CH[t - 27];
  }

  // 손패 클릭 → 타패 (리치 모드면 리치 선언)
  $('myHand').addEventListener('click', (e) => {
    const el = e.target.closest('.tile'); if (!el || !cur) return;
    if (cur.turn !== mySeat || cur.phase !== 'turn') return;
    const t = +el.dataset.t;
    if (riichiMode) {
      if (cur.canActions && cur.canActions.riichi && cur.canActions.riichi.includes(t)) {
        socket.emit('mahjong:action', { a: 'riichi', t });
        riichiMode = false;
      }
      return;
    }
    if (cur.riichi[mySeat] && t !== cur.drawnTile) return;   // 리치 중 쯔모기리 강제
    socket.emit('mahjong:action', { a: 'discard', t });
  });

  // ── 국 결과 / 대국 종료 ───────────────────────────────────────────
  socket.on('mahjong:hand-end', (r) => {
    const box = $('resultBox');
    if (r.type === 'draw') {
      box.innerHTML = `
        <h3>유국 (황패)</h3>
        <div class="ry-rows">${r.tenpai.map((tp, i) =>
          `<div class="ry-row"><span>${r.names[i]}</span><span class="${tp ? 'on' : 'off'}">${tp ? '텐파이' : '노텐'}</span>
           <span class="${r.movements[i] >= 0 ? 'plus' : 'minus'}">${fmtMove(r.movements[i])}</span></div>`).join('')}
        </div>`;
    } else {
      const winName = r.names[r.winner];
      const how = r.type === 'tsumo' ? '쯔모' : `론 (${r.names[r.loser]})`;
      box.innerHTML = `
        <h3>${winName} ${how}!</h3>
        <div class="win-hand">${tilesHTML(r.hand, 'mini')}${r.melds.map((m) => `<span class="meld">${tilesHTML(m.tiles, 'mini')}</span>`).join('')}</div>
        <div class="yaku-list">${r.yaku.map((y) => `<div class="yaku-row"><span>${y.name}</span><b>${r.yakuman ? '역만' : y.han + '판'}</b></div>`).join('')}</div>
        <div class="score-line">${r.yakuman ? `역만${r.yakuman > 1 ? ' ×' + r.yakuman : ''}` : `${r.han}판 ${r.fu}부`}</div>
        ${r.ura && r.ura.length ? `<div class="dora-line">뒷도라 ${tilesHTML(r.ura, 'mini')}</div>` : ''}
        <div class="ry-rows">${r.movements.map((mv, i) =>
          `<div class="ry-row"><span>${r.names[i]}</span><span></span><span class="${mv >= 0 ? 'plus' : 'minus'}">${fmtMove(mv)}</span></div>`).join('')}
        </div>`;
    }
    $('resultModal').classList.remove('hidden');
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => $('resultModal').classList.add('hidden'), 6000);
  });
  function fmtMove(n) { return n > 0 ? '+' + n.toLocaleString() : n < 0 ? n.toLocaleString() : '—'; }

  socket.on('mahjong:over', ({ ranking }) => {
    $('resultModal').classList.add('hidden');
    const wrap = $('rankList'); wrap.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '4위'];
    ranking.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'rank-row' + (r.seat === mySeat ? ' me' : '');
      d.innerHTML = `<span>${medals[i]} ${r.name}${r.ai ? ' 🤖' : ''}</span><b>${r.score.toLocaleString()}</b>`;
      wrap.appendChild(d);
    });
    $('overOverlay').classList.remove('hidden');
    $('overOverlay').classList.add('visible');
    store.clear();
  });

  // ── 초기화 — URL ?room= / 재접속 토큰 ─────────────────────────────
  function init() {
    const params = new URLSearchParams(location.search);
    const roomParam = params.get('room');
    const token = store.token;
    if (token) {
      socket.on('connect', () => socket.emit('mahjong:reconnect', { token }));
      // 실패(fatal) 시 mahjong:error 핸들러가 entryPane으로 되돌린다
    }
    if (roomParam) {
      $('codeInput').value = roomParam.toUpperCase();
      $('entryError').textContent = '닉네임을 입력하고 참가를 누르세요';
    }
    try {
      const saved = localStorage.getItem('mahjong_nick');
      if (saved) $('nickInput').value = saved;
      $('nickInput').addEventListener('change', () => localStorage.setItem('mahjong_nick', $('nickInput').value));
    } catch (e) {}
  }
  init();
})();
