extends RefCounted
## Godot 판에만 있는 콘텐츠 표 — 웹판(game.js)에는 없다.
## 몬스터 종류·정예 특성·장비(희귀도·옵션·세트·전설)·영혼석 영구 강화.
## 웹판과 공유하는 표는 vs_rules.gd 에 있고, 그쪽은 prototypes/godot-vampire-port-test.js 가 대조한다.

# ── 한 판의 길이와 적 성장 곡선 (Godot 판은 30분 생존이 클리어) ──────────────
const RUN_GOAL := 1800.0
# 적 성장은 '단계 시간' 으로 잰다 — 웹판 10분 곡선을 그대로 쓰되, 20분까지는 그 절반 속도로 흐르고
# 그 뒤엔 빨라진다. 그래서 0~20분은 거의 다 살아남고, 20~30분에 벽이 온다 (balance_sim.gd 로 맞춘 값)
const PACE_KNEE := 1200.0
const PACE_EARLY := 0.5
const PACE_LATE := 1.05
const PACE_INFINITE := 2.0       # 30분 클리어 뒤 무한 웨이브 — 벽이 빠르게 닫힌다


static func stage_seconds(t: float) -> float:
	if t <= PACE_KNEE:
		return t * PACE_EARLY
	if t <= RUN_GOAL:
		return PACE_KNEE * PACE_EARLY + (t - PACE_KNEE) * PACE_LATE
	return PACE_KNEE * PACE_EARLY + (RUN_GOAL - PACE_KNEE) * PACE_LATE + (t - RUN_GOAL) * PACE_INFINITE


## 단계 시간이 흐르는 빠르기 — 웨이브·보스 시계도 이걸로 돈다 (적 밀도가 실제 시간에 비례해 두 배가 되지 않게)
static func stage_rate(t: float) -> float:
	if t <= PACE_KNEE:
		return PACE_EARLY
	return PACE_LATE if t <= RUN_GOAL else PACE_INFINITE


## 적 공격(화살·하수인·보스 탄·장판) 피해 배율 (st = 단계 초). 웹판은 1 + st/500.
## 30분 판은 순하게 시작해 20분(단계 600초) 뒤 가파르게 오른다: 0분 0.3 · 10분 0.41 · 20분 1.2 · 25분 3.5 · 30분 8.1
static func enemy_dmg_curve(st: float) -> float:
	var k := st / 600.0
	return DMG_CURVE_BASE + DMG_CURVE_GROWTH * pow(k, DMG_CURVE_EXP)


const DMG_CURVE_BASE := 0.3
const DMG_CURVE_GROWTH := 0.9
const DMG_CURVE_EXP := 3.0
# 보스 원형 탄막 한 발 배율 — 8~12발이 한꺼번에 날아와서 초반 보스전이 사망 원인 1위였다 (봇 측정)
const BOSS_SHOT_MULT := 0.7


# 웹판에서 무제한인 패시브의 Godot 판 상한. 웹판 10분이면 레벨 40~50 이라 무제한이어도 괜찮지만, 30분 판은
# 레벨 200 을 넘겨 공격력 ×1.18 이 수십 번 곱해진다 — 그러면 어떤 적 곡선도 못 따라간다 (봇 측정).
# 상한을 다 채운 뒤의 성장은 장비 몫이다.
# 재생(초당 2%)·이동 속도는 웹판 상한 5 가 30분 판에선 너무 커서 더 낮춘다 — 재생 10%/초면 체력 1000 에
# 초당 100 을 채워 아무것도 못 죽이고, 이속 ×1.76 이면 적보다 세 배 빨라 아무것도 못 닿는다 (봇 측정)
const PASSIVE_CAPS := {"dmg_up": 6, "hp_up": 10, "pierce_up": 5, "regen": 3, "spd_up": 3}
# 재생 합계(패시브 + 장비 + 기본) 상한 — 최대 체력 비율/초
const REGEN_CAP := 0.04
# 아이템 상자 '공격력 강화'(×1.2 영구)도 같은 이유로 상한 — 30분이면 상자가 50개 가까이 나온다
const ITEM_DMGPERM_CAP := 5


static func passive_cap(pv: Dictionary) -> int:
	if PASSIVE_CAPS.has(pv["id"]):
		return int(PASSIVE_CAPS[pv["id"]])
	return int(pv["max"]) if pv["max"] != null else -1


# 때리고 잡아서 얻는 회복(흡혈·피의 갈망·생명 파동·피의 서약·피의 채찍)의 초당 상한 (최대 체력 비율).
# 후반엔 한 방이 수만이라 흡혈 15% 가 즉시 완치가 된다 — 그러면 650마리에 둘러싸여도 안 죽는다 (봇 측정)
const LEECH_CAP_PER_SEC := 0.04


## 접촉 피해 시간 배율 — 웹판 min(1 + st/480, 3), 단계 10분(실제 20분) 뒤로는 적 공격 곡선을 따라 더 오른다
static func contact_scale(st: float) -> float:
	var web := minf(1.0 + st / 480.0, 3.0)
	var knee := PACE_KNEE * PACE_EARLY
	if st <= knee:
		return web
	return web * enemy_dmg_curve(st) / enemy_dmg_curve(knee)


# 기본 재생 (최대 체력 비율/초) — 웹판엔 없다. 30분 판에서 재생 패시브를 못 만난 판이 긁힌 상처로 죽지 않게
const PLAYER_BASE_REGEN := 0.008
# 숨 고르기 — CALM_DELAY 초 동안 안 맞으면 재생 +CALM_REGEN (합계는 REGEN_CAP 안). 초반 사망은 한 방이 아니라
# 낮은 체력으로 오래 버티다 긁혀 죽는 것이었다 (봇 측정). 후반엔 계속 맞아서 거의 안 켜진다
const CALM_DELAY := 3.0
const CALM_REGEN := 0.03
# 시작 체력 보너스 — 웹판 100 에 더한다. 30분 판 앞 20분은 '거의 다 산다' 가 목표라서
const PLAYER_BONUS_HP := 50.0
# 살아 있는 궁수 상한 — 궁수는 거리를 두고 남아 쌓인다(봇 측정: 살아 있는 적의 절반, 사망 원인 1위).
# 넘으면 새로 뽑는 궁수는 근접형으로 나온다
const ARCHER_CAP := 30
# 2단계 궁수 3연발 한 발 배율 — 사망 피해의 대부분이 이 부채꼴이었다 (봇 측정)
const ARCHER2_DMG_MULT := 0.65

# 발동 옵션 피해는 '그때 잡몹 체력' 을 따라가되 이 단계 시간까지만 — 그 뒤로는 장비 레벨로만 큰다.
# 끝없이 따라가면 잡몹을 언제나 한 방에 지워서 벽이 생기지 않는다 (봇 측정: 36분을 넘겨도 안 죽었다)
const PROC_STAGE_CAP := 600.0


## 적 체력 배율 (m = 단계 분). 웹판 10분 곡선 1 + 0.9m + 0.06m² 에 5분 뒤 압박 배율을 곱한 것에
## 30분 판 보정 — 무릎(단계 10분 = 실제 20분)까지는 HP_EARLY 배, 그 뒤로는 HP_LATE_RATE 로 지수 증가.
## 잘 큰 빌드는 화면을 다 지워 처치·경험치·장비가 더 쏟아지는 눈덩이가 생기므로, 벽은 그걸 넘어설 만큼 가팔라야 한다
static func enemy_hp_curve(m: float) -> float:
	var pressure := 1.0 + floori((m - 5.0) * 0.8) * 0.12 if m > 5.0 else 1.0
	return (1.0 + 0.9 * m + 0.06 * m * m) * pressure * hp_adjust(m)


## 30분 판 체력 보정 (웹판 곡선에 곱한다) — 보스 체력에도 쓴다
static func hp_adjust(m: float) -> float:
	var knee_m := PACE_KNEE * PACE_EARLY / 60.0
	return HP_EARLY * (exp((m - knee_m) * HP_LATE_RATE) if m > knee_m else 1.0)


## 적 이동 속도 배율 — 무릎 뒤로 빨라진다. 안 그러면 후반 플레이어(이속 200+)가 650마리를 달고 영원히 도망친다 (봇 측정)
static func enemy_speed_curve(st: float) -> float:
	var knee := PACE_KNEE * PACE_EARLY
	return 1.0 + SPEED_LATE * maxf(0.0, st - knee) / 600.0


const SPEED_LATE := 1.0
const HP_EARLY := 0.55
const HP_LATE_RATE := 0.22


# ── 몬스터 종류 ─────────────────────────────────────────────────────
# hp/speed/size/xp: 등급 기본값에 곱하는 배율. sprite: art/<sprite>.svg
# 특성: erratic(지그재그 비행) reassemble(죽으면 확률로 다시 일어남) split(죽으면 분열)
#       phase(주기적으로 반투명 — 받는 피해 70% 감소) slam(내려찍기 예고 후 광역) fuse(붙으면 자폭)
#       charge(예고선 뒤 돌진) kb_immune(넉백 무시)
const ENEMY_TYPES := {
	"ghoul": {"name": "구울", "sprite": "ghoul", "color": "#7f9c6b", "hp": 1.0, "speed": 1.0, "size": 1.0, "xp": 1.0},
	"bat": {"name": "흡혈박쥐", "sprite": "bat", "color": "#8e44ad", "hp": 0.55, "speed": 1.45, "size": 0.85, "xp": 0.8, "erratic": true},
	"skeleton": {"name": "해골 전사", "sprite": "skeleton", "color": "#e8e2d0", "hp": 1.0, "speed": 1.0, "size": 1.0, "xp": 1.0, "reassemble": 0.35},
	"archer": {"name": "해골 궁수", "sprite": "archer", "color": "#1abc9c", "hp": 0.7, "speed": 1.0, "size": 1.0, "xp": 1.0},
	"slime": {"name": "산성 슬라임", "sprite": "slime", "color": "#6ab04c", "hp": 1.1, "speed": 0.85, "size": 1.05, "xp": 1.0, "split": 2},
	"wraith": {"name": "망령", "sprite": "wraith", "color": "#74b9ff", "hp": 0.9, "speed": 1.15, "size": 1.0, "xp": 1.2, "phase": true},
	"golem": {"name": "룬 골렘", "sprite": "golem", "color": "#e67e22", "hp": 1.9, "speed": 0.7, "size": 1.3, "xp": 1.6, "slam": true, "kb_immune": true},
	"bomber": {"name": "폭탄 임프", "sprite": "bomber", "color": "#e74c3c", "hp": 0.7, "speed": 1.35, "size": 0.9, "xp": 0.9, "fuse": true},
	"charger": {"name": "돌격 멧돼지", "sprite": "charger", "color": "#a0522d", "hp": 1.4, "speed": 0.9, "size": 1.15, "xp": 1.3, "charge": true}
}

# ── 정예 특성 — 정예 하나에 1개(5분 뒤 2개, 무한 모드 3개) ───────────
const ELITE_AFFIXES := {
	"split": {"name": "분열", "icon": "🧬", "color": "#6ab04c", "desc": "죽으면 작은 분신 3마리"},
	"vampiric": {"name": "흡혈", "icon": "🩸", "color": "#c0392b", "desc": "닿으면 체력 흡수, 초당 재생"},
	"haste": {"name": "신속", "icon": "💨", "color": "#74b9ff", "desc": "이동 속도 ×1.6, 잔상"},
	"summoner": {"name": "소환사", "icon": "💀", "color": "#9b59b6", "desc": "6초마다 하수인 3마리"},
	"volatile": {"name": "폭발", "icon": "💥", "color": "#e67e22", "desc": "죽은 자리 0.9초 뒤 폭발"},
	"frost": {"name": "냉기", "icon": "❄", "color": "#a8e6ff", "desc": "주변 플레이어 이동 속도 -35%"},
	"shielded": {"name": "보호막", "icon": "🛡", "color": "#74b9ff", "desc": "체력의 40% 보호막"},
	"giant": {"name": "거대", "icon": "⛰", "color": "#f1c40f", "desc": "크기 ×1.5, 체력 ×2"},
	"blink": {"name": "순간이동", "icon": "✨", "color": "#d7a3f5", "desc": "4초마다 플레이어 근처로 순간이동"}
}
const ELITE_AFFIX_ORDER := ["split", "vampiric", "haste", "summoner", "volatile", "frost", "shielded", "giant", "blink"]

# ── 장비 ───────────────────────────────────────────────────────────
const GEAR_SLOTS := ["helm", "armor", "boots", "ring"]
const SLOT_NAMES := {"helm": "투구", "armor": "갑옷", "boots": "장화", "ring": "반지"}

# weight: 드롭 가중치 / mult: 옵션 수치 배율 / affixes: 일반 옵션 개수 / bonus: 장착 판단 점수 가산
const RARITIES := {
	"common": {"name": "일반", "color": "#d0d4dc", "weight": 52, "mult": 1.0, "affixes": 1, "bonus": 0},
	"magic": {"name": "마법", "color": "#5dade2", "weight": 30, "mult": 1.2, "affixes": 2, "bonus": 3},
	"rare": {"name": "희귀", "color": "#f1c40f", "weight": 13, "mult": 1.5, "affixes": 3, "bonus": 6},
	"set": {"name": "세트", "color": "#2ecc71", "weight": 3.5, "mult": 1.4, "affixes": 2, "bonus": 10},
	"legendary": {"name": "전설", "color": "#ff8c1a", "weight": 1.5, "mult": 1.7, "affixes": 2, "bonus": 14}
}
const RARITY_ORDER := ["common", "magic", "rare", "set", "legendary"]

# 일반 옵션 — 값은 [min, max] 를 희귀도 배율·아이템 레벨로 키운다. pct: 퍼센트로 표시
const AFFIXES := {
	"dmg": {"name": "공격력", "min": 0.04, "max": 0.09, "pct": true},
	"cd": {"name": "쿨다운 감소", "min": 0.03, "max": 0.06, "pct": true},
	"range": {"name": "공격 범위", "min": 0.04, "max": 0.08, "pct": true},
	"speed": {"name": "이동 속도", "min": 0.03, "max": 0.06, "pct": true},
	"max_hp": {"name": "최대 체력", "min": 8, "max": 18, "pct": false},
	"crit": {"name": "치명타 확률", "min": 0.02, "max": 0.05, "pct": true},
	"lifesteal": {"name": "흡혈", "min": 0.005, "max": 0.012, "pct": true},
	"pickup": {"name": "획득 반경", "min": 0.08, "max": 0.16, "pct": true},
	"armor": {"name": "받는 피해 감소", "min": 0.02, "max": 0.05, "pct": true},
	"regen": {"name": "초당 회복(최대 체력)", "min": 0.002, "max": 0.005, "pct": true},
	"xp": {"name": "경험치", "min": 0.04, "max": 0.08, "pct": true},
	"luck": {"name": "행운(장비 드롭)", "min": 0.08, "max": 0.15, "pct": true}
}
const AFFIX_ORDER := ["dmg", "cd", "range", "speed", "max_hp", "crit", "lifesteal", "pickup", "armor", "regen", "xp", "luck"]
# 합산 상한 — 쿨다운이 0 이 되거나 무적이 되는 것을 막는다
const STAT_CAPS := {"cd": 0.4, "armor": 0.6, "crit": 0.6, "lifesteal": 0.15}

# 세트 — 같은 세트 2개·4개를 차면 효과. 효과는 vs_run.gd 가 set_count() 로 확인한다
const SETS := {
	"ember": {"name": "잿불 군주", "icon": "🔥", "color": "#ff7f3f",
		"bonus2": "처치 시 30% 확률로 불씨 폭발 (화상)",
		"bonus4": "대쉬 경로에 3초간 불길, 화상 피해 2배"},
	"storm": {"name": "폭풍 사냥꾼", "icon": "⚡", "color": "#8fd3ff",
		"bonus2": "치명타가 주변 적 2명에게 번개로 튐",
		"bonus4": "5초마다 무작위 적 6명에게 낙뢰 (기절)"},
	"blood": {"name": "피의 서약", "icon": "🩸", "color": "#e74c3c",
		"bonus2": "처치마다 체력 +1, 흡혈 +3%",
		"bonus4": "체력 50% 미만이면 피해 +40%·쿨다운 -20%, 피격 시 피의 가시 폭발"},
	"frost": {"name": "서리 왕관", "icon": "❄", "color": "#a8e6ff",
		"bonus2": "직접 타격 10% 확률로 1초 빙결",
		"bonus4": "반경 140 냉기 오라(적 40% 감속), 빙결된 적은 받는 피해 +50%"}
}
const SET_ORDER := ["ember", "storm", "blood", "frost"]

# 전설 — 부위마다 하나. 효과는 vs_run.gd 가 has_legendary() 로 확인한다
const LEGENDARIES := {
	"berserker": {"slot": "helm", "name": "광전사의 투구", "desc": "콤보 20마다 피해 +10% (최대 +60%)"},
	"thornmail": {"slot": "armor", "name": "가시 갑옷", "desc": "몸으로 받은 공격마다 주변에 최대 체력 40% 반사"},
	"shadow": {"slot": "boots", "name": "그림자 장화", "desc": "대쉬 쿨다운 -40%, 대쉬 후 1초 무적"},
	"greed": {"slot": "ring", "name": "탐욕의 반지", "desc": "경험치 +25%, 행운 +50%"}
}

# 장비 드롭 확률 (행운으로 곱해진다). 보스·고블린은 최소 희귀도 보장
const LOOT_CHANCE := {"normal": 0.0015, "elite": 0.10, "boss": 1.0, "goblin": 1.0, "mini_goblin": 0.25}
const LOOT_MIN_RARITY := {"boss": "rare", "goblin": "magic"}

# ── 영혼석 영구 강화 — 판이 끝나면 영혼석을 얻고 시작 화면에서 산다 ───────
const SOUL_UPGRADES := {
	"might": {"name": "힘", "icon": "⚔", "desc": "피해 +5%", "max": 5, "cost": 20, "step": 20, "stat": "dmg", "per": 0.05},
	"vitality": {"name": "활력", "icon": "❤", "desc": "최대 체력 +10", "max": 5, "cost": 15, "step": 15, "stat": "max_hp", "per": 10},
	"swift": {"name": "신속", "icon": "👟", "desc": "이동 속도 +4%", "max": 5, "cost": 15, "step": 15, "stat": "speed", "per": 0.04},
	"wisdom": {"name": "지혜", "icon": "📘", "desc": "경험치 +8%", "max": 5, "cost": 20, "step": 20, "stat": "xp", "per": 0.08},
	"fortune": {"name": "행운", "icon": "🍀", "desc": "장비 드롭 +15%", "max": 5, "cost": 25, "step": 25, "stat": "luck", "per": 0.15}
}
const SOUL_UPGRADE_ORDER := ["might", "vitality", "swift", "wisdom", "fortune"]


static func soul_upgrade_cost(id: String, level: int) -> int:
	var u: Dictionary = SOUL_UPGRADES[id]
	return int(u["cost"]) + int(u["step"]) * level


## 판 결과 → 영혼석. 첫 강화(15~25)가 짧은 판 1~2번이면 손에 닿게 맞췄다 (3분·400킬 ≈ 22)
static func shards_earned(kills: int, elapsed: float, bosses: int, legendaries: int, won: bool) -> int:
	return floori(kills / 30.0 + elapsed / 20.0) + bosses * 15 + legendaries * 5 + (40 if won else 0)


## 희귀도 굴림 — min_rarity 아래는 나오지 않는다. minute 이 늘수록 상위 등급 가중치가 커진다
static func roll_rarity(rng: RandomNumberGenerator, min_rarity: String, minute: float) -> String:
	var start := RARITY_ORDER.find(min_rarity) if min_rarity != "" else 0
	var total := 0.0
	var weights: Array = []
	for i in range(RARITY_ORDER.size()):
		var w := 0.0
		if i >= start:
			w = float(RARITIES[RARITY_ORDER[i]]["weight"])
			if i >= 2:
				w *= 1.0 + minute / 15.0
		weights.append(w)
		total += w
	var roll := rng.randf() * total
	for i in range(weights.size()):
		roll -= float(weights[i])
		if roll <= 0.0 and float(weights[i]) > 0.0:
			return RARITY_ORDER[i]
	return RARITY_ORDER[RARITY_ORDER.size() - 1]


## 장비 한 개를 만든다. ilvl 은 분 단위 진행도(1부터). lv·exp 는 끼고 있는 동안 분해로 자란다
static func roll_item(rng: RandomNumberGenerator, slot: String, rarity: String, ilvl: int) -> Dictionary:
	var rdef: Dictionary = RARITIES[rarity]
	var mult: float = float(rdef["mult"]) * (1.0 + 0.02 * (ilvl - 1))
	var pool: Array = AFFIX_ORDER.duplicate()
	var affixes: Array = []
	for i in range(int(rdef["affixes"])):
		if pool.is_empty():
			break
		var k: String = pool[rng.randi_range(0, pool.size() - 1)]
		pool.erase(k)
		var a: Dictionary = AFFIXES[k]
		var v: float = lerpf(float(a["min"]), float(a["max"]), rng.randf()) * mult
		if not bool(a["pct"]):
			v = roundf(v)
		affixes.append({"stat": k, "val": v})
	var item := {"slot": slot, "rarity": rarity, "affixes": affixes, "set": "", "legendary": "", "ilvl": ilvl,
		"lv": 1, "exp": 0.0, "spent": 0.0, "procs": [], "uid": 0, "new": false}
	if rng.randf() < float(NATIVE_PROC_CHANCE[rarity]):
		item["procs"].append(roll_proc(rng))
	if rarity == "set":
		item["set"] = SET_ORDER[rng.randi_range(0, SET_ORDER.size() - 1)]
		item["name"] = "%s의 %s" % [SETS[item["set"]]["name"], SLOT_NAMES[slot]]
	elif rarity == "legendary":
		for id in LEGENDARIES:
			if LEGENDARIES[id]["slot"] == slot:
				item["legendary"] = id
				item["name"] = LEGENDARIES[id]["name"]
	else:
		item["name"] = "%s %s" % [rdef["name"], SLOT_NAMES[slot]]
	return item


## 장착 판단 점수 — 옵션 수치를 각 옵션 최대값으로 나눠 더하고 희귀도 가산
## 레벨이 오른 장비는 옵션 수치가 커진 만큼, 발동 옵션은 하나당 4점 더 쳐 준다
static func item_power(item: Dictionary) -> float:
	var p := float(RARITIES[item["rarity"]]["bonus"])
	var m := gear_level_mult(int(item.get("lv", 1)))
	for a in item["affixes"]:
		var d: Dictionary = AFFIXES[a["stat"]]
		p += float(a["val"]) * m / float(d["max"]) * 5.0
	return p + 4.0 * item.get("procs", []).size()


## 옵션 실제 수치 — 장비 레벨 배율을 곱한다
static func affix_value(item: Dictionary, a: Dictionary) -> float:
	var v := float(a["val"]) * gear_level_mult(int(item.get("lv", 1)))
	if not bool(AFFIXES[a["stat"]]["pct"]):
		v = roundf(v)
	return v


static func affix_text(a: Dictionary, item: Dictionary = {}) -> String:
	var d: Dictionary = AFFIXES[a["stat"]]
	var v := affix_value(item, a) if not item.is_empty() else float(a["val"])
	if bool(d["pct"]):
		return "%s +%.1f%%" % [d["name"], v * 100.0]
	return "%s +%d" % [d["name"], int(v)]


static func item_lines(item: Dictionary) -> Array:
	var out: Array = []
	for a in item["affixes"]:
		out.append(affix_text(a, item))
	for pr in item.get("procs", []):
		out.append("✦ " + proc_text(pr))
	if item["legendary"] != "":
		out.append("★ " + String(LEGENDARIES[item["legendary"]]["desc"]))
	if item["set"] != "":
		var s: Dictionary = SETS[item["set"]]
		out.append("(2) " + String(s["bonus2"]))
		out.append("(4) " + String(s["bonus4"]))
	return out



# ── 장비 성장 — 주운 장비를 분해해서 '끼고 있는' 장비의 경험치로 ───────────
# 같은 부위 장비를 주우면 끼고 있는 장비가 그 경험치를 먹고 자란다. 더 좋은(또는 세트·전설) 장비는
# 가방에 들어가고, 장비창에서 바꿔 낄 수 있다 — 바꾸면 빼낸 장비는 레벨을 지닌 채 가방으로 간다.
const GEAR_MAX_LEVEL := 20
const GEAR_LEVEL_STEP := 0.08          # 레벨당 옵션 수치 +8% (Lv20 = ×2.52)
const AWAKEN_LEVELS := [5, 10, 15]     # 각성 — 무작위 발동 옵션이 하나 붙는다
const MAX_PROCS := 3
const BAG_SIZE := 8
const SALVAGE_EXP := {"common": 12, "magic": 20, "rare": 34, "set": 50, "legendary": 70}
const SALVAGE_REFUND := 0.6            # 키운 장비를 분해하면 들인 경험치의 60% 를 돌려준다
const NATIVE_PROC_CHANCE := {"common": 0.0, "magic": 0.0, "rare": 0.25, "set": 0.35, "legendary": 1.0}


static func gear_level_mult(lv: int) -> float:
	return 1.0 + GEAR_LEVEL_STEP * (lv - 1)


static func gear_exp_needed(lv: int) -> int:
	return roundi(30.0 + 48.0 * pow(float(lv), 1.3))


## 분해하면 나오는 장비 경험치 — 희귀도·아이템 레벨 + 키운 만큼 일부 환급
static func salvage_exp(item: Dictionary) -> float:
	var base := float(SALVAGE_EXP[item["rarity"]]) * (1.0 + 0.03 * (int(item["ilvl"]) - 1))
	return base + float(item.get("spent", 0.0)) * SALVAGE_REFUND


# ── 발동 옵션 — 각성하거나 희귀 이상으로 떨어지면 붙는다. 조건 × 효과를 따로 굴린다 ──
# chance: 기본 발동 확률(굴릴 때 ×0.7~1.3), icd: 같은 옵션 재발동 대기
const PROC_TRIGGERS := {
	"kill": {"name": "처치 시", "chance": 0.06, "icd": 0.25},
	"crit": {"name": "치명타 시", "chance": 0.10, "icd": 0.3},
	"hurt": {"name": "피격 시", "chance": 0.6, "icd": 1.0},
	"dash": {"name": "대쉬 시", "chance": 0.7, "icd": 0.4},
	"timer": {"name": "7초마다", "chance": 1.0, "icd": 0.0},
	"massacre": {"name": "학살(순식간에 12킬) 시", "chance": 1.0, "icd": 1.5}
}
const PROC_TRIGGER_ORDER := ["kill", "crit", "hurt", "dash", "timer", "massacre"]
const PROC_TIMER_PERIOD := 7.0
# scale: 지금 나오는 잡몹(1단계) 체력의 몇 배 피해인가 — 언제 얻어도 잡몹을 한 방에 쓸어야 손맛이 난다
const PROC_EFFECTS := {
	"nova": {"name": "화염 신성", "icon": "🔥", "color": "#ff7f3f", "scale": 1.6, "r": 150.0},
	"frost": {"name": "서리 폭발", "icon": "❄", "color": "#a8e6ff", "scale": 0.8, "r": 190.0, "freeze": 1.6},
	"meteor": {"name": "운석우", "icon": "☄", "color": "#ff7675", "scale": 2.0, "r": 85.0, "n": 5},
	"chain": {"name": "연쇄 번개", "icon": "⚡", "color": "#8fd3ff", "scale": 1.5, "n": 9},
	"blackhole": {"name": "블랙홀", "icon": "🌀", "color": "#a29bfe", "scale": 3.0, "r": 230.0},
	"blades": {"name": "칼날 폭풍", "icon": "🗡", "color": "#dfe6e9", "scale": 1.2, "n": 16},
	"thunder": {"name": "천둥", "icon": "🌩", "color": "#f9e79f", "scale": 1.8, "n": 6},
	"frenzy": {"name": "광란", "icon": "💢", "color": "#ff4757", "dur": 5.0}
}
const PROC_EFFECT_ORDER := ["nova", "frost", "meteor", "chain", "blackhole", "blades", "thunder", "frenzy"]


static func roll_proc(rng: RandomNumberGenerator) -> Dictionary:
	var trig: String = PROC_TRIGGER_ORDER[rng.randi_range(0, PROC_TRIGGER_ORDER.size() - 1)]
	var eff: String = PROC_EFFECT_ORDER[rng.randi_range(0, PROC_EFFECT_ORDER.size() - 1)]
	var ch := float(PROC_TRIGGERS[trig]["chance"])
	if ch < 1.0:
		ch = minf(ch * lerpf(0.7, 1.3, rng.randf()), 1.0)
	return {"trigger": trig, "effect": eff, "chance": ch}


static func proc_text(pr: Dictionary) -> String:
	var t: Dictionary = PROC_TRIGGERS[pr["trigger"]]
	var e: Dictionary = PROC_EFFECTS[pr["effect"]]
	var ch := float(pr["chance"])
	if ch >= 1.0:
		return "%s %s %s" % [t["name"], e["icon"], e["name"]]
	return "%s %d%%: %s %s" % [t["name"], roundi(ch * 100.0), e["icon"], e["name"]]


# ── 제단 — 가끔 근처에 나타나는 무작위 버프. 밟으면 발동 ─────────────────
const SHRINES := {
	"fury": {"name": "분노의 제단", "icon": "😡", "color": "#ff4757", "desc": "15초간 피해 ×2", "dur": 15.0},
	"frenzy": {"name": "광란의 제단", "icon": "💢", "color": "#ff9f43", "desc": "15초간 쿨다운 -40%", "dur": 15.0},
	"chaos": {"name": "혼돈의 제단", "icon": "🎲", "color": "#a29bfe", "desc": "15초간 처치마다 20% 무작위 발동, 장비 발동 확률 ×2", "dur": 15.0},
	"greed": {"name": "탐욕의 제단", "icon": "💰", "color": "#f1c40f", "desc": "20초간 경험치 ×2, 장비 드롭 ×3", "dur": 20.0},
	"storm": {"name": "폭풍의 제단", "icon": "🌩", "color": "#8fd3ff", "desc": "12초간 0.4초마다 낙뢰", "dur": 12.0},
	"doom": {"name": "파멸의 제단", "icon": "☠", "color": "#e74c3c", "desc": "주변의 모든 적을 날려 버린다", "dur": 0.0}
}
const SHRINE_ORDER := ["fury", "frenzy", "chaos", "greed", "storm", "doom"]
const SHRINE_INTERVAL_MIN := 75.0
const SHRINE_INTERVAL_MAX := 115.0
const SHRINE_LIFE := 30.0

# 학살 — 짧은 틈(BURST_WINDOW 초)에 이어진 처치 수가 문턱을 넘으면 화면이 흔들리고 글자가 뜬다
const BURST_WINDOW := 0.35
const MASSACRE_TIERS := [[12, "SLAUGHTER", "#ff9f43"], [30, "MASSACRE", "#ff4757"], [60, "ANNIHILATION", "#d980fa"], [120, "APOCALYPSE", "#ffffff"]]
