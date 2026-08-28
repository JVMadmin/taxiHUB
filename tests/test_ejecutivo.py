"""F12 â€” Dashboard ejecutivo del socio (§25).

Agregaciones para gráficas:
- Servicios por hora (hoy) y por día (últimos N días).
- Servicios por conductor (mes).
- Kilómetros por turno y combustible por mes.
- Salud de flota (urgentes/próximos) y documentos vencidos.
Aislamiento: solo datos de la flota del socio (propietario_id).
"""

import pytest
from datetime import datetime, timezone

from tests.conftest import _headers
from tests.test_socios import _term_headers, _crear_dueno, _crear_vehiculo, _crear_operador


async def _setup(client, tag="dj"):
    th = await _term_headers(client)
    d1 = await _crear_dueno(client, f"socio{tag}")
    v1 = await _crear_vehiculo(client, th, f"{tag.upper()}-301", d1["usuario"]["id"])
    op1 = await _crear_operador(client, th, f"cond{tag}", d1["usuario"]["id"], v1["id"])
    return _headers(d1["token"]), v1, op1


# ===========================================================================
# 1) Estructura completa de la respuesta
# ===========================================================================
@pytest.mark.asyncio
async def test_estructura_dashboard_ejecutivo(client, fresh_db):
    h, v, op = await _setup(client, "da")
    r = await client.get("/api/dueno/ejecutivo", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "servicios_por_hora" in d
    assert "servicios_por_dia" in d
    assert "servicios_por_conductor" in d
    assert "combustible_por_mes" in d
    assert "salud_flota" in d
    assert "resumen" in d
    assert set(d["resumen"].keys()) >= {"hoy", "completados_mes", "cancelados_mes", "ingresos_mes", "km_totales"}


# ===========================================================================
# 2) Servicios por conductor: conteos correctos (mes actual)
# ===========================================================================
@pytest.mark.asyncio
async def test_por_conductor(client, fresh_db):
    h, v, op = await _setup(client, "db")
    oid = op["id"]
    mes = datetime.now(timezone.utc).strftime("%Y-%m")
    await fresh_db.servicios.insert_many([
        {"operador_asignado_id": oid, "estado": "completado", "costo": 100,
         "timestamp_creacion": f"{mes}-01T08:15:00+00:00"},
        {"operador_asignado_id": oid, "estado": "completado", "costo": 60,
         "timestamp_creacion": f"{mes}-02T09:45:00+00:00"},
        {"operador_asignado_id": oid, "estado": "cancelado",
         "timestamp_creacion": f"{mes}-02T10:00:00+00:00"},
    ])
    r = await client.get("/api/dueno/ejecutivo", headers=h)
    por_cond = {x["conductor"]: x for x in r.json()["servicios_por_conductor"]}
    assert por_cond["Cond conddb"]["completados"] == 2
    assert por_cond["Cond conddb"]["ingresos"] == 160


# ===========================================================================
# 3) Servicios por hora (de hoy) y por día (ventana)
# ===========================================================================
@pytest.mark.asyncio
async def test_series_hora_y_dia(client, fresh_db):
    h, v, op = await _setup(client, "dc")
    oid = op["id"]
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mes = datetime.now(timezone.utc).strftime("%Y-%m")
    await fresh_db.servicios.insert_many([
        {"operador_asignado_id": oid, "estado": "completado", "costo": 50,
         "timestamp_creacion": f"{hoy}T08:15:00+00:00"},
        {"operador_asignado_id": oid, "estado": "completado", "costo": 70,
         "timestamp_creacion": f"{hoy}T08:40:00+00:00"},
        {"operador_asignado_id": oid, "estado": "completado", "costo": 90,
         "timestamp_creacion": f"{hoy}T10:10:00+00:00"},
    ])
    r = await client.get("/api/dueno/ejecutivo", headers=h)
    d = r.json()
    horas = {x["hora"]: x["total"] for x in d["servicios_por_hora"]}
    assert horas.get(8) == 2
    assert horas.get(10) == 1
    # Resumen del día
    assert d["resumen"]["hoy"] == 3


# ===========================================================================
# 4) Combustible por mes (solo su flota)
# ===========================================================================
@pytest.mark.asyncio
async def test_combustible_por_mes(client, fresh_db):
    h, v, op = await _setup(client, "dd")
    await fresh_db.combustible_cargas.insert_many([
        {"vehiculo_id": v["id"], "fecha": "2026-07-05", "litros": 40, "costo": 800, "odometro_km": 50000},
        {"vehiculo_id": v["id"], "fecha": "2026-08-05", "litros": 35, "costo": 700, "odometro_km": 50400},
    ])
    r = await client.get("/api/dueno/ejecutivo", headers=h)
    meses = {x["mes"]: x["total"] for x in r.json()["combustible_por_mes"]}
    assert meses.get("2026-07") == 800
    assert meses.get("2026-08") == 700


# ===========================================================================
# 5) Aislamiento: servicios de otra flota no cuentan
# ===========================================================================
@pytest.mark.asyncio
async def test_aislamiento_ejecutivo(client, fresh_db):
    h_a, v_a, op_a = await _setup(client, "dea")
    h_b, v_b, op_b = await _setup(client, "deb")
    mes = datetime.now(timezone.utc).strftime("%Y-%m")
    # Solo el conductor B tiene servicios
    await fresh_db.servicios.insert_many([
        {"operador_asignado_id": op_b["id"], "estado": "completado", "costo": 300,
         "timestamp_creacion": f"{mes}-01T08:00:00+00:00"},
    ])
    ra = await client.get("/api/dueno/ejecutivo", headers=h_a)
    rb = await client.get("/api/dueno/ejecutivo", headers=h_b)
    assert ra.json()["resumen"]["completados_mes"] == 0
    assert rb.json()["resumen"]["completados_mes"] == 1
