"""Puente WhatsApp: los sitios demo siguen simulados; un sitio real refleja el
estado verdadero del puente Baileys (sin QR ni "conectado" inventados)."""
import json
from types import SimpleNamespace

import httpx
import pytest

import server
import whatsapp_module
from tests.conftest import _headers, login_terminal

pytestmark = pytest.mark.asyncio

SITIO_REAL = "sitio_real"
TEL = "+5219160000077"


async def _terminal_real(client, fresh_db):
    await fresh_db.usuarios_terminal.insert_one({
        "nombre": "Central real", "usuario": "central_real", "sitio_id": SITIO_REAL,
        "password_hash": server.hash_password("real123"),
    })
    tok = (await login_terminal(client, "central_real", "real123"))["token"]
    ins = await fresh_db.wa_conversaciones.insert_one({
        "cliente_nombre": "Pasajero", "cliente_telefono": TEL, "sitio_id": SITIO_REAL,
        "mensajes": [{"de": "cliente", "texto": "Necesito un taxi", "ts": server.now_iso()}],
    })
    return _headers(tok), str(ins.inserted_id)


def _puente_falso(monkeypatch, handler):
    """Sustituye httpx solo dentro de whatsapp_module (el cliente de pruebas sigue intacto)."""
    real = httpx.AsyncClient
    transporte = httpx.MockTransport(handler)
    monkeypatch.setattr(whatsapp_module, "httpx", SimpleNamespace(
        AsyncClient=lambda **kw: real(transport=transporte, **kw)))


async def test_sitio_demo_sigue_simulado(client, fresh_db):
    h = _headers((await login_terminal(client))["token"])
    st = (await client.get("/api/wa/status", headers=h)).json()
    assert st["demo"] is True and st["modo"] == "demo_simulado"
    conv = (await client.get("/api/wa/conversaciones", headers=h)).json()[0]
    r = (await client.post(f"/api/wa/conversaciones/{conv['id']}/reply", headers=h, json={"texto": "Va en camino"})).json()
    assert r["entregado"] is True and r["mensaje"]["estado_envio"] == "simulado"


async def test_sitio_real_sin_puente_no_finge_conexion(client, fresh_db, monkeypatch):
    monkeypatch.setenv("WA_BRIDGE_URL", "http://127.0.0.1:9")
    h, conv_id = await _terminal_real(client, fresh_db)
    st = (await client.get("/api/wa/status", headers=h)).json()
    assert st["demo"] is False
    assert st["conectado"] is False and st["modo"] == "puente_no_disponible"
    assert st["qr_data_url"] == "" and st["pairing_code"] is None
    r = (await client.post(f"/api/wa/conversaciones/{conv_id}/reply", headers=h, json={"texto": "Hola"})).json()
    assert r["entregado"] is False and r["mensaje"]["estado_envio"] == "fallido"
    assert r["error_envio"]
    r = await client.post("/api/wa/bridge/vincular", headers=h, json={"accion": "regenerar_qr"})
    assert r.status_code == 503


async def test_sitio_real_con_puente(client, fresh_db, monkeypatch):
    monkeypatch.setenv("WA_WEBHOOK_TOKEN", "token-puente")
    llamadas = []

    def handler(request: httpx.Request):
        llamadas.append(request)
        assert request.headers["authorization"] == "Bearer token-puente"
        if request.url.path == "/status":
            return httpx.Response(200, json={"sesion": True, "estado": "esperando_qr", "conectado": False,
                                             "qr_code": "2@codigo-real", "dispositivo": "TaxiHUB Central"})
        if request.url.path == f"/sesiones/{SITIO_REAL}/iniciar":
            return httpx.Response(200, json={"sesion": True, "estado": "esperando_qr"})
        if request.url.path == "/send":
            return httpx.Response(202, json={"ok": True, "encolado": True})
        return httpx.Response(404, json={})

    _puente_falso(monkeypatch, handler)
    h, conv_id = await _terminal_real(client, fresh_db)

    st = (await client.get("/api/wa/status", headers=h)).json()
    assert st["estado"] == "esperando_qr" and st["qr_data_url"].startswith("data:image/png")

    r = await client.post("/api/wa/bridge/vincular", headers=h, json={"accion": "regenerar_qr"})
    assert r.status_code == 200

    r = (await client.post(f"/api/wa/conversaciones/{conv_id}/reply", headers=h, json={"texto": "Va en camino"})).json()
    assert r["entregado"] is True and r["mensaje"]["estado_envio"] == "encolado"
    envio = json.loads(next(c for c in llamadas if c.url.path == "/send").content)
    assert envio["sitio_id"] == SITIO_REAL and envio["telefono"] == TEL
    assert envio["mensaje_id"] == r["mensaje"]["id"]

    # El puente avisa que el envío falló → queda marcado en la conversación.
    r = await client.post("/api/wa/webhook", headers=_headers("token-puente"), json={
        "tipo": "estado_envio", "sitio_id": SITIO_REAL, "mensaje_id": envio["mensaje_id"],
        "estado": "fallido", "error": "sin conexión"})
    assert r.status_code == 200 and r.json()["actualizado"] is True
    conv = await fresh_db.wa_conversaciones.find_one({"cliente_telefono": TEL})
    ultimo = conv["mensajes"][-1]
    assert ultimo["estado_envio"] == "fallido" and ultimo["error_envio"] == "sin conexión"


async def test_puente_en_demo_solo_con_permiso_explicito(client, fresh_db, monkeypatch):
    monkeypatch.setenv("WA_PUENTE_EN_DEMO", "1")
    monkeypatch.setenv("WA_BRIDGE_URL", "http://127.0.0.1:9")
    h = _headers((await login_terminal(client))["token"])
    st = (await client.get("/api/wa/status", headers=h)).json()
    assert st["demo"] is False and st["modo"] == "puente_no_disponible"
