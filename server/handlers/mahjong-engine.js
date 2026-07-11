// 리치 마작 엔진 — 순수 로직 (타일·샹텐·화료·역·점수)
// 소켓/방 상태와 완전히 분리되어 헤드리스 테스트 가능: node prototypes/mahjong-engine-test.js
//
// 타일 인덱스: 0-8 만수(1m-9m), 9-17 통수(1p-9p), 18-26 삭수(1s-9s),
//              27-30 풍패(東南西北), 31-33 삼원패(白發中)
'use strict';

const KIND_COUNT = 34;
const MAN = 0, PIN = 9, SOU = 18, HONOR = 27;
const EAST = 27, SOUTH = 28, WEST = 29, NORTH = 30, HAKU = 31, HATSU = 32, CHUN = 33;

const TILE_NAMES = [
  '1만', '2만', '3만', '4만', '5만', '6만', '7만', '8만', '9만',
  '1통', '2통', '3통', '4통', '5통', '6통', '7통', '8통', '9통',
  '1삭', '2삭', '3삭', '4삭', '5삭', '6삭', '7삭', '8삭', '9삭',
  '동', '남', '서', '북', '백', '발', '중',
];

const isHonor = (t) => t >= HONOR;
const isTerminal = (t) => !isHonor(t) && (t % 9 === 0 || t % 9 === 8);
const isTerminalOrHonor = (t) => isHonor(t) || isTerminal(t);
const suitOf = (t) => (t < 9 ? 0 : t < 18 ? 1 : t < 27 ? 2 : 3);
const numOf = (t) => (isHonor(t) ? 0 : (t % 9) + 1);

// ── 덱/카운트 유틸 ────────────────────────────────────────────────
function toCounts(tiles) {
  const c = new Array(KIND_COUNT).fill(0);
  for (const t of tiles) c[t]++;
  return c;
}

// ── 샹텐 계산 ─────────────────────────────────────────────────────
// 표준형: 재귀적으로 면자/부분면자를 뽑아 8 - 2*면자 - (부분면자+머리) 최소화
function shantenStandard(counts) {
  let best = 8;
  const c = counts.slice();

  function walkSets(idx, sets) {
    // 면자 추출이 끝나면 부분면자 추출로
    if (idx >= KIND_COUNT) { walkPartials(0, sets, 0, false); return; }
    if (c[idx] === 0) { walkSets(idx + 1, sets); return; }
    // 각자(트리플)
    if (c[idx] >= 3) {
      c[idx] -= 3;
      walkSets(idx, sets + 1);
      c[idx] += 3;
    }
    // 순자(런) — 수패만
    if (!isHonor(idx) && numOf(idx) <= 7 && c[idx + 1] > 0 && c[idx + 2] > 0) {
      c[idx]--; c[idx + 1]--; c[idx + 2]--;
      walkSets(idx, sets + 1);
      c[idx]++; c[idx + 1]++; c[idx + 2]++;
    }
    walkSets(idx + 1, sets);
  }

  function walkPartials(idx, sets, partials, hasPair) {
    if (sets + partials > 4) return;
    // 하한 가지치기
    const sh = 8 - 2 * sets - partials - (hasPair ? 1 : 0);
    if (sh >= best) {
      // 남은 타일로 더 줄일 여지가 없으면 중단해도 되지만 단순화를 위해 계속 탐색
    }
    if (idx >= KIND_COUNT) {
      if (sh < best) best = sh;
      return;
    }
    if (c[idx] === 0) { walkPartials(idx + 1, sets, partials, hasPair); return; }
    // 머리(패어)
    if (c[idx] >= 2) {
      c[idx] -= 2;
      if (!hasPair) walkPartials(idx, sets, partials, true);
      else if (sets + partials < 4) walkPartials(idx, sets, partials + 1, true);   // 두 번째 패어는 부분면자
      c[idx] += 2;
    }
    // 부분 순자 (양면/간짱/변짱)
    if (!isHonor(idx) && sets + partials < 4) {
      if (numOf(idx) <= 8 && c[idx + 1] > 0) {
        c[idx]--; c[idx + 1]--;
        walkPartials(idx, sets, partials + 1, hasPair);
        c[idx]++; c[idx + 1]++;
      }
      if (numOf(idx) <= 7 && c[idx + 2] > 0) {
        c[idx]--; c[idx + 2]--;
        walkPartials(idx, sets, partials + 1, hasPair);
        c[idx]++; c[idx + 2]++;
      }
    }
    walkPartials(idx + 1, sets, partials, hasPair);
  }

  walkSets(0, 0);
  return best;
}

function shantenChiitoi(counts) {
  let pairs = 0, kinds = 0;
  for (let i = 0; i < KIND_COUNT; i++) {
    if (counts[i] > 0) kinds++;
    if (counts[i] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

function shantenKokushi(counts) {
  let kinds = 0, hasPair = false;
  for (let i = 0; i < KIND_COUNT; i++) {
    if (!isTerminalOrHonor(i)) continue;
    if (counts[i] > 0) kinds++;
    if (counts[i] >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

// melds: 공개 면자 수(치/펑/깡) — 손패는 13 - 3*melds 장
function shanten(counts, meldCount) {
  const m = meldCount || 0;
  // 표준형은 공개 면자를 완성 면자로 간주
  let best = shantenStandardWithMelds(counts, m);
  if (m === 0) {
    best = Math.min(best, shantenChiitoi(counts), shantenKokushi(counts));
  }
  return best;
}

function shantenStandardWithMelds(counts, meldCount) {
  // 기존 walkSets에 시작 면자 수를 주입
  let best = 8;
  const c = counts.slice();
  function walkSets(idx, sets) {
    if (idx >= KIND_COUNT) { walkPartials(0, sets, 0, false); return; }
    if (c[idx] === 0) { walkSets(idx + 1, sets); return; }
    if (c[idx] >= 3) { c[idx] -= 3; walkSets(idx, sets + 1); c[idx] += 3; }
    if (!isHonor(idx) && numOf(idx) <= 7 && c[idx + 1] > 0 && c[idx + 2] > 0) {
      c[idx]--; c[idx + 1]--; c[idx + 2]--;
      walkSets(idx, sets + 1);
      c[idx]++; c[idx + 1]++; c[idx + 2]++;
    }
    walkSets(idx + 1, sets);
  }
  function walkPartials(idx, sets, partials, hasPair) {
    if (sets + partials > 4) return;
    if (idx >= KIND_COUNT) {
      const sh = 8 - 2 * sets - partials - (hasPair ? 1 : 0);
      if (sh < best) best = sh;
      return;
    }
    if (c[idx] === 0) { walkPartials(idx + 1, sets, partials, hasPair); return; }
    if (c[idx] >= 2) {
      c[idx] -= 2;
      if (!hasPair) walkPartials(idx, sets, partials, true);
      else if (sets + partials < 4) walkPartials(idx, sets, partials + 1, true);
      c[idx] += 2;
    }
    if (!isHonor(idx) && sets + partials < 4) {
      if (numOf(idx) <= 8 && c[idx + 1] > 0) {
        c[idx]--; c[idx + 1]--;
        walkPartials(idx, sets, partials + 1, hasPair);
        c[idx]++; c[idx + 1]++;
      }
      if (numOf(idx) <= 7 && c[idx + 2] > 0) {
        c[idx]--; c[idx + 2]--;
        walkPartials(idx, sets, partials + 1, hasPair);
        c[idx]++; c[idx + 2]++;
      }
    }
    walkPartials(idx + 1, sets, partials, hasPair);
  }
  walkSets(0, meldCount);
  return best;
}

// ── 화료(아가리) 분해 ─────────────────────────────────────────────
// 14장(-공개면자) 카운트를 4면자+1머리로 분해한 모든 경우를 반환.
// 각 분해: { pair: kind, sets: [{type:'run'|'trip', tile}] }
function decompose(counts) {
  const results = [];
  const c = counts.slice();
  for (let p = 0; p < KIND_COUNT; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const sets = [];
    (function walk(idx) {
      if (idx >= KIND_COUNT) {
        if (sets.reduce((s, x) => s + 3, 0) === c.reduce((s, x) => s + x, 0) + sets.length * 3 - 0) {}
        // 모두 소진됐는지 확인
        if (c.every((x) => x === 0)) results.push({ pair: p, sets: sets.slice() });
        return;
      }
      if (c[idx] === 0) { walk(idx + 1); return; }
      if (c[idx] >= 3) {
        c[idx] -= 3; sets.push({ type: 'trip', tile: idx });
        walk(idx);
        sets.pop(); c[idx] += 3;
      }
      if (!isHonor(idx) && numOf(idx) <= 7 && c[idx + 1] > 0 && c[idx + 2] > 0) {
        c[idx]--; c[idx + 1]--; c[idx + 2]--; sets.push({ type: 'run', tile: idx });
        walk(idx);
        sets.pop(); c[idx]++; c[idx + 1]++; c[idx + 2]++;
      }
      // idx에 타일이 남았는데 면자를 못 만들면 실패 경로
    })(0);
    c[p] += 2;
  }
  return results;
}

function isChiitoi(counts) {
  let pairs = 0;
  for (let i = 0; i < KIND_COUNT; i++) {
    if (counts[i] === 2) pairs++;
    else if (counts[i] !== 0) return false;
  }
  return pairs === 7;
}

function isKokushi(counts) {
  let hasPair = false;
  for (let i = 0; i < KIND_COUNT; i++) {
    if (isTerminalOrHonor(i)) {
      if (counts[i] === 0) return false;
      if (counts[i] === 2) hasPair = true;
      if (counts[i] > 2) return false;
    } else if (counts[i] !== 0) return false;
  }
  return hasPair;
}

// ── 역 판정 + 점수 ────────────────────────────────────────────────
// ctx: {
//   melds: [{type:'chi'|'pon'|'minkan'|'ankan'|'kakan', tile, tiles:[...]}],  공개/암깡
//   winTile, tsumo, riichi, ippatsu, rinshan, haitei, houtei,
//   seatWind, roundWind (kind index), doraIndicators:[], uraIndicators:[] (리치 시)
// }
// 반환: { yaku:[{name, han}], han, fu, yakuman, score:{...} } 또는 null(역 없음)
function evaluateWin(handTiles, ctx) {
  const counts = toCounts(handTiles);
  const melds = ctx.melds || [];
  const isMenzen = melds.every((m) => m.type === 'ankan');
  const all34 = counts.slice();
  for (const m of melds) for (const t of m.tiles) all34[t]++;

  // ── 역만 먼저 ──
  const yakuman = [];
  if (melds.length === 0 && isKokushi(counts)) yakuman.push({ name: '국사무쌍', han: 13 });
  // 자패만
  {
    let ok = true;
    for (let i = 0; i < HONOR; i++) if (all34[i] > 0) ok = false;
    if (ok) yakuman.push({ name: '자일색', han: 13 });
  }
  // 청노두(모든 패가 노두패)
  {
    let ok = true;
    for (let i = 0; i < KIND_COUNT; i++) if (all34[i] > 0 && !(isTerminal(i))) ok = false;
    if (ok) yakuman.push({ name: '청노두', han: 13 });
  }
  // 녹일색
  {
    const greens = [19, 20, 21, 23, 25, HATSU];   // 2,3,4,6,8삭 + 發
    let ok = true;
    for (let i = 0; i < KIND_COUNT; i++) if (all34[i] > 0 && !greens.includes(i)) ok = false;
    if (ok) yakuman.push({ name: '녹일색', han: 13 });
  }
  // 대삼원
  if (all34[HAKU] >= 3 && all34[HATSU] >= 3 && all34[CHUN] >= 3) yakuman.push({ name: '대삼원', han: 13 });
  // 사희화(대/소)
  {
    const winds = [EAST, SOUTH, WEST, NORTH].map((w) => all34[w]);
    const trips = winds.filter((n) => n >= 3).length;
    const pairs = winds.filter((n) => n === 2).length;
    if (trips === 4) yakuman.push({ name: '대사희', han: 13 });
    else if (trips === 3 && pairs === 1) yakuman.push({ name: '소사희', han: 13 });
  }

  // 표준 분해 (역만 사안커우 판정에도 필요)
  const decomps = decompose(counts);
  const chiitoi = melds.length === 0 && isChiitoi(counts);

  // 사안커우: 분해 중 하나가 (암각4개) — 론으로 완성된 각은 명각 취급
  for (const d of decomps) {
    const trips = d.sets.filter((s) => s.type === 'trip');
    const ankanCount = melds.filter((m) => m.type === 'ankan').length;
    let concealedTrips = trips.length + ankanCount;
    if (!ctx.tsumo && trips.some((s) => s.tile === ctx.winTile)) {
      // 론패가 각자를 완성했다면 그 각은 명각 — 단 다른 해석(순자 완성)이 있으면 decompose가 따로 다룬다
      concealedTrips -= 1;
    }
    if (isMenzen && concealedTrips >= 4) { yakuman.push({ name: '사암각', han: 13 }); break; }
  }

  if (yakuman.length) {
    const units = yakuman.length;   // 복합 역만 허용
    return {
      yaku: yakuman, han: 13 * units, fu: 0, yakuman: units,
      score: scoreOf(13 * units, 30, ctx.isDealer, ctx.tsumo, true, units),
    };
  }

  // ── 일반역 ──
  // 여러 분해 중 최고점을 채택
  let bestResult = null;
  const candidates = [];
  if (chiitoi) candidates.push({ chiitoi: true });
  for (const d of decomps) candidates.push({ d });
  if (!candidates.length) return null;

  for (const cand of candidates) {
    const yaku = [];
    let fu = 20;

    if (ctx.riichi) yaku.push({ name: '리치', han: 1 });
    if (ctx.ippatsu) yaku.push({ name: '일발', han: 1 });
    if (ctx.tsumo && isMenzen) yaku.push({ name: '멘젠쯔모', han: 1 });
    if (ctx.rinshan) yaku.push({ name: '영상개화', han: 1 });
    if (ctx.haitei) yaku.push({ name: '해저모월', han: 1 });
    if (ctx.houtei) yaku.push({ name: '하저로어', han: 1 });

    // 탕야오
    {
      let ok = true;
      for (let i = 0; i < KIND_COUNT; i++) if (all34[i] > 0 && isTerminalOrHonor(i)) ok = false;
      if (ok) yaku.push({ name: '탕야오', han: 1 });
    }
    // 혼일색/청일색
    {
      const suits = new Set();
      let honors = false;
      for (let i = 0; i < KIND_COUNT; i++) {
        if (all34[i] === 0) continue;
        if (isHonor(i)) honors = true; else suits.add(suitOf(i));
      }
      if (suits.size === 1) {
        if (honors) yaku.push({ name: '혼일색', han: isMenzen ? 3 : 2 });
        else yaku.push({ name: '청일색', han: isMenzen ? 6 : 5 });
      }
      // 혼노두 (모든 패가 요구패) — 치또이와 복합 가능
      let allTermHonor = true;
      for (let i = 0; i < KIND_COUNT; i++) if (all34[i] > 0 && !isTerminalOrHonor(i)) allTermHonor = false;
      if (allTermHonor) yaku.push({ name: '혼노두', han: 2 });
    }

    if (cand.chiitoi) {
      yaku.push({ name: '치또이쯔', han: 2 });
      fu = 25;
    } else {
      const d = cand.d;
      const allSets = d.sets.concat(melds.map((m) => ({
        type: m.type === 'chi' ? 'run' : 'trip',
        tile: m.type === 'chi' ? Math.min(...m.tiles) : m.tile,
        open: m.type !== 'ankan',
        kan: m.type.includes('kan'),
        meldType: m.type,
      })));

      // 핑후 (멘젠, 모든 면자 순자, 머리가 역패 아님, 양면 대기)
      if (isMenzen && allSets.every((s) => s.type === 'run')) {
        const pairIsYakuhai = d.pair >= HAKU || d.pair === ctx.seatWind || d.pair === ctx.roundWind;
        // 양면 대기 확인: winTile이 어떤 순자의 양끝이고 변짱(89-7, 12-3)이 아님
        const ryanmen = d.sets.some((s) => {
          if (s.type !== 'run') return false;
          const a = s.tile, b = s.tile + 1, cc = s.tile + 2;
          if (ctx.winTile === a && numOf(cc) !== 9 && numOf(a) !== 1) return true;
          if (ctx.winTile === cc && numOf(a) !== 1 && numOf(cc) !== 9) return true;
          if (ctx.winTile === a && numOf(a) >= 1 && numOf(cc) <= 7 + 2 && numOf(a) <= 6 && numOf(a) >= 1 && numOf(cc) < 9) return true;
          return false;
        });
        // 단순화: winTile이 순자의 끝단(변짱 제외)이면 양면으로 인정
        const ryanmen2 = d.sets.some((s) => {
          if (s.type !== 'run') return false;
          const lo = s.tile, hi = s.tile + 2;
          if (ctx.winTile === lo && numOf(hi) !== 9) return true;
          if (ctx.winTile === hi && numOf(lo) !== 1) return true;
          return false;
        });
        if (!pairIsYakuhai && ryanmen2) yaku.push({ name: '핑후', han: 1 });
      }

      // 역패 (백발중 + 장풍 + 자풍)
      for (const s of allSets) {
        if (s.type !== 'trip') continue;
        if (s.tile === HAKU) yaku.push({ name: '역패 백', han: 1 });
        if (s.tile === HATSU) yaku.push({ name: '역패 발', han: 1 });
        if (s.tile === CHUN) yaku.push({ name: '역패 중', han: 1 });
        if (s.tile === ctx.roundWind) yaku.push({ name: '장풍패', han: 1 });
        if (s.tile === ctx.seatWind) yaku.push({ name: '자풍패', han: 1 });
      }

      // 이페코/량페코 (멘젠)
      if (isMenzen) {
        const runKey = d.sets.filter((s) => s.type === 'run').map((s) => s.tile);
        const dup = {};
        for (const t of runKey) dup[t] = (dup[t] || 0) + 1;
        const pairsOfRuns = Object.values(dup).filter((n) => n >= 2).length +
          Object.values(dup).filter((n) => n >= 4).length;
        if (pairsOfRuns >= 2) yaku.push({ name: '량페코', han: 3 });
        else if (pairsOfRuns === 1) yaku.push({ name: '이페코', han: 1 });
      }

      // 삼색동순
      {
        const runs = allSets.filter((s) => s.type === 'run');
        outer:
        for (const r of runs) {
          if (isHonor(r.tile)) continue;
          const n = r.tile % 9;
          const have = [false, false, false];
          for (const r2 of runs) if (!isHonor(r2.tile) && r2.tile % 9 === n) have[suitOf(r2.tile)] = true;
          if (have[0] && have[1] && have[2]) {
            yaku.push({ name: '삼색동순', han: isMenzen ? 2 : 1 });
            break outer;
          }
        }
      }
      // 삼색동각
      {
        const trips = allSets.filter((s) => s.type === 'trip' && !isHonor(s.tile));
        outer2:
        for (const r of trips) {
          const n = r.tile % 9;
          const have = [false, false, false];
          for (const r2 of trips) if (r2.tile % 9 === n) have[suitOf(r2.tile)] = true;
          if (have[0] && have[1] && have[2]) { yaku.push({ name: '삼색동각', han: 2 }); break outer2; }
        }
      }
      // 일기통관
      {
        const runs = allSets.filter((s) => s.type === 'run' && !isHonor(s.tile));
        for (let su = 0; su < 3; su++) {
          const base = su * 9;
          const has = (t) => runs.some((r) => r.tile === t);
          if (has(base) && has(base + 3) && has(base + 6)) {
            yaku.push({ name: '일기통관', han: isMenzen ? 2 : 1 });
            break;
          }
        }
      }
      // 찬타/준찬타 (모든 면자+머리에 요구패 포함)
      {
        const setHasTermHonor = (s) => s.type === 'trip'
          ? isTerminalOrHonor(s.tile)
          : (isTerminal(s.tile) || isTerminal(s.tile + 2));
        const allHave = allSets.every(setHasTermHonor) && isTerminalOrHonor(d.pair);
        if (allHave) {
          const anyHonor = allSets.some((s) => s.type === 'trip' && isHonor(s.tile)) || isHonor(d.pair);
          const hasRun = allSets.some((s) => s.type === 'run');
          if (hasRun) {
            if (anyHonor) yaku.push({ name: '찬타', han: isMenzen ? 2 : 1 });
            else yaku.push({ name: '준찬타', han: isMenzen ? 3 : 2 });
          }
          // 순자가 없으면 혼노두/청노두 계열 — 위에서 처리
        }
      }
      // 또이또이
      if (allSets.every((s) => s.type === 'trip')) yaku.push({ name: '또이또이', han: 2 });
      // 삼암각
      {
        const ankan = melds.filter((m) => m.type === 'ankan').length;
        let conc = d.sets.filter((s) => s.type === 'trip').length + ankan;
        if (!ctx.tsumo && d.sets.some((s) => s.type === 'trip' && s.tile === ctx.winTile)) conc -= 1;
        if (conc >= 3) yaku.push({ name: '삼암각', han: 2 });
      }
      // 삼깡즈
      if (melds.filter((m) => m.kan || (m.type && m.type.includes('kan'))).length >= 3) {
        yaku.push({ name: '삼깡즈', han: 2 });
      }
      // 소삼원
      {
        const dragonTrips = [HAKU, HATSU, CHUN].filter((t) => allSets.some((s) => s.type === 'trip' && s.tile === t)).length;
        if (dragonTrips === 2 && [HAKU, HATSU, CHUN].includes(d.pair)) yaku.push({ name: '소삼원', han: 2 });
      }

      // ── 부 계산 ──
      fu = 20;
      if (!ctx.tsumo && isMenzen) fu += 10;   // 멘젠 론
      for (const s of allSets) {
        if (s.type !== 'trip') continue;
        let f = isTerminalOrHonor(s.tile) ? 8 : 4;   // 암각 기준
        const openTrip = s.open || (!ctx.tsumo && s.tile === ctx.winTile && !s.kan);
        if (openTrip) f /= 2;
        if (s.kan) f *= 4;
        fu += f;
      }
      // 머리 부 (역패)
      if (d.pair >= HAKU) fu += 2;
      if (d.pair === ctx.seatWind) fu += 2;
      if (d.pair === ctx.roundWind) fu += 2;
      // 대기 부 (간짱/변짱/단기 +2) — 단순화: 양면/샤보 외 +2
      {
        const isTanki = d.pair === ctx.winTile;
        const isShanpon = d.sets.some((s) => s.type === 'trip' && s.tile === ctx.winTile);
        const isRyanmen = d.sets.some((s) => {
          if (s.type !== 'run') return false;
          const lo = s.tile, hi = s.tile + 2;
          return (ctx.winTile === lo && numOf(hi) !== 9) || (ctx.winTile === hi && numOf(lo) !== 1);
        });
        if (isTanki || (!isRyanmen && !isShanpon)) fu += 2;
      }
      if (ctx.tsumo && !yaku.some((y) => y.name === '핑후')) fu += 2;
      // 핑후 쯔모는 20부, 핑후 론은 30부
      if (yaku.some((y) => y.name === '핑후')) fu = ctx.tsumo ? 20 : 30;
      fu = Math.ceil(fu / 10) * 10;
      if (fu < 20) fu = 20;
    }

    // 역이 하나도 없으면 화료 불가 (도라만으로는 못 남)
    if (!yaku.length) continue;

    // 도라
    const doraHan = countDora(all34, ctx.doraIndicators || []);
    if (doraHan) yaku.push({ name: '도라', han: doraHan });
    if (ctx.riichi) {
      const ura = countDora(all34, ctx.uraIndicators || []);
      if (ura) yaku.push({ name: '뒷도라', han: ura });
    }

    const han = yaku.reduce((s, y) => s + y.han, 0);
    const result = {
      yaku, han, fu: cand.chiitoi ? 25 : fu, yakuman: 0,
      score: scoreOf(han, cand.chiitoi ? 25 : fu, ctx.isDealer, ctx.tsumo, false, 0),
    };
    if (!bestResult || result.score.total > bestResult.score.total ||
        (result.score.total === bestResult.score.total && result.han > bestResult.han)) {
      bestResult = result;
    }
  }
  return bestResult;
}

// 도라 표시패 → 실제 도라
function doraFromIndicator(ind) {
  if (ind < HONOR) {
    const base = suitOf(ind) * 9;
    return base + ((ind - base + 1) % 9);
  }
  if (ind >= EAST && ind <= NORTH) return ind === NORTH ? EAST : ind + 1;
  return ind === CHUN ? HAKU : ind + 1;   // 백→발→중→백
}
function countDora(all34, indicators) {
  let n = 0;
  for (const ind of indicators) n += all34[doraFromIndicator(ind)] || 0;
  return n;
}

// ── 점수 계산 (리치 표준) ─────────────────────────────────────────
function scoreOf(han, fu, isDealer, tsumo, isYakuman, yakumanUnits) {
  let base;
  if (isYakuman) base = 8000 * (yakumanUnits || 1);
  else if (han >= 11) base = 6000;        // 삼배만
  else if (han >= 8) base = 4000;         // 배만
  else if (han >= 6) base = 3000;         // 하네만
  else if (han >= 5) base = 2000;         // 만관
  else {
    base = fu * Math.pow(2, 2 + han);
    if (base > 2000) base = 2000;         // 끊어올림 만관 없이 캡
  }
  const ceil100 = (x) => Math.ceil(x / 100) * 100;
  if (tsumo) {
    if (isDealer) {
      const each = ceil100(base * 2);
      return { type: 'tsumo', each, total: each * 3 };
    }
    const small = ceil100(base), big = ceil100(base * 2);
    return { type: 'tsumo', dealerPays: big, othersPay: small, total: big + small * 2 };
  }
  const total = ceil100(base * (isDealer ? 6 : 4));
  return { type: 'ron', total };
}

// ── 대기패(텐파이 시) 계산 ────────────────────────────────────────
function waitingTiles(counts13, meldCount) {
  const waits = [];
  for (let t = 0; t < KIND_COUNT; t++) {
    if (counts13[t] >= 4) continue;
    counts13[t]++;
    const win = isWinningHand(counts13, meldCount);
    counts13[t]--;
    if (win) waits.push(t);
  }
  return waits;
}

function isWinningHand(counts, meldCount) {
  if ((meldCount || 0) === 0) {
    if (isChiitoi(counts)) return true;
    if (isKokushi(counts)) return true;
  }
  // 표준형: 남은 카운트가 (4-meldCount)면자 + 1머리로 완전 분해되는가
  return decomposeQuick(counts, 4 - (meldCount || 0));
}

function decomposeQuick(counts, needSets) {
  const c = counts.slice();
  for (let p = 0; p < KIND_COUNT; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    if (canFormSets(c, 0, needSets)) { c[p] += 2; return true; }
    c[p] += 2;
  }
  return false;
}
function canFormSets(c, idx, need) {
  while (idx < KIND_COUNT && c[idx] === 0) idx++;
  if (idx >= KIND_COUNT) return need === 0;
  if (need === 0) return false;
  if (c[idx] >= 3) {
    c[idx] -= 3;
    if (canFormSets(c, idx, need - 1)) { c[idx] += 3; return true; }
    c[idx] += 3;
  }
  if (!isHonor(idx) && numOf(idx) <= 7 && c[idx + 1] > 0 && c[idx + 2] > 0) {
    c[idx]--; c[idx + 1]--; c[idx + 2]--;
    if (canFormSets(c, idx, need - 1)) { c[idx]++; c[idx + 1]++; c[idx + 2]++; return true; }
    c[idx]++; c[idx + 1]++; c[idx + 2]++;
  }
  return false;
}

// ── 벽(산) 생성 ───────────────────────────────────────────────────
function buildWall(rng) {
  const wall = [];
  for (let k = 0; k < KIND_COUNT; k++) for (let i = 0; i < 4; i++) wall.push(k);
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor((rng || Math.random)() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

module.exports = {
  KIND_COUNT, TILE_NAMES, EAST, SOUTH, WEST, NORTH, HAKU, HATSU, CHUN,
  isHonor, isTerminal, isTerminalOrHonor, suitOf, numOf,
  toCounts, shanten, shantenChiitoi, shantenKokushi,
  decompose, isChiitoi, isKokushi, isWinningHand, waitingTiles,
  evaluateWin, scoreOf, doraFromIndicator, countDora, buildWall,
};
