import React, { useMemo } from "react";
import { Polyline, CircleMarker, Tooltip } from "react-leaflet";
import { timeAgo } from "@/lib/time";

/**
 * Interpola entre dos colores hexadecimales (ratio 0.0 - 1.0)
 */
function interpolateColor(color1, color2, factor) {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);

  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;

  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Obtiene el color de gradiente según la antigüedad relativa del punto (0.0 más antiguo -> 1.0 más reciente)
 */
function getTrackColor(factor, colorReciente = "#7CFC3C") {
  const COLOR_ANTIGUO = "#4F5DFF";  // Azul índigo (inicio de turno)
  const COLOR_MEDIO = "#FFB224";    // Ámbar (mitad del recorrido)

  if (factor < 0.5) {
    return interpolateColor(COLOR_ANTIGUO, COLOR_MEDIO, factor * 2);
  } else {
    return interpolateColor(COLOR_MEDIO, colorReciente, (factor - 0.5) * 2);
  }
}

/**
 * RecorridoGradiente — renderiza el rastro GPS proyectado sobre las calles
 * con un degradado temporal continuo (antiguo = azul -> reciente = verde/rojo).
 */
export function RecorridoGradiente({ track, estado = "libre" }) {
  const colorReciente = estado === "ocupado" ? "#F4544C" : "#7CFC3C";

  const segments = useMemo(() => {
    if (!track || track.length < 2) return [];
    const segs = [];
    const len = track.length;

    for (let i = 0; i < len - 1; i++) {
      const p1 = track[i];
      const p2 = track[i + 1];
      const factor = (i + 1) / len;
      const color = getTrackColor(factor, colorReciente);
      const opacity = 0.5 + factor * 0.45; // De 50% de opacidad al 95% al final

      segs.push({
        id: `seg-${i}`,
        positions: [
          [p1.lat, p1.lng],
          [p2.lat, p2.lng],
        ],
        color,
        opacity,
        ts: p2.ts,
      });
    }
    return segs;
  }, [track, colorReciente]);

  if (!track || track.length < 2) return null;

  const inicio = track[0];

  return (
    <>
      {/* Casing oscuro unificado para legibilidad de contraste */}
      <Polyline
        positions={track.map((p) => [p.lat, p.lng])}
        pathOptions={{
          color: "#050709",
          weight: 7,
          opacity: 0.4,
          lineCap: "round",
          lineJoin: "round",
        }}
      />

      {/* Segmentos con degradado temporal */}
      {segments.map((seg) => (
        <Polyline
          key={seg.id}
          positions={seg.positions}
          pathOptions={{
            color: seg.color,
            weight: 3.5,
            opacity: seg.opacity,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      ))}

      {/* Marcador de punto de origen del recorrido */}
      {inicio && (
        <CircleMarker
          center={[inicio.lat, inicio.lng]}
          radius={5}
          pathOptions={{
            color: "#4F5DFF",
            fillColor: "#0B0D10",
            fillOpacity: 1,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -5]}>
            <span className="text-[11px] font-semibold">
              Inicio del recorrido · {timeAgo(inicio.ts)}
            </span>
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
}

export default RecorridoGradiente;
