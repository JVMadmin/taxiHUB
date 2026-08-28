import json
import time
from pathlib import Path

import jwt
from playwright.sync_api import sync_playwright

env = {}
for line in Path("backend/.env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

TOKEN = jwt.encode(
    {"sub": "6a85fb02b2cbe88ca038a9bd", "usuario": "op1", "scope": "operador", "iat": int(time.time())},
    env["JWT_SECRET"], algorithm="HS256",
)
OP_DATA = {"id": "6a85fb02b2cbe88ca038a9bd", "usuario": "op1", "nombre": "Carlos Ramirez"}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
    page.on("console", lambda m: errors.append(f"CONSOLE[{m.type}]: {m.text}") if m.type == "error" else None)
    page.on("response", lambda r: errors.append(f"HTTP {r.status}: {r.url}") if r.status >= 400 else None)

    page.goto("http://localhost:3000/operador")
    page.wait_for_load_state("networkidle")
    page.evaluate("([t, d]) => { localStorage.setItem('op_token', t); localStorage.setItem('op_data', JSON.stringify(d)); }", [TOKEN, OP_DATA])
    page.goto("http://localhost:3000/operador")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(5000)

    thumbs = page.evaluate("""() => {
      const m = document.querySelector('.taxi-driver-vehicle-mini');
      if (!m) return { mini: null };
      const imgs = [...m.querySelectorAll('img')];
      return { mini: { w: m.clientWidth, h: m.clientHeight, rect: m.getBoundingClientRect().toJSON() },
               imgs: imgs.map(i => ({ src: i.src, nw: i.naturalWidth, nh: i.naturalHeight, complete: i.complete })) };
    }""")
    print("THUMB:", json.dumps(thumbs, ensure_ascii=False))
    print("ERRORS:", json.dumps(errors, ensure_ascii=False)[:1200])
    page.screenshot(path="C:/Users/VALERI~1/AppData/Local/Temp/opencode/op1_real.png")
    browser.close()