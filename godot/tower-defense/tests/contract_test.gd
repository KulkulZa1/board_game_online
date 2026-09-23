extends SceneTree
## 이식 계약 검사 — Godot 쪽 규칙이 JS(sim.js)와 같은지 prototypes/golden/tower-defense.json 의
## Tier B(엔진을 넘어 반드시 같아야 하는 정수·이산값)로 대조한다. docs/port-contract.md 참고.
##
## 실행 (저장소 루트에서):
##   godot --headless --path godot/tower-defense --script res://tests/contract_test.gd
## 실패하면 종료 코드 1. 계약 파일 경로는 기본값 외에 `-- <경로>` 로 넘길 수 있다.
## Tier A(이벤트 해시)는 JS 안에서만 의미가 있다 — 부동소수 결과는 엔진끼리 비트 단위로 같을 수 없다.

const R := preload("res://scripts/td_rules.gd")
const Rng := preload("res://scripts/td_rng.gd")

var _pass := 0
var _fail := 0


func _initialize() -> void:
	var path := _contract_path()
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_error("계약 파일을 읽을 수 없다: %s" % path)
		quit(1)
		return
	var golden = JSON.parse_string(text)
	if not golden is Dictionary or not golden.has("tierB"):
		push_error("계약 파일 형식이 아니다: %s" % path)
		quit(1)
		return
	var b: Dictionary = golden["tierB"]
	_check_rng(b["rng"])
	_check_waves(b["waves"])
	_check_pacing(b["pacing"])
	_check_combo(b["combo"])
	_check_fusion(b["fusion"])
	_check_meta(b["meta"])
	_check_cores(b["cores"])
	_check_path(b["path"])
	print("\n결과: %d/%d 통과" % [_pass, _pass + _fail])
	quit(1 if _fail > 0 else 0)


func _contract_path() -> String:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		return args[0]
	return ProjectSettings.globalize_path("res://").path_join("../../prototypes/golden/tower-defense.json").simplify_path()


func _ok(cond: bool, label: String, detail := "") -> void:
	if cond:
		_pass += 1
		print("  PASS ", label)
	else:
		_fail += 1
		print("  FAIL ", label, (" — " + detail) if detail != "" else "")


# JSON 의 숫자는 Godot 에서 float 로 읽힌다 — 정수 비교는 int() 로 맞춘다
func _check_rng(cases: Array) -> void:
	print("\n[난수열 — uint32 가 비트 단위로 같아야 한다]")
	for c in cases:
		var r = Rng.new(int(c["seed"]))
		var got: Array = []
		for i in range(c["ints"].size()):
			got.append(r.next_uint())
		var want: Array = c["ints"].map(func(x): return int(x))
		_ok(got == want, "seed %d 의 %d개" % [int(c["seed"]), want.size()], "첫 값 기대 %s, 실제 %s" % [str(want[0]), str(got[0])])


func _check_waves(waves: Array) -> void:
	print("\n[웨이브 구성표 1~%d]" % waves.size())
	var bad := []
	for w in waves:
		var spec := R.wave_spec(int(w["n"]))
		if absf(spec["hpMult"] - float(w["hpMult"])) > 1e-6:
			bad.append("웨이브 %d hpMult %s ≠ %s" % [int(w["n"]), str(spec["hpMult"]), str(w["hpMult"])])
		var list: Array = spec["list"]
		if list.size() != w["list"].size():
			bad.append("웨이브 %d 적 종류 수" % int(w["n"]))
			continue
		for i in range(list.size()):
			if list[i]["type"] != w["list"][i]["type"] or int(list[i]["count"]) != int(w["list"][i]["count"]):
				bad.append("웨이브 %d 구성 %d번째" % [int(w["n"]), i])
	_ok(bad.is_empty(), "체력 배율과 적 구성이 JS 와 같다", ", ".join(PackedStringArray(bad.slice(0, 3))))


func _check_pacing(rows: Array) -> void:
	print("\n[건설 시간 · 조기 출격 보너스]")
	var bad := []
	for p in rows:
		var w := int(p["wave"])
		if absf(R.build_seconds(w) - float(p["build"])) > 1e-4:
			bad.append("웨이브 %d 건설 시간" % w)
		if R.early_gold(w, 10.0) != int(p["early10"]):
			bad.append("웨이브 %d 보너스 %d ≠ %d" % [w, R.early_gold(w, 10.0), int(p["early10"])])
	_ok(bad.is_empty(), "웨이브별 건설 시간과 10초 조기 출격 보너스", ", ".join(PackedStringArray(bad.slice(0, 3))))


func _check_combo(rows: Array) -> void:
	print("\n[연속 격파 등급]")
	var bad := []
	for c in rows:
		var tier := R.combo_tier(int(c["streak"]))
		var mult := float(tier.get("mult", 1.0))
		var label = tier.get("label", null)
		if absf(mult - float(c["mult"])) > 1e-4 or label != c["label"]:
			bad.append("연쇄 %d" % int(c["streak"]))
	_ok(bad.is_empty(), "문턱별 배율과 이름", ", ".join(PackedStringArray(bad)))


func _check_fusion(f: Dictionary) -> void:
	print("\n[융합 계수]")
	_ok(absf(R.FUSED_COST_STEP - float(f["costStep"])) < 1e-9 and absf(R.FUSED_DMG_STEP - float(f["dmgStep"])) < 1e-9,
		"융합 비용 ×%s · 피해 ×%s" % [str(R.FUSED_COST_STEP), str(R.FUSED_DMG_STEP)])


func _check_meta(rows: Array) -> void:
	print("\n[마나핵 연구 비용표]")
	var bad := []
	for u in rows:
		for lv in range(u["costs"].size()):
			var meta := R.normalize_meta({"upgrades": {u["id"]: lv}})
			var cost := R.meta_cost(u["id"], meta)
			var want = u["costs"][lv]
			var got = null if cost < 0 else cost
			if (want == null) != (got == null) or (want != null and int(want) != int(got)):
				bad.append("%s Lv%d: %s ≠ %s" % [u["id"], lv, str(got), str(want)])
	_ok(bad.is_empty(), "항목별 레벨 비용 (최대 레벨은 null)", ", ".join(PackedStringArray(bad.slice(0, 3))))


func _check_cores(rows: Array) -> void:
	print("\n[판 종료 정산 — √점수]")
	var bad := []
	for c in rows:
		var got := R.cores_earned(int(c["wave"]), float(c["score"]), {})
		if got != int(c["cores"]):
			bad.append("웨이브 %d 점수 %d → %d ≠ %d" % [int(c["wave"]), int(c["score"]), got, int(c["cores"])])
	_ok(bad.is_empty(), "마나핵 획득량", ", ".join(PackedStringArray(bad)))


func _check_path(p: Dictionary) -> void:
	print("\n[격자와 길]")
	var path := R.build_path()
	_ok(path.size() == int(p["cells"]) and path.size() == int(p["len"]), "길 칸 수 %d" % path.size(), "기대 %d" % int(p["cells"]))
	_ok(R.COLS == int(p["cols"]) and R.ROWS == int(p["rows"]), "격자 %d×%d" % [R.COLS, R.ROWS])
