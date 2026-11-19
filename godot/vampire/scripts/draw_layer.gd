extends Node2D
## 그리기 층 하나 — 실제 그림은 main.gd 의 draw_layer(ci, kind) 가 그린다.
## 층마다 섞기 방식(가산·실루엣)이 다르므로 노드를 나눴다.

var main: Node = null
var kind := ""


func _draw() -> void:
	if main != null:
		main.draw_layer(self, kind)
