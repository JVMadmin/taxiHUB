import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"
import { BACKEND_URL } from "@/lib/api";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Imagen genérica cuando el vehículo no tiene foto propia NI tipo con imagen.
export const VEHICLE_IMAGE_FALLBACK = "/vehicle-types/otros.svg";

// Catálogo local de imágenes por modelo/marca/tipo de vehículo — referencia
// visual inmediata en la ficha del pasajero, del operador y de la terminal.
// Para añadir más modelos: copia la imagen a frontend/public/assets/vehicles/
// con la clave en kebab-case y regístrala aquí (p. ej. "aveo", "yaris").
export const VEHICLE_TYPE_ASSETS = {
  march: "/assets/vehicles/march.png",
};

const _normClave = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Devuelve el asset local que corresponde al vehículo (por tipo, marca o
// modelo), o null si no hay catálogo para él.
export function vehicleTypeAssetKey(vehiculo) {
  if (!vehiculo) return null;
  const t = vehiculo.tipo_vehiculo || {};
  const candidatos = [
    t.nombre, t.modelo, t.marca, vehiculo.marca, vehiculo.modelo, vehiculo.nombre,
  ];
  for (const c of candidatos) {
    const clave = _normClave(c);
    if (clave && VEHICLE_TYPE_ASSETS[clave]) return VEHICLE_TYPE_ASSETS[clave];
  }
  const combinada = _normClave([vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" "));
  if (combinada && VEHICLE_TYPE_ASSETS[combinada]) return VEHICLE_TYPE_ASSETS[combinada];
  return null;
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
