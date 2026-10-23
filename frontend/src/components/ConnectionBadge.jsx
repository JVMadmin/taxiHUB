import { cn } from "@/lib/utils";

// Indicador de conexión en tiempo real: cápsula carbón con radar pulsante y
// barras de señal (estilos .th-live en design/tokens.css).
// state: "online" | "reconnecting" | "offline"
const TEXTOS = {
  online: "En línea",
  reconnecting: "Reconectando",
  offline: "Sin conexión",
};

export function ConnectionBadge({ state = "online", label, className }) {
  const estado = TEXTOS[state] ? state : "offline";
  return (
    <span
      data-testid={`conn-${state}`}
      role="status"
      className={cn("th-live", `th-live--${estado}`, className)}
    >
      <span className="th-live-radar" aria-hidden="true" />
      {label || TEXTOS[estado]}
      <span className="th-live-barras" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
