// ai-checkers.js — 체커 규칙 + 미니맥스 AI
// 규칙은 서버(server/handlers/checkers.js)와 한 글자까지 같아야 한다 — 혼자하기에서 익힌 규칙이 실전 규칙이다:
//   · 잡을 수 있으면 반드시 잡는다 (강제 점프)
//   · 점프한 말이 또 잡을 수 있으면 같은 말로 계속 잡는다 (연속 점프)
//   · 킹으로 승격하면 그 턴은 끝난다
//   · 일반 말은 앞으로만, 킹은 네 대각선으로 한 칸 (점프도 한 칸 건너뛰기)
// 좌표는 보드 렌더러·서버와 같은 { row, col } 이다. (예전 { r, c } 는 렌더러와 맞지 않아
// 혼자하기에서 말을 골라도 갈 곳이 하나도 표시되지 않았다 — 한 수도 둘 수 없었다)
window.AICheckers = (function () {
  const SEARCH_DEPTH = 4;   // 턴 단위(연속 점프는 한 턴) — 브라우저에서 수십 ms

  const opp = (c) => (c === 'white' ? 'black' : 'white');
  const dirsOf = (p) => p.king ? [[-1,-1],[-1,1],[1,-1],[1,1]]
                    : p.color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  function jumpsFor(board, row, col) {
    const p = board[row][col]; const out = [];
    for (const [dr, dc] of dirsOf(p)) {
      const mr = row + dr, mc = col + dc, er = row + 2 * dr, ec = col + 2 * dc;
      if (!inB(er, ec)) continue;
      const mid = board[mr][mc];
      if (mid && mid.color === opp(p.color) && !board[er][ec]) {
        out.push({ from: { row, col }, to: { row: er, col: ec }, isJump: true, captured: { row: mr, col: mc } });
      }
    }
    return out;
  }

  function stepsFor(board, row, col) {
    const p = board[row][col]; const out = [];
    for (const [dr, dc] of dirsOf(p)) {
      const tr = row + dr, tc = col + dc;
      if (inB(tr, tc) && !board[tr][tc]) out.push({ from: { row, col }, to: { row: tr, col: tc }, isJump: false });
    }
    return out;
  }

  // 지금 둘 수 있는 한 걸음들. from 을 주면 연속 점프 중인 그 말의 점프만.
  function getValidMoves(board, color, from) {
    if (from) return { moves: jumpsFor(board, from.row, from.col), mustJump: true };
    const jumps = [], steps = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      jumps.push(...jumpsFor(board, r, c));
      steps.push(...stepsFor(board, r, c));
    }
    return jumps.length ? { moves: jumps, mustJump: true } : { moves: steps, mustJump: false };
  }

  // 한 걸음 적용 → { board, promoted, continueFrom } (continueFrom: 계속 잡아야 하는 말 위치 또는 null)
  function applyStep(board, m) {
    const b = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    const piece = b[m.from.row][m.from.col];
    b[m.to.row][m.to.col] = piece;
    b[m.from.row][m.from.col] = null;
    if (m.isJump) b[(m.from.row + m.to.row) / 2][(m.from.col + m.to.col) / 2] = null;
    let promoted = false;
    if (!piece.king && ((piece.color === 'white' && m.to.row === 0) || (piece.color === 'black' && m.to.row === 7))) {
      piece.king = true; promoted = true;
    }
    const continueFrom = m.isJump && !promoted && jumpsFor(b, m.to.row, m.to.col).length
      ? { row: m.to.row, col: m.to.col } : null;
    return { board: b, promoted, continueFrom };
  }

  // 한 턴 전체(연속 점프 포함)를 걸음 배열로 펼친다
  function allTurns(board, color) {
    const out = [];
    function extend(b, path, from) {
      const { moves } = getValidMoves(b, color, from);
      for (const m of moves) {
        const r = applyStep(b, m);
        if (r.continueFrom) extend(r.board, path.concat([m]), r.continueFrom);
        else out.push({ steps: path.concat([m]), board: r.board });
      }
    }
    extend(board, [], null);
    return out;
  }

  function evaluate(board, color) {
    let s = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c]; if (!p) continue;
      let v = p.king ? 175 : 100;
      if (!p.king) v += (p.color === 'white' ? 7 - r : r) * 3;           // 전진할수록(승격에 가까울수록)
      if (c === 0 || c === 7) v += 4;                                      // 가장자리는 잡히지 않는다
      if ((p.color === 'white' && r === 7) || (p.color === 'black' && r === 0)) v += 6;   // 뒷줄 수비
      s += p.color === color ? v : -v;
    }
    return s;
  }

  function search(board, toMove, me, depth, alpha, beta) {
    const turns = allTurns(board, toMove);
    if (!turns.length) return toMove === me ? -100000 - depth : 100000 + depth;   // 둘 곳 없음 = 패배 (빨리 이길수록 좋게)
    if (depth === 0) return evaluate(board, me);
    if (toMove === me) {
      let best = -Infinity;
      for (const t of turns) {
        best = Math.max(best, search(t.board, opp(toMove), me, depth - 1, alpha, beta));
        alpha = Math.max(alpha, best); if (beta <= alpha) break;
      }
      return best;
    }
    let best = Infinity;
    for (const t of turns) {
      best = Math.min(best, search(t.board, opp(toMove), me, depth - 1, alpha, beta));
      beta = Math.min(beta, best); if (beta <= alpha) break;
    }
    return best;
  }

  // AI 의 한 턴 — 걸음 배열(연속 점프면 여러 개)을 돌려준다. 둘 곳이 없으면 null.
  function getBestTurn(board, aiColor, depth) {
    const turns = allTurns(board, aiColor);
    if (!turns.length) return null;
    const d = depth == null ? SEARCH_DEPTH : depth;
    let best = [], bestScore = -Infinity;
    for (const t of turns) {
      const s = search(t.board, opp(aiColor), aiColor, d - 1, -Infinity, Infinity);
      if (s > bestScore) { bestScore = s; best = [t]; }
      else if (s === bestScore) best.push(t);
    }
    return best[Math.floor(Math.random() * best.length)].steps;   // 동점이면 무작위 — 매 판 같은 수만 두지 않게
  }

  return { getValidMoves, applyStep, allTurns, getBestTurn, evaluate };
})();
