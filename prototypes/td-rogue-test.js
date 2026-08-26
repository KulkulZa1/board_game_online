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

console.log('\n[페이싱 — 심장이 뛰어야 한다]');
{
  // 길 완주 시간: 초기값(침략병 36초)은 실측 결과 지독하게 루즈했다
  const walk = (t) => TD.PATH_LEN / TD.ENEMIES[t].speed;
  ok(walk('grunt') < 26, '침략병이 길을 26초 안에 완주한다 (느리면 게임이 늘어진다)', walk('grunt').toFixed(1) + '초');
  ok(walk('boss') < 45, '보스도 45초 안에 완주한다', walk('boss').toFixed(1) + '초');
  ok(walk('runner') < walk('grunt'), '질주귀가 가장 빠르다');

  // 건설 단계 카운트다운 — 시계가 없으면 게임이 아니라 스프레드시트다
  ok(TD.BUILD_SECONDS(1) > TD.BUILD_SECONDS(20), '웨이브가 오를수록 준비 시간이 짧아진다',
     `${TD.BUILD_SECONDS(1).toFixed(1)}초 → ${TD.BUILD_SECONDS(20).toFixed(1)}초`);
  ok(TD.BUILD_SECONDS(40) >= 6, '아무리 후반이어도 최소 6초는 준다 (조작 불가능하면 안 된다)');
  ok(TD.BUILD_SECONDS(1) <= 14, '초반 준비 시간도 너무 길지 않다 (세션의 절반이 대기이면 안 된다)',
     TD.BUILD_SECONDS(1).toFixed(1) + '초');

  const run = new TD.Run(rng(11));
  run.build('archer', 0, 0);
  ok(run.buildLeft > 0, '건설 단계에는 카운트다운이 있다');
  const before = run.buildLeft;
  run.tick(0.5);
  ok(run.buildLeft < before, '건설 중에도 시간이 흐른다');
  run.pendingDraft = [TD.PERKS[0]];
  const held = run.buildLeft;
  run.tick(0.5);
  ok(run.buildLeft === held, '드래프트를 고르는 동안에는 시계가 멈춘다 (유일한 숨돌릴 틈)');
  run.pendingDraft = null;
  let guard = 0;
  while (run.phase === 'build' && guard++ < 500) run.tick(0.1);
  ok(run.phase === 'wave', '카운트다운이 끝나면 웨이브가 자동 출격한다');

  // 조기 출격 보너스 — 유혹이되 강제가 아니어야 한다
  const r2 = new TD.Run(rng(12));
  const g0 = r2.gold;
  r2.startWave();
  ok(r2.gold > g0 && r2.earlyBonus > 0, '남은 시간을 금으로 바꿔 준다 (조기 출격 보너스)', `+${r2.earlyBonus}`);
  const waveIncome = 15 + 20 * 2;
  ok(TD.EARLY_GOLD(20, TD.BUILD_SECONDS(20)) < waveIncome, '보너스가 정규 수입을 넘지 않는다 (기다리는 플레이가 파산하면 안 된다)',
     `${TD.EARLY_GOLD(20, TD.BUILD_SECONDS(20))} < ${waveIncome}`);
}

console.log('\n[연속 격파 — 누수 한 번이 아깝게]');
{
  const run = new TD.Run(rng(13));
  run.wave = 3; run.hpMult = 1; run.phase = 'wave';
  const firstTier = TD.COMBO_TIERS[TD.COMBO_TIERS.length - 1].at;
  for (let i = 0; i < firstTier + 1; i++) { run._spawn('grunt'); run.enemies[i].hp = -1; }
  run.tick(0.01);
  ok(run.streak === firstTier + 1, '연속 처치가 쌓인다', String(run.streak));
  ok(run.comboTier() && run.comboTier().mult > 1, `${firstTier}연속부터 보상 배율이 붙는다`);
  ok(run.bestStreak === firstTier + 1, '최고 연쇄가 기록된다');
  // 문턱이 너무 낮으면 연쇄가 아예 안 끊겨 '상시 배율'이 된다 (실측 최고 연쇄 305)
  ok(firstTier >= 12 && TD.COMBO_TIERS[0].at >= 60, '상위 등급은 후반의 성취여야 한다',
     TD.COMBO_TIERS.map((t) => t.at).join('/'));
  ok(TD.COMBO_TIERS[0].mult <= 2, '최고 배율도 경제를 뒤집을 만큼은 아니다', '×' + TD.COMBO_TIERS[0].mult);
  ok(TD.COMBO_WINDOW <= 2, '연쇄 창이 짧아야 소강 상태에서 끊긴다', TD.COMBO_WINDOW + '초');

  // 누수 = 연쇄 전멸
  run._spawn('grunt');
  run.enemies[0].pos = TD.PATH_LEN;
  const ev = run.tick(0.01);
  ok(run.streak === 0, '적을 한 마리라도 흘리면 연쇄가 끊긴다');
  ok(ev.some((e) => e.t === 'leak' && e.lostStreak > 0), '얼마나 잃었는지 이벤트로 알려준다 (연출용)');

  // 콤보 창이 지나면 자연 소멸
  const r3 = new TD.Run(rng(14));
  r3.phase = 'wave'; r3.streak = 5; r3.streakT = 0.2;
  r3.tick(0.5);
  ok(r3.streak === 0, '한동안 못 잡으면 연쇄가 식는다');
}

console.log('\n[보스 격노 · 위협도]');
{
  const run = new TD.Run(rng(15));
  run.wave = 5; run.hpMult = 1; run.phase = 'wave';
  run._spawn('boss');
  const boss = run.enemies[0];
  boss.pos = 0;
  run.tick(1.0);
  const slowStep = boss.pos;
  boss.pos = 0; boss.hp = boss.maxHp * 0.05;   // 빈사
  run.tick(1.0);
  ok(boss.pos > slowStep * 1.5, '보스는 피가 빠질수록 빨라진다 (다 잡아가던 놈이 출구로 튄다)',
     `${slowStep.toFixed(2)} → ${boss.pos.toFixed(2)} 칸/초`);

  const r2 = new TD.Run(rng(16));
  r2.phase = 'wave';
  ok(r2.threat() === 0, '적이 없으면 위협도 0');
  r2._spawn('grunt');
  r2.enemies[0].pos = (TD.PATH_LEN - 1) * 0.9;
  ok(r2.threat() > 0.85, '선두가 출구에 다가오면 위협도가 오른다 (화면 경고에 쓰인다)');
}

console.log('\n[융합 강화 — 후반 금의 종착지]');
{
  // 상한을 두면 보드를 다 채운 순간 금이 무의미해진다 (실측: 잔금 31,761 · 39칸 만석)
  const run = new TD.Run(rng(17));
  run.gold = 1e9;
  run.build('archer', 0, 0); run.upgrade(0, 0); run.upgrade(0, 0);
  run.build('archer', 1, 0); run.upgrade(1, 0); run.upgrade(1, 0);
  run.fuse(0, 0);
  const t = run.towerAt(0, 0);
  ok(t.fused && t.flv === 1, '융합체는 융합 Lv1 에서 시작한다');
  const d1 = run.towerStats(t).dmg;
  const c1 = run.upgradeCost(t);
  ok(isFinite(c1), '융합체도 계속 강화할 수 있다 (상한 없음)');
  run.upgrade(0, 0); run.upgrade(0, 0);
  ok(t.flv === 3, '융합 Lv3 까지 올라간다');
  ok(isFinite(run.upgradeCost(t)), '그 위로도 열려 있다 — 금이 끝까지 힘으로 바뀐다');
  ok(run.towerStats(t).dmg > d1 * 2, '강화할수록 확실히 세진다', `${d1.toFixed(0)} → ${run.towerStats(t).dmg.toFixed(0)}`);
  ok(run.upgradeCost(t) > c1 * 4, '비용은 피해보다 빠르게 오른다 (금이 늘 부족해야 벽이 생긴다)');
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
  const r = TD.buyMeta(m, 'walls');
  ok(r.ok && r.meta.upgrades.walls === 1 && r.meta.cores === 500 - 35, '메타 구매/차감');
  ok(!TD.buyMeta(TD.normalizeMeta({ cores: 5 }), 'lens').ok, '핵이 모자라면 구매 실패');
  const run = new TD.Run(rng(5), TD.normalizeMeta({ upgrades: { armory: 2, walls: 3, forge: 3, tempo: 3 } }));
  ok(run.unlocked.includes('sniper') && run.unlocked.includes('mint'), '병기고: 시작 해금');
  ok(run.lives === 16, '겹성벽: 시작 생명 +6', `lives=${run.lives}`);
  // 메타는 정액이 아니라 배율이어야 벽을 움직인다 (실측: 정액 시절 다섯 개 전부 사도 +0.5웨이브)
  ok(run.mods.dmgMult > 1.2 && run.mods.bountyMult > 1.2, '단조 화력·전리품 감식은 배율로 들어간다',
     `dmg×${run.mods.dmgMult.toFixed(2)} bounty×${run.mods.bountyMult.toFixed(2)}`);
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
  for (let s = 1; s <= 30; s++) wavesMeta.push(play(s * 17, TD.normalizeMeta({ upgrades: { forge: 3, tempo: 3, walls: 3, lens: 1, armory: 2, echo: 3 } })));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const baseMean = mean(waves), metaMean = mean(wavesMeta);
  wavesMeta.sort((a, b) => a - b);
  console.log(`    풀메타 30판: 중앙값 ${wavesMeta[15]} · 평균 ${metaMean.toFixed(1)} (기준 평균 ${baseMean.toFixed(1)})`);
  // 중앙값은 정수라 둔감하다 — 평균으로 본다. 메타가 정액 보너스였을 땐 다섯 개를
  // 전부 최대로 사도 +0.5웨이브였다 (죽은 화폐). 배율로 바꾼 뒤 +2.6.
  ok(metaMean - baseMean >= 1.5, '메타 투자가 벽을 실제로 밀어낸다 (+1.5웨이브 이상)',
     `${baseMean.toFixed(1)} → ${metaMean.toFixed(1)}`);
}

console.log('\n[결정성]');
{
  const a = new TD.Run(rng(7)); const b = new TD.Run(rng(7));
  a.build('archer', 1, 0); b.build('archer', 1, 0);
  a.startWave(); b.startWave();
  for (let i = 0; i < 300; i++) { a.tick(0.1); b.tick(0.1); }
  ok(a.gold === b.gold && a.enemies.length === b.enemies.length, '같은 시드는 같은 판 (결정적)');
}

console.log('\n[저주의 대가는 진짜여야 한다]');
{
  // pickDraft 의 Math.max(1, ...) 바닥값이 생명이 적을 때 대가를 0으로 만들었다.
  // 과부하 코어(피해 +35%, 생명 -3)가 사실상 공짜가 되면 1.35^n 이 적 체력 1.34^n 을
  // 앞질러 무한 생존이 열린다 (실측: 강제 선택 시 80/80 판이 웨이브 60 초과).
  const lifeCurse = TD.CURSES.find((c) => c.curse && c.curse.livesCap);
  ok(!!lifeCurse, '생명을 요구하는 저주가 존재한다', lifeCurse && lifeCurse.id);

  const offeredAt = (lives) => {
    const run = new TD.Run(rng(77));
    run.wave = 6; run.lives = lives;
    let n = 0;
    for (let i = 0; i < 400; i++) if (run._draftOffers().some((c) => c.id === lifeCurse.id)) n++;
    return n;
  };
  ok(offeredAt(10) > 0, '생명이 넉넉하면 제시된다');
  ok(offeredAt(2) === 0, '대가를 낼 수 없으면 아예 제시되지 않는다 (바닥값이 대가를 공짜로 만드는 구멍)',
     `생명2 에서 ${offeredAt(2)}회`);

  // 고르면 실제로 생명이 준다
  const run = new TD.Run(rng(78));
  run.wave = 6; run.lives = 10;
  run.pendingDraft = [lifeCurse];
  const before = run.lives;
  run.pickDraft(lifeCurse.id);
  ok(run.lives === before + lifeCurse.curse.livesCap, '고르면 생명이 실제로 줄어든다',
     `${before} → ${run.lives}`);
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
