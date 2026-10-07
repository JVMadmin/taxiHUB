import { memo } from "react";
import { cn, resolveDriverAvatar } from "@/lib/utils";
import { Truck, Filter, Search, X } from "@/design/icons";
import { Input } from "@/components/ui/input";
import { ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { ESTADOS_OPERADOR, ORDEN_CONTEO_FLOTA } from "@/design/status";
import { timeAgo } from "@/lib/time";

/**
 * FleetPanel — panel lateral de flota del Centro de Operaciones (DS 2.0).
 * Filtro por ruta (chips), búsqueda, lista de unidades con estado SSOT.
 * El contenedor DraggablePanel lo provee el consumidor.
 */
export const FleetPanel = memo(function FleetPanel({
  rutas, filtroRuta, onFiltroRuta, busqueda, onBusqueda,
  visibles, selectedId, onSelect, onClose, serviciosHoyCounts = {},
}) {
  return (
    <aside data-testid="terminal-sidebar" className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Truck className="h-3.5 w-3.5" /> Flota en operación
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            title="Ocultar barra lateral de flota"
            aria-label="Ocultar panel de flota"
          >
            <span className="text-[11px]">Ocultar</span>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Filter className="h-3 w-3" /> Filtrar por ruta
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              data-testid="filtro-todas"
              onClick={() => onFiltroRuta("todas")}
              className={cn("chip", filtroRuta === "todas" && "chip-active")}
            >
              Todas
            </button>
            {rutas.map((r) => (
              <button
                key={r.id}
                data-testid={`filtro-ruta-${r.id}`}
                onClick={() => onFiltroRuta(r.id)}
                className={cn("chip", filtroRuta === r.id && "chip-active")}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color_hex }} />
                {r.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Taxis activos</span>
            <span className="mono-num text-muted-foreground">{visibles.length}</span>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              data-testid="buscar-taxi"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder="Buscar por nombre o unidad"
              className="input-inset h-8 border-border pl-8 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            {visibles.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                No hay taxis en operación
              </div>
            )}
            {visibles.map((o) => {
              const servHoy = serviciosHoyCounts[o.id] || 0;
              return (
                <button
                  key={o.id}
                  data-testid={`operador-item-${o.id}`}
                  onClick={() => onSelect(o)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                    selectedId === o.id
                      ? "border-brand/50 bg-brand/10"
                      : "border-border bg-card/40 hover:border-border"
                  )}
                >
                  <div className="relative shrink-0">
                    <img
                      src={resolveDriverAvatar(o.foto_url, o.id)}
                      alt={o.nombre}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/assets/drivers/driver-01.jpg";
                      }}
                      className="h-8 w-8 rounded-full border border-white/15 object-cover"
                    />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background"
                      style={{ background: ESTADO_COLORS[o.estado] }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-xs font-semibold text-foreground">{o.nombre}</div>
                      <span
                        className="shrink-0 rounded-full bg-[#4F5DFF]/20 border border-[#4F5DFF]/40 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#8A94FF]"
                        title="Servicios realizados hoy"
                      >
                        {servHoy} serv.
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{o.vehiculo?.numero_economico || o.placa} · {ESTADO_LABEL[o.estado]}</span>
                      <span className="shrink-0 text-[10px]">{timeAgo(o.ultima_actualizacion)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Leyenda (solo estados activos del backend; reservados 2.0 ocultos) */}
        <div className="grid grid-cols-2 gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {ORDEN_CONTEO_FLOTA.map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: ESTADOS_OPERADOR[k].color }} />
              {ESTADOS_OPERADOR[k].label}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
});

export default FleetPanel;
