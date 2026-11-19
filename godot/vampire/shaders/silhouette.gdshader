shader_type canvas_item;
// 실루엣 — 텍스처의 모양(알파)만 쓰고 색은 modulate 로 칠한다. 피격 흰 번쩍임·빙결·기절·잔상에 쓴다.
// fragment 의 COLOR 에는 이미 텍스처 색이 곱해져 있으므로, 칠할 색(정점 색×modulate)은 varying 으로 넘긴다.
varying vec4 v_col;

void vertex() {
	v_col = COLOR;
}

void fragment() {
	COLOR = vec4(v_col.rgb, texture(TEXTURE, UV).a * v_col.a);
}
