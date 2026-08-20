"""Test suite backend taxiHUB (fase profesional de sitios de taxis).

Cubre: concurrencia de asignación, GPS, máquina de estados, privacidad del
pasajero, ciclo de vida del servicio, cancelación, despacho y scopes JWT.
Se ejecuta contra una BBDD en memoria (mongomock-motor) sin tocar datos reales.
"""

import asyncio

import pytest
from bson import ObjectId

import server
from tests.conftest import _headers, login_operador, login_terminal


# ===========================================================================
# Concurrencia: dos conductores aceptan el mismo servicio -> solo uno gana
# ===========================================================================
@pytest.mark.asyncio
async def test_concurrencia_solo_un_ganador(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    t2 = await login_operador(client, "op2")
    op1, op2 = t1["operador"]["id"], t2["operador"]["id"]

    # Ofertantes disponibles con GPS fresco
    for op_id, tok in ((op1, t1["token"]), (op2, t2["token"])):
        await client.patch(f"/api/operadores/{op_id}/estado", json={"estado": "libre"},
                           headers=_headers(tok))
        await client.post("/api/locations", headers=_headers(tok), json={"lat": 17.51, "lng": -91.98})

    # Servicio pendiente con coordenadas (terminal)
    r = await client.post("/api/servicios", headers=th, json={
        "cliente_nombre": "Pilar", "cliente_telefono": "916-100-0099",
        "origen": {"texto": "Centro", "lat": 17.51, "lng": -91.98},
        "destino": {"texto": "Pakal Ná", "lat": 17.50, "lng": -91.97},
    })
    assert r.status_code == 200, r.text
    servicio_id = r.json()["servicio"]["id"]

    # Ofertar a ambos
    r = await client.post("/api/dispatch/offer", headers=th,
                          json={"servicio_id": servicio_id, "num_opciones": 8})
    assert r.status_code == 200, r.text
    assert set(r.json()["servicio"]["ofrecido_a"]) == {op1, op2}

    # Dos conductores aceptan concurrentemente
    async def aceptar(tok):
        return await client.post(f"/api/servicios/{servicio_id}/aceptar", headers=_headers(tok))

    r1, r2 = await asyncio.gather(aceptar(t1["token"]), aceptar(t2["token"]))

    assert sorted([r1.status_code, r2.status_code]) == [200, 409], (r1.text, r2.text)
    final = (await client.get(f"/api/servicios/{servicio_id}", headers=th)).json()
    assert final["estado"] == "asignado"
    ganador = final["operador_asignado_id"]
    assert ganador in (op1, op2)
    # El perdedor no debe quedar ocupado
    perdedor = op1 if ganador == op2 else op2
    op_doc = await fresh_db.operadores.find_one({"_id": ObjectId(perdedor)})
    assert op_doc["estado"] == "libre"


# ===========================================================================
# GPS: actualización por el pipeline moderno (/locations)
# ===========================================================================
@pytest.mark.asyncio
async def test_gps_actualiza_ubicacion(client, fresh_db):
    t = await login_operador(client, "op1")
    r = await client.post("/api/locations", headers=_headers(t["token"]), json={
        "lat": 17.5123, "lng": -91.9812, "accuracy": 5.0, "speed": 30.0,
        "heading": 90.0, "battery_level": 78.5,
    })
    assert r.status_code == 200, r.text
    me = await client.get("/api/operadores/me", headers=_headers(t["token"]))
    doc = me.json()
    assert abs(doc["lat"] - 17.5123) < 1e-6
    assert abs(doc["lng"] - -91.9812) < 1e-6
    assert doc["gps_accuracy"] == 5.0
    assert doc["gps_speed"] == 30.0
    assert doc["gps_battery"] == 78.5


# ===========================================================================
# Máquina de estados: no se permite soltar el servicio activo
# ===========================================================================
@pytest.mark.asyncio
async def test_estado_bloqueado_con_servicio_activo(client, fresh_db):
    t = await login_operador(client, "op1")
    tok = t["token"]
    op_id = t["operador"]["id"]
    await client.patch(f"/api/operadores/{op_id}/estado", json={"estado": "libre"},
                       headers=_headers(tok))
    # Radio: inicia un servicio propio
    r = await client.post(f"/api/operadores/{op_id}/servicio", headers=_headers(tok),
                          json={"origen_texto": "A", "destino_texto": "B", "costo": 40})
    assert r.status_code == 200, r.text
    # No puede salir a libre mientras tiene servicio en curso
    r = await client.patch(f"/api/operadores/{op_id}/estado", json={"estado": "libre"},
                           headers=_headers(tok))
    assert r.status_code == 409


# ===========================================================================
# Privacidad del pasajero: nunca ve la flota ni GPS de otros taxis
# ===========================================================================
@pytest.mark.asyncio
async def test_privacy_pasajero_no_ve_flota(client, fresh_db):
    r = await client.post("/api/clientes", json={"nombre": "Ana Lina",
                                                 "telefono": "916-300-0001",
                                                 "usuario": "ana", "contrasena": "c1"})
    assert r.status_code == 200, r.text
    p_tok = r.json()["token"]

    r1 = await client.get("/api/operadores", headers=_headers(p_tok))
    assert r1.status_code == 403
    r2 = await client.get("/api/operadores/activos", headers=_headers(p_tok))
    assert r2.status_code == 403

    viaje = await client.get("/api/clientes/me/viaje-activo", headers=_headers(p_tok))
    assert viaje.status_code == 200
    assert viaje.json()["servicio"] is None


# ===========================================================================
# Ciclo de vida del servicio completo con pasajero digital
# ===========================================================================
@pytest.mark.asyncio
async def test_lifecycle_servicio_pasajero(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    await client.post("/api/locations", headers=_headers(t1["token"]),
                      json={"lat": 17.5099, "lng": -91.9847})

    # Pasajero se registra y solicita un taxi
    r = await client.post("/api/clientes", json={"nombre": "Pablo",
                                                 "telefono": "916-300-0002",
                                                 "usuario": "p1", "contrasena": "p1x"})
    p_tok = r.json()["token"]
    cid = r.json()["cliente"]["id"]
    r = await client.post("/api/servicios", headers=_headers(p_tok), json={
        "pasajero_id": cid,
        "origen": {"lat": 17.5099, "lng": -91.9847},
        "destino": {"lat": 17.4999, "lng": -91.9747},
    })
    assert r.status_code == 200, r.text
    sid = r.json()["servicio"]["id"]

    # Despacho: oferta -> acepta -> asignado
    r = await client.post("/api/dispatch/offer", headers=th, json={"servicio_id": sid})
    assert r.status_code == 200, r.text
    r = await client.post(f"/api/servicios/{sid}/aceptar", headers=_headers(t1["token"]))
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "asignado"

    # El pasajero ahora ve SOLO su taxi asignado
    viaje = await client.get("/api/clientes/me/viaje-activo", headers=_headers(p_tok))
    assert viaje.status_code == 200
    abr = viaje.json()["servicio"]
    assert abr["estado"] == "asignado"
    assert abr.get("taxi") is not None

    # Iniciar -> en_curso
    r = await client.post(f"/api/servicios/{sid}/iniciar", headers=_headers(t1["token"]))
    assert r.status_code == 200 and r.json()["estado"] == "en_curso"

    # Terminar -> completado
    r = await client.post(f"/api/servicios/{sid}/terminar", headers=_headers(t1["token"]))
    assert r.status_code == 200 and r.json()["estado"] == "completado"

    me = (await client.get("/api/operadores/me", headers=_headers(t1["token"]))).json()
    assert me["estado"] == "libre"


# ===========================================================================
# Cancelación (pasajero)
# ===========================================================================
@pytest.mark.asyncio
async def test_cancelar_servicio(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    t1 = await login_operador(client, "op1")
    await client.patch(f"/api/operadores/{t1['operador']['id']}/estado",
                       json={"estado": "libre"}, headers=_headers(t1["token"]))
    r = await client.post("/api/clientes", json={"nombre": "C", "telefono": "1",
                                                 "usuario": "c1", "contrasena": "c"})
    p_tok = r.json()["token"]

    r = await client.post("/api/servicios", headers=_headers(p_tok), json={
        "origen": {"lat": 17.5, "lng": -91.98}, "destino": {"lat": 17.4, "lng": -91.97}})
    sid = r.json()["servicio"]["id"]
    await client.post("/api/dispatch/offer", headers=th, json={"servicio_id": sid})
    await client.post(f"/api/servicios/{sid}/aceptar", headers=_headers(t1["token"]))

    # El pasajero cancela
    r = await client.post(f"/api/servicios/{sid}/cancelar", headers=_headers(p_tok),
                          json={"motivo": "Ya no lo necesito"})
    assert r.status_code == 200
    assert r.json()["estado"] == "cancelado"
    doc = (await client.get("/api/operadores/me", headers=_headers(t1["token"]))).json()
    assert doc["estado"] == "libre"


# ===========================================================================
# Despacho: ordena por distancia y sólo usa GPS fresco
# ===========================================================================
@pytest.mark.asyncio
async def test_despacho_candidatos_ordenados(client, fresh_db):
    await fresh_db.config.update_one({"key": "gps_stale_seconds"},
                                     {"$set": {"valor": 120}}, upsert=True)
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    t2 = await login_operador(client, "op2")
    o1, o2 = t1["operador"]["id"], t2["operador"]["id"]
    for oid, tok in ((o1, t1["token"]), (o2, t2["token"])):
        await client.patch(f"/api/operadores/{oid}/estado", json={"estado": "libre"},
                           headers=_headers(tok))
    # op1 a ~1.1 km, op2 a ~0.33 km del origen (0,0)
    await client.post("/api/locations", headers=_headers(t1["token"]),
                      json={"lat": 0.01, "lng": 0.0})
    await client.post("/api/locations", headers=_headers(t2["token"]),
                      json={"lat": 0.003, "lng": 0.0})

    r = await client.get("/api/dispatch/candidates", headers=th, params={"lat": 0.0, "lng": 0.0})
    assert r.status_code == 200, r.text
    c = r.json()
    assert [x["id"] for x in c] == [o2, o1]


# ===========================================================================
# Oferta vencida (EXPIRED) y rechazo que reoferta (REJECTED -> pendiente)
# ===========================================================================
@pytest.mark.asyncio
async def test_oferta_vencida_al_aceptar(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    t1 = await login_operador(client, "op1")
    o1 = t1["operador"]["id"]
    await client.patch(f"/api/operadores/{o1}/estado", json={"estado": "libre"},
                       headers=_headers(t1["token"]))
    await client.post("/api/locations", headers=_headers(t1["token"]), json={"lat": 17.5, "lng": -91.98})

    r = await client.post("/api/servicios", headers=th, json={
        "origen": {"lat": 17.5, "lng": -91.98}, "destino": {"lat": 17.4, "lng": -91.97}})
    sid = r.json()["servicio"]["id"]
    await client.post("/api/dispatch/offer", headers=th, json={"servicio_id": sid})
    # Expira la oferta manualmente
    await fresh_db.servicios.update_one({"_id": ObjectId(sid)},
                                        {"$set": {"expira_en": "2020-01-01T00:00:00+00:00"}})
    r = await client.post(f"/api/servicios/{sid}/aceptar", headers=_headers(t1["token"]))
    assert r.status_code == 410
    s = await fresh_db.servicios.find_one({"_id": ObjectId(sid)})
    assert s["estado"] == "vencido"


@pytest.mark.asyncio
async def test_rechazo_devuelve_a_pendiente(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    t1 = await login_operador(client, "op1")
    t2 = await login_operador(client, "op2")
    o1, o2 = t1["operador"]["id"], t2["operador"]["id"]
    for oid, tok in ((o1, t1["token"]), (o2, t2["token"])):
        await client.patch(f"/api/operadores/{oid}/estado", json={"estado": "libre"},
                           headers=_headers(tok))
        await client.post("/api/locations", headers=_headers(tok), json={"lat": 17.5, "lng": -91.98})

    r = await client.post("/api/servicios", headers=th, json={
        "origen": {"lat": 17.5, "lng": -91.98}, "destino": {"lat": 17.4, "lng": -91.97}})
    sid = r.json()["servicio"]["id"]
    await client.post("/api/dispatch/offer", headers=th, json={"servicio_id": sid})
    # Ambos rechazan
    for tok in (t1["token"], t2["token"]):
        r = await client.post(f"/api/servicios/{sid}/rechazar", headers=_headers(tok))
        assert r.status_code == 200, r.text
    s = await fresh_db.servicios.find_one({"_id": ObjectId(sid)})
    assert s["estado"] == "pendiente"
    assert len(s["rechazados"]) == 2


# ===========================================================================
# Scopes: protección por rol
# ===========================================================================
@pytest.mark.asyncio
async def test_scopes_roles(client, fresh_db):
    t = await login_operador(client, "op1")
    tok = t["token"]
    r = await client.post("/api/operadores", headers=_headers(tok),
                          json={"nombre": "X", "telefono": "1", "placa": "T",
                                "usuario": "x1", "contrasena": "x"})
    assert r.status_code == 403
    r = await client.get("/api/dev/cuentas", headers=_headers(tok))
    assert r.status_code == 403
    r = await client.get("/api/operadores")
    assert r.status_code in (401, 403)


# ===========================================================================
# Routing (Fase 9E): requiere auth y cae a Haversine si OSRM no responde
# ===========================================================================
@pytest.mark.asyncio
async def test_routing_requiere_auth(client):
    r = await client.post("/api/routing/route", json={
        "origen": {"lat": 17.51, "lng": -91.98},
        "destino": {"lat": 17.50, "lng": -91.97},
    })
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_routing_fallback_haversine(client, monkeypatch):
    # Proveedor inalcanzable -> fallback a línea recta sin romper
    monkeypatch.setattr(server, "ROUTING_PROVIDER_URL", "http://127.0.0.1:1/")
    monkeypatch.setattr(server, "ROUTING_TIMEOUT_SECONDS", 1)
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    r = await client.post("/api/routing/route", headers=th, json={
        "origen": {"lat": 17.51, "lng": -91.98},
        "destino": {"lat": 17.50, "lng": -91.97},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "haversine"
    assert body["distance_m"] > 0
    assert body["duration_s"] > 0
    coords = body["geometry"]["coordinates"]
    assert len(coords) == 2
    assert abs(coords[0][1] - 17.51) < 1e-4


@pytest.mark.asyncio
async def test_routing_acepta_operador(client, monkeypatch):
    monkeypatch.setattr(server, "ROUTING_PROVIDER_URL", "http://127.0.0.1:1/")
    monkeypatch.setattr(server, "ROUTING_TIMEOUT_SECONDS", 1)
    t = await login_operador(client, "op1")
    r = await client.post("/api/routing/route", headers=_headers(t["token"]), json={
        "origen": {"lat": 17.51, "lng": -91.98},
        "destino": {"lat": 17.50, "lng": -91.97},
    })
    assert r.status_code == 200, r.text
    assert r.json()["provider"] == "haversine"


@pytest.mark.asyncio
async def test_routing_acepta_pasajero(client, monkeypatch):
    # El pasajero del propio viaje puede trazar su ruta (Fase 11): el endpoint
    # ya no está restringido a operador/terminal.
    monkeypatch.setattr(server, "ROUTING_PROVIDER_URL", "http://127.0.0.1:1/")
    monkeypatch.setattr(server, "ROUTING_TIMEOUT_SECONDS", 1)
    reg = await client.post("/api/clientes", json={
        "nombre": "María Viajera", "telefono": "916-100-7777",
        "usuario": "viajera1", "contrasena": "clave123",
    })
    assert reg.status_code == 200, reg.text
    token = reg.json()["token"]
    r = await client.post("/api/routing/route", headers=_headers(token), json={
        "origen": {"lat": 17.51, "lng": -91.98},
        "destino": {"lat": 17.50, "lng": -91.97},
    })
    assert r.status_code == 200, r.text
    assert r.json()["provider"] == "haversine"
    assert r.json()["distance_m"] > 0


# ===========================================================================
# Historial de recorrido / track (Fase 10): solo terminal, dedupe por distancia
# ===========================================================================
@pytest.mark.asyncio
async def test_track_requiere_terminal(client, fresh_db):
    t = await login_operador(client, "op1")
    r = await client.get(f"/api/operadores/{t['operador']['id']}/track", headers=_headers(t["token"]))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_track_guarda_y_deduplica(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    t = await login_operador(client, "op1")
    tok = _headers(t["token"])
    oid = t["operador"]["id"]

    # Tres puntos: el 2º muy cerca del 1º (no debe añadir punto); el 3º lejos (sí)
    await client.post(f"/api/operadores/{oid}/ubicacion", headers=tok, json={"lat": 17.5100, "lng": -91.9800})
    await client.post(f"/api/operadores/{oid}/ubicacion", headers=tok, json={"lat": 17.51001, "lng": -91.98001})  # ~1.5 m
    await client.post(f"/api/operadores/{oid}/ubicacion", headers=tok, json={"lat": 17.5110, "lng": -91.9810})   # ~130 m

    r = await client.get(f"/api/operadores/{oid}/track", headers=th)
    assert r.status_code == 200, r.text
    track = r.json()["track"]
    assert len(track) == 2, track  # el punto "estacionario" no se duplicó
    assert abs(track[0]["lat"] - 17.5100) < 1e-6
    assert abs(track[1]["lat"] - 17.5110) < 1e-6
    assert all("ts" in p for p in track)