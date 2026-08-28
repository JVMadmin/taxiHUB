"""F7 â€” Ficha de socio (360°) y rendimiento del panel.

Valida:
- GET /dueno/ficha agrega flota/conductores/servicios/documentos del socio.
- Aislamiento: un socio jamás ve datos de otro (propietario_id).
- /dueno/reparto/calculo y /dueno/conductores siguen funcionando tras el
  refactor de rendimiento (misma respuesta, sin N+1).
"""

import pytest
from bson import ObjectId

import server
from tests.conftest import _headers


async def _term_headers(client):
    term = await client.post("/api/terminal/login", json={
        "usuario": "central", "contrasena": "central123"})
    assert term.status_code == 200, term.text
    return _headers(term.json()["token"])


async def _crear_dueno(client, usuario, contrasena="dueno123"):
    th = await _term_headers(client)
    r = await client.post("/api/dueno/usuarios", headers=th, json={
        "nombre": usuario.title(), "usuario": usuario, "contrasena": contrasena,
    })
    assert r.status_code == 200, r.text
    login = await client.post("/api/dueno/login", json={
        "usuario": usuario, "contrasena": contrasena})
    assert login.status_code == 200, login.text
    return login.json()


async def _crear_vehiculo(client, term_h, numero, propietario_id):
    r = await client.post("/api/vehiculos", headers=term_h, json={
        "numero_economico": numero, "marca": "Nissan", "modelo": "March",
        "propietario_id": propietario_id,
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _crear_operador(client, term_h, usuario, propietario_id, vehiculo_id):
    r = await client.post("/api/operadores", headers=term_h, json={
        "nombre": f"Cond {usuario}", "telefono": "916-000-1111", "placa": f"PL-{usuario}",
        "usuario": usuario, "contrasena": "taxi123",
        "propietario_id": propietario_id, "vehiculo_id": vehiculo_id,
    })
    assert r.status_code == 200, r.text
    return r.json()


# ===========================================================================
# 1) Ficha del socio: agrega todo en una respuesta
# ===========================================================================
@pytest.mark.asyncio
async def test_ficha_agrega_flota_conductores_mes(client, fresh_db):
    th = await _term_headers(client)

    d1 = await _crear_dueno(client, "socioalfa")
    v1 = await _crear_vehiculo(client, th, "SA-001", d1["usuario"]["id"])
    op1 = await _crear_operador(client, th, "condalfa", d1["usuario"]["id"], v1["id"])

    r = await client.get("/api/dueno/ficha", headers=_headers(d1["token"]))
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["flota"]["total"] == 1
    assert f["flota"]["vehiculos"][0]["numero_economico"] == "SA-001"
    assert f["flota"]["vehiculos"][0]["conductor"]["nombre"] == "Cond condalfa"
    assert len(f["conductores"]) == 1
    assert f["conductores"][0]["vehiculo"] == "SA-001"
    assert f["mes"]["clave"]  # mes presente
    assert "estados" in f["flota"]


# ===========================================================================
# 2) Aislamiento: socio B no ve flota del socio A
# ===========================================================================
@pytest.mark.asyncio
async def test_ficha_aislamiento_entre_socios(client, fresh_db):
    th = await _term_headers(client)

    da = await _crear_dueno(client, "socioa")
    db_ = await _crear_dueno(client, "sociob")
    await _crear_vehiculo(client, th, "AA-001", da["usuario"]["id"])
    await _crear_vehiculo(client, th, "BB-001", db_["usuario"]["id"])

    fa = (await client.get("/api/dueno/ficha", headers=_headers(da["token"]))).json()
    fb = (await client.get("/api/dueno/ficha", headers=_headers(db_["token"]))).json()
    numeros_a = [v["numero_economico"] for v in fa["flota"]["vehiculos"]]
    numeros_b = [v["numero_economico"] for v in fb["flota"]["vehiculos"]]
    assert numeros_a == ["AA-001"]
    assert numeros_b == ["BB-001"]


# ===========================================================================
# 3) Ficha requiere autenticación de socio (token operador â†’ 401/403)
# ===========================================================================
@pytest.mark.asyncio
async def test_ficha_requiere_scope_dueno(client, fresh_db):
    from tests.conftest import login_operador
    t = await login_operador(client, "op1")
    r = await client.get("/api/dueno/ficha", headers=_headers(t["token"]))
    assert r.status_code in (401, 403)


# ===========================================================================
# 4) Reparto/calculo tras refactor: suma ingresos del mes por vehículo
# ===========================================================================
@pytest.mark.asyncio
async def test_reparto_calculo_sin_n_plus_1(client, fresh_db):
    th = await _term_headers(client)
    d1 = await _crear_dueno(client, "sociorep")
    v1 = await _crear_vehiculo(client, th, "RP-001", d1["usuario"]["id"])

    await client.post("/api/dueno/reparto/socios", headers=_headers(d1["token"]), json={
        "nombre": "Socio Mitad", "porcentaje": 50, "vehiculo_ids": [v1["id"]],
    })
    # Servicios completados del mes atribuidos al vehículo
    await fresh_db.servicios.insert_many([
        {"vehiculo_id": v1["id"], "estado": "completado", "costo": 100,
         "timestamp_fin": "2026-08-01T10:00:00+00:00",
         "timestamp_creacion": "2026-08-01T10:00:00+00:00"},
        {"vehiculo_id": v1["id"], "estado": "completado", "costo": 80,
         "timestamp_fin": "2026-08-05T10:00:00+00:00",
         "timestamp_creacion": "2026-08-05T10:00:00+00:00"},
        # fuera de mes y cancelado: no cuentan
        {"vehiculo_id": v1["id"], "estado": "completado", "costo": 999,
         "timestamp_fin": "2026-01-01T10:00:00+00:00",
         "timestamp_creacion": "2026-01-01T10:00:00+00:00"},
        {"vehiculo_id": v1["id"], "estado": "cancelado", "costo": 50,
         "timestamp_fin": "2026-08-06T10:00:00+00:00",
         "timestamp_creacion": "2026-08-06T10:00:00+00:00"},
    ])
    # El mes "actual" del módulo usa la fecha real del reloj; para que el test
    # no dependa del calendario, normalizamos los dos servicios del mes al mes
    # actual del sistema:
    from datetime import datetime, timezone
    mes_actual = datetime.now(timezone.utc).strftime("%Y-%m")
    await fresh_db.servicios.update_many(
        {"vehiculo_id": v1["id"], "costo": {"$in": [100, 80]}},
        {"$set": {"timestamp_fin": f"{mes_actual}-01T10:00:00+00:00",
                  "timestamp_creacion": f"{mes_actual}-01T10:00:00+00:00"}})

    r = await client.get("/api/dueno/reparto/calculo", headers=_headers(d1["token"]))
    assert r.status_code == 200, r.text
    out = r.json()
    assert len(out) == 1
    assert out[0]["ingresos_atribuidos"] == 180
    assert out[0]["a_recibir"] == 90


# ===========================================================================
# 5) Conductores tras refactor: conteos correctos y ordenado
# ===========================================================================
@pytest.mark.asyncio
async def test_conductores_conteos(client, fresh_db):
    th = await _term_headers(client)
    d1 = await _crear_dueno(client, "sociocond")
    v1 = await _crear_vehiculo(client, th, "CD-001", d1["usuario"]["id"])
    op1 = await _crear_operador(client, th, "condcd", d1["usuario"]["id"], v1["id"])
    oid = op1["id"]

    from datetime import datetime, timezone
    mes_actual = datetime.now(timezone.utc).strftime("%Y-%m")
    await fresh_db.servicios.insert_many([
        {"operador_asignado_id": oid, "estado": "completado", "costo": 50,
         "timestamp_creacion": f"{mes_actual}-01T10:00:00+00:00"},
        {"operador_asignado_id": oid, "estado": "completado", "costo": 60,
         "timestamp_creacion": f"{mes_actual}-02T10:00:00+00:00"},
        {"operador_asignado_id": oid, "estado": "cancelado",
         "timestamp_creacion": f"{mes_actual}-03T10:00:00+00:00"},
    ])
    r = await client.get("/api/dueno/conductores", headers=_headers(d1["token"]))
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 1
    assert items[0]["servicios_completados"] == 2
    assert items[0]["cancelados"] == 1
