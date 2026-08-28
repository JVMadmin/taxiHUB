import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Expediente } from "@/pages/dueno/Expediente";
import { User, ChevronRight } from "lucide-react";

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
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Conductores</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Ranking del mes por servicios completados. Toca un conductor para ver su expediente.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {conductores.map((c) => (
          <button
            key={c.id}
            data-testid={`conductor-card-${c.id}`}
            onClick={() => setExpedienteId(c.id)}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-bright to-brand-strong font-extrabold text-brand-contrast">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-foreground">{c.nombre}</div>
              <div className="text-xs text-muted-foreground">{c.servicios_completados} completados · {c.cancelados} cancelados</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand-bright" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default Conductores;
