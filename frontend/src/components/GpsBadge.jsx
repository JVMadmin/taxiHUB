import { cn } from "@/lib/utils";
import { Satellite, AlertTriangle } from "lucide-react";

// Indicador de GPS del conductor (Fase 9, sección 18).
// Muestra estado discreto: activo + precisión, o alerta si no se actualiza.
export function GpsBadge({
  active,
  accuracy,
  stale = false,
  label,
  className,
}) {
  const ok = active && !stale;
  const color = ok ? "#22c55e" : stale ? "#eab308" : "#ef4444";
  const text = stale
    ? label || "GPS sin actualizar"
    : label || `GPS activo${accuracy != null ? ` · ${Math.round(accuracy)} m` : ""}`;
  const Icon = ok ? Satellite : AlertTriangle;

  return (
    <span
      data-testid="gps-badge"
      className={cn(
        "sem-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
        className
      )}
      style={{ "--sc": color }}
    >
      <Icon className={cn("h-3 w-3", ok && "animate-pulse-dot")} />
      {text}
    </span>
  );
}