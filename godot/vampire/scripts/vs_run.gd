extends RefCounted
## 뱀파이어 서바이버 한 판 — public/arcade/vampire/game.js 의 게임 규칙(initGame·update·fireWeapon·
## dealDamage·killEnemy·spawnWave …)을 함수 단위로 옮겼다. 그리기·입력·UI 는 main.gd 에 있다.
## 규칙을 바꿀 땐 game.js 와 이 파일을 같이 고친다. 함수 이름은 JS 와 1:1 (camelCase → snake_case).
##
## 이식에서 달라지면 안 되는 곳 / 일부러 다르게 한 곳:
##  - 적 루프 안에서 피해를 주면 killEnemy 가 enemies 에서 빼낸다. JS 는 역방향 인덱스 루프로 버티지만
##    연쇄 폭발이 다른 적을 같이 죽이면 인덱스가 밀린다. 여기선 복사본(duplicate)을 돌고 dying 으로 거른다.
##  - JS 의 forEnemiesNear(cb) 는 콜백이다. GDScript 람다는 지역 변수를 '값'으로 잡아 cb 안의 대입이
##    밖으로 안 나온다 — 그래서 enemies_near() 가 후보 배열을 돌려주고 호출부가 직접 돈다.
##  - Math.random() 은 [0,1) 이고 randf() 는 [0,1] 이다. 배열 인덱스를 뽑을 땐 _pick() 을 쓴다.
##  - Dictionary == 는 내용 비교다. 적·투사체는 내부 클래스(참조 비교)이고, 타격 기록은 적 id 로 한다.
##  - 장비(vps-equipment.js)·협동·하이브리드 타워·메타 진행(코인·해금·업적)은 옮기지 않았다.
##    JS 식에 곱해지던 장비 배율(equipStats.*)은 장비가 없을 때의 값 1 로 지웠다. README 참고.

const R := preload("res://scripts/vs_rules.gd")
const C := preload("res://scripts/vs_content.gd")   # Godot 판 전용 콘텐츠 표


class Player:
	extends RefCounted
	var x := 0.0
	var y := 0.0
	var hp := 100.0
	var max_hp := 100.0
	var speed := 160.0
	var level := 1
	var xp := 0.0
	var weapons: Array = []         # 보유 무기 id
	var weapon_levels := {}         # id → 1..MAX_WEAPON_LEVEL
	var weapon_cds := {}            # id → 남은 쿨다운
	var main_weapon := ""           # "" = 미지정
	var passives := {}              # 패시브 id → 스택 수
	var dmg_mult := 1.0
	var cd_mult := 1.0
	var xp_range := 80.0
	var invincible := 0.0
	var temp_dmg_mult := 1.0
	var temp_dmg_timer := 0.0
	var temp_speed_mult := 1.0
	var temp_speed_timer := 0.0
	var slash_mods := {}            # cleave/rupture/echo → 레벨
	var rerolls := 0
	var crit_chance := 0.0
	var pierce_bonus := 0
	var regen_rate := 0.0
	var range_bonus := 1.0
	var ignite_chance := 0.0
	var venom_chance := 0.0
	var lifesteal := 0.0
	var aux_shield_time := 0.0
	var dash_speed_boost := 0.0
	var cascade_ready := false
	# ── Godot 판 ──
	var equip := {"helm": null, "armor": null, "boots": null, "ring": null}
	var gear := {}                  # 장비 옵션 합산 (stat → 값)
	var meta := {}                  # 영혼석 영구 강화 (stat → 값)
	var slow := 0.0                 # 냉기 정예 오라로 느려지는 비율 (매 프레임 다시 계산)


class Enemy:
	extends RefCounted
	var id := 0
	var x := 0.0
	var y := 0.0
	var hp := 1.0
	var max_hp := 1.0
	var speed := 0.0
	var size := 10.0
	var color := Color.WHITE
	var xp_val := 0
	var tier := 0
	var hurt_flash := 0.0
	var frozen := 0.0
	var spawn_t := 0.35
	var behavior := "chase"         # chase | archer | goblin | boss
	var attack_cd := 0.0
	var attack_base := 0.0
	var attack_range := 0.0
	var attack_dmg := 0.0
	var elite := false
	var elite_hue := Color("#f1c40f")
	var elite_type := 0
	var rage_on_death := false
	var shield := 0.0
	var max_shield := 0.0
	var blood_moon := false
	var goblin := false
	var is_mini := false
	var goblin_life := 0.0
	var goblin_life_max := 0.0
	var is_boss := false
	var boss_phase := 0
	var windup_active := false
	var windup_timer := 0.0
	var face_angle := 0.0
	var dying := false
	var burn_stacks := 0
	var burn_timer := 0.0
	var burn_dmg := 0.0
	var poison_timer := 0.0
	var poison_dmg := 0.0
	var knock_vx := 0.0
	var knock_vy := 0.0
	var has_rupture := false
	var rupture_time := 0.0
	var rupture_max_time := 0.0
	var rupture_dps := 0.0
	var rupture_burst := 0.0
	var last_hit_by := ""
	var grav_last_stack := -1.0
	var grav_stacks := 0
	# ── Godot 판: 몬스터 종류·정예 특성 ──
	var type := "ghoul"
	var affixes: Array = []         # 정예 특성 id
	var stun := 0.0                 # 기절 (뇌우) — 빙결과 같이 이동·공격을 멈춘다
	var slow := 0.0                 # 서리 왕관 4세트 오라 감속 비율
	var phase_t := 0.0              # 망령: 실체/반투명 주기
	var ethereal := false
	var fuse := -1.0                # 폭탄 임프: 0 이상이면 점화 중
	var charge_state := 0           # 돌격 멧돼지: 0 추적 / 1 예고 / 2 돌진
	var charge_t := 0.0
	var charge_dir := Vector2.ZERO
	var charge_cd := 2.0
	var slam_cd := 3.0              # 룬 골렘 내려찍기
	var slam_t := -1.0
	var summon_cd := 6.0
	var blink_cd := 4.0
	var revived := false            # 해골: 한 번 일어났으면 다시는 안 일어난다
	var no_split := false           # 분열로 생긴 개체는 다시 분열하지 않는다
	var regen := 0.0                # 흡혈 정예: 초당 회복 비율


class Proj:
	extends RefCounted
	var type := ""
	var x := 0.0
	var y := 0.0
	var vx := 0.0
	var vy := 0.0
	var r := 5.0
	var dmg := 0.0
	var life := 1.0
	var src := ""
	var angle := 0.0                # orb 기준각 / laser 방향
	var length := 0.0               # laser
	var orbit_r := 0.0              # orb 궤도 반경 (JS: R)
	var orb_idx := 0
	var orb_total := 1
	var pierce := 0                 # arrow
	var half_life := 0.0            # boomerang
	var flipped := false
	var hit_out := {}               # 적 id → true
	var hit_in := {}
	var tx := 0.0                   # arc / meteor 목표점
	var ty := 0.0
	var max_r := 0.0                # explosion
	var evolved := false
	var spd := 0.0                  # missile
	var turn := 0.0
	var aoe := 0.0
	var trail_t := 0.0
	var delay := 0.0                # meteor
	var grav := 0.0                 # axe: 중력 가속도
	var spin := 0.0                 # axe: 그림용 회전각


var rng := RandomNumberGenerator.new()
var character: Dictionary
var difficulty: Dictionary
var map_def: Dictionary
var survive_goal := 600.0

## playing | levelup | itembox | paused | victory_prompt | dead | win
var state := "playing"
var player: Player
var enemies: Array = []
var projectiles: Array = []
var xp_gems: Array = []           # {x, y, val, attracting}
var particles: Array = []         # {x, y, vx, vy, color, size, life, max_life}
var player_trail: Array = []      # {x, y, life, chain_color}
var chain_explosions: Array = []  # {x, y, range, dmg, delay, src}
var slash_echoes: Array = []
var enemy_projectiles: Array = [] # {x, y, vx, vy, r, dmg, life}
var rings: Array = []             # {x, y, r, max_r, life, max_life, color}
var powerups: Array = []          # {x, y, def, life, max_life, pulse_t}
var item_boxes: Array = []        # {x, y, life, pulse_t}
var spectral_fields: Array = []
var toxic_fields: Array = []
var dash_afterimages: Array = []
var damage_numbers: Array = []    # {x, y, val, life, max_life, tier}
var float_texts: Array = []       # {text, life, max_life, screen_space, color, size, x, y}
var choices: Array = []           # 지금 고를 수 있는 선택지 (levelup / itembox)

var elapsed := 0.0
var kills := 0
var last_kill_time := -1.0
var wave_timer := 0.0
var wave_count := 0
var view_scale := 1.0
var dash_cd := 0.0
var dash_effect = null            # null | {x, y, end_x, end_y, angle, life, max_life, range, width, cleave, is_chain, chain_idx}
var screen_shake := 0.0
var hit_stop := 0.0
var hurt_screen_flash := 0.0
var evolve_flash := 0.0
var overdrive_charge := 0.0
var overdrive_active := 0.0
var overdrive_flash := 0.0
var last_move_dir := Vector2(1, 0)
var enemy_repo_budget := 0.0
var enemy_far_count := 0
var item_box_timer := 0.0
var goblin_timer := 0.0
var infinite_mode := false
var infinite_dialog_shown := false
var infinite_elapsed := 0.0
var meteor_call_timer := 7.0
var kill_streak_timestamps: Array = []
var dash_chain_window := 0.0
var dash_chain_count := 0
var last_dash_key_state := false
var next_boss_time := 300.0
var boss_active := false
var boss_warning := 0.0
var dmg_source := ""
var blood_moon_timer := 150.0
var blood_moon_active := 0.0
var gold_rush_done := false
var combo_count := 0
var combo_timer := 0.0
var combo_milestone_idx := 0
var milestones := {}
var free_reroll_used := false
var choice_kind := ""             # levelup | itembox — 리롤이 어떤 빌더를 다시 부를지
var low_hp_alert_cooldown := 0.0
var low_hp_pulse := 0.0

# ── Godot 판 ──
var events: Array = []            # 화면·소리용 사건 {t, ...} — main.gd 가 매 프레임 비운다
var gear_drops: Array = []        # 땅에 떨어진 장비 {x, y, item, life, pulse_t}
var hazards: Array = []           # 적이 남기는 예고 폭발 {x, y, r, t, max_t, dmg, color}
var revives: Array = []           # 다시 일어날 해골 {x, y, t, tier, hp}
var fire_trails: Array = []       # 잿불 군주 4세트 불길 {x, y, r, life, max_life, dmg, tick}
var storm_set_timer := 5.0
var bosses_killed := 0
var legendaries_found := 0
var loot_found := 0
var meta_levels := {}             # 영혼석 강화 레벨 (id → 레벨)

var _enemy_grid := {}             # Vector2i → Array[Enemy]
var _next_enemy_id := 1
var _active_synergies := {}       # 시너지 id → true (apply_passive 때만 갱신)


func _init(character_id: String = "knight", difficulty_id: String = "normal", map_id: String = "meadow", seed_value: int = -1, meta: Dictionary = {}) -> void:
	meta_levels = meta
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()
	character = R.find_def(R.CHARACTER_DEFS, character_id)
	if character.is_empty():
		character = R.CHARACTER_DEFS[0]
	difficulty = R.find_def(R.DIFFICULTY_DEFS, difficulty_id)
	if difficulty.is_empty():
		difficulty = R.DIFFICULTY_DEFS[1]
	map_def = R.find_def(R.MAP_DEFS, map_id)
	if map_def.is_empty():
		map_def = R.MAP_DEFS[0]
	survive_goal = float(map_def["durationSeconds"])
	_init_game()


# ── 유틸 ───────────────────────────────────────────────────────────

func _rand() -> float:
	return rng.randf()


## [0, n) 정수 — randf() 는 1.0 을 낼 수 있어 floor(randf()*n) 은 n 이 될 수 있다
func _pick(n: int) -> int:
	return rng.randi_range(0, n - 1)


static func _dist(ax: float, ay: float, bx: float, by: float) -> float:
	return sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by))


static func _dist_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
	var dx := bx - ax
	var dy := by - ay
	var len_sq := dx * dx + dy * dy
	if len_sq == 0.0:
		return _dist(px, py, ax, ay)
	var t := clampf(((px - ax) * dx + (py - ay) * dy) / len_sq, 0.0, 1.0)
	return _dist(px, py, ax + t * dx, ay + t * dy)


func _rb() -> float:
	return player.range_bonus * (1.0 + _gear("range"))


# ── Godot 판: 장비·영구 강화·세트 효과 헬퍼 ───────────────────────────

## 장비 옵션 + 영혼석 강화 합 (상한 적용)
func _gear(k: String) -> float:
	var v := float(player.gear.get(k, 0.0)) + float(player.meta.get(k, 0.0))
	if C.STAT_CAPS.has(k):
		v = minf(v, float(C.STAT_CAPS[k]))
	return v


func _emit(t: String, data: Dictionary = {}) -> void:
	if events.size() >= 600:
		return
	data["t"] = t
	events.append(data)


func set_count(set_id: String) -> int:
	var n := 0
	for slot in C.GEAR_SLOTS:
		var it = player.equip[slot]
		if it != null and it["set"] == set_id:
			n += 1
	return n


func has_legendary(id: String) -> bool:
	for slot in C.GEAR_SLOTS:
		var it = player.equip[slot]
		if it != null and it["legendary"] == id:
			return true
	return false


## 무기 피해에 곱하는 추가 배율 — 장비 공격력, 광전사의 투구, 피의 서약 4세트
func _dmg_bonus() -> float:
	var m := 1.0 + _gear("dmg")
	if has_legendary("berserker"):
		m *= 1.0 + minf(floorf(combo_count / 20.0) * 0.10, 0.60)
	if set_count("blood") >= 4 and get_player_hp_ratio() < 0.5:
		m *= 1.4
	return m


func _cd_bonus() -> float:
	var m := 1.0 - _gear("cd")
	if set_count("blood") >= 4 and get_player_hp_ratio() < 0.5:
		m *= 0.8
	return m


func _xp_range() -> float:
	return player.xp_range * (1.0 + _gear("pickup"))


func _luck() -> float:
	return 1.0 + _gear("luck") + (0.5 if has_legendary("greed") else 0.0)


## 장비 옵션 합산을 다시 계산한다 — 최대 체력은 차이만큼 바로 반영
func _refresh_gear() -> void:
	var old_hp := float(player.gear.get("max_hp", 0.0))
	var g := {}
	for slot in C.GEAR_SLOTS:
		var it = player.equip[slot]
		if it == null:
			continue
		for a in it["affixes"]:
			g[a["stat"]] = float(g.get(a["stat"], 0.0)) + float(a["val"])
	if has_legendary("greed"):
		g["xp"] = float(g.get("xp", 0.0)) + 0.25
	if set_count("blood") >= 2:
		g["lifesteal"] = float(g.get("lifesteal", 0.0)) + 0.03
	player.gear = g
	var diff := float(g.get("max_hp", 0.0)) - old_hp
	player.max_hp += diff
	if diff > 0.0:
		player.hp += diff
	player.hp = minf(player.hp, player.max_hp)


## 장비를 주웠을 때: 더 좋으면 장착, 아니면 분해해서 경험치로
func pick_up_gear(item: Dictionary) -> void:
	var slot: String = item["slot"]
	var cur = player.equip[slot]
	var new_p := C.item_power(item) + _set_keep_bonus(item)
	var cur_p := -1.0 if cur == null else C.item_power(cur) + _set_keep_bonus(cur)
	loot_found += 1
	if item["rarity"] == "legendary":
		legendaries_found += 1
	if new_p > cur_p:
		var before := {}
		for sid in C.SET_ORDER:
			before[sid] = set_count(sid)
		player.equip[slot] = item
		_refresh_gear()
		_emit("equip", {"item": item})
		var rdef: Dictionary = C.RARITIES[item["rarity"]]
		_screen_text("%s %s 장착!" % ["★" if item["rarity"] == "legendary" else "▲", item["name"]], 2.4, rdef["color"], 19)
		for sid in C.SET_ORDER:
			var n := set_count(sid)
			if (n >= 2 and int(before[sid]) < 2) or (n >= 4 and int(before[sid]) < 4):
				var sd: Dictionary = C.SETS[sid]
				_screen_text("%s %s %d세트 효과 발동!" % [sd["icon"], sd["name"], 4 if n >= 4 else 2], 3.0, sd["color"], 21)
				_emit("set", {"set": sid, "count": n})
	else:
		var xp := 6.0 + C.item_power(item) * 2.0 * (1.0 + elapsed / 300.0)
		gain_xp(xp)
		_emit("salvage", {"item": item})
		_screen_text("⚗ %s 분해 +%d XP" % [item["name"], roundi(xp)], 1.6, "#a78bfa", 14)


## 세트 조각은 이미 같은 세트를 차고 있을수록 가치가 크다 (세트를 깨지 않도록)
func _set_keep_bonus(item: Dictionary) -> float:
	if item["set"] == "":
		return 0.0
	var same := 0
	for slot in C.GEAR_SLOTS:
		var it = player.equip[slot]
		if it != null and it["set"] == item["set"] and slot != item["slot"]:
			same += 1
	return same * 4.0


## 장비 드롭 굴림 — source: normal / elite / boss / goblin / mini_goblin
func _maybe_drop_gear(x: float, y: float, source: String) -> void:
	if _rand() >= float(C.LOOT_CHANCE[source]) * _luck():
		return
	var minute := elapsed / 60.0
	var rarity := C.roll_rarity(rng, String(C.LOOT_MIN_RARITY.get(source, "")), minute)
	var slot: String = C.GEAR_SLOTS[_pick(C.GEAR_SLOTS.size())]
	var item := C.roll_item(rng, slot, rarity, floori(minute) + 1)
	gear_drops.append({"x": x, "y": y, "item": item, "life": 40.0, "pulse_t": 0.0})
	_emit("loot", {"x": x, "y": y, "rarity": rarity})


## 플레이어 피격 — 받는 피해 감소·가시 갑옷·피의 서약 4세트. 죽으면 true
func _hurt_player(amount: float, inv: float, contact: bool) -> bool:
	amount *= 1.0 - _gear("armor")
	player.hp -= amount
	player.invincible = inv
	hurt_screen_flash = 0.28
	_emit("hurt", {"amount": amount})
	if contact and has_legendary("thornmail"):
		var r := 100.0 * _rb()
		for e in enemies.duplicate():
			if not e.dying and _dist(e.x, e.y, player.x, player.y) < r:
				deal_damage(e, player.max_hp * 0.4, true)
		_ring(player.x, player.y, 10, r, 0.3, "#b2bec3")
	if set_count("blood") >= 4:
		var br := 110.0 * _rb()
		for e in enemies.duplicate():
			if not e.dying and _dist(e.x, e.y, player.x, player.y) < br:
				deal_damage(e, player.max_hp * 0.3, true)
		_ring(player.x, player.y, 8, br, 0.35, "#e74c3c")
		_emit("explosion", {"x": player.x, "y": player.y, "r": br, "color": "#e74c3c"})
	if player.hp <= 0.0:
		end_game("dead")
		return true
	return false


func _shake(add: float, cap: float) -> void:
	screen_shake = minf(screen_shake + add, cap)


## "#rrggbb" 문자열이나 Color 를 Color 로 (적 색은 Color, 표의 색은 문자열이다)
static func _col(c) -> Color:
	if c is Color:
		return c
	return Color(str(c))


func _ring(x: float, y: float, r: float, max_r: float, life: float, color) -> void:
	rings.append({"x": x, "y": y, "r": r, "max_r": max_r, "life": life, "max_life": life, "color": _col(color)})


func _screen_text(text: String, life: float, color, size: int) -> void:
	float_texts.append({"text": text, "life": life, "max_life": life, "screen_space": true, "color": _col(color), "size": size, "x": 0.0, "y": 0.0})


func _world_text(x: float, y: float, text: String, life: float, color, size: int) -> void:
	float_texts.append({"text": text, "life": life, "max_life": life, "screen_space": false, "color": _col(color), "size": size, "x": x, "y": y})


func spawn_particle(x: float, y: float, color, size: float, life: float) -> void:
	if particles.size() >= 320:
		return    # 렉 방지 파티클 예산
	var angle := _rand() * TAU
	var spd := 40.0 + _rand() * 80.0
	particles.append({"x": x, "y": y, "vx": cos(angle) * spd, "vy": sin(angle) * spd, "color": _col(color), "size": size, "life": life, "max_life": life})


func _new_proj(type: String, x: float, y: float) -> Proj:
	var p := Proj.new()
	p.type = type
	p.x = x
	p.y = y
	projectiles.append(p)
	return p


func _new_enemy() -> Enemy:
	var e := Enemy.new()
	e.id = _next_enemy_id
	_next_enemy_id += 1
	return e


func _chain_explosion(x: float, y: float, range_: float, dmg: float, delay: float, src: String) -> void:
	chain_explosions.append({"x": x, "y": y, "range": range_, "dmg": dmg, "delay": delay, "src": src})


func get_survive_goal() -> float:
	return survive_goal


# ── 적 공간 분할 그리드 — 매 프레임 1회 재구성, 충돌/탐색을 근접 셀로 한정 ──

func build_enemy_grid() -> void:
	_enemy_grid.clear()
	for e in enemies:
		var key := Vector2i(floori(e.x / R.GRID_CELL), floori(e.y / R.GRID_CELL))
		if not _enemy_grid.has(key):
			_enemy_grid[key] = []
		_enemy_grid[key].append(e)


## (x,y) 주변 reach 픽셀 내 셀의 적 후보 (JS forEnemiesNear 의 콜백 대신 배열을 돌려준다)
func enemies_near(x: float, y: float, reach: float) -> Array:
	var out: Array = []
	var pad := reach + 24.0
	var min_cx := floori((x - pad) / R.GRID_CELL)
	var max_cx := floori((x + pad) / R.GRID_CELL)
	var min_cy := floori((y - pad) / R.GRID_CELL)
	var max_cy := floori((y + pad) / R.GRID_CELL)
	for cx in range(min_cx, max_cx + 1):
		for cy in range(min_cy, max_cy + 1):
			var cell = _enemy_grid.get(Vector2i(cx, cy))
			if cell != null:
				out.append_array(cell)
	return out


## max_reach 0 = 반경 700 을 보고, 없으면 전체 스캔 (JS nearestEnemyNear(x, y) 와 같다)
func nearest_enemy_near(x: float, y: float, max_reach: float = 0.0) -> Enemy:
	var best: Enemy = null
	var bd := INF
	for e in enemies_near(x, y, max_reach if max_reach > 0.0 else 700.0):
		if e.dying:
			continue
		var d2: float = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y)
		if d2 < bd:
			bd = d2
			best = e
	if best != null or max_reach > 0.0:
		return best
	for e in enemies:
		if e.dying:
			continue
		var d2: float = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y)
		if d2 < bd:
			bd = d2
			best = e
	return best


func nearest_enemy() -> Enemy:
	return nearest_enemy_near(player.x, player.y)


# ── 시작 ───────────────────────────────────────────────────────────

func _init_game() -> void:
	player = Player.new()
	var max_hp := float(R.BASE_HP + int(character["hpBonus"]))
	player.hp = max_hp
	player.max_hp = max_hp
	player.speed = R.PLAYER_SPEED * float(character["speedMult"])
	player.dmg_mult = float(character["dmgMult"])
	player.cd_mult = float(character["cdMult"])
	player.xp_range = 80.0 * float(character["xpRangeMult"])
	next_boss_time = float(difficulty["bossInterval"])
	# 영혼석 영구 강화
	for id in C.SOUL_UPGRADE_ORDER:
		var lv := int(meta_levels.get(id, 0))
		if lv <= 0:
			continue
		var u: Dictionary = C.SOUL_UPGRADES[id]
		var st: String = u["stat"]
		player.meta[st] = float(player.meta.get(st, 0.0)) + float(u["per"]) * lv
	var meta_hp := float(player.meta.get("max_hp", 0.0))
	player.max_hp += meta_hp
	player.hp += meta_hp
	for id in character["startWeapons"]:
		add_weapon(id)
	spawn_wave()


func add_weapon(id: String) -> void:
	if player.weapons.has(id):
		# 이미 보유 → 레벨업 (최대 레벨까지)
		if int(player.weapon_levels.get(id, 1)) < R.MAX_WEAPON_LEVEL:
			player.weapon_levels[id] = int(player.weapon_levels.get(id, 1)) + 1
		return
	player.weapons.append(id)
	player.weapon_levels[id] = 1
	player.weapon_cds[id] = 0.0
	# 공격 무기 중 메인이 없으면 첫 공격 무기를 자동으로 메인 지정
	if R.is_attack_weapon(id) and player.main_weapon == "":
		player.main_weapon = id
	elif R.is_attack_weapon(id):
		_screen_text("⚙ %s 보조로 추가 — 무기 칸을 눌러 메인 변경" % R.WEAPON_DEFS[id]["name"], 2.6, "#74b9ff", 15)


## 진화: 기본 무기를 진화 무기로 교체 (최대 레벨 상태 유지)
func evolve_weapon(evo: Dictionary) -> void:
	var base: String = evo["base"]
	var evo_id: String = evo["id"]
	var base_idx := player.weapons.find(base)
	if base_idx == -1:
		return
	player.weapons[base_idx] = evo_id
	player.weapon_levels[evo_id] = R.MAX_WEAPON_LEVEL
	player.weapon_levels.erase(base)
	player.weapon_cds.erase(base)
	player.weapon_cds[evo_id] = 0.0
	if player.main_weapon == base:
		player.main_weapon = evo_id
	show_evolution_celebration(evo)


func show_evolution_celebration(evo: Dictionary) -> void:
	var evolved: Dictionary = R.WEAPON_DEFS[evo["id"]]
	for i in range(84):
		var ring := i % 3
		spawn_particle(player.x, player.y, "#f1c40f" if ring == 0 else ("#ffffff" if ring == 1 else "#8e44ad"), 5.0 + _rand() * 10.0, 0.7 + _rand() * 0.5)
	_shake(0.65, 0.9)
	hit_stop = maxf(hit_stop, 0.16)
	evolve_flash = 0.55
	_emit("evolve", {"id": evo["id"]})
	_screen_text("EVOLVED: %s %s" % [evolved["icon"], evolved["name"]], 3.0, "#f1c40f", 25)


## 패시브 적용 + 보유 기록 + 시너지 신규 해금 알림 (JS PASSIVE_POOL[].apply 가 여기 들어 있다)
func apply_passive(pv: Dictionary) -> void:
	var prev_active: Array = []
	for s in R.SYNERGY_DEFS:
		if has_synergy(s["id"]):
			prev_active.append(s["id"])
	var p := player
	match String(pv["id"]):
		"hp_up":
			p.max_hp += 20.0
			p.hp = minf(p.hp + 30.0, p.max_hp)
		"spd_up":
			p.speed *= 1.12
		"dmg_up":
			p.dmg_mult *= 1.18
		"cd_up":
			p.cd_mult *= 0.88
		"magnet":
			p.xp_range *= 1.6
		"crit":
			p.crit_chance += 0.15
		"pierce_up":
			p.pierce_bonus += 2
		"regen":
			p.regen_rate += 0.02
		"range_up":
			p.range_bonus *= 1.18
		"ignite":
			p.ignite_chance += 0.20
		"venom":
			p.venom_chance += 0.15
		"lifesteal":
			p.lifesteal += 0.03
	p.passives[pv["id"]] = int(p.passives.get(pv["id"], 0)) + 1
	_refresh_synergies()
	for s in R.SYNERGY_DEFS:
		if has_synergy(s["id"]) and not prev_active.has(s["id"]):
			_screen_text("✨ 시너지 해금: %s %s!" % [s["icon"], s["name"]], 3.0, "#c39bd3", 17)


func passive_level(id: String) -> int:
	return int(player.passives.get(id, 0))


func is_passive_maxed(pv: Dictionary) -> bool:
	return pv["max"] != null and passive_level(pv["id"]) >= int(pv["max"])


func slash_mod_level(id: String) -> int:
	return int(player.slash_mods.get(id, 0))


func apply_slash_support(def: Dictionary) -> void:
	var current := slash_mod_level(def["id"])
	if current >= int(def["max"]):
		return
	player.slash_mods[def["id"]] = current + 1
	_screen_text("SLASH SUPPORT: %s" % def["name"], 1.8, "#f8c8ff", 17)


func slash_stats() -> Dictionary:
	var cleave := slash_mod_level("cleave")
	var rupture := slash_mod_level("rupture")
	var echo := slash_mod_level("echo")
	return {
		"cleave": cleave,
		"rupture": rupture,
		"echo": echo,
		"range": R.DASH_RANGE + cleave * 18,
		"width": 26.0 + cleave * 9,
		"damage_mult": 1.0 + cleave * 0.18 + mini(combo_count, 30) * 0.01,
		"rupture_dps_mult": (0.16 + rupture * 0.08) if rupture > 0 else 0.0,
		"rupture_time": (1.8 + rupture * 0.35) if rupture > 0 else 0.0,
		"echo_count": echo,
	}


# ── 무기 활성화 / 시너지 헬퍼 ────────────────────────────────────────

## 메인 무기 (미지정 시 첫 번째 공격 무기)
func get_main_weapon() -> String:
	if player.main_weapon != "" and player.weapons.has(player.main_weapon):
		return player.main_weapon
	for w in player.weapons:
		if R.is_attack_weapon(w):
			return w
	return ""


## 메인 무기만 독립 발사 — 방어 무기는 항상 발사
func is_weapon_active(id: String) -> bool:
	if not R.is_attack_weapon(id):
		return true
	return id == get_main_weapon()


## 보조 무기 계열 (보유 중, 공격 무기, 메인 계열 제외, 중복 제거)
func get_aux_families() -> Array:
	var main_id := get_main_weapon()
	var main_fam: String = R.weapon_family(main_id) if main_id != "" else ""
	var out: Array = []
	for w in player.weapons:
		if not R.is_attack_weapon(w) or w == main_id:
			continue
		var f: String = R.weapon_family(w)
		if f == main_fam or out.has(f):
			continue
		out.append(f)
	return out


## 메인 무기 지정 (무기 칸 클릭) — 공격 무기만
func set_main_weapon(id: String) -> void:
	if not R.WEAPON_DEFS.has(id) or not R.is_attack_weapon(id) or not player.weapons.has(id):
		return
	if player.main_weapon == id:
		return
	var old_main := player.main_weapon
	player.main_weapon = id
	# 이전 메인이 궤도형이면 잔류 구슬 즉시 제거 — 변경이 바로 체감되도록
	if old_main == "orb" or old_main == "blackhole":
		projectiles = projectiles.filter(func(p): return p.type != "orb" and p.type != "blackhole")
	_screen_text("⭐ %s 메인 지정" % R.WEAPON_DEFS[id]["name"], 1.8, "#f1c40f", 16)


## 메인 무기 발사마다 각 보조 계열의 오버레이 효과
func trigger_aux_effects(target: Enemy, base_dmg: float) -> void:
	if target == null:
		return
	var aux_fams := get_aux_families()
	if aux_fams.is_empty():
		return
	var tx := target.x
	var ty := target.y
	var rng_mul := _rb()
	for fam in aux_fams:
		var def: Dictionary = R.AUX_EFFECT_DEFS.get(fam, {})
		if def.is_empty() or _rand() > float(def["proc"]):
			continue
		dmg_source = fam
		match String(fam):
			"bomb":
				_chain_explosion(tx, ty, 65.0 * rng_mul, base_dmg * 0.45, 0.0, "bomb")
				_ring(tx, ty, 4, 60.0 * rng_mul, 0.18, "#e67e22")
			"chain":
				var cx := tx
				var cy := ty
				var hit := {target.id: true}
				for b in range(2):
					var best: Enemy = null
					var bd := 240.0
					for e in enemies:
						if e.dying or hit.has(e.id):
							continue
						var d := _dist(e.x, e.y, cx, cy)
						if d < bd:
							bd = d
							best = e
					if best == null:
						break
					hit[best.id] = true
					var arc := _new_proj("arc", cx, cy)
					arc.tx = best.x
					arc.ty = best.y
					arc.life = 0.18
					deal_damage(best, base_dmg * 0.55)
					cx = best.x
					cy = best.y
			"laser":
				var ang := atan2(ty - player.y, tx - player.x)
				var lz := _new_proj("laser", player.x, player.y)
				lz.angle = ang
				lz.r = 5
				lz.dmg = base_dmg * 0.65
				lz.life = 0.16
				lz.length = 160.0 * rng_mul
				lz.src = "laser"
			"boomerang":
				for b in range(3):
					var ba := atan2(ty - player.y, tx - player.x) + (b - 1) * 0.38
					var bm := _new_proj("boomerang", player.x, player.y)
					bm.vx = cos(ba) * 310.0
					bm.vy = sin(ba) * 310.0
					bm.r = 5
					bm.dmg = base_dmg * 0.35
					bm.life = 0.9
					bm.half_life = 0.45
					bm.src = "boomerang"
			"orb":
				var aoe_r := 70.0 * rng_mul
				for e in enemies.duplicate():
					if not e.dying and _dist(e.x, e.y, tx, ty) < aoe_r:
						deal_damage(e, base_dmg * 0.40)
				_ring(tx, ty, 4, aoe_r, 0.25, "#3498db")
			"nova":
				_chain_explosion(tx, ty, 85.0 * rng_mul, base_dmg * 0.50, 0.0, "nova")
			"scythe":
				var s_ang := atan2(ty - player.y, tx - player.x)
				var s_r := 100.0 * rng_mul
				for e in enemies.duplicate():
					if e.dying:
						continue
					if _dist(e.x, e.y, player.x, player.y) > s_r:
						continue
					var e_a := atan2(e.y - player.y, e.x - player.x)
					var diff := absf(fmod(e_a - s_ang + PI * 3.0, TAU) - PI)
					if diff < PI * 0.55:
						deal_damage(e, base_dmg * 0.50)
				_ring(player.x, player.y, 6, s_r, 0.2, "#ecf0f1")
			"arrow":
				var a_a := atan2(ty - player.y, tx - player.x)
				var ar := _new_proj("arrow", player.x, player.y)
				ar.vx = cos(a_a) * 420.0
				ar.vy = sin(a_a) * 420.0
				ar.r = 5
				ar.dmg = base_dmg * 0.50
				ar.life = 0.8
				ar.pierce = 3 + player.pierce_bonus
				ar.src = "arrow"
			"shield":
				player.aux_shield_time += 0.5
			"missile":
				var a0 := _rand() * TAU
				var ms := _new_proj("missile", player.x, player.y)
				ms.vx = cos(a0) * 300.0
				ms.vy = sin(a0) * 300.0
				ms.spd = 300
				ms.turn = 5.5
				ms.r = 6
				ms.dmg = base_dmg * 0.55
				ms.aoe = 50.0 * rng_mul
				ms.life = 2.4
				ms.src = "missile"
			"meteor":
				spawn_meteor_strike(tx, ty, base_dmg * 0.60, 80.0 * rng_mul, false, "meteor", 0.0)
			"toxic":
				toxic_fields.append({"x": tx, "y": ty, "range": 55.0 * rng_mul, "dmg": base_dmg * 0.25, "life": 2.2, "max_life": 2.2, "tick_timer": 0.0, "evolved": false, "spread_cd": 1.2, "spawned": false})
			"whip":
				_whip_strike(base_dmg * 0.45, 120.0 * rng_mul, 0, false, 0.7)
			"axe":
				_throw_axe(base_dmg * 0.5, 300.0 * rng_mul, 0.0, false, 3)
			"storm":
				_strike_at(target.x, target.y, base_dmg * 0.6, 40.0 * rng_mul, 0.25, false)


## 시너지 조건 충족 여부 — 피해 한 번마다 여러 번 불리므로, 패시브가 바뀔 때만 다시 계산해 둔다
func has_synergy(id: String) -> bool:
	return _active_synergies.has(id)


func _refresh_synergies() -> void:
	_active_synergies.clear()
	for def in R.SYNERGY_DEFS:
		var ok := true
		for req in def["requires"]:
			if int(player.passives.get(req["id"], 0)) < int(req["count"]):
				ok = false
		if ok:
			_active_synergies[def["id"]] = true


## 지금 진화 가능한 조합
func available_evolutions() -> Array:
	var out: Array = []
	for evo in R.EVOLUTION_DEFS:
		if player.weapons.has(evo["base"]) \
				and int(player.weapon_levels.get(evo["base"], 1)) >= R.MAX_WEAPON_LEVEL \
				and int(player.passives.get(evo["req"], 0)) > 0 \
				and not player.weapons.has(evo["id"]):
			out.append(evo)
	return out


## 이지스 진화 효과: 보호막 발동 시 주변 적에게 반사 피해
func aegis_reflect(dmg: float, range_: float) -> void:
	for e in enemies.duplicate():
		if not e.dying and _dist(e.x, e.y, player.x, player.y) < range_:
			deal_damage(e, dmg)
	spawn_particle(player.x, player.y, "#5dade2", 30, 0.6)


# ── 적 생성 ─────────────────────────────────────────────────────────

func spawn_wave() -> void:
	var hp_mult := float(difficulty["enemyHpMult"]) * float(map_def["enemyHpMult"])
	var spawn_mult := float(difficulty["spawnMult"]) * float(map_def["spawnMult"])
	wave_count += 1
	var is_horde: bool = wave_count % R.HORDE_WAVE_EVERY == 0
	if is_horde:
		_screen_text("🔥 HORDE WAVE!", 2.0, "#e74c3c", 20)
	# 난이도 곡선 — 1 + 0.9m + 0.06m², 5분 이후 압박 배율 +12%/스택
	var m := elapsed / 60.0
	var pressure_stacks := floori((m - 5.0) * 0.8) if m > 5.0 else 0
	var pressure_mult := 1.0 + pressure_stacks * 0.12
	var diff := (1.0 + 0.9 * m + 0.06 * m * m) * pressure_mult
	# 무한 모드 — 체력은 초지수로 폭증
	var inf_m := infinite_elapsed / 60.0 if infinite_mode else 0.0
	var inf_hp_mult := pow(1.5, inf_m + inf_m * inf_m * 0.06) if infinite_mode else 1.0
	var inf_spd_mult := (1.0 + inf_m * 0.22) if infinite_mode else 1.0
	var inf_elite_rate := minf(0.06 + inf_m * 0.065, 0.55) if infinite_mode else 0.06
	var mega_horde := infinite_mode and wave_count % 35 == 0
	if mega_horde:
		_screen_text("🌀 무한 메가 호드!!", 3.0, "#9b59b6", 28)
	var et := floori(elapsed / 7.0)
	var normal_max := mini(20 + et, 160) if infinite_mode else mini(20 + et, 120)
	var horde_max := normal_max
	if is_horde or mega_horde:
		var et6 := floori(elapsed / 6.0)
		horde_max = mini(70 + et6, 320) if infinite_mode else mini(50 + et6, 200)
	var base_count := ceili(horde_max * spawn_mult)
	for i in range(base_count):
		if enemies.size() >= R.MAX_ENEMIES:
			break
		var angle := _rand() * TAU
		var spawn_dist := 350.0 + _rand() * 150.0
		var tier_roll := _rand()
		var tier := 0
		if infinite_mode:
			tier = 2 if tier_roll < minf(0.1 + inf_m * 0.12, 0.7) else 1
		elif elapsed < 45:
			tier = 0
		elif elapsed < 120:
			tier = 1 if tier_roll < 0.25 else 0
		elif elapsed < 180:
			tier = 1 if tier_roll < 0.35 else 0
		elif elapsed < 300:
			tier = 2 if tier_roll < 0.12 else (1 if tier_roll < 0.45 else 0)
		elif elapsed < 450:
			tier = 2 if tier_roll < 0.22 else (1 if tier_roll < 0.5 else 0)
		else:
			tier = 2 if tier_roll < 0.32 else (1 if tier_roll < 0.55 else 0)
		# 원거리 공격형(archer): tier1 40%, tier2 100%
		var b_roll := _rand()
		var behavior := "archer" if (tier == 2 or (tier == 1 and b_roll < 0.4)) else "chase"
		# Godot 판: 몬스터 종류. 상급(tier2)은 궁수만이 아니라 룬 골렘·돌격 멧돼지도 나온다
		var etype := _pick_enemy_type(tier, behavior)
		if etype == "golem" or etype == "charger":
			behavior = "chase"
		var attack_base := (4.0 if tier == 2 else 3.2) if behavior == "archer" else 0.0
		var e := _new_enemy()
		e.x = player.x + cos(angle) * spawn_dist
		e.y = player.y + sin(angle) * spawn_dist
		e.hp = [30.0, 80.0, 200.0][tier] * diff * hp_mult * inf_hp_mult
		e.max_hp = e.hp
		e.speed = ([75.0, 55.0, 35.0][tier] + _rand() * 20.0) * float(difficulty["enemySpeedMult"]) * inf_spd_mult
		e.size = [10.0, 15.0, 22.0][tier]
		e.color = Color(["#e74c3c", "#1abc9c" if behavior == "archer" else "#9b59b6", "#c0392b"][tier])
		e.xp_val = roundi([5, 13, 30][tier] * (1.0 + elapsed / 500.0))
		e.tier = tier
		e.behavior = behavior
		e.attack_cd = _rand() * attack_base
		e.attack_base = attack_base
		e.attack_range = (280.0 if tier == 2 else 220.0) if behavior == "archer" else 0.0
		e.attack_dmg = roundf([10, 20, 38][tier] * (1.0 + elapsed / 500.0) * float(difficulty["enemyDmgMult"]))
		# 정예 승격 — 6%, 무한 모드는 inf_elite_rate
		if tier >= 1 and _rand() < inf_elite_rate:
			e.elite = true
			var elite_type := _pick(3) if infinite_mode else 0
			e.elite_hue = Color(["#f1c40f", "#ff7675", "#74b9ff"][elite_type])
			e.elite_type = elite_type
			e.hp *= 2.6 + (inf_m * 0.3 if infinite_mode else 0.0)
			e.max_hp = e.hp
			e.size += 4.0 + (minf(inf_m * 0.8, 6.0) if infinite_mode else 0.0)
			e.speed *= 1.1 + (0.25 if infinite_mode and elite_type == 1 else 0.0)
			e.xp_val = roundi(e.xp_val * 3.0)
			e.attack_dmg = roundf(e.attack_dmg * 1.25)
			if infinite_mode and elite_type == 1:
				e.rage_on_death = true
			if elite_type == 2 or difficulty["id"] == "nightmare":
				e.shield = roundf(e.max_hp * (0.55 if infinite_mode else 0.4))
				e.max_shield = e.shield
		_apply_enemy_type(e, etype)
		if e.elite:
			_roll_elite_affixes(e, 3 if infinite_mode else (2 if elapsed >= 300.0 else 1))
		# 혈월 중 스폰된 적: 강화된 위협 + XP 1.6배
		if blood_moon_active > 0:
			e.speed *= 1.4
			e.attack_dmg = roundf(e.attack_dmg * 1.5)
			e.hp *= 1.3
			e.max_hp *= 1.3
			e.xp_val = roundi(e.xp_val * 1.6)
			e.blood_moon = true
		enemies.append(e)


# ── Godot 판: 몬스터 종류·정예 특성 ─────────────────────────────────

func _pick_enemy_type(tier: int, behavior: String) -> String:
	if behavior == "archer":
		if tier == 2:
			var r2 := _rand()
			if r2 < 0.3:
				return "golem"
			if r2 < 0.5:
				return "charger"
		return "archer"
	if tier == 0:
		return "bat" if _rand() < 0.35 else "ghoul"
	var r1 := _rand()
	if r1 < 0.4:
		return "skeleton"
	if r1 < 0.65:
		return "slime"
	if r1 < 0.83 and elapsed > 60.0:
		return "bomber"
	if elapsed > 90.0:
		return "wraith"
	return "skeleton"


func _apply_enemy_type(e: Enemy, etype: String) -> void:
	var t: Dictionary = C.ENEMY_TYPES[etype]
	e.type = etype
	e.hp *= float(t["hp"])
	e.max_hp = e.hp
	e.speed *= float(t["speed"])
	e.size *= float(t["size"])
	e.xp_val = maxi(1, roundi(e.xp_val * float(t["xp"])))
	e.color = Color(String(t["color"]))
	e.phase_t = _rand() * 4.0


func _roll_elite_affixes(e: Enemy, n: int) -> void:
	var pool: Array = C.ELITE_AFFIX_ORDER.duplicate()
	for i in range(n):
		if pool.is_empty():
			break
		var a: String = pool[_pick(pool.size())]
		pool.erase(a)
		e.affixes.append(a)
		match a:
			"haste":
				e.speed *= 1.6
			"giant":
				e.size *= 1.5
				e.hp *= 2.0
				e.max_hp = e.hp
			"shielded":
				e.shield = maxf(e.shield, roundf(e.max_hp * 0.4))
				e.max_shield = e.shield
			"vampiric":
				e.regen = 0.02
	if not e.affixes.is_empty():
		e.elite_hue = Color(String(C.ELITE_AFFIXES[e.affixes[0]]["color"]))


## 분열·소환·부활로 생기는 하수인
func _spawn_minion(etype: String, x: float, y: float, tier: int, hp: float, size: float, speed: float, xp: int) -> Enemy:
	var e := _new_enemy()
	e.x = x
	e.y = y
	e.tier = tier
	e.hp = hp
	e.max_hp = hp
	e.size = size
	e.speed = speed
	e.xp_val = xp
	e.behavior = "chase"
	e.type = etype
	e.color = Color(String(C.ENEMY_TYPES[etype]["color"]))
	e.attack_dmg = roundf([10, 20, 38][mini(tier, 2)] * (1.0 + elapsed / 500.0) * float(difficulty["enemyDmgMult"]))
	e.spawn_t = 0.25
	enemies.append(e)
	return e


## 정해진 자리에서 터지는 적의 폭발 — 플레이어와 (enemies_too 면) 주변 적에게 피해. 죽으면 true
func _enemy_blast(x: float, y: float, r: float, dmg: float, enemies_too: bool, color: String) -> bool:
	_ring(x, y, 8, r, 0.35, color)
	_emit("explosion", {"x": x, "y": y, "r": r, "color": color})
	if enemies_too:
		for e in enemies_near(x, y, r):
			if not e.dying and _dist(e.x, e.y, x, y) < r + e.size:
				deal_damage(e, dmg * 2.0, true, true)
	if player.invincible <= 0.0 and _dist(x, y, player.x, player.y) < r + 12.0:
		_shake(0.3, 0.6)
		return _hurt_player(dmg, 0.25, false)
	return false


## 예고 폭발(정예 폭발·골렘 내려찍기)·해골 부활·불길 장판. 죽으면 false
func _update_godot_hazards(dt: float) -> bool:
	for hz in hazards.duplicate():
		hz["t"] -= dt
		if hz["t"] <= 0.0:
			hazards.erase(hz)
			if _enemy_blast(hz["x"], hz["y"], hz["r"], hz["dmg"], false, hz["color"]):
				return false
	for rv in revives.duplicate():
		rv["t"] -= dt
		if rv["t"] <= 0.0:
			revives.erase(rv)
			var sk := _spawn_minion("skeleton", rv["x"], rv["y"], rv["tier"], rv["hp"], rv["size"], rv["speed"], rv["xp"])
			sk.revived = true
			_world_text(rv["x"], rv["y"] - 24.0, "💀 다시 일어났다!", 1.0, "#e8e2d0", 12)
	for ft in fire_trails.duplicate():
		ft["life"] -= dt
		if ft["life"] <= 0.0:
			fire_trails.erase(ft)
			continue
		ft["tick"] -= dt
		if ft["tick"] > 0.0:
			continue
		ft["tick"] = 0.2
		dmg_source = "dot"
		for e in enemies_near(ft["x"], ft["y"], ft["r"]):
			if e.dying or _dist(e.x, e.y, ft["x"], ft["y"]) > ft["r"] + e.size:
				continue
			deal_damage(e, ft["dmg"] * 0.2, true, true)
			if not e.dying:
				e.burn_stacks = mini(e.burn_stacks + 1, 3)
				e.burn_timer = 3.0
				e.burn_dmg = maxf(e.burn_dmg, ft["dmg"] * 0.15)
	# 폭풍 사냥꾼 4세트 — 5초마다 낙뢰 6발
	if set_count("storm") >= 4:
		storm_set_timer -= dt
		if storm_set_timer <= 0.0:
			storm_set_timer = 5.0
			_thunder_strikes(120.0 * player.dmg_mult * _dmg_bonus(), 450.0, 6, false, 0.4)
	return true


func drop_powerup(x: float, y: float) -> void:
	var def: Dictionary = R.POWERUP_POOL[_pick(R.POWERUP_POOL.size())]
	powerups.append({"x": x, "y": y, "def": def, "life": 16.0, "max_life": 16.0, "pulse_t": 0.0})


func _spawn_goblin_at(x: float, y: float, hp: float, speed: float, size: float, color: String, xp_val: int, life: float, mini_: bool) -> void:
	var e := _new_enemy()
	e.x = x
	e.y = y
	e.hp = hp
	e.max_hp = hp
	e.speed = speed
	e.size = size
	e.color = Color(color)
	e.xp_val = xp_val
	e.tier = 1
	e.behavior = "goblin"
	e.goblin = true
	e.is_mini = mini_
	e.goblin_life = life
	e.goblin_life_max = life
	enemies.append(e)


## 보물 고블린 — 도망치는 황금 적. 처치 시 잭팟, 17초 안에 못 잡으면 도주
func spawn_treasure_goblin() -> void:
	var ang := _rand() * TAU
	var hp := (450.0 + elapsed * 1.6) * float(difficulty["enemyHpMult"])
	_spawn_goblin_at(player.x + cos(ang) * 280.0, player.y + sin(ang) * 280.0, hp, 130.0 * float(difficulty["enemySpeedMult"]), 16, "#f1c40f", 40, 17.0, false)
	_screen_text("💰 보물 고블린 출현! 잡아라!", 2.4, "#f1c40f", 20)
	_emit("goblin")


func drop_goblin_jackpot(x: float, y: float) -> void:
	for i in range(14):
		var a := _rand() * TAU
		var d := 10.0 + _rand() * 60.0
		xp_gems.append({"x": x + cos(a) * d, "y": y + sin(a) * d, "val": 18, "attracting": false})
	for k in range(R.GOBLIN_ITEM_BOXES):
		var a := (float(k) / R.GOBLIN_ITEM_BOXES) * TAU
		item_boxes.append({"x": x + cos(a) * 45.0, "y": y + sin(a) * 45.0, "life": R.ITEM_BOX_LIFETIME, "pulse_t": 0.0})
	drop_powerup(x + 30.0, y)
	drop_powerup(x - 30.0, y)
	_ring(x, y, 12, 160, 0.5, "#f1c40f")
	for k in range(30):
		spawn_particle(x, y, "#f1c40f", 5.0 + _rand() * 7.0, 0.6)
	_screen_text("💰 JACKPOT!", 2.2, "#f1c40f", 26)


## 골드 러시 — 미니 고블린 4마리 동시 출현 (런당 1회, 4:30)
func spawn_gold_rush() -> void:
	var count := 4
	for k in range(count):
		var ang := (float(k) / count) * TAU + _rand() * 0.8
		var d := 240.0 + _rand() * 100.0
		var hp := (180.0 + elapsed * 0.8) * float(difficulty["enemyHpMult"])
		_spawn_goblin_at(player.x + cos(ang) * d, player.y + sin(ang) * d, hp, 145.0 * float(difficulty["enemySpeedMult"]), 12, "#ffd700", 25, 11.0, true)
	_screen_text("💰 골드 러시! 황금 무리를 쫓아라!", 2.8, "#ffd700", 22)
	_shake(0.2, 0.5)


func drop_mini_jackpot(x: float, y: float) -> void:
	for i in range(6):
		var a := _rand() * TAU
		var d := 8.0 + _rand() * 40.0
		xp_gems.append({"x": x + cos(a) * d, "y": y + sin(a) * d, "val": 14, "attracting": false})
	if _rand() < 0.5:
		drop_powerup(x, y)
	_ring(x, y, 8, 90, 0.4, "#ffd700")
	for k in range(14):
		spawn_particle(x, y, "#ffd700", 4.0 + _rand() * 5.0, 0.45)


## 오버드라이브 — 게이지 100% 일 때 Q / 버튼
func activate_overdrive() -> void:
	if overdrive_charge < 100.0 or overdrive_active > 0.0 or state != "playing":
		return
	overdrive_charge = 0.0
	overdrive_active = 6.0
	overdrive_flash = 0.55
	player.temp_dmg_mult = maxf(player.temp_dmg_mult, 3.0)
	player.temp_dmg_timer = maxf(player.temp_dmg_timer, 6.0)
	player.temp_speed_mult = maxf(player.temp_speed_mult, 1.3)
	player.temp_speed_timer = maxf(player.temp_speed_timer, 6.0)
	var od_range := 280.0 * _rb()
	spawn_explosion(player.x, player.y, od_range, 80.0 * player.dmg_mult, false, "")
	for k in range(28):
		spawn_particle(player.x, player.y, "#f1c40f", 7.0 + _rand() * 9.0, 0.55)
	_ring(player.x, player.y, 12, od_range, 0.5, "#f1c40f")
	_ring(player.x, player.y, 12, od_range * 0.73, 0.38, "#ffffff")
	_shake(0.45, 0.7)
	_screen_text("⚡ OVERDRIVE!", 2.2, "#f1c40f", 28)
	_emit("overdrive", {"x": player.x, "y": player.y, "r": od_range})


func spawn_boss() -> void:
	boss_active = true
	boss_warning = 2.5
	var interval := float(difficulty["bossInterval"])
	var boss_num := floori(elapsed / interval)
	# 보스 HP — 그 시점 플레이어 DPS 로 15~25초 교전이 되도록 시간 비례
	var hp := roundf((5000.0 + boss_num * 4000) * (1.0 + elapsed / 200.0) * float(difficulty["enemyHpMult"]) * float(map_def["enemyHpMult"]))
	var ang := _rand() * TAU
	var e := _new_enemy()
	e.x = player.x + cos(ang) * 430.0
	e.y = player.y + sin(ang) * 430.0
	e.hp = hp
	e.max_hp = hp
	e.speed = (44.0 + boss_num * 3) * float(difficulty["enemySpeedMult"])
	e.size = 36
	e.color = Color("#f1c40f")
	e.xp_val = 80 + boss_num * 25
	e.tier = 3
	e.is_boss = true
	e.spawn_t = 0.5
	e.behavior = "boss"
	e.attack_cd = 0.6
	e.attack_base = 2.5
	e.attack_range = 390
	e.attack_dmg = roundf((40.0 + boss_num * 15) * float(difficulty["enemyDmgMult"]))
	enemies.append(e)
	_screen_text("⚠ BOSS APPROACHING ⚠", 2.5, "#e74c3c", 22)
	_emit("boss")


# ── 투사체 발사 ─────────────────────────────────────────────────────

func fire_weapon(id: String, dt: float) -> void:
	if not player.weapon_cds.has(id):
		return    # 미보유 무기
	if not is_weapon_active(id):
		return    # 보조 무기는 발사하지 않는다 (보조 효과로만 쓰임)
	player.weapon_cds[id] = float(player.weapon_cds[id]) - dt
	if float(player.weapon_cds[id]) > 0.0:
		return

	var def: Dictionary = R.WEAPON_DEFS[id]
	var lvl := int(player.weapon_levels.get(id, 1))
	var lvl_mul := 1.0 + 0.22 * (lvl - 1)           # 레벨당 데미지 +22%
	var lvl_range_mul := 1.0 + 0.05 * (lvl - 1)     # 레벨당 사거리·범위 +5%
	var lvl_extra := lvl - 1
	var cd := float(def["cd"]) * player.cd_mult * _cd_bonus()
	var dmg := float(def["dmg"]) * player.dmg_mult * player.temp_dmg_mult * lvl_mul * _dmg_bonus()
	var range_ := float(def["range"]) * _rb() * lvl_range_mul
	player.weapon_cds[id] = cd

	# cascade_collapse: 충전 완료 시 다음 공격에 충격파
	if player.cascade_ready:
		player.cascade_ready = false
		var c_range := 250.0 * _rb()
		_chain_explosion(player.x, player.y, c_range, 500.0 * player.dmg_mult, 0.0, "")
		_ring(player.x, player.y, 14, c_range, 0.45, "#e67e22")
		_ring(player.x, player.y, 8, c_range * 0.7, 0.3, "#e74c3c")
		for ci in range(24):
			spawn_particle(player.x, player.y, "#e67e22" if ci % 3 == 0 else "#e74c3c", 7.0 + _rand() * 8.0, 0.55)
		_shake(0.35, 0.7)
		_screen_text("💥 연쇄 붕괴!", 2.2, "#e67e22", 28)

	if id == "orb" or id == "blackhole":
		var evolved := id == "blackhole"
		var orb_count := (5 if evolved else 3) + floori((lvl - 1) / 2.0)
		var orb_r := (12.0 if evolved else 8.0) + lvl_extra
		for i in range(orb_count):
			var o := _new_proj("blackhole" if evolved else "orb", player.x, player.y)
			o.angle = elapsed * 1.8 + (float(i) / orb_count) * TAU
			o.r = orb_r
			o.dmg = dmg
			o.life = cd + 0.05
			o.orb_idx = i
			o.orb_total = orb_count
			o.orbit_r = range_
	elif id == "arrow" or id == "stormbow":
		var evolved := id == "stormbow"
		var shots := 5 if evolved else 1 + floori((lvl - 1) / 2.0)
		var target := nearest_enemy()
		if target == null:
			return
		var base_ang := atan2(target.y - player.y, target.x - player.x)
		for s in range(shots):
			var ang := base_ang + (s - (shots - 1) / 2.0) * 0.12
			var ar := _new_proj("arrow", player.x, player.y)
			ar.vx = cos(ang) * 420.0
			ar.vy = sin(ang) * 420.0
			ar.r = 5
			ar.dmg = dmg
			ar.life = range_ / 420.0
			ar.pierce = (6 if evolved else 3) + lvl + player.pierce_bonus
	elif id == "nova" or id == "supernova":
		spawn_explosion(player.x, player.y, range_, dmg, id == "supernova", "nova")
	elif id == "shield" or id == "aegis":
		var dur := (2.2 if id == "aegis" else 1.5) + 0.15 * (lvl - 1)
		player.invincible = maxf(player.invincible, dur)
		if id == "aegis":
			dmg_source = "shield"
			aegis_reflect(dmg, range_)
		spawn_particle(player.x, player.y, "#3498db", 24, 0.8)
	elif id == "laser" or id == "deathray":
		var target := nearest_enemy()
		var ang := atan2(target.y - player.y, target.x - player.x) if target != null else 0.0
		var lz := _new_proj("deathray" if id == "deathray" else "laser", player.x, player.y)
		lz.angle = ang
		lz.r = 6
		lz.dmg = dmg
		lz.life = 0.45
		lz.length = range_
	elif id == "boomerang" or id == "cyclone":
		var evolved := id == "cyclone"
		var count := 3 if evolved else 1
		var spd := 320.0
		var half_life := range_ / spd
		var target := nearest_enemy()
		var base_ang := atan2(target.y - player.y, target.x - player.x) if target != null else atan2(last_move_dir.y, last_move_dir.x)
		for s in range(count):
			var ang := base_ang + ((float(s) / count) * TAU if evolved else 0.0)
			var bm := _new_proj("boomerang", player.x, player.y)
			bm.vx = cos(ang) * spd
			bm.vy = sin(ang) * spd
			bm.r = 7
			bm.dmg = dmg
			bm.life = half_life * 2.0
			bm.half_life = half_life
	elif id == "chain" or id == "tempest":
		# 사슬 번개: 가장 가까운 적부터 연쇄 즉시 타격
		var evolved := id == "tempest"
		var bounces := (5 if evolved else 3) + passive_level("pierce_up") * 3 + floori(lvl_extra / 2.0)
		dmg_source = "chain"
		var cx := player.x
		var cy := player.y
		var hit := {}
		for b in range(bounces):
			var best: Enemy = null
			var bd := INF
			for e in enemies:
				if hit.has(e.id):
					continue
				var d := _dist(cx, cy, e.x, e.y)
				if d < range_ and d < bd:
					bd = d
					best = e
			if best == null:
				break
			hit[best.id] = true
			# 폭풍 사슬: 이미 빙결된 적을 치면 서리 폭발 — 주변 전파 + 빙결
			var frost_chain := evolved and best.frozen > 0.0
			deal_damage(best, dmg)
			if evolved and best.hp > 0.0:
				best.frozen = maxf(best.frozen, 1.5)
			if frost_chain:
				var frost_r := 65.0 * _rb()
				for fe in enemies.duplicate():
					if fe == best or hit.has(fe.id) or fe.dying:
						continue
					if _dist(best.x, best.y, fe.x, fe.y) < frost_r:
						deal_damage(fe, dmg * 0.5)
						if fe.hp > 0.0:
							fe.frozen = maxf(fe.frozen, 0.9)
						hit[fe.id] = true
						spawn_particle(fe.x, fe.y, "#74b9ff", 5, 0.3)
				_ring(best.x, best.y, 5, frost_r, 0.22, "#74b9ff")
				for fi in range(6):
					spawn_particle(best.x, best.y, "#b2d8ff", 4, 0.28)
			var arc := _new_proj("arc", cx, cy)
			arc.tx = best.x
			arc.ty = best.y
			arc.life = 0.22
			for k in range(3):
				spawn_particle(best.x, best.y, "#74b9ff" if evolved else "#a29bfe", 4, 0.2)
			cx = best.x
			cy = best.y
	elif id == "scythe" or id == "reaper":
		# 낫: 전방 부채꼴 베기 / 사신의 낫: 360° 회전 베기 + 흡입
		var evolved := id == "reaper"
		var target := nearest_enemy()
		var base_ang := atan2(target.y - player.y, target.x - player.x) if target != null else atan2(last_move_dir.y, last_move_dir.x)
		var arc_w := TAU if evolved else minf(PI, PI * 0.66 + 0.07 * lvl_extra)
		dmg_source = "scythe"
		var reaper_hits := 0
		for e in enemies.duplicate():
			if e.dying:
				continue
			var d := _dist(player.x, player.y, e.x, e.y)
			if d > range_:
				continue
			var e_ang := atan2(e.y - player.y, e.x - player.x)
			var diff := absf(fmod(e_ang - base_ang + PI * 3.0, TAU) - PI)
			if not evolved and diff > arc_w / 2.0:
				continue
			if evolved:
				var pull := minf(60.0, d) * 0.6
				e.x -= cos(e_ang) * pull
				e.y -= sin(e_ang) * pull
			e.last_hit_by = id
			deal_damage(e, dmg)
			reaper_hits += 1
		# 사신의 낫 — 5명 이상 동시 베기 시 영혼 수확
		if evolved and reaper_hits >= 5:
			var soul_range := range_ * 1.6
			_chain_explosion(player.x, player.y, soul_range, dmg * 1.6, 0.16, "scythe")
			_ring(player.x, player.y, 14, soul_range, 0.42, "#9b59b6")
			_ring(player.x, player.y, 8, soul_range * 0.65, 0.28, "#b388ff")
			for si in range(18):
				spawn_particle(player.x, player.y, "#b388ff", 5.0 + _rand() * 5.0, 0.45)
			_screen_text("👻 영혼 수확! (%d연)" % reaper_hits, 1.8, "#b388ff", 18)
			_shake(0.2, 0.55)
		_ring(player.x, player.y, 8, range_, 0.25, "#9b59b6" if evolved else "#bdc3c7")
		if evolved and reaper_hits >= 3:
			_ring(player.x, player.y, 4, range_ * 0.7, 0.18, "#d7bfff")
		for k in range((14 + reaper_hits) if evolved else 7):
			var pa := base_ang + (_rand() - 0.5) * arc_w
			spawn_particle(player.x + cos(pa) * range_ * 0.7, player.y + sin(pa) * range_ * 0.7, "#9b59b6" if evolved else "#ecf0f1", 4, 0.25)
	elif id == "bomb" or id == "inferno":
		# 폭탄: 가장 가까운 적 위치에 시한 폭발 / 인페르노: 분열
		var evolved := id == "inferno"
		var target := nearest_enemy()
		var tx := target.x if target != null else player.x + last_move_dir.x * range_
		var ty := target.y if target != null else player.y + last_move_dir.y * range_
		var aoe := (95.0 if evolved else 80.0) * _rb() * lvl_range_mul
		_chain_explosion(tx, ty, aoe, dmg, 0.45, "bomb")
		_ring(tx, ty, aoe, 6, 0.45, "#e67e22")
		for k in range(5):
			spawn_particle(player.x, player.y, "#e67e22", 4, 0.3)
		if evolved:
			var splits := 5 + floori(lvl_extra / 2.0)
			for s in range(splits):
				var a := (float(s) / splits) * TAU
				_chain_explosion(tx + cos(a) * aoe * 0.8, ty + sin(a) * aoe * 0.8, aoe * 0.6, dmg * 0.6, 0.6 + s * 0.05, "bomb")
	elif id == "missile" or id == "swarm":
		var evolved := id == "swarm"
		var shots := 5 if evolved else 1 + floori(lvl_extra / 2.0)
		var m_aoe := (70.0 if evolved else 50.0) * _rb() * lvl_range_mul
		var turn := 7.5 if evolved else 5.0 + lvl_extra * 0.4
		for s in range(shots):
			var a0 := _rand() * TAU
			var spd := 360.0 if evolved else 300.0
			var ms := _new_proj("missile", player.x, player.y)
			ms.vx = cos(a0) * spd
			ms.vy = sin(a0) * spd
			ms.spd = spd
			ms.turn = turn
			ms.r = 6
			ms.dmg = dmg
			ms.aoe = m_aoe
			ms.life = 2.6
			ms.evolved = evolved
			ms.src = "missile"
		for k in range(4):
			spawn_particle(player.x, player.y, "#e056fd", 4, 0.25)
	elif id == "meteor" or id == "meteorshower":
		var evolved := id == "meteorshower"
		var count := (3 if evolved else 1) + floori(lvl_extra / 2.0)
		var m_aoe := (150.0 if evolved else 110.0) * _rb() * lvl_range_mul
		for s in range(count):
			var target := nearest_enemy()
			var jitter := 0.0 if s == 0 else 60.0 + _rand() * 80.0
			var ja := _rand() * TAU
			var tx := (target.x if target != null else player.x + last_move_dir.x * range_) + cos(ja) * jitter
			var ty := (target.y if target != null else player.y + last_move_dir.y * range_) + sin(ja) * jitter
			spawn_meteor_strike(tx, ty, dmg, m_aoe, evolved, "meteor", s * 0.12)
	elif id == "toxic" or id == "plague":
		var evolved := id == "plague"
		var target := nearest_enemy()
		var tx := target.x if target != null else player.x
		var ty := target.y if target != null else player.y
		var t_range := (95.0 if evolved else 70.0) * _rb() * lvl_range_mul
		var t_life := (5.0 if evolved else 3.5) + lvl_extra * 0.4
		toxic_fields.append({"x": tx, "y": ty, "range": t_range, "dmg": dmg, "life": t_life, "max_life": t_life, "tick_timer": 0.0, "evolved": evolved, "spread_cd": 1.2, "spawned": false})
		_ring(tx, ty, 6, t_range, 0.4, "#6ab04c" if evolved else "#badc58")
	elif id == "whip" or id == "bloodtear":
		_whip_strike(dmg, range_, lvl_extra, id == "bloodtear", 1.0)
	elif id == "axe" or id == "deathspiral":
		if id == "deathspiral":
			for s in range(8):
				_throw_axe(dmg, range_, (float(s) / 8.0) * TAU, true, 999)
		else:
			var shots := 1 + floori(lvl_extra / 2.0)
			for s in range(shots):
				_throw_axe(dmg, range_, 0.0, false, 3 + lvl)
	elif id == "storm" or id == "judgment":
		var evolved := id == "judgment"
		var strikes := 6 if evolved else 2 + floori(lvl_extra / 2.0)
		_thunder_strikes(dmg, range_, strikes, evolved, 0.3 + 0.05 * lvl_extra)
	# 보조 무기 오버레이 — 메인 무기 발사마다
	if id == get_main_weapon():
		var aux_target := nearest_enemy()
		if aux_target != null:
			trigger_aux_effects(aux_target, dmg)
	# 블리츠 시너지: 15% 확률로 즉시 재발동
	if has_synergy("blitz") and _rand() < 0.15:
		player.weapon_cds[id] = 0.0


# ── Godot 판 무기: 채찍·도끼·뇌우 ───────────────────────────────────

## 채찍 — 바라보는 쪽 직사각형을 후려친다. 3레벨(또는 진화)부터 뒤쪽도
func _whip_strike(dmg: float, reach: float, lvl_extra: int, evolved: bool, scale: float) -> void:
	dmg_source = "whip"
	var face := 1.0 if last_move_dir.x >= 0.0 else -1.0
	var height := (46.0 + lvl_extra * 6.0) * scale * (1.3 if evolved else 1.0)
	var sides: Array = [face]
	if evolved or lvl_extra >= 2:
		sides.append(-face)
	var healed := 0.0
	for side in sides:
		var hits := 0
		for e in enemies.duplicate():
			if e.dying:
				continue
			var dx: float = (e.x - player.x) * side
			var dy: float = e.y - player.y
			if dx > -e.size and dx < reach + e.size and absf(dy) < height / 2.0 + e.size:
				deal_damage(e, dmg)
				hits += 1
				if evolved and healed < player.max_hp * 0.03:
					var h := player.max_hp * 0.006
					player.hp = minf(player.hp + h, player.max_hp)
					healed += h
		_emit("slash", {"x": player.x, "y": player.y, "dir": side, "reach": reach, "height": height, "evolved": evolved, "hits": hits})


## 도끼 — 일반은 위로 던져 중력으로 떨어지고, 진화(죽음의 나선)는 나선으로 퍼진다
func _throw_axe(dmg: float, reach: float, angle: float, evolved: bool, pierce: int) -> void:
	var ax := _new_proj("axe", player.x, player.y)
	ax.r = 14.0 if evolved else 12.0
	ax.dmg = dmg
	ax.pierce = pierce
	ax.src = "axe"
	ax.evolved = evolved
	if evolved:
		ax.vx = cos(angle) * 240.0
		ax.vy = sin(angle) * 240.0
		ax.turn = 2.4
		ax.life = reach / 220.0
	else:
		var face := 1.0 if last_move_dir.x >= 0.0 else -1.0
		if _rand() < 0.25:
			face = -face
		ax.vx = (50.0 + _rand() * 150.0) * face
		ax.vy = -(reach * 1.45 + _rand() * 110.0)
		ax.grav = 980.0
		ax.life = 1.7


## 뇌우 — 범위 안 무작위 적 n 명에게 낙뢰
func _thunder_strikes(dmg: float, reach: float, n: int, evolved: bool, stun: float) -> void:
	var cands: Array = []
	for e in enemies_near(player.x, player.y, reach):
		if not e.dying and _dist(e.x, e.y, player.x, player.y) < reach:
			cands.append(e)
	if cands.is_empty():
		return
	_shuffle(cands)
	for i in range(mini(n, cands.size())):
		var t: Enemy = cands[i]
		_strike_at(t.x, t.y, dmg, (90.0 if evolved else 42.0) * _rb(), stun * (2.0 if evolved else 1.0), evolved)


func _strike_at(x: float, y: float, dmg: float, r: float, stun: float, evolved: bool) -> void:
	dmg_source = "storm"
	for e in enemies_near(x, y, r):
		if e.dying:
			continue
		if _dist(e.x, e.y, x, y) < r + e.size:
			deal_damage(e, dmg)
			if not e.dying and not e.is_boss:
				e.stun = maxf(e.stun, stun)
	# 천벌: 맞은 자리에서 가까운 적 2명에게 번개가 이어진다
	if evolved:
		var cx := x
		var cy := y
		var hit := {}
		for b in range(2):
			var best: Enemy = null
			var bd := 170.0
			for e in enemies_near(cx, cy, 170.0):
				if e.dying or hit.has(e.id):
					continue
				var d := _dist(cx, cy, e.x, e.y)
				if d < bd and d > r * 0.5:
					bd = d
					best = e
			if best == null:
				break
			hit[best.id] = true
			var arc := _new_proj("arc", cx, cy)
			arc.tx = best.x
			arc.ty = best.y
			arc.life = 0.22
			deal_damage(best, dmg * 0.5)
			cx = best.x
			cy = best.y
	_ring(x, y, 6, r, 0.25, "#8fd3ff")
	_emit("thunder", {"x": x, "y": y, "r": r, "evolved": evolved})


func spawn_explosion(x: float, y: float, range_: float, dmg: float, evolved: bool, src: String) -> void:
	if src != "":
		dmg_source = src
	var col := "#f1c40f" if evolved else "#e74c3c"
	for i in range(12):
		spawn_particle(x, y, col, 6.0 + _rand() * 8.0, 0.5 + _rand() * 0.4)
	var r2 := range_ * range_
	for e in enemies_near(x, y, range_):
		if e.dying:
			continue
		var dx: float = e.x - x
		var dy: float = e.y - y
		if dx * dx + dy * dy < r2:
			deal_damage(e, dmg)
	if range_ >= 60.0:
		_emit("explosion", {"x": x, "y": y, "r": range_, "color": col})
	var ex := _new_proj("explosion", x, y)
	ex.r = 0
	ex.max_r = range_
	ex.life = 0.4
	ex.evolved = evolved
	# 슈퍼노바: 5방향 연쇄 폭발 + 복사열 화상
	if evolved:
		for i in range(5):
			var a := (i / 5.0) * TAU
			var d := range_ * 0.72
			_chain_explosion(x + cos(a) * d, y + sin(a) * d, range_ * 0.58, dmg * 0.65, 0.09 + i * 0.055, "nova")
		var br := range_ * 1.2
		for se in enemies_near(x, y, br):
			if se.dying:
				continue
			var dx: float = se.x - x
			var dy: float = se.y - y
			if dx * dx + dy * dy < br * br:
				se.burn_stacks = mini(se.burn_stacks + 2, 5)
				se.burn_timer = maxf(se.burn_timer, 3.5)
				if se.burn_dmg <= 0.0:
					se.burn_dmg = player.dmg_mult * 8.0


## 운석 — delay 초 뒤 하늘에서 떨어진다. 착탄 지점엔 예고 링
func spawn_meteor_strike(tx: float, ty: float, dmg: float, aoe: float, evolved: bool, src: String, delay: float) -> void:
	var m := _new_proj("meteor", tx, ty - 480.0)
	m.tx = tx
	m.ty = ty
	m.vy = 1300.0 if evolved else 1150.0
	m.r = 16.0 if evolved else 12.0
	m.dmg = dmg
	m.aoe = aoe
	m.evolved = evolved
	m.src = src if src != "" else "meteor"
	m.delay = delay
	m.life = delay + 1.6
	_ring(tx, ty, aoe, 6, delay + 0.5, "#ff7675" if evolved else "#fab1a0")


# ── 대쉬 베기 ───────────────────────────────────────────────────────

func perform_dash_slash(sx: float, sy: float, ex: float, ey: float, stats: Dictionary) -> int:
	var dmg: float = R.DASH_DMG * player.dmg_mult * float(stats["damage_mult"])
	dmg_source = "dash"
	var hit_count := 0
	var width := float(stats["width"])
	var reach := float(stats["range"])
	var rupture := int(stats["rupture"])
	for e in enemies.duplicate():
		if e.dying:
			continue
		var path_hit: bool = _dist_to_segment(e.x, e.y, sx, sy, ex, ey) < e.size + width
		var end_hit: bool = _dist(e.x, e.y, ex, ey) < e.size + reach
		if not path_hit and not end_hit:
			continue
		hit_count += 1
		deal_damage(e, dmg)
		if rupture > 0 and e.hp > 0.0 and not e.dying:
			e.has_rupture = true
			e.rupture_time = float(stats["rupture_time"])
			e.rupture_max_time = e.rupture_time
			e.rupture_dps = dmg * float(stats["rupture_dps_mult"])
			e.rupture_burst = dmg * (0.28 + rupture * 0.08)
		for k in range(5):
			spawn_particle(e.x, e.y, "#ff6b6b" if rupture > 0 else "#f8c8ff", 5.0 + int(stats["cleave"]), 0.25)
	if hit_count >= 5:
		_world_text(ex, ey - 38.0, "%d SLASH" % hit_count, 0.9, "#f8c8ff", 15)
		_shake(0.12, 0.5)
		hit_stop = maxf(hit_stop, 0.035)
	return hit_count


func queue_slash_echoes(sx: float, sy: float, ex: float, ey: float, angle: float, stats: Dictionary) -> void:
	for i in range(int(stats["echo_count"])):
		var echo := {
			"sx": sx, "sy": sy,
			"ex": ex + cos(angle) * (10 + i * 8), "ey": ey + sin(angle) * (10 + i * 8),
			"angle": angle,
			"delay": 0.12 + i * 0.1,
			"life": 0.28, "max_life": 0.28,
			"range": stats["range"], "width": stats["width"],
			"damage_mult": float(stats["damage_mult"]) * 0.48,
			"cleave": stats["cleave"], "rupture": 0,
			"triggered": false,
		}
		slash_echoes.append(echo)


func update_slash_echoes(dt: float) -> void:
	for echo in slash_echoes.duplicate():
		echo["delay"] -= dt
		if echo["delay"] <= 0.0 and not echo["triggered"]:
			echo["triggered"] = true
			perform_dash_slash(echo["sx"], echo["sy"], echo["ex"], echo["ey"], echo)
		if echo["triggered"]:
			echo["life"] -= dt
		if echo["life"] <= 0.0:
			slash_echoes.erase(echo)


func update_ruptures(dt: float) -> void:
	for e in enemies.duplicate():
		if not e.has_rupture or e.rupture_time <= 0.0 or e.dying:
			continue
		e.rupture_time -= dt
		deal_damage(e, e.rupture_dps * dt)
		if e.dying:
			continue
		if e.rupture_time <= 0.0:
			e.has_rupture = false


## spectral_blade 잔향 검기 — 지속 피해
func update_spectral_fields(dt: float) -> void:
	for sf in spectral_fields.duplicate():
		sf["life"] -= dt
		if sf["life"] <= 0.0:
			spectral_fields.erase(sf)
			continue
		var r: float = sf["range"]
		for e in enemies_near(sf["x"], sf["y"], r):
			if e.dying:
				continue
			if _dist(e.x, e.y, sf["x"], sf["y"]) < r:
				deal_damage(e, sf["dmg"] * dt)


## 독성 포자/역병 지대 — 범위 지속 피해 + 0.5초마다 중독, 역병은 한 번 확산
func update_toxic_fields(dt: float) -> void:
	for tf in toxic_fields.duplicate():
		tf["life"] -= dt
		if tf["life"] <= 0.0:
			toxic_fields.erase(tf)
			continue
		tf["tick_timer"] += dt
		dmg_source = "toxic"
		var apply_poison: bool = tf["tick_timer"] >= 0.5
		var r: float = tf["range"]
		for e in enemies_near(tf["x"], tf["y"], r):
			if e.dying:
				continue
			if _dist(tf["x"], tf["y"], e.x, e.y) < r + e.size:
				deal_damage(e, tf["dmg"] * dt, true, true)
				if apply_poison and e.hp > 0.0:
					e.poison_timer = maxf(e.poison_timer, 4.0 if tf["evolved"] else 2.5)
					e.poison_dmg = maxf(e.poison_dmg, tf["dmg"] * (0.5 if tf["evolved"] else 0.32))
		if tf["tick_timer"] >= 0.5:
			tf["tick_timer"] = 0.0
		if _rand() < 0.5:
			var pa := _rand() * TAU
			var pr := _rand() * r
			spawn_particle(tf["x"] + cos(pa) * pr, tf["y"] + sin(pa) * pr, "#6ab04c" if tf["evolved"] else "#badc58", 3.0 + _rand() * 3.0, 0.4)
		if tf["evolved"] and tf["life"] < tf["max_life"] - 0.6:
			tf["spread_cd"] -= dt
			if tf["spread_cd"] <= 0.0 and toxic_fields.size() < 24 and not tf["spawned"]:
				tf["spawned"] = true
				var sa := _rand() * TAU
				var child_life: float = tf["life"] * 0.7
				toxic_fields.append({"x": tf["x"] + cos(sa) * r * 0.9, "y": tf["y"] + sin(sa) * r * 0.9, "range": r * 0.7, "dmg": tf["dmg"] * 0.7, "life": child_life, "max_life": child_life, "tick_timer": 0.0, "evolved": false, "spread_cd": 1.2, "spawned": false})


func fire_enemy_projectile(enemy: Enemy, spread: float) -> void:
	var ang := atan2(player.y - enemy.y, player.x - enemy.x) + spread
	var spd: float = [220.0, 260.0, 190.0][enemy.tier] if enemy.tier < 3 else 220.0
	var r := 5.0 + enemy.tier * 2
	enemy_projectiles.append({"x": enemy.x, "y": enemy.y, "vx": cos(ang) * spd, "vy": sin(ang) * spd, "r": r, "dmg": enemy.attack_dmg, "life": 1.6})
	for i in range(2):
		spawn_particle(enemy.x, enemy.y, "#ff6b35", 3, 0.2)


# ── 데미지 처리 ─────────────────────────────────────────────────────

## skip_chain: chain_crit 연쇄 피해의 재귀 방지 / is_dot: 지속 피해 틱 (치명타·상태이상·흡혈 없음)
func deal_damage(enemy: Enemy, dmg: float, skip_chain: bool = false, is_dot: bool = false) -> void:
	if dmg <= 0.0:
		return
	# Godot 판: 망령 반투명 70% 감소, 서리 왕관 4세트 — 빙결된 적 +50%
	if enemy.ethereal:
		dmg *= 0.3
	if enemy.frozen > 0.0 and set_count("frost") >= 4:
		dmg *= 1.5
	var is_crit_roll := false
	var crit_chance := player.crit_chance + _gear("crit")
	if not is_dot and crit_chance > 0.0 and _rand() < crit_chance:
		dmg *= 3.0 if has_synergy("executioner") else 2.0
		is_crit_roll = true
		if has_synergy("bloodlust"):
			player.hp = minf(player.hp + player.max_hp * 0.10, player.max_hp)
	# 보호막(정예): 보호막이 0 이 될 때까지 HP 피해 없음
	if enemy.shield > 0.0:
		if dmg <= enemy.shield:
			enemy.shield -= dmg
			enemy.hurt_flash = 0.12
			damage_numbers.append({"x": enemy.x, "y": enemy.y - enemy.size - 8.0, "val": ceili(dmg), "life": 0.65, "max_life": 0.65, "tier": -1})
			return
		dmg -= enemy.shield
		enemy.shield = 0.0
		_ring(enemy.x, enemy.y, enemy.size, enemy.size * 4.0, 0.25, "#74b9ff")
		_world_text(enemy.x, enemy.y - 28.0, "🛡 방어막 파괴!", 1.0, "#74b9ff", 12)
	enemy.hp -= dmg
	enemy.hurt_flash = 0.12
	if not is_dot:
		var ls := player.lifesteal + _gear("lifesteal")
		if ls > 0.0 and player.hp < player.max_hp:
			player.hp = minf(player.hp + dmg * ls, player.max_hp)
		# 서리 왕관 2세트: 직접 타격 10% 확률로 1초 빙결
		if not skip_chain and enemy.hp > 0.0 and not enemy.is_boss and set_count("frost") >= 2 and _rand() < 0.10:
			enemy.frozen = maxf(enemy.frozen, 1.0)
		_emit("hit", {"x": enemy.x, "y": enemy.y, "crit": is_crit_roll})
		if player.ignite_chance > 0.0 and enemy.hp > 0.0 and _rand() < player.ignite_chance:
			enemy.burn_stacks = mini(enemy.burn_stacks + 1, 3)
			enemy.burn_timer = 3.0
			enemy.burn_dmg = maxf(4.0, dmg * 0.10)
		if player.venom_chance > 0.0 and enemy.hp > 0.0 and _rand() < player.venom_chance:
			enemy.poison_timer = 6.0
			enemy.poison_dmg = maxf(3.0, dmg * 0.06)
	# 넉백: 플레이어 반대 방향 (보스는 10%)
	var kb_ang := atan2(enemy.y - player.y, enemy.x - player.x)
	var kb_str := minf(dmg * 1.5, 20.0 if enemy.is_boss else 200.0) * (0.1 if enemy.is_boss else 1.0)
	if enemy.type == "golem" or enemy.charge_state == 2:
		kb_str = 0.0
	enemy.knock_vx += cos(kb_ang) * kb_str
	enemy.knock_vy += sin(kb_ang) * kb_str
	if dmg >= 8.0:
		var rounded := roundi(dmg)
		var is_crit := dmg >= 60.0
		var tier := 2 if is_crit else (1 if rounded >= 25 else 0)
		damage_numbers.append({"x": enemy.x + (_rand() - 0.5) * 10.0, "y": enemy.y - enemy.size - 4.0, "val": rounded, "life": 0.65, "max_life": 0.65, "tier": tier})
		var spark_col := "#ff8c00" if is_crit else ("#ffd700" if tier == 1 else "#e8e8e8")
		var spark_n := 6 if is_crit else (4 if tier == 1 else 2)
		for s in range(spark_n):
			spawn_particle(enemy.x, enemy.y, spark_col, 2.0 + _rand() * 4.0, 0.12 + _rand() * 0.08)
		if is_crit and enemy.hp > 0.0:
			_ring(enemy.x, enemy.y, 6, 36, 0.18, "#ff8c00")
			_shake(0.18, 0.5)
			# chain_crit: 치명타 발동 시 2연쇄 번개
			if is_crit_roll and not skip_chain and has_synergy("chain_crit"):
				var cx := enemy.x
				var cy := enemy.y
				var chain_hit := {enemy.id: true}
				for b in range(2):
					var best: Enemy = null
					var bd := INF
					for e in enemies:
						if chain_hit.has(e.id) or e.dying:
							continue
						var d := _dist(cx, cy, e.x, e.y)
						if d < 200.0 and d < bd:
							bd = d
							best = e
					if best == null:
						break
					chain_hit[best.id] = true
					deal_damage(best, dmg * 0.45, true)
					var arc := _new_proj("arc", cx, cy)
					arc.tx = best.x
					arc.ty = best.y
					arc.life = 0.22
					for k in range(2):
						spawn_particle(best.x, best.y, "#9b59b6", 4, 0.2)
					cx = best.x
					cy = best.y
			# seeker_swarm: 치명타 시 25% 확률로 유도 미사일 (미사일 피해에선 재발동 금지)
			if is_crit_roll and not skip_chain and dmg_source != "missile" and has_synergy("seeker_swarm") and _rand() < 0.25:
				var a0 := _rand() * TAU
				var ms := _new_proj("missile", player.x, player.y)
				ms.vx = cos(a0) * 320.0
				ms.vy = sin(a0) * 320.0
				ms.spd = 320
				ms.turn = 7
				ms.r = 6
				ms.dmg = dmg * 0.6
				ms.aoe = 55.0 * _rb()
				ms.life = 2.6
				ms.src = "missile"
	# 폭풍 사냥꾼 2세트: 치명타가 주변 적 2명에게 번개로 튄다
	if is_crit_roll and not skip_chain and set_count("storm") >= 2:
		var hit := {enemy.id: true}
		for b in range(2):
			var best: Enemy = null
			var bd := 150.0
			for e in enemies_near(enemy.x, enemy.y, 150.0):
				if e.dying or hit.has(e.id):
					continue
				var dd := _dist(enemy.x, enemy.y, e.x, e.y)
				if dd < bd:
					bd = dd
					best = e
			if best == null:
				break
			hit[best.id] = true
			var arc := _new_proj("arc", enemy.x, enemy.y)
			arc.tx = best.x
			arc.ty = best.y
			arc.life = 0.2
			deal_damage(best, dmg * 0.5, true)
	if enemy.hp <= 0.0:
		kill_enemy(enemy)


## Godot 판 처치 효과 — 종류 특성(부활·분열), 정예 특성(분열·폭발), 세트, 장비 드롭, 사건
func _on_kill_godot(enemy: Enemy) -> void:
	_emit("kill", {"x": enemy.x, "y": enemy.y, "tier": enemy.tier, "color": enemy.color, "size": enemy.size,
		"elite": enemy.elite, "boss": enemy.is_boss, "type": enemy.type})
	if enemy.type == "skeleton" and not enemy.revived and not enemy.elite and _rand() < float(C.ENEMY_TYPES["skeleton"]["reassemble"]):
		revives.append({"x": enemy.x, "y": enemy.y, "t": 2.0, "tier": enemy.tier, "hp": enemy.max_hp * 0.5,
			"size": enemy.size, "speed": enemy.speed, "xp": maxi(1, roundi(enemy.xp_val * 0.5))})
	if enemy.type == "slime" and not enemy.no_split:
		for k in range(int(C.ENEMY_TYPES["slime"]["split"])):
			var a := _rand() * TAU
			var m := _spawn_minion("slime", enemy.x + cos(a) * 14.0, enemy.y + sin(a) * 14.0, enemy.tier,
				enemy.max_hp * 0.35, enemy.size * 0.65, enemy.speed * 1.25, maxi(1, roundi(enemy.xp_val * 0.4)))
			m.no_split = true
			m.knock_vx = cos(a) * 160.0
			m.knock_vy = sin(a) * 160.0
	if enemy.affixes.has("split"):
		for k in range(3):
			var a := (k / 3.0) * TAU
			var m := _spawn_minion(enemy.type if enemy.type != "archer" else "skeleton", enemy.x + cos(a) * 20.0, enemy.y + sin(a) * 20.0,
				enemy.tier, enemy.max_hp * 0.2, enemy.size * 0.6, enemy.speed * 1.2, maxi(1, roundi(enemy.xp_val * 0.2)))
			m.no_split = true
	if enemy.affixes.has("volatile"):
		hazards.append({"x": enemy.x, "y": enemy.y, "r": 110.0, "t": 0.9, "max_t": 0.9, "dmg": enemy.attack_dmg * 1.0 + 8.0, "color": "#e67e22"})
	if enemy.type == "bomber" and enemy.fuse < 0.0:
		# 점화 전에 잡힌 임프는 주변 적만 휩쓴다 (보상)
		_chain_explosion(enemy.x, enemy.y, 80.0, 40.0 * player.dmg_mult, 0.05, "etc")
	# 피의 서약 2세트 — 처치마다 체력 +1
	if set_count("blood") >= 2:
		player.hp = minf(player.hp + 1.0, player.max_hp)
	# 잿불 군주 2세트 — 처치 시 30% 불씨 폭발 (지연 폭발로 줄줄이 터진다)
	if set_count("ember") >= 2 and _rand() < 0.3:
		_chain_explosion(enemy.x, enemy.y, 70.0 * _rb(), 30.0 * player.dmg_mult * _dmg_bonus(), 0.08, "etc")
	# 장비
	if enemy.is_boss:
		_maybe_drop_gear(enemy.x, enemy.y, "boss")
	elif enemy.goblin:
		_maybe_drop_gear(enemy.x, enemy.y, "mini_goblin" if enemy.is_mini else "goblin")
	elif enemy.elite:
		_maybe_drop_gear(enemy.x, enemy.y, "elite")
	else:
		_maybe_drop_gear(enemy.x, enemy.y, "normal")


## 콤보 마일스톤 — XP 다발 지급 (웨이브판은 코인도 주지만 코인은 메타 진행이라 옮기지 않았다)
func award_combo_milestone(enemy: Enemy) -> void:
	if combo_milestone_idx >= R.COMBO_MILESTONES.size():
		return
	var reached: int = R.COMBO_MILESTONES[combo_milestone_idx]
	if combo_count < reached:
		return
	combo_milestone_idx += 1
	xp_gems.append({"x": enemy.x, "y": enemy.y, "val": roundi(reached * 0.6), "attracting": false})
	_world_text(enemy.x, enemy.y - 28.0, "🔥 %d COMBO!" % reached, 1.6, "#f1c40f", 15)


const STREAK_TEXTS := ["", "", "💀 DOUBLE KILL!", "💀 TRIPLE KILL!", "⚔ QUAD KILL!", "🔥 RAMPAGE!"]


func kill_enemy(enemy: Enemy) -> void:
	if enemy.dying:
		return
	var idx := enemies.find(enemy)
	if idx == -1:
		return
	var rupture_burst := enemy.rupture_burst if enemy.has_rupture else 0.0
	enemy.dying = true
	kills += 1
	combo_count += 1
	combo_timer = 1.5
	# 오버드라이브 충전 — 보스 +20, 정예 +5, 일반 +1
	overdrive_charge = minf(100.0, overdrive_charge + (20.0 if enemy.is_boss else (5.0 if enemy.elite else 1.0)))
	if has_synergy("vital_surge"):
		player.hp = minf(player.hp + 3.0, player.max_hp)
	if has_synergy("pyromaniac") and enemy.burn_stacks > 0:
		var pyro_range := 85.0 * _rb()
		_chain_explosion(enemy.x, enemy.y, pyro_range, 28.0 * player.dmg_mult * maxi(enemy.burn_stacks, 1), 0.0, "")
		_ring(enemy.x, enemy.y, 8, pyro_range, 0.3, "#e67e22")
	award_combo_milestone(enemy)

	# 연속 처치 텍스트 — 같은 프레임 동시 처치에는 표시 안 함
	var time_since_last := elapsed - last_kill_time
	if combo_count >= 2 and combo_count <= 5 and time_since_last > 0.12:
		_world_text(enemy.x, enemy.y - 36.0, STREAK_TEXTS[combo_count], 1.1, "#ff2222" if combo_count >= 5 else "#ff6b35", 13 + combo_count)
	if combo_count == 10:
		_screen_text("🔥 RAMPAGE!", 2.2, "#ff6b35", 24)
	if combo_count == 20:
		_screen_text("⚡ OBLITERATION!", 2.5, "#f1c40f", 28)
		_shake(0.3, 0.7)
	if combo_count == 50:
		_screen_text("☠ GODLIKE!", 3.0, "#e74c3c", 34)
		_shake(0.5, 0.8)
		evolve_flash = 0.35
	if combo_count == 100:
		_screen_text("🌟 LEGENDARY!", 3.5, "#9b59b6", 40)
		_shake(0.7, 1.0)
		evolve_flash = 0.55
	last_kill_time = elapsed
	# cascade_collapse: 5초 내 처치 추적
	kill_streak_timestamps.append(elapsed)
	kill_streak_timestamps = kill_streak_timestamps.filter(func(t): return elapsed - t < 5.0)
	if has_synergy("cascade_collapse") and kill_streak_timestamps.size() >= 10 and not player.cascade_ready:
		player.cascade_ready = true
		kill_streak_timestamps = []
		_screen_text("💥 연쇄 붕괴 준비!", 2.2, "#e67e22", 20)

	# elemental_burst: 화염+맹독 동시 적 처치 시 연쇄 폭발
	if has_synergy("elemental_burst") and enemy.burn_stacks > 0 and enemy.poison_timer > 0.0:
		var burst_range := 150.0 * _rb()
		var burst_dmg := player.dmg_mult * float(R.WEAPON_DEFS["nova"]["dmg"]) * 8.0
		_chain_explosion(enemy.x, enemy.y, burst_range, burst_dmg, 0.0, "")
		_ring(enemy.x, enemy.y, 8, burst_range, 0.5, "#a29bfe")
		_ring(enemy.x, enemy.y, 6, burst_range * 0.6, 0.32, "#27ae60")
		for bi in range(20):
			spawn_particle(enemy.x, enemy.y, "#e67e22" if bi % 2 == 0 else "#27ae60", 6.0 + _rand() * 6.0, 0.55)
		_world_text(enemy.x, enemy.y - 42.0, "💫 원소 폭발!", 1.5, "#a29bfe", 16)
	# spectral_blade: 낫 계열로 처치 시 잔향 검기
	if has_synergy("spectral_blade") and (enemy.last_hit_by == "reaper" or enemy.last_hit_by == "scythe"):
		var sf_range := 72.0 * _rb()
		spectral_fields.append({"x": enemy.x, "y": enemy.y, "range": sf_range, "dmg": player.dmg_mult * float(R.WEAPON_DEFS["reaper"]["dmg"]) * 0.6, "life": 0.8, "max_life": 0.8})
		_ring(enemy.x, enemy.y, 6, sf_range, 0.8, "#9b59b6")

	if enemy.elite:
		if _rand() < R.ELITE_POWERUP_CHANCE:
			drop_powerup(enemy.x, enemy.y)
		_world_text(enemy.x, enemy.y - 30.0, "👑 정예 처치!", 1.6, enemy.elite_hue, 15)
		_ring(enemy.x, enemy.y, enemy.size, enemy.size * 7.0, 0.45, enemy.elite_hue)
		_ring(enemy.x, enemy.y, 4, enemy.size * 4.0, 0.28, "#ffffff")
		_shake(0.12, 0.5)
		hit_stop = maxf(hit_stop, 0.04)
		if enemy.rage_on_death:
			var rage_range := 100.0 * _rb()
			_chain_explosion(enemy.x, enemy.y, rage_range, enemy.max_hp * 0.12, 0.0, "")
			_ring(enemy.x, enemy.y, 10, rage_range * 1.2, 0.4, "#ff7675")
			for ri in range(14):
				spawn_particle(enemy.x, enemy.y, "#ff7675", 6.0 + _rand() * 5.0, 0.45)
			_world_text(enemy.x, enemy.y - 36.0, "🔴 격노 폭발!", 1.2, "#ff7675", 13)

	if enemy.goblin:
		if enemy.is_mini:
			drop_mini_jackpot(enemy.x, enemy.y)
		else:
			drop_goblin_jackpot(enemy.x, enemy.y)
		overdrive_charge = minf(100.0, overdrive_charge + (5.0 if enemy.is_mini else 10.0))
		_shake(0.3, 0.6)

	# 처치 충격파 링 + 파티클
	var col := enemy.color
	var death_r := enemy.size * 5.0 + 30.0 + enemy.tier * 20
	_ring(enemy.x, enemy.y, enemy.size * 0.5, death_r, 0.38, col)
	var p_count := 50 if enemy.is_boss else (24 if enemy.tier >= 2 else 8 + enemy.tier * 8)
	for i in range(p_count):
		var big := i < p_count * 0.25
		spawn_particle(enemy.x, enemy.y, col,
			((enemy.tier + 2) * 7.0 + _rand() * 8.0) if big else ((enemy.tier + 1) * 4.0 + _rand() * 5.0),
			(0.5 + _rand() * 0.55) if big else (0.25 + _rand() * 0.4))
	if enemy.is_boss:
		boss_active = false
		bosses_killed += 1
		for k in range(R.BOSS_ITEM_BOXES):
			var ba := (float(k) / R.BOSS_ITEM_BOXES) * TAU
			item_boxes.append({"x": enemy.x + cos(ba) * 55.0, "y": enemy.y + sin(ba) * 55.0, "life": R.ITEM_BOX_LIFETIME, "pulse_t": 0.0})
		spawn_explosion(enemy.x, enemy.y, 200, 0, true, "")
		_shake(0.5, 0.7)
		hit_stop = maxf(hit_stop, 0.13)
		_screen_text("🏆 BOSS SLAIN!", 3.5, "#f1c40f", 26)
	xp_gems.append({"x": enemy.x, "y": enemy.y, "val": enemy.xp_val, "attracting": false})
	# 일반 몬스터 5% 확률로 리롤권 (최대 9개)
	if not enemy.is_boss and _rand() < R.REROLL_DROP_CHANCE and player.rerolls < 9:
		player.rerolls += 1
		_world_text(enemy.x, enemy.y - 20.0, "🎲 리롤권 획득!", 1.8, "#a29bfe", 13)
	_on_kill_godot(enemy)
	enemies.erase(enemy)
	if rupture_burst > 0.0:
		spawn_explosion(enemy.x, enemy.y, 46.0 + slash_mod_level("rupture") * 12, rupture_burst, false, "")


# ── XP / 레벨업 ─────────────────────────────────────────────────────

func gain_xp(val: float) -> void:
	player.xp += val
	var needed: int = R.xp_needed(player.level)
	if player.xp >= needed:
		player.xp -= needed
		player.level += 1
		show_level_up()


func show_level_up() -> void:
	state = "levelup"
	_emit("levelup")
	_show_choices("levelup", build_choices())


## 즉시 효과가 무의미한 아이템 제외 (체력 가득일 때 치료킷)
func usable_item_boxes() -> Array:
	return R.ITEM_BOX_POOL.filter(func(item): return not (item["id"] == "medkit" and player.hp >= player.max_hp))


func show_item_box_choices() -> void:
	state = "itembox"
	_show_choices("itembox", _item_box_picks())


func _item_box_picks() -> Array:
	var pool := usable_item_boxes().duplicate()
	_shuffle(pool)
	var out: Array = []
	for item in pool.slice(0, 3):
		out.append({"kind": "item", "item_id": item["id"], "name": "%s %s" % [item["icon"], item["name"]], "desc": "", "tag": ""})
	return out


func _show_choices(kind: String, picks: Array) -> void:
	free_reroll_used = false
	choice_kind = kind
	choices = picks


## 무료 1회, 그 뒤엔 리롤권 소모
func can_reroll() -> bool:
	return not free_reroll_used or player.rerolls > 0


func do_reroll() -> void:
	if choice_kind == "":
		return
	if not free_reroll_used:
		free_reroll_used = true
	elif player.rerolls > 0:
		player.rerolls -= 1
	else:
		return
	choices = build_choices() if choice_kind == "levelup" else _item_box_picks()


## 선택지 하나를 고른다 (JS 의 버튼 onclick → c.choose())
func choose(i: int) -> void:
	if (state != "levelup" and state != "itembox") or i < 0 or i >= choices.size():
		return
	var c: Dictionary = choices[i]
	# 상태를 먼저 되돌린다 — 효과(진공 청소기의 XP 흡수)가 레벨업을 열면 그 선택창이 남아야 한다.
	# (웹판은 효과 뒤에 state='playing' 으로 덮어써서 그 레벨업 선택을 잃는다)
	choices = []
	choice_kind = ""
	state = "playing"
	match String(c["kind"]):
		"evolve":
			evolve_weapon(c["evo"])
		"weapon-lv", "weapon-new":
			add_weapon(c["weapon_id"])
		"passive":
			apply_passive(R.find_def(R.PASSIVE_POOL, c["passive_id"]))
		"slash-support":
			apply_slash_support(R.find_def(R.SLASH_SUPPORT_DEFS, c["support_id"]))
		"overflow":
			player.hp = player.max_hp
		"item":
			apply_item_box(c["item_id"])


func choice_weight(choice: Dictionary) -> float:
	var kind: String = choice["kind"]
	if kind == "weapon-lv":
		var level := int(player.weapon_levels.get(choice["weapon_id"], 1))
		for evo in R.EVOLUTION_DEFS:
			if evo["base"] == choice["weapon_id"] and int(player.passives.get(evo["req"], 0)) > 0:
				return 6.0
		return 4.8 if level >= R.MAX_WEAPON_LEVEL - 1 else 3.2
	if kind == "passive":
		var completes := false
		var supports := false
		for evo in R.EVOLUTION_DEFS:
			if evo["req"] != choice["passive_id"] or not player.weapons.has(evo["base"]):
				continue
			supports = true
			if int(player.weapon_levels.get(evo["base"], 1)) >= R.MAX_WEAPON_LEVEL:
				completes = true
		return 7.0 if completes else (4.4 if supports else 2.2)
	if kind == "weapon-new":
		var early_run := player.level <= 4 or player.weapons.size() <= 2
		return 4.0 if early_run else 2.4
	if kind == "slash-support":
		var level := slash_mod_level(choice["support_id"])
		return (3.6 - level * 0.25) if _has_any_slash_support() else 3.4
	return 1.0


func _has_any_slash_support() -> bool:
	for v in player.slash_mods.values():
		if int(v) > 0:
			return true
	return false


func weighted_pick(pool: Array) -> int:
	var total := 0.0
	for c in pool:
		total += choice_weight(c)
	var roll := _rand() * total
	for i in range(pool.size()):
		roll -= choice_weight(pool[i])
		if roll <= 0.0:
			return i
	return pool.size() - 1


func take_weighted_choices(pool: Array, limit: int) -> Array:
	var available := pool.duplicate()
	var picks: Array = []
	while not available.is_empty() and picks.size() < limit:
		var idx := weighted_pick(available)
		picks.append(available[idx])
		available.remove_at(idx)
	return picks


func evolution_choices() -> Array:
	var out: Array = []
	for evo in available_evolutions():
		var w: Dictionary = R.WEAPON_DEFS[evo["id"]]
		out.append({
			"kind": "evolve", "evo": evo, "tag": "",
			"name": "✨ 진화: %s %s" % [w["icon"], w["name"]],
			"desc": "%s + %s → %s" % [R.WEAPON_DEFS[evo["base"]]["name"], evo["reqName"], w["desc"]],
		})
	return out


## 보유 무기 레벨업 — 최대 레벨·진화 무기 제외
func weapon_level_choices() -> Array:
	var out: Array = []
	for id in player.weapons:
		var lvl := int(player.weapon_levels.get(id, 1))
		var w: Dictionary = R.WEAPON_DEFS[id]
		if lvl >= R.MAX_WEAPON_LEVEL or w.get("evolved", false):
			continue
		var extra: String = R.WEAPON_LVUP_DESC.get(R.weapon_family(id), "")
		out.append({
			"kind": "weapon-lv", "weapon_id": id,
			"tag": "Near evolution" if lvl >= R.MAX_WEAPON_LEVEL - 1 else "Power up",
			"name": "%s %s Lv.%d→%d" % [w["icon"], w["name"], lvl, lvl + 1],
			"desc": "데미지 +22% · 사거리·범위 +5%" + (" · " + extra if extra != "" else ""),
		})
	return out


## 신규 무기 — 슬롯 여유가 있을 때 미보유 무기만
func new_weapon_choices() -> Array:
	var out: Array = []
	if player.weapons.size() >= R.MAX_WEAPONS:
		return out
	for id in R.WEAPON_POOL:
		if player.weapons.has(id):
			continue
		var w: Dictionary = R.WEAPON_DEFS[id]
		out.append({
			"kind": "weapon-new", "weapon_id": id,
			"tag": "Build starter" if player.weapons.size() <= 2 else "New weapon",
			"name": "%s %s (신규)" % [w["icon"], w["name"]],
			"desc": w["desc"],
		})
	return out


## 패시브 — 최대 스택 도달 항목 제외
func passive_choices() -> Array:
	var out: Array = []
	for pv in R.PASSIVE_POOL:
		if is_passive_maxed(pv):
			continue
		var lvl := passive_level(pv["id"])
		var stack := ""
		if lvl > 0:
			stack = (" (Lv.%d/%d)" % [lvl, int(pv["max"])]) if pv["max"] != null else (" (Lv.%d · 무제한)" % lvl)
		var combo := false
		for evo in R.EVOLUTION_DEFS:
			if evo["req"] == pv["id"] and player.weapons.has(evo["base"]):
				combo = true
		out.append({
			"kind": "passive", "passive_id": pv["id"],
			"tag": "Combo passive" if combo else "Passive",
			"name": pv["name"],
			"desc": String(pv["desc"]) + stack,
		})
	return out


## 모든 항목이 최대치일 때의 안전망 (웹판은 코인 +15 도 주지만 코인은 옮기지 않았다)
func overflow_bonus_choice() -> Dictionary:
	return {"kind": "overflow", "tag": "Maxed out", "name": "💰 보너스 보상", "desc": "체력 전체 회복"}


func slash_support_choices() -> Array:
	var out: Array = []
	for def in R.SLASH_SUPPORT_DEFS:
		var lvl := slash_mod_level(def["id"])
		if lvl >= int(def["max"]):
			continue
		out.append({
			"kind": "slash-support", "support_id": def["id"],
			"tag": "Slash combo" if lvl > 0 else "Hack support",
			"name": "%s Lv.%d->%d" % [def["name"], lvl, lvl + 1],
			"desc": def["desc"],
		})
	return out


static func _choice_key(c: Dictionary) -> String:
	var ident = c.get("support_id", c.get("weapon_id", c.get("passive_id", c["name"])))
	return "%s:%s" % [c["kind"], ident]


## 선택지 3개: 진화(최우선 1개) → 대쉬 보조(아직 없으면 1개) → 가중 추첨
func build_choices() -> Array:
	var result: Array = []
	var evos := evolution_choices()
	if not evos.is_empty():
		result.append(evos[0])
	if not _has_any_slash_support() and result.size() < 3:
		var first := take_weighted_choices(slash_support_choices(), 1)
		if not first.is_empty():
			result.append(first[0])
	var already := {}
	for c in result:
		already[_choice_key(c)] = true
	var pool: Array = []
	for c in weapon_level_choices() + new_weapon_choices() + passive_choices() + slash_support_choices():
		if not already.has(_choice_key(c)):
			pool.append(c)
	result.append_array(take_weighted_choices(pool, 3 - result.size()))
	if result.is_empty():
		result.append(overflow_bonus_choice())
	return result.slice(0, 3)


func _shuffle(a: Array) -> void:
	for i in range(a.size() - 1, 0, -1):
		var j := _pick(i + 1)
		var tmp = a[i]
		a[i] = a[j]
		a[j] = tmp


# ── 파워업 / 아이템 박스 효과 (JS 표의 apply 함수들) ─────────────────

func apply_powerup(def: Dictionary) -> void:
	var p := player
	match String(def["id"]):
		"berserk":
			p.temp_dmg_mult = 2.0
			p.temp_dmg_timer = 8.0
		"haste":
			p.temp_speed_mult = 1.5
			p.temp_speed_timer = 8.0
		"heal":
			p.hp = minf(p.hp + p.max_hp * 0.4, p.max_hp)
		"vacuum":
			var s := 0.0
			for g in xp_gems:
				s += float(g["val"])
			xp_gems.clear()
			if s > 0.0:
				gain_xp(s)


func apply_item_box(item_id: String) -> void:
	var p := player
	match item_id:
		"medkit":
			p.hp = minf(p.hp + p.max_hp * 0.5, p.max_hp)
		"barrier":
			p.invincible = 5.0
		"freeze":
			for e in enemies:
				e.frozen = 3.0
		"turbo":
			p.temp_speed_mult = 1.5
			p.temp_speed_timer = 20.0
		"power":
			p.temp_dmg_mult = 1.5
			p.temp_dmg_timer = 20.0
		"hpmax":
			p.max_hp += 30.0
			p.hp = minf(p.hp + 30.0, p.max_hp)
		"dmgperm":
			p.dmg_mult *= 1.2
		"meteorrain":
			# 플레이어 주변에 운석 14발을 시차를 두고 낙하
			var dmg := float(R.WEAPON_DEFS["meteor"]["dmg"]) * p.dmg_mult * 1.5
			var aoe := 120.0 * _rb()
			for i in range(14):
				var a := _rand() * TAU
				var r := _rand() * 320.0
				spawn_meteor_strike(p.x + cos(a) * r, p.y + sin(a) * r, dmg, aoe, true, "meteor", i * 0.07)
		"nuke":
			spawn_explosion(p.x, p.y, 230, 120.0 * p.dmg_mult, false, "etc")
			for i in range(3):
				var a := _rand() * TAU
				_chain_explosion(p.x + cos(a) * 90.0, p.y + sin(a) * 90.0, 120, 60.0 * p.dmg_mult, 0.1 + i * 0.08, "etc")
		"sweep":
			# 진공 청소기 — XP 젬 즉시 흡수, 파워업 즉시 적용, 아이템 박스는 발밑으로
			var xp_total := 0.0
			for g in xp_gems:
				xp_total += float(g["val"])
			xp_gems.clear()
			if xp_total > 0.0:
				gain_xp(xp_total)
			for pu in powerups:
				apply_powerup(pu["def"])
			powerups.clear()
			for box in item_boxes:
				box["x"] = p.x
				box["y"] = p.y
			for gd in gear_drops:
				gd["x"] = p.x
				gd["y"] = p.y
			var absorbed := item_boxes.size()
			_screen_text("🌀 전체 흡수! (+%d 드랍)" % absorbed if absorbed > 0 else "🌀 전체 흡수!", 2.0, "#9b59b6", 22)
			for k in range(20):
				spawn_particle(p.x, p.y, "#9b59b6", 6.0 + _rand() * 6.0, 0.5)


# ── 메인 루프 (JS loop 의 규칙 부분) ─────────────────────────────────

## 한 프레임. move 는 길이 ≤ 1 인 이동 방향, dash_held 는 대쉬 키를 누르고 있는지.
func tick(dt: float, move: Vector2, dash_held: bool) -> void:
	if state != "playing":
		return
	# 히트스톱 — 큰 타격 순간 아주 잠깐 전체 정지
	if hit_stop > 0.0:
		hit_stop -= dt
		return
	elapsed += dt
	if elapsed >= survive_goal and not infinite_mode:
		if not infinite_dialog_shown:
			infinite_dialog_shown = true
			state = "victory_prompt"
		return
	if infinite_mode:
		infinite_elapsed = elapsed - survive_goal
	var mins := floori(elapsed / 60.0)
	if mins > 0 and not milestones.has(mins):
		milestones[mins] = true
		_screen_text("⏱ %d분 생존!" % mins, 2.5, "#2ecc71", 18)
	update(dt, move, dash_held)


## 10분 생존 후 — true: 무한 웨이브 계속, false: 승리로 마무리
func resolve_victory(continue_infinite: bool) -> void:
	if state != "victory_prompt":
		return
	if continue_infinite:
		infinite_mode = true
		state = "playing"
		_screen_text("🌀 무한 웨이브 시작!", 3.0, "#9b59b6", 30)
		_shake(0.5, 0.8)
		evolve_flash = 0.6
	else:
		state = "win"


func set_paused(paused: bool) -> void:
	if paused and state == "playing":
		state = "paused"
	elif not paused and state == "paused":
		state = "playing"


func update(dt: float, move: Vector2, dash_held: bool) -> void:
	# 뒤처진 적 재배치 예산 — 도망칠수록(뒤처진 적이 많을수록) 두꺼워진다
	enemy_repo_budget = minf(3.0, enemy_repo_budget + (2.0 + minf(12.0, enemy_far_count * 0.12)) * dt)
	enemy_far_count = 0
	var dx := move.x
	var dy := move.y
	if dx != 0.0 or dy != 0.0:
		last_move_dir = Vector2(dx, dy)
	var dash_boost := 1.35 if player.dash_speed_boost > 0.0 else 1.0
	var spd := player.speed * player.temp_speed_mult * dash_boost * (1.0 + _gear("speed")) * (1.0 - player.slow)
	player.x += dx * spd * dt
	player.y += dy * spd * dt

	# 이동 잔상 (최대 10개)
	if dx != 0.0 or dy != 0.0:
		player_trail.append({"x": player.x, "y": player.y, "life": 0.3, "chain_color": null})
		if player_trail.size() > 10:
			player_trail.pop_front()
	player_trail = _tick_life(player_trail, dt)

	_update_dash(dt, dash_held)

	if dash_effect != null:
		dash_effect["life"] -= dt
		if dash_effect["life"] <= 0.0:
			dash_effect = null
	# 적 그리드 재구성 — 이후 DoT 필드/타겟팅/충돌이 근접 셀만 검사 (이동 전 위치 기준)
	build_enemy_grid()
	update_slash_echoes(dt)
	update_ruptures(dt)
	update_spectral_fields(dt)
	update_toxic_fields(dt)
	# meteor_call: 7초마다 운석 2발
	if has_synergy("meteor_call"):
		meteor_call_timer -= dt
		if meteor_call_timer <= 0.0:
			meteor_call_timer = 7.0
			var m_dmg := float(R.WEAPON_DEFS["meteor"]["dmg"]) * player.dmg_mult * 1.2
			var m_aoe := 130.0 * _rb()
			for s in range(2):
				var a := _rand() * TAU
				var r := 60.0 + _rand() * 180.0
				spawn_meteor_strike(player.x + cos(a) * r, player.y + sin(a) * r, m_dmg, m_aoe, true, "meteor", s * 0.18)
	# 대쉬 잔상 폭발 필드 (0.1초마다 DoT)
	for af in dash_afterimages.duplicate():
		af["life"] -= dt
		if af["life"] <= 0.0:
			dash_afterimages.erase(af)
			continue
		af["tick_timer"] += dt
		if af["tick_timer"] >= 0.1:
			af["tick_timer"] = 0.0
			dmg_source = "dash"
			for e in enemies.duplicate():
				if e.dying:
					continue
				if _dist(af["x"], af["y"], e.x, e.y) < af["range"] + e.size:
					deal_damage(e, af["dmg"], false, true)
	if player.dash_speed_boost > 0.0:
		player.dash_speed_boost = maxf(0.0, player.dash_speed_boost - dt)

	if screen_shake > 0.0:
		screen_shake = maxf(0.0, screen_shake - dt * 2.5)

	# 시야 자동 확장 — 사거리 배율이 늘면 줌아웃 (하한 0.7)
	var target_scale := maxf(0.7, minf(1.0, 1.0 / (1.0 + (_rb() - 1.0) * 0.32)))
	view_scale += (target_scale - view_scale) * minf(1.0, dt * 2.5)

	if player.invincible > 0.0:
		player.invincible -= dt

	# 골드 러시 — 4:30 에 1회
	if not infinite_mode and not gold_rush_done and elapsed >= 270.0:
		gold_rush_done = true
		spawn_gold_rush()

	# 혈월 — 2.5분 후 첫 발동, 이후 3분 간격, 15초 지속 (무한 모드 제외)
	if not infinite_mode and elapsed > 60.0:
		if blood_moon_active > 0.0:
			blood_moon_active = maxf(0.0, blood_moon_active - dt)
			if blood_moon_active <= 0.0:
				drop_powerup(player.x + (_rand() - 0.5) * 80.0, player.y + (_rand() - 0.5) * 80.0)
				_screen_text("🌅 혈월 생존! 보상 획득", 2.4, "#f39c12", 18)
		else:
			blood_moon_timer -= dt
			if blood_moon_timer <= 0.0:
				blood_moon_timer = 180.0
				blood_moon_active = 15.0
				_emit("bloodmoon")
				_screen_text("🌑 혈월 강림! 적 대폭 강화 — 버텨라!", 3.5, "#c0392b", 22)
				_shake(0.4, 0.8)

	# 웨이브 — 8분 이후 간격 단축
	var m := elapsed / 60.0
	var dyn_wave_interval: float = maxf(1.8, R.WAVE_INTERVAL - (m - 8.0) * 0.12) if m > 8.0 else R.WAVE_INTERVAL
	wave_timer += dt
	if wave_timer >= dyn_wave_interval:
		wave_timer = 0.0
		spawn_wave()

	if not boss_active and elapsed >= next_boss_time:
		next_boss_time += float(difficulty["bossInterval"])
		spawn_boss()
	if boss_warning > 0.0:
		boss_warning -= dt

	# 아이템 박스 생성
	item_box_timer += dt
	if item_box_timer >= R.ITEM_BOX_INTERVAL:
		item_box_timer = 0.0
		var ba := _rand() * TAU
		var bd := 240.0 + _rand() * 180.0
		item_boxes.append({"x": player.x + cos(ba) * bd, "y": player.y + sin(ba) * bd, "life": R.ITEM_BOX_LIFETIME, "pulse_t": 0.0})

	# 보물 고블린 (이미 맵에 있으면 대기)
	goblin_timer += dt
	if goblin_timer >= R.GOBLIN_INTERVAL and elapsed > 40.0 and not enemies.any(func(e): return e.goblin):
		goblin_timer = 0.0
		spawn_treasure_goblin()

	# 아이템 박스 수명·수집 (한 번에 하나)
	for box in item_boxes.duplicate():
		box["life"] -= dt
		box["pulse_t"] += dt
		if box["life"] <= 0.0:
			item_boxes.erase(box)
			continue
		if _dist(box["x"], box["y"], player.x, player.y) < 26.0:
			for k in range(10):
				spawn_particle(box["x"], box["y"], "#f1c40f", 5.0 + _rand() * 5.0, 0.5)
			item_boxes.erase(box)
			_emit("chest", {"x": box["x"], "y": box["y"]})
			show_item_box_choices()
			break

	# Godot 판: 땅에 떨어진 장비 — 밟으면 자동으로 장착하거나 분해
	for gd in gear_drops.duplicate():
		gd["life"] -= dt
		gd["pulse_t"] += dt
		if gd["life"] <= 0.0:
			gear_drops.erase(gd)
			continue
		if _dist(gd["x"], gd["y"], player.x, player.y) < 30.0:
			gear_drops.erase(gd)
			pick_up_gear(gd["item"])

	# 파워업 수집 (즉시 적용)
	for pu in powerups.duplicate():
		pu["life"] -= dt
		pu["pulse_t"] += dt
		if pu["life"] <= 0.0:
			powerups.erase(pu)
			continue
		if _dist(pu["x"], pu["y"], player.x, player.y) < _xp_range() * 0.9:
			var a := atan2(player.y - pu["y"], player.x - pu["x"])
			pu["x"] += cos(a) * 280.0 * dt
			pu["y"] += sin(a) * 280.0 * dt
		if _dist(pu["x"], pu["y"], player.x, player.y) < 22.0:
			var def: Dictionary = pu["def"]
			apply_powerup(def)
			_emit("powerup", {"x": pu["x"], "y": pu["y"], "color": def["color"]})
			_screen_text("%s %s!" % [def["icon"], def["name"]], 1.5, def["color"], 18)
			for k in range(12):
				spawn_particle(pu["x"], pu["y"], def["color"], 4.0 + _rand() * 4.0, 0.4)
			powerups.erase(pu)

	# 임시 버프 타이머
	if player.temp_dmg_timer > 0.0:
		player.temp_dmg_timer -= dt
		if player.temp_dmg_timer <= 0.0:
			player.temp_dmg_mult = 1.0
			player.temp_dmg_timer = 0.0
	if player.temp_speed_timer > 0.0:
		player.temp_speed_timer -= dt
		if player.temp_speed_timer <= 0.0:
			player.temp_speed_mult = 1.0
			player.temp_speed_timer = 0.0
	if player.aux_shield_time > 0.0:
		player.aux_shield_time -= dt
	if overdrive_active > 0.0:
		overdrive_active = maxf(0.0, overdrive_active - dt)
	if overdrive_flash > 0.0:
		overdrive_flash = maxf(0.0, overdrive_flash - dt)
	var regen := player.regen_rate + _gear("regen")
	if regen > 0.0 and player.hp < player.max_hp:
		player.hp = minf(player.hp + player.max_hp * regen * dt, player.max_hp)

	# 무기 발사 (진화로 배열이 바뀌어도 안전하게 복사본을 돈다)
	for id in player.weapons.duplicate():
		fire_weapon(id, dt)

	_update_projectiles(dt)

	# 연쇄 폭발
	for c in chain_explosions.duplicate():
		c["delay"] -= dt
		if c["delay"] <= 0.0:
			chain_explosions.erase(c)
			spawn_explosion(c["x"], c["y"], c["range"], c["dmg"], false, c["src"] if c["src"] != "" else "etc")

	if not _update_enemies(dt):
		return    # 사망
	if not _update_enemy_projectiles(dt):
		return
	if not _update_godot_hazards(dt):
		return

	update_low_hp_feedback(dt)

	if combo_timer > 0.0:
		combo_timer -= dt
	elif combo_count > 0:
		combo_count = 0
		combo_milestone_idx = 0

	if hurt_screen_flash > 0.0:
		hurt_screen_flash = maxf(0.0, hurt_screen_flash - dt)
	if evolve_flash > 0.0:
		evolve_flash = maxf(0.0, evolve_flash - dt)

	# 시각 전용 배열 상한 — 오래된 것부터 버린다
	if damage_numbers.size() > 200:
		damage_numbers = damage_numbers.slice(damage_numbers.size() - 200)
	if rings.size() > 140:
		rings = rings.slice(rings.size() - 140)
	if float_texts.size() > 90:
		float_texts = float_texts.slice(float_texts.size() - 90)

	float_texts = _tick_life(float_texts, dt)
	for ft in float_texts:
		if not ft["screen_space"]:
			ft["y"] -= 32.0 * dt
	damage_numbers = _tick_life(damage_numbers, dt)
	for dn in damage_numbers:
		dn["y"] -= 40.0 * dt
	rings = _tick_life(rings, dt)

	# XP 수집 — 끌어당김 + 가속 (안 먹힌 젬만 남긴다)
	var gems_left: Array = []
	var gems_taken := 0
	for g in xp_gems:
		var d := _dist(g["x"], g["y"], player.x, player.y)
		var attract_range := _xp_range() * 2.2
		if d < attract_range:
			var pull := minf(1.0, 1.0 - d / attract_range)
			var speed := 180.0 + pull * pull * 520.0
			var ang := atan2(player.y - g["y"], player.x - g["x"])
			g["x"] += cos(ang) * speed * dt
			g["y"] += sin(ang) * speed * dt
			g["attracting"] = true
		if _dist(g["x"], g["y"], player.x, player.y) < maxf(_xp_range(), 20.0):
			gain_xp(float(g["val"]) * (1.0 + _gear("xp")))
			gems_taken += 1
			var v: float = g["val"]
			var gc := "#ffd700" if v >= 80 else ("#f39c12" if v >= 30 else ("#f1c40f" if v >= 10 else "#ffe082"))
			spawn_particle(g["x"], g["y"], gc, 3.0 + (2.0 if v >= 30 else 0.0), 0.22)
			spawn_particle(g["x"], g["y"], "#ffe9a8", 2, 0.18)
		else:
			gems_left.append(g)
	xp_gems = gems_left
	if gems_taken > 0:
		_emit("gem", {"n": gems_taken})

	particles = _tick_life(particles, dt)
	for p in particles:
		p["x"] += p["vx"] * dt
		p["y"] += p["vy"] * dt
		p["vx"] *= 0.92
		p["vy"] *= 0.92


## 수명(life)을 줄이고 살아 있는 것만 담은 새 배열. Array.erase 는 Dictionary 를 '내용'으로 비교해
## 찾으므로 수백 개를 하나씩 지우면 프레임마다 O(n²) 이 된다 — 그래서 걸러서 새로 만든다.
static func _tick_life(list: Array, dt: float) -> Array:
	var out: Array = []
	for item in list:
		item["life"] -= dt
		if item["life"] > 0.0:
			out.append(item)
	return out


## 대쉬 공격 (Space / X) — 연쇄 대쉬: 적중한 대쉬 직후 1초 안에 다시 누르면 최대 2번 더
func _update_dash(dt: float, dash_held: bool) -> void:
	if dash_cd > 0.0:
		dash_cd -= dt
	if dash_chain_window > 0.0:
		dash_chain_window -= dt
	var just_pressed := dash_held and not last_dash_key_state
	last_dash_key_state = dash_held
	var can_chain := just_pressed and dash_chain_window > 0.0 and dash_chain_count < 2
	var can_normal := dash_held and dash_cd <= 0.0
	if not can_chain and not can_normal:
		return
	var is_chain := can_chain and not can_normal
	var da := atan2(last_move_dir.y, last_move_dir.x)
	var sx := player.x
	var sy := player.y
	var stats := slash_stats()
	var chain_mult := pow(0.70, dash_chain_count + 1) if is_chain else 1.0
	var dash_dist := (105.0 + dash_chain_count * 18) if is_chain else 90.0
	if is_chain:
		dash_chain_count += 1
		dash_chain_window = 0.9 if dash_chain_count < 2 else 0.0
		dash_cd = maxf(dash_cd, 0.2)
	else:
		dash_cd = R.DASH_COOLDOWN * (0.6 if has_legendary("shadow") else 1.0)
		dash_chain_count = 0
		dash_chain_window = 0.0
	var trail_color = null
	if is_chain:
		trail_color = Color("#74b9ff") if dash_chain_count == 1 else Color.WHITE
	for s in range(1, 7):
		player_trail.append({"x": player.x + cos(da) * 13.0 * s, "y": player.y + sin(da) * 13.0 * s, "life": 0.34, "chain_color": trail_color})
	while player_trail.size() > 20:
		player_trail.pop_front()
	player.x += cos(da) * dash_dist
	player.y += sin(da) * dash_dist
	var ex := player.x
	var ey := player.y
	dash_effect = {"x": sx, "y": sy, "end_x": ex, "end_y": ey, "angle": da, "life": 0.3, "max_life": 0.3, "range": stats["range"], "width": stats["width"], "cleave": stats["cleave"], "is_chain": is_chain, "chain_idx": dash_chain_count}
	var hit_stats := stats.duplicate()
	hit_stats["damage_mult"] = float(stats["damage_mult"]) * chain_mult
	var hit_count := perform_dash_slash(sx, sy, ex, ey, hit_stats)
	_emit("dash", {"x": sx, "y": sy, "ex": ex, "ey": ey, "hits": hit_count, "chain": is_chain})
	if has_legendary("shadow"):
		player.invincible = maxf(player.invincible, 1.0)
	# 잿불 군주 4세트: 대쉬 경로에 3초 불길
	if set_count("ember") >= 4:
		for k in range(4):
			var f := (k + 0.5) / 4.0
			fire_trails.append({"x": lerpf(sx, ex, f), "y": lerpf(sy, ey, f), "r": 34.0 * _rb(), "life": 3.0, "max_life": 3.0,
				"dmg": 40.0 * player.dmg_mult * _dmg_bonus(), "tick": 0.0})
	queue_slash_echoes(sx, sy, ex, ey, da, stats)
	# 잔상 폭발 필드: 도착점에 0.8초 DoT 영역
	dash_afterimages.append({"x": ex, "y": ey, "life": 0.8, "max_life": 0.8, "tick_timer": 0.0,
		"dmg": R.DASH_DMG * player.dmg_mult * float(stats["damage_mult"]) * chain_mult * 0.28,
		"range": 52.0 + int(stats["cleave"]) * 10, "is_chain": is_chain})
	if not is_chain and hit_count > 0 and dash_chain_window <= 0.0:
		dash_chain_window = 1.0
		_world_text(ex, ey - 30.0, "⚡ CHAIN!", 0.75, "#74b9ff", 14)
	# 5명 이상 동시 적중 → 메인 무기 쿨다운 초기화
	if hit_count >= 5:
		var first_w := get_main_weapon()
		if first_w == "" and not player.weapons.is_empty():
			first_w = player.weapons[0]
		if first_w != "" and float(player.weapon_cds.get(first_w, 0.0)) > 0.0:
			player.weapon_cds[first_w] = 0.0
			_world_text(ex, ey - 46.0, "💥 CD RESET!", 1.2, "#f1c40f", 14)
	# 3연쇄 완성 → 충격파 + 속도 부스트
	if is_chain and dash_chain_count >= 2:
		var burst_range := 90.0 * _rb()
		_chain_explosion(ex, ey, burst_range, R.DASH_DMG * player.dmg_mult * 1.8, 0.0, "dash")
		_ring(ex, ey, 10, burst_range, 0.45, "#ffffff")
		_ring(ex, ey, 4, burst_range * 0.5, 0.28, "#74b9ff")
		_screen_text("🌟 TRIPLE DASH!", 1.8, "#ffffff", 22)
		_shake(0.3, 0.65)
		player.dash_speed_boost = 0.5
		dash_chain_window = 0.0


func _update_projectiles(dt: float) -> void:
	for p in projectiles.duplicate():
		p.life -= dt
		if p.life <= 0.0:
			# 운석은 수명이 다하면 목표 지점에서 강제 폭발 (피해 누락 방지)
			if p.type == "meteor" and p.delay <= 0.0:
				spawn_explosion(p.tx, p.ty, p.aoe, p.dmg, false, p.src if p.src != "" else "meteor")
				_ring(p.tx, p.ty, 8, p.aoe, 0.4, "#ff7675" if p.evolved else "#e17055")
			projectiles.erase(p)
			continue
		dmg_source = p.src if p.src != "" else R.PROJ_TYPE_FAMILY.get(p.type, "")
		match p.type:
			"orb", "blackhole":
				_update_orb(p, dt)
			"arrow":
				p.x += p.vx * dt
				p.y += p.vy * dt
				for e in enemies_near(p.x, p.y, p.r):
					if e.dying:
						continue
					if _dist(p.x, p.y, e.x, e.y) < p.r + e.size:
						deal_damage(e, p.dmg)
						if has_synergy("armor_breaker"):
							_chain_explosion(e.x, e.y, 42, p.dmg * 0.4, 0.0, "")
						p.pierce -= 1
						if p.pierce <= 0:
							break
				if p.pierce <= 0:
					projectiles.erase(p)
			"laser", "deathray":
				var evolved: bool = p.type == "deathray"
				var ex: float = p.x + cos(p.angle) * p.length
				var ey: float = p.y + sin(p.angle) * p.length
				var mult := 9.0 if evolved else 5.0
				var hit_w := 8.0 if evolved else 6.0
				for e in enemies_near((p.x + ex) / 2.0, (p.y + ey) / 2.0, p.length / 2.0 + hit_w):
					if e.dying:
						continue
					if _dist_to_segment(e.x, e.y, p.x, p.y, ex, ey) < e.size + hit_w:
						deal_damage(e, p.dmg * dt * mult)
			"explosion":
				p.r = p.max_r * (1.0 - p.life / 0.4)
			"boomerang":
				if not p.flipped and p.life < p.half_life:
					p.vx = -p.vx
					p.vy = -p.vy
					p.flipped = true
				p.x += p.vx * dt
				p.y += p.vy * dt
				var hit_set: Dictionary = p.hit_in if p.flipped else p.hit_out
				for e in enemies_near(p.x, p.y, p.r):
					if e.dying:
						continue
					if not hit_set.has(e.id) and _dist(p.x, p.y, e.x, e.y) < p.r + e.size:
						hit_set[e.id] = true
						deal_damage(e, p.dmg)
						if has_synergy("armor_breaker"):
							_chain_explosion(e.x, e.y, 42, p.dmg * 0.4, 0.0, "")
						spawn_particle(p.x, p.y, "#27ae60", 5, 0.2)
			"missile":
				# 유도탄: 가까운 적 쪽으로 점진 선회, 접촉 시 소형 폭발
				var tgt := nearest_enemy_near(p.x, p.y, 600.0)
				if tgt != null:
					var desired := atan2(tgt.y - p.y, tgt.x - p.x)
					var cur := atan2(p.vy, p.vx)
					var diff := fmod(desired - cur + PI * 3.0, TAU) - PI
					var step := clampf(diff, -p.turn * dt, p.turn * dt)
					var na := cur + step
					p.vx = cos(na) * p.spd
					p.vy = sin(na) * p.spd
				p.x += p.vx * dt
				p.y += p.vy * dt
				p.trail_t += dt
				if p.trail_t > 0.03:
					p.trail_t = 0.0
					spawn_particle(p.x, p.y, "#ff9ff3" if p.evolved else "#e056fd", 3, 0.22)
				for e in enemies_near(p.x, p.y, p.r):
					if e.dying:
						continue
					if _dist(p.x, p.y, e.x, e.y) < p.r + e.size:
						_chain_explosion(p.x, p.y, p.aoe, p.dmg, 0.0, "missile")
						_ring(p.x, p.y, 4, p.aoe, 0.2, "#ff9ff3" if p.evolved else "#e056fd")
						projectiles.erase(p)
						break
			"axe":
				if p.evolved:
					# 나선: 진행 방향이 계속 돌고 점점 빨라진다
					var a: float = atan2(p.vy, p.vx) + p.turn * dt
					var sp := Vector2(p.vx, p.vy).length() * (1.0 + 0.7 * dt)
					p.vx = cos(a) * sp
					p.vy = sin(a) * sp
				else:
					p.vy += p.grav * dt
				p.x += p.vx * dt
				p.y += p.vy * dt
				p.spin += dt * (16.0 if p.evolved else 12.0)
				for e in enemies_near(p.x, p.y, p.r):
					if e.dying or p.hit_out.has(e.id):
						continue
					if _dist(p.x, p.y, e.x, e.y) < p.r + e.size:
						p.hit_out[e.id] = true
						deal_damage(e, p.dmg)
						p.pierce -= 1
						if p.pierce <= 0:
							break
				if p.pierce <= 0:
					projectiles.erase(p)
			"meteor":
				if p.delay > 0.0:
					p.delay -= dt
				else:
					p.y += p.vy * dt
					if _rand() < 0.6:
						spawn_particle(p.x + (_rand() - 0.5) * 10.0, p.y - 14.0, "#ff7675" if p.evolved else "#fab1a0", 4.0 + _rand() * 3.0, 0.3)
					if p.y >= p.ty:
						spawn_explosion(p.tx, p.ty, p.aoe, p.dmg, false, p.src if p.src != "" else "meteor")
						var col := "#ff7675" if p.evolved else "#e17055"
						_ring(p.tx, p.ty, 8, p.aoe, 0.4, col)
						for k in range(16 if p.evolved else 10):
							spawn_particle(p.tx, p.ty, col, 5.0 + _rand() * 6.0, 0.5)
						_shake(0.3 if p.evolved else 0.18, 0.6)
						projectiles.erase(p)
			# "arc" 는 시각 효과 전용 — 수명만 줄어든다


func _update_orb(p: Proj, dt: float) -> void:
	var base_angle := elapsed * 1.8 + (float(p.orb_idx) / p.orb_total) * TAU
	var orbit := p.orbit_r if p.orbit_r > 0.0 else float(R.WEAPON_DEFS["orb"]["range"])
	p.x = player.x + cos(base_angle) * orbit
	p.y = player.y + sin(base_angle) * orbit
	var evolved := p.type == "blackhole"
	# 블랙홀: 사건의 지평선(흡입 반경) — 적을 블랙홀 중심으로 빨아들인다
	var capture_r := p.r + 78.0 if evolved else p.r
	for e in enemies_near(p.x, p.y, capture_r):
		if e.dying:
			continue
		var de := _dist(p.x, p.y, e.x, e.y)
		if de < p.r + e.size:
			deal_damage(e, p.dmg * dt * 3.0)
			# 블랙홀 중력 누적 — 0.3초 간격, 3스택 시 중력 폭발
			if evolved and not e.is_boss and elapsed - e.grav_last_stack > 0.3:
				e.grav_last_stack = elapsed
				e.grav_stacks += 1
				if e.grav_stacks >= 3:
					e.grav_stacks = 0
					var g_range := 220.0 * _rb()
					for ge in enemies_near(e.x, e.y, g_range):
						if ge == e or ge.is_boss or ge.dying:
							continue
						var gd := _dist(e.x, e.y, ge.x, ge.y)
						if gd < g_range:
							var ga := atan2(e.y - ge.y, e.x - ge.x)
							ge.x += cos(ga) * minf(gd * 0.5, 75.0)
							ge.y += sin(ga) * minf(gd * 0.5, 75.0)
					_chain_explosion(e.x, e.y, g_range * 0.5, p.dmg * 14.0, 0.22, "orb")
					_ring(e.x, e.y, 14, g_range * 0.5, 0.5, "#b388ff")
					_ring(e.x, e.y, 6, 28, 0.2, "#9b59b6")
					for gi in range(18):
						spawn_particle(e.x, e.y, "#b388ff", 5.0 + _rand() * 6.0, 0.5)
					_world_text(e.x, e.y - 34.0, "🌀 중력 폭발!", 1.5, "#b388ff", 14)
					_shake(0.14, 0.5)
		if evolved and not e.is_boss and not e.dying and de < capture_r + e.size:
			var pull_str: float = 60.0 + 150.0 * (1.0 - de / (capture_r + e.size))
			var a := atan2(p.y - e.y, p.x - e.x)
			e.x += cos(a) * pull_str * dt
			e.y += sin(a) * pull_str * dt
			if de < capture_r:
				deal_damage(e, p.dmg * dt * 1.6)
				if _rand() < 0.25:
					spawn_particle(e.x, e.y, "#b388ff", 3, 0.2)
	# 레벨2+ 구슬 / 블랙홀: 적 투사체 흡수
	var orb_level := 5 if evolved else int(player.weapon_levels.get("orb", 1))
	if orb_level >= 2:
		var intercept_r := capture_r if evolved else p.r + 8.0
		for ep in enemy_projectiles.duplicate():
			if _dist(p.x, p.y, ep["x"], ep["y"]) < intercept_r + ep["r"]:
				_ring(ep["x"], ep["y"], 3, 22, 0.14, "#9b59b6" if evolved else "#3498db")
				for s in range(4):
					spawn_particle(ep["x"], ep["y"], "#b388ff" if evolved else "#74b9ff", 3, 0.18)
				enemy_projectiles.erase(ep)


## 적 이동·행동·접촉 피해. 플레이어가 죽으면 false
func _update_enemies(dt: float) -> bool:
	player.slow = 0.0
	var frost4 := set_count("frost") >= 4
	var frost_r := 140.0 * _rb()
	var burn_mult := 2.0 if set_count("ember") >= 4 else 1.0
	for e in enemies.duplicate():
		if e.hurt_flash > 0.0:
			e.hurt_flash -= dt
		if e.spawn_t > 0.0:
			e.spawn_t = maxf(0.0, e.spawn_t - dt)
		# 상태이상 도트 — 화상(중첩 비례) + 중독
		if e.burn_timer > 0.0:
			e.burn_timer -= dt
			dmg_source = "dot"
			deal_damage(e, (e.burn_dmg if e.burn_dmg > 0.0 else 4.0) * maxi(e.burn_stacks, 1) * burn_mult * dt, true, true)
			if e.burn_timer <= 0.0:
				e.burn_stacks = 0
			if _rand() < 0.25:
				spawn_particle(e.x, e.y - e.size * 0.5, "#e67e22", 3, 0.25)
		if e.poison_timer > 0.0 and not e.dying:
			e.poison_timer -= dt
			dmg_source = "dot"
			deal_damage(e, (e.poison_dmg if e.poison_dmg > 0.0 else 3.0) * dt, true, true)
			if _rand() < 0.2:
				spawn_particle(e.x, e.y - e.size * 0.5, "#27ae60", 3, 0.25)
		if e.dying or e.hp <= 0.0:
			continue
		var ang := atan2(player.y - e.y, player.x - e.x)
		var d := _dist(e.x, e.y, player.x, player.y)
		e.face_angle = ang
		# ── Godot 판: 종류·정예 특성의 지속 효과 ──
		if e.regen > 0.0:
			e.hp = minf(e.hp + e.max_hp * e.regen * dt, e.max_hp)
		e.slow = 0.4 if frost4 and d < frost_r and not e.is_boss else 0.0
		if e.type == "wraith":
			e.phase_t += dt
			e.ethereal = fmod(e.phase_t, 4.0) > 2.6
		if not e.affixes.is_empty():
			if e.affixes.has("frost") and d < 130.0:
				player.slow = maxf(player.slow, 0.35)
			if e.affixes.has("summoner"):
				e.summon_cd -= dt
				if e.summon_cd <= 0.0 and enemies.size() < R.MAX_ENEMIES:
					e.summon_cd = 6.0
					for k in range(3):
						var sa := _rand() * TAU
						var mhp := 30.0 * (1.0 + elapsed / 120.0) * float(difficulty["enemyHpMult"])
						_spawn_minion("bat" if k % 2 == 0 else "ghoul", e.x + cos(sa) * 40.0, e.y + sin(sa) * 40.0, 0, mhp, 9.0, 95.0, 3)
					_ring(e.x, e.y, 6, 60, 0.35, "#9b59b6")
			if e.affixes.has("blink"):
				e.blink_cd -= dt
				if e.blink_cd <= 0.0 and d > 170.0:
					e.blink_cd = 4.0
					var ba := _rand() * TAU
					_ring(e.x, e.y, 4, 40, 0.3, "#d7a3f5")
					e.x = player.x + cos(ba) * 150.0
					e.y = player.y + sin(ba) * 150.0
					_ring(e.x, e.y, 40, 4, 0.3, "#d7a3f5")
					_emit("blink", {"x": e.x, "y": e.y})
		var sm: float = 1.0 - e.slow

		# 뒤처진 적 재배치 — 적은 전부 플레이어보다 느려서 한 방향으로 달리기만 하면 아무도 못 따라온다.
		# 너무 멀어진 적은 체력을 유지한 채 진행 방향 앞쪽 링으로 순간이동한다.
		if not e.is_boss and not e.goblin and d > 900.0:
			enemy_far_count += 1
			if enemy_repo_budget >= 1.0:
				enemy_repo_budget -= 1.0
				var heading := atan2(last_move_dir.y, last_move_dir.x) if last_move_dir != Vector2.ZERO else _rand() * TAU
				var a2 := heading + (_rand() - 0.5) * PI
				var r2 := 560.0 + _rand() * 160.0
				e.x = player.x + cos(a2) * r2
				e.y = player.y + sin(a2) * r2
				continue

		# 보스 페이즈 전환 (HP 50% 이하 → 격노)
		if e.is_boss:
			var expected := 1 if e.hp < e.max_hp * 0.5 else 0
			if expected != e.boss_phase:
				e.boss_phase = expected
				_world_text(e.x, e.y - 50.0, "⚡ ENRAGE!", 1.8, "#e74c3c", 18)
				for k in range(20):
					spawn_particle(e.x, e.y, "#e74c3c", 8.0 + _rand() * 6.0, 0.6)
				_shake(0.4, 0.5)

		var rage_active: bool = not e.is_boss and e.hp < e.max_hp * 0.3
		var rage_mult := 1.5 if rage_active else 1.0

		if e.frozen > 0.0 or e.stun > 0.0:
			if e.frozen > 0.0:
				e.frozen -= dt
			if e.stun > 0.0:
				e.stun -= dt
		elif e.behavior == "goblin":
			# 보물 고블린: 반대 방향 지그재그 도주
			var flee := ang + PI + sin(elapsed * 4.0) * 0.5
			e.x += cos(flee) * e.speed * dt
			e.y += sin(flee) * e.speed * dt
			e.goblin_life -= dt
			if e.goblin_life <= 0.0:
				_screen_text("💨 고블린이 도망쳤다...", 1.8, "#95a5a6", 16)
				for k in range(8):
					spawn_particle(e.x, e.y, "#bdc3c7", 4, 0.4)
				enemies.erase(e)
				continue
		elif e.is_boss:
			# 보스: 추적 + 예비 동작 후 원형 탄막
			var b_speed: float = e.speed * 1.4 if e.boss_phase == 1 else e.speed
			var windup_slow := 0.25 if e.windup_active else 1.0
			e.x += cos(ang) * b_speed * windup_slow * dt
			e.y += sin(ang) * b_speed * windup_slow * dt
			if e.attack_cd > 0.0:
				e.attack_cd -= dt
			elif not e.windup_active:
				e.windup_active = true
				e.windup_timer = 0.5 if e.boss_phase == 1 else 0.75
			else:
				e.windup_timer -= dt
				if e.windup_timer <= 0.0:
					var shots := 12 if e.boss_phase == 1 else 8
					for b in range(shots):
						fire_enemy_projectile(e, (float(b) / shots) * TAU - ang)
					e.attack_cd = 1.5 if e.boss_phase == 1 else 2.5
					e.windup_active = false
					e.windup_timer = 0.0
		elif e.behavior == "archer":
			var pref_dist := 200.0 if e.tier == 2 else 170.0
			if d > pref_dist * 1.3:
				e.x += cos(ang) * e.speed * rage_mult * sm * dt
				e.y += sin(ang) * e.speed * rage_mult * sm * dt
			elif d < pref_dist * 0.7:
				e.x -= cos(ang) * e.speed * 0.55 * dt
				e.y -= sin(ang) * e.speed * 0.55 * dt
			if e.attack_cd > 0.0:
				e.attack_cd -= dt
			if e.attack_cd <= 0.0 and d < e.attack_range:
				var shots := 3 if e.tier == 2 else (2 if rage_active else 1)
				for s in range(shots):
					fire_enemy_projectile(e, (s - (shots - 1) / 2.0) * 0.22 if shots > 1 else 0.0)
				e.attack_cd = e.attack_base * (0.55 if rage_active else 1.0)
		elif e.type == "bomber":
			# 폭탄 임프: 붙으면 멈춰서 0.8초 점화 → 자폭 (주변 적도 휘말린다)
			if e.fuse >= 0.0:
				e.fuse -= dt
				if e.fuse < 0.0:
					e.dying = true
					enemies.erase(e)
					if _enemy_blast(e.x, e.y, 95.0, e.attack_dmg * 0.9 + 4.0, true, "#e74c3c"):
						return false
					continue
			elif d < 70.0:
				e.fuse = 0.8
				_emit("fuse", {"x": e.x, "y": e.y})
			else:
				e.x += cos(ang) * e.speed * rage_mult * sm * dt
				e.y += sin(ang) * e.speed * rage_mult * sm * dt
		elif e.type == "golem":
			# 룬 골렘: 가까우면 멈춰 0.75초 예고 → 광역 내려찍기
			e.slam_cd -= dt
			if e.slam_t >= 0.0:
				e.slam_t -= dt
			elif e.slam_cd <= 0.0 and d < 120.0:
				e.slam_t = 0.75
				e.slam_cd = 4.0
				hazards.append({"x": e.x, "y": e.y, "r": 125.0, "t": 0.75, "max_t": 0.75, "dmg": e.attack_dmg * 0.8 + 4.0, "color": "#e67e22"})
			else:
				e.x += cos(ang) * e.speed * sm * dt
				e.y += sin(ang) * e.speed * sm * dt
		elif e.type == "charger":
			# 돌격 멧돼지: 예고선 0.6초 → 0.7초 돌진 → 3.5초 쉼
			e.charge_cd -= dt
			if e.charge_state == 1:
				e.charge_t -= dt
				if e.charge_t <= 0.0:
					e.charge_state = 2
					e.charge_t = 0.7
			elif e.charge_state == 2:
				e.x += e.charge_dir.x * 520.0 * sm * dt
				e.y += e.charge_dir.y * 520.0 * sm * dt
				e.charge_t -= dt
				if e.charge_t <= 0.0:
					e.charge_state = 0
					e.charge_cd = 3.5
			elif e.charge_cd <= 0.0 and d > 140.0 and d < 420.0:
				e.charge_state = 1
				e.charge_t = 0.6
				e.charge_dir = Vector2(cos(ang), sin(ang))
			else:
				e.x += cos(ang) * e.speed * rage_mult * sm * dt
				e.y += sin(ang) * e.speed * rage_mult * sm * dt
		else:
			# 박쥐는 지그재그로 날아든다
			var mv: float = ang + (sin(elapsed * 5.0 + e.id) * 0.9 if e.type == "bat" else 0.0)
			e.x += cos(mv) * e.speed * rage_mult * sm * dt
			e.y += sin(mv) * e.speed * rage_mult * sm * dt

		# 넉백 감속 (빙결 중 제외). 웹판은 `!e.frozen` 이라 빙결이 풀리며 frozen 이 음수(-0.01 따위)로
		# 남으면 그 적은 다시는 넉백되지 않는다 — 여기선 의도대로 '빙결 중일 때만' 막는다.
		if e.frozen <= 0.0 and (e.knock_vx != 0.0 or e.knock_vy != 0.0):
			e.x += e.knock_vx * dt
			e.y += e.knock_vy * dt
			var k_decay := exp(-10.0 * dt)
			e.knock_vx *= k_decay
			e.knock_vy *= k_decay
			if absf(e.knock_vx) < 0.1 and absf(e.knock_vy) < 0.1:
				e.knock_vx = 0.0
				e.knock_vy = 0.0

		if not e.goblin and player.invincible <= 0.0 and d < e.size + 12.0:
			# 접촉 피해: 이산 타격 + 0.15초 무적. 시간 배율(최대 3배)로 후반 밀도가 위협이 되도록
			var contact_base: float = 55.0 if e.is_boss else [8.0, 18.0, 38.0][mini(e.tier, 2)]
			var time_scale := minf(1.0 + elapsed / 480.0, 3.0)
			var contact_dmg := contact_base * 0.10 * time_scale
			var aux_shield_mult := 0.70 if player.aux_shield_time > 0.0 else 1.0
			var dmg_in := contact_dmg * (0.70 if has_synergy("iron_fortress") else aux_shield_mult)
			if e.charge_state == 2:
				dmg_in *= 2.5
			if e.affixes.has("vampiric"):
				e.hp = minf(e.hp + e.max_hp * 0.2, e.max_hp)
			_shake(0.15, 0.35)
			if _hurt_player(dmg_in, 0.15, true):
				return false
	return true


func _update_enemy_projectiles(dt: float) -> bool:
	var left: Array = []
	for ep in _tick_life(enemy_projectiles, dt):
		ep["x"] += ep["vx"] * dt
		ep["y"] += ep["vy"] * dt
		if player.invincible <= 0.0 and _dist(ep["x"], ep["y"], player.x, player.y) < ep["r"] + 12.0:
			_shake(0.22, 0.45)
			if _hurt_player(ep["dmg"] * (0.70 if has_synergy("iron_fortress") else 1.0), 0.1, false):
				enemy_projectiles = left
				return false
		else:
			left.append(ep)
	enemy_projectiles = left
	return true


func get_player_hp_ratio() -> float:
	if player.max_hp <= 0.0:
		return 1.0
	return clampf(player.hp / player.max_hp, 0.0, 1.0)


func update_low_hp_feedback(dt: float) -> void:
	low_hp_alert_cooldown = maxf(0.0, low_hp_alert_cooldown - dt)
	low_hp_pulse = maxf(0.0, low_hp_pulse - dt)
	var hp_ratio := get_player_hp_ratio()
	if hp_ratio > R.LOW_HP_THRESHOLD or low_hp_alert_cooldown > 0.0:
		return
	var critical: bool = hp_ratio <= R.CRITICAL_HP_THRESHOLD
	_screen_text("CRITICAL HP" if critical else "LOW HP", 1.55 if critical else 1.25, "#ff3b30" if critical else "#f39c12", 22 if critical else 18)
	low_hp_pulse = 2.2 if critical else 1.5
	_shake(0.26 if critical else 0.16, 0.55 if critical else 0.38)
	low_hp_alert_cooldown = R.LOW_HP_ALERT_COOLDOWN


func end_game(result: String) -> void:
	state = result
