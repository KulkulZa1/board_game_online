shader_type canvas_item;
// 바닥 — 엇갈린 석판 + 노이즈 얼룩. 카메라 시야를 덮는 ColorRect 에 붙고, 월드 좌표로 무늬를 만든다
// (그래서 카메라가 움직여도 바닥이 미끄러지지 않는다).
uniform vec2 origin;        // 사각형 왼쪽 위의 월드 좌표
uniform vec2 rect_size;     // 사각형의 월드 크기
uniform vec4 base_color : source_color = vec4(0.10, 0.13, 0.20, 1.0);
uniform vec4 line_color : source_color = vec4(0.03, 0.04, 0.07, 1.0);
uniform vec4 accent_color : source_color = vec4(0.16, 0.24, 0.16, 1.0);
uniform float tile = 72.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void fragment() {
	vec2 w = origin + UV * rect_size;
	vec2 g = w / tile;
	g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
	vec2 cell = floor(g);
	vec2 f = fract(g);
	float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
	float mortar = smoothstep(0.0, 0.045, edge);
	float shade = 0.82 + 0.32 * hash(cell);
	float n = noise(w * 0.05) * 0.5 + noise(w * 0.013) * 0.5;
	vec3 col = base_color.rgb * shade * (0.75 + 0.5 * n);
	col = mix(col, accent_color.rgb, smoothstep(0.6, 0.82, noise(w * 0.007 + 7.0)) * 0.4);
	// 금 간 자국
	float crack = smoothstep(0.035, 0.0, abs(noise(w * 0.03 + 3.0) - 0.5)) * step(0.7, hash(cell + 9.0));
	col = mix(col, line_color.rgb, crack * 0.6);
	col = mix(line_color.rgb, col, mortar * 0.88 + 0.12);
	COLOR = vec4(col, 1.0);
}
