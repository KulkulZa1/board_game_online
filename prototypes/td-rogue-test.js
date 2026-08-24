// 첨탑 대란(타워 디펜스 로그라이트) 규칙·밸런스 검증
// 실행: node prototypes/td-rogue-test.js
'use strict';
const TD = require('../public/arcade/tower-defense/sim.js');

let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };
const rng = (seed) => TD.makeRng(seed);

console.log('\n[길과 격자]');
{
  ok(TD.PATH_LEN >= 25, `길이 충분히 길다 (${TD.PATH_LEN}칸) — 타워가 여러 번 쏠 시간`);
  ok(TD.PATH[0].x === 0, '입구는 왼쪽 끝');
  ok(TD.PATH[TD.PATH_LEN - 1].x === TD.COLS - 1, '출구는 오른쪽 끝');
  // 길은 연속이어야 한다 (인접 칸으로만 이어짐)
  let contiguous = true;
  for (let i = 1; i < TD.PATH_LEN; i++) {
    const a = TD.PATH[i - 1], b = TD.PATH[i];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) contiguous = false;
  }
  ok(contiguous, '길이 한 칸씩 이어져 있다 (순간이동 없음)');
  const buildable = TD.COLS * TD.ROWS - TD.PATH_LEN;
  ok(buildable >= 25, `타워 자리가 충분하다 (${buildable}칸)`);
}

console.log('\n[건설/업그레이드/융합]');
{
  const run = new TD.Run(rng(1));
  ok(run.gold >= 100, '시작 금으로 궁수탑 2개를 살 수 있다', String(run.gold));
  ok(!run.build('archer', TD.PATH[3].x, TD.PATH[3].y), '길 위에는 못 짓는다');
  const t = run.build('archer', 0, 0);
  ok(!!t, '빈 칸에 건설 성공');
  ok(!run.build('archer', 0, 0), '겹쳐 짓기 불가');
  ok(!run.build('tesla', 2, 0), '해금 안 된 타워는 못 짓는다');

  run.gold = 999;
  run.upgrade(0, 0); run.upgrade(0, 0);
  ok(t.lv === 3, '업그레이드 Lv3 도달');
  ok(!run.upgrade(0, 0), 'Lv3 이상 업그레이드 불가');
  const t2 = run.build('archer', 1, 0);   // (0,1)은 길 위 — 옆칸은 (1,0)
  run.upgrade(1, 0); run.upgrade(1, 0);
  ok(!!run.canFuse(0, 0), '인접 같은 종류 Lv3 → 융합 가능');
  const before = run.towers.length;
  ok(run.fuse(0, 0), '융합 성공');
  ok(run.towers.length === before - 1, '융합은 재료를 소모한다 (공짜 아님)');
  ok(t.fused, '융합체 표시');
  const st = run.towerStats(t);
  ok(st.dmg > TD.TOWERS.archer.dmg * Math.pow(1.6, 2) * 2, '융합체는 뚜렷이 강하다');
}

console.log('\n[웨이브 루프]');
{
  const run = new TD.Run(rng(2));
  run.build('archer', 1, 0); run.build('archer', 2, 0);
  const spec = run.startWave();
  ok(spec && run.phase === 'wave', '웨이브 시작');
  ok(run.nextWavePreview().n === 2, '다음 웨이브 예고를 볼 수 있다 (계획의 근거)');
  let guard = 0;
  while (!run.waveOver() && run.phase === 'wave' && guard++ < 5000) run.tick(0.1);
  ok(run.waveOver(), '웨이브 1을 궁수탑 2개로 넘긴다', `guard=${guard} lives=${run.lives}`);
  const settle = run.settleWave();
  ok(settle && settle.income > 0, '클리어 수입 지급');
  ok(Array.isArray(run.pendingDraft) && run.pendingDraft.length === 3, '드래프트 3장 제시');
  ok(run.phase === 'build', '드래프트 중에는 건설 단계');
  ok(!run.startWave(), '드래프트를 고르기 전에는 다음 웨이브를 못 연다');
  const card = run.pendingDraft[0];
  ok(run.pickDraft(card.id), '카드 선택');
  ok(!run.pendingDraft, '선택 후 드래프트 종료');
}

console.log('\n[적 특성]');
{
  // 방패병: 방패 수만큼 타격을 흡수, 저격탑은 무시
  const run = new TD.Run(rng(3));
  run._spawn('shield');
  const e = run.enemies[0];
  const plain = { pierceShield: false, slow: 0, burn: 0, freeze: 0 };
  run._hit(e, 10, plain, []);
  ok(e.hp === e.maxHp && e.shield === 3, '방패가 타격을 흡수한다');
  run._hit(e, 10, { ...plain, pierceShield: true }, []);
  ok(e.hp < e.maxHp, '저격(방패 무시)은 바로 박힌다');

  // 보스 웨이브
  const spec5 = TD.waveSpec(5);
  ok(spec5.list.some((g) => g.type === 'boss'), '5의 배수 웨이브에는 보스');
  ok(TD.waveSpec(6).hpMult > TD.waveSpec(5).hpMult, '체력 배율이 계속 오른다');
  ok(TD.waveSpec(30).hpMult > TD.waveSpec(20).hpMult * 3, '후반 램프는 지수보다 가파르다 (벽이 존재)');
}

console.log('\n[저주 — 이득에는 대가]');
{
  const run = new TD.Run(rng(4));
  run.wave = 4;
  run.pendingDraft = [TD.CURSES[0]];
  const g0 = run.gold;
  run.pickDraft('bloodpact');
  ok(run.gold === g0 + 160, '피의 계약: 즉시 +160 금');
  ok(run.curses.hpMult > 1, '대가: 적 체력 배율 증가');
}

console.log('\n[메타 — 죽어도 남는다]');
{
  const m0 = TD.normalizeMeta({});
  ok(m0.cores === 0 && Object.keys(m0.upgrades).length === TD.META_UPGRADES.length, '빈 메타 정규화');
  const earned = TD.coresEarned(12, 4000, m0);
  ok(earned > 0, '판이 끝나면 마나핵이 남는다', String(earned));
  ok(TD.coresEarned(12, 4000, TD.normalizeMeta({ upgrades: { echo: 3 } })) > earned, '메아리 핵은 획득을 늘린다');

  // 인플레이션 방지 — √정산 (스네이크·벽돌깨기의 실측 교훈)
  const shopTotal = TD.META_UPGRADES.reduce((a, u) => { let t = 0; for (let l = 0; l < u.max; l++) t += u.cost(l); return a + t; }, 0);
  const god = TD.coresEarned(40, 500000, m0);
  ok(god < shopTotal, '신적인 판도 상점 전체보다 적게 준다', `${god} < ${shopTotal}`);

  let m = TD.normalizeMeta({ cores: 500 });
  const r = TD.buyMeta(m, 'vault');
  ok(r.ok && r.meta.upgrades.vault === 1 && r.meta.cores === 500 - 30, '메타 구매/차감');
  ok(!TD.buyMeta(TD.normalizeMeta({ cores: 5 }), 'lens').ok, '핵이 모자라면 구매 실패');
  const run = new TD.Run(rng(5), TD.normalizeMeta({ upgrades: { armory: 2, walls: 3, vault: 3 } }));
  ok(run.unlocked.includes('sniper') && run.unlocked.includes('mint'), '병기고: 시작 해금');
  ok(run.lives === 16 && run.gold === 190, '겹성벽·개전 자금 적용', `lives=${run.lives} gold=${run.gold}`);
}

console.log('\n[밸런스 — 봇 플레이 분포]');
{
  // 간단 그리디 봇: 궁수 2 → 냉각 → 확장/업그레이드/융합, 드래프트는 안전 카드
  function play(seed, meta) {
    const run = new TD.Run(rng(seed), meta);
    const spots = [];
    for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) {
      if (TD.onPath(x, y)) continue;
      let cov = 0;
      for (const p of TD.PATH) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= 4.8) cov++;
      spots.push({ x, y, cov });
    }
    spots.sort((a, b) => b.cov - a.cov);
    let guard = 0;
    while (run.phase !== 'over' && guard++ < 120000) {
      if (run.pendingDraft) {
        const pick = run.pendingDraft.find((c) => c.kind !== 'curse') || run.pendingDraft[0];
        run.pickDraft(pick.id);
      }
      if (run.phase === 'build') {
        for (let i = 0; i < 6; i++) {
          for (const t of run.towers) if (run.canFuse(t.x, t.y)) { run.fuse(t.x, t.y); break; }
          const up = run.towers.find((t) => isFinite(run.upgradeCost(t)) && run.gold >= run.upgradeCost(t) + 60);
          if (up) { run.upgrade(up.x, up.y); continue; }
          const counts = {};
          run.towers.forEach((t) => counts[t.type] = (counts[t.type] || 0) + 1);
          const want = run.towers.length < 2 ? 'archer' : !counts.frost ? 'frost'
            : (counts.archer || 0) <= (counts.cannon || 0) + 1 ? 'archer' : 'cannon';
          const type = run.unlocked.includes(want) ? want : 'archer';
          if (run.gold < run.buildCost(type) + 30) break;
          let spot = null;
          for (const t of run.towers) {
            if (t.type !== type || t.fused) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
              if (run.canBuild(t.x + dx, t.y + dy)) { spot = { x: t.x + dx, y: t.y + dy }; break; }
            if (spot) break;
          }
          if (!spot) spot = spots.find((s) => run.canBuild(s.x, s.y));
          if (spot) run.build(type, spot.x, spot.y); else break;
        }
        run.startWave();
      }
      run.tick(0.1);
      if (run.waveOver()) run.settleWave();
      if (run.wave > 45) break;
    }
    return run.wave;
  }
  const waves = [];
  for (let s = 1; s <= 30; s++) waves.push(play(s * 17, TD.normalizeMeta({})));
  waves.sort((a, b) => a - b);
  const med = waves[15], max = waves[29];
  console.log(`    메타0 30판: 중앙값 ${med} · 범위 ${waves[0]}~${max}`);
  ok(med >= 8, '봇 중앙값이 8웨이브 이상 (첫 판이 순삭이 아님)', String(med));
  ok(max <= 42, '상한 없는 무한 생존은 없다 (벽이 있다)', String(max));
  const wavesMeta = [];
  for (let s = 1; s <= 30; s++) wavesMeta.push(play(s * 17, TD.normalizeMeta({ upgrades: { vault: 3, walls: 3, lens: 1, armory: 2, echo: 3 } })));
  wavesMeta.sort((a, b) => a - b);
  console.log(`    풀메타 30판: 중앙값 ${wavesMeta[15]} · 최대 ${wavesMeta[29]}`);
  ok(wavesMeta[15] > med, '메타 투자가 실제로 더 멀리 보낸다', `${med} → ${wavesMeta[15]}`);
}

console.log('\n[결정성]');
{
  const a = new TD.Run(rng(7)); const b = new TD.Run(rng(7));
  a.build('archer', 1, 0); b.build('archer', 1, 0);
  a.startWave(); b.startWave();
  for (let i = 0; i < 300; i++) { a.tick(0.1); b.tick(0.1); }
  ok(a.gold === b.gold && a.enemies.length === b.enemies.length, '같은 시드는 같은 판 (결정적)');
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
