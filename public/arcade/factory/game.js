// 산업의 시대 (Age of Industry) — 팩토리오식 공장 자동화 아케이드 게임
// 자원 채굴 → 컨베이어 운송 → 가공 → 연구소 납품으로 1~4차 산업혁명을 진화시킨다.
(function () {
  'use strict';

  const FactoryState = window.FactoryState;
  const FactoryEvolution = window.FactoryEvolution;

  const canvas  = document.getElementById('c');
  const ctx     = canvas.getContext('2d');
  const wrapper = document.getElementById('gameWrapper');

  // ── 상수 ────────────────────────────────────────────────────────
  const TILE   = 40;          // 월드 타일 크기(px)
  const GRID_W = 46, GRID_H = 30;
  const BELT_SPEED = 2.2;     // 컨베이어 속도 (타일/초)
  const IN_CAP  = 6;          // 기계 입력 버퍼 한도(아이템 종류별)
  const OUT_CAP = 6;          // 기계 출력 버퍼 한도
  const GEN_OUTPUT   = 12;    // 발전기 1대 전력 생산량
  const GEN_FUEL_SEC = 5;     // 석탄 1개 = 연소 5초
  const GEN_FUEL_CAP = 20;    // 발전기 연료 버퍼 상한(초)
  const MINER_RATE   = 1.0;   // 채굴기 1개 / 1초
  const HIGH_KEY = 'arcade_factory_high';
  const SAVE_KEY = 'arcade_factory_save_v1';

  // 업그레이드: 티어 1~3 (속도/생산 배율 + 누적 RP 비용)
  const TIER_MULT = [1, 1.7, 2.6];   // 티어별 속도 배율
  const TIER_COST = [0, 40, 120];    // 해당 티어로 올리는 누적 RP 비용
  const MAX_TIER  = 3;
  // 유한 광맥: 셀당 매장량(채굴 1회 = 1 소모). 고갈 시 채굴기 유휴.
  const DEPOSIT_MIN = 600, DEPOSIT_VAR = 900;
  // 납품 1건당 획득 RP (연구포인트) — 시대 목표 아이템일수록 큼
  const DELIVER_RP = { gear: 2, motor: 8, robot: 30, ai_core: 100 };

  // 방향: 0=동, 1=남, 2=서, 3=북
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  // ── 아이템 정의 ─────────────────────────────────────────────────
  const ITEMS = {
    coal:         { name: '석탄',     c: '#2f2f3a' },
    iron_ore:     { name: '철광석',   c: '#9c7b5b' },
    copper_ore:   { name: '구리광석', c: '#b5651d' },
    sand:         { name: '규사',     c: '#d9c38c' },
    iron_plate:   { name: '철판',     c: '#aeb6c2' },
    copper_plate: { name: '구리판',   c: '#d98841' },
    wire:         { name: '구리선',   c: '#f0a85a' },
    silicon:      { name: '실리콘',   c: '#7d8794' },
    gear:         { name: '톱니바퀴', c: '#cfd6dd' },
    motor:        { name: '모터',     c: '#e07b39' },
    circuit:      { name: '회로',     c: '#37c46b' },
    robot:        { name: '로봇',     c: '#4aa3ff' },
    data:         { name: '데이터',   c: '#9b59b6' },
    ai_core:      { name: 'AI 코어',  c: '#f5d033' },
  };

  // ── 건물 정의 ───────────────────────────────────────────────────
  //   kind: belt | miner | machine | generator | lab
  //   machine 은 recipe(고정) 또는 smelt(입력별 매핑) 중 하나를 가진다.
  //   power>0 인 기계는 전력을 소비하며, 전력 부족 시 가공 속도가 느려진다.
  const B = {
    belt:       { name: '컨베이어',  ico: '➤', era: 1, kind: 'belt',      color: '#3b4a63' },
    miner:      { name: '채굴기',    ico: '⛏', era: 1, kind: 'miner',     color: '#5d6b48' },
    furnace:    { name: '화로',      ico: '🔥', era: 1, kind: 'machine',   color: '#6b3a2a', time: 1.0, power: 0,
                  smelt: { iron_ore: 'iron_plate', copper_ore: 'copper_plate', sand: 'silicon' } },
    workshop:   { name: '작업대',    ico: '🔧', era: 1, kind: 'machine',   color: '#4a5a6b', time: 1.0, power: 0,
                  recipe: { in: { iron_plate: 2 }, out: { gear: 1 } } },
    lab:        { name: '연구소',    ico: '🔬', era: 1, kind: 'lab',       color: '#6b4a7a' },
    generator:  { name: '발전기',    ico: '⚡', era: 2, kind: 'generator', color: '#8a6d2a' },
    wiremill:   { name: '선재기',    ico: '🧵', era: 2, kind: 'machine',   color: '#7a5a2a', time: 1.0, power: 2,
                  recipe: { in: { copper_plate: 1 }, out: { wire: 2 } } },
    assembler:  { name: '조립기',    ico: '🏭', era: 2, kind: 'machine',   color: '#3a5a7a', time: 1.5, power: 3,
                  recipe: { in: { gear: 1, wire: 2 }, out: { motor: 1 } } },
    circuitfab: { name: '회로공장',  ico: '💾', era: 3, kind: 'machine',   color: '#2a6b4a', time: 1.5, power: 4,
                  recipe: { in: { silicon: 1, wire: 1 }, out: { circuit: 1 } } },
    roboasm:    { name: '로봇조립',  ico: '🤖', era: 3, kind: 'machine',   color: '#3a6b8a', time: 2.0, power: 5,
                  recipe: { in: { motor: 1, circuit: 2 }, out: { robot: 1 } } },
    datacenter: { name: '데이터센터', ico: '🛰', era: 4, kind: 'machine',  color: '#5a3a8a', time: 1.5, power: 8,
                  recipe: { in: { circuit: 2 }, out: { data: 1 } } },
    ailab:      { name: 'AI 연구소', ico: '🧠', era: 4, kind: 'machine',   color: '#8a6a2a', time: 3.0, power: 10,
                  recipe: { in: { robot: 1, circuit: 2, data: 3 }, out: { ai_core: 1 } } },
  };
  const PALETTE_ORDER = ['belt', 'miner', 'furnace', 'workshop', 'lab', 'generator',
    'wiremill', 'assembler', 'circuitfab', 'roboasm', 'datacenter', 'ailab'];

  // ── 시대(산업혁명) 정의 ──────────────────────────────────────────
  const ERAS = [
    null,
    { name: '1차 산업혁명', sub: '증기 시대',     icon: '🔥', target: 'gear',    count: 30, bg: '#0e1117', grid: '#1b2433', accent: '#f5a623', label: '⚙ 톱니바퀴 연구' },
    { name: '2차 산업혁명', sub: '전기 시대',     icon: '⚡', target: 'motor',   count: 40, bg: '#0c1322', grid: '#18294a', accent: '#4aa3ff', label: '🛠 모터 연구' },
    { name: '3차 산업혁명', sub: '디지털 시대',   icon: '💾', target: 'robot',   count: 30, bg: '#08140f', grid: '#14361f', accent: '#2ecc71', label: '🤖 로봇 연구' },
    { name: '4차 산업혁명', sub: '인공지능 시대', icon: '🧠', target: 'ai_core', count: 20, bg: '#120a1e', grid: '#2c1947', accent: '#b388ff', label: '🧠 AI 코어 연구' },
  ];
  const ERA_STABILITY_SEC = 5;
  const DELIVER_SCORE = { gear: 1, motor: 6, robot: 25, ai_core: 120 };

  // ── 튜토리얼 단계 정의 ──────────────────────────────────────────
  const TUT_STEPS = [
    { text: '<b>채굴기⛏</b>를 철광석(갈색 테두리 타일) 위에 클릭해 놓으세요', hint: '채굴기가 이미 선택됐어요 · R키로 출력 방향 회전', tool: 'miner', event: 'miner', hl: 'ore' },
    { text: '<b>컨베이어➤</b>를 드래그해 채굴기에서 뻗어나가는 선을 그으세요', hint: '마우스를 누른 채 드래그하면 여러 칸을 한 번에 연결해요', tool: 'belt', event: 'belt', hl: null },
    { text: '<b>화로🔥</b>를 컨베이어 끝에 놓으세요 — 철광석을 철판으로 제련', hint: '화로 출력 방향도 맞춰주세요 (R키 회전)', tool: 'furnace', event: 'furnace', hl: null },
    { text: '<b>작업대🔧</b>를 화로 출력 쪽에 연결 — 철판 ×2 → 톱니바퀴', hint: '바로 옆에 붙이거나 컨베이어로 이어도 돼요', tool: 'workshop', event: 'workshop', hl: null },
    { text: '<b>연구소🔬</b>를 배치 — 톱니바퀴가 들어오면 자동 납품!', hint: '작업대 출력 방향에 연구소를 바로 붙이세요', tool: 'lab', event: 'lab', hl: null },
    { text: '공장 가동 중! 🏭 첫 납품을 기다려보세요', hint: '잘 안된다면 각 건물의 방향 점(·)과 연결을 확인하세요', tool: null, event: 'delivery', hl: null },
    { text: '🎉 첫 납품 성공! 이제 공장을 더 키워 <b>톱니바퀴 30개</b>를 달성하세요!', hint: '기계와 채굴기를 늘리면 생산량이 올라가요', tool: null, event: null, hl: null },
  ];

  // ── 시대별 가이드 콘텐츠 ────────────────────────────────────────
  const ERA_GUIDES = {
    1: {
      title: '🔥 1차 산업혁명 — 증기 시대',
      body: `
        <div class="era-badge">🔥 목표: 톱니바퀴 <b>30개</b> 납품</div>
        <h4>생산 체인</h4>
        <div class="chain">
          <span class="item">⛏ 채굴기</span><span class="arrow">→</span>
          <span class="item">철광석</span><span class="arrow">→</span>
          <span class="item">🔥 화로</span><span class="arrow">→</span>
          <span class="item">철판</span><span class="arrow">→</span>
          <span class="item">🔧 작업대</span><span class="arrow">→</span>
          <span class="item" style="color:#f5a623">⚙ 톱니바퀴</span><span class="arrow">→</span>
          <span class="item">🔬 연구소</span>
        </div>
        <h4>핵심 규칙</h4>
        <div class="tip">채굴기는 반드시 <b>광맥 타일</b> 위에 놓아야 자원을 캡니다.</div>
        <div class="tip">건물끼리 <b>바로 붙이면</b> 컨베이어 없이 아이템이 전달됩니다. 단, 방향이 맞아야 해요.</div>
        <div class="tip">작업대는 철판이 <b>2개</b> 모여야 톱니바퀴 1개를 만들어요.</div>
        <h4>팁</h4>
        <div class="tip">채굴기·화로·작업대·연구소를 일렬로 세우고 컨베이어로 연결하면 간단한 생산라인이 완성됩니다.</div>
        <div class="tip">같은 라인을 여러 개 만들면 납품 속도가 올라갑니다!</div>
        <div class="tip">납품하면 <b>🔩 RP</b>가 쌓여요. 🔼 업그레이드 모드로 건물을 클릭해 <b>티어를 올리면</b> 같은 자리에서 더 빠르게 생산합니다.</div>
        <div class="tip">광맥은 <b>유한</b>합니다(타일 하단 게이지). 고갈되면 채굴기를 새 광맥으로 옮기거나 늘려 확장하세요.</div>
        <div class="tip">막히면 우상단 <b>병목</b> 표시가 무엇이 부족한지 알려줍니다.</div>
      `,
    },
    2: {
      title: '⚡ 2차 산업혁명 — 전기 시대',
      body: `
        <div class="era-badge">⚡ 목표: 모터 <b>40개</b> 납품</div>
        <h4>전력 시스템 (신규!)</h4>
        <div class="tip"><b>발전기⚡</b>에 석탄을 공급하면 전력을 생산합니다. 전기 기계가 이 전력을 사용해요.</div>
        <div class="tip">전력이 부족하면 전기 기계가 <b>느려집니다</b>. 전력 바가 빨간색이면 발전기를 더 추가하세요.</div>
        <h4>모터 생산 체인</h4>
        <div class="chain">
          <span class="item">⛏ 철광석 채굴기</span><span class="arrow">→</span>
          <span class="item">🔥 화로</span><span class="arrow">→</span>
          <span class="item">철판</span><span class="arrow">→</span>
          <span class="item">🔧 작업대</span><span class="arrow">→</span>
          <span class="item">⚙ 톱니바퀴</span>
        </div>
        <div class="chain">
          <span class="item">⛏ 구리광석 채굴기</span><span class="arrow">→</span>
          <span class="item">🔥 화로</span><span class="arrow">→</span>
          <span class="item">구리판</span><span class="arrow">→</span>
          <span class="item">🧵 선재기</span><span class="arrow">→</span>
          <span class="item">구리선 ×2</span>
        </div>
        <div class="chain">
          <span class="item">⚙ 톱니바퀴 ×1 + 구리선 ×2</span><span class="arrow">→</span>
          <span class="item">🏭 조립기</span><span class="arrow">→</span>
          <span class="item" style="color:#4aa3ff">🛠 모터</span><span class="arrow">→</span>
          <span class="item">🔬 연구소</span>
        </div>
        <h4>팁</h4>
        <div class="tip">조립기·선재기는 <b>전력 소비</b> 기계입니다. 발전기를 먼저 세워 석탄을 공급하세요.</div>
        <div class="tip">1차 라인(철판·톱니바퀴)을 그대로 활용하고, 구리 라인을 추가하면 됩니다.</div>
      `,
    },
    3: {
      title: '💾 3차 산업혁명 — 디지털 시대',
      body: `
        <div class="era-badge">💾 목표: 로봇 <b>30개</b> 납품</div>
        <h4>로봇 생산 체인</h4>
        <div class="chain">
          <span class="item">⛏ 규사 채굴기</span><span class="arrow">→</span>
          <span class="item">🔥 화로</span><span class="arrow">→</span>
          <span class="item">실리콘</span>
        </div>
        <div class="chain">
          <span class="item">실리콘 ×1 + 구리선 ×1</span><span class="arrow">→</span>
          <span class="item">💾 회로공장</span><span class="arrow">→</span>
          <span class="item">회로 ×1</span>
        </div>
        <div class="chain">
          <span class="item">모터 ×1 + 회로 ×2</span><span class="arrow">→</span>
          <span class="item">🤖 로봇조립</span><span class="arrow">→</span>
          <span class="item" style="color:#2ecc71">🤖 로봇</span><span class="arrow">→</span>
          <span class="item">🔬 연구소</span>
        </div>
        <h4>팁</h4>
        <div class="tip">회로공장·로봇조립은 고전력 소비 기계입니다. 발전기를 충분히 늘리세요.</div>
        <div class="tip">규사는 지도 어딘가에 있어요 — 화면을 이동해 찾아보세요!</div>
        <div class="tip">2차 라인(모터)을 계속 생산해야 로봇 생산이 가능합니다.</div>
      `,
    },
    4: {
      title: '🧠 4차 산업혁명 — 인공지능 시대',
      body: `
        <div class="era-badge">🧠 목표: AI 코어 <b>20개</b> 납품</div>
        <h4>AI 코어 생산 체인</h4>
        <div class="chain">
          <span class="item">회로 ×2</span><span class="arrow">→</span>
          <span class="item">🛰 데이터센터</span><span class="arrow">→</span>
          <span class="item">데이터 ×1</span>
        </div>
        <div class="chain">
          <span class="item">로봇 ×1 + 회로 ×2 + 데이터 ×3</span><span class="arrow">→</span>
          <span class="item">🧠 AI 연구소</span><span class="arrow">→</span>
          <span class="item" style="color:#b388ff">🧠 AI 코어</span><span class="arrow">→</span>
          <span class="item">🔬 연구소</span>
        </div>
        <h4>팁</h4>
        <div class="tip">AI 연구소는 <b>매우 높은 전력(10)</b>을 소비합니다. 발전기를 대량 추가하세요.</div>
        <div class="tip">데이터 3개가 필요해 데이터센터를 여러 개 세워야 병목을 피할 수 있어요.</div>
        <div class="tip">20개 달성 후에는 무한 가동으로 <b>산업 점수 최고기록</b>에 도전!</div>
      `,
    },
  };

  let tut = { active: false, step: 0 };

  // ── 상태 ────────────────────────────────────────────────────────
  let grid = [];              // GRID_W*GRID_H 셀: { deposit, b }
  let buildings = [];         // 모든 건물 인스턴스 (시뮬레이션 순회용)
  let camera = { x: 0, y: 0, zoom: 1 };
  let state = 'idle';         // idle | playing | win
  let paused = false;
  let speed = 1;
  let era = 1, research = 0, score = 0, highScore = 0, won = false;
  let eraStable = 0;
  let rp = 0;                 // 연구포인트(RP) — 납품으로 획득, 업그레이드에 소비
  let simTime = 0;            // 누적 시뮬레이션 시간(연출/처리량용)
  let powerProd = 0, powerDemand = 0, powerRatio = 1;
  let deliveries = [];        // 최근 납품 시각(처리량 계산)
  let floaties = [];          // 부유 텍스트
  let bottleneck = '';        // 현재 병목 진단 텍스트
  let bottleneckAccum = 0;    // 병목 계산 throttle
  let warnState = { text: '', until: 0 };
  let breakthroughs = new Set();
  let chronicle = [];
  let breakthroughAccum = 0;
  let evolutionMods = FactoryEvolution.modifiers([]);

  // 입력/툴
  let selected = 'belt';      // 선택 건물 id
  let rot = 0;                // 배치 회전 방향
  let tool = 'build';         // build | erase | pan | upgrade
  let hover = { x: -1, y: -1, valid: false };

  // 포인터 상태
  let ptr = { down: false, mode: null, lastSX: 0, lastSY: 0, lastTile: null, button: 0 };
  let spaceHeld = false;
  let savedRunMeta = null;

  // ── 유틸 ────────────────────────────────────────────────────────
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
  const cellAt   = (x, y) => grid[y * GRID_W + x];
  const currentTarget = () => ERAS[Math.min(era, 4)].target;
  const clampNum = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  function resize() {
    canvas.width  = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
  }
  window.addEventListener('resize', resize);

  // ── 초기화 / 시작 ───────────────────────────────────────────────
  function resetWorld() {
    grid = new Array(GRID_W * GRID_H);
    for (let i = 0; i < grid.length; i++) grid[i] = { deposit: null, b: null };
    buildings = [];
    genDeposits();
    camera.zoom = 1;
    centerCamera();
    era = 1; research = 0; score = 0; won = false; rp = 0; eraStable = 0;
    simTime = 0; deliveries = []; floaties = [];
    powerProd = powerDemand = 0; powerRatio = 1;
    bottleneck = ''; bottleneckAccum = 0;
    warnState = { text: '', until: 0 };
    breakthroughs = new Set(); chronicle = []; breakthroughAccum = 0;
    evolutionMods = FactoryEvolution.modifiers(breakthroughs);
    selected = 'belt'; rot = 0; tool = 'build';
    tut.active = false;
    const _tp = document.getElementById('tutPanel'); if (_tp) _tp.classList.add('hidden');
  }

  // 자원 군집 생성 — 무작위 위치에 랜덤워크 블롭 (셀마다 유한 매장량)
  function genDeposits() {
    const specs = [['coal', 8], ['iron_ore', 9], ['copper_ore', 6], ['sand', 5]];
    for (const [res, clusters] of specs) {
      for (let c = 0; c < clusters; c++) {
        let cx = 3 + Math.floor(Math.random() * (GRID_W - 6));
        let cy = 3 + Math.floor(Math.random() * (GRID_H - 6));
        const size = 4 + Math.floor(Math.random() * 6);
        let x = cx, y = cy;
        for (let k = 0; k < size; k++) {
          if (inBounds(x, y) && !cellAt(x, y).deposit) {
            const amt = DEPOSIT_MIN + Math.floor(Math.random() * DEPOSIT_VAR);
            cellAt(x, y).deposit = { resource: res, amount: amt, max: amt };
          }
          const d = DIRS[Math.floor(Math.random() * 4)];
          x += d[0]; y += d[1];
        }
      }
    }
  }

  function centerCamera() {
    const vw = canvas.width / camera.zoom, vh = canvas.height / camera.zoom;
    camera.x = GRID_W * TILE / 2 - vw / 2;
    camera.y = GRID_H * TILE / 2 - vh / 2;
  }

  function makeBuilding(id, x, y, dir) {
    const def = B[id];
    const b = { id, x, y, dir, tier: 1 };
    if (def.kind === 'belt') { b.item = null; b.prog = 0; }
    else if (def.kind === 'miner') { b.timer = 0; }
    else if (def.kind === 'machine') { b.inBuf = {}; b.outBuf = {}; b.craft = null; }
    else if (def.kind === 'generator') { b.fuel = 0; }
    return b;
  }

  function likelyOutputsFor(id, tx, ty) {
    const def = B[id];
    if (!def) return [];
    if (def.kind === 'miner') {
      const cell = inBounds(tx, ty) ? cellAt(tx, ty) : null;
      return cell && cell.deposit ? [cell.deposit.resource] : ['coal', 'iron_ore', 'copper_ore', 'sand'];
    }
    if (def.kind === 'machine') {
      if (def.smelt) return Object.values(def.smelt);
      if (def.recipe && def.recipe.out) return Object.keys(def.recipe.out);
    }
    return [];
  }

  function targetCanReceive(target, item) {
    const def = B[target.id];
    if (!def) return false;
    if (def.kind === 'belt') return true;
    if (def.kind === 'lab') return item === currentTarget();
    if (def.kind === 'generator') return item === 'coal';
    if (def.kind === 'machine') {
      if (def.smelt) {
        if (!(item in def.smelt)) return false;
        if (item === 'copper_ore' && era < 2) return false;
        if (item === 'sand' && era < 3) return false;
        return true;
      }
      return !!(def.recipe && def.recipe.in[item] != null);
    }
    return false;
  }

  function canOutputTo(id, tx, ty, dir, allowBeltTarget) {
    const d = DIRS[dir];
    const nx = tx + d[0], ny = ty + d[1];
    if (!inBounds(nx, ny)) return false;
    const target = cellAt(nx, ny).b;
    if (!target) return false;
    const targetDef = B[target.id];
    if (targetDef.kind === 'miner') return false;
    if (id === 'belt') return targetDef.kind !== 'miner';
    if (targetDef.kind === 'belt') return !!allowBeltTarget;
    return likelyOutputsFor(id, tx, ty).some((item) => targetCanReceive(target, item));
  }

  function inferDirForPlacement(id, tx, ty, fallback) {
    const def = B[id];
    if (!def || def.kind === 'lab') return fallback;
    const allowManualBeltTarget = id === 'belt' || id === 'miner';
    if (canOutputTo(id, tx, ty, fallback, allowManualBeltTarget)) return fallback;
    for (let dir = 0; dir < DIRS.length; dir++) {
      const allowBeltTarget = id === 'belt' || id === 'miner';
      if (canOutputTo(id, tx, ty, dir, allowBeltTarget)) return dir;
    }
    return fallback;
  }

  function canNeighborAutoConnect(source, target) {
    if (!source || !target || B[source.id].kind === 'lab') return false;
    const dir = DIRS.findIndex(([dx, dy]) => source.x + dx === target.x && source.y + dy === target.y);
    if (dir < 0) return false;
    const allowBeltTarget = source.id === 'belt' || source.id === 'miner';
    const targetDef = B[target.id];
    if (targetDef.kind === 'miner') return false;
    if (source.id === 'belt') return targetDef.kind !== 'miner';
    if (targetDef.kind === 'belt') return allowBeltTarget;
    return likelyOutputsFor(source.id, source.x, source.y).some((item) => targetCanReceive(target, item));
  }

  function autoOrientNeighbors(tx, ty) {
    const target = cellAt(tx, ty).b;
    if (!target) return;
    for (let dir = 0; dir < DIRS.length; dir++) {
      const d = DIRS[dir];
      const nx = tx - d[0], ny = ty - d[1];
      if (!inBounds(nx, ny)) continue;
      const neighbor = cellAt(nx, ny).b;
      if (!neighbor || B[neighbor.id].kind === 'lab') continue;
      if (canNeighborAutoConnect(neighbor, target)) neighbor.dir = dir;
    }
  }

  function selectedCanConnectAt(id, tx, ty) {
    if (!inBounds(tx, ty) || placementIssue(id, tx, ty)) return false;
    if (id === 'miner') return !!cellAt(tx, ty).deposit;
    const preferred = inferDirForPlacement(id, tx, ty, rot);
    if (canOutputTo(id, tx, ty, preferred, id === 'belt' || id === 'miner')) return true;
    for (let dir = 0; dir < DIRS.length; dir++) {
      const d = DIRS[dir];
      const nx = tx - d[0], ny = ty - d[1];
      if (!inBounds(nx, ny)) continue;
      const source = cellAt(nx, ny).b;
      if (source && canNeighborAutoConnect(source, { id, x: tx, y: ty })) return true;
    }
    return false;
  }

  function placementIssue(id, tx, ty) {
    if (!inBounds(tx, ty)) return '지도 안쪽에 배치하세요';
    const cell = cellAt(tx, ty);
    if (cell.b && !(id === 'belt' && cell.b.id === 'belt')) return '이미 건물이 있는 칸입니다';
    if (id === 'miner' && !cell.deposit) return '채굴기는 석탄/광석/규사 광맥 위에만 배치할 수 있어요';
    return '';
  }

  function warn(msg, sub) {
    const now = performance.now();
    if (warnState.text === msg && now < warnState.until) return;
    warnState = { text: msg, until: now + 1300 };
    showToast(msg, sub || '');
  }

  // ── 배치 / 철거 ─────────────────────────────────────────────────
  function place(tx, ty) {
    if (!inBounds(tx, ty)) return;
    const id = selected;
    if (!id || B[id].era > era) return;
    const issue = placementIssue(id, tx, ty);
    if (issue) {
      if (issue !== '이미 건물이 있는 칸입니다') warn(issue, '색 점이 있는 자원 타일 위에 놓으면 바로 채굴이 시작됩니다');
      return;
    }
    const cell = cellAt(tx, ty);
    if (cell.b) {
      if (id === 'belt' && cell.b.id === 'belt') cell.b.dir = inferDirForPlacement(id, tx, ty, rot); // 기존 컨베이어 방향만 변경
      return;
    }
    cell.b = makeBuilding(id, tx, ty, inferDirForPlacement(id, tx, ty, rot));
    buildings.push(cell.b);
    autoOrientNeighbors(tx, ty);
    if (tut.active) checkTutBuild(id, tx, ty);
  }

  function erase(tx, ty) {
    if (!inBounds(tx, ty)) return;
    const cell = cellAt(tx, ty);
    if (!cell.b) return;
    const idx = buildings.indexOf(cell.b);
    if (idx >= 0) buildings.splice(idx, 1);
    cell.b = null;
  }

  // ── 업그레이드 ──────────────────────────────────────────────────
  //   티어가 오르면 채굴/가공/발전 속도가 TIER_MULT 배로 빨라진다. 컨베이어는 제외.
  const tierMult = (b) => TIER_MULT[(b.tier || 1) - 1];

  function upgradeAt(tx, ty) {
    if (!inBounds(tx, ty)) return;
    const b = cellAt(tx, ty).b;
    if (!b) return;
    if (B[b.id].kind === 'belt' || B[b.id].kind === 'lab') {
      floatText(tx, ty, '업그레이드 불가', '#e74c3c'); return;
    }
    if (b.tier >= MAX_TIER) { floatText(tx, ty, 'MAX', '#f1c40f'); return; }
    const cost = TIER_COST[b.tier]; // 다음 티어 비용
    if (rp < cost) { floatText(tx, ty, `RP ${cost} 필요`, '#e74c3c'); return; }
    rp -= cost; b.tier++;
    floatText(tx, ty, `▲ T${b.tier}`, '#6ee7ff');
    updateHUD();
  }

  function floatText(tx, ty, text, color) {
    floaties.push({ x: tx * TILE + TILE / 2, y: ty * TILE, vy: -28, text, life: 1.1, color });
  }

  // ── 아이템 전달 (모든 출력의 공통 경로) ──────────────────────────
  //   fromB 가 바라보는 칸으로 item 1개를 밀어넣을 수 있으면 처리하고 true.
  function tryDeposit(fromB, item) {
    const d = DIRS[fromB.dir];
    const tx = fromB.x + d[0], ty = fromB.y + d[1];
    if (!inBounds(tx, ty)) return false;
    const t = cellAt(tx, ty).b;
    if (!t || !accepts(t, item)) return false;
    const def = B[t.id];
    if (def.kind === 'belt') { t.item = item; t.prog = 0; }
    else if (def.kind === 'machine') { t.inBuf[item] = (t.inBuf[item] || 0) + 1; }
    else if (def.kind === 'generator') { t.fuel = Math.min(GEN_FUEL_CAP, t.fuel + GEN_FUEL_SEC); }
    else if (def.kind === 'lab') { deliver(item, t); }
    return true;
  }

  function accepts(b, item) {
    const def = B[b.id];
    if (def.kind === 'belt') return b.item == null;
    if (def.kind === 'lab') return item === currentTarget();
    if (def.kind === 'generator') return item === 'coal' && b.fuel < GEN_FUEL_CAP;
    if (def.kind === 'machine') {
      if (def.smelt) {
        if (!(item in def.smelt)) return false;
        if (item === 'copper_ore' && era < 2) return false;
        if (item === 'sand' && era < 3) return false;
        return (b.inBuf[item] || 0) < IN_CAP;
      }
      if (def.recipe && def.recipe.in[item] != null) return (b.inBuf[item] || 0) < IN_CAP;
    }
    return false;
  }

  function deliver(item, lab) {
    const value = DELIVER_SCORE[item] || 1;
    const goal = ERAS[Math.min(era, 4)].count;
    research++;
    score += DELIVER_SCORE[item] || 1;
    rp += DELIVER_RP[item] || 1;
    deliveries.push(simTime);
    floaties.push({ x: lab.x * TILE + TILE / 2, y: lab.y * TILE, vy: -28, text: `+${value} ${ITEMS[item].name}`, life: 1.0, color: ERAS[era].accent });
    if (score > highScore) highScore = score;
    saveRun();
    if (research < goal && research % 5 === 0) {
      showToast(`${ITEMS[item].name} ${research}/${goal}`, `${goal - research}개 더 납품하면 다음 시대로 진화합니다`);
    }
    if (research === 1 || research === Math.ceil(goal / 2) || research === goal) {
      addChronicle(ERAS[era].icon, `${ITEMS[item].name} ${research}/${goal} 납품`);
    }
    updateEraGate(0);
    if (tut.active && TUT_STEPS[tut.step] && TUT_STEPS[tut.step].event === 'delivery') advanceTut();
  }

  function throughputPerMin() {
    return deliveries.length * 3;
  }

  function countBuilt(ids) {
    return buildings.filter((b) => ids.includes(b.id)).length;
  }

  function upgradedCount() {
    return buildings.filter((building) => (building.tier || 1) > 1).length;
  }

  function evolutionSnapshot() {
    return {
      research,
      throughput: throughputPerMin(),
      upgraded: upgradedCount(),
      powerRatio,
      generatorCount: buildings.filter((building) => building.id === 'generator' && building.fuel > 0).length,
    };
  }

  function currentBreakthroughStatus() {
    const definition = FactoryEvolution.forEra(era);
    return definition ? FactoryEvolution.evaluate(definition, evolutionSnapshot()) : null;
  }

  function evolutionModifiers() {
    return evolutionMods;
  }

  function addChronicle(icon, text) {
    chronicle.unshift({ time: Math.round(simTime), icon, text });
    if (chronicle.length > 30) chronicle.pop();
  }

  function unlockBreakthrough(status) {
    const definition = status.definition;
    if (breakthroughs.has(definition.id)) return;
    breakthroughs.add(definition.id);
    evolutionMods = FactoryEvolution.modifiers(breakthroughs);
    addChronicle(definition.icon, `${definition.name} 발견 — ${definition.effect}`);
    showToast(`${definition.icon} ${definition.name} 발견!`, definition.effect);
    flashFx = Math.max(flashFx, 0.45);
    saveRun();
  }

  function updateBreakthrough(dt) {
    breakthroughAccum += dt;
    if (breakthroughAccum < 0.25) return;
    breakthroughAccum = 0;
    const status = currentBreakthroughStatus();
    if (status && !breakthroughs.has(status.definition.id) && status.ready) unlockBreakthrough(status);
  }

  function phaseLineReady(ids) {
    return ids.every((id) => countBuilt([id]) > 0);
  }

  function powerStable(minRatio) {
    if (era < 2 || powerDemand <= 0) return true;
    return powerRatio >= minRatio;
  }

  function eraGateStatus() {
    const e = ERAS[Math.min(era, 4)];
    const targetName = ITEMS[e.target].name;
    const conditions = [
      { label: `${targetName} ${research}/${e.count}`, ok: research >= e.count },
    ];
    const breakthrough = FactoryEvolution.forEra(era);
    if (breakthrough) {
      conditions.push({ label: `${breakthrough.name} 돌파`, ok: breakthroughs.has(breakthrough.id) });
    }

    if (era === 1) {
      conditions.push(
        { label: '채굴-제련-가공-연구 라인', ok: phaseLineReady(['miner', 'furnace', 'workshop', 'lab']) },
        { label: '최근 납품 흐름', ok: throughputPerMin() >= 3 }
      );
    } else if (era === 2) {
      conditions.push(
        { label: '발전기 가동', ok: countBuilt(['generator']) > 0 },
        { label: '전력 85%+', ok: powerStable(0.85) },
        { label: '전선-조립 라인', ok: phaseLineReady(['wiremill', 'assembler']) },
        { label: '모터 흐름 유지', ok: throughputPerMin() >= 3 }
      );
    } else if (era === 3) {
      conditions.push(
        { label: '회로-로봇 라인', ok: phaseLineReady(['circuitfab', 'roboasm']) },
        { label: '전력 80%+', ok: powerStable(0.80) },
        { label: '로봇 흐름 유지', ok: throughputPerMin() >= 2 }
      );
    } else {
      conditions.push(
        { label: '데이터- AI 라인', ok: phaseLineReady(['datacenter', 'ailab']) },
        { label: '전력 75%+', ok: powerStable(0.75) },
        { label: 'AI 코어 흐름 유지', ok: throughputPerMin() >= 1 }
      );
    }

    return {
      conditions,
      ready: conditions.every((c) => c.ok),
      required: ERA_STABILITY_SEC,
    };
  }

  function updateEraGate(dt) {
    if (state !== 'playing' || won) return;
    const gate = eraGateStatus();
    if (gate.ready) eraStable = Math.min(gate.required, eraStable + dt);
    else eraStable = Math.max(0, eraStable - dt * 0.75);
    if (eraStable < gate.required) return;
    if (era < 4) {
      era++;
      research = 0;
      eraStable = 0;
      onEraUp();
    } else if (!won) {
      won = true;
      onSingularity();
    }
  }

  function onEraUp() {
    const e = ERAS[era];
    addChronicle(e.icon, `${e.name} 진입 — ${e.sub}`);
    showToast(`${e.icon} ${e.name} 진입!`, e.sub + ' — 새 기술 해금');
    flashFx = 0.7;
    saveHigh();
    saveRun();
    renderPalette();
    updateTopbar();
    setTimeout(() => showEraGuide(era), 1200);
  }

  function onSingularity() {
    addChronicle('◇', '자율 산업 특이점 도달');
    showToast('🌌 특이점 도달!', 'AI 시대 개막 — 무한 가동으로 최고 점수에 도전!');
    flashFx = 1.0;
    saveHigh();
    saveRun();
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
  }

  // ── 시뮬레이션 ──────────────────────────────────────────────────
  function simStep(dt) {
    simTime += dt;
    computePower(dt);
    for (const b of buildings) {
      const k = B[b.id].kind;
      if (k === 'miner') updateMiner(b, dt);
      else if (k === 'machine') updateMachine(b, dt);
    }
    for (const b of buildings) if (b.id === 'belt') updateBelt(b, dt);
    // 부유 텍스트
    for (let i = floaties.length - 1; i >= 0; i--) {
      const f = floaties[i];
      f.life -= dt; f.y += f.vy * dt;
      if (f.life <= 0) floaties.splice(i, 1);
    }
    // 처리량: 최근 20초 납품 수 → 분당
    while (deliveries.length && deliveries[0] < simTime - 20) deliveries.shift();
    // 병목 진단 (0.5초마다)
    bottleneckAccum += dt;
    if (bottleneckAccum >= 0.5) { bottleneckAccum = 0; computeBottleneck(); }
    updateBreakthrough(dt);
    updateEraGate(dt);
  }

  // 가장 큰 병목(생산을 가로막는 구속 조건)을 찾아 한 줄로 진단한다.
  function computeBottleneck() {
    if (!buildings.length) { bottleneck = ''; return; }
    // 1) 전력 부족이 최우선
    if (era >= 2 && powerDemand > powerProd) { bottleneck = '⚡ 전력 부족 — 발전기를 늘리세요'; return; }
    // 2) 채굴기 유휴(광맥 없음/고갈 또는 출력 막힘) 집계
    let minerIdle = 0, minerTotal = 0;
    let starve = {}, blocked = {}, machTotal = {};
    for (const b of buildings) {
      const def = B[b.id];
      if (def.kind === 'miner') {
        minerTotal++;
        const dep = cellAt(b.x, b.y).deposit;
        if (!dep || b.timer >= MINER_RATE / tierMult(b)) minerIdle++;
      } else if (def.kind === 'machine') {
        machTotal[b.id] = (machTotal[b.id] || 0) + 1;
        if (!b.craft) {
          const r = resolveRecipe(b);
          if (!r) { starve[b.id] = (starve[b.id] || 0) + 1; }
          else {
            let lackIn = false;
            for (const it in r.in) if ((b.inBuf[it] || 0) < r.in[it]) lackIn = true;
            let outFull = false;
            for (const it in r.out) if ((b.outBuf[it] || 0) + r.out[it] > OUT_CAP) outFull = true;
            if (lackIn) starve[b.id] = (starve[b.id] || 0) + 1;
            else if (outFull) blocked[b.id] = (blocked[b.id] || 0) + 1;
          }
        }
      }
    }
    // 3) 가장 비율 높은 굶주린 기계
    let worst = '', worstFrac = 0, worstReason = '';
    for (const id in machTotal) {
      const sFrac = (starve[id] || 0) / machTotal[id];
      if (sFrac > worstFrac) { worstFrac = sFrac; worst = id; worstReason = '입력 부족'; }
    }
    for (const id in machTotal) {
      const bFrac = (blocked[id] || 0) / machTotal[id];
      if (bFrac > worstFrac) { worstFrac = bFrac; worst = id; worstReason = '출력 막힘'; }
    }
    if (minerTotal && minerIdle / minerTotal > 0.5 && minerIdle / minerTotal >= worstFrac) {
      bottleneck = '⛏ 채굴 부족 — 광맥 고갈/막힘, 채굴기를 이전·증설하세요';
    } else if (worst && worstFrac > 0.3) {
      bottleneck = `${B[worst].ico} ${B[worst].name} ${worstReason}`;
    } else {
      bottleneck = '✅ 원활';
    }
  }

  function computePower(dt) {
    let prod = 0, demand = 0;
    const mods = evolutionModifiers();
    for (const b of buildings) {
      const def = B[b.id];
      if (def.kind === 'generator') { if (b.fuel > 0) prod += GEN_OUTPUT * tierMult(b) * mods.generatorOutput; }
      else if (def.kind === 'machine' && def.power > 0) {
        if (b.craft || canStart(b)) demand += def.power * mods.powerDemand;
      }
    }
    powerProd = prod; powerDemand = demand;
    powerRatio = demand > 0 ? Math.min(1, prod / demand) : 1;
    // 발전기 연료 연소 (전력 수요가 있을 때만)
    if (demand > 0) for (const b of buildings) if (b.id === 'generator' && b.fuel > 0) b.fuel = Math.max(0, b.fuel - dt);
  }

  function updateMiner(b, dt) {
    const dep = cellAt(b.x, b.y).deposit;
    if (!dep) return;            // 광맥이 없거나 고갈 → 유휴
    b.timer += dt;
    const rate = MINER_RATE / tierMult(b);   // 티어가 높을수록 채굴 간격 단축
    if (b.timer >= rate) {
      if (tryDeposit(b, dep.resource)) {
        b.timer = 0;
        if (--dep.amount <= 0) cellAt(b.x, b.y).deposit = null;  // 매장량 고갈
      } else {
        b.timer = rate;          // 출력 막힘 → 대기
      }
    }
  }

  function resolveRecipe(b) {
    const def = B[b.id];
    if (def.smelt) {
      for (const ore in def.smelt) {
        if (ore === 'copper_ore' && era < 2) continue;
        if (ore === 'sand' && era < 3) continue;
        if ((b.inBuf[ore] || 0) >= 1) return { in: { [ore]: 1 }, out: { [def.smelt[ore]]: 1 } };
      }
      return null;
    }
    return def.recipe || null;
  }

  // 가공 시작 가능 여부 (전력 수요 산정에도 사용)
  function canStart(b) {
    if (b.craft) return false;
    const r = resolveRecipe(b);
    if (!r) return false;
    for (const it in r.in) if ((b.inBuf[it] || 0) < r.in[it]) return false;
    for (const it in r.out) if ((b.outBuf[it] || 0) + r.out[it] > OUT_CAP) return false;
    return true;
  }

  function updateMachine(b, dt) {
    const def = B[b.id];
    if (!b.craft && canStart(b)) {
      const r = resolveRecipe(b);
      for (const it in r.in) b.inBuf[it] -= r.in[it];
      b.craft = { out: r.out, t: 0, total: def.time };
    }
    if (b.craft) {
      const spd = (def.power > 0 ? powerRatio : 1) * tierMult(b) * evolutionModifiers().machineSpeed;
      b.craft.t += dt * spd;
      if (b.craft.t >= b.craft.total) {
        for (const it in b.craft.out) b.outBuf[it] = (b.outBuf[it] || 0) + b.craft.out[it];
        b.craft = null;
      }
    }
    // 출력 버퍼에서 한 개 밀어내기
    for (const it in b.outBuf) {
      if (b.outBuf[it] > 0 && tryDeposit(b, it)) { b.outBuf[it]--; break; }
    }
  }

  function updateBelt(b, dt) {
    if (b.item == null) return;
    if (b.prog < 1) b.prog = Math.min(1, b.prog + BELT_SPEED * evolutionModifiers().beltSpeed * dt);
    if (b.prog >= 1) {
      if (tryDeposit(b, b.item)) { b.item = null; b.prog = 0; }
    }
  }

  // ── 렌더링 ──────────────────────────────────────────────────────
  let flashFx = 0;             // 시대 진입 화면 플래시
  let chevT = 0;               // 컨베이어 셰브론 애니메이션

  function draw(dt) {
    chevT = (chevT + dt * BELT_SPEED * evolutionModifiers().beltSpeed) % 1;
    const e = ERAS[Math.min(era, 4)];
    const minerMode = selected === 'miner' && tool === 'build';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = e.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, -camera.x * camera.zoom, -camera.y * camera.zoom);

    // 가시 타일 범위 (컬링)
    const x0 = Math.max(0, Math.floor(camera.x / TILE));
    const y0 = Math.max(0, Math.floor(camera.y / TILE));
    const x1 = Math.min(GRID_W - 1, Math.floor((camera.x + canvas.width / camera.zoom) / TILE));
    const y1 = Math.min(GRID_H - 1, Math.floor((camera.y + canvas.height / camera.zoom) / TILE));

    // 그리드 + 자원
    ctx.lineWidth = 1;
    ctx.strokeStyle = e.grid;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cell = cellAt(x, y);
        const px = x * TILE, py = y * TILE;
        if (cell.deposit) {
          const dep = cell.deposit;
          const frac = dep.max ? dep.amount / dep.max : 1;   // 남은 매장량 비율
          ctx.fillStyle = shade(ITEMS[dep.resource].c, -0.45);
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = ITEMS[dep.resource].c;
          // 매장량이 줄수록 광물 점이 줄어든다 (4 → 1)
          const dots = Math.max(1, Math.ceil(frac * 4));
          for (let i = 0; i < dots; i++) {
            const dx = px + 8 + (i % 2) * 18 + 3, dy = py + 8 + Math.floor(i / 2) * 18 + 3;
            ctx.beginPath(); ctx.arc(dx, dy, minerMode ? 5.5 : 4, 0, Math.PI * 2); ctx.fill();
          }
          if (minerMode && !cell.b) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 2;
            rrect(px + 3, py + 3, TILE - 6, TILE - 6, 6); ctx.stroke();
            ctx.strokeStyle = e.grid;
            ctx.lineWidth = 1;
          }
          // 하단 매장량 게이지 (낮으면 붉게)
          ctx.fillStyle = '#0a0e15'; ctx.fillRect(px + 4, py + TILE - 5, TILE - 8, 3);
          ctx.fillStyle = frac < 0.25 ? '#e74c3c' : (frac < 0.5 ? '#f1c40f' : '#2ecc71');
          ctx.fillRect(px + 4, py + TILE - 5, (TILE - 8) * frac, 3);
        }
        ctx.strokeRect(px, py, TILE, TILE);
      }
    }
    drawPlacementHints(x0, y0, x1, y1);

    // 건물
    for (const b of buildings) {
      if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue;
      drawBuilding(b);
    }

    // 컨베이어 위 아이템
    for (const b of buildings) {
      if (b.id !== 'belt' || b.item == null) continue;
      if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue;
      const d = DIRS[b.dir];
      const cx = b.x * TILE + TILE / 2 + d[0] * (b.prog - 0.5) * TILE;
      const cy = b.y * TILE + TILE / 2 + d[1] * (b.prog - 0.5) * TILE;
      drawItem(cx, cy, b.item);
    }

    // 튜토리얼 하이라이트
    drawTutHighlight();

    // 배치 고스트
    if (state === 'playing' && tool === 'build' && hover.x >= 0 && B[selected] && B[selected].era <= era) {
      drawGhost();
    } else if (state === 'playing' && tool === 'erase' && hover.x >= 0) {
      ctx.fillStyle = 'rgba(231,76,60,0.3)';
      ctx.fillRect(hover.x * TILE, hover.y * TILE, TILE, TILE);
    } else if (state === 'playing' && tool === 'upgrade' && hover.x >= 0) {
      ctx.fillStyle = 'rgba(110,231,255,0.25)';
      ctx.fillRect(hover.x * TILE, hover.y * TILE, TILE, TILE);
    }

    // 부유 텍스트
    ctx.textAlign = 'center';
    for (const f of floaties) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // 화면 플래시 (시대 진입)
    if (flashFx > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${(flashFx * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      flashFx = Math.max(0, flashFx - dt * 1.4);
    }
  }

  function drawPlacementHints(x0, y0, x1, y1) {
    if (state !== 'playing' || tool !== 'build' || !B[selected] || B[selected].era > era) return;
    const def = B[selected];
    ctx.save();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cell = cellAt(x, y);
        if (cell.b) continue;
        const px = x * TILE, py = y * TILE;
        if (selected === 'miner') {
          if (!cell.deposit) continue;
          const pulse = 0.45 + 0.25 * Math.sin(simTime * 5);
          ctx.fillStyle = `rgba(255,255,255,${pulse * 0.16})`;
          ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
          ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
          ctx.lineWidth = 2.5;
          rrect(px + 4, py + 4, TILE - 8, TILE - 8, 7); ctx.stroke();
          continue;
        }
        if (!selectedCanConnectAt(selected, x, y)) continue;
        ctx.fillStyle = `${shade(def.color, 0.35).replace('rgb', 'rgba').replace(')', ',0.22)')}`;
        ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10);
        ctx.strokeStyle = 'rgba(255,255,255,0.36)';
        ctx.lineWidth = 1.5;
        rrect(px + 6, py + 6, TILE - 12, TILE - 12, 6); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBuilding(b) {
    const def = B[b.id];
    const px = b.x * TILE, py = b.y * TILE, s = TILE;
    if (def.kind === 'belt') {
      ctx.fillStyle = '#222b3a';
      rrect(px + 1, py + 1, s - 2, s - 2, 5); ctx.fill();
      // 흐름 셰브론
      const d = DIRS[b.dir];
      const ang = Math.atan2(d[1], d[0]);
      ctx.save();
      ctx.translate(px + s / 2, py + s / 2);
      ctx.rotate(ang);
      ctx.strokeStyle = '#5b6f93';
      ctx.lineWidth = 2.5;
      for (let i = -1; i <= 1; i++) {
        const off = ((i + chevT) % 1.5) * TILE - TILE * 0.5;
        ctx.beginPath();
        ctx.moveTo(off - 5, -6); ctx.lineTo(off + 4, 0); ctx.lineTo(off - 5, 6);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // 기계/채굴기/발전기/연구소 공통 박스
    const idle = (def.kind === 'miner' && !cellAt(b.x, b.y).deposit);
    const starved = (def.kind === 'machine' && def.power > 0 && b.craft && powerRatio < 1);
    ctx.fillStyle = shade(def.color, 0.0);
    rrect(px + 2, py + 2, s - 4, s - 4, 6); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = idle ? '#e74c3c' : (starved ? '#f1c40f' : shade(def.color, 0.4));
    rrect(px + 2, py + 2, s - 4, s - 4, 6); ctx.stroke();

    // 아이콘
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '18px sans-serif';
    ctx.fillText(def.ico, px + s / 2, py + s / 2 + 1);

    // 출력 방향 표시 (연구소 제외)
    if (def.kind !== 'lab') {
      const d = DIRS[b.dir];
      ctx.fillStyle = shade(def.color, 0.6);
      const ox = px + s / 2 + d[0] * (s / 2 - 4), oy = py + s / 2 + d[1] * (s / 2 - 4);
      ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill();
    }

    // 가공 진행 링
    if (def.kind === 'machine' && b.craft) {
      ctx.beginPath();
      ctx.strokeStyle = ERAS[Math.min(era, 4)].accent;
      ctx.lineWidth = 2.5;
      ctx.arc(px + s / 2, py + s / 2, s / 2 - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.craft.t / b.craft.total));
      ctx.stroke();
    }
    // 발전기 연료 게이지
    if (def.kind === 'generator') {
      const f = b.fuel / GEN_FUEL_CAP;
      ctx.fillStyle = '#0a0e15'; ctx.fillRect(px + 6, py + s - 8, s - 12, 3);
      ctx.fillStyle = b.fuel > 0 ? '#f1c40f' : '#555'; ctx.fillRect(px + 6, py + s - 8, (s - 12) * f, 3);
    }
    // 입력 버퍼 점 표시 (기계)
    if (def.kind === 'machine') {
      let n = 0; for (const it in b.inBuf) n += b.inBuf[it];
      if (n > 0) {
        ctx.fillStyle = '#6ee7ff';
        for (let i = 0; i < Math.min(n, 6); i++) { ctx.beginPath(); ctx.arc(px + 7 + i * 5, py + 7, 2, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // 연구소 글로우
    if (def.kind === 'lab') {
      ctx.strokeStyle = ERAS[Math.min(era, 4)].accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(simTime * 3);
      rrect(px + 4, py + 4, s - 8, s - 8, 5); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 업그레이드 티어 표시 (T2/T3 — 우상단 별)
    if (b.tier > 1) {
      ctx.fillStyle = '#6ee7ff';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('★'.repeat(b.tier - 1), px + s - 4, py + 3);
    }
  }

  function drawItem(cx, cy, item) {
    ctx.beginPath();
    ctx.fillStyle = ITEMS[item].c;
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
  }

  function drawGhost() {
    const valid = !placementIssue(selected, hover.x, hover.y);
    hover.valid = valid;
    ctx.globalAlpha = 0.5;
    const def = B[selected];
    const px = hover.x * TILE, py = hover.y * TILE;
    ctx.fillStyle = valid ? shade(def.color, 0.1) : '#e74c3c';
    rrect(px + 2, py + 2, TILE - 4, TILE - 4, 6); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '18px sans-serif';
    ctx.fillText(valid ? (def.kind === 'belt' ? '➤' : def.ico) : '!', px + TILE / 2, py + TILE / 2 + 1);
    // 방향 표시
    if (def.kind !== 'lab') {
      const d = DIRS[inferDirForPlacement(selected, hover.x, hover.y, rot)];
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px + TILE / 2 + d[0] * (TILE / 2 - 4), py + TILE / 2 + d[1] * (TILE / 2 - 4), 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 둥근 사각형 path
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 색상 밝기 조정 (-1..1)
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round(r + (f - r) * p); g = Math.round(g + (f - g) * p); b = Math.round(b + (f - b) * p);
    return `rgb(${r},${g},${b})`;
  }

  // ── HUD ─────────────────────────────────────────────────────────
  function updateTopbar() {
    const e = ERAS[Math.min(era, 4)];
    document.getElementById('eraIcon').textContent = e.icon;
    document.getElementById('eraName').textContent = e.name;
    document.getElementById('eraSub').textContent = e.sub;
    document.getElementById('researchLabel').textContent = e.label;
    document.getElementById('stabilityLabel').textContent = era < 4 ? '다음 산업혁명 안정도' : '최종 자동화 안정도';
    const powerWrap = document.getElementById('powerWrap');
    if (era >= 2) powerWrap.classList.remove('hidden'); else powerWrap.classList.add('hidden');
  }

  function updateHUD() {
    const e = ERAS[Math.min(era, 4)];
    const gate = eraGateStatus();
    const goal = e.count;
    const pct = won && era === 4 ? 100 : Math.min(100, research / goal * 100);
    document.getElementById('researchFill').style.width = pct + '%';
    document.getElementById('researchCount').textContent = (won && era === 4)
      ? `${research} / ∞` : `${research} / ${goal}`;
    document.getElementById('scoreDisplay').textContent = score;
    document.getElementById('highDisplay').textContent = Math.max(highScore, score);
    // 전력
    if (era >= 2) {
      const pf = document.getElementById('powerFill');
      const ratio = powerDemand > 0 ? powerProd / powerDemand : 1;
      pf.style.width = Math.min(100, ratio * 100) + '%';
      pf.classList.toggle('over', powerDemand > powerProd);
      document.getElementById('powerCount').textContent = `${powerProd} / ${powerDemand}`;
    }
    // 처리량 (분당 목표 아이템)
    const perMin = deliveries.length * 3; // 20초창 → ×3 = 분당
    document.getElementById('throughput').textContent = `${perMin.toFixed(0)} ${ITEMS[currentTarget()].name}/분`;
    const stablePct = Math.min(100, eraStable / gate.required * 100);
    const stabilityFill = document.getElementById('stabilityFill');
    stabilityFill.style.width = stablePct + '%';
    stabilityFill.classList.toggle('waiting', !gate.ready);
    document.getElementById('stabilityCount').textContent =
      gate.ready ? `${eraStable.toFixed(1)} / ${gate.required}초` : '조건 대기';
    const checklist = document.getElementById('phaseChecklist');
    checklist.innerHTML = '';
    for (const cond of gate.conditions) {
      const chip = document.createElement('span');
      chip.className = 'phase-chip ' + (cond.ok ? 'ok' : 'no');
      chip.textContent = (cond.ok ? '✓ ' : '• ') + cond.label;
      checklist.appendChild(chip);
    }
    renderBreakthroughHUD();
    // RP (연구포인트)
    document.getElementById('rpDisplay').textContent = `🔩 RP ${rp}`;
    // 병목 진단
    const bn = document.getElementById('bottleneck');
    bn.textContent = bottleneck ? `병목: ${bottleneck}` : '';
    bn.classList.toggle('ok', bottleneck === '✅ 원활');
    bn.classList.toggle('hidden', !bottleneck);
  }

  function formatEvolutionValue(metric, value) {
    if (metric === 'powerRatio') return `${Math.round(value * 100)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function renderBreakthroughHUD() {
    const status = currentBreakthroughStatus();
    if (!status) return;
    const definition = status.definition;
    const unlocked = breakthroughs.has(definition.id);
    const progress = unlocked ? 1 : status.progress;
    document.getElementById('breakthroughName').textContent =
      unlocked ? `${definition.icon} ${definition.name} 활성` : `${definition.icon} ${definition.name}`;
    document.getElementById('breakthroughCount').textContent = unlocked ? '완료' : `${Math.round(progress * 100)}%`;
    document.getElementById('breakthroughFill').style.width = `${progress * 100}%`;
    const next = status.conditions.find((condition) => !condition.ok);
    document.getElementById('breakthroughHint').textContent = unlocked
      ? definition.effect
      : next
        ? `${next.label} ${formatEvolutionValue(next.metric, next.current)} / ${formatEvolutionValue(next.metric, next.target)}`
        : '돌파 조건이 무르익었습니다';
  }

  // 빌드 팔레트 렌더
  function renderPalette() {
    const pal = document.getElementById('palette');
    pal.innerHTML = '';
    for (const id of PALETTE_ORDER) {
      const def = B[id];
      const btn = document.createElement('button');
      const locked = def.era > era;
      const tutFocus = tut.active && TUT_STEPS[tut.step] && TUT_STEPS[tut.step].tool === id;
      btn.className = 'pal-btn' + (id === selected ? ' selected' : '') + (locked ? ' locked' : '') + (tutFocus ? ' tut-focus' : '');
      btn.innerHTML = `<span class="pal-ico">${def.ico}</span><span class="pal-name">${def.name}</span>` +
        (locked ? `<span class="pal-lock">${ERAS[def.era].icon}</span>` : '');
      if (!locked) btn.addEventListener('click', () => { selected = id; tool = 'build'; refreshTools(); renderPalette(); showInfo(); selectionHint(id); });
      pal.appendChild(btn);
    }
  }

  function selectionHint(id) {
    if (state !== 'playing') return;
    const def = B[id];
    if (!def) return;
    if (id === 'miner') {
      showToast('채굴기 선택', '밝게 표시된 자원 타일 위에 놓으면 바로 채굴합니다.');
    } else if (id === 'belt') {
      showToast('컨베이어 선택', '드래그하면 방향이 이어지고, 가까운 수신 건물 쪽으로 자동 연결됩니다.');
    } else if (def.kind === 'lab') {
      showToast('연구소 선택', '현재 목표 아이템을 보내는 생산기나 컨베이어 옆에 배치하세요.');
    } else {
      showToast(`${def.name} 선택`, '밝게 표시된 칸은 연결하기 좋은 위치입니다. R키 수동 회전도 그대로 됩니다.');
    }
  }

  function refreshTools() {
    document.getElementById('eraseBtn').classList.toggle('active', tool === 'erase');
    document.getElementById('panBtn').classList.toggle('active', tool === 'pan');
    document.getElementById('upgradeBtn').classList.toggle('active', tool === 'upgrade');
  }

  // 선택 건물 레시피 안내
  function showInfo() {
    const info = document.getElementById('infoPanel');
    const def = B[selected];
    if (!def) { info.classList.add('hidden'); return; }
    let txt = `<b>${def.ico} ${def.name}</b> · `;
    if (def.kind === 'belt') txt += '아이템을 화살표 방향으로 운반';
    else if (def.kind === 'miner') txt += '광맥 위에 놓아 자원 채굴 (출력 방향으로 배출)';
    else if (def.kind === 'lab') txt += `<span class="recipe-out">${ITEMS[currentTarget()].name}</span> 납품 → 연구 진행`;
    else if (def.kind === 'generator') txt += '<span class="recipe-in">석탄</span> → <span class="recipe-out">전력 12</span>';
    else if (def.smelt) txt += '<span class="recipe-in">광석/규사</span> → <span class="recipe-out">제련물</span>';
    else if (def.recipe) {
      const ins = Object.entries(def.recipe.in).map(([k, v]) => `${ITEMS[k].name}×${v}`).join(' + ');
      const outs = Object.entries(def.recipe.out).map(([k, v]) => `${ITEMS[k].name}×${v}`).join(' + ');
      txt += `<span class="recipe-in">${ins}</span> → <span class="recipe-out">${outs}</span>`;
      if (def.power) txt += ` · ⚡${def.power}`;
    }
    info.innerHTML = txt;
    info.classList.remove('hidden');
  }

  let toastTimer = 0;
  function showToast(msg, sub) {
    const t = document.getElementById('toast');
    t.innerHTML = `<div class="toast-msg">${msg}</div><div class="toast-sub">${sub || ''}</div>`;
    toastTimer = 2.4;
  }

  // ── 시대 가이드 ─────────────────────────────────────────────────
  function showEraGuide(eraNum) {
    const g = ERA_GUIDES[Math.min(eraNum, 4)];
    if (!g) return;
    document.getElementById('eraGuideTitle').innerHTML = g.title;
    const definition = FactoryEvolution.forEra(Math.min(eraNum, 4));
    const evolution = definition ? `
      <h4>시대의 병목과 돌파</h4>
      <div class="evolution-story"><b>병목</b><span>${definition.bottleneck}</span></div>
      <div class="evolution-story"><b>${definition.icon} ${definition.name}</b><span>${definition.narrative}</span><em>${definition.effect}</em></div>` : '';
    const history = chronicle.length ? `
      <h4>산업 연대기</h4>
      <div class="factory-chronicle">${chronicle.slice(0, 8).map((entry) =>
        `<div><span>${entry.time}초</span><b>${entry.icon}</b><span>${entry.text}</span></div>`
      ).join('')}</div>` : '';
    document.getElementById('eraGuideBody').innerHTML = g.body + evolution + history;
    document.getElementById('eraGuideModal').classList.remove('hidden');
  }
  function closeEraGuide() { document.getElementById('eraGuideModal').classList.add('hidden'); }

  // ── 튜토리얼 ────────────────────────────────────────────────────
  function tutGuaranteeOre() {
    const cx = Math.floor(GRID_W / 2) - 2, cy = Math.floor(GRID_H / 2) - 1;
    const spots = [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1], [cx, cy + 2], [cx + 1, cy + 2]];
    for (const [x, y] of spots) if (inBounds(x, y) && !cellAt(x, y).deposit) cellAt(x, y).deposit = { resource: 'iron_ore', amount: 1200, max: 1200 };
  }

  function startTutorial() {
    clearSavedRun();
    resetWorld();
    tutGuaranteeOre();
    tut.active = true; tut.step = 0;
    state = 'playing'; paused = false; speed = 1;
    addChronicle('🔥', '증기 시대 공장 건설 시작');
    document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b.dataset.speed === '1'));
    document.getElementById('pauseBtn').classList.remove('paused');
    document.getElementById('overlay').classList.remove('visible');
    updateTopbar();
    applyTutStep();
  }

  function applyTutStep() {
    if (tut.step >= TUT_STEPS.length) { endTutorial(); return; }
    const step = TUT_STEPS[tut.step];
    if (step.tool) { selected = step.tool; tool = 'build'; refreshTools(); showInfo(); }
    renderPalette();
    updateTutPanel();
    if (!step.event) setTimeout(() => { if (tut.active) endTutorial(); }, 4000);
  }

  function updateTutPanel() {
    const panel = document.getElementById('tutPanel');
    if (!tut.active || tut.step >= TUT_STEPS.length) { panel.classList.add('hidden'); return; }
    const step = TUT_STEPS[tut.step];
    const totalSteps = TUT_STEPS.filter((s) => s.event).length;
    const num = Math.min(tut.step + 1, totalSteps);
    document.getElementById('tutStep').textContent = `🎓 튜토리얼 ${num} / ${totalSteps}`;
    document.getElementById('tutText').innerHTML = step.text;
    document.getElementById('tutHint').textContent = step.hint;
    panel.classList.remove('hidden');
  }

  function advanceTut() {
    if (!tut.active) return;
    tut.step++;
    applyTutStep();
  }

  function checkTutBuild(id, tx, ty) {
    if (!tut.active) return;
    const step = TUT_STEPS[tut.step];
    if (!step || step.event !== id) return;
    if (id === 'miner') {
      const dep = cellAt(tx, ty).deposit;
      if (!dep || dep.resource !== 'iron_ore') return;
    }
    advanceTut();
  }

  function endTutorial() {
    tut.active = false;
    document.getElementById('tutPanel').classList.add('hidden');
    renderPalette();
    showInfo();
  }

  function drawTutHighlight() {
    if (!tut.active) return;
    const step = TUT_STEPS[tut.step];
    if (!step || step.hl !== 'ore') return;
    const pulse = 0.35 + 0.5 * Math.sin(simTime * 3.5);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(245,166,35,${pulse.toFixed(2)})`;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = cellAt(x, y);
        if (cell.deposit && cell.deposit.resource === 'iron_ore' && !cell.b) {
          ctx.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
        }
      }
    }
  }

  // ── 좌표 변환 / 입력 ────────────────────────────────────────────
  function screenToTile(sx, sy) {
    const wx = sx / camera.zoom + camera.x, wy = sy / camera.zoom + camera.y;
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  function onDown(sx, sy, button) {
    ptr.down = true; ptr.button = button; ptr.lastSX = sx; ptr.lastSY = sy;
    const panning = (tool === 'pan') || spaceHeld || button === 1;
    if (panning) { ptr.mode = 'pan'; return; }
    if (button === 2 || tool === 'erase') { ptr.mode = 'erase'; const t = screenToTile(sx, sy); erase(t.x, t.y); ptr.lastTile = t; return; }
    if (tool === 'upgrade') { ptr.mode = 'upgrade'; const t = screenToTile(sx, sy); upgradeAt(t.x, t.y); ptr.lastTile = t; return; }
    ptr.mode = 'place';
    const t = screenToTile(sx, sy);
    place(t.x, t.y); ptr.lastTile = t;
  }

  function onMove(sx, sy) {
    const t = screenToTile(sx, sy);
    hover.x = t.x; hover.y = t.y;
    if (!ptr.down) return;
    if (ptr.mode === 'pan') {
      camera.x -= (sx - ptr.lastSX) / camera.zoom;
      camera.y -= (sy - ptr.lastSY) / camera.zoom;
      ptr.lastSX = sx; ptr.lastSY = sy;
      return;
    }
    if (ptr.mode === 'erase') {
      if (!ptr.lastTile || ptr.lastTile.x !== t.x || ptr.lastTile.y !== t.y) { erase(t.x, t.y); ptr.lastTile = t; }
      return;
    }
    if (ptr.mode === 'place') {
      if (ptr.lastTile && (ptr.lastTile.x !== t.x || ptr.lastTile.y !== t.y)) {
        // 컨베이어 드래그: 진행 방향으로 자동 정렬 + 직전 칸도 이어지게
        if (selected === 'belt') {
          const dx = t.x - ptr.lastTile.x, dy = t.y - ptr.lastTile.y;
          if (Math.abs(dx) + Math.abs(dy) === 1) {
            rot = dx === 1 ? 0 : dx === -1 ? 2 : dy === 1 ? 1 : 3;
            const prev = cellAt(ptr.lastTile.x, ptr.lastTile.y).b;
            if (prev && prev.id === 'belt') prev.dir = rot;
          }
        }
        place(t.x, t.y); ptr.lastTile = t;
      }
    }
  }

  function onUp() { ptr.down = false; ptr.mode = null; ptr.lastTile = null; }

  // 포인터 이벤트
  function rel(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', (e) => { if (state !== 'playing') return; canvas.setPointerCapture(e.pointerId); const p = rel(e); onDown(p.x, p.y, e.button); });
  canvas.addEventListener('pointermove', (e) => { if (state !== 'playing') return; const p = rel(e); onMove(p.x, p.y); });
  canvas.addEventListener('pointerup', () => onUp());
  canvas.addEventListener('pointercancel', () => onUp());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = rel(e);
    const wx = p.x / camera.zoom + camera.x, wy = p.y / camera.zoom + camera.y;
    const nz = Math.max(0.5, Math.min(2.2, camera.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    camera.zoom = nz;
    camera.x = wx - p.x / nz; camera.y = wy - p.y / nz;
  }, { passive: false });

  // 키보드
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { spaceHeld = true; e.preventDefault(); return; }
    if (state !== 'playing') return;
    if (e.key === 'r' || e.key === 'R') { rot = (rot + 1) % 4; showInfo(); }
    else if (e.key === 'e' || e.key === 'E') { tool = (tool === 'erase') ? 'build' : 'erase'; refreshTools(); }
    else if (e.key === 'g' || e.key === 'G') showEraGuide(era);
    else if (e.key === 'u' || e.key === 'U') { tool = (tool === 'upgrade') ? 'build' : 'upgrade'; refreshTools(); }
    else if (e.key === 'h' || e.key === 'H') toggleHelp();
    else if (e.key === 'p' || e.key === 'P') togglePause();
    else if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (PALETTE_ORDER[idx] && B[PALETTE_ORDER[idx]].era <= era) { selected = PALETTE_ORDER[idx]; tool = 'build'; refreshTools(); renderPalette(); showInfo(); }
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceHeld = false; });

  // 툴바 버튼
  document.getElementById('rotateBtn').addEventListener('click', () => { rot = (rot + 1) % 4; showInfo(); });
  document.getElementById('eraseBtn').addEventListener('click', () => { tool = (tool === 'erase') ? 'build' : 'erase'; refreshTools(); });
  document.getElementById('panBtn').addEventListener('click', () => { tool = (tool === 'pan') ? 'build' : 'pan'; refreshTools(); });
  document.getElementById('upgradeBtn').addEventListener('click', () => { tool = (tool === 'upgrade') ? 'build' : 'upgrade'; refreshTools(); });
  document.getElementById('helpBtn').addEventListener('click', toggleHelp);
  document.getElementById('helpClose').addEventListener('click', toggleHelp);
  document.getElementById('guideBtn').addEventListener('click', () => showEraGuide(era));
  document.getElementById('eraGuideClose').addEventListener('click', closeEraGuide);

  // 속도/일시정지
  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      speed = parseInt(btn.dataset.speed, 10);
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b === btn));
      paused = false; document.getElementById('pauseBtn').classList.remove('paused');
    });
  });
  function togglePause() {
    paused = !paused;
    document.getElementById('pauseBtn').classList.toggle('paused', paused);
  }
  document.getElementById('pauseBtn').addEventListener('click', togglePause);

  function toggleHelp() { document.getElementById('helpModal').classList.toggle('hidden'); }

  // ── 저장 ────────────────────────────────────────────────────────
  function loadHigh() {
    highScore = parseInt(localStorage.getItem(HIGH_KEY) || '0', 10) || 0;
    document.getElementById('highDisplay').textContent = highScore;
  }
  function saveHigh() {
    if (score > highScore) highScore = score;
    try { localStorage.setItem(HIGH_KEY, String(highScore)); } catch (_e) {}
  }

  function safeBuffer(buf, max) {
    const out = {};
    if (!buf || typeof buf !== 'object') return out;
    for (const key of Object.keys(buf)) {
      if (ITEMS[key]) out[key] = clampNum(buf[key], 0, max, 0);
    }
    return out;
  }

  function serializeBuilding(b) {
    const data = { id: b.id, x: b.x, y: b.y, dir: b.dir, tier: b.tier || 1 };
    if (b.id === 'belt') {
      data.item = ITEMS[b.item] ? b.item : null;
      data.prog = clampNum(b.prog, 0, 1, 0);
    } else if (B[b.id].kind === 'miner') {
      data.timer = clampNum(b.timer, 0, MINER_RATE, 0);
    } else if (B[b.id].kind === 'machine') {
      data.inBuf = safeBuffer(b.inBuf, IN_CAP);
      data.outBuf = safeBuffer(b.outBuf, OUT_CAP);
      if (b.craft && b.craft.out) {
        data.craft = {
          out: safeBuffer(b.craft.out, OUT_CAP),
          t: clampNum(b.craft.t, 0, 30, 0),
          total: clampNum(b.craft.total, 0.1, 30, B[b.id].time || 1),
        };
      }
    } else if (B[b.id].kind === 'generator') {
      data.fuel = clampNum(b.fuel, 0, GEN_FUEL_CAP, 0);
    }
    return data;
  }

  function saveRun() {
    if (state !== 'playing') return;
    const data = {
      version: FactoryState.SAVE_VERSION,
      savedAt: Date.now(),
      era, research, score, won, eraStable, rp,
      breakthroughs: Array.from(breakthroughs),
      chronicle: chronicle.slice(0, 30),
      simTime: Math.round(simTime * 1000) / 1000,
      speed, paused,
      selected, rot, tool,
      camera: {
        x: Math.round(camera.x * 100) / 100,
        y: Math.round(camera.y * 100) / 100,
        zoom: Math.round(camera.zoom * 1000) / 1000,
      },
      deposits: grid.map((cell) => FactoryState.serializeDeposit(cell.deposit)),
      buildings: buildings.map(serializeBuilding),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      savedRunMeta = data;
    } catch (_e) {}
  }

  function readSavedRun() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!FactoryState.supportsSave(data)) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function restoreBuilding(data) {
    if (!data || !B[data.id]) return null;
    const x = Math.floor(data.x), y = Math.floor(data.y);
    if (!inBounds(x, y) || cellAt(x, y).b) return null;
    const b = makeBuilding(data.id, x, y, clampNum(data.dir, 0, 3, 0) | 0);
    b.tier = clampNum(data.tier, 1, MAX_TIER, 1) | 0;
    const def = B[b.id];
    if (b.id === 'belt') {
      b.item = ITEMS[data.item] ? data.item : null;
      b.prog = clampNum(data.prog, 0, 1, 0);
    } else if (def.kind === 'miner') {
      b.timer = clampNum(data.timer, 0, MINER_RATE, 0);
    } else if (def.kind === 'machine') {
      b.inBuf = safeBuffer(data.inBuf, IN_CAP);
      b.outBuf = safeBuffer(data.outBuf, OUT_CAP);
      if (data.craft && data.craft.out) {
        b.craft = {
          out: safeBuffer(data.craft.out, OUT_CAP),
          t: clampNum(data.craft.t, 0, 30, 0),
          total: clampNum(data.craft.total, 0.1, 30, def.time || 1),
        };
      }
    } else if (def.kind === 'generator') {
      b.fuel = clampNum(data.fuel, 0, GEN_FUEL_CAP, 0);
    }
    return b;
  }

  function restoreRun(data) {
    grid = new Array(GRID_W * GRID_H);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = {
        deposit: FactoryState.restoreDeposit(data.deposits[i], (resource) => Boolean(ITEMS[resource]), DEPOSIT_MIN),
        b: null,
      };
    }
    buildings = [];
    era = clampNum(data.era, 1, 4, 1) | 0;
    research = clampNum(data.research, 0, ERAS[era].count * 3, 0) | 0;
    score = clampNum(data.score, 0, 9999999, 0) | 0;
    rp = clampNum(data.rp, 0, 9999999, 0) | 0;
    won = Boolean(data.won);
    eraStable = clampNum(data.eraStable, 0, ERA_STABILITY_SEC, 0);
    simTime = clampNum(data.simTime, 0, 999999, 0);
    speed = clampNum(data.speed, 1, 3, 1) | 0;
    paused = Boolean(data.paused);
    selected = B[data.selected] && B[data.selected].era <= era ? data.selected : 'belt';
    rot = clampNum(data.rot, 0, 3, 0) | 0;
    tool = ['build', 'erase', 'pan', 'upgrade'].includes(data.tool) ? data.tool : 'build';
    camera.x = clampNum(data.camera && data.camera.x, -TILE, GRID_W * TILE, GRID_W * TILE / 2);
    camera.y = clampNum(data.camera && data.camera.y, -TILE, GRID_H * TILE, GRID_H * TILE / 2);
    camera.zoom = clampNum(data.camera && data.camera.zoom, 0.5, 2.2, 1);
    powerProd = powerDemand = 0; powerRatio = 1;
    deliveries = []; floaties = []; warnState = { text: '', until: 0 };
    breakthroughs = new Set((Array.isArray(data.breakthroughs) ? data.breakthroughs : [])
      .filter((id) => FactoryEvolution.BREAKTHROUGHS.some((definition) => definition.id === id)));
    chronicle = Array.isArray(data.chronicle) ? data.chronicle.slice(0, 30) : [];
    evolutionMods = FactoryEvolution.modifiers(breakthroughs);
    breakthroughAccum = 0;
    tut.active = false;
    for (const item of data.buildings) {
      const b = restoreBuilding(item);
      if (!b) continue;
      cellAt(b.x, b.y).b = b;
      buildings.push(b);
    }
    state = 'playing';
    document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b.dataset.speed === String(speed)));
    document.getElementById('pauseBtn').classList.toggle('paused', paused);
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('tutPanel').classList.add('hidden');
    renderPalette(); updateTopbar(); refreshTools(); showInfo(); updateHUD();
    showToast('공장 복구 완료', `${buildings.length}개 건물 · ${ERAS[era].name}`);
  }

  function clearSavedRun() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_e) {}
    savedRunMeta = null;
  }

  function savedRunSummary(data) {
    if (!data) return '';
    const e = ERAS[Math.min(clampNum(data.era, 1, 4, 1) | 0, 4)];
    const goal = e.count;
    const savedAt = data.savedAt ? new Date(data.savedAt).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : '저장 시간 없음';
    const discovered = Array.isArray(data.breakthroughs) ? data.breakthroughs.length : 0;
    return `저장된 공장 · ${e.name} · 연구 ${data.research || 0}/${goal} · 돌파 ${discovered}/4 · RP ${data.rp || 0} · 건물 ${data.buildings.length}개 · ${savedAt}`;
  }

  let saveAccum = 0;
  window.addEventListener('visibilitychange', () => { if (document.hidden) { saveHigh(); saveRun(); } });
  window.addEventListener('beforeunload', () => { saveHigh(); saveRun(); });

  // ── 시작 / 오버레이 ─────────────────────────────────────────────
  function startNew() {
    clearSavedRun();
    resetWorld();
    tutGuaranteeOre();
    selected = 'miner';
    tool = 'build';
    rot = 0;
    state = 'playing'; paused = false; speed = 1;
    addChronicle('🔥', '증기 시대 공장 건설 시작');
    document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b.dataset.speed === '1'));
    document.getElementById('pauseBtn').classList.remove('paused');
    document.getElementById('overlay').classList.remove('visible');
    renderPalette(); updateTopbar(); refreshTools(); showInfo();
    selectionHint('miner');
    saveRun();
  }

  function startFromOverlay() {
    const saved = savedRunMeta || readSavedRun();
    if (saved) restoreRun(saved);
    else startNew();
  }

  function fillOverlay() {
    savedRunMeta = readSavedRun();
    document.getElementById('overlayTitle').textContent = '🏭 산업의 시대';
    document.getElementById('overlayMsg').innerHTML =
      '자원을 캐고 컨베이어로 잇고 가공해 <b>연구소</b>에 납품하세요.<br>각 시대의 병목을 해결해 <b>핵심 돌파</b>를 발견하고, 1차 증기 → 2차 전기 → 3차 디지털 → 4차 AI 시대로 공장을 진화시킵니다.';
    document.getElementById('overlayHow').innerHTML = `
      <b>🎯 첫 목표 (1차 · 증기):</b> 톱니바퀴 30개 납품<br>
      ① <b>채굴기⛏</b>를 <b>철광석</b> 위에 → ② <b>화로🔥</b>로 철판 제련 →<br>
      ③ <b>작업대🔧</b>로 톱니바퀴 →  ④ <b>연구소🔬</b>에 납품!<br>
      <span style="color:#8595ad">건물은 <b>컨베이어➤</b>로 연결하거나 서로 맞붙여 직접 전달돼요.</span>`;
    const saveSummary = document.getElementById('saveSummary');
    const hasSave = Boolean(savedRunMeta);
    saveSummary.classList.toggle('hidden', !hasSave);
    saveSummary.textContent = hasSave ? savedRunSummary(savedRunMeta) : '';
    document.getElementById('startBtn').textContent = hasSave ? '이어하기' : '건설 시작';
    document.getElementById('newRunBtn').classList.toggle('hidden', !hasSave);
    document.getElementById('discardSaveBtn').classList.toggle('hidden', !hasSave);
    document.getElementById('tutBtn').classList.toggle('hidden', hasSave || state === 'win');
  }

  // ── 메인 루프 ───────────────────────────────────────────────────
  let lastTime = 0;
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (state === 'playing' && !paused) {
      let sdt = dt * speed;
      // 큰 스텝은 분할해 시뮬레이션 안정성 유지
      while (sdt > 0) { const step = Math.min(sdt, 0.05); simStep(step); sdt -= step; }
    }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) document.getElementById('toast').innerHTML = ''; }
    if (state === 'playing') updateHUD();
    draw(dt);
    // 주기적 저장
    saveAccum += dt; if (saveAccum > 5) { saveAccum = 0; saveHigh(); saveRun(); }
    requestAnimationFrame(loop);
  }

  // ── 도움말 본문 ─────────────────────────────────────────────────
  document.getElementById('helpBody').innerHTML = `
    <h4>핵심 흐름</h4>
    채굴기⛏ → 컨베이어➤ → 가공 기계 → 연구소🔬 납품. 납품한 만큼 연구가 차오르고, 목표를 채우면 다음 산업혁명으로 진화합니다.
    <h4>조작</h4>
    <ul>
      <li>좌클릭/드래그: 선택한 건물 배치 (컨베이어는 드래그로 선 긋기)</li>
      <li>우클릭/드래그 또는 <span class="k">E</span>: 철거</li>
      <li><span class="k">U</span> 또는 🔼: 업그레이드 모드 → 건물 클릭 시 RP로 강화</li>
      <li><span class="k">R</span>: 배치 방향 회전</li>
      <li><span class="k">스페이스</span>+드래그 또는 ✋ 버튼: 화면 이동 · 휠: 확대/축소</li>
      <li><span class="k">1</span>~<span class="k">9</span>: 건물 빠른 선택 · <span class="k">P</span>: 일시정지 · <span class="k">G</span>: 현재 시대 가이드</li>
    </ul>
    <h4>🔩 연구포인트(RP) & 업그레이드</h4>
    연구소에 납품할 때마다 <b>RP</b>를 얻습니다(상위 아이템일수록 큼). 🔼 업그레이드 모드에서 채굴기·기계·발전기를 클릭하면 RP를 써서 <b>티어 1→2→3</b>으로 강화돼 속도/생산이 빨라집니다(★ 표시). 납품으로 번 RP를 공장에 재투자하는 것이 최적화의 핵심입니다.
    <h4>⛏ 유한 광맥</h4>
    각 광맥 타일은 <b>매장량이 정해져</b> 있어 채굴할수록 줄어듭니다(타일 하단 게이지). 고갈되면 채굴기가 멈추므로(붉은 테두리), 새 광맥으로 채굴기를 옮기거나 증설하며 <b>확장</b>해야 합니다. 채굴은 끝까지 중요합니다.
    <h4>🧭 병목 진단</h4>
    우측 상단 <b>병목</b> 표시가 지금 생산을 가로막는 구속 조건(전력·채굴·특정 기계의 입력/출력)을 알려줍니다. 그곳을 넓히는 것이 생산성 향상의 지름길입니다.
    <h4>핵심 돌파와 시대 진화</h4>
    각 시대는 납품량만 채워서는 끝나지 않습니다. 처리량·전력·설비 개량 압력이 함께 쌓이면 <b>표준화 부품 → 계통 조정 → 프로그램 제어 → 자율 최적화</b>가 자동 발견됩니다. 돌파 효과는 이전 생산선에도 계속 적용되며, 납품·생산선·전력·돌파 조건을 동시에 유지해야 다음 시대로 넘어갑니다. 📖 시대 가이드에서 병목의 역사와 산업 연대기를 확인할 수 있습니다.
    <h4>전력 (2차~)</h4>
    발전기⚡가 석탄을 태워 전력을 만듭니다. 전기 기계(조립기·회로공장 등)는 전력을 소비하며, <b>수요 > 생산</b>이면 모든 전기 기계가 느려집니다. 발전기를 늘리거나 업그레이드해 균형을 맞추세요. (채굴기·화로·작업대는 전력이 필요 없습니다.)
    <h4>시대별 목표</h4>
    <ul>
      <li>🔥 1차: 톱니바퀴 30 (철판→톱니바퀴)</li>
      <li>⚡ 2차: 모터 40 (구리선+톱니바퀴, 전력 도입)</li>
      <li>💾 3차: 로봇 30 (실리콘→회로, 모터+회로)</li>
      <li>🧠 4차: AI 코어 20 (로봇+회로+데이터)</li>
    </ul>
    이후에는 무한 가동으로 <b>산업 점수</b> 최고 기록에 도전! 진행은 광맥 잔량·RP·설비 티어·돌파까지 자동 저장됩니다.`;

  // ── 부트스트랩 ─────────────────────────────────────────────────
  resize();
  resetWorld();   // 시작 오버레이 뒤로 공장 그리드 미리보기 (grid 초기화 보장)
  loadHigh();
  fillOverlay();
  document.getElementById('startBtn').addEventListener('click', startFromOverlay);
  document.getElementById('newRunBtn').addEventListener('click', startNew);
  document.getElementById('discardSaveBtn').addEventListener('click', () => {
    clearSavedRun();
    fillOverlay();
  });
  document.getElementById('tutBtn').addEventListener('click', startTutorial);
  document.getElementById('tutSkip').addEventListener('click', endTutorial);
  requestAnimationFrame(loop);
})();
