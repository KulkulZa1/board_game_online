extends RefCounted
## 뱀파이어 서바이버 규칙 데이터 — public/arcade/vampire/game.js 상단 표의 이식.
##
## ⚠ 아래 const 표는 일부러 'JSON 으로도 읽히는' 문법으로 쓴다 (큰따옴표, 끝 쉼표 없음, 표 안에 주석 없음).
##   prototypes/godot-vampire-port-test.js 가 이 파일에서 표를 그대로 뽑아 game.js 의 표와 비교한다 —
##   Godot 없이도 CI 에서 두 판의 수치가 갈라지면 잡힌다. 표를 고칠 땐 이 문법을 지킬 것.
##   웹판 숫자를 바꿨다면 여기도 같이 바꾼다 (반대도 마찬가지).

const PLAYER_SPEED := 160.0
const BASE_HP := 100
const WAVE_INTERVAL := 3.5
const MAX_ENEMIES := 650
const DASH_COOLDOWN := 1.8
const DASH_DMG := 50.0
const DASH_RANGE := 75.0
const SURVIVE_GOAL := 600
const BOSS_INTERVAL := 300
const ITEM_BOX_INTERVAL := 40.0
const ITEM_BOX_LIFETIME := 28.0
const HORDE_WAVE_EVERY := 2
const MAX_WEAPON_LEVEL := 5
const MAX_WEAPONS := 12
const GOBLIN_INTERVAL := 48.0
const GRID_CELL := 80.0
const LOW_HP_THRESHOLD := 0.25
const CRITICAL_HP_THRESHOLD := 0.15
const LOW_HP_ALERT_COOLDOWN := 7.5
const COMBO_MILESTONES := [10, 25, 50, 100, 200]

# 무기 정의 (기본 무기 + 진화 무기). evolved 는 진화 무기에만 있다.
const WEAPON_DEFS := {
	"orb": {"name": "에너지 구", "icon": "🔵", "desc": "주위를 회전하며 공격", "dmg": 28, "cd": 0.65, "range": 85},
	"arrow": {"name": "화살", "icon": "🏹", "desc": "가장 가까운 적 관통", "dmg": 30, "cd": 0.55, "range": 320},
	"nova": {"name": "폭발", "icon": "💥", "desc": "범위 폭발 공격", "dmg": 95, "cd": 1.8, "range": 120},
	"shield": {"name": "방패", "icon": "🛡", "desc": "주기적 피해 감소", "dmg": 0, "cd": 8, "range": 0},
	"laser": {"name": "레이저", "icon": "⚡", "desc": "전방 레이저 빔", "dmg": 52, "cd": 0.9, "range": 290},
	"boomerang": {"name": "부메랑", "icon": "🪃", "desc": "전방으로 발사 후 귀환, 왕복 타격", "dmg": 46, "cd": 1.1, "range": 310},
	"chain": {"name": "번개 사슬", "icon": "🔗", "desc": "최대 3연쇄 즉시 타격 번개", "dmg": 68, "cd": 1.3, "range": 240},
	"scythe": {"name": "낫", "icon": "🌾", "desc": "전방 부채꼴 광역 베기", "dmg": 44, "cd": 0.7, "range": 115},
	"bomb": {"name": "폭탄", "icon": "💣", "desc": "튕기는 폭탄, 접촉/시한 폭발", "dmg": 80, "cd": 1.5, "range": 150},
	"missile": {"name": "유도탄", "icon": "🚀", "desc": "적을 추적하는 유도 미사일", "dmg": 40, "cd": 0.85, "range": 340},
	"meteor": {"name": "운석", "icon": "☄", "desc": "하늘에서 운석 낙하, 광역 폭발", "dmg": 72, "cd": 1.6, "range": 270},
	"toxic": {"name": "독성 포자", "icon": "☣", "desc": "독성 장판 생성, 지속 피해+중독", "dmg": 22, "cd": 2.2, "range": 240},
	"blackhole": {"name": "블랙홀", "icon": "🌀", "desc": "적·투사체를 빨아들여 가두는 사건의 지평선", "dmg": 48, "cd": 0.55, "range": 130, "evolved": true},
	"stormbow": {"name": "폭풍의 활", "icon": "🌩", "desc": "5연발 강화 관통 화살", "dmg": 42, "cd": 0.38, "range": 380, "evolved": true},
	"supernova": {"name": "슈퍼노바", "icon": "☀", "desc": "연쇄 대폭발", "dmg": 130, "cd": 1.6, "range": 160, "evolved": true},
	"deathray": {"name": "데스레이", "icon": "☠", "desc": "관통 즉사 광선", "dmg": 110, "cd": 0.8, "range": 380, "evolved": true},
	"aegis": {"name": "이지스", "icon": "🛡", "desc": "반사 보호막", "dmg": 40, "cd": 6, "range": 150, "evolved": true},
	"cyclone": {"name": "사이클론", "icon": "🌪", "desc": "3방향 귀환 부메랑, 무한 관통", "dmg": 72, "cd": 0.9, "range": 380, "evolved": true},
	"tempest": {"name": "폭풍 사슬", "icon": "⛈", "desc": "5연쇄 번개, 적 빙결", "dmg": 98, "cd": 1.1, "range": 280, "evolved": true},
	"reaper": {"name": "사신의 낫", "icon": "☠", "desc": "360° 회전 베기, 적 흡입", "dmg": 62, "cd": 0.5, "range": 150, "evolved": true},
	"inferno": {"name": "인페르노", "icon": "🔥", "desc": "5발 분열 화염 폭탄", "dmg": 70, "cd": 1.2, "range": 175, "evolved": true},
	"swarm": {"name": "군집 미사일", "icon": "🛰", "desc": "5연발 유도 미사일, 강화 폭발", "dmg": 36, "cd": 0.55, "range": 380, "evolved": true},
	"meteorshower": {"name": "유성우", "icon": "🌠", "desc": "3연속 운석 낙하, 초광역 폭발", "dmg": 96, "cd": 1.7, "range": 320, "evolved": true},
	"plague": {"name": "역병 지대", "icon": "🦠", "desc": "확산되는 맹독 지대, 강력한 중독", "dmg": 30, "cd": 2.0, "range": 270, "evolved": true}
}

# 무기 레벨업 시 강화되는 부가 효과 설명 (계열 기준) — 레벨업 선택지 표시용
const WEAPON_LVUP_DESC := {
	"orb": "궤도 구슬 +1(2레벨)·구슬 크기 증가",
	"arrow": "발사 수 +1(2레벨)·관통 +1",
	"nova": "폭발 범위 확대",
	"shield": "보호막 지속시간 증가",
	"laser": "빔 사거리 증가",
	"boomerang": "관통 +1·비행 거리 증가",
	"chain": "연쇄 +1(2레벨)·사거리 증가",
	"scythe": "베기 범위·부채꼴 각도 확대",
	"bomb": "폭발 범위 확대·분열 수 증가",
	"missile": "발사 수 +1(2레벨)·유도 성능 향상",
	"meteor": "운석 수 +1·폭발 범위 확대",
	"toxic": "장판 범위·지속시간 증가"
}

# 진화 규칙: base 무기가 최대 레벨 + req 패시브 보유 시 id 무기로 진화
const EVOLUTION_DEFS := [
	{"id": "blackhole", "base": "orb", "req": "magnet", "reqName": "🧲 경험치 자석"},
	{"id": "stormbow", "base": "arrow", "req": "cd_up", "reqName": "⏩ 쿨다운 감소"},
	{"id": "supernova", "base": "nova", "req": "dmg_up", "reqName": "⚔ 공격력"},
	{"id": "deathray", "base": "laser", "req": "spd_up", "reqName": "👟 이동 속도"},
	{"id": "aegis", "base": "shield", "req": "hp_up", "reqName": "❤ 체력 회복"},
	{"id": "cyclone", "base": "boomerang", "req": "crit", "reqName": "⚡ 치명타"},
	{"id": "tempest", "base": "chain", "req": "pierce_up", "reqName": "🔱 관통 강화"},
	{"id": "reaper", "base": "scythe", "req": "lifesteal", "reqName": "🩸 흡혈"},
	{"id": "inferno", "base": "bomb", "req": "ignite", "reqName": "🔥 화염 부착"},
	{"id": "swarm", "base": "missile", "req": "crit", "reqName": "⚡ 치명타"},
	{"id": "meteorshower", "base": "meteor", "req": "range_up", "reqName": "🎯 사거리 확장"},
	{"id": "plague", "base": "toxic", "req": "venom", "reqName": "☠ 맹독"}
]

# 방패/이지스(방어 무기)는 메인/보조와 무관하게 항상 독립 발사
const NON_ATTACK_WEAPONS := ["shield", "aegis"]

# 무기 계열 — 진화 무기를 기본 계열로 매핑 (보조 효과 판정용)
const WEAPON_FAMILY := {
	"orb": "orb", "blackhole": "orb",
	"arrow": "arrow", "stormbow": "arrow",
	"nova": "nova", "supernova": "nova",
	"shield": "shield", "aegis": "shield",
	"laser": "laser", "deathray": "laser",
	"boomerang": "boomerang", "cyclone": "boomerang",
	"chain": "chain", "tempest": "chain",
	"scythe": "scythe", "reaper": "scythe",
	"bomb": "bomb", "inferno": "bomb",
	"missile": "missile", "swarm": "missile",
	"meteor": "meteor", "meteorshower": "meteor",
	"toxic": "toxic", "plague": "toxic"
}

# 투사체 type → 무기 계열 (데미지 출처 — src 미지정 시 fallback)
const PROJ_TYPE_FAMILY := {
	"orb": "orb", "blackhole": "orb",
	"arrow": "arrow", "boomerang": "boomerang",
	"laser": "laser", "deathray": "laser",
	"missile": "missile", "meteor": "meteor"
}

# 보조 무기 계열별 오버레이 효과 — 메인 무기 발사마다 각 보조 계열 효과가 proc 확률로 발동
const AUX_EFFECT_DEFS := {
	"bomb": {"icon": "💥", "name": "폭발 증폭", "desc": "주 공격마다 소형 폭발 (45% 피해)", "proc": 1.0},
	"chain": {"icon": "⚡", "name": "전격 연쇄", "desc": "주 공격마다 2연쇄 번개 (55% 피해)", "proc": 1.0},
	"laser": {"icon": "☀", "name": "섬광 방출", "desc": "주 공격 60% 확률 관통 레이저 (65% 피해)", "proc": 0.6},
	"boomerang": {"icon": "🪃", "name": "파편 사출", "desc": "주 공격 50% 확률 3방향 파편 (35%×3)", "proc": 0.5},
	"orb": {"icon": "🔵", "name": "에너지 파동", "desc": "주 공격마다 환형 충격파 (40% 피해)", "proc": 1.0},
	"nova": {"icon": "💥", "name": "연쇄 폭발", "desc": "주 공격 70% 확률 2차 폭발 (50% 피해)", "proc": 0.7},
	"scythe": {"icon": "🌾", "name": "검기 방출", "desc": "주 공격 80% 확률 부채꼴 베기 (50% 피해)", "proc": 0.8},
	"arrow": {"icon": "🏹", "name": "추격 화살", "desc": "주 공격 70% 확률 추가 관통 화살 (50%)", "proc": 0.7},
	"shield": {"icon": "🛡", "name": "방어 증폭", "desc": "주 공격마다 0.5초 피해 30% 감소", "proc": 1.0},
	"missile": {"icon": "🚀", "name": "유도 탄두", "desc": "주 공격 60% 확률 유도 미사일 1발 (55% 피해)", "proc": 0.6},
	"meteor": {"icon": "☄", "name": "운석 강타", "desc": "주 공격 45% 확률 소형 운석 낙하 (60% 피해)", "proc": 0.45},
	"toxic": {"icon": "☣", "name": "독성 분출", "desc": "주 공격마다 독성 장판 생성", "proc": 1.0}
}

# 패시브 — 효과(JS 의 apply 함수)는 vs_run.gd 의 apply_passive() 에 있다. max: null = 무제한
const PASSIVE_POOL := [
	{"id": "hp_up", "name": "❤ 체력 회복", "desc": "최대 체력 +20, 체력 회복", "max": null},
	{"id": "spd_up", "name": "👟 이동 속도", "desc": "이동 속도 +12%", "max": 5},
	{"id": "dmg_up", "name": "⚔ 공격력", "desc": "모든 무기 데미지 +18%", "max": null},
	{"id": "cd_up", "name": "⏩ 쿨다운 감소", "desc": "모든 무기 쿨다운 -12%", "max": 5},
	{"id": "magnet", "name": "🧲 경험치 자석", "desc": "XP 획득 반경 +60%", "max": 4},
	{"id": "crit", "name": "⚡ 치명타", "desc": "15% 확률 2배 피해 (중첩 가능)", "max": 6},
	{"id": "pierce_up", "name": "🔱 관통 강화", "desc": "화살·부메랑 관통 +2, 번개 연쇄 +3", "max": null},
	{"id": "regen", "name": "💚 체력 재생", "desc": "초당 최대 체력 2% 자동 회복", "max": 5},
	{"id": "range_up", "name": "🎯 사거리 확장", "desc": "모든 무기 사거리·AoE +18%", "max": 5},
	{"id": "ignite", "name": "🔥 화염 부착", "desc": "20% 확률로 화상(초당 피해, 3중첩)", "max": 5},
	{"id": "venom", "name": "☠ 맹독", "desc": "15% 확률로 중독(긴 지속 피해)", "max": 5},
	{"id": "lifesteal", "name": "🩸 흡혈", "desc": "입힌 피해의 3% 만큼 체력 회복", "max": 5}
]

# 패시브 시너지 — 두 패시브를 조합하면 특수 효과 해금
const SYNERGY_DEFS := [
	{"id": "executioner", "name": "집행자", "icon": "🗡", "desc": "치명타 피해 3배 (기본 2배)", "requires": [{"id": "dmg_up", "count": 3}, {"id": "crit", "count": 2}]},
	{"id": "blitz", "name": "전격전", "icon": "⚡", "desc": "공격마다 15% 확률로 즉시 재발동", "requires": [{"id": "spd_up", "count": 2}, {"id": "cd_up", "count": 2}]},
	{"id": "iron_fortress", "name": "철갑 요새", "icon": "🛡", "desc": "모든 피해 30% 감소", "requires": [{"id": "regen", "count": 2}, {"id": "hp_up", "count": 3}]},
	{"id": "vital_surge", "name": "생명 파동", "icon": "💚", "desc": "적 처치마다 HP +3 회복", "requires": [{"id": "regen", "count": 3}, {"id": "cd_up", "count": 2}]},
	{"id": "armor_breaker", "name": "갑옷 파쇄", "icon": "🔱", "desc": "관통 투사체 적중 시 40% 범위 피해 추가", "requires": [{"id": "pierce_up", "count": 3}, {"id": "dmg_up", "count": 2}]},
	{"id": "chain_crit", "name": "연쇄 크리티컬", "icon": "🌩", "desc": "치명타 발동 시 2연쇄 번개 추가 (45% 피해)", "requires": [{"id": "crit", "count": 3}, {"id": "pierce_up", "count": 2}]},
	{"id": "pyromaniac", "name": "방화광", "icon": "🔥", "desc": "화염 상태 적 사망 시 주변 광역 폭발", "requires": [{"id": "ignite", "count": 3}, {"id": "dmg_up", "count": 2}]},
	{"id": "bloodlust", "name": "피의 갈증", "icon": "🩸", "desc": "치명타 발동 시 최대 체력 10% 회복", "requires": [{"id": "lifesteal", "count": 3}, {"id": "crit", "count": 2}]},
	{"id": "elemental_burst", "name": "원소 폭발", "icon": "💫", "desc": "화염+맹독 동시 걸린 적 처치 시 반경 150px 연쇄 폭발 (공격력 800%)", "requires": [{"id": "ignite", "count": 3}, {"id": "venom", "count": 2}]},
	{"id": "cascade_collapse", "name": "연쇄 붕괴", "icon": "💥", "desc": "5초 내 10처치 달성 시 다음 공격에 반경 250px 충격파 (500 고정피해)", "requires": [{"id": "dmg_up", "count": 4}, {"id": "pierce_up", "count": 2}]},
	{"id": "spectral_blade", "name": "유령 검기", "icon": "👻", "desc": "낫 계열 적중 위치에 0.8초 잔향 검기 생성 (데미지 60%)", "requires": [{"id": "lifesteal", "count": 2}, {"id": "range_up", "count": 3}]},
	{"id": "seeker_swarm", "name": "추적 본능", "icon": "🛰", "desc": "치명타 발동 시 25% 확률로 유도 미사일 추가 발사", "requires": [{"id": "crit", "count": 3}, {"id": "cd_up", "count": 2}]},
	{"id": "meteor_call", "name": "천체 강림", "icon": "☄", "desc": "7초마다 주변 무작위 위치에 운석 2발 자동 낙하", "requires": [{"id": "dmg_up", "count": 4}, {"id": "range_up", "count": 2}]}
]

const SLASH_SUPPORT_DEFS := [
	{"id": "cleave", "name": "Cleave Edge", "desc": "+18% dash-slash damage and a wider cutting path.", "max": 3},
	{"id": "rupture", "name": "Rupture Mark", "desc": "Dash-hit enemies bleed, then burst when killed.", "max": 3},
	{"id": "echo", "name": "Echo Step", "desc": "Dash leaves delayed after-slashes along your path.", "max": 3}
]

# 신규 획득 가능한 기본 무기 목록 — 순서는 선택지 풀 순서다
const WEAPON_POOL := ["orb", "arrow", "nova", "shield", "laser", "boomerang", "chain", "scythe", "bomb", "missile", "meteor", "toxic"]

# 캐릭터 — 웹판의 해금 조건(unlock)과 코인 배율은 메타 진행이라 옮기지 않았다 (README 참고)
const CHARACTER_DEFS := [
	{"id": "knight", "name": "Chess Knight", "icon": "N", "desc": "Fast starter with bow pressure.", "startWeapons": ["arrow"], "speedMult": 1.08, "hpBonus": 0, "dmgMult": 1, "cdMult": 1, "xpRangeMult": 1},
	{"id": "omok", "name": "Omok Stone", "icon": "O", "desc": "Tougher bruiser with stone orbit.", "startWeapons": ["orb", "nova"], "speedMult": 0.94, "hpBonus": 25, "dmgMult": 1.1, "cdMult": 1.04, "xpRangeMult": 0.95},
	{"id": "reversi", "name": "Reversi Mage", "icon": "R", "desc": "Cooldown specialist with late-game scaling.", "startWeapons": ["shield", "laser"], "speedMult": 1, "hpBonus": 10, "dmgMult": 0.95, "cdMult": 0.9, "xpRangeMult": 1.12},
	{"id": "goblin", "name": "Goblin Thief", "icon": "💰", "desc": "Fast glass cannon. +30% coins, 2× gear drops. Low HP.", "startWeapons": ["boomerang", "chain"], "speedMult": 1.18, "hpBonus": -20, "dmgMult": 1.05, "cdMult": 1, "xpRangeMult": 1}
]

const DIFFICULTY_DEFS := [
	{"id": "easy", "name": "Easy", "desc": "Practice run.", "enemyHpMult": 0.78, "enemySpeedMult": 0.92, "enemyDmgMult": 0.75, "spawnMult": 0.82, "bossInterval": 150},
	{"id": "normal", "name": "Normal", "desc": "Balanced 10 minute run.", "enemyHpMult": 1, "enemySpeedMult": 1, "enemyDmgMult": 1, "spawnMult": 1, "bossInterval": 120},
	{"id": "hard", "name": "Hard", "desc": "Higher pressure and rewards.", "enemyHpMult": 1.28, "enemySpeedMult": 1.1, "enemyDmgMult": 1.22, "spawnMult": 1.22, "bossInterval": 105},
	{"id": "nightmare", "name": "Nightmare", "desc": "Elites gain shields. Max pressure. Huge payout.", "enemyHpMult": 1.65, "enemySpeedMult": 1.25, "enemyDmgMult": 1.5, "spawnMult": 1.38, "bossInterval": 90}
]

const MAP_DEFS := [
	{"id": "meadow", "name": "Meadow", "desc": "Balanced 10 minute field.", "durationSeconds": 600, "enemyHpMult": 1, "spawnMult": 1, "bg": "#101827"},
	{"id": "night", "name": "Night Board", "desc": "More enemies after your first clear.", "durationSeconds": 600, "enemyHpMult": 1.08, "spawnMult": 1.12, "bg": "#101222"},
	{"id": "snow", "name": "Snow Endgame", "desc": "Longer, harder, better payout.", "durationSeconds": 720, "enemyHpMult": 1.18, "spawnMult": 1.18, "bg": "#13212b"}
]

# 정예 처치 시 떨어지는 즉시 발동 파워업 — 효과는 vs_run.gd 의 apply_powerup()
const POWERUP_POOL := [
	{"id": "berserk", "icon": "⚡", "color": "#e74c3c", "name": "광폭화"},
	{"id": "haste", "icon": "👟", "color": "#3498db", "name": "쾌속"},
	{"id": "heal", "icon": "❤", "color": "#2ecc71", "name": "회복"},
	{"id": "vacuum", "icon": "🧲", "color": "#9b59b6", "name": "흡수"}
]

# 랜덤 아이템 박스 — 효과는 vs_run.gd 의 apply_item_box()
const ITEM_BOX_POOL := [
	{"id": "medkit", "icon": "💊", "name": "긴급 치료"},
	{"id": "barrier", "icon": "🔰", "name": "무적 방패"},
	{"id": "freeze", "icon": "🧊", "name": "빙결 폭탄"},
	{"id": "turbo", "icon": "⚡", "name": "급가속"},
	{"id": "power", "icon": "🎯", "name": "정밀 조준"},
	{"id": "hpmax", "icon": "❤", "name": "체력 강화"},
	{"id": "dmgperm", "icon": "✨", "name": "공격력 강화"},
	{"id": "meteorrain", "icon": "🌠", "name": "운석 세례"},
	{"id": "nuke", "icon": "💥", "name": "핵폭탄"},
	{"id": "sweep", "icon": "🌀", "name": "진공 청소기"}
]


# XP 곡선: 초반 빠른 성장 → 후반 완만 (lv^1.8). Lv1=32, Lv5=237, Lv10=777
static func xp_needed(lv: int) -> int:
	return int(round(20.0 + 12.0 * pow(lv, 1.8)))


static func weapon_family(id: String) -> String:
	return WEAPON_FAMILY.get(id, id)


static func is_attack_weapon(id: String) -> bool:
	return not NON_ATTACK_WEAPONS.has(id)


static func find_def(list: Array, id: String) -> Dictionary:
	for d in list:
		if d["id"] == id:
			return d
	return {}


static func fmt_time(s: float) -> String:
	var total := floori(s)
	return "%d:%02d" % [floori(total / 60.0), total % 60]
