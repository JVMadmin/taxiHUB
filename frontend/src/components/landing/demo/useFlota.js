import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { flota, nombreZona } from "./flota";

// La simulación corre mientras `activo` (p. ej. el mapa está en pantalla) y sin movimiento reducido.
export function useSimulacion(activo) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!activo || reduce) return undefined;
    return flota.activar();
  }, [activo, reduce]);
}

const leer = () =>
  flota.unidades.map((u) => ({
    id: u.id,
    chofer: u.chofer,
    estado: u.estado,
    servicio: u.servicio,
    kmh: u.vel > 0 ? Math.round(u.velActual * 3.6) : 0,
    rumbo: u.rumbo,
    zona: nombreZona(u.pista),
  }));

// Copia legible de la flota para paneles y listas (se refresca a ritmo humano, no a 60 fps).
export function useInstantanea(ms = 600) {
  const [datos, setDatos] = useState(leer);
  useEffect(() => {
    const id = setInterval(() => setDatos(leer()), ms);
    const quitar = flota.suscribirServicio(() => setDatos(leer()));
    return () => {
      clearInterval(id);
      quitar();
    };
  }, [ms]);
  return datos;
}

export function useServicio() {
  const [s, setS] = useState(() => flota.servicio);
  useEffect(() => flota.suscribirServicio(setS), []);
  return s;
}

const RUMBOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
export const rumboTexto = (g) => RUMBOS[Math.round((((g % 360) + 360) % 360) / 45) % 8];
