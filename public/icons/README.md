# 앱 아이콘 제작 가이드

Play Store 배포 전 아래 3개 PNG 파일을 이 폴더에 넣으세요.

## 필요한 파일

| 파일명 | 크기 | 용도 |
|--------|------|------|
| `icon-192.png` | 192×192px | PWA 홈 화면 아이콘 |
| `icon-512.png` | 512×512px | Play Store 앱 아이콘 |
| `icon-512-maskable.png` | 512×512px | Android 적응형 아이콘 (safe zone 80% 내에 핵심 디자인) |

## 제작 방법 (무료)

1. **PWABuilder Icon Generator** (권장)
   - https://www.pwabuilder.com/imageGenerator
   - 512×512 원본 PNG 업로드 → 자동으로 모든 크기 생성

2. **직접 제작**
   - 배경: `#1a1a2e` (현재 테마 색상)
   - 체스 말 또는 보드게임 아이콘 중앙 배치
   - maskable 버전: 전체 배경 채우기 + 핵심 요소를 중앙 72% 영역에 배치

## Play Store 스크린샷 (별도 준비)

| 파일명 | 크기 | 내용 |
|--------|------|------|
| `screenshot-lobby.png` | 1080×1920px | 로비 게임 선택 화면 |
| `screenshot-game.png` | 1080×1920px | 체스/오목 등 게임 진행 화면 |

스크린샷은 Chrome DevTools → Device Mode (Galaxy S20 Ultra 등) 에서 캡처하세요.
