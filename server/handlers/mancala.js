// server/handlers/mancala.js — 만칼라 핸들러 (Oware 스타일 6-pit)
const state = require('../state');
const { getRoleColor } = require('../utils');

// 보드 레이아웃 (0-indexed):
//  pit 0-5:   white 진영 (왼쪽→오른쪽)
//  pit 6:     white 창고 (mancala)
//  pit 7-12:  black 진영 (오른쪽→왼쪽)
//  pit 13:    black 창고
// 반시계 방향으로 이동: white는 6,7,...13을 거쳐 돌아오고, black은 0,1,...6을 거쳐 돌아옴
// white 창고 = 6, black 창고 = 13

const WHITE_STORE = 6;
const BLACK_STORE = 13;
const SEEDS_PER_PIT = 4;

function initBoard() {
  // pit 0..5: white(4씩), 6: 창고, 7..12: black(4씩), 13: 창고
  const pits = new Array(14).fill(0);
  for (let i = 0; i <= 5; i++) pits[i] = SEEDS_PER_PIT;
  for (let i = 7; i <= 12; i++) pits[i] = SEEDS_PER_PIT;
  return pits;
}

function initRoom(base) {
  base.pits        = initBoard();
  base.currentTurn = base.hostColor; // 호스트(=white) 선공
  return base;
}

function resetRoom(room) {
  room.pits        = initBoard();
  room.currentTurn = room.hostColor;
}

function handleMove(socket, room, role, { pit }) {
  if (!Number.isInteger(pit)) return;
  const yourColor = getRoleColor(room, role);
  if (room.currentTurn !== yourColor) return;

  const pits   = room.pits;
  const isWhite = yourColor === 'white';

  // 플레이어의 pit 범위
  const myPits  = isWhite ? [0,1,2,3,4,5] : [7,8,9,10,11,12];
  const myStore = isWhite ? WHITE_STORE : BLACK_STORE;
  const oppStore = isWhite ? BLACK_STORE : WHITE_STORE;

  if (!myPits.includes(pit)) {
    socket.emit('game:move:invalid', { reason: '자신의 구멍만 선택할 수 있습니다.' });
    return;
  }
  if (pits[pit] === 0) {
    socket.emit('game:move:invalid', { reason: '빈 구멍입니다.' });
    return;
  }

  // 씨앗 배분 (반시계 방향)
  let seeds = pits[pit];
  pits[pit] = 0;
  let idx = pit;

  while (seeds > 0) {
    idx = (idx + 1) % 14;
    if (idx === oppStore) continue; // 상대 창고 건너뜀
    pits[idx]++;
    seeds--;
  }

  // 보너스 턴: 마지막 씨앗이 자신의 창고에 들어간 경우
  const bonusTurn = idx === myStore;

  // 캡처: 마지막 씨앗이 자신의 빈 pit에 들어가고, 상대 반대편 pit에 씨앗이 있을 때
  const oppPits   = isWhite ? [7,8,9,10,11,12] : [0,1,2,3,4,5];
  if (!bonusTurn && myPits.includes(idx) && pits[idx] === 1) {
    const oppIdx = 12 - idx; // 맞은편 pit
    if (oppPits.includes(oppIdx) && pits[oppIdx] > 0) {
      pits[myStore] += pits[oppIdx] + 1; // 내 씨앗 + 상대 씨앗
      pits[idx]     = 0;
      pits[oppIdx]  = 0;
    }
  }

  // 게임 종료 확인: 한쪽 진영이 모두 비면 나머지 씨앗 해당 플레이어 창고로
  const whiteEmpty = [0,1,2,3,4,5].every(i => pits[i] === 0);
  const blackEmpty = [7,8,9,10,11,12].every(i => pits[i] === 0);

  const { endGame } = require('../endgame');

  if (whiteEmpty || blackEmpty) {
    // 남은 씨앗 수집
    for (let i = 0; i <= 5;  i++) { pits[WHITE_STORE] += pits[i]; pits[i] = 0; }
    for (let i = 7; i <= 12; i++) { pits[BLACK_STORE] += pits[i]; pits[i] = 0; }

    let winner;
    if (pits[WHITE_STORE] > pits[BLACK_STORE])        winner = 'white';
    else if (pits[BLACK_STORE] > pits[WHITE_STORE])   winner = 'black';
    else                                               winner = null;

    const moveRecord = { pit, color: yourColor, pits: [...pits], moveNum: room.moves.length+1, timestamp: Date.now() };
    room.moves.push(moveRecord);

    state.io.to(room.id).emit('game:move:made', {
      move: moveRecord, pits, turn: null,
      timers: { white: room.timers.white, black: room.timers.black, activeColor: null },
    });
    endGame(room, winner, 'empty-side');
    return;
  }

  const nextTurn = bonusTurn ? yourColor : (yourColor === 'white' ? 'black' : 'white');
  room.currentTurn        = nextTurn;
  room.timers.activeColor = nextTurn;
  room.timers.lastTickAt  = Date.now();

  const moveRecord = { pit, color: yourColor, bonusTurn, pits: [...pits], moveNum: room.moves.length+1, timestamp: Date.now() };
  room.moves.push(moveRecord);

  state.io.to(room.id).emit('game:move:made', {
    move: moveRecord, pits, turn: nextTurn,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: nextTurn },
  });
}

module.exports = { initRoom, resetRoom, handleMove };
