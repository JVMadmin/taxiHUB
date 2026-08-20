import pytest

from tests.conftest import _headers, login_terminal

pytestmark = pytest.mark.asyncio


async def test_catalogo_sembrado_con_seis_tipos(client, fresh_db):
    r = await client.get("/api/tipos-vehiculo")
    assert r.status_code == 200, r.text
    tipos = r.json()
    assert len(tipos) == 6
    nombres = {t["nombre"] for t in tipos}
    assert nombres == {"Taxi estándar", "Sedán", "SUV", "Van", "Pickup", "Ejecutivo"}
    assert all(t["imagen_url"] for t in tipos)


async def test_lectura_catalogo_no_requiere_auth(client):
    r = await client.get("/api/tipos-vehiculo")
    assert r.status_code == 200


async def test_crear_tipo_requiere_terminal(client):
    r = await client.post("/api/tipos-vehiculo", json={"nombre": "Moto"})
    assert r.status_code == 401


async def test_crear_actualizar_tipo_vehiculo(client):
    tok = (await login_terminal(client))["token"]
    r = await client.post("/api/tipos-vehiculo", json={"nombre": "Moto", "capacidad": 1, "orden": 9},
                          headers=_headers(tok))
    assert r.status_code == 200, r.text
    tipo = r.json()
    assert tipo["nombre"] == "Moto"
    assert tipo["imagen_url"] is None

    r = await client.put(f"/api/tipos-vehiculo/{tipo['id']}", json={"descripcion": "Para trayectos cortos"},
                         headers=_headers(tok))
    assert r.status_code == 200, r.text
    assert r.json()["descripcion"] == "Para trayectos cortos"


async def test_backfill_vehiculo_existente_apunta_a_taxi_estandar(client, fresh_db):
    tok = (await login_terminal(client))["token"]
    r = await client.get("/api/vehiculos", headers=_headers(tok))
    assert r.status_code == 200, r.text
    vehiculos = r.json()
    assert len(vehiculos) > 0
    for v in vehiculos:
        assert v["tipo_vehiculo"]["nombre"] == "Taxi estándar"
        assert v["imagen_resuelta"] == v["tipo_vehiculo"]["imagen_url"]


async def test_vehiculo_nuevo_con_tipo_resuelve_imagen_del_tipo(client, fresh_db):
    tok = (await login_terminal(client))["token"]
    tipos = (await client.get("/api/tipos-vehiculo")).json()
    suv = next(t for t in tipos if t["nombre"] == "SUV")

    r = await client.post("/api/vehiculos", json={
        "numero_economico": "TX-900", "tipo_vehiculo_id": suv["id"],
    }, headers=_headers(tok))
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["tipo_vehiculo"]["nombre"] == "SUV"
    assert v["imagen_resuelta"] == suv["imagen_url"]
    assert v["foto_url"] is None


async def test_foto_propia_del_vehiculo_tiene_prioridad_sobre_el_tipo(client, fresh_db):
    tok = (await login_terminal(client))["token"]
    r = await client.get("/api/vehiculos", headers=_headers(tok))
    vehiculo_id = r.json()[0]["id"]

    await fresh_db.vehiculos.update_one(
        {"_id": __import__("bson").ObjectId(vehiculo_id)},
        {"$set": {"foto_url": "/api/files/central-taxis/vehiculos/foto-real.webp"}},
    )
    r = await client.get(f"/api/vehiculos/{vehiculo_id}", headers=_headers(tok))
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["imagen_resuelta"] == "/api/files/central-taxis/vehiculos/foto-real.webp"


async def test_no_se_puede_eliminar_tipo_en_uso(client, fresh_db):
    tok = (await login_terminal(client))["token"]
    tipos = (await client.get("/api/tipos-vehiculo")).json()
    taxi_estandar = next(t for t in tipos if t["nombre"] == "Taxi estándar")
    r = await client.delete(f"/api/tipos-vehiculo/{taxi_estandar['id']}", headers=_headers(tok))
    assert r.status_code == 409
