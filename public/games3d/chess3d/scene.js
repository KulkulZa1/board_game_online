/* 3D Chess scene — uses same server/handlers/chess.js via Socket.io.
 * Renderer only: game logic lives on the server (chess.js 0.12.0).
 * Three.js r163 loaded via importmap (no build step).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Config ───────────────────────────────────────────────────────
const BOARD_SIZE  = 8;
const SQ          = 1;          // world units per square
const BOARD_HALF  = (BOARD_SIZE * SQ) / 2;
const PIECE_SCALE = 0.38;       // fraction of SQ

const WHITE_MAT_COLOR = 0xf0d9b5;
const BLACK_MAT_COLOR = 0xb58863;
const LIGHT_PIECE  = 0xfaf0dc;
const DARK_PIECE   = 0x2c1810;
const HIGHLIGHT    = 0x2ecc71;
const SELECTED     = 0xf7931e;

// ── Three.js setup ───────────────────────────────────────────────
const canvas   = document.getElementById('c3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x1a1f2e);
scene.fog        = new THREE.Fog(0x1a1f2e, 14, 28);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 40);
camera.position.set(0, 7, 7);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;
controls.minDistance    = 4;
controls.maxDistance    = 14;
controls.maxPolarAngle  = Math.PI / 2.1;
controls.target.set(0, 0, 0);

// Resize
function onResize() {
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ── Lights ───────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x8fa8d0, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.set(4, 8, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far  = 20;
dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -6;
dirLight.shadow.camera.right = dirLight.shadow.camera.top   =  6;
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x4060ff, 0.3);
rimLight.position.set(-4, 3, -4);
scene.add(rimLight);

// ── Materials ────────────────────────────────────────────────────
const whiteSqMat  = new THREE.MeshStandardMaterial({ color: WHITE_MAT_COLOR, roughness: 0.3, metalness: 0.05 });
const blackSqMat  = new THREE.MeshStandardMaterial({ color: BLACK_MAT_COLOR, roughness: 0.4, metalness: 0.05 });
const borderMat   = new THREE.MeshStandardMaterial({ color: 0x3d2510, roughness: 0.6 });
const whitePieceMat = new THREE.MeshStandardMaterial({ color: LIGHT_PIECE, roughness: 0.25, metalness: 0.1 });
const darkPieceMat  = new THREE.MeshStandardMaterial({ color: DARK_PIECE,  roughness: 0.3,  metalness: 0.05 });
const highlightMat  = new THREE.MeshStandardMaterial({ color: HIGHLIGHT, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
const selectedMat   = new THREE.MeshStandardMaterial({ color: SELECTED,  roughness: 0.2, transparent: true, opacity: 0.65, depthWrite: false });

// ── Board ────────────────────────────────────────────────────────
const boardGroup = new THREE.Group();
scene.add(boardGroup);

// Border / frame
const frameMesh = new THREE.Mesh(
  new THREE.BoxGeometry(BOARD_SIZE * SQ + 0.8, 0.22, BOARD_SIZE * SQ + 0.8),
  borderMat
);
frameMesh.position.y = -0.12;
frameMesh.receiveShadow = true;
boardGroup.add(frameMesh);

// Squares
const sqGeo = new THREE.BoxGeometry(SQ, 0.15, SQ);
const squares = [];   // squares[row][col] = mesh

for (let row = 0; row < 8; row++) {
  squares[row] = [];
  for (let col = 0; col < 8; col++) {
    const mat  = (row + col) % 2 === 0 ? whiteSqMat : blackSqMat;
    const mesh = new THREE.Mesh(sqGeo, mat.clone());
    mesh.position.set(col * SQ - BOARD_HALF + SQ / 2, 0, row * SQ - BOARD_HALF + SQ / 2);
    mesh.receiveShadow = true;
    mesh.userData = { row, col };
    boardGroup.add(mesh);
    squares[row][col] = mesh;
  }
}

// Highlight plane (reused)
const hlGeo   = new THREE.PlaneGeometry(SQ * 0.88, SQ * 0.88);
const hlMeshes = [];
for (let i = 0; i < 32; i++) {
  const m = new THREE.Mesh(hlGeo, highlightMat.clone());
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.09;
  m.visible     = false;
  boardGroup.add(m);
  hlMeshes.push(m);
}

// ── Piece geometry factory ───────────────────────────────────────
function pawnGeo() {
  const g = new THREE.Group();
  // base
  g.add(cyl(0.3, 0.28, 0.12, 0, 0.06));
  // stem
  g.add(cyl(0.14, 0.12, 0.36, 0, 0.24));
  // head
  g.add(sphere(0.2, 0, 0.52));
  return g;
}
function rookGeo() {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.28, 0.12, 0, 0.06));
  g.add(cyl(0.18, 0.18, 0.44, 0, 0.28));
  g.add(cyl(0.25, 0.22, 0.12, 0, 0.56));
  g.add(cyl(0.22, 0.22, 0.08, 0, 0.70));
  return g;
}
function knightGeo() {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.28, 0.12, 0, 0.06));
  g.add(cyl(0.16, 0.14, 0.36, 0, 0.24));
  // head (tilted box)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xffffff }));
  box.position.set(0.06, 0.58, 0);
  box.rotation.z = 0.25;
  g.add(box);
  return g;
}
function bishopGeo() {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.28, 0.12, 0, 0.06));
  g.add(cyl(0.14, 0.1, 0.5, 0, 0.3));
  g.add(sphere(0.14, 0, 0.6));
  // tip
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff }));
  tip.position.y = 0.76;
  g.add(tip);
  return g;
}
function queenGeo() {
  const g = new THREE.Group();
  g.add(cyl(0.34, 0.3, 0.12, 0, 0.06));
  g.add(cyl(0.14, 0.1, 0.52, 0, 0.3));
  g.add(cyl(0.26, 0.18, 0.14, 0, 0.58));
  // crown spikes
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff }));
    spike.position.set(Math.cos(a) * 0.2, 0.82, Math.sin(a) * 0.2);
    g.add(spike);
  }
  return g;
}
function kingGeo() {
  const g = new THREE.Group();
  g.add(cyl(0.34, 0.3, 0.12, 0, 0.06));
  g.add(cyl(0.15, 0.12, 0.54, 0, 0.3));
  g.add(cyl(0.28, 0.22, 0.14, 0, 0.6));
  // cross
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xffffff }));
  crossH.position.y = 0.88;
  g.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xffffff }));
  crossV.position.y = 0.88;
  g.add(crossV);
  return g;
}

function cyl(rt, rb, h, x, y) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  m.position.set(x, y + h / 2, 0);
  m.castShadow = true;
  return m;
}
function sphere(r, x, y) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  m.position.set(x, y, 0);
  m.castShadow = true;
  return m;
}

const GEO_FACTORY = { p: pawnGeo, r: rookGeo, n: knightGeo, b: bishopGeo, q: queenGeo, k: kingGeo };

// ── Piece management ─────────────────────────────────────────────
const pieceMap = new Map(); // "e2" → THREE.Group

function sqToWorld(file, rank) {
  // file: 0–7 (a–h), rank: 0–7 (1–8)
  return new THREE.Vector3(
    file * SQ - BOARD_HALF + SQ / 2,
    0.18,
    (7 - rank) * SQ - BOARD_HALF + SQ / 2
  );
}

function spawnPiece(type, color, file, rank) {
  const factory = GEO_FACTORY[type.toLowerCase()];
  if (!factory) return;
  const group = factory();
  const mat   = color === 'w' ? whitePieceMat : darkPieceMat;

  // Apply material recursively
  group.traverse(child => {
    if (child.isMesh) {
      child.material = mat.clone();
      child.castShadow = true;
    }
  });

  group.scale.setScalar(PIECE_SCALE);
  const pos = sqToWorld(file, rank);
  group.position.copy(pos);
  if (color === 'b') group.rotation.y = Math.PI;

  scene.add(group);
  const sq = String.fromCharCode(97 + file) + (rank + 1);
  pieceMap.set(sq, group);
  return group;
}

function clearPieces() {
  pieceMap.forEach(g => scene.remove(g));
  pieceMap.clear();
}

// FEN parser — place pieces from FEN board string
function placeFen(fen) {
  clearPieces();
  const rows = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { file += +ch; continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      const rank  = 7 - r;
      spawnPiece(ch.toLowerCase(), color, file, rank);
      file++;
    }
  }
}

// ── Highlight helpers ────────────────────────────────────────────
function clearHighlights() { hlMeshes.forEach(m => { m.visible = false; }); }

function highlightSquares(sqs, isSelected) {
  clearHighlights();
  sqs.forEach((sq, i) => {
    if (i >= hlMeshes.length) return;
    const file = sq.charCodeAt(0) - 97;
    const rank = +sq[1] - 1;
    const pos  = sqToWorld(file, rank);
    hlMeshes[i].position.set(pos.x, 0.09, pos.z);
    hlMeshes[i].material = (i === 0 && isSelected) ? selectedMat.clone() : highlightMat.clone();
    hlMeshes[i].visible  = true;
  });
}

// ── Raycasting (click to select) ─────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();

let selectedSq   = null;
let validMovesSq = [];

function worldToSq(point) {
  const col  = Math.floor((point.x + BOARD_HALF) / SQ);
  const row  = Math.floor((point.z + BOARD_HALF) / SQ);
  const file = col;
  const rank = 7 - row;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return String.fromCharCode(97 + file) + (rank + 1);
}

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const meshes = [];
  boardGroup.children.forEach(c => { if (c.isMesh) meshes.push(c); });
  const hits = raycaster.intersectObjects(meshes);
  if (!hits.length) return;

  const sq = worldToSq(hits[0].point);
  if (!sq) return;

  if (selectedSq && validMovesSq.includes(sq)) {
    // submit move to server
    if (window._chessSocket) {
      window._chessSocket.emit('game:move', { from: selectedSq, to: sq });
    }
    selectedSq   = null;
    validMovesSq = [];
    clearHighlights();
  } else if (pieceMap.has(sq)) {
    selectedSq = sq;
    // request valid moves from server or compute locally
    if (window._chessSocket) {
      window._chessSocket.emit('chess:hint', { square: sq });
    }
    highlightSquares([sq, ...validMovesSq], true);
  } else {
    selectedSq = null;
    clearHighlights();
  }
});

// ── Socket.io integration (same server as v1) ────────────────────
function connectSocket() {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  const token  = sessionStorage.getItem('playerToken');

  const socket = io({ transports: ['websocket'] });
  window._chessSocket = socket;

  socket.on('connect', () => {
    document.getElementById('statusText').textContent = '서버 연결됨';
    if (token) {
      socket.emit('room:reconnect', { token });
    } else if (roomId) {
      socket.emit('room:join', { roomId, nickname: '플레이어' });
    }
  });

  socket.on('game:start', ({ fen, myColor, timers }) => {
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('turnBar').style.display = 'flex';
    placeFen(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    updateTurn('white', myColor);
    if (myColor === 'black') {
      camera.position.set(0, 7, -7);
      camera.lookAt(0, 0, 0);
      controls.update();
    }
  });

  socket.on('game:move:made', ({ fen, turn }) => {
    placeFen(fen);
    clearHighlights();
    selectedSq = null;
    updateTurn(turn, window._myColor);
  });

  socket.on('chess:hint:result', ({ moves }) => {
    validMovesSq = moves || [];
    if (selectedSq) highlightSquares([selectedSq, ...validMovesSq], true);
  });

  socket.on('game:over', ({ winner, reason }) => {
    document.getElementById('statusText').textContent =
      winner ? `${winner === window._myColor ? '승리!' : '패배'} (${reason})` : `무승부 (${reason})`;
  });
}

// ── Init ─────────────────────────────────────────────────────────
function updateTurn(turn, myColor) {
  window._myColor = myColor;
  const isMyTurn  = turn === myColor;
  document.getElementById('turnText').textContent =
    isMyTurn ? '내 차례' : `상대 차례 (${turn === 'white' ? '백' : '흑'})`;
}

// Initial board position (start screen before socket connects)
placeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

// Hide loading after 3D init
setTimeout(() => {
  document.getElementById('loadingScreen').classList.add('hidden');
  connectSocket();
}, 400);

// ── Render loop ──────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
