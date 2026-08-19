(function (root) {
  'use strict';

  const WIDTH = 720;
  const HEIGHT = 1000;
  const ROUND_SECONDS = 45;
  const MAX_CHARGES = 4;
  const RECHARGE_SECONDS = 4.5;
  const PULSE_RADIUS = 118;

  const ORB_TYPES = {
    core:  { color: '#35f2ff', radius: 13, score: 100, weight: 62 },
    gold:  { color: '#ffd166', radius: 14, score: 500, weight: 12 },
    nova:  { color: '#ff5d8f', radius: 15, score: 170, weight: 14 },
    time:  { color: '#8cff66', radius: 14, score: 140, weight: 12 },
  };


  // ── 증폭기 (라운드 시작 전 1회 선택) ────────────────────────────
  // 45초 단판이라 중간에 끊으면 타이머를 먹는다. 그래서 드래프트는 라운드 전에만
  // 열고, 이후 45초는 끊기지 않는다. 이게 이 게임의 자연스러운 쉼표다.
  const AMPS = [
    { id: 'overcharge', name: '과충전',   icon: '⚡', kind: 'common',
      desc: '시작 충전 +2 (충전 상한도 함께 오른다)', mods: { startCharges: 2, maxCharges: 1 } },
    { id: 'widepulse',  name: '넓은 파동', icon: '🌊', kind: 'common',
      desc: '펄스 반경 +18%', mods: { pulseRadius: 0.18 } },
    { id: 'goldbias',   name: '황금 편향', icon: '🪙', kind: 'common',
      desc: '골드 오브 등장 확률 상승', mods: { goldWeight: 14 } },
    { id: 'fastcharge', name: '빠른 재충전', icon: '🔋', kind: 'common',
      desc: '재충전 속도 25% 상승', mods: { rechargeMult: -0.25 } },
    { id: 'timecrystal', name: '시간 결정', icon: '⏳', kind: 'common',
      desc: '타임 오브가 주는 시간 +1.5초', mods: { timeBonus: 1.5 } },
    { id: 'novacore',   name: '초신성 코어', icon: '💥', kind: 'rare',
      desc: '노바 폭발 반경 +35%', mods: { novaRadius: 0.35 } },
    { id: 'chainamp',   name: '연쇄 증폭', icon: '📈', kind: 'rare',
      desc: '연쇄 점수 배율 상승폭 +60%', mods: { chainStep: 0.3 } },
    { id: 'overload',   name: '과부하',   icon: '🔥', kind: 'rare',
      desc: '피버 지속 +60%', mods: { feverBonus: 3.6 } },
    { id: 'unstable',   name: '불안정 코어', icon: '☢️', kind: 'cursed',
      desc: '점수 2배 — 대신 충전 최대치 -1', mods: { scoreMult: 1.0, maxCharges: -1 } },
    { id: 'compressed', name: '압축 시간', icon: '⏱️', kind: 'cursed',
      desc: '점수 +70% — 대신 라운드가 6초 짧아진다', mods: { scoreMult: 0.70, roundTime: -6 } },
  ];
  const AMP = Object.fromEntries(AMPS.map((a) => [a.id, a]));

  const AMP_FUSIONS = [
    { id: 'shockwave', name: '충격파', icon: '🌀', from: ['widepulse', 'novacore'],
      desc: '펄스 +30%, 노바 폭발 +60%', mods: { pulseRadius: 0.30, novaRadius: 0.60 } },
    { id: 'perpetual', name: '무한 동력', icon: '♾️', from: ['overcharge', 'fastcharge'],
      desc: '시작 충전 +2, 상한 +1, 재충전 45% 상승', mods: { startCharges: 2, maxCharges: 1, rechargeMult: -0.45 } },
    { id: 'collapse',  name: '임계 붕괴', icon: '🕳️', from: ['unstable', 'compressed'],
      desc: '점수 3.5배 — 충전 -1, 라운드 6초 짧게', mods: { scoreMult: 2.5, maxCharges: -1, roundTime: -6 } },
  ];
  const AMP_F = Object.fromEntries(AMP_FUSIONS.map((f) => [f.id, f]));

  function ampDef(id) { return AMP[id] || AMP_F[id] || null; }

  function ampFusionFor(ownedIds, addedId) {
    const set = new Set(ownedIds);
    for (const f of AMP_FUSIONS) {
      if (!f.from.includes(addedId)) continue;
      if (f.from.every((x) => set.has(x))) return f;
    }
    return null;
  }

  // 보유 증폭기를 합산한다. state 는 이 결과만 읽는다.
  function ampStats(owned) {
    const s = {
      startCharges: 0, maxCharges: 0, pulseRadius: 1, novaRadius: 1, goldWeight: 0,
      rechargeMult: 1, timeBonus: 0, chainStep: 0.5, feverBonus: 0, scoreMult: 1, roundTime: 0,
    };
    for (const id of (owned || [])) {
      const d = ampDef(id);
      if (!d) continue;
      const m = d.mods || {};
      if (m.startCharges) s.startCharges += m.startCharges;
      if (m.maxCharges)   s.maxCharges += m.maxCharges;
      if (m.pulseRadius)  s.pulseRadius += m.pulseRadius;
      if (m.novaRadius)   s.novaRadius += m.novaRadius;
      if (m.goldWeight)   s.goldWeight += m.goldWeight;
      if (m.rechargeMult) s.rechargeMult += m.rechargeMult;
      if (m.timeBonus)    s.timeBonus += m.timeBonus;
      if (m.chainStep)    s.chainStep += m.chainStep;
      if (m.feverBonus)   s.feverBonus += m.feverBonus;
      if (m.scoreMult)    s.scoreMult += m.scoreMult;
      if (m.roundTime)    s.roundTime += m.roundTime;
    }
    // 라운드가 사라지거나 충전이 0이 되면 게임이 아니다 — 하한을 둔다
    s.rechargeMult = Math.max(0.35, s.rechargeMult);
    return s;
  }

  // 라운드 전 선택지 (저주 포함, 완성되는 융합은 표시)
  function ampOffers(rngFn, owned, count) {
    const have = new Set(owned || []);
    const pool = AMPS.filter((a) => !have.has(a.id));
    const weightOf = (a) => (a.kind === 'cursed' ? 0.9 : a.kind === 'rare' ? 1.7 : 3.2);
    const picks = [];
    const left = pool.slice();
    const n = count || 3;
    while (picks.length < n && left.length) {
      const total = left.reduce((acc, a) => acc + weightOf(a), 0);
      let r = rngFn() * total, idx = 0;
      for (let i = 0; i < left.length; i++) { r -= weightOf(left[i]); if (r <= 0) { idx = i; break; } idx = i; }
      picks.push(left.splice(idx, 1)[0]);
    }
    return picks.map((a) => ({ ...a, fusesInto: ampFusionFor((owned || []).concat(a.id), a.id) }));
  }

  // 증폭기 획득 — 조건이 맞으면 즉시 합쳐진다
  function grantAmp(owned, id) {
    const list = (owned || []).slice();
    if (!AMP[id] || list.includes(id)) return { owned: list, fused: null };
    list.push(id);
    const fus = ampFusionFor(list, id);
    if (fus) {
      const next = list.filter((x) => !fus.from.includes(x));
      next.push(fus.id);
      return { owned: next, fused: fus };
    }
    return { owned: list, fused: null };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function random(state) {
    let value = state.seed | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state.seed = value | 0;
    return (value >>> 0) / 4294967296;
  }

  function randomType(state) {
    // 황금 편향은 골드 가중치만 올린다 (총합이 커지므로 나머지는 자연히 희석된다)
    const goldBonus = ampsOf(state).goldWeight;
    const total = 100 + goldBonus;
    const roll = random(state) * total;
    let cursor = 0;
    for (const [id, def] of Object.entries(ORB_TYPES)) {
      cursor += def.weight + (id === 'gold' ? goldBonus : 0);
      if (roll < cursor) return id;
    }
    return 'core';
  }

  function createState(seed, ownedAmps) {
    const amps = ampStats(ownedAmps);
    const state = {
      seed: Number.isFinite(seed) ? seed | 0 : Date.now() | 0,
      width: WIDTH,
      height: HEIGHT,
      amps,
      ampIds: (ownedAmps || []).slice(),
      maxCharges: Math.max(1, MAX_CHARGES + amps.maxCharges),
      time: Math.max(15, ROUND_SECONDS + amps.roundTime),
      elapsed: 0,
      score: 0,
      wave: 1,
      target: 12,
      waveHits: 0,
      charges: 0,
      chargeProgress: 0,
      overdrive: 0,
      fever: 0,
      chain: 0,
      bestChain: 0,
      chainActive: false,
      chargeAwards: 0,
      pendingWave: false,
      ended: false,
      orbs: [],
      explosions: [],
      events: [],
    };
    state.charges = Math.min(state.maxCharges, 3 + amps.startCharges);
    spawnWave(state);
    return state;
  }
  // 예전 호출부 호환 — state.amps 가 없으면 기본값으로 읽는다
  function ampsOf(state) { return state.amps || ampStats([]); }
  function maxChargesOf(state) { return state.maxCharges || MAX_CHARGES; }

  function spawnWave(state) {
    const count = Math.min(52, 14 + state.wave * 5);
    state.target = Math.min(count, 9 + state.wave * 3);
    state.waveHits = 0;
    state.pendingWave = false;
    state.orbs = [];
    for (let i = 0; i < count; i++) {
      const type = randomType(state);
      const def = ORB_TYPES[type];
      const speed = 22 + random(state) * (30 + state.wave * 2);
      const angle = random(state) * Math.PI * 2;
      state.orbs.push({
        id: `${state.wave}-${i}-${state.seed >>> 0}`,
        type,
        x: 45 + random(state) * (WIDTH - 90),
        y: 80 + random(state) * (HEIGHT - 170),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: def.radius,
        dead: false,
        phase: random(state) * Math.PI * 2,
      });
    }
    state.events.push({ type: 'wave', wave: state.wave, target: state.target });
  }

  function pulse(state, x, y) {
    if (state.ended || state.charges <= 0) return false;
    state.charges--;
    if (!state.chainActive) {
      state.chain = 0;
      state.chargeAwards = 0;
    }
    state.chainActive = true;
    const pr = PULSE_RADIUS * ampsOf(state).pulseRadius;
    state.explosions.push(makeExplosion(state, x, y, state.fever > 0 ? pr * 1.35 : pr, 'pulse'));
    state.events.push({ type: 'pulse', x, y, charges: state.charges });
    return true;
  }

  function makeExplosion(state, x, y, radius, source) {
    return {
      id: `${source}-${state.elapsed}-${state.seed >>> 0}-${state.explosions.length}`,
      x,
      y,
      radius,
      currentRadius: 4,
      age: 0,
      duration: source === 'nova' ? 0.9 : 0.72,
      source,
    };
  }

  function step(state, rawDt) {
    if (state.ended) return state;
    const dt = clamp(rawDt, 0, 0.05);
    state.elapsed += dt;
    state.time = Math.max(0, state.time - dt);
    state.fever = Math.max(0, state.fever - dt);
    recharge(state, dt);
    moveOrbs(state, dt);
    updateExplosions(state, dt);

    if (state.pendingWave && state.explosions.length === 0) advanceWave(state);
    if (state.chainActive && state.explosions.length === 0) finishChain(state);
    if (state.time <= 0) {
      state.ended = true;
      state.events.push({ type: 'end', score: state.score, bestChain: state.bestChain, wave: state.wave });
    }
    return state;
  }

  function recharge(state, dt) {
    if (state.charges >= maxChargesOf(state)) {
      state.chargeProgress = 0;
      return;
    }
    state.chargeProgress += dt;
    if (state.chargeProgress >= RECHARGE_SECONDS * ampsOf(state).rechargeMult) {
      state.chargeProgress -= RECHARGE_SECONDS * ampsOf(state).rechargeMult;
      state.charges++;
      state.events.push({ type: 'charge', charges: state.charges });
    }
  }

  function moveOrbs(state, dt) {
    for (const orb of state.orbs) {
      if (orb.dead) continue;
      const speedBoost = state.fever > 0 ? 0.72 : 1;
      orb.x += orb.vx * dt * speedBoost;
      orb.y += orb.vy * dt * speedBoost;
      if (orb.x < orb.radius || orb.x > WIDTH - orb.radius) {
        orb.x = clamp(orb.x, orb.radius, WIDTH - orb.radius);
        orb.vx *= -1;
      }
      if (orb.y < 65 + orb.radius || orb.y > HEIGHT - 65 - orb.radius) {
        orb.y = clamp(orb.y, 65 + orb.radius, HEIGHT - 65 - orb.radius);
        orb.vy *= -1;
      }
      orb.phase += dt * 3;
    }
  }

  function updateExplosions(state, dt) {
    for (const explosion of state.explosions) {
      explosion.age += dt;
      const progress = clamp(explosion.age / explosion.duration, 0, 1);
      explosion.currentRadius = explosion.radius * Math.sin(progress * Math.PI * 0.92);
    }

    const active = state.explosions.slice();
    for (const explosion of active) {
      for (const orb of state.orbs) {
        if (orb.dead) continue;
        const dx = orb.x - explosion.x;
        const dy = orb.y - explosion.y;
        const reach = explosion.currentRadius + orb.radius;
        if (dx * dx + dy * dy <= reach * reach) triggerOrb(state, orb);
      }
    }
    state.explosions = state.explosions.filter((explosion) => explosion.age < explosion.duration);
    state.orbs = state.orbs.filter((orb) => !orb.dead);
  }

  function triggerOrb(state, orb) {
    orb.dead = true;
    state.chain++;
    state.bestChain = Math.max(state.bestChain, state.chain);
    state.waveHits++;
    const def = ORB_TYPES[orb.type];
    const A = ampsOf(state);
    const chainMultiplier = 1 + Math.floor((state.chain - 1) / 4) * A.chainStep;
    const feverMultiplier = state.fever > 0 ? 3 : 1;
    const score = Math.round(def.score * chainMultiplier * feverMultiplier * A.scoreMult);
    state.score += score;
    state.overdrive = Math.min(100, state.overdrive + (orb.type === 'gold' ? 18 : 7));

    if (orb.type === 'time') {
      const bonus = 2.5 + A.timeBonus;
      state.time = Math.min(99, state.time + bonus);
      state.events.push({ type: 'time', amount: bonus, x: orb.x, y: orb.y });
    }

    const radius = orb.type === 'nova' ? 178 * A.novaRadius : (state.fever > 0 ? 126 : 96);
    state.explosions.push(makeExplosion(state, orb.x, orb.y, radius, orb.type === 'nova' ? 'nova' : 'orb'));
    state.events.push({ type: 'hit', orbType: orb.type, x: orb.x, y: orb.y, chain: state.chain, score });

    const earnedCharges = Math.floor(state.chain / 8);
    if (earnedCharges > state.chargeAwards) {
      state.chargeAwards = earnedCharges;
      if (state.charges < maxChargesOf(state)) state.charges++;
      state.events.push({ type: 'charge', charges: state.charges, chainReward: true });
    }

    if (state.overdrive >= 100) {
      state.overdrive = 0;
      state.fever = 6 + A.feverBonus;
      state.time = Math.min(99, state.time + 3);
      state.events.push({ type: 'fever' });
    }

    if (state.waveHits >= state.target) state.pendingWave = true;
  }

  function finishChain(state) {
    state.chainActive = false;
    state.events.push({ type: 'chainEnd', chain: state.chain });
  }

  function advanceWave(state) {
    const cleared = state.waveHits;
    state.wave++;
    state.time = Math.min(99, state.time + 6);
    state.charges = Math.min(maxChargesOf(state), state.charges + 2);
    state.score += cleared * state.wave * 40;
    spawnWave(state);
  }

  function bestPulseTarget(state) {
    if (!state.orbs.length) return { x: WIDTH / 2, y: HEIGHT / 2, count: 0 };
    let best = { x: state.orbs[0].x, y: state.orbs[0].y, count: 0 };
    for (const candidate of state.orbs) {
      let count = 0;
      for (const orb of state.orbs) {
        const dx = orb.x - candidate.x;
        const dy = orb.y - candidate.y;
        if (dx * dx + dy * dy <= PULSE_RADIUS * PULSE_RADIUS) count++;
      }
      if (count > best.count) best = { x: candidate.x, y: candidate.y, count };
    }
    return best;
  }

  function drainEvents(state) {
    const events = state.events.slice();
    state.events.length = 0;
    return events;
  }

  root.NeonCascade = {
    WIDTH,
    HEIGHT,
    ROUND_SECONDS,
    MAX_CHARGES,
    RECHARGE_SECONDS,
    PULSE_RADIUS,
    ORB_TYPES,
    AMPS,
    AMP_FUSIONS,
    ampDef,
    ampStats,
    ampOffers,
    grantAmp,
    ampFusionFor,
    createState,
    spawnWave,
    pulse,
    step,
    bestPulseTarget,
    drainEvents,
  };
})(window);
