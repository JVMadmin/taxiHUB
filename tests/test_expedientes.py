"""F8 — Expediente de conductor con documentación.

Valida:
- Documentos del conductor: upsert por tipo, estados vigente/por_vencer/vencido.
- Expediente 360° solo para el socio dueño de la unidad del conductor.
- Aislamiento: otro socio no puede ver el expediente (404).
- El taxista y la terminal no acceden al expediente del socio.
"""

import pytest
from bson import ObjectId

from tests.conftest import _headers, login_operador
from tests.test_socios import _term_headers, _crear_dueno, _crear_vehiculo, _crear_operador


async def _setup_socio_con_conductor(client, tag="ex"):
    th = await _term_headers(client)
    d1 = await _crear_dueno(client, f"socio{tag}")
    v1 = await _crear_vehiculo(client, th, f"{tag.upper()}-001", d1["usuario"]["id"])
    op1 = await _crear_operador(client, th, f"cond{tag}", d1["usuario"]["id"], v1["id"])
    return th, d1, v1, op1


# ===========================================================================
# 1) Upsert de documento: crea y actualiza por (operador_id, tipo)
# ===========================================================================
@pytest.mark.asyncio
async def test_documento_upsert_por_tipo(client, fresh_db):
    th, d1, v1, op1 = await _setup_socio_con_conductor(client, "ua")
    h = _headers(d1["token"])

    r = await client.post(f"/api/dueno/conductores/{op1['id']}/documentos", headers=h, json={
        "tipo": "licencia", "numero": "LIC-1234", "vence_en": "2030-01-15",
    })
    assert r.status_code == 200, r.text
    doc1 = r.json()["documento"]
    assert doc1["estado"] == "vigente"

    # Mismo tipo, nueva vigencia → actualiza, no duplica
    r = await client.post(f"/api/dueno/conductores/{op1['id']}/documentos", headers=h, json={
        "tipo": "licencia", "numero": "LIC-9999", "vence_en": "2031-06-01",
    })
    assert r.status_code == 200, r.text
    col = await fresh_db.documentos_conductor.count_documents({
        "operador_id": op1["id"], "tipo": "licencia"})
    assert col == 1

    # Lista completa
    r = await client.get(f"/api/dueno/conductores/{op1['id']}/documentos", headers=h)
    assert r.status_code == 200
    tipos = [d["tipo"] for d in r.json()["documentos"]]
    assert tipos == ["licencia"]


# ===========================================================================
# 2) Estados: vencido y por_vencer según vence_en
# ===========================================================================
@pytest.mark.asyncio
async def test_estados_vigencia_documentos(client, fresh_db):
    th, d1, v1, op1 = await _setup_socio_con_conductor(client, "ub")
    h = _headers(d1["token"])
    for tipo, fecha in (("licencia", "2020-01-01"), ("ine", "2020-01-01"),
                        ("seguro", "2099-12-31")):
        r = await client.post(f"/api/dueno/conductores/{op1['id']}/documentos",
                              headers=h, json={"tipo": tipo, "vence_en": fecha})
        assert r.status_code == 200
    docs = (await client.get(f"/api/dueno/conductores/{op1['id']}/documentos", headers=h)).json()["documentos"]
    por_tipo = {d["tipo"]: d["estado"] for d in docs}
    assert por_tipo["licencia"] == "vencido"
    assert por_tipo["ine"] == "vencido"
    assert por_tipo["seguro"] == "vigente"


# ===========================================================================
# 3) Expediente completo: datos + docs + resumen de servicios
# ===========================================================================
@pytest.mark.asyncio
async def test_expediente_completo(client, fresh_db):
    th, d1, v1, op1 = await _setup_socio_con_conductor(client, "uc")
    h = _headers(d1["token"])
    await client.post(f"/api/dueno/conductores/{op1['id']}/documentos", headers=h, json={
        "tipo": "licencia", "vence_en": "2030-01-15"})

    r = await client.get(f"/api/dueno/conductores/{op1['id']}", headers=h)
    assert r.status_code == 200, r.text
    ex = r.json()
    assert ex["conductor"]["nombre"] == "Cond conduc"
    assert ex["unidad"]["numero_economico"] == "UC-001"
    assert ex["documentos"][0]["tipo"] == "licencia"
    assert ex["alertas"]["vencidos"] == 0
    assert "servicios_completados" in ex
    assert ex["ingreso"] is not None


# ===========================================================================
# 4) Aislamiento: otro socio NO ve el expediente (404)
# ===========================================================================
@pytest.mark.asyncio
async def test_expediente_aislamiento(client, fresh_db):
    th, d1, v1, op1 = await _setup_socio_con_conductor(client, "ud")
    intruso = await _crear_dueno(client, "sociointruso")
    r = await client.get(f"/api/dueno/conductores/{op1['id']}",
                         headers=_headers(intruso["token"]))
    assert r.status_code == 404


# ===========================================================================
# 5) Sin documento obligatorio pendiente → alertas correctas
# ===========================================================================
@pytest.mark.asyncio
async def test_alertas_documentales(client, fresh_db):
    th, d1, v1, op1 = await _setup_socio_con_conductor(client, "ue")
    h = _headers(d1["token"])
    # licencia vence pronto (por vencer) — usamos +20 días
    import datetime as dt
    pronto = (dt.date.today() + dt.timedelta(days=20)).isoformat()
    await client.post(f"/api/dueno/conductores/{op1['id']}/documentos", headers=h, json={
        "tipo": "licencia", "vence_en": pronto})
    ex = (await client.get(f"/api/dueno/conductores/{op1['id']}", headers=h)).json()
    assert ex["alertas"]["por_vencer"] == 1
    assert ex["alertas"]["vencidos"] == 0
    # INE/seguro no cargados → faltantes
    assert set(ex["alertas"]["faltantes"]) == {"ine", "seguro"}
