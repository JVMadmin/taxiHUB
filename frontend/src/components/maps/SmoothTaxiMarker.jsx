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
      <Popup className="th-taxi-popup">
        <div className="min-w-[220px] text-xs">
          <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
            {op.foto_url ? (
              <img
                src={op.foto_url}
                alt={op.nombre}
                className="h-10 w-10 rounded-full object-cover border border-white/20 shadow-sm"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-brand/20 flex items-center justify-center font-bold text-brand-bright">
                {op.nombre?.[0] || "T"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-foreground truncate">{op.nombre}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full" style={{ background: ESTADO_COLORS[op.estado] }} />
                <span className="text-[11px] font-semibold" style={{ color: ESTADO_COLORS[op.estado] }}>
                  {ESTADO_LABEL[op.estado]}
                </span>
                <span className="text-muted-foreground text-[10px]">· {op.placa}</span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-surface-2/70 p-1.5 border border-white/5">
            <img
              src={resolveVehicleImage(op.vehiculo)}
              alt={op.vehiculo?.modelo || "Vehículo"}
              className="h-9 w-14 object-contain"
            />
            <div className="min-w-0 flex-1 text-[11px]">
              <div className="font-semibold text-foreground">
                {op.vehiculo?.marca || ""} {op.vehiculo?.modelo || "Vehículo estándar"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Unidad: <span className="font-mono text-foreground font-bold">{op.vehiculo?.numero_economico || op.placa}</span> ({op.vehiculo?.color || "Blanco"})
              </div>
            </div>
          </div>

          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div>Ruta: <span className="text-foreground">{nombreRuta ? nombreRuta(op.ruta_asignada) : "Taxi libre"}</span></div>
            {op.descripcion_sentido && (
              <div className="text-emerald-400 font-medium">Sentido: {op.descripcion_sentido}</div>
            )}
            <div>
              GPS: {timeAgo(op.ultima_actualizacion)} ({Math.round(op.gps_heading || 0)}°) · <span className="mono-num text-foreground font-semibold">{speedKmh} km/h</span>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

export const SmoothTaxiMarker = memo(SmoothTaxiMarkerComponent);
export default SmoothTaxiMarker;
