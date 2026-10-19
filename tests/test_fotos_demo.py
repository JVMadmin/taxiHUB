from pathlib import Path

import pytest

import server

pytestmark = pytest.mark.asyncio

DRIVERS_DIR = Path(server.ROOT_DIR).parent / "frontend" / "public" / "assets" / "drivers"


def _num(url):
    return int(url.rsplit("-", 1)[1].split(".")[0])


def test_catalogo_de_retratos_existe():
    for n in server.FOTOS_DEMO_HOMBRES + server.FOTOS_DEMO_MUJERES:
        assert (DRIVERS_DIR / f"driver-{n:02d}.jpg").is_file(), n
    assert not set(server.FOTOS_DEMO_HOMBRES) & set(server.FOTOS_DEMO_MUJERES)


def test_cada_chofer_demo_recibe_foto_de_su_genero():
    fotos = server._fotos_demo_conductores()
    taxis = server.DEMO_TAXIS + server.DEMO_TAXIS_PAKALNA + server.DEMO_TAXIS_FORANEOS
    assert len(fotos) == len(taxis)
    for t in taxis:
        esperado = server.FOTOS_DEMO_MUJERES if t.get("genero") == "F" else server.FOTOS_DEMO_HOMBRES
        assert _num(fotos[t["usuario"]]) in esperado, t["nombre"]


async def test_migracion_corrige_retratos_sin_tocar_fotos_subidas(fresh_db):
    # Base sembrada con el ciclo antiguo de 15 fotos: un chofer hombre con la foto 02.
    hombre = next(t for t in server.DEMO_TAXIS if t.get("genero") != "F" and t["usuario"] != "op1")
    await fresh_db.operadores.update_one({"usuario": hombre["usuario"]},
                                         {"$set": {"foto_url": "/assets/drivers/driver-02.jpg"}}, upsert=True)
    await fresh_db.operadores.update_one({"usuario": "op1"},
                                         {"$set": {"foto_url": "central-taxis/perfiles/propia.webp"}}, upsert=True)
    await server._migraciones()
    h = await fresh_db.operadores.find_one({"usuario": hombre["usuario"]})
    assert _num(h["foto_url"]) in server.FOTOS_DEMO_HOMBRES
    op1 = await fresh_db.operadores.find_one({"usuario": "op1"})
    assert op1["foto_url"] == "central-taxis/perfiles/propia.webp"
