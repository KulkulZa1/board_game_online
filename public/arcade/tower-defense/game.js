/* 첨탑 대란 — 렌더러/입력/연출. 규칙은 전부 sim.js(window.TDRogue).
 * 여기는 긴장을 눈에 보이게 만드는 일을 한다:
 *   · 출격 버튼의 카운트다운 링 (준비 시간이 줄어드는 게 보인다)
 *   · 위협 가장자리 — 선두 적이 출구에 다가올수록 화면 테두리가 붉어진다
 *   · 콤보 게이지 · 보스 체력바 · 배너
 * 조작은 "타워를 고르고 칸을 탭한다" 한 흐름 — 예전의 2단계 메뉴를 없앴다.
 */
(function () {
  'use strict';
  const TD = window.TDRogue;
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d');

  // ── 레이아웃 ────────────────────────────────────────────────────
  let CELL = 52, W = 0, H = 0;
  function resize() {
    const wrapW = ($('container').clientWidth || 420) - 20;
    // 세로 여유도 함께 고려 — 팔레트/버튼이 접히면 안 된다
    const budgetH = Math.max(280, window.innerHeight - 300);
    CELL = Math.max(34, Math.floor(Math.min(wrapW / TD.COLS, budgetH / TD.ROWS)));
    W = CELL * TD.COLS; H = CELL * TD.ROWS;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const bw = $('boardWrap'); bw.style.width = W + 'px'; bw.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  // ── 사운드 ──────────────────────────────────────────────────────
  const Sound = (() => {
    let ac, muted = false;
    try { muted = localStorage.getItem('td_muted') === '1'; } catch (e) {}
    const c2 = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
    function tone(f, dur, type, vol, delay) {
      if (muted) return;
      try {
        const c = c2(), o = c.createOscillator(), g = c.createGain();
        o.type = type || 'square'; o.frequency.value = f;
        const t0 = c.currentTime + (delay || 0);
        g.gain.setValueAtTime(vol || 0.06, t0);
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + dur);
      } catch (e) {}
    }
    return {
      toggle() { muted = !muted; try { localStorage.setItem('td_muted', muted ? '1' : '0'); } catch (e) {} return muted; },
      muted: () => muted,
      build() { tone(330, 0.07, 'square', 0.05); tone(494, 0.09, 'square', 0.05, 0.05); },
      shot() { tone(760 + Math.random() * 180, 0.025, 'square', 0.014); },
      boom() { tone(110, 0.16, 'sawtooth', 0.055); },
      kill() { tone(680, 0.04, 'triangle', 0.03); },
      leak() { tone(190, 0.22, 'sawtooth', 0.09); tone(130, 0.3, 'sawtooth', 0.08, 0.09); },
      wave() { [392, 523, 659].forEach((f, i) => tone(f, 0.11, 'triangle', 0.055, i * 0.07)); },
      tick() { tone(1200, 0.03, 'square', 0.03); },
      pick() { tone(523, 0.07, 'triangle', 0.055); tone(784, 0.1, 'triangle', 0.055, 0.06); },
      fuse() { [440, 554, 659, 880, 1108].forEach((f, i) => tone(f, 0.13, 'triangle', 0.065, i * 0.055)); },
      combo(n) { [660, 830, 990][Math.min(2, n)] && tone([660, 830, 990][Math.min(2, n)], 0.12, 'triangle', 0.07); },
      boss() { [147, 110, 82].forEach((f, i) => tone(f, 0.34, 'sawtooth', 0.09, i * 0.13)); },
      over() { [330, 262, 196].forEach((f, i) => tone(f, 0.26, 'sawtooth', 0.07, i * 0.15)); },
    };
  })();

  // ── 메타 저장 ───────────────────────────────────────────────────
  function loadMeta() {
    try { return TD.normalizeMeta(JSON.parse(localStorage.getItem(TD.META_KEY) || '{}')); }
    catch (e) { return TD.normalizeMeta({}); }
  }
  function saveMeta() { try { localStorage.setItem(TD.META_KEY, JSON.stringify(meta)); } catch (e) {} }
  let meta = loadMeta();

  // ── 상태 ────────────────────────────────────────────────────────
  let run = null, speed = 1, paused = false;
  let armed = null;              // 팔레트에서 고른 타워 id
  let sel = null;                // 선택된 타워 칸
  let floaters = [], beams = [], booms = [], sparks = [];
  let shakeT = 0, lastTs = 0, lastCountdownBeep = 99;
  let flashHits = new Map();     // 적 → 피격 플래시 잔여

  const RING_LEN = 119.4;
  const px = (g) => g * CELL + CELL / 2;

  // ── HUD ─────────────────────────────────────────────────────────
  function renderHUD() {
    $('bestDisp').textContent = meta.best;
    if (!run) return;
    $('livesDisp').textContent = run.lives;
    $('goldDisp').textContent = Math.floor(run.gold);
    $('livesStat').classList.toggle('critical', run.lives <= 3);

    // 콤보
    const tier = run.comboTier();
    const cs = $('comboStat');
    cs.classList.toggle('hot', !!tier);
    $('comboDisp').textContent = run.streak > 0 ? `${run.streak}연속${tier ? ' ×' + tier.mult : ''}` : '—';
    $('comboFill').style.width = run.streakT > 0 ? (run.streakT / TD.COMBO_WINDOW * 100) + '%' : '0%';

    // 보스 체력바
    const boss = run.enemies.filter((e) => TD.ENEMIES[e.type].boss)
      .sort((a, b) => b.pos - a.pos)[0];
    const bb = $('bossBar');
    if (boss) {
      bb.classList.remove('hidden');
      const alive = run.enemies.filter((e) => TD.ENEMIES[e.type].boss);
      $('bossName').textContent = alive.length > 1 ? `군주 ×${alive.length}` : '군주';
      $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    } else bb.classList.add('hidden');

    // 위협 가장자리
    const th = run.phase === 'wave' ? run.threat() : 0;
    const k = Math.max(0, (th - 0.45) / 0.55);
    $('threatEdge').style.boxShadow = k > 0.02
      ? `inset 0 0 ${18 + k * 26}px ${2 + k * 8}px rgba(255,60,80,${(0.16 + k * 0.5).toFixed(2)})`
      : 'inset 0 0 0 0 rgba(255,60,80,0)';

    renderWaveBtn();
    renderPalette();
  }

  function renderWaveBtn() {
    const btn = $('waveBtn'), ring = $('ringFg');
    const title = $('waveBtnTitle'), sub = $('waveBtnSub'), tag = $('earlyTag');
    btn.classList.remove('boss', 'fighting', 'urgent');
    if (run.phase === 'over') {
      btn.disabled = true; title.textContent = '함락'; sub.textContent = '';
      tag.classList.add('hidden'); ring.style.strokeDashoffset = RING_LEN; return;
    }
    if (run.phase === 'wave') {
      btn.disabled = true; btn.classList.add('fighting');
      const left = run.enemies.length + run.spawnQueue.length;
      title.textContent = `⚔ ${run.wave}웨이브 교전 중`;
      sub.textContent = `남은 적 ${left}`;
      tag.classList.add('hidden');
      ring.style.strokeDashoffset = RING_LEN * (1 - Math.min(1, left / 40));
      return;
    }
    // build
    const next = run.wave + 1;
    const isBoss = next % 5 === 0;
    btn.disabled = !!run.pendingDraft;
    if (isBoss) btn.classList.add('boss');
    const total = TD.BUILD_SECONDS(next);
    const frac = Math.max(0, Math.min(1, run.buildLeft / total));
    ring.style.strokeDashoffset = RING_LEN * (1 - frac);
    if (run.pendingDraft) {
      title.textContent = '🃏 전리품을 고르세요';
      sub.textContent = '고르는 동안 시간이 멈춥니다';
      tag.classList.add('hidden');
    } else {
      title.textContent = `${isBoss ? '👑' : '⚔'} ${next}웨이브 ${isBoss ? '— 군주 출현' : '출격'}`;
      sub.textContent = `${run.buildLeft.toFixed(1)}초 후 자동 출격 · ${run.nextWavePreview().label}`;
      const bonus = TD.EARLY_GOLD(next, run.buildLeft);
      tag.textContent = `+${bonus}🪙`;
      tag.classList.toggle('hidden', bonus <= 0);
      if (run.buildLeft <= 3) btn.classList.add('urgent');
    }
  }

  function renderPalette() {
    const pal = $('palette');
    const ids = Object.keys(TD.TOWERS);
    if (pal.childElementCount !== ids.length) {
      pal.innerHTML = '';
      ids.forEach((id, i) => {
        const b = document.createElement('button');
        b.className = 'pal-btn'; b.dataset.id = id;
        b.innerHTML = `<span class="p-key">${i + 1}</span><span class="p-ico">${TD.TOWERS[id].icon}</span><span class="p-cost"></span>`;
        b.addEventListener('click', () => armTower(id));
        pal.appendChild(b);
      });
    }
    [...pal.children].forEach((b) => {
      const id = b.dataset.id, def = TD.TOWERS[id];
      const unlocked = run.unlocked.includes(id);
      const cost = run.buildCost(id);
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('poor', unlocked && run.gold < cost);
      b.classList.toggle('armed', armed === id);
      b.title = unlocked ? `${def.name} — ${def.desc}` : `${def.name} — 전리품/연구로 해금`;
      b.querySelector('.p-cost').textContent = unlocked ? cost : '🔒';
    });
  }

  function armTower(id) {
    if (!run || !run.unlocked.includes(id)) { toast('아직 해금되지 않은 타워입니다'); return; }
    armed = id;              // 토글하지 않는다 — 취소는 Esc 또는 길 탭
    sel = null; hidePop();
    renderPalette();
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 1600);
  }
  function banner(text, sub, color) {
    const el = document.createElement('div');
    el.className = 'big-banner';
    el.style.color = color || '#fff';
    el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    $('bannerLayer').appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  // ── 그리기 ──────────────────────────────────────────────────────
  function draw(ts) {
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    ctx.fillStyle = '#0a1020';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // 격자 — 길은 확실히 구별돼야 한다. 첫 렌더에서 길이 거의 안 보였다(실측 스크린샷):
    // 타워 디펜스에서 길이 안 보이면 아무 것도 계획할 수 없다.
    for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) {
      const path = TD.onPath(x, y);
      ctx.fillStyle = path ? '#4a5891' : '#0d1526';
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      if (path) {
        ctx.fillStyle = 'rgba(190,210,255,0.10)';
        ctx.fillRect(x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8);
      } else if (armed && run && run.canBuild(x, y)) {
        // 배치 가능 칸을 은은하게 표시 — 어디에 놓을 수 있는지 한눈에
        ctx.strokeStyle = run.gold >= run.buildCost(armed) ? 'rgba(110,168,255,0.4)' : 'rgba(255,93,108,0.28)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * CELL + 3.5, y * CELL + 3.5, CELL - 7, CELL - 7);
      }
    }

    // 길 위 흐름 표시 — 어느 방향으로 오는지 보여준다
    ctx.strokeStyle = 'rgba(210,225,255,0.30)';
    ctx.lineWidth = Math.max(1.5, CELL * 0.045);
    for (let i = 0; i < TD.PATH_LEN - 1; i += 2) {
      const a1 = TD.PATH[i], b1 = TD.PATH[i + 1];
      const dx = b1.x - a1.x, dy = b1.y - a1.y;
      const cx = px(a1.x), cy = px(a1.y), r = CELL * 0.17;
      const phase = ((ts / 620) + i * 0.16) % 1;
      ctx.globalAlpha = 0.25 + 0.45 * Math.sin(phase * Math.PI);
      ctx.beginPath();
      ctx.moveTo(cx - dy * r - dx * r * 0.5, cy - dx * r - dy * r * 0.5);
      ctx.lineTo(cx + dx * r * 0.7, cy + dy * r * 0.7);
      ctx.lineTo(cx + dy * r - dx * r * 0.5, cy + dx * r - dy * r * 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const s0 = TD.PATH[0], s1 = TD.PATH[TD.PATH_LEN - 1];
    ctx.fillStyle = '#fff';
    ctx.font = `${CELL * 0.46}px serif`;
    ctx.fillText('🚪', px(s0.x), px(s0.y));
    // 성문 — 위협이 높으면 붉게 두근거린다
    const th = run && run.phase === 'wave' ? run.threat() : 0;
    if (th > 0.5) {
      const pulse = 0.35 + 0.35 * Math.sin(ts / 110);
      ctx.fillStyle = `rgba(255,60,80,${(th - 0.5) * 2 * pulse})`;
      ctx.fillRect(s1.x * CELL + 1, s1.y * CELL + 1, CELL - 2, CELL - 2);
    }
    ctx.font = `${CELL * 0.5}px serif`;
    ctx.fillText('🏰', px(s1.x), px(s1.y));

    if (!run) { ctx.restore(); return; }

    // 선택 사거리
    if (sel) {
      const t = run.towerAt(sel.x, sel.y);
      if (t) {
        const st = run.towerStats(t);
        if (st.range > 0) {
          ctx.beginPath(); ctx.arc(px(t.x), px(t.y), st.range * CELL, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(110,168,255,0.07)'; ctx.fill();
          ctx.strokeStyle = 'rgba(110,168,255,0.45)'; ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.strokeStyle = '#6ea8ff'; ctx.lineWidth = 2;
        ctx.strokeRect(sel.x * CELL + 2, sel.y * CELL + 2, CELL - 4, CELL - 4);
      }
    }

    // 타워
    for (const t of run.towers) {
      const def = TD.TOWERS[t.type];
      const fu = t.fused ? TD.FUSIONS[t.type] : null;
      const canFuse = run.canFuse(t.x, t.y);
      if (canFuse) {
        ctx.fillStyle = `rgba(255,209,102,${0.1 + 0.09 * Math.sin(ts / 190)})`;
        ctx.fillRect(t.x * CELL + 2, t.y * CELL + 2, CELL - 4, CELL - 4);
      }
      ctx.font = `${CELL * (t.fused ? 0.54 : 0.46)}px serif`;
      ctx.fillStyle = '#fff';   // 이걸 빼먹으면 직전 격자색(거의 검정)으로 그려져 아이콘이 사라진다
      ctx.fillText(fu ? fu.icon : def.icon, px(t.x), px(t.y) - CELL * 0.06);
      ctx.font = `${CELL * 0.19}px sans-serif`;
      if (t.fused) {
        ctx.fillStyle = '#ffd166';
        ctx.fillText('⚡' + (t.flv || 1), px(t.x), t.y * CELL + CELL - CELL * 0.15);
      } else {
        ctx.fillStyle = t.lv === 3 ? '#ffd166' : '#8fa8dd';
        ctx.fillText('●'.repeat(t.lv), px(t.x), t.y * CELL + CELL - CELL * 0.15);
      }
      if (canFuse) {
        ctx.strokeStyle = `rgba(255,209,102,${0.55 + 0.4 * Math.sin(ts / 190)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x * CELL + 3, t.y * CELL + 3, CELL - 6, CELL - 6);
      }
    }

    // 적
    for (const e of run.enemies) {
      const p = run.enemyXY(e);
      const def = TD.ENEMIES[e.type];
      const ex = px(p.x), ey = px(p.y);
      const flash = flashHits.get(e) || 0;
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`;
        ctx.beginPath(); ctx.arc(ex, ey, CELL * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      // 격노한 보스는 붉은 아우라
      if (def.rage) {
        const rage = 1 - Math.max(0, e.hp) / e.maxHp;
        if (rage > 0.35) {
          ctx.fillStyle = `rgba(255,60,60,${(rage - 0.35) * 0.5})`;
          ctx.beginPath(); ctx.arc(ex, ey, CELL * 0.42, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.font = `${CELL * (def.boss ? 0.6 : 0.4)}px serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(def.icon, ex, ey);
      const bw = CELL * (def.boss ? 0.78 : 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(ex - bw / 2, ey - CELL * 0.33, bw, 3.5);
      const hpF = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = hpF > 0.5 ? '#6be675' : hpF > 0.25 ? '#ffd166' : '#ff5d6c';
      ctx.fillRect(ex - bw / 2, ey - CELL * 0.33, bw * hpF, 3.5);
      ctx.font = `${CELL * 0.2}px serif`;
      ctx.fillStyle = '#fff';
      if (e.shield > 0) ctx.fillText('🔰'.repeat(Math.min(3, e.shield)), ex, ey + CELL * 0.27);
      if (e.freezeT > 0) { ctx.font = `${CELL * 0.3}px serif`; ctx.fillText('🧊', ex, ey - CELL * 0.06); }
      else if (e.slowT > 0) {
        ctx.strokeStyle = 'rgba(120,205,255,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ex, ey, CELL * 0.27, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.burnT > 0) { ctx.font = `${CELL * 0.22}px serif`; ctx.fillText('🔥', ex + CELL * 0.2, ey - CELL * 0.18); }
    }

    // 빔 / 폭발 / 불꽃 / 숫자
    ctx.lineCap = 'round';
    for (const b of beams) {
      ctx.globalAlpha = Math.max(0, b.life / 0.12);
      ctx.strokeStyle = b.color; ctx.lineWidth = b.w || 2;
      ctx.beginPath(); ctx.moveTo(px(b.from.x), px(b.from.y)); ctx.lineTo(px(b.to.x), px(b.to.y)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const b of booms) {
      const k = 1 - b.life / 0.3;
      ctx.strokeStyle = `rgba(255,170,90,${Math.max(0, b.life / 0.3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px(b.x), px(b.y), b.r * CELL * (0.35 + k), 0, Math.PI * 2); ctx.stroke();
    }
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life / 0.4);
      ctx.fillStyle = s.color;
      ctx.fillRect(px(s.x) + s.vx * (0.4 - s.life) * 40, px(s.y) + s.vy * (0.4 - s.life) * 40, 2.5, 2.5);
      ctx.globalAlpha = 1;
    }
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
      ctx.fillStyle = f.color;
      ctx.font = `800 ${CELL * (f.big ? 0.32 : 0.24)}px sans-serif`;
      ctx.fillText(f.text, px(f.x), px(f.y) - (1 - f.life) * 26);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ── 이벤트 → 연출 ───────────────────────────────────────────────
  function consume(evts) {
    for (const e of evts) {
      if (e.t === 'shot') {
        const color = e.tower === 'tesla' ? '#8ff' : e.tower === 'frost' ? '#9df'
          : e.tower === 'sniper' ? '#ffd166' : e.tower === 'cannon' ? '#ffa25a' : '#cbd7ff';
        beams.push({ from: e.from, to: e.to, color, life: 0.12, w: e.fused ? 3 : 2 });
        if (Math.random() < 0.22) Sound.shot();
      } else if (e.t === 'chain') {
        beams.push({ from: e.from, to: e.to, color: '#8ff', life: 0.12, w: 2 });
      } else if (e.t === 'boom') {
        booms.push({ x: e.x, y: e.y, r: e.r, life: 0.3 }); Sound.boom(); shakeT = Math.max(shakeT, 0.1);
      } else if (e.t === 'kill') {
        floaters.push({ x: e.x, y: e.y, text: `+${e.bounty}`, color: e.mult > 1 ? '#ffd166' : '#cfe0ff', life: 1, big: e.mult > 1 });
        for (let i = 0; i < 4; i++) sparks.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), color: '#ffd166', life: 0.4 });
        Sound.kill();
      } else if (e.t === 'block') {
        floaters.push({ x: e.x, y: e.y, text: '막힘', color: '#9fb4e8', life: 0.7 });
      } else if (e.t === 'combo') {
        banner(e.tier.label, `${e.streak}연속 · 보상 ×${e.tier.mult}`, '#ffd166');
        Sound.combo(TD.COMBO_TIERS.findIndex((t) => t.at === e.tier.at));
        shakeT = Math.max(shakeT, 0.15);
      } else if (e.t === 'leak') {
        shakeT = 0.35; Sound.leak();
        banner('💔 방어선 돌파', e.lostStreak > 0 ? `${e.lostStreak}연속 끊김` : '', '#ff5d6c');
      } else if (e.t === 'streakend') {
        /* 조용히 식는다 — 배너까지 띄우면 시끄럽다 */
      } else if (e.t === 'autowave') {
        banner(`⚔ ${e.wave}웨이브`, '자동 출격', '#8fb6ff');
        Sound.wave();
      } else if (e.t === 'gameover') gameOver();
    }
  }

  // ── 루프 ────────────────────────────────────────────────────────
  function loop(ts) {
    requestAnimationFrame(loop);
    const raw = (ts - lastTs) / 1000;
    lastTs = ts;
    const dt = Math.min(0.05, raw || 0);
    if (run && !paused && run.phase !== 'over') {
      const steps = run.phase === 'wave' ? speed : 1;   // 건설 카운트다운은 항상 실시간
      for (let i = 0; i < steps; i++) consume(run.tick(dt));
      // 카운트다운 마지막 3초 — 초읽기 소리
      if (run.phase === 'build' && !run.pendingDraft) {
        const s = Math.ceil(run.buildLeft);
        if (s <= 3 && s !== lastCountdownBeep && s > 0) { lastCountdownBeep = s; Sound.tick(); }
        if (s > 3) lastCountdownBeep = 99;
      }
      if (run.phase === 'wave' && run.waveOver()) {
        const settle = run.settleWave();
        if (settle) {
          banner(`✅ ${run.wave}웨이브 격퇴`, `+${settle.income}🪙 수입`, '#6be675');
          Sound.wave();
          showDraft();
        }
      }
    }
    // 파티클 감쇠
    for (const f of floaters) f.life -= dt * 0.95;
    floaters = floaters.filter((f) => f.life > 0);
    for (const b of beams) b.life -= dt;
    beams = beams.filter((b) => b.life > 0);
    for (const b of booms) b.life -= dt;
    booms = booms.filter((b) => b.life > 0);
    for (const s of sparks) s.life -= dt;
    sparks = sparks.filter((s) => s.life > 0);
    for (const [k, v] of flashHits) { const n = v - dt * 5; if (n <= 0) flashHits.delete(k); else flashHits.set(k, n); }
    if (shakeT > 0) shakeT -= dt;
    renderHUD();
    draw(ts);
  }

  // ── 드래프트 ────────────────────────────────────────────────────
  function showDraft() {
    const cards = run.pendingDraft;
    if (!cards) return;
    const wrap = $('draftCards'); wrap.innerHTML = '';
    $('draftSub').textContent = `${run.wave}웨이브 클리어 — 하나를 고르세요`;
    cards.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'pick-card' + (c.kind === 'curse' ? ' curse' : c.kind === 'tower' ? ' tower' : '');
      btn.dataset.id = c.id;
      btn.innerHTML = `<span class="pick-ico">${c.icon}</span>
        <span><span class="pick-name">${c.name}</span><span class="pick-desc">${c.desc}</span></span>
        <span class="pick-key">${i + 1}</span>`;
      btn.addEventListener('click', () => takeDraft(c.id));
      wrap.appendChild(btn);
    });
    $('draftModal').classList.remove('hidden');
  }
  function takeDraft(id) {
    if (!run || !run.pendingDraft) return;
    const c = run.pendingDraft.find((x) => x.id === id);
    if (!run.pickDraft(id)) return;
    Sound.pick();
    $('draftModal').classList.add('hidden');
    if (c) toast(`${c.icon} ${c.name}`);
    renderHUD();
  }
  $('draftSkip').addEventListener('click', () => {
    if (run && run.skipDraft()) { $('draftModal').classList.add('hidden'); renderHUD(); }
  });

  // ── 타워 팝오버 ─────────────────────────────────────────────────
  function hidePop() { $('towerPop').classList.add('hidden'); }
  function showPop(t) {
    const pop = $('towerPop');
    const def = TD.TOWERS[t.type], fu = t.fused ? TD.FUSIONS[t.type] : null;
    const st = run.towerStats(t);
    $('popHead').innerHTML = `${fu ? fu.icon : def.icon} <b>${fu ? fu.name : def.name}</b> ` +
      (t.fused ? `<span style="color:var(--gold)">⚡Lv${t.flv || 1}</span>` : `Lv${t.lv}`);
    $('popStats').innerHTML = st.rate > 0
      ? `피해 <b>${st.dmg.toFixed(0)}</b> · 초당 <b>${(st.dmg * st.rate).toFixed(0)}</b> · 사거리 <b>${st.range.toFixed(1)}</b>`
        + (fu ? `<br><span style="color:var(--gold)">${fu.desc}</span>` : '')
      : `웨이브마다 <b>+${Math.round(st.income)}🪙</b>` + (fu ? `<br><span style="color:var(--gold)">${fu.desc}</span>` : '');

    const btns = $('popBtns'); btns.innerHTML = '';
    const mk = (cls, html, disabled, fn) => {
      const b = document.createElement('button');
      b.className = 'pop-btn ' + cls; b.innerHTML = html; b.disabled = !!disabled;
      b.addEventListener('click', fn); btns.appendChild(b); return b;
    };
    if (run.canFuse(t.x, t.y)) {
      const fdef = TD.FUSIONS[t.type];
      mk('fuse wide', `${fdef.icon} 융합 → ${fdef.name}<span class="b-cost">옆 타워를 제물로</span>`, false, () => {
        if (run.fuse(t.x, t.y)) {
          Sound.fuse(); shakeT = 0.3;
          banner('⚡ 융합!', fdef.name, '#ffd166');
          toast(`${fdef.icon} ${fdef.name} — ${fdef.desc}`);
          showPop(t);
        }
      });
    }
    const cost = run.upgradeCost(t);
    if (isFinite(cost)) {
      mk('', `⬆ 강화<span class="b-cost">${cost}🪙</span>`, run.gold < cost, () => {
        if (run.upgrade(t.x, t.y)) { Sound.build(); floaters.push({ x: t.x, y: t.y, text: '강화!', color: '#6ea8ff', life: 1 }); showPop(t); }
      });
    } else {
      mk('', `⬆ 강화<span class="b-cost">최대</span>`, true, () => {});
    }
    const back = Math.round(TD.TOWERS[t.type].cost * 0.6 * (t.fused ? 4 * (t.flv || 1) : t.lv));
    mk('sell', `🗑 판매<span class="b-cost">+${back}🪙</span>`, false, () => {
      run.sell(t.x, t.y); Sound.build(); sel = null; hidePop();
    });

    // 위치: 타워 아래(또는 위) — 화면 밖으로 나가지 않게
    const wrap = $('boardWrap');
    pop.classList.remove('hidden');
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = t.x * CELL + CELL / 2 - pw / 2;
    left = Math.max(4, Math.min(W - pw - 4, left));
    let top = (t.y + 1) * CELL + 6;
    if (top + ph > H) top = t.y * CELL - ph - 6;
    top = Math.max(4, top);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    wrap.appendChild(pop);
  }

  // ── 입력 ────────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', (e) => {
    if (!run || run.phase === 'over') return;
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left) / rect.width * TD.COLS);
    const gy = Math.floor((e.clientY - rect.top) / rect.height * TD.ROWS);
    if (gx < 0 || gy < 0 || gx >= TD.COLS || gy >= TD.ROWS) return;
    const existing = run.towerAt(gx, gy);
    if (existing) { sel = { x: gx, y: gy }; armed = null; showPop(existing); renderPalette(); return; }
    hidePop(); sel = null;
    if (!armed) { if (!TD.onPath(gx, gy)) toast('아래에서 타워를 먼저 고르세요'); return; }
    if (TD.onPath(gx, gy)) { armed = null; renderPalette(); toast('선택 해제 — 길 위에는 지을 수 없습니다'); return; }
    const cost = run.buildCost(armed);
    if (run.gold < cost) { toast(`금이 부족합니다 (${cost}🪙 필요)`); return; }
    if (run.build(armed, gx, gy)) {
      Sound.build();
      floaters.push({ x: gx, y: gy, text: `-${cost}`, color: '#ff9aa5', life: 0.9 });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!run) return;
    const k = e.key;
    if (!$('draftModal').classList.contains('hidden')) {
      const idx = parseInt(k, 10) - 1;
      const cards = run.pendingDraft || [];
      if (idx >= 0 && idx < cards.length) { e.preventDefault(); takeDraft(cards[idx].id); }
      if (k === '0') { e.preventDefault(); $('draftSkip').click(); }
      return;
    }
    const ids = Object.keys(TD.TOWERS);
    const n = parseInt(k, 10);
    if (n >= 1 && n <= ids.length) { e.preventDefault(); armTower(ids[n - 1]); return; }
    if (k === ' ') { e.preventDefault(); $('waveBtn').click(); }
    else if (k === 'p' || k === 'P') togglePause();
    else if (k === 's' || k === 'S') cycleSpeed();
    else if (k === 'm' || k === 'M') $('muteBtn').click();
    else if (k === 'Escape') { armed = null; sel = null; hidePop(); renderPalette(); }
  });

  $('waveBtn').addEventListener('click', () => {
    if (!run || run.phase !== 'build' || run.pendingDraft) return;
    const spec = run.startWave();
    if (!spec) return;
    Sound.wave();
    if (run.earlyBonus > 0) banner(`⚔ ${spec.n}웨이브`, `조기 출격 +${run.earlyBonus}🪙`, '#ffd166');
    else banner(`⚔ ${spec.n}웨이브`, spec.label, '#8fb6ff');
    if (spec.n % 5 === 0) { Sound.boss(); shakeT = 0.4; }
    hidePop(); sel = null;
  });

  function cycleSpeed() { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('speedBtn').textContent = speed + '×'; }
  function togglePause() {
    paused = !paused;
    $('pauseBtn').textContent = paused ? '▶' : '⏸';
    if (paused) toast('일시정지 — P 로 재개');
  }
  $('speedBtn').addEventListener('click', cycleSpeed);
  $('pauseBtn').addEventListener('click', togglePause);
  $('muteBtn').addEventListener('click', () => { $('muteBtn').textContent = Sound.toggle() ? '🔇' : '🔊'; });

  // ── 메타 상점 ───────────────────────────────────────────────────
  function renderMeta() {
    $('coresDisp').textContent = `🔮 ${meta.cores}`;
    const list = $('metaList'); list.innerHTML = '';
    for (const u of TD.META_UPGRADES) {
      const lv = meta.upgrades[u.id] || 0;
      const cost = TD.metaCost(u.id, meta);
      const maxed = !isFinite(cost);
      const row = document.createElement('button');
      row.className = 'meta-row' + (maxed ? ' maxed' : '');
      row.disabled = maxed || meta.cores < cost;
      const pips = Array.from({ length: u.max }, (_, i) => `<span class="m-pip${i < lv ? ' on' : ''}"></span>`).join('');
      row.innerHTML = `<span class="m-ico">${u.icon}</span>
        <span><span class="m-name">${u.name}<span class="m-pips">${pips}</span></span><br>
        <span class="m-desc">${u.desc(Math.min(lv, u.max - 1))}</span></span>
        <span class="m-cost">${maxed ? 'MAX' : '🔮' + cost}</span>`;
      row.addEventListener('click', () => {
        const r = TD.buyMeta(meta, u.id);
        if (r.ok) { meta = r.meta; saveMeta(); Sound.pick(); renderMeta(); }
      });
      list.appendChild(row);
    }
  }
  $('metaBtn').addEventListener('click', () => { renderMeta(); $('metaModal').classList.remove('hidden'); });
  $('metaClose').addEventListener('click', () => $('metaModal').classList.add('hidden'));

  // ── 시작 / 종료 ─────────────────────────────────────────────────
  function start() {
    run = new TD.Run(undefined, meta);
    armed = 'archer'; sel = null; paused = false;
    floaters = []; beams = []; booms = []; sparks = []; flashHits.clear();
    $('pauseBtn').textContent = '⏸';
    $('overlay').classList.remove('visible');
    $('runStats').classList.add('hidden');
    hidePop(); resize(); renderHUD();
    banner('🛡 방어 시작', '준비 시간이 흐릅니다', '#8fb6ff');
  }
  function gameOver() {
    const earned = TD.coresEarned(run.wave, run.score, meta);
    meta.cores += earned;
    const isBest = run.wave > meta.best;
    if (isBest) meta.best = run.wave;
    saveMeta();
    Sound.over();
    $('ovIcon').textContent = isBest ? '🏆' : '💥';
    $('ovTitle').textContent = `${run.wave}웨이브에서 함락`;
    $('ovMsg').innerHTML = isBest
      ? '<p>🏆 <b>최고 기록 경신!</b></p>'
      : `<p>${run.wave >= 20 ? '대단한 방어전이었습니다.' : '융합(같은 타워 Lv3 두 개를 붙이기)이 후반의 답입니다.'}</p>`;
    $('runStats').classList.remove('hidden');
    $('runStats').innerHTML = [
      ['처치', run.kills], ['최고 연쇄', run.bestStreak], ['점수', run.score],
      ['타워', run.towers.length], ['융합', run.towers.filter((t) => t.fused).length], ['획득', '🔮' + earned],
    ].map(([k, v]) => `<div class="rs-cell"><span>${k}</span><b>${v}</b></div>`).join('');
    $('bestLine').textContent = `🏆 최고 기록: ${meta.best}웨이브 · 보유 🔮 ${meta.cores}`;
    $('startBtn').textContent = '🔄 다시 방어';
    $('overlay').classList.add('visible');
    if (window.AdMobHelper) AdMobHelper.showAfterGame();
    else if (window.AdMob) AdMob.showInterstitial();
  }
  $('startBtn').addEventListener('click', start);
  $('bestLine').textContent = meta.best ? `🏆 최고 기록: ${meta.best}웨이브 · 보유 🔮 ${meta.cores}` : '';

  // 자동화 테스트 훅 — ?debug=1 일 때만
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__td = {
      run: () => run,
      state: () => run ? {
        phase: run.phase, wave: run.wave, lives: run.lives, gold: Math.floor(run.gold),
        towers: run.towers.length, draft: !!run.pendingDraft, buildLeft: run.buildLeft,
        streak: run.streak, threat: run.threat(),
      } : null,
      arm: armTower, setSpeed: (v) => { speed = v; $('speedBtn').textContent = v + '×'; },
      tapCell(gx, gy) {
        const r = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + (gx + 0.5) * r.width / TD.COLS,
          clientY: r.top + (gy + 0.5) * r.height / TD.ROWS, bubbles: true,
        }));
      },
    };
  }

  resize();
  requestAnimationFrame(loop);
})();
