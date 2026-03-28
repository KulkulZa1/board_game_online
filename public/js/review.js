// review.js — Post-game move review
window.Review = (function () {
  let moves = [];
  let currentIndex = -1; // -1 = start position
  let initialized = false;

  const reviewBar = document.getElementById('review-bar');
  const moveListEl = document.getElementById('move-list');
  const counterEl = document.getElementById('review-counter');

  // Register navigation handlers once (onclick 덮어쓰기로 중복 방지)
  document.getElementById('review-first').onclick   = () => goto(0);
  document.getElementById('review-prev').onclick    = () => goto(currentIndex - 1);
  document.getElementById('review-next').onclick    = () => goto(currentIndex + 1);
  document.getElementById('review-last').onclick    = () => goto(moves.length - 1);
  document.getElementById('review-newgame-btn').onclick = () => { location.href = '/'; };

  function init(gameMoves) {
    moves = gameMoves;
    currentIndex = moves.length - 1; // start at end position

    reviewBar.style.display = 'flex';
    Board.setReviewMode(true);

    // keydown 리스너는 최초 1회만 등록
    if (!initialized) {
      document.addEventListener('keydown', onKeyDown);
      initialized = true;
    }

    renderMoveList();
    updateCounter();
  }

  function goto(idx) {
    if (idx < -1) idx = -1;
    if (idx >= moves.length) idx = moves.length - 1;
    currentIndex = idx;

    const move = idx >= 0 ? moves[idx] : null;
    const fen = move ? move.fen : new Chess().fen();
    Board.renderForReview(fen, move);

    updateCounter();
    highlightActiveMove();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goto(currentIndex - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goto(currentIndex + 1); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); goto(0); }
    if (e.key === 'ArrowDown')  { e.preventDefault(); goto(moves.length - 1); }
  }

  function renderMoveList() {
    moveListEl.innerHTML = '';

    for (let i = 0; i < moves.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const numEl = document.createElement('span');
      numEl.className = 'move-num';
      numEl.textContent = (i / 2 + 1) + '.';
      row.appendChild(numEl);

      // White move
      const wEl = document.createElement('span');
      wEl.className = 'move-san';
      wEl.textContent = moves[i].san;
      wEl.dataset.idx = i;
      wEl.addEventListener('click', () => goto(parseInt(wEl.dataset.idx)));
      row.appendChild(wEl);

      // Black move
      if (moves[i + 1]) {
        const bEl = document.createElement('span');
        bEl.className = 'move-san';
        bEl.textContent = moves[i + 1].san;
        bEl.dataset.idx = i + 1;
        bEl.addEventListener('click', () => goto(parseInt(bEl.dataset.idx)));
        row.appendChild(bEl);
      } else {
        row.appendChild(document.createElement('span'));
      }

      moveListEl.appendChild(row);
    }

    scrollToActiveMove();
  }

  function highlightActiveMove() {
    document.querySelectorAll('.move-san').forEach(el => {
      el.classList.toggle('active-move', parseInt(el.dataset.idx) === currentIndex);
    });
    scrollToActiveMove();
  }

  function scrollToActiveMove() {
    const active = moveListEl.querySelector('.active-move');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function updateCounter() {
    const pos = currentIndex + 1;
    counterEl.textContent = `${pos} / ${moves.length}`;
  }

  return { init, goto };
})();
