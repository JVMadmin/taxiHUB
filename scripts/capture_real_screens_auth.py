import json
import urllib.request
import time
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "landing"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PROD_URL = "https://taxihub.cloud"

def get_auth_token(endpoint, payload):
    url = f"{PROD_URL}/api{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def capture():
    print("=== Obteniendo tokens y capturando pantallas REALES del producto ===")
    
    # 1. Terminal Token
    term_res = get_auth_token("/terminal/login", {"usuario": "central", "contrasena": "central123"})
    term_token = term_res["token"]
    term_user = term_res["usuario"]
    print(f"  [OK] Terminal auth: {term_user['nombre']}")

    # 2. Socio Token
    dueno_res = get_auth_token("/dueno/login", {"usuario": "socio_roberto", "contrasena": "socio123"})
    dueno_token = dueno_res["token"]
    dueno_user = dueno_res["usuario"]
    print(f"  [OK] Socio auth: {dueno_user['nombre']}")

    # 3. Operador Token
    op_res = get_auth_token("/auth/login", {"usuario": "op1", "contrasena": "taxi123"})
    op_token = op_res["token"]
    op_user = op_res["operador"]
    print(f"  [OK] Operador auth: {op_user['nombre']}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # PANTALLA 1: Terminal Real de Despacho (1440x900)
        # -------------------------------------------------------------
        print("\n[1/3] Capturando Terminal Real...")
        ctx_t = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page_t = ctx_t.new_page()
        # Navegar a la página base para poder escribir en localStorage
        page_t.goto(f"{PROD_URL}/terminal/login", wait_until="commit")
        page_t.evaluate(f"""() => {{
            localStorage.setItem('term_token', '{term_token}');
            localStorage.setItem('term_data', JSON.stringify({json.dumps(term_user)}));
        }}""")
        page_t.goto(f"{PROD_URL}/terminal", wait_until="networkidle", timeout=30000)
        print("  Esperando renderizado de la flota y mapa Leaflet...")
        time.sleep(6)
        
        term_png = OUTPUT_DIR / "terminal.png"
        page_t.screenshot(path=str(term_png), full_page=False)
        print(f"  [OK] Captura guardada: {term_png.name} ({term_png.stat().st_size} bytes)")
        
        # WebP
        img_t = Image.open(term_png)
        img_t.save(OUTPUT_DIR / "terminal.webp", format="WEBP", quality=92, method=6)
        print("  [OK] terminal.webp guardado")
        ctx_t.close()

        # -------------------------------------------------------------
        # PANTALLA 2: Panel Real de Socios / Dueño (1440x900)
        # -------------------------------------------------------------
        print("\n[2/3] Capturando Panel Real de Socios / Flota...")
        ctx_s = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page_s = ctx_s.new_page()
        page_s.goto(f"{PROD_URL}/dueno/login", wait_until="commit")
        page_s.evaluate(f"""() => {{
            localStorage.setItem('dueno_token', '{dueno_token}');
            localStorage.setItem('dueno_data', JSON.stringify({json.dumps(dueno_user)}));
        }}""")
        page_s.goto(f"{PROD_URL}/dueno", wait_until="networkidle", timeout=30000)
        print("  Esperando renderizado del panel de socios...")
        time.sleep(6)
        
        socio_png = OUTPUT_DIR / "socio.png"
        page_s.screenshot(path=str(socio_png), full_page=False)
        print(f"  [OK] Captura guardada: {socio_png.name} ({socio_png.stat().st_size} bytes)")
        
        img_s = Image.open(socio_png)
        img_s.save(OUTPUT_DIR / "socio.webp", format="WEBP", quality=92, method=6)
        print("  [OK] socio.webp guardado")
        ctx_s.close()

        # -------------------------------------------------------------
        # PANTALLA 3: App Real del Operador (Mobile Viewport 390x844)
        # -------------------------------------------------------------
        print("\n[3/3] Capturando App Real del Operador Móvil...")
        ctx_op = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            device_scale_factor=2
        )
        page_op = ctx_op.new_page()
        page_op.goto(f"{PROD_URL}/login", wait_until="commit")
        page_op.evaluate(f"""() => {{
            localStorage.setItem('op_token', '{op_token}');
            localStorage.setItem('op_data', JSON.stringify({json.dumps(op_user)}));
        }}""")
        page_op.goto(f"{PROD_URL}/operador", wait_until="networkidle", timeout=30000)
        print("  Esperando renderizado de la app del operador...")
        time.sleep(6)
        
        op_png = OUTPUT_DIR / "operador.png"
        page_op.screenshot(path=str(op_png), full_page=False)
        print(f"  [OK] Captura guardada: {op_png.name} ({op_png.stat().st_size} bytes)")
        
        img_op = Image.open(op_png)
        img_op.save(OUTPUT_DIR / "operador.webp", format="WEBP", quality=92, method=6)
        print("  [OK] operador.webp guardado")
        ctx_op.close()

        # -------------------------------------------------------------
        # PANTALLA 4: Video Poster Real
        # -------------------------------------------------------------
        print("\n[4/4] Generando video-poster a partir de la Terminal Real...")
        poster_png = OUTPUT_DIR / "video-poster.png"
        img_term = Image.open(term_png).resize((1280, 720), Image.Resampling.LANCZOS)
        img_term.save(poster_png)
        img_term.save(OUTPUT_DIR / "video-poster.webp", format="WEBP", quality=90)
        print("  [OK] video-poster.webp generado")

        browser.close()

    print("\n=========================================================")
    print("  ¡TODAS LAS CAPTURAS REALES DEL PRODUCTO FUERON GUARDADAS!")
    print("=========================================================")

if __name__ == "__main__":
    capture()
