"""
scripts/test_driver_android_e2e.py — Verificación E2E de la suite Android TaxiHUB Driver
Prueba la infraestructura real en https://taxihub.cloud/ de extremo a extremo:
- Auth de operador
- Diagnóstico de telemetría GPS (/operadores/diagnostico-gps)
- Ingesta masiva de GPS offline en lote (/locations/batch)
- Registro de combustible con clave de idempotencia (prevención de duplicados)
- Ciclo de turno con validación de viajes activos
- Descarga directa del APK de Android (/downloads/taxiHUB-operador-debug.apk)
"""

import sys
import time
import httpx

BASE_URL = "https://taxihub.cloud/api"
APK_URL = "https://taxihub.cloud/downloads/taxiHUB-operador-debug.apk"

def log_step(name, ok, detail=""):
    symbol = "[OK]" if ok else "[FAIL]"
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {symbol} {name} {f'({detail})' if detail else ''}")
    if not ok:
        sys.exit(1)

def test_e2e():
    print(f"Iniciando pruebas E2E contra {BASE_URL}...\n")
    client = httpx.Client(timeout=20.0)

    # 1. Login Operador op1
    res = client.post(f"{BASE_URL}/auth/login", json={"usuario": "op1", "contrasena": "taxi123"})
    log_step("1. Login Operador (op1)", res.status_code == 200, f"HTTP {res.status_code}")
    data = res.json()
    token = data.get("token") or data.get("access_token")
    op_id = data.get("operador", {}).get("id")
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Diagnóstico GPS en vivo
    res_diag = client.get(f"{BASE_URL}/operadores/diagnostico-gps", headers=headers)
    log_step("2. Diagnóstico GPS en vivo (/operadores/diagnostico-gps)", res_diag.status_code == 200, f"HTTP {res_diag.status_code}")
    diag = res_diag.json()
    calidad = diag.get("gps", {}).get("calidad_senal")
    placa = diag.get("operador", {}).get("placa")
    log_step("   Detalle telemetría GPS", calidad is not None, f"Calidad: {calidad}, Placa: {placa}")

    # 3. Batch Locations (cola offline)
    batch_points = [
        {"lat": 17.5090, "lng": -91.9820, "accuracy": 12.0, "speed": 8.5, "heading": 90.0, "client_ts": "2026-10-12T16:00:00Z"},
        {"lat": 17.5095, "lng": -91.9815, "accuracy": 10.0, "speed": 9.2, "heading": 92.0, "client_ts": "2026-10-12T16:00:10Z"},
        {"lat": 17.5100, "lng": -91.9810, "accuracy": 8.0,  "speed": 9.8, "heading": 95.0, "client_ts": "2026-10-12T16:00:20Z"},
    ]
    res_batch = client.post(f"{BASE_URL}/locations/batch", headers=headers, json={"puntos": batch_points})
    log_step("3. Ingesta Batch GPS offline (/locations/batch)", res_batch.status_code == 200, f"HTTP {res_batch.status_code}")
    batch_data = res_batch.json()
    log_step("   Procesamiento de puntos", batch_data.get("procesados") == 3, f"Puntos procesados: {batch_data.get('procesados')}")

    # 4. Combustible con clave de idempotencia
    idempotency_key = f"test_idemp_{int(time.time())}"
    comb_payload = {
        "fecha": "2026-10-12",
        "litros": "35.5",
        "costo": "780.0",
        "odometro_km": "125400.0",
        "estacion": "Pemex Palenque Norte",
        "idempotency_key": idempotency_key,
    }
    res_comb1 = client.post(f"{BASE_URL}/combustible", headers=headers, data=comb_payload)
    log_step("4a. Registro de combustible inicial", res_comb1.status_code == 200, f"HTTP {res_comb1.status_code}")
    c1 = res_comb1.json()

    # Reintento con la misma clave (simulando reintento de red del móvil)
    res_comb2 = client.post(f"{BASE_URL}/combustible", headers=headers, data=comb_payload)
    log_step("4b. Reintento idempotente de combustible", res_comb2.status_code == 200, f"HTTP {res_comb2.status_code}")
    c2 = res_comb2.json()
    log_step("   Detección de duplicado por idempotencia", c2.get("duplicado") is True and c2.get("id") == c1.get("id"), f"duplicado={c2.get('duplicado')}")

    # 5. Iniciar Turno (Odómetro opcional)
    res_turno_ini = client.post(f"{BASE_URL}/turnos/iniciar", headers=headers, json={
        "odometro_km": None, # Prueba odómetro opcional
        "nivel_combustible": "3/4",
        "unidad_limpia": True
    })
    # Si ya tenía turno activo o inició uno nuevo:
    if res_turno_ini.status_code == 409:
        log_step("5a. Turno ya activo (detectado)", True, "Turno preexistente activo")
    else:
        log_step("5a. Inicio de turno sin odómetro obligatorio", res_turno_ini.status_code == 200, f"HTTP {res_turno_ini.status_code}")

    # 5b. Terminal crea servicio asignado a op1 para probar regla estricta de bloqueo
    term_res = client.post(f"{BASE_URL}/terminal/login", json={"usuario": "central", "contrasena": "central123"})
    if term_res.status_code == 200:
        h_term = {"Authorization": f"Bearer {term_res.json()['token']}"}
        
        # Limpiar cualquier servicio previo asignado a op1
        servs_prev = client.get(f"{BASE_URL}/servicios", headers=h_term).json()
        if isinstance(servs_prev, list):
            for sp in servs_prev:
                if sp.get("operador_asignado_id") == op_id and sp.get("estado") in ("asignado", "en_curso"):
                    client.post(f"{BASE_URL}/servicios/{sp['id']}/terminar", headers=h_term)

        s_res = client.post(f"{BASE_URL}/servicios", headers=h_term, json={
            "origen": {"texto": "Parque Central Palenque", "lat": 17.509, "lng": -91.982},
            "destino": {"texto": "Hotel Maya Tulipanes", "lat": 17.512, "lng": -91.985},
            "costo": 50,
            "operador_asignado_id": op_id,
            "estado": "asignado"
        })
        serv_data = s_res.json()
        serv_obj = serv_data.get("servicio") or serv_data
        serv_id = serv_obj.get("id") or str(serv_obj.get("_id", ""))

        # Intentar finalizar turno con servicio asignado activo
        res_bloqueo = client.post(f"{BASE_URL}/turnos/finalizar", headers=headers, json={"entrega_unidad_confirmada": True})
        log_step("5b. Bloqueo de cierre de turno con servicio activo (HTTP 400)", res_bloqueo.status_code == 400 and "servicio(s) en curso" in res_bloqueo.text, f"HTTP {res_bloqueo.status_code}")

        # Completar servicio
        if serv_id:
            res_term = client.post(f"{BASE_URL}/servicios/{serv_id}/terminar", headers=h_term)
            log_step("5c. Servicio completado", res_term.status_code == 200, f"Servicio ID {serv_id}")

        # Asegurar que no queden servicios activos asignados a op1
        servs_activos = client.get(f"{BASE_URL}/servicios", headers=h_term).json()
        if isinstance(servs_activos, list):
            for s in servs_activos:
                if s.get("operador_asignado_id") == op_id and s.get("estado") in ("asignado", "en_curso"):
                    client.post(f"{BASE_URL}/servicios/{s['id']}/terminar", headers=h_term)

    # 6. Finalizar Turno
    res_turno_fin = client.post(f"{BASE_URL}/turnos/finalizar", headers=headers, json={
        "odometro_km": None,
        "nivel_combustible_fin": "1/2",
        "entrega_unidad_confirmada": True,
        "entrega_a": "Dueño / Socio",
        "cuota_entregada": 350.0,
        "metodo_pago_cuota": "efectivo"
    })
    log_step("6. Finalización de turno y entrega de unidad", res_turno_fin.status_code == 200, f"HTTP {res_turno_fin.status_code}")

    # 7. Descarga del APK de Android
    print(f"\nVerificando archivo APK en {APK_URL}...")
    res_apk = client.head(APK_URL)
    if res_apk.status_code != 200:
        res_apk = client.get(APK_URL, headers={"Range": "bytes=0-1024"})
    log_step("7. Descarga directa APK Android", res_apk.status_code in (200, 206), f"HTTP {res_apk.status_code}")
    content_length = int(res_apk.headers.get("Content-Length") or res_apk.headers.get("content-length") or 0)
    print(f"   Tamaño reportado del APK: {content_length / (1024*1024):.2f} MB")
    log_step("   Integridad del binario APK (> 25 MB)", content_length > 25 * 1024 * 1024, f"{content_length} bytes")

    print("\n==========================================")
    print("TODAS LAS PRUEBAS E2E PASARON EXITOSAMENTE")
    print("==========================================")

if __name__ == "__main__":
    test_e2e()
