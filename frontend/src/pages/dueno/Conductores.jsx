import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { resolveDriverAvatar } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Expediente } from "@/pages/dueno/Expediente";
import { Phone, ChevronRight, Car, CheckCircle2 } from "lucide-react";

export function Conductores({ liveSignal }) {
  const [conductores, setConductores] = useState(null);
  const [error, setError] = useState(null);
  const [expedienteId, setExpedienteId] = useState(null);

  const load = useCallback(() => {
    setError(null);
    duenoApi.get("/dueno/conductores").then((r) => setConductores(r.data)).catch(() => setError("No se pudo cargar la lista de conductores"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  if (expedienteId) {
    return <Expediente conductorId={expedienteId} onBack={() => setExpedienteId(null)} liveSignal={liveSignal} />;
  }

  if (error) return <ErrorState description={error} onRetry={load} testId="dueno-conductores-error" />;
  if (!conductores) return <LoadingState rows={3} testId="dueno-conductores-loading" />;

  return (
    <div className="space-y-6" data-testid="dueno-conductores">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Conductores de tu Flota</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Expedientes SCT/SEMOVI, vigencias de licencia y servicios realizados en el mes.</p>
        </div>
        <span className="rounded-full bg-brand/20 px-3 py-1 text-xs font-bold text-brand-bright">
          {conductores.length} choferes asignados
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {conductores.map((c, idx) => {
          const avatarUrl = resolveDriverAvatar(c.foto_url, c.id || idx);
          return (
            <button
              key={c.id}
              data-testid={`conductor-card-${c.id}`}
              onClick={() => setExpedienteId(c.id)}
              className="group relative flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card/90 p-4 text-left transition-all duration-200 hover:border-brand hover:bg-[#181B22] shadow-sm hover:shadow-lg"
            >
              {/* Fotografía real del chofer */}
              <div className="relative h-13 w-13 shrink-0">
                <img
                  src={avatarUrl}
                  alt={c.nombre}
                  className="h-13 w-13 rounded-2xl object-cover border-2 border-border/80 shadow-md group-hover:border-brand transition-colors"
                />
                <span
                  className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-card ${
                    c.estado === "ocupado"
                      ? "bg-rose-500 shadow-[0_0_8px_#f43f5e]"
                      : c.estado === "libre"
                      ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                      : "bg-slate-500"
                  }`}
                  title={c.estado || "Libre"}
                />
              </div>

              {/* Información del conductor */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <div className="truncate text-sm font-extrabold text-foreground group-hover:text-brand-bright transition-colors">
                    {c.nombre}
                  </div>
                  {c.vehiculo && (
                    <span className="shrink-0 rounded-md bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-black text-amber-400 border border-amber-400/30">
                      #{c.vehiculo}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                    <Phone className="h-3 w-3 text-brand-bright/70" />
                    {c.telefono || "916-000-0000"}
                  </span>
                  {c.vehiculo_info?.modelo && (
                    <span className="text-[11px] text-slate-300 truncate">
                      · {c.vehiculo_info.modelo}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/[0.06] font-mono">
                  <span className="text-emerald-400 font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {c.servicios_completados || 0} completados
                  </span>
                  {c.cancelados > 0 && (
                    <span className="text-rose-400/80 text-[10px]">
                      {c.cancelados} cancelados
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-brand-bright" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Conductores;
