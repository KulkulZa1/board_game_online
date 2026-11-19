extends Node
## 절차적 효과음 — 오디오 파일 없이 _ready() 에서 전부 코드로 합성한다.
##
## 쓰는 법: 이 노드를 트리에 붙이고(오토로드든 main 의 자식이든) play("hit") 처럼 부른다.
##   play(name, pitch = 1.0, volume_db = 0.0)  — 연타 제한·동시 재생 상한·피치 흔들림은 여기서 알아서 한다
##   muted      — true 면 play 가 아무것도 안 한다
##   master_db  — 모든 재생에 더해지는 음량(dB)
##
## 소리 이름: hit crit kill gem dash slash explosion thunder hurt levelup evolve boss
##           loot legendary equip overdrive freeze shatter goblin chest
##
## ⚠ 합성은 16비트 모노 PCM 22050Hz 의 AudioStreamWAV 로 만든다. 소리 전체 길이가 몇 초뿐이라
##   시작 비용이 작다 — 소리를 늘리거나 길게 만들면 _ready() 시간이 그만큼 는다 (print_verbose 로 찍힌다).
## ⚠ 잡음은 고정 시드 난수로 만든 표에서 읽는다 — 실행할 때마다 같은 소리가 나야 한다.
##   _synth_rng 를 부르는 순서가 곧 소리라서, 합성 함수 순서를 바꾸면 잡음 결이 바뀐다(문제는 아니다).

const SR := 22050
const POOL_SIZE := 20
const MAX_SAME := 4                 # 같은 이름의 동시 재생 상한
const JITTER := 0.04                # 피치 흔들림 ±4%
const NOISE_LEN := 32768            # 잡음 표 길이 (2의 거듭제곱 — 비트 마스크로 감는다)
const NOISE_MASK := NOISE_LEN - 1
const SYNTH_SEED := 0x5F1D3

# 피치를 흔들지 않는 소리 — 음정이 있는 팡파르는 흔들면 음이 틀린다
const NO_JITTER := {"levelup": true, "evolve": true, "legendary": true, "boss": true}
# 같은 소리를 다시 낼 수 있는 최소 간격(ms) — 없으면 DEFAULT_GAP_MS
const MIN_GAP_MS := {
	"hit": 30, "kill": 25, "gem": 20,
	"boss": 300, "levelup": 300, "evolve": 300, "legendary": 300
}
const DEFAULT_GAP_MS := 50

# 파형
const W_SINE := 0
const W_TRI := 1
const W_SQUARE := 2
const W_SAW := 3
const W_SAW2 := 4                   # 톱니파 두 개(det 배율로 어긋남) — 한 고리에서 맥놀이까지
# 화음 배율 (평균율)
const MAJ3 := 1.259921              # 장3도 2^(4/12)
const FIFTH := 1.498307             # 완전5도 2^(7/12)
# 잡음 필터
const F_LP := 0
const F_HP := 1
const F_BP := 2

var muted := false
var master_db := -6.0

var _streams: Dictionary = {}                 # 이름 → AudioStreamWAV
var _players: Array[AudioStreamPlayer] = []
var _voice_name := PackedStringArray()        # 보이스별 지금 내는 소리 이름
var _voice_seq := PackedInt64Array()          # 보이스별 시작 순번 (가장 오래된 보이스를 뺏을 때)
var _seq := 0
var _last_ms: Dictionary = {}                 # 이름 → 마지막 재생 시각(ms)
var _jitter_rng := RandomNumberGenerator.new()
var _synth_rng := RandomNumberGenerator.new()
var _noise_tab := PackedFloat32Array()


func _ready() -> void:
	# 트리를 멈춰도(일시정지 메뉴 등) UI 효과음은 나야 한다
	process_mode = Node.PROCESS_MODE_ALWAYS
	var t_start := Time.get_ticks_usec()
	_jitter_rng.randomize()
	_synth_rng.seed = SYNTH_SEED
	_build_noise()
	_build_all()
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.name = "Voice%d" % i
		add_child(p)
		_players.append(p)
	_voice_name.resize(POOL_SIZE)
	_voice_seq.resize(POOL_SIZE)
	_voice_seq.fill(0)
	print_verbose("[vs_sfx] 효과음 %d개 합성 %.1f ms" % [_streams.size(), (Time.get_ticks_usec() - t_start) / 1000.0])


# ⚠ 매개변수 이름 name 은 Node.name 을 가린다 — 공개 API 이름을 지키려고 경고만 끈다
@warning_ignore("shadowed_variable_base_class")
func play(name: String, pitch: float = 1.0, volume_db: float = 0.0) -> void:
	if muted or _players.is_empty():
		return
	var stream: AudioStreamWAV = _streams.get(name)
	if stream == null:
		return
	# 연타 제한 — 한 프레임에 적 30마리가 맞아도 소리는 한 번
	var now := Time.get_ticks_msec()
	var gap: int = MIN_GAP_MS.get(name, DEFAULT_GAP_MS)
	if _last_ms.has(name):
		var last: int = _last_ms[name]
		if now - last < gap:
			return
	_last_ms[name] = now
	# 보이스 고르기: 쉬는 보이스 → (같은 이름이 상한이면 그중 가장 오래된 것) → 전체에서 가장 오래된 것
	var idle := -1
	var same := 0
	var oldest_same := -1
	var oldest := -1
	for i in _players.size():
		if _players[i].playing:
			if _voice_name[i] == name:
				same += 1
				if oldest_same < 0 or _voice_seq[i] < _voice_seq[oldest_same]:
					oldest_same = i
			if oldest < 0 or _voice_seq[i] < _voice_seq[oldest]:
				oldest = i
		elif idle < 0:
			idle = i
	var vi := idle
	if same >= MAX_SAME:
		vi = oldest_same
	elif vi < 0:
		vi = oldest
	var pl := _players[vi]
	var ps := pitch
	if not NO_JITTER.has(name):
		ps *= 1.0 + _jitter_rng.randf_range(-JITTER, JITTER)
	# Godot 는 재생 중인 보이스를 멈출 때 짧게 페이드아웃하므로 뺏어도 '틱' 소리가 안 난다
	pl.stream = stream
	pl.pitch_scale = maxf(ps, 0.05)
	pl.volume_db = master_db + volume_db
	pl.play()
	_seq += 1
	_voice_name[vi] = name
	_voice_seq[vi] = _seq


# ── 소리 목록 ─────────────────────────────────────────────
# _add(이름, 버퍼, 최종 피크, 소프트 클립 세기). 피크는 0.9 를 넘기지 않는다.
# 자주 나는 소리(hit·gem·kill)는 낮게, 드문 이벤트(boss·legendary)는 높게 둔다.

func _build_all() -> void:
	_add("hit", _snd_hit(), 0.5)
	_add("crit", _snd_crit(), 0.6)
	_add("kill", _snd_kill(), 0.6)
	_add("gem", _snd_gem(), 0.42)
	_add("dash", _snd_dash(), 0.62)
	_add("slash", _snd_slash(), 0.52)
	_add("explosion", _snd_explosion(), 0.85, 2.2)
	_add("thunder", _snd_thunder(), 0.85, 1.8)
	_add("hurt", _snd_hurt(), 0.8)
	_add("levelup", _snd_levelup(), 0.7)
	_add("evolve", _snd_evolve(), 0.8)
	_add("boss", _snd_boss(), 0.88, 2.5)
	_add("loot", _snd_loot(), 0.6)
	_add("legendary", _snd_legendary(), 0.8)
	_add("equip", _snd_equip(), 0.6)
	_add("overdrive", _snd_overdrive(), 0.75)
	_add("freeze", _snd_freeze(), 0.55)
	_add("shatter", _snd_shatter(), 0.65)
	_add("goblin", _snd_goblin(), 0.6)
	_add("chest", _snd_chest(), 0.7)


# 작은 '바삭' — 25ms 대역 잡음 + 낮은 쿵
func _snd_hit() -> PackedFloat32Array:
	var b := _buf(0.08)
	_noise(b, {"dur": 0.025, "amp": 0.8, "atk": 0.0008, "tau": 0.007, "rel": 0.004, "mode": F_BP, "c0": 3200.0, "c1": 1500.0, "damp": 0.9})
	_tone(b, {"dur": 0.075, "f0": 150.0, "f1": 55.0, "amp": 0.75, "atk": 0.001, "tau": 0.022, "rel": 0.01})
	return b


# 치명타 — 사각/톱니파 1400→500Hz 하강 '찌릿' + 잡음 순간음
func _snd_crit() -> PackedFloat32Array:
	var b := _buf(0.14)
	_tone(b, {"dur": 0.12, "f0": 1400.0, "f1": 500.0, "wave": W_SQUARE, "amp": 0.6, "atk": 0.001, "tau": 0.05, "rel": 0.02, "lp": 5000.0})
	_tone(b, {"dur": 0.12, "f0": 1416.0, "f1": 506.0, "wave": W_SAW, "amp": 0.35, "atk": 0.001, "tau": 0.045, "rel": 0.02, "lp": 6000.0})
	_noise(b, {"dur": 0.02, "amp": 0.6, "atk": 0.0005, "tau": 0.005, "mode": F_HP, "c0": 3000.0})
	return b


# 처치 '퐁' — 사인 420→120Hz 하강 + 질척한 잡음
func _snd_kill() -> PackedFloat32Array:
	var b := _buf(0.14)
	_tone(b, {"dur": 0.12, "f0": 420.0, "f1": 120.0, "amp": 0.85, "atk": 0.0015, "tau": 0.045, "rel": 0.02})
	_tone(b, {"dur": 0.06, "f0": 840.0, "f1": 260.0, "amp": 0.22, "atk": 0.001, "tau": 0.018, "rel": 0.01})
	_noise(b, {"dur": 0.06, "amp": 0.45, "atk": 0.001, "tau": 0.016, "rel": 0.01, "mode": F_LP, "c0": 4000.0, "c1": 700.0, "poles": 2})
	return b


# 젬 — 맑은 유리 종 (1320Hz + 2640Hz 배음). 게임이 연속 줍기에 pitch 를 올리므로 깨끗하게 둔다
func _snd_gem() -> PackedFloat32Array:
	var b := _buf(0.09)
	_chime(b, {"dur": 0.09, "f0": 1320.0, "parts": [[1.0, 0.7, 0.03], [2.0, 0.28, 0.016]], "atk": 0.001, "rel": 0.015})
	return b


# 대쉬 '휙' — 대역 잡음이 올라갔다 내려온다
func _snd_dash() -> PackedFloat32Array:
	var b := _buf(0.22)
	_noise(b, {"dur": 0.22, "amp": 0.8, "atk": 0.06, "tau": 0.07, "rel": 0.03, "mode": F_BP, "c0": 450.0, "c1": 2600.0, "c2": 650.0, "split": 0.4, "damp": 0.55})
	_noise(b, {"dur": 0.2, "amp": 0.3, "atk": 0.04, "tau": 0.08, "rel": 0.03, "mode": F_LP, "c0": 700.0, "c1": 300.0})
	return b


# 베기 '슉' — 짧고 높은 잡음 스윕 (채찍·근접)
func _snd_slash() -> PackedFloat32Array:
	var b := _buf(0.12)
	_noise(b, {"dur": 0.12, "amp": 0.8, "atk": 0.012, "tau": 0.032, "rel": 0.02, "mode": F_BP, "c0": 1200.0, "c1": 3400.0, "damp": 0.7})
	_noise(b, {"dur": 0.1, "amp": 0.4, "atk": 0.01, "tau": 0.028, "rel": 0.02, "mode": F_HP, "c0": 2500.0, "c1": 5000.0})
	return b


# 폭발 — 저역 잡음 + 60Hz 근처 사인 하강, 살짝 찌그러뜨려 묵직하게
func _snd_explosion() -> PackedFloat32Array:
	var b := _buf(0.5)
	_noise(b, {"dur": 0.5, "amp": 0.9, "atk": 0.002, "tau": 0.13, "rel": 0.08, "mode": F_LP, "c0": 2200.0, "c1": 120.0, "poles": 2})
	_tone(b, {"dur": 0.46, "f0": 95.0, "f1": 40.0, "amp": 0.8, "atk": 0.002, "tau": 0.13, "rel": 0.06})
	_noise(b, {"dur": 0.03, "amp": 0.45, "atk": 0.0005, "tau": 0.008, "mode": F_HP, "c0": 1500.0})
	return b


# 번개 — 날카로운 '쩍' 균열 몇 갈래 + 우르릉 꼬리
func _snd_thunder() -> PackedFloat32Array:
	var b := _buf(0.6)
	_noise(b, {"dur": 0.04, "amp": 1.0, "atk": 0.0005, "tau": 0.01, "rel": 0.01, "mode": F_HP, "c0": 1800.0})
	for i in 5:
		var t: float = 0.012 + _synth_rng.randf() * 0.12
		var d: float = 0.015 + _synth_rng.randf() * 0.02
		var c: float = 1200.0 + _synth_rng.randf() * 1600.0
		_noise(b, {"t": t, "dur": d, "amp": 0.65 - i * 0.08, "atk": 0.0005, "tau": 0.007, "rel": 0.005, "mode": F_HP, "c0": c})
	_noise(b, {"t": 0.015, "dur": 0.585, "amp": 0.9, "atk": 0.03, "tau": 0.2, "rel": 0.12, "mode": F_LP, "c0": 900.0, "c1": 90.0, "poles": 2, "am": 9.0, "amd": 0.5})
	_tone(b, {"dur": 0.4, "f0": 70.0, "f1": 40.0, "amp": 0.4, "atk": 0.004, "tau": 0.14, "rel": 0.06})
	return b


# 피격 '퍽' — 낮은 사각파 160→70Hz
func _snd_hurt() -> PackedFloat32Array:
	var b := _buf(0.15)
	_tone(b, {"dur": 0.15, "f0": 160.0, "f1": 70.0, "wave": W_SQUARE, "amp": 0.8, "atk": 0.002, "tau": 0.06, "rel": 0.025, "lp": 1400.0})
	_tone(b, {"dur": 0.12, "f0": 120.0, "f1": 50.0, "amp": 0.5, "atk": 0.002, "tau": 0.05, "rel": 0.02})
	_noise(b, {"dur": 0.03, "amp": 0.3, "atk": 0.001, "tau": 0.009, "mode": F_LP, "c0": 2500.0})
	return b


# 레벨업 — 삼각파 도-미-솔-도 상행 아르페지오
func _snd_levelup() -> PackedFloat32Array:
	var b := _buf(0.5)
	var notes := PackedFloat32Array([523.25, 659.25, 783.99, 1046.5])
	for i in notes.size():
		var t := i * 0.075
		var last := i == notes.size() - 1
		var d := 0.5 - t if last else 0.15
		var tau := 0.15 if last else 0.06
		_tone(b, {"t": t, "dur": d, "f0": notes[i], "wave": W_TRI, "amp": 0.6, "atk": 0.003, "tau": tau, "rel": 0.03})
		_tone(b, {"t": t, "dur": d, "f0": notes[i] * 2.0, "amp": 0.14, "atk": 0.003, "tau": tau * 0.6, "rel": 0.03})
	return b


# 진화 — 아르페지오 두 겹 + 화음 + 반짝임, 약 1초
func _snd_evolve() -> PackedFloat32Array:
	var b := _buf(1.0)
	var up := PackedFloat32Array([523.25, 659.25, 783.99, 1046.5])
	var low := PackedFloat32Array([392.0, 523.25, 659.25, 783.99])
	for i in 4:
		var t := i * 0.07
		_tone(b, {"t": t, "dur": 0.2, "f0": up[i], "wave": W_TRI, "amp": 0.5, "atk": 0.003, "tau": 0.07, "rel": 0.03})
		_tone(b, {"t": t + 0.035, "dur": 0.2, "f0": low[i], "wave": W_SQUARE, "amp": 0.22, "atk": 0.003, "tau": 0.06, "rel": 0.03, "lp": 1800.0})
	# 마지막 화음 — 도·미·솔을 두 옥타브에 (배율 = 장3도 2^(4/12), 완전5도 2^(7/12))
	_chime(b, {"t": 0.3, "dur": 0.7, "f0": 523.25, "parts": [[1.0, 0.42, 0.26], [MAJ3, 0.38, 0.26], [FIFTH, 0.36, 0.26]], "atk": 0.004, "rel": 0.12})
	_chime(b, {"t": 0.315, "dur": 0.685, "f0": 1046.5, "parts": [[1.0, 0.32, 0.22], [MAJ3, 0.22, 0.2], [FIFTH, 0.18, 0.18]], "atk": 0.004, "rel": 0.12})
	# 반짝임 — 두 옥타브 위 같은 화음에 빠른 떨림
	_chime(b, {"t": 0.33, "dur": 0.67, "f0": 2093.0, "parts": [[1.0, 0.16, 0.22], [MAJ3, 0.14, 0.2], [FIFTH, 0.12, 0.18]], "atk": 0.02, "rel": 0.12, "am": 13.0, "amd": 0.6})
	_noise(b, {"t": 0.26, "dur": 0.5, "amp": 0.1, "atk": 0.05, "tau": 0.15, "rel": 0.1, "mode": F_HP, "c0": 5000.0})
	return b


# 보스 등장 — 낮게 어긋난 톱니파 55/58Hz 맥놀이 + 으르렁 잡음
func _snd_boss() -> PackedFloat32Array:
	var b := _buf(1.2)
	_tone(b, {"dur": 1.2, "f0": 55.0, "f1": 46.0, "wave": W_SAW2, "det": 58.0 / 55.0, "amp": 0.85, "atk": 0.08, "tau": 0.5, "rel": 0.3, "lp": 900.0, "am": 7.0, "amd": 0.25})
	_tone(b, {"dur": 1.1, "f0": 110.6, "f1": 92.5, "wave": W_SAW, "amp": 0.3, "atk": 0.1, "tau": 0.4, "rel": 0.3, "lp": 1300.0})
	_noise(b, {"dur": 1.15, "amp": 0.55, "atk": 0.06, "tau": 0.42, "rel": 0.3, "mode": F_BP, "c0": 320.0, "c1": 170.0, "damp": 0.5, "am": 23.0, "amd": 0.8})
	return b


# 아이템 드롭 '띵-' — 880→1320Hz 두 음 종
func _snd_loot() -> PackedFloat32Array:
	var b := _buf(0.25)
	_bell(b, 0.0, 880.0, 0.12, 0.5, 0.04)
	_bell(b, 0.07, 1320.0, 0.18, 0.7, 0.06)
	return b


# 전설 — A 장조 종 화음 (440/554/659) + 옥타브 반짝임, 느린 감쇠
func _snd_legendary() -> PackedFloat32Array:
	var b := _buf(1.2)
	var chord := PackedFloat32Array([440.0, 554.37, 659.25])
	for i in chord.size():
		_bell(b, i * 0.04, chord[i], 1.2 - i * 0.04, 0.55, 0.42)
	# 한 옥타브 위 같은 화음이 천천히 떨리며 반짝인다 + 아래 A 로 몸통
	_chime(b, {"t": 0.08, "dur": 1.12, "f0": 880.0, "parts": [[1.0, 0.18, 0.35], [MAJ3, 0.16, 0.35], [FIFTH, 0.15, 0.35]], "atk": 0.02, "rel": 0.2, "am": 6.0, "amd": 0.4})
	_chime(b, {"dur": 1.2, "f0": 220.0, "parts": [[1.0, 0.3, 0.4]], "atk": 0.006, "rel": 0.3})
	return b


# 장착 '철컥' — 금속성 짧은 잡음 + 220Hz 사각파 + 비조화 배음
func _snd_equip() -> PackedFloat32Array:
	var b := _buf(0.16)
	_noise(b, {"dur": 0.05, "amp": 0.7, "atk": 0.0005, "tau": 0.012, "rel": 0.01, "mode": F_BP, "c0": 3200.0, "damp": 0.15})
	_tone(b, {"dur": 0.06, "f0": 220.0, "wave": W_SQUARE, "amp": 0.6, "atk": 0.001, "tau": 0.022, "rel": 0.01, "lp": 2500.0})
	_tone(b, {"dur": 0.14, "f0": 1870.0, "amp": 0.25, "atk": 0.001, "tau": 0.032, "rel": 0.02})
	_tone(b, {"dur": 0.1, "f0": 2730.0, "amp": 0.18, "atk": 0.001, "tau": 0.022, "rel": 0.015})
	_noise(b, {"t": 0.055, "dur": 0.03, "amp": 0.4, "atk": 0.0005, "tau": 0.008, "rel": 0.006, "mode": F_HP, "c0": 2500.0})
	return b


# 오버드라이브 — 톱니파 200→1200Hz 상승 + 잡음 라이저
func _snd_overdrive() -> PackedFloat32Array:
	var b := _buf(0.7)
	_tone(b, {"dur": 0.7, "f0": 200.0, "f1": 1200.0, "wave": W_SAW2, "det": 1.011, "amp": 0.7, "atk": 0.5, "tau": 0.15, "rel": 0.06, "lp": 3500.0})
	_tone(b, {"dur": 0.7, "f0": 100.0, "f1": 600.0, "wave": W_SQUARE, "amp": 0.28, "atk": 0.5, "tau": 0.15, "rel": 0.06, "lp": 1800.0})
	_noise(b, {"dur": 0.7, "amp": 0.42, "atk": 0.55, "tau": 0.1, "rel": 0.06, "mode": F_BP, "c0": 400.0, "c1": 3400.0, "damp": 0.9})
	return b


# 빙결 — 높은 사인 묶음이 차례로 반짝 + 서릿발 잡음
func _snd_freeze() -> PackedFloat32Array:
	var b := _buf(0.3)
	var notes := PackedFloat32Array([2349.0, 3136.0, 2794.0, 3520.0, 4186.0, 3729.0])
	for i in notes.size():
		var t := i * 0.026
		# 살짝 어긋난 두 사인의 맥놀이(15~25Hz)가 얼음 반짝임 — 떨림(am)보다 싸다
		_chime(b, {"t": t, "dur": 0.3 - t, "f0": notes[i], "parts": [[1.0, 0.3, 0.055], [1.006, 0.22, 0.05]], "atk": 0.002, "rel": 0.03})
	_noise(b, {"dur": 0.28, "amp": 0.2, "atk": 0.01, "tau": 0.07, "rel": 0.03, "mode": F_HP, "c0": 5000.0})
	return b


# 유리 깨짐 — 밝은 잡음 파열 + 무작위 고음 조각
func _snd_shatter() -> PackedFloat32Array:
	var b := _buf(0.35)
	_noise(b, {"dur": 0.09, "amp": 0.9, "atk": 0.0005, "tau": 0.025, "rel": 0.01, "mode": F_HP, "c0": 2200.0, "poles": 2})
	_noise(b, {"dur": 0.05, "amp": 0.35, "atk": 0.0008, "tau": 0.014, "rel": 0.01, "mode": F_LP, "c0": 1500.0})
	for i in 9:
		var t: float = 0.008 + _synth_rng.randf() * 0.26
		var f: float = 2600.0 + _synth_rng.randf() * 3200.0
		var d: float = 0.03 + _synth_rng.randf() * 0.03
		_tone(b, {"t": t, "dur": d, "f0": f, "f1": f * 1.03, "amp": 0.3 + _synth_rng.randf() * 0.3, "atk": 0.0008, "tau": 0.012, "rel": 0.008})
	return b


# 고블린 — 장난스러운 세 음 징글 (미-도-솔, 마지막은 살짝 끌어올림)
func _snd_goblin() -> PackedFloat32Array:
	var b := _buf(0.38)
	var notes := PackedFloat32Array([1318.5, 1046.5, 1568.0])
	for i in notes.size():
		var t := i * 0.085
		var last := i == notes.size() - 1
		var d := 0.38 - t if last else 0.075
		var f1 := notes[i] * (1.06 if last else 1.0)
		_tone(b, {"t": t, "dur": d, "f0": notes[i], "f1": f1, "wave": W_SQUARE, "amp": 0.45, "atk": 0.002, "tau": 0.1 if last else 0.03, "rel": 0.02, "lp": 3500.0})
		_tone(b, {"t": t, "dur": d, "f0": notes[i] * 0.5, "f1": f1 * 0.5, "wave": W_TRI, "amp": 0.35, "atk": 0.002, "tau": 0.08 if last else 0.03, "rel": 0.02})
	return b


# 상자 — 동전이 쏟아지는 반짝임
func _snd_chest() -> PackedFloat32Array:
	var b := _buf(0.5)
	# 뚜껑 '덜컥'
	_tone(b, {"dur": 0.05, "f0": 180.0, "f1": 140.0, "wave": W_SQUARE, "amp": 0.35, "atk": 0.001, "tau": 0.018, "rel": 0.01, "lp": 1500.0})
	_noise(b, {"dur": 0.03, "amp": 0.3, "atk": 0.0005, "tau": 0.008, "mode": F_BP, "c0": 2400.0, "damp": 0.4})
	# 동전 '띠링' 10개 — 짧은 음 다음 4도 위
	for i in 10:
		var t: float = 0.03 + i * 0.033 + _synth_rng.randf() * 0.014
		var f: float = 1500.0 + _synth_rng.randf() * 1000.0
		var a := 0.6 - i * 0.03
		_tone(b, {"t": t, "dur": 0.03, "f0": f, "amp": a * 0.8, "atk": 0.001, "tau": 0.02, "rel": 0.006})
		_tone(b, {"t": t + 0.025, "dur": 0.1, "f0": f * 1.335, "amp": a, "atk": 0.001, "tau": 0.035, "rel": 0.02})
	_noise(b, {"t": 0.03, "dur": 0.45, "amp": 0.12, "atk": 0.05, "tau": 0.15, "rel": 0.08, "mode": F_HP, "c0": 6000.0})
	return b


# 종 — 기음 + 옥타브 + 비조화 배음(높을수록 빨리 사라진다)
func _bell(b: PackedFloat32Array, t: float, f: float, dur: float, amp: float, tau: float) -> void:
	_chime(b, {"t": t, "dur": dur, "f0": f, "atk": 0.002, "rel": minf(0.3, dur * 0.25),
		"parts": [[1.0, amp, tau], [2.0, amp * 0.4, tau * 0.55], [2.76, amp * 0.22, tau * 0.3]]})


# ── 합성 도구 ─────────────────────────────────────────────

func _build_noise() -> void:
	_noise_tab.resize(NOISE_LEN)
	for i in NOISE_LEN:
		_noise_tab[i] = _synth_rng.randf_range(-1.0, 1.0)


func _buf(dur: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(dur * SR))
	b.fill(0.0)
	return b


## 음 한 층 — 버퍼에 바로 더한다. p 의 키 (없으면 기본값):
##   t 시작(s) · dur 길이(s) · f0→f1 주파수(Hz, 지수 이동) · wave 파형 · amp 진폭(≈ 이 층의 피크)
##   atk 선형 어택(s) · tau 지수 감쇠 시정수(s) · rel 끝 페이드(s) · lp 1극 저역통과(Hz, 0=없음)
##   am/amd 떨림 속도(Hz)/깊이(0~1) · det W_SAW2 의 둘째 톱니 주파수 배율
## ⚠ 표본마다 도는 고리라 합성 시간의 대부분이 여기서 나간다 — 고리 안에 함수 호출·배열 할당을 늘리지 말 것.
##   고정 음정 사인(종·화음)은 _chime 이 서너 배 빠르다.
func _tone(buf: PackedFloat32Array, p: Dictionary) -> void:
	var t0: float = p.get("t", 0.0)
	var dur: float = p.get("dur", 0.1)
	var f0: float = p.get("f0", 440.0)
	var f1: float = p.get("f1", f0)
	var wave: int = p.get("wave", W_SINE)
	var amp: float = p.get("amp", 0.5)
	var atk: float = p.get("atk", 0.002)
	var tau: float = p.get("tau", 0.05)
	var rel: float = p.get("rel", 0.005)
	var lp: float = p.get("lp", 0.0)
	var am_hz: float = p.get("am", 0.0)
	var am_d: float = p.get("amd", 0.0)
	var det: float = p.get("det", 1.0)
	# -52dB 아래로 떨어진 뒤는 계산하지 않는다 (끝 페이드가 마저 닫는다)
	dur = minf(dur, atk + tau * 6.0)
	var n0 := int(t0 * SR)
	var n := mini(int(dur * SR), buf.size() - n0)
	if n < 4:
		return
	var na := maxi(1, int(atk * SR))
	var inv_na := 1.0 / float(na)
	var nr := clampi(int(rel * SR), 1, n)
	var inv_nr := 1.0 / float(nr)
	var n_rel := n - nr
	var k := exp(-1.0 / (tau * SR))
	var fmul := pow(f1 / f0, 1.0 / float(n))
	var inc := f0 / SR
	var inc2 := inc * det
	var ph2 := 0.37                     # 둘째 톱니는 위상을 어긋나게 시작 (시작에 두 톱니가 겹쳐 튀지 않게)
	var lpa := 0.0
	if lp > 0.0:
		var w := TAU * lp / SR
		lpa = w / (1.0 + w)
	var am_inc := am_hz / SR
	var ph := 0.0
	var aph := 0.0
	var g := amp
	var y := 0.0
	for i in n:
		var s: float
		if wave == W_SINE:
			s = sin(TAU * ph)
		elif wave == W_TRI:
			s = 4.0 * absf(ph - 0.5) - 1.0
		elif wave == W_SQUARE:
			s = 1.0 if ph < 0.5 else -1.0
		elif wave == W_SAW:
			s = 2.0 * ph - 1.0
		else:
			# 두 톱니의 평균 = ((2·ph-1) + (2·ph2-1)) / 2
			s = ph + ph2 - 1.0
			ph2 += inc2
			if ph2 >= 1.0:
				ph2 -= 1.0
			inc2 *= fmul
		ph += inc
		if ph >= 1.0:
			ph -= 1.0
		inc *= fmul
		if lpa > 0.0:
			y += lpa * (s - y)
			s = y
		if i < na:
			s *= g * float(i) * inv_na
		else:
			s *= g
			g *= k
		if i > n_rel:
			s *= float(n - i) * inv_nr
		if am_d > 0.0:
			s *= 1.0 - am_d * (0.5 - 0.5 * cos(TAU * aph))
			aph += am_inc
		buf[n0 + i] += s


## 고정 음정 사인 배음 묶음(최대 3개) — 종·화음·반짝임용. 버퍼에 바로 더한다.
##   parts = [[주파수 배율, 진폭, tau], ...] — 배음마다 감쇠가 따로다. 나머지 키는 _tone 과 같다 (t dur f0 atk rel am amd)
## 배음 하나가 감쇠 공진기 y[n] = 2r·cos(w)·y[n-1] − r²·y[n-2] 라서 y[n] = amp·rⁿ·sin(w·n) 이 곱셈 두 번으로 나온다
## — 표본마다 sin 도 감쇠 곱도 없다. GDScript 고리 비용이 합성 시간의 전부라 이게 _tone 여러 층보다 훨씬 싸다.
func _chime(buf: PackedFloat32Array, p: Dictionary) -> void:
	var t0: float = p.get("t", 0.0)
	var dur: float = p.get("dur", 0.3)
	var f0: float = p.get("f0", 880.0)
	var parts: Array = p.get("parts", [])
	var atk: float = p.get("atk", 0.002)
	var rel: float = p.get("rel", 0.01)
	var am_hz: float = p.get("am", 0.0)
	var am_d: float = p.get("amd", 0.0)
	# 배음별 공진기 [계수 c, r², y[-1], y[-2]] — 안 쓰는 칸은 0 (계산은 하지만 소리는 없다)
	var rs: Array[PackedFloat64Array] = []
	var max_tau := 0.0
	for j in 3:
		if j < parts.size():
			var q: Array = parts[j]
			var tau: float = q[2]
			rs.append(_resonator(f0 * float(q[0]), q[1], tau))
			max_tau = maxf(max_tau, tau)
		else:
			rs.append(PackedFloat64Array([0.0, 0.0, 0.0, 0.0]))
	dur = minf(dur, atk + max_tau * 6.0)
	var n0 := int(t0 * SR)
	var n := mini(int(dur * SR), buf.size() - n0)
	if n < 4:
		return
	var na := maxi(1, int(atk * SR))
	var inv_na := 1.0 / float(na)
	var nr := clampi(int(rel * SR), 1, n)
	var inv_nr := 1.0 / float(nr)
	var n_rel := n - nr
	var am_inc := am_hz / SR
	var ca := rs[0][0]
	var qa := rs[0][1]
	var a1 := rs[0][2]
	var a2 := rs[0][3]
	var cb := rs[1][0]
	var qb := rs[1][1]
	var b1 := rs[1][2]
	var b2 := rs[1][3]
	var cc := rs[2][0]
	var qc := rs[2][1]
	var c1 := rs[2][2]
	var c2 := rs[2][3]
	var aph := 0.0
	for i in n:
		var ya := ca * a1 - qa * a2
		a2 = a1
		a1 = ya
		var yb := cb * b1 - qb * b2
		b2 = b1
		b1 = yb
		var yc := cc * c1 - qc * c2
		c2 = c1
		c1 = yc
		var s := ya + yb + yc
		if i < na:
			s *= float(i) * inv_na
		if i > n_rel:
			s *= float(n - i) * inv_nr
		if am_d > 0.0:
			s *= 1.0 - am_d * (0.5 - 0.5 * cos(TAU * aph))
			aph += am_inc
		buf[n0 + i] += s


# 감쇠 공진기 초기값 — y[0] = 0, y[1] = amp·r·sin(w) 에서 출발하도록 y[-1], y[-2] 를 거꾸로 잡는다.
# 나이퀴스트 근처(이 표본율로 못 내는 음)는 0 으로 둔다.
func _resonator(f: float, amp: float, tau: float) -> PackedFloat64Array:
	var w := TAU * f / SR
	if w >= PI * 0.95 or amp <= 0.0 or tau <= 0.0:
		return PackedFloat64Array([0.0, 0.0, 0.0, 0.0])
	var r := exp(-1.0 / (tau * SR))
	return PackedFloat64Array([2.0 * r * cos(w), r * r, -amp * sin(w) / r, -amp * sin(2.0 * w) / (r * r)])


## 잡음 한 층. _tone 과 같은 엔벌로프 키에 더해:
##   mode F_LP/F_HP/F_BP · c0→c1(→c2) 컷오프(Hz; c2 가 있으면 split 비율에서 꺾인다)
##   poles 1|2 (LP/HP 기울기) · damp BP 감쇠 (작을수록 공명이 세다)
## 필터 출력 크기는 컷오프·모드마다 크게 달라서, 잡음 층만은 임시 버퍼에 만든 뒤 피크를 amp 로 맞춰 더한다.
func _noise(buf: PackedFloat32Array, p: Dictionary) -> void:
	var t0: float = p.get("t", 0.0)
	var dur: float = p.get("dur", 0.1)
	var amp: float = p.get("amp", 0.5)
	var atk: float = p.get("atk", 0.001)
	var tau: float = p.get("tau", 0.05)
	var rel: float = p.get("rel", 0.005)
	var mode: int = p.get("mode", F_LP)
	var c0: float = p.get("c0", 1000.0)
	var c1: float = p.get("c1", c0)
	var c2: float = p.get("c2", -1.0)
	var split: float = p.get("split", 0.5)
	var poles: int = p.get("poles", 1)
	var damp: float = clampf(p.get("damp", 0.8), 0.05, 1.4)
	var am_hz: float = p.get("am", 0.0)
	var am_d: float = p.get("amd", 0.0)
	dur = minf(dur, atk + tau * 6.0)
	var n0 := int(t0 * SR)
	var n := mini(int(dur * SR), buf.size() - n0)
	if n < 4:
		return
	var na := maxi(1, int(atk * SR))
	var inv_na := 1.0 / float(na)
	var nr := clampi(int(rel * SR), 1, n)
	var inv_nr := 1.0 / float(nr)
	var n_rel := n - nr
	var k := exp(-1.0 / (tau * SR))
	# 컷오프 대신 필터 계수를 양 끝값 사이에서 지수로 옮긴다 — 표본마다 sin·나눗셈을 하지 않으려고
	var cf := _coef(mode, c0)
	var cf1 := _coef(mode, c1)
	var n_split := n
	var m1 := pow(cf1 / cf, 1.0 / float(n))
	var m2 := 1.0
	if c2 > 0.0:
		n_split = clampi(int(n * split), 1, n - 1)
		m1 = pow(cf1 / cf, 1.0 / float(n_split))
		m2 = pow(_coef(mode, c2) / cf1, 1.0 / float(n - n_split))
	var am_inc := am_hz / SR
	var nt := _noise_tab
	var pos: int = _synth_rng.randi() & NOISE_MASK
	var tmp := PackedFloat32Array()
	tmp.resize(n)
	var s1 := 0.0
	var s2 := 0.0
	var aph := 0.0
	var g := 1.0
	var peak := 0.0
	for i in n:
		var x: float = nt[(pos + i) & NOISE_MASK]
		var s: float
		if mode == F_BP:
			s1 += cf * s2
			s2 += cf * (x - s1 - damp * s2)
			s = s2
		else:
			s1 += cf * (x - s1)
			if mode == F_LP:
				if poles == 2:
					s2 += cf * (s1 - s2)
					s = s2
				else:
					s = s1
			else:
				var h := x - s1
				if poles == 2:
					s2 += cf * (h - s2)
					s = h - s2
				else:
					s = h
		cf *= m1 if i < n_split else m2
		if i < na:
			s *= float(i) * inv_na
		else:
			s *= g
			g *= k
		if i > n_rel:
			s *= float(n - i) * inv_nr
		if am_d > 0.0:
			s *= 1.0 - am_d * (0.5 - 0.5 * cos(TAU * aph))
			aph += am_inc
		tmp[i] = s
		var a := absf(s)
		if a > peak:
			peak = a
	if peak <= 0.000001:
		return
	var gain := amp / peak
	for i in n:
		buf[n0 + i] += tmp[i] * gain


# 필터 계수 — BP 는 체임벌린 상태변수 필터 f = 2·sin(π·fc/SR), LP/HP 는 1극 a = w/(1+w).
# 체임벌린은 f² + 2·f·damp < 4 여야 안정하다 — f ≤ 1, damp ≤ 1.4 로 묶어 둔다.
func _coef(mode: int, fc: float) -> float:
	if mode == F_BP:
		return minf(2.0 * sin(PI * minf(fc, 4000.0) / SR), 1.0)
	var w := TAU * fc / SR
	return w / (1.0 + w)


# 버퍼 → AudioStreamWAV. 소프트 클립(drive>0) → 피크 정규화 → 앞 1ms/뒤 6ms 페이드 → 16비트 LE
func _add(sfx_name: String, buf: PackedFloat32Array, peak_target: float, drive: float = 0.0) -> void:
	var n := buf.size()
	var peak := _peak(buf)
	if peak <= 0.000001:
		push_warning("[vs_sfx] 빈 소리: " + sfx_name)
		return
	if drive > 0.0:
		var norm := drive / peak
		for i in n:
			buf[i] = tanh(buf[i] * norm)
		peak = _peak(buf)
	# 앞뒤 페이드 — 엔벌로프가 이미 0 에서 시작·끝나지만, 어떤 층이 잘려도 '틱' 이 나지 않게 한 번 더 닫는다
	var fi := mini(int(0.001 * SR), n)
	for i in fi:
		buf[i] *= float(i) / float(fi)
	var fo := mini(int(0.006 * SR), n)
	for r in fo:
		buf[n - 1 - r] *= float(r) / float(fo)
	# 정규화 뒤 |값| ≤ peak_target < 1 이라 자르기(clamp)가 필요 없다
	var g := peak_target * 32767.0 / peak
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	for i in n:
		bytes.encode_s16(i * 2, int(buf[i] * g))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = SR
	wav.stereo = false
	wav.data = bytes
	_streams[sfx_name] = wav


func _peak(buf: PackedFloat32Array) -> float:
	var hi := 0.0
	var lo := 0.0
	for v in buf:
		if v > hi:
			hi = v
		elif v < lo:
			lo = v
	return maxf(hi, -lo)
