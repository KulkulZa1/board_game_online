// ai-chess.js — 체스 AI: 3수 알파베타 + 잡기 수읽기(quiescence) + 간단한 위치 점수
// 일부러 약하게(브라우저에서 바로 두도록) 두되, 바보 같은 수는 두지 않게 한다:
//   · 마지막 수읽기 칸에서 '잡고 끝'을 믿지 않는다 — 잡기가 끝날 때까지 본다 (예전엔 되잡힘을 못 봤다)
//   · 빠른 메이트를 느린 메이트보다 좋게 본다 (예전엔 메이트 점수가 같아 이긴 판을 빙빙 돌 수 있었다)
//   · 기물 가치만 보던 평가에 중앙·전개·폰 전진·킹 안전을 조금 더한다
// 속도: 수읽기는 chess.js 가 아니라 아래의 작은 0x88 수 생성기로 한다. chess.js 0.12 는 수를 만들 때마다
// 모든 수의 기보(SAN)를 계산하느라 합법 수를 다시 만들어서(수 생성이 제곱 비용), 예전 AI 는 중반 한 수에
// 1.5~3.7초 — 메인 스레드라 그동안 화면이 멈췄다. chess.js 는 루트에서 고른 수를 돌려줄 때만 쓴다.
// 수 생성 규칙은 prototypes/ai-engines-test.js 가 chess.js 와 perft(수 개수)로 대조한다.
window.AIChess = (function () {
  const DEPTH = 3, QDEPTH = 6, MATE = 100000;
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const N_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  const B_OFF = [-17, -15, 15, 17], R_OFF = [-16, -1, 1, 16], K_OFF = B_OFF.concat(R_OFF);
  const CASTLE_MASK = {};   // 이 칸에서 움직이거나 잡히면 잃는 캐슬링 권리
  CASTLE_MASK[0x74] = 3; CASTLE_MASK[0x77] = 1; CASTLE_MASK[0x70] = 2;   // e1, h1, a1 (1=K 2=Q)
  CASTLE_MASK[0x04] = 12; CASTLE_MASK[0x07] = 4; CASTLE_MASK[0x00] = 8;  // e8, h8, a8 (4=k 8=q)

  // 자기 진영 기준(f: 0~7, r: 0=자기 뒷줄) 위치 점수
  function pst(type, f, r) {
    const centr = 3.5 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));   // 0(가장자리)~3(중앙)
    switch (type) {
      case 'p': return r * 6 + ((f === 3 || f === 4) && (r === 3 || r === 4) ? 12 : 0);
      case 'n': return centr * 9 - (r === 0 ? 8 : 0);
      case 'b': return centr * 4 - (r === 0 ? 6 : 0);
      case 'r': return r === 6 ? 12 : 0;
      case 'q': return centr * 2;
      case 'k': return r === 0 ? (f <= 2 || f >= 6 ? 12 : 0) : -r * 12;
      default:  return 0;
    }
  }
  // 0x88 칸(행 0 = 8랭크)의 위치 점수
  const pstSq = (type, white, sq) => pst(type, sq & 7, white ? 7 - (sq >> 4) : sq >> 4);
  const isWhite = (p) => p === p.toUpperCase();
  const lower = (p) => p.toLowerCase();

  // ── 포지션 ──────────────────────────────────────────────────────
  function fromFen(fen) {
    const [placement, side, castling, ep] = fen.split(' ');
    const board = new Array(128).fill(null);
    placement.split('/').forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += +ch;
        else { board[r * 16 + f] = ch; f++; }
      }
    });
    let c = 0;
    if (castling.includes('K')) c |= 1; if (castling.includes('Q')) c |= 2;
    if (castling.includes('k')) c |= 4; if (castling.includes('q')) c |= 8;
    const epSq = ep && ep !== '-' ? (8 - +ep[1]) * 16 + (ep.charCodeAt(0) - 97) : -1;
    return { board, white: side === 'w', castle: c, ep: epSq };
  }

  function attacked(pos, sq, byWhite) {
    const b = pos.board;
    // 폰
    const pr = byWhite ? 16 : -16;   // 백 폰은 아래(행+1)에서 위로 공격한다
    for (const d of [pr - 1, pr + 1]) {
      const s = sq + d;
      if (!(s & 0x88) && b[s] === (byWhite ? 'P' : 'p')) return true;
    }
    for (const d of N_OFF) { const s = sq + d; if (!(s & 0x88) && b[s] === (byWhite ? 'N' : 'n')) return true; }
    for (const d of K_OFF) { const s = sq + d; if (!(s & 0x88) && b[s] === (byWhite ? 'K' : 'k')) return true; }
    for (const [offs, a, q] of [[B_OFF, 'b', 'q'], [R_OFF, 'r', 'q']]) {
      for (const d of offs) {
        let s = sq + d;
        while (!(s & 0x88)) {
          const p = b[s];
          if (p) { if (isWhite(p) === byWhite && (lower(p) === a || lower(p) === q)) return true; break; }
          s += d;
        }
      }
    }
    return false;
  }

  function kingSq(pos, white) {
    const k = white ? 'K' : 'k';
    for (let s = 0; s < 128; s++) if (!(s & 0x88) && pos.board[s] === k) return s;
    return -1;
  }

  // 유사 합법 수 (자기 킹이 공격당하는지는 make 후 거른다)
  function pseudo(pos, capturesOnly) {
    const b = pos.board, w = pos.white, out = [];
    const add = (from, to, piece, captured, promo, flag) => out.push({ from, to, piece, captured, promo, flag });
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s]; if (!p || isWhite(p) !== w) continue;
      const t = lower(p);
      if (t === 'p') {
        const dir = w ? -16 : 16, startRow = w ? 6 : 1, lastRow = w ? 0 : 7;
        const one = s + dir;
        if (!capturesOnly || (one >> 4) === lastRow) {
          if (!(one & 0x88) && !b[one]) {
            if ((one >> 4) === lastRow) { for (const pr of ['q', 'r', 'b', 'n']) add(s, one, 'p', null, pr, 0); }
            else {
              add(s, one, 'p', null, null, 0);
              const two = one + dir;
              if (!capturesOnly && (s >> 4) === startRow && !b[two]) add(s, two, 'p', null, null, 'big');
            }
          }
        }
        for (const d of [dir - 1, dir + 1]) {
          const c = s + d; if (c & 0x88) continue;
          if (b[c] && isWhite(b[c]) !== w) {
            if ((c >> 4) === lastRow) { for (const pr of ['q', 'r', 'b', 'n']) add(s, c, 'p', lower(b[c]), pr, 0); }
            else add(s, c, 'p', lower(b[c]), null, 0);
          } else if (c === pos.ep) add(s, c, 'p', 'p', null, 'ep');
        }
        continue;
      }
      const offs = t === 'n' ? N_OFF : t === 'b' ? B_OFF : t === 'r' ? R_OFF : K_OFF;
      const slide = t === 'b' || t === 'r' || t === 'q';
      for (const d of offs) {
        let x = s + d;
        while (!(x & 0x88)) {
          const q = b[x];
          if (q) { if (isWhite(q) !== w) add(s, x, t, lower(q), null, 0); break; }
          if (!capturesOnly) add(s, x, t, null, null, 0);
          if (!slide) break;
          x += d;
        }
      }
      if (t === 'k' && !capturesOnly) {
        const home = w ? 0x74 : 0x04, K = w ? 1 : 4, Q = w ? 2 : 8;
        if (s === home && !attacked(pos, s, !w)) {
          if ((pos.castle & K) && !b[s + 1] && !b[s + 2] && !attacked(pos, s + 1, !w) && !attacked(pos, s + 2, !w)) add(s, s + 2, 'k', null, null, 'k');
          if ((pos.castle & Q) && !b[s - 1] && !b[s - 2] && !b[s - 3] && !attacked(pos, s - 1, !w) && !attacked(pos, s - 2, !w)) add(s, s - 2, 'k', null, null, 'q');
        }
      }
    }
    return out;
  }

  function make(pos, m) {
    const b = pos.board, w = pos.white;
    const undo = { m, castle: pos.castle, ep: pos.ep, moved: b[m.from], took: b[m.to], epSq: -1 };
    b[m.to] = m.promo ? (w ? m.promo.toUpperCase() : m.promo) : b[m.from];
    b[m.from] = null;
    if (m.flag === 'ep') { undo.epSq = m.to + (w ? 16 : -16); undo.epPiece = b[undo.epSq]; b[undo.epSq] = null; }
    if (m.flag === 'k') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
    if (m.flag === 'q') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
    pos.castle &= ~((CASTLE_MASK[m.from] || 0) | (CASTLE_MASK[m.to] || 0));
    pos.ep = m.flag === 'big' ? m.from + (w ? -16 : 16) : -1;
    pos.white = !w;
    return undo;
  }

  function unmake(pos, u) {
    const b = pos.board, m = u.m;
    pos.white = !pos.white;
    b[m.from] = u.moved; b[m.to] = u.took;
    if (u.epSq >= 0) b[u.epSq] = u.epPiece;
    if (m.flag === 'k') { b[m.from + 3] = b[m.from + 1]; b[m.from + 1] = null; }
    if (m.flag === 'q') { b[m.from - 4] = b[m.from - 1]; b[m.from - 1] = null; }
    pos.castle = u.castle; pos.ep = u.ep;
  }

  // 합법 수 = 두고 나서 내 킹이 공격받지 않는 수
  function legal(pos, capturesOnly) {
    const out = [], w = pos.white;
    for (const m of pseudo(pos, capturesOnly)) {
      const u = make(pos, m);
      if (!attacked(pos, kingSq(pos, w), !w)) out.push(m);
      unmake(pos, u);
    }
    return out;
  }

  // ── 평가·탐색 ───────────────────────────────────────────────────
  function evaluateFull(pos) {   // 둘 차례 기준
    let s = 0;
    for (let q = 0; q < 128; q++) {
      if (q & 0x88) { q += 7; continue; }
      const p = pos.board[q]; if (!p) continue;
      const v = VAL[lower(p)] + pstSq(lower(p), isWhite(p), q);
      s += isWhite(p) === pos.white ? v : -v;
    }
    return s;
  }

  function gain(pos, m) {   // make 전에 호출 — 두는 쪽 기준 점수 변화
    const w = pos.white;
    let g = 0;
    if (m.captured) {
      const capSq = m.flag === 'ep' ? m.to + (w ? 16 : -16) : m.to;
      g += VAL[m.captured] + pstSq(m.captured, !w, capSq);
    }
    if (m.promo) g += VAL[m.promo] - VAL.p + pstSq(m.promo, w, m.to) - pstSq('p', w, m.from);
    else g += pstSq(m.piece, w, m.to) - pstSq(m.piece, w, m.from);
    return g;
  }

  function order(moves) {   // 비싼 것을 싼 것으로 잡는 수 → 승격 → 나머지
    return moves.map((m) => ({ m, k: (m.captured ? 10000 + 10 * VAL[m.captured] - VAL[m.piece] : 0) + (m.promo ? 9000 + VAL[m.promo] : 0) }))
      .sort((a, b) => b.k - a.k).map((x) => x.m);
  }

  // 네가맥스 — score 는 '둘 차례인 쪽' 기준
  function search(pos, depth, alpha, beta, score, ply) {
    const quiet = depth <= 0;
    if (quiet) {
      if (score >= beta) return score;              // 가만히 있어도 충분 (stand pat)
      if (score > alpha) alpha = score;
      if (depth <= -QDEPTH) return score;
      const caps = legal(pos, true);
      let best = score;
      for (const m of order(caps)) {
        const g = gain(pos, m); const u = make(pos, m);
        const v = -search(pos, depth - 1, -beta, -alpha, -(score + g), ply + 1);
        unmake(pos, u);
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      return best;
    }
    const moves = legal(pos, false);
    if (!moves.length) return attacked(pos, kingSq(pos, pos.white), !pos.white) ? -(MATE - ply) : 0;   // 빠른 메이트일수록 큰 점수
    let best = -Infinity;
    for (const m of order(moves)) {
      const g = gain(pos, m); const u = make(pos, m);
      const v = -search(pos, depth - 1, -beta, -alpha, -(score + g), ply + 1);
      unmake(pos, u);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  const sqName = (s) => String.fromCharCode(97 + (s & 7)) + (8 - (s >> 4));

  function getBestMove(chess, aiColor) {
    const pos = fromFen(chess.fen());
    const moves = legal(pos, false);
    if (!moves.length) return null;
    const base = evaluateFull(pos);
    let best = [], bestScore = -Infinity;
    for (const m of order(moves)) {
      const g = gain(pos, m); const u = make(pos, m);
      const v = -search(pos, DEPTH - 1, -Infinity, -bestScore + 1, -(base + g), 1);
      unmake(pos, u);
      if (v > bestScore) { bestScore = v; best = [m]; }
      else if (v === bestScore) best.push(m);   // 같은 점수면 무작위 — 매 판 같은 수만 두지 않게
    }
    const pick = best[Math.floor(Math.random() * best.length)];
    // 호출자는 chess.js 의 verbose 수 객체를 기대한다 (updateAfterMove·기보 표시)
    const from = sqName(pick.from), to = sqName(pick.to), promo = pick.promo || undefined;
    return chess.moves({ verbose: true }).find((x) => x.from === from && x.to === to && x.promotion === promo) || null;
  }

  // perft — 수 생성 규칙 검증용 (테스트 전용)
  function perft(fen, depth) {
    const pos = fromFen(fen);
    function count(d) {
      if (d === 0) return 1;
      let n = 0;
      for (const m of legal(pos, false)) { const u = make(pos, m); n += count(d - 1); unmake(pos, u); }
      return n;
    }
    return count(depth);
  }

  return { getBestMove, perft };
})();
