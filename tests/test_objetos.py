"""F11 â€” Objetos olvidados con ciclo de estados (§23).

El reporte del taxista existe (foto + descripción + estado binario). Esta
fase agrega:
- Estados del flujo de resguardo: encontrado â†’ resguardo â†’ devuelto/cerrado.
- Vínculo opcional con servicio (cuando el taxista reporta con viaje activo).
- Cambio de estado por la terminal y visibilidad de la flota para el dueño.

La creación (POST /reportes) la valida test_server ya; aquí nos centramos en
el ciclo. Para crear reportes sin archivo físico usamos un PNG mínimo.
"""

import io
import struct
import zlib

import pytest

from tests.conftest import _headers, login_operador, login_terminal


def _png_minimo() -> bytes:
    """PNG 1x1 válido para subir como foto del reporte."""
    def chunk(tipo, data):
        c = struct.pack(">I", len(data)) + tipo + data
        return c + struct.pack(">I", zlib.crc32(tipo + data) & 0xFFFFFFFF)
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00"))
    return b"\x89PNG\r\n\x1a\n" + ihdr + idat + chunk(b"IEND", b"")


async def _crear_reporte(client, tok, operador_id):
    r = await client.post("/api/reportes",
                          headers=_headers(tok),
                          files={"foto": ("objeto.png", _png_minimo(), "image/png")},
                          data={"operador_id": operador_id, "descripcion": "Teléfono en asiento trasero"})
    return r


async def _reporte_con_operador(client, tok, operador_id):
    r = await client.post("/api/reportes",
                          headers=_headers(tok),
                          files={"foto": ("objeto.png", _png_minimo(), "image/png")},
                          data={"operador_id": operador_id, "descripcion": "Paraguas"})
    return r


# ===========================================================================
# 1) Ciclo completo de estados: encontrado â†’ resguardo â†’ devuelto
# ===========================================================================
@pytest.mark.asyncio
async def test_ciclo_estados_objeto(client, fresh_db):
    t = await login_operador(client, "op1")
    r = await _crear_reporte(client, t["token"], t["operador"]["id"])
    assert r.status_code == 200, r.text
    rep = r.json()
    # Estado inicial del flujo §23
    assert rep["estado"] == "encontrado"
    assert rep["historial"] and rep["historial"][0]["estado"] == "encontrado"

    term = await login_terminal(client)
    th = _headers(term["token"])
    rid = rep["id"]

    for estado in ("resguardo", "devuelto"):
        r = await client.patch(f"/api/reportes/{rid}/estado", headers=th,
                               json={"estado": estado})
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == estado

    lista = (await client.get("/api/reportes", headers=th)).json()
    doc = next(x for x in lista if x["id"] == rid)
    assert doc["estado"] == "devuelto"
    assert [h["estado"] for h in doc["historial"]] == ["encontrado", "resguardo", "devuelto"]


# ===========================================================================
# 2) Estado inválido â†’ 400
# ===========================================================================
@pytest.mark.asyncio
async def test_estado_invalido_400(client, fresh_db):
    term = await login_terminal(client)
    t = await login_operador(client, "op1")
    rep = (await _crear_reporte(client, t["token"], t["operador"]["id"])).json()
    r = await client.patch(f"/api/reportes/{rep['id']}/estado", headers=_headers(term["token"]),
                           json={"estado": "perdido"})
    assert r.status_code == 422  # Literal de Pydantic


# ===========================================================================
# 3) Cierre con nota ("cerrado" sin devolución)
# ===========================================================================
@pytest.mark.asyncio
async def test_cerrar_con_nota(client, fresh_db):
    term = await login_terminal(client)
    t = await login_operador(client, "op1")
    rep = (await _crear_reporte(client, t["token"], t["operador"]["id"])).json()
    r = await client.patch(f"/api/reportes/{rep['id']}/estado", headers=_headers(term["token"]),
                           json={"estado": "cerrado", "nota": "Pasó el plazo; se donó"})
    assert r.status_code == 200
    assert r.json()["nota"] == "Pasó el plazo; se donó"


# ===========================================================================
# 4) Solo terminal cambia estados (operador â†’ 403)
# ===========================================================================
@pytest.mark.asyncio
async def test_solo_terminal_cambia_estado(client, fresh_db):
    t = await login_operador(client, "op1")
    rep = (await _crear_reporte(client, t["token"], t["operador"]["id"])).json()
    r = await client.patch(f"/api/reportes/{rep['id']}/estado", headers=_headers(t["token"]),
                           json={"estado": "resguardo"})
    assert r.status_code in (401, 403)


# ===========================================================================
# 5) Vínculo opcional con servicio activo del conductor
# ===========================================================================
@pytest.mark.asyncio
async def test_vinculo_servicio_opcional(client, fresh_db):
    term = await login_terminal(client)
    th = _headers(term["token"])
    t = await login_operador(client, "op1")
    op_id = t["operador"]["id"]

    # Servicio asignado+iniciado al op1 (deja un servicio en_curso)
    await client.patch(f"/api/operadores/{op_id}/estado", json={"estado": "libre"},
                       headers=_headers(t["token"]))
    r = await client.post("/api/servicios", headers=th, json={
        "cliente_nombre": "Pasajero obj", "cliente_telefono": "916-1",
        "origen": {"texto": "A", "lat": 17.51, "lng": -91.98},
        "destino": {"texto": "B", "lat": 17.50, "lng": -91.97},
    })
    sid = r.json()["servicio"]["id"]
    await client.post(f"/api/servicios/{sid}/asignar", headers=th, json={"operador_id": op_id})
    await client.post(f"/api/servicios/{sid}/iniciar", headers=_headers(t["token"]))

    # El taxista reporta con su servicio activo â†’ el reporte hereda el vínculo
    r = await _crear_reporte(client, t["token"], t["operador"]["id"])
    rep = r.json()
    assert rep.get("servicio_id") == sid
    assert rep.get("unidad") is not None  # placa/número económico resuelto
