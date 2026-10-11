import os
import subprocess
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "landing"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 1. HTML TEMPLATE: TERMINAL DE DESPACHO (1440x900)
HTML_TERMINAL = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Terminal de Despacho</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #050505; color: #F5F5F7; font-family: 'Plus Jakarta Sans', sans-serif;
    width: 1440px; height: 900px; overflow: hidden; display: flex; flex-direction: column;
  }
  .font-mono { font-family: 'Fira Code', monospace; }
  /* Header */
  header {
    height: 56px; background: #0B0D10; border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-logo {
    width: 34px; height: 34px; border-radius: 8px; background: #10B981;
    display: flex; align-items: center; justify-content: center; color: #04130D; font-weight: 900;
  }
  .brand-text { font-size: 16px; font-weight: 800; letter-spacing: -0.02em; }
  .brand-text span { color: #10B981; }
  .header-badges { display: flex; align-items: center; gap: 12px; }
  .badge {
    padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
    display: flex; align-items: center; gap: 6px;
  }
  .badge-wa { background: rgba(16,185,129,0.12); color: #10B981; border: 1px solid rgba(16,185,129,0.3); }
  .badge-tenant { background: rgba(255,255,255,0.05); color: #9CA0AA; border: 1px solid rgba(255,255,255,0.1); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #10B981; }
  /* Main Layout */
  .main { flex: 1; display: grid; grid-template-columns: 380px 1fr; background: #07090D; }
  /* Sidebar */
  .sidebar {
    background: #0B0D10; border-right: 1px solid rgba(255,255,255,0.08);
    padding: 18px; display: flex; flex-direction: column; gap: 16px;
  }
  .panel-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9CA0AA; }
  .quick-card {
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px; padding: 14px;
  }
  .hotkeys-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
  .hotkey-btn {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 8px 4px; text-align: center;
  }
  .hotkey-key { color: #10B981; font-weight: 700; font-size: 11px; }
  .hotkey-name { color: #9CA0AA; font-size: 10px; margin-top: 2px; }
  .service-card {
    background: #12151B; border: 1px solid rgba(16,185,129,0.3); border-radius: 12px;
    padding: 12px; margin-top: 8px;
  }
  .service-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .service-tag { background: rgba(16,185,129,0.2); color: #10B981; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .service-addr { font-size: 13px; font-weight: 700; color: #FFF; }
  .service-meta { font-size: 11px; color: #9CA0AA; margin-top: 4px; display: flex; justify-content: space-between; }
  /* Map Canvas */
  .map-container { position: relative; width: 100%; height: 100%; background: #080A0F; overflow: hidden; }
  .grid-bg {
    position: absolute; inset: 0;
    background-image: linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .radar-ring {
    position: absolute; left: 52%; top: 48%; transform: translate(-50%, -50%);
    border-radius: 50%; border: 1px solid rgba(16,185,129,0.15); pointer-events: none;
  }
  .ring-1 { width: 500px; height: 500px; }
  .ring-2 { width: 300px; height: 300px; border-color: rgba(16,185,129,0.25); }
  .ring-3 { width: 120px; height: 120px; border-color: rgba(16,185,129,0.4); }
  /* Roads simulation */
  svg.roads { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.35; }
  /* Taxi markers */
  .taxi-marker {
    position: absolute; transform: translate(-50%, -50%);
    display: flex; align-items: center; gap: 6px; padding: 5px 10px;
    border-radius: 999px; font-size: 11px; font-weight: 700; box-shadow: 0 4px 14px rgba(0,0,0,0.6);
  }
  .taxi-free { background: #0B0D10; border: 1.5px solid #10B981; color: #10B981; }
  .taxi-busy { background: #0B0D10; border: 1.5px solid #F59E0B; color: #F59E0B; }
  .taxi-dispatched { background: #10B981; border: 1.5px solid #34D399; color: #04130D; box-shadow: 0 0 20px rgba(16,185,129,0.5); }
  /* Floating Toast */
  .toast {
    position: absolute; bottom: 24px; right: 24px; background: #0B0D10;
    border: 1px solid rgba(16,185,129,0.4); border-radius: 12px; padding: 14px 18px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 12px;
  }
  .toast-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(16,185,129,0.2); color: #10B981; display: flex; align-items: center; justify-content: center; font-size: 16px; }
  .toast-title { font-size: 12px; font-weight: 700; color: #FFF; }
  .toast-sub { font-size: 11px; color: #9CA0AA; margin-top: 2px; }
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="brand-logo">🚕</div>
    <div class="brand-text">taxi<span>HUB</span></div>
    <span class="font-mono" style="font-size: 11px; color: #9CA0AA; margin-left: 8px;">TERMINAL v4.2 · SITIO MAYA</span>
  </div>
  <div class="header-badges">
    <div class="badge badge-wa">
      <span class="dot"></span>
      <span>WhatsApp QR Activo · 0 Comisiones</span>
    </div>
    <div class="badge badge-tenant font-mono">
      <span>Tenant: sitio_maya_01</span>
    </div>
    <div class="badge badge-tenant font-mono" style="color: #FFF;">
      <span>24 Unidades Activas</span>
    </div>
  </div>
</header>
<div class="main">
  <div class="sidebar">
    <div>
      <div class="panel-title">Despacho Rápido (F2)</div>
      <div class="quick-card" style="margin-top: 8px;">
        <div style="font-size: 12px; font-weight: 600; color: #FFF;">Destino / Pasajero</div>
        <div class="font-mono" style="margin-top: 6px; padding: 8px 10px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-size: 12px; color: #10B981;">
          ⚡ A indicaciones del pasajero
        </div>
        <div style="font-size: 11px; color: #9CA0AA; margin-top: 8px;">Botonera Puntos Calientes (1-4):</div>
        <div class="hotkeys-grid">
          <div class="hotkey-btn">
            <div class="hotkey-key">[1]</div>
            <div class="hotkey-name">Terminal ADO</div>
          </div>
          <div class="hotkey-btn">
            <div class="hotkey-key">[2]</div>
            <div class="hotkey-name">Hospital Gral.</div>
          </div>
          <div class="hotkey-btn">
            <div class="hotkey-key">[3]</div>
            <div class="hotkey-name">Mercado</div>
          </div>
          <div class="hotkey-btn">
            <div class="hotkey-key">[4]</div>
            <div class="hotkey-name">Zona Arq.</div>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="panel-title">Servicios en Curso (3)</div>
      <div class="service-card">
        <div class="service-hdr">
          <span class="service-tag font-mono">EN CAMINO · 2 MIN</span>
          <span class="font-mono" style="font-size: 11px; color: #10B981; font-weight: 700;">#TX-101</span>
        </div>
        <div class="service-addr">Terminal ADO ➔ Col. La Cañada</div>
        <div class="service-meta">
          <span>Pasajero: WhatsApp (+52 916 112 3456)</span>
          <span class="font-mono" style="color: #FFF; font-weight: 700;">$45 MXN</span>
        </div>
      </div>
      <div class="service-card" style="border-color: rgba(255,255,255,0.08); background: rgba(255,255,255,0.02);">
        <div class="service-hdr">
          <span class="service-tag font-mono" style="background: rgba(245,158,11,0.2); color: #F59E0B;">ABORDO</span>
          <span class="font-mono" style="font-size: 11px; color: #F59E0B; font-weight: 700;">#TX-104</span>
        </div>
        <div class="service-addr">Hospital General ➔ Centro</div>
        <div class="service-meta">
          <span>Chofer: Roberto G.</span>
          <span class="font-mono" style="color: #FFF;">$40 MXN</span>
        </div>
      </div>
    </div>
  </div>
  <div class="map-container">
    <div class="grid-bg"></div>
    <div class="radar-ring ring-1"></div>
    <div class="radar-ring ring-2"></div>
    <div class="radar-ring ring-3"></div>
    <svg class="roads">
      <path d="M 0 320 Q 300 310 600 400 T 1100 480" stroke="#4F5DFF" stroke-width="3" fill="none"/>
      <path d="M 450 0 L 520 900" stroke="#4F5DFF" stroke-width="2.5" fill="none"/>
      <path d="M 800 0 L 720 900" stroke="#4F5DFF" stroke-width="2" fill="none"/>
      <path d="M 100 700 L 980 150" stroke="#4F5DFF" stroke-width="1.5" fill="none"/>
    </svg>
    <!-- Taxi Markers -->
    <div class="taxi-marker taxi-dispatched font-mono" style="left: 48%; top: 42%;">
      <span>●</span> #TX-101 (Asignado)
    </div>
    <div class="taxi-marker taxi-free font-mono" style="left: 32%; top: 28%;">
      <span>●</span> #TX-108 · 31 km/h
    </div>
    <div class="taxi-marker taxi-busy font-mono" style="left: 68%; top: 35%;">
      <span>●</span> #TX-104 · En viaje
    </div>
    <div class="taxi-marker taxi-free font-mono" style="left: 75%; top: 62%;">
      <span>●</span> #TX-112 · Libre
    </div>
    <div class="taxi-marker taxi-free font-mono" style="left: 24%; top: 68%;">
      <span>●</span> #TX-125 · Libre
    </div>
    <!-- POI Pins -->
    <div style="position: absolute; left: 45%; top: 38%; font-size: 11px; font-weight: 700; color: #FFF; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);">
      📍 Terminal ADO
    </div>
    <div style="position: absolute; left: 70%; top: 30%; font-size: 11px; font-weight: 700; color: #FFF; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);">
      📍 Hospital General
    </div>
    <!-- Toast -->
    <div class="toast">
      <div class="toast-icon">⚡</div>
      <div>
        <div class="toast-title">Despacho Completado en 1.2s</div>
        <div class="toast-sub">WhatsApp enviado automáticamente: "Taxi #TX-101 en camino (ETA: 2 min)"</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>
"""

# 2. HTML TEMPLATE: APP OPERADOR ANDROID (390x844)
HTML_OPERADOR = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>App Operador TaxiHUB</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #000; color: #F5F5F7; font-family: 'Plus Jakarta Sans', sans-serif;
    width: 390px; height: 844px; overflow: hidden; display: flex; flex-direction: column;
  }
  .font-mono { font-family: 'Fira Code', monospace; }
  /* Status Bar */
  .status-bar {
    height: 44px; padding: 0 20px; display: flex; justify-content: space-between;
    align-items: center; font-size: 12px; font-weight: 600; background: #0B0D10;
  }
  /* Foreground Service Header */
  .fg-header {
    background: #10B981; color: #04130D; padding: 8px 16px; display: flex;
    justify-content: space-between; align-items: center; font-size: 11px; font-weight: 800;
  }
  /* App Nav */
  .app-bar {
    height: 56px; background: #0B0D10; border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between; padding: 0 16px;
  }
  .unit-pill {
    background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3);
    color: #10B981; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;
  }
  /* Content */
  .content { flex: 1; display: flex; flex-direction: column; background: #07090D; position: relative; }
  .map-area {
    height: 380px; position: relative; background: #080A0F;
    background-image: linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 28px 28px;
  }
  .audio-banner {
    background: rgba(79,93,255,0.15); border-bottom: 1px solid rgba(79,93,255,0.3);
    padding: 10px 16px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #8A94FF; font-weight: 600;
  }
  /* Action Sheet */
  .action-sheet {
    flex: 1; background: #0B0D10; border-top: 1px solid rgba(255,255,255,0.1);
    border-radius: 24px 24px 0 0; padding: 20px 18px; display: flex; flex-direction: column; justify-content: space-between;
    margin-top: -16px; z-index: 10;
  }
  .trip-title { font-size: 16px; font-weight: 800; color: #FFF; }
  .trip-loc { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; color: #9CA0AA; }
  .trip-price {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-top: 12px;
  }
  .btn-accept {
    background: #10B981; color: #04130D; font-weight: 800; font-size: 15px;
    padding: 14px; border-radius: 14px; text-align: center; box-shadow: 0 4px 20px rgba(16,185,129,0.4);
  }
  /* Bottom bar */
  .bottom-nav {
    height: 56px; background: #050505; border-top: 1px solid rgba(255,255,255,0.08);
    display: flex; justify-content: space-around; align-items: center; font-size: 10px; color: #9CA0AA;
  }
  .active-tab { color: #10B981; font-weight: 700; }
</style>
</head>
<body>
<div class="status-bar">
  <span>09:41</span>
  <span class="font-mono">LTE 5G &bull; 88%</span>
</div>
<div class="fg-header font-mono">
  <span>⚡ GPS 24/7 EN SEGUNDO PLANO ACTIVO</span>
  <span>PANTALLA APAGADA OK</span>
</div>
<div class="app-bar">
  <div style="font-weight: 800; font-size: 14px;">taxi<span style="color: #10B981;">HUB</span> Chofer</div>
  <div class="unit-pill font-mono">#TX-101 · EN TURNO</div>
</div>
<div class="content">
  <div class="audio-banner">
    <span>🔊</span>
    <span>Voz IA: "Viaje asignado. Recoge en Terminal ADO hacia La Cañada."</span>
  </div>
  <div class="map-area">
    <div style="position: absolute; left: 45%; top: 40%; transform: translate(-50%, -50%);">
      <div style="width: 22px; height: 22px; border-radius: 50%; background: #10B981; border: 3px solid #FFF; box-shadow: 0 0 16px #10B981;"></div>
    </div>
    <div style="position: absolute; left: 62%; top: 22%; background: #0B0D10; border: 1px solid #10B981; padding: 4px 8px; border-radius: 8px; font-size: 10px; font-weight: 700; color: #FFF;">
      📍 Terminal ADO (2 min)
    </div>
  </div>
  <div class="action-sheet">
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="font-mono" style="font-size: 10px; color: #10B981; font-weight: 700; background: rgba(16,185,129,0.15); padding: 2px 6px; border-radius: 4px;">DESPACHO ENTRADA</span>
        <span class="font-mono" style="font-size: 12px; color: #9CA0AA;">Distancia: 1.2 km</span>
      </div>
      <div class="trip-title" style="margin-top: 6px;">Terminal ADO ➔ Col. La Cañada</div>
      <div class="trip-loc">
        <span>👤 Pasajero WhatsApp &bull; Tarifa Oficial</span>
      </div>
      <div class="trip-price">
        <div>
          <div style="font-size: 10px; color: #9CA0AA; text-transform: uppercase;">Total a cobrar</div>
          <div class="font-mono" style="font-size: 20px; font-weight: 800; color: #10B981;">$45 MXN</div>
        </div>
        <div class="font-mono" style="font-size: 11px; color: #FFF; background: rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 6px;">
          Efectivo
        </div>
      </div>
    </div>
    <div class="btn-accept">
      Aceptar y Navegar
    </div>
  </div>
</div>
<div class="bottom-nav">
  <div class="active-tab">🗺️ Mapa</div>
  <div>📋 Servicios</div>
  <div>📷 Fotos Turno</div>
  <div>💰 Ganancias</div>
</div>
</body>
</html>
"""

# 3. HTML TEMPLATE: PANEL SOCIO FLOTILLERO (1440x900)
HTML_SOCIO = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Panel de Socios y Concesionarios</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #050505; color: #F5F5F7; font-family: 'Plus Jakarta Sans', sans-serif;
    width: 1440px; height: 900px; overflow: hidden; display: flex; flex-direction: column;
  }
  .font-mono { font-family: 'Fira Code', monospace; }
  header {
    height: 60px; background: #0B0D10; border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between; padding: 0 28px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-logo {
    width: 34px; height: 34px; border-radius: 8px; background: #F59E0B;
    display: flex; align-items: center; justify-content: center; color: #04130D; font-weight: 900;
  }
  .brand-text { font-size: 16px; font-weight: 800; }
  .brand-text span { color: #F59E0B; }
  .user-badge {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    padding: 6px 12px; border-radius: 999px; font-size: 12px; color: #9CA0AA;
  }
  .content { flex: 1; padding: 28px; background: #07090D; display: flex; flex-direction: column; gap: 24px; }
  /* Metric cards */
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  .m-card {
    background: #0B0D10; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
    padding: 18px; display: flex; flex-direction: column; justify-content: space-between;
  }
  .m-title { font-size: 11px; font-weight: 700; color: #9CA0AA; text-transform: uppercase; letter-spacing: 0.08em; }
  .m-val { font-size: 26px; font-weight: 800; color: #FFF; margin-top: 8px; }
  .m-sub { font-size: 11px; color: #10B981; margin-top: 4px; font-weight: 600; }
  /* Fleet Table */
  .table-card {
    flex: 1; background: #0B0D10; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
    padding: 20px; display: flex; flex-direction: column;
  }
  .table-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
  th { padding: 10px 14px; font-size: 11px; font-weight: 700; color: #9CA0AA; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.08); }
  td { padding: 14px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #FFF; }
  .status-paid {
    background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.3);
    padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; display: inline-block;
  }
  .status-pending {
    background: rgba(245,158,11,0.15); color: #F59E0B; border: 1px solid rgba(245,158,11,0.3);
    padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; display: inline-block;
  }
  .btn-photo {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
    padding: 4px 8px; border-radius: 6px; font-size: 11px; color: #9CA0AA; cursor: pointer;
  }
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="brand-logo">🛡️</div>
    <div class="brand-text">taxi<span>HUB</span> Flotas</div>
    <span class="font-mono" style="font-size: 11px; color: #9CA0AA; margin-left: 8px;">PORTAL DE SOCIOS & CONCESIONARIOS</span>
  </div>
  <div class="user-badge font-mono">
    Socio: <strong>Roberto Méndez</strong> &bull; 6 Unidades Asignadas
  </div>
</header>
<div class="content">
  <div class="metrics-grid">
    <div class="m-card">
      <div class="m-title">Cuotas Cobradas Hoy</div>
      <div class="m-val font-mono" style="color: #10B981;">$1,800 MXN</div>
      <div class="m-sub font-mono">6 de 6 Unidades al Corriente</div>
    </div>
    <div class="m-card">
      <div class="m-title">Unidades en Turno Activo</div>
      <div class="m-val font-mono">5 / 6</div>
      <div class="m-sub font-mono" style="color: #9CA0AA;">1 en Taller Preventivo</div>
    </div>
    <div class="m-card">
      <div class="m-title">Kilometraje Diario Flota</div>
      <div class="m-val font-mono">842 km</div>
      <div class="m-sub font-mono">Promedio: 168 km / unidad</div>
    </div>
    <div class="m-card">
      <div class="m-title">Auditoría de Tableros</div>
      <div class="m-val font-mono" style="color: #F59E0B;">100%</div>
      <div class="m-sub font-mono">Fotos de inicio y fin verificadas</div>
    </div>
  </div>
  <div class="table-card">
    <div class="table-hdr">
      <div style="font-size: 15px; font-weight: 800; color: #FFF;">Estado de Unidades y Liquidación Diaria</div>
      <div class="font-mono" style="font-size: 11px; color: #9CA0AA;">Tarifa Cuota: $300 MXN / turno</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Unidad</th>
          <th>Vehículo / Placas</th>
          <th>Operador en Turno</th>
          <th>Cuota Diaria</th>
          <th>Foto Odómetro</th>
          <th>Estado Liquidación</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="font-mono" style="font-weight: 700; color: #10B981;">#TX-101</td>
          <td>Nissan Versa 2023 &bull; DSK-492-B</td>
          <td>Carlos Méndez P.</td>
          <td class="font-mono" style="font-weight: 700;">$300 MXN</td>
          <td><button class="btn-photo">📷 Ver Foto (124,530 km)</button></td>
          <td><span class="status-paid font-mono">PAGADA EN EFECTIVO</span></td>
        </tr>
        <tr>
          <td class="font-mono" style="font-weight: 700; color: #10B981;">#TX-104</td>
          <td>Chevrolet Aveo 2022 &bull; DSJ-110-A</td>
          <td>Roberto Guzmán</td>
          <td class="font-mono" style="font-weight: 700;">$300 MXN</td>
          <td><button class="btn-photo">📷 Ver Foto (98,210 km)</button></td>
          <td><span class="status-paid font-mono">PAGADA EN EFECTIVO</span></td>
        </tr>
        <tr>
          <td class="font-mono" style="font-weight: 700; color: #10B981;">#TX-108</td>
          <td>Nissan V-Drive 2024 &bull; DSL-880-C</td>
          <td>Miguel Ángel R.</td>
          <td class="font-mono" style="font-weight: 700;">$300 MXN</td>
          <td><button class="btn-photo">📷 Ver Foto (45,120 km)</button></td>
          <td><span class="status-paid font-mono">PAGADA EN EFECTIVO</span></td>
        </tr>
        <tr>
          <td class="font-mono" style="font-weight: 700; color: #10B981;">#TX-112</td>
          <td>Nissan Versa 2021 &bull; DSH-304-D</td>
          <td>Jorge Luis Díaz</td>
          <td class="font-mono" style="font-weight: 700;">$300 MXN</td>
          <td><button class="btn-photo">📷 Ver Foto (140,890 km)</button></td>
          <td><span class="status-paid font-mono">PAGADA EN EFECTIVO</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>
"""

# 4. HTML TEMPLATE: VIDEO POSTER (1280x720)
HTML_POSTER = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Poster Demo TaxiHUB</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #050505; color: #F5F5F7; font-family: 'Plus Jakarta Sans', sans-serif;
    width: 1280px; height: 720px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative;
  }
  .glow-1 { position: absolute; left: 15%; top: 20%; width: 500px; height: 500px; background: rgba(16,185,129,0.12); border-radius: 50%; filter: blur(120px); }
  .glow-2 { position: absolute; right: 15%; bottom: 20%; width: 400px; height: 400px; background: rgba(79,93,255,0.12); border-radius: 50%; filter: blur(120px); }
  .card {
    position: relative; z-index: 10; text-align: center; max-width: 800px;
    background: rgba(11,13,16,0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px;
    padding: 60px 48px; backdrop-filter: blur(20px); box-shadow: 0 30px 80px rgba(0,0,0,0.8);
  }
  .tag {
    display: inline-flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.12);
    border: 1px solid rgba(16,185,129,0.3); color: #10B981; padding: 6px 14px; border-radius: 999px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  }
  h1 { font-size: 44px; font-weight: 800; letter-spacing: -0.03em; color: #FFF; margin-top: 18px; line-height: 1.1; }
  h1 span { color: #10B981; }
  p { font-size: 16px; color: #9CA0AA; margin-top: 14px; line-height: 1.5; }
  .play-btn {
    width: 72px; height: 72px; border-radius: 50%; background: #10B981; color: #04130D;
    display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 32px auto 0;
    box-shadow: 0 10px 30px rgba(16,185,129,0.4);
  }
</style>
</head>
<body>
<div class="glow-1"></div>
<div class="glow-2"></div>
<div class="card">
  <div class="tag font-mono">
    <span>●</span> DEMOSTRACIÓN OPERATIVA EN VIVO
  </div>
  <h1>Despacho, GPS y Control Flotillero con <span>taxiHUB</span></h1>
  <p>Recorrido por la terminal de despacho en 1 clic, app móvil con GPS de pantalla apagada y liquidación de cuotas diarias.</p>
  <div class="play-btn">▶</div>
</div>
</body>
</html>
"""

def render_screenshots():
    print("[1/3] Renderizando screenshots con Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        tasks = [
            ("terminal", HTML_TERMINAL, 1440, 900),
            ("operador", HTML_OPERADOR, 390, 844),
            ("socio", HTML_SOCIO, 1440, 900),
            ("video-poster", HTML_POSTER, 1280, 720),
        ]

        for name, html_content, w, h in tasks:
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            page.set_content(html_content, wait_until="networkidle")
            png_path = OUTPUT_DIR / f"{name}.png"
            page.screenshot(path=str(png_path), full_page=True)
            print(f"  [OK] {name}.png ({w}x{h})")

            # Convert to WebP using Pillow
            webp_path = OUTPUT_DIR / f"{name}.webp"
            img = Image.open(png_path)
            img.save(webp_path, format="WEBP", quality=92, method=6)
            print(f"  [OK] {name}.webp")

        browser.close()

def generate_video():
    print("[2/3] Generando video demo con FFmpeg...")
    terminal_png = OUTPUT_DIR / "terminal.png"
    operador_png = OUTPUT_DIR / "operador.png"
    socio_png = OUTPUT_DIR / "socio.png"
    mp4_out = OUTPUT_DIR / "taxihub-demo.mp4"
    webm_out = OUTPUT_DIR / "taxihub-demo.webm"

    # We will build a smooth 24s sequence (3 scenes of 8s each):
    # Scene 1: Terminal (0-8s)
    # Scene 2: Operador (8-16s)
    # Scene 3: Socio (16-24s)

    filter_complex = (
        "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,settb=AVTB,setpts=PTS-STARTPTS,trim=duration=8[v0];"
        "[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,settb=AVTB,setpts=PTS-STARTPTS,trim=duration=8[v1];"
        "[2:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,settb=AVTB,setpts=PTS-STARTPTS,trim=duration=8[v2];"
        "[v0][v1][v2]concat=n=3:v=1:a=0[vout]"
    )

    cmd_mp4 = [
        "ffmpeg", "-y",
        "-loop", "1", "-t", "8", "-i", str(terminal_png),
        "-loop", "1", "-t", "8", "-i", str(operador_png),
        "-loop", "1", "-t", "8", "-i", str(socio_png),
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(mp4_out)
    ]
    print("  Ejecutando ffmpeg para MP4...")
    res = subprocess.run(cmd_mp4, capture_output=True, text=True)
    if res.returncode != 0:
        print("  Error en MP4:", res.stderr)
    else:
        print(f"  [OK] {mp4_out.name} generado ({mp4_out.stat().st_size / 1024:.1f} KB)")

    cmd_webm = [
        "ffmpeg", "-y",
        "-loop", "1", "-t", "8", "-i", str(terminal_png),
        "-loop", "1", "-t", "8", "-i", str(operador_png),
        "-loop", "1", "-t", "8", "-i", str(socio_png),
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-c:v", "libvpx-vp9", "-b:v", "1M", "-crf", "30",
        str(webm_out)
    ]
    print("  Ejecutando ffmpeg para WebM...")
    res_webm = subprocess.run(cmd_webm, capture_output=True, text=True)
    if res_webm.returncode != 0:
        print("  Error en WebM:", res_webm.stderr)
    else:
        print(f"  [OK] {webm_out.name} generado ({webm_out.stat().st_size / 1024:.1f} KB)")

if __name__ == "__main__":
    render_screenshots()
    generate_video()
    print("[3/3] Todos los activos multimedia fueron generados con exito!")
