"""Validación E2E del fix markerZoomAnimation en Mapa.jsx (panel dueño).

Siembra vía API: usuario dueño + vehículo con propietario_id + operador
con GPS fresco (conductor del vehículo). Login dueño -> tab Mapa -> mismos
checks de continuidad de marcadores durante zoom animado y pan.
"""

import requests

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8001/api"
FRONT = "http://127.0.0.1:3000"
TERM_USER, TERM_PASS = "central", "central123"
DUENO_USER, DUENO_PASS = "dueno_e2e", "dueno123"

P0 = (17.5099, -91.9847)

SAMPLER_JS = """() => {
    window.__samples = [];
    window.__stop = false;
    const pick = () => {
        const marker = document.querySelector('.leaflet-marker-pane .leaflet-marker-icon');
        const mapPane = document.querySelector('.leaflet-map-pane');
        const markerPane = document.querySelector('.leaflet-marker-pane');
        if (window.__stop) return;
        if (marker && mapPane) {
            const ms = getComputedStyle(marker);
            const mrect = marker.getBoundingClientRect();
            window.__samples.push({
                t: performance.now(),
                marker: {x: mrect.x, y: mrect.y, w: mrect.width, h: mrect.height,
                         visibility: ms.visibility},
                zoomHide: markerPane ? markerPane.classList.contains('leaflet-zoom-hide') : null
            });
        }
        requestAnimationFrame(pick);
    };
    requestAnimationFrame(pick);
}"""


def seed():
    requests.post(f"{BASE}/seed")
    tr = requests.post(f"{BASE}/terminal/login",
                       json={"usuario": TERM_USER, "contrasena": TERM_PASS}).json()["token"]
    th = {"Authorization": f"Bearer {tr}"}

    # usuario dueño (idempotente)
    r = requests.post(f"{BASE}/dueno/usuarios", headers=th,
                      json={"nombre": "Dueño E2E", "usuario": DUENO_USER, "contrasena": DUENO_PASS})
    if r.status_code == 409:
        # ya existe: recuperar su id vía terminal list
        duenos = requests.get(f"{BASE}/dueno/usuarios", headers=th).json()
        dueno_id = next(d["id"] for d in duenos if d["usuario"] == DUENO_USER)
    else:
        dueno_id = r.json()["id"]

    # login dueño
    dt = requests.post(f"{BASE}/dueno/login",
                       json={"usuario": DUENO_USER, "contrasena": DUENO_PASS}).json()["token"]

    # operador libre cerca del centro
    ops = requests.get(f"{BASE}/operadores", headers=th).json()
    op = ops[0]
    requests.patch(f"{BASE}/operadores/{op['id']}/estado", json={"estado": "libre"}, headers=th)

    # vehículo asignado a este dueño y conductor op (nace con lat/lng None;
    # 409 si ya existe de una corrida previa — está bien, el op ya quedó vinculado)
    veh = requests.post(f"{BASE}/vehiculos", headers=th, json={
        "numero_economico": "E2E-DUENO-1", "placa": None, "marca": "Nissan",
        "modelo": "March", "color": "Blanco", "estado": "activo",
        "operador_conductor_id": op["id"], "propietario_id": dueno_id,
    })
    assert veh.status_code in (200, 201, 409), veh.text

    # AHORA sí: la ubicación del operador se propaga al vehículo asociado
    # (POST /vehiculos setea operador.vehiculo_id, y _actualizar_ubicacion
    # copia lat/lng al vehículo). Sin esto el vehículo queda lat:null en /dueno/flota.
    requests.post(f"{BASE}/operadores/{op['id']}/ubicacion", headers=th,
                  json={"lat": P0[0], "lng": P0[1], "accuracy": 6.0, "speed": 25.0, "heading": 90})
    return {"dueno_id": dueno_id, "op_id": op["id"]}


def distinct(samples, f):
    return len({round(f(s), 0) for s in samples})


def main():
    seed()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        page.goto(f"{FRONT}/dueno/login", wait_until="networkidle")
        page.wait_for_selector("[data-testid=dueno-login-usuario]")
        page.fill("[data-testid=dueno-login-usuario]", DUENO_USER)
        page.fill("[data-testid=dueno-login-contrasena]", DUENO_PASS)
        page.click("[data-testid=dueno-login-submit]")
        page.wait_for_selector("[data-testid=dueno-nav]", timeout=20000)
        page.click("[data-testid=dueno-nav-mapa]")
        page.wait_for_selector("[data-testid=dueno-mapa]", timeout=20000)
        page.wait_for_timeout(4000)

        n_markers = page.locator(".leaflet-marker-pane .leaflet-marker-icon").count()
        print(f">>> marcadores en pantalla: {n_markers}")
        assert n_markers >= 1, "no hay marcadores de vehículo visibles en Mapa dueño"

        info = page.evaluate("""() => {
            const mp = document.querySelector('.leaflet-marker-pane');
            return mp ? {zoomHide: mp.classList.contains('leaflet-zoom-hide')} : null;
        }""")
        print("CHECK1 markerPane:", info)
        assert info and not info["zoomHide"], "FALLO: markerPane tiene leaflet-zoom-hide"

        box = page.locator("[data-testid=dueno-mapa]").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

        # zoom animado — NOTA: Mapa.jsx auto-centra en el primer vehículo, así que
        # el marcador queda en el centro del mapa. El wheel-zoom de Leaflet se ancla
        # al cursor: alejamos el cursor del centro para que el marcador (en el centro)
        # se desplace visiblemente durante la animación.
        page.evaluate(SAMPLER_JS)
        page.mouse.move(cx - 350, cy - 220)
        page.mouse.wheel(0, -400)
        page.wait_for_timeout(1400)
        page.evaluate("window.__stop = true")
        samples = page.evaluate("window.__samples")
        print(f"CHECK2 samples durante zoom: {len(samples)}")
        assert len(samples) > 5, "pocas muestras"
        hidden = [s for s in samples if s["marker"]["visibility"] == "hidden"]
        zh = [s for s in samples if s["zoomHide"]]
        print(f"CHECK2a hidden: {len(hidden)}/{len(samples)}, zoomHide: {len(zh)}/{len(samples)}")
        assert not hidden and not zh, "FALLO: marcador oculto durante zoom"
        dx = distinct(samples, lambda s: s["marker"]["x"])
        dy = distinct(samples, lambda s: s["marker"]["y"])
        print(f"CHECK2b distinct x={dx} y={dy}")
        assert dx >= 3 and dy >= 3, "marcador congelado durante el zoom"

        # pan
        page.evaluate(SAMPLER_JS)
        page.mouse.move(cx, cy)
        page.mouse.down()
        for i in range(1, 11):
            page.mouse.move(cx - i * 30, cy + i * 12, steps=5)
        page.mouse.up()
        page.wait_for_timeout(800)
        page.evaluate("window.__stop = true")
        samples = page.evaluate("window.__samples")
        print(f"CHECK3 samples durante pan: {len(samples)}")
        dx = distinct(samples, lambda s: s["marker"]["x"])
        dy = distinct(samples, lambda s: s["marker"]["y"])
        print(f"CHECK3a distinct x={dx} y={dy}")
        assert dx >= 3 and dy >= 3, "marcador congelado durante el pan"

        page.screenshot(path="test_reports/marker_zoom_fix_dueno.png", full_page=True)
        print("=== VALIDACIÓN MAPA DUEÑO: TODO OK ===")
        ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
