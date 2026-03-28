# Changelog

이 프로젝트의 모든 주요 변경사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/) 를 따릅니다.

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

## [v1.1.0] — 예정

### 추가 예정
- PWA 아이콘 3종 (192×192, 512×512, maskable)
- Android Play Store 제출 (TWA)
- `assetlinks.json` SHA-256 핑거프린트 설정

### 버그 수정 예정
- iOS 긴 터치 컨텍스트 메뉴 차단 (`-webkit-touch-callout: none`)
- rateLimits Map 주기적 메모리 정리 (1시간)
