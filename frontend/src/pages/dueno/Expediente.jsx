import { useCallback, useEffect, useState } from "react";
import { duenoApi, BACKEND_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PALETA, ESTADOS_DOCUMENTO } from "@/design/status";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { ArrowLeft, AlertTriangle, FileText, User, Phone, Car, ClipboardCheck, Clock } from "lucide-react";

const ESTILO_DOC = {
  vigente: { color: PALETA.success, icono: "✓" },
  por_vencer: { color: PALETA.warning, icono: "!" },
  vencido: { color: PALETA.danger, icono: "✕" },
  faltante: { color: PALETA.offline, icono: "—" },
};

const NOMBRE_DOC = { licencia: "Licencia", ine: "INE", seguro: "Seguro" };

/**
 * Expediente (F8) — ficha profesional del conductor: foto, datos, unidad,
 * documentación con estados de vigencia y alertas.
 * `api`/`basePath` parametrizables: Dueño usa duenoApi+/dueno (lectura+escritura
 * futura); Terminal usa termApi+/terminal (solo lectura, F7 premium).
 */
export function Expediente({ conductorId, onBack, liveSignal, api = duenoApi, basePath = "/dueno" }) {
  const [ex, setEx] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.get(`${basePath}/conductores/${conductorId}`)
      .then((r) => { setEx(r.data); setError(null); })
      .catch(() => setError("No se pudo cargar el expediente"));
  }, [conductorId, api, basePath]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  if (error) return <ErrorState description={error} onRetry={load} testId="expediente-error" />;
  if (!ex) return <LoadingState rows={4} testId="expediente-loading" />;

  const { conductor, unidad, documentos, alertas } = ex;
  const tieneAlertas = alertas.vencidos > 0 || alertas.por_vencer > 0 || alertas.faltantes.length > 0;

  return (
    <div className="space-y-4" data-testid="dueno-expediente">
      <button
        data-testid="expediente-volver"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Conductores
      </button>

      {/* Cabecera: foto + identidad */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        {conductor.foto_url ? (
          <img src={`${BACKEND_URL}${conductor.foto_url}`} alt={conductor.nombre}
               className="h-16 w-16 shrink-0 rounded-2xl border border-border object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand/15">
            <User className="h-7 w-7 text-brand-bright" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-foreground" data-testid="expediente-nombre">{conductor.nombre}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {conductor.telefono || "—"}</span>
            {unidad && (
              <span className="inline-flex items-center gap-1">
                <Car className="h-3 w-3" /> Unidad {unidad.numero_economico}
                {unidad.marca && ` · ${[unidad.marca, unidad.modelo].filter(Boolean).join(" ")}`}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3" /> {ex.servicios_completados} servicios este mes
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {ex.turno_activo ? "En turno" : "Fuera de turno"}
            </span>
          </div>
        </div>
      </div>

      {/* Alertas (§20) */}
      {tieneAlertas && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300" data-testid="expediente-alertas">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {alertas.vencidos > 0 && <span><b>{alertas.vencidos}</b> vencido(s)</span>}
          {alertas.por_vencer > 0 && <span><b>{alertas.por_vencer}</b> por vencer</span>}
          {alertas.faltantes.length > 0 && (
            <span>faltan: {alertas.faltantes.map((f) => NOMBRE_DOC[f] || f).join(", ")}</span>
          )}
        </div>
      )}

      {/* Documentación (§20): estados Vigente/Próximo a vencer/Vencido */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <FileText className="h-4 w-4 text-brand-bright" /> Documentación
        </h3>
        <div className="grid gap-2 sm:grid-cols-3" data-testid="expediente-documentos">
          {documentos.map((d) => {
            const estilo = ESTILO_DOC[d.estado] || ESTILO_DOC.faltante;
            return (
              <div key={d.tipo} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{NOMBRE_DOC[d.tipo] || d.tipo}</span>
                  <span
                    data-testid={`doc-estado-${d.tipo}`}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ color: estilo.color, background: `${estilo.color}1f`, border: `1px solid ${estilo.color}55` }}
                  >
                    {d.estado === "vigente" ? "Vigente" : d.estado === "por_vencer" ? "Por vencer" : d.estado === "vencido" ? "Vencido" : "Sin cargar"}
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {d.vence_en ? `Vence: ${d.vence_en}` : "Sin registro"}
                  {d.numero ? ` · ${d.numero}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Expediente;
