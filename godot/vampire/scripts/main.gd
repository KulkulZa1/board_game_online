extends Node2D
## 뱀파이어 서바이버 — Godot 판 화면. 규칙은 전부 vs_run.gd(= game.js 의 게임 규칙 이식)에 있고,
## 여기는 그리기·입력·UI 만 한다. 웹판(public/arcade/vampire/)의 그림을 Godot 의 _draw() 로 옮겼다.
##
## 조작: WASD/방향키 이동 · Space/X 대쉬 · Q 오버드라이브 · P/Esc 일시정지 · 1/2/3 선택 · 0 리롤
##       터치: 화면 아무 곳이나 눌러 조이스틱, 오른쪽 아래 OD 버튼, 아래쪽 무기 칸을 눌러 메인 무기 변경

const R := preload("res://scripts/vs_rules.gd")
const Run := preload("res://scripts/vs_run.gd")

const JOY_R := 44.0
const JOY_FOLLOW := JOY_R * 1.5     # 이 거리를 넘으면 베이스가 손가락을 따라온다
const OD_RADIUS := 34.0
const WEAPON_BAR_H := 76.0          # 아래쪽 무기 칸 높이 — 이 영역의 터치는 조이스틱이 아니다

var run = null
var font: Font
var sel_char := 0
var sel_diff := 1
var sel_map := 0

var joy_active := false
var joy_index := -1
var joy_center := Vector2.ZERO
var joy_vec := Vector2.ZERO

var start_root: Control
var start_icon: Label
var start_msg: Label
var start_sub: Label
var char_btn: Button
var char_desc: Label
var diff_btn: Button
var diff_desc: Label
var map_btn: Button
var map_desc: Label
var level_root: Control
var level_title: Label
var level_list: VBoxContainer
var reroll_btn: Button
var pause_root: Control
var victory_root: Control
var pause_btn: Button
var weapon_bar: HFlowContainer
var _weapon_sig := ""
var _shown_choices = null
var _end_shown := false


func _ready() -> void:
	font = _korean_font()
	_build_ui()
	_refresh_start_options()
	_sync_ui()


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


# ── UI 만들기 (씬 대신 코드로) ───────────────────────────────────────

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE   # 빈 화면 터치는 _unhandled_input(조이스틱)까지 내려간다
	var theme := Theme.new()
	theme.default_font = font
	theme.default_font_size = 18
	root.theme = theme
	layer.add_child(root)

	weapon_bar = HFlowContainer.new()
	weapon_bar.anchor_left = 0.0
	weapon_bar.anchor_right = 1.0
	weapon_bar.anchor_top = 1.0
	weapon_bar.anchor_bottom = 1.0
	weapon_bar.offset_left = 8.0
	weapon_bar.offset_right = -8.0
	weapon_bar.offset_top = -WEAPON_BAR_H
	weapon_bar.offset_bottom = -6.0
	weapon_bar.grow_vertical = Control.GROW_DIRECTION_BEGIN
	weapon_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(weapon_bar)

	pause_btn = _button("⏸", _on_pause_pressed)
	pause_btn.anchor_left = 1.0
	pause_btn.anchor_right = 1.0
	pause_btn.offset_left = -56.0
	pause_btn.offset_right = -8.0
	pause_btn.offset_top = 70.0
	pause_btn.offset_bottom = 112.0
	root.add_child(pause_btn)

	# 시작/게임오버 (웹판 #overlay)
	var m := _modal(root, 460.0)
	start_root = m["root"]
	var box: VBoxContainer = m["box"]
	start_icon = _label(box, "👾", 44)
	start_msg = _label(box, "생존하며 적을 처치하세요!\nWASD / 방향키 또는 조이스틱", 18)
	start_sub = _label(box, "", 15)
	start_sub.modulate = Color(1, 1, 1, 0.8)
	char_btn = _button("", _cycle_char)
	box.add_child(char_btn)
	char_desc = _label(box, "", 13)
	diff_btn = _button("", _cycle_diff)
	box.add_child(diff_btn)
	diff_desc = _label(box, "", 13)
	map_btn = _button("", _cycle_map)
	box.add_child(map_btn)
	map_desc = _label(box, "", 13)
	var start_btn := _button("시작하기", _start_run)
	start_btn.custom_minimum_size = Vector2(0, 52)
	box.add_child(start_btn)
	var keys := _label(box, "Space/X 대쉬 · Q 오버드라이브 · P 일시정지", 12)
	keys.modulate = Color(1, 1, 1, 0.6)

	# 레벨업 / 아이템 선택
	m = _modal(root, 470.0)
	level_root = m["root"]
	box = m["box"]
	level_title = _label(box, "⬆ 레벨 업!", 26)
	var hint := _label(box, "숫자키 1 · 2 · 3 으로 선택", 13)
	hint.modulate = Color(1, 1, 1, 0.6)
	level_list = VBoxContainer.new()
	level_list.add_theme_constant_override("separation", 10)
	box.add_child(level_list)
	reroll_btn = _button("", _on_reroll)
	box.add_child(reroll_btn)

	# 일시정지
	m = _modal(root, 360.0)
	pause_root = m["root"]
	box = m["box"]
	_label(box, "⏸ 일시정지", 26)
	box.add_child(_button("▶ 계속하기", _on_pause_pressed))

	# 10분 생존 → 무한 웨이브?
	m = _modal(root, 420.0)
	victory_root = m["root"]
	box = m["box"]
	_label(box, "🌀", 40)
	_label(box, "생존 완료!", 26)
	var warn := _label(box, "무한 웨이브를 계속하시겠습니까?\n경고: 극도로 어려워집니다", 15)
	warn.modulate = Color(1, 0.8, 0.8)
	box.add_child(_button("⚔ 계속 싸운다", _on_victory.bind(true)))
	box.add_child(_button("🏆 승리로 마무리", _on_victory.bind(false)))


## 화면 전체를 어둡게 덮고 가운데에 패널을 띄운다 → {root, box}
func _modal(parent: Control, width: float) -> Dictionary:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(root)
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0, 0, 0, 0.55)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP    # 뒤쪽 무기 칸·조이스틱으로 터치가 새지 않게
	root.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(width, 0)
	panel.add_theme_stylebox_override("panel", _box_style(Color(0.06, 0.08, 0.13, 0.96), Color("#39445a")))
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)
	root.visible = false
	return {"root": root, "box": box}


func _box_style(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(12)
	sb.set_content_margin_all(16)
	return sb


func _label(parent: Control, text: String, size: int) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	parent.add_child(l)
	return l


func _button(text: String, on_pressed: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE     # 포커스가 남으면 Space(대쉬)가 버튼을 누른다
	b.pressed.connect(on_pressed)
	return b


# ── 시작 화면 선택 ───────────────────────────────────────────────────

func _cycle_char() -> void:
	sel_char = (sel_char + 1) % R.CHARACTER_DEFS.size()
	_refresh_start_options()


func _cycle_diff() -> void:
	sel_diff = (sel_diff + 1) % R.DIFFICULTY_DEFS.size()
	_refresh_start_options()


func _cycle_map() -> void:
	sel_map = (sel_map + 1) % R.MAP_DEFS.size()
	_refresh_start_options()


func _refresh_start_options() -> void:
	var ch: Dictionary = R.CHARACTER_DEFS[sel_char]
	var starts := PackedStringArray()
	for w in ch["startWeapons"]:
		starts.append("%s %s" % [R.WEAPON_DEFS[w]["icon"], R.WEAPON_DEFS[w]["name"]])
	char_btn.text = "캐릭터: %s %s ▶" % [ch["icon"], ch["name"]]
	char_desc.text = "%s\n시작 무기: %s" % [ch["desc"], ", ".join(starts)]
	var df: Dictionary = R.DIFFICULTY_DEFS[sel_diff]
	diff_btn.text = "난이도: %s ▶" % df["name"]
	diff_desc.text = df["desc"]
	var mp: Dictionary = R.MAP_DEFS[sel_map]
	map_btn.text = "맵: %s ▶" % mp["name"]
	map_desc.text = "%s (%s)" % [mp["desc"], R.fmt_time(float(mp["durationSeconds"]))]


func _start_run() -> void:
	run = Run.new(R.CHARACTER_DEFS[sel_char]["id"], R.DIFFICULTY_DEFS[sel_diff]["id"], R.MAP_DEFS[sel_map]["id"])
	_end_shown = false
	_shown_choices = null
	_weapon_sig = ""
	joy_active = false
	joy_index = -1
	joy_vec = Vector2.ZERO
	_sync_ui()


func _show_result(result: String) -> void:
	if result == "win":
		start_icon.text = "🏆"
		start_msg.text = "%s 생존 성공! 승리!" % R.fmt_time(run.get_survive_goal())
	else:
		start_icon.text = "💀"
		start_msg.text = "게임 오버"
	start_sub.text = "Lv.%d  -  %s  -  %d kills  -  %s / %s" % [run.player.level, R.fmt_time(run.elapsed), run.kills, run.character["name"], run.difficulty["name"]]


# ── 버튼 핸들러 ─────────────────────────────────────────────────────

func _on_pause_pressed() -> void:
	if run == null:
		return
	run.set_paused(run.state == "playing")
	_sync_ui()


func _on_victory(continue_infinite: bool) -> void:
	if run != null:
		run.resolve_victory(continue_infinite)
	_sync_ui()


func _on_reroll() -> void:
	if run != null:
		run.do_reroll()
	_sync_ui()


func _pick_choice(i: int) -> void:
	if run != null:
		run.choose(i)
	_sync_ui()


func _on_card_input(event: InputEvent, i: int) -> void:
	var mb := event as InputEventMouseButton
	if mb != null and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
		_pick_choice(i)


func _on_weapon_slot(id: String) -> void:
	if run != null and run.state == "playing":
		run.set_main_weapon(id)
		_weapon_sig = ""


# ── 패널 표시 상태를 규칙 상태에 맞춘다 ─────────────────────────────

func _sync_ui() -> void:
	var st: String = run.state if run != null else "idle"
	var ended := st == "dead" or st == "win"
	if ended and not _end_shown:
		_end_shown = true
		_show_result(st)
	start_root.visible = run == null or ended
	level_root.visible = st == "levelup" or st == "itembox"
	pause_root.visible = st == "paused"
	victory_root.visible = st == "victory_prompt"
	pause_btn.visible = st == "playing"
	weapon_bar.visible = run != null and not ended
	if level_root.visible and not is_same(_shown_choices, run.choices):
		_rebuild_choices()
	if level_root.visible:
		_refresh_reroll()
	if weapon_bar.visible:
		_refresh_weapon_bar()


func _rebuild_choices() -> void:
	_shown_choices = run.choices
	level_title.text = "📦 아이템 선택!" if run.choice_kind == "itembox" else "⬆ 레벨 업!"
	for c in level_list.get_children():
		c.queue_free()
	var i := 0
	for c in run.choices:
		var evolve: bool = c["kind"] == "evolve"
		var card := PanelContainer.new()
		card.mouse_filter = Control.MOUSE_FILTER_STOP
		card.add_theme_stylebox_override("panel", _box_style(Color(0.16, 0.12, 0.03, 0.95) if evolve else Color(0.1, 0.13, 0.2, 0.95), Color("#f1c40f") if evolve else Color("#4a5a7a")))
		card.gui_input.connect(_on_card_input.bind(i))
		var v := VBoxContainer.new()
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(v)
		var name_l := _label(v, "[%d] %s" % [i + 1, c["name"]], 19)
		name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		if String(c.get("tag", "")) != "":
			var tag_l := _label(v, c["tag"], 12)
			tag_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			tag_l.modulate = Color("#f1c40f") if evolve else Color("#74b9ff")
		if String(c.get("desc", "")) != "":
			var desc_l := _label(v, c["desc"], 14)
			desc_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			desc_l.modulate = Color(1, 1, 1, 0.8)
		level_list.add_child(card)
		i += 1


func _refresh_reroll() -> void:
	if not run.free_reroll_used:
		reroll_btn.text = "[0] 🎲 리롤 (무료)"
	elif run.player.rerolls > 0:
		reroll_btn.text = "[0] 🎲 리롤 (🎲 %d개 보유)" % run.player.rerolls
	else:
		reroll_btn.text = "[0] 🎲 리롤 (없음)"
	reroll_btn.disabled = not run.can_reroll()


func _refresh_weapon_bar() -> void:
	var p = run.player
	var main_id: String = run.get_main_weapon()
	var sig := "%s|%s|%s|%s" % [str(p.weapons), str(p.weapon_levels), main_id, str(p.slash_mods)]
	if sig == _weapon_sig:
		return
	_weapon_sig = sig
	for c in weapon_bar.get_children():
		c.queue_free()
	for id in p.weapons:
		var d: Dictionary = R.WEAPON_DEFS[id]
		var attack: bool = R.is_attack_weapon(id)
		var is_main: bool = attack and id == main_id
		var badge := "⭐" if is_main else ("⚙" if attack else "")
		var star := "✨" if d.get("evolved", false) else ""
		var b := _button("%s%s%s Lv%d" % [badge, star, d["icon"], int(p.weapon_levels.get(id, 1))], _on_weapon_slot.bind(id))
		b.add_theme_font_size_override("font_size", 13)
		b.tooltip_text = String(d["name"]) + ("" if is_main or not attack else " — 눌러서 메인 무기로")
		if attack and not is_main:
			b.modulate = Color(1, 1, 1, 0.6)
		weapon_bar.add_child(b)
	for def in R.SLASH_SUPPORT_DEFS:
		var lv: int = run.slash_mod_level(def["id"])
		if lv > 0:
			var sb := _button("💨%s Lv%d" % [String(def["name"]).split(" ")[0], lv], func(): pass)
			sb.add_theme_font_size_override("font_size", 13)
			sb.disabled = true
			weapon_bar.add_child(sb)


# ── 입력 ───────────────────────────────────────────────────────────

func _move_dir() -> Vector2:
	var d := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		d.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		d.x += 1.0
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		d.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		d.y += 1.0
	if joy_active:
		d += joy_vec
	if d.length() > 1.0:
		d = d.normalized()
	return d


func _dash_held() -> bool:
	return Input.is_physical_key_pressed(KEY_SPACE) or Input.is_physical_key_pressed(KEY_X)


func _od_center() -> Vector2:
	var vp := get_viewport_rect().size
	return Vector2(vp.x - 56.0, vp.y - WEAPON_BAR_H - 56.0)


func _unhandled_input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k != null:
		if k.pressed and not k.echo:
			_on_key(k.keycode)
		return
	if run == null:
		return
	# GDScript 는 `is` 검사 뒤에도 타입을 좁혀 주지 않는다 — 명시적으로 캐스팅한다
	var st := event as InputEventScreenTouch
	if st != null:
		if st.pressed:
			if run.state == "playing" and st.position.distance_to(_od_center()) < OD_RADIUS + 8.0:
				run.activate_overdrive()
				return
			var vp := get_viewport_rect().size
			if joy_index == -1 and run.state == "playing" and st.position.y < vp.y - WEAPON_BAR_H:
				joy_index = st.index
				joy_active = true
				joy_center = st.position
				joy_vec = Vector2.ZERO
		elif st.index == joy_index:
			joy_index = -1
			joy_active = false
			joy_vec = Vector2.ZERO
		return
	var sd := event as InputEventScreenDrag
	if sd != null and sd.index == joy_index:
		var off := sd.position - joy_center
		var d := off.length()
		if d > JOY_FOLLOW:
			joy_center += off.normalized() * (d - JOY_FOLLOW)   # 베이스 끌려오기
			off = sd.position - joy_center
			d = JOY_FOLLOW
		joy_vec = off.normalized() * (minf(d, JOY_R) / JOY_R) if d > 0.0 else Vector2.ZERO
		return
	# 데스크톱 마우스로 OD 버튼 (터치에서 온 가짜 마우스 이벤트면 위에서 이미 처리됐다 — 두 번 눌려도 무해)
	var mb := event as InputEventMouseButton
	if mb != null and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT and run.state == "playing":
		if mb.position.distance_to(_od_center()) < OD_RADIUS + 8.0:
			run.activate_overdrive()


func _on_key(code: Key) -> void:
	if run == null:
		return
	match code:
		KEY_P, KEY_ESCAPE:
			_on_pause_pressed()
		KEY_Q:
			run.activate_overdrive()
		KEY_1, KEY_2, KEY_3:
			if run.state == "levelup" or run.state == "itembox":
				_pick_choice(code - KEY_1)
		KEY_0:
			if run.state == "levelup" or run.state == "itembox":
				_on_reroll()


func _notification(what: int) -> void:
	# 앱이 가려지면 일시정지 (웹판 visibilitychange)
	if (what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED) and run != null and run.state == "playing":
		run.set_paused(true)
		_sync_ui()


func _process(delta: float) -> void:
	if run != null and run.state == "playing":
		run.tick(minf(delta, 0.05), _move_dir(), _dash_held())   # 웹판과 같은 dt 상한
	if run != null:
		_sync_ui()
	queue_redraw()


# ── 그리기 ─────────────────────────────────────────────────────────

func _cam() -> Vector2:
	var vp := get_viewport_rect().size
	return Vector2(run.player.x, run.player.y) - vp / run.view_scale / 2.0


func _on_screen(x: float, y: float, margin: float) -> bool:
	var vp: Vector2 = get_viewport_rect().size / run.view_scale
	var cam := _cam()
	return x > cam.x - margin and x < cam.x + vp.x + margin and y > cam.y - margin and y < cam.y + vp.y + margin


static func _a(c: Color, alpha: float) -> Color:
	return Color(c.r, c.g, c.b, c.a * clampf(alpha, 0.0, 1.0))


func _text_c(pos: Vector2, text: String, size: int, color: Color) -> void:
	draw_string(font, pos - Vector2(400, 0), text, HORIZONTAL_ALIGNMENT_CENTER, 800, size, color)


func _ring_arc(pos: Vector2, r: float, color: Color, width: float) -> void:
	draw_arc(pos, maxf(r, 0.5), 0.0, TAU, 40, color, width)


func _rot_poly(center: Vector2, angle: float, pts: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for pt in pts:
		var v: Vector2 = pt
		out.append(center + v.rotated(angle))
	return out


func _draw() -> void:
	var vp := get_viewport_rect().size
	if run == null:
		draw_rect(Rect2(Vector2.ZERO, vp), Color("#101827"))
		return
	draw_rect(Rect2(Vector2.ZERO, vp), Color(String(run.map_def["bg"])))
	var vs: float = run.view_scale
	var shake := Vector2.ZERO
	if run.screen_shake > 0.0:
		var mag: float = run.screen_shake * 14.0
		shake = Vector2((randf() - 0.5) * mag, (randf() - 0.5) * mag)
	var cam := _cam()
	draw_set_transform(-cam * vs + shake, 0.0, Vector2(vs, vs))
	_draw_world(cam, vp / vs)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_draw_hud(vp)


func _draw_world(cam: Vector2, view: Vector2) -> void:
	var t: float = run.elapsed
	# 배경 격자
	var grid := Color(1, 1, 1, 0.04)
	var gx0 := floorf(cam.x / 60.0) * 60.0
	var gy0 := floorf(cam.y / 60.0) * 60.0
	var gx := gx0
	while gx < cam.x + view.x + 60.0:
		draw_line(Vector2(gx, cam.y - 60.0), Vector2(gx, cam.y + view.y + 60.0), grid, 1.0)
		gx += 60.0
	var gy := gy0
	while gy < cam.y + view.y + 60.0:
		draw_line(Vector2(cam.x - 60.0, gy), Vector2(cam.x + view.x + 60.0, gy), grid, 1.0)
		gy += 60.0

	# 장판류
	for tf in run.toxic_fields:
		var c := Color("#6ab04c") if tf["evolved"] else Color("#badc58")
		var a: float = minf(1.0, tf["life"] / tf["max_life"] * 2.0)
		draw_circle(Vector2(tf["x"], tf["y"]), tf["range"], _a(c, 0.16 * a))
		_ring_arc(Vector2(tf["x"], tf["y"]), tf["range"], _a(c, 0.5 * a), 1.5)
	for sf in run.spectral_fields:
		draw_circle(Vector2(sf["x"], sf["y"]), sf["range"], _a(Color("#9b59b6"), 0.22 * sf["life"] / sf["max_life"]))
	for af in run.dash_afterimages:
		var ac := Color("#74b9ff") if af["is_chain"] else Color("#f8c8ff")
		draw_circle(Vector2(af["x"], af["y"]), af["range"], _a(ac, 0.18 * af["life"] / af["max_life"]))

	# XP 젬 — 가치별 크기·색
	var inv: float = 1.0 / run.view_scale
	for g in run.xp_gems:
		if not _on_screen(g["x"], g["y"], 24.0):
			continue
		var v: float = g["val"]
		var r := (9.0 if v >= 81 else (7.0 if v >= 31 else (6.0 if v >= 15 else (5.0 if v >= 5 else 3.5)))) * inv
		var col := Color("#ffd700") if v >= 81 else (Color("#f39c12") if v >= 31 else (Color("#e67e22") if v >= 15 else (Color("#f1c40f") if v >= 5 else Color("#ffe082"))))
		var pulse := 1.0 + sin(t * 28.0) * 0.18 if g["attracting"] else 1.0
		draw_circle(Vector2(g["x"], g["y"]), r * pulse, col)

	# 아이템 박스 / 파워업
	for box in run.item_boxes:
		var pulse := 0.7 + sin(box["pulse_t"] * 3.5) * 0.3
		var fade: float = minf(box["life"] * 0.4, 1.0)
		var bp := Vector2(box["x"], box["y"])
		var sq := _rot_poly(bp, box["pulse_t"] * 0.6, [Vector2(-11, -11) * inv, Vector2(11, -11) * inv, Vector2(11, 11) * inv, Vector2(-11, 11) * inv])
		draw_colored_polygon(sq, _a(Color("#f1c40f"), fade * pulse))
		_text_c(bp + Vector2(0, 6) * inv, "📦", roundi(14 * inv), _a(Color.WHITE, fade))
	for pu in run.powerups:
		var pc: Color = Color(String(pu["def"]["color"]))
		var pp := Vector2(pu["x"], pu["y"])
		var fade: float = minf(pu["life"] * 0.5, 1.0)
		draw_circle(pp, (13.0 + sin(pu["pulse_t"] * 5.0) * 2.0) * inv, _a(pc, 0.85 * fade))
		_text_c(pp + Vector2(0, 6) * inv, pu["def"]["icon"], roundi(15 * inv), _a(Color.WHITE, fade))

	# 적
	for e in run.enemies:
		if not _on_screen(e.x, e.y, e.size + 40.0):
			continue
		_draw_enemy(e, t)

	# 적 투사체
	for ep in run.enemy_projectiles:
		draw_circle(Vector2(ep["x"], ep["y"]), ep["r"], Color("#ff6b35"))
		draw_circle(Vector2(ep["x"], ep["y"]), ep["r"] * 0.45, Color("#ffd2b0"))

	# 플레이어 투사체
	for p in run.projectiles:
		_draw_projectile(p, t)

	# 충격파 링
	for rg in run.rings:
		var k: float = 1.0 - rg["life"] / rg["max_life"]
		var rr: float = rg["r"] + (rg["max_r"] - rg["r"]) * k
		_ring_arc(Vector2(rg["x"], rg["y"]), rr, _a(rg["color"], (1.0 - k) * 0.85), maxf(0.5, 3.0 - k * 2.5))

	# 파티클
	for pt in run.particles:
		var pa: float = pt["life"] / pt["max_life"]
		draw_circle(Vector2(pt["x"], pt["y"]), maxf(0.5, pt["size"] * pa), _a(pt["color"], pa))

	# 데미지 숫자 / 월드 텍스트
	var dn_size := [12, 15, 21]
	var dn_color := [Color("#ffffff"), Color("#ffe27a"), Color("#ff8c1a")]
	for dn in run.damage_numbers:
		var k: float = dn["life"] / dn["max_life"]
		var tier: int = dn["tier"]
		var pop := 1.0 + (k - 0.85) / 0.15 * 0.45 if k > 0.85 else 1.0
		var col: Color = Color("#74b9ff") if tier < 0 else dn_color[tier]
		var size: int = roundi((12 if tier < 0 else dn_size[tier]) * pop)
		_text_c(Vector2(dn["x"], dn["y"]), ("%d!" % dn["val"]) if tier == 2 else str(dn["val"]), size, _a(col, minf(1.0, k * 1.7)))
	for ft in run.float_texts:
		if ft["screen_space"]:
			continue
		_text_c(Vector2(ft["x"], ft["y"]), ft["text"], ft["size"], _a(ft["color"], minf(ft["life"] / ft["max_life"] * 2.0, 1.0)))

	# 대쉬 베기
	var de = run.dash_effect
	if de != null:
		var k: float = de["life"] / de["max_life"]
		var dc := (Color("#74b9ff") if de["chain_idx"] == 1 else Color.WHITE) if de["is_chain"] else Color("#f8c8ff")
		draw_line(Vector2(de["x"], de["y"]), Vector2(de["end_x"], de["end_y"]), _a(dc, k * 0.8), de["width"] * 0.6)
		_ring_arc(Vector2(de["end_x"], de["end_y"]), de["range"] * (1.2 - k * 0.2), _a(dc, k * 0.6), 3.0)

	_draw_player(t)


func _draw_enemy(e, t: float) -> void:
	var pos := Vector2(e.x, e.y)
	var s: float = e.size
	var alpha := 1.0
	if e.spawn_t > 0.0:
		var k: float = e.spawn_t / (0.5 if e.is_boss else 0.35)
		s *= 1.0 - k * 0.5
		alpha = 1.0 - k
	if e.blood_moon:
		draw_circle(pos, s + 6.0, Color(0.8, 0.05, 0.05, 0.28 * alpha))
	if e.is_boss and e.windup_active:
		draw_circle(pos, s + 10.0 + sin(t * 30.0) * 4.0, Color(0.9, 0.2, 0.2, 0.35))
	var col: Color = Color.WHITE if e.hurt_flash > 0.0 else e.color
	draw_circle(pos, s, _a(col, alpha))
	if e.frozen > 0.0:
		draw_circle(pos, s, Color(0.6, 0.85, 1.0, 0.5 * alpha))
	if e.elite:
		_ring_arc(pos, s + 3.0, _a(e.elite_hue, alpha), 2.5)
	if e.shield > 0.0 and e.max_shield > 0.0:
		draw_arc(pos, s + 7.0, -PI / 2.0, -PI / 2.0 + TAU * e.shield / e.max_shield, 32, Color("#74b9ff"), 2.5)
	if e.goblin:
		_text_c(pos + Vector2(0, 5), "💰", roundi(s), Color.WHITE)
	# 눈 — 플레이어 쪽을 본다
	var eye: Vector2 = Vector2(cos(e.face_angle), sin(e.face_angle)) * s * 0.45
	draw_circle(pos + eye, maxf(1.5, s * 0.16), Color(0, 0, 0, 0.75 * alpha))
	if e.burn_stacks > 0:
		draw_circle(pos + Vector2(-s * 0.6, -s * 0.8), 2.5, Color("#e67e22"))
	if e.poison_timer > 0.0:
		draw_circle(pos + Vector2(s * 0.6, -s * 0.8), 2.5, Color("#27ae60"))
	# 정예·고급·고블린 체력바 (보스는 HUD 위쪽)
	if not e.is_boss and (e.elite or e.tier >= 2 or e.goblin) and e.hp < e.max_hp:
		var w := s * 2.0
		var top := pos + Vector2(-s, -s - 8.0)
		draw_rect(Rect2(top, Vector2(w, 3.0)), Color(0, 0, 0, 0.6))
		draw_rect(Rect2(top, Vector2(w * clampf(e.hp / e.max_hp, 0.0, 1.0), 3.0)), Color("#e74c3c"))


func _draw_projectile(p, t: float) -> void:
	var pos := Vector2(p.x, p.y)
	match p.type:
		"orb":
			draw_circle(pos, p.r + 3.0, Color(0.2, 0.6, 0.86, 0.3))
			draw_circle(pos, p.r, Color("#3498db"))
		"blackhole":
			var capture: float = p.r + 78.0
			draw_circle(pos, capture, Color(0.56, 0.27, 0.68, 0.12))
			draw_circle(pos, capture * 0.5, Color(0.3, 0.1, 0.4, 0.25))
			for arm in range(2):
				var pts := PackedVector2Array()
				for i in range(11):
					var k := i / 10.0
					var rr: float = p.r + k * (capture - p.r)
					var aa: float = t * 3.0 + arm * PI + k * 5.0
					pts.append(pos + Vector2(cos(aa), sin(aa)) * rr)
				draw_polyline(pts, Color(0.7, 0.53, 1.0, 0.5), 2.0)
			draw_circle(pos, p.r, Color("#1a0a24"))
			_ring_arc(pos, p.r + 3.0, Color(0.7, 0.53, 1.0, 0.85), 2.5)
		"arrow":
			var ang := atan2(p.vy, p.vx)
			draw_colored_polygon(_rot_poly(pos, ang, [Vector2(-12, -2), Vector2(12, -2), Vector2(12, 2), Vector2(-12, 2)]), Color("#f39c12"))
		"laser", "deathray":
			var evolved: bool = p.type == "deathray"
			var end: Vector2 = pos + Vector2(cos(p.angle), sin(p.angle)) * p.length
			var c := Color("#e74c3c") if evolved else Color("#f1c40f")
			var a: float = minf(1.0, p.life / 0.35)
			draw_line(pos, end, _a(c, a * 0.35), 14.0 if evolved else 9.0)
			draw_line(pos, end, _a(c, a), 7.0 if evolved else 4.0)
		"explosion":
			var c := Color("#f1c40f") if p.evolved else Color("#e74c3c")
			var a: float = p.life / 0.4
			draw_circle(pos, maxf(p.r, 0.5), _a(c, a * 0.35))
			_ring_arc(pos, p.r, _a(c, a), 2.0)
		"boomerang":
			var ang: float = atan2(p.vy, p.vx) + (PI if p.flipped else 0.0) + t * 18.0
			var pts: Array = []
			for i in range(12):
				var a := i / 12.0 * TAU
				pts.append(Vector2(cos(a) * 10.0, sin(a) * 4.0))
			draw_colored_polygon(_rot_poly(pos, ang, pts), Color("#27ae60"))
		"arc":
			var a: float = p.life / 0.22
			var target := Vector2(p.tx, p.ty)
			var mid := (pos + target) / 2.0 + Vector2(randf() - 0.5, randf() - 0.5) * 18.0
			draw_polyline(PackedVector2Array([pos, mid, target]), _a(Color("#a29bfe"), a), 1.5 + a * 1.5)
		"missile":
			var ang := atan2(p.vy, p.vx)
			draw_colored_polygon(_rot_poly(pos, ang, [Vector2(9, 0), Vector2(-6, -4), Vector2(-6, 4)]), Color("#ff9ff3") if p.evolved else Color("#e056fd"))
		"meteor":
			var c := Color("#ff7675") if p.evolved else Color("#e17055")
			if p.delay > 0.0:
				_ring_arc(Vector2(p.tx, p.ty), 14.0 + sin(t * 12.0) * 4.0, _a(Color("#ff7675") if p.evolved else Color("#fab1a0"), 0.6), 2.0)
			else:
				draw_colored_polygon(PackedVector2Array([pos + Vector2(-p.r, 0), pos + Vector2(0, -p.r * 3.2), pos + Vector2(p.r, 0)]), _a(c, 0.4))
				draw_circle(pos, p.r, c)


func _draw_player(t: float) -> void:
	var pl = run.player
	var pos := Vector2(pl.x, pl.y)
	for tr in run.player_trail:
		var tc: Color = tr["chain_color"] if tr["chain_color"] != null else Color("#d7a3f5")
		draw_circle(Vector2(tr["x"], tr["y"]), 9.0, _a(tc, tr["life"] / 0.34 * 0.35))
	# 콤보 오라
	if run.combo_count >= 10 and run.combo_timer > 0.0:
		var aura := Color("#e74c3c") if run.combo_count >= 30 else (Color("#f39c12") if run.combo_count >= 20 else Color("#f1c40f"))
		_ring_arc(pos, 20.0 + sin(t * 16.0) * 3.0 + minf(run.combo_count, 80) * 0.22, _a(aura, 0.55), 3.0)
	# 저체력 경고 링
	var hp_ratio: float = run.get_player_hp_ratio()
	if hp_ratio <= R.LOW_HP_THRESHOLD:
		var critical: bool = hp_ratio <= R.CRITICAL_HP_THRESHOLD
		var pulse: float = 1.0 + sin(t * (12.0 if critical else 8.0)) * 0.08 + run.low_hp_pulse * 0.04
		_ring_arc(pos, 25.0 * pulse, _a(Color("#ff3b30") if critical else Color("#f39c12"), 0.42 if critical else 0.28), 4.0 if critical else 3.0)
	if pl.invincible > 0.3:
		_ring_arc(pos, 20.0, Color(0.36, 0.68, 0.89, 0.5), 2.0)
	var alpha := (0.5 + sin(t * 30.0) * 0.3) if pl.invincible > 0.0 else 1.0
	# 별 모양 플레이어
	var pts: Array = []
	for i in range(5):
		var a1 := (i / 5.0) * TAU - PI / 2.0
		var a2 := ((i + 0.5) / 5.0) * TAU - PI / 2.0
		pts.append(Vector2(cos(a1), sin(a1)) * 14.0)
		pts.append(Vector2(cos(a2), sin(a2)) * 7.0)
	draw_circle(pos, 16.0, Color(0.56, 0.27, 0.68, 0.25 * alpha))
	draw_colored_polygon(_rot_poly(pos, 0.0, pts), _a(Color("#d7a3f5"), alpha))


func _draw_hud(vp: Vector2) -> void:
	var p = run.player
	# 화면 연출: 혈월 / 피격 / 진화 / 오버드라이브 / 저체력
	if run.blood_moon_active > 0.0:
		draw_rect(Rect2(Vector2.ZERO, vp), Color(0.6, 0.0, 0.0, 0.12))
	if run.hurt_screen_flash > 0.0:
		draw_rect(Rect2(Vector2.ZERO, vp), Color(0.9, 0.1, 0.1, run.hurt_screen_flash * 0.6))
	if run.evolve_flash > 0.0:
		draw_rect(Rect2(Vector2.ZERO, vp), Color(1.0, 0.85, 0.2, run.evolve_flash * 0.5))
	if run.overdrive_flash > 0.0:
		draw_rect(Rect2(Vector2.ZERO, vp), Color(1.0, 0.9, 0.3, run.overdrive_flash * 0.4))
	var hp_ratio: float = run.get_player_hp_ratio()
	if hp_ratio <= R.LOW_HP_THRESHOLD:
		var pulse := 0.5 + sin(run.elapsed * 8.0) * 0.5
		draw_rect(Rect2(Vector2.ZERO, vp), Color(1, 0.1, 0.1, 0.25 + pulse * 0.2), false, 10.0)
	if p.invincible > 0.3:
		draw_rect(Rect2(Vector2.ZERO, vp), Color(0.56, 0.27, 0.68, 0.3), false, 6.0)

	# 위쪽 상태줄
	var head := "Lv.%d   ⏱ %s   💀 %d   🎲 %d" % [p.level, R.fmt_time(run.elapsed), run.kills, p.rerolls]
	if run.infinite_mode:
		head += "   🌀 무한"
	draw_string(font, Vector2(12, 26), head, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color.WHITE)
	var bar_w := vp.x - 24.0
	draw_rect(Rect2(12, 36, bar_w, 12), Color(0, 0, 0, 0.5))
	draw_rect(Rect2(12, 36, bar_w * hp_ratio, 12), Color("#e74c3c") if hp_ratio <= R.LOW_HP_THRESHOLD else Color("#2ecc71"))
	draw_string(font, Vector2(12, 47), "❤ %d/%d" % [ceili(p.hp), roundi(p.max_hp)], HORIZONTAL_ALIGNMENT_RIGHT, bar_w - 4.0, 11, Color.WHITE)
	var need: int = R.xp_needed(p.level)
	draw_rect(Rect2(12, 52, bar_w, 7), Color(0, 0, 0, 0.5))
	draw_rect(Rect2(12, 52, bar_w * clampf(p.xp / need, 0.0, 1.0), 7), Color("#3498db"))
	if run.blood_moon_active > 0.0:
		draw_string(font, Vector2(12, 78), "🌑 혈월 %ds" % ceili(run.blood_moon_active), HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#ff6b6b"))
	if run.combo_count >= 5 and run.combo_timer > 0.0:
		draw_string(font, Vector2(12, 98), "×%d COMBO" % run.combo_count, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("#f39c12"))

	# 보스 체력바
	for e in run.enemies:
		if e.is_boss:
			var bw := vp.x * 0.7
			var bx := (vp.x - bw) / 2.0
			draw_rect(Rect2(bx, 120, bw, 10), Color(0, 0, 0, 0.6))
			draw_rect(Rect2(bx, 120, bw * clampf(e.hp / e.max_hp, 0.0, 1.0), 10), Color("#e74c3c") if e.boss_phase == 1 else Color("#f1c40f"))
			_text_c(Vector2(vp.x / 2.0, 116), "👑 BOSS", 13, Color.WHITE)
			break
	if run.boss_warning > 0.0:
		_text_c(Vector2(vp.x / 2.0, vp.y * 0.3), "⚠ BOSS ⚠", 30, _a(Color("#e74c3c"), 0.5 + sin(run.elapsed * 14.0) * 0.5))

	_draw_goblin_arrow(vp)

	# 화면 공간 알림 텍스트 — 가운데에 쌓인다
	var fty := vp.y / 2.0 - 55.0
	for ft in run.float_texts:
		if not ft["screen_space"]:
			continue
		_text_c(Vector2(vp.x / 2.0, fty), ft["text"], ft["size"], _a(ft["color"], minf(ft["life"] / ft["max_life"] * 2.0, 1.0)))
		fty += ft["size"] + 10.0

	# 대쉬 쿨다운 (왼쪽 아래)
	var dash_c := Vector2(40, vp.y - WEAPON_BAR_H - 40.0)
	draw_circle(dash_c, 22.0, Color(0, 0, 0, 0.45))
	var dash_k: float = 1.0 - clampf(run.dash_cd / R.DASH_COOLDOWN, 0.0, 1.0)
	draw_arc(dash_c, 22.0, -PI / 2.0, -PI / 2.0 + TAU * dash_k, 32, Color("#74b9ff") if run.dash_chain_window > 0.0 else Color("#f8c8ff"), 3.0)
	_text_c(dash_c + Vector2(0, 5), "💨", 15, Color.WHITE)

	# 오버드라이브 버튼 (오른쪽 아래)
	var od := _od_center()
	var active: bool = run.overdrive_active > 0.0
	var od_ready: bool = run.overdrive_charge >= 100.0 and not active
	draw_circle(od, OD_RADIUS, Color(0.95, 0.77, 0.06, 0.85) if od_ready else Color(0, 0, 0, 0.5))
	draw_arc(od, OD_RADIUS, -PI / 2.0, -PI / 2.0 + TAU * run.overdrive_charge / 100.0, 40, Color("#f1c40f"), 3.0)
	var od_label := "⚡" if active else ("OD!" if od_ready else "%d%%" % floori(run.overdrive_charge))
	_text_c(od + Vector2(0, 6), od_label, 16, Color.BLACK if od_ready else Color.WHITE)

	# 조이스틱
	if joy_active:
		draw_circle(joy_center, JOY_R, Color(1, 1, 1, 0.12))
		_ring_arc(joy_center, JOY_R, Color(1, 1, 1, 0.35), 2.0)
		draw_circle(joy_center + joy_vec * JOY_R, 18.0, Color(1, 1, 1, 0.45))


## 보물 고블린이 화면 밖이면 가장자리에 방향 화살표
func _draw_goblin_arrow(vp: Vector2) -> void:
	var cam := _cam()
	var vs: float = run.view_scale
	for e in run.enemies:
		if not e.goblin:
			continue
		var sp: Vector2 = (Vector2(e.x, e.y) - cam) * vs
		if sp.x > 0 and sp.x < vp.x and sp.y > 0 and sp.y < vp.y:
			continue
		var center := vp / 2.0
		var dir := (sp - center).normalized()
		var edge := center + dir * minf(vp.x, vp.y) * 0.42
		draw_colored_polygon(_rot_poly(edge, dir.angle(), [Vector2(14, 0), Vector2(-8, -9), Vector2(-8, 9)]), Color("#f1c40f"))
		_text_c(edge - dir * 22.0 + Vector2(0, 6), "💰", 16, Color.WHITE)
		return
