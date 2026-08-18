// BANG! 엔진 — 순수 데이터/로직 (덱·역할·캐릭터·거리·Draw! 판정)
// 소켓/방 상태와 분리되어 헤드리스 테스트 가능: node prototypes/bang-flow-test.js
// 기물 구성은 dV Giochi 기본판(플레잉 카드 80장) 기준.
'use strict';

// ── 카드 정의 ─────────────────────────────────────────────────────
//  kind: 즉시(brown) / 장비(blue) / 무기(weapon)
const CARD_DEFS = {
  bang:       { name: 'BANG!',      icon: '💥', kind: 'brown',  desc: '사거리 내 한 명에게 발포. Missed!로 회피 가능. 턴당 1장(볼캐닉·윌리 예외)' },
  missed:     { name: '빗나감!',    icon: '💨', kind: 'brown',  desc: 'BANG!을 회피한다 (응답 전용)' },
  beer:       { name: '맥주',       icon: '🍺', kind: 'brown',  desc: '생명 1 회복. 최대치 초과 불가. 생존자 2인일 땐 효과 없음. 치명상 시 즉시 사용 가능' },
  panic:      { name: '패닉!',      icon: '😱', kind: 'brown',  desc: '거리 1의 플레이어에게서 카드 1장을 가져온다' },
  catbalou:   { name: '캣 발루',    icon: '🐈', kind: 'brown',  desc: '아무 플레이어의 카드 1장을 버리게 한다' },
  stagecoach: { name: '역마차',     icon: '🚃', kind: 'brown',  desc: '카드 2장을 뽑는다' },
  wellsfargo: { name: '웰스파고',   icon: '💰', kind: 'brown',  desc: '카드 3장을 뽑는다' },
  gatling:    { name: '개틀링',     icon: '🔫', kind: 'brown',  desc: '다른 모든 플레이어에게 BANG! (각자 회피 가능)' },
  duel:       { name: '결투',       icon: '⚔️', kind: 'brown',  desc: '지목한 상대와 번갈아 BANG!을 버린다. 못 내는 쪽이 생명 1 잃음' },
  indians:    { name: '인디언!',    icon: '🏹', kind: 'brown',  desc: '다른 모두가 BANG!을 버리거나 생명 1 잃음' },
  store:      { name: '잡화점',     icon: '🏪', kind: 'brown',  desc: '인원수만큼 공개 — 자신부터 시계방향으로 1장씩 가져간다' },
  saloon:     { name: '살룬',       icon: '🥃', kind: 'brown',  desc: '모든 플레이어가 생명 1 회복' },
  jail:       { name: '감옥',       icon: '⛓️', kind: 'blue',   desc: '보안관 외 1명 앞에 배치. 턴 시작 Draw!가 하트면 탈출, 아니면 턴 스킵' },
  dynamite:   { name: '다이너마이트', icon: '🧨', kind: 'blue',  desc: '자기 앞에 배치. 턴 시작 Draw!가 ♠2~9면 폭발(피해 3), 아니면 왼쪽으로 이동' },
  barrel:     { name: '술통',       icon: '🛢️', kind: 'blue',   desc: 'BANG!을 맞을 때 Draw! — 하트면 자동 회피' },
  mustang:    { name: '무스탕',     icon: '🐎', kind: 'blue',   desc: '다른 플레이어가 보는 내 거리 +1' },
  scope:      { name: '조준경',     icon: '🔭', kind: 'blue',   desc: '내가 보는 다른 플레이어 거리 -1' },
  volcanic:   { name: '볼캐닉',     icon: '🌋', kind: 'weapon', range: 1, desc: '사거리 1, BANG! 무제한' },
  schofield:  { name: '스코필드',   icon: '🔵', kind: 'weapon', range: 2, desc: '사거리 2' },
  remington:  { name: '레밍턴',     icon: '🟤', kind: 'weapon', range: 3, desc: '사거리 3' },
  carabine:   { name: '카빈',       icon: '🟠', kind: 'weapon', range: 4, desc: '사거리 4' },
  winchester: { name: '윈체스터',   icon: '🟡', kind: 'weapon', range: 5, desc: '사거리 5' },
};

// 수트 분포의 역사적 정확성보다 "수량 정확 + 판정용 수트 비율(하트 1/4, ♠2~9 존재)"이 중요.
// 각 카드에 무작위성 없는 순환 수트/값을 부여해 80장을 결정적으로 만든다.
function buildDeckExact() {
  const counts = [
    ['bang', 25], ['missed', 12], ['beer', 6], ['panic', 4], ['catbalou', 4],
    ['stagecoach', 2], ['wellsfargo', 1], ['gatling', 1], ['duel', 3], ['indians', 2],
    ['store', 2], ['saloon', 1], ['jail', 3], ['dynamite', 1], ['barrel', 2],
    ['mustang', 2], ['scope', 1], ['volcanic', 2], ['schofield', 3], ['remington', 1],
    ['carabine', 1], ['winchester', 1],
  ];
  const suits = ['s', 'h', 'd', 'c'];
  const deck = [];
  let k = 0;
  for (const [id, n] of counts) {
    for (let i = 0; i < n; i++) {
      deck.push({ id, suit: suits[k % 4], v: 2 + (k % 13) });
      k++;
    }
  }
  return deck;   // 80장
}

// ── 캐릭터 (기본판 16인 전원) ──────────────────────────────────────
// 앞 10인은 패시브/자동, 뒤 6인은 선택이 필요해 리액션 큐로 처리한다.
const CHARACTERS = [
  { id: 'bart',    name: '바트 캐시디',     hp: 4, desc: '생명을 잃을 때마다 카드 1장을 뽑는다' },
  { id: 'blackjack', name: '블랙 잭',       hp: 4, desc: '드로우 시 2번째 카드 공개 — 하트/다이아면 1장 더' },
  { id: 'calamity', name: '캘러미티 재닛',  hp: 4, desc: 'BANG!과 빗나감!을 서로 바꿔 쓸 수 있다' },
  { id: 'gringo',  name: '엘 그링고',       hp: 3, desc: '피해를 준 상대의 손에서 카드 1장을 무작위로 가져온다' },
  { id: 'lucky',   name: '럭키 듀크',       hp: 4, desc: 'Draw! 판정 시 2장 중 유리한 쪽을 쓴다' },
  { id: 'paul',    name: '폴 리그렛',       hp: 3, desc: '항상 무스탕 효과(상대가 보는 거리 +1)' },
  { id: 'rose',    name: '로즈 둘란',       hp: 4, desc: '항상 조준경 효과(내가 보는 거리 -1)' },
  { id: 'slab',    name: '슬랩 더 킬러',    hp: 4, desc: '그의 BANG!은 빗나감! 2장이 있어야 회피된다' },
  { id: 'suzy',    name: '수지 라파예트',   hp: 4, desc: '손패가 0장이 되면 즉시 1장 뽑는다' },
  { id: 'willy',   name: '윌리 더 키드',    hp: 4, desc: 'BANG!을 무제한으로 낼 수 있다' },
  // 선택형 6인
  { id: 'jourdonnais', name: '주르도네',     hp: 4, desc: '술통 효과 내장 — BANG!을 받으면 하트 판정으로 회피 시도' },
  { id: 'vulture', name: '벌처 샘',          hp: 4, desc: '누군가 탈락하면 그의 손패와 장비를 모두 가져온다' },
  { id: 'sid',     name: '시드 케첨',        hp: 4, desc: '자기 턴에 카드 2장을 버리고 체력 1을 회복할 수 있다' },
  { id: 'kit',     name: '키트 칼슨',        hp: 4, desc: '드로우 시 산에서 3장을 보고 1장을 되돌려놓는다' },
  { id: 'jesse',   name: '제시 존스',        hp: 4, desc: '드로우 첫 장을 다른 플레이어 손에서 가져올 수 있다' },
  { id: 'pedro',   name: '페드로 라미레즈',  hp: 4, desc: '드로우 첫 장을 버림패 맨 위에서 가져올 수 있다' },
];

// ── 역할 분배 (4~7인) ─────────────────────────────────────────────
//  보안관 공개 / 나머지 비공개. 승리: 보안관측=무법자·배신자 전멸,
//  무법자=보안관 사망, 배신자=최후의 1인.
function rolesFor(n) {
  const base = {
    4: ['sheriff', 'outlaw', 'outlaw', 'renegade'],
    5: ['sheriff', 'deputy', 'outlaw', 'outlaw', 'renegade'],
    6: ['sheriff', 'deputy', 'outlaw', 'outlaw', 'outlaw', 'renegade'],
    7: ['sheriff', 'deputy', 'deputy', 'outlaw', 'outlaw', 'outlaw', 'renegade'],
  };
  return (base[n] || base[4]).slice();
}
const ROLE_KO = { sheriff: '보안관', deputy: '부관', outlaw: '무법자', renegade: '배신자' };

// ── 거리 계산 ─────────────────────────────────────────────────────
//  생존자 원형 배치 기준 최단 거리 + 대상 무스탕/폴(+1) + 내 조준경/로즈(-1)
function distance(players, from, to) {
  if (from === to) return 0;
  const alive = players.map((p, i) => ({ p, i })).filter((x) => x.p.hp > 0);
  const ai = alive.findIndex((x) => x.i === from);
  const bi = alive.findIndex((x) => x.i === to);
  if (ai < 0 || bi < 0) return 99;
  const n = alive.length;
  let d = Math.abs(ai - bi);
  d = Math.min(d, n - d);
  const tgt = players[to], me = players[from];
  if (tgt.equip.some((c) => c.id === 'mustang')) d += 1;
  if (tgt.character === 'paul') d += 1;
  if (me.equip.some((c) => c.id === 'scope')) d -= 1;
  if (me.character === 'rose') d -= 1;
  return Math.max(1, d);
}

function weaponRange(player) {
  const w = player.equip.find((c) => CARD_DEFS[c.id] && CARD_DEFS[c.id].kind === 'weapon');
  return w ? CARD_DEFS[w.id].range : 1;
}

// Draw! 판정 — 럭키 듀크는 2장 중 predicate를 만족하는 쪽 우선
function drawCheck(game, seat, predicate) {
  const flip = () => {
    if (!game.deck.length) reshuffle(game);
    const c = game.deck.shift();
    game.discard.push(c);
    return c;
  };
  const first = flip();
  if (game.players[seat].character === 'lucky') {
    const second = flip();
    const pick = predicate(first) ? first : second;
    return { card: pick, ok: predicate(pick), flipped: [first, second] };
  }
  return { card: first, ok: predicate(first), flipped: [first] };
}

function reshuffle(game) {
  // 버림패를 섞어 산으로 (마지막 버림 1장은 남김)
  const keep = game.discard.pop() || null;
  const pool = game.discard;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(game.rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  game.deck = pool;
  game.discard = keep ? [keep] : [];
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((rng || Math.random)() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = {
  CARD_DEFS, CHARACTERS, ROLE_KO,
  buildDeckExact, rolesFor, distance, weaponRange, drawCheck, reshuffle, shuffled,
};
