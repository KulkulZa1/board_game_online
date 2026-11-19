extends RefCounted
## Godot 판에만 있는 콘텐츠 표 — 웹판(game.js)에는 없다.
## 몬스터 종류·정예 특성·장비(희귀도·옵션·세트·전설)·영혼석 영구 강화.
## 웹판과 공유하는 표는 vs_rules.gd 에 있고, 그쪽은 prototypes/godot-vampire-port-test.js 가 대조한다.

# ── 몬스터 종류 ─────────────────────────────────────────────────────
# hp/speed/size/xp: 등급 기본값에 곱하는 배율. sprite: art/<sprite>.svg
# 특성: erratic(지그재그 비행) reassemble(죽으면 확률로 다시 일어남) split(죽으면 분열)
#       phase(주기적으로 반투명 — 받는 피해 70% 감소) slam(내려찍기 예고 후 광역) fuse(붙으면 자폭)
#       charge(예고선 뒤 돌진) kb_immune(넉백 무시)
const ENEMY_TYPES := {
	"ghoul": {"name": "구울", "sprite": "ghoul", "color": "#7f9c6b", "hp": 1.0, "speed": 1.0, "size": 1.0, "xp": 1.0},
	"bat": {"name": "흡혈박쥐", "sprite": "bat", "color": "#8e44ad", "hp": 0.55, "speed": 1.45, "size": 0.85, "xp": 0.8, "erratic": true},
	"skeleton": {"name": "해골 전사", "sprite": "skeleton", "color": "#e8e2d0", "hp": 1.0, "speed": 1.0, "size": 1.0, "xp": 1.0, "reassemble": 0.35},
	"archer": {"name": "해골 궁수", "sprite": "archer", "color": "#1abc9c", "hp": 1.0, "speed": 1.0, "size": 1.0, "xp": 1.0},
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
				w *= 1.0 + minute / 5.0
		weights.append(w)
		total += w
	var roll := rng.randf() * total
	for i in range(weights.size()):
		roll -= float(weights[i])
		if roll <= 0.0 and float(weights[i]) > 0.0:
			return RARITY_ORDER[i]
	return RARITY_ORDER[RARITY_ORDER.size() - 1]


## 장비 한 개를 만든다. ilvl 은 분 단위 진행도(1부터)
static func roll_item(rng: RandomNumberGenerator, slot: String, rarity: String, ilvl: int) -> Dictionary:
	var rdef: Dictionary = RARITIES[rarity]
	var mult: float = float(rdef["mult"]) * (1.0 + 0.06 * (ilvl - 1))
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
	var item := {"slot": slot, "rarity": rarity, "affixes": affixes, "set": "", "legendary": "", "ilvl": ilvl}
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
static func item_power(item: Dictionary) -> float:
	var p := float(RARITIES[item["rarity"]]["bonus"])
	for a in item["affixes"]:
		var d: Dictionary = AFFIXES[a["stat"]]
		p += float(a["val"]) / float(d["max"]) * 5.0
	return p


static func affix_text(a: Dictionary) -> String:
	var d: Dictionary = AFFIXES[a["stat"]]
	if bool(d["pct"]):
		return "%s +%.1f%%" % [d["name"], float(a["val"]) * 100.0]
	return "%s +%d" % [d["name"], int(a["val"])]


static func item_lines(item: Dictionary) -> Array:
	var out: Array = []
	for a in item["affixes"]:
		out.append(affix_text(a))
	if item["legendary"] != "":
		out.append("★ " + String(LEGENDARIES[item["legendary"]]["desc"]))
	if item["set"] != "":
		var s: Dictionary = SETS[item["set"]]
		out.append("(2) " + String(s["bonus2"]))
		out.append("(4) " + String(s["bonus4"]))
	return out
