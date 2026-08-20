import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { EstadoBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";

// Tarjeta de vehículo (Flota del dueño, catálogo de tipos): la imagen es el
// elemento protagonista, no una miniatura junto al texto (ver memory/PRD del
// sistema de vehículos). Estado del conductor a simple vista — nunca solo por
// color (EstadoBadge ya combina punto + texto).
export function VehicleCard({ vehiculo, onClick, className, testId }) {
  const conductor = vehiculo.conductor;
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-brand/40",
        className
      )}
    >
      <VehicleImage
        vehiculo={vehiculo}
        className="aspect-[16/10] w-full border-b border-border bg-gradient-to-b from-surface-2 to-surface-3 transition-transform group-hover:scale-[1.02]"
        imgClassName="p-3"
      />
      <div className="flex-1 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-sm font-bold text-foreground">{vehiculo.numero_economico}</span>
          {conductor ? (
            <EstadoBadge estado={conductor.estado} />
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">Sin conductor</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {vehiculo.tipo_vehiculo?.nombre ? `${vehiculo.tipo_vehiculo.nombre} · ` : ""}
          {[vehiculo.marca, vehiculo.modelo, vehiculo.anio].filter(Boolean).join(" ") || "Sin datos del vehículo"}
          {vehiculo.placa ? ` · ${vehiculo.placa}` : ""}
        </div>
        {conductor && (
          <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" /> {conductor.nombre}
          </div>
        )}
      </div>
    </button>
  );
}

export default VehicleCard;
