import React, { memo } from "react";
import { Polygon, Tooltip } from "react-leaflet";

/**
 * Colonias y Zonas representativas de Palenque, Chiapas.
 * Delimitadas con polígonos vectoriales y colores distintivos del Design System.
 */
export const PALENQUE_COLONIAS = [
  {
    id: "centro",
    nombre: "Colonia Centro",
    subtitulo: "Zona Comercial y Catedral",
    color: "#f59e0b", // Ámbar cálido
    puntos: [
      [17.5132, -91.9845],
      [17.5132, -91.9785],
      [17.5098, -91.9775],
      [17.5065, -91.9805],
      [17.5068, -91.9848],
      [17.5095, -91.9852],
    ],
  },
  {
    id: "canada",
    nombre: "La Cañada",
    subtitulo: "Distrito Turístico y Hotelero",
    color: "#06b6d4", // Cian brillante
    puntos: [
      [17.5135, -91.9848],
      [17.5175, -91.9862],
      [17.5195, -91.9820],
      [17.5170, -91.9780],
      [17.5135, -91.9785],
    ],
  },
  {
    id: "pakal_na",
    nombre: "Pakal-Ná",
    subtitulo: "Estación Tren Maya y Norte",
    color: "#6366f1", // Índigo / Violeta
    puntos: [
      [17.5240, -91.9740],
      [17.5350, -91.9680],
      [17.5450, -91.9540],
      [17.5380, -91.9480],
      [17.5250, -91.9580],
      [17.5210, -91.9670],
    ],
  },
  {
    id: "periferico_sur",
    nombre: "Barrio San Miguel / Periférico",
    subtitulo: "Zona Sur Residencial y Salud",
    color: "#f43f5e", // Rosa carmesí
    puntos: [
      [17.5065, -91.9848],
      [17.5065, -91.9805],
      [17.5040, -91.9720],
      [17.4980, -91.9750],
      [17.4990, -91.9830],
      [17.5035, -91.9860],
    ],
  },
  {
    id: "chacamax",
    nombre: "San Juan / Chacamax",
    subtitulo: "Zona Oriente y Ribera",
    color: "#3b82f6", // Azul real
    puntos: [
      [17.5132, -91.9785],
      [17.5170, -91.9780],
      [17.5160, -91.9680],
      [17.5090, -91.9660],
      [17.5040, -91.9720],
      [17.5098, -91.9775],
    ],
  },
  {
    id: "las_joyas",
    nombre: "Las Joyas / Los Ángeles",
    subtitulo: "Zona Poniente",
    color: "#a855f7", // Púrpura eléctrico
    puntos: [
      [17.5175, -91.9862],
      [17.5230, -91.9930],
      [17.5190, -91.9980],
      [17.5130, -91.9930],
      [17.5135, -91.9848],
    ],
  },
  {
    id: "ruinas",
    nombre: "Corredor Arqueológico",
    subtitulo: "Parque Nacional Palenque",
    color: "#10b981", // Esmeralda selva
    puntos: [
      [17.4990, -91.9830],
      [17.4950, -91.9980],
      [17.4820, -92.0120],
      [17.4720, -92.0000],
      [17.4850, -91.9850],
      [17.4980, -91.9750],
    ],
  },
];

function ColoniasLayerComponent() {
  return (
    <>
      {PALENQUE_COLONIAS.map((c) => (
        <Polygon
          key={c.id}
          positions={c.puntos}
          pathOptions={{
            color: c.color,
            fillColor: c.color,
            fillOpacity: 0.16,
            weight: 2,
            dashArray: "4 5",
            lineCap: "round",
          }}
          eventHandlers={{
            mouseover: (e) => {
              const layer = e.target;
              layer.setStyle({
                fillOpacity: 0.35,
                weight: 3,
                dashArray: null,
              });
            },
            mouseout: (e) => {
              const layer = e.target;
              layer.setStyle({
                fillOpacity: 0.16,
                weight: 2,
                dashArray: "4 5",
              });
            },
          }}
        >
          <Tooltip sticky direction="center" className="th-colonia-tooltip">
            <div className="flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-xs font-bold text-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full shadow-[0_0_8px]"
                style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
              />
              <div className="flex flex-col">
                <span className="leading-tight text-white">{c.nombre}</span>
                <span className="text-[10px] font-normal text-muted-foreground">{c.subtitulo}</span>
              </div>
            </div>
          </Tooltip>
        </Polygon>
      ))}
    </>
  );
}

export const ColoniasLayer = memo(ColoniasLayerComponent);
export default ColoniasLayer;
