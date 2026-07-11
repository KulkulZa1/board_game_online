// 리치 마작 엔진 검증 — 알려진 손패/점수와 대조
// 실행: node prototypes/mahjong-engine-test.js
'use strict';
const E = require('../server/handlers/mahjong-engine.js');
const { toCounts, shanten, evaluateWin, isWinningHand, waitingTiles, scoreOf, doraFromIndicator } = E;

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
// 표기: m=만(0-8), p=통(9-17), s=삭(18-26), z=자패(동남서북백발중 1-7)
function tiles(str) {
  const out = [];
  let nums = [];
  for (const ch of str) {
    if (ch >= '1' && ch <= '9') nums.push(+ch);
    else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
      for (const n of nums) out.push(base + n - 1);
      nums = [];
    }
  }
  return out;
}

console.log('\n[샹텐]');
ok(shanten(toCounts(tiles('123m456m789m11p45s')), 0) === 0, '텐파이(양면 대기) = 0샹텐');
ok(shanten(toCounts(tiles('123m456m789m11p456s')), 0) === -1, '화료형 14장 = -1');
ok(shanten(toCounts(tiles('1199m1199p1199s11z')), 0) <= 1, '치또이 1샹텐 이하');
ok(shanten(toCounts(tiles('19m19p19s1234567z')), 0) === 0, '국사 13면 대기 = 0샹텐');
ok(shanten(toCounts(tiles('147m258p369s135z')), 0) >= 3, '흩어진 배패 = 3샹텐 이상');

console.log('\n[화료 판정]');
ok(isWinningHand(toCounts(tiles('123m456m789m11p456s')), 0), '표준형 화료');
ok(isWinningHand(toCounts(tiles('1122m3344p5566s77z')), 0), '치또이 화료');
ok(isWinningHand(toCounts(tiles('119m19p19s1234567z')), 0), '국사 화료');
ok(!isWinningHand(toCounts(tiles('123m456m789m12p456s')), 0), '비화료 거부');

console.log('\n[대기패]');
{
  const w = waitingTiles(toCounts(tiles('123m456m789m11p45s')), 0);
  ok(w.includes(tiles('3s')[0]) && w.includes(tiles('6s')[0]) && w.length === 2, '45s 양면 → 3s/6s', JSON.stringify(w));
}

console.log('\n[역 판정]');
{
  // 탕야오+핑후 론 (양면): 234m 567m 234p 567s 88s, 론 7s... 5s6s+7s 양면
  const hand = tiles('234m567m234p88s567s');
  const r = evaluateWin(hand, { melds: [], winTile: tiles('7s')[0], tsumo: false, seatWind: 28, roundWind: 27, doraIndicators: [] });
  ok(r && r.yaku.some(y => y.name === '탕야오'), '탕야오 인정', r && JSON.stringify(r.yaku));
  ok(r && r.yaku.some(y => y.name === '핑후'), '핑후 인정 (양면·비역패머리)', r && JSON.stringify(r.yaku));
  ok(r && r.fu === 30, '핑후 론 = 30부', r && ('fu=' + r.fu));
}
{
  // 역패 백 (멘젠 론): 111z? 백=z5. 555z 123m 456p 789s 22m
  const hand = tiles('123m22m456p789s555z');
  const r = evaluateWin(hand, { melds: [], winTile: tiles('3m')[0], tsumo: false, seatWind: 28, roundWind: 27, doraIndicators: [] });
  ok(r && r.yaku.some(y => y.name === '역패 백'), '역패(백) 인정', r && JSON.stringify(r.yaku));
}
{
  // 치또이 + 도라: 도라표시 1m(0) → 도라 2m(1). 2m 페어 → 도라2
  const hand = tiles('2233m44p5566s7788p');   // 7쌍: 22m 33m 44p 55s(?) — 다시: 2233m 4477p 5566s 88p → 7쌍 확인
  const hand2 = tiles('2233m4477p5566s88p');
  const r = evaluateWin(hand2, { melds: [], winTile: tiles('8p')[0], tsumo: false, seatWind: 28, roundWind: 27, doraIndicators: [tiles('1m')[0]] });
  ok(r && r.yaku.some(y => y.name === '치또이쯔'), '치또이 인정', r && JSON.stringify(r.yaku));
  ok(r && r.fu === 25, '치또이 25부', r && ('fu=' + r.fu));
  ok(r && (r.yaku.find(y => y.name === '도라') || {}).han === 2, '도라 2 (2m 페어)', r && JSON.stringify(r.yaku));
}
{
  // 국사무쌍
  const hand = tiles('119m19p19s1234567z');
  const r = evaluateWin(hand, { melds: [], winTile: tiles('1m')[0], tsumo: true, seatWind: 28, roundWind: 27 });
  ok(r && r.yakuman >= 1 && r.yaku.some(y => y.name === '국사무쌍'), '국사무쌍 역만', r && JSON.stringify(r.yaku));
}
{
  // 대삼원: 백발중 각 + 123m + 99m
  const hand = tiles('123m99m555z666z777z');
  const r = evaluateWin(hand, { melds: [], winTile: tiles('9m')[0], tsumo: true, seatWind: 28, roundWind: 27 });
  ok(r && r.yaku.some(y => y.name === '대삼원'), '대삼원 역만', r && JSON.stringify(r.yaku));
}
{
  // 청일색 멘젠(6한) + 핑후 없음 확인
  const hand = tiles('11223345678999m');
  const r = evaluateWin(hand, { melds: [], winTile: tiles('9m')[0], tsumo: false, seatWind: 28, roundWind: 27 });
  ok(r && r.yaku.some(y => y.name === '청일색' && y.han === 6), '청일색 멘젠 6한', r && JSON.stringify(r.yaku));
}
{
  // 또이또이 (펑 2개 + 손 각 1 + 샤보 론)
  const melds = [
    { type: 'pon', tile: tiles('2p')[0], tiles: tiles('222p') },
    { type: 'pon', tile: tiles('6s')[0], tiles: tiles('666s') },
  ];
  const hand = tiles('333m77m44z4z');   // 333m + 44z+4z(론으로 각) + 77m 머리 → 론패 4z
  const r = evaluateWin(hand, { melds, winTile: tiles('4z')[0], tsumo: false, seatWind: 28, roundWind: 27 });
  ok(r && r.yaku.some(y => y.name === '또이또이'), '또이또이 인정', r && JSON.stringify(r.yaku));
}
{
  // 역 없음(형식 텐파이 론) → null
  const hand = tiles('234m567m234p88s567s');
  // 위 손은 탕야오가 있으니, 역이 안 나게: 123m 789m 123p 789p... 찬타가 뜨네. 오픈 상태로 핑후 불가 + 역패 없음:
  const melds = [{ type: 'chi', tile: tiles('1m')[0], tiles: tiles('123m') }];
  const hand2 = tiles('456m99p789s234s');   // 오픈 치 + 탕야오 아님(9p 머리, 789s)
  const r = evaluateWin(hand2, { melds, winTile: tiles('4s')[0], tsumo: false, seatWind: 28, roundWind: 29 });
  ok(r === null, '역 없으면 화료 불가(null)', r && JSON.stringify(r.yaku));
}

console.log('\n[점수]');
{
  const s = scoreOf(1, 30, false, false, false, 0);   // 30부 1한 자 론
  ok(s.total === 1000, '30부1한 자 론 = 1000', 'got ' + s.total);
  const s2 = scoreOf(4, 30, false, false, false, 0);
  ok(s2.total === 7700, '30부4한 자 론 = 7700', 'got ' + s2.total);
  const s3 = scoreOf(2, 25, false, false, false, 0);
  ok(s3.total === 1600, '25부2한(치또이) 자 론 = 1600', 'got ' + s3.total);
  const s4 = scoreOf(5, 30, false, false, false, 0);
  ok(s4.total === 8000, '만관 자 론 = 8000', 'got ' + s4.total);
  const s5 = scoreOf(5, 30, true, false, false, 0);
  ok(s5.total === 12000, '만관 친 론 = 12000', 'got ' + s5.total);
  const s6 = scoreOf(2, 30, false, true, false, 0);
  ok(s6.dealerPays === 1000 && s6.othersPay === 500, '30부2한 자 쯔모 = 500/1000', JSON.stringify(s6));
  const s7 = scoreOf(13, 30, false, false, true, 1);
  ok(s7.total === 32000, '역만 자 론 = 32000', 'got ' + s7.total);
}

console.log('\n[도라 표시패]');
ok(doraFromIndicator(tiles('9m')[0]) === tiles('1m')[0], '9m → 1m');
ok(doraFromIndicator(tiles('4z')[0]) === tiles('1z')[0], '북 → 동');
ok(doraFromIndicator(tiles('7z')[0]) === tiles('5z')[0], '중 → 백');

console.log('\n[성능] 샹텐 1000회');
{
  const t0 = Date.now();
  const rng = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let i = 0; i < 1000; i++) {
    const wall = E.buildWall(rng);
    shanten(toCounts(wall.slice(0, 13)), 0);
  }
  const ms = Date.now() - t0;
  ok(ms < 3000, `1000회 ${ms}ms (<3s)`);
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
