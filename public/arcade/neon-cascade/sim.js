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
    const roll = random(state) * 100;
    let cursor = 0;
    for (const [id, def] of Object.entries(ORB_TYPES)) {
      cursor += def.weight;
      if (roll < cursor) return id;
    }
    return 'core';
  }

  function createState(seed) {
    const state = {
      seed: Number.isFinite(seed) ? seed | 0 : Date.now() | 0,
      width: WIDTH,
      height: HEIGHT,
      time: ROUND_SECONDS,
      elapsed: 0,
      score: 0,
      wave: 1,
      target: 12,
      waveHits: 0,
      charges: 3,
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
    spawnWave(state);
    return state;
  }

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
    state.explosions.push(makeExplosion(state, x, y, state.fever > 0 ? PULSE_RADIUS * 1.35 : PULSE_RADIUS, 'pulse'));
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
    if (state.charges >= MAX_CHARGES) {
      state.chargeProgress = 0;
      return;
    }
    state.chargeProgress += dt;
    if (state.chargeProgress >= RECHARGE_SECONDS) {
      state.chargeProgress -= RECHARGE_SECONDS;
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
    const chainMultiplier = 1 + Math.floor((state.chain - 1) / 4) * 0.5;
    const feverMultiplier = state.fever > 0 ? 3 : 1;
    const score = Math.round(def.score * chainMultiplier * feverMultiplier);
    state.score += score;
    state.overdrive = Math.min(100, state.overdrive + (orb.type === 'gold' ? 18 : 7));

    if (orb.type === 'time') {
      state.time = Math.min(99, state.time + 2.5);
      state.events.push({ type: 'time', amount: 2.5, x: orb.x, y: orb.y });
    }

    const radius = orb.type === 'nova' ? 178 : (state.fever > 0 ? 126 : 96);
    state.explosions.push(makeExplosion(state, orb.x, orb.y, radius, orb.type === 'nova' ? 'nova' : 'orb'));
    state.events.push({ type: 'hit', orbType: orb.type, x: orb.x, y: orb.y, chain: state.chain, score });

    const earnedCharges = Math.floor(state.chain / 8);
    if (earnedCharges > state.chargeAwards) {
      state.chargeAwards = earnedCharges;
      if (state.charges < MAX_CHARGES) state.charges++;
      state.events.push({ type: 'charge', charges: state.charges, chainReward: true });
    }

    if (state.overdrive >= 100) {
      state.overdrive = 0;
      state.fever = 6;
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
    state.charges = Math.min(MAX_CHARGES, state.charges + 2);
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
    createState,
    spawnWave,
    pulse,
    step,
    bestPulseTarget,
    drainEvents,
  };
})(window);
