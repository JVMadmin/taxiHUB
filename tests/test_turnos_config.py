"""F10 — Configuración de turnos por vehículo (modo normal/relevo).

El endpoint POST /dueno/turnos/config existía sin tests ni UI. Validamos:
- Modo normal: máx 1 conductor, sin horarios.
- Modo turnos: máx 2 (día/noche), con renta semanal opcional.
- Ownership: vehículo de otro socio → 404.
- Resumen refleja la config y suma renta total.
"""

import pytest

from tests.conftest import _headers
from tests.test_socios import _term_headers, _crear_dueno, _crear_vehiculo, _crear_operador


async def _setup(client, tag="tn"):
    th = await _term_headers(client)
    d1 = await _crear_dueno(client, f"socio{tag}")
    v1 = await _crear_vehiculo(client, th, f"{tag.upper()}-201", d1["usuario"]["id"])
    op1 = await _crear_operador(client, th, f"cond{tag}", d1["usuario"]["id"], v1["id"])
    return _headers(d1["token"]), v1, op1


# ===========================================================================
# 1) Modo normal: un solo conductor
# ===========================================================================
@pytest.mark.asyncio
async def test_modo_normal_un_conductor(client, fresh_db):
    h, v, op = await _setup(client, "na")
    r = await client.post("/api/dueno/turnos/config", headers=h, json={
        "vehiculo_id": v["id"], "modo": "normal",
        "turnos": [{"operador_id": op["id"]}],
    })
    assert r.status_code == 200, r.text

    resumen = (await client.get("/api/dueno/turnos/resumen", headers=h)).json()
    item = next(x for x in resumen["vehiculos"] if x["vehiculo"]["id"] == v["id"])
    assert item["modo"] == "normal"
    assert len(item["turnos"]) == 1
    assert resumen["renta_semana_total"] == 0


# ===========================================================================
# 2) Modo normal con 2 conductores → 400
# ===========================================================================
@pytest.mark.asyncio
async def test_modo_normal_max_uno(client, fresh_db):
    h, v, op = await _setup(client, "nb")
    r = await client.post("/api/dueno/turnos/config", headers=h, json={
        "vehiculo_id": v["id"], "modo": "normal",
        "turnos": [{"operador_id": op["id"]}, {"operador_id": None}],
    })
    assert r.status_code == 400


# ===========================================================================
# 3) Modo turnos: día/noche con renta semanal → suma al total
# ===========================================================================
@pytest.mark.asyncio
async def test_modo_turnos_renta(client, fresh_db):
    h, v, op = await _setup(client, "nc")
    r = await client.post("/api/dueno/turnos/config", headers=h, json={
        "vehiculo_id": v["id"], "modo": "turnos",
        "turnos": [
            {"tipo": "dia", "operador_id": op["id"], "horario_inicio": "06:00",
             "horario_fin": "18:00", "renta_semanal": 1500},
            {"tipo": "noche", "horario_inicio": "18:00", "horario_fin": "06:00",
             "renta_semanal": 1200},
        ],
    })
    assert r.status_code == 200, r.text

    resumen = (await client.get("/api/dueno/turnos/resumen", headers=h)).json()
    assert resumen["renta_semana_total"] == 2700
    item = next(x for x in resumen["vehiculos"] if x["vehiculo"]["id"] == v["id"])
    tipos = [t.get("tipo") for t in item["turnos"]]
    assert tipos == ["dia", "noche"]


# ===========================================================================
# 4) Modo turnos con 3 → 400
# ===========================================================================
@pytest.mark.asyncio
async def test_modo_turnos_max_dos(client, fresh_db):
    h, v, op = await _setup(client, "nd")
    r = await client.post("/api/dueno/turnos/config", headers=h, json={
        "vehiculo_id": v["id"], "modo": "turnos",
        "turnos": [{"tipo": "dia"}, {"tipo": "noche"}, {"tipo": "extra"}],
    })
    assert r.status_code == 400


# ===========================================================================
# 5) Ownership: vehículo ajeno → 404
# ===========================================================================
@pytest.mark.asyncio
async def test_config_aislamiento_404(client, fresh_db):
    h_a, _, _ = await _setup(client, "nea")
    h_b, v_b, _ = await _setup(client, "neb")
    r = await client.post("/api/dueno/turnos/config", headers=h_a, json={
        "vehiculo_id": v_b["id"], "modo": "normal", "turnos": [],
    })
    assert r.status_code == 404
