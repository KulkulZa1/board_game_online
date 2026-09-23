extends RefCounted
## sim.js makeRng 의 비트 단위 이식 (xorshift32).
##
## JS 의 시프트는 피연산자를 먼저 32비트로 자르지만 GDScript 의 int 는 64비트다.
## 그래서 매 단계 0xFFFFFFFF 로 마스킹해야 JS 와 같은 수열이 나온다.
## ⚠ 이 게임의 xorshift 는 가운데 단계가 `s >> 17` — '산술' 시프트다. JS 는 s 를 int32(부호 있음)로
##   본 뒤 밀기 때문에, s 가 2^31 이상이면 부호 비트가 끌려 내려온다. _as_i32 가 그걸 재현한다.
##   NEON CASCADE 쪽은 `>>> 17`(논리 시프트)라 수열이 다르다 — 둘을 '통일'하면 안 된다.
##   (docs/port-contract.md, prototypes/golden/tower-defense.json 의 tierB.rng 가 검증 기준)

const MASK := 0xFFFFFFFF
var _s: int = 1


func _init(seed_value: int = 1) -> void:
	_s = seed_value & MASK        # JS: seed >>> 0
	if _s == 0:
		_s = 1                    # JS: || 1


static func _as_i32(x: int) -> int:
	x &= MASK
	return x - 0x100000000 if x >= 0x80000000 else x


## 다음 내부 상태(uint32) — 계약 파일의 tierB.rng[].ints 와 비교하는 값
func next_uint() -> int:
	_s = (_s ^ (_s << 13)) & MASK
	_s = (_s ^ (_as_i32(_s) >> 17)) & MASK
	_s = (_s ^ (_s << 5)) & MASK
	return _s


## JS rng() 와 같은 [0, 1) 실수
func next_float() -> float:
	return float(next_uint()) / 4294967296.0
