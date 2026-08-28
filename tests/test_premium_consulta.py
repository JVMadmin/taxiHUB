"""F7–F16 premium: consulta terminal, asignaciones y combustible del taxista.

- Terminal SOLO LEE: conductores/expedientes, socios, mantenimiento,
  combustible, asignaciones, dashboard.
- Asignaciones socio→unidad→conductor con historial + aislamiento.
- Combustible: el taxista registra (con ticket opcional); queda visible
  para el socio (mismo vehículo) — §27.
"""

import io
import struct
import zlib

import pytest
from bson import ObjectId

from tests.conftest import _headers, login_operador, login_terminal
from tests.test_socios import _term_headers, _crear_dueno, _crear_vehiculo, _crear_operador


async def _setup_flota(client, tag="pc"):
    th = await _term_headers(client)
    d1 = await _crear_dueno(client, f"socio{tag}")
    v1 = await _crear_vehiculo(client, th, f"{tag.upper()}-401", d1["usuario"]["id"])
    op1 = await _crear_operador(client, th, f"cond{tag}", d1["usuario"]["id"], v1["id"])
    return th, d1, v1, op1


# ===========================================================================
# 1) Terminal consulta: choferes + expediente (solo lectura)
# ===========================================================================
@pytest.mark.asyncio
async def test_terminal_consulta_conductores_expediente(client, fresh_db):
    th, d1, v1, op1 = await _setup_flota(client, "ca")
    term = await login_terminal(client)
    tth = _headers(term["token"])

    r = await client.get("/api/terminal/conductores", headers=tth)
    assert r.status_code == 200
    item = next(x for x in r.json() if x["usuario"] == f"condca")
    assert item["vehiculo"]["numero_economico"] == "CA-401"

    r = await client.get(f"/api/terminal/conductores/{op1['id']}", headers=tth)
    assert r.status_code == 200, r.text
    ex = r.json()
    assert ex["conductor"]["nombre"] == "Cond condca"
    assert ex["unidad"]["socio"] == "Socioca"


# ===========================================================================
# 2) Terminal consulta: socios y detalle
# ===========================================================================
@pytest.mark.asyncio
async def test_terminal_consulta_socios(client, fresh_db):
    th, d1, v1, op1 = await _setup_flota(client, "cb")
    term = await login_terminal(client)
    tth = _headers(term["token"])
    r = await client.get("/api/terminal/socios", headers=tth)
    socio = next(x for x in r.json() if x["usuario"] == "sociocb")
    assert socio["unidades"] == 1
    r = await client.get(f"/api/terminal/socios/{socio['id']}", headers=tth)
    d = r.json()
    assert d["unidades"] == 1
    assert d["vehiculos"][0]["conductor"] == "Cond condcb"


# ===========================================================================
# 3) Asignaciones: crear cierra la previa y actualiza unidad; finalizar
# ===========================================================================
@pytest.mark.asyncio
async def test_asignaciones_ciclo(client, fresh_db):
    th, d1, v1, op1 = await _setup_flota(client, "cc")
    h = _headers(d1["token"])
    # Segundo conductor
    op2 = await _crear_operador(client, th, "condcc2", d1["usuario"]["id"], v1["id"])

    r = await client.post("/api/dueno/asignaciones", headers=h, json={
        "vehiculo_id": v1["id"], "operador_id": op2["id"]})
    assert r.status_code == 200, r.text
    # El vehículo ahora apunta a op2
    veh = await fresh_db.vehiculos.find_one({"_id": ObjectId(v1["id"])})
    assert veh["operador_conductor_id"] == op2["id"]

    # Asignación previa de op1 quedó cerrada si existía; historial = 1 activa
    lista = (await client.get("/api/dueno/asignaciones", headers=h)).json()
    activas = [a for a in lista if a["activo"]]
    assert len(activas) == 1 and activas[0]["conductor"] == "Cond condcc2"

    # Finalizar
    r = await client.post(f"/api/dueno/asignaciones/{activas[0]['id']}/finalizar", headers=h)
    assert r.status_code == 200
    lista = (await client.get("/api/dueno/asignaciones", headers=h)).json()
    assert all(not a["activo"] for a in lista)
    assert len(lista) == 1  # historial conservado


# ===========================================================================
# 4) Asignaciones aisladas por socio
# ===========================================================================
@pytest.mark.asyncio
async def test_asignaciones_aislamiento(client, fresh_db):
    th_a, d_a, v_a, op_a = await _setup_flota(client, "cd")
    th_b, d_b, v_b, op_b = await _setup_flota(client, "ce")
    # A intenta asignar su conductor al vehículo de B → 404
    r = await client.post("/api/dueno/asignaciones", headers=_headers(d_a["token"]), json={
        "vehiculo_id": v_b["id"], "operador_id": op_a["id"]})
    assert r.status_code == 404
    # A no ve asignaciones de B
    r = await client.get("/api/dueno/asignaciones", headers=_headers(d_a["token"]))
    assert all(a["vehiculo"] != "CE-401" for a in r.json())


# ===========================================================================
# 5) Combustible del taxista: registra con ticket y queda visible al socio
# ===========================================================================
@pytest.mark.asyncio
async def test_combustible_taxista(client, fresh_db):
    th, d1, v1, op1 = await _setup_flota(client, "cf")
    def png():
        def chunk(t, d):
            import struct as s, zlib as z
            return s.pack(">I", len(d)) + t + d + s.pack(">I", z.crc32(t + d) & 0xFFFFFFFF)
        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00")) + chunk(b"IEND", b""))

    t = await login_operador(client, "condcf")  # conductor de la flota del socio
    r = await client.post("/api/combustible", headers=_headers(t["token"]),
                          files={"ticket": ("ticket.png", png(), "image/png")},
                          data={"fecha": "2026-08-27", "litros": "40", "costo": "800",
                                "odometro_km": "51200", "estacion": "Pemex centro"})
    assert r.status_code == 200, r.text
    assert r.json()["ticket_url"]

    # Historial propio
    r = await client.get("/api/combustible/mis-cargas", headers=_headers(t["token"]))
    assert len(r.json()["cargas"]) == 1

    # Visible en la consulta de la terminal (registro por taxista)
    term = await login_terminal(client)
    cargas = (await client.get("/api/terminal/combustible", headers=_headers(term["token"]))).json()["cargas"]
    assert any(c["registro_por"] == "Cond condcf" for c in cargas)


# ===========================================================================
# 6) Pasajero no puede registrar combustible (scope)
# ===========================================================================
@pytest.mark.asyncio
async def test_combustible_scope(client, fresh_db):
    r = await client.post("/api/clientes", json={"nombre": "X", "telefono": "1",
                                                 "usuario": "px", "contrasena": "p"})
    p_tok = r.json()["token"]
    r = await client.post("/api/combustible", headers=_headers(p_tok),
                          data={"fecha": "2026-08-27", "litros": "1", "costo": "1", "odometro_km": "1"})
    assert r.status_code in (401, 403)


# ===========================================================================
# 7) Dashboard del sitio (terminal)
# ===========================================================================
@pytest.mark.asyncio
async def test_dashboard_sitio(client, fresh_db):
    term = await login_terminal(client)
    r = await client.get("/api/terminal/dashboard", headers=_headers(term["token"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert set(d["estados"].keys()) >= {"libre", "ocupado", "fuera_de_servicio"}
    assert "servicios_hoy" in d and "socios" in d
