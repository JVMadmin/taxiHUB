import { useCallback, useEffect, useState } from "react";
import { termApi, BACKEND_URL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PALETA } from "@/design/status";
import { EstadoBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { KPICard } from "@/components/KPICard";
import { Expediente } from "@/pages/dueno/Expediente";
import {
  User, Users, Building2, Car, Wrench, Fuel, ClipboardCheck, Ban, AlertTriangle, ChevronRight, FileText,
} from "@/design/icons";

/**
 * Paneles de CONSULTA de la Terminal (F7/F8/F13/F16 premium).
 * La operadora consulta choferes, socios, mantenimiento, combustible y el
 * dashboard del sitio — SOLO LECTURA (§27/§39: sin botones de escritura).
 * Todos contra /api/terminal/*.
 */

/* ---------------- Choferes → Expediente ---------------- */
export function ChoferesPanel({ expedienteId, setExpedienteId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    termApi.get("/terminal/conductores").then((r) => setItems(r.data)).catch(() => setError("No se pudieron cargar los choferes"));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (expedienteId) {
    return <Expediente conductorId={expedienteId} onBack={() => setExpedienteId(null)} api={termApi} basePath="/terminal" />;
  }
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!items) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2" data-testid="terminal-choferes">
      {items.map((c) => (
        <button
          key={c.id}
          data-testid={`terminal-chofer-${c.id}`}
          onClick={() => setExpedienteId(c.id)}
          className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 text-left transition-colors hover:border-brand/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-bright">
            {(c.nombre || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-foreground">{c.nombre}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {c.vehiculo ? `Unidad ${c.vehiculo.numero_economico}` : "sin unidad"} · {c.telefono || "—"}
            </div>
          </div>
          <EstadoBadge estado={c.estado} />
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand-bright" />
        </button>
      ))}
      {items.length === 0 && <EmptyState icon={Users} title="Sin choferes" description="Registra operadores desde la sección Operadores." />}
    </div>
  );
}

/* ---------------- Socios (consulta) ---------------- */
export function SociosPanel({ expedienteId, setExpedienteId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    termApi.get("/terminal/socios").then((r) => setItems(r.data)).catch(() => setError("No se pudieron cargar los socios"));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!items) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2" data-testid="terminal-socios">
      {items.map((s) => (
        <button
          key={s.id}
          data-testid={`terminal-socio-${s.id}`}
          onClick={async () => {
            const { data } = await termApi.get(`/terminal/socios/${s.id}`);
            setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, detalle: data } : x)));
          }}
          className="w-full rounded-xl border border-border bg-surface-2 p-3 text-left transition-colors hover:border-brand/40"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15">
                <Building2 className="h-4 w-4 text-brand-bright" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">{s.nombre}</div>
                <div className="text-[11px] text-muted-foreground">{s.unidades} unidad(es) · {s.usuario}</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          {s.detalle && (
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              {s.detalle.vehiculos.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-mono font-bold text-foreground">{v.numero_economico}</span>
                  <span>{v.conductor || "sin conductor"}</span>
                </div>
              ))}
              {s.detalle.vehiculos.length === 0 && <div className="text-[11px] text-muted-foreground">Sin unidades.</div>}
            </div>
          )}
        </button>
      ))}
      {items.length === 0 && <EmptyState icon={Building2} title="Sin socios" description="Los socios registrados aparecerán aquí." />}
    </div>
  );
}

/* ---------------- Mantenimiento (consulta) ---------------- */
export function MantenimientoPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    termApi.get("/terminal/mantenimiento").then((r) => setData(r.data)).catch(() => setError("No se pudo cargar mantenimiento"));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2" data-testid="terminal-mantenimiento">
      <p className="text-[11px] text-muted-foreground">Solo consulta. El registro de mantenimientos lo realiza el socio.</p>
      {data.vehiculos.map((v) => (
        <div key={v.vehiculo_id} className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold text-foreground">{v.numero_economico}</span>
            <span className="mono-num text-xs text-muted-foreground">{v.odometro_km != null ? `${v.odometro_km.toLocaleString("es-MX")} km` : "sin odómetro"}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {v.ultimo ? `Último: ${v.ultimo.tipo} · ${timeAgo(v.ultimo.realizado_en)}${v.ultimo.costo ? ` · ${fmtMoney(v.ultimo.costo)}` : ""}` : "Sin mantenimientos registrados"}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Combustible (consulta §27) ---------------- */
export function CombustiblePanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    termApi.get("/terminal/combustible").then((r) => setData(r.data)).catch(() => setError("No se pudo cargar combustible"));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2" data-testid="terminal-combustible">
      <p className="text-[11px] text-muted-foreground">Solo consulta. Las cargas las registran el taxista (y el socio si lo requiere).</p>
      {data.cargas.map((c) => (
        <div key={c.id} className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{c.unidad}</span>
            <span className="mono-num text-sm font-bold text-brand-bright">{fmtMoney(c.costo)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {c.fecha} · {c.litros} L · {c.odometro_km?.toLocaleString("es-MX")} km · por {c.registro_por}
            {c.estacion ? ` · ${c.estacion}` : ""}
          </div>
        </div>
      ))}
      {data.cargas.length === 0 && <EmptyState icon={Fuel} title="Sin cargas" description="Las cargas de combustible aparecerán aquí." />}
    </div>
  );
}

/* ---------------- Dashboard del sitio (F16) ---------------- */
export function DashboardPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    termApi.get("/terminal/dashboard").then((r) => { setData(r.data); }).catch(() => setError("No se pudo cargar el dashboard"));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return <LoadingState rows={4} />;
  const e = data.estados;
  return (
    <div className="space-y-4" data-testid="terminal-dashboard">
      <div className="grid grid-cols-2 gap-3">
        <KPICard icon={ClipboardCheck} label="Servicios hoy" value={data.servicios_hoy} tone="good" />
        <KPICard icon={ClipboardCheck} label="Activos ahora" value={data.servicios_activos} tone="brand" />
        <KPICard icon={ClipboardCheck} label="Completados (mes)" value={data.completados_mes} tone="brand" />
        <KPICard icon={Ban} label="Cancelados (mes)" value={data.cancelados_mes} />
        <KPICard icon={Car} label="Unidades" value={data.unidades} />
        <KPICard icon={Users} label="Conductores" value={data.conductores} />
        <KPICard icon={Building2} label="Socios" value={data.socios} />
        <KPICard icon={FileText} label="Docs del sitio" value="—" />
      </div>
      <div className="rounded-xl border border-border bg-surface-2 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Estados de flota</div>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {[["libre", "Disponibles", PALETA.success], ["ocupado", "Ocupados", PALETA.danger],
            ["no_disponible", "Pausados", PALETA.warning], ["fuera_de_servicio", "Offline", PALETA.offline],
            ["averiado", "Averiados", PALETA.purple]].map(([k, l, c]) => (
            <div key={k} className="rounded-lg bg-card/70 p-1.5">
              <div className="mono-num text-lg font-extrabold" style={{ color: c }}>{e[k] ?? 0}</div>
              <div className="text-[9px] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString("es-MX")}`;
}
