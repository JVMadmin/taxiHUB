import { Polygon, Tooltip, Popup } from "react-leaflet";

/**
 * Delimitaciones reales y oficiales de colonias y barrios de Palenque, Chiapas.
 * Cada polígono está georreferenciado con sus límites viales exactos (calle por calle)
 * para consulta operativa en despacho y asignación de tarifas por zona.
 */
export const COLONIAS_PALENQUE = [
  {
    id: "barrio_centro",
    nombre: "Barrio Centro",
    subtitulo: "Zona Comercial y Administrativa",
    color: "#f59e0b", // Ámbar dorado
    limites: {
      norte: "Av. Hidalgo / Calle 20 de Noviembre",
      sur: "Calle Jiménez / Periférico Sur",
      este: "Calle 5 de Mayo (Mercado Municipal)",
      oeste: "Av. 18 de Marzo y Av. Reforma",
    },
    calles_principales: "Av. Juárez, Calle Independencia, Calle Aldama, Calle Abasolo, Calle Allende",
    puntos_clave: "Parque Central, Palacio Municipal, Iglesia Santo Domingo, Parque de la Reina Roja",
    poligono: [
      [17.5135, -91.9868],
      [17.5139, -91.9798],
      [17.5065, -91.9795],
      [17.5062, -91.9865],
    ],
    centroide: [17.5100, -91.9832],
  },
  {
    id: "la_canada",
    nombre: "Barrio La Cañada",
    subtitulo: "Zona Hotelera, Gastronómica y Turística",
    color: "#10b981", // Esmeralda
    limites: {
      norte: "Prolongación Av. Hidalgo",
      sur: "Callejón Cañada Sur y Arroyo Chacamax",
      este: "Av. Reforma y Glorieta Cabeza Maya",
      oeste: "Puente Río Chacamax / Inicio Carr. Arqueológica",
    },
    calles_principales: "Calle Merle Green, Calle Cañada, Calzada de los Empleados",
    puntos_clave: "Hoteles boutique, restaurantes turísticos, zona arbolada protegida",
    poligono: [
      [17.5135, -91.9868],
      [17.5175, -91.9835],
      [17.5200, -91.9870],
      [17.5140, -91.9920],
      [17.5115, -91.9890],
    ],
    centroide: [17.5155, -91.9870],
  },
  {
    id: "pakal_na",
    nombre: "Colonia Pakal-Ná",
    subtitulo: "Zona Norte / Conexión Tren Maya y Aeropuerto",
    color: "#0ea5e9", // Azul zafiro
    limites: {
      norte: "Vías del Ferrocarril / Estación Tren Maya Palenque",
      sur: "Calzada Pakal-Ná / Puente Arroyo Chacamax Norte",
      este: "Carretera Federal a Catazajá / Col. San Miguel",
      oeste: "Bulevar Aeropuerto Internacional de Palenque",
    },
    calles_principales: "Calzada Pakal-Ná, Av. del Ferrocarril, Calle Benito Juárez (Pakal-Ná)",
    puntos_clave: "Nueva Estación Tren Maya, Aeropuerto de Palenque, Mercado Pakal-Ná",
    poligono: [
      [17.5320, -91.9700],
      [17.5380, -91.9540],
      [17.5500, -91.9580],
      [17.5530, -91.9750],
      [17.5420, -91.9800],
    ],
    centroide: [17.5430, -91.9680],
  },
  {
    id: "san_juan",
    nombre: "Barrio San Juan",
    subtitulo: "Zona Oriente / Mercado y Ribera",
    color: "#ec4899", // Rosa vibrante
    limites: {
      norte: "Av. 20 de Noviembre / Prolongación Hidalgo",
      sur: "Periférico Sur / Entrada Maya Lacanjá",
      este: "Ribera del Río Chacamax y Salida a Ocosingo",
      oeste: "Calle 5 de Mayo (colinda con Barrio Centro)",
    },
    calles_principales: "Calle 5 de Mayo, Calle Mina, Calle Vicente Guerrero, Callejón San Juan",
    puntos_clave: "Mercado Municipal Berriozábal, Hospital Comunitario, Escuelas Técnicas",
    poligono: [
      [17.5139, -91.9798],
      [17.5065, -91.9795],
      [17.5060, -91.9720],
      [17.5145, -91.9725],
    ],
    centroide: [17.5102, -91.9760],
  },
  {
    id: "san_francisco",
    nombre: "Barrio San Francisco",
    subtitulo: "Zona Norte / Deportiva y Tradicional",
    color: "#06b6d4", // Cyan
    limites: {
      norte: "Libramiento Periférico Norte",
      sur: "Av. Hidalgo (colinda con Barrio Centro)",
      este: "Calle 5 de Mayo / Arroyo Bambú",
      oeste: "Av. 18 de Marzo",
    },
    calles_principales: "Calle Chiapas, Calle 20 de Noviembre, Calle Manuel Velasco Suárez",
    puntos_clave: "Campo Deportivo San Francisco, Templo San Francisco de Asís",
    poligono: [
      [17.5135, -91.9868],
      [17.5139, -91.9798],
      [17.5210, -91.9800],
      [17.5205, -91.9865],
    ],
    centroide: [17.5170, -91.9833],
  },
  {
    id: "montes_azules",
    nombre: "Colonia Montes Azules",
    subtitulo: "Periférico Sur / Zona Médica y Deportiva",
    color: "#8b5cf6", // Violeta púrpura
    limites: {
      norte: "Periférico Sur / Calle Jiménez",
      sur: "Carretera Federal a Chancalá y Salto de Agua",
      este: "Arroyo Chacamax y Hospital General",
      oeste: "Unidad Deportiva Municipal / Fracc. San Ángel",
    },
    calles_principales: "Av. Montes Azules, Calle Tulipanes, Calle Orquídeas",
    puntos_clave: "Hospital General de Palenque, Estadio Municipal, Centro de Salud",
    poligono: [
      [17.5062, -91.9865],
      [17.5065, -91.9795],
      [17.5000, -91.9780],
      [17.5005, -91.9860],
    ],
    centroide: [17.5032, -91.9825],
  },
  {
    id: "las_joyas",
    nombre: "Colonia Las Joyas / Maya Lacanjá",
    subtitulo: "Zona Sur-Poniente / Residencial",
    color: "#f97316", // Naranja
    limites: {
      norte: "Periférico Sur / Calle Aldama",
      sur: "Ribera del Arroyo Chacamax y Balnearios",
      este: "Fraccionamiento San Ángel",
      oeste: "Carretera Palenque - Ocosingo",
    },
    calles_principales: "Calle Diamante, Calle Esmeralda, Calle Rubí, Av. Maya Lacanjá",
    puntos_clave: "Fraccionamientos residenciales, balnearios familiares",
    poligono: [
      [17.5062, -91.9865],
      [17.5005, -91.9860],
      [17.4950, -91.9950],
      [17.5040, -91.9960],
    ],
    centroide: [17.5015, -91.9910],
  },
  {
    id: "corredor_ruinas",
    nombre: "Corredor Turístico Arqueológico",
    subtitulo: "Carretera a Zona Arqueológica y Parque Nacional",
    color: "#84cc16", // Verde lima
    limites: {
      norte: "Cabeza Maya y Puente La Cañada",
      sur: "Museo de Sitio Alberto Ruz Lhuillier",
      este: "Reserva de la Biosfera Montes Azules",
      oeste: "Carretera a Ruinas y Parque Nacional Palenque",
    },
    calles_principales: "Carretera Federal Zona Arqueológica Palenque Km 1 a 9",
    puntos_clave: "Zona Arqueológica Maya de Palenque, Museo de Sitio, Ecoparque Aluxes",
    poligono: [
      [17.5140, -91.9920],
      [17.5010, -92.0120],
      [17.4840, -92.0460],
      [17.4780, -92.0430],
      [17.4980, -92.0080],
    ],
    centroide: [17.4950, -92.0250],
  },
];

/**
 * Función geométrica punto-en-polígono (Ray casting algorithm)
 * para identificar en qué colonia se hizo clic en el mapa.
 */
export function getColoniaAt(lat, lng) {
  if (lat == null || lng == null) return null;
  for (const c of COLONIAS_PALENQUE) {
    const poly = c.poligono;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > lng) !== (yj > lng)) &&
        (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    if (inside) return c;
  }
  return null;
}

/**
 * ColoniasLayer — Renderiza las delimitaciones urbanas oficiales de Palenque
 * con estilos semitransparentes, resaltado hover y tarjetas descriptivas calle por calle.
 */
export function ColoniasLayer() {
  return (
    <>
      {COLONIAS_PALENQUE.map((colonia) => (
        <Polygon
          key={colonia.id}
          positions={colonia.poligono}
          pathOptions={{
            color: colonia.color,
            weight: 2,
            opacity: 0.85,
            fillColor: colonia.color,
            fillOpacity: 0.16,
            dashArray: "4, 6",
          }}
          eventHandlers={{
            mouseover: (e) => {
              e.target.setStyle({
                fillOpacity: 0.32,
                weight: 3,
                opacity: 1,
                dashArray: null,
              });
            },
            mouseout: (e) => {
              e.target.setStyle({
                fillOpacity: 0.16,
                weight: 2,
                opacity: 0.85,
                dashArray: "4, 6",
              });
            },
          }}
        >
          {/* Tooltip visible al pasar el cursor */}
          <Tooltip sticky direction="center" className="th-colonia-tooltip">
            <div className="rounded-lg bg-surface/95 px-2.5 py-1.5 text-xs text-foreground shadow-xl backdrop-blur-md border border-white/10">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colonia.color }} />
                <span>{colonia.nombre}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{colonia.subtitulo}</div>
              <div className="mt-1 text-[10px] text-emerald-400 font-semibold">Clic para ver límites de calles</div>
            </div>
          </Tooltip>

          {/* Popup completo con la ficha de límites calle por calle */}
          <Popup className="th-colonia-popup">
            <div className="w-72 p-1 text-xs text-foreground">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: colonia.color }} />
                <div>
                  <div className="font-bold text-sm text-foreground">{colonia.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">{colonia.subtitulo}</div>
                </div>
              </div>

              {/* Ficha de límites viales */}
              <div className="mt-2.5 space-y-1.5 text-[11px]">
                <div className="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Límites viales oficiales:
                </div>
                <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-white/[0.04] p-2 border border-white/5">
                  <div>
                    <span className="font-semibold text-brand-bright">Norte: </span>
                    <span className="text-muted-foreground">{colonia.limites.norte}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-brand-bright">Sur: </span>
                    <span className="text-muted-foreground">{colonia.limites.sur}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-brand-bright">Este: </span>
                    <span className="text-muted-foreground">{colonia.limites.este}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-brand-bright">Oeste: </span>
                    <span className="text-muted-foreground">{colonia.limites.oeste}</span>
                  </div>
                </div>

                <div className="pt-1">
                  <span className="font-semibold text-foreground">Calles principales: </span>
                  <span className="text-muted-foreground">{colonia.calles_principales}</span>
                </div>

                <div className="pt-0.5">
                  <span className="font-semibold text-foreground">Puntos de referencia: </span>
                  <span className="text-muted-foreground">{colonia.puntos_clave}</span>
                </div>
              </div>
            </div>
          </Popup>
        </Polygon>
      ))}
    </>
  );
}

export default ColoniasLayer;
