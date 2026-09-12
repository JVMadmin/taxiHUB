import React, { useEffect, useRef, useMemo, useState, memo } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
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

  const [fotoModal, setFotoModal] = useState(false);
  const speedKmh = Math.round((op.gps_speed || 0) * 3.6);

  return (
    <>
      <Marker
        ref={markerRef}
        position={[op.lat, op.lng]}
        zIndexOffset={selected ? 1000 : 0}
        icon={icon}
        eventHandlers={{ click: onSelect }}
      >
        <Popup className="th-taxi-popup" minWidth={170} maxWidth={220}>
          <div style={{ fontFamily: "Inter, sans-serif", padding: "6px 2px", display: "flex", flexDirection: "column", gap: "8px", minWidth: "170px" }}>
            {/* Foto + Nombre + Unidad */}
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <div
                style={{ position: "relative", cursor: "pointer", flexShrink: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFotoModal(true);
                }}
                title="Clic para ampliar fotografía del chofer"
              >
                {op.foto_url ? (
                  <img
                    src={op.foto_url}
                    alt={op.nombre}
                    style={{ height: "40px", width: "40px", borderRadius: "50%", objectFit: "cover", border: "2px solid #4F5DFF", display: "block" }}
                  />
                ) : (
                  <div style={{ height: "40px", width: "40px", borderRadius: "50%", background: "rgba(79,93,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#FFFFFF", fontSize: "16px" }}>
                    {op.nombre?.[0] || "T"}
                  </div>
                )}
                <span
                  style={{
                    position: "absolute",
                    bottom: "-2px",
                    right: "-2px",
                    background: "#4F5DFF",
                    borderRadius: "50%",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.5)"
                  }}
                >
                  <ZoomIn style={{ width: "9px", height: "9px", color: "#FFFFFF" }} />
                </span>
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: "13px", color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.2px" }}>
                  {op.nombre}
                </div>
                <div style={{ fontSize: "11px", color: "#CBD5E1", marginTop: "2px", fontWeight: 500 }}>
                  Unidad <span style={{ fontFamily: "monospace", color: "#FBBF24", fontWeight: 800, fontSize: "12px" }}>#{op.vehiculo?.numero_economico || op.placa}</span>
                </div>
              </div>
            </div>

            {/* Imagen vehículo */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "9px", padding: "5px 7px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <img
                src={resolveVehicleImage(op.vehiculo)}
                alt={op.vehiculo?.modelo || "Vehículo"}
                style={{ height: "30px", width: "50px", objectFit: "contain", flexShrink: 0 }}
              />
              <div style={{ fontSize: "11px", color: "#FFFFFF", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {op.vehiculo?.marca || ""} {op.vehiculo?.modelo || "Taxi"}
              </div>
            </div>

            {/* Estado */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,0.25)", borderRadius: "6px", padding: "3px 6px" }}>
              <span style={{ height: "8px", width: "8px", borderRadius: "50%", background: ESTADO_COLORS[op.estado], flexShrink: 0 }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: ESTADO_COLORS[op.estado] }}>
                {ESTADO_LABEL[op.estado]}
              </span>
              <span style={{ marginLeft: "auto", fontSize: "10px", color: "#94A3B8", fontFamily: "monospace" }}>
                {speedKmh} km/h
              </span>
            </div>
          </div>
        </Popup>
      </Marker>

      {/* Modal de visualización ampliada de conductor */}
      {fotoModal && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(8px)",
            padding: "16px",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setFotoModal(false);
          }}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "340px",
              width: "100%",
              borderRadius: "20px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backgroundColor: "#17191E",
              padding: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setFotoModal(false)}
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                border: "none",
                color: "#FFFFFF",
                padding: "6px",
                cursor: "pointer",
              }}
              title="Cerrar"
            >
              <X style={{ width: "18px", height: "18px" }} />
            </button>

            {/* Foto grande */}
            <div
              style={{
                margin: "0 auto 16px",
                height: "160px",
                width: "160px",
                borderRadius: "50%",
                overflow: "hidden",
                border: "3px solid #4F5DFF",
                boxShadow: "0 10px 25px rgba(79, 93, 255, 0.35)",
                backgroundColor: "#0B0D10",
              }}
            >
              {op.foto_url ? (
                <img
                  src={op.foto_url}
                  alt={op.nombre}
                  style={{ height: "100%", width: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px", fontWeight: 800, color: "#FFFFFF", background: "rgba(79,93,255,0.3)" }}>
                  {op.nombre?.[0] || "T"}
                </div>
              )}
            </div>

            <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 4px" }}>
              {op.nombre}
            </h3>

            <div style={{ display: "inline-block", backgroundColor: "rgba(251, 191, 36, 0.15)", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "4px 10px", margin: "4px 0 14px" }}>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#FBBF24", fontFamily: "monospace" }}>
                Unidad #{op.vehiculo?.numero_economico || op.placa}
              </span>
            </div>

            <div style={{ textAlign: "left", background: "rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <img
                  src={resolveVehicleImage(op.vehiculo)}
                  alt="Vehículo"
                  style={{ height: "36px", width: "60px", objectFit: "contain" }}
                />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#FFFFFF" }}>
                    {op.vehiculo?.marca} {op.vehiculo?.modelo || "Vehículo estándar"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                    Color: {op.vehiculo?.color || "Blanco"} · Placas: <span style={{ color: "#FFFFFF", fontFamily: "monospace" }}>{op.placa}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px", fontSize: "11px" }}>
                <span style={{ color: "#94A3B8" }}>Estado operativo:</span>
                <span style={{ color: ESTADO_COLORS[op.estado], fontWeight: 700 }}>
                  {ESTADO_LABEL[op.estado]}
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export const SmoothTaxiMarker = memo(SmoothTaxiMarkerComponent);
export default SmoothTaxiMarker;
