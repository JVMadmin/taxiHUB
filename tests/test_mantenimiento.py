"""F9 — Mantenimiento: escrituras (registro/documento/gasto) y salud.

El módulo ya existía pero NO tenía ningún test. Cubrimos:
- Registro de mantenimiento actualiza odómetro del vehículo.
- Salud calculada por subsistemas (aceite/llantas/frenos/documentos).
- Upsert de documento vehicular.
- Gastos por mes (agregación).
- Aislamiento: vehículo ajeno → 404.
"""

import pytest

from tests.conftest import _headers
from tests.test_socios import _term_headers, _crear_dueno, _crear_vehiculo


async def _setup(client, tag="mt"):
    th = await _term_headers(client)
    d1 = await _crear_dueno(client, f"socio{tag}")
    v1 = await _crear_vehiculo(client, th, f"{tag.upper()}-101", d1["usuario"]["id"])
    return _headers(d1["token"]), v1


# ===========================================================================
# 1) Registro actualiza odómetro y alimenta salud
# ===========================================================================
@pytest.mark.asyncio
async def test_registro_actualiza_odometro_salud(client, fresh_db):
    h, v = await _setup(client, "ma")
    r = await client.post("/api/dueno/mantenimiento/registro", headers=h, json={
        "vehiculo_id": v["id"], "tipo": "aceite", "realizado_en": "2026-08-20",
        "odometro_km": 50000, "proximo_km": 55000, "costo": 850,
    })
    assert r.status_code == 200, r.text
    salud = r.json()["salud"]
    assert salud["aceite"] == 100.0  # recién hecho, sin recorrido
    assert salud["odometro_km"] == 50000

    # El vehículo refleja el odómetro
    flota = (await client.get("/api/dueno/flota", headers=h)).json()
    veh = next(x for x in flota if x["id"] == v["id"])
    assert veh["odometro_km"] == 50000


# ===========================================================================
# 2) Salud decae con el recorrido y clasifica estado
# ===========================================================================
@pytest.mark.asyncio
async def test_salud_decae_con_recorrido(client, fresh_db):
    h, v = await _setup(client, "mb")
    await client.post("/api/dueno/mantenimiento/registro", headers=h, json={
        "vehiculo_id": v["id"], "tipo": "aceite", "realizado_en": "2026-01-01",
        "odometro_km": 10000,
    })
    # 4500 km recorridos sobre 5000 del intervalo → 10% restante
    r = await client.post("/api/dueno/mantenimiento/registro", headers=h, json={
        "vehiculo_id": v["id"], "tipo": "llantas", "realizado_en": "2026-08-01",
        "odometro_km": 14500,
    })
    salud = r.json()["salud"]
    assert salud["aceite"] == 10.0
    assert salud["llantas"] == 100.0
    assert salud["estado"] in ("urgente", "proximo")


# ===========================================================================
# 3) Documento vehicular: upsert por tipo
# ===========================================================================
@pytest.mark.asyncio
async def test_documento_upsert(client, fresh_db):
    h, v = await _setup(client, "mc")
    r1 = await client.post("/api/dueno/mantenimiento/documento", headers=h, json={
        "vehiculo_id": v["id"], "tipo": "seguro", "vence_en": "2030-01-01"})
    assert r1.status_code == 200
    r2 = await client.post("/api/dueno/mantenimiento/documento", headers=h, json={
        "vehiculo_id": v["id"], "tipo": "seguro", "vence_en": "2031-06-01"})
    assert r2.status_code == 200
    detalle = (await client.get(f"/api/dueno/mantenimiento/vehiculo/{v['id']}", headers=h)).json()
    docs = detalle["salud"]["documentos_detalle"]
    seguros = [d for d in docs if d["tipo"] == "seguro"]
    assert len(seguros) == 1 and seguros[0]["vence_en"] == "2031-06-01"


# ===========================================================================
# 4) Gastos por mes: agregación correcta
#    (mongomock no soporta $substrCP; si el harness no puede, validamos los
#     documentos y confiamos en la agregación para Mongo real)
# ===========================================================================
@pytest.mark.asyncio
async def test_gastos_por_mes(client, fresh_db):
    h, v = await _setup(client, "md")
    for monto, fecha in ((500, "2026-07-10"), (300, "2026-07-25"), (200, "2026-08-01")):
        r = await client.post("/api/dueno/mantenimiento/gasto", headers=h, json={
            "vehiculo_id": v["id"], "categoria": "refacciones",
            "monto": monto, "fecha": fecha})
        assert r.status_code == 200
    try:
        gastos = (await client.get("/api/dueno/mantenimiento/gastos-por-mes", headers=h)).json()
        por_mes = {g["_id"]: g["total"] for g in gastos}
        assert por_mes.get("2026-07") == 800
        assert por_mes.get("2026-08") == 200
    except NotImplementedError:
        # Harness sin $substrCP: valida que los docs existan con montos correctos
        docs = await fresh_db.gastos_vehiculo.find({"vehiculo_id": v["id"]}).to_list(10)
        assert sorted(d["monto"] for d in docs) == [200, 300, 500]


# ===========================================================================
# 5) Aislamiento: vehículo de otro socio → 404 en escrituras
# ===========================================================================
@pytest.mark.asyncio
async def test_registro_aislamiento_404(client, fresh_db):
    h_a, _ = await _setup(client, "mea")
    h_b, v_b = await _setup(client, "meb")
    r = await client.post("/api/dueno/mantenimiento/registro", headers=h_a, json={
        "vehiculo_id": v_b["id"], "tipo": "aceite", "realizado_en": "2026-08-20",
        "odometro_km": 1000,
    })
    assert r.status_code == 404
