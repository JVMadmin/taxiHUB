import pytest

from tests.conftest import _headers, login_terminal

pytestmark = pytest.mark.asyncio

MSG = {"cliente_telefono": "+5219160000001", "texto": "Necesito un taxi", "sitio_id": "sitio_ajeno"}


async def test_wa_incoming_sin_auth_rechaza(client, fresh_db):
    r = await client.post("/api/wa/incoming", json=MSG)
    assert r.status_code == 401
    assert await fresh_db.wa_conversaciones.count_documents({"cliente_telefono": MSG["cliente_telefono"]}) == 0


async def test_wa_incoming_token_invalido_rechaza(client, monkeypatch):
    monkeypatch.setenv("WA_WEBHOOK_TOKEN", "token-del-puente")
    r = await client.post("/api/wa/incoming", json=MSG, headers=_headers("otro-token"))
    assert r.status_code == 401


async def test_wa_incoming_puente_con_token_elige_sitio(client, fresh_db, monkeypatch):
    monkeypatch.setenv("WA_WEBHOOK_TOKEN", "token-del-puente")
    r = await client.post("/api/wa/incoming", json=MSG, headers=_headers("token-del-puente"))
    assert r.status_code == 200, r.text
    conv = await fresh_db.wa_conversaciones.find_one({"cliente_telefono": MSG["cliente_telefono"]})
    assert conv["sitio_id"] == "sitio_ajeno"


async def test_wa_incoming_terminal_queda_en_su_sitio(client, fresh_db):
    tok = (await login_terminal(client))["token"]
    r = await client.post("/api/wa/incoming", json=MSG, headers=_headers(tok))
    assert r.status_code == 200, r.text
    conv = await fresh_db.wa_conversaciones.find_one({"cliente_telefono": MSG["cliente_telefono"]})
    assert conv["sitio_id"] != "sitio_ajeno"

    r = await client.post("/api/wa/test-incoming", json={**MSG, "cliente_telefono": "+5219160000002"},
                          headers=_headers(tok))
    assert r.status_code == 200, r.text
    conv = await fresh_db.wa_conversaciones.find_one({"cliente_telefono": "+5219160000002"})
    assert conv["sitio_id"] != "sitio_ajeno"
