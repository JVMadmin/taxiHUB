import time
import requests

BASE_URL = "https://taxihub.cloud/api"

def test_cascade():
    op1_id = "6ac6a1f70b87f01ac38a2388"
    print(f"1. ID de op1 objetivo (unidad 101): {op1_id}")

    print("\n2. Autenticando pasajero de prueba...")
    phone = "9679998811"
    pwd = "TestPassword123!"
    login_pas = requests.post(f"{BASE_URL}/clientes/login", json={"usuario": phone, "contrasena": pwd})
    assert login_pas.status_code == 200, f"Login pasajero fallido: {login_pas.text}"
    token_pas = login_pas.json()["token"]
    headers_pas = {"Authorization": f"Bearer {token_pas}"}
    print("   [OK] Pasajero autenticado")

    print("\n3. Creando solicitud de viaje desde pasajero...")
    srv_resp = requests.post(f"{BASE_URL}/servicios", json={
        "origen": {"lat": 17.5095, "lng": -91.9825, "direccion": "Parque Central, Palenque"},
        "destino": {"lat": 17.5140, "lng": -91.9780, "direccion": "Mercado Municipal, Palenque"},
        "tipo_taxi": "Taxi estándar",
        "tarifa_estimada": 45.0,
        "distancia_km": 1.2,
        "duracion_min": 4
    }, headers=headers_pas)
    assert srv_resp.status_code == 200, f"Error creando servicio: {srv_resp.text}"
    srv_raw = srv_resp.json()
    srv_data = srv_raw.get("servicio", srv_raw)
    srv_id = srv_data.get("id") or srv_data.get("_id")
    print(f"   [OK] Servicio creado con ID: {srv_id}")

    # Consultar servicio completo
    srv_get = requests.get(f"{BASE_URL}/servicios/{srv_id}", headers=headers_pas).json()
    ofrecidos_1 = srv_get.get("ofrecido_a") or []
    print(f"   Estado inicial: {srv_get.get('estado')}")
    print(f"   Ofrecido a: {ofrecidos_1}")
    print(f"   Expira en: {srv_get.get('expira_en')}")

    assert srv_get.get("estado") == "ofrecido", f"Estado esperado 'ofrecido', obtenido {srv_get.get('estado')}"
    assert op1_id in ofrecidos_1, f"op1 ({op1_id}) debía ser el primer ofrecido. Ofrecidos: {ofrecidos_1}"
    print("   [OK] Prioridad #1 op1 (unidad 101) confirmada!")

    print("\n4. Esperando 32 segundos a que el bucle de cascada procese el timeout de 30s...")
    for s in range(32, 0, -5):
        print(f"   Esperando... {s}s")
        time.sleep(5)
    time.sleep(2)

    srv_cascada = requests.get(f"{BASE_URL}/servicios/{srv_id}", headers=headers_pas).json()
    ofrecidos_2 = srv_cascada.get("ofrecido_a") or []
    rechazados = srv_cascada.get("rechazados") or []
    print(f"\n5. Servicio tras timeout:")
    print(f"   Estado: {srv_cascada.get('estado')}")
    print(f"   Ofrecido tras cascada: {ofrecidos_2}")
    print(f"   Rechazados / expirados: {rechazados}")

    assert op1_id in rechazados, f"op1 ({op1_id}) debe estar en la lista de expirados/rechazados"
    assert op1_id not in ofrecidos_2, f"op1 ({op1_id}) no debe seguir en ofrecido_a tras vencer los 30s"
    print("   [OK] Cascada automática ejecutada con éxito tras 30s!")

    print("\n6. Limpiando servicio de prueba...")
    requests.post(f"{BASE_URL}/servicios/{srv_id}/cancelar", json={"motivo": "Fin de prueba automatizada"}, headers=headers_pas)
    print("   [OK] Servicio cancelado y prueba completada con exito.")

if __name__ == "__main__":
    test_cascade()
