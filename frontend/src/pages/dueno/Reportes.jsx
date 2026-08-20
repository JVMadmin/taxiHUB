import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { duenoApi } from "@/lib/api";
import { useMode } from "@/hooks/useMode";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3, CheckCircle2, XCircle } from "lucide-react";

// Paleta categórica de orden fijo (nunca se reutiliza el rojo/verde de estado
// aquí: esos quedan reservados para completados/cancelados). Un solo hue
// (marca) para las magnitudes (servicios/ingresos por día).
const CATEGORICAL = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4"];
const BRAND = "#10b981";

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

function ChartCard({ title, hint, children, empty }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-bold text-foreground">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {empty ? (
        <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">Sin datos en este período</div>
      ) : (
        children
      )}
    </div>
  );
}

const fmtDiaCorto = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
};

export function Reportes() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const theme = useChartTheme();

  const load = useCallback(() => {
    setError(null);
    duenoApi.get("/dueno/reportes").then((r) => setData(r.data)).catch(() => setError("No se pudieron cargar los reportes"));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return <LoadingState rows={3} />;

  const totalTerminados = data.completados + data.cancelados;
  const pctCompletados = totalTerminados ? Math.round((data.completados / totalTerminados) * 100) : 0;

  const tooltipStyle = {
    background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: 10, fontSize: 12, color: theme.tooltipText,
  };
  const axisTick = { fill: theme.axis, fontSize: 11 };

  return (
    <div className="space-y-4" data-testid="dueno-reportes">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Reportes</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Últimos 30 días de operación de tu flota.</p>
      </div>

      {data.por_dia.length === 0 ? (
        <EmptyState icon={BarChart3} title="Sin actividad en los últimos 30 días" description="Los reportes aparecerán cuando tu flota registre servicios." />
      ) : (
        <>
          {/* Completados vs cancelados: colores de estado reservados, nunca en la paleta categórica */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-foreground">Completados vs. cancelados</div>
              <div className="mono-num text-xs text-muted-foreground">{pctCompletados}% de finalización</div>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-emerald-500" style={{ width: `${pctCompletados}%` }} />
              <div className="h-full w-0.5 bg-card" />
              <div className="h-full flex-1 bg-red-500/70" />
            </div>
            <div className="mt-3 flex gap-6 text-sm">
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> <span className="mono-num font-bold text-foreground">{data.completados}</span> <span className="text-muted-foreground">completados</span></div>
              <div className="flex items-center gap-1.5"><XCircle className="h-4 w-4 text-red-400" /> <span className="mono-num font-bold text-foreground">{data.cancelados}</span> <span className="text-muted-foreground">cancelados</span></div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Servicios por día" hint="Total de solicitudes recibidas">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.por_dia} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="servFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="3 4" />
                  <XAxis dataKey="fecha" tickFormatter={fmtDiaCorto} tick={axisTick} axisLine={{ stroke: theme.grid }} tickLine={false} minTickGap={24} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDiaCorto} />
                  <Area type="monotone" dataKey="servicios" name="Servicios" stroke={BRAND} strokeWidth={2} fill="url(#servFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Ingresos por día" hint="Suma de servicios completados">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.ingresos_por_dia} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="3 4" />
                  <XAxis dataKey="fecha" tickFormatter={fmtDiaCorto} tick={axisTick} axisLine={{ stroke: theme.grid }} tickLine={false} minTickGap={24} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDiaCorto} formatter={(v) => [`$${v}`, "Ingresos"]} />
                  <Bar dataKey="ingresos" name="Ingresos" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Servicios por vehículo" hint="Completados en el período" empty={data.por_vehiculo.length === 0}>
              <ResponsiveContainer width="100%" height={Math.max(140, data.por_vehiculo.slice(0, 6).length * 34)}>
                <BarChart data={data.por_vehiculo.slice(0, 6)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke={theme.grid} strokeDasharray="3 4" />
                  <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="vehiculo" tick={axisTick} axisLine={false} tickLine={false} width={70} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="servicios" name="Servicios" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {data.por_vehiculo.slice(0, 6).map((entry, i) => (
                      <Cell key={entry.vehiculo} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Servicios por conductor" hint="Completados en el período" empty={data.por_conductor.length === 0}>
              <ResponsiveContainer width="100%" height={Math.max(140, data.por_conductor.slice(0, 6).length * 34)}>
                <BarChart data={data.por_conductor.slice(0, 6)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke={theme.grid} strokeDasharray="3 4" />
                  <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="conductor" tick={axisTick} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="servicios" name="Servicios" fill={CATEGORICAL[1]} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

export default Reportes;
