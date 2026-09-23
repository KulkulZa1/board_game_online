# 첨탑 대란 — Godot 이식

`public/arcade/tower-defense/sim.js`(웹판 규칙 엔진)를 Godot 4 로 옮긴 프로젝트다.
**소스만 커밋한다** — `.godot/`(임포트 캐시)와 `export/`(빌드 결과), `export_presets.cfg`(서명 정보)는
`.gitignore` 로 제외된다. 빌드 결과물은 git 이 아니라 릴리스 아티팩트로 다룬다.

## 여는 법

1. Godot **4.4 이상 Standard**(.NET 아님)를 설치한다.
2. 프로젝트 매니저 → 가져오기 → 이 폴더의 `project.godot`.
3. ▶ 실행 — 세로 720×1280 화면. 칸을 누르면 고른 탑을 짓고, 지은 탑을 누르면 강화(인접한 같은 종류
   Lv3 둘이면 융합), 오른쪽 클릭은 판매.

## 규칙이 웹판과 같은지 확인

```bash
# 저장소 루트에서 — Godot 안에서 실제 GDScript 를 돌려 계약 파일과 대조한다
godot --headless --path godot/tower-defense --script res://tests/contract_test.gd
```

`prototypes/golden/tower-defense.json` 의 **Tier B**(난수열 uint32, 웨이브 구성표, 건설 시간·조기 출격
보너스, 연속 격파 등급, 융합 계수, 마나핵 비용표, 정산, 길)를 전부 비교하고, 하나라도 다르면 종료 코드 1.
계약의 뜻과 함정은 `docs/port-contract.md` 에 있다.

Godot 이 없는 환경(CI 포함)에선 `node prototypes/godot-port-test.js` 가 대신 본다 — `td_rules.gd` 의
데이터 표를 그대로 뽑아 `sim.js` 와 비교하고, `td_rng.gd` 의 난수 식을 64비트 정수 의미로 실행해
계약 난수열과 맞춰 본다. 다만 이건 GDScript 를 **실행**하지는 않는다 — 문법 오류나 실행 중 오류는
위의 Godot 명령으로만 잡힌다.

## 구조

| 파일 | 내용 |
|---|---|
| `scripts/td_rules.gd` | 데이터 표(JSON 호환 문법 — 검사기가 그대로 읽는다)와 순수 함수 |
| `scripts/td_rng.gd` | xorshift32 — JS 의 32비트 시프트를 64비트 int 위에서 마스킹으로 재현 |
| `scripts/td_run.gd` | 한 판(`sim.js` 의 `class Run`) — 메서드 이름은 JS 와 1:1 (snake_case) |
| `scripts/main.gd` + `scenes/main.tscn` | 최소 플레이 화면 — 그리기와 입력만. UI 는 코드로 만든다 |
| `tests/contract_test.gd` | 계약 검사 (위 명령) |

## 이식하며 지킨 것 — 고치기 전에 읽을 것

- **규칙을 바꾸면 `sim.js` 와 `td_run.gd` 를 같이 고친다.** 의도한 변경이면 `node scripts/record-golden-runs.js`
  로 계약을 다시 기록하고, 위 두 검사를 다시 돌린다.
- **안정 정렬.** JS 의 `sort` 는 안정 정렬이고 Godot 의 `sort_custom` 은 아니다. 스폰 순서(보스만 뒤로)와
  사거리 안 적 정렬은 직접 구현한 안정 버전을 쓴다.
- **Dictionary `==` 는 내용 비교다.** 같은 적인지는 `id` 로, 같은 탑인지는 좌표로 가린다.
- **`Math.round` ≠ `round()`.** JS 는 동률을 +∞ 쪽으로, GDScript 는 0 에서 먼 쪽으로 반올림한다 — `js_round()` 를 쓴다.
- **JSON 숫자는 float 로 읽힌다.** 계약 비교에서 정수는 `int()` 로 맞춘다.
- **한글 폰트.** Godot 기본 폰트엔 한글이 없다. 지금은 `SystemFont` 로 OS 폰트(맑은 고딕·Apple SD 고딕·Noto CJK)를
  쓴다. 배포판에서 모양을 고정하려면 Pretendard 나 Noto Sans KR(둘 다 OFL)을 번들하고 `main.gd` 의
  `_korean_font()` 를 `FontFile` 로 바꾼다.

## 아직 옮기지 않은 것

- 마나핵 연구(메타 상점) UI — 규칙(`normalize_meta`·`meta_cost`·`cores_earned`)과 저장 자리는 있다
- 웹판의 연출 전부: 카운트다운 링, 위협 비네트, 보스 체력바, 콤보 게이지, 사운드, 일시정지
- Android 내보내기 — JDK 17, Android SDK, Godot 내보내기 템플릿이 필요하다 (설치는 승인 후)
