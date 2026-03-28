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

    setupKakaoShare(shareUrl);
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

  // ========== KakaoTalk share ==========
  function setupKakaoShare(shareUrl) {
    const kakaoBtn = document.getElementById('kakao-btn');
    const KAKAO_APP_KEY = 'YOUR_KAKAO_APP_KEY';

    if (KAKAO_APP_KEY !== 'YOUR_KAKAO_APP_KEY' && window.Kakao && !Kakao.isInitialized()) {
      try { Kakao.init(KAKAO_APP_KEY); } catch (e) { /* ignore */ }
    }

    kakaoBtn.onclick = () => {
      if (window.Kakao && Kakao.isInitialized()) {
        const gameLabel = selectedGame === 'omok' ? '오목' : '체스';
        Kakao.Share.sendDefault({
          objectType: 'text',
          text: `${gameLabel} 게임에 초대합니다! 함께 두어요 🎮`,
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl }
        });
      } else {
        copyLink();
        showToast('카카오 앱 키가 없어 링크를 복사했습니다');
      }
    };
  }
})();
