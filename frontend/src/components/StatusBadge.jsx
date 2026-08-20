import { cn } from "@/lib/utils";
import { ESTADO_COLORS, ESTADO_LABEL, SERVICIO_COLORS, SERVICIO_LABEL } from "@/lib/api";

// Badge de estado de conductor: punto + texto (nunca color únicamente).
// Usa .sem-badge (color-mix vía --sc) para adaptar el contraste a cada modo.
export function EstadoBadge({ estado, label, className, pulse }) {
  const color = ESTADO_COLORS[estado] || "#6b7280";
  const text = label || ESTADO_LABEL[estado] || estado;
  return (
    <span
      className={cn("sem-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", className)}
      style={{ "--sc": color }}
    >
      {pulse ? (
        <span className="relative flex h-2 w-2">
          <span
            className="absolute inline-flex h-full w-full animate-ping-soft rounded-full"
            style={{ background: "var(--sc)" }}
          />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--sc)" }} />
        </span>
      ) : (
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--sc)" }} />
      )}
      {text}
    </span>
  );
}

// Badge de estado de servicio con color semántico consistente.
export function ServicioBadge({ estado, label, className }) {
  const color = SERVICIO_COLORS[estado] || "#6b7280";
  const text = label || SERVICIO_LABEL[estado] || estado;
  return (
    <span
      className={cn("sem-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold", className)}
      style={{ "--sc": color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--sc)" }} />
      {text}
    </span>
  );
}

// Botón "pill" grande para el estado actual del conductor (siempre visible).
export function DriverStatusPill({ estado, className }) {
  const color = ESTADO_COLORS[estado] || "#6b7280";
  const text = ESTADO_LABEL[estado] || estado;
  return (
    <div
      data-testid="driver-status-pill"
      className={cn("sem-badge flex items-center gap-2 rounded-2xl border px-3.5 py-2", className)}
      style={{ "--sc": color }}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span
          className="absolute inline-flex h-full w-full animate-ping-soft rounded-full"
          style={{ background: "var(--sc)" }}
        />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--sc)" }} />
      </span>
      <span className="text-sm font-extrabold uppercase tracking-wide" style={{ color: "var(--sc)" }}>
        {text}
      </span>
    </div>
  );
}