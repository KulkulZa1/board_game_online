extends Node2D
## 뱀파이어 서바이버 — Godot 판 화면. 규칙은 vs_run.gd 에 있고, 여기는 그리기·소리·입력·UI 만 한다.
##
## 층 구성 (아래에서 위로):
##   바닥(셰이더) → 데칼(핏자국·예고 장판) → 몸체(스프라이트·그림자) → 실루엣(피격 번쩍임·빙결)
##   → 가산 FX(빛·파티클·광선, HDR 이라 글로우가 번진다) → 글자(피해 숫자) → 후처리(충격파·색수차·비네트) → HUD/UI
## 규칙이 남기는 사건(run.events — kill/hit/explosion/thunder/loot …)을 받아 소리·파편·충격파·카메라 펀치로 바꾼다.
##
## 조작: WASD/방향키 이동 · Space/X 대쉬 · Q 오버드라이브 · P/Esc 일시정지(장비 보기) · 1/2/3 선택 · 0 리롤
##       터치: 화면 아무 곳이나 눌러 조이스틱, 오른쪽 아래 OD 버튼, 아래쪽 무기 칸을 눌러 메인 무기 변경

const R := preload("res://scripts/vs_rules.gd")
const C := preload("res://scripts/vs_content.gd")
const Run := preload("res://scripts/vs_run.gd")
const Sfx := preload("res://scripts/vs_sfx.gd")
const DrawLayer := preload("res://scripts/draw_layer.gd")
const META_PATH := "user://vampire_meta.cfg"

const JOY_R := 44.0
const JOY_FOLLOW := JOY_R * 1.5     # 이 거리를 넘으면 베이스가 손가락을 따라온다
const OD_RADIUS := 34.0
const WEAPON_BAR_H := 76.0          # 아래쪽 무기 칸 높이 — 이 영역의 터치는 조이스틱이 아니다
const SPRITES := ["player", "ghoul", "bat", "skeleton", "archer", "slime", "wraith", "golem", "bomber", "charger",
	"goblin", "boss", "item_helm", "item_armor", "item_boots", "item_ring", "chest", "axe", "slash", "gem"]
const MAP_PALETTE := {
	"meadow": [Color("#151c28"), Color("#080b12"), Color("#1c2b1a")],
	"night": [Color("#1d1a33"), Color("#090814"), Color("#33204a")],
	"snow": [Color("#5d7286"), Color("#24303c"), Color("#8fa9bd")]
}
const DECAL_COLORS := {
	"ghoul": Color(0.35, 0.45, 0.15, 0.75), "bat": Color(0.4, 0.05, 0.25, 0.75), "skeleton": Color(0.85, 0.82, 0.72, 0.45),
	"archer": Color(0.85, 0.82, 0.72, 0.45), "slime": Color(0.3, 0.75, 0.2, 0.7), "wraith": Color(0.4, 0.6, 1.0, 0.35),
	"golem": Color(0.35, 0.33, 0.3, 0.8), "bomber": Color(0.15, 0.1, 0.1, 0.8), "charger": Color(0.55, 0.05, 0.05, 0.8)
}

var run = null
var font: Font
var sfx: Node
var tex := {}                       # 스프라이트 이름 → Texture2D (파일이 없으면 원으로 대신 그린다)
var soft_tex: Texture2D             # 가산 파티클용 부드러운 원
var splat_tex: Array = []           # 핏자국 모양 3종
var sel_char := 0
var sel_diff := 1
var sel_map := 0
var meta := {"shards": 0, "upgrades": {}, "best_time": 0.0, "best_kills": 0, "best_level": 0, "runs": 0}
var last_shards := 0

# 장면
var cam: Camera2D
var ground: ColorRect
var ground_mat: ShaderMaterial
var layers := {}
var post_mat: ShaderMaterial

# 화면 전용 연출 상태 (규칙과 무관)
var decals: Array = []      # {x, y, rot, scale, color, tex, life, max_life}
var bits: Array = []        # 튀는 조각 {x, y, z, vx, vy, vz, life, size, color}
var bolts: Array = []       # 낙뢰 {pts, life, max_life, evolved}
var slashes: Array = []     # 채찍 베기 {x, y, dir, reach, height, life, max_life, evolved}
var ghosts: Array = []      # 대쉬 잔상 {x, y, life, flip}
var waves: Array = []       # 충격파 {x, y, r, max_r, life, max_life, strength}
var punch := 0.0
var aberr := 0.0
var flash := 0.0
var gem_streak := 0
var gem_streak_t := 0.0
var face_right := true
var anim_t := 0.0

var joy_active := false
var joy_index := -1
var joy_center := Vector2.ZERO
var joy_vec := Vector2.ZERO

var start_root: Control
var start_icon: Label
var start_msg: Label
var start_sub: Label
var shards_label: Label
var char_btn: Button
var char_desc: Label
var diff_btn: Button
var diff_desc: Label
var map_btn: Button
var map_desc: Label
var shop_root: Control
var shop_box: VBoxContainer
var shop_shards: Label
var level_root: Control
var level_title: Label
var level_list: VBoxContainer
var reroll_btn: Button
var pause_root: Control
var pause_info: VBoxContainer
var victory_root: Control
var pause_btn: Button
var weapon_bar: HFlowContainer
var _weapon_sig := ""
var _shown_choices = null
var _end_shown := false


func _ready() -> void:
	font = _korean_font()
	_load_meta()
	_load_art()
	_build_world()
	_build_ui()
	sfx = Sfx.new()
	add_child(sfx)
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


# ── 리소스 ─────────────────────────────────────────────────────────

func _load_art() -> void:
	for n in SPRITES:
		var p := "res://art/%s.svg" % n
		if ResourceLoader.exists(p):
			tex[n] = load(p)
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.35, Color(1, 1, 1, 0.55))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 64
	gt.height = 64
	soft_tex = gt
	# 핏자국 — 원 몇 개를 겹친 얼룩을 이미지로 구워 둔다
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for v in range(3):
		var img := Image.create_empty(64, 64, false, Image.FORMAT_RGBA8)
		img.fill(Color(0, 0, 0, 0))
		var blobs: Array = [[32.0, 32.0, 15.0]]
		for k in range(7):
			var a := rng.randf() * TAU
			var d := rng.randf_range(6.0, 20.0)
			blobs.append([32.0 + cos(a) * d, 32.0 + sin(a) * d, rng.randf_range(3.0, 9.0)])
		for y in range(64):
			for x in range(64):
				var alpha := 0.0
				for b in blobs:
					var dd := Vector2(x - float(b[0]), y - float(b[1])).length()
					alpha = maxf(alpha, clampf((float(b[2]) - dd) / 2.0, 0.0, 1.0))
				if alpha > 0.0:
					img.set_pixel(x, y, Color(1, 1, 1, alpha))
		splat_tex.append(ImageTexture.create_from_image(img))


func _load_meta() -> void:
	var cf := ConfigFile.new()
	if cf.load(META_PATH) != OK:
		return
	meta["shards"] = int(cf.get_value("meta", "shards", 0))
	meta["best_time"] = float(cf.get_value("meta", "best_time", 0.0))
	meta["best_kills"] = int(cf.get_value("meta", "best_kills", 0))
	meta["best_level"] = int(cf.get_value("meta", "best_level", 0))
	meta["runs"] = int(cf.get_value("meta", "runs", 0))
	var ups := {}
	for id in C.SOUL_UPGRADE_ORDER:
		ups[id] = int(cf.get_value("upgrades", id, 0))
	meta["upgrades"] = ups


func _save_meta() -> void:
	var cf := ConfigFile.new()
	for k in ["shards", "best_time", "best_kills", "best_level", "runs"]:
		cf.set_value("meta", k, meta[k])
	for id in C.SOUL_UPGRADE_ORDER:
		cf.set_value("upgrades", id, int(meta["upgrades"].get(id, 0)))
	cf.save(META_PATH)


# ── 장면 만들기 ────────────────────────────────────────────────────

func _build_world() -> void:
	# 2D 글로우 — HDR 색(1 보다 밝은 색)으로 그린 가산 FX 가 번진다
	var env := Environment.new()
	env.background_mode = Environment.BG_CANVAS
	env.glow_enabled = true
	env.glow_intensity = 0.85
	env.glow_strength = 1.0
	env.glow_bloom = 0.02
	env.glow_hdr_threshold = 0.95
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	for i in range(7):
		env.set_glow_level(i, 1.0 if i >= 1 and i <= 4 else 0.0)
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	cam = Camera2D.new()
	add_child(cam)
	cam.make_current()

	var world := Node2D.new()
	add_child(world)
	ground = ColorRect.new()
	ground.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ground_mat = ShaderMaterial.new()
	ground_mat.shader = load("res://shaders/ground.gdshader")
	ground.material = ground_mat
	world.add_child(ground)
	for kind in ["decals", "bodies", "silhouette", "fx", "text"]:
		var l := DrawLayer.new()
		l.main = self
		l.kind = kind
		if kind == "fx":
			var m := CanvasItemMaterial.new()
			m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
			l.material = m
		elif kind == "silhouette":
			var sm := ShaderMaterial.new()
			sm.shader = load("res://shaders/silhouette.gdshader")
			l.material = sm
		world.add_child(l)
		layers[kind] = l

	var post_layer := CanvasLayer.new()
	post_layer.layer = 5
	add_child(post_layer)
	var post := ColorRect.new()
	post.set_anchors_preset(Control.PRESET_FULL_RECT)
	post.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post_mat = ShaderMaterial.new()
	post_mat.shader = load("res://shaders/post.gdshader")
	post.material = post_mat
	post_layer.add_child(post)


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	var hud := DrawLayer.new()
	hud.main = self
	hud.kind = "hud"
	layer.add_child(hud)
	layers["hud"] = hud
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
	pause_btn.offset_top = 118.0
	pause_btn.offset_bottom = 160.0
	root.add_child(pause_btn)

	# 시작/게임오버
	var m := _modal(root, 470.0)
	start_root = m["root"]
	var box: VBoxContainer = m["box"]
	start_icon = _label(box, "👾", 44)
	start_msg = _label(box, "몰려오는 괴물을 베어 넘기고 살아남아라!\nWASD / 방향키 또는 조이스틱 · Space 대쉬 베기", 17)
	start_sub = _label(box, "", 15)
	start_sub.modulate = Color(1, 1, 1, 0.85)
	shards_label = _label(box, "", 15)
	shards_label.modulate = Color("#c39bd3")
	char_btn = _button("", _cycle_char)
	box.add_child(char_btn)
	char_desc = _label(box, "", 13)
	diff_btn = _button("", _cycle_diff)
	box.add_child(diff_btn)
	diff_desc = _label(box, "", 13)
	map_btn = _button("", _cycle_map)
	box.add_child(map_btn)
	map_desc = _label(box, "", 13)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	box.add_child(row)
	var start_btn := _button("⚔ 시작하기", _start_run)
	start_btn.custom_minimum_size = Vector2(0, 54)
	start_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(start_btn)
	var shop_btn := _button("💠 영혼석 강화", _open_shop)
	shop_btn.custom_minimum_size = Vector2(0, 54)
	shop_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(shop_btn)
	var keys := _label(box, "Space/X 대쉬 · Q 오버드라이브 · P 일시정지/장비", 12)
	keys.modulate = Color(1, 1, 1, 0.6)

	# 영혼석 상점
	m = _modal(root, 460.0)
	shop_root = m["root"]
	box = m["box"]
	_label(box, "💠 영혼석 강화", 26)
	shop_shards = _label(box, "", 16)
	shop_shards.modulate = Color("#c39bd3")
	shop_box = VBoxContainer.new()
	shop_box.add_theme_constant_override("separation", 8)
	box.add_child(shop_box)
	box.add_child(_button("← 돌아가기", _close_shop))

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

	# 일시정지 — 장비·세트 현황
	m = _modal(root, 470.0)
	pause_root = m["root"]
	box = m["box"]
	_label(box, "⏸ 일시정지", 26)
	pause_info = VBoxContainer.new()
	pause_info.add_theme_constant_override("separation", 4)
	box.add_child(pause_info)
	box.add_child(_button("▶ 계속하기", _on_pause_pressed))
	box.add_child(_button("🏳 포기하고 결과 보기", _on_give_up))

	# 목표 시간 생존 → 무한 웨이브?
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
	panel.add_theme_stylebox_override("panel", _box_style(Color(0.05, 0.06, 0.11, 1.0), Color("#5b4a8a")))
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
	sb.shadow_color = Color(0, 0, 0, 0.5)
	sb.shadow_size = 8
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


# ── 시작 화면 · 영혼석 상점 ──────────────────────────────────────────

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
	shards_label.text = "💠 영혼석 %d   ·   최고 %s / %d킬 / Lv.%d" % [int(meta["shards"]), R.fmt_time(float(meta["best_time"])), int(meta["best_kills"]), int(meta["best_level"])]


func _open_shop() -> void:
	shop_root.visible = true
	_refresh_shop()


func _close_shop() -> void:
	shop_root.visible = false
	_refresh_start_options()


func _refresh_shop() -> void:
	shop_shards.text = "보유 영혼석 💠 %d — 판이 끝날 때 처치·생존 시간·보스·전설 장비로 얻는다" % int(meta["shards"])
	for c in shop_box.get_children():
		c.queue_free()
	for id in C.SOUL_UPGRADE_ORDER:
		var u: Dictionary = C.SOUL_UPGRADES[id]
		var lv := int(meta["upgrades"].get(id, 0))
		var maxed := lv >= int(u["max"])
		var cost := C.soul_upgrade_cost(id, lv)
		var row := HBoxContainer.new()
		var l := Label.new()
		l.text = "%s %s Lv.%d/%d — %s" % [u["icon"], u["name"], lv, int(u["max"]), u["desc"]]
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.add_theme_font_size_override("font_size", 15)
		row.add_child(l)
		var b := _button("최대" if maxed else "💠 %d" % cost, _buy_upgrade.bind(id))
		b.custom_minimum_size = Vector2(96, 0)
		b.disabled = maxed or int(meta["shards"]) < cost
		row.add_child(b)
		shop_box.add_child(row)


func _buy_upgrade(id: String) -> void:
	var lv := int(meta["upgrades"].get(id, 0))
	var cost := C.soul_upgrade_cost(id, lv)
	if lv >= int(C.SOUL_UPGRADES[id]["max"]) or int(meta["shards"]) < cost:
		return
	meta["shards"] = int(meta["shards"]) - cost
	meta["upgrades"][id] = lv + 1
	_save_meta()
	sfx.play("equip")
	_refresh_shop()


func _start_run() -> void:
	run = Run.new(R.CHARACTER_DEFS[sel_char]["id"], R.DIFFICULTY_DEFS[sel_diff]["id"], R.MAP_DEFS[sel_map]["id"], -1, meta["upgrades"])
	_end_shown = false
	_shown_choices = null
	_weapon_sig = ""
	joy_active = false
	joy_index = -1
	joy_vec = Vector2.ZERO
	decals.clear()
	bits.clear()
	bolts.clear()
	slashes.clear()
	ghosts.clear()
	waves.clear()
	var pal: Array = MAP_PALETTE.get(R.MAP_DEFS[sel_map]["id"], MAP_PALETTE["meadow"])
	ground_mat.set_shader_parameter("base_color", pal[0])
	ground_mat.set_shader_parameter("line_color", pal[1])
	ground_mat.set_shader_parameter("accent_color", pal[2])
	sfx.play("levelup", 0.8)
	_sync_ui()


func _show_result(result: String) -> void:
	var won := result == "win"
	last_shards = C.shards_earned(run.kills, run.elapsed, run.bosses_killed, run.legendaries_found, won)
	meta["shards"] = int(meta["shards"]) + last_shards
	meta["runs"] = int(meta["runs"]) + 1
	var record := ""
	if run.elapsed > float(meta["best_time"]):
		meta["best_time"] = run.elapsed
		record = "   🏅 최고 기록!"
	meta["best_kills"] = maxi(int(meta["best_kills"]), run.kills)
	meta["best_level"] = maxi(int(meta["best_level"]), run.player.level)
	_save_meta()
	if won:
		start_icon.text = "🏆"
		start_msg.text = "%s 생존 성공! 승리!" % R.fmt_time(run.get_survive_goal())
	else:
		start_icon.text = "💀"
		start_msg.text = "쓰러졌다…"
	start_sub.text = "Lv.%d  ·  %s  ·  %d킬  ·  보스 %d  ·  장비 %d개%s\n💠 영혼석 +%d" % [run.player.level, R.fmt_time(run.elapsed), run.kills, run.bosses_killed, run.loot_found, record, last_shards]
	_refresh_start_options()


# ── 버튼 핸들러 ─────────────────────────────────────────────────────

func _on_pause_pressed() -> void:
	if run == null:
		return
	run.set_paused(run.state == "playing")
	if run.state == "paused":
		_fill_pause_info()
	_sync_ui()


func _on_give_up() -> void:
	if run != null and run.state == "paused":
		run.state = "dead"
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


func _fill_pause_info() -> void:
	for c in pause_info.get_children():
		c.queue_free()
	var head := _label(pause_info, "🛡 장비", 18)
	head.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	for slot in C.GEAR_SLOTS:
		var it = run.player.equip[slot]
		if it == null:
			var l := _label(pause_info, "%s — 비어 있음" % C.SLOT_NAMES[slot], 14)
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			l.modulate = Color(1, 1, 1, 0.5)
			continue
		var name_l := _label(pause_info, "%s — %s" % [C.SLOT_NAMES[slot], it["name"]], 15)
		name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		name_l.modulate = Color(String(C.RARITIES[it["rarity"]]["color"]))
		var lines := PackedStringArray()
		for a in it["affixes"]:
			lines.append(C.affix_text(a))
		if it["legendary"] != "":
			lines.append("★ " + String(C.LEGENDARIES[it["legendary"]]["desc"]))
		var d := _label(pause_info, "   " + " · ".join(lines), 12)
		d.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		d.modulate = Color(1, 1, 1, 0.8)
	for sid in C.SET_ORDER:
		var n: int = run.set_count(sid)
		if n == 0:
			continue
		var s: Dictionary = C.SETS[sid]
		var sl := _label(pause_info, "%s %s (%d/4)\n  (2) %s%s\n  (4) %s%s" % [s["icon"], s["name"], n, s["bonus2"], " ✔" if n >= 2 else "", s["bonus4"], " ✔" if n >= 4 else ""], 12)
		sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		sl.modulate = Color(String(s["color"]))


# ── 패널 표시 상태를 규칙 상태에 맞춘다 ─────────────────────────────

func _sync_ui() -> void:
	var st: String = run.state if run != null else "idle"
	var ended := st == "dead" or st == "win"
	if ended and not _end_shown:
		_end_shown = true
		_show_result(st)
	start_root.visible = (run == null or ended) and not shop_root.visible
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
	level_title.text = "📦 보물 상자!" if run.choice_kind == "itembox" else "⬆ 레벨 업!"
	for c in level_list.get_children():
		c.queue_free()
	var i := 0
	for c in run.choices:
		var evolve: bool = c["kind"] == "evolve"
		var accent := Color("#f1c40f") if evolve else (Color("#c39bd3") if c["kind"] == "passive" else (Color("#ff7f3f") if c["kind"] == "slash-support" else Color("#5dade2")))
		var card := PanelContainer.new()
		card.mouse_filter = Control.MOUSE_FILTER_STOP
		card.add_theme_stylebox_override("panel", _box_style(Color(0.18, 0.13, 0.03, 0.97) if evolve else Color(0.08, 0.1, 0.17, 0.97), accent))
		card.gui_input.connect(_on_card_input.bind(i))
		var v := VBoxContainer.new()
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(v)
		var name_l := _label(v, "[%d] %s" % [i + 1, c["name"]], 19)
		name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		if String(c.get("tag", "")) != "":
			var tag_l := _label(v, c["tag"], 12)
			tag_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			tag_l.modulate = accent
		if String(c.get("desc", "")) != "":
			var desc_l := _label(v, c["desc"], 14)
			desc_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			desc_l.modulate = Color(1, 1, 1, 0.82)
		level_list.add_child(card)
		card.modulate = Color(1, 1, 1, 0)
		var tw := create_tween()
		tw.tween_interval(0.05 * i)
		tw.tween_property(card, "modulate", Color.WHITE, 0.16)
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
	if code == KEY_M and sfx != null:
		sfx.muted = not sfx.muted
		return
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
		_fill_pause_info()
		_sync_ui()


# ── 매 프레임 ──────────────────────────────────────────────────────

func _process(delta: float) -> void:
	anim_t += delta
	if run != null and run.state == "playing":
		run.tick(minf(delta, 0.05), _move_dir(), _dash_held())   # 웹판과 같은 dt 상한
		if run.last_move_dir.x > 0.05:
			face_right = true
		elif run.last_move_dir.x < -0.05:
			face_right = false
	if run != null:
		_consume_events()
		_update_fx(delta)
		_sync_ui()
		_update_camera(delta)
	for kind in layers:
		layers[kind].queue_redraw()


func _update_camera(delta: float) -> void:
	var shake := Vector2.ZERO
	var tr: float = run.screen_shake
	if tr > 0.0:
		shake = Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * tr * tr * 30.0
	punch = maxf(0.0, punch - delta * 1.6)
	cam.position = Vector2(run.player.x, run.player.y) + shake
	cam.zoom = Vector2.ONE * run.view_scale * (1.0 + punch * 0.12)
	var view := _view_rect()
	ground.position = view.position - Vector2(80, 80)
	ground.size = view.size + Vector2(160, 160)
	ground_mat.set_shader_parameter("origin", ground.position)
	ground_mat.set_shader_parameter("rect_size", ground.size)
	# 후처리
	var vp := get_viewport_rect().size
	var ct := get_viewport().get_canvas_transform()
	var zoom: float = cam.zoom.x
	var wv: Array = []
	for w in waves:
		var sp: Vector2 = ct * Vector2(w["x"], w["y"])
		var k: float = 1.0 - w["life"] / w["max_life"]
		wv.append(Vector4(sp.x, sp.y, float(w["max_r"]) * k * zoom, float(w["strength"]) * (1.0 - k)))
	while wv.size() < 4:
		wv.append(Vector4(0, 0, 0, 0))
	post_mat.set_shader_parameter("waves", wv.slice(0, 4))
	post_mat.set_shader_parameter("screen_px", vp)
	aberr = maxf(0.0, aberr - delta * 9.0)
	post_mat.set_shader_parameter("aberration", aberr + run.hurt_screen_flash * 10.0)
	var hp_ratio: float = run.get_player_hp_ratio()
	var low := 0.0
	if hp_ratio <= R.LOW_HP_THRESHOLD:
		low = (0.55 + sin(anim_t * (12.0 if hp_ratio <= R.CRITICAL_HP_THRESHOLD else 7.0)) * 0.35)
	post_mat.set_shader_parameter("low_hp", maxf(low, run.hurt_screen_flash * 2.0))
	var tint := Vector4(0, 0, 0, 0)
	if run.blood_moon_active > 0.0:
		tint = Vector4(0.45, 0.0, 0.02, 0.18)
	elif run.overdrive_active > 0.0:
		tint = Vector4(1.0, 0.75, 0.2, 0.08 + run.overdrive_flash * 0.3)
	elif run.evolve_flash > 0.0:
		tint = Vector4(1.0, 0.85, 0.3, run.evolve_flash * 0.5)
	post_mat.set_shader_parameter("tint", tint)
	flash = maxf(0.0, flash - delta * 4.0)
	post_mat.set_shader_parameter("flash", flash)


func _view_rect() -> Rect2:
	var vp := get_viewport_rect().size / cam.zoom.x
	return Rect2(cam.position - vp / 2.0, vp)


# ── 규칙 사건 → 소리·연출 ───────────────────────────────────────────

func _wave(x: float, y: float, max_r: float, strength: float, life: float) -> void:
	waves.append({"x": x, "y": y, "max_r": max_r, "strength": strength, "life": life, "max_life": life})
	if waves.size() > 4:
		waves.pop_front()


func _consume_events() -> void:
	var evs: Array = run.events
	run.events = []
	var hits := 0
	for ev in evs:
		match String(ev["t"]):
			"hit":
				hits += 1
				if ev["crit"]:
					sfx.play("crit", 1.0, -6.0)
					_burst_bits(ev["x"], ev["y"], 3, Color(1.6, 0.9, 0.3), 180.0, 2.5)
			"kill":
				var sz: float = ev["size"]
				sfx.play("kill", clampf(1.3 - sz / 60.0, 0.6, 1.3), -3.0 if ev["elite"] else -7.0)
				var col: Color = DECAL_COLORS.get(String(ev["type"]), Color(0.55, 0.04, 0.04, 0.8))
				_decal(ev["x"], ev["y"], sz * 0.11 * (1.6 if ev["elite"] else 1.0), col)
				var ec: Color = ev["color"]
				_burst_bits(ev["x"], ev["y"], 4 + mini(int(sz / 4.0), 8), ec, 160.0 + sz * 4.0, 2.0 + sz * 0.12)
				if ev["elite"]:
					punch = maxf(punch, 0.5)
					_wave(ev["x"], ev["y"], 160.0, 14.0, 0.45)
				if ev["boss"]:
					punch = 1.0
					aberr = 14.0
					flash = 0.35
					_wave(ev["x"], ev["y"], 520.0, 30.0, 0.9)
					sfx.play("explosion", 0.6, 2.0)
			"explosion":
				var r: float = ev["r"]
				sfx.play("explosion", clampf(1.4 - r / 300.0, 0.6, 1.3), clampf(-14.0 + r / 20.0, -14.0, 0.0))
				if r >= 90.0:
					_wave(ev["x"], ev["y"], r * 1.4, clampf(r / 14.0, 6.0, 22.0), 0.4)
				if r >= 60.0:
					_decal(ev["x"], ev["y"], r / 70.0, Color(0.02, 0.02, 0.03, 0.55))
			"thunder":
				sfx.play("thunder", randf_range(0.9, 1.15), -4.0)
				_bolt(ev["x"], ev["y"], ev["evolved"])
				flash = maxf(flash, 0.12 if ev["evolved"] else 0.07)
			"slash":
				sfx.play("slash", 1.15 if ev["evolved"] else 1.0, -5.0)
				slashes.append({"x": ev["x"], "y": ev["y"], "dir": ev["dir"], "reach": ev["reach"], "height": ev["height"],
					"evolved": ev["evolved"], "life": 0.2, "max_life": 0.2})
			"dash":
				sfx.play("dash")
				aberr = maxf(aberr, 5.0)
				var n := 5
				for k in range(n):
					var f := float(k) / n
					ghosts.append({"x": lerpf(ev["x"], ev["ex"], f), "y": lerpf(ev["y"], ev["ey"], f), "life": 0.25 + f * 0.1, "flip": not face_right})
				if int(ev["hits"]) >= 5:
					punch = maxf(punch, 0.35)
			"levelup":
				sfx.play("levelup")
				_burst_bits(run.player.x, run.player.y, 18, Color(1.2, 1.0, 0.4), 260.0, 3.0)
			"evolve":
				sfx.play("evolve")
				aberr = 16.0
				punch = 1.0
				_wave(run.player.x, run.player.y, 420.0, 26.0, 0.8)
			"boss":
				sfx.play("boss")
				aberr = 10.0
			"bloodmoon":
				sfx.play("boss", 0.8)
			"goblin":
				sfx.play("goblin")
			"chest":
				sfx.play("chest")
			"powerup":
				sfx.play("loot", 1.2)
			"overdrive":
				sfx.play("overdrive")
				punch = 1.0
				aberr = 12.0
				_wave(ev["x"], ev["y"], float(ev["r"]) * 1.3, 28.0, 0.7)
			"loot":
				sfx.play("legendary" if ev["rarity"] == "legendary" or ev["rarity"] == "set" else "loot")
				if ev["rarity"] == "legendary":
					_wave(ev["x"], ev["y"], 220.0, 16.0, 0.6)
			"equip":
				sfx.play("equip")
				var it: Dictionary = ev["item"]
				if it["rarity"] == "legendary" or it["rarity"] == "set":
					sfx.play("legendary", 1.25, -4.0)
			"salvage":
				sfx.play("gem", 0.7, -6.0)
			"set":
				sfx.play("evolve", 1.2)
				aberr = 10.0
				_wave(run.player.x, run.player.y, 300.0, 20.0, 0.6)
			"gem":
				gem_streak = gem_streak + int(ev["n"]) if gem_streak_t > 0.0 else int(ev["n"])
				gem_streak_t = 0.4
				sfx.play("gem", 1.0 + minf(gem_streak, 30) * 0.035, -9.0)
			"hurt":
				sfx.play("hurt")
				aberr = maxf(aberr, 8.0)
			"fuse":
				sfx.play("goblin", 1.6, -10.0)
			"blink":
				sfx.play("freeze", 1.3, -10.0)
	if hits > 0:
		sfx.play("hit", randf_range(0.9, 1.15), -12.0 + minf(hits, 8) * 0.6)


func _decal(x: float, y: float, scale: float, col: Color) -> void:
	decals.append({"x": x, "y": y, "rot": randf() * TAU, "scale": clampf(scale, 0.3, 4.0), "color": col,
		"tex": randi() % maxi(1, splat_tex.size()), "life": 28.0, "max_life": 28.0})
	if decals.size() > 260:
		decals.pop_front()


func _burst_bits(x: float, y: float, n: int, col: Color, spd: float, size: float) -> void:
	for i in range(n):
		if bits.size() >= 360:
			return
		var a := randf() * TAU
		var s := spd * randf_range(0.4, 1.0)
		bits.append({"x": x, "y": y, "z": 0.0, "vx": cos(a) * s, "vy": sin(a) * s * 0.6, "vz": randf_range(120.0, 320.0),
			"life": randf_range(0.5, 0.9), "size": size * randf_range(0.6, 1.3), "color": col})


func _bolt(x: float, y: float, evolved: bool) -> void:
	var pts := PackedVector2Array()
	var top := Vector2(x + randf_range(-60.0, 60.0), y - 520.0)
	var segs := 9
	for i in range(segs + 1):
		var f := float(i) / segs
		var p := top.lerp(Vector2(x, y), f)
		if i > 0 and i < segs:
			p.x += randf_range(-28.0, 28.0)
		pts.append(p)
	bolts.append({"pts": pts, "life": 0.22, "max_life": 0.22, "evolved": evolved})


func _update_fx(delta: float) -> void:
	gem_streak_t = maxf(0.0, gem_streak_t - delta)
	var keep: Array = []
	for d in decals:
		d["life"] -= delta
		if d["life"] > 0.0:
			keep.append(d)
	decals = keep
	keep = []
	for b in bits:
		b["life"] -= delta
		if b["life"] <= 0.0:
			continue
		b["vz"] -= 900.0 * delta
		b["z"] += b["vz"] * delta
		if b["z"] < 0.0:
			b["z"] = 0.0
			b["vz"] *= -0.35
			b["vx"] *= 0.6
			b["vy"] *= 0.6
		b["x"] += b["vx"] * delta
		b["y"] += b["vy"] * delta
		keep.append(b)
	bits = keep
	for arr in [bolts, slashes, ghosts, waves]:
		var k2: Array = []
		for it in arr:
			it["life"] -= delta
			if it["life"] > 0.0:
				k2.append(it)
		arr.clear()
		arr.append_array(k2)


# ── 그리기 ─────────────────────────────────────────────────────────

static func _a(c: Color, alpha: float) -> Color:
	return Color(c.r, c.g, c.b, c.a * clampf(alpha, 0.0, 1.0))


## HDR 색 — 1 보다 밝게 해서 글로우가 번지게
static func _hdr(c: Color, k: float, alpha: float = 1.0) -> Color:
	return Color(c.r * k, c.g * k, c.b * k, clampf(alpha, 0.0, 1.0))


func draw_layer(ci: CanvasItem, kind: String) -> void:
	if kind == "hud":
		if run != null:
			_draw_hud(ci)
		return
	if run == null:
		return
	var view := _view_rect().grow(60.0)
	match kind:
		"decals":
			_draw_decals(ci, view)
		"bodies":
			_draw_bodies(ci, view)
		"silhouette":
			_draw_silhouettes(ci, view)
		"fx":
			_draw_fx(ci, view)
		"text":
			_draw_texts(ci, view)


func _spr(ci: CanvasItem, name: String, pos: Vector2, size: float, rot: float = 0.0, flip: bool = false, mod: Color = Color.WHITE, squash: Vector2 = Vector2.ONE) -> bool:
	var t: Texture2D = tex.get(name)
	if t == null:
		return false
	var ts := t.get_size()
	var w := ts * (size / maxf(ts.x, ts.y))
	ci.draw_set_transform(pos, rot, Vector2(squash.x * (-1.0 if flip else 1.0), squash.y))
	ci.draw_texture_rect(t, Rect2(-w / 2.0, w), false, mod)
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	return true


func _glow(ci: CanvasItem, pos: Vector2, radius: float, col: Color) -> void:
	ci.draw_texture_rect(soft_tex, Rect2(pos - Vector2(radius, radius), Vector2(radius, radius) * 2.0), false, col)


func _ring_arc(ci: CanvasItem, pos: Vector2, r: float, color: Color, width: float) -> void:
	ci.draw_arc(pos, maxf(r, 0.5), 0.0, TAU, 40, color, width)


func _shadow(ci: CanvasItem, pos: Vector2, r: float) -> void:
	ci.draw_set_transform(pos, 0.0, Vector2(1.0, 0.38))
	ci.draw_circle(Vector2.ZERO, r, Color(0, 0, 0, 0.35))
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 가운데 정렬 글자. outline > 0 이면 검은 테두리를 그린다.
## ⚠ draw_string_outline 은 이 프로젝트의 Mobile 렌더러에서 테두리를 그리지 않았다 (SystemFont·FontFile 모두,
##   Godot 4.4.1 소프트웨어 Vulkan 에서 확인). 그래서 어디서나 보이는 4방향 그림자로 테두리를 흉내 낸다.
func _text_c(ci: CanvasItem, pos: Vector2, text: String, size: int, color: Color, outline: int = 0) -> void:
	_text(ci, pos - Vector2(400, 0), text, size, color, outline, HORIZONTAL_ALIGNMENT_CENTER, 800.0)


func _text(ci: CanvasItem, pos: Vector2, text: String, size: int, color: Color, outline: int = 0, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	if outline > 0:
		var o := maxf(1.0, outline * 0.45)
		var sc := Color(0, 0, 0, color.a * 0.8)
		for off in [Vector2(-o, -o), Vector2(o, -o), Vector2(-o, o), Vector2(o, o)]:
			ci.draw_string(font, pos + off, text, align, width, size, sc)
	ci.draw_string(font, pos, text, align, width, size, color)


func _rot_poly(center: Vector2, angle: float, pts: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for pt in pts:
		var v: Vector2 = pt
		out.append(center + v.rotated(angle))
	return out


func _enemy_sprite(e) -> String:
	if e.is_boss:
		return "boss"
	if e.goblin:
		return "goblin"
	return String(C.ENEMY_TYPES[e.type]["sprite"])


func _enemy_draw_size(e) -> float:
	if e.is_boss:
		return e.size * 3.6
	return e.size * 3.6


func _draw_decals(ci: CanvasItem, view: Rect2) -> void:
	for d in decals:
		var p := Vector2(d["x"], d["y"])
		if not view.has_point(p) or splat_tex.is_empty():
			continue
		var t: Texture2D = splat_tex[int(d["tex"])]
		var s: float = d["scale"] * 64.0
		var c: Color = d["color"]
		ci.draw_set_transform(p, d["rot"], Vector2.ONE)
		ci.draw_texture_rect(t, Rect2(-s / 2.0, -s / 2.0, s, s), false, Color(c.r * 0.7, c.g * 0.7, c.b * 0.7, c.a * 0.8 * minf(1.0, d["life"] / 4.0)))
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	# 예고 장판 — 정예 폭발·골렘 내려찍기 (점점 차오르다 터진다)
	for hz in run.hazards:
		var p := Vector2(hz["x"], hz["y"])
		var k: float = 1.0 - hz["t"] / hz["max_t"]
		var c := Color(String(hz["color"]))
		ci.draw_circle(p, hz["r"], _a(Color(0.8, 0.1, 0.05), 0.12 + 0.18 * k))
		ci.draw_circle(p, hz["r"] * k, _a(c, 0.28))
		_ring_arc(ci, p, hz["r"], _a(c, 0.6 + 0.4 * sin(anim_t * 30.0)), 3.0)
	# 돌격 예고선
	for e in run.enemies:
		if e.type == "charger" and e.charge_state == 1:
			var a: Vector2 = Vector2(e.x, e.y)
			var dir: Vector2 = e.charge_dir
			ci.draw_line(a, a + dir * 380.0, Color(0.9, 0.1, 0.1, 0.35), e.size * 1.6)
			ci.draw_line(a, a + dir * 380.0, Color(1, 0.3, 0.2, 0.8), 2.0)
	# 다시 일어날 해골 — 뼈 무더기
	for rv in run.revives:
		var p := Vector2(rv["x"], rv["y"])
		for k in range(5):
			var a := k * 1.3 + anim_t * 0.0
			ci.draw_circle(p + Vector2(cos(a), sin(a) * 0.5) * 7.0, 3.5, Color(0.86, 0.83, 0.73, 0.9))
		_ring_arc(ci, p, 10.0 + (2.0 - float(rv["t"])) * 4.0, Color(0.9, 0.9, 0.8, 0.4), 1.5)


func _draw_bodies(ci: CanvasItem, view: Rect2) -> void:
	var inv: float = 1.0 / run.view_scale
	# 보석
	for g in run.xp_gems:
		var p := Vector2(g["x"], g["y"])
		if not view.has_point(p):
			continue
		var v: float = g["val"]
		var col := Color("#ffd700") if v >= 81 else (Color("#ff9f43") if v >= 31 else (Color("#5ef1ff") if v >= 15 else (Color("#7bed9f") if v >= 5 else Color("#a4b0be"))))
		var s := (20.0 if v >= 81 else (16.0 if v >= 31 else (14.0 if v >= 15 else (12.0 if v >= 5 else 9.0)))) * inv
		if not _spr(ci, "gem", p + Vector2(0, sin(anim_t * 6.0 + p.x) * 1.5), s, 0.0, false, col):
			ci.draw_circle(p, s * 0.35, col)
	# 상자·장비·파워업
	for box in run.item_boxes:
		var p := Vector2(box["x"], box["y"] + sin(box["pulse_t"] * 3.0) * 2.0)
		_shadow(ci, p + Vector2(0, 12), 14.0)
		if not _spr(ci, "chest", p, 36.0 * inv):
			ci.draw_rect(Rect2(p - Vector2(12, 12), Vector2(24, 24)), Color("#f1c40f"))
	for gd in run.gear_drops:
		var it: Dictionary = gd["item"]
		var p := Vector2(gd["x"], gd["y"] + sin(gd["pulse_t"] * 4.0) * 3.0 - 4.0)
		var rc := Color(String(C.RARITIES[it["rarity"]]["color"]))
		_shadow(ci, Vector2(gd["x"], gd["y"] + 10.0), 12.0)
		if not _spr(ci, "item_" + String(it["slot"]), p, 30.0 * inv, sin(gd["pulse_t"] * 2.0) * 0.15, false, rc):
			ci.draw_circle(p, 10.0, rc)
	for pu in run.powerups:
		var pc := Color(String(pu["def"]["color"]))
		var p := Vector2(pu["x"], pu["y"])
		ci.draw_circle(p, (12.0 + sin(pu["pulse_t"] * 6.0) * 1.5) * inv, _a(pc, 0.9))
		_ring_arc(ci, p, 14.0 * inv, Color(1, 1, 1, 0.7), 2.0)
	# 적 — 화면 안의 것만, 아래쪽이 앞에 오도록 정렬
	var vis: Array = []
	for e in run.enemies:
		if view.has_point(Vector2(e.x, e.y)):
			vis.append(e)
	vis.sort_custom(func(a, b): return a.y < b.y)
	var px: float = run.player.x
	for e in vis:
		var pos := Vector2(e.x, e.y)
		var ds := _enemy_draw_size(e)
		_shadow(ci, pos + Vector2(0, ds * 0.36), ds * 0.32)
		var alpha := 1.0
		var squash := Vector2.ONE
		if e.spawn_t > 0.0:
			var k: float = e.spawn_t / (0.5 if e.is_boss else 0.35)
			alpha = 1.0 - k
			squash = Vector2(1.0 - k * 0.4, 1.0 + k * 0.6)
		if e.hurt_flash > 0.0:
			squash *= Vector2(1.18, 0.86)
		if e.ethereal:
			alpha *= 0.35
		var bob := sin(anim_t * (14.0 if e.type == "bat" else 7.0) + e.id) * (3.0 if e.type == "bat" else 1.5)
		if e.type == "golem" and e.slam_t >= 0.0:
			pos += Vector2(randf_range(-2.0, 2.0), 0.0)
			squash *= Vector2(1.08, 0.9)
		var mod := Color(1, 1, 1, alpha)
		if e.blood_moon:
			mod = Color(1.3, 0.55, 0.55, alpha)
		if not _spr(ci, _enemy_sprite(e), pos + Vector2(0, bob), ds, 0.0, px < e.x, mod, squash):
			ci.draw_circle(pos, e.size, _a(e.color, alpha))
		if e.shield > 0.0 and e.max_shield > 0.0:
			ci.draw_arc(pos, ds * 0.55, -PI / 2.0, -PI / 2.0 + TAU * e.shield / e.max_shield, 32, Color("#74b9ff"), 3.0)
		if not e.is_boss and (e.elite or e.tier >= 2 or e.goblin) and e.hp < e.max_hp:
			var w := ds * 0.7
			var top := pos + Vector2(-w / 2.0, -ds * 0.6)
			ci.draw_rect(Rect2(top, Vector2(w, 4.0)), Color(0, 0, 0, 0.7))
			ci.draw_rect(Rect2(top, Vector2(w * clampf(e.hp / e.max_hp, 0.0, 1.0), 4.0)), Color("#e74c3c"))
	# 튀는 조각
	for b in bits:
		var p := Vector2(b["x"], b["y"] - b["z"])
		var c: Color = b["color"]
		ci.draw_circle(p, b["size"], Color(c.r, c.g, c.b, minf(1.0, b["life"] * 2.0)))
	# 적 투사체 (빛은 fx 층)
	for ep in run.enemy_projectiles:
		ci.draw_circle(Vector2(ep["x"], ep["y"]), ep["r"] * 0.6, Color("#ffe0c0"))
	# 단단한 투사체
	for p in run.projectiles:
		var pos := Vector2(p.x, p.y)
		match p.type:
			"axe":
				if not _spr(ci, "axe", pos, 34.0 if p.evolved else 30.0, p.spin, p.vx < 0.0, Color(1.2, 0.9, 1.4) if p.evolved else Color.WHITE):
					ci.draw_circle(pos, p.r, Color("#bdc3c7"))
			"boomerang":
				var ang: float = atan2(p.vy, p.vx) + anim_t * 18.0
				var pts: Array = []
				for i in range(12):
					var a := i / 12.0 * TAU
					pts.append(Vector2(cos(a) * 11.0, sin(a) * 4.5))
				ci.draw_colored_polygon(_rot_poly(pos, ang, pts), Color("#2ecc71"))
			"missile":
				ci.draw_colored_polygon(_rot_poly(pos, atan2(p.vy, p.vx), [Vector2(10, 0), Vector2(-7, -5), Vector2(-7, 5)]), Color("#ff9ff3") if p.evolved else Color("#e056fd"))
			"arrow":
				var dir := Vector2(p.vx, p.vy).normalized()
				ci.draw_line(pos - dir * 14.0, pos + dir * 6.0, Color("#f8c291"), 3.0)
			"blackhole":
				ci.draw_circle(pos, p.r, Color("#12051c"))
	# 플레이어 그림자 (몸은 빛에 묻히지 않도록 글자 층에서 그린다)
	var pl = run.player
	_shadow(ci, Vector2(pl.x, pl.y) + Vector2(0, 16), 13.0)


func _draw_player(ci: CanvasItem) -> void:
	var pl = run.player
	var ppos := Vector2(pl.x, pl.y)
	var moving: bool = _move_dir() != Vector2.ZERO
	var bob := sin(anim_t * 14.0) * 2.0 if moving else sin(anim_t * 3.0) * 0.8
	var alpha := (0.55 + sin(anim_t * 30.0) * 0.3) if pl.invincible > 0.0 and pl.invincible < 5.0 else 1.0
	if not _spr(ci, "player", ppos + Vector2(0, bob - 4.0), 50.0, 0.0, not face_right, Color(1, 1, 1, alpha), Vector2(1.0, 1.0 + (0.05 if moving else 0.0))):
		ci.draw_circle(ppos, 14.0, Color("#d7a3f5"))


func _draw_silhouettes(ci: CanvasItem, view: Rect2) -> void:
	var px: float = run.player.x
	for e in run.enemies:
		var pos := Vector2(e.x, e.y)
		if not view.has_point(pos):
			continue
		var col := Color(0, 0, 0, 0)
		if e.hurt_flash > 0.0:
			col = Color(1, 1, 1, 0.85)
		elif e.frozen > 0.0:
			col = Color(0.6, 0.9, 1.0, 0.55)
		elif e.stun > 0.0:
			col = Color(1.0, 0.95, 0.4, 0.35 + 0.25 * sin(anim_t * 40.0))
		elif e.fuse >= 0.0:
			col = Color(1.0, 0.1, 0.05, 0.6 * (0.5 + 0.5 * sin(anim_t * 45.0)))
		elif e.charge_state == 1:
			col = Color(1.0, 0.2, 0.1, 0.4)
		if col.a <= 0.0:
			continue
		var ds := _enemy_draw_size(e)
		_spr(ci, _enemy_sprite(e), pos, ds, 0.0, px < e.x, col)
	for g in ghosts:
		_spr(ci, "player", Vector2(g["x"], g["y"] - 4.0), 50.0, 0.0, g["flip"], Color(0.75, 0.45, 1.0, g["life"] * 1.6))
	var pl = run.player
	if pl.invincible > 0.0 and pl.invincible < 5.0 and int(anim_t * 20.0) % 2 == 0:
		_spr(ci, "player", Vector2(pl.x, pl.y - 4.0), 50.0, 0.0, not face_right, Color(1, 1, 1, 0.5))


func _draw_fx(ci: CanvasItem, view: Rect2) -> void:
	var t: float = run.elapsed
	var pl = run.player
	var ppos := Vector2(pl.x, pl.y)
	# 장판·오라
	for tf in run.toxic_fields:
		var c := Color("#6ab04c") if tf["evolved"] else Color("#badc58")
		_glow(ci, Vector2(tf["x"], tf["y"]), tf["range"] * 1.15, _hdr(c, 0.9, 0.35 * minf(1.0, tf["life"] / tf["max_life"] * 2.0)))
	for sf in run.spectral_fields:
		_glow(ci, Vector2(sf["x"], sf["y"]), sf["range"] * 1.2, _hdr(Color("#9b59b6"), 1.5, 0.5 * sf["life"] / sf["max_life"]))
	for ft in run.fire_trails:
		var k: float = ft["life"] / ft["max_life"]
		_glow(ci, Vector2(ft["x"], ft["y"]), ft["r"] * (1.3 + sin(anim_t * 20.0 + ft["x"]) * 0.1), _hdr(Color(1.0, 0.45, 0.1), 2.0, 0.6 * k))
	for af in run.dash_afterimages:
		_glow(ci, Vector2(af["x"], af["y"]), af["range"], _hdr(Color("#f8c8ff"), 1.4, 0.4 * af["life"] / af["max_life"]))
	if run.set_count("frost") >= 4:
		_ring_arc(ci, ppos, 140.0 * pl.range_bonus, _hdr(Color("#a8e6ff"), 1.4, 0.35), 2.0)
		_glow(ci, ppos, 150.0 * pl.range_bonus, Color(0.3, 0.6, 1.0, 0.08))
	# 정예 오라
	for e in run.enemies:
		if not e.elite and not e.is_boss and not e.goblin:
			continue
		var pos := Vector2(e.x, e.y)
		if not view.has_point(pos):
			continue
		var c: Color = Color("#f1c40f") if e.goblin else (Color("#e74c3c") if e.is_boss else e.elite_hue)
		_glow(ci, pos, _enemy_draw_size(e) * (0.75 + sin(anim_t * 5.0 + e.id) * 0.08), _hdr(c, 1.1, 0.35))
	# 보석 반짝임 — 큰 것만
	for g in run.xp_gems:
		if float(g["val"]) >= 15.0 and view.has_point(Vector2(g["x"], g["y"])):
			_glow(ci, Vector2(g["x"], g["y"]), 14.0, Color(0.6, 1.0, 1.4, 0.35))
	# 장비 빛기둥 — 희귀 이상
	for gd in run.gear_drops:
		var it: Dictionary = gd["item"]
		var ri := C.RARITY_ORDER.find(it["rarity"])
		var rc := Color(String(C.RARITIES[it["rarity"]]["color"]))
		_glow(ci, Vector2(gd["x"], gd["y"]), 26.0, _hdr(rc, 1.6, 0.6))
		if ri >= 2:
			var h := 140.0 + ri * 30.0
			var pulse := 0.7 + 0.3 * sin(gd["pulse_t"] * 5.0)
			ci.draw_texture_rect(soft_tex, Rect2(gd["x"] - 9.0, gd["y"] - h, 18.0, h + 10.0), false, _hdr(rc, 2.0, 0.55 * pulse))
	for box in run.item_boxes:
		_glow(ci, Vector2(box["x"], box["y"]), 30.0, _hdr(Color("#f1c40f"), 1.4, 0.45 + 0.2 * sin(box["pulse_t"] * 4.0)))
	for pu in run.powerups:
		_glow(ci, Vector2(pu["x"], pu["y"]), 28.0, _hdr(Color(String(pu["def"]["color"])), 1.6, 0.6))
	# 적 투사체
	for ep in run.enemy_projectiles:
		_glow(ci, Vector2(ep["x"], ep["y"]), ep["r"] * 1.9, _hdr(Color("#ff6b35"), 1.4, 0.55))
	# 플레이어 투사체
	for p in run.projectiles:
		var pos := Vector2(p.x, p.y)
		match p.type:
			"orb":
				_glow(ci, pos, p.r * 3.0, _hdr(Color("#3498db"), 2.2, 0.9))
				ci.draw_circle(pos, p.r * 0.6, _hdr(Color("#bfe6ff"), 1.8))
			"blackhole":
				var capture: float = p.r + 78.0
				_glow(ci, pos, capture, Color(0.5, 0.15, 0.8, 0.35))
				for arm in range(2):
					var pts := PackedVector2Array()
					for i in range(11):
						var k := i / 10.0
						var rr: float = p.r + k * (capture - p.r)
						var aa: float = t * 3.0 + arm * PI + k * 5.0
						pts.append(pos + Vector2(cos(aa), sin(aa)) * rr)
					ci.draw_polyline(pts, _hdr(Color("#b388ff"), 1.8, 0.7), 2.5)
			"arrow":
				var dir := Vector2(p.vx, p.vy).normalized()
				ci.draw_line(pos - dir * 26.0, pos, _hdr(Color("#f39c12"), 2.0, 0.7), 4.0)
			"laser", "deathray":
				var evolved: bool = p.type == "deathray"
				var end: Vector2 = pos + Vector2(cos(p.angle), sin(p.angle)) * p.length
				var c := Color("#ff4757") if evolved else Color("#ffd32a")
				var a: float = minf(1.0, p.life / 0.3)
				ci.draw_line(pos, end, _hdr(c, 1.5, a * 0.35), 20.0 if evolved else 13.0)
				ci.draw_line(pos, end, _hdr(c, 2.5, a), 7.0 if evolved else 4.0)
				ci.draw_line(pos, end, Color(3.0, 3.0, 3.0, a), 2.0)
			"explosion":
				var c := Color("#ffd32a") if p.evolved else Color("#ff6348")
				var a: float = p.life / 0.4
				_glow(ci, pos, maxf(p.max_r, 8.0) * 0.9, _hdr(c, 1.3, a * 0.4))
				_ring_arc(ci, pos, p.r, _hdr(c, 2.0, a), 3.0)
			"boomerang":
				_glow(ci, pos, 16.0, _hdr(Color("#2ecc71"), 1.8, 0.6))
			"arc":
				var a: float = p.life / 0.22
				var target := Vector2(p.tx, p.ty)
				var pts := PackedVector2Array([pos])
				for i in range(1, 5):
					pts.append(pos.lerp(target, i / 5.0) + Vector2(randf_range(-9.0, 9.0), randf_range(-9.0, 9.0)))
				pts.append(target)
				ci.draw_polyline(pts, _hdr(Color("#a29bfe"), 2.5, a), 2.5)
				_glow(ci, target, 16.0, _hdr(Color("#a29bfe"), 2.0, a * 0.8))
			"missile":
				_glow(ci, pos, 14.0, _hdr(Color("#ff9ff3"), 2.2, 0.8))
			"meteor":
				var c := Color("#ff7675") if p.evolved else Color("#ff9f43")
				if p.delay > 0.0:
					_ring_arc(ci, Vector2(p.tx, p.ty), 14.0 + sin(t * 12.0) * 4.0, _hdr(c, 1.5, 0.6), 2.0)
				else:
					ci.draw_colored_polygon(PackedVector2Array([pos + Vector2(-p.r, 0), pos + Vector2(0, -p.r * 4.0), pos + Vector2(p.r, 0)]), _hdr(c, 1.5, 0.5))
					_glow(ci, pos, p.r * 2.6, _hdr(c, 2.4, 1.0))
			"axe":
				_glow(ci, pos, 16.0, _hdr(Color("#d7a3f5") if p.evolved else Color("#dfe6e9"), 1.3, 0.25))
	# 충격파 고리
	for rg in run.rings:
		var k: float = 1.0 - rg["life"] / rg["max_life"]
		var rr: float = rg["r"] + (rg["max_r"] - rg["r"]) * k
		_ring_arc(ci, Vector2(rg["x"], rg["y"]), rr, _hdr(rg["color"], 1.8, (1.0 - k) * 0.9), maxf(1.0, 4.0 - k * 3.0))
	# 파티클 (규칙 쪽)
	for pt in run.particles:
		var pa: float = pt["life"] / pt["max_life"]
		_glow(ci, Vector2(pt["x"], pt["y"]), maxf(1.5, pt["size"] * 0.9 * pa), _hdr(pt["color"], 1.3, pa * 0.8))
	# 대쉬 베기 — 칼자국을 경로를 따라 늘인다
	var de = run.dash_effect
	if de != null:
		var k: float = de["life"] / de["max_life"]
		var a := Vector2(de["x"], de["y"])
		var b := Vector2(de["end_x"], de["end_y"])
		var mid := (a + b) / 2.0
		var len := a.distance_to(b) + float(de["range"]) * 0.8
		var dc := (Color("#74b9ff") if de["chain_idx"] == 1 else Color.WHITE) if de["is_chain"] else Color("#f8c8ff")
		if tex.has("slash"):
			var tt: Texture2D = tex["slash"]
			ci.draw_set_transform(mid, de["angle"], Vector2.ONE)
			ci.draw_texture_rect(tt, Rect2(-len / 2.0, -float(de["width"]) * 1.2, len, float(de["width"]) * 2.4), false, _hdr(dc, 2.2, k))
			ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		else:
			ci.draw_line(a, b, _hdr(dc, 2.0, k), de["width"])
	# 채찍
	for sl in slashes:
		var k: float = sl["life"] / sl["max_life"]
		var dirv: float = sl["dir"]
		var reach: float = sl["reach"]
		var c := Color(1.0, 0.25, 0.3) if sl["evolved"] else Color(1.0, 0.92, 0.7)
		var center := Vector2(run.player.x + dirv * reach * 0.5, run.player.y)
		if tex.has("slash"):
			var tt: Texture2D = tex["slash"]
			ci.draw_set_transform(center, 0.0, Vector2(dirv, 1.0))
			ci.draw_texture_rect(tt, Rect2(-reach * 0.55, -float(sl["height"]) * 0.9, reach * 1.1, float(sl["height"]) * 1.8), false, _hdr(c, 2.4, k))
			ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		else:
			ci.draw_rect(Rect2(center - Vector2(reach * 0.5, float(sl["height"]) * 0.5), Vector2(reach, sl["height"])), _hdr(c, 1.5, k * 0.5))
	# 낙뢰
	for bo in bolts:
		var k: float = bo["life"] / bo["max_life"]
		var pts: PackedVector2Array = bo["pts"]
		var c := Color(1.0, 0.95, 0.5) if bo["evolved"] else Color(0.65, 0.85, 1.0)
		ci.draw_polyline(pts, _hdr(c, 1.5, k * 0.5), 9.0)
		ci.draw_polyline(pts, _hdr(c, 3.0, k), 3.0)
		_glow(ci, pts[pts.size() - 1], 70.0 if bo["evolved"] else 46.0, _hdr(c, 2.5, k))
	# 오버드라이브 오라
	if run.overdrive_active > 0.0:
		_glow(ci, ppos, 46.0 + sin(anim_t * 10.0) * 4.0, _hdr(Color("#f1c40f"), 1.6, 0.5))
	if run.combo_count >= 10 and run.combo_timer > 0.0:
		var aura := Color("#e74c3c") if run.combo_count >= 50 else (Color("#f39c12") if run.combo_count >= 25 else Color("#f1c40f"))
		_ring_arc(ci, ppos, 22.0 + sin(anim_t * 16.0) * 3.0 + minf(run.combo_count, 80) * 0.2, _hdr(aura, 1.6, 0.55), 3.0)


func _draw_texts(ci: CanvasItem, view: Rect2) -> void:
	_draw_player(ci)
	var dn_size := [13, 16, 22]
	var dn_color := [Color("#ffffff"), Color("#ffe27a"), Color("#ff8c1a")]
	for dn in run.damage_numbers:
		var p := Vector2(dn["x"], dn["y"])
		if not view.has_point(p):
			continue
		var k: float = dn["life"] / dn["max_life"]
		var tier: int = dn["tier"]
		var pop := 1.0 + (k - 0.8) / 0.2 * 0.6 if k > 0.8 else 1.0
		var col: Color = Color("#74b9ff") if tier < 0 else dn_color[tier]
		var size: int = roundi((12 if tier < 0 else dn_size[tier]) * pop)
		_text_c(ci, p, ("%d!" % dn["val"]) if tier == 2 else str(dn["val"]), size, _a(col, minf(1.0, k * 1.7)), 3)
	for ft in run.float_texts:
		if ft["screen_space"]:
			continue
		_text_c(ci, Vector2(ft["x"], ft["y"]), ft["text"], ft["size"], _a(ft["color"], minf(ft["life"] / ft["max_life"] * 2.0, 1.0)), 3)
	# 정예 특성 아이콘
	for e in run.enemies:
		if e.affixes.is_empty() or not view.has_point(Vector2(e.x, e.y)):
			continue
		var icons := ""
		for a in e.affixes:
			icons += String(C.ELITE_AFFIXES[a]["icon"])
		_text_c(ci, Vector2(e.x, e.y - _enemy_draw_size(e) * 0.62 - 6.0), icons, 13, Color.WHITE, 2)
	# 장비 이름 — 희귀 이상
	for gd in run.gear_drops:
		var it: Dictionary = gd["item"]
		if C.RARITY_ORDER.find(it["rarity"]) >= 2:
			_text_c(ci, Vector2(gd["x"], gd["y"] - 26.0), it["name"], 12, Color(String(C.RARITIES[it["rarity"]]["color"])), 3)
	for pu in run.powerups:
		_text_c(ci, Vector2(pu["x"], pu["y"] + 6.0), pu["def"]["icon"], 15, Color.WHITE)


func _draw_hud(ci: CanvasItem) -> void:
	var vp := get_viewport_rect().size
	var p = run.player
	var hp_ratio: float = run.get_player_hp_ratio()
	# 위쪽 판
	ci.draw_rect(Rect2(0, 0, vp.x, 66), Color(0, 0, 0, 0.35))
	var bar_w := vp.x - 24.0
	ci.draw_rect(Rect2(12, 34, bar_w, 13), Color(0.1, 0.02, 0.03, 0.85))
	ci.draw_rect(Rect2(12, 34, bar_w * hp_ratio, 13), Color("#e74c3c") if hp_ratio <= R.LOW_HP_THRESHOLD else Color("#c0392b").lerp(Color("#ff6b6b"), hp_ratio))
	ci.draw_rect(Rect2(12, 34, bar_w * hp_ratio, 4), Color(1, 1, 1, 0.18))
	ci.draw_string(font, Vector2(12, 46), "❤ %d/%d" % [maxi(ceili(p.hp), 0), roundi(p.max_hp)], HORIZONTAL_ALIGNMENT_RIGHT, bar_w - 4.0, 11, Color.WHITE)
	var need: int = R.xp_needed(p.level)
	ci.draw_rect(Rect2(12, 51, bar_w, 8), Color(0.02, 0.05, 0.1, 0.85))
	ci.draw_rect(Rect2(12, 51, bar_w * clampf(p.xp / need, 0.0, 1.0), 8), _hdr(Color("#48dbfb"), 1.4))
	_text(ci, Vector2(12, 25), "Lv.%d" % p.level, 20, Color("#ffe27a"), 4, HORIZONTAL_ALIGNMENT_LEFT, -1)
	_text_c(ci, Vector2(vp.x / 2.0, 25), R.fmt_time(run.elapsed) + ("  🌀" if run.infinite_mode else ""), 20, Color.WHITE, 4)
	_text(ci, Vector2(vp.x - 12 - 160, 25), "💀 %d   🎲 %d" % [run.kills, p.rerolls], 16, Color.WHITE, 4, HORIZONTAL_ALIGNMENT_RIGHT, 160)
	# 장비 칸
	var sx := 12.0
	for slot in C.GEAR_SLOTS:
		var it = p.equip[slot]
		var r := Rect2(sx, 72, 30, 30)
		ci.draw_rect(r, Color(0, 0, 0, 0.45))
		if it != null:
			var rc := Color(String(C.RARITIES[it["rarity"]]["color"]))
			ci.draw_rect(r, rc, false, 2.0)
			if not _spr(ci, "item_" + slot, r.get_center(), 26.0, 0.0, false, rc):
				ci.draw_circle(r.get_center(), 8.0, rc)
		else:
			ci.draw_rect(r, Color(1, 1, 1, 0.15), false, 1.0)
		sx += 34.0
	var sy := 86.0
	for sid in C.SET_ORDER:
		var n: int = run.set_count(sid)
		if n >= 2:
			var sd: Dictionary = C.SETS[sid]
			_text(ci, Vector2(sx + 6.0, sy + 6.0), "%s%d" % [sd["icon"], n], 13, Color(String(sd["color"])), 3)
			sx += 34.0
	# 콤보
	if run.combo_count >= 5 and run.combo_timer > 0.0:
		var cs := 22 + mini(run.combo_count / 10, 14)
		var cc := Color("#e74c3c") if run.combo_count >= 50 else (Color("#f39c12") if run.combo_count >= 25 else Color("#f1c40f"))
		_text(ci, Vector2(vp.x - 172, 100), "%d COMBO" % run.combo_count, cs, cc, 5, HORIZONTAL_ALIGNMENT_RIGHT, 160)
		ci.draw_rect(Rect2(vp.x - 112, 106, 100.0 * clampf(run.combo_timer / 1.5, 0.0, 1.0), 3), cc)
	if run.blood_moon_active > 0.0:
		_text_c(ci, Vector2(vp.x / 2.0, 132), "🌑 혈월 %ds — 적 대폭 강화" % ceili(run.blood_moon_active), 15, Color("#ff6b6b"), 3)
	# 보스 체력바
	for e in run.enemies:
		if e.is_boss:
			var bw := vp.x * 0.72
			var bx := (vp.x - bw) / 2.0
			ci.draw_rect(Rect2(bx - 2, 146, bw + 4, 14), Color(0, 0, 0, 0.75))
			ci.draw_rect(Rect2(bx, 148, bw * clampf(e.hp / e.max_hp, 0.0, 1.0), 10), Color("#e74c3c") if e.boss_phase == 1 else Color("#f1c40f"))
			_text_c(ci, Vector2(vp.x / 2.0, 142), "👑 마왕" + (" — 격노" if e.boss_phase == 1 else ""), 14, Color.WHITE, 3)
			break
	if run.boss_warning > 0.0:
		_text_c(ci, Vector2(vp.x / 2.0, vp.y * 0.3), "⚠ BOSS ⚠", 34, _a(Color("#ff4757"), 0.5 + sin(run.elapsed * 14.0) * 0.5), 5)
	_draw_goblin_arrow(ci, vp)
	# 화면 공간 알림 텍스트 — 가운데에 쌓인다
	var fty := vp.y * 0.36
	for ft in run.float_texts:
		if not ft["screen_space"]:
			continue
		var k: float = ft["life"] / ft["max_life"]
		var pop := 1.0 + maxf(0.0, (k - 0.85) / 0.15) * 0.35
		_text_c(ci, Vector2(vp.x / 2.0, fty), ft["text"], roundi(float(ft["size"]) * pop), _a(ft["color"], minf(k * 2.0, 1.0)), 4)
		fty += float(ft["size"]) + 10.0
	# 대쉬 쿨다운 (왼쪽 아래)
	var dash_c := Vector2(40, vp.y - WEAPON_BAR_H - 40.0)
	ci.draw_circle(dash_c, 22.0, Color(0, 0, 0, 0.5))
	var dash_cd_max: float = R.DASH_COOLDOWN * (0.6 if run.has_legendary("shadow") else 1.0)
	var dash_k: float = 1.0 - clampf(run.dash_cd / dash_cd_max, 0.0, 1.0)
	ci.draw_arc(dash_c, 22.0, -PI / 2.0, -PI / 2.0 + TAU * dash_k, 32, Color("#74b9ff") if run.dash_chain_window > 0.0 else Color("#f8c8ff"), 3.0)
	_text_c(ci, dash_c + Vector2(0, 5), "💨", 15, Color.WHITE)
	# 오버드라이브 버튼 (오른쪽 아래)
	var od := _od_center()
	var active: bool = run.overdrive_active > 0.0
	var od_ready: bool = run.overdrive_charge >= 100.0 and not active
	ci.draw_circle(od, OD_RADIUS, Color(0.95, 0.77, 0.06, 0.6 + 0.3 * sin(anim_t * 8.0)) if od_ready else Color(0, 0, 0, 0.5))
	ci.draw_arc(od, OD_RADIUS, -PI / 2.0, -PI / 2.0 + TAU * run.overdrive_charge / 100.0, 40, Color("#f1c40f"), 3.0)
	var od_label := "⚡" if active else ("OD!" if od_ready else "%d%%" % floori(run.overdrive_charge))
	_text_c(ci, od + Vector2(0, 6), od_label, 16, Color.BLACK if od_ready else Color.WHITE)
	if joy_active:
		ci.draw_circle(joy_center, JOY_R, Color(1, 1, 1, 0.12))
		_ring_arc(ci, joy_center, JOY_R, Color(1, 1, 1, 0.35), 2.0)
		ci.draw_circle(joy_center + joy_vec * JOY_R, 18.0, Color(1, 1, 1, 0.45))


## 보물 고블린이 화면 밖(여백 56px 안쪽 기준)이면 화면 가장자리 타원 위에 방향 화살표 + 거리·남은 시간
func _draw_goblin_arrow(ci: CanvasItem, vp: Vector2) -> void:
	var goblin = null
	for e in run.enemies:
		if e.goblin:
			goblin = e
			break
	if goblin == null:
		return
	var dx: float = goblin.x - run.player.x
	var dy: float = goblin.y - run.player.y
	var ang := atan2(dy, dx)
	var center := vp / 2.0
	var margin := 56.0
	var gs: Vector2 = center + Vector2(dx, dy) * cam.zoom.x
	if gs.x > margin and gs.x < vp.x - margin and gs.y > margin and gs.y < vp.y - margin:
		return
	var rx := vp.x / 2.0 - margin
	var ry := vp.y / 2.0 - margin
	var tip := center + Vector2(cos(ang) * rx, sin(ang) * ry)
	var pulse: float = 0.85 + sin(run.elapsed * 8.0) * 0.15
	ci.draw_colored_polygon(_rot_poly(tip, ang, [Vector2(20, 0) * pulse, Vector2(-11, -13) * pulse, Vector2(-11, 13) * pulse]), Color("#f1c40f"))
	var label := "💰 %d  ⏱%ds" % [roundi(sqrt(dx * dx + dy * dy)), ceili(goblin.goblin_life)]
	_text_c(ci, center + Vector2(cos(ang) * (rx - 26.0), sin(ang) * (ry - 26.0)) + Vector2(0, 5), label, 12, Color("#f1c40f"), 3)
