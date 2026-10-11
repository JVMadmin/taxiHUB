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
        page.wait_for_selector("[data-testid='taxihub-landing-page']", timeout=10000)
        
        # Verificar precio $99 MXN
        body_text = page.inner_text("body")
        if "$99" not in body_text:
            errors.append("No se encontro el precio $99 MXN en la pagina.")
        else:
            print("  [OK] Precio '$99 MXN' presente")

        # Verificar simulador de despacho
        sim = page.wait_for_selector("[data-testid='landing-simulator']", timeout=5000)
        if sim:
            print("  [OK] Simulador de despacho interactivo visible")

        # Probar interaccion del simulador (clic en boton de hotspot)
        hotspot_btn = page.query_selector("[data-testid='landing-simulator'] button:has-text('Hospital')")
        if hotspot_btn:
            hotspot_btn.click()
            time.sleep(1)
            print("  [OK] Clic en hotspot del simulador interactivo ejecutado")

        # Verificar seccion de video
        video = page.query_selector("video")
        if video:
            poster = video.get_attribute("poster")
            print(f"  [OK] Reproductor de video presente (poster: {poster})")
        else:
            errors.append("No se encontro el elemento <video> en la landing.")

        # Verificar calculador de precios interactivo
        print("[3/6] Probando calculadora de unidades ($99 MXN)...")
        units_input = page.query_selector("[data-testid='landing-price-units']")
        if units_input:
            print("  [OK] Input interactivo de unidades encontrado")

        # 4. Verificar descargas
        print("[4/6] Verificando enlaces de descarga de aplicaciones...")
        downloads = [
            "TaxiHub-Central.exe",
            "taxiHUB-operador-debug.apk",
            "taxiHUB-socio-debug.apk"
        ]
        for d in downloads:
            link = page.query_selector(f"a[href*='{d}']")
            if link:
                print(f"  [OK] Enlace de descarga para {d} presente")
            else:
                errors.append(f"Falta enlace de descarga para {d}")

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
