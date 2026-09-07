// TaxiHUB 2.0 — Fuente única de verdad de estados.
// Consumida por badges, marcadores de mapa, contadores, filtros y dashboard.
// Los valores coinciden con los enums del backend (server.py EstadoOperador /
// EstadoServicio); los marcados `reservado` se adoptan en fases posteriores.

export const PALETA = {
  primary: "#4F5DFF",
  primaryDark: "#3D49D6",
  primaryLight: "#DDE1FF",
  live: "#7CFC3C",
  success: "#7CFC3C",
  danger: "#F4544C",
  warning: "#FFB224",
  info: "#4F5DFF",
  purple: "#9A6BFF",
  offline: "#9CA0AA",
};

// Estados de unidad/conductor (EstadoOperador del backend + reservados 2.0)
export const ESTADOS_OPERADOR = {
  libre: { key: "libre", label: "Disponible", corto: "DISP", color: PALETA.live, tone: "success", conteo: "Disponibles" },
  ocupado: { key: "ocupado", label: "Ocupado", corto: "OCUP", color: PALETA.danger, tone: "danger", conteo: "Ocupados" },
  no_disponible: { key: "no_disponible", label: "Pausado", corto: "PAUSA", color: PALETA.warning, tone: "warning", conteo: "Pausados" },
  fuera_de_servicio: { key: "fuera_de_servicio", label: "Offline", corto: "OFF", color: PALETA.offline, tone: "neutral", conteo: "Offline" },
  averiado: { key: "averiado", label: "Averiado", corto: "AVER", color: PALETA.purple, tone: "purple", conteo: "Averiados" },
  en_camino: { key: "en_camino", label: "En camino", corto: "CAM", color: PALETA.info, tone: "info", conteo: "En camino", reservado: true },
  mantenimiento: { key: "mantenimiento", label: "Mantenimiento", corto: "MAN", color: PALETA.warning, tone: "warning", conteo: "Mantenimiento", reservado: true },
};

// Estados de servicio (EstadoServicio del backend)
export const ESTADOS_SERVICIO = {
  pendiente: { key: "pendiente", label: "Pendiente", color: PALETA.warning, tone: "warning" },
  ofrecido: { key: "ofrecido", label: "Oferta enviada", color: PALETA.info, tone: "info" },
  asignado: { key: "asignado", label: "Asignado", color: PALETA.purple, tone: "purple" },
  en_curso: { key: "en_curso", label: "En curso", color: PALETA.primary, tone: "primary" },
  completado: { key: "completado", label: "Completado", color: PALETA.live, tone: "success" },
  cancelado: { key: "cancelado", label: "Cancelado", color: PALETA.danger, tone: "danger" },
  vencido: { key: "vencido", label: "Vencido", color: "#F97316", tone: "warning" },
  rechazado: { key: "rechazado", label: "Rechazado", color: PALETA.offline, tone: "neutral" },
};

// Estados de unidad para flota/socios (derivado de operador + mantenimiento)
export const ESTADOS_UNIDAD = {
  disponible: { key: "disponible", label: "Disponible", color: PALETA.live, tone: "success" },
  en_servicio: { key: "en_servicio", label: "En servicio", color: PALETA.danger, tone: "danger" },
  averiada: { key: "averiada", label: "Averiada", color: PALETA.purple, tone: "purple" },
  mantenimiento: { key: "mantenimiento", label: "Mantenimiento", color: PALETA.warning, tone: "warning" },
  fuera_de_servicio: { key: "fuera_de_servicio", label: "Fuera de servicio", color: PALETA.offline, tone: "neutral" },
  offline: { key: "offline", label: "Offline", color: PALETA.offline, tone: "neutral" },
};

// Estados de documentación (expedientes F8)
export const ESTADOS_DOCUMENTO = {
  vigente: { key: "vigente", label: "Vigente", color: PALETA.live, tone: "success" },
  por_vencer: { key: "por_vencer", label: "Próximo a vencer", color: PALETA.warning, tone: "warning" },
  vencido: { key: "vencido", label: "Vencido", color: PALETA.danger, tone: "danger" },
};

// Estados de objeto olvidado (F11)
export const ESTADOS_OBJETO = {
  encontrado: { key: "encontrado", label: "Encontrado", color: PALETA.info, tone: "info" },
  resguardo: { key: "resguardo", label: "En resguardo", color: PALETA.warning, tone: "warning" },
  devuelto: { key: "devuelto", label: "Devuelto", color: PALETA.live, tone: "success" },
  cerrado: { key: "cerrado", label: "Cerrado", color: PALETA.offline, tone: "neutral" },
};

const FAMILIAS = {
  operador: ESTADOS_OPERADOR,
  servicio: ESTADOS_SERVICIO,
  unidad: ESTADOS_UNIDAD,
  documento: ESTADOS_DOCUMENTO,
  objeto: ESTADOS_OBJETO,
};

export function estado(familia, key) {
  return FAMILIAS[familia]?.[key] || null;
}

export function colorDe(familia, key, fallback = PALETA.offline) {
  return FAMILIAS[familia]?.[key]?.color || fallback;
}

export function labelDe(familia, key, fallback = key) {
  return FAMILIAS[familia]?.[key]?.label || fallback;
}

// Estilo para badges CSS (.th-status / .sem-badge consumen --sc)
export function estiloEstado(familia, key) {
  return { "--sc": colorDe(familia, key) };
}

export const ORDEN_CONTEO_FLOTA = ["libre", "ocupado", "no_disponible", "fuera_de_servicio", "averiado"];
