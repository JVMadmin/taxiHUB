"""Alta de cuentas de terminal: nadie crea cuentas en la central de otro."""
import pytest

from tests.conftest import _headers, login_terminal

pytestmark = pytest.mark.asyncio


def _cuenta(usuario, sitio=None):
    body = {"nombre": "Operadora", "usuario": usuario, "contrasena": "clave-prueba-1"}
    if sitio:
        body["sitio_id"] = sitio
    return body


async def test_terminal_no_crea_cuentas_en_otra_central(client, fresh_db):
    h = _headers((await login_terminal(client))["token"])
    r = await client.post("/api/terminal/usuarios", json=_cuenta("intrusa", "sitio_real"), headers=h)
    assert r.status_code == 403
    assert await fresh_db.usuarios_terminal.count_documents({"usuario": "intrusa"}) == 0


async def test_terminal_crea_cuentas_en_su_central(client, fresh_db):
    tok = await login_terminal(client)
    r = await client.post("/api/terminal/usuarios", json=_cuenta("companera"), headers=_headers(tok["token"]))
    assert r.status_code == 200, r.text
    doc = await fresh_db.usuarios_terminal.find_one({"usuario": "companera"})
    assert doc["sitio_id"] == "default"


async def test_produccion_sin_token_rechaza_incluso_central_vacia(client, fresh_db, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    r = await client.post("/api/terminal/usuarios", json=_cuenta("anonima", "sitio_nuevo"))
    assert r.status_code == 401
    assert await fresh_db.usuarios_terminal.count_documents({"usuario": "anonima"}) == 0


async def test_local_sin_token_solo_primera_cuenta(client, fresh_db):
    r = await client.post("/api/terminal/usuarios", json=_cuenta("primera", "sitio_local"))
    assert r.status_code == 200, r.text
    r = await client.post("/api/terminal/usuarios", json=_cuenta("segunda", "sitio_local"))
    assert r.status_code == 401


async def test_desarrollador_crea_en_cualquier_central(client, fresh_db):
    tok = (await client.post("/api/dev/login", json={"usuario": "dev", "contrasena": "dev123"})).json()["token"]
    r = await client.post("/api/terminal/usuarios", json=_cuenta("admin_real", "sitio_real"), headers=_headers(tok))
    assert r.status_code == 200, r.text
    doc = await fresh_db.usuarios_terminal.find_one({"usuario": "admin_real"})
    assert doc["sitio_id"] == "sitio_real"
