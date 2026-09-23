extends RefCounted
## 첨탑 대란 규칙 데이터와 순수 함수 — public/arcade/tower-defense/sim.js 의 이식.
##
## ⚠ 아래 const 표(TOWERS·FUSIONS·ENEMIES·PERKS·CURSES·META_UPGRADES·PATH_POINTS)는
##   일부러 'JSON 으로도 읽히는' 문법으로 쓴다 (큰따옴표, 끝 쉼표 없음). prototypes/godot-port-test.js 가
##   이 파일에서 표를 그대로 뽑아 sim.js 와 비교한다 — Godot 없이도 CI 에서 규칙이 갈라지면 잡힌다.
##   표를 고칠 땐 이 문법을 지킬 것.

const COLS := 7
const ROWS := 10
const FUSED_COST_STEP := 2.2
const FUSED_DMG_STEP := 1.62
const COMBO_WINDOW := 1.6
const META_KEY := "td_meta_v1"

# 길의 꺾이는 점 — 이 점들을 따라 칸 단위로 펼친 것이 PATH 다 (sim.js buildPath 와 같다)
const PATH_POINTS := [[0, 1], [5, 1], [5, 3], [1, 3], [1, 5], [5, 5], [5, 7], [1, 7], [1, 9], [6, 9]]

# 타워 순서는 규칙의 일부다 — 드래프트 카드 풀이 이 순서로 쌓인 뒤 섞인다
const TOWER_ORDER := ["archer", "cannon", "frost", "tesla", "sniper", "mint"]

const TOWERS := {
	"archer": {"name": "궁수탑", "icon": "🏹", "cost": 40, "up": [35, 60], "dmg": 10, "rate": 1.6, "range": 2.2, "desc": "싸고 빠르다. 초반의 뼈대"},
	"cannon": {"name": "포격탑", "icon": "💣", "cost": 70, "up": [60, 100], "dmg": 24, "rate": 0.6, "range": 2.0, "splash": 1.1, "desc": "광역 폭발 — 무리를 갈아버린다"},
	"frost": {"name": "냉각탑", "icon": "❄️", "cost": 55, "up": [45, 80], "dmg": 5, "rate": 1.0, "range": 2.0, "slow": 0.45, "slowDur": 1.6, "desc": "적을 느리게 — 모든 탑의 친구"},
	"tesla": {"name": "전격탑", "icon": "⚡", "cost": 85, "up": [70, 115], "dmg": 15, "rate": 1.1, "range": 2.2, "chain": 3, "desc": "번개가 3마리를 타고 흐른다"},
	"sniper": {"name": "저격탑", "icon": "🎯", "cost": 100, "up": [85, 140], "dmg": 78, "rate": 0.28, "range": 4.6, "pierceShield": true, "desc": "느리지만 확실하게 — 방패 무시"},
	"mint": {"name": "금광", "icon": "💰", "cost": 60, "up": [55, 90], "dmg": 0, "rate": 0, "range": 0, "income": 12, "desc": "공격 대신 웨이브마다 금을 캔다"}
}

const FUSIONS := {
	"archer": {"id": "gatling", "name": "기관궁", "icon": "🏹⚙️", "dmgMult": 2.2, "rateMult": 2.0, "desc": "두 궁수탑이 하나로 — 화살의 폭풍"},
	"cannon": {"id": "volcano", "name": "화산포", "icon": "🌋", "dmgMult": 2.4, "burn": 6, "burnDur": 3, "desc": "맞은 자리가 3초간 불탄다"},
	"frost": {"id": "glacier", "name": "빙하탑", "icon": "🧊", "dmgMult": 2.0, "freeze": 0.18, "slowMult": 1.35, "desc": "18% 확률로 1초 완전 빙결"},
	"tesla": {"id": "storm", "name": "뇌운탑", "icon": "🌩️", "dmgMult": 2.0, "chainAdd": 3, "desc": "번개가 6마리까지 흐른다"},
	"sniper": {"id": "railgun", "name": "레일건", "icon": "🛤️", "dmgMult": 2.6, "pierceLine": true, "desc": "일직선 위 모든 적을 관통"},
	"mint": {"id": "mintcity", "name": "조폐국", "icon": "🏦", "incomeMult": 2.2, "interest": 0.08, "desc": "수입 2배 + 보유 금의 8% 이자"}
}

const PERKS := [
	{"id": "sharp", "name": "날카로운 촉", "icon": "🗡️", "kind": "perk", "mod": {"dmgMult": 0.15}, "desc": "모든 타워 피해 +15%"},
	{"id": "scope", "name": "망원 조준경", "icon": "🔭", "kind": "perk", "mod": {"rangeMult": 0.12}, "desc": "모든 타워 사거리 +12%"},
	{"id": "quick", "name": "속사 기어", "icon": "⚙️", "kind": "perk", "mod": {"rateMult": 0.12}, "desc": "모든 타워 공속 +12%"},
	{"id": "bounty", "name": "현상금 사냥", "icon": "💵", "kind": "perk", "mod": {"bountyMult": 0.2}, "desc": "처치 보상 +20%"},
	{"id": "coldsnap", "name": "한파", "icon": "🌨️", "kind": "perk", "mod": {"slowBonus": 0.1}, "desc": "냉각탑 감속 +10%p"},
	{"id": "goldpack", "name": "전쟁 채권", "icon": "💰", "kind": "perk", "once": {"gold": 90}, "desc": "즉시 +90 금"},
	{"id": "repair", "name": "성벽 보수", "icon": "🧱", "kind": "perk", "once": {"lives": 3}, "desc": "생명 +3"},
	{"id": "cheap", "name": "조립 설계도", "icon": "📐", "kind": "perk", "mod": {"costMult": -0.12}, "desc": "건설 비용 -12%"},
	{"id": "firstaid", "name": "급속 냉각수", "icon": "🧯", "kind": "perk", "mod": {"slowAll": 0.05}, "desc": "모든 타워가 5% 감속을 얻는다"}
]

const CURSES := [
	{"id": "bloodpact", "name": "피의 계약", "icon": "🩸", "kind": "curse", "once": {"gold": 160}, "curse": {"hpMult": 0.15}, "desc": "+160 금. 대가: 적 체력이 15% 늘어난다"},
	{"id": "overclock", "name": "과부하 코어", "icon": "☢️", "kind": "curse", "mod": {"dmgMult": 0.35}, "curse": {"livesCap": -3}, "desc": "피해 +35%. 대가: 생명 3을 즉시 잃는다"},
	{"id": "greed", "name": "탐욕의 손", "icon": "🪙", "kind": "curse", "mod": {"bountyMult": 0.45}, "curse": {"speedMult": 0.12}, "desc": "보상 +45%. 대가: 적이 12% 빨라진다"}
]

const ENEMIES := {
	"grunt": {"name": "침략병", "icon": "👾", "hp": 26, "speed": 1.5, "bounty": 6},
	"runner": {"name": "질주귀", "icon": "🐺", "hp": 15, "speed": 2.6, "bounty": 6},
	"tank": {"name": "강철귀", "icon": "🛡️", "hp": 88, "speed": 0.95, "bounty": 14},
	"shield": {"name": "방패병", "icon": "🔰", "hp": 34, "speed": 1.4, "bounty": 10, "shield": 4},
	"regen": {"name": "재생귀", "icon": "🧪", "hp": 46, "speed": 1.25, "bounty": 12, "regen": 3},
	"boss": {"name": "군주", "icon": "👑", "hp": 620, "speed": 0.8, "bounty": 90, "shield": 6, "boss": true, "rage": 0.9}
}

# 콤보 등급은 높은 문턱부터 — 첫 번째로 맞는 등급을 쓴다
const COMBO_TIERS := [
	{"at": 100, "mult": 1.7, "label": "⚡ 초토화"},
	{"at": 45, "mult": 1.4, "label": "🔥 맹공"},
	{"at": 15, "mult": 1.2, "label": "✨ 연속 격파"}
]

# 비용은 JS 에서 함수(l → base + l*step)였다. 데이터로 옮겨 적는다.
const META_UPGRADES := [
	{"id": "forge", "name": "단조 화력", "icon": "🔥", "max": 3, "costBase": 40, "costStep": 70},
	{"id": "tempo", "name": "전리품 감식", "icon": "💵", "max": 3, "costBase": 45, "costStep": 65},
	{"id": "walls", "name": "겹성벽", "icon": "🏰", "max": 3, "costBase": 35, "costStep": 50},
	{"id": "lens", "name": "넓은 안목", "icon": "🃏", "max": 1, "costBase": 150, "costStep": 0},
	{"id": "armory", "name": "병기고", "icon": "🗝️", "max": 2, "costBase": 60, "costStep": 80},
	{"id": "echo", "name": "메아리 핵", "icon": "🔮", "max": 3, "costBase": 50, "costStep": 60}
]


## JS 의 Math.round — 동률은 +∞ 쪽. GDScript round() 는 0 에서 먼 쪽이라 음수에서 다르다.
static func js_round(x: float) -> int:
	return int(floor(x + 0.5))


## 길을 칸 단위로 펼친다 — [{x, y}, ...]
static func build_path() -> Array:
	var path: Array = []
	for i in range(PATH_POINTS.size() - 1):
		var x: int = PATH_POINTS[i][0]
		var y: int = PATH_POINTS[i][1]
		var tx: int = PATH_POINTS[i + 1][0]
		var ty: int = PATH_POINTS[i + 1][1]
		var dx: int = signi(tx - x)
		var dy: int = signi(ty - y)
		while x != tx or y != ty:
			if not _path_has(path, x, y):
				path.append({"x": x, "y": y})
			x += dx
			y += dy
	var last: Array = PATH_POINTS[PATH_POINTS.size() - 1]
	path.append({"x": last[0], "y": last[1]})
	return path


static func _path_has(path: Array, x: int, y: int) -> bool:
	for p in path:
		if p["x"] == x and p["y"] == y:
			return true
	return false


static func on_path(path: Array, x: int, y: int) -> bool:
	return _path_has(path, x, y)


## 웨이브 구성 — 5의 배수는 보스. {n, hpMult, list: [{type, count}]}
static func wave_spec(n: int) -> Dictionary:
	var late: int = maxi(0, n - 12)
	var hp_mult: float = pow(1.34, n - 1) * (1.0 + late * late * 0.002)
	var list: Array = []
	if n % 5 == 0:
		list.append({"type": "boss", "count": 1 + floori(n / 10.0)})
		list.append({"type": "grunt", "count": 6 + n})
	else:
		list.append({"type": "grunt", "count": 5 + floori(n * 1.5)})
		if n >= 2:
			list.append({"type": "runner", "count": 2 + n})
		if n >= 4:
			list.append({"type": "tank", "count": floori(n / 2.0)})
		if n >= 6:
			list.append({"type": "shield", "count": floori(n / 3.0) + 1})
		if n >= 8:
			list.append({"type": "regen", "count": floori(n / 4.0)})
	return {"n": n, "hpMult": hp_mult, "list": list}


static func build_seconds(wave: int) -> float:
	return maxf(6.0, 13.0 - wave * 0.35)


static func early_gold(wave: int, secs_left: float) -> int:
	return js_round(secs_left * (0.5 + wave * 0.14))


## 연속 격파 등급 — 없으면 빈 Dictionary
static func combo_tier(streak: int) -> Dictionary:
	for t in COMBO_TIERS:
		if streak >= t["at"]:
			return t
	return {}


static func normalize_meta(raw) -> Dictionary:
	var m: Dictionary = raw if raw is Dictionary else {}
	var src: Dictionary = m.get("upgrades", {}) if m.get("upgrades", {}) is Dictionary else {}
	var up := {}
	for u in META_UPGRADES:
		up[u["id"]] = clampi(int(src.get(u["id"], 0)), 0, int(u["max"]))
	return {"cores": maxi(0, int(m.get("cores", 0))), "best": maxi(0, int(m.get("best", 0))), "upgrades": up}


## 다음 레벨 비용. 최대 레벨이면 -1 (JS 의 Infinity)
static func meta_cost(id: String, meta: Dictionary) -> int:
	for u in META_UPGRADES:
		if u["id"] == id:
			var lv: int = int(meta["upgrades"].get(id, 0))
			if lv >= int(u["max"]):
				return -1
			return int(u["costBase"]) + lv * int(u["costStep"])
	return -1


## 판 종료 정산 — √점수 (좋은 판은 크게, 신적인 판도 상점 전체보다는 작게)
static func cores_earned(wave: int, score: float, meta) -> int:
	var m := normalize_meta(meta)
	var base: float = floor(sqrt(maxf(0.0, score)) / 2.0) + wave * 3
	return maxi(1, js_round(base * (1.0 + int(m["upgrades"].get("echo", 0)) * 0.15)))
