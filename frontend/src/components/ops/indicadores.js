import { ESTADOS_OPERADOR, ORDEN_CONTEO_FLOTA } from "@/design/status";

// Indicadores del topbar del Centro de Operaciones, alimentados por la SSOT
// de estados (design/status). Orden canónico de conteo de flota.
export const INDICADORES = ORDEN_CONTEO_FLOTA.map((k) => ({
  estado: k,
  label: ESTADOS_OPERADOR[k].conteo,
  color: ESTADOS_OPERADOR[k].color,
}));
