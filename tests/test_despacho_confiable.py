"""Despacho confiable (P3): GPS viejo, prioridad por sitio, TTL de config,
reserva atómica del chofer y reintento/vencimiento de viajes pendientes."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

import server
from tests.conftest import _headers, login_operador, login_terminal

pytestmark = pytest.mark.asyncio

ORIGEN = {"lat": 17.5099, "lng": -91.9847}
DESTINO = {"lat": 17.4999, "lng": -91.9747}


async def _libre_en(client, tok, op_id, lat=ORIGEN["lat"], lng=ORIGEN["lng"]):
    r = await client.patch(f"/api/operadores/{op_id}/estado", json={"estado": "libre"}, headers=_headers(tok))
    assert r.status_code == 200, r.text
    r = await client.post("/api/locations", headers=_headers(tok), json={"lat": lat, "lng": lng})
    assert r.status_code == 200, r.text


async def _pasajero(client, usuario="pas_p3"):
    r = await client.post("/api/clientes", json={"nombre": "Pasajera P3", "telefono": "916-300-0333",
                                                 "usuario": usuario, "contrasena": "p3x"})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["cliente"]["id"]


async def _pedir(client, p_tok, cid):
    r = await client.post("/api/servicios", headers=_headers(p_tok),
                          json={"pasajero_id": cid, "origen": ORIGEN, "destino": DESTINO})
    assert r.status_code == 200, r.text
    return r.json()["servicio"]


async def test_gps_viejo_sin_app_conectada_no_recibe_ofertas(client, fresh_db):
    t1 = await login_operador(client, "op1")
    o1 = t1["operador"]["id"]
    await _libre_en(client, t1["token"], o1)
    viejo = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    await fresh_db.operadores.update_one({"_id": ObjectId(o1)}, {"$set": {"ultima_actualizacion": viejo}})

    ids = [c["id"] for c in await server._buscar_candidatos(ORIGEN["lat"], ORIGEN["lng"], num=50)]
    assert o1 not in ids

    server.manager.operadores[o1] = [object()]  # app conectada por WebSocket
    try:
        ids = [c["id"] for c in await server._buscar_candidatos(ORIGEN["lat"], ORIGEN["lng"], num=50)]
        assert o1 in ids
    finally:
        server.manager.operadores.pop(o1, None)


async def test_prioritario_va_primero_aunque_este_lejos(client, fresh_db):
    t1, t2 = await login_operador(client, "op1"), await login_operador(client, "op2")
    o1, o2 = t1["operador"]["id"], t2["operador"]["id"]
    await _libre_en(client, t1["token"], o1, lat=17.53, lng=-91.95)  # ~4 km
    await _libre_en(client, t2["token"], o2)                          # en el origen
    p_tok, cid = await _pasajero(client)
    s = await _pedir(client, p_tok, cid)
    assert s["estado"] == "ofrecido"
    assert s["ofrecido_a"] == [o1]


async def test_prioritario_de_otro_sitio_no_recibe_la_oferta(client, fresh_db):
    t1, t2 = await login_operador(client, "op1"), await login_operador(client, "op2")
    o1, o2 = t1["operador"]["id"], t2["operador"]["id"]
    await _libre_en(client, t1["token"], o1)
    await _libre_en(client, t2["token"], o2)
    await fresh_db.operadores.update_one({"_id": ObjectId(o1)}, {"$set": {"sitio_id": "otro_sitio"}})
    p_tok, cid = await _pasajero(client)
    s = await _pedir(client, p_tok, cid)
    assert s["estado"] == "ofrecido"
    assert o1 not in s["ofrecido_a"]


async def test_duracion_de_oferta_sale_de_config(client, fresh_db):
    await fresh_db.config.update_one({"key": "oferta_duracion_seg"}, {"$set": {"valor": 20}}, upsert=True)
    t1 = await login_operador(client, "op1")
    await _libre_en(client, t1["token"], t1["operador"]["id"])
    p_tok, cid = await _pasajero(client)
    s = await _pedir(client, p_tok, cid)
    assert s["oferta_ttl_s"] == 20
    restante = (datetime.fromisoformat(s["expira_en"]) - datetime.now(timezone.utc)).total_seconds()
    assert 15 <= restante <= 20


async def test_un_chofer_no_gana_dos_servicios_a_la_vez(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t1 = await login_operador(client, "op1")
    o1 = t1["operador"]["id"]
    await _libre_en(client, t1["token"], o1)
    sids = []
    for nombre in ("Uno", "Dos"):
        r = await client.post("/api/servicios", headers=th, json={
            "cliente_nombre": nombre, "origen": {**ORIGEN, "texto": "Centro"},
            "destino": {**DESTINO, "texto": "Pakal Ná"}})
        sids.append(r.json()["servicio"]["id"])

    async def asignar(sid):
        try:
            return await server._asignar_atomicamente(sid, o1)
        except server.HTTPException as e:
            return e.status_code

    res = await asyncio.gather(*(asignar(s) for s in sids))
    assert res.count(True) == 1, res
    asignados = await fresh_db.servicios.count_documents({"operador_asignado_id": o1, "estado": "asignado"})
    assert asignados == 1


async def test_pendiente_se_reofrece_cuando_hay_chofer_y_luego_vence(client, fresh_db):
    p_tok, cid = await _pasajero(client)
    s = await _pedir(client, p_tok, cid)  # nadie libre todavía
    assert s["estado"] == "pendiente"

    t1 = await login_operador(client, "op1")
    await _libre_en(client, t1["token"], t1["operador"]["id"])
    assert await server._reintentar_pendientes() == 1
    doc = await fresh_db.servicios.find_one({"_id": ObjectId(s["id"])})
    assert doc["estado"] == "ofrecido"

    viejo =(datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    await fresh_db.servicios.update_one({"_id": ObjectId(s["id"])},
                                        {"$set": {"estado": "pendiente", "timestamp_creacion": viejo}})
    await server._reintentar_pendientes()
    doc = await fresh_db.servicios.find_one({"_id": ObjectId(s["id"])})
    assert doc["estado"] == "vencido"
