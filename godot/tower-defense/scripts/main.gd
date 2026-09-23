extends Node2D
## 첨탑 대란 — Godot 판 최소 플레이 화면.
## 규칙은 전부 td_run.gd(= sim.js 이식)에 있고, 여기는 그리기와 입력만 한다.
## 웹판(public/arcade/tower-defense/game.js)의 연출 전부가 아니라, 규칙이 Godot 에서 그대로
## 돌아가는지 손으로 확인할 수 있는 최소 셸이다.

const R := preload("res://scripts/td_rules.gd")
const Run := preload("res://scripts/td_run.gd")
const Rng := preload("res://scripts/td_rng.gd")

const CELL := 96.0
const ORIGIN := Vector2(24, 150)
const SAVE_PATH := "user://td_save.cfg"
const TOWER_COLORS := {
	"archer": Color("#7bd389"), "cannon": Color("#f0a35e"), "frost": Color("#8fd3ff"),
	"tesla": Color("#c7a6ff"), "sniper": Color("#ff7b7b"), "mint": Color("#ffd166"),
}

var run
var speed := 1.0
var armed := "archer"
var best_wave := 0
var flashes: Array = []           # {from, to, ttl, color} — 사격 연출
var font: Font

var hud: Label
var hint: Label
var palette: HBoxContainer
var wave_btn: Button
var speed_btn: Button
var draft_panel: PanelContainer
var draft_box: VBoxContainer
var over_panel: PanelContainer
var over_label: Label


func _ready() -> void:
	font = _korean_font()
	_load_best()
	_build_ui()
	_new_run()


# ⚠ Godot 기본 폰트엔 한글이 없어 □(두부)로 나온다. 폰트 파일을 저장소에 넣지 않고 OS 폰트를 쓴다.
#   배포판에서 모양을 고정하려면 Pretendard/Noto Sans KR 을 번들하고 여기를 FontFile 로 바꾼다.
func _korean_font() -> Font:
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", "NanumGothic", "sans-serif"])
	var emoji := SystemFont.new()
	emoji.font_names = PackedStringArray(["Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"])
	var fallbacks: Array[Font] = [emoji]
	f.fallbacks = fallbacks
	return f


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE   # 보드 탭이 _unhandled_input 까지 내려가야 한다
	var theme := Theme.new()
	theme.default_font = font
	theme.default_font_size = 22
	root.theme = theme
	layer.add_child(root)

	hud = Label.new()
	hud.position = Vector2(24, 16)
	hud.size = Vector2(672, 80)
	hud.add_theme_font_size_override("font_size", 26)
	root.add_child(hud)

	hint = Label.new()
	hint.position = Vector2(24, 104)
	hint.size = Vector2(672, 40)
	hint.add_theme_font_size_override("font_size", 18)
	hint.modulate = Color(1, 1, 1, 0.75)
	root.add_child(hint)

	palette = HBoxContainer.new()
	palette.position = Vector2(24, 1122)
	palette.size = Vector2(672, 64)
	palette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(palette)

	var bar := HBoxContainer.new()
	bar.position = Vector2(24, 1196)
	bar.size = Vector2(672, 64)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(bar)
	wave_btn = Button.new()
	wave_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wave_btn.pressed.connect(_on_wave_pressed)
	bar.add_child(wave_btn)
	speed_btn = Button.new()
	speed_btn.custom_minimum_size = Vector2(110, 0)
	speed_btn.pressed.connect(_on_speed_pressed)
	bar.add_child(speed_btn)

	draft_panel = PanelContainer.new()
	draft_panel.position = Vector2(60, 380)
	draft_panel.custom_minimum_size = Vector2(600, 0)
	draft_box = VBoxContainer.new()
	draft_box.add_theme_constant_override("separation", 10)
	draft_panel.add_child(draft_box)
	root.add_child(draft_panel)

	over_panel = PanelContainer.new()
	over_panel.position = Vector2(110, 460)
	over_panel.custom_minimum_size = Vector2(500, 0)
	var ov := VBoxContainer.new()
	ov.add_theme_constant_override("separation", 14)
	over_label = Label.new()
	over_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ov.add_child(over_label)
	var again := Button.new()
	again.text = "🛡 다시 방어"
	again.pressed.connect(_new_run)
	ov.add_child(again)
	over_panel.add_child(ov)
	root.add_child(over_panel)


func _new_run() -> void:
	run = Run.new(Rng.new(Time.get_ticks_usec() & 0xFFFFFFFF), _load_meta())
	armed = "archer"
	flashes.clear()
	over_panel.visible = false
	draft_panel.visible = false
	_refresh_palette()
	_refresh_hud()
	queue_redraw()


func _process(delta: float) -> void:
	if run == null or run.phase == "over":
		return
	var steps := int(speed)                 # 배속은 같은 dt 를 여러 번 — 규칙의 dt 상한을 넘기지 않는다
	for i in range(steps):
		for e in run.tick(minf(delta, 0.05)):
			_on_event(e)
		if run.wave_over():
			run.settle_wave()
			_show_draft()
			break
		if run.phase == "over":
			_game_over()
			break
	for f in flashes:
		f["ttl"] -= delta
	flashes = flashes.filter(func(f): return f["ttl"] > 0.0)
	_refresh_hud()
	queue_redraw()


func _on_event(e: Dictionary) -> void:
	match e["t"]:
		"shot":
			flashes.append({"from": e["from"], "to": e["to"], "ttl": 0.08, "color": TOWER_COLORS.get(e["tower"], Color.WHITE)})
		"chain":
			flashes.append({"from": e["from"], "to": e["to"], "ttl": 0.1, "color": Color("#c7a6ff")})


func _unhandled_input(event: InputEvent) -> void:
	if run == null or run.phase == "over" or draft_panel.visible:
		return
	# GDScript 는 `is` 검사 뒤에도 타입을 좁혀 주지 않는다 — 명시적으로 캐스팅한다
	var mb := event as InputEventMouseButton
	if mb == null or not mb.pressed:
		return
	var cell := ((mb.position - ORIGIN) / CELL).floor()
	var x := int(cell.x)
	var y := int(cell.y)
	if x < 0 or y < 0 or x >= R.COLS or y >= R.ROWS:
		return
	if mb.button_index == MOUSE_BUTTON_RIGHT:
		var back: int = run.sell(x, y)
		if back > 0:
			hint.text = "판매 +%d 🪙" % back
	elif mb.button_index == MOUSE_BUTTON_LEFT:
		if run.tower_at(x, y) != null:
			if run.can_fuse(x, y) != null:
				run.fuse(x, y)
				hint.text = "⚡ 융합!"
			elif run.upgrade(x, y):
				hint.text = "강화 완료"
			else:
				hint.text = "금이 부족하거나 더 강화할 수 없다"
		elif run.build(armed, x, y) == null:
			hint.text = "여기엔 지을 수 없다" if not run.can_build(x, y) else "금이 부족하다"
	queue_redraw()


func _on_wave_pressed() -> void:
	if run.phase == "build" and run.pending_draft == null:
		run.start_wave()


func _on_speed_pressed() -> void:
	speed = 1.0 if speed >= 3.0 else speed + 1.0


func _refresh_palette() -> void:
	for c in palette.get_children():
		c.queue_free()
	for id in R.TOWER_ORDER:
		if not run.unlocked.has(id):
			continue
		var b := Button.new()
		b.text = "%s %d" % [R.TOWERS[id]["icon"], run.build_cost(id)]
		b.toggle_mode = true
		b.button_pressed = id == armed
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.tooltip_text = "%s — %s" % [R.TOWERS[id]["name"], R.TOWERS[id]["desc"]]
		b.pressed.connect(func():
			armed = id
			_refresh_palette())
		palette.add_child(b)


func _refresh_hud() -> void:
	var tier: Dictionary = R.combo_tier(run.streak)
	hud.text = "❤️ %d   🪙 %d   🌊 %d   🔥 %s" % [run.lives, int(run.gold), run.wave,
		("%d연속 %s" % [run.streak, tier["label"]]) if not tier.is_empty() else str(run.streak)]
	if run.phase == "build":
		var nxt: Dictionary = run.next_wave_preview()
		wave_btn.text = "⚔ %d웨이브 출격 (%.0f초 · +%d🪙)" % [nxt["n"], run.build_left, R.early_gold(nxt["n"], run.build_left)]
		wave_btn.disabled = run.pending_draft != null
	else:
		wave_btn.text = "전투 중 — 적 %d" % (run.enemies.size() + run.spawn_queue.size())
		wave_btn.disabled = true
	speed_btn.text = "%d×" % int(speed)


func _show_draft() -> void:
	for c in draft_box.get_children():
		c.queue_free()
	var title := Label.new()
	title.text = "🃏 전리품 — 하나를 고르세요"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	draft_box.add_child(title)
	for card in run.pending_draft:
		var b := Button.new()
		b.text = "%s %s — %s" % [card["icon"], card["name"], card["desc"]]
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var id: String = card["id"]
		b.pressed.connect(func():
			run.pick_draft(id)
			draft_panel.visible = false
			_refresh_palette())
		draft_box.add_child(b)
	var skip := Button.new()
	skip.text = "건너뛰고 +10 🪙"
	skip.pressed.connect(func():
		run.skip_draft()
		draft_panel.visible = false)
	draft_box.add_child(skip)
	draft_panel.visible = true


func _game_over() -> void:
	var reached: int = run.wave
	if reached > best_wave:
		best_wave = reached
		_save_best()
	over_label.text = "성이 무너졌다\n\n%d웨이브 · 처치 %d · 최고 연쇄 %d\n🏆 최고 %d웨이브" % [reached, run.kills, run.best_streak, best_wave]
	over_panel.visible = true


# ── 그리기 ───────────────────────────────────────────────────────
func _draw() -> void:
	if run == null:
		return
	for y in range(R.ROWS):
		for x in range(R.COLS):
			var rect := Rect2(ORIGIN + Vector2(x, y) * CELL, Vector2(CELL, CELL)).grow(-2)
			draw_rect(rect, Color("#c8a46b") if R.on_path(run.path, x, y) else Color("#24402c"))
	for t in run.towers:
		var c := _cell_center(Vector2(t["x"], t["y"]))
		var col: Color = TOWER_COLORS.get(t["type"], Color.WHITE)
		draw_circle(c, CELL * 0.36, col.darkened(0.45) if t["fused"] else col.darkened(0.2))
		draw_arc(c, CELL * 0.36, 0, TAU, 32, col, 3.0)
		var icon: String = R.FUSIONS[t["type"]]["icon"] if t["fused"] else R.TOWERS[t["type"]]["icon"]
		draw_string(font, c + Vector2(-CELL / 2, 12), icon, HORIZONTAL_ALIGNMENT_CENTER, CELL, 34)
		var lv_text: String = ("F%d" % int(t["flv"])) if t["fused"] else ("Lv%d" % int(t["lv"]))
		draw_string(font, c + Vector2(-CELL / 2, CELL * 0.46), lv_text, HORIZONTAL_ALIGNMENT_CENTER, CELL, 16)
	for e in run.enemies:
		var p := _cell_center(run.enemy_xy(e))
		var def: Dictionary = R.ENEMIES[e["type"]]
		var radius := CELL * (0.34 if def.get("boss", false) else 0.22)
		draw_circle(p, radius, Color("#1b1b22"))
		draw_string(font, p + Vector2(-radius, radius * 0.45), def["icon"], HORIZONTAL_ALIGNMENT_CENTER, radius * 2, int(radius * 1.3))
		var frac := clampf(e["hp"] / e["maxHp"], 0.0, 1.0)
		draw_rect(Rect2(p + Vector2(-radius, -radius - 10), Vector2(radius * 2, 5)), Color("#441111"))
		draw_rect(Rect2(p + Vector2(-radius, -radius - 10), Vector2(radius * 2 * frac, 5)), Color("#ff5a5a"))
	for f in flashes:
		draw_line(_cell_center(f["from"]), _cell_center(f["to"]), f["color"], 3.0)


func _cell_center(grid: Vector2) -> Vector2:
	return ORIGIN + (grid + Vector2(0.5, 0.5)) * CELL


# ── 저장 (웹판의 localStorage 대신 user://) ─────────────────────
func _load_best() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) == OK:
		best_wave = int(cfg.get_value("td", "best", 0))


func _save_best() -> void:
	var cfg := ConfigFile.new()
	cfg.load(SAVE_PATH)
	cfg.set_value("td", "best", best_wave)
	cfg.save(SAVE_PATH)


## 마나핵 연구(메타)는 아직 Godot 판 UI 가 없다 — 저장된 값이 있으면 규칙에는 그대로 반영한다
func _load_meta() -> Dictionary:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return R.normalize_meta({})
	return R.normalize_meta(cfg.get_value("td", "meta", {}))
