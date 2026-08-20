import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"
import { BACKEND_URL } from "@/lib/api";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Imagen genérica cuando el vehículo no tiene foto propia NI tipo con imagen.
export const VEHICLE_IMAGE_FALLBACK = "/vehicle-types/otros.svg";

// Prioridad: foto propia del vehículo -> imagen de su VehicleType -> genérica.
// El backend ya resuelve las dos primeras en `imagen_resuelta`; este helper solo
// arma la URL absoluta (los archivos subidos viven en el backend, los SVG de
// catálogo son estáticos del frontend) y aplica el último fallback.
export function resolveVehicleImage(vehiculo) {
  const url = vehiculo?.imagen_resuelta ?? vehiculo?.foto_url ?? vehiculo?.tipo_vehiculo?.imagen_url;
  if (!url) return VEHICLE_IMAGE_FALLBACK;
  return url.startsWith("/api/") ? `${BACKEND_URL}${url}` : url;
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
