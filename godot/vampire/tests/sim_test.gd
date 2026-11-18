extends SceneTree
## 헤드리스 시뮬레이션 검사 — 실제 GDScript 로 판을 돌려, 옮긴 규칙이 실행 중에 깨지지 않는지 본다.
##
## 실행 (저장소 루트에서):
##   godot --headless --path godot/vampire --script res://tests/sim_test.gd
## 실패하면 종료 코드 1. 출력에 SCRIPT ERROR 가 보여도 실패로 본다 — GDScript 런타임 오류는 그 함수만
## 멈추고 프로세스는 계속 돌기 때문에, 아래 검사는 그렇게 멈춘 흔적(처치 0, 상태가 안 바뀜 …)을 잡게 짰다.
## 수치 표가 웹판과 같은지는 Godot 없이 node prototypes/godot-vampire-port-test.js 가 본다.

const R := preload("res://scripts/vs_rules.gd")
const Run := preload("res://scripts/vs_run.gd")
const DT := 1.0 / 30.0

var _pass := 0
var _fail := 0


func _initialize() -> void:
	_check_rules()
	_check_every_weapon()
	_check_items_and_powerups()
	_check_passives_and_synergies()
	_check_choices()
	_check_victory_and_death()
	_check_bot_runs()
	print("\n결과: %d/%d 통과" % [_pass, _pass + _fail])
	quit(1 if _fail > 0 else 0)


func _ok(cond: bool, label: String, detail: String = "") -> void:
	if cond:
		_pass += 1
		print("  ✓ " + label)
	else:
		_fail += 1
		print("  ✗ " + label + (" — " + detail if detail != "" else ""))


## 원을 그리며 도는 봇. 선택창은 첫 번째를 고르고, 10분이 되면 무한 웨이브를 이어 간다.
func _drive(run, seconds: float, dash: bool = false) -> void:
	var steps := roundi(seconds / DT)
	for i in range(steps):
		var t := i * DT
		run.tick(DT, Vector2(cos(t * 0.7), sin(t * 0.7)), dash and fmod(t, 2.0) < DT * 1.5)
		if run.state == "levelup" or run.state == "itembox":
			run.choose(0)
		if run.state == "victory_prompt":
			run.resolve_victory(true)
		if run.state == "dead" or run.state == "win":
			return


## 시작 무기를 비우고 id 하나만 쥔 판 (진화 무기면 기본 무기를 최대 레벨 + 재료 패시브로 진화시킨다)
func _run_with_only(id: String, seed_value: int):
	var run = Run.new("knight", "normal", "meadow", seed_value)
	var p = run.player
	p.weapons.clear()
	p.weapon_levels.clear()
	p.weapon_cds.clear()
	p.main_weapon = ""
	if R.WEAPON_DEFS[id].get("evolved", false):
		var evo: Dictionary = R.find_def(R.EVOLUTION_DEFS, id)
		run.add_weapon(evo["base"])
		for i in range(R.MAX_WEAPON_LEVEL - 1):
			run.add_weapon(evo["base"])
		run.apply_passive(R.find_def(R.PASSIVE_POOL, evo["req"]))
		run.evolve_weapon(evo)
	else:
		run.add_weapon(id)
	return run


func _check_rules() -> void:
	print("\n[규칙 표 — 서로 맞물리는가]")
	_ok(R.xp_needed(1) == 32 and R.xp_needed(5) == 237 and R.xp_needed(10) == 777, "XP 곡선 Lv1=32 · Lv5=237 · Lv10=777", "%d/%d/%d" % [R.xp_needed(1), R.xp_needed(5), R.xp_needed(10)])
	var bad: Array = []
	for evo in R.EVOLUTION_DEFS:
		if not R.WEAPON_DEFS.has(evo["id"]) or not R.WEAPON_DEFS.has(evo["base"]) or R.find_def(R.PASSIVE_POOL, evo["req"]).is_empty():
			bad.append(evo["id"])
	_ok(bad.is_empty() and R.EVOLUTION_DEFS.size() == 12, "진화 12종의 기본 무기·결과·재료 패시브가 모두 있다", str(bad))
	bad = []
	for id in R.WEAPON_DEFS:
		if not R.WEAPON_FAMILY.has(id):
			bad.append(id)
	for id in R.WEAPON_POOL:
		if R.WEAPON_DEFS[id].get("evolved", false) or not R.AUX_EFFECT_DEFS.has(R.weapon_family(id)):
			bad.append(id)
	_ok(bad.is_empty(), "모든 무기에 계열이 있고, 기본 무기마다 보조 효과가 있다", str(bad))
	bad = []
	for ch in R.CHARACTER_DEFS:
		for w in ch["startWeapons"]:
			if not R.WEAPON_POOL.has(w):
				bad.append("%s:%s" % [ch["id"], w])
	_ok(bad.is_empty(), "캐릭터 시작 무기가 무기 풀에 있다", str(bad))


func _check_every_weapon() -> void:
	print("\n[무기 24종 — 혼자 쥐고 20초]")
	var i := 0
	for id in R.WEAPON_DEFS:
		i += 1
		var run = _run_with_only(id, 100 + i)
		run.player.invincible = 1e9
		_ok(run.player.weapons.has(id) and run.get_main_weapon() == ("" if not R.is_attack_weapon(id) else id), "%s 장착" % id, str(run.player.weapons))
		_drive(run, 20.0)
		# 방패는 피해가 0 이라 처치를 못 한다 — 나머지는 처치가 있어야 실제로 발사·피해·처치가 돈 것이다
		if id != "shield":
			_ok(run.kills > 0, "%s 로 처치 (%d)" % [id, run.kills])
		_ok(run.state == "playing", "%s 판이 계속 진행 중" % id, run.state)


func _check_items_and_powerups() -> void:
	print("\n[아이템 박스 · 파워업]")
	for item in R.ITEM_BOX_POOL:
		var run = Run.new("omok", "normal", "meadow", 7)
		_drive(run, 2.0)
		var p = run.player
		var before_max: float = p.max_hp
		var before_dmg: float = p.dmg_mult
		run.apply_item_box(item["id"])
		match String(item["id"]):
			"freeze":
				_ok(run.enemies.all(func(e): return e.frozen == 3.0), "빙결 폭탄 — 모든 적 3초 빙결")
			"hpmax":
				_ok(is_equal_approx(p.max_hp, before_max + 30.0), "체력 강화 — 최대 체력 +30")
			"dmgperm":
				_ok(is_equal_approx(p.dmg_mult, before_dmg * 1.2), "공격력 강화 — ×1.2")
			"barrier":
				_ok(p.invincible == 5.0, "무적 방패 — 5초")
		_drive(run, 3.0)
		_ok(run.state != "dead" and p.hp <= p.max_hp, "%s %s 적용 후 3초" % [item["icon"], item["id"]])
	for pu in R.POWERUP_POOL:
		var run = Run.new("knight", "normal", "meadow", 9)
		_drive(run, 2.0)
		run.apply_powerup(pu)
		_drive(run, 2.0)
		_ok(run.state != "dead" and run.player.hp <= run.player.max_hp, "%s %s 파워업" % [pu["icon"], pu["id"]])


func _check_passives_and_synergies() -> void:
	print("\n[패시브 상한 · 시너지 13종]")
	var run = Run.new("knight", "normal", "meadow", 11)
	var spd: Dictionary = R.find_def(R.PASSIVE_POOL, "spd_up")
	for k in range(5):
		run.apply_passive(spd)
	_ok(run.is_passive_maxed(spd), "이동 속도는 5스택에서 상한")
	_ok(not run.passive_choices().any(func(c): return c["passive_id"] == "spd_up"), "상한 패시브는 선택지에서 빠진다")
	var need := {"dmg_up": 4, "crit": 3, "cd_up": 2, "regen": 3, "hp_up": 3, "pierce_up": 3, "ignite": 3, "lifesteal": 3, "venom": 2, "range_up": 3}
	for id in need:
		for k in range(int(need[id])):
			run.apply_passive(R.find_def(R.PASSIVE_POOL, id))
	var missing: Array = []
	for s in R.SYNERGY_DEFS:
		if not run.has_synergy(s["id"]):
			missing.append(s["id"])
	_ok(missing.is_empty(), "조건을 채우면 시너지 13종이 모두 켜진다", str(missing))
	for w in ["scythe", "meteor", "missile", "bomb", "toxic", "chain"]:
		run.add_weapon(w)
	run.player.invincible = 1e9
	_drive(run, 40.0, true)
	_ok(run.kills > 20 and run.state == "playing", "시너지 전부 켠 채 40초 (처치 %d)" % run.kills, run.state)


func _check_choices() -> void:
	print("\n[레벨업 선택지 · 리롤 · 메인 무기]")
	var run = Run.new("goblin", "normal", "meadow", 13)
	run.gain_xp(R.xp_needed(1))
	_ok(run.state == "levelup" and run.player.level == 2, "XP 가 차면 레벨업 창")
	_ok(run.choices.size() == 3, "선택지 3개", str(run.choices.size()))
	var first_kind: Array = run.choices.map(func(c): return c["kind"])
	_ok(first_kind.has("slash-support"), "대쉬 보조가 없으면 하나는 보장된다", str(first_kind))
	run.do_reroll()
	_ok(run.free_reroll_used and run.choices.size() == 3, "무료 리롤 1회")
	run.player.rerolls = 0
	_ok(not run.can_reroll(), "무료 리롤 뒤 리롤권이 없으면 막힌다")
	run.choose(0)
	_ok(run.state == "playing", "고르면 다시 진행")
	run.set_main_weapon("chain")
	var aux: Array = run.get_aux_families()
	_ok(run.get_main_weapon() == "chain" and aux.has("boomerang") and not aux.has("chain"), "메인 무기 변경 → 부메랑은 보조 계열로", str(aux))
	# 진화가 가능하면 첫 선택지는 진화다
	for k in range(R.MAX_WEAPON_LEVEL - 1):
		run.add_weapon("chain")
	run.apply_passive(R.find_def(R.PASSIVE_POOL, "pierce_up"))
	run.show_level_up()
	_ok(run.choices[0]["kind"] == "evolve" and run.choices[0]["evo"]["id"] == "tempest", "진화 조건을 채우면 진화가 첫 선택지", str(run.choices[0]["name"]))
	run.choose(0)
	_ok(run.player.weapons.has("tempest") and not run.player.weapons.has("chain") and run.get_main_weapon() == "tempest", "번개 사슬 → 폭풍 사슬, 메인 유지")
	# 진공 청소기로 레벨업이 나면 그 선택창이 남아야 한다 (웹판은 이걸 잃는다)
	run.player.xp = R.xp_needed(run.player.level) - 1
	run.xp_gems.append({"x": 9999.0, "y": 9999.0, "val": 50, "attracting": false})
	run.show_item_box_choices()
	run.choices = [{"kind": "item", "item_id": "sweep", "name": "sweep", "desc": "", "tag": ""}]
	var lv: int = run.player.level
	run.choose(0)
	_ok(run.state == "levelup" and run.player.level == lv + 1 and run.choices.size() > 0, "진공 청소기로 오른 레벨업 선택창이 남는다", run.state)


func _check_victory_and_death() -> void:
	print("\n[승리 · 무한 웨이브 · 사망]")
	var run = Run.new("knight", "easy", "meadow", 17)
	run.elapsed = run.get_survive_goal() - 0.01
	run.tick(DT, Vector2.ZERO, false)
	_ok(run.state == "victory_prompt", "목표 시간에 도달하면 계속할지 묻는다", run.state)
	run.resolve_victory(true)
	run.player.invincible = 1e9
	_drive(run, 3.0)
	_ok(run.infinite_mode and run.infinite_elapsed > 2.0 and run.state == "playing", "무한 웨이브로 이어진다")
	run = Run.new("knight", "easy", "snow", 17)
	_ok(run.get_survive_goal() == 720.0, "눈 맵은 12분")
	run.elapsed = run.get_survive_goal()
	run.tick(DT, Vector2.ZERO, false)
	run.resolve_victory(false)
	_ok(run.state == "win", "승리로 마무리")
	run = Run.new("knight", "normal", "meadow", 19)
	run.player.hp = 0.5
	run.player.invincible = 0.0
	run.player.weapon_cds.clear()    # 무기가 먼저 그 적을 죽이지 않게
	var e = run.enemies[0]
	e.hp = 1e6
	e.max_hp = 1e6
	e.x = run.player.x
	e.y = run.player.y
	run.tick(DT, Vector2.ZERO, false)
	_ok(run.state == "dead", "접촉 피해로 체력이 다하면 사망", run.state)


func _check_bot_runs() -> void:
	print("\n[봇 플레이 — 캐릭터·난이도별 2분 30초]")
	var cases := [["knight", "normal", "meadow"], ["omok", "hard", "night"], ["reversi", "easy", "snow"], ["goblin", "nightmare", "meadow"]]
	var i := 0
	for c in cases:
		i += 1
		var run = Run.new(c[0], c[1], c[2], 1000 + i)
		_drive(run, 150.0, true)
		var p = run.player
		var bad: Array = []
		if run.elapsed < 20.0:
			bad.append("20초도 못 버팀 (%.1f)" % run.elapsed)
		if run.kills < 20:
			bad.append("처치 %d" % run.kills)
		if p.level < 2:
			bad.append("레벨 %d" % p.level)
		if run.enemies.size() > R.MAX_ENEMIES:
			bad.append("적 %d" % run.enemies.size())
		if p.weapons.size() > R.MAX_WEAPONS:
			bad.append("무기 %d" % p.weapons.size())
		if p.hp > p.max_hp + 0.001:
			bad.append("체력 초과")
		for w in p.weapons:
			var lv := int(p.weapon_levels.get(w, 0))
			if lv < 1 or lv > R.MAX_WEAPON_LEVEL:
				bad.append("%s Lv%d" % [w, lv])
		if run.elapsed > float(R.find_def(R.DIFFICULTY_DEFS, c[1])["bossInterval"]) + 1.0 and run.next_boss_time <= run.elapsed - 1.0 and not run.boss_active:
			bad.append("보스가 안 나옴")
		_ok(bad.is_empty(), "%s / %s / %s — %s, Lv%d, 처치 %d, %s" % [c[0], c[1], c[2], R.fmt_time(run.elapsed), p.level, run.kills, run.state], ", ".join(PackedStringArray(bad)))
