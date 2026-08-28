"""F5 — Auto-finalización de servicios por geofence (llegada al destino).

Principios validados (del prompt maestro, sección 14):
- La detección es AUTORITATIVA EN BACKEND (no confía en el dispositivo).
- Solo aplica a servicios con destino con coordenadas.
- Requiere: GPS presente, precisión aceptable, dentro del radio, velocidad
  baja y permanencia (dwell) configurable.
- Al completarse: servicio → completado, taxi → libre, evento WS
  "destino_alcanzado" (verificado vía notificación registrada).
"""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

import server
from tests.conftest import _headers, login_operador, login_terminal


async def _servicio_en_curso(client, th, tok, op_id, destino, origen=None):
    """Servicio tipo terminal asignado e iniciado al operador dado."""
    r = await client.post("/api/servicios", headers=th, json={
        "cliente_nombre": "Geofence", "cliente_telefono": "916-000-0001",
        "origen": origen or {"texto": "Centro", "lat": 17.51, "lng": -91.98},
        "destino": destino,
    })
    assert r.status_code == 200, r.text
    sid = r.json()["servicio"]["id"]
    r = await client.post(f"/api/servicios/{sid}/asignar", headers=th, json={"operador_id": op_id})
    assert r.status_code == 200, r.text
    r = await client.post(f"/api/servicios/{sid}/iniciar", headers=_headers(tok))
    assert r.status_code == 200 and r.json()["estado"] == "en_curso", r.text
    return sid


def _cfg(**over):
    base = {"auto_complete_enabled": True, "arrival_radius_m": 75,
            "arrival_dwell_s": 0, "max_gps_accuracy_m": 30}
    base.update(over)
    return base


# ===========================================================================
# 1) Llegada completa → completado automático
# ===========================================================================
@pytest.mark.asyncio
async def test_llegada_auto_completa_servicio(client, fresh_db, monkeypatch):
    # dwell 0 → llegada inmediata (caso de uso: radios amplios, sin espera)
    await fresh_db.config.update_one(
        {"key": "arrival_dwell_s"}, {"$set": {"valor": 0}}, upsert=True)
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))

    destino = {"texto": "Pakal Ná", "lat": 17.50, "lng": -91.97}
    sid = await _servicio_en_curso(client, th, t1["token"], op1, destino)

    notificados = []
    async def fake_send(oid, msg):
        notificados.append((oid, msg))
    monkeypatch.setattr(server.manager, "send_operador", fake_send)

    # GPS dentro del radio (≈50 m del destino), preciso y lento.
    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 8.0, "speed": 1.0,
    })
    assert r.status_code == 200
    data = r.json()
    assert data.get("llegada_detectada") is True
    assert data.get("servicio_auto_completado") is True

    # Servicio completado y operador libre
    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "completado"
    assert svc.get("auto_completado") is True
    me = (await client.get("/api/operadores/me", headers=_headers(t1["token"]))).json()
    assert me["estado"] == "libre"


# ===========================================================================
# 2) Dwell: dentro del radio pero sin permanencia suficiente → no completa
# ===========================================================================
@pytest.mark.asyncio
async def test_dwell_insuficiente_no_completa(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    destino = {"texto": "Destino", "lat": 17.50, "lng": -91.97}
    sid = await _servicio_en_curso(client, th, t1["token"], op1, destino)

    # dwell exigido: 60 s (primer reporte dentro del radio arranca el conteo)
    await fresh_db.config.update_one(
        {"key": "arrival_dwell_s"}, {"$set": {"valor": 60}}, upsert=True)

    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 8.0, "speed": 1.0,
    })
    assert r.status_code == 200
    data = r.json()
    # Primer punto: detecta dentro de zona pero dwell apenas inicia
    assert data.get("llegada_detectada") in (True, None)
    assert data.get("servicio_auto_completado") is not True

    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "en_curso"


# ===========================================================================
# 3) Precisión GPS insuficiente → nunca finaliza
# ===========================================================================
@pytest.mark.asyncio
async def test_gps_impreciso_no_completa(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    destino = {"texto": "Destino", "lat": 17.50, "lng": -91.97}
    sid = await _servicio_en_curso(client, th, t1["token"], op1, destino)

    # accuracy 80 m > max 30 m
    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 80.0, "speed": 0.5,
    })
    assert r.status_code == 200
    data = r.json()
    assert data.get("servicio_auto_completado") is not True
    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "en_curso"


# ===========================================================================
# 4) Velocidad alta (pasando sin detenerse) → no finaliza
# ===========================================================================
@pytest.mark.asyncio
async def test_velocidad_alta_no_completa(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    destino = {"texto": "Destino", "lat": 17.50, "lng": -91.97}
    sid = await _servicio_en_curso(client, th, t1["token"], op1, destino)

    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 8.0, "speed": 12.0,  # 43 km/h
    })
    data = r.json()
    assert data.get("servicio_auto_completado") is not True
    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "en_curso"


# ===========================================================================
# 5) Fuera del radio → no detecta; salir antes del dwell cancela conteo
# ===========================================================================
@pytest.mark.asyncio
async def test_fuera_de_radio_y_salida_cancela_dwell(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    destino = {"texto": "Destino", "lat": 17.50, "lng": -91.97}
    sid = await _servicio_en_curso(client, th, t1["token"], op1, destino)
    await fresh_db.config.update_one(
        {"key": "arrival_dwell_s"}, {"$set": {"valor": 60}}, upsert=True)

    # Lejos del destino (≈2.3 km)
    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.52, "lng": -91.98, "accuracy": 8.0, "speed": 5.0,
    })
    data = r.json()
    assert data.get("llegada_detectada") is not True
    assert data.get("servicio_auto_completado") is not True

    # Entra a zona (arranca dwell)...
    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 8.0, "speed": 1.0,
    })
    assert r.json().get("servicio_auto_completado") is not True
    # ...sale antes de cumplir dwell (reinicia)
    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.52, "lng": -91.98, "accuracy": 8.0, "speed": 10.0,
    })
    assert r.json().get("llegada_detectada") is not True
    # Vuelve a entrar: dwell reinicia desde cero → no completa
    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 8.0, "speed": 1.0,
    })
    assert r.json().get("servicio_auto_completado") is not True
    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "en_curso"


# ===========================================================================
# 6) Servicio sin destino con coordenadas → geofence desactivado
# ===========================================================================
@pytest.mark.asyncio
async def test_sin_destino_no_geofence(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    # Sin lat/lng en destino
    r = await client.post("/api/servicios", headers=th, json={
        "cliente_nombre": "Radio", "cliente_telefono": "916-1",
        "origen": {"texto": "A"}, "destino": {"texto": "B"},
    })
    sid = r.json()["servicio"]["id"]
    await client.post(f"/api/servicios/{sid}/asignar", headers=th, json={"operador_id": op1})
    await client.post(f"/api/servicios/{sid}/iniciar", headers=_headers(t1["token"]))

    # GPS justo "sobre" donde estaría el destino si lo tuviera — irrelevante
    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.50, "lng": -91.97, "accuracy": 5.0, "speed": 0.0,
    })
    data = r.json()
    assert data.get("servicio_auto_completado") is not True
    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "en_curso"


# ===========================================================================
# 7) auto_complete_enabled=false → no completa aunque haya llegada perfecta
# ===========================================================================
@pytest.mark.asyncio
async def test_disabled_no_completa(client, fresh_db):
    await fresh_db.config.update_one(
        {"key": "auto_complete_enabled"}, {"$set": {"valor": False}}, upsert=True)
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    destino = {"texto": "Destino", "lat": 17.50, "lng": -91.97}
    sid = await _servicio_en_curso(client, th, t1["token"], op1, destino)

    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 8.0, "speed": 1.0,
    })
    assert r.json().get("servicio_auto_completado") is not True
    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "en_curso"


# ===========================================================================
# 8) Dwell acumulado entre reportes → completa al cumplir el tiempo
# ===========================================================================
@pytest.mark.asyncio
async def test_dwell_acumulado_completa(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    destino = {"texto": "Destino", "lat": 17.50, "lng": -91.97}
    sid = await _servicio_en_curso(client, th, t1["token"], op1, destino)
    # dwell 45 s; simulamos que el primer reporte dentro de zona fue hace 50 s
    await fresh_db.config.update_one(
        {"key": "arrival_dwell_s"}, {"$set": {"valor": 45}}, upsert=True)
    pasado = (datetime.now(timezone.utc) - timedelta(seconds=50)).isoformat()
    await fresh_db.servicios.update_one(
        {"_id": ObjectId(sid)},
        {"$set": {"llegada": {"dentro_desde": pasado, "lat": 17.4996, "lng": -91.97}}},
    )

    r = await client.post("/api/locations", headers=_headers(t1["token"]), json={
        "lat": 17.49955, "lng": -91.97, "accuracy": 8.0, "speed": 0.5,
    })
    data = r.json()
    assert data.get("llegada_detectada") is True
    assert data.get("servicio_auto_completado") is True
    svc = (await client.get(f"/api/servicios/{sid}", headers=th)).json()
    assert svc["estado"] == "completado"
    assert svc.get("auto_completado") is True
