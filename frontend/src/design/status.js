// TaxiHUB 2.0 — Fuente única de verdad de estados.
// Consumida por badges, marcadores de mapa, contadores, filtros y dashboard.
// Los valores coinciden con los enums del backend (server.py EstadoOperador /
// EstadoServicio); los marcados `reservado` se adoptan en fases posteriores.

export const PALETA = {
  primary: "#10B981",
  primaryDark: "#047857",
  primaryLight: "#D1FAE5",
  success: "#10B981",
  danger: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",
  purple: "#8B5CF6",
  offline: "#6B7280",
};

// Estados de unidad/conductor (EstadoOperador del backend + reservados 2.0)
export const ESTADOS_OPERADOR = {
  libre: { key: "libre", label: "Disponible", corto: "DISP", color: PALETA.success, tone: "success", conteo: "Disponibles" },
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
  en_curso: { key: "en_curso", label: "En curso", color: PALETA.success, tone: "success" },
  completado: { key: "completado", label: "Completado", color: PALETA.primary, tone: "success" },
  cancelado: { key: "cancelado", label: "Cancelado", color: PALETA.danger, tone: "danger" },
  vencido: { key: "vencido", label: "Vencido", color: "#F97316", tone: "warning" },
  rechazado: { key: "rechazado", label: "Rechazado", color: PALETA.offline, tone: "neutral" },
};

// Estados de unidad para flota/socios (derivado de operador + mantenimiento)
export const ESTADOS_UNIDAD = {
  disponible: { key: "disponible", label: "Disponible", color: PALETA.success, tone: "success" },
  en_servicio: { key: "en_servicio", label: "En servicio", color: PALETA.danger, tone: "danger" },
  averiada: { key: "averiada", label: "Averiada", color: PALETA.purple, tone: "purple" },
  mantenimiento: { key: "mantenimiento", label: "Mantenimiento", color: PALETA.warning, tone: "warning" },
  fuera_de_servicio: { key: "fuera_de_servicio", label: "Fuera de servicio", color: PALETA.offline, tone: "neutral" },
  offline: { key: "offline", label: "Offline", color: PALETA.offline, tone: "neutral" },
};

// Estados de documentación (expedientes F8)
export const ESTADOS_DOCUMENTO = {
  vigente: { key: "vigente", label: "Vigente", color: PALETA.success, tone: "success" },
  por_vencer: { key: "por_vencer", label: "Próximo a vencer", color: PALETA.warning, tone: "warning" },
  vencido: { key: "vencido", label: "Vencido", color: PALETA.danger, tone: "danger" },
};

// Estados de objeto olvidado (F11)
export const ESTADOS_OBJETO = {
  encontrado: { key: "encontrado", label: "Encontrado", color: PALETA.info, tone: "info" },
  resguardo: { key: "resguardo", label: "En resguardo", color: PALETA.warning, tone: "warning" },
  devuelto: { key: "devuelto", label: "Devuelto", color: PALETA.success, tone: "success" },
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
