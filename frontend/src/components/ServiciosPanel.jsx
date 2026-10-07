import { useEffect, useState, useCallback } from "react";
import { termApi } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { semaforoServiciosStyle } from "@/lib/taxiIcon";
import { cn, metodoPago } from "@/lib/utils";
import { Button } from "@/components/Button";
import { toast } from "sonner";
import {
  MapPin, Flag, User, Wallet, Navigation as NavIcon, ClipboardList,
  Clock, Ban, Loader2, Check, Car, Layers, Phone, DollarSign,
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

function fmtHora(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "—";
  }
}

// Tarjeta de servicio profesional del dispatcher con hora en esquina e información ampliada.
function ServicioCard({ s, onDespachar, onAsignar, onCancelar, despachando, asignando, tiposVehiculo, operadoresMap = {} }) {
  const tipoPreferido = s.tipo_vehiculo_preferido_id ? tiposVehiculo?.[s.tipo_vehiculo_preferido_id] : null;
  const tsCreacion = s.timestamp_creacion || s.creado_en;
  const horaCreacion = fmtHora(tsCreacion);
  const horaFin = s.timestamp_fin || s.completado_en ? fmtHora(s.timestamp_fin || s.completado_en) : null;
  const opInfo = s.operador_asignado_id ? operadoresMap[s.operador_asignado_id] : null;
  const nombreChofer = s.operador_nombre || opInfo?.nombre || null;
  const unidadEcon = s.operador_placa || opInfo?.vehiculo?.numero_economico || opInfo?.placa || null;

  return (
    <div
      data-testid={`servicio-card-${s.id}`}
      className="animate-slide-up rounded-xl border border-border bg-card/80 p-3.5 transition-colors hover:border-brand/40 shadow-sm"
    >
      {/* Cabecera: Folio + Estado a la izquierda | Hora del servicio en la esquina derecha */}
      <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 font-mono mono-num text-[11px] font-extrabold text-foreground/90">
            <ClipboardList className="h-3.5 w-3.5 text-brand-bright" />
            #{String(s.numero || s.id).slice(-6).toUpperCase()}
          </span>
          <ServicioBadge estado={s.estado} />
        </div>

        {/* Hora de servicio destacada en la esquina superior derecha */}
        <div
          data-testid={`servicio-hora-${s.id}`}
          className="flex flex-col items-end shrink-0"
          title={`Creado: ${tsCreacion || ""}`}
        >
          <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 font-mono mono-num text-xs font-extrabold text-white">
            <Clock className="h-3 w-3 text-brand-bright" />
            {horaCreacion}
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground">
            {timeAgo(tsCreacion)}
            {horaFin ? ` · Fin ${horaFin}` : ""}
          </span>
        </div>
      </div>

      {/* Origen y Destino */}
      <div className="mt-2.5 space-y-1.5 text-xs sm:text-sm">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <MapPin className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 block leading-none mb-0.5">Origen</span>
            <span className="font-semibold text-foreground break-words">{s.origen?.texto || s.origen_texto || "—"}</span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rose-500/15 text-rose-400">
            <Flag className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400/80 block leading-none mb-0.5">Destino</span>
            <span className="text-foreground/90 break-words">{s.destino?.texto || s.destino_texto || "A indicaciones del pasajero"}</span>
          </div>
        </div>
      </div>

      {/* Bloque de información enriquecida: Cliente, Teléfono, Unidad/Chofer y Pago */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-lg border border-white/[0.06] bg-black/25 p-2 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span className="truncate font-semibold text-foreground" title={s.cliente_nombre || "Cliente general"}>
            {s.cliente_nombre || "Cliente general"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 justify-end">
          <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-mono mono-num truncate text-muted-foreground">
            {s.cliente_telefono || "Sin tel."}
          </span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 pt-1 border-t border-white/[0.05]">
          <Car className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          {nombreChofer || unidadEcon ? (
            <span className="truncate text-foreground/90 font-medium">
              {unidadEcon ? <strong className="font-mono text-amber-300">#{unidadEcon}</strong> : null}{" "}
              {nombreChofer || ""}
            </span>
          ) : (
            <span className="italic text-muted-foreground">Sin unidad asignada</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 justify-end pt-1 border-t border-white/[0.05]">
          {s.costo != null && Number(s.costo) > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-mono mono-num font-bold text-emerald-400">
              <DollarSign className="h-3 w-3" />
              {Number(s.costo).toFixed(0)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Wallet className="h-3 w-3" />
            {metodoPago(s.metodo_pago || "efectivo")}
          </span>
        </div>
      </div>

      {tipoPreferido && (
        <div className="mt-2 flex items-center gap-1 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 font-semibold text-foreground/80">
            <Layers className="h-3 w-3" /> Prefiere {tipoPreferido}
          </span>
        </div>
      )}

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
    </div>
  );
}

// Panel de servicios del dispatcher: pestañas + contadores + despacho.
// Reutilizado por el Dispatcher (tray) y por el menú de Terminal.
export function ServiciosPanel({ reloadSignal, variant = "panel", filterOperadorId = null, operadoresMap = {} }) {
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
  const conteoPorOp = {};
  (servicios || []).forEach((s) => {
    contadores[s.estado] = (contadores[s.estado] || 0) + 1;
    if (s.operador_asignado_id && s.estado !== "cancelado") {
      conteoPorOp[s.operador_asignado_id] = (conteoPorOp[s.operador_asignado_id] || 0) + 1;
    }
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
          Todos ({(servicios || []).length})
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
          operadoresMap={operadoresMap}
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
                {cands.map((c) => {
                  const svHoy = conteoPorOp[c.id] ?? c.servicios_hoy ?? 0;
                  const sem = semaforoServiciosStyle(svHoy);
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-lg bg-card/80 px-2.5 py-2 text-xs text-foreground/90">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{c.nombre}</span>
                        <span className="shrink-0 text-muted-foreground">· {c.vehiculo?.numero_economico || c.placa}</span>
                        <span
                          style={{ background: sem.bg, color: sem.text, borderColor: sem.border }}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-black leading-none shadow-sm"
                          title={`Servicios realizados hoy: ${sem.count}`}
                        >
                          {sem.count} hoy
                        </span>
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
