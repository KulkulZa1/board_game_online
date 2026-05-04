// 전역 토스트 (게스트 프로필 등 inline onclick에서 사용)
window.showToast = function(msg) {
  const toast = document.getElementById('copy-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
};

// ========== 규칙 모달 ==========
window.showRules = function(gameType) {
  const meta = GameRegistry.getGame(gameType);
  const data = meta ? meta.rules : null;
  if (!data) return;
  document.getElementById('rules-title').textContent = data.title;
  const body = document.getElementById('rules-body');
  body.innerHTML = data.sections.map(s =>
    `<div class="rules-section">
       <div class="rules-section-head">${s.head}</div>
       <div class="rules-section-text">${s.text.replace(/\n/g, '<br>')}</div>
     </div>`
  ).join('');
  document.getElementById('rules-modal').style.display = 'flex';
};

window.closeRules = function() {
  document.getElementById('rules-modal').style.display = 'none';
};

// ESC 키로 모달 닫기
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    window.closeRules();
    window.closeStatsModal();
    window.closeGuestProfile();
  }
});

// ========== 게스트 프로필 모달 ==========
window.showGuestProfile = function() {
  if (typeof Guest === 'undefined') return;
  const input = document.getElementById('guest-name-input');
  if (input) input.value = Guest.getName();
  const modal = document.getElementById('guest-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeGuestProfile = function() {
  const modal = document.getElementById('guest-modal');
  if (modal) modal.style.display = 'none';
};

window.saveGuestName = function() {
  if (typeof Guest === 'undefined') return;
  const input = document.getElementById('guest-name-input');
  if (!input) return;
  Guest.setName(input.value);
  const label = document.getElementById('guest-name-label');
  if (label) label.textContent = Guest.getName();
  window.closeGuestProfile();
  showToast('닉네임이 저장되었습니다.');
};

// 로드 시 게스트 이름 표시
(function() {
  if (typeof Guest !== 'undefined') {
    const label = document.getElementById('guest-name-label');
    if (label) label.textContent = Guest.getName();
  }
})();

// ========== 개인 전적 모달 ==========
window.showStatsModal = function() {
  if (typeof Stats === 'undefined') return;
  const data      = Stats.getAll();
  const names     = Stats.getGameNames();
  const statsModal = document.getElementById('stats-modal');
  const table      = document.getElementById('stats-table');

  let html = `<thead><tr>
    <th>게임</th><th>승</th><th>패</th><th>무</th><th>총계</th>
  </tr></thead><tbody>`;

  let totalW = 0, totalL = 0, totalD = 0;
  for (const [key, label] of Object.entries(names)) {
    const s = data[key] || { wins: 0, losses: 0, draws: 0 };
    const total = s.wins + s.losses + s.draws;
    totalW += s.wins; totalL += s.losses; totalD += s.draws;
    html += `<tr>
      <td>${label}</td>
      <td class="stats-win">${s.wins}</td>
      <td class="stats-loss">${s.losses}</td>
      <td class="stats-draw">${s.draws}</td>
      <td>${total}</td>
    </tr>`;
  }
  const grandTotal = totalW + totalL + totalD;
  html += `</tbody><tfoot><tr>
    <td><strong>합계</strong></td>
    <td class="stats-win"><strong>${totalW}</strong></td>
    <td class="stats-loss"><strong>${totalL}</strong></td>
    <td class="stats-draw"><strong>${totalD}</strong></td>
    <td><strong>${grandTotal}</strong></td>
  </tr></tfoot>`;

  table.innerHTML = html;
  statsModal.style.display = 'flex';
};

window.closeStatsModal = function() {
  const m = document.getElementById('stats-modal');
  if (m) m.style.display = 'none';
};

// ========== 혼자하기 (vs AI) ==========
window.startSolo = function(gameType) {
  const origBack = window.backToGameSelect; // 현재 backToGameSelect 캡처 (IIFE 내 정의된 것)

  // 색상 선택 화면 표시 (기존 create-section 재활용)
  const gameSelectSection = document.getElementById('game-select-section');
  const createSection     = document.getElementById('create-section');
  const createTitle       = document.getElementById('create-title');
  const colorSection      = document.getElementById('color-section');
  const boardSizeGroup    = document.getElementById('board-size-group');
  const createBtn         = document.getElementById('create-btn');

  // 솔로 옵션 상태
  let soloBoardSize  = null;
  let soloNumDecks   = 2;
  let soloWinCond    = 2;

  // 솔로 전용 UI
  gameSelectSection.style.display = 'none';
  createSection.style.display     = '';
  const _soloGameMeta = GameRegistry.getGame(gameType);
  createTitle.textContent = `혼자하기 — ${_soloGameMeta ? _soloGameMeta.name : gameType}`;
  document.getElementById('color-label').textContent = '내 색상 선택 (AI가 반대 색)';

  // 모든 form-group 숨김 후 필요한 것만 표시
  document.querySelectorAll('.form-group').forEach(g => { g.style.display = 'none'; });

  // 색상 버튼 라벨 - 게임별 설정
  const _soloMeta = GameRegistry.getGame(gameType) || GameRegistry.getGame('chess');
  document.getElementById('icon-white').textContent  = _soloMeta.soloIconW;
  document.getElementById('label-white').textContent = _soloMeta.soloLabelW;
  document.getElementById('icon-black').textContent  = _soloMeta.soloIconB;
  document.getElementById('label-black').textContent = _soloMeta.soloLabelB;

  // 인디언 포커: 색상 선택 불필요, 덱/승리조건 표시
  if (gameType === 'indianpoker') {
    colorSection.style.display = 'none';
    boardSizeGroup.style.display = '';
    boardSizeGroup.innerHTML = `
      <label class="create-label">덱 수</label>
      <div class="board-size-btns" id="solo-deck-btns">
        ${[1,2,3].map(n =>
          `<button class="size-btn${n===2?' active':''}" onclick="window._setSoloDecks(${n},this)">${n}덱 (${n*10}장)</button>`
        ).join('')}
      </div>
      <label class="create-label" style="margin-top:12px;">승리 조건</label>
      <div class="board-size-btns" id="solo-wincond-btns">
        <button class="size-btn" onclick="window._setSoloWinCond(1,this)">칩 모두 획득 시 종료</button>
        <button class="size-btn active" onclick="window._setSoloWinCond(2,this)">덱 소진 후 칩 비교</button>
      </div>`;
  } else {
    // 색상 선택 표시 (인디언 포커 외)
    colorSection.style.display = '';

    // 보드 크기 선택 (오목/사목)
    if (gameType === 'omok') {
      soloBoardSize = { size: 15 };
      boardSizeGroup.style.display = '';
      boardSizeGroup.innerHTML = `
        <label class="create-label">보드 크기</label>
        <div class="board-size-btns">
          ${[13,15,17,19].map(s =>
            `<button class="size-btn${s===15?' active':''}" onclick="window._setSoloBoardSizeOmok(${s},this)">${s}×${s}</button>`
          ).join('')}
        </div>`;
    } else if (gameType === 'connect4') {
      soloBoardSize = { rows: 6, cols: 7 };
      const presets = [{rows:5,cols:4},{rows:6,cols:7},{rows:7,cols:8},{rows:8,cols:9}];
      boardSizeGroup.style.display = '';
      boardSizeGroup.innerHTML = `
        <label class="create-label">보드 크기</label>
        <div class="board-size-btns">
          ${presets.map(p =>
            `<button class="size-btn${p.rows===6&&p.cols===7?' active':''}" onclick="window._setSoloBoardSizeC4(${p.rows},${p.cols},this)">${p.rows}행×${p.cols}열</button>`
          ).join('')}
        </div>`;
    } else {
      boardSizeGroup.style.display = 'none';
      boardSizeGroup.innerHTML = '';
    }
  }

  // 솔로 보드 크기 핸들러 (클로저로 soloBoardSize 참조)
  window._setSoloBoardSizeOmok = function(size, btn) {
    soloBoardSize = { size };
    btn.closest('.board-size-btns').querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
  window._setSoloBoardSizeC4 = function(rows, cols, btn) {
    soloBoardSize = { rows, cols };
    btn.closest('.board-size-btns').querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
  window._setSoloDecks = function(n, btn) {
    soloNumDecks = n;
    btn.closest('.board-size-btns').querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
  window._setSoloWinCond = function(wc, btn) {
    soloWinCond = wc;
    btn.closest('.board-size-btns').querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };

  // "방 만들기" → "시작"
  createBtn.textContent = '시작';
  createBtn.onclick = (e) => {
    e.preventDefault();
    const selectedColorBtn = document.querySelector('.color-btn.active');
    const color = selectedColorBtn ? selectedColorBtn.dataset.color : 'white';
    // 모든 form-group 복원
    document.querySelectorAll('.form-group').forEach(g => { g.style.display = ''; });
    createBtn.textContent = '방 만들기';
    createBtn.onclick = null;

    let url = `/game.html?solo=${gameType}&color=${color}`;
    if (soloBoardSize) {
      if (soloBoardSize.size) {
        url += `&boardSize=${soloBoardSize.size}`;
      } else if (soloBoardSize.rows) {
        url += `&boardRows=${soloBoardSize.rows}&boardCols=${soloBoardSize.cols}`;
      }
    }
    if (gameType === 'indianpoker') {
      url += `&numDecks=${soloNumDecks}&winCondition=${soloWinCond}`;
    }
    window.location.href = url;
  };

  // 뒤로 버튼 처리 복원
  window.backToGameSelect = function() {
    document.querySelectorAll('.form-group').forEach(g => { g.style.display = ''; });
    const cs = document.getElementById('color-section');
    if (cs) cs.style.display = '';
    if (boardSizeGroup) { boardSizeGroup.style.display = 'none'; boardSizeGroup.innerHTML = ''; }
    createBtn.textContent = '방 만들기';
    createBtn.onclick = null;
    window.backToGameSelect = origBack;
    createSection.style.display     = 'none';
    gameSelectSection.style.display = '';
  };
};


window.confirmResetStats = function() {
  if (!confirm('모든 전적 기록을 초기화하시겠습니까?')) return;
  if (typeof Stats !== 'undefined') Stats.reset();
  window.showStatsModal(); // 테이블 갱신
};

(function () {
  const socket = io();
  const params = new URLSearchParams(location.search);
  const roomIdFromUrl = params.get('room');
  const gameFromUrl   = params.get('game'); // 'chess' | 'omok'

  // State
  let selectedGame      = null;  // 'chess' | 'omok'
  let selectedColor     = 'white';
  let selectedMinutes   = 10;
  let isCustomTime      = false;
  let currentRoomId     = null;
  let selectedBoardSize = null; // { size } for omok | { rows, cols } for connect4
  let selectedIpOpts   = { numDecks: 2, winCondition: 2 }; // 인디언 포커 옵션

  // DOM
  const gameSelectSection = document.getElementById('game-select-section');
  const createSection     = document.getElementById('create-section');
  const waitingSection    = document.getElementById('waiting-section');
  const joinSection       = document.getElementById('join-section');
  const errorSection      = document.getElementById('error-section');

  // ========== Section visibility ==========
  function showGameSelectSection() {
    gameSelectSection.style.display = '';
    document.getElementById('arcade-section').style.display = '';
    createSection.style.display     = 'none';
    waitingSection.style.display    = 'none';
    joinSection.style.display       = 'none';
    errorSection.style.display      = 'none';
  }

  function showCreateSection() {
    gameSelectSection.style.display = 'none';
    document.getElementById('arcade-section').style.display = 'none';
    createSection.style.display     = '';
    waitingSection.style.display    = 'none';
    joinSection.style.display       = 'none';
    errorSection.style.display      = 'none';
  }

  function showWaitingSection(roomId) {
    gameSelectSection.style.display = 'none';
    document.getElementById('arcade-section').style.display = 'none';
    createSection.style.display     = 'none';
    waitingSection.style.display    = '';
    joinSection.style.display       = 'none';
    errorSection.style.display      = 'none';

    const shareUrl = `${location.origin}/?room=${roomId}`;
    document.getElementById('share-link-text').textContent = shareUrl;

    let colorLabel;
    if (selectedGame === 'omok' || selectedGame === 'othello') {
      colorLabel = selectedColor === 'black' ? '흑(선공)' : '백(후공)';
    } else if (selectedGame === 'connect4') {
      colorLabel = '빨강(선공)'; // 호스트는 항상 빨강
    } else if (selectedGame === 'indianpoker') {
      colorLabel = '딜러';
    } else if (selectedGame === 'checkers') {
      colorLabel = selectedColor === 'white' ? '빨강(선공)' : '검정(후공)';
    } else {
      colorLabel = selectedColor === 'white' ? '백(선공)' : '흑(후공)';
    }
    const timeLabel = selectedMinutes === 0 ? '무제한' : `${selectedMinutes}분`;
    const _waitingMeta = GameRegistry.getGame(selectedGame);
    const gameLabel = _waitingMeta ? _waitingMeta.name : selectedGame;
    const colorPart = GameRegistry.isForceWhite(selectedGame)
      ? '' : ` | 내 색상: ${colorLabel}`;
    document.getElementById('game-info-preview').textContent =
      `${gameLabel}${colorPart} | 제한 시간: ${timeLabel}`;

    setupShareButtons(shareUrl);
  }

  function showJoinSection() {
    gameSelectSection.style.display = 'none';
    document.getElementById('arcade-section').style.display = 'none';
    createSection.style.display     = 'none';
    waitingSection.style.display    = 'none';
    joinSection.style.display       = '';
    errorSection.style.display      = 'none';
  }

  function showError(msg) {
    gameSelectSection.style.display = 'none';
    document.getElementById('arcade-section').style.display = 'none';
    createSection.style.display     = 'none';
    waitingSection.style.display    = 'none';
    joinSection.style.display       = 'none';
    errorSection.style.display      = '';
    document.getElementById('error-msg').textContent = msg;
  }

  // ========== Game selection ==========
  window.selectGame = function (gameType) {
    selectedGame = gameType;
    history.pushState({}, '', `/?game=${gameType}`);
    updateColorPickerLabels(gameType);

    // 색상 선택 패널: forceWhite 게임은 색상 선택 불필요
    const colorSection = document.getElementById('color-section');
    if (colorSection) {
      colorSection.style.display = GameRegistry.isForceWhite(gameType) ? 'none' : '';
    }

    // 기본 색상 설정
    if (gameType === 'omok') {
      setSelectedColor('black');
    } else if (GameRegistry.isForceWhite(gameType)) {
      setSelectedColor('white'); // 내부적으로 white=host 역할
    } else {
      setSelectedColor('white');
    }

    const _createMeta = GameRegistry.getGame(gameType);
    document.getElementById('create-title').textContent = (_createMeta ? _createMeta.createTitle : null) || '방 만들기';
    updateBoardSizePicker(gameType);
    showCreateSection();
  };

  window.backToGameSelect = function () {
    selectedGame      = null;
    selectedColor     = 'white';
    selectedMinutes   = 10;
    isCustomTime      = false;
    selectedBoardSize = null;
    selectedIpOpts    = { numDecks: 2, winCondition: 2 };
    // color-section 다시 표시 (connect4·indianpoker 선택 후 숨겨진 상태 복원)
    const colorSection = document.getElementById('color-section');
    if (colorSection) colorSection.style.display = '';
    // 시간 버튼 초기화 (10분 기본 활성화)
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    const defaultTimeBtn = document.querySelector('.time-btn[data-minutes="10"]');
    if (defaultTimeBtn) defaultTimeBtn.classList.add('active');
    const customTimeInput = document.getElementById('custom-time-input');
    if (customTimeInput) customTimeInput.style.display = 'none';
    history.pushState({}, '', '/');
    showGameSelectSection();
  };

  function updateBoardSizePicker(gameType) {
    const group = document.getElementById('board-size-group');
    if (!group) return;

    if (gameType === 'omok') {
      selectedBoardSize = { size: 15 };
      group.style.display = '';
      group.innerHTML = `
        <label class="create-label">보드 크기</label>
        <div class="board-size-btns">
          ${[13,15,17,19].map(s =>
            `<button class="size-btn${s===15?' active':''}" data-size="${s}" onclick="window._setBoardSizeOmok(${s})">${s}×${s}</button>`
          ).join('')}
        </div>`;
    } else if (gameType === 'connect4') {
      selectedBoardSize = { rows: 6, cols: 7 };
      const presets = [{rows:5,cols:4},{rows:6,cols:7},{rows:7,cols:8},{rows:8,cols:9}];
      group.style.display = '';
      group.innerHTML = `
        <label class="create-label">보드 크기</label>
        <div class="board-size-btns">
          ${presets.map(p =>
            `<button class="size-btn${p.rows===6&&p.cols===7?' active':''}" data-rows="${p.rows}" data-cols="${p.cols}"
              onclick="window._setBoardSizeC4(${p.rows},${p.cols})">${p.rows}행×${p.cols}열</button>`
          ).join('')}
        </div>`;
    } else if (gameType === 'indianpoker') {
      selectedIpOpts = { numDecks: 2, winCondition: 2 };
      group.style.display = '';
      group.innerHTML = `
        <label class="create-label">덱 수</label>
        <div class="board-size-btns" id="mp-deck-btns">
          ${[1,2,3].map(n =>
            `<button class="size-btn${n===2?' active':''}" onclick="window._setIpDecks(${n},this)">${n}덱 (${n*10}장)</button>`
          ).join('')}
        </div>
        <label class="create-label" style="margin-top:12px;">승리 조건</label>
        <div class="board-size-btns" id="mp-wincond-btns">
          <button class="size-btn" onclick="window._setIpWinCond(1,this)">칩 모두 획득 시 종료</button>
          <button class="size-btn active" onclick="window._setIpWinCond(2,this)">덱 소진 후 칩 비교</button>
        </div>`;
    } else {
      selectedBoardSize = null;
      group.style.display = 'none';
      group.innerHTML = '';
    }
  }

  window._setBoardSizeOmok = function (size) {
    selectedBoardSize = { size };
    document.querySelectorAll('#board-size-group .size-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.size) === size);
    });
  };

  window._setBoardSizeC4 = function (rows, cols) {
    selectedBoardSize = { rows, cols };
    document.querySelectorAll('#board-size-group .size-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.rows) === rows && Number(b.dataset.cols) === cols);
    });
  };

  window._setIpDecks = function (n, btn) {
    selectedIpOpts.numDecks = n;
    btn.closest('.board-size-btns').querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };

  window._setIpWinCond = function (wc, btn) {
    selectedIpOpts.winCondition = wc;
    btn.closest('.board-size-btns').querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };

  function updateColorPickerLabels(gameType) {
    if (gameType === 'omok') {
      document.getElementById('icon-white').textContent  = '○';
      document.getElementById('icon-black').textContent  = '⬤';
      document.getElementById('label-white').textContent = '백 (후공)';
      document.getElementById('label-black').textContent = '흑 (선공)';
      document.getElementById('color-label').textContent = '내 돌 색상 선택';
    } else if (gameType === 'checkers') {
      document.getElementById('icon-white').textContent  = '🔴';
      document.getElementById('icon-black').textContent  = '⚫';
      document.getElementById('label-white').textContent = '빨강 (선공)';
      document.getElementById('label-black').textContent = '검정 (후공)';
      document.getElementById('color-label').textContent = '내 말 색상 선택';
    } else if (gameType === 'othello') {
      document.getElementById('icon-white').textContent  = '○';
      document.getElementById('icon-black').textContent  = '⬤';
      document.getElementById('label-white').textContent = '백 (후공)';
      document.getElementById('label-black').textContent = '흑 (선공)';
      document.getElementById('color-label').textContent = '내 돌 색상 선택';
    } else {
      document.getElementById('icon-white').textContent  = '♔';
      document.getElementById('icon-black').textContent  = '♚';
      document.getElementById('label-white').textContent = '백 (선공)';
      document.getElementById('label-black').textContent = '흑 (후공)';
      document.getElementById('color-label').textContent = '내 색상 선택';
    }
  }

  function setSelectedColor(color) {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.color-btn[data-color="${color}"]`);
    if (btn) btn.classList.add('active');
    selectedColor = color;
  }

  // ========== Color picker ==========
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelectedColor(btn.dataset.color);
    });
  });

  // ========== Time picker ==========
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const val = btn.dataset.minutes;
      if (val === 'custom') {
        isCustomTime = true;
        document.getElementById('custom-time-input').style.display = 'flex';
        selectedMinutes = parseInt(document.getElementById('custom-minutes').value) || 15;
      } else {
        isCustomTime = false;
        document.getElementById('custom-time-input').style.display = 'none';
        selectedMinutes = parseInt(val);
      }
    });
  });

  document.getElementById('custom-minutes').addEventListener('input', (e) => {
    selectedMinutes = parseInt(e.target.value) || 15;
  });

  // ========== Create room ==========
  document.getElementById('create-btn').addEventListener('click', () => {
    if (!selectedGame) return;
    const timeControl = {
      type:    selectedMinutes === 0 ? 'unlimited' : (isCustomTime ? 'custom' : 'fixed'),
      minutes: selectedMinutes === 0 ? null : selectedMinutes
    };

    socket.emit('room:create', {
      hostColor:       selectedColor,
      timeControl,
      gameType:        selectedGame,
      boardSize:       selectedBoardSize || undefined,
      indianPokerOpts: selectedGame === 'indianpoker' ? selectedIpOpts : undefined,
    });
  });

  socket.on('room:created', ({ roomId, playerToken, hostColor, gameType }) => {
    currentRoomId = roomId;
    localStorage.setItem(`chess_token_${roomId}`, playerToken);
    localStorage.setItem('chess_room_active', roomId);
    localStorage.setItem(`game_type_${roomId}`, gameType || selectedGame);

    history.pushState({}, '', `/?room=${roomId}`);
    showWaitingSection(roomId);
  });

  // ========== Guest join ==========
  document.getElementById('join-btn').addEventListener('click', () => {
    document.getElementById('join-btn').style.display = 'none';
    const jl = document.getElementById('join-loading');
    jl.style.display       = 'flex';
    jl.style.flexDirection = 'column';
    jl.style.alignItems    = 'center';
    jl.style.gap           = '12px';

    const existingToken = localStorage.getItem(`chess_token_${roomIdFromUrl}`);
    if (existingToken) {
      socket.emit('room:reconnect', { playerToken: existingToken });
    } else {
      socket.emit('room:join', { roomId: roomIdFromUrl });
    }
  });

  socket.on('room:joined', ({ playerToken, guestColor, roomId, gameType }) => {
    localStorage.setItem(`chess_token_${roomId}`, playerToken);
    localStorage.setItem('chess_room_active', roomId);
    if (gameType) localStorage.setItem(`game_type_${roomId}`, gameType);
    window.location.href = `/game.html?room=${roomId}`;
  });

  socket.on('game:state', ({ roomId, status }) => {
    const rid = roomId || roomIdFromUrl;
    window.location.href = `/game.html?room=${rid}`;
  });

  socket.on('room:guest:joined', () => {
    if (currentRoomId) {
      window.location.href = `/game.html?room=${currentRoomId}`;
    }
  });

  socket.on('room:error', ({ code, message }) => {
    showError(message);
  });

  // ========== Copy link ==========
  function copyLink() {
    const shareUrl = `${location.origin}/?room=${currentRoomId || roomIdFromUrl}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('링크가 복사되었습니다!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('링크가 복사되었습니다!');
    });
  }

  document.getElementById('copy-btn').addEventListener('click', copyLink);
  document.getElementById('copy-link-btn').addEventListener('click', copyLink);

  function showToast(msg) {
    const toast = document.getElementById('copy-toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ========== 멀티 플랫폼 공유 ==========
  function setupShareButtons(shareUrl) {
    const _shareMeta = GameRegistry.getGame(selectedGame);
    const gameLabel = _shareMeta ? _shareMeta.name : '보드게임';
    const inviteText = `${gameLabel} 게임에 초대합니다! 함께 두어요 🎮`;

    // ── 카카오톡 ──
    const kakaoBtn = document.getElementById('kakao-btn');
    const KAKAO_APP_KEY = 'YOUR_KAKAO_APP_KEY';
    if (KAKAO_APP_KEY !== 'YOUR_KAKAO_APP_KEY' && window.Kakao && !Kakao.isInitialized()) {
      try { Kakao.init(KAKAO_APP_KEY); } catch (e) { /* ignore */ }
    }
    kakaoBtn.onclick = () => {
      if (window.Kakao && Kakao.isInitialized()) {
        Kakao.Share.sendDefault({
          objectType: 'text',
          text: inviteText,
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl }
        });
      } else {
        copyLink();
        showToast('카카오 앱 키가 없어 링크를 복사했습니다');
      }
    };

    // ── LINE ──
    const lineBtn = document.getElementById('line-btn');
    lineBtn.onclick = () => {
      window.open(
        `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`,
        '_blank'
      );
    };

    // ── Telegram ──
    const telegramBtn = document.getElementById('telegram-btn');
    telegramBtn.onclick = () => {
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(inviteText)}`,
        '_blank'
      );
    };

    // ── Web Share API (모바일 브라우저 지원 시 노출) ──
    const webshareBtn = document.getElementById('webshare-btn');
    if (navigator.share) {
      webshareBtn.style.display = '';
      webshareBtn.onclick = () => {
        navigator.share({ title: inviteText, url: shareUrl }).catch(() => {});
      };
    } else {
      webshareBtn.style.display = 'none';
    }
  }

  // ========== Init (모든 함수 정의 후 실행) ==========
  if (roomIdFromUrl) {
    showJoinSection();
  } else if (gameFromUrl && GameRegistry.isValid(gameFromUrl)) {
    window.selectGame(gameFromUrl);
  } else {
    showGameSelectSection();
  }
})();
