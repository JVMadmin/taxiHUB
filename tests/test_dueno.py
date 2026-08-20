"""Tests del rol Dueño de flota: alta protegida, login, y sobre todo el
aislamiento de datos por ownership (`vehiculos.propietario_id`) — es la parte
crítica de seguridad de esta feature, así que se prueba explícitamente que un
dueño nunca ve vehículos/servicios que no son suyos.
"""

import pytest

import server
from tests.conftest import _headers, login_operador, login_terminal


async def crear_dueno(client, term_headers, nombre, usuario, contrasena="dueno123"):
    r = await client.post("/api/dueno/usuarios", headers=term_headers,
                          json={"nombre": nombre, "usuario": usuario, "contrasena": contrasena})
    assert r.status_code == 200, r.text
    return r.json()


async def login_dueno(client, usuario, contrasena="dueno123"):
    r = await client.post("/api/dueno/login", json={"usuario": usuario, "contrasena": contrasena})
    assert r.status_code == 200, r.text
    return r.json()


async def _asignar_propietario(client, term_headers, vehiculo_id, dueno_id):
    r = await client.put(f"/api/vehiculos/{vehiculo_id}", headers=term_headers,
                         json={"propietario_id": dueno_id})
    assert r.status_code == 200, r.text
    return r.json()


# ===========================================================================
# Alta de cuentas: solo la terminal puede crear dueños (sin registro público)
# ===========================================================================
@pytest.mark.asyncio
async def test_dueno_alta_requiere_terminal_sin_auth(client):
    r = await client.post("/api/dueno/usuarios", json={"nombre": "X", "usuario": "x", "contrasena": "y"})
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_operador_no_puede_crear_dueno(client):
    t = await login_operador(client, "op1")
    r = await client.post("/api/dueno/usuarios", headers=_headers(t["token"]),
                          json={"nombre": "X", "usuario": "x", "contrasena": "y"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_dueno_login_y_perfil(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    await crear_dueno(client, th, "Flota Palenque", "flota_a")
    d = await login_dueno(client, "flota_a")
    r = await client.get("/api/dueno/me", headers=_headers(d["token"]))
    assert r.status_code == 200, r.text
    assert r.json()["usuario"] == "flota_a"


@pytest.mark.asyncio
async def test_dueno_password_hash_nunca_se_filtra(client, fresh_db):
    tr = await login_terminal(client)
    da = await crear_dueno(client, _headers(tr["token"]), "Flota A", "flota_a")
    assert "password_hash" not in da


# ===========================================================================
# Aislamiento de flota: cada dueño ve SOLO sus vehículos
# ===========================================================================
@pytest.mark.asyncio
async def test_dueno_aislamiento_de_flota(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    da = await crear_dueno(client, th, "Flota A", "flota_a")
    db_ = await crear_dueno(client, th, "Flota B", "flota_b")
    tok_a = (await login_dueno(client, "flota_a"))["token"]
    tok_b = (await login_dueno(client, "flota_b"))["token"]

    op1 = await fresh_db.operadores.find_one({"usuario": "op1"})
    op2 = await fresh_db.operadores.find_one({"usuario": "op2"})
    veh1 = await fresh_db.vehiculos.find_one({"operador_conductor_id": str(op1["_id"])})
    veh2 = await fresh_db.vehiculos.find_one({"operador_conductor_id": str(op2["_id"])})

    await _asignar_propietario(client, th, veh1["_id"], da["id"])
    await _asignar_propietario(client, th, veh2["_id"], db_["id"])

    r = await client.get("/api/dueno/flota", headers=_headers(tok_a))
    assert r.status_code == 200, r.text
    assert [v["id"] for v in r.json()] == [str(veh1["_id"])]

    r = await client.get("/api/dueno/flota", headers=_headers(tok_b))
    assert [v["id"] for v in r.json()] == [str(veh2["_id"])]

    # A no puede ver el detalle del vehículo de B (ni con el id correcto)
    r = await client.get(f"/api/dueno/flota/{veh2['_id']}", headers=_headers(tok_a))
    assert r.status_code == 404

    # Un vehículo sin dueño (todos los demás sembrados) no aparece en ninguna flota
    op3 = await fresh_db.operadores.find_one({"usuario": "op3"})
    veh3 = await fresh_db.vehiculos.find_one({"operador_conductor_id": str(op3["_id"])})
    r = await client.get("/api/dueno/flota", headers=_headers(tok_a))
    assert all(v["id"] != str(veh3["_id"]) for v in r.json())


# ===========================================================================
# Aislamiento de servicios + métricas persistidas al terminar
# ===========================================================================
@pytest.mark.asyncio
async def test_dueno_servicios_aislados_y_metricas(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    da = await crear_dueno(client, th, "Flota A", "flota_a")
    tok_a = (await login_dueno(client, "flota_a"))["token"]

    t1 = await login_operador(client, "op1")
    op1 = t1["operador"]["id"]
    veh1 = await fresh_db.vehiculos.find_one({"operador_conductor_id": op1})
    await _asignar_propietario(client, th, veh1["_id"], da["id"])

    await client.patch(f"/api/operadores/{op1}/estado", json={"estado": "libre"}, headers=_headers(t1["token"]))
    await client.post("/api/locations", headers=_headers(t1["token"]), json={"lat": 17.5099, "lng": -91.9847})

    r = await client.post("/api/servicios", headers=th, json={
        "origen": {"lat": 17.5099, "lng": -91.9847}, "destino": {"lat": 17.4999, "lng": -91.9747},
    })
    sid = r.json()["servicio"]["id"]
    await client.post("/api/dispatch/offer", headers=th, json={"servicio_id": sid})
    await client.post(f"/api/servicios/{sid}/aceptar", headers=_headers(t1["token"]))
    await client.post(f"/api/servicios/{sid}/iniciar", headers=_headers(t1["token"]))
    r = await client.post(f"/api/servicios/{sid}/terminar", headers=_headers(t1["token"]))
    assert r.status_code == 200, r.text
    assert r.json()["duracion_s"] is not None
    assert r.json()["distancia_m"] is not None  # cae a línea recta origen->destino (sin track en la ventana)

    # El dueño de ese vehículo ve el servicio completado
    r = await client.get("/api/dueno/servicios", headers=_headers(tok_a))
    assert r.status_code == 200, r.text
    assert [s["id"] for s in r.json()] == [sid]

    r = await client.get(f"/api/dueno/servicios/{sid}", headers=_headers(tok_a))
    assert r.status_code == 200, r.text
    assert r.json()["vehiculo"]["numero_economico"] == veh1["numero_economico"]

    # Filtro por estado/vehículo funciona
    r = await client.get("/api/dueno/servicios", params={"estado": "cancelado"}, headers=_headers(tok_a))
    assert r.json() == []

    # Un dueño sin ese vehículo no ve nada
    db_ = await crear_dueno(client, th, "Flota B", "flota_b")
    tok_b = (await login_dueno(client, "flota_b"))["token"]
    r = await client.get("/api/dueno/servicios", headers=_headers(tok_b))
    assert r.json() == []
    r = await client.get(f"/api/dueno/servicios/{sid}", headers=_headers(tok_b))
    assert r.status_code == 404
    # Filtrar por un vehículo que no es suyo: 404 (no delata que el vehículo existe)
    r = await client.get("/api/dueno/servicios", params={"vehiculo_id": str(veh1["_id"])}, headers=_headers(tok_b))
    assert r.status_code == 404


# ===========================================================================
# Dashboard: cuenta solo lo propio
# ===========================================================================
@pytest.mark.asyncio
async def test_dueno_dashboard_cuenta_solo_lo_propio(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    da = await crear_dueno(client, th, "Flota A", "flota_a")
    tok_a = (await login_dueno(client, "flota_a"))["token"]

    op1 = await fresh_db.operadores.find_one({"usuario": "op1"})
    veh1 = await fresh_db.vehiculos.find_one({"operador_conductor_id": str(op1["_id"])})
    await _asignar_propietario(client, th, veh1["_id"], da["id"])

    r = await client.get("/api/dueno/dashboard", headers=_headers(tok_a))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["taxis_registrados"] == 1
    assert body["servicios_hoy"] == 0


# ===========================================================================
# No romper lo existente: el resto de endpoints de vehículos siguen igual
# ===========================================================================
@pytest.mark.asyncio
async def test_vehiculos_sin_propietario_no_se_rompen(client, fresh_db):
    tr = await login_terminal(client)
    th = _headers(tr["token"])
    r = await client.get("/api/vehiculos", headers=th)
    assert r.status_code == 200, r.text
    assert all(v.get("propietario_id") is None for v in r.json())
