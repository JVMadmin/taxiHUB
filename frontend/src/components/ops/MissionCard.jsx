import { cn } from "@/lib/utils";
import { fmtDist, fmtDuration } from "@/lib/geo";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/Button";
import { EstadoBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { User, Car, RouteIcon, X, Navigation as NavIcon, ClipboardList } from "@/design/icons";

/**
 * MissionCard — panel contextual del taxi seleccionado (DS 2.0).
 * Identidad de la unidad, métricas GPS, recorrido en vivo y ruta del servicio.
 * El contenedor DraggablePanel lo provee el consumidor.
 */
export function MissionCard({
  op, trackStats, showTrack, onToggleTrack,
  servicioActivo, servicioDestino, rutaServicio, verRutaServicio, onToggleRuta,
  follow, onToggleFollow, onVerServicio, onVerExpediente, onClose,
}) {
  if (!op) return null;
  return (
    <div data-testid="taxi-detail-panel" className="bezel-shell animate-slide-up">
      <div className="max-h-[calc(100vh-118px)] overflow-y-auto rounded-[var(--radius)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {op.vehiculo && (
              <VehicleImage vehiculo={op.vehiculo} className="h-12 w-16 shrink-0 rounded-lg border border-border bg-surface-3" imgClassName="p-1" />
            )}
            <div className="min-w-0">
              <div className="truncate font-mono text-lg font-extrabold tracking-tight text-foreground">
                {op.vehiculo?.numero_economico ? `UNIDAD ${op.vehiculo.numero_economico}` : op.placa}
              </div>
              <div className="mt-1.5">
                <EstadoBadge estado={op.estado} pulse />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground" data-testid="taxi-detail-close" aria-label="Cerrar detalle del taxi">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-foreground/90">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="font-medium">{op.nombre}</span>
          </div>
          {op.vehiculo && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
              {[op.vehiculo.marca, op.vehiculo.modelo].filter(Boolean).join(" ")}
              {op.vehiculo.placa ? ` · ${op.vehiculo.placa}` : ""}
            </div>
          )}
          {op.rutaNombre && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RouteIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {op.rutaNombre}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-border bg-card/60 p-2.5 text-center">
          <div className="data-cell">
            <span className="data-cell-label">Precisión</span>
            <span className="data-cell-value">{op.gps_accuracy != null ? `${Math.round(op.gps_accuracy)} m` : "—"}</span>
          </div>
          <div className="data-cell">
            <span className="data-cell-label">Velocidad</span>
            <span className="data-cell-value">{op.gps_speed != null ? `${Math.round(op.gps_speed * 3.6)} km/h` : "—"}</span>
          </div>
          <div className="data-cell">
            <span className="data-cell-label">GPS</span>
            <span className="data-cell-value text-emerald-400">{timeAgo(op.ultima_actualizacion)}</span>
          </div>
        </div>

        {trackStats && (
          <div className="mt-3 rounded-xl border border-border bg-card/60 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Recorrido en vivo</span>
              <button
                data-testid="ver-recorrido-btn"
                onClick={onToggleTrack}
                className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors",
                  showTrack ? "border-brand/50 bg-brand/10 text-brand-bright" : "border-border text-foreground/85 hover:border-border")}
              >
                {showTrack ? "Ocultar" : "Ver recorrido"}
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><b className="mono-num text-foreground">{fmtDist(trackStats.dist)}</b> recorridos</span>
              <span><b className="mono-num text-foreground">{fmtDuration(trackStats.dur)}</b> ventana</span>
              <span><b className="mono-num text-foreground">{trackStats.points}</b> puntos</span>
            </div>
          </div>
        )}

        {/* Ruta al destino del servicio activo */}
        {servicioActivo && (
          <div className="mt-3 rounded-xl border border-border surface-ui p-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <RouteIcon className="h-3 w-3" /> Ruta a destino
              </span>
              {servicioDestino ? (
                <button
                  data-testid="terminal-ruta-toggle"
                  onClick={onToggleRuta}
                  className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors",
                    verRutaServicio ? "border-brand/50 bg-brand/10 text-brand-bright" : "border-border text-foreground/85 hover:border-border")}
                >
                  {verRutaServicio ? "Ocultar" : "Ver ruta"}
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground">sin coordenadas</span>
              )}
            </div>
            {servicioDestino && (
              <>
                <div className="mt-2 flex items-center gap-2 text-xs text-foreground/85">
                  <NavIcon className="h-3.5 w-3.5 shrink-0 text-brand-bright" />
                  <span className="truncate">{servicioActivo.destino?.texto || "Destino marcado en el mapa"}</span>
                </div>
                {rutaServicio.distance_m != null && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><b className="mono-num text-emerald-400">{fmtDist(rutaServicio.distance_m)}</b> faltante</span>
                    <span><b className="mono-num text-foreground">{fmtDuration(rutaServicio.duration_s)}</b> ETA</span>
                    <span className="mono-num text-muted-foreground">{rutaServicio.provider === "osrm" ? "rutas reales" : "línea recta"}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button data-testid="seguir-taxi-btn" onClick={onToggleFollow} variant={follow ? "primary" : "secondary"} size="sm">
            <NavIcon className="h-4 w-4" />
            {follow ? "Siguiendo" : "Seguir taxi"}
          </Button>
          <Button data-testid="ver-servicio-btn" onClick={onVerServicio} variant="secondary" size="sm">
            <ClipboardList className="h-4 w-4" /> Ver servicio
          </Button>
        </div>
        {onVerExpediente && (
          <Button data-testid="ver-expediente-btn" onClick={onVerExpediente} variant="secondary" size="sm" className="mt-2 w-full">
            <User className="h-4 w-4" /> Ver expediente
          </Button>
        )}
      </div>
    </div>
  );
}

export default MissionCard;
