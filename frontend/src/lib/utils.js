import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"
import { BACKEND_URL } from "@/lib/api";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Imagen genérica cuando el vehículo no tiene foto propia NI tipo con imagen.
export const VEHICLE_IMAGE_FALLBACK = "/assets/vehicles/generico.png";

// Catálogo local de imágenes por modelo/marca/tipo de vehículo — referencia
// visual inmediata en la ficha del pasajero, del operador y de la terminal.
export const VEHICLE_TYPE_ASSETS = {
  aveo: "/assets/vehicles/aveo.png",
  gol: "/assets/vehicles/gol.png",
  golf: "/assets/vehicles/golf.png",
  sentra: "/assets/vehicles/Sentra.png",
  jetta: "/assets/vehicles/jetta.png",
  kwid: "/assets/vehicles/kwid.png",
  onix: "/assets/vehicles/onix.png",
  virtus: "/assets/vehicles/virtus.png",
  tsuru: "/assets/vehicles/tsuru.png",
  versa: "/assets/vehicles/versa.png",
  march: "/assets/vehicles/march.png",
  generico: "/assets/vehicles/generico.png",
  estandar: "/assets/vehicles/generico.png",
  taxi: "/assets/vehicles/generico.png",
};

const _normClave = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Devuelve el asset local que corresponde al vehículo (por tipo, marca o
// modelo), o fallback genérico si no hay catálogo específico para él.
export function vehicleTypeAssetKey(vehiculo) {
  if (!vehiculo) return VEHICLE_IMAGE_FALLBACK;
  const t = vehiculo.tipo_vehiculo || {};
  const candidatos = [
    vehiculo.modelo, vehiculo.marca, t.modelo, t.marca, t.nombre, vehiculo.nombre,
  ].filter(Boolean);

  for (const c of candidatos) {
    const clave = _normClave(c);
    if (clave && VEHICLE_TYPE_ASSETS[clave]) return VEHICLE_TYPE_ASSETS[clave];
    // Coincidencia por subcadena (p. ej. "Nissan Sentra 2021" contiene "sentra")
    for (const [k, url] of Object.entries(VEHICLE_TYPE_ASSETS)) {
      if (clave.includes(k)) return url;
    }
  }
  const combinada = _normClave([vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" "));
  if (combinada) {
    if (VEHICLE_TYPE_ASSETS[combinada]) return VEHICLE_TYPE_ASSETS[combinada];
    for (const [k, url] of Object.entries(VEHICLE_TYPE_ASSETS)) {
      if (combinada.includes(k)) return url;
    }
  }
  return VEHICLE_IMAGE_FALLBACK;
}

// Prioridad de imagen: foto propia del vehículo -> catálogo local por modelo
// (referencia visual inmediata) -> imagen de su VehicleType -> genérica.
// El backend ya resuelve foto/tipo en `imagen_resuelta`; este helper arma la
// URL absoluta (los archivos subidos viven en el backend, los SVG de catálogo
// y los assets de modelo son estáticos del frontend) y aplica los fallbacks.
export function resolveVehicleImage(vehiculo) {
  if (vehiculo?.foto_url) {
    const f = vehiculo.foto_url;
    return f.startsWith("/api/") ? `${BACKEND_URL}${f}` : f;
  }
  const local = vehicleTypeAssetKey(vehiculo);
  if (local) return local;
  const url = vehiculo?.imagen_resuelta ?? vehiculo?.tipo_vehiculo?.imagen_url;
  if (url) return url.startsWith("/api/") ? `${BACKEND_URL}${url}` : url;
  return VEHICLE_IMAGE_FALLBACK;
}

// Iniciales para avatares sin foto (tarjeta de conductor/cliente — ver
// memory/DIRECCION_VISUAL.md). "Carlos Ramírez" -> "CR".
export function iniciales(nombre) {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase() || "?";
}

// Método de pago legible.
export function metodoPago(m) {
  return m === "card" ? "Tarjeta" : m === "cash" ? "Efectivo" : m;
}
