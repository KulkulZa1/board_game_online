# 이식 계약 (Port Contract)

`sim.js` 를 **엔진 중립 규칙 명세**로 고정하기 위한 장치다.
Godot(GDScript) 등으로 아케이드 게임을 옮길 때, 규칙이 두 벌이 되어 조용히 갈라지는 것을 막는다.

- 대상: `public/arcade/tower-defense/sim.js`, `public/arcade/neon-cascade/sim.js`
- 계약 파일: `prototypes/golden/<game>.json`
- 검증: `node prototypes/golden-run-test.js` (`npm run test:games` 에 포함)
- 재기록: `node scripts/record-golden-runs.js`

---

## 왜 두 층인가

부동소수점 때문이다. JS 의 `Number` 는 IEEE754 double 이지만, GDScript 의 `Vector2` 는 32비트
float 이고 수학 함수의 마지막 자리도 엔진마다 다르다. **실수 연산 결과를 비트 단위로 맞추는 건
불가능하다.** 그래서 "무엇이 같아야 하는가"를 두 층으로 나눈다.

| | Tier A — 결정론 | Tier B — 이식 동등성 |
|---|---|---|
| 무엇 | 이벤트 스트림 전체의 해시 | 정수·이산 식별자만 |
| 비교 대상 | 같은 엔진(JS) 안에서만 | **엔진을 넘어 반드시 일치** |
| 깨지면 | 밸런스를 바꿨거나 sim 이 비결정적이 됨 | **규칙이 달라짐** — 이식한 쪽도 고쳐야 함 |
| 담긴 것 | 라운드 진행 체크포인트 digest, 최종 점수/웨이브 | 난수열(uint32), 웨이브 구성표, 할당량, 카드 id 순서, 비용표 |

포팅한 Godot 쪽에서 해야 할 일은 **Tier B 를 재현하는 것 하나**다.
Tier B 가 전부 맞으면 규칙은 같다. Tier A 는 JS 쪽 회귀 방지용이라 옮길 필요가 없다.

---

## 이식할 때 걸리는 함정

### 1. xorshift 의 시프트 연산자가 두 게임에서 다르다

```js
// tower-defense/sim.js — makeRng
s ^= s << 13; s >>>= 0; s ^= s >> 17;  s ^= s << 5; s >>>= 0;   // 산술 시프트 >>

// neon-cascade/sim.js — random
value ^= value << 13; value ^= value >>> 17; value ^= value << 5; // 논리 시프트 >>>
```

무심코 하나로 통일하면 **규칙은 그대로인데 나오는 값이 전부 달라진다.**
`>>` 는 부호를 끌고 내려오고 `>>>` 는 0 을 채운다. JS 는 시프트 전에 피연산자를 int32 로
변환하므로, `s` 가 2³¹ 이상이면 `s >> 17` 은 음수 기준으로 계산된다. GDScript 의 `int` 는
64비트라 이 동작이 자동으로 재현되지 **않는다** — 32비트로 자르는 마스킹을 직접 넣어야 한다.

```gdscript
# 첨탑 대란 쪽 makeRng 를 GDScript 로 옮길 때
func _next() -> float:
    _s = (_s ^ (_s << 13)) & 0xFFFFFFFF
    var signed := _s if _s < 0x80000000 else _s - 0x100000000   # int32 로 해석
    _s = (_s ^ (signed >> 17)) & 0xFFFFFFFF                     # 산술 시프트
    _s = (_s ^ (_s << 5)) & 0xFFFFFFFF
    return float(_s) / 4294967296.0
```

계약의 `tierB.rng[].ints` 가 이 구현을 검증한다. 여기서 어긋나면 그 뒤는 볼 필요가 없다.

### 2. `Object.entries` 순회 순서에 규칙이 얹혀 있다

`neon-cascade` 의 `randomType()` 은 `ORB_TYPES` 를 `Object.entries` 로 돌며 가중치를 누적한다.
JS 객체의 문자열 키는 **삽입 순서**가 보장되지만, GDScript `Dictionary` 도 삽입 순서를 지키므로
선언 순서를 그대로 옮기면 된다. 다만 **정렬하거나 다른 자료구조로 바꾸면 오브 타입 분포가
달라진다.** 계약의 `tierB.waves[].waves[].types` 가 이걸 잡는다.

### 3. 정수 나눗셈

`Math.floor(a / b)` 는 GDScript 의 `a / b`(정수끼리)와 음수에서 다르다.
JS `Math.floor(-1/4) = -1`, GDScript `-1 / 4 = 0`. 연쇄 배율 계산처럼 음수가 들어갈 수 있는
자리에서는 명시적으로 `floori()` 를 쓴다.

---

## 계약에 담긴 것

### tower-defense
- `rng` — 시드 3개의 uint32 난수열 16개씩
- `waves` — 웨이브 1~30 의 `hpMult`(소수 6자리 고정) 와 적 구성 목록
- `pacing` — 웨이브별 건설 시간, 조기 출격 보너스
- `combo` — 연속 격파 구간별 배율
- `fusion` — 융합 비용/피해 계수
- `meta` — 마나핵 연구 항목별 레벨 비용표, 최대 레벨
- `cores` — 판 종료 정산(√점수)
- `path` — 경로 길이, 격자 크기

### neon-cascade
- `rng` — 시드 3개의 uint32 난수열
- `ladder` — 사슬 길이, 순환·라운드별 할당량 정수표, 환생 유산 배율
- `amps` / `fusions` — 증폭기·융합 정의와 계수
- `offers` — 시드별 드래프트가 내놓는 카드 id 순서와 소모 목록
- `waves` — 시드별 웨이브 목표치·오브 개수·타입 순서

---

## 규칙을 의도적으로 바꿨을 때

```bash
node scripts/record-golden-runs.js
```

**테스트가 깨졌다고 습관적으로 다시 기록하면 계약이 계약이 아니게 된다.**
다시 기록했다면 커밋 메시지에 무엇이 왜 바뀌었는지 남기고, 이식된 쪽이 있다면 같이 고친다.

`specVersion` 은 계약의 *형태*가 바뀔 때만 올린다 (필드 추가/삭제). 값이 바뀐 건 버전이 아니다.

---

## Godot 이식 현황

| 게임 | 위치 | 상태 |
|---|---|---|
| 첨탑 대란 (`tower-defense`) | `godot/tower-defense/` | 규칙 전체(`td_run.gd`) + 최소 플레이 화면. 메타 상점 UI·연출·Android 내보내기는 아직 |
| NEON CASCADE | — | 아직 없음 (계약 파일은 준비됨) |

검사는 두 겹이다:

| 검사 | 어디서 | 무엇을 |
|---|---|---|
| `node prototypes/godot-port-test.js` | CI 포함 어디서나 (Godot 불필요) | `td_rules.gd` 표를 JSON 으로 뽑아 `sim.js` 와 비교, `td_rng.gd` 의 식을 64비트 의미로 실행해 계약 난수열과 비교, `Run` 메서드 누락, 탭 들여쓰기 |
| `godot --headless --path godot/tower-defense --script res://tests/contract_test.gd` | Godot 이 설치된 곳 | 실제 GDScript 를 실행해 Tier B 전 항목을 계약 파일과 대조 |

첫 번째는 GDScript 를 **실행하지 않는다** — 문법 오류나 실행 중 오류는 두 번째로만 잡힌다.
Godot 을 CI 에 올리면(헤드리스 바이너리를 받아 두 번째 명령을 도는 잡) 이 공백이 닫힌다.

이식하며 드러난 추가 함정 (`godot/tower-defense/README.md` 에 자세히):
- JS `sort` 는 안정 정렬, Godot `sort_custom` 은 아니다 — 스폰 순서가 달라진다
- Godot 의 Dictionary `==` 는 내용 비교다 — 객체 동일성은 id 로
- JS `Math.round` 는 동률을 +∞ 로, GDScript `round()` 는 0 에서 먼 쪽으로
- Godot 의 JSON 파서는 모든 숫자를 float 로 읽는다
