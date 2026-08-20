import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "taxihub_test")
os.environ.setdefault("JWT_SECRET", "test-secret-secret")
os.environ.setdefault("DEV_USER", "dev")
os.environ.setdefault("DEV_PASSWORD", "dev123")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

import server


@pytest_asyncio.fixture
async def fresh_db(monkeypatch):
    """Base de datos en memoria (mongomock) por test, aislada del entorno real."""
    client_mock = AsyncMongoMockClient()
    db_mock = client_mock[os.environ["DB_NAME"]]
    monkeypatch.setattr(server, "db", db_mock)
    await server._migraciones()
    # Usuario terminal y datos base (el startup() normal lo hace en producción)
    if not await db_mock.usuarios_terminal.count_documents({}):
        await db_mock.usuarios_terminal.insert_one(
            {"nombre": "Central", "usuario": "central",
             "password_hash": server.hash_password("central123")}
        )
    await server.seed()
    return db_mock


@pytest_asyncio.fixture
async def client(fresh_db):
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Helpers de autenticación / datos
# ---------------------------------------------------------------------------
def _headers(token):
    return {"Authorization": f"Bearer {token}"}


async def login_operador(client, usuario="op1", contrasena="taxi123"):
    r = await client.post("/api/auth/login", json={"usuario": usuario, "contrasena": contrasena})
    assert r.status_code == 200, r.text
    return r.json()


async def login_terminal(client, usuario="central", contrasena="central123"):
    r = await client.post("/api/terminal/login", json={"usuario": usuario, "contrasena": contrasena})
    assert r.status_code == 200, r.text
    return r.json()


async def crear_operador(client, term_headers, nombre, usuario, placa, extra=None):
    body = {"nombre": nombre, "telefono": "916-200-0000", "placa": placa,
            "usuario": usuario, "contrasena": "taxi123"}
    if extra:
        body.update(extra)
    r = await client.post("/api/operadores", json=body, headers=term_headers)
    assert r.status_code == 200, r.text
    return r.json()


async def operador_libre(client, tok, ids):
    """Deja a un operador libre (disponible) con GPS fresco y ubicación."""
    op = ids
    r = await client.patch(f"/api/operadores/{op}/estado", json={"estado": "libre"}, headers=_headers(tok))
    assert r.status_code == 200, r.text
    return op