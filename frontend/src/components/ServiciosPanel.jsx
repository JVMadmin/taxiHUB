import { useEffect, useState, useCallback } from "react";
import { termApi } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn, metodoPago } from "@/lib/utils";
import { Button } from "@/components/Button";
import { toast } from "sonner";
import {
  MapPin, Flag, User, Wallet, Navigation as NavIcon, ClipboardList,
  Clock, Ban, Loader2, Check, Car, Layers,
} from "lucide-react";
import { ServicioBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";

const TABS = ["pendiente", "ofrecido", "asignado", "en_curso", "completado", "cancelado", "vencido"];

const TAB_LABEL = {
  pendiente: "Pendiente",
  ofrecido: "Ofertado",
  asignado: "Asignado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
  vencido: "Vencido",
};

// Tarjeta de servicio profesional del dispatcher (Fase 9B/10).
function ServicioCard({ s, onDespachar, onAsignar, onCancelar, despachando, asignando, tiposVehiculo }) {
  const tipoPreferido = s.tipo_vehiculo_preferido_id ? tiposVehiculo?.[s.tipo_vehiculo_preferido_id] : null;
  return (
    <div
      data-testid={`servicio-card-${s.id}`}
      className="animate-slide-up rounded-xl border border-border bg-card/70 p-3 transition-colors hover:border-border"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono mono-num text-[11px] font-bold text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          #{String(s.numero || s.id).slice(-6).toUpperCase()}
        </div>
        <ServicioBadge estado={s.estado} />
      </div>

      <div className="mt-2.5 space-y-1.5 text-sm">
        <div className="flex items-start gap-2">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <MapPin className="h-3 w-3" />
          </span>
          <span className="font-medium text-foreground">{s.origen?.texto || s.origen_texto || "—"}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-400">
            <Flag className="h-3 w-3" />
          </span>
          <span className="text-foreground/85">{s.destino?.texto || s.destino_texto || "—"}</span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(s.cliente_nombre || s.cliente_telefono) && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {s.cliente_nombre || s.cliente_telefono}
          </span>
        )}
        {s.metodo_pago && (
          <span className="inline-flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            {metodoPago(s.metodo_pago)}
          </span>
        )}
        {s.operador_nombre && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Car className="h-3 w-3" />
            {s.operador_nombre}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(s.timestamp_creacion)}
        </span>
        {tipoPreferido && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/80">
            <Layers className="h-3 w-3" /> Prefiere {tipoPreferido}
          </span>
        )}
      </div>

      {(s.estado === "pendiente" || s.estado === "ofrecido") && (
        <div className="mt-3 flex items-center gap-2 border-t border-border/80 pt-2.5">
          <Button
            data-testid={`despachar-${s.id}`}
            size="sm"
            loading={despachando === s.id}
            onClick={() => onDespachar(s.id)}
            className="flex-1"
          >
            {despachando === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <NavIcon className="h-3.5 w-3.5" />}
            {despachando === s.id ? "Despachando…" : "Despachar"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onCancelar(s.id)}
            className="text-destructive hover:bg-destructive/10"
          >
            <Ban className="mr-1 h-3.5 w-3.5" /> Cancelar
          </Button>
        </div>
      )}

      {s.estado === "asignado" && s.operador_nombre && (
        <div className="mt-3 rounded-lg border border-border bg-card/70 px-2.5 py-1.5 text-xs text-muted-foreground">
          Asignado a <span className="font-semibold text-foreground/90">{s.operador_nombre}</span>
          {s.operador_placa ? ` · ${s.operador_placa}` : ""}
        </div>
      )}
    </div>
  );
}

// Panel de servicios del dispatcher: pestañas + contadores + despacho.
// Reutilizado por el Dispatcher (tray) y por el menú de Terminal.
export function ServiciosPanel({ reloadSignal, variant = "panel", filterOperadorId = null }) {
  const [servicios, setServicios] = useState(null); // null = cargando
  const [tab, setTab] = useState("todos");
  const [candidatos, setCandidatos] = useState({});
  const [despachando, setDespachando] = useState(null);
  const [asignando, setAsignando] = useState(null);
  const [tiposVehiculo, setTiposVehiculo] = useState({});

  const load = useCallback(() => {
    termApi.get("/servicios/hoy").then((r) => setServicios(r.data)).catch(() => setServicios([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    termApi.get("/tipos-vehiculo").then((r) => {
      setTiposVehiculo(Object.fromEntries(r.data.map((t) => [t.id, t.nombre])));
    }).catch(() => {});
  }, []);
  useEffect(() => { if (reloadSignal) load(); }, [reloadSignal, load]);
  useEffect(() => { setTab("todos"); }, [filterOperadorId]);

  const contadores = {};
  (servicios || []).forEach((s) => {
    contadores[s.estado] = (contadores[s.estado] || 0) + 1;
  });

  const filtradosPorTaxi = filterOperadorId
    ? (servicios || []).filter((s) => s.operador_asignado_id === filterOperadorId)
    : null;

  const visibles = filtradosPorTaxi !== null
    ? filtradosPorTaxi
    : tab === "todos"
      ? (servicios || [])
      : (servicios || []).filter((s) => s.estado === tab);

  const despachar = async (sid) => {
    setDespachando(sid);
    try {
      const { data } = await termApi.post("/dispatch/offer", { servicio_id: sid, num_opciones: 8 });
      setCandidatos((c) => ({ ...c, [sid]: data.candidatos || [] }));
      setTab("ofrecido");
      toast.success(`Oferta enviada a ${(data.candidatos || []).length} taxis`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo despachar");
    } finally { setDespachando(null); }
  };

  const asignar = async (sid, operador_id) => {
    setAsignando(operador_id);
    try {
      await termApi.post(`/servicios/${sid}/asignar`, { operador_id });
      toast.success("Servicio asignado manualmente");
      setCandidatos((c) => ({ ...c, [sid]: undefined }));
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo asignar");
    } finally { setAsignando(null); }
  };

  const cancelar = async (sid) => {
    await termApi.post(`/servicios/${sid}/cancelar`);
    toast.success("Servicio cancelado");
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          data-testid="serv-tab-todos"
          onClick={() => setTab("todos")}
          className={cn("chip", tab === "todos" && "chip-active")}
        >
          Todos
        </button>
        {TABS.map((e) => (
          <button
            key={e}
            data-testid={`serv-tab-${e}`}
            onClick={() => setTab(e)}
            className={cn("chip", tab === e && "chip-active")}
          >
            {TAB_LABEL[e]}
            {contadores[e] ? <span className="text-muted-foreground">({contadores[e]})</span> : null}
          </button>
        ))}
      </div>

      {servicios === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[92px] rounded-xl border border-border/60">
              <div className="th-skeleton h-full" />
            </div>
          ))}
        </div>
      )}

      {servicios !== null && visibles.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={tab === "todos" ? "No hay servicios registrados" : `Sin servicios ${TAB_LABEL[tab]?.toLowerCase()}`}
          description="Los nuevos servicios aparecerán aquí en tiempo real."
        />
      )}

      {visibles.map((s) => (
        <ServicioCard
          key={s.id}
          s={s}
          despachando={despachando}
          asignando={asignando}
          onDespachar={despachar}
          onAsignar={asignar}
          onCancelar={cancelar}
          tiposVehiculo={tiposVehiculo}
        />
      ))}

      {candidatos && Object.entries(candidatos).some(([, v]) => v && v.length > 0) && (
        <div className="space-y-2">
          {Object.entries(candidatos).filter(([, v]) => v && v.length > 0).map(([sid, cands]) => (
            <div key={sid} data-testid={`candidatos-${sid}`} className="rounded-xl border border-brand/30 bg-brand/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-bright">
                <Check className="h-3.5 w-3.5" /> Taxis más cercanos
              </div>
              <div className="space-y-1.5">
                {cands.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-card/80 px-2.5 py-2 text-xs text-foreground/90">
                    <div className="flex min-w-0 items-center gap-2">
                      <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{c.nombre}</span>
                      <span className="shrink-0 text-muted-foreground">· {c.vehiculo?.numero_economico || c.placa}</span>
                      <span className="shrink-0 font-mono mono-num text-[11px] text-brand-bright">
                        {c.distancia_km < 1 ? `${Math.round(c.distancia_km * 1000)} m` : `${c.distancia_km.toFixed(1)} km`}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      loading={asignando === c.id}
                      onClick={() => asignar(sid, c.id)}
                      className="px-2.5 text-[11px]"
                    >
                      {asignando === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Asignar"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
