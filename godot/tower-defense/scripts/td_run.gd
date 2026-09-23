extends RefCounted
## 첨탑 대란 한 판 — sim.js 의 class Run 을 메서드 단위로 옮겼다.
## 규칙을 바꿀 땐 sim.js 와 이 파일을 같이 고친다. 이름은 JS 와 1:1 로 맞춰 대조하기 쉽게 둔다.
##
## 이식에서 달라지면 안 되는 곳:
##  - 스폰 순서: 섞은 뒤 '보스만 뒤로' — JS 의 sort 는 안정 정렬이지만 Godot 의 sort_custom 은
##    아니다. 그래서 _boss_last() 가 순서를 보존하며 직접 가른다.
##  - 사거리 안 적 정렬(출구에 가까운 순): 같은 이유로 _stable_sort_by_pos_desc() 를 쓴다.
##  - 적·타워 동일성: Godot 의 Dictionary == 는 '내용' 비교다. 같은 적인지는 id 로 가린다.

const R := preload("res://scripts/td_rules.gd")
const Rng := preload("res://scripts/td_rng.gd")

var rng
var path: Array
var path_len: int
var gold: float = 140.0
var lives: int = 10
var income_mult: float = 1.0
var wave: int = 0
var score: float = 0.0
var towers: Array = []          # {x, y, type, lv, fused, flv, cool}
var enemies: Array = []         # {id, type, hp, maxHp, pos, slow, slowT, freezeT, burn, burnT, shield, regen, rage, speed}
var spawn_queue: Array = []
var spawn_t: float = 0.0
var phase: String = "build"     # build | wave | over
var hp_mult: float = 1.0
var wave_speed: float = 1.0
var mods := {}
var curses := {"hpMult": 1.0, "speedMult": 1.0}
var unlocked: Array = ["archer", "cannon", "frost"]
var draft_size: int = 3
var pending_draft = null        # null | Array
var kills: int = 0
var build_left: float = 0.0
var streak: int = 0
var streak_t: float = 0.0
var best_streak: int = 0
var early_bonus: int = 0
var _next_enemy_id: int = 1


func _init(rng_or_null = null, meta = null) -> void:
	rng = rng_or_null if rng_or_null != null else Rng.new(Time.get_ticks_usec() & 0xFFFFFFFF)
	path = R.build_path()
	path_len = path.size()
	var m: Dictionary = R.normalize_meta(meta)
	var up: Dictionary = m["upgrades"]
	lives = 10 + int(up["walls"]) * 2
	mods = {
		"dmgMult": 1.0 + int(up["forge"]) * 0.08, "rangeMult": 1.0, "rateMult": 1.0,
		"bountyMult": 1.0 + int(up["tempo"]) * 0.09, "costMult": 1.0, "slowBonus": 0.0, "slowAll": 0.0,
	}
	if int(up["armory"]) >= 1:
		unlocked.append("sniper")
	if int(up["armory"]) >= 2:
		unlocked.append("mint")
	draft_size = 3 + (1 if int(up["lens"]) > 0 else 0)
	build_left = R.build_seconds(1)


# ── 건설 ────────────────────────────────────────────────────────
func tower_at(x: int, y: int):
	for t in towers:
		if t["x"] == x and t["y"] == y:
			return t
	return null


func can_build(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < R.COLS and y < R.ROWS and not R.on_path(path, x, y) and tower_at(x, y) == null


func build_cost(type: String) -> int:
	return maxi(10, R.js_round(R.TOWERS[type]["cost"] * mods["costMult"]))


func build(type: String, x: int, y: int):
	if phase == "over" or not R.TOWERS.has(type) or not unlocked.has(type):
		return null
	if not can_build(x, y):
		return null
	var cost := build_cost(type)
	if gold < cost:
		return null
	gold -= cost
	var t := {"x": x, "y": y, "type": type, "lv": 1, "fused": false, "flv": 1, "cool": 0.0}
	towers.append(t)
	return t


## 다음 강화 비용. 강화 불가면 -1 (JS 의 Infinity). 융합체는 상한 없이 계속 오른다.
func upgrade_cost(t: Dictionary) -> int:
	var base: Dictionary = R.TOWERS[t["type"]]
	if t["fused"]:
		return R.js_round(base["cost"] * 2.6 * pow(R.FUSED_COST_STEP, int(t["flv"]) - 1) * mods["costMult"])
	if int(t["lv"]) >= 3:
		return -1
	return R.js_round(base["up"][int(t["lv"]) - 1] * mods["costMult"])


func upgrade(x: int, y: int) -> bool:
	var t = tower_at(x, y)
	if t == null:
		return false
	var cost := upgrade_cost(t)
	if cost < 0 or gold < cost:
		return false
	gold -= cost
	if t["fused"]:
		t["flv"] = int(t["flv"]) + 1
	else:
		t["lv"] = int(t["lv"]) + 1
	return true


func sell(x: int, y: int) -> int:
	for i in range(towers.size()):
		var t: Dictionary = towers[i]
		if t["x"] == x and t["y"] == y:
			var mult: int = 4 * int(t["flv"]) if t["fused"] else int(t["lv"])
			var back: int = R.js_round(R.TOWERS[t["type"]]["cost"] * 0.6 * mult)
			towers.remove_at(i)
			gold += back
			return back
	return 0


## 같은 종류 Lv3 둘이 상하좌우로 붙어 있으면 융합 상대를 돌려준다
func can_fuse(x: int, y: int):
	var t = tower_at(x, y)
	if t == null or t["fused"] or int(t["lv"]) < 3:
		return null
	for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
		var o = tower_at(x + d[0], y + d[1])
		if o != null and not o["fused"] and o["type"] == t["type"] and int(o["lv"]) >= 3:
			return o
	return null


func fuse(x: int, y: int) -> bool:
	var t = tower_at(x, y)
	var mate = can_fuse(x, y)
	if t == null or mate == null:
		return false
	for i in range(towers.size()):     # 재료 소모 — 좌표로 찾는다 (Dictionary == 는 내용 비교라 쓰지 않는다)
		if towers[i]["x"] == mate["x"] and towers[i]["y"] == mate["y"]:
			towers.remove_at(i)
			break
	t["fused"] = true
	t["flv"] = 1
	return true


func tower_stats(t: Dictionary) -> Dictionary:
	var base: Dictionary = R.TOWERS[t["type"]]
	var lv_mult: float = pow(1.6, int(t["lv"]) - 1)
	var fu: Dictionary = R.FUSIONS[t["type"]] if t["fused"] else {}
	var fu_lv_mult: float = pow(R.FUSED_DMG_STEP, int(t["flv"]) - 1) if t["fused"] else 1.0
	var base_slow: float = float(base.get("slow", 0.0))
	var slow: float = (base_slow if base_slow > 0.0 else float(mods["slowAll"])) + (float(mods["slowBonus"]) if base_slow > 0.0 else 0.0)
	var income_lv: float = 3.0 * int(t["flv"]) if t["fused"] else float(t["lv"])
	return {
		"dmg": base["dmg"] * lv_mult * float(fu.get("dmgMult", 1.0)) * fu_lv_mult * mods["dmgMult"],
		"rate": base["rate"] * float(fu.get("rateMult", 1.0)) * mods["rateMult"],
		"range": base["range"] * mods["rangeMult"],
		"splash": float(base.get("splash", 0.0)),
		"slow": slow,
		"slowDur": float(base.get("slowDur", 1.2)),
		"slowMult": float(fu.get("slowMult", 1.0)),
		"chain": int(base.get("chain", 0)) + int(fu.get("chainAdd", 0)),
		"pierceShield": bool(base.get("pierceShield", false)),
		"pierceLine": bool(fu.get("pierceLine", false)),
		"burn": float(fu.get("burn", 0.0)),
		"burnDur": float(fu.get("burnDur", 0.0)),
		"freeze": float(fu.get("freeze", 0.0)),
		"income": float(base.get("income", 0.0)) * float(fu.get("incomeMult", 1.0)) * income_lv,
		"interest": float(fu.get("interest", 0.0)),
	}


# ── 웨이브 ───────────────────────────────────────────────────────
func start_wave():
	if phase != "build" or pending_draft != null:
		return null
	wave += 1
	var spec := R.wave_spec(wave)
	spawn_queue = []
	for grp in spec["list"]:
		for i in range(int(grp["count"])):
			spawn_queue.append(grp["type"])
	# 섞되 보스는 마지막에 (Fisher–Yates — JS 와 같은 순서로 rng 를 소비해야 한다)
	for i in range(spawn_queue.size() - 1, 0, -1):
		var j: int = int(floor(rng.next_float() * (i + 1)))
		var tmp = spawn_queue[i]
		spawn_queue[i] = spawn_queue[j]
		spawn_queue[j] = tmp
	spawn_queue = _boss_last(spawn_queue)
	spawn_t = 0.0
	phase = "wave"
	hp_mult = spec["hpMult"] * curses["hpMult"]
	wave_speed = 1.0 + maxi(0, wave - 10) * 0.015
	early_bonus = R.early_gold(wave, build_left) if build_left > 0.4 else 0
	gold += early_bonus
	build_left = 0.0
	return spec


## JS: queue.sort((a, b) => (a === 'boss') - (b === 'boss')) — 안정 정렬이라 나머지 순서가 유지된다.
static func _boss_last(queue: Array) -> Array:
	var rest: Array = []
	var bosses: Array = []
	for t in queue:
		if t == "boss":
			bosses.append(t)
		else:
			rest.append(t)
	return rest + bosses


func next_wave_preview() -> Dictionary:
	return R.wave_spec(wave + 1)


func _spawn(type: String) -> void:
	var def: Dictionary = R.ENEMIES[type]
	var hp: float = def["hp"] * hp_mult
	enemies.append({
		"id": _next_enemy_id, "type": type, "hp": hp, "maxHp": hp,
		"pos": 0.0, "slow": 0.0, "slowT": 0.0, "freezeT": 0.0, "burn": 0.0, "burnT": 0.0,
		"shield": int(def.get("shield", 0)), "regen": float(def.get("regen", 0.0)), "rage": float(def.get("rage", 0.0)),
		"speed": def["speed"] * curses["speedMult"] * wave_speed,
	})
	_next_enemy_id += 1


## dt 초 진행. 이벤트 목록을 돌려준다 (렌더러의 연출 훅)
func tick(dt: float) -> Array:
	var ev: Array = []
	if phase == "build":
		if pending_draft != null:
			return ev
		build_left = maxf(0.0, build_left - dt)
		if build_left <= 0.0:
			var spec = start_wave()
			if spec != null:
				ev.append({"t": "autowave", "wave": spec["n"]})
		return ev
	if phase != "wave":
		return ev
	if streak_t > 0.0:
		streak_t -= dt
		if streak_t <= 0.0 and streak > 0:
			streak = 0
			ev.append({"t": "streakend"})

	# 스폰
	spawn_t -= dt
	if not spawn_queue.is_empty() and spawn_t <= 0.0:
		var type: String = spawn_queue.pop_front()
		_spawn(type)
		ev.append({"t": "spawn", "type": type})
		spawn_t = 0.9 if type == "boss" else maxf(0.16, 0.42 - wave * 0.012)

	# 이동·도트
	for e in enemies:
		if e["burnT"] > 0.0:
			e["burnT"] -= dt
			e["hp"] -= e["burn"] * dt
		if e["regen"] > 0.0 and e["hp"] < e["maxHp"] and e["hp"] > 0.0:
			e["hp"] = minf(e["maxHp"], e["hp"] + e["regen"] * dt)
		if e["freezeT"] > 0.0:
			e["freezeT"] -= dt
			continue
		var slow_f := 1.0
		if e["slowT"] > 0.0:
			e["slowT"] -= dt
			slow_f = 1.0 - minf(0.8, e["slow"])
		# 격노: 보스는 피가 빠질수록 빨라진다
		var rage := 1.0
		if e["rage"] > 0.0:
			rage = 1.0 + e["rage"] * (1.0 - maxf(0.0, e["hp"]) / e["maxHp"])
		e["pos"] += e["speed"] * slow_f * rage * dt

	# 도착·처치
	for i in range(enemies.size() - 1, -1, -1):
		var e: Dictionary = enemies[i]
		if e["pos"] >= path_len - 1:
			enemies.remove_at(i)
			lives -= 3 if R.ENEMIES[e["type"]].get("boss", false) else 1
			var lost := streak
			streak = 0
			streak_t = 0.0
			ev.append({"t": "leak", "type": e["type"], "lostStreak": lost})
		elif e["hp"] <= 0.0:
			enemies.remove_at(i)
			streak += 1
			streak_t = R.COMBO_WINDOW
			best_streak = maxi(best_streak, streak)
			var tier := R.combo_tier(streak)
			var mult: float = float(tier.get("mult", 1.0))
			var def: Dictionary = R.ENEMIES[e["type"]]
			var bounty: int = R.js_round(def["bounty"] * (1.0 + wave * 0.06) * mods["bountyMult"] * mult)
			gold += bounty
			score += R.js_round(def["bounty"] * wave * mult)
			kills += 1
			var p := enemy_xy(e)
			ev.append({"t": "kill", "type": e["type"], "bounty": bounty, "mult": mult, "x": p.x, "y": p.y})
			var prev := R.combo_tier(streak - 1)
			if not tier.is_empty() and (prev.is_empty() or prev["at"] != tier["at"]):
				ev.append({"t": "combo", "tier": tier, "streak": streak})
	if lives <= 0:
		phase = "over"
		ev.append({"t": "gameover"})
		return ev

	# 타워 공격 (히트스캔 — 투사체는 렌더러의 연출일 뿐)
	for t in towers:
		var st := tower_stats(t)
		if st["rate"] <= 0.0:
			continue
		t["cool"] -= dt
		if t["cool"] > 0.0:
			continue
		var targets := _acquire(t, st)
		if targets.is_empty():
			continue
		t["cool"] = 1.0 / st["rate"]
		_strike(t, st, targets, ev)
	return ev


func enemy_xy(e: Dictionary) -> Vector2:
	var i: int = mini(path_len - 1, int(floor(e["pos"])))
	var frac: float = minf(1.0, e["pos"] - i)
	var a: Dictionary = path[i]
	var b: Dictionary = path[mini(path_len - 1, i + 1)]
	return Vector2(a["x"] + (b["x"] - a["x"]) * frac, a["y"] + (b["y"] - a["y"]) * frac)


func _acquire(t: Dictionary, st: Dictionary) -> Array:
	var in_range: Array = []
	var r2: float = st["range"] * st["range"]
	for e in enemies:
		if e["hp"] <= 0.0:
			continue
		var p := enemy_xy(e)
		if (p.x - t["x"]) * (p.x - t["x"]) + (p.y - t["y"]) * (p.y - t["y"]) <= r2:
			in_range.append(e)
	return _stable_sort_by_pos_desc(in_range)


## 출구에 가까운(pos 큰) 순 — 동률은 원래 순서 유지 (JS sort 와 같게)
static func _stable_sort_by_pos_desc(arr: Array) -> Array:
	var out: Array = arr.duplicate()
	for i in range(1, out.size()):
		var cur = out[i]
		var j := i - 1
		while j >= 0 and out[j]["pos"] < cur["pos"]:
			out[j + 1] = out[j]
			j -= 1
		out[j + 1] = cur
	return out


func _hit(e: Dictionary, dmg: float, st: Dictionary, ev: Array) -> void:
	if e["shield"] > 0 and not st["pierceShield"]:
		e["shield"] -= 1
		var bp := enemy_xy(e)
		ev.append({"t": "block", "x": bp.x, "y": bp.y})
		return
	e["hp"] -= dmg
	if st["slow"] > 0.0:
		e["slow"] = maxf(e["slow"], st["slow"] * st["slowMult"])
		e["slowT"] = maxf(e["slowT"], st["slowDur"])
	if st["burn"] > 0.0:
		e["burn"] = st["burn"]
		e["burnT"] = st["burnDur"]
	# JS 와 같은 순서: rng 는 freeze > 0 일 때만 소비된다 (&& 단락 평가)
	if st["freeze"] > 0.0 and rng.next_float() < st["freeze"] and not R.ENEMIES[e["type"]].get("boss", false):
		e["freezeT"] = 1.0


func _strike(t: Dictionary, st: Dictionary, targets: Array, ev: Array) -> void:
	var prime: Dictionary = targets[0]
	var pp := enemy_xy(prime)
	var from := Vector2(t["x"], t["y"])
	ev.append({"t": "shot", "tower": t["type"], "fused": t["fused"], "from": from, "to": pp})
	if st["pierceLine"]:
		for e in enemies:
			if _dist_to_seg(enemy_xy(e), from, pp) < 0.6:
				_hit(e, st["dmg"], st, ev)
	elif st["splash"] > 0.0:
		for e in enemies:
			if enemy_xy(e).distance_squared_to(pp) <= st["splash"] * st["splash"]:
				_hit(e, st["dmg"], st, ev)
		ev.append({"t": "boom", "x": pp.x, "y": pp.y, "r": st["splash"]})
	elif st["chain"] > 0:
		var cur: Dictionary = prime
		var hit_ids := {prime["id"]: true}
		_hit(cur, st["dmg"], st, ev)
		for c in range(1, st["chain"]):
			var p := enemy_xy(cur)
			var next = null
			var nd := 2.2 * 2.2
			for e in enemies:
				if hit_ids.has(e["id"]) or e["hp"] <= 0.0:
					continue
				var d2 := enemy_xy(e).distance_squared_to(p)
				if d2 < nd:
					nd = d2
					next = e
			if next == null:
				break
			ev.append({"t": "chain", "from": enemy_xy(cur), "to": enemy_xy(next)})
			_hit(next, st["dmg"] * 0.8, st, ev)
			hit_ids[next["id"]] = true
			cur = next
	else:
		_hit(prime, st["dmg"], st, ev)


static func _dist_to_seg(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var len2 := ab.length_squared()
	if len2 == 0.0:
		len2 = 1.0
	var tt := clampf((p - a).dot(ab) / len2, 0.0, 1.0)
	return p.distance_to(a + ab * tt)


func wave_over() -> bool:
	return phase == "wave" and spawn_queue.is_empty() and enemies.is_empty()


## 지금 연속 격파 등급 — 없으면 빈 Dictionary (JS Run.comboTier())
func combo_tier() -> Dictionary:
	return R.combo_tier(streak)


## 선두 적이 출구에 얼마나 다가왔나 (0~1)
func threat() -> float:
	var worst := 0.0
	for e in enemies:
		worst = maxf(worst, e["pos"] / (path_len - 1))
	return worst


# ── 정산·드래프트 ────────────────────────────────────────────────
func settle_wave():
	if not wave_over():
		return null
	var income: float = 15 + wave * 2
	for t in towers:
		var st := tower_stats(t)
		if st["income"] > 0.0:
			income += R.js_round(st["income"])
		if st["interest"] > 0.0:
			income += R.js_round(gold * st["interest"])
	var paid: int = R.js_round(income * income_mult)
	gold += paid
	score += wave * 10
	phase = "build"
	build_left = R.build_seconds(wave + 1)
	pending_draft = _draft_offers()
	return {"income": paid, "draft": pending_draft}


func _draft_offers() -> Array:
	var pool: Array = []
	for id in R.TOWER_ORDER:
		if not unlocked.has(id):
			var tw: Dictionary = R.TOWERS[id]
			pool.append({"id": "unlock_" + id, "name": tw["name"] + " 해금", "icon": tw["icon"], "kind": "tower", "tower": id, "desc": tw["desc"]})
	for p in R.PERKS:
		pool.append(p)
	if wave >= 3:
		for c in R.CURSES:
			pool.append(c)
	for i in range(pool.size() - 1, 0, -1):
		var j: int = int(floor(rng.next_float() * (i + 1)))
		var tmp = pool[i]
		pool[i] = pool[j]
		pool[j] = tmp
	var out: Array = []
	var curse_used := false
	for c in pool:
		if out.size() >= draft_size:
			break
		if c["kind"] == "curse":
			if curse_used:
				continue
			# 생명을 요구하는 저주는 실제로 낼 수 있을 때만 (sim.js 의 실측 버그 수정과 같다)
			if c.has("curse") and c["curse"].has("livesCap") and lives + int(c["curse"]["livesCap"]) < 1:
				continue
			curse_used = true
		out.append(c)
	return out


func pick_draft(id: String) -> bool:
	if pending_draft == null:
		return false
	var c = null
	for x in pending_draft:
		if x["id"] == id:
			c = x
			break
	if c == null:
		return false
	if c["kind"] == "tower":
		unlocked.append(c["tower"])
	if c.has("mod"):
		for k in c["mod"]:
			if k == "costMult":
				mods["costMult"] = maxf(0.5, mods["costMult"] + c["mod"][k])
			elif k == "slowBonus" or k == "slowAll":
				mods[k] += c["mod"][k]
			else:
				mods[k] *= (1.0 + c["mod"][k])
	if c.has("once"):
		gold += int(c["once"].get("gold", 0))
		lives += int(c["once"].get("lives", 0))
	if c.has("curse"):
		var cu: Dictionary = c["curse"]
		if cu.has("hpMult"):
			curses["hpMult"] *= (1.0 + cu["hpMult"])
		if cu.has("speedMult"):
			curses["speedMult"] *= (1.0 + cu["speedMult"])
		if cu.has("livesCap"):
			lives = maxi(1, lives + int(cu["livesCap"]))
	pending_draft = null
	return true


func skip_draft() -> bool:
	if pending_draft == null:
		return false
	pending_draft = null
	gold += 10
	return true
