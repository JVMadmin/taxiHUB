import { cn } from "@/lib/utils";
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
export function FleetPanel({
  rutas, filtroRuta, onFiltroRuta, busqueda, onBusqueda,
  visibles, selectedId, onSelect, onClose,
}) {
  return (
    <aside data-testid="terminal-sidebar" className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Truck className="h-3.5 w-3.5" /> Flota en operación
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground lg:hidden" aria-label="Cerrar panel de flota"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            {visibles.map((o) => (
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
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ESTADO_COLORS[o.estado] }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm text-foreground">{o.nombre}</div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(o.ultima_actualizacion)}</div>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {o.vehiculo?.numero_economico || o.placa} · {ESTADO_LABEL[o.estado]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Leyenda (solo estados activos del backend; reservados 2.0 ocultos) */}
        <div className="grid grid-cols-2 gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
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
}

export default FleetPanel;
