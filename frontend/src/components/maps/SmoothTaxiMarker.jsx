import React, { useEffect, useRef, useMemo, memo } from "react";
import { Marker, Popup } from "react-leaflet";
import { taxiStateAssetIcon } from "@/lib/taxiIcon";
import { ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { resolveVehicleImage } from "@/lib/utils";

/**
 * SmoothTaxiMarker — Marcador con interpolación continua a 60 FPS.
 *
 * Elimina saltos bruscos ("teletransportación") interpolando posición (lat, lng)
 * y rumbo de giro en cada fotograma vía requestAnimationFrame, directo sobre
 * las coordenadas nativas de Leaflet (setLatLng) y la rotación del asset.
 *
 * Mantiene compatibilidad total con GPS reales de producción y no interfiere
 * con el zoom ni paneo del mapa.
 */
function SmoothTaxiMarkerComponent({
  op,
  selected = false,
  destinoHeading,
  onSelect,
  nombreRuta,
}) {
  const markerRef = useRef(null);
  const animRef = useRef(null);

  const initialHeading = selected && destinoHeading != null ? destinoHeading : (op.gps_heading || 0);
  const posRef = useRef({ lat: op.lat, lng: op.lng });
  const headingRef = useRef(initialHeading);

  // Animación fluida continua de 60fps al recibir un nuevo punto GPS o rumbo
  useEffect(() => {
    const targetLat = op.lat;
    const targetLng = op.lng;
    if (targetLat == null || targetLng == null) return;

    const targetHeading = selected && destinoHeading != null ? destinoHeading : (op.gps_heading || 0);

    const startLat = posRef.current.lat ?? targetLat;
    const startLng = posRef.current.lng ?? targetLng;
    const startHeading = headingRef.current ?? targetHeading;

    // Si es el primer punto o un salto anómalo gigante (> 5 km), saltar directo
    const dLat = targetLat - startLat;
    const dLng = targetLng - startLng;
    const distSq = dLat * dLat + dLng * dLng;

    if (distSq > 0.005) {
      posRef.current = { lat: targetLat, lng: targetLng };
      headingRef.current = targetHeading;
      if (markerRef.current) {
        markerRef.current.setLatLng([targetLat, targetLng]);
        const el = markerRef.current.getElement();
        if (el) {
          const rotator = el.querySelector(".th-taxi-rotator");
          if (rotator) rotator.style.transform = `rotate(${targetHeading - 90}deg)`;
        }
      }
      return;
    }

    // Delta angular más corto (evita giros de 350° al pasar por el norte 0°/360°)
    const diffHeading = ((targetHeading - startHeading + 540) % 360) - 180;

    // Duración de la interpolación: 2000ms (coincide con el intervalo de transmisión del backend)
    const DURATION_MS = 2000;
    const startTime = performance.now();

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / DURATION_MS);

      // Interpolación lineal constante entre paquetes GPS
      const curLat = startLat + dLat * progress;
      const curLng = startLng + dLng * progress;
      const curHeading = startHeading + diffHeading * progress;

      posRef.current = { lat: curLat, lng: curLng };
      headingRef.current = curHeading;

      if (markerRef.current) {
        markerRef.current.setLatLng([curLat, curLng]);
        const el = markerRef.current.getElement();
        if (el) {
          const rotator = el.querySelector(".th-taxi-rotator");
          if (rotator) rotator.style.transform = `rotate(${curHeading - 90}deg)`;
        }
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [op.lat, op.lng, op.gps_heading, selected, destinoHeading]);

  // Memoizar la instancia del icono para que Leaflet NUNCA destruya y re-cree el nodo DOM
  // en cada ciclo de animación o paquete GPS. La rotación continua a 60 FPS se efectúa
  // directamente sobre .th-taxi-rotator en cada fotograma.
  const icon = useMemo(() => {
    return taxiStateAssetIcon(op.estado, {
      label: op.placa,
      selected,
      heading: initialHeading,
    });
  }, [op.estado, op.placa, selected]);

  const speedKmh = Math.round((op.gps_speed || 0) * 3.6);

  return (
    <Marker
      ref={markerRef}
      position={[op.lat, op.lng]}
      zIndexOffset={selected ? 1000 : 0}
      icon={icon}
      eventHandlers={{ click: onSelect }}
    >
      <Popup className="th-taxi-popup" minWidth={160} maxWidth={200}>
        <div style={{ fontFamily: "Inter, sans-serif", padding: "6px 2px", display: "flex", flexDirection: "column", gap: "6px", minWidth: "160px" }}>
          {/* Foto + Nombre + Unidad */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {op.foto_url ? (
              <img
                src={op.foto_url}
                alt={op.nombre}
                style={{ height: "36px", width: "36px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(79,93,255,0.5)", flexShrink: 0 }}
              />
            ) : (
              <div style={{ height: "36px", width: "36px", borderRadius: "50%", background: "rgba(79,93,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#A8B1FF", fontSize: "14px", flexShrink: 0 }}>
                {op.nombre?.[0] || "T"}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#F5F5F7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{op.nombre}</div>
              <div style={{ fontSize: "10px", color: "#9CA0AA", marginTop: "1px" }}>
                Unidad <span style={{ fontFamily: "monospace", color: "#F5F5F7", fontWeight: 700 }}>#{op.vehiculo?.numero_economico || op.placa}</span>
              </div>
            </div>
          </div>
          {/* Imagen vehículo */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "4px 6px" }}>
            <img
              src={resolveVehicleImage(op.vehiculo)}
              alt={op.vehiculo?.modelo || "Vehículo"}
              style={{ height: "32px", width: "52px", objectFit: "contain", flexShrink: 0 }}
            />
            <div style={{ fontSize: "11px", color: "#F5F5F7", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {op.vehiculo?.marca} {op.vehiculo?.modelo || "Taxi"}
            </div>
          </div>
          {/* Estado */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ height: "7px", width: "7px", borderRadius: "50%", background: ESTADO_COLORS[op.estado], flexShrink: 0 }} />
            <span style={{ fontSize: "11px", fontWeight: 600, color: ESTADO_COLORS[op.estado] }}>{ESTADO_LABEL[op.estado]}</span>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

export const SmoothTaxiMarker = memo(SmoothTaxiMarkerComponent);
export default SmoothTaxiMarker;
