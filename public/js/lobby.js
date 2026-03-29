// 전역 토스트 (게스트 프로필 등 inline onclick에서 사용)
window.showToast = function(msg) {
  const toast = document.getElementById('copy-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
};

// ========== 게임 규칙 데이터 ==========
const GAME_RULES = {
  chess: {
    title: '♟ 체스 규칙',
    sections: [
      { head: '목표', text: '상대방 킹을 체크메이트(포위)하면 승리합니다.' },
      { head: '이동', text: '이동할 기물을 클릭하면 이동 가능한 칸이 표시됩니다. 목적지를 클릭해 이동하세요.' },
      { head: '특수 규칙', text: '• 캐슬링: 킹과 룩이 동시에 이동하는 특수 수\n• 앙파상: 폰 특수 포획\n• 승급: 폰이 끝줄 도달 시 퀸·룩·비숍·나이트 중 선택' },
      { head: '무승부 제안', text: '상대방에게 무승부를 제안할 수 있습니다. (5초 딜레이, 3회 초과 시 60초 비활성)' },
      { head: '타이머', text: '시간 초과 시 상대방 승리. 게임 종료 후 복기 모드(← →)로 수 복습 가능.' },
    ]
  },
  omok: {
    title: '⬤ 오목 규칙 (렌주)',
    sections: [
      { head: '목표', text: '가로·세로·대각선으로 정확히 5개의 돌을 연속으로 놓으면 승리합니다.' },
      { head: '장목 금지', text: '6개 이상 연속은 승리로 인정되지 않습니다 (렌주 룰).' },
      { head: '선공', text: '흑(어두운 색)이 먼저 둡니다.' },
      { head: '이동', text: '빈 교차점을 클릭해 돌을 놓습니다.' },
    ]
  },
  connect4: {
    title: '🔴 사목 규칙',
    sections: [
      { head: '목표', text: '가로·세로·대각선으로 4개의 돌을 연속으로 놓으면 승리합니다.' },
      { head: '이동', text: '상단 화살표 버튼이나 열을 클릭하면 돌이 중력에 의해 아래로 떨어집니다.' },
      { head: '색상', text: '호스트: 빨강(선공) / 게스트: 노랑(후공)' },
    ]
  },
  othello: {
    title: '⬜ 오셀로 (리버시) 규칙',
    sections: [
      { head: '목표', text: '게임 종료 시 자신의 색 돌이 더 많으면 승리합니다.' },
      { head: '이동', text: '상대 돌을 사이에 끼울 수 있는 칸(점으로 표시)에만 놓을 수 있습니다. 끼인 상대 돌은 모두 내 색으로 뒤집힙니다.' },
      { head: '패스', text: '유효한 수가 없으면 자동으로 패스됩니다. 양쪽 모두 유효 수가 없으면 게임 종료.' },
      { head: '선공', text: '흑이 먼저 둡니다.' },
    ]
  },
  indianpoker: {
    title: '🃏 인디언 포커 규칙',
    sections: [
      { head: '기본', text: '자신의 카드는 이마에 대고 보지 않습니다. 화면에 "?"로 표시됩니다. 상대방의 카드는 볼 수 있습니다.' },
      { head: '카드', text: '카드 범위: A(1) ~ 10. 기본적으로 높은 숫자가 강합니다.\n• A는 특별 규칙: 10을 상대로만 이깁니다. 나머지 경우(2~9 상대)에는 최하위입니다.' },
      { head: '배팅', text: '게스트가 먼저 배팅 → 호스트 → 쇼다운 순서로 진행됩니다.' },
      { head: '액션', text: '• 콜: 상대 배팅에 맞춤\n• 레이즈: 5칩 추가 (최대 3회)\n• 폴드: 포기, 상대방 승리\n⚠️ 10을 가지고 폴드하면 앤티만큼 추가 칩 손실!' },
      { head: '승리 조건', text: '① 칩 모두 획득 시 종료\n② 덱 소진 후 칩 비교 (더 많은 쪽 승리)\n방 생성 시 선택 가능합니다.' },
      { head: '쿨다운', text: '각 액션은 1.5초에 1번만 가능합니다.' },
    ]
  },
  checkers: {
    title: '🔴 체커 규칙',
    sections: [
      { head: '목표', text: '상대방 말을 전멸시키거나 이동 불가 상태로 만들면 승리합니다.' },
      { head: '이동', text: '어두운 칸에서만 이동합니다. 기본 이동은 앞 대각선 1칸입니다.' },
      { head: '점프', text: '상대 말을 대각선으로 뛰어넘어 잡을 수 있습니다. 점프 가능하면 반드시 해야 합니다 (강제 점프). 연속 점프 가능하면 계속 이어갑니다.' },
      { head: '킹 승격', text: '상대 진영 끝줄에 도달하면 킹(♛)으로 승격됩니다. 킹은 앞뒤 모두 이동 가능합니다.' },
      { head: '색상', text: '호스트: 빨강(선공) / 게스트: 검정(후공)' },
    ]
  },
};

// ========== 규칙 모달 ==========
window.showRules = function(gameType) {
  const data = GAME_RULES[gameType];
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

  const gameLabelMap = {
    chess: '체스', omok: '오목', connect4: '사목',
    othello: '오셀로', indianpoker: '인디언 포커', checkers: '체커'
  };

  // 솔로 옵션 상태
  let soloBoardSize  = null;
  let soloNumDecks   = 2;
  let soloWinCond    = 2;

  // 솔로 전용 UI
  gameSelectSection.style.display = 'none';
  createSection.style.display     = '';
  createTitle.textContent = `혼자하기 — ${gameLabelMap[gameType] || gameType}`;
  document.getElementById('color-label').textContent = '내 색상 선택 (AI가 반대 색)';

  // 모든 form-group 숨김 후 필요한 것만 표시
  document.querySelectorAll('.form-group').forEach(g => { g.style.display = 'none'; });

  // 색상 버튼 라벨 - 게임별 설정
  const soloColorMeta = {
    chess:       { iconW:'♔', labelW:'백 (선공)', iconB:'♚', labelB:'흑 (후공)' },
    omok:        { iconW:'○', labelW:'백 (후공)', iconB:'⬤', labelB:'흑 (선공)' },
    connect4:    { iconW:'🔴', labelW:'빨강 (선공)', iconB:'🟡', labelB:'노랑 (후공)' },
    othello:     { iconW:'○', labelW:'백 (후공)', iconB:'⬤', labelB:'흑 (선공)' },
    indianpoker: { iconW:'🎴', labelW:'플레이어', iconB:'🤖', labelB:'AI 봇' },
    checkers:    { iconW:'🔴', labelW:'빨강 (선공)', iconB:'⚫', labelB:'검정 (후공)' },
  };
  const cm = soloColorMeta[gameType] || soloColorMeta.chess;
  document.getElementById('icon-white').textContent  = cm.iconW;
  document.getElementById('label-white').textContent = cm.labelW;
  document.getElementById('icon-black').textContent  = cm.iconB;
  document.getElementById('label-black').textContent = cm.labelB;

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
    createSection.style.display     = 'none';
    waitingSection.style.display    = 'none';
    joinSection.style.display       = 'none';
    errorSection.style.display      = 'none';
  }

  function showCreateSection() {
    gameSelectSection.style.display = 'none';
    createSection.style.display     = '';
    waitingSection.style.display    = 'none';
    joinSection.style.display       = 'none';
    errorSection.style.display      = 'none';
  }

  function showWaitingSection(roomId) {
    gameSelectSection.style.display = 'none';
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
    const gameLabelMap = {
      chess: '체스', omok: '오목', connect4: '사목',
      othello: '오셀로', indianpoker: '인디언 포커', checkers: '체커'
    };
    const gameLabel = gameLabelMap[selectedGame] || selectedGame;
    const colorPart = (selectedGame === 'connect4' || selectedGame === 'indianpoker')
      ? '' : ` | 내 색상: ${colorLabel}`;
    document.getElementById('game-info-preview').textContent =
      `${gameLabel}${colorPart} | 제한 시간: ${timeLabel}`;

    setupShareButtons(shareUrl);
  }

  function showJoinSection() {
    gameSelectSection.style.display = 'none';
    createSection.style.display     = 'none';
    waitingSection.style.display    = 'none';
    joinSection.style.display       = '';
    errorSection.style.display      = 'none';
  }

  function showError(msg) {
    gameSelectSection.style.display = 'none';
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

    // 색상 선택 패널: connect4/indianpoker는 색상 선택 불필요
    const colorSection = document.getElementById('color-section');
    if (colorSection) {
      colorSection.style.display = (gameType === 'connect4' || gameType === 'indianpoker') ? 'none' : '';
    }

    // 기본 색상 설정
    if (gameType === 'omok') {
      setSelectedColor('black');
    } else if (gameType === 'connect4' || gameType === 'indianpoker') {
      setSelectedColor('white'); // 내부적으로 white=host 역할
    } else {
      setSelectedColor('white');
    }

    const titleMap = {
      chess:       '체스 방 만들기',
      omok:        '오목 방 만들기',
      connect4:    '사목 방 만들기',
      othello:     '오셀로 방 만들기',
      indianpoker: '인디언 포커 방 만들기',
      checkers:    '체커 방 만들기',
    };
    document.getElementById('create-title').textContent = titleMap[gameType] || '방 만들기';
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
    const gameLabelMap = {
      chess: '체스', omok: '오목', connect4: '사목',
      othello: '오셀로', indianpoker: '인디언 포커', checkers: '체커'
    };
    const gameLabel = gameLabelMap[selectedGame] || '보드게임';
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
  } else if (gameFromUrl && ['chess', 'omok', 'connect4', 'othello', 'indianpoker', 'checkers'].includes(gameFromUrl)) {
    window.selectGame(gameFromUrl);
  } else {
    showGameSelectSection();
  }
})();
