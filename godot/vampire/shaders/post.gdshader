shader_type canvas_item;
// 화면 후처리 — 충격파 굴절, 색수차, 비네트, 저체력 붉은 맥동, 화면 색조(혈월·오버드라이브·낙뢰 섬광).
// 월드 위·HUD 아래의 CanvasLayer 에 놓인 전체 화면 ColorRect 에 붙는다.
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform vec2 screen_px = vec2(540.0, 960.0);
uniform vec4 waves[4];              // xy: 화면 좌표(px), z: 현재 반지름(px), w: 세기(0 이면 꺼짐)
uniform float aberration = 0.0;     // 색수차 (px)
uniform float vignette = 0.45;
uniform float low_hp = 0.0;         // 0..1
uniform vec4 tint = vec4(0.0);      // rgb 색, a 섞는 양
uniform float flash = 0.0;          // 하얀 섬광

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 px = uv * screen_px;
	vec2 offset = vec2(0.0);
	for (int i = 0; i < 4; i++) {
		vec4 w = waves[i];
		if (w.w <= 0.0) {
			continue;
		}
		vec2 d = px - w.xy;
		float dist = length(d);
		float band = 1.0 - smoothstep(0.0, 46.0, abs(dist - w.z));
		offset += normalize(d + vec2(0.0001)) * band * w.w;
	}
	uv -= offset / screen_px;
	vec2 dir = (uv - vec2(0.5)) * aberration / screen_px * 2.0;
	vec3 col;
	col.r = texture(screen_tex, uv + dir).r;
	col.g = texture(screen_tex, uv).g;
	col.b = texture(screen_tex, uv - dir).b;
	float r = length((SCREEN_UV - vec2(0.5)) * vec2(screen_px.x / screen_px.y, 1.0));
	float vig = smoothstep(0.95, 0.35, r);
	col *= mix(1.0, vig, vignette);
	col = mix(col, tint.rgb, tint.a);
	col = mix(col, vec3(0.75, 0.02, 0.02), low_hp * smoothstep(0.35, 0.9, r) * 0.6);
	col += vec3(flash);
	COLOR = vec4(col, 1.0);
}
