// ai-omok.js — 오목 AI (5칸 창 평가 · 정확히 5목 규칙)
window.AIOmok = (function () {
  const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

  // 한 칸의 가치 = 그 칸을 지나는 모든 '5칸 창'의 합.
  // 연속 개수만 세던 예전 방식은 ① 양끝이 막혔는지 몰랐고(죽은 3 = 열린 3), ② 띈 모양(●●_●●)을
  // 놓쳤고, ③ 6목(장목)도 승리로 쳐서 이길 수 없는 칸에 두거나 막을 필요 없는 칸을 막았다.
  // 창 방식은 세 가지를 모두 해결한다: 상대 돌이 섞인 창은 죽은 창이고, 열린 줄일수록 창이 많다.
  const WIN = 1e8, BLOCK = 1e7;
  const ATK = [0, 1, 12, 150, 3000];   // 내 돌 k개가 되는 창 (4 = 다음 수에 5목 위협) — 자가 대국으로 맞춘 값
  const DEF = [0, 2, 20, 300, 0];      // 상대 돌 k개 창을 끊는 값 — 상대 3 은 내 3 보다 급하다

  function cellScore(board, r, c, me, them, size) {
    const at = (rr, cc) => (rr >= 0 && rr < size && cc >= 0 && cc < size ? board[rr][cc] : undefined);
    let s = 0;
    for (const [dr, dc] of DIRS) {
      for (let start = -4; start <= 0; start++) {
        const r0 = r + start * dr, c0 = c + start * dc, r4 = r0 + 4 * dr, c4 = c0 + 4 * dc;
        if (at(r0, c0) === undefined || at(r4, c4) === undefined) continue;   // 판 밖으로 나가는 창
        let mine = 0, theirs = 0;
        for (let i = 0; i < 5; i++) {
          const v = board[r0 + i * dr][c0 + i * dc];
          if (v === me) mine++; else if (v === them) theirs++;
        }
        // 창 바로 바깥이 같은 색이면 5목이 아니라 장목이다 (정확히 5목만 승리)
        const exact = (color) => at(r0 - dr, c0 - dc) !== color && at(r4 + dr, c4 + dc) !== color;
        if (theirs === 0) {
          const k = mine + 1;
          if (k === 5) { if (exact(me)) s += WIN; }
          else s += ATK[k];
        }
        if (mine === 0 && theirs > 0) {
          if (theirs === 4) { if (exact(them)) s += BLOCK; }
          else s += DEF[theirs];
        }
      }
    }
    // 중앙·주변 돌 가산 (동점 정리용 — 작게)
    const mid = (size - 1) / 2;
    s += 3 - (Math.abs(r - mid) + Math.abs(c - mid)) / size;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && at(r + dr, c + dc)) s += 1;
    return s;
  }

  // 이 칸에 color 를 두면 정확히 5목이 되나
  function makesFive(board, r, c, color, size) {
    for (const [dr, dc] of DIRS) {
      let n = 1, rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === color) { n++; rr += dr; cc += dc; }
      rr = r - dr; cc = c - dc;
      while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === color) { n++; rr -= dr; cc -= dc; }
      if (n === 5) return true;
    }
    return false;
  }

  // 돌 근처(2칸)의 빈 칸 — 후보를 줄여 수읽기를 싸게
  function candidates(board, size) {
    const out = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (board[r][c]) continue;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc]) { near = true; break; }
      }
      if (near) out.push({ row: r, col: c });
    }
    return out;
  }

  // (r,c) 에 color 를 둔 뒤 color 가 5목을 만들 수 있는 칸의 수 — 2 이상이면 막을 수 없는 위협(열린 4·쌍사)
  function winsAfter(board, r, c, color, size) {
    board[r][c] = color;
    let n = 0;
    for (const [dr, dc] of DIRS) {
      for (let k = -5; k <= 5; k++) {
        const rr = r + k * dr, cc = c + k * dc;
        if (k === 0 || rr < 0 || rr >= size || cc < 0 || cc >= size || board[rr][cc]) continue;
        if (makesFive(board, rr, cc, color, size)) n++;
      }
    }
    board[r][c] = null;
    return n;
  }

  function pick(list, board, me, them, size) {
    let best = [], bestScore = -Infinity;
    for (const m of list) {
      const s = cellScore(board, m.row, m.col, me, them, size);
      if (s > bestScore + 1e-9) { bestScore = s; best = [m]; }
      else if (Math.abs(s - bestScore) <= 1e-9) best.push(m);
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  // 우선순위: ① 내 5목 ② 상대 5목 막기 ③ 내 열린 4·쌍사(다음 수 필승) ④ 상대의 그런 수 막기 ⑤ 평가 점수
  // ⚠ 점수만으로 정하던 예전(그리고 첫 개편안)은 상대 열린 3 을 두고 제 3 을 만들다가 열린 4 를 맞았다.
  function getBestMove(board, aiColor, size) {
    const oppColor = aiColor === 'black' ? 'white' : 'black';
    const cand = candidates(board, size);
    if (!cand.length) return { row: Math.floor(size/2), col: Math.floor(size/2) };

    const win = cand.filter((m) => makesFive(board, m.row, m.col, aiColor, size));
    if (win.length) return win[0];
    const block = cand.filter((m) => makesFive(board, m.row, m.col, oppColor, size));
    if (block.length) return pick(block, board, aiColor, oppColor, size);

    const mine = cand.filter((m) => winsAfter(board, m.row, m.col, aiColor, size) >= 2);
    if (mine.length) return pick(mine, board, aiColor, oppColor, size);

    const theirs = cand.filter((m) => winsAfter(board, m.row, m.col, oppColor, size) >= 2);
    if (theirs.length) {
      // 막는 후보: 그 위협 칸들 + 각 위협 줄 위의 칸. 두고 나서 상대의 필승 수가 가장 적은 칸.
      const pool = new Map();
      for (const t of theirs) for (const [dr, dc] of DIRS) for (let k = -4; k <= 4; k++) {
        const rr = t.row + k * dr, cc = t.col + k * dc;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size && !board[rr][cc]) pool.set(rr * size + cc, { row: rr, col: cc });
      }
      let bestLeft = Infinity, bestList = [];
      for (const d of pool.values()) {
        board[d.row][d.col] = aiColor;
        let left = 0;
        for (const t of theirs) if (!board[t.row][t.col] && winsAfter(board, t.row, t.col, oppColor, size) >= 2) left++;
        board[d.row][d.col] = null;
        if (left < bestLeft) { bestLeft = left; bestList = [d]; }
        else if (left === bestLeft) bestList.push(d);
      }
      return pick(bestList, board, aiColor, oppColor, size);
    }
    return pick(cand, board, aiColor, oppColor, size);
  }

  // 정확히 5목만 승리 — 6목 이상(장목)은 불계. 규칙 안내문과 온라인(서버)이 이 규칙인데
  // 혼자하기만 n >= 5 로 장목도 승리 처리해서, 연습한 규칙과 실전 규칙이 달랐다.
  // 런의 '시작점'에서만 길이를 재야 6목 안의 다섯 칸을 5목으로 잘못 세지 않는다.
  function checkWin(board, color, size) {
    for (let r=0; r<size; r++) {
      for (let c=0; c<size; c++) {
        if (board[r][c] !== color) continue;
        for (const [dr,dc] of DIRS) {
          const pr = r-dr, pc = c-dc;
          if (pr>=0&&pr<size&&pc>=0&&pc<size&&board[pr][pc]===color) continue;   // 런의 중간
          let n=1, rr=r+dr, cc=c+dc;
          while (rr>=0&&rr<size&&cc>=0&&cc<size&&board[rr][cc]===color) { n++; rr+=dr; cc+=dc; }
          if (n === 5) return true;
        }
      }
    }
    return false;
  }

  return { getBestMove, checkWin };
})();
