// 식물 키우기 — 클리커 육성 게임
(function () {
  'use strict';

  // ── 성장 단계 ───────────────────────────────────────────────────
  const DEFAULT_STAGES = [
    { name: '씨앗',    icon: '🌱', need: 0   },
    { name: '새싹',    icon: '🌿', need: 100  },
    { name: '줄기',    icon: '🌾', need: 300  },
    { name: '꽃봉오리',icon: '🌷', need: 700  },
    { name: '꽃',      icon: '🌸', need: 1400 },
    { name: '열매',    icon: '🍇', need: 2500 },
    { name: '나무',    icon: '🌳', need: 4500 },
    { name: '고목',    icon: '🌲', need: 7500 },
    { name: '신목 🌟', icon: '✨🌲✨', need: 12000 },
  ];

  const TOKEN_EMOJI = {
    plant_seed: '🌱',
    plant_sprout: '🌿',
    plant_sapling: '🌾',
    plant_bush: '🌳',
    plant_flower: '🌸',
    plant_bloom: '🌺',
    plant_fruit: '🍇',
    plant_ancient: '🌲',
    plant_mythic: '✨🌲✨'
  };

  function sandboxStages() {
    const config = window.PG_CONFIG;
    if (!config || !config.__loadedFromSandbox) return null;
    const stages = config.GROWTH_STAGES;
    if (!Array.isArray(stages) || !stages.length) return null;
    return stages.map((stage, idx) => ({
      name: stage.name || DEFAULT_STAGES[idx]?.name || `Stage ${idx + 1}`,
      icon: TOKEN_EMOJI[stage.spriteToken] || DEFAULT_STAGES[idx]?.icon || '🌱',
      need: Number(stage.xpRequired) || 0,
      tapValue: Number(stage.tapValue) || 1,
    })).sort((a, b) => a.need - b.need);
  }

  const STAGES = sandboxStages() || DEFAULT_STAGES;

  // ── 업그레이드 정의 ─────────────────────────────────────────────
  // cost: [단계별 비용], resource: 소비 자원, effect: 설명
  const UPGRADES = [
    {
      id: 'waterCan', name: '💧 물뿌리개', icon: '🪣',
      desc: '클릭당 물 +{val}',
      resource: 'water', maxLv: 10,
      cost: (lv) => Math.floor(10 * Math.pow(1.8, lv)),
      costRes: 'water',
      stat: 'clickWater', base: 1, perLv: 1,
    },
    {
      id: 'sunPanel', name: '☀ 태양광 패널', icon: '🔆',
      desc: '초당 햇빛 +{val}',
      resource: 'sun', maxLv: 8,
      cost: (lv) => Math.floor(20 * Math.pow(2.0, lv)),
      costRes: 'sun',
      stat: 'sunPerSec', base: 0, perLv: 0.5,
    },
    {
      id: 'fertilizer', name: '🌿 비료', icon: '🧪',
      desc: '성장 속도 +{val}%',
      resource: 'nutrient', maxLv: 8,
      cost: (lv) => Math.floor(15 * Math.pow(2.2, lv)),
      costRes: 'nutrient',
      stat: 'growthMult', base: 1, perLv: 0.15,
    },
    {
      id: 'rainCloud', name: '🌧 빗구름', icon: '☁',
      desc: '초당 물 +{val}',
      resource: 'water', maxLv: 8,
      cost: (lv) => Math.floor(30 * Math.pow(2.1, lv)),
      costRes: 'water',
      stat: 'waterPerSec', base: 0, perLv: 0.3,
    },
    {
      id: 'earthworm', name: '🪱 지렁이', icon: '🌍',
      desc: '초당 영양분 +{val}',
      resource: 'nutrient', maxLv: 6,
      cost: (lv) => Math.floor(25 * Math.pow(2.3, lv)),
      costRes: 'nutrient',
      stat: 'nutrientPerSec', base: 0, perLv: 0.2,
    },
    {
      id: 'starDust', name: '✨ 별가루', icon: '🌟',
      desc: '성장 1당 별 +{val}',
      resource: 'star', maxLv: 5,
      cost: (lv) => Math.floor(5 * Math.pow(3.0, lv)),
      costRes: 'star',
      stat: 'starPerGrowth', base: 0, perLv: 0.005,
    },
    {
      id: 'photosyn', name: '🍃 광합성', icon: '🌿',
      desc: '물 클릭 시 햇빛도 +{val}',
      resource: 'sun', maxLv: 6,
      cost: (lv) => Math.floor(40 * Math.pow(2.0, lv)),
      costRes: 'sun',
      stat: 'sunPerClick', base: 0, perLv: 0.5,
    },
  ];

  const BREAKTHROUGHS = [
    {
      id: 'root_network', icon: '🌿', name: '뿌리 네트워크',
      desc: '영양분 루프가 안정되어 성장 속도와 영양분 자동 생산이 오른다.',
      check: () => save.stageIdx >= 2 && upgradeLevel('earthworm') >= 1,
      hint: '줄기 단계 + 지렁이 Lv.1',
    },
    {
      id: 'irrigation_loop', icon: '💧', name: '관수 루프',
      desc: '물 주기와 비구름이 연결되어 클릭 물 수확과 자동 물 생산이 오른다.',
      check: () => upgradeLevel('waterCan') >= 3 && upgradeLevel('rainCloud') >= 1,
      hint: '물뿌리개 Lv.3 + 비구름 Lv.1',
    },
    {
      id: 'solar_canopy', icon: '☀️', name: '태양 캐노피',
      desc: '잎이 넓어져 햇빛 생산과 클릭 보너스가 동시에 오른다.',
      check: () => save.stageIdx >= 3 && upgradeLevel('sunPanel') >= 2,
      hint: '관목 단계 + 태양광 Lv.2',
    },
    {
      id: 'pollination', icon: '🌸', name: '수분 생태계',
      desc: '꽃이 생태계를 불러 별가루와 성장 배율을 함께 끌어올린다.',
      check: () => save.stageIdx >= 4 && upgradeLevel('fertilizer') >= 2,
      hint: '꽃 단계 + 비료 Lv.2',
    },
    {
      id: 'ancient_seed', icon: '✨', name: '고대 씨앗 기억',
      desc: '오래 자란 식물이 모든 자동 루프를 더 효율적으로 만든다.',
      check: () => save.stageIdx >= 6 && upgradeLevel('starDust') >= 1,
      hint: '나무 단계 + 별가루 Lv.1',
    },
  ];

  // ── 업적 ────────────────────────────────────────────────────────
  const ACHIEVEMENTS = [
    { id: 'first_water', name: '첫 물주기',    cond: (s) => s.totalClicks >= 1 },
    { id: 'sapling',     name: '새싹 달성',    cond: (s) => s.stageIdx >= 1 },
    { id: 'flower',      name: '꽃 피우기',    cond: (s) => s.stageIdx >= 4 },
    { id: 'tree',        name: '나무 성장',     cond: (s) => s.stageIdx >= 6 },
    { id: 'divine',      name: '신목 달성 🎉', cond: (s) => s.stageIdx >= 8 },
    { id: 'clicker100',  name: '물주기 100회', cond: (s) => s.totalClicks >= 100 },
    { id: 'clicker1k',   name: '물주기 1000회',cond: (s) => s.totalClicks >= 1000 },
  ];

  // ── 저장/불러오기 ───────────────────────────────────────────────
  const SAVE_KEY = 'plant_save_v1';

  function defaultSave() {
    return {
      water: 0, sun: 0, nutrient: 0, star: 0,
      growth: 0, stageIdx: 0,
      upgrades: {},          // id → level
      achievements: [],
      breakthroughs: [],
      totalClicks: 0,
      lastSave: Date.now(),
    };
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const loaded = { ...defaultSave(), ...JSON.parse(raw) };
      loaded.stageIdx = Math.max(0, Math.min(loaded.stageIdx || 0, STAGES.length - 1));
      loaded.achievements = Array.isArray(loaded.achievements) ? loaded.achievements : [];
      loaded.breakthroughs = Array.isArray(loaded.breakthroughs) ? loaded.breakthroughs : [];
      return loaded;
    } catch { return defaultSave(); }
  }

  function saveGame() {
    save.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  let save = loadSave();
  let toastTimer;

  function upgradeLevel(id) {
    return save.upgrades[id] || 0;
  }

  function hasBreakthrough(id) {
    return save.breakthroughs.includes(id);
  }

  // ── 파생 스탯 계산 ─────────────────────────────────────────────
  function calcStats() {
    const lv = upgradeLevel;
    const stageTap = STAGES[save.stageIdx] && STAGES[save.stageIdx].tapValue;
    const stats = {
      clickWater:    (stageTap || 1) + lv('waterCan') * 1,
      sunPerSec:     0   + lv('sunPanel')   * 0.5,
      growthMult:    1   + lv('fertilizer') * 0.15,
      waterPerSec:   0   + lv('rainCloud')  * 0.3,
      nutrientPerSec:0   + lv('earthworm')  * 0.2,
      starPerGrowth: 0   + lv('starDust')   * 0.005,
      sunPerClick:   0   + lv('photosyn')   * 0.5,
    };
    if (hasBreakthrough('root_network')) {
      stats.growthMult += 0.12;
      stats.nutrientPerSec += 0.4;
    }
    if (hasBreakthrough('irrigation_loop')) {
      stats.clickWater += 2;
      stats.waterPerSec += 0.6;
    }
    if (hasBreakthrough('solar_canopy')) {
      stats.sunPerSec += 1.0;
      stats.sunPerClick += 0.8;
    }
    if (hasBreakthrough('pollination')) {
      stats.growthMult += 0.20;
      stats.starPerGrowth += 0.008;
    }
    if (hasBreakthrough('ancient_seed')) {
      stats.sunPerSec *= 1.15;
      stats.waterPerSec *= 1.15;
      stats.nutrientPerSec *= 1.15;
      stats.growthMult += 0.18;
    }
    return stats;
  }

  // ── 오프라인 진행 ───────────────────────────────────────────────
  function applyOfflineProgress() {
    const elapsed = Math.min((Date.now() - save.lastSave) / 1000, 3600); // 최대 1시간
    if (elapsed < 1) return;
    const st = calcStats();
    save.water    += st.waterPerSec    * elapsed;
    save.sun      += st.sunPerSec      * elapsed;
    save.nutrient += st.nutrientPerSec * elapsed;
    const growthGain = elapsed * 0.5 * st.growthMult;
    applyGrowth(growthGain);
    if (elapsed > 10) showToast(`💤 오프라인 ${Math.floor(elapsed)}초간 성장!`);
  }

  applyOfflineProgress();

  // ── 성장 처리 ───────────────────────────────────────────────────
  function applyGrowth(amount) {
    const st = calcStats();
    save.growth += amount;
    save.star   += amount * st.starPerGrowth;

    // 단계 진행
    const prevStage = save.stageIdx;
    while (save.stageIdx < STAGES.length - 1 && save.growth >= STAGES[save.stageIdx + 1].need) {
      save.stageIdx++;
    }
    if (save.stageIdx > prevStage) {
      onStageUp(save.stageIdx);
    }
  }

  function onStageUp(idx) {
    const s = STAGES[idx];
    showToast(`🌟 ${s.name} 단계 달성!`);
    document.getElementById('plantStage').style.animation = 'none';
    setTimeout(() => {
      document.getElementById('plantStage').style.animation = '';
    }, 50);
    if (window.AdMobHelper && idx === STAGES.length - 1) AdMobHelper.showAfterGame();
    checkAchievements();
    checkBreakthroughs();
  }

  // ── 업적 확인 ───────────────────────────────────────────────────
  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (!save.achievements.includes(a.id) && a.cond(save)) {
        save.achievements.push(a.id);
        showToast(`🏆 업적: ${a.name}`);
      }
    }
  }

  // ── 클릭 ────────────────────────────────────────────────────────
  function checkBreakthroughs() {
    for (const bt of BREAKTHROUGHS) {
      if (!hasBreakthrough(bt.id) && bt.check()) {
        save.breakthroughs.push(bt.id);
        showToast(`${bt.icon} 돌파: ${bt.name}`);
      }
    }
  }

  function burstCost() {
    const scale = save.stageIdx + 1;
    return {
      water: 12 + scale * 3,
      sun: 8 + scale * 2,
      nutrient: 5 + scale,
    };
  }

  function canBurst(cost) {
    return save.water >= cost.water && save.sun >= cost.sun && save.nutrient >= cost.nutrient;
  }

  function onGrowthBurst(e) {
    const cost = burstCost();
    if (!canBurst(cost)) {
      showToast('성장 폭발 재료 부족');
      return;
    }
    const st = calcStats();
    save.water -= cost.water;
    save.sun -= cost.sun;
    save.nutrient -= cost.nutrient;
    const growthGain = (20 + save.stageIdx * 6) * st.growthMult;
    applyGrowth(growthGain);
    save.star += 0.05 + save.stageIdx * 0.01;
    spawnClickFx(e || {}, `+${fmt(growthGain)} 성장`);
    checkAchievements();
    checkBreakthroughs();
    renderAll();
    saveGame();
  }

  document.getElementById('plantStage').addEventListener('click', onWaterClick);
  document.getElementById('waterBtn').addEventListener('click', onWaterClick);
  document.getElementById('burstBtn').addEventListener('click', onGrowthBurst);

  function onWaterClick(e) {
    const st = calcStats();
    save.water    += st.clickWater;
    save.sun      += st.sunPerClick;
    save.totalClicks++;

    // 성장: 물 1당 성장 0.4 × growthMult, 비료 적용
    const growthGain = 0.4 * st.clickWater * st.growthMult;
    applyGrowth(growthGain);

    // 클릭 이펙트
    spawnClickFx(e, `+${fmt(st.clickWater)}💧`);
    if (st.sunPerClick > 0) spawnClickFx(e, `+${fmt(st.sunPerClick)}☀`, 20);
    checkAchievements();
    checkBreakthroughs();
    renderAll();
  }

  function spawnClickFx(e, text, offsetY = 0) {
    const fx = document.createElement('div');
    fx.className = 'click-fx';
    fx.textContent = text;
    const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || window.innerWidth / 2;
    const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 200;
    fx.style.left = (clientX + (Math.random() - 0.5) * 30 - 16) + 'px';
    fx.style.top  = (clientY - 10 - offsetY) + 'px';
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 900);
  }

  // ── 업그레이드 구매 ─────────────────────────────────────────────
  function buyUpgrade(id) {
    const def = UPGRADES.find(u => u.id === id);
    if (!def) return;
    const lv   = save.upgrades[id] || 0;
    if (lv >= def.maxLv) return;
    const cost = def.cost(lv);
    if (save[def.costRes] < cost) { showToast(`${resName(def.costRes)} 부족!`); return; }
    save[def.costRes] -= cost;
    save.upgrades[id] = lv + 1;
    checkBreakthroughs();
    showToast(`✅ ${def.name} Lv.${lv + 1} 업그레이드!`);
    renderAll();
    saveGame();
  }

  function resName(r) {
    return { water: '물', sun: '햇빛', nutrient: '영양분', star: '별' }[r] || r;
  }

  // ── 틱 (초당 수입) ──────────────────────────────────────────────
  setInterval(() => {
    const st = calcStats();
    const tick = 0.5; // 0.5초 간격
    save.water    += st.waterPerSec    * tick;
    save.sun      += st.sunPerSec      * tick;
    save.nutrient += st.nutrientPerSec * tick;

    // 수동 성장 없이도 초당 소량 성장 (햇빛 기반)
    if (save.sun > 1) {
      const passiveGrowth = st.sunPerSec * 0.1 * tick * st.growthMult;
      if (passiveGrowth > 0) applyGrowth(passiveGrowth);
    }

    renderResources();
    renderLoopPanel();
    saveGame();
  }, 500);

  // ── 렌더링 ──────────────────────────────────────────────────────
  function renderAll() {
    renderResources();
    renderPlant();
    renderLoopPanel();
    renderUpgrades();
  }

  function renderResources() {
    document.getElementById('waterVal').textContent    = fmt(save.water);
    document.getElementById('sunVal').textContent      = fmt(save.sun);
    document.getElementById('nutrientVal').textContent = fmt(save.nutrient);
    document.getElementById('starVal').textContent     = fmt(save.star);
  }

  function renderPlant() {
    const stage = STAGES[save.stageIdx];
    const nextStage = STAGES[save.stageIdx + 1];
    document.getElementById('plantStage').textContent = stage.icon;
    document.getElementById('stageName').textContent  = stage.name;

    if (nextStage) {
      const current = save.growth - stage.need;
      const needed  = nextStage.need - stage.need;
      const pct     = Math.min(current / needed * 100, 100);
      document.getElementById('growthFill').style.width = pct + '%';
      document.getElementById('growthText').textContent =
        `성장 ${fmt(save.growth)} / ${nextStage.need} (다음: ${stage.name} → ${nextStage.name})`;
    } else {
      document.getElementById('growthFill').style.width = '100%';
      document.getElementById('growthText').textContent = '✨ 최고 단계 달성!';
    }
  }

  function renderLoopPanel() {
    const st = calcStats();
    const cost = burstCost();
    const burstBtn = document.getElementById('burstBtn');
    burstBtn.disabled = !canBurst(cost);
    document.getElementById('burstCost').textContent =
      `${fmt(cost.water)}💧 ${fmt(cost.sun)}☀ ${fmt(cost.nutrient)}🌿`;

    const passiveGrowth = st.sunPerSec > 0 ? st.sunPerSec * 0.1 * st.growthMult : 0;
    document.getElementById('loopSummary').innerHTML = `
      <div class="loop-stat"><b>${fmt(passiveGrowth)}/초</b><span>방치 성장</span></div>
      <div class="loop-stat"><b>${fmt(st.growthMult)}x</b><span>성장 배율</span></div>
      <div class="loop-stat"><b>${save.breakthroughs.length}/${BREAKTHROUGHS.length}</b><span>돌파</span></div>
    `;

    const list = document.getElementById('breakthroughList');
    list.innerHTML = '';
    const unlocked = BREAKTHROUGHS.filter((bt) => hasBreakthrough(bt.id));
    const next = BREAKTHROUGHS.find((bt) => !hasBreakthrough(bt.id));
    for (const bt of unlocked.slice(-3)) {
      const row = document.createElement('div');
      row.className = 'breakthrough-row unlocked';
      row.innerHTML = `
        <div class="breakthrough-name"><span>${bt.icon} ${bt.name}</span><span>활성</span></div>
        <div class="breakthrough-desc">${bt.desc}</div>
      `;
      list.appendChild(row);
    }
    if (next) {
      const row = document.createElement('div');
      row.className = 'breakthrough-row';
      row.innerHTML = `
        <div class="breakthrough-name"><span>${next.icon} 다음 돌파</span><span>${next.name}</span></div>
        <div class="breakthrough-desc">${next.desc}</div>
        <div class="breakthrough-check">${next.check() ? '조건 충족, 곧 해금' : next.hint}</div>
      `;
      list.appendChild(row);
    }
  }

  function renderUpgrades() {
    const st = calcStats();
    const list = document.getElementById('upgradeList');
    list.innerHTML = '';

    for (const def of UPGRADES) {
      const lv    = save.upgrades[def.id] || 0;
      const cost  = def.cost(lv);
      const maxed = lv >= def.maxLv;
      const val   = def.base + lv * def.perLv;
      const canAfford = save[def.costRes] >= cost;

      const row = document.createElement('div');
      row.className = 'upg-row';

      const statStr = def.desc.replace('{val}', fmt(val || def.perLv));
      const nextStatStr = !maxed ? def.desc.replace('{val}', fmt(def.base + (lv+1) * def.perLv)) : '';

      row.innerHTML = `
        <span class="upg-icon">${def.icon}</span>
        <div class="upg-info">
          <div class="upg-name">${def.name}</div>
          <div class="upg-desc">${statStr}</div>
          <div class="upg-level">Lv.${lv}/${def.maxLv}${maxed ? '' : ` → ${nextStatStr}`}</div>
        </div>
        ${maxed
          ? `<span class="upg-maxed">✓ MAX</span>`
          : `<button class="upg-buy" ${canAfford ? '' : 'disabled'} onclick="window._buyUpgrade('${def.id}')">
               ${fmt(cost)} ${resIcon(def.costRes)}
             </button>`
        }
      `;
      list.appendChild(row);
    }

    // 클릭 버튼 레이트 업데이트
    document.getElementById('waterRate').textContent = `+${fmt(st.clickWater)}/클릭`;
  }

  function resIcon(r) {
    return { water: '💧', sun: '☀️', nutrient: '🌿', star: '⭐' }[r] || r;
  }

  window._buyUpgrade = buyUpgrade;

  // ── 토스트 ──────────────────────────────────────────────────────
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ── 초기화 버튼 ─────────────────────────────────────────────────
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('처음부터 다시 시작할까요? 모든 진행이 초기화됩니다.')) return;
    localStorage.removeItem(SAVE_KEY);
    save = defaultSave();
    renderAll();
    showToast('🌱 새로운 씨앗을 심었습니다!');
  });

  // ── 숫자 포맷 ───────────────────────────────────────────────────
  function fmt(n) {
    n = Math.floor(n * 10) / 10;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  }

  // ── 최초 렌더 ───────────────────────────────────────────────────
  renderAll();
})();
