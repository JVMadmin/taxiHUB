"""Validación E2E del fix markerZoomAnimation en Terminal.

Estrategia de medición del "freeze/salto" de marcadores:
1. Login terminal con taxis libres cerca del centro con GPS fresco.
2. Durante zoom animado (wheel) se muestrea cada frame la posición del icono
   de un taxi (.leaflet-marker-pane .leaflet-marker-icon) y el estado del
   markerPane. Con `markerZoomAnimation=false` el markerPane recibe
   `leaflet-zoom-hide` -> visibility:hidden durante el gesto y salto al final.
   Con el default (true) el marcador se re-escala/mueve con CSS transform
   de forma continua.
3. Durante pan (drag) se muestrea igual: el marcador debe moverse con el pane.
"""

import requests

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8001/api"
FRONT = "http://127.0.0.1:3000"
TERM_USER, TERM_PASS = "central", "central123"

P0 = (17.5099, -91.9847)  # Palenque, mismo CENTER que Terminal.jsx

# JS del sampler: guarda en window.__samples la posición del primer marcador
# de taxi en cada requestAnimationFrame hasta que window.__stop = true.
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
                mapPane: {transform: getComputedStyle(mapPane).transform},
                zoomHide: markerPane ? markerPane.classList.contains('leaflet-zoom-hide') : null
            });
        }
        requestAnimationFrame(pick);
    };
    requestAnimationFrame(pick);
}"""


def seed():
    requests.post(f"{BASE}/seed")  # idempotente: siembra central/op1..op3 si la base está vacía
    tr = requests.post(f"{BASE}/terminal/login",
                       json={"usuario": TERM_USER, "contrasena": TERM_PASS}).json()["token"]
    th = {"Authorization": f"Bearer {tr}"}
    ops = requests.get(f"{BASE}/operadores", headers=th).json()
    op_ids = [o["id"] for o in ops]
    assert len(op_ids) >= 1, "sin operadores sembrados"
    for i, oid in enumerate(op_ids[:3]):
        requests.patch(f"{BASE}/operadores/{oid}/estado", json={"estado": "libre"}, headers=th)
        requests.post(f"{BASE}/operadores/{oid}/ubicacion", headers=th,
                      json={"lat": P0[0] + 0.004 * (i - 1), "lng": P0[1] + 0.004 * (i - 1),
                            "accuracy": 6.0, "speed": 25.0, "heading": 90})
    return op_ids


def distinct(samples, f):
    return len({round(f(s), 0) for s in samples})


def main():
    op_ids = seed()
    print(">>> taxis sembrados:", op_ids[:3])
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        page.goto(f"{FRONT}/terminal/login", wait_until="networkidle")
        page.wait_for_selector("[data-testid=term-usuario]")
        page.fill("[data-testid=term-usuario]", TERM_USER)
        page.fill("[data-testid=term-contrasena]", TERM_PASS)
        page.click("[data-testid=term-submit]")
        page.wait_for_selector("[data-testid=terminal-map]", timeout=20000)
        page.wait_for_timeout(5000)  # estilo vectorial + WS + primer repaint

        # marcadores de taxi visibles antes de empezar
        n_markers = page.locator(".leaflet-marker-pane .leaflet-marker-icon").count()
        print(f">>> marcadores en pantalla: {n_markers}")
        assert n_markers >= 1, "no hay marcadores de taxi visibles para validar"

        # ---------- CHECK 1: markerPane sin leaflet-zoom-hide ----------
        info = page.evaluate("""() => {
            const mp = document.querySelector('.leaflet-marker-pane');
            return mp ? {zoomHide: mp.classList.contains('leaflet-zoom-hide'),
                         classes: mp.className} : null;
        }""")
        print("CHECK1 markerPane:", info)
        assert info and not info["zoomHide"], \
            "FALLO: markerPane tiene leaflet-zoom-hide (markerZoomAnimation=false)"

        box = page.locator("[data-testid=terminal-map]").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

        # ---------- CHECK 2: zoom animado continuo ----------
        page.evaluate(SAMPLER_JS)
        page.mouse.move(cx, cy)
        page.mouse.wheel(0, -400)
        page.wait_for_timeout(1400)
        page.evaluate("window.__stop = true")
        samples = page.evaluate("window.__samples")
        print(f"CHECK2 samples durante zoom: {len(samples)}")
        assert len(samples) > 10, "pocas muestras"
        hidden = [s for s in samples if s["marker"]["visibility"] == "hidden"]
        zh = [s for s in samples if s["zoomHide"]]
        print(f"CHECK2a muestras hidden: {len(hidden)}/{len(samples)}, con zoom-hide en pane: {len(zh)}/{len(samples)}")
        assert not hidden, "FALLO: marcador oculto durante zoom (comportamiento markerZoomAnimation=false)"
        assert not zh, "FALLO: markerPane recibió leaflet-zoom-hide durante el zoom"
        # Nota: Leaflet solo REPOSICIONA el icono por frame (Marker._animateZoom ->
        # _setPos); el tamaño en px del icono es constante por diseño. Lo que
        # demuestra continuidad es el reposicionamiento suave (x/y) del icono.
        dx = distinct(samples, lambda s: s["marker"]["x"])
        dy = distinct(samples, lambda s: s["marker"]["y"])
        print(f"CHECK2b distinct x={dx} y={dy}")
        assert dx >= 3 and dy >= 3, "marcador congelado durante el zoom"

        # ---------- CHECK 3: pan continuo ----------
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
        assert len(samples) > 5, "pocas muestras en pan"
        dx = distinct(samples, lambda s: s["marker"]["x"])
        dy = distinct(samples, lambda s: s["marker"]["y"])
        print(f"CHECK3a distinct x={dx} y={dy}")
        assert dx >= 3 and dy >= 3, "marcador congelado durante el pan"

        page.screenshot(path="test_reports/marker_zoom_fix_terminal.png", full_page=True)
        print("=== VALIDACIÓN TERMINAL: TODO OK ===")
        ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
