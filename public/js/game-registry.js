// game-registry.js — 게임별 메타데이터 중앙 레지스트리
window.GameRegistry = (function () {
  const GAMES = [
    {
      id: 'chess',
      name: '체스',
      icon: '♟',
      desc: '전략 2인 게임<br>8×8 격자판',
      forceWhite: false,
      soloIcon: '♟',
      soloIconW: '♔',
      soloIconB: '♚',
      soloLabelW: '백 (선공)',
      soloLabelB: '흑 (후공)',
      createTitle: '체스 방 만들기',
      gameTitle: '체스 대국',
      specTitle: '체스 관전',
      boardAreaId: 'chess-board-area',
      rules: {
        title: '♟ 체스 규칙',
        sections: [
          { head: '목표', text: '상대방 킹을 체크메이트(포위)하면 승리합니다.' },
          { head: '이동', text: '이동할 기물을 클릭하면 이동 가능한 칸이 표시됩니다. 목적지를 클릭해 이동하세요.' },
          { head: '특수 규칙', text: '• 캐슬링: 킹과 룩이 동시에 이동하는 특수 수\n• 앙파상: 폰 특수 포획\n• 승급: 폰이 끝줄 도달 시 퀸·룩·비숍·나이트 중 선택' },
          { head: '무승부 제안', text: '상대방에게 무승부를 제안할 수 있습니다. (5초 딜레이, 3회 초과 시 60초 비활성)' },
          { head: '타이머', text: '시간 초과 시 상대방 승리. 게임 종료 후 복기 모드(← →)로 수 복습 가능.' },
        ]
      }
    },
    {
      id: 'omok',
      name: '오목',
      icon: '⬤',
      desc: '렌주룰 5목<br>15×15 격자판',
      forceWhite: false,
      soloIcon: '⬤',
      soloIconW: '○',
      soloIconB: '⬤',
      soloLabelW: '백 (후공)',
      soloLabelB: '흑 (선공)',
      createTitle: '오목 방 만들기',
      gameTitle: '오목 대국',
      specTitle: '오목 관전',
      boardAreaId: 'omok-board-area',
      rules: {
        title: '⬤ 오목 규칙 (렌주)',
        sections: [
          { head: '목표', text: '가로·세로·대각선으로 정확히 5개의 돌을 연속으로 놓으면 승리합니다.' },
          { head: '장목 금지', text: '6개 이상 연속은 승리로 인정되지 않습니다 (렌주 룰).' },
          { head: '선공', text: '흑(어두운 색)이 먼저 둡니다.' },
          { head: '이동', text: '빈 교차점을 클릭해 돌을 놓습니다.' },
        ]
      }
    },
    {
      id: 'connect4',
      name: '사목',
      icon: '🔴',
      desc: '4개 연결 승리<br>7×6 낙하 보드',
      forceWhite: true,
      soloIcon: '🔴',
      soloIconW: '🔴',
      soloIconB: '🟡',
      soloLabelW: '빨강 (선공)',
      soloLabelB: '노랑 (후공)',
      createTitle: '사목 방 만들기',
      gameTitle: '사목 대국',
      specTitle: '사목 관전',
      boardAreaId: 'connect4-board-area',
      rules: {
        title: '🔴 사목 규칙',
        sections: [
          { head: '목표', text: '가로·세로·대각선으로 4개의 돌을 연속으로 놓으면 승리합니다.' },
          { head: '이동', text: '상단 화살표 버튼이나 열을 클릭하면 돌이 중력에 의해 아래로 떨어집니다.' },
          { head: '색상', text: '호스트: 빨강(선공) / 게스트: 노랑(후공)' },
        ]
      }
    },
    {
      id: 'othello',
      name: '오셀로',
      icon: '⬜',
      desc: '돌 뒤집기 전략<br>8×8 격자판',
      forceWhite: false,
      soloIcon: '⬤',
      soloIconW: '○',
      soloIconB: '⬤',
      soloLabelW: '백 (후공)',
      soloLabelB: '흑 (선공)',
      createTitle: '오셀로 방 만들기',
      gameTitle: '오셀로 대국',
      specTitle: '오셀로 관전',
      boardAreaId: 'othello-board-area',
      rules: {
        title: '⬜ 오셀로 (리버시) 규칙',
        sections: [
          { head: '목표', text: '게임 종료 시 자신의 색 돌이 더 많으면 승리합니다.' },
          { head: '이동', text: '상대 돌을 사이에 끼울 수 있는 칸(점으로 표시)에만 놓을 수 있습니다. 끼인 상대 돌은 모두 내 색으로 뒤집힙니다.' },
          { head: '패스', text: '유효한 수가 없으면 자동으로 패스됩니다. 양쪽 모두 유효 수가 없으면 게임 종료.' },
          { head: '선공', text: '흑이 먼저 둡니다.' },
        ]
      }
    },
    {
      id: 'indianpoker',
      name: '인디언 포커',
      icon: '🃏',
      desc: '상대 카드로<br>심리 배팅',
      forceWhite: true,
      soloIcon: '🎴',
      soloIconW: '🎴',
      soloIconB: '🤖',
      soloLabelW: '플레이어',
      soloLabelB: 'AI 봇',
      createTitle: '인디언 포커 방 만들기',
      gameTitle: '인디언 포커',
      specTitle: '인디언 포커 관전',
      boardAreaId: 'indianpoker-board-area',
      rules: {
        title: '🃏 인디언 포커 규칙',
        sections: [
          { head: '기본', text: '자신의 카드는 이마에 대고 보지 않습니다. 화면에 "?"로 표시됩니다. 상대방의 카드는 볼 수 있습니다.' },
          { head: '카드', text: '카드 범위: A(1) ~ 10. 기본적으로 높은 숫자가 강합니다.\n• A는 특별 규칙: 10을 상대로만 이깁니다. 나머지 경우(2~9 상대)에는 최하위입니다.' },
          { head: '배팅', text: '게스트가 먼저 배팅 → 호스트 → 쇼다운 순서로 진행됩니다.' },
          { head: '액션', text: '• 콜: 상대 배팅에 맞춤\n• 레이즈: 5칩 추가 (최대 3회)\n• 폴드: 포기, 상대방 승리\n⚠️ 10을 가지고 폴드하면 앤티만큼 추가 칩 손실!' },
          { head: '승리 조건', text: '① 칩 모두 획득 시 종료\n② 덱 소진 후 칩 비교 (더 많은 쪽 승리)\n방 생성 시 선택 가능합니다.' },
          { head: '쿨다운', text: '각 액션은 1.5초에 1번만 가능합니다.' },
        ]
      }
    },
    {
      id: 'checkers',
      name: '체커',
      icon: '🔴',
      desc: '점프 이동·킹<br>8×8 격자판',
      forceWhite: false,
      soloIcon: '🔴',
      soloIconW: '🔴',
      soloIconB: '⚫',
      soloLabelW: '빨강 (선공)',
      soloLabelB: '검정 (후공)',
      createTitle: '체커 방 만들기',
      gameTitle: '체커 대국',
      specTitle: '체커 관전',
      boardAreaId: 'checkers-board-area',
      rules: {
        title: '🔴 체커 규칙',
        sections: [
          { head: '목표', text: '상대방 말을 전멸시키거나 이동 불가 상태로 만들면 승리합니다.' },
          { head: '이동', text: '어두운 칸에서만 이동합니다. 기본 이동은 앞 대각선 1칸입니다.' },
          { head: '점프', text: '상대 말을 대각선으로 뛰어넘어 잡을 수 있습니다. 점프 가능하면 반드시 해야 합니다 (강제 점프). 연속 점프 가능하면 계속 이어갑니다.' },
          { head: '킹 승격', text: '상대 진영 끝줄에 도달하면 킹(♛)으로 승격됩니다. 킹은 앞뒤 모두 이동 가능합니다.' },
          { head: '색상', text: '호스트: 빨강(선공) / 게스트: 검정(후공)' },
        ]
      }
    },
    {
      id: 'applegame',
      name: '사과게임',
      icon: '🍎',
      desc: '합이 10인 사각형 선택<br>17×10 사과 격자',
      forceWhite: true,
      soloIcon: '🍎',
      soloIconW: '🍎',
      soloIconB: '🍎',
      soloLabelW: '선공 (백)',
      soloLabelB: '후공 (흑)',
      createTitle: '사과게임 방 만들기',
      gameTitle: '사과게임 대국',
      specTitle: '사과게임 관전',
      boardAreaId: 'applegame-board-area',
      rules: {
        title: '🍎 사과게임 규칙',
        sections: [
          { head: '목표', text: '격자에서 합이 10이 되는 직사각형 구역을 드래그하여 사과를 제거합니다. 제거한 사과가 더 많은 플레이어가 승리합니다.' },
          { head: '이동', text: '드래그로 직사각형 범위를 선택하면 미리보기가 나타납니다. 합이 10이면 초록색으로 바뀌고, 손을 떼면 사과가 사라집니다.' },
          { head: '종료 조건', text: '더 이상 합이 10이 되는 직사각형을 만들 수 없으면 게임이 종료됩니다.' },
          { head: '솔로 모드', text: '2분 타이머 내에 AI와 교대로 진행합니다. 시간 종료 시 점수 비교로 승패를 결정합니다.' },
        ]
      }
    },
    {
      id: 'battleship',
      name: '배틀십',
      icon: '🚢',
      desc: '함대를 숨기고 적함을 격침<br>10×10 격자 해전',
      forceWhite: true,
      soloIcon: '🚢',
      soloIconW: '🚢',
      soloIconB: '🤖',
      soloLabelW: '플레이어',
      soloLabelB: 'AI 함대',
      createTitle: '배틀십 방 만들기',
      gameTitle: '배틀십 해전',
      specTitle: '배틀십 관전',
      boardAreaId: 'battleship-board-area',
      rules: {
        title: '🚢 배틀십 규칙',
        sections: [
          { head: '배치', text: '게임 시작 전 10×10 격자에 함선 5척을 배치합니다. 항공모함(5), 전함(4), 순양함(3), 잠수함(3), 구축함(2)' },
          { head: '공격', text: '좌표를 클릭해 적 함대를 공격합니다. 🔴 적중, ⚪ 빗나감. 상대 함선 5척을 모두 격침하면 승리!' },
          { head: '교대', text: '매 턴 한 번씩 교대로 공격합니다. 빗나가도 턴이 넘어갑니다.' },
          { head: '솔로 모드', text: 'AI 함대를 상대로 3분 내에 최대한 많은 함선을 격침하세요.' },
        ]
      }
    },
    {
      id: 'texasholdem',
      name: '텍사스 홀덤',
      icon: '🃏',
      desc: '커뮤니티 카드 포커<br>최고 패 보유자 승리',
      forceWhite: true,
      soloIcon: '🃏',
      soloIconW: '🃏',
      soloIconB: '🤖',
      soloLabelW: '플레이어',
      soloLabelB: 'AI 봇',
      createTitle: '텍사스 홀덤 방 만들기',
      gameTitle: '텍사스 홀덤',
      specTitle: '텍사스 홀덤 관전',
      boardAreaId: 'texasholdem-board-area',
      rules: {
        title: '🃏 텍사스 홀덤 규칙',
        sections: [
          { head: '목표', text: '커뮤니티 카드 5장과 본인 홀 카드 2장을 조합해 가장 강한 5장 패를 만들면 승리합니다.' },
          { head: '패 순위 (강→약)', text: '로열 플러시 > 스트레이트 플러시 > 포카드 > 풀하우스 > 플러시 > 스트레이트 > 트리플스 > 투 페어 > 원 페어 > 하이카드' },
          { head: '진행', text: '① 홀 카드 2장 지급 → ② 프리플랍 베팅 → ③ 플랍(3장) → ④ 턴(1장) → ⑤ 리버(1장) → ⑥ 쇼다운' },
          { head: '블라인드', text: '버튼(D) 플레이어가 스몰블라인드(10), 상대방이 빅블라인드(20)를 자동 베팅합니다.' },
          { head: '베팅', text: '• 폴드: 패 포기\n• 체크: 베팅 없이 패스 (베팅이 없을 때만 가능)\n• 콜: 상대 베팅에 맞춤\n• 레이즈: 20칩 추가 (라운드당 최대 4회)' },
          { head: '승리 조건', text: '상대방 칩을 모두 가져오면 승리합니다. 각 핸드에서 폴드시 팟을 상대방에게 넘깁니다.' },
        ]
      }
    },
    {
      id: 'backgammon',
      name: '백가몬',
      icon: '🎲',
      desc: '주사위로 말 이동·탈출<br>24포인트 보드게임',
      forceWhite: false,
      soloIcon: '🎲',
      soloIconW: '⬜',
      soloIconB: '⬛',
      soloLabelW: '백 (선공)',
      soloLabelB: '흑 (후공)',
      createTitle: '백가몬 방 만들기',
      gameTitle: '백가몬 대국',
      specTitle: '백가몬 관전',
      boardAreaId: 'backgammon-board-area',
      rules: {
        title: '🎲 백가몬 규칙',
        sections: [
          { head: '목표', text: '자신의 말 15개를 모두 홈 보드로 이동시킨 후 탈출(borne off)시키면 승리합니다.' },
          { head: '이동', text: '주사위 2개를 굴려 나온 숫자만큼 말을 이동합니다. 백은 24→1 방향, 흑은 1→24 방향으로 이동합니다.' },
          { head: '블럭·히트', text: '상대 말이 2개 이상인 포인트에는 진입할 수 없습니다(블럭). 상대 말이 1개(블롯)인 포인트에 이동하면 그 말을 바(BAR)로 보냅니다.' },
          { head: '바 복귀', text: '바에 말이 있으면 다른 이동 전에 반드시 바에서 먼저 입장해야 합니다.' },
          { head: '탈출', text: '모든 말이 홈 보드(백 1-6, 흑 19-24)에 있으면 주사위 수만큼 말을 탈출시킬 수 있습니다.' },
          { head: '더블', text: '주사위 두 개 숫자가 같으면 4번 이동할 수 있습니다.' },
        ]
      }
    },
  ];

  function getGame(id) { return GAMES.find(function (g) { return g.id === id; }); }
  function getAllIds() { return GAMES.map(function (g) { return g.id; }); }
  function isValid(id) { return GAMES.some(function (g) { return g.id === id; }); }
  function isForceWhite(id) { var g = getGame(id); return g ? g.forceWhite : false; }

  return { GAMES: GAMES, getGame: getGame, getAllIds: getAllIds, isValid: isValid, isForceWhite: isForceWhite };
})();
