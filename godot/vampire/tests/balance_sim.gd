extends SceneTree
## 밸런스 봇 — 사람처럼 피하고·줍고·고르는 봇으로 판을 여러 번 돌려 생존 곡선을 잰다.
## 30분(클리어)이 되면 무한 웨이브를 이어 가서 30분 뒤 생존도 본다.
##
## 실행 (저장소 루트에서):
##   godot --headless --path godot/vampire --script res://tests/balance_sim.gd -- <첫 시드> <판 수> [캐릭터] [난이도] [영혼석 레벨] [최대 분]
## 판마다 `RUN {json}` 한 줄. 여러 프로세스로 나눠 돌린 뒤 scripts/../ 에서 모아 본다 (README 참고).
##
## 봇은 '평범하게 잘하는 사람' 수준을 노렸다 — 가까운 적·예고 장판·돌진 선·탄을 피하고, 안전할 때만 보석·장비·
## 제단을 주우러 가고, 몰리면 대쉬, 붐비면 오버드라이브. 레벨업은 진화 > 게임 자체 가중치 순, 장비창은 20초마다 정리.
## 사람마다 실력이 다르니 이 수치는 '봇 기준'이다.

const R := preload("res://scripts/vs_rules.gd")
const C := preload("res://scripts/vs_content.gd")
const Run := preload("res://scripts/vs_run.gd")
const DT := 1.0 / 30.0
const ITEM_PREF := ["dmgperm", "hpmax", "power", "nuke", "meteorrain", "barrier", "freeze", "sweep", "turbo", "medkit"]

var _move := Vector2.RIGHT
var _wander := 0.0
var _inv_t := 0.0
var _dash_prev := false


func _initialize() -> void:
	var a := OS.get_cmdline_user_args()
	var from := int(a[0]) if a.size() > 0 else 1
	var count := int(a[1]) if a.size() > 1 else 1
	var character: String = a[2] if a.size() > 2 else "knight"
	var difficulty: String = a[3] if a.size() > 3 else "normal"
	var meta_lv := int(a[4]) if a.size() > 4 else 0
	var max_min := float(a[5]) if a.size() > 5 else 36.0
	var meta := {}
	for id in C.SOUL_UPGRADE_ORDER:
		meta[id] = meta_lv
	for sd in range(from, from + count):
		var t0 := Time.get_ticks_msec()
		var res := _play(sd, character, difficulty, meta, max_min * 60.0)
		res["wall_s"] = (Time.get_ticks_msec() - t0) / 1000.0
		print("RUN ", JSON.stringify(res))
	quit(0)


func _play(sd: int, character: String, difficulty: String, meta: Dictionary, max_t: float) -> Dictionary:
	var run = Run.new(character, difficulty, "meadow", sd, meta)
	_wander = float(sd) * 1.7
	_inv_t = 0.0
	var step := 0
	var hp_at := {}
	var lvl_at := {}
	var en_at: Array = []         # 분마다 살아 있는 적 수 — 화면을 못 비우기 시작하는 때가 보인다
	var hurt_log: Array = []      # 최근 8초 피격 [시각, 양, 접촉?] — 죽은 이유를 남긴다
	while run.elapsed < max_t:
		if step % 2 == 0:
			_move = _steer(run)
		step += 1
		var dash := _want_dash(run)
		run.tick(DT, _move, dash)
		if run.overdrive_charge >= 100.0 and (run.boss_active or _crowd(run, 220.0) >= 25):
			run.activate_overdrive()
		match String(run.state):
			"levelup", "itembox":
				run.choose(_pick_choice(run))
			"victory_prompt":
				run.resolve_victory(true)
		_inv_t += DT
		if _inv_t >= 20.0 or (not run.bag.is_empty() and run.bag[run.bag.size() - 1]["rarity"] in ["set", "legendary"]):
			_inv_t = 0.0
			_manage_gear(run)
		var mk := floori(run.elapsed / 60.0)
		if en_at.size() <= mk:
			en_at.append(run.enemies.size())
		if mk % 5 == 0 and not hp_at.has(mk):
			hp_at[mk] = roundi(run.player.max_hp)
			lvl_at[mk] = run.player.level
		for ev in run.events:
			if ev["t"] == "hurt":
				hurt_log.append([run.elapsed, float(ev["amount"]), bool(ev["contact"]), String(ev.get("src", ""))])
		while not hurt_log.is_empty() and run.elapsed - float(hurt_log[0][0]) > 8.0:
			hurt_log.pop_front()
		run.events.clear()
		if run.state == "dead" or run.state == "win":
			break
	var p = run.player
	var gear_lv: Array = []
	var procs := 0
	for slot in C.GEAR_SLOTS:
		var it = p.equip[slot]
		gear_lv.append(int(it["lv"]) if it != null else 0)
		if it != null:
			procs += it["procs"].size()
	var evolved := 0
	for w in p.weapons:
		if R.WEAPON_DEFS[w].get("evolved", false):
			evolved += 1
	var death := {}
	if run.state == "dead":
		var contact := 0.0
		var ranged := 0.0
		var by_src := {}
		for h in hurt_log:
			by_src[h[3]] = roundi(float(by_src.get(h[3], 0)) + float(h[1]))
			if h[2]:
				contact += float(h[1])
			else:
				ranged += float(h[1])
		var arch := 0
		for e in run.enemies:
			if e.behavior == "archer":
				arch += 1
		var wl := 0
		for w in p.weapons:
			wl += int(p.weapon_levels.get(w, 1))
		death = {"contact8": roundi(contact), "ranged8": roundi(ranged), "boss": run.boss_active, "archers": arch,
			"wlv": wl, "dmg_up": int(p.passives.get("dmg_up", 0)), "regen": int(p.passives.get("regen", 0)), "hits8": hurt_log.size(), "src": by_src}
	return {"death": death, "seed": sd, "t": snappedf(run.elapsed, 0.1), "dead": run.state == "dead", "lv": p.level, "kills": run.kills,
		"weapons": p.weapons.size(), "evolved": evolved, "gear_lv": gear_lv, "procs": procs, "loot": run.loot_found,
		"legend": run.legendaries_found, "bosses": run.bosses_killed, "burst": run.best_burst, "procs_fired": run.procs_fired,
		"max_hp": roundi(p.max_hp), "lvl_at": lvl_at, "hp_at": hp_at, "enemies": run.enemies.size(), "en_at": en_at}


func _crowd(run, r: float) -> int:
	var n := 0
	for e in run.enemies_near(run.player.x, run.player.y, r):
		if not e.dying and Vector2(e.x - run.player.x, e.y - run.player.y).length() < r:
			n += 1
	return n


## 이동 — 밀어내는 힘(적·장판·돌진 선·탄) + 안전할 때만 끌리는 힘(장비·상자·제단·보석)
func _steer(run) -> Vector2:
	var p = run.player
	var pos := Vector2(p.x, p.y)
	var push := Vector2.ZERO
	var danger := 0.0
	var archer := Vector2.ZERO
	var archer_d := INF
	for e in run.enemies_near(p.x, p.y, 340.0):
		if e.dying or e.goblin:
			continue
		var off := pos - Vector2(e.x, e.y)
		var d := maxf(off.length() - e.size, 6.0)
		# 궁수는 피하지 말고 잡으러 간다 (사람도 그렇게 한다) — 아주 가까울 때만 조금 밀어낸다
		if e.behavior == "archer" and not e.is_boss:
			if d < archer_d:
				archer_d = d
				archer = Vector2(e.x, e.y)
			if d > 60.0:
				continue
		if d > 240.0:
			continue
		var w := 4.0 if e.is_boss else (2.0 if e.elite else 1.0)
		if e.type == "bomber" and e.fuse >= 0.0:
			w = 6.0
		var f := w * pow(55.0 / d, 2.0)
		push += off.normalized() * f
		danger += f
		# 돌진 예고 — 돌진 선 위에 있으면 옆으로 비킨다
		if e.charge_state >= 1 and e.charge_dir != Vector2.ZERO:
			var rel := pos - Vector2(e.x, e.y)
			var along := rel.dot(e.charge_dir)
			var perp: Vector2 = rel - e.charge_dir * along
			if along > 0.0 and perp.length() < 50.0:
				push += (perp.normalized() if perp.length() > 1.0 else e.charge_dir.orthogonal()) * 8.0
	for hz in run.hazards:
		var off := pos - Vector2(hz["x"], hz["y"])
		if off.length() < float(hz["r"]) + 40.0:
			push += off.normalized() * 10.0
			danger += 5.0
	# 탄 — 지금 자리로 날아오는 것만, 빗나갈 거리가 좁으면 옆으로 크게 비킨다
	for ep in run.enemy_projectiles:
		var off := pos - Vector2(ep["x"], ep["y"])
		var vel := Vector2(ep["vx"], ep["vy"])
		var along := off.dot(vel.normalized())
		if along <= 0.0 or along > 300.0:
			continue
		var side := vel.orthogonal().normalized()
		var miss := off.dot(side)
		if absf(miss) < float(ep["r"]) + 40.0:
			# 부채꼴(3연발)은 화살마다 반대쪽으로 밀면 서로 상쇄된다 — 사람처럼 한쪽으로 정하고 계속 비킨다
			var dir_sign := signf(_move.dot(side))
			if dir_sign == 0.0:
				dir_sign = 1.0 if miss >= 0.0 else -1.0
			push += side * dir_sign * 14.0 * (1.0 - along / 340.0)
			danger += 3.0
	# 끌림 — 위험이 낮을수록 세다
	var calm := clampf(1.5 - danger * 0.5, 0.0, 1.5)
	var goal := Vector2.ZERO
	if calm > 0.0:
		var best := INF
		var target := Vector2.ZERO
		for gd in run.gear_drops:
			var d := pos.distance_to(Vector2(gd["x"], gd["y"]))
			if d < 500.0 and d * 0.5 < best:
				best = d * 0.5
				target = Vector2(gd["x"], gd["y"])
		for box in run.item_boxes:
			var d := pos.distance_to(Vector2(box["x"], box["y"]))
			if d < 500.0 and d * 0.6 < best:
				best = d * 0.6
				target = Vector2(box["x"], box["y"])
		for sh in run.shrines:
			var d := pos.distance_to(Vector2(sh["x"], sh["y"]))
			if d < 450.0 and d * 0.7 < best:
				best = d * 0.7
				target = Vector2(sh["x"], sh["y"])
		if archer_d < 320.0 and archer_d * 0.8 < best:
			best = archer_d * 0.8
			target = archer
		for pu in run.powerups:
			var d := pos.distance_to(Vector2(pu["x"], pu["y"]))
			if d < 350.0 and d < best:
				best = d
				target = Vector2(pu["x"], pu["y"])
		if best == INF:
			var gi := 0
			for g in run.xp_gems:
				gi += 1
				if gi > 300:
					break
				var d := pos.distance_to(Vector2(g["x"], g["y"]))
				if d < 280.0 and d < best:
					best = d
					target = Vector2(g["x"], g["y"])
		if best < INF:
			goal = (target - pos).normalized() * calm
	_wander += 0.02
	var drift := Vector2(cos(_wander), sin(_wander)) * 0.25
	var dir := push + goal + drift
	if dir.length() < 0.05:
		dir = drift
	return dir.normalized()


func _want_dash(run) -> bool:
	var want := false
	if run.dash_cd <= 0.0:
		var near := _crowd(run, 70.0)
		var hp_ratio: float = run.player.hp / run.player.max_hp
		want = near >= 5 or (hp_ratio < 0.5 and near >= 2)
	var press := want and not _dash_prev
	_dash_prev = want
	return press


func _pick_choice(run) -> int:
	if run.state == "itembox":
		var low: bool = run.player.hp < run.player.max_hp * 0.45
		var best := 0
		var best_rank := 999
		for i in range(run.choices.size()):
			var id: String = run.choices[i]["item_id"]
			var rank := 0 if (low and id == "medkit") else ITEM_PREF.find(id) + 1
			if rank < best_rank:
				best_rank = rank
				best = i
		return best
	var best_i := 0
	var best_s := -1.0
	for i in range(run.choices.size()):
		var c: Dictionary = run.choices[i]
		var s: float = 100.0 if c["kind"] == "evolve" else (0.5 if c["kind"] == "overflow" else run.choice_weight(c))
		if c["kind"] == "weapon-lv":
			s *= 1.4
		# 무기 6개까지는 새 무기를 반긴다 — 초반엔 화력의 폭이 깊이보다 중요하다
		if c["kind"] == "weapon-new" and run.player.weapons.size() < 6:
			s *= 1.8
		# 맞으면서 크는 사람처럼 — 재생 2스택·체력은 다쳤을수록 더 원한다
		if c["kind"] == "passive" and c["passive_id"] in ["regen", "hp_up", "lifesteal"]:
			var hurt: float = 1.0 - run.player.hp / run.player.max_hp
			s += hurt * 6.0 + (3.0 if c["passive_id"] == "regen" and int(run.player.passives.get("regen", 0)) < 2 else 0.0)
			if c["passive_id"] == "hp_up":
				s += 1.5
		if s > best_s:
			best_s = s
			best_i = i
	return best_i


## 장비창 정리 — 더 나은 것은 끼고(세트 맞추기·전설 우대), 나머지는 분해
func _manage_gear(run) -> void:
	var i := 0
	while i < run.bag.size():
		var item: Dictionary = run.bag[i]
		var cur = run.player.equip[item["slot"]]
		if cur == null or _gear_score(run, item, true) > _gear_score(run, cur, false):
			run.equip_from_bag(i)
			i += 1
		else:
			run.salvage_from_bag(i)


func _gear_score(run, item: Dictionary, incoming: bool) -> float:
	var s := C.item_power(item)
	if item["legendary"] != "":
		s += 6.0
	if item["set"] != "":
		var others := 0
		for slot in C.GEAR_SLOTS:
			var it = run.player.equip[slot]
			if slot != item["slot"] and it != null and it["set"] == item["set"]:
				others += 1
		if others >= 1:
			s += 8.0 + others * 3.0
	return s
