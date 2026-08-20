import { cn } from "@/lib/utils";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

// Indicador de conexión en tiempo real (Fase 9, sección 19).
// state: "online" | "reconnecting" | "offline"
export function ConnectionBadge({ state = "online", label, className }) {
  const cfg = {
    online: {
      color: "#22c55e",
      icon: Wifi,
      text: label || "En línea",
    },
    reconnecting: {
      color: "#eab308",
      icon: RefreshCw,
      text: label || "Reconectando…",
    },
    offline: {
      color: "#ef4444",
      icon: WifiOff,
      text: label || "Sin conexión",
    },
  }[state] || { color: "#6b7280", icon: Wifi, text: "Desconocido" };

  const Icon = cfg.icon;
  return (
    <span
      data-testid={`conn-${state}`}
      className={cn(
        "sem-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
        className
      )}
      style={{ "--sc": cfg.color }}
    >
      {state === "reconnecting" ? (
        <Icon className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {cfg.text}
    </span>
  );
}