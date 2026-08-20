"""E2E Fase 10 — verificación del flujo de seguimiento/navegación.

Flujo:
  1. Siembra vía API: terminal + op1 libres con track GPS, servicio creado,
     despachado y aceptado (queda `asignado`, op1 ocupado).
  2. Navegador Terminal: login -> Dispatcher -> seleccionar op1 -> "Ver recorrido"
     (polilínea del track) y panel del taxi.
  3. Navegador Operador (geolocalización mockeada): login op1 -> sheet "Ir por el
     cliente" con ruta/ETA -> Llegué al cliente -> en_curso -> Finalizar -> home.

Se asume backend en :8000 y frontend en :3000 (los levanta with_server.py).
"""

import sys
import time
import requests

from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:8000/api"
FRONT = "http://127.0.0.1:3000"
TERM_USER, TERM_PASS = "central", "central123"
OP_USER, OP_PASS = "op1", "taxi123"

P0 = (17.5090, -91.9850)


def seed():
    """Prepara estado determinista y devuelve ids."""
    tr = requests.post(f"{BASE}/terminal/login",
                       json={"usuario": TERM_USER, "contrasena": TERM_PASS}).json()["token"]
    op = requests.post(f"{BASE}/auth/login", json={"usuario": OP_USER, "contrasena": OP_PASS}).json()
    op_token, op_id = op["token"], op["operador"]["id"]
    th = {"Authorization": f"Bearer {tr}"}
    oh = {"Authorization": f"Bearer {op_token}"}

    # Limpieza: cancela servicios activos previos de op1 para que sea re-ejecutable
    activos = requests.get(f"{BASE}/servicios", headers=th).json()
    for s in activos:
        if s.get("operador_asignado_id") == op_id and s.get("estado") in ("pendiente", "ofrecido", "asignado", "en_curso"):
            requests.post(f"{BASE}/servicios/{s['id']}/cancelar", headers=th, json={"motivo": "limpieza E2E"})

    requests.patch(f"{BASE}/operadores/{op_id}/estado", json={"estado": "libre"}, headers=oh)
    # Track: varios puntos con movimiento (para la polilínea de recorrido)
    for i, (dlat, dlng) in enumerate([(0, 0), (.001, .001), (.002, .0005), (.003, .0015), (.0045, .0012)]):
        requests.post(f"{BASE}/operadores/{op_id}/ubicacion", headers=oh,
                      json={"lat": P0[0] + dlat, "lng": P0[1] + dlng, "accuracy": 6.0, "speed": 25.0, "heading": 90})
        time.sleep(0.2)

    r = requests.post(f"{BASE}/servicios", headers=th, json={
        "cliente_nombre": "E2E Fase 10",
        "origen": {"texto": "Av. Central", "lat": P0[0] + 0.004, "lng": P0[1] + 0.002},
        "destino": {"texto": "Pakal Ná", "lat": P0[0] + 0.012, "lng": P0[1] - 0.005},
    })
    sid = r.json()["servicio"]["id"]
    requests.post(f"{BASE}/dispatch/offer", headers=th, json={"servicio_id": sid, "num_opciones": 3})
    acc = requests.post(f"{BASE}/servicios/{sid}/aceptar", headers=oh)
    assert acc.status_code == 200, acc.text
    s = acc.json()
    assert s["estado"] == "asignado"
    return {"op_id": op_id, "sid": sid}


def main():
    info = seed()
    print(">>> sembrado OK, servicio", info["sid"], "asignado a", info["op_id"])

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---- 1. Dispatcher / Terminal ----
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(f"{FRONT}/terminal/login", wait_until="networkidle")
        page.wait_for_selector("[data-testid=term-usuario]")
        page.fill("[data-testid=term-usuario]", TERM_USER)
        page.fill("[data-testid=term-contrasena]", TERM_PASS)
        page.click("[data-testid=term-submit]")
        page.wait_for_selector("[data-testid=terminal-map]", timeout=15000)
        page.wait_for_timeout(1500)
        assert page.locator("[data-testid=terminal-sidebar]").count() == 1
        # seleccionar el taxi (op1) desde la lista
        page.click(f"[data-testid=operador-item-{info['op_id']}]")
        page.wait_for_selector("[data-testid=taxi-detail-panel]", timeout=10000)
        page.wait_for_selector("[data-testid=ver-recorrido-btn]", timeout=10000)
        page.click("[data-testid=ver-recorrido-btn]")
        page.wait_for_timeout(800)
        # la polilínea del recorrido debe existir (Leaflet path .leaflet-interactive)
        assert page.locator(".leaflet-interactive").count() >= 1, "no se dibujó el recorrido"
        page.screenshot(path="test_reports/e2e_fase10_dispatcher.png", full_page=True)
        print(">>> Dispatcher: login, panel del taxi y recorrido OK")
        ctx.close()

        # ---- 2. App del conductor con navegación GPS (geoloc mockeada) ----
        ctx = browser.new_context(permissions=["geolocation"],
                                  geolocation={"latitude": P0[0], "longitude": P0[1]})
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(f"console[{m.type}]: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(f"{FRONT}/login", wait_until="networkidle")
        page.wait_for_selector("[data-testid=login-usuario]")
        page.fill("[data-testid=login-usuario]", OP_USER)
        page.fill("[data-testid=login-contrasena]", OP_PASS)
        page.click("[data-testid=login-submit]")
        page.wait_for_selector("[data-testid=driver-map]", timeout=15000)
        page.wait_for_selector("[data-testid=iniciar-viaje-btn]", timeout=20000)
        page.wait_for_timeout(1500)
        assert page.locator("[data-testid=ruta-info]").count() == 1, "sin info de ruta/ETA"
        page.screenshot(path="test_reports/e2e_fase10_driver_asignado.png", full_page=True)
        print(">>> Conductor: sheet 'Ir por el cliente' con ruta/ETA OK")

        # Llegué al cliente -> en_curso
        page.click("[data-testid=iniciar-viaje-btn]")
        try:
            page.wait_for_selector("[data-testid=terminar-viaje-btn]", timeout=12000)
        except Exception:
            page.screenshot(path="test_reports/e2e_fase10_encurso_FALLO.png", full_page=True)
            print(">>> ERROR tras iniciar viaje. Estado del sheet:")
            print(page.locator("[data-testid=driver-sheet-servicio]").inner_text()[:600])
            print(">>> Errores JS:", errors[-6:])
            raise
        page.wait_for_timeout(1500)
        page.screenshot(path="test_reports/e2e_fase10_driver_encurso.png", full_page=True)
        print(">>> Conductor: 'en_curso' (llevando al destino) OK")

        # Finalizar viaje (dialogo de confirmación)
        page.click("[data-testid=terminar-viaje-btn]")
        page.wait_for_selector("[role=alertdialog]", timeout=8000)
        page.locator("[role=alertdialog] button", has_text="Finalizar").first.click()
        # vuelve al home (sin servicio)
        page.wait_for_selector("[data-testid=driver-sheet-home]", timeout=15000)
        page.screenshot(path="test_reports/e2e_fase10_driver_finalizado.png", full_page=True)
        print(">>> Conductor: finalizado y de vuelta a home OK")
        ctx.close()

        browser.close()
        print("=== E2E FASE 10: TODO EN VERDE ===")


if __name__ == "__main__":
    main()