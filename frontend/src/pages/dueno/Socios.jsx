import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PALETA, estiloEstado } from "@/design/status";
import { EstadoBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { KPICard } from "@/components/KPICard";
import { Building2, Car, Users, ClipboardCheck, Ban, Wallet, AlertTriangle, FileText } from "lucide-react";

/**
 * Socios (F7) — ficha 360° del socio: flota con estados SSOT, conductores,
 * métricas del mes y alertas documentales. Fuente: GET /dueno/ficha.
 */
export function Socios({ liveSignal }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    duenoApi.get("/dueno/ficha").then((r) => { setData(r.data); setError(null); })
      .catch(() => setError("No se pudo cargar la ficha del socio"));
  }, []);

  useEffect(() => { load(); }, [load, liveSignal]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState label="Cargando ficha…" />;

  const { flota, conductores, mes, alertas } = data;
  const estados = flota.estados;

  return (
    <div className="space-y-4" data-testid="dueno-socios">
      {/* Indicadores del mes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard icon={Car} label="Unidades" value={flota.total} tone="brand" />
        <KPICard icon={ClipboardCheck} label="Servicios del mes" value={mes.servicios_completados} tone="good" />
        <KPICard icon={Ban} label="Cancelados" value={mes.servicios_cancelados} />
        <KPICard icon={Wallet} label={`Ingresos ${mes.clave}`} value={`$${mes.ingresos}`} tone="brand" />
      </div>

      {/* Estados de flota (SSOT §12) */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <Building2 className="h-4 w-4 text-brand-bright" /> Estados de flota
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[["libre", "Disponibles", estados.disponibles], ["ocupado", "Ocupadas", estados.ocupadas],
            ["no_disponible", "Pausadas", estados.pausadas], ["fuera_de_servicio", "Offline", estados.offline],
            ["averiado", "Averiadas", estados.averiadas]].map(([k, label, val]) => (
            <div key={k} className="rounded-xl border border-border bg-surface-2 p-2.5 text-center">
              <div className="mono-num text-xl font-extrabold" style={{ color: colorDeEstado(k) }}>{val}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas documentales */}
      {(alertas.documentos_vencidos > 0 || alertas.documentos_por_vencer > 0) && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300" data-testid="socios-alertas">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {alertas.documentos_vencidos > 0 && <span><b>{alertas.documentos_vencidos}</b> documento(s) vencido(s)</span>}
          {alertas.documentos_vencidos > 0 && alertas.documentos_por_vencer > 0 && <span>·</span>}
          {alertas.documentos_por_vencer > 0 && <span><b>{alertas.documentos_por_vencer}</b> por vencer (30 días)</span>}
        </div>
      )}

      {/* Flota */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <Car className="h-4 w-4 text-brand-bright" /> Flota del socio
        </h3>
        {flota.vehiculos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin unidades asignadas todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="th-table" data-testid="socios-flota-table">
              <thead>
                <tr><th>Unidad</th><th>Vehículo</th><th>Conductor</th><th>Estado</th><th>Últ. mantenimiento</th><th>Documentos</th></tr>
              </thead>
              <tbody>
                {flota.vehiculos.map((v) => (
                  <tr key={v.id}>
                    <td className="font-mono font-bold text-foreground">{v.numero_economico}</td>
                    <td className="text-muted-foreground">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</td>
                    <td>{v.conductor?.nombre || <span className="text-muted-foreground">sin asignar</span>}</td>
                    <td><EstadoBadge estado={v.estado} /></td>
                    <td className="text-xs text-muted-foreground">
                      {v.ultimo_mantenimiento ? `${v.ultimo_mantenimiento.tipo} · ${timeAgo(v.ultimo_mantenimiento.realizado_en)}` : "—"}
                    </td>
                    <td className="text-xs text-muted-foreground">{v.documentos.length || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Conductores */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-brand-bright" /> Conductores
        </h3>
        {conductores.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin conductores asociados.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="socios-conductores">
            {conductores.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-bright">
                  {(c.nombre || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{c.nombre}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {c.vehiculo ? `Unidad ${c.vehiculo}` : "sin unidad"} · {c.telefono || "—"}
                  </div>
                </div>
                <EstadoBadge estado={c.estado} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function colorDeEstado(k) {
  const mapa = { libre: PALETA.success, ocupado: PALETA.danger, no_disponible: PALETA.warning,
                 fuera_de_servicio: PALETA.offline, averiado: PALETA.purple };
  return mapa[k] || PALETA.offline;
}

export default Socios;
