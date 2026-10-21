"""Latido del WebSocket del chofer: "ping" → "pong" (detecta conexiones muertas en redes móviles)."""
from starlette.testclient import TestClient

import server


def test_ws_operador_responde_pong():
    token = server.create_token("op-latido", "op_latido", scope="operador")
    cliente = TestClient(server.app)  # sin `with`: no arranca la simulación ni los ciclos de fondo
    with cliente.websocket_connect(f"/api/ws/operador/op-latido?token={token}") as ws:
        ws.send_text("ping")
        assert ws.receive_json() == {"type": "pong"}
        ws.send_text("otra cosa")  # se ignora sin cerrar
        ws.send_text("ping")
        assert ws.receive_json() == {"type": "pong"}
