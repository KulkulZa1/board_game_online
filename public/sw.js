// 보드게임 온라인 — Service Worker
// 네트워크 우선 전략: 항상 최신 서버 상태 필요 (Socket.io 실시간)
// 정적 자산만 캐시하고 API/Socket 요청은 네트워크 직접 사용

const CACHE_NAME = 'boardgame-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/game.html',
  '/admin.html',
  '/css/common.css',
  '/css/lobby.css',
  '/css/game.css',
  '/js/lobby.js',
  '/js/game.js',
  '/js/sound.js',
  '/js/timer.js',
  '/js/review.js',
  '/js/chess-board.js',
  '/js/omok-board.js',
  '/js/connect4-board.js',
  '/js/othello-board.js',
  '/js/indianpoker-board.js',
  '/js/checkers-board.js',
  '/manifest.json'
];

// 설치 시 정적 자산 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // 일부 자산 캐시 실패 시에도 SW 설치 계속 진행
        console.warn('[SW] 일부 자산 캐시 실패, 계속 진행');
      });
    })
  );
  self.skipWaiting();
});

// 활성화 시 구버전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  clients.claim();
});

// Fetch: Socket.io / API 는 네트워크, 나머지는 캐시 우선
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Socket.io 폴링 및 API 요청 → 네트워크 직접 (캐시 금지)
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 정적 자산: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // 성공 응답만 캐시에 저장
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
