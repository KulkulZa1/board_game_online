// 보드게임 온라인 — Service Worker v3
// 전략:
//   HTML / 루트        → 네트워크 우선 (캐시 우선 절대 금지)
//   JS / CSS           → stale-while-revalidate (즉시 반환 + 백그라운드 갱신)
//   Socket.io / API    → 네트워크 직접 (캐시 완전 금지)
//   이미지 / 폰트      → 캐시 우선, 없으면 네트워크 후 저장
//
// 캐시 무효화:
//   activate 시 /api/version 호출 → commit 해시가 바뀌면 캐시 전체 삭제

const CACHE_NAME   = 'boardgame-v3';
const COMMIT_KEY   = 'sw_last_commit';

// 사전 캐시 — HTML 제외, 진짜 정적 자산만 (icons/ 미존재 시 phantom 경로 제외)
const PRECACHE_ASSETS = [
  '/css/lobby.css',
  '/css/game.css',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch(() => {
        // 일부 자산 실패해도 SW 설치 계속
      })
    )
  );
  // 구버전 SW를 기다리지 않고 즉시 활성화
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1) 구버전 캐시(CACHE_NAME 이 다른 것) 삭제
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );

      // 2) /api/version 호출로 배포 커밋 확인
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (res.ok) {
          const { commit } = await res.json();
          const stored = await getStoredCommit();
          if (stored && stored !== commit) {
            // 새 배포 감지 → 현재 캐시 전체 삭제
            await caches.delete(CACHE_NAME);
          }
          await setStoredCommit(commit);
        }
      } catch (_) {
        // 오프라인이거나 로컬 개발 환경 — 무시
      }

      // 3) 열린 탭에 즉시 적용
      await clients.claim();
    })()
  );
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 다른 오리진 요청은 SW 개입 안 함 (CDN, Three.js importmap 등)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // ① Socket.io / API → 네트워크 직접, 캐시 완전 금지
  if (path.startsWith('/socket.io') || path.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // ② HTML 파일 / 루트 → 네트워크 우선, 실패 시 캐시 폴백
  if (path === '/' || path.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ③ JS / CSS → stale-while-revalidate
  if (path.endsWith('.js') || path.endsWith('.css')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // ④ 이미지 / 폰트 / manifest → 캐시 우선
  event.respondWith(cacheFirst(request));
});

// ── 전략 구현 ─────────────────────────────────────────────────────

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || fetchPromise;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return Response.error();
  }
}

// ── commit 저장소 (IndexedDB 대신 Cache API 메타 엔트리 사용) ─────

async function getStoredCommit() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res   = await cache.match('/__sw_commit__');
    return res ? res.text() : null;
  } catch (_) { return null; }
}

async function setStoredCommit(commit) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put('/__sw_commit__', new Response(commit));
  } catch (_) {}
}
