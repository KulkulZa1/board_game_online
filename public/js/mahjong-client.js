// 리치 마작 클라이언트 — 전용 페이지(/mahjong.html), 전용 소켓 이벤트(mahjong:*)
// 서버가 좌석별로 개인화한 상태를 보내므로 여기서는 렌더와 입력만 담당한다.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
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
  let reconnectPending = false;
  let selectedTile = null; // 도우미 ON: 첫 탭 미리보기 → 둘째 탭 확정
  // 🧭 초심자 도우미 — 기본 ON (처음 오는 사람을 위해), 저장됨
  let assist = true;
  try { assist = localStorage.getItem('mahjong_assist') !== '0'; } catch (e) {}

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
  function setLobbyVisible(visible) {
    const overlay = $('lobbyOverlay');
    overlay.classList.toggle('visible', visible);
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    overlay.inert = !visible;
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
    const resumeFailed = fatal && reconnectPending;
    reconnectPending = false;
    if (!resumeFailed) {
      $('entryError').textContent = message || '오류';
      toast(message || '오류');
    }
    if (fatal) { store.clear(); showEntryPane(); }
  });
  socket.on('mahjong:room', (ls) => {
    renderSeats(ls);
    if (ls.status === 'waiting') $('startBtn').classList.toggle('hidden', !isHost);
  });
  socket.on('mahjong:begin', () => {
    setLobbyVisible(false);
    $('table').classList.remove('hidden');
  });
  socket.on('mahjong:reconnected', ({ code, seat, status }) => {
    reconnectPending = false;
    roomCode = code; mySeat = seat;
    $('roomChip').textContent = code;
    $('roomChip').classList.remove('hidden');
    if (status === 'active') {
      setLobbyVisible(false);
      $('table').classList.remove('hidden');
    } else {
      showWaitPane();
    }
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
  }

  // ── 게임 상태 렌더 ────────────────────────────────────────────────
  socket.on('mahjong:state', (st) => {
    if (!st) return;
    cur = st;
    riichiMode = false;
    selectedTile = null;
    renderTable(st);
  });

  function rel(seat) { return (seat - mySeat + 4) % 4; }   // 0=나, 1=하가(우), 2=대면, 3=상가(좌)

  function renderTable(st) {
    // 중앙 사각형 — 국·잔여·본장·공탁·도라
    $('roundInfo').textContent = `동${Math.min(st.round, 4)}국`;
    const sub = [];
    sub.push(`잔여 ${st.wallCount}`);
    if (st.honba) sub.push(`${st.honba}본장`);
    if (st.riichiSticks) sub.push(`공탁 ${st.riichiSticks}`);
    $('subInfo').textContent = sub.join(' · ');
    $('doraTiles').innerHTML = tilesHTML(st.doraIndicators, 'mini');

    // 4방향 존 — 강/멜드/패 뒷면
    document.querySelectorAll('#board .zone').forEach((el) => {
      const r = +el.dataset.rel;
      const seat = (mySeat + r) % 4;
      const riverEl = el.querySelector('.zriver');
      if (riverEl) {
        riverEl.innerHTML = st.rivers[seat]
          .map((d) => tileHTML(d.tile, 'mini' + (d.riichi ? ' riichi-tile' : '') + (d.called ? ' called' : ''))).join('');
      }
      const meldsEl = el.querySelector('.zmelds');
      if (meldsEl) {
        meldsEl.innerHTML = st.melds[seat]
          .map((m) => `<span class="meld">${tilesHTML(m.tiles, 'mini')}</span>`).join('');
      }
      const backsEl = el.querySelector('.backs');
      if (backsEl) {
        const n = Math.max(0, Math.min(st.handCounts[seat], 14));
        backsEl.innerHTML = '<span class="back"></span>'.repeat(n);
      }
    });

    // 중앙 플레이어 스트립 — 이름·풍·점수·시간은행·리치
    document.querySelectorAll('#centerSq .pinfo').forEach((el) => {
      const r = +el.dataset.rel;
      const seat = (mySeat + r) % 4;
      const active = st.turn === seat && st.phase === 'turn';
      el.classList.toggle('active', active);
      el.classList.toggle('riichi-on', !!st.riichi[seat]);
      el.innerHTML =
        `<span class="pw">${WIND_KO[st.seatWinds[seat]]}</span>` +
        `<b class="pn">${escapeHtml(st.names[seat])}</b>` +
        `<span class="ps">${st.scores[seat].toLocaleString()}</span>` +
        `<span class="pt" data-seat="${seat}">${fmtBank(bankRemain(st, seat))}</span>` +
        (st.riichi[seat] ? '<span class="rstick" title="리치">▮</span>' : '');
    });

    // 내 멜드/손패
    $('myMelds').innerHTML = st.melds[mySeat]
      .map((m) => `<span class="meld">${tilesHTML(m.tiles)}</span>`).join('');
    renderHand(st);
    renderActions(st);

    const myTurn = st.turn === mySeat && st.phase === 'turn';
    document.body.classList.toggle('my-turn', myTurn);
    $('turnHint').textContent = st.phase === 'calls'
      ? (st.offers ? '콜 하시겠습니까?' : '다른 플레이어 응답 대기...')
      : myTurn ? (st.riichi[mySeat] ? '리치 중 — 잠시 후 자동으로 버립니다' : (assist ? '패를 탭해 확인 → 한 번 더 탭해 버리기' : '버릴 패를 선택하세요')) : `${st.names[st.turn]} 차례`;
    renderAssist(st);
    startClockTick(st);
  }

  // ── 체스식 시간 은행 표시 — 유예(5초) 초과분만 은행에서 차감 ──────
  let clockIv = null;
  let clockSkew = 0;   // serverNow - Date.now()
  function bankRemain(st, seat) {
    if (!st.timeBanks) return null;
    let ms = st.timeBanks[seat];
    if (st.turn === seat && st.phase === 'turn' && st.turnStartedAt && !st.riichi[seat]) {
      const elapsed = (Date.now() + clockSkew) - st.turnStartedAt;
      ms -= Math.max(0, elapsed - (st.graceMs || 0));
    }
    return Math.max(0, ms);
  }
  function fmtBank(ms) {
    if (ms == null) return '';
    const s2 = Math.ceil(ms / 1000);
    return `⏱${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`;
  }
  function startClockTick(st) {
    clearInterval(clockIv);
    if (st.serverNow) clockSkew = st.serverNow - Date.now();
    if (!(st.phase === 'turn' && st.timeBanks)) return;
    clockIv = setInterval(() => {
      if (!cur) return;
      const seat = cur.turn;
      const el = document.querySelector(`.pt[data-seat="${seat}"]`);
      if (!el) return;
      const rem = bankRemain(cur, seat);
      el.textContent = fmtBank(rem);
      el.classList.toggle('low', rem != null && rem < 15000);
    }, 300);
  }

  // ── 🧭 도우미 정보 바 ─────────────────────────────────────────────
  function renderAssist(st) {
    const bar = $('assistBar');
    if (!bar) return;
    if (!assist) { bar.classList.add('hidden'); return; }
    const myTurn = st.turn === mySeat && st.phase === 'turn';
    let html = '';
    if (st.phase === 'calls' && st.offers) {
      // 콜 교육 힌트
      if (st.offers.ron) html = '<b class="good">론!</b> 상대가 버린 패로 완성했습니다 — 화료하세요';
      else html = '펑·치를 하면 <b>멘젠이 깨져 리치를 걸 수 없습니다</b>. 확신이 없으면 패스가 안전해요';
    } else if (myTurn && st.hint) {
      const h = st.hint;
      const info = selectedTile != null ? h.discards.find((d) => d.t === selectedTile) : null;
      if (info) {
        // 선택한 패 미리보기
        const after = info.shanten === 0
          ? `<b class="good">텐파이!</b> 대기 ${info.waits.map((w) => tileText(w.t) + '(' + w.n + '장)').join(' · ')}`
          : `${info.shanten}샹텐 · 받는 패 ${info.ukeire}장`;
        html = `${tileText(selectedTile)} 버리면 → ${after} <span class="dim2">· 한 번 더 탭하면 버립니다</span>`;
      } else if (h.shanten === 0) {
        const best = h.discards.filter((d) => d.best);
        html = `<b class="good">텐파이까지 왔어요!</b> 추천: ${best.map((d) => tileText(d.t)).join(' / ')}` +
          (st.canActions && st.canActions.riichi ? ' — <b class="good">리치</b>를 걸 수 있습니다' : '');
      } else {
        const best = h.discards.filter((d) => d.best);
        html = `${h.shanten}샹텐 (완성까지 ${h.shanten}걸음) · 추천 타패: <b>${best.map((d) => tileText(d.t)).join(' / ')}</b>`;
      }
    } else if (myTurn && st.riichi[mySeat]) {
      html = '리치 중 — 쯔모 패를 자동으로 버립니다. 대기패가 나오면 론/쯔모!';
    }
    bar.innerHTML = html;
    bar.classList.toggle('hidden', !html);
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
    const bestSet = new Set(
      assist && st.hint ? st.hint.discards.filter((d) => d.best).map((d) => d.t) : []
    );
    const cls = (t) => {
      let c = '';
      if (!myTurn) return 'idle';
      if (riichiTiles) c = riichiTiles.includes(t) ? 'riichi-pick' : 'dim';
      else if (locked) c = t === st.drawnTile ? '' : 'dim';
      if (assist && bestSet.has(t) && !locked && !c.includes('dim')) c += ' best-discard';
      if (selectedTile === t) c += ' selected';
      return c;
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
      if (!(cur.canActions && cur.canActions.riichi && cur.canActions.riichi.includes(t))) return;
      if (assist && selectedTile !== t) { selectedTile = t; renderTable(cur); return; }   // 1차 탭: 대기 미리보기
      socket.emit('mahjong:action', { a: 'riichi', t });
      riichiMode = false;
      return;
    }
    if (cur.riichi[mySeat] && t !== cur.drawnTile) return;   // 리치 중 쯔모기리 강제
    if (assist && selectedTile !== t) { selectedTile = t; renderTable(cur); return; }     // 1차 탭: 정보 미리보기
    socket.emit('mahjong:action', { a: 'discard', t });
  });

  // ── 국 결과 / 대국 종료 ───────────────────────────────────────────
  socket.on('mahjong:hand-end', (r) => {
    const box = $('resultBox');
    if (r.type === 'draw') {
      box.innerHTML = `
        <h3>유국 (황패)</h3>
        <div class="ry-rows">${r.tenpai.map((tp, i) =>
          `<div class="ry-row"><span>${escapeHtml(r.names[i])}</span><span class="${tp ? 'on' : 'off'}">${tp ? '텐파이' : '노텐'}</span>
           <span class="${r.movements[i] >= 0 ? 'plus' : 'minus'}">${fmtMove(r.movements[i])}</span></div>`).join('')}
        </div>`;
    } else {
      const winName = escapeHtml(r.names[r.winner]);
      const how = r.type === 'tsumo' ? '쯔모' : `론 (${escapeHtml(r.names[r.loser])})`;
      box.innerHTML = `
        <h3>${winName} ${how}!</h3>
        <div class="win-hand">${tilesHTML(r.hand, 'mini')}${r.melds.map((m) => `<span class="meld">${tilesHTML(m.tiles, 'mini')}</span>`).join('')}</div>
        <div class="yaku-list">${r.yaku.map((y) => `<div class="yaku-row"><span>${y.name}</span><b>${r.yakuman ? '역만' : y.han + '판'}</b></div>`).join('')}</div>
        <div class="score-line">${r.yakuman ? `역만${r.yakuman > 1 ? ' ×' + r.yakuman : ''}` : `${r.han}판 ${r.fu}부`}</div>
        ${r.ura && r.ura.length ? `<div class="dora-line">뒷도라 ${tilesHTML(r.ura, 'mini')}</div>` : ''}
        <div class="ry-rows">${r.movements.map((mv, i) =>
          `<div class="ry-row"><span>${escapeHtml(r.names[i])}</span><span></span><span class="${mv >= 0 ? 'plus' : 'minus'}">${fmtMove(mv)}</span></div>`).join('')}
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
      d.innerHTML = `<span>${medals[i]} ${escapeHtml(r.name)}${r.ai ? ' 🤖' : ''}</span><b>${r.score.toLocaleString()}</b>`;
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
    socket.on('connect', () => {
      const token = store.token;
      if (!token) return;
      reconnectPending = true;
      socket.emit('mahjong:reconnect', { token });
    });
    if (roomParam) {
      $('codeInput').value = roomParam.toUpperCase();
      $('entryError').textContent = '닉네임을 입력하고 참가를 누르세요';
    }
    const ab = $('assistBtn');
    if (ab) {
      ab.classList.toggle('on', assist);
      ab.addEventListener('click', () => {
        assist = !assist;
        try { localStorage.setItem('mahjong_assist', assist ? '1' : '0'); } catch (e) {}
        ab.classList.toggle('on', assist);
        toast(assist ? '🧭 도우미 켜짐 — 추천 타패와 샹텐을 표시합니다' : '도우미 꺼짐 — 한 번 탭으로 바로 버립니다');
        selectedTile = null;
        if (cur) renderTable(cur);
      });
    }
    try {
      const saved = localStorage.getItem('mahjong_nick');
      if (saved) $('nickInput').value = saved;
      $('nickInput').addEventListener('change', () => localStorage.setItem('mahjong_nick', $('nickInput').value));
    } catch (e) {}
  }
  init();
})();
