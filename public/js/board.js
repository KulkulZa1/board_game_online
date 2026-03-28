// board.js — Chess board rendering & interaction
window.Board = (function () {
  const PIECE_UNICODE = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
  };

  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['8','7','6','5','4','3','2','1'];

  let chess = null;        // chess.js instance (client-side, for legal move hints)
  let orientation = 'white';
  let selectedSquare = null;
  let legalTargets = [];
  let lastMove = null;     // { from, to }
  let isReviewMode = false;
  let isMyTurn = false;
  let myColor = 'white';
  let onMoveCallback = null;
  let isSpectatorMode = false;

  const boardEl = document.getElementById('chessboard');

  function init(options) {
    chess = options.chess;
    orientation = options.orientation || 'white';
    myColor = options.myColor || 'white';
    onMoveCallback = options.onMove;
    isSpectatorMode = options.spectatorMode || false;
    isReviewMode = false;
    render();
    renderLabels();
  }

  function getSquares() {
    // Returns squares in board order based on orientation
    const squares = [];
    const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse();
    const files = orientation === 'white' ? FILES : [...FILES].reverse();
    for (const rank of ranks) {
      for (const file of files) {
        squares.push(file + rank);
      }
    }
    return squares;
  }

  function render(reviewFen) {
    boardEl.innerHTML = '';
    const squares = getSquares();
    const fen = reviewFen || (chess ? chess.fen() : null);

    squares.forEach(sq => {
      const cell = document.createElement('div');
      const fileIdx = FILES.indexOf(sq[0]);
      const rankIdx = parseInt(sq[1]) - 1;
      const isLight = (fileIdx + rankIdx) % 2 === 1;
      cell.className = `cell ${isLight ? 'light' : 'dark'}`;
      cell.dataset.square = sq;

      // Highlights
      if (selectedSquare === sq) cell.classList.add('selected');
      if (lastMove && (lastMove.from === sq || lastMove.to === sq)) cell.classList.add('last-move');
      if (legalTargets.includes(sq)) {
        const piece = getPieceAt(sq, fen);
        cell.classList.add(piece ? 'legal-capture' : 'legal-move');
      }

      // Check highlight
      if (chess && !reviewFen) {
        if (chess.in_check()) {
          const turn = chess.turn();
          const kingPos = findKing(turn);
          if (kingPos === sq) cell.classList.add('in-check');
        }
      }


      // Piece
      if (fen) {
        const piece = getPieceAt(sq, fen);
        if (piece) {
          const span = document.createElement('span');
          const key = piece.color + piece.type.toUpperCase();
          span.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
          span.textContent = PIECE_UNICODE[key] || '?';
          cell.appendChild(span);
        }
      }

      // Events
      cell.addEventListener('click', onCellClick);

      boardEl.appendChild(cell);
    });
  }

  function getPieceAt(sq, fen) {
    if (!fen) return null;
    // Parse FEN to find piece at square
    const fenParts = fen.split(' ');
    const ranks = fenParts[0].split('/');
    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - parseInt(sq[1]);
    let col = 0;
    for (const ch of ranks[rank]) {
      if (isNaN(ch)) {
        if (col === file) {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          return { color, type: ch.toLowerCase() };
        }
        col++;
      } else {
        col += parseInt(ch);
      }
    }
    return null;
  }

  function findKing(colorChar) {
    if (!chess) return null;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === 'k' && p.color === colorChar) {
          return FILES[f] + (8 - r);
        }
      }
    }
    return null;
  }

  // ===== Click-to-move =====
  function onCellClick(e) {
    if (isReviewMode || !isMyTurn || !chess) return;
    const sq = e.currentTarget.dataset.square;

    // 관전자 모드: 현재 턴의 기물만 선택 가능
    const activeColor = isSpectatorMode ? chess.turn() : myColor[0];

    if (selectedSquare) {
      if (legalTargets.includes(sq)) {
        attemptMove(selectedSquare, sq);
      } else {
        const piece = chess.get(sq);
        if (piece && piece.color === activeColor) {
          selectSquare(sq);
        } else {
          clearSelection();
        }
      }
    } else {
      const piece = chess.get(sq);
      if (piece && piece.color === activeColor) {
        selectSquare(sq);
      }
    }
  }

  function selectSquare(sq) {
    selectedSquare = sq;
    legalTargets = chess.moves({ square: sq, verbose: true }).map(m => m.to);
    render();
  }

  function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
    render();
  }

  function attemptMove(from, to) {
    // Check promotion
    const piece = chess.get(from);
    const isPromotion = piece && piece.type === 'p' &&
      ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));

    if (isPromotion) {
      showPromotion(from, to);
    } else {
      commitMove(from, to, null);
    }
  }

  function commitMove(from, to, promotion) {
    clearSelection();
    if (onMoveCallback) onMoveCallback({ from, to, promotion });
  }

  // ===== Promotion =====
  function showPromotion(from, to) {
    const overlay = document.getElementById('promotion-overlay');
    const choices = document.getElementById('promotion-choices');
    choices.innerHTML = '';

    const color = myColor[0];
    const pieces = color === 'w'
      ? [['q','♕'],['r','♖'],['b','♗'],['n','♘']]
      : [['q','♛'],['r','♜'],['b','♝'],['n','♞']];

    pieces.forEach(([type, icon]) => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn ' + (color === 'w' ? 'white-piece' : 'black-piece');
      btn.textContent = icon;
      btn.style.color = color === 'w' ? '#fff' : '#1a1a1a';
      btn.style.textShadow = color === 'w' ? '0 0 3px #000' : '0 0 2px rgba(255,255,255,0.3)';
      btn.addEventListener('click', () => {
        overlay.style.display = 'none';
        commitMove(from, to, type);
      });
      choices.appendChild(btn);
    });

    overlay.style.display = 'flex';
  }

  // ===== External API =====
  function updateAfterMove(fen, moveRecord) {
    if (chess) chess.load(fen);
    lastMove = { from: moveRecord.from, to: moveRecord.to };
    selectedSquare = null;
    legalTargets = [];
    render();
    // Check sound (after render so in-check class is applied)
    if (chess && chess.in_check() && typeof Sound !== 'undefined') {
      Sound.play('check');
    }
  }

  function setMyTurn(val) {
    isMyTurn = val;
  }

  function setReviewMode(val) {
    isReviewMode = val;
  }

  function renderForReview(fen, move) {
    lastMove = move ? { from: move.from, to: move.to } : null;
    selectedSquare = null;
    legalTargets = [];
    render(fen);
  }

  function renderLabels() {
    const leftEl = document.getElementById('rank-labels-left');
    const bottomEl = document.getElementById('file-labels-bottom');

    const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse();
    const files = orientation === 'white' ? FILES : [...FILES].reverse();

    leftEl.innerHTML = ranks.map(r => `<span>${r}</span>`).join('');
    bottomEl.innerHTML = files.map(f => `<span>${f}</span>`).join('');
  }

  let hintSquares = [];
  let hintTimer   = null;

  function showHint(from, to) {
    // 기존 힌트 제거
    clearHint();
    hintSquares = [from, to];
    // 셀에 hint 클래스 추가
    document.querySelectorAll('.cell').forEach(cell => {
      if (cell.dataset.square === from) cell.classList.add('hint-from');
      if (cell.dataset.square === to)   cell.classList.add('hint-to');
    });
    // 3초 후 자동 제거
    hintTimer = setTimeout(clearHint, 3000);
  }

  function clearHint() {
    clearTimeout(hintTimer);
    hintSquares = [];
    document.querySelectorAll('.hint-from, .hint-to').forEach(cell => {
      cell.classList.remove('hint-from', 'hint-to');
    });
  }

  function clearSelection() {
    selectedSquare = null;
    legalTargets   = [];
    render();
  }

  return { init, updateAfterMove, setMyTurn, setReviewMode, renderForReview, showHint, clearHint, clearSelection };
})();
