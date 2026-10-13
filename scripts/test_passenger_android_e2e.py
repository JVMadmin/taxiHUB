#!/usr/bin/env python3
"""
Prueba E2E Integral — TaxiHUB Pasajero (Android & Producción)
Verifica las Fases 0 a 11 contra https://taxihub.cloud:
1. Branding y tenant por defecto ("default" — Radio Taxis Palenque)
2. Registro, login, persistencia JWT y edición de perfil del pasajero
3. Geocodificación inversa legible (sin coordenadas crudas) y autocompletado POI Palenque
4. Categorías reales de vehículos y motor de cotización tarifaria del tenant
5. Solicitud de viaje y auto-despacho inmediato al taxista libre más cercano (estado="ofrecido")
6. Rechazo del primer conductor y reasignación automática al siguiente más cercano
7. Aceptación del segundo conductor (estado="asignado") y datos completos de conductor/unidad
8. Seguimiento GPS en tiempo real y notificación de llegada al punto de origen
9. Chat bidireccional pasajero <-> conductor y aislamiento de seguridad (403 a terceros)
10. Inicio de viaje ("en_curso"), finalización ("completado"), calificación (5 estrellas) e historial
11. Disponibilidad pública del APK Android (taxiHUB-pasajero-debug.apk)
"""

import sys
import random
import requests

BASE_URL = "https://taxihub.cloud/api"
PUBLIC_APK_URL = "https://taxihub.cloud/downloads/taxiHUB-pasajero-debug.apk"


def assert_step(cond, msg, detail=""):
    if not cond:
        print(f"[FAIL] {msg} | {detail}")
        sys.exit(1)
    print(f"[PASS] {msg}")


def main():
    print("=" * 72)
    print("INICIANDO PRUEBA E2E INTEGRAL - TAXIHUB PASAJERO ANDROID")
    print("=" * 72)

    # 1. Registro y Login de Pasajero
    rnd = random.randint(100000, 999999)
    usuario = f"pasajero_e2e_{rnd}"
    telefono = f"9161{rnd}"
    password = f"Pasajero#{rnd}"
    nombre_inicial = f"Pasajero E2E {rnd}"
    correo_inicial = f"pasajero.{rnd}@taxihub.cloud"

    r_reg = requests.post(
        f"{BASE_URL}/clientes",
        json={
            "nombre": nombre_inicial,
            "telefono": telefono,
            "correo": correo_inicial,
            "usuario": usuario,
            "contrasena": password,
        },
        timeout=15,
    )
    assert_step(r_reg.status_code == 200, f"1a. Registro de pasajero ({usuario} / {telefono})", r_reg.text)
    reg_client = r_reg.json().get("cliente") or {}
    assert_step(
        reg_client.get("sitio_id") == "default",
        f"1b. Pasajero asociado al tenant de simulacion 'default' (sitio_id={reg_client.get('sitio_id')})",
    )

    # Login fallido con contraseña incorrecta
    r_bad = requests.post(
        f"{BASE_URL}/clientes/login",
        json={"usuario": usuario, "contrasena": "wrongpassword"},
        timeout=15,
    )
    assert_step(r_bad.status_code == 401, "1c. Rechazo de credenciales invalidas (401)")

    # Login exitoso
    r_login = requests.post(
        f"{BASE_URL}/clientes/login",
        json={"usuario": usuario, "contrasena": password},
        timeout=15,
    )
    assert_step(r_login.status_code == 200, "1d. Login de pasajero exitoso", r_login.text)
    login_data = r_login.json()
    pas_token = login_data["token"]
    pas_headers = {"Authorization": f"Bearer {pas_token}"}

    # 2. Perfil y edición de perfil
    r_me = requests.get(f"{BASE_URL}/clientes/me", headers=pas_headers, timeout=15)
    assert_step(r_me.status_code == 200, "2a. Consulta de sesion persistente /clientes/me")

    nuevo_nombre = f"Cliente Verificado {rnd}"
    r_upd = requests.put(
        f"{BASE_URL}/clientes/me",
        headers=pas_headers,
        json={"nombre": nuevo_nombre, "correo": f"verificado.{rnd}@taxihub.cloud"},
        timeout=15,
    )
    assert_step(
        r_upd.status_code == 200 and r_upd.json().get("nombre") == nuevo_nombre,
        "2b. Actualizacion de perfil de pasajero PUT /clientes/me",
        r_upd.text,
    )

    # 3. Geocodificación inversa y autocompletado Palenque
    r_rev = requests.get(
        f"{BASE_URL}/geo/reverse",
        params={"lat": 17.5095, "lng": -91.9821},
        headers=pas_headers,
        timeout=15,
    )
    assert_step(r_rev.status_code == 200, "3a. Geocodificacion inversa /geo/reverse", r_rev.text)
    rev_data = r_rev.json()
    rev_label = rev_data.get("texto") or rev_data.get("label") or ""
    assert_step(
        len(rev_label) > 4 and "17.5095" not in rev_label,
        f"3b. Etiqueta legible sin coordenadas crudas: '{rev_label}'",
        str(rev_data),
    )

    r_search = requests.get(
        f"{BASE_URL}/geo/search",
        params={"q": "Tren Maya"},
        headers=pas_headers,
        timeout=15,
    )
    assert_step(r_search.status_code == 200, "3c. Autocompletado de direcciones /geo/search", r_search.text)
    results = r_search.json().get("resultados") or []
    assert_step(
        any("Tren Maya" in (item.get("label") or "") for item in results),
        f"3d. POI 'Estacion Tren Maya Palenque' encontrado ({len(results)} resultados)",
    )

    # 4. Tipos de vehículo y Cotización Real del Tenant
    r_tipos = requests.get(
        f"{BASE_URL}/tipos-vehiculo",
        headers=pas_headers,
        timeout=15,
    )
    assert_step(r_tipos.status_code == 200, "4a. Catalogo de tipos de vehiculo del tenant", r_tipos.text)
    tipos = r_tipos.json()
    assert_step(len(tipos) >= 4, f"4b. Categorias autenticas cargadas ({len(tipos)} tipos)")

    origen_pt = {"lat": 17.5095, "lng": -91.9821, "texto": "Parque Central Palenque, Centro"}
    destino_pt = {"lat": 17.5376, "lng": -91.9698, "texto": "Estacion Tren Maya Palenque"}

    r_cot = requests.post(
        f"{BASE_URL}/servicios/cotizar",
        headers=pas_headers,
        json={"origen": origen_pt, "destino": destino_pt},
        timeout=15,
    )
    assert_step(r_cot.status_code == 200, "4c. Motor de cotizacion POST /servicios/cotizar", r_cot.text)
    cot_data = r_cot.json()
    assert_step(
        cot_data.get("costo_estimado") is not None and cot_data.get("costo_estimado") >= 35,
        f"4d. Tarifa calculada: ${cot_data.get('costo_estimado')} ({cot_data.get('tarifa_nombre')}) · Dist: {cot_data.get('distancia_m')}m",
    )

    # 5. Preparar operadores en el tenant "default" para probar el despacho automático y reasignación
    term_lg = requests.post(f"{BASE_URL}/terminal/login", json={"usuario": "central", "contrasena": "central123"}, timeout=15)
    assert_step(term_lg.status_code == 200, "5a. Login de terminal para auditoria de flota del tenant default")
    term_headers = {"Authorization": f"Bearer {term_lg.json()['token']}"}
    all_ops = requests.get(f"{BASE_URL}/operadores", headers=term_headers, timeout=15).json()
    ops_by_id = {o["id"]: o for o in all_ops}

    def get_op_session(op_id):
        op_doc = ops_by_id.get(op_id)
        uname = op_doc["usuario"]
        lg = requests.post(f"{BASE_URL}/auth/login", json={"usuario": uname, "contrasena": "taxi123"}, timeout=15)
        assert_step(lg.status_code == 200, f"Login de operador {uname} ({op_id})")
        tok = lg.json()["token"]
        return {"username": uname, "id": op_id, "headers": {"Authorization": f"Bearer {tok}"}}

    op_by_uname = {o["usuario"]: o for o in all_ops if o.get("usuario")}
    op1_session = get_op_session(op_by_uname["op1"]["id"])
    op2_session = get_op_session(op_by_uname["op2"]["id"])

    for sess in (op1_session, op2_session):
        oid = sess["id"]
        hdr = sess["headers"]
        act_list = requests.get(f"{BASE_URL}/servicios/mis-activos", headers=hdr, timeout=10).json()
        for s_old in (act_list or []):
            sid = s_old.get("id")
            requests.post(f"{BASE_URL}/servicios/{sid}/cancelar", headers=term_headers, json={"motivo": "Limpieza E2E"}, timeout=10)
        requests.patch(
            f"{BASE_URL}/operadores/{oid}/estado",
            headers=hdr,
            json={"estado": "libre"},
            timeout=10,
        )

    # Posicionar op1 a 0.2m del origen y op2 a 0.5m del origen para garantizar que sean los más cercanos
    requests.post(
        f"{BASE_URL}/operadores/{op1_session['id']}/ubicacion",
        headers=op1_session["headers"],
        json={"lat": 17.509501, "lng": -91.982101},
        timeout=10,
    )
    requests.post(
        f"{BASE_URL}/operadores/{op2_session['id']}/ubicacion",
        headers=op2_session["headers"],
        json={"lat": 17.509504, "lng": -91.982104},
        timeout=10,
    )

    # 6. Pasajero solicita un taxi -> Backend auto-despacha al más cercano (estado == "ofrecido", NO "asignado")
    r_create = requests.post(
        f"{BASE_URL}/servicios",
        headers=pas_headers,
        json={
            "origen": origen_pt,
            "destino": destino_pt,
            "metodo_pago": "efectivo",
        },
        timeout=15,
    )
    assert_step(r_create.status_code == 200, "6a. Solicitud de taxi creada por pasajero POST /servicios", r_create.text)
    create_resp = r_create.json()
    srv = create_resp.get("servicio") or create_resp
    srv_id = srv["id"]
    ofrecido_a = srv.get("ofrecido_a") or []
    assert_step(
        srv.get("estado") == "ofrecido"
        and srv.get("operador_asignado_id") is None
        and len(ofrecido_a) == 1,
        f"6b. Servicio en estado 'ofrecido' al conductor mas cercano ({ofrecido_a[0] if ofrecido_a else 'N/A'}), esperando aceptacion",
        str(srv),
    )

    first_offered_id = ofrecido_a[0]
    first_op = get_op_session(first_offered_id)

    # Verificar que el conductor #1 ve la oferta en /servicios/mis-activos
    mis_act_1 = requests.get(f"{BASE_URL}/servicios/mis-activos", headers=first_op["headers"], timeout=10).json()
    assert_step(
        any(x.get("id") == srv_id and x.get("estado") == "ofrecido" for x in mis_act_1),
        f"6c. Conductor #{first_op['username']} ({first_offered_id}) recibe la oferta en /servicios/mis-activos",
    )

    # 7. Primer operador RECHAZA -> Reasignación automática al siguiente operador más cercano
    r_rej = requests.post(f"{BASE_URL}/servicios/{srv_id}/rechazar", headers=first_op["headers"], timeout=15)
    assert_step(r_rej.status_code == 200, f"7a. Primer operador ({first_op['username']}) rechaza la oferta", r_rej.text)
    rej_srv = r_rej.json()
    nuevos_ofrecidos = rej_srv.get("ofrecido_a") or []
    rechazados_list = rej_srv.get("rechazados") or []
    assert_step(
        rej_srv.get("estado") == "ofrecido"
        and first_offered_id in rechazados_list
        and len(nuevos_ofrecidos) == 1
        and nuevos_ofrecidos[0] != first_offered_id,
        f"7b. Backend reasigno automaticamente la oferta al siguiente conductor ({nuevos_ofrecidos[0] if nuevos_ofrecidos else 'N/A'})",
        str(rej_srv),
    )

    second_offered_id = nuevos_ofrecidos[0]
    second_op = get_op_session(second_offered_id)

    # 8. Segundo operador ACEPTA la oferta -> Estado pasa a "asignado"
    r_acc = requests.post(f"{BASE_URL}/servicios/{srv_id}/aceptar", headers=second_op["headers"], timeout=15)
    assert_step(
        r_acc.status_code == 200 and r_acc.json().get("estado") == "asignado",
        f"8a. Segundo operador ({second_op['username']}) acepta el servicio -> estado='asignado'",
        r_acc.text,
    )

    r_pas_srv = requests.get(f"{BASE_URL}/clientes/me/viaje-activo", headers=pas_headers, timeout=15)
    assert_step(r_pas_srv.status_code == 200, "8b. Pasajero consulta /clientes/me/viaje-activo")
    pas_srv = (r_pas_srv.json() or {}).get("servicio") or {}
    taxi_info = pas_srv.get("taxi") or {}
    veh_info = taxi_info.get("vehiculo") or {}
    assert_step(
        pas_srv.get("estado") == "asignado"
        and taxi_info.get("id") == second_offered_id
        and taxi_info.get("nombre_conductor")
        and taxi_info.get("numero_economico")
        and veh_info.get("placa"),
        f"8c. Pasajero recibe datos reales del conductor '{taxi_info.get('nombre_conductor')}' ({taxi_info.get('numero_economico')} · {veh_info.get('placa')} · {veh_info.get('marca')} {veh_info.get('modelo')})",
        str(pas_srv),
    )

    # 9. Seguimiento GPS en tiempo real y aviso de llegada al origen
    requests.post(
        f"{BASE_URL}/operadores/{second_offered_id}/ubicacion",
        headers=second_op["headers"],
        json={"lat": 17.50951, "lng": -91.98211},
        timeout=10,
    )
    r_arr = requests.post(f"{BASE_URL}/servicios/{srv_id}/llegada-origen", headers=second_op["headers"], timeout=15)
    assert_step(
        r_arr.status_code == 200 and r_arr.json().get("conductor_en_origen") is True,
        "9. Conductor notifica llegada al origen (conductor_en_origen=True)",
        r_arr.text,
    )

    # 10. Chat bidireccional Pasajero <-> Conductor y seguridad contra terceros
    r_msg_pas = requests.post(
        f"{BASE_URL}/servicios/{srv_id}/mensajes",
        headers=pas_headers,
        json={"texto": "Hola, ya salgo, llevo camisa verde"},
        timeout=15,
    )
    assert_step(r_msg_pas.status_code == 200, "10a. Pasajero envia mensaje de chat al conductor", r_msg_pas.text)

    r_msg_op = requests.post(
        f"{BASE_URL}/servicios/{srv_id}/mensajes",
        headers=second_op["headers"],
        json={"texto": "Perfecto, estoy frente al parque con intermitentes"},
        timeout=15,
    )
    assert_step(r_msg_op.status_code == 200, "10b. Conductor responde mensaje de chat al pasajero", r_msg_op.text)

    r_msgs = requests.get(f"{BASE_URL}/servicios/{srv_id}/mensajes", headers=pas_headers, timeout=15)
    msgs = r_msgs.json() if r_msgs.status_code == 200 else []
    assert_step(
        len(msgs) == 2 and msgs[0]["remitente"] == "pasajero" and msgs[1]["remitente"] == "operador",
        f"10c. Historial del chat del servicio sincronizado ({len(msgs)} mensajes)",
    )

    # Verificar que el primer operador (que rechazó y NO es el conductor asignado) recibe 403 al intentar leer el chat
    r_unauth_chat = requests.get(f"{BASE_URL}/servicios/{srv_id}/mensajes", headers=first_op["headers"], timeout=15)
    assert_step(
        r_unauth_chat.status_code == 403,
        "10d. Proteccion de privacidad: operador no asignado recibe 403 en el chat del servicio",
    )

    # 11. Inicio del viaje ("en_curso"), finalización ("completado"), calificación e historial
    r_ini = requests.post(f"{BASE_URL}/servicios/{srv_id}/iniciar", headers=second_op["headers"], timeout=15)
    assert_step(
        r_ini.status_code == 200 and r_ini.json().get("estado") == "en_curso",
        "11a. Conductor inicia el viaje (estado='en_curso')",
        r_ini.text,
    )

    r_fin = requests.post(f"{BASE_URL}/servicios/{srv_id}/terminar", headers=second_op["headers"], timeout=15)
    assert_step(
        r_fin.status_code == 200 and r_fin.json().get("estado") == "completado",
        "11b. Conductor finaliza el viaje (estado='completado')",
        r_fin.text,
    )

    r_cal = requests.post(
        f"{BASE_URL}/servicios/{srv_id}/calificacion",
        headers=pas_headers,
        json={"puntuacion": 5, "comentario": "Excelente servicio en Palenque, unidad muy limpia"},
        timeout=15,
    )
    assert_step(
        r_cal.status_code == 200 and r_cal.json().get("calificacion_conductor", {}).get("puntuacion") == 5,
        "11c. Pasajero califica el servicio con 5 estrellas",
        r_cal.text,
    )

    r_hist = requests.get(f"{BASE_URL}/clientes/me/servicios", headers=pas_headers, timeout=15)
    assert_step(r_hist.status_code == 200, "11d. Consulta de historial del pasajero GET /clientes/me/servicios")
    hist = r_hist.json()
    assert_step(
        any(item.get("id") == srv_id and item.get("operador_nombre") for item in hist),
        f"11e. Viaje completado registrado en el historial con datos del conductor ({len(hist)} viajes)",
    )

    # 12. Verificar APK descargable en producción
    r_apk = requests.head(PUBLIC_APK_URL, timeout=15, allow_redirects=True)
    apk_size = int(r_apk.headers.get("Content-Length", "0"))
    assert_step(
        r_apk.status_code == 200 and apk_size > 3_000_000,
        f"12. APK Nativo Android disponible en {PUBLIC_APK_URL} ({apk_size / (1024*1024):.2f} MB)",
    )

    print("=" * 72)
    print("TODAS LAS PRUEBAS E2E DE TAXIHUB PASAJERO PASARON EXITOSAMENTE")
    print("=" * 72)


if __name__ == "__main__":
    main()
