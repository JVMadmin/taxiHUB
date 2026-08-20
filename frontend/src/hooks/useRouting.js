import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  geometryToLatLngs,
  haversineM,
  straightLine,
} from "@/lib/geo";

/**
 * useRouting — ruta real (OSRM) entre origen y destino para la navegación
 * del conductor. Fallback en cliente a línea recta (Haversine) si el backend
 * no responde. Recalcula solo cuando el punto origen se mueve ≥ minMoveM.
 *
 * `client` permite inyectar el cliente axios del scope correcto (termApi en el
 * Terminal, pasApi en la app del pasajero). Por defecto usa el del operador.
 *
 * NOTAS DE ROBUSTEZ:
 * - `origin`/`destination` pueden ser objetos nuevos en cada render (p. ej. un
 *   literal `{lat,lng}` reconstruido). Se dedupe por coordenadas ANTES de
 *   lanzar el fetch y se versionan las respuestas (no se cancela el vuelo en
 *   el cleanup), así un re-render inofensivo no descarta la petición en curso
 *   ni dispara bucles de setState.
 * - El estado de "inactivo" solo se emite en la TRANSICIÓN (evita un bucle
 *   cuando `enabled=false` se re-evalúa en cada render con objetos nuevos).
 */
export function useRouting(origin, destination, { enabled = true, minMoveM = 60, client = api } = {}) {
  const [state, setState] = useState({
    distance_m: null,
    duration_s: null,
    latlngs: null,
    provider: null,
    loading: false,
  });
  const lastRef = useRef(null);      // último origen procesado (dedupe)
  const versionRef = useRef(0);      // versión del fetch en curso
  const inactiveRef = useRef(true);  // guard para emitir el reset solo 1 vez

  useEffect(() => {
    if (!enabled || !origin || !destination) {
      versionRef.current += 1;
      lastRef.current = null;
      if (!inactiveRef.current) {
        inactiveRef.current = true;
        setState({ distance_m: null, duration_s: null, latlngs: null, provider: null, loading: false });
      }
      return;
    }
    inactiveRef.current = false;
    const o = Array.isArray(origin) ? { lat: origin[0], lng: origin[1] } : origin;
    const d = Array.isArray(destination) ? { lat: destination[0], lng: destination[1] } : destination;
    if (o.lat == null || o.lng == null || d.lat == null || d.lng == null) return;

    const destKey = `${d.lat.toFixed(6)},${d.lng.toFixed(6)}`;
    const last = lastRef.current;
    if (last && last.destKey === destKey && last.coords) {
      const moved = haversineM(o.lat, o.lng, last.coords.lat, last.coords.lng);
      if (moved < minMoveM) return; // sin cambio relevante: deja el en curso vivo
    }

    // Nuevo fetch real: invalida cualquier respuesta anterior en vuelo.
    versionRef.current += 1;
    const v = versionRef.current;
    lastRef.current = { destKey, coords: { lat: o.lat, lng: o.lng } };
    setState((s) => ({ ...s, loading: true }));

    (async () => {
      try {
        const { data } = await client.post("/routing/route", {
          origen: { lat: o.lat, lng: o.lng },
          destino: { lat: d.lat, lng: d.lng },
        });
        if (v !== versionRef.current) return; // respuesta obsoleta
        setState({
          distance_m: data.distance_m,
          duration_s: data.duration_s,
          latlngs: geometryToLatLngs(data.geometry) || straightLine(o, d),
          provider: data.provider,
          loading: false,
        });
      } catch {
        if (v !== versionRef.current) return;
        const m = haversineM(o.lat, o.lng, d.lat, d.lng);
        setState({
          distance_m: m,
          duration_s: Math.round(m / (25_000 / 3600)),
          latlngs: straightLine(o, d),
          provider: "haversine",
          loading: false,
        });
      }
    })();
  }, [enabled, origin, destination, minMoveM, client]);

  return state;
}