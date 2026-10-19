#!/usr/bin/env python3
"""
scripts/build_all_apks.py
Compila de forma determinista y reproducible los 3 APKs nativos de Android:
- taxiHUB-operador-debug.apk (Driver app con voz Web Audio TTS streaming, wake screen, turn-by-turn HUD, mapa oscuro y UI modo diurno)
- taxiHUB-pasajero-debug.apk (Passenger app con seguimiento en tiempo real, chat, tarjetas 30% compactas, estrellas y UI diurno)
- taxiHUB-socio-debug.apk (Dueño / Socio flotillero app)
"""

import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(ROOT, "frontend")
ANDROID_DIR = os.path.join(FRONTEND_DIR, "android")
ASSETS_PUBLIC = os.path.join(ANDROID_DIR, "app", "src", "main", "assets", "public")
STRINGS_XML = os.path.join(ANDROID_DIR, "app", "src", "main", "res", "values", "strings.xml")
CAP_CONFIG = os.path.join(ANDROID_DIR, "app", "src", "main", "assets", "capacitor.config.json")
OUTPUT_APK = os.path.join(ANDROID_DIR, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
DOWNLOADS_DIR = os.path.join(FRONTEND_DIR, "build", "downloads")

os.makedirs(DOWNLOADS_DIR, exist_ok=True)

ROLES = [
    {
        "role": "operador",
        "name": "TaxiHUB Operador",
        "package": "com.taxihub.operador",
        "apk_name": "taxiHUB-operador-debug.apk",
    },
    {
        "role": "pasajero",
        "name": "TaxiHUB Pasajero",
        "package": "com.taxihub.pasajero",
        "apk_name": "taxiHUB-pasajero-debug.apk",
    },
    {
        "role": "socio",
        "name": "TaxiHUB Socio",
        "package": "com.taxihub.socio",
        "apk_name": "taxiHUB-socio-debug.apk",
    },
]

def update_strings_xml(name, package):
    content = f"""<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">{name}</string>
    <string name="title_activity_main">{name}</string>
    <string name="package_name">{package}</string>
    <string name="custom_url_scheme">{package}</string>
</resources>
"""
    with open(STRINGS_XML, "w", encoding="utf-8") as f:
        f.write(content)

def update_index_html(role):
    index_path = os.path.join(ASSETS_PUBLIC, "index.html")
    if not os.path.exists(index_path):
        raise FileNotFoundError(f"No se encontró {index_path}")
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Quitar cualquier inyección previa de __TAXIHUB_APP_MODE__
    html = re.sub(r'<script id="th-app-mode">.*?</script>', '', html, flags=re.DOTALL)

    # Inyectar modo en el head
    injection = f'<script id="th-app-mode">window.__TAXIHUB_APP_MODE__="{role}";</script>'
    if "</head>" in html:
        html = html.replace("</head>", f"{injection}</head>")
    else:
        html = injection + html

    with open(index_path, "w", encoding="utf-8") as f:
        f.write(html)

def update_cap_config(name, package):
    if not os.path.exists(CAP_CONFIG):
        return
    with open(CAP_CONFIG, "r", encoding="utf-8") as f:
        cfg = f.read()
    cfg = re.sub(r'"appName"\s*:\s*"[^"]*"', f'"appName": "{name}"', cfg)
    cfg = re.sub(r'"appId"\s*:\s*"[^"]*"', f'"appId": "{package}"', cfg)
    with open(CAP_CONFIG, "w", encoding="utf-8") as f:
        f.write(cfg)

def build_apk(role_info):
    role = role_info["role"]
    name = role_info["name"]
    pkg = role_info["package"]
    apk_target = os.path.join(DOWNLOADS_DIR, role_info["apk_name"])

    print(f"\n==========================================")
    print(f"[*] Configurando y compilando APK para: {name} ({role})")
    print(f"==========================================")

    update_strings_xml(name, pkg)
    update_index_html(role)
    update_cap_config(name, pkg)

    cmd = "cmd.exe /c gradlew.bat assembleDebug"
    print(f"[>] Ejecutando: {cmd}")
    res = subprocess.run(cmd, cwd=ANDROID_DIR, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print("[!] ERROR en gradlew assembleDebug:")
        print(res.stderr[-1500:] if res.stderr else res.stdout[-1500:])
        return False

    if not os.path.exists(OUTPUT_APK):
        print(f"[!] No se encontró el APK de salida en {OUTPUT_APK}")
        return False

    shutil.copy2(OUTPUT_APK, apk_target)
    size_mb = os.path.getsize(apk_target) / (1024 * 1024)
    print(f"[+] APK compilado y copiado con éxito: {apk_target} ({size_mb:.2f} MB)")
    return True

def clean_nested_downloads():
    nested_downloads = os.path.join(ASSETS_PUBLIC, "downloads")
    if os.path.exists(nested_downloads):
        print(f"[>] Eliminando carpeta nested downloads de assets para mantener APK ligero: {nested_downloads}")
        shutil.rmtree(nested_downloads, ignore_errors=True)

def main():
    print("=== Iniciando sincronizacion de assets y compilacion multi-rol ===")
    
    # Mover temporalmente build/downloads fuera para que cap copy no copie los APKs pesados a los assets nativos
    temp_downloads = os.path.join(FRONTEND_DIR, "downloads_temp_build")
    had_downloads = False
    if os.path.exists(DOWNLOADS_DIR):
        had_downloads = True
        if os.path.exists(temp_downloads):
            shutil.rmtree(temp_downloads, ignore_errors=True)
        shutil.move(DOWNLOADS_DIR, temp_downloads)

    try:
        sync_cmd = "npx cap copy android"
        print(f"[>] Copiando build web a assets nativos: {sync_cmd}")
        res = subprocess.run(sync_cmd, cwd=FRONTEND_DIR, shell=True, capture_output=True, text=True)
        if res.returncode != 0:
            print("[!] Error en cap copy:")
            print(res.stderr or res.stdout)
            sys.exit(1)
    finally:
        if had_downloads and os.path.exists(temp_downloads):
            if os.path.exists(DOWNLOADS_DIR):
                shutil.rmtree(DOWNLOADS_DIR, ignore_errors=True)
            shutil.move(temp_downloads, DOWNLOADS_DIR)
        os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    
    clean_nested_downloads()
    print("[+] Assets web sincronizados y limpios en android/app/src/main/assets/public")

    for r in ROLES:
        clean_nested_downloads()
        ok = build_apk(r)
        if not ok:
            print(f"[!] Fallo la compilacion de {r['role']}")
            sys.exit(1)

    # Dejar strings.xml en operador por defecto
    update_strings_xml("TaxiHUB Operador", "com.taxihub.operador")
    update_index_html("operador")
    print("\n[OK] TODOS LOS 3 APKS FUERON COMPILADOS EXITOSAMENTE:")
    for r in ROLES:
        p = os.path.join(DOWNLOADS_DIR, r["apk_name"])
        print(f" - {r['apk_name']}: {os.path.getsize(p)/(1024*1024):.2f} MB")

if __name__ == "__main__":
    main()
