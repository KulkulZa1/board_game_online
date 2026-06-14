# Changelog

## [Unreleased] - Vampire Survivors director-loop readiness

### Added
- Character selection, difficulty selection, local meta progression, permanent upgrades, daily challenge, map unlocks, pause UI, survival win resolution, and rewarded ad hooks for `/arcade/vampire/`.
- Tower Defense hybrid loop for `/arcade/vampire/`: players can place Cannon/Frost/Tesla towers during runs with rechargeable tower charges.
- Achievement coin rewards and end-run evolution reports that show missed evolution plans, lowest HP, and tower placements.
- Sandbox Vampire Survivors evolution mirror: `sandbox/vampire-survivors/` now has config-driven evolved skills, editable evolution recipes, golden evolution level-up cards, passive prerequisites, and a runtime smoke check that verifies `orb + spinach -> blackhole`.
- Native monetization boundary for `/arcade/vampire/`: ad-removal ownership suppresses interstitial ads, restore purchase is exposed, and locked premium characters can be unlocked through the purchase helper when a Capacitor billing plugin is present.
- Production-safe Tower Defense arcade runtime path: `/arcade/tower-defense/` now loads reused TD engine files from `/arcade/tower-defense/runtime/` instead of broken `/sandbox/...` URLs.
- Tower Defense sandbox-to-arcade publish/import flow: the editor validates configs, saves `td_published_config`, exports `td-published-config.json`, and the arcade route prefers published config before draft/default config.
- Tower Defense game-first pass: `/arcade/tower-defense/` now has a direct play button, quick tower build controls, a Meteor active ability, visible enemy lanes, tower firing/aura feedback, paid passive rerolls, mobile tap placement, and a more generous 160g opening economy.
- Vampire Survivors mid-run resume: active runs save locally on start, pause, periodic play, revive, visibility change, and page unload; valid saved runs can be continued from the start overlay.
- Vampire Survivors co-op relay MVP: a host can create a shareable Socket.io co-op room, a guest can join from `?vpsRoom=...`, control an ally in the host simulation, and receive a compact live state mirror.
- Vampire Survivors evolution planning UI: start, pause, and level-up surfaces now show recipe progress so failed or near-ready evolutions are visible during the run.
- Vampire Survivors evolution payoff: successful evolutions now trigger a transient banner, stronger particle burst, screen shake, and a defensive WebAudio chime.
- Vampire Survivors level-up tension: non-evolution cards now use weighted selection and visible reason tags such as `Build starter`, `Power up`, and `Combo passive`.
- Vampire Survivors near-miss feedback: low health now triggers throttled `LOW HP` / `CRITICAL HP` alerts, a pulsing player ring, edge vignette, and a critical HP bar state without stacking warnings every frame.
- Vampire Survivors hack-and-slash layer: level-up choices can now add `Cleave Edge`, `Rupture Mark`, and `Echo Step` slash supports that widen dash slashes, apply bleed/burst pressure, and create delayed after-slashes.
- Smoke-check coverage for Vampire Survivors character/difficulty/meta/pause/revive markers.
- `docs/vampire-survivors-director-loop.md` with verification targets and remaining design work.
- `docs/loop-progression-technical-spec.md` with programmer-facing data structures, simulation variables, update rules, era-loop stability checks, breakthrough rules, and MVP implementation scope for the civilization-scale progression system.
- Bootstrap civilization-loop arcade MVP at `/arcade/bootstrap/`, with data-driven eras/processes, bottleneck diagnostics, stability-gated era unlocks, mobile-friendly DOM UI, and smoke-check coverage.

### Changed
- Vampire Survivors enemy spawn pressure, enemy stats, boss interval, and rewards now scale from the selected difficulty, selected map, and daily modifier.
- Public `/api/status` now keeps detailed room lists and tunnel URLs loopback-only, and Socket.io no longer defaults to wildcard CORS in production.
- Multiplayer chat now shows real shared-shell speech bubbles on current main and gives visible feedback when chat is rate limited.
- `scripts/check.sh` now matches the dev-only sandbox policy by expecting `/sandbox/` to return 404 and checking the production Tower Defense runtime path instead.
- Factory arcade now prevents dead miner placements, highlights valid resource/connection tiles, auto-connects nearby factory outputs while preserving manual rotation, adds delivery milestone feedback, autosaves/restores factory layouts, improves mobile palette/tool layout, and is covered by the deep smoke-check route/policy assertions.

이 프로젝트의 모든 주요 변경사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/) 를 따릅니다.

---

## [Unreleased] — 게임 재미·완성도 강화

### 추가

**뱀파이어 서바이버 (아케이드, `/arcade/vampire/`)**
- 무기 레벨 시스템: 같은 무기를 다시 고르면 최대 5레벨까지 강화 (데미지·투사체 증가)
- 무기 진화 시스템: 최대 레벨 무기 + 필요 패시브 조합 시 진화 무기로 변신
  - 🌀 블랙홀(에너지 구+자석), 🌩 폭풍의 활(화살+쿨다운), ☀ 슈퍼노바(폭발+공격력),
    ☠ 데스레이(레이저+이동속도), 🛡 이지스(방패+체력)
- 레벨업 화면에 황금색 진화 카드 우선 표시, 무기 슬롯에 레벨·진화 상태 표시

**타워 디펜스 (샌드박스, `sandbox/tower-defense/`)**
- 타워 타입 추가: ❄️ 프로스트(광역 둔화), ⚡ 테슬라(즉시 연쇄 번개) — 기존 🏰 캐논과 함께 3종
- 인접 시너지 시스템: 인접한 타워 조합으로 보너스 발동
  - 💥 Shatter(프로스트+캐논), 🌩️ Overload(테슬라+테슬라), ❄️⚡ Cryo-Charge(프로스트+테슬라)
- UI: 타워 타입 선택기 + 실시간 시너지 표시 패널

**기타**
- 실시간 멀티플레이 채팅: 보낸 플레이어 바 위에 임시 말풍선 표시
- 스모크 테스트: 채팅 브로드캐스트 트리밍 + 라이브/히스토리 말풍선 동작 검증 추가

### 수정
- 뱀파이어 서바이버: `fireWeapon`의 잘못된 조기 반환 조건으로 무기가 발사되지 않던 버그 수정

### 변경
- 런치 준비 문서: 현재 프로덕션 동작과 Render 재배포가 필요한 브랜치 전용 동작을 분리
- 로드맵: 신규 프로토타입 게임 추가보다 공유 arcade/sandbox 시스템을 우선

### 문서
- `CODEX_TASKS.md`: 코어/폴리시 분업 핸드오프 문서 (샌드박스 VPS 진화 미러, TD 추가 타워/시너지)

---

## [v1.0.0] — 2026-03-28

### 추가

**게임**
- 체스: chess.js 0.12.0 서버 검증, 폰 승급·캐슬링·앙파상 지원
- 오목: 15×15 렌주 룰 (정확히 5개 연결, 장목 무효)
- 사목: 7×6 중력 낙하, 4개 연결 승리
- 오셀로: 8×8 뒤집기, 유효 수 자동 표시·패스 처리
- 인디언 포커: 상대 카드만 보는 심리전, 배팅·레이즈·폴드
- 체커: 강제 점프 룰, 연속 점프, 킹 승격

**기능**
- 실시간 1대1 대국 (Socket.io WebSocket)
- 색상 선택, 제한 시간 설정 (10분/30분/무제한/직접 설정)
- 재접속 지원 (UUID 토큰, 10분 이내 복귀)
- 재대국 기능 (색상 자동 교체)
- 관전자 모드 (방장 승인 방식)
- 실시간 채팅 + 이모티콘
- 대국 복기 (체스 전용, 키보드 지원)
- 사운드 효과 (Web Audio API)
- 관리자 대시보드 (`/admin.html`)
- 개인정보처리방침 페이지 (`/privacy.html`)
- PWA manifest + Service Worker

**인프라**
- Render.com 클라우드 배포 (`https://board-game-online.onrender.com`)
- GitHub 형상 관리 (main/dev 브랜치 전략)
- `render.yaml` 배포 설정
- UptimeRobot 슬립 방지 (14분 핑)

### 보안
- 서버 Rate Limit 추가: `game:resign` (분당 3회), `game:draw:offer` (분당 5회)
- 클라이언트 버튼 보호:
  - 무승부 제안: 5초 딜레이, 3회 초과 시 60초 비활성화
  - 기권: 3초 쿨다운, 이중 전송 방지
  - 인디언 포커 액션: 1.5초 debounce
- 입력 검증: 좌표 범위, gameType 허용 목록, chat 길이 제한
- `.shutdown-key` 파일 권한 `0o600` 적용

### 버그 수정
- chess.js `^0.12.0` → `0.12.0` 버전 고정 (업그레이드 시 API 불일치 방지)
- 인디언 포커 양측 칩 동시 부족 시 오판정 수정
- 체커 재접속 시 이동 불가 버그 수정 (`validMoves` 포함 전송)
- 게임 선택 취소 시 UI 상태 미초기화 수정
- 모바일 터치 타겟 크기 미달 수정 (`min-height: 44px`)
- 오목 360px 기기 가로 오버플로 수정
- 태블릿(481~768px) 게임 카드 그리드 2컬럼 전환

---

## [v1.4.0] — 2026-05-01 (진행 중)

### 추가

**게임**
- 사과게임: 17×10 격자, 합이 10이 되는 사각형 선택·제거, 턴제 멀티플레이 + 솔로 AI
- 배틀십: 10×10 격자 해전, 함선 배치 후 교대 공격, 솔로 AI (hunt-and-target 전략)
- 백가몬: 24포인트 보드, 주사위 2개, 바(BAR)·탈출(borne-off)·더블 완전 구현, 멀티플레이 + 솔로 AI (휴리스틱)
- 텍사스 홀덤: 헤즈업 포커, 블라인드(10/20), 4라운드 베팅, 7카드 핸드 평가(C(7,5)=21조합), 멀티플레이 + 솔로 AI
- 도트앤박스: 5×5 격자, SVG 렌더링, 박스 완성 시 보너스 턴, 멀티플레이 + 솔로 AI (체인 전략)
- 만칼라: 14구멍(pit 0-5 백, 6 백창고, 7-12 흑, 13 흑창고), 반시계 배분, 보너스 턴·캡처 룰, 멀티플레이 + 솔로 AI

**모바일 (Phase C)**
- `capacitor.config.json`: Capacitor 앱 설정, WebView가 Render.com 서버 로드, AdMob 플러그인 연결
- `public/js/admob.js`: 네이티브 앱에서만 동작하는 전면 광고 래퍼 (`Capacitor.Plugins.AdMob`), 웹에서는 무시
- 솔로 모드 게임 종료 후 전면 광고 표시 (`game.js` 연동)
- `BUILDING_ANDROID.md`: Capacitor 초기화 → AdMob 설정 → 서명 AAB 빌드 → Play Store 제출 전 과정 가이드

**아키텍처 개선**
- `server.js` 단일 파일(2,038줄) → `server/` 모듈 폴더로 분리
  - `server/handlers/index.js`: 게임 핸들러 레지스트리 (새 게임 추가 시 1줄 등록)
  - `createRoomState` / `resetForRematch`: 핸들러 플러그인 패턴으로 리팩터링
  - `server/events.js` `game:move` 디스패처: 단일 레지스트리 조회로 단순화
- `game-registry.js`: 게임별 메타데이터(이름·규칙·아이콘·제목) 중앙 집중화
  - `game.js`, `lobby.js`에서 중복 데이터 ~120줄 제거
- `css/games/`: 게임별 CSS 파일 분리 (`game.css` 공유 스타일만 유지)

**문서**
- `ADDING_A_GAME.md`: AI 에이전트·개발자를 위한 10단계 게임 추가 가이드
- `CLAUDE.md` 업데이트: 새 아키텍처 반영

---

## [v1.2.0] — 2026-03-29

### 추가

**혼자하기 (vs AI)**
- 6게임 모두 AI 대국 지원 (체스·오목·사목·오셀로·체커·인디언 포커)
  - 체스: 미니맥스 depth-3 + alpha-beta pruning
  - 오목: 휴리스틱 패턴 매칭 (5목·열린4·막힌4·3 등 가중 점수)
  - 사목: 미니맥스 depth-6 + alpha-beta pruning
  - 오셀로: 미니맥스 depth-4 (구석·안정석 가중치)
  - 체커: 미니맥스 depth-4 + 강제 점프 처리
  - 인디언 포커: 카드 비교 기반 휴리스틱
- 솔로 대국 결과도 개인 전적에 자동 저장

**보드 크기 선택** (오목·사목 — 멀티/솔로 모두)
- 오목: 13×13 / 15×15(기본) / 17×17 / 19×19
- 사목: 5×4 / 6×7(기본) / 7×8 / 8×9

**인디언 포커 룰 개편**
- 카드 범위 A~10 (1~10, 기존 1~13에서 변경)
- A(1) 특수 규칙: 10을 상대로만 이김, 나머지(2~9)에는 최하위
- 10을 가지고 폴드하면 앤티(5칩)만큼 추가 칩 손실 — 페널티 토스트 알림
- 덱 수 선택: 1덱(10장) / 2덱(20장, 기본) / 3덱(30장)
- 승리 조건 선택: ①상대 칩 전부 획득 ②덱 소진 후 칩 많은 쪽 승리
- 멀티플레이 방 생성 시도 동일 옵션 선택 가능

**수기록 패널**
- 체커·오셀로 좌표 표기 오류 수정 (행/열 레이블 정상화)
- 사목 멀티·솔로 수 표기 통일 (열 문자 A–G)
- 체스 무르기 시 수기록 2-span 행 정리 버그 수정

**코드 구조 개선**
- `game.js` 게임별 파일 분리: `game-chess.js`, `game-omok.js`, `game-connect4.js`, `game-othello.js`, `game-checkers.js`, `game-indianpoker.js`

### 보안
- `room:join` rate limit 추가 (1분 10회)
- `room:reconnect` rate limit 추가 (1분 5회)
- 오목·사목·오셀로·체커 좌표 `Number.isInteger()` 검증 강화

---

## [v1.1.0] — 2026-03-28

### 추가
- 게임 규칙 설명 버튼: 로비 게임 카드 + 게임 중 언제든 규칙 확인 (모달)
- 멀티 플랫폼 링크 공유: LINE, Telegram, Web Share API (모바일)
- 개인 전적 기록: localStorage 기반 게임별 승/패/무 통계 모달
- 게스트 프로필: 닉네임 변경, UUID 기반 30일 비활동 시 초기화

### 버그 수정
- iOS 긴 터치 컨텍스트 메뉴 차단 (`-webkit-touch-callout: none`)
- rateLimits Map 1시간 주기 자동 정리 (메모리 누수 방지)

---

## [v1.0.0] — 2026-03-28
