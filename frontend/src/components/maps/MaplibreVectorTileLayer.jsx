import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";

const PUBLIC_VECTOR_FALLBACK = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Componente React-Leaflet que añade una capa base de tiles vectoriales (MapLibre GL)
 * utilizando @maplibre/maplibre-gl-leaflet.
 * Preserva intacta la instancia de Leaflet, marcadores, popups y polilíneas.
 */
export function MaplibreVectorTileLayer({ styleUrl, attribution }) {
  const map = useMap();
  const glLayerRef = useRef(null);
  const [activeStyle, setActiveStyle] = useState(() => styleUrl || PUBLIC_VECTOR_FALLBACK);

  useEffect(() => {
    setActiveStyle(styleUrl || PUBLIC_VECTOR_FALLBACK);
  }, [styleUrl]);

  useEffect(() => {
    if (!map || !activeStyle) return;

    let glLayer;
    try {
      glLayer = L.maplibreGL({
        style: activeStyle,
        attribution:
          attribution ||
          '&copy; <a href="https://maplibre.org/">MapLibre</a> &copy; <a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });

      glLayer.addTo(map);
      glLayerRef.current = glLayer;

      // Escuchar posibles fallos de carga del estilo y aplicar fallback seguro
      const gl = glLayer._glMap;
      if (gl && typeof gl.on === "function") {
        gl.on("error", (e) => {
          if (activeStyle !== PUBLIC_VECTOR_FALLBACK) {
            console.warn("Error cargando estilo vectorial de TileServer, recurriendo a OpenFreeMap:", e);
            setActiveStyle(PUBLIC_VECTOR_FALLBACK);
          }
        });
      }
    } catch (err) {
      console.warn("No se pudo inicializar MapLibre GL vector layer:", err);
      if (activeStyle !== PUBLIC_VECTOR_FALLBACK) {
        setActiveStyle(PUBLIC_VECTOR_FALLBACK);
      }
    }

    return () => {
      if (map && glLayerRef.current) {
        try {
          map.removeLayer(glLayerRef.current);
        } catch {
          // ignore
        }
        glLayerRef.current = null;
      }
    };
  }, [map, activeStyle, attribution]);

  return null;
}

export default MaplibreVectorTileLayer;
