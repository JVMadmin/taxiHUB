import L from "leaflet";
import { ESTADO_COLORS } from "@/lib/api";

// Icono de taxi del dispatcher (Fase 9D). Píldora con unidad + sombra real,
// con variante "seleccionado" (anillo claro) y "siguiendo" (anillo de marca).
export function taxiIcon(color, label, { selected = false } = {}) {
  const c = color || "#6b7280";
  const texto = label ? String(label) : "";
  const ring = selected ? "box-shadow:0 0 0 3px #fff,0 0 0 7px rgba(255,255,255,.28)" : "";
  const html = `
    <div style="position:relative;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 6px 10px rgba(0,0,0,.65))">
      <div style="display:flex;align-items:center;gap:5px;background:${c};color:#0b0b0d;
        border:2px solid #0b0b0d;border-radius:10px;padding:3px 9px 3px 6px;font-weight:800;
        font-size:12px;line-height:1;white-space:nowrap;font-family:ui-monospace,Menlo,monospace;${ring}">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="#0b0b0d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 2h4"/><path d="m19 8-1.5-3a2 2 0 0 0-1.8-1H8.3a2 2 0 0 0-1.8 1L5 8"/>
          <path d="M5 8h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2Z"/>
        </svg>${texto}
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:8px solid ${c};margin-top:-1px"></div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [1, 1], iconAnchor: [0, 0] });
}

// Marcador de punto (origen/destino/yo) del mapa de navegación del conductor.
export function pointIcon(label, color, { size = "md" } = {}) {
  const c = color || "#22c55e";
  const dim = size === "lg" ? "44px" : "34px";
  const fontSize = size === "lg" ? "12px" : "10px";
  const html = `
    <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 8px rgba(0,0,0,.55))">
      <div style="display:flex;align-items:center;justify-content:center;min-width:${dim};height:${dim};
        background:${c};color:#0b0b0d;border:2.5px solid #0b0b0d;border-radius:12px;font-weight:900;
        font-size:${fontSize};line-height:1;white-space:nowrap;padding:0 8px;font-family:ui-monospace,Menlo,monospace">${label}</div>
      <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;
        border-top:12px solid ${c};margin-top:-1px"></div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [1, 1], iconAnchor: [0, 0] });
}

// Flecha de "tú / vehículo" orientada por rumbo (heading) en la Driver App.
export function driverIcon(color, heading = 0) {
  const c = color || "#10b981";
  const deg = Number(heading) || 0;
  const html = `
    <div style="transform:translate(-50%,-50%) rotate(${deg}deg);filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))">
      <div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;
        background:${c};border:3px solid #0b0b0d;border-radius:50%">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="#0b0b0d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180)">
          <path d="M10 2h4"/><path d="m19 8-1.5-3a2 2 0 0 0-1.8-1H8.3a2 2 0 0 0-1.8 1L5 8"/>
          <path d="M5 8h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2Z"/>
        </svg>
      </div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [1, 1], iconAnchor: [0, 0] });
}

// Carrocería isométrica/3D (vista 3/4 desde arriba, "cochesito 3D"). Master
// para los tres mapas: pasajero, conductor y despachador. Rotado por rumbo.
function carBodySvg(color) {
  const c = color || "#10b981";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
      <defs>
        <linearGradient id="th-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${c}"/>
          <stop offset="1" stop-color="${c}" stop-opacity="0.82"/>
        </linearGradient>
        <linearGradient id="th-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#dff3ff"/>
          <stop offset="1" stop-color="#7fb8d9"/>
        </linearGradient>
      </defs>
      <!-- sombra en el suelo -->
      <ellipse cx="32" cy="48" rx="17" ry="4.8" fill="rgba(0,0,0,0.4)"/>
      <!-- ruedas -->
      <rect x="11" y="36" width="9" height="11" rx="3" fill="#08080b"/>
      <rect x="44" y="36" width="9" height="11" rx="3" fill="#08080b"/>
      <rect x="11" y="18" width="9" height="11" rx="3" fill="#08080b"/>
      <rect x="44" y="18" width="9" height="11" rx="3" fill="#08080b"/>
      <!-- carrocería -->
      <path d="M8 33 Q14 12 24 10 h16 Q50 12 56 33 Q56 45 32 46 Q8 45 8 33 Z" fill="url(#th-body)" stroke="#0b0b0d" stroke-width="1.6"/>
      <!-- cabina / techo -->
      <path d="M20 26 Q25 18 32 18 Q39 18 44 26 Q44 34 40 36 Q32 38 24 36 Q20 34 20 26 Z" fill="#14151c" stroke="#0b0b0d" stroke-width="1.4"/>
      <!-- parabrisas delantero (hacia arriba) -->
      <path d="M21.5 27.5 Q25 22.5 32 22.5 Q39 22.5 42.5 27.5 L40 32 Q32 34.4 24 32 Z" fill="url(#th-glass)"/>
      <!-- faros delanteros -->
      <ellipse cx="21" cy="14.5" rx="3.4" ry="2.2" fill="#fde68a"/>
      <ellipse cx="43" cy="14.5" rx="3.4" ry="2.2" fill="#fde68a"/>
      <!-- calaveras -->
      <rect x="12" y="39" width="6" height="2.6" rx="1.3" fill="#f87171"/>
      <rect x="46" y="39" width="6" height="2.6" rx="1.3" fill="#f87171"/>
      <!-- brillo del capó -->
      <path d="M18 18 Q32 12 46 18" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;
}

// Coche 3D (iso/3/4) usado en los tres mapas. `heading` orienta el coche.
export function car3dIcon(color, { heading = 0, label = "", selected = false, following = false, size = "md", testId = "" } = {}) {
  const deg = Number(heading) || 0;
  const dim = size === "lg" ? 56 : size === "xs" ? 34 : 46;
  const ring = selected
    ? "box-shadow:0 0 0 3px #fff,0 0 0 7px rgba(255,255,255,.25)"
    : following
      ? "box-shadow:0 0 0 3px var(--brand, #10b981),0 0 0 6px rgba(16,185,129,.25)"
      : "";
  const labelHtml = label
    ? `<div style="margin-top:2px;background:#0b0b0d;color:#fff;border:1.5px solid rgba(255,255,255,.22);border-radius:6px;padding:2px 7px;font-size:11px;font-weight:800;line-height:1;white-space:nowrap;font-family:ui-monospace,Menlo,monospace">${label}</div>`
    : "";
  const html = `
    <div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;user-select:none"${testId ? ` data-testid="${testId}"` : ""}>
      <div style="position:relative;width:${dim}px;height:${dim}px;transform:rotate(${deg}deg);filter:drop-shadow(0 8px 12px rgba(0,0,0,.6));${ring}border-radius:9999px">
        ${carBodySvg(color)}
      </div>
      ${labelHtml}
    </div>`;
  return L.divIcon({ html, className: "th-car3d", iconSize: [1, 1], iconAnchor: [0, 0] });
}

// Marcador "placa" — dirección visual aprobada (ver memory/DIRECCION_VISUAL.md):
// insignia redondeada con color de estado, indicador de rumbo (triángulo) y
// anillo de selección pulsante. Usado en Pasajero y Operador; Terminal sigue
// con car3dIcon por ahora (fuera de alcance de esta pasada).
const PILL_DIM = { sm: 30, md: 38, lg: 46 };
const PILL_RADIUS = { sm: 9, md: 11, lg: 14 };

export function pillCarIcon(estado, { heading = 0, selected = false, label = "", size = "md", testId = "", color: colorOverride } = {}) {
  // `colorOverride` cubre el caso "este es tu taxi en vivo" (app del pasajero),
  // donde no hay un estado de flota relevante que mostrar — solo la marca.
  const color = colorOverride || ESTADO_COLORS[estado] || ESTADO_COLORS.fuera_de_servicio;
  const deg = Number(heading) || 0;
  const dim = PILL_DIM[size] || PILL_DIM.md;
  const radius = PILL_RADIUS[size] || PILL_RADIUS.md;
  const glyph = Math.round(dim * 0.5);
  const offline = estado === "fuera_de_servicio";
  const ringPulse = selected
    ? `<div class="th-marker-ring" style="position:absolute;inset:-9px;border-radius:${radius + 5}px;border:1.5px solid ${color}"></div>`
    : "";
  const ringStatic = selected ? `box-shadow:0 0 0 3px #0a0a0d,0 0 0 6px ${color}99;` : "";
  const labelHtml = label
    ? `<div style="margin-top:3px;background:#0a0a0d;color:#fff;border:1.5px solid rgba(255,255,255,.18);border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:800;line-height:1;white-space:nowrap;font-family:ui-monospace,Menlo,monospace">${label}</div>`
    : "";
  const headingTri = !offline
    ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);width:0;height:0;
        border-left:4.5px solid transparent;border-right:4.5px solid transparent;border-bottom:7px solid ${color}"></div>`
    : "";
  const html = `
    <div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;user-select:none"${testId ? ` data-testid="${testId}"` : ""}>
      <div style="position:relative;width:${dim}px;height:${dim}px;transform:rotate(${deg}deg);filter:drop-shadow(0 6px 10px rgba(0,0,0,.55));${offline ? "opacity:.55;" : ""}">
        ${ringPulse}
        <div style="width:100%;height:100%;border-radius:${radius}px;background:${color};
          display:flex;align-items:center;justify-content:center;${ringStatic}">
          <svg xmlns="http://www.w3.org/2000/svg" width="${glyph}" height="${glyph}" viewBox="0 0 24 24" fill="none"
            stroke="#0a0a0d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M5 17l1.2-5.5A2 2 0 0 1 8.15 10h7.7a2 2 0 0 1 1.95 1.5L19 17"/>
          </svg>
        </div>
        ${headingTri}
      </div>
      ${labelHtml}
    </div>`;
  return L.divIcon({ html, className: "th-pill-car", iconSize: [1, 1], iconAnchor: [0, 0] });
}

// (helper) marcador pequeño de dirección en la ruta (flecha que pulsa).
export function routeArrowIcon() {
  const html = `
    <div class="th-route-arrow" style="transform:translate(-50%,-50%)">
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none"
        stroke="#0b0b0d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v20M6 9l6-7 6 7" transform="translate(0 1)"/>
      </svg>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [1, 1], iconAnchor: [0, 0] });
}

export function colorForOperador(op, filtroRutaColor) {
  if (filtroRutaColor) return filtroRutaColor;
  return ESTADO_COLORS[op.estado] || ESTADO_COLORS.fuera_de_servicio;
}