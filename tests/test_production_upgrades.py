"""Pruebas de aislamiento multi-tenant estricto, configuración multi-sitio,
WhatsApp Opción A Anti-Ban con auto-respuesta y ciclo completo de turno con
evidencias de combustible + entrega de unidad + liquidación de cuota.
"""

import pytest
from tests.conftest import _headers, login_operador, login_terminal


async def _login_dueno(client):
    r = await client.post("/api/dueno/login", json={"usuario": "dueno", "contrasena": "socio123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.mark.asyncio
async def test_aislamiento_multitenant_operadores_y_vehiculos(client, fresh_db):
    """Un usuario de terminal en sitio_pakalna NO debe ver operadores ni
    vehículos de sitio_palenque, y puede usar el mismo número económico en su
    propio sitio gracias al índice compuesto (sitio_id, numero_economico).
    """
    from server import _HASH_CENTRAL123, _HASH_TAXI123

    # Crear usuario de terminal en sitio_pakalna y un operador en sitio_pakalna
    await fresh_db.usuarios_terminal.insert_one({
        "nombre": "Central Pakal-Ná",
        "usuario": "central_pakalna",
        "password_hash": _HASH_CENTRAL123,
        "sitio_id": "sitio_pakalna",
        "activo": True,
    })
    await fresh_db.operadores.insert_one({
        "nombre": "Taxista Pakal-Ná",
        "telefono": "9161112233",
        "placa": "PK-201",
        "usuario": "pk1",
        "password_hash": _HASH_TAXI123,
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "activo": True,
        "lat": 17.534,
        "lng": -91.958,
    })

    # Login en ambos sitios
    term_palenque = (await login_terminal(client))["token"]
    r_pk = await client.post("/api/terminal/login", json={"usuario": "central_pakalna", "contrasena": "central123"})
    assert r_pk.status_code == 200
    tok_pakalna = r_pk.json()["token"]

    # Operadores vistos por Palenque vs Pakal-Ná
    ops_palenque = (await client.get("/api/operadores", headers=_headers(term_palenque))).json()
    ops_pakalna = (await client.get("/api/operadores", headers=_headers(tok_pakalna))).json()

    assert all(o.get("usuario") != "pk1" for o in ops_palenque)
    assert len(ops_pakalna) == 1
    assert ops_pakalna[0]["usuario"] == "pk1"

    # Crear vehículo TX-999 en ambos sitios (índice compuesto lo permite)
    r_v1 = await client.post(
        "/api/vehiculos",
        headers=_headers(term_palenque),
        json={"numero_economico": "TX-999", "placa": "PAL-999", "marca": "Nissan", "modelo": "Versa"},
    )
    assert r_v1.status_code == 200

    r_v2 = await client.post(
        "/api/vehiculos",
        headers=_headers(tok_pakalna),
        json={"numero_economico": "TX-999", "placa": "PAK-999", "marca": "Nissan", "modelo": "March"},
    )
    assert r_v2.status_code == 200

    vehs_pakalna = (await client.get("/api/vehiculos", headers=_headers(tok_pakalna))).json()
    assert len(vehs_pakalna) == 1
    assert vehs_pakalna[0]["placa"] == "PAK-999"


@pytest.mark.asyncio
async def test_config_sitio_y_puntos_calientes(client, fresh_db):
    """El endpoint /api/config/sitio devuelve identidad visual y puntos
    calientes por sitio y permite actualizarlos desde la terminal.
    """
    tok = (await login_terminal(client))["token"]
    r = await client.get("/api/config/sitio", headers=_headers(tok))
    assert r.status_code == 200
    cfg = r.json()
    assert cfg["sitio_id"] == "default"
    assert len(cfg["puntos_calientes"]) >= 6

    # Actualizar color primario, tema y puntos calientes
    nuevos_pois = [
        {"id": "poi_ado", "nombre": "Terminal ADO", "icono": "bus", "lat": 17.514, "lng": -91.9855, "tarifa_sugerida": 55}
    ]
    r_up = await client.put(
        "/api/config/sitio",
        headers=_headers(tok),
        json={
            "nombre": "Radio Taxis Palenque VIP",
            "color_primario": "#3b82f6",
            "tema_default": "oceano",
            "puntos_calientes": nuevos_pois,
        },
    )
    assert r_up.status_code == 200
    actualizado = r_up.json()
    assert actualizado["nombre"] == "Radio Taxis Palenque VIP"
    assert actualizado["color_primario"] == "#3b82f6"
    assert actualizado["tema_default"] == "oceano"
    assert len(actualizado["puntos_calientes"]) == 1
    assert actualizado["puntos_calientes"][0]["tarifa_sugerida"] == 55


@pytest.mark.asyncio
async def test_whatsapp_antiban_auto_reply_despacho(client, fresh_db):
    """Verifica el flujo de WhatsApp Opción A Anti-Ban y el endpoint de
    auto-respuesta al despachar una unidad.
    """
    tok = (await login_terminal(client))["token"]

    # 1. Consultar conversaciones sembradas de WhatsApp
    r_convs = await client.get("/api/wa/conversaciones", headers=_headers(tok))
    assert r_convs.status_code == 200
    convs = r_convs.json()
    assert len(convs) >= 1
    conv_id = convs[0]["id"]

    # 2. Verificar estado del puente WhatsApp Anti-Ban
    r_st = await client.get("/api/wa/status", headers=_headers(tok))
    assert r_st.status_code == 200
    assert r_st.json()["antiban_proteccion"]["solo_respuesta_entrante_24h"] is True

    # 3. Auto-responder despacho en 1 clic con Spintax Anti-Ban
    ops = (await client.get("/api/operadores", headers=_headers(tok))).json()
    op1 = next(o for o in ops if o["usuario"] == "op1")
    r_auto = await client.post(
        f"/api/wa/conversaciones/{conv_id}/auto-reply-despacho",
        headers=_headers(tok),
        json={"operador_id": op1["id"], "eta_min": 4},
    )
    assert r_auto.status_code == 200
    data = r_auto.json()
    assert data["ok"] is True
    assert op1["placa"] in data["texto"]
    assert "4" in data["texto"]


@pytest.mark.asyncio
async def test_ciclo_turno_evidencias_entrega_y_liquidacion_cuota(client, fresh_db):
    """El operador inicia turno con nivel de combustible y foto de evidencia,
    finaliza confirmando entrega de unidad y cuota, y el dueño audita y
    confirma la liquidación desde su panel.
    """
    term_tok = (await login_terminal(client))["token"]
    r_create_d = await client.post(
        "/api/dueno/usuarios",
        headers=_headers(term_tok),
        json={"nombre": "Socio Prueba", "usuario": "socio_test", "contrasena": "dueno123"},
    )
    assert r_create_d.status_code == 200, r_create_d.text
    dueno_id = r_create_d.json()["id"]
    r_login_d = await client.post("/api/dueno/login", json={"usuario": "socio_test", "contrasena": "dueno123"})
    assert r_login_d.status_code == 200
    dueno_tok = r_login_d.json()["token"]

    op_login = await login_operador(client, "op1")
    op_tok = op_login["token"]
    op_id = op_login["operador"]["id"]

    # Asignar vehículo de prueba al operador y fijar cuota diaria desde el dueño
    veh_doc = await fresh_db.vehiculos.find_one({"operador_conductor_id": op_id})
    if not veh_doc:
        ins = await fresh_db.vehiculos.insert_one({
            "numero_economico": "TX-101",
            "placa": "TX-101",
            "marca": "Nissan",
            "modelo": "Versa",
            "estado": "activo",
            "activo": True,
            "sitio_id": "sitio_palenque",
            "operador_conductor_id": op_id,
            "propietario_id": dueno_id,
            "cuota_diaria": 350.0,
        })
        veh_id = str(ins.inserted_id)
    else:
        veh_id = str(veh_doc["_id"])
        await fresh_db.vehiculos.update_one({"_id": veh_doc["_id"]}, {"$set": {"propietario_id": dueno_id}})

    # Dueño actualiza cuota diaria a $420
    r_cuota = await client.put(
        f"/api/dueno/vehiculos/{veh_id}/cuota",
        headers=_headers(dueno_tok),
        json={"cuota_diaria": 420.0},
    )
    assert r_cuota.status_code == 200
    assert r_cuota.json()["cuota_diaria"] == 420.0

    # Operador inicia turno con nivel de combustible y evidencia
    r_ini = await client.post(
        "/api/turnos/iniciar",
        headers=_headers(op_tok),
        json={
            "odometro_km": 85000,
            "nivel_combustible": "3/4",
            "evidencia_inicio_url": "/api/files/taxihub/evidencias_turno/test_ini.jpg",
            "notas_inicio": "Unidad limpia y con tanque a 3/4",
        },
    )
    assert r_ini.status_code == 200
    turno_ini = r_ini.json()["turno"]
    assert turno_ini["nivel_combustible_inicio"] == "3/4"
    assert turno_ini["cuota_meta"] == 420.0

    # Operador cierra turno confirmando entrega de unidad y cuota en efectivo
    r_fin = await client.post(
        "/api/turnos/finalizar",
        headers=_headers(op_tok),
        json={
            "odometro_km": 85210,
            "nivel_combustible": "1/2",
            "evidencia_fin_url": "/api/files/taxihub/evidencias_turno/test_fin.jpg",
            "entrega_unidad_confirmada": True,
            "entrega_a": "dueno",
            "cuota_entregada": 420.0,
            "metodo_pago_cuota": "efectivo",
            "notas_entrega": "Entrego llaves y cuenta completa en base",
        },
    )
    assert r_fin.status_code == 200
    turno_fin = r_fin.json()["turno"]
    assert turno_fin["km_recorridos"] == 210
    assert turno_fin["entrega_unidad_confirmada"] is True
    assert turno_fin["cuota_entregada"] == 420.0
    assert turno_fin["liquidacion_estado"] == "pendiente_confirmacion"

    # Dueño consulta liquidaciones y confirma recepción de unidad y efectivo
    r_liqs = await client.get("/api/dueno/turnos/liquidaciones", headers=_headers(dueno_tok))
    assert r_liqs.status_code == 200
    turnos_liq = r_liqs.json()["turnos"]
    assert any(t["id"] == turno_fin["id"] for t in turnos_liq)

    r_conf = await client.post(
        f"/api/dueno/turnos/{turno_fin['id']}/confirmar-liquidacion",
        headers=_headers(dueno_tok),
        json={
            "confirmado": True,
            "cuota_recibida": 420.0,
            "unidad_recibida_ok": True,
            "observaciones": "Recibido conforme",
        },
    )
    assert r_conf.status_code == 200
    assert r_conf.json()["liquidacion_estado"] == "confirmada"
