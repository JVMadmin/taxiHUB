import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { duenoApi } from "@/lib/api";
import { useMode } from "@/hooks/useMode";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { KPICard } from "@/components/KPICard";
import { ClipboardCheck, Ban, Wallet, Route as RouteIcon, AlertTriangle, Car, Users } from "lucide-react";

const BRAND = "#10b981";
const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

function useChartTheme() {
  const mode = useMode();
  const claro = mode === "claro";
  return {
    grid: claro ? "#ddd5c3" : "#27272a",
    axis: claro ? "#6c6559" : "#71717a",
    tooltipBg: claro ? "#faf7f0" : "#18181b",
    tooltipBorder: claro ? "#ddd5c3" : "#27272a",
    tooltipText: claro ? "#26221a" : "#e4e4e7",
  };
}

function ChartCard({ title, hint, empty, children }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-bold text-foreground">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {empty ? (
        <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">Sin datos en este período</div>
      ) : children}
    </div>
  );
}

/**
 * Dashboard ejecutivo (F12 §25) — vista de directivo: series y KPIs de la
 * operación completa del sitio. Fuente: GET /dueno/ejecutivo.
 */
export function Ejecutivo({ liveSignal }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const theme = useChartTheme();

  const load = useCallback(() => {
    duenoApi.get("/dueno/ejecutivo").then((r) => { setData(r.data); setError(null); })
      .catch(() => setError("No se pudo cargar el dashboard ejecutivo"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  if (error) return <ErrorState description={error} onRetry={load} testId="ejecutivo-error" />;
  if (!data) return <LoadingState rows={5} testId="ejecutivo-loading" />;

  const { resumen, servicios_por_hora, servicios_por_dia, servicios_por_conductor, km_por_conductor, combustible_por_mes, salud_flota } = data;
  const horasData = servicios_por_hora.filter((h) => h.total > 0);
  const tooltipStyle = {
    backgroundColor: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: 10, fontSize: 12, color: theme.tooltipText,
  };

  return (
    <div className="space-y-6" data-testid="dueno-ejecutivo">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Dashboard ejecutivo</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Visión general de la operación: servicios, kilómetros, combustible y salud de flota.</p>
      </div>

      {/* KPIs (§25) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard icon={ClipboardCheck} label="Servicios de hoy" value={resumen.hoy} tone="good" />
        <KPICard icon={ClipboardCheck} label="Completados (mes)" value={resumen.completados_mes} tone="brand" />
        <KPICard icon={Ban} label="Cancelados (mes)" value={resumen.cancelados_mes} />
        <KPICard icon={Wallet} label="Ingresos (mes)" value={fmtMXN(resumen.ingresos_mes)} tone="brand" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard icon={RouteIcon} label="Km en turnos" value={`${resumen.km_totales} km`} />
        <KPICard icon={Car} label="Flota activa" value={resumen.flota_activa} />
        <KPICard icon={Users} label="Conductores" value={resumen.conductores_activos} />
        <KPICard icon={AlertTriangle} label="Docs vencidos" value={salud_flota.documentos_vencidos}
                 tone={salud_flota.documentos_vencidos > 0 ? "bad" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Servicios por hora (hoy) */}
        <ChartCard title="Servicios por hora (hoy)" empty={horasData.length === 0}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={horasData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 10, fill: theme.axis }} tickFormatter={(h) => `${h}:00`} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: theme.axis }} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${h}:00 h`} cursor={{ fill: "transparent" }} />
              <Bar dataKey="total" name="Servicios" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Servicios por día */}
        <ChartCard title="Servicios por día" hint="Últimos 14 días" empty={servicios_por_dia.every((d) => d.total === 0)}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={servicios_por_dia} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gradDia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: theme.axis }} interval={2} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: theme.axis }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: theme.grid }} />
              <Area type="monotone" dataKey="total" name="Servicios" stroke={BRAND} strokeWidth={2} fill="url(#gradDia)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Servicios por conductor */}
        <ChartCard title="Servicios por conductor (mes)" empty={servicios_por_conductor.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={servicios_por_conductor} layout="vertical" margin={{ top: 0, right: 12, left: 30, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: theme.axis }} />
              <YAxis type="category" dataKey="conductor" width={90} tick={{ fontSize: 10, fill: theme.axis }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "transparent" }} />
              <Bar dataKey="completados" name="Completados" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Combustible por mes */}
        <ChartCard title="Combustible por mes" hint="Gasto total en cargas" empty={combustible_por_mes.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={combustible_por_mes} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: theme.axis }} />
              <YAxis tick={{ fontSize: 10, fill: theme.axis }} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMXN(v)} cursor={{ fill: "transparent" }} />
              <Bar dataKey="total" name="Gasto" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

export default Ejecutivo;
