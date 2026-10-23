import { ChevronUp, Eye, EyeOff, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ESTADOS_OPERADOR, ORDEN_CONTEO_FLOTA } from "@/design/status";
import { DISPATCH } from "@/constants/testIds";
import { cn } from "@/lib/utils";

// Mismos assets que los marcadores del mapa (lib/taxiIcon.js → TAXI_STATE_ASSETS).
const ASSET = {
  libre: "/assets/vehicles/taxi-verde.png",
  ocupado: "/assets/vehicles/taxi-rojo.png",
  no_disponible: "/assets/vehicles/taxi-amarillo.png",
  fuera_de_servicio: "/assets/vehicles/taxi-operador.png",
  averiado: "/assets/vehicles/taxi-rojo.png",
};
const PLURAL = { libre: "Libres", ocupado: "Ocupadas", no_disponible: "Pausadas", fuera_de_servicio: "Offline", averiado: "Averiadas" };

/**
 * Botón "Unidades en mapa" de la Terminal: abre hacia arriba el filtro por estado.
 * Solo afecta al mapa (la lista de la flota sigue completa).
 */
export function FiltroUnidadesMapa({ conteos, estados, onEstados, mostrar, onMostrar, enMapa }) {
  const alternar = (k) => onEstados(estados.includes(k) ? estados.filter((e) => e !== k) : [...estados, k]);
  return (
    <Popover>
      <PopoverTrigger
        data-testid={DISPATCH.filtroMapa}
        className={cn(
          "surface-ui pointer-events-auto flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xl backdrop-blur-md transition-colors",
          mostrar ? "border-border/80 bg-surface/95 text-brand hover:bg-brand/10" : "border-brand/40 bg-brand/15 text-brand"
        )}
        title="Elegir qué unidades se ven en el mapa"
      >
        {mostrar ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        <span>{mostrar ? `Unidades en mapa (${enMapa})` : "Unidades ocultas"}</span>
        <ChevronUp className="h-3.5 w-3.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="z-[1200] w-72 border-border p-3 text-popover-foreground"
        style={{ background: "hsl(214 43% 10% / var(--ui-alpha, 0.96))" }}
        data-testid={DISPATCH.filtroMapaPanel}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-foreground">Unidades en el mapa</div>
            <div className="text-[11px] text-muted-foreground">Elige qué estados se muestran</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={mostrar}
            onClick={() => onMostrar(!mostrar)}
            data-testid={DISPATCH.filtroMapaMostrar}
            className={cn("th-3d flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold", mostrar ? "text-foreground" : "bg-brand text-[#050B12]")}
          >
            {mostrar ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {mostrar ? "Visibles" : "Ocultas"}
          </button>
        </div>

        <div className="mt-3 grid gap-1.5" role="group" aria-label="Estados visibles en el mapa">
          {ORDEN_CONTEO_FLOTA.map((k) => {
            const on = estados.includes(k);
            const color = ESTADOS_OPERADOR[k].color;
            return (
              <button
                key={k}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!mostrar}
                onClick={() => alternar(k)}
                data-testid={`${DISPATCH.filtroMapaEstado}-${k}`}
                className={cn(
                  "group flex min-h-[44px] items-center gap-3 rounded-xl border px-2.5 text-left transition-colors disabled:opacity-40",
                  on ? "" : "border-border bg-transparent hover:bg-white/[0.03]"
                )}
                style={{ "--c": color, borderColor: on ? `${color}66` : undefined, background: on ? `${color}14` : undefined }}
              >
                <span className="th-filtro-vehiculo" aria-hidden="true">
                  <img src={ASSET[k]} alt="" className={cn(!on && "opacity-40 grayscale")} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                    {PLURAL[k]}
                  </span>
                </span>
                <span className="mono-num text-sm font-bold" style={{ color }}>{conteos[k] || 0}</span>
                <span
                  className={cn("flex h-5 w-5 items-center justify-center rounded-md border", on ? "border-transparent text-[#050B12]" : "border-border text-transparent")}
                  style={{ background: on ? color : "transparent" }}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!mostrar}
            onClick={() => onEstados(ORDEN_CONTEO_FLOTA.filter((k) => k !== "fuera_de_servicio"))}
            className="th-3d h-9 rounded-lg text-[12px] font-semibold text-foreground disabled:opacity-40"
          >
            Todas en servicio
          </button>
          <button
            type="button"
            disabled={!mostrar}
            onClick={() => onEstados(["libre"])}
            data-testid={DISPATCH.filtroMapaSoloLibres}
            className="th-3d h-9 rounded-lg text-[12px] font-semibold text-foreground disabled:opacity-40"
          >
            Solo libres
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default FiltroUnidadesMapa;
