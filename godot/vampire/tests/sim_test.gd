extends SceneTree
## 헤드리스 시뮬레이션 검사 — 실제 GDScript 로 판을 돌려, 옮긴 규칙이 실행 중에 깨지지 않는지 본다.
##
## 실행 (저장소 루트에서):
##   godot --headless --path godot/vampire --script res://tests/sim_test.gd
## 실패하면 종료 코드 1. 출력에 SCRIPT ERROR 가 보여도 실패로 본다 — GDScript 런타임 오류는 그 함수만
## 멈추고 프로세스는 계속 돌기 때문에, 아래 검사는 그렇게 멈춘 흔적(처치 0, 상태가 안 바뀜 …)을 잡게 짰다.
## 수치 표가 웹판과 같은지는 Godot 없이 node prototypes/godot-vampire-port-test.js 가 본다.

const R := preload("res://scripts/vs_rules.gd")
const C := preload("res://scripts/vs_content.gd")
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
	_check_loot_and_sets()
	_check_monsters_and_affixes()
	_check_new_weapons_and_drops()
	_check_procs_and_shrines()
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
	_ok(bad.is_empty() and R.EVOLUTION_DEFS.size() == 15, "진화 15종(웹판 12 + Godot 3)의 기본 무기·결과·재료 패시브가 모두 있다", str(bad))
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
	_ok(run.get_survive_goal() == 1800.0 and Run.new("knight", "normal", "meadow", 1).get_survive_goal() == 1800.0, "Godot 판은 맵과 상관없이 30분 생존이 클리어")
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
		# MAX_ENEMIES 는 웨이브 스폰 상한이다 — 보스·고블린은 웹판처럼 상한을 넘어 나온다 (실측 651)
		if run.enemies.size() > R.MAX_ENEMIES + 5:
			bad.append("적 %d" % run.enemies.size())
		if p.weapons.size() > R.MAX_WEAPONS:
			bad.append("무기 %d" % p.weapons.size())
		if p.hp > p.max_hp + 0.001:
			bad.append("체력 초과")
		for w in p.weapons:
			var lv := int(p.weapon_levels.get(w, 0))
			if lv < 1 or lv > R.MAX_WEAPON_LEVEL:
				bad.append("%s Lv%d" % [w, lv])
		if run.stage_t > float(R.find_def(R.DIFFICULTY_DEFS, c[1])["bossInterval"]) + 1.0 and run.next_boss_time <= run.stage_t - 1.0 and not run.boss_active:
			bad.append("보스가 안 나옴")
		_ok(bad.is_empty(), "%s / %s / %s — %s, Lv%d, 처치 %d, %s" % [c[0], c[1], c[2], R.fmt_time(run.elapsed), p.level, run.kills, run.state], ", ".join(PackedStringArray(bad)))


## 장비를 직접 만들어 쥐여 준다 (드롭 운에 기대지 않는다)
func _give(run, slot: String, rarity: String, set_id: String = "", legendary: String = "") -> Dictionary:
	var it: Dictionary = C.roll_item(run.rng, slot, rarity, 5)
	it["procs"] = []    # 전설에 붙는 발동 옵션이 세트·전설 검사를 흔들지 않게
	if set_id != "":
		it["set"] = set_id
		it["rarity"] = "set"
	if legendary != "":
		it["legendary"] = legendary
		it["rarity"] = "legendary"
	run.player.equip[slot] = it
	run._refresh_gear()
	return it


func _check_loot_and_sets() -> void:
	print("\n[Godot 판 장비 — 희귀도·자동 장착·분해·세트·전설]")
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var bad: Array = []
	for rar in C.RARITY_ORDER:
		for slot in C.GEAR_SLOTS:
			var it: Dictionary = C.roll_item(rng, slot, rar, 3)
			if it["affixes"].size() != int(C.RARITIES[rar]["affixes"]) or String(it["name"]) == "":
				bad.append("%s/%s" % [rar, slot])
			if rar == "set" and it["set"] == "":
				bad.append("세트 없음")
			if rar == "legendary" and String(C.LEGENDARIES[it["legendary"]]["slot"]) != slot:
				bad.append("전설 부위")
	_ok(bad.is_empty(), "희귀도·부위마다 옵션 개수·이름·세트/전설 정보가 맞다", str(bad))
	var minr := {}
	for i in range(300):
		minr[C.roll_rarity(rng, "rare", 3.0)] = true
	_ok(not minr.has("common") and not minr.has("magic"), "보스 드롭(최소 희귀)은 일반·마법이 안 나온다", str(minr.keys()))

	_check_gear_growth()
	var run = Run.new("knight", "normal", "meadow", 31)
	for slot in C.GEAR_SLOTS:
		_give(run, slot, "set", "ember")
	_ok(run.set_count("ember") == 4, "잿불 군주 4부위 → 세트 4")
	run.last_move_dir = Vector2(1, 0)
	run.tick(1.0 / 30.0, Vector2.ZERO, true)
	_ok(run.fire_trails.size() >= 4, "잿불 4세트: 대쉬 경로에 불길", str(run.fire_trails.size()))

	run = Run.new("knight", "normal", "meadow", 32)
	for slot in C.GEAR_SLOTS:
		_give(run, slot, "set", "storm")
	run.player.invincible = 1e9
	var thunders := 0
	for i in range(int(6.0 * 30)):
		run.tick(1.0 / 30.0, Vector2.ZERO, false)
		if run.state != "playing":
			run.choose(0)
		for ev in run.events:
			if ev["t"] == "thunder":
				thunders += 1
		run.events.clear()
	_ok(thunders >= 6, "폭풍 4세트: 5초마다 낙뢰 6발 (6초 동안 %d발)" % thunders)

	run = Run.new("knight", "normal", "meadow", 33)
	for slot in ["helm", "armor"]:
		_give(run, slot, "set", "blood")
	_ok(is_equal_approx(float(run.player.gear.get("lifesteal", 0.0)) - _affix_sum(run, "lifesteal"), 0.03), "피의 서약 2세트: 흡혈 +3%")
	run = Run.new("knight", "normal", "meadow", 34)
	for slot in C.GEAR_SLOTS:
		_give(run, slot, "set", "frost")
	run.player.invincible = 1e9
	for i in range(20):
		run.tick(1.0 / 30.0, Vector2.ZERO, false)
	var slowed := 0
	for e in run.enemies:
		if e.slow > 0.0:
			slowed += 1
	var e0 = run.enemies[0]
	e0.x = run.player.x + 40.0
	e0.y = run.player.y
	run.tick(1.0 / 30.0, Vector2.ZERO, false)
	_ok(e0.slow >= 0.4, "서리 4세트: 오라 안의 적 40% 감속", str(e0.slow))

	run = Run.new("knight", "normal", "meadow", 35)
	_give(run, "boots", "legendary", "", "shadow")
	run.last_move_dir = Vector2(1, 0)
	run.tick(1.0 / 30.0, Vector2.ZERO, true)
	_ok(is_equal_approx(run.dash_cd, R.DASH_COOLDOWN * 0.6) and run.player.invincible >= 0.9, "그림자 장화: 대쉬 쿨다운 -40%, 대쉬 후 1초 무적", "%.2f / %.2f" % [run.dash_cd, run.player.invincible])
	_give(run, "ring", "legendary", "", "greed")
	_ok(run._gear("xp") >= 0.25 and run._luck() >= 1.5, "탐욕의 반지: 경험치 +25%, 행운 +50%")
	_give(run, "helm", "legendary", "", "berserker")
	run.combo_count = 40
	var base_bonus: float = 1.0 + run._gear("dmg")
	_ok(is_equal_approx(run._dmg_bonus(), base_bonus * 1.2), "광전사의 투구: 콤보 40 → 피해 +20%")

	var meta_run = Run.new("knight", "normal", "meadow", 36, {"might": 2, "vitality": 3, "fortune": 1})
	_ok(is_equal_approx(meta_run._gear("dmg"), 0.10) and is_equal_approx(meta_run.player.max_hp, R.BASE_HP + C.PLAYER_BONUS_HP + 30.0) and meta_run._luck() >= 1.15,
		"영혼석 강화: 힘 2 → 피해 +10%, 활력 3 → 최대 체력 +30, 행운 1 → +15%")
	_ok(C.shards_earned(400, 300.0, 1, 1, false) == 28 + 15 + 5 and C.soul_upgrade_cost("might", 2) == 60, "영혼석 정산식과 강화 비용")


func _affix_sum(run, stat: String) -> float:
	var v := 0.0
	for slot in C.GEAR_SLOTS:
		var it = run.player.equip[slot]
		if it == null:
			continue
		for a in it["affixes"]:
			if a["stat"] == stat:
				v += C.affix_value(it, a)
	return v


## 시험용 장비 — roll_item 으로 만든 뒤 옵션만 바꾼다 (lv·exp·procs 같은 키가 다 들어 있게)
func _item(run, slot: String, rarity: String, affixes: Array) -> Dictionary:
	var it: Dictionary = C.roll_item(run.rng, slot, rarity, 3)
	it["affixes"] = affixes
	it["procs"] = []
	return it


func _check_gear_growth() -> void:
	print("\n[Godot 판 장비 성장 — 분해 경험치·레벨·각성·가방·장비창]")
	var run = Run.new("knight", "normal", "meadow", 31)
	var hp0: float = run.player.max_hp
	var good := _item(run, "helm", "magic", [{"stat": "max_hp", "val": 30.0}, {"stat": "dmg", "val": 0.2}])
	run.pick_up_gear(good)
	_ok(run.player.equip["helm"] == good and is_equal_approx(run.player.max_hp, hp0 + 30.0), "빈 칸 장비는 장착, 최대 체력 옵션이 바로 반영")
	var xp0: float = run.player.xp
	var lv0: int = run.player.level
	var junk := _item(run, "helm", "common", [{"stat": "luck", "val": 0.01}])
	run.pick_up_gear(junk)
	_ok(run.player.equip["helm"] == good and run.bag.is_empty() and float(good["exp"]) > 0.0 and run.player.xp == xp0 and run.player.level == lv0,
		"더 나쁜 장비는 끼고 있는 같은 부위 장비의 경험치로 분해 (캐릭터 경험치 아님)", "exp %.1f" % float(good["exp"]))
	var better := _item(run, "helm", "rare", [{"stat": "dmg", "val": 0.5}, {"stat": "crit", "val": 0.2}, {"stat": "cd", "val": 0.1}])
	run.pick_up_gear(better)
	_ok(run.player.equip["helm"] == good and run.bag.size() == 1 and run.bag[0] == better and better["new"] and run.bag_has_new(), "더 좋은 장비는 가방으로 (NEW)")
	var set_piece := _item(run, "armor", "set", [{"stat": "luck", "val": 0.01}])
	set_piece["set"] = "ember"
	run.player.equip["armor"] = _item(run, "armor", "rare", [{"stat": "dmg", "val": 0.9}])
	run._refresh_gear()
	run.pick_up_gear(set_piece)
	_ok(run.bag.has(set_piece), "약해도 세트·전설은 가방으로")
	# 레벨업 — 옵션 수치가 커지고, 최대 체력도 따라 오른다
	var hp1: float = run.player.max_hp
	run.feed_gear(good, C.gear_exp_needed(1) + C.gear_exp_needed(2) + 1.0)
	var lv: int = good["lv"]
	_ok(lv >= 3, "장비 경험치가 차면 레벨이 오른다 (Lv %d)" % lv)
	_ok(is_equal_approx(run.player.max_hp - hp1, roundf(30.0 * C.gear_level_mult(lv)) - 30.0) and is_equal_approx(run._gear("dmg"), 0.2 * C.gear_level_mult(lv) + 0.9),
		"레벨만큼 옵션 수치가 커진다 (×%.1f)" % C.gear_level_mult(lv), "hp %.1f dmg %.3f" % [run.player.max_hp - hp1, run._gear("dmg")])
	var need := 0.0
	for l in range(lv, C.AWAKEN_LEVELS[0]):
		need += C.gear_exp_needed(l)
	run.feed_gear(good, need - float(good["exp"]) + 0.5)
	_ok(int(good["lv"]) == C.AWAKEN_LEVELS[0] and good["procs"].size() == 1, "Lv %d 에서 각성 — 무작위 발동 옵션이 붙는다" % C.AWAKEN_LEVELS[0], "lv %d procs %d" % [int(good["lv"]), good["procs"].size()])
	_ok(run._procs.size() == 1, "낀 장비의 발동 옵션이 발동 목록에 오른다")
	# 장비창 — 바꿔 끼면 빼낸 장비가 레벨을 지닌 채 가방 그 자리로
	var good_lv: int = good["lv"]
	run.equip_from_bag(run.bag.find(better))
	_ok(run.player.equip["helm"] == better and run.bag.has(good) and int(good["lv"]) == good_lv and run._procs.is_empty(), "장비창: 가방 장비를 끼면 빼낸 장비는 레벨 그대로 가방에")
	var e0 := float(better["exp"])
	var gexp := C.salvage_exp(good)
	run.salvage_from_bag(run.bag.find(good))
	_ok(not run.bag.has(good) and (float(better["exp"]) > e0 or int(better["lv"]) > 1) and gexp > float(good["spent"]) * C.SALVAGE_REFUND,
		"장비창: 분해하면 키운 경험치의 %d%% 가 지금 낀 장비로 돌아간다 (+%d)" % [roundi(C.SALVAGE_REFUND * 100), roundi(gexp)])
	# 가방이 차면 가장 약한 것부터 분해
	run.bag.clear()
	for i in range(C.BAG_SIZE):
		var it := _item(run, "boots", "legendary", [{"stat": "speed", "val": 0.01 * (i + 1)}])
		it["legendary"] = "shadow"
		run._stash(it)
	var weakest: Dictionary = run.bag[0]
	var strong := _item(run, "boots", "legendary", [{"stat": "speed", "val": 0.5}])
	strong["legendary"] = "shadow"
	run._stash(strong)
	_ok(run.bag.size() == C.BAG_SIZE and run.bag.has(strong) and not run.bag.has(weakest), "가방이 가득 차면 가장 약한 것을 분해하고 넣는다")
	run.bag.clear()
	run.bag.append(_item(run, "helm", "common", [{"stat": "luck", "val": 0.001}]))
	run.bag.append(set_piece)
	_ok(run.salvage_weaker() == 1 and run.bag.size() == 1 and run.bag[0] == set_piece, "약한 장비 모두 분해 — 세트·전설·더 좋은 것은 남긴다")
	# 최대 레벨 — 넘친 경험치는 캐릭터에게
	var top := _item(run, "ring", "rare", [{"stat": "xp", "val": 0.01}])
	top["lv"] = C.GEAR_MAX_LEVEL
	var xp1: float = run.player.xp
	var plv: int = run.player.level
	run.feed_gear(top, 10.0)
	_ok(int(top["lv"]) == C.GEAR_MAX_LEVEL and (run.player.xp > xp1 or run.player.level > plv), "최대 레벨 장비에 넘친 경험치는 캐릭터 경험치로")
	run.player.equip["helm"] = null
	run.player.equip["armor"] = null
	run._refresh_gear()
	_ok(is_equal_approx(run.player.max_hp, hp0), "장비를 다 빼면 최대 체력이 처음으로 돌아온다", "%.1f vs %.1f" % [run.player.max_hp, hp0])


func _check_procs_and_shrines() -> void:
	print("\n[Godot 판 발동 옵션 · 블랙홀 · 제단 · 학살 · 30분 곡선]")
	# 효과 8종 — 하나씩 직접 터뜨려 본다
	for eff in C.PROC_EFFECT_ORDER:
		var run = Run.new("knight", "normal", "meadow", 60)
		run.player.invincible = 1e9
		run.player.weapon_cds.clear()
		var k0: int = run.kills
		var e = run.enemies[0]
		run._queue_proc(eff, e.x, e.y, 1.0)
		run.proc_queue[0]["t"] = 0.0
		for i in range(45):
			run.tick(DT, Vector2.ZERO, false)
			if run.state != "playing":
				run.choose(0)
		var ok: bool = run.procs_fired == 1
		if eff == "frenzy":
			ok = ok and run._cd_bonus() < 0.7 and run.buffs.has("frenzy_proc")
		else:
			ok = ok and run.kills > k0
		_ok(ok, "발동 효과 %s %s — 터지고 %s" % [C.PROC_EFFECTS[eff]["icon"], C.PROC_EFFECTS[eff]["name"], "쿨다운 -40%" if eff == "frenzy" else "잡몹을 쓸어 낸다"], "fired %d kills %d→%d" % [run.procs_fired, k0, run.kills])
	# 처치 시 100% 화염 신성 — 처치가 연쇄로 이어진다
	var run = Run.new("knight", "normal", "meadow", 61)
	run.player.invincible = 1e9
	var it := _item(run, "ring", "rare", [])
	it["procs"] = [{"trigger": "kill", "effect": "nova", "chance": 1.0}]
	run.player.equip["ring"] = it
	run._refresh_gear()
	run.deal_damage(run.enemies[0], 1e9)
	for i in range(15):
		run.tick(DT, Vector2.ZERO, false)
	_ok(run.procs_fired >= 1, "처치 시 발동 옵션이 처치에 걸린다 (%d회)" % run.procs_fired)
	# 주기 발동
	run = Run.new("knight", "normal", "meadow", 62)
	run.player.invincible = 1e9
	it = _item(run, "ring", "rare", [])
	it["procs"] = [{"trigger": "timer", "effect": "thunder", "chance": 1.0}]
	run.player.equip["ring"] = it
	run._refresh_gear()
	for i in range(int((C.PROC_TIMER_PERIOD + 0.5) * 30)):
		run.tick(DT, Vector2.ZERO, false)
		if run.state != "playing":
			run.choose(0)
	_ok(run.procs_fired >= 1, "주기 발동 옵션은 %d초마다" % int(C.PROC_TIMER_PERIOD))
	# 블랙홀은 끌어당긴다
	run = Run.new("knight", "normal", "meadow", 63)
	run.player.invincible = 1e9
	var bx: float = run.player.x + 200.0
	var e = run.enemies[0]
	e.x = bx + 150.0
	e.y = run.player.y
	e.hp = 1e9
	e.max_hp = 1e9
	run.vortices.append({"x": bx, "y": run.player.y, "r": 230.0, "t": 1.0, "max_t": 1.0, "dmg": 1.0})
	run.tick(DT, Vector2.ZERO, false)
	run.tick(DT, Vector2.ZERO, false)
	_ok(absf(e.x - bx) < 150.0, "블랙홀: 반경 안의 적을 끌어당긴다", "%.1f" % absf(e.x - bx))
	# 학살 — 한순간에 12킬
	run = Run.new("knight", "normal", "meadow", 64)
	run.player.invincible = 1e9
	var massacre := false
	for i in range(14):
		var m = run._spawn_minion("ghoul", run.player.x + 300.0, run.player.y, 0, 1.0, 10.0, 0.0, 1)
		run.deal_damage(m, 10.0)
	for ev in run.events:
		if ev["t"] == "massacre":
			massacre = true
	_ok(massacre and run.burst_tier == 0, "순식간에 12킬 → 학살(SLAUGHTER) — 흔들림·멈칫·글자")
	# 제단
	run = Run.new("knight", "normal", "meadow", 65)
	run.player.invincible = 1e9
	var b0: float = run._dmg_bonus()
	run.activate_shrine("fury")
	run.activate_shrine("frenzy")
	run.activate_shrine("greed")
	_ok(is_equal_approx(run._dmg_bonus(), b0 * 2.0) and run._cd_bonus() < 0.7 and run.buffs.has("greed"), "제단: 분노 피해 ×2, 광란 쿨다운 -40%, 탐욕")
	run.tick(DT, Vector2.ZERO, false)    # 적 격자는 프레임 처음에 만들어진다
	var k1: int = run.kills
	run.activate_shrine("doom")
	_ok(run.kills > k1, "파멸의 제단: 주변 적을 날려 버린다 (%d킬)" % (run.kills - k1))
	run.shrine_timer = 0.0
	run.hit_stop = 0.0
	run.tick(DT, Vector2.ZERO, false)
	_ok(run.shrines.size() == 1, "제단이 때가 되면 근처에 나타난다")
	# 웹판 무제한 패시브의 Godot 판 상한
	run = Run.new("knight", "normal", "meadow", 66)
	var dmg_def: Dictionary = R.find_def(R.PASSIVE_POOL, "dmg_up")
	for i in range(int(C.PASSIVE_CAPS["dmg_up"])):
		run.apply_passive(dmg_def)
	var offered := false
	for c in run.passive_choices():
		if c["passive_id"] == "dmg_up":
			offered = true
	_ok(run.is_passive_maxed(dmg_def) and not offered and dmg_def["max"] == null, "공격력 패시브는 웹판에선 무제한, Godot 판은 %d스택에서 멈춘다" % int(C.PASSIVE_CAPS["dmg_up"]))
	var unreachable: Array = []
	for syn in R.SYNERGY_DEFS:
		for req in syn["requires"]:
			var cap := C.passive_cap(R.find_def(R.PASSIVE_POOL, req["id"]))
			if cap >= 0 and int(req["count"]) > cap:
				unreachable.append("%s(%s %d > %d)" % [syn["id"], req["id"], int(req["count"]), cap])
	_ok(unreachable.is_empty(), "Godot 판 패시브 상한으로도 시너지 %d종을 모두 만들 수 있다" % R.SYNERGY_DEFS.size(), str(unreachable))
	# 숨 고르기 재생 — 안 맞은 지 CALM_DELAY 초가 지나면 재생이 붙는다
	run = Run.new("knight", "normal", "meadow", 67)
	run.enemies.clear()
	run.wave_timer = -1e9
	run.player.weapon_cds.clear()
	run.player.hp = run.player.max_hp * 0.3
	run.last_hurt_t = 0.0
	var hp_a: float = run.player.hp
	for i in range(int(2.0 * 30)):
		run.tick(DT, Vector2.ZERO, false)
	var early_gain: float = run.player.hp - hp_a
	for i in range(int(C.CALM_DELAY * 30) - 60 + 2):
		run.tick(DT, Vector2.ZERO, false)
	var hp_b: float = run.player.hp
	for i in range(int(2.0 * 30)):
		run.tick(DT, Vector2.ZERO, false)
	var calm_gain: float = run.player.hp - hp_b
	_ok(calm_gain > early_gain * 3.0, "안 맞은 지 %d초 뒤 재생이 크게 붙는다 (2초 회복 %.1f → %.1f)" % [int(C.CALM_DELAY), early_gain, calm_gain])
	# 30분 곡선
	_ok(is_equal_approx(C.stage_seconds(C.PACE_KNEE), C.PACE_KNEE * C.PACE_EARLY) and C.stage_seconds(C.RUN_GOAL) > C.stage_seconds(C.PACE_KNEE),
		"단계 시간 — 20분까지 절반 속도, 그 뒤 빨라진다")
	run.stage_t = C.PROC_STAGE_CAP + 600.0
	var capped: float = run._trash_hp()
	run.stage_t = C.PROC_STAGE_CAP
	_ok(is_equal_approx(capped, run._trash_hp()), "발동 피해 기준은 PROC_STAGE_CAP 뒤로 더 크지 않는다 — 20분 뒤의 벽")


func _check_monsters_and_affixes() -> void:
	print("\n[Godot 판 몬스터 종류·정예 특성]")
	var run = Run.new("knight", "normal", "meadow", 41)
	run.player.weapon_cds.clear()
	run.player.invincible = 1e9
	var seen := {}
	run.elapsed = 800.0
	run.stage_t = C.stage_seconds(run.elapsed)    # 적 종류·등급은 단계 시간(6분 40초)으로 정해진다
	for i in range(30):
		run.spawn_wave()
	for e in run.enemies:
		seen[e.type] = true
	var missing: Array = []
	for t in C.ENEMY_TYPES:
		if not seen.has(t):
			missing.append(t)
	_ok(missing.is_empty(), "단계 6분대 웨이브에서 9종이 모두 나온다", "안 나온 것 " + str(missing))

	run = Run.new("knight", "normal", "meadow", 42)
	run.player.weapon_cds.clear()
	var sl = run._spawn_minion("slime", run.player.x + 200.0, run.player.y, 1, 50.0, 15.0, 50.0, 10)
	var n0: int = run.enemies.size()
	run.deal_damage(sl, 1000.0)
	var babies := 0
	for e in run.enemies:
		if e.type == "slime" and e.no_split:
			babies += 1
	_ok(babies == 2 and run.enemies.size() == n0 - 1 + 2, "산성 슬라임은 죽으면 작은 슬라임 2마리로 갈라진다")

	var revived := 0
	for i in range(40):
		var sk = run._spawn_minion("skeleton", run.player.x + 300.0, run.player.y + i, 1, 10.0, 15.0, 0.0, 5)
		run.deal_damage(sk, 100.0)
	_ok(run.revives.size() >= 5 and run.revives.size() <= 25, "해골 전사는 35%% 확률로 다시 일어날 준비 (%d/40)" % run.revives.size())
	for i in range(80):
		run.tick(1.0 / 30.0, Vector2.ZERO, false)
	for e in run.enemies:
		if e.type == "skeleton" and e.revived:
			revived += 1
	_ok(revived >= 5, "2초 뒤 해골이 다시 일어난다 (%d)" % revived)

	run = Run.new("knight", "normal", "meadow", 43)
	run.player.weapon_cds.clear()
	var hp0: float = run.player.hp
	var bm = run._spawn_minion("bomber", run.player.x + 50.0, run.player.y, 1, 40.0, 12.0, 0.0, 5)
	bm.attack_dmg = 20.0
	for i in range(40):
		run.tick(1.0 / 30.0, Vector2.ZERO, false)
	_ok(not run.enemies.has(bm) and run.player.hp < hp0, "폭탄 임프는 붙으면 점화 후 자폭해 플레이어를 다치게 한다", "%.1f → %.1f" % [hp0, run.player.hp])

	run = Run.new("knight", "normal", "meadow", 44)
	run.player.weapon_cds.clear()
	run.player.invincible = 1e9
	var gl = run._spawn_minion("golem", run.player.x + 80.0, run.player.y, 2, 500.0, 28.0, 20.0, 10)
	gl.slam_cd = 0.0
	run.tick(1.0 / 30.0, Vector2.ZERO, false)
	_ok(run.hazards.size() == 1 and gl.slam_t > 0.0, "룬 골렘은 가까우면 내려찍기 예고 장판을 깐다")
	var ch = run._spawn_minion("charger", run.player.x + 300.0, run.player.y, 2, 500.0, 25.0, 30.0, 10)
	ch.charge_cd = 0.0
	var states := {}
	for i in range(60):
		run.tick(1.0 / 30.0, Vector2.ZERO, false)
		states[ch.charge_state] = true
	_ok(states.has(1) and states.has(2), "돌격 멧돼지: 예고(1) → 돌진(2)", str(states.keys()))
	var wr = run._spawn_minion("wraith", run.player.x + 500.0, run.player.y, 1, 1000.0, 15.0, 0.0, 5)
	wr.ethereal = true
	var hpw: float = wr.hp
	run.player.crit_chance = 0.0
	run.deal_damage(wr, 100.0)
	_ok(is_equal_approx(hpw - wr.hp, 30.0), "망령이 반투명일 때 받는 피해 70% 감소", str(hpw - wr.hp))

	run = Run.new("knight", "normal", "meadow", 45)
	run.player.weapon_cds.clear()
	var el = run._spawn_minion("ghoul", run.player.x + 400.0, run.player.y, 1, 100.0, 15.0, 0.0, 5)
	el.elite = true
	run._roll_elite_affixes(el, C.ELITE_AFFIX_ORDER.size())
	_ok(el.affixes.size() == C.ELITE_AFFIX_ORDER.size() and is_equal_approx(el.max_hp, 200.0) and el.shield > 0.0, "정예 특성: 거대(체력 ×2)·보호막 적용")
	run.player.crit_chance = 0.0
	var before: int = run.enemies.size()
	run.deal_damage(el, 1e6)
	_ok(run.enemies.size() == before - 1 + 3 and run.hazards.size() == 1, "분열(하수인 3) + 폭발(예고 장판) 정예가 죽으면 둘 다 생긴다")


func _check_new_weapons_and_drops() -> void:
	print("\n[Godot 판 새 무기 · 드롭률]")
	var run = Run.new("knight", "normal", "meadow", 51)
	run.player.weapons.clear()
	run.player.weapon_levels.clear()
	run.player.weapon_cds.clear()
	run.player.main_weapon = ""
	run.add_weapon("whip")
	run.last_move_dir = Vector2(1, 0)
	var front = run._spawn_minion("ghoul", run.player.x + 80.0, run.player.y, 0, 1e6, 10.0, 0.0, 1)
	var back = run._spawn_minion("ghoul", run.player.x - 80.0, run.player.y, 0, 1e6, 10.0, 0.0, 1)
	run.fire_weapon("whip", 2.0)
	_ok(front.hp < 1e6 and is_equal_approx(back.hp, 1e6), "채찍 Lv1: 앞만 벤다")
	run.add_weapon("whip")
	run.add_weapon("whip")
	run.player.weapon_cds["whip"] = 0.0
	run.fire_weapon("whip", 2.0)
	_ok(back.hp < 1e6, "채찍 Lv3: 뒤쪽도 벤다")
	run.add_weapon("axe")
	run.player.weapon_cds["axe"] = 0.0
	run.player.main_weapon = "axe"
	run.build_enemy_grid()
	run.fire_weapon("axe", 2.0)
	var ax = null
	for p in run.projectiles:
		if p.type == "axe":
			ax = p
	var vy0: float = ax.vy
	run._update_projectiles(0.1)
	_ok(ax != null and ax.vy > vy0, "도끼는 위로 던져 중력으로 떨어진다")
	run.add_weapon("storm")
	run.player.main_weapon = "storm"
	run.player.weapon_cds["storm"] = 0.0
	var tgt = run._spawn_minion("ghoul", run.player.x + 120.0, run.player.y + 60.0, 0, 1e6, 10.0, 0.0, 1)
	run.build_enemy_grid()
	run.fire_weapon("storm", 2.0)
	var stunned := 0
	for e in run.enemies:
		if e.stun > 0.0:
			stunned += 1
	_ok(stunned >= 1, "뇌우: 낙뢰 맞은 적은 기절")

	_ok(is_equal_approx(R.ITEM_BOX_INTERVAL, 75.0) and R.BOSS_ITEM_BOXES == 1 and R.GOBLIN_ITEM_BOXES == 1, "아이템 상자 75초 · 보스 1개 · 고블린 1개")
	run = Run.new("knight", "normal", "meadow", 52)
	run.player.weapon_cds.clear()
	var pu := 0
	var n := 600
	for i in range(n):
		var e = run._spawn_minion("ghoul", run.player.x + 600.0, run.player.y, 1, 1.0, 15.0, 0.0, 1)
		e.elite = true
		run.deal_damage(e, 10.0)
	pu = run.powerups.size()
	_ok(pu > n * 0.22 and pu < n * 0.38, "정예 파워업 드롭 ≈ 30%% (%d/%d)" % [pu, n])
	_ok(run.player.rerolls <= 9 and run.gear_drops.size() > n * 0.05 and run.gear_drops.size() < n * 0.16, "정예 장비 드롭 ≈ 10%% (%d/%d)" % [run.gear_drops.size(), n])
	run = Run.new("knight", "normal", "meadow", 53)
	run.spawn_boss()
	var boss = null
	for e in run.enemies:
		if e.is_boss:
			boss = e
	run.deal_damage(boss, 1e9)
	_ok(run.item_boxes.size() == 1 and run.gear_drops.size() == 1 and run.bosses_killed == 1, "보스 처치: 상자 1개 + 장비 1개(희귀 이상)")
	_ok(C.RARITY_ORDER.find(run.gear_drops[0]["item"]["rarity"]) >= 2, "보스 장비는 희귀 이상")
