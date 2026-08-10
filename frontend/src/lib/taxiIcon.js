import L from "leaflet";
import { ESTADO_COLORS } from "@/lib/api";

export function taxiIcon(color, label) {
  const c = color || "#6b7280";
  const texto = label ? String(label) : "";
  const html = `
    <div style="position:relative;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,.6))">
      <div style="display:flex;align-items:center;gap:5px;background:${c};color:#0a0a0a;
        border:2px solid #0a0a0a;border-radius:999px;padding:3px 9px 3px 6px;font-weight:800;
        font-size:12px;line-height:1;white-space:nowrap;font-family:ui-monospace,Menlo,monospace">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="#0a0a0a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 2h4"/><path d="m19 8-1.5-3a2 2 0 0 0-1.8-1H8.3a2 2 0 0 0-1.8 1L5 8"/>
          <path d="M5 8h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2Z"/>
        </svg>${texto}
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:8px solid ${c};margin-top:-1px"></div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [1, 1], iconAnchor: [0, 0] });
}

export function colorForOperador(op, filtroRutaColor) {
  if (filtroRutaColor) return filtroRutaColor;
  return ESTADO_COLORS[op.estado] || ESTADO_COLORS.fuera_de_servicio;
}
