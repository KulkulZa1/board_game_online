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
      { head: '배팅', text: '게스트가 먼저 배팅 → 호스트 → 쇼다운 순서로 진행됩니다.' },
      { head: '액션', text: '• 콜: 상대 배팅에 맞춤\n• 레이즈: 5칩 추가 (최대 3회)\n• 폴드: 포기, 상대방 승리' },
      { head: '승패', text: '쇼다운 시 높은 숫자가 이깁니다 (A < 2 < … < K). 동점이면 호스트 승리.' },
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
  }
});

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
  // 색상 선택 화면 표시 (기존 create-section 재활용)
  const gameSelectSection = document.getElementById('game-select-section');
  const createSection     = document.getElementById('create-section');
  const createTitle       = document.getElementById('create-title');
  const colorSection      = document.getElementById('color-section');
  const createBtn         = document.getElementById('create-btn');

  const gameLabelMap = {
    chess: '체스', omok: '오목', connect4: '사목',
    othello: '오셀로', indianpoker: '인디언 포커', checkers: '체커'
  };

  // 솔로 전용 색상 선택 UI
  gameSelectSection.style.display = 'none';
  createSection.style.display     = '';
  createTitle.textContent = `혼자하기 — ${gameLabelMap[gameType] || gameType}`;
  colorSection.style.display = '';
  document.getElementById('color-label').textContent = '내 색상 선택 (AI가 반대 색)';

  // 시간 선택 숨김 (솔로 = 무제한)
  document.querySelectorAll('.form-group').forEach(g => {
    if (g.id !== 'color-section') g.style.display = 'none';
  });

  // 색상 버튼 라벨 - 사목 기준
  document.getElementById('icon-white').textContent = '🔴';
  document.getElementById('label-white').textContent = '빨강 (선공)';
  document.getElementById('icon-black').textContent = '🟡';
  document.getElementById('label-black').textContent = '노랑 (후공)';

  // "방 만들기" → "시작"
  createBtn.textContent = '시작';
  createBtn.onclick = (e) => {
    e.preventDefault();
    const selectedColorBtn = document.querySelector('.color-btn.active');
    const color = selectedColorBtn ? selectedColorBtn.dataset.color : 'white';
    // 시간 선택 섹션 복원 (다른 게임 전환 대비)
    document.querySelectorAll('.form-group').forEach(g => { g.style.display = ''; });
    createBtn.textContent = '방 만들기';
    createBtn.onclick = null;
    window.location.href = `/game.html?solo=${gameType}&color=${color}`;
  };

  // 뒤로 버튼 처리 복원
  window.backToGameSelect = function() {
    document.querySelectorAll('.form-group').forEach(g => { g.style.display = ''; });
    createBtn.textContent = '방 만들기';
    createBtn.onclick = null;
    window.backToGameSelect = _origBackToGameSelect;
    createSection.style.display     = 'none';
    gameSelectSection.style.display = '';
  };
};

// 원본 backToGameSelect 참조 보존 (lobby.js IIFE 내에서 정의된 것을 가져옴)
let _origBackToGameSelect = window.backToGameSelect;

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
  let selectedGame    = null;  // 'chess' | 'omok'
  let selectedColor   = 'white';
  let selectedMinutes = 10;
  let isCustomTime    = false;
  let currentRoomId   = null;

  // DOM
  const gameSelectSection = document.getElementById('game-select-section');
  const createSection     = document.getElementById('create-section');
  const waitingSection    = document.getElementById('waiting-section');
  const joinSection       = document.getElementById('join-section');
  const errorSection      = document.getElementById('error-section');

  // ========== Init ==========
  if (roomIdFromUrl) {
    showJoinSection();
  } else if (gameFromUrl && ['chess', 'omok', 'connect4', 'othello', 'indianpoker', 'checkers'].includes(gameFromUrl)) {
    selectGame(gameFromUrl);
  } else {
    showGameSelectSection();
  }

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
    showCreateSection();
  };

  window.backToGameSelect = function () {
    selectedGame    = null;
    selectedColor   = 'white';
    selectedMinutes = 10;
    isCustomTime    = false;
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
      hostColor: selectedColor,
      timeControl,
      gameType: selectedGame
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
})();
