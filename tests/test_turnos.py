"""F6 — Turnos del taxista (inicio/fin con kilometraje) y datos del turno.

Principios (prompt maestro §15/§17):
- El turno es la unidad de trabajo del taxista: iniciar/fin con km.
- Al iniciar: fecha, hora, unidad, chofer, km iniciales.
- Al finalizar: km finales + cálculo de km recorridos y duración.
- El taxista NO gestiona la operación: solo turno + GPS + datos.
"""

import pytest
from bson import ObjectId

from tests.conftest import _headers, login_operador, login_terminal


async def _abrir_turno(client, tok, km_inicial=100000):
    r = await client.post("/api/turnos/iniciar", headers=_headers(tok),
                          json={"odometro_km": km_inicial})
    assert r.status_code == 200, r.text
    return r.json()


# ===========================================================================
# 1) Iniciar turno registra fecha/hora, unidad, chofer y km iniciales
# ===========================================================================
@pytest.mark.asyncio
async def test_iniciar_turno_registra_datos(client, fresh_db):
    t = await login_operador(client, "op1")
    out = await _abrir_turno(client, t["token"], 125000)
    turno = out["turno"]
    assert turno["operador_id"] == t["operador"]["id"]
    assert turno["odometro_inicio"] == 125000
    assert turno["inicio"]
    assert out["operador"]["estado"] == "libre"

    doc = await fresh_db.turnos.find_one({"_id": ObjectId(turno["id"])})
    assert doc["fin"] is None
    assert doc["odometro_fin"] is None


# ===========================================================================
# 2) No se puede iniciar turno si ya hay uno abierto
# ===========================================================================
@pytest.mark.asyncio
async def test_no_dos_turnos_abiertos(client, fresh_db):
    t = await login_operador(client, "op1")
    await _abrir_turno(client, t["token"], 100000)
    r = await client.post("/api/turnos/iniciar", headers=_headers(t["token"]),
                          json={"odometro_km": 101000})
    assert r.status_code == 409


# ===========================================================================
# 3) Finalizar turno calcula km recorridos y duración
# ===========================================================================
@pytest.mark.asyncio
async def test_finalizar_turno_calcula(client, fresh_db):
    t = await login_operador(client, "op1")
    out = await _abrir_turno(client, t["token"], 100000)
    r = await client.post("/api/turnos/finalizar", headers=_headers(t["token"]),
                          json={"odometro_km": 100150})
    assert r.status_code == 200, r.text
    fin = r.json()["turno"]
    assert fin["odometro_fin"] == 100150
    assert fin["km_recorridos"] == 150
    assert fin["duracion_s"] >= 0
    # El operador vuelve a fuera_de_servicio (turno cerrado)
    me = (await client.get("/api/operadores/me", headers=_headers(t["token"]))).json()
    assert me["estado"] == "fuera_de_servicio"


# ===========================================================================
# 4) km finales < iniciales es un error de captura → 400
# ===========================================================================
@pytest.mark.asyncio
async def test_km_final_menor_rechazado(client, fresh_db):
    t = await login_operador(client, "op1")
    await _abrir_turno(client, t["token"], 100000)
    r = await client.post("/api/turnos/finalizar", headers=_headers(t["token"]),
                          json={"odometro_km": 99900})
    assert r.status_code == 400


# ===========================================================================
# 5) Finalizar sin turno abierto → 409
# ===========================================================================
@pytest.mark.asyncio
async def test_finalizar_sin_turno(client, fresh_db):
    t = await login_operador(client, "op1")
    r = await client.post("/api/turnos/finalizar", headers=_headers(t["token"]),
                          json={"odometro_km": 5000})
    assert r.status_code == 409


# ===========================================================================
# 6) Turno bloquea ir a fuera_de_servicio manualmente sin cerrarlo
#    (el flujo correcto es finalizar turno, que es quien cierra)
# ===========================================================================
@pytest.mark.asyncio
async def test_turno_abierto_requiere_finalizacion(client, fresh_db):
    t = await login_operador(client, "op1")
    await _abrir_turno(client, t["token"])
    r = await client.patch(f"/api/operadores/{t['operador']['id']}/estado",
                           json={"estado": "fuera_de_servicio"},
                           headers=_headers(t["token"]))
    assert r.status_code == 409
    detalle = r.json()["detail"]
    assert "turno" in str(detalle).lower()


# ===========================================================================
# 9) Estado legacy (libre SIN turno): salir de operación directo funciona
#    (el guardarraíl solo aplica con turno abierto — fix F13)
# ===========================================================================
@pytest.mark.asyncio
async def test_salir_sin_turno_legacy(client, fresh_db):
    t = await login_operador(client, "op1")
    # En operación sin turno (p.ej. sesión anterior a la feature, o cambio manual)
    await client.patch(f"/api/operadores/{t['operador']['id']}/estado",
                       json={"estado": "libre"}, headers=_headers(t["token"]))
    r = await client.patch(f"/api/operadores/{t['operador']['id']}/estado",
                           json={"estado": "fuera_de_servicio"},
                           headers=_headers(t["token"]))
    assert r.status_code == 200, r.text
    me = (await client.get("/api/operadores/me", headers=_headers(t["token"]))).json()
    assert me["estado"] == "fuera_de_servicio"


# ===========================================================================
# Historial: mis turnos (más reciente primero)
# ===========================================================================
@pytest.mark.asyncio
async def test_historial_turnos(client, fresh_db):
    t = await login_operador(client, "op1")
    await _abrir_turno(client, t["token"], 50000)
    await client.post("/api/turnos/finalizar", headers=_headers(t["token"]),
                      json={"odometro_km": 50100})
    out2 = await _abrir_turno(client, t["token"], 50100)
    await client.post("/api/turnos/finalizar", headers=_headers(t["token"]),
                      json={"odometro_km": 50250})
    r = await client.get("/api/turnos/mis-turnos", headers=_headers(t["token"]))
    assert r.status_code == 200, r.text
    items = r.json()["turnos"]
    assert len(items) == 2
    assert items[0]["inicio"] >= items[1]["inicio"]
    assert items[1]["km_recorridos"] == 100
    assert items[0]["km_recorridos"] == 150


# ===========================================================================
# 8) Resumen del turno activo para la app del taxista
# ===========================================================================
@pytest.mark.asyncio
async def test_turno_activo_resumen(client, fresh_db):
    t = await login_operador(client, "op1")
    await _abrir_turno(client, t["token"], 8000)
    r = await client.get("/api/turnos/activo", headers=_headers(t["token"]))
    assert r.status_code == 200
    act = r.json()["turno"]
    assert act["odometro_inicio"] == 8000
    assert act["fin"] is None
    # GPS del operador se refleja en el resumen
    assert "gps_estado" in act or act.get("gps", {}).get("ultima_actualizacion") is not None
