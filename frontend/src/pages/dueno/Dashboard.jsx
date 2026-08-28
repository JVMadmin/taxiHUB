import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Car, Users, ClipboardCheck, Ban, Wallet, PauseCircle, ArrowRight } from "lucide-react";

const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

export function Dashboard({ liveSignal }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    duenoApi.get("/dueno/dashboard")
      .then((r) => setData(r.data))
      .catch(() => setError("No se pudo cargar el resumen de tu flota"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  if (error) return <ErrorState description={error} onRetry={load} testId="dueno-dashboard-error" />;
  if (!data) return <LoadingState rows={4} testId="dueno-dashboard-loading" />;

  // Métrica del anillo del hero: % de servicios de hoy que se completaron
  // (de los que ya se resolvieron, sin contar los aún en curso). Dato real,
  // no inventado — sale del mismo /dueno/dashboard que ya llamaban.
  const resueltos = data.servicios_completados_hoy + data.servicios_cancelados_hoy;
  const tasaExito = resueltos > 0 ? Math.round((data.servicios_completados_hoy / resueltos) * 100) : 100;
  const flotaOperando = data.taxis_registrados > 0
    ? Math.round(((data.taxis_disponibles + data.taxis_ocupados) / data.taxis_registrados) * 100)
    : 0;

  return (
    <div className="space-y-6" data-testid="dueno-dashboard">
      {/* Hero: lo primero que se ve, cuenta el estado del día en una frase */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand-strong to-brand p-6 text-brand-contrast">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(hsl(var(--brand-contrast)) 0 ${flotaOperando}%, hsl(var(--brand-contrast) / 25%) 0)` }}
          >
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-strong">
              <span className="mono-num text-2xl font-extrabold">{flotaOperando}%</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-brand-contrast/70">Estado general</div>
            <h1 className="mt-1 text-lg font-extrabold sm:text-xl">
              {flotaOperando >= 70 ? "Tu flota está operando fuerte hoy." : "Tu flota tiene unidades sin operar hoy."}
            </h1>
            <p className="mt-1 text-sm text-brand-contrast/80">
              {data.taxis_disponibles} disponibles y {data.taxis_ocupados} ocupados de {data.taxis_registrados} taxis registrados
              {data.taxis_fuera_de_servicio > 0 && ` · ${data.taxis_fuera_de_servicio} fuera de servicio`}.
              {resueltos > 0 && ` ${tasaExito}% de los servicios resueltos hoy se completaron.`}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-foreground">Servicios de hoy</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KPICard icon={ClipboardCheck} label="Servicios hoy" value={data.servicios_hoy} />
          <KPICard icon={ClipboardCheck} label="Completados" value={data.servicios_completados_hoy} tone="good" />
          <KPICard icon={Ban} label="Cancelados" value={data.servicios_cancelados_hoy} tone="bad" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-foreground">Tu flota</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KPICard icon={Car} label="Registrados" value={data.taxis_registrados} />
          <KPICard icon={Car} label="Disponibles" value={data.taxis_disponibles} tone="good" />
          <KPICard icon={Car} label="Ocupados" value={data.taxis_ocupados} tone="brand" />
          <KPICard icon={PauseCircle} label="Fuera de servicio" value={data.taxis_fuera_de_servicio} />
          <KPICard icon={Users} label="Conductores activos" value={data.conductores_activos} />
          <KPICard icon={Wallet} label="Ingresos de hoy" value={fmtMXN(data.ingresos_hoy)} tone="brand" />
        </div>
      </div>

      {data.taxis_fuera_de_servicio > 0 && (
        <a
          href="#mantenimiento"
          className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/15"
        >
          <div>
            <div className="text-sm font-bold text-foreground">
              {data.taxis_fuera_de_servicio} unidad{data.taxis_fuera_de_servicio > 1 ? "es" : ""} fuera de servicio
            </div>
            <div className="text-xs text-muted-foreground">Revisa el estado de mantenimiento de tu flota</div>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-500" />
        </a>
      )}
    </div>
  );
}

export default Dashboard;
