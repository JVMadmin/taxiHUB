import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPORTS_DIR = Path(__file__).resolve().parent.parent / "test_reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

PROD_URL = "https://taxihub.cloud"

def verify():
    print(f"=== Verificando despliegue de produccion en {PROD_URL} ===")
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Capturar errores de consola
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1/6] Cargando pagina principal...")
        res = page.goto(PROD_URL, wait_until="networkidle", timeout=30000)
        if not res or res.status != 200:
            errors.append(f"HTTP status no es 200: {res.status if res else 'None'}")
        print(f"  HTTP Status: {res.status}")

        # 2. Verificar elementos centrales
        print("[2/6] Verificando elementos de marca y estructura...")
        page.wait_for_selector("[data-testid='taxihub-landing-page']", state="attached", timeout=30000)
        
        # Verificar precio $99 MXN
        body_text = page.inner_text("body")
        if "$99" not in body_text:
            errors.append("No se encontro el precio $99 MXN en la pagina.")
        else:
            print("  [OK] Precio '$99 MXN' presente")

        # Demo interactiva del hero: mapa con unidades y selección desde la lista
        page.wait_for_selector("[data-testid='landing-hero-demo']", timeout=10000)
        try:
            page.wait_for_function("document.querySelectorAll('[data-testid=landing-hero-demo] .ld-unidad').length > 5", timeout=20000)
            page.click("[data-testid='landing-demo-fila-054']")
            time.sleep(1)
            if "054" in page.inner_text("[data-testid='landing-demo-detalle']"):
                print("  [OK] Demo del hero: seleccionar una unidad actualiza el detalle")
            else:
                errors.append("La demo del hero no actualiza el detalle al seleccionar una unidad")
        except Exception as e:  # sin WebGL el mapa muestra una captura real en su lugar
            errors.append(f"Mapa de la demo del hero no cargó: {e}")

        # Explorador del producto (pestañas) y video real en diálogo
        page.click("[data-testid='landing-explorador-tab-whatsapp']")
        time.sleep(1)
        if page.query_selector("[data-testid='landing-wa-mensajes']"):
            print("  [OK] Explorador: pestaña WhatsApp")
        else:
            errors.append("El explorador no muestra la pestaña de WhatsApp")
        video = page.query_selector("[data-testid='landing-video-dialogo'] video")
        if video:
            print(f"  [OK] Video real disponible (poster: {video.get_attribute('poster')})")
        else:
            errors.append("No se encontró el video real en la landing.")

        print("[3/6] Probando calculadora de unidades ($99 MXN)...")
        units_input = page.query_selector("[data-testid='landing-price-units']")
        if units_input:
            units_input.fill("40")
            time.sleep(0.5)
            if "3,960" in page.inner_text("[data-testid='landing-price-total']"):
                print("  [OK] Calculadora: 40 unidades = $3,960 MXN")
            else:
                errors.append("La calculadora de precio no actualiza el total")

        # 4. Descargas (no se enlazan desde la landing; deben seguir servidas)
        print("[4/6] Verificando descargas de las apps...")
        for d in ["taxiHUB-operador-debug.apk", "taxiHUB-pasajero-debug.apk", "taxiHUB-socio-debug.apk"]:
            r = page.request.head(f"{PROD_URL}/downloads/{d}")
            if r.status == 200:
                print(f"  [OK] /downloads/{d} disponible")
            else:
                errors.append(f"/downloads/{d} respondió {r.status}")

        # Captura Desktop
        desktop_shot = REPORTS_DIR / "taxihub_production_desktop.png"
        page.screenshot(path=str(desktop_shot), full_page=True)
        print(f"  [OK] Captura de pantalla de escritorio guardada en: {desktop_shot.name}")

        # 5. Vista Movil
        print("[5/6] Verificando adaptabilidad y viewport movil (390x844)...")
        mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
        mobile_page = mobile_context.new_page()
        mobile_page.goto(PROD_URL, wait_until="networkidle", timeout=30000)
        
        # Comprobar overflow horizontal
        scroll_width = mobile_page.evaluate("document.documentElement.scrollWidth")
        client_width = mobile_page.evaluate("document.documentElement.clientWidth")
        if scroll_width > client_width:
            print(f"  [AVISO] Desbordamiento horizontal: scrollWidth {scroll_width} > clientWidth {client_width}")
        else:
            print(f"  [OK] Cero desbordamiento horizontal en movil ({client_width}px)")

        mobile_shot = REPORTS_DIR / "taxihub_production_mobile.png"
        mobile_page.screenshot(path=str(mobile_shot), full_page=False)
        print(f"  [OK] Captura de pantalla movil guardada en: {mobile_shot.name}")

        # 6. Portales operativos
        print("[6/6] Verificando portales operativos existentes...")
        routes_to_test = [
            ("/terminal/login", "central de despacho"),
            ("/login", "operador"),
            ("/dueno/login", "socios"),
        ]
        for route, desc in routes_to_test:
            r_res = page.goto(f"{PROD_URL}{route}", wait_until="networkidle", timeout=15000)
            if r_res and r_res.status == 200:
                print(f"  [OK] Ruta {route} ({desc}) operativa: HTTP 200")
            else:
                errors.append(f"Ruta {route} fallo con codigo {r_res.status if r_res else 'None'}")

        browser.close()

    if errors:
        print("\n[ERRORES ENCONTRADOS]:")
        for err in errors:
            print(f"  - {err}")
        return False
    else:
        print("\n=======================================================")
        print("  TODAS LAS VERIFICACIONES EN PRODUCCION PASARON EXITOSAMENTE")
        print("=======================================================")
        return True

if __name__ == "__main__":
    success = verify()
    sys.exit(0 if success else 1)
