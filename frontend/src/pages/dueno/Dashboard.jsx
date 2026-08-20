import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Car, Users, ClipboardCheck, Ban, Wallet, PauseCircle } from "lucide-react";

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

  return (
    <div className="space-y-6" data-testid="dueno-dashboard">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Resumen de tu flota</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Estado en vivo de tus taxis y servicios de hoy.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KPICard icon={Car} label="Taxis registrados" value={data.taxis_registrados} />
        <KPICard icon={Car} label="Disponibles" value={data.taxis_disponibles} tone="good" />
        <KPICard icon={Car} label="Ocupados" value={data.taxis_ocupados} tone="brand" />
        <KPICard icon={PauseCircle} label="Fuera de servicio" value={data.taxis_fuera_de_servicio} />
        <KPICard icon={Users} label="Conductores activos" value={data.conductores_activos} />
        <KPICard icon={ClipboardCheck} label="Servicios hoy" value={data.servicios_hoy} />
        <KPICard icon={ClipboardCheck} label="Completados hoy" value={data.servicios_completados_hoy} tone="good" />
        <KPICard icon={Ban} label="Cancelados hoy" value={data.servicios_cancelados_hoy} tone="bad" />
        <KPICard icon={Wallet} label="Ingresos de hoy" value={fmtMXN(data.ingresos_hoy)} tone="brand" />
      </div>
    </div>
  );
}

export default Dashboard;
