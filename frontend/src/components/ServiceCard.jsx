import { MapPin, Flag, Clock, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServicioBadge } from "@/components/StatusBadge";
import { timeAgo } from "@/lib/time";

// Tarjeta compacta de servicio, reutilizable donde no aplica una fila de
// tabla (encabezado de detalle, listas en móvil).
export function ServiceCard({ servicio, onClick, className, testId }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border border-border bg-card p-3.5 text-left transition-colors",
        onClick && "hover:border-brand/40 hover:bg-secondary/40",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="mono-num font-mono text-[11px] font-bold text-muted-foreground">
          #{String(servicio.numero || servicio.id).slice(-6).toUpperCase()}
        </span>
        <ServicioBadge estado={servicio.estado} />
      </div>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="truncate text-foreground">{servicio.origen?.texto || servicio.origen_texto || "—"}</span>
        </div>
        <div className="flex items-start gap-2">
          <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <span className="truncate text-muted-foreground">{servicio.destino?.texto || servicio.destino_texto || "—"}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(servicio.operador_nombre || servicio.vehiculo_numero_economico) && (
          <span className="inline-flex items-center gap-1">
            <Car className="h-3 w-3" /> {servicio.operador_nombre}
            {servicio.vehiculo_numero_economico ? ` · ${servicio.vehiculo_numero_economico}` : ""}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {timeAgo(servicio.timestamp_creacion)}
        </span>
        {servicio.costo != null && <span>${servicio.costo}</span>}
      </div>
    </button>
  );
}

export default ServiceCard;
