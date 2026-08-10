import L from "leaflet";
import { ESTADO_COLORS } from "@/lib/api";

export function taxiIcon(color) {
  const c = color || "#6b7280";
  const html = `
    <div style="position:relative;transform:translate(-50%,-50%)">
      <div style="width:30px;height:30px;border-radius:50%;background:${c};
        border:2px solid #0a0a0a;box-shadow:0 0 0 3px ${c}55, 0 4px 10px rgba(0,0,0,.6);
        display:flex;align-items:center;justify-content:center;color:#0a0a0a;font-weight:700;font-size:14px">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#0a0a0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 2h4"/><path d="m19 8-1.5-3a2 2 0 0 0-1.8-1H8.3a2 2 0 0 0-1.8 1L5 8"/>
          <path d="M5 8h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2Z"/>
        </svg>
      </div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [30, 30], iconAnchor: [0, 0] });
}

export function colorForOperador(op, filtroRutaColor) {
  if (filtroRutaColor) return filtroRutaColor;
  return ESTADO_COLORS[op.estado] || ESTADO_COLORS.fuera_de_servicio;
}
