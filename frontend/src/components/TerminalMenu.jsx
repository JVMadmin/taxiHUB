import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { termApi, BACKEND_URL, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn, fileUrl, resolveDriverAvatar } from "@/lib/utils";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  PhoneCall, Users, UserSquare, Package, MessageSquare, Route as RouteIcon,
  X, Plus, Check, Send, ChevronDown, ChevronRight, ClipboardList, DollarSign,
  Trash2, Truck, Search, Pencil, Layers, Camera, EyeOff, Eye, Wrench, MapPin, ShieldCheck, Calendar, Clock, ZoomIn, RotateCcw, Navigation,
} from "lucide-react";
import { ChoferesPanel, SociosPanel, MantenimientoPanel, CombustiblePanel, DashboardPanel } from "@/components/terminal/ConsultaPanels";
import { ServiciosPanel } from "@/components/ServiciosPanel";
import { WhatsAppPanel } from "@/components/WhatsAppPanel";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EstadoBadge } from "@/components/StatusBadge";
import { ConfirmAction } from "@/components/ConfirmAction";
import { VehicleImage } from "@/components/VehicleImage";

const SECTIONS = [
  { id: "servicio", label: "Asignar servicio", icon: PhoneCall },
  { id: "servicios", label: "Servicios de hoy", icon: ClipboardList },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "choferes", label: "Choferes (Expediente)", icon: Users },
  { id: "socios", label: "Socios (Expediente)", icon: UserSquare },
  { id: "vehiculos", label: "Vehículos / Flota", icon: Truck },
  { id: "clientes", label: "Clientes", icon: UserSquare },
  { id: "mantenimiento", label: "Mantenimiento", icon: Wrench },
  { id: "combustible", label: "Combustible", icon: DollarSign },
  { id: "reportes", label: "Objetos reportados", icon: Package },
  { id: "rutas", label: "Planificador de Ruta", icon: RouteIcon },
  { id: "colonias", label: "Colonias y Cuadrantes", icon: MapPin },
  { id: "tarifas", label: "Creador de Tarifas", icon: DollarSign },
  { id: "dashboard", label: "Dashboard", icon: ClipboardList },
];

// Grupos por responsabilidad: Operar (servicios + WhatsApp), Flota (vehículos + choferes) y Control
const SECTION_GROUPS = [
  { label: "Operar", ids: ["servicio", "servicios", "whatsapp"] },
  { label: "Flota", ids: ["vehiculos", "choferes", "socios"] },
  { label: "Control", ids: ["clientes", "reportes", "rutas", "colonias", "tarifas", "mantenimiento", "combustible", "dashboard"] },
];

export const TerminalMenu = memo(function TerminalMenu({
  active: activeProp,
  onActiveChange,
  operadores,
  operadoresLibres = [],
  serviciosHoyPorOperador = {},
  rutas,
  onRutasChanged,
  colonias = [],
  onColoniasChanged,
  drawingMode = null,
  onStartDrawing,
  onStopDrawing,
  drawnPoints = [],
  routeWaypoints = [],
  routingSegmentLoading = false,
  onUndoDrawnPoint,
  onClearDrawnPoints,
  onDataChanged,
  onOpenServicio,
  onMarkWaLocation,
  onVerWaMapa,
  onAssigned,
  choferExpedienteId,
  liveMessage,
  liveReporte,
  servicioSignal,
}) {
  const [internalActive, setInternalActive] = useState(null);
  const active = activeProp !== undefined ? activeProp : internalActive;
  const setActive = onActiveChange !== undefined ? onActiveChange : setInternalActive;
  const [choferExp, setChoferExp] = useState(null);
  useEffect(() => {
    if (choferExpedienteId) setChoferExp(choferExpedienteId);
  }, [choferExpedienteId]);

  // WhatsApp, Expedientes de Choferes y Socios, y Objetos Reportados usan el ancho amplio (escalado a 85% ref)
  const isWidePanel = active === "whatsapp" || active === "choferes" || active === "socios" || active === "reportes";
  const panelWidth = isWidePanel ? 680 : 395;

  const open = (id) => {
    if (id === "servicio") { onOpenServicio(); return; }
    setActive((a) => (a === id ? null : id));
  };

  return (
    <>
      {/* Rail de iconos agrupado por responsabilidad (derecha, escritorio, posicionado debajo de la barra superior) */}
      <div
        data-testid="terminal-menu-rail"
        className="surface-ui no-scrollbar absolute top-[118px] right-3 z-[600] hidden max-h-[calc(100vh-140px)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#17191E]/95 shadow-2xl backdrop-blur-md transition-all duration-300 ease-motion lg:block sm:right-3.5"
        style={{ right: active ? `calc(min(92vw, ${panelWidth}px) + 0.75rem)` : undefined }}
      >
        <div className="flex flex-col gap-1 p-1.5">
          {SECTION_GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col items-center gap-1 border-t border-white/[0.06] py-1 first:border-0 first:pt-0">
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#9CA0AA]/80">{g.label}</span>
              {g.ids.map((id) => {
                const s = SECTIONS.find((x) => x.id === id);
                if (!s) return null;
                return (
                  <button
                    key={id}
                    data-testid={`menu-${id}`}
                    onClick={() => open(id)}
                    title={s.label}
                    aria-label={s.label}
                    className={cn(
                      "th-3d flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                      active === id
                        ? "bg-[#4F5DFF] text-white shadow-[0_2px_10px_rgba(79,93,255,0.35)]"
                        : "text-foreground/80 hover:bg-white/[0.08]"
                    )}
                  >
                    <s.icon className="th-icon-3d h-4 w-4" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Panel deslizable — sin provocar barra deslizable inferior cuando está cerrado */}
      <div
        className={cn(
          "surface-ui absolute right-0 top-0 z-[590] h-full max-w-[92vw] transform border-l border-white/[0.06] bg-[#111318] transition-all duration-300 ease-motion",
          active ? "translate-x-0 pointer-events-auto visible" : "translate-x-full pointer-events-none invisible"
        )}
        style={{ width: panelWidth }}
      >
        {active && (
          <div data-testid={`panel-${active}`} className="flex h-full animate-fade-in flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#17191E] px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4F5DFF]/15 text-[#4F5DFF]">
                  {(() => { const I = SECTIONS.find((s) => s.id === active)?.icon; return I ? <I className="h-4 w-4" /> : null; })()}
                </span>
                {SECTIONS.find((s) => s.id === active)?.label}
              </h2>
              <button
                data-testid="panel-close"
                onClick={() => {
                  if (drawingMode) onStopDrawing?.();
                  setActive(null);
                }}
                aria-label="Cerrar panel"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {active !== "whatsapp" && (
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-3.5">
                {active === "servicios" && <ServiciosPanel reloadSignal={servicioSignal} operadoresMap={operadores} />}
                {active === "vehiculos" && <VehiculosPanel operadores={operadores} />}
                {active === "tipos-vehiculo" && <TiposVehiculoPanel />}
                {active === "operadores" && <OperadoresPanel operadores={operadores} rutas={rutas} onChanged={onDataChanged} />}
                {active === "clientes" && <ClientesPanel />}
                {active === "choferes" && <ChoferesPanel expedienteId={choferExp} setExpedienteId={setChoferExp} rutas={rutas} onDataChanged={onDataChanged} />}
                {active === "socios" && <SociosPanel />}
                {active === "mantenimiento" && <MantenimientoPanel />}
                {active === "combustible" && <CombustiblePanel />}
                {active === "dashboard" && <DashboardPanel />}
                {active === "reportes" && <ReportesPanel liveReporte={liveReporte} operadores={operadores} />}
                {active === "chat" && <ChatPanel liveMessage={liveMessage} />}
                {active === "rutas" && (
                  <RutasPanel
                    rutas={rutas}
                    onRutasChanged={onRutasChanged}
                    drawingMode={drawingMode}
                    onStartDrawing={onStartDrawing}
                    onStopDrawing={onStopDrawing}
                    drawnPoints={drawnPoints}
                    routeWaypoints={routeWaypoints}
                    routingSegmentLoading={routingSegmentLoading}
                    onUndoDrawnPoint={onUndoDrawnPoint}
                    onClearDrawnPoints={onClearDrawnPoints}
                  />
                )}
                {active === "colonias" && (
                  <ColoniasPanel
                    colonias={colonias}
                    onColoniasChanged={onColoniasChanged}
                    drawingMode={drawingMode}
                    onStartDrawing={onStartDrawing}
                    onStopDrawing={onStopDrawing}
                    drawnPoints={drawnPoints}
                    onUndoDrawnPoint={onUndoDrawnPoint}
                    onClearDrawnPoints={onClearDrawnPoints}
                  />
                )}
                {active === "tarifas" && <TarifasPanel colonias={colonias} />}
              </div>
            )}
            {/* WhatsApp: chat de altura completa */}
            {active === "whatsapp" && (
              <div className="min-h-0 flex-1 overflow-hidden p-3.5">
                <WhatsAppPanel
                  taxisLibres={operadoresLibres}
                  serviciosHoyPorOperador={serviciosHoyPorOperador}
                  onVerMapa={onVerWaMapa}
                  onCrearServicio={onMarkWaLocation}
                  onAssigned={onAssigned}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
});

/* ---------------- Operadores ---------------- */
function OperadoresPanel({ operadores, rutas, onChanged }) {
  const nombreRuta = (id) => rutas.find((r) => r.id === id)?.nombre || "Taxi libre";
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ nombre: "", telefono: "", placa: "", usuario: "", contrasena: "", ruta_asignada: "libre" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const lista = Object.values(operadores).filter((o) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return o.nombre.toLowerCase().includes(q) || (o.placa || "").toLowerCase().includes(q) || (o.telefono || "").includes(q);
  });

  const crear = async () => {
    if (!f.nombre || !f.usuario || !f.contrasena) { toast.error("Nombre, usuario y contraseña requeridos"); return; }
    try {
      await termApi.post("/operadores", { ...f, ruta_asignada: f.ruta_asignada === "libre" ? null : f.ruta_asignada });
      toast.success("Operador creado");
      setF({ nombre: "", telefono: "", placa: "", usuario: "", contrasena: "", ruta_asignada: "libre" });
      setNuevo(false); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo crear"); }
  };
  return (
    <div className="space-y-3">
      <Button data-testid="nuevo-operador-btn" onClick={() => setNuevo((v) => !v)} className="w-full">
        <Plus className="h-4 w-4" /> Nuevo operador
      </Button>
      {nuevo && (
        <div className="animate-slide-up space-y-2 rounded-xl border border-border bg-surface-2 p-3" data-testid="form-operador">
          <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre" className="input-inset h-8 border-border text-sm text-foreground" data-testid="op-nombre" />
          <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="Teléfono" className="input-inset h-8 border-border text-sm text-foreground" data-testid="op-telefono" />
          <Input value={f.placa} onChange={(e) => set("placa", e.target.value)} placeholder="Placa / Unidad" className="input-inset h-8 border-border text-sm text-foreground" data-testid="op-placa" />
          <Input value={f.usuario} onChange={(e) => set("usuario", e.target.value)} placeholder="Usuario" className="input-inset h-8 border-border text-sm text-foreground" data-testid="op-usuario" />
          <Input type="password" value={f.contrasena} onChange={(e) => set("contrasena", e.target.value)} placeholder="Contraseña" className="input-inset h-8 border-border text-sm text-foreground" data-testid="op-contrasena" />
          <select value={f.ruta_asignada} onChange={(e) => set("ruta_asignada", e.target.value)} className="input-inset h-8 w-full rounded-md border border-border px-2 text-sm text-foreground" data-testid="op-ruta">
            <option value="libre">Taxi libre (sin ruta)</option>
            {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <Button data-testid="op-guardar" onClick={crear} className="w-full">Guardar</Button>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar operador…"
          className="h-8 border-border bg-secondary/70 pl-8 text-xs text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {lista.length === 0 && (
        <EmptyState icon={Users} title="No hay operadores" description="Crea el primer operador con el botón superior." />
      )}
      {lista.map((o) => (
        <div key={o.id} data-testid={`op-row-${o.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
          <div className="relative shrink-0">
            <img
              src={resolveDriverAvatar(o.foto_url, o.id)}
              alt={o.nombre}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/assets/drivers/driver-01.jpg";
              }}
              className="h-9 w-9 rounded-full border border-white/15 object-cover"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background" style={{ background: ESTADO_COLORS[o.estado] }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{o.nombre}</div>
            <div className="truncate text-xs text-muted-foreground">{o.placa} · {nombreRuta(o.ruta_asignada)}</div>
          </div>
          <EstadoBadge estado={o.estado} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Clientes ---------------- */
function ClientesPanel() {
  const [clientes, setClientes] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [historial, setHistorial] = useState({});
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ nombre: "", telefono: "" });

  const load = useCallback(() => {
    setError(null);
    termApi.get("/clientes").then((r) => setClientes(r.data)).catch(() => setError("No se pudo cargar la lista de clientes"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!historial[id]) {
      const { data } = await termApi.get(`/clientes/${id}`);
      setHistorial((h) => ({ ...h, [id]: data.historial_servicios || [] }));
    }
  };
  const crear = async () => {
    if (!f.nombre || !f.telefono) { toast.error("Nombre y teléfono requeridos"); return; }
    await termApi.post("/clientes", f);
    toast.success("Cliente creado");
    setF({ nombre: "", telefono: "" }); setNuevo(false); load();
  };

  return (
    <div className="space-y-2">
      <Button data-testid="nuevo-cliente-btn" onClick={() => setNuevo((v) => !v)} className="w-full">
        <Plus className="h-4 w-4" /> Nuevo cliente
      </Button>
      {nuevo && (
        <div className="animate-slide-up space-y-2 rounded-xl border border-border bg-surface-2 p-3" data-testid="form-cliente">
          <Input value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" className="input-inset h-8 border-border text-sm text-foreground" data-testid="cli-nombre" />
          <Input value={f.telefono} onChange={(e) => setF((p) => ({ ...p, telefono: e.target.value }))} placeholder="Teléfono" className="input-inset h-8 border-border text-sm text-foreground" data-testid="cli-telefono" />
          <Button data-testid="cli-guardar" onClick={crear} className="w-full">Guardar</Button>
        </div>
      )}
      {error && <ErrorState description={error} onRetry={load} />}
      {!error && clientes === null && <LoadingState rows={3} />}
      {!error && clientes !== null && clientes.length === 0 && (
        <EmptyState icon={UserSquare} title="No hay clientes registrados" description="Los clientes se crean al recibir una llamada." />
      )}
      {!error && clientes !== null && clientes.map((c) => (
        <div key={c.id} data-testid={`cliente-row-${c.id}`} className="rounded-xl border border-border bg-surface-2">
          <button onClick={() => toggle(c.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
            {expanded === c.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{c.nombre}</div>
              <div className="truncate text-xs text-muted-foreground">{c.telefono}</div>
            </div>
          </button>
          {expanded === c.id && (
            <div className="border-t border-border px-3 py-2">
              <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Historial de servicios</div>
              {(historial[c.id] || []).length === 0 && <div className="text-xs text-muted-foreground">Sin servicios</div>}
              {(historial[c.id] || []).map((s) => (
                <div key={s.id} className="border-b border-border/60 py-1.5 text-xs text-foreground/85 last:border-0">
                  {s.origen?.texto} → {s.destino?.texto} <span className="text-muted-foreground">· {s.estado}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Vehículos / Flota ---------------- */
const FILTROS_FLOTA = [
  { id: "todos", label: "Todos" },
  { id: "disponibles", label: "Disponibles" },
  { id: "ocupados", label: "Ocupados" },
  { id: "offline", label: "Offline" },
  { id: "averiados", label: "Averiados" },
];

const estadoVehiculo = (v, operadores) => {
  if (v.activo === false || v.estado === "inactivo") return "inactivo";
  const op = operadores[v.operador_conductor_id];
  return op ? op.estado : "sin_conductor";
};

const ESTADO_VEHICULO_LABEL = {
  libre: "Disponible", ocupado: "Ocupado", no_disponible: "Pausado",
  fuera_de_servicio: "Offline", averiado: "Averiado", inactivo: "Inactivo", sin_conductor: "Sin conductor",
};

function VehiculosPanel({ operadores }) {
  const [vehiculos, setVehiculos] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [f, setF] = useState({ numero_economico: "", placa: "", marca: "", modelo: "", color: "", tipo_vehiculo_id: "" });

  const load = useCallback(() => {
    setError(null);
    termApi.get("/vehiculos").then((r) => setVehiculos(r.data)).catch(() => setError("No se pudo cargar la flota"));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { termApi.get("/tipos-vehiculo").then((r) => setTipos(r.data)).catch(() => {}); }, []);

  const crear = async () => {
    if (!f.numero_economico) { toast.error("El número económico es obligatorio"); return; }
    await termApi.post("/vehiculos", {
      ...f, placa: f.placa || null, marca: f.marca || null, modelo: f.modelo || null, color: f.color || null,
      tipo_vehiculo_id: f.tipo_vehiculo_id || null,
    });
    toast.success("Vehículo registrado en la flota");
    setF({ numero_economico: "", placa: "", marca: "", modelo: "", color: "", tipo_vehiculo_id: "" });
    setNuevo(false); load();
  };

  const actualizar = async (id, patch) => { await termApi.put(`/vehiculos/${id}`, patch); toast.success("Vehículo actualizado"); setEditando(null); load(); };
  const eliminar = async (id) => { await termApi.delete(`/vehiculos/${id}`); toast.success("Vehículo eliminado"); load(); };
  const subirFoto = async (id, file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("foto", file);
    try {
      await termApi.post(`/vehiculos/${id}/foto`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Foto actualizada");
      load();
    } catch { toast.error("No se pudo subir la foto"); }
  };

  const visibles = (vehiculos || []).filter((v) => {
    const q = busqueda.trim().toLowerCase();
    const okQ = !q || v.numero_economico.toLowerCase().includes(q) || (v.placa || "").toLowerCase().includes(q) || (v.marca || "").toLowerCase().includes(q);
    if (!okQ) return false;
    if (filtro === "todos") return true;
    const est = estadoVehiculo(v, operadores);
    if (filtro === "offline") return est === "fuera_de_servicio" || est === "inactivo" || est === "sin_conductor";
    return est === filtro.slice(0, -1) || (filtro === "disponibles" && est === "libre") || (filtro === "ocupados" && est === "ocupado") || (filtro === "averiados" && est === "averiado");
  });

  return (
    <div className="space-y-3">
      <Button data-testid="nuevo-vehiculo-btn" onClick={() => setNuevo((v) => !v)} className="w-full">
        <Plus className="h-4 w-4" /> Nuevo vehículo
      </Button>
      {nuevo && (
        <div className="animate-slide-up space-y-2 rounded-xl border border-border bg-surface-2 p-3" data-testid="form-vehiculo">
          <Input value={f.numero_economico} onChange={(e) => setF((p) => ({ ...p, numero_economico: e.target.value }))} placeholder="Número económico (ej. TX-104)" className="input-inset h-8 border-border text-sm text-foreground" data-testid="v-num" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={f.placa} onChange={(e) => setF((p) => ({ ...p, placa: e.target.value }))} placeholder="Placas" className="input-inset h-8 border-border text-sm text-foreground" />
            <Input value={f.color} onChange={(e) => setF((p) => ({ ...p, color: e.target.value }))} placeholder="Color" className="input-inset h-8 border-border text-sm text-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={f.marca} onChange={(e) => setF((p) => ({ ...p, marca: e.target.value }))} placeholder="Marca" className="input-inset h-8 border-border text-sm text-foreground" />
            <Input value={f.modelo} onChange={(e) => setF((p) => ({ ...p, modelo: e.target.value }))} placeholder="Modelo" className="input-inset h-8 border-border text-sm text-foreground" />
          </div>
          <select value={f.tipo_vehiculo_id} onChange={(e) => setF((p) => ({ ...p, tipo_vehiculo_id: e.target.value }))}
            className="input-inset h-8 w-full rounded-md border border-border px-2 text-sm text-foreground" data-testid="v-tipo">
            <option value="">Tipo de vehículo (por defecto: Taxi estándar)</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <Button data-testid="v-guardar" onClick={crear} className="w-full">Guardar</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTROS_FLOTA.map((ft) => (
          <button key={ft.id} data-testid={`flota-filtro-${ft.id}`} onClick={() => setFiltro(ft.id)}
            className={cn("chip", filtro === ft.id && "chip-active")}>
            {ft.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por unidad, placas o marca…"
          className="h-8 border-border bg-secondary/70 pl-8 text-xs text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {error && <ErrorState description={error} onRetry={load} />}
      {!error && vehiculos === null && <LoadingState rows={3} />}
      {!error && vehiculos !== null && visibles.length === 0 && (
        <EmptyState icon={Truck} title="Sin vehículos en este filtro" description="Registra tu flota para verla aquí." />
      )}

      {visibles.map((v) => {
        const est = estadoVehiculo(v, operadores);
        const color = ESTADO_COLORS[est] || "#6b7280";
        const op = operadores[v.operador_conductor_id];
        return (
          <div key={v.id} data-testid={`vehiculo-row-${v.id}`} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-3">
              <VehicleImage vehiculo={v} className="h-12 w-16 shrink-0 rounded-lg border border-border bg-surface-3" imgClassName="p-1" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate font-mono text-sm font-bold text-foreground">{v.numero_economico}</div>
                  <span className="rounded-full border px-1.5 py-px text-[10px] font-bold" style={{ background: `${color}14`, borderColor: `${color}44`, color }}>{ESTADO_VEHICULO_LABEL[est] || est}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {v.tipo_vehiculo?.nombre ? `${v.tipo_vehiculo.nombre} · ` : ""}
                  {[v.marca, v.modelo, v.color].filter(Boolean).join(" ") || "Sin características"}
                  {v.placa ? ` · ${v.placa}` : ""}
                </div>
                <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  {op ? (
                    <>
                      <img
                        src={resolveDriverAvatar(op.foto_url, op.id)}
                        alt={op.nombre}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/assets/drivers/driver-01.jpg";
                        }}
                        className="h-4 w-4 shrink-0 rounded-full object-cover"
                      />
                      <span className="truncate">Conductor: <strong className="text-foreground/90">{op.nombre}</strong></span>
                    </>
                  ) : (
                    <span>Sin conductor asignado</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button data-testid={`vehiculo-edit-${v.id}`} onClick={() => setEditando(editando === v.id ? null : v.id)}
                  aria-label={`Editar ${v.numero_economico}`}
                  className={cn("rounded-lg p-2 transition-colors", editando === v.id ? "bg-brand text-brand-contrast" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
                  <Pencil className="h-4 w-4" />
                </button>
                <ConfirmAction
                  title={`Eliminar ${v.numero_economico}`}
                  description="El vehículo se quitará de la flota. Esta acción no se puede deshacer."
                  confirmLabel="Eliminar"
                  onConfirm={() => eliminar(v.id)}
                  trigger={
                    <button data-testid={`vehiculo-del-${v.id}`} aria-label={`Eliminar ${v.numero_economico}`} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  }
                />
              </div>
            </div>

            {editando === v.id && (
              <div className="mt-3 animate-slide-down space-y-2 border-t border-border pt-3" data-testid={`form-edit-${v.id}`}>
                <div className="grid grid-cols-2 gap-2">
                  <Input defaultValue={v.numero_economico} onBlur={(e) => e.target.value !== v.numero_economico && actualizar(v.id, { numero_economico: e.target.value })} placeholder="Nº económico" className="input-inset h-8 border-border text-sm text-foreground" />
                  <Input defaultValue={v.placa || ""} onBlur={(e) => e.target.value !== (v.placa || "") && actualizar(v.id, { placa: e.target.value || null })} placeholder="Placas" className="input-inset h-8 border-border text-sm text-foreground" />
                  <Input defaultValue={v.marca || ""} onBlur={(e) => e.target.value !== (v.marca || "") && actualizar(v.id, { marca: e.target.value || null })} placeholder="Marca" className="input-inset h-8 border-border text-sm text-foreground" />
                  <Input defaultValue={v.modelo || ""} onBlur={(e) => e.target.value !== (v.modelo || "") && actualizar(v.id, { modelo: e.target.value || null })} placeholder="Modelo" className="input-inset h-8 border-border text-sm text-foreground" />
                </div>
                <select defaultValue={v.tipo_vehiculo_id || ""} onChange={(e) => actualizar(v.id, { tipo_vehiculo_id: e.target.value || null })}
                  className="input-inset h-8 w-full rounded-md border border-border px-2 text-sm text-foreground">
                  <option value="">Sin tipo</option>
                  {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs font-semibold text-foreground hover:bg-secondary">
                  <Camera className="h-3.5 w-3.5" /> Subir foto real del vehículo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => subirFoto(v.id, e.target.files?.[0])} />
                </label>
                <Button size="sm" variant="secondary" onClick={() => setEditando(null)} className="w-full">Listo</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Tipos de vehículo (catálogo VehicleType) ---------------- */
function TipoVehiculoRow({ tipo, onChanged }) {
  const actualizar = async (patch) => { await termApi.put(`/tipos-vehiculo/${tipo.id}`, patch); onChanged(); };
  const eliminar = async () => {
    try { await termApi.delete(`/tipos-vehiculo/${tipo.id}`); toast.success("Tipo eliminado"); onChanged(); }
    catch (e) { toast.error(e.response?.data?.detail || "No se pudo eliminar"); }
  };
  const subirImagen = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("foto", file);
    try {
      await termApi.post(`/tipos-vehiculo/${tipo.id}/imagen`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Imagen actualizada");
      onChanged();
    } catch { toast.error("No se pudo subir la imagen"); }
  };

  return (
    <div data-testid={`tipo-vehiculo-row-${tipo.id}`} className="flex gap-3 rounded-xl border border-border bg-surface-2 p-3">
      <VehicleImage vehiculo={{ tipo_vehiculo: tipo, imagen_resuelta: tipo.imagen_url }}
        className="h-16 w-24 shrink-0 rounded-lg border border-border bg-surface-3" imgClassName="p-1.5" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Input defaultValue={tipo.nombre} onBlur={(e) => e.target.value !== tipo.nombre && actualizar({ nombre: e.target.value })}
            className="input-inset h-7 flex-1 border-border text-sm font-semibold text-foreground" />
          <div className="flex shrink-0 items-center gap-1">
            <button data-testid={`tipo-toggle-${tipo.id}`} onClick={() => actualizar({ activo: !tipo.activo })}
              aria-label={tipo.activo ? "Desactivar tipo" : "Activar tipo"}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              {tipo.activo ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <ConfirmAction
              title={`Eliminar tipo "${tipo.nombre}"`}
              description="Solo se puede eliminar si ningún vehículo lo usa actualmente."
              confirmLabel="Eliminar"
              onConfirm={eliminar}
              trigger={
                <button aria-label={`Eliminar ${tipo.nombre}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              }
            />
          </div>
        </div>
        <Input defaultValue={tipo.descripcion || ""} placeholder="Descripción"
          onBlur={(e) => e.target.value !== (tipo.descripcion || "") && actualizar({ descripcion: e.target.value })}
          className="input-inset h-7 border-border text-xs text-foreground" />
        <div className="flex items-center gap-2">
          <Input type="number" defaultValue={tipo.capacidad ?? ""} placeholder="Capacidad"
            onBlur={(e) => Number(e.target.value) !== tipo.capacidad && actualizar({ capacidad: e.target.value ? Number(e.target.value) : null })}
            className="input-inset mono-num h-7 w-24 border-border text-xs text-foreground" />
          <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary">
            <Camera className="h-3.5 w-3.5" /> Imagen
            <input type="file" accept="image/*" className="hidden" onChange={(e) => subirImagen(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

function TiposVehiculoPanel() {
  const [tipos, setTipos] = useState(null);
  const [error, setError] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ nombre: "", capacidad: "", orden: "" });

  const load = useCallback(() => {
    setError(null);
    termApi.get("/tipos-vehiculo").then((r) => setTipos(r.data)).catch(() => setError("No se pudo cargar el catálogo"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const crear = async () => {
    if (!f.nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    try {
      await termApi.post("/tipos-vehiculo", {
        nombre: f.nombre, capacidad: f.capacidad ? Number(f.capacidad) : null,
        orden: f.orden ? Number(f.orden) : (tipos?.length || 0) + 1,
      });
      toast.success("Tipo de vehículo creado");
      setF({ nombre: "", capacidad: "", orden: "" }); setNuevo(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo crear"); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Catálogo de tipos de vehículo. Un vehículo sin foto propia muestra automáticamente la imagen de su tipo.
      </p>
      <Button data-testid="nuevo-tipo-vehiculo-btn" onClick={() => setNuevo((v) => !v)} className="w-full">
        <Plus className="h-4 w-4" /> Nuevo tipo de vehículo
      </Button>
      {nuevo && (
        <div className="animate-slide-up space-y-2 rounded-xl border border-border bg-surface-2 p-3" data-testid="form-tipo-vehiculo">
          <Input value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre (ej. Minivan)" className="input-inset h-8 border-border text-sm text-foreground" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" value={f.capacidad} onChange={(e) => setF((p) => ({ ...p, capacidad: e.target.value }))} placeholder="Capacidad" className="input-inset h-8 border-border text-sm text-foreground" />
            <Input type="number" value={f.orden} onChange={(e) => setF((p) => ({ ...p, orden: e.target.value }))} placeholder="Orden" className="input-inset h-8 border-border text-sm text-foreground" />
          </div>
          <Button data-testid="tipo-vehiculo-guardar" onClick={crear} className="w-full">Guardar</Button>
        </div>
      )}

      {error && <ErrorState description={error} onRetry={load} />}
      {!error && tipos === null && <LoadingState rows={3} />}
      {!error && tipos !== null && tipos.length === 0 && (
        <EmptyState icon={Layers} title="Sin tipos de vehículo" description="Crea el primer tipo para empezar a dar imagen a la flota." />
      )}
      <div className="space-y-2">
        {tipos?.map((t) => <TipoVehiculoRow key={t.id} tipo={t} onChanged={load} />)}
      </div>
    </div>
  );
}

/* ============================================================================
 * OBJETOS REPORTADOS (Filtro e Histórico por Fechas, Evidencia WebP en Gran
 * Tamaño, Lightbox y Almacenamiento Seguro por Tenant)
 * ========================================================================== */
const OBJETO_ESTADOS = [
  { k: "encontrado", l: "Encontrado", c: "#3B82F6" },
  { k: "resguardo", l: "En resguardo", c: "#F59E0B" },
  { k: "devuelto", l: "Devuelto", c: "#10B981" },
  { k: "cerrado", l: "Cerrado", c: "#6B7280" },
];

function ReportesPanel({ liveReporte, operadores = {} }) {
  const [reportes, setReportes] = useState(null);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [rangoRapido, setRangoRapido] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [lightboxReporte, setLightboxReporte] = useState(null);
  const [devolviendoReporte, setDevolviendoReporte] = useState(null);
  const [datosEntrega, setDatosEntrega] = useState({ entregado_a: "", telefono_receptor: "", nota: "" });

  // Alta manual desde central
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ operador_id: "", categoria: "Electrónicos", descripcion: "" });
  const [fotoFile, setFotoFile] = useState(null);

  const load = useCallback(() => {
    setError(null);
    const params = {};
    if (filtroEstado !== "todos") params.estado = filtroEstado;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    if (busqueda.trim()) params.q = busqueda.trim();
    termApi
      .get("/reportes", { params })
      .then((r) => setReportes(r.data || []))
      .catch(() => setError("No se pudieron cargar los reportes"));
  }, [filtroEstado, desde, hasta, busqueda]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveReporte) load(); }, [liveReporte, load]);

  const aplicarRangoRapido = (tipo) => {
    setRangoRapido(tipo);
    const hoy = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (tipo === "todos") {
      setDesde("");
      setHasta("");
    } else if (tipo === "hoy") {
      const h = fmt(hoy);
      setDesde(h);
      setHasta(h);
    } else if (tipo === "7dias") {
      const d7 = new Date(hoy.getTime() - 7 * 86400000);
      setDesde(fmt(d7));
      setHasta(fmt(hoy));
    } else if (tipo === "mes") {
      const d30 = new Date(hoy.getTime() - 30 * 86400000);
      setDesde(fmt(d30));
      setHasta(fmt(hoy));
    } else if (tipo === "devueltos") {
      setFiltroEstado("devuelto");
      setDesde("");
      setHasta("");
    }
  };

  const cambiarEstado = async (id, estado, extra = {}) => {
    try {
      await termApi.patch(`/reportes/${id}/estado`, { estado, ...extra });
      toast.success(`Objeto actualizado: ${OBJETO_ESTADOS.find((e) => e.k === estado)?.l || estado}`);
      setDevolviendoReporte(null);
      setDatosEntrega({ entregado_a: "", telefono_receptor: "", nota: "" });
      load();
    } catch {
      toast.error("No se pudo actualizar el estado");
    }
  };

  const registrarNuevoObjeto = async (e) => {
    e.preventDefault();
    const opsList = Object.values(operadores || {});
    const opId = nuevoForm.operador_id || opsList[0]?.id;
    if (!opId || !fotoFile) {
      toast.error("Selecciona la unidad/operador y adjunta la evidencia fotográfica");
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("operador_id", opId);
      fd.append("categoria", nuevoForm.categoria || "Varios");
      fd.append("descripcion", nuevoForm.descripcion || "Objeto reportado en unidad");
      fd.append("foto", fotoFile);
      await termApi.post("/reportes", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Evidencia analizada contra malware y comprimida en formato WebP en carpeta del tenant");
      setNuevoOpen(false);
      setFotoFile(null);
      setNuevoForm({ operador_id: "", categoria: "Electrónicos", descripcion: "" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo registrar el objeto");
    } finally {
      setSubiendo(false);
    }
  };

  const siguienteAccion = (estado) => {
    switch (estado) {
      case "encontrado": return { k: "resguardo", l: "Pasar a resguardo en central" };
      case "resguardo": return { k: "devuelto", l: "Registrar devolución a cliente" };
      default: return null;
    }
  };

  const contadores = useMemo(() => {
    const list = reportes || [];
    return {
      total: list.length,
      encontrados: list.filter((x) => x.estado === "encontrado").length,
      resguardo: list.filter((x) => x.estado === "resguardo").length,
      devueltos: list.filter((x) => x.estado === "devuelto").length,
    };
  }, [reportes]);

  return (
    <div className="space-y-3.5" data-testid="reportes-panel-completo">
      {/* Banner de Seguridad & Compresión WebP por Tenant */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-200">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>
            <strong>Storage Aislado por Tenant + Escudo Anti-Malware:</strong> Evidencias verificadas y convertidas automáticamente a{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">.webp</code>
          </span>
        </div>
        <Button size="sm" onClick={() => setNuevoOpen((v) => !v)} data-testid="nuevo-reporte-btn">
          <Camera className="h-3.5 w-3.5" /> {nuevoOpen ? "Cancelar" : "Subir evidencia"}
        </Button>
      </div>

      {/* Formulario para subir nueva evidencia fotográfica */}
      {nuevoOpen && (
        <form
          onSubmit={registrarNuevoObjeto}
          className="animate-slide-up space-y-2.5 rounded-2xl border border-brand/40 bg-surface-2 p-3.5"
          data-testid="form-nuevo-reporte"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-brand-bright">
            Registrar Objeto Encontrado (con Compresión WebP)
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={nuevoForm.operador_id}
              onChange={(e) => setNuevoForm((p) => ({ ...p, operador_id: e.target.value }))}
              className="h-9 rounded-xl border border-white/10 bg-[#1B1E24] px-2.5 text-xs text-foreground"
            >
              <option value="">Seleccionar unidad / chofer…</option>
              {Object.values(operadores || {}).map((op) => (
                <option key={op.id} value={op.id}>
                  {op.vehiculo?.numero_economico || op.placa} — {op.nombre}
                </option>
              ))}
            </select>
            <select
              value={nuevoForm.categoria}
              onChange={(e) => setNuevoForm((p) => ({ ...p, categoria: e.target.value }))}
              className="h-9 rounded-xl border border-white/10 bg-[#1B1E24] px-2.5 text-xs text-foreground"
            >
              <option value="Electrónicos">Electrónicos / Celular</option>
              <option value="Equipaje">Equipaje / Mochila</option>
              <option value="Documentos / Cartera">Documentos / Cartera / INE</option>
              <option value="Accesorios">Accesorios / Lentes / Llaves</option>
              <option value="Varios">Otros objetos</option>
            </select>
            <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand/50 bg-brand/10 px-3 text-xs font-bold text-brand-bright hover:bg-brand/20">
              <Camera className="h-3.5 w-3.5" />
              <span className="truncate">{fotoFile ? fotoFile.name : "Elegir fotografía *"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFotoFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Input
              value={nuevoForm.descripcion}
              onChange={(e) => setNuevoForm((p) => ({ ...p, descripcion: e.target.value }))}
              placeholder="Descripción detallada del objeto y asiento donde se localizó…"
              className="h-9 flex-1 text-xs"
              required
            />
            <Button type="submit" disabled={subiendo} size="sm">
              {subiendo ? "Analizando y comprimiendo…" : "Guardar WebP"}
            </Button>
          </div>
        </form>
      )}

      {/* Filtros por Estado, Búsqueda e Histórico por Fechas */}
      <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-[#17191E] p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { k: "todos", l: `Todos (${contadores.total})` },
            { k: "encontrado", l: `Encontrados (${contadores.encontrados})` },
            { k: "resguardo", l: `En resguardo (${contadores.resguardo})` },
            { k: "devuelto", l: `Histórico Devueltos (${contadores.devueltos})` },
            { k: "cerrado", l: "Cerrados" },
          ].map((st) => (
            <button
              key={st.k}
              type="button"
              data-testid={`reporte-filtro-estado-${st.k}`}
              onClick={() => setFiltroEstado(st.k)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all",
                filtroEstado === st.k
                  ? "border-[#4F5DFF] bg-[#4F5DFF] text-white shadow"
                  : "border-white/10 bg-[#1B1E24] text-muted-foreground hover:text-foreground"
              )}
            >
              {st.l}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
          <div className="relative sm:col-span-5">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              data-testid="reportes-buscar-input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar objeto, unidad, chofer o receptor…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 sm:col-span-4">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="date"
              data-testid="reportes-fecha-desde"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setRangoRapido("custom"); }}
              className="h-8 w-full rounded-lg border border-white/10 bg-[#1B1E24] px-2 text-[11px] text-foreground"
              title="Fecha desde"
            />
            <span className="text-xs text-muted-foreground">a</span>
            <input
              type="date"
              data-testid="reportes-fecha-hasta"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setRangoRapido("custom"); }}
              className="h-8 w-full rounded-lg border border-white/10 bg-[#1B1E24] px-2 text-[11px] text-foreground"
              title="Fecha hasta"
            />
          </div>
          <div className="flex items-center justify-end gap-1 sm:col-span-3">
            {[
              { id: "hoy", l: "Hoy" },
              { id: "7dias", l: "7d" },
              { id: "mes", l: "Mes" },
              { id: "todos", l: "Todo" },
            ].map((rk) => (
              <button
                key={rk.id}
                type="button"
                onClick={() => aplicarRangoRapido(rk.id)}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[10px] font-bold",
                  rangoRapido === rk.id
                    ? "border-amber-400/50 bg-amber-400/15 text-amber-300"
                    : "border-white/10 bg-black/25 text-muted-foreground hover:text-foreground"
                )}
              >
                {rk.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={load} />}
      {!error && reportes === null && <LoadingState rows={3} />}
      {!error && reportes !== null && reportes.length === 0 && (
        <EmptyState icon={Package} title="No hay objetos en este rango" description="Ajusta el filtro de fechas o estado para consultar el histórico." />
      )}

      {/* Tarjetas con Evidencia Fotográfica en Gran Tamaño */}
      <div className="space-y-3">
        {!error && reportes !== null && reportes.map((r) => {
          const estadoInfo = OBJETO_ESTADOS.find((e) => e.k === r.estado) || { l: r.estado, c: "#6B7280" };
          const accion = siguienteAccion(r.estado);
          const fotoUrl = fileUrl(r.foto_url) || "/assets/drivers/driver-01.jpg";
          return (
            <div
              key={r.id}
              data-testid={`reporte-row-${r.id}`}
              className="flex flex-col gap-3.5 rounded-2xl border border-white/[0.08] bg-[#17191E] p-3.5 shadow-md sm:flex-row"
            >
              {/* Evidencia fotográfica en buen tamaño visible con zoom */}
              <div
                onClick={() => setLightboxReporte(r)}
                className="group relative h-44 w-full shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/15 bg-black sm:h-40 sm:w-48"
                title="Clic para ampliar evidencia fotográfica"
              >
                <img
                  src={fotoUrl}
                  alt={r.descripcion || "Evidencia de objeto"}
                  data-testid={`reporte-img-${r.id}`}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "data:image/svg+xml;utf8," + encodeURIComponent(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><rect width="320" height="220" fill="#141824"/><rect x="85" y="45" width="150" height="110" rx="14" fill="#10B981" fill-opacity="0.18" stroke="#10B981" stroke-width="2"/><text x="160" y="102" fill="#E5E7EB" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">EVIDENCIA WEBP</text><text x="160" y="124" fill="#9CA3AF" font-family="monospace" font-size="11" text-anchor="middle">${(r.categoria || "OBJETO").slice(0, 22)}</text></svg>`
                    );
                  }}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 py-1.5 text-[10px] font-bold text-white">
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> WebP Seguro
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5">
                    <ZoomIn className="h-3 w-3" /> Ampliar
                  </span>
                </div>
              </div>

              {/* Información completa e histórico de devolución */}
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-[#4F5DFF]/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#9BA3FF]">
                        {r.categoria || "Objeto reportado"}
                      </span>
                      <span className="font-mono text-xs font-extrabold text-amber-300">
                        {r.unidad?.numero_economico || r.operador_placa}
                      </span>
                    </div>
                    <span
                      data-testid={`reporte-estado-${r.id}`}
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase"
                      style={{ color: estadoInfo.c, background: `${estadoInfo.c}22`, border: `1px solid ${estadoInfo.c}66` }}
                    >
                      {estadoInfo.l}
                    </span>
                  </div>

                  <div className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
                    {r.descripcion || "Sin descripción"}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Chofer: <strong className="text-foreground/90">{r.operador_nombre}</strong></span>
                    <span>·</span>
                    <span>Reportado: <strong className="text-foreground/90">{r.timestamp?.slice(0, 16).replace("T", " ")}</strong> ({timeAgo(r.timestamp)})</span>
                  </div>

                  {/* Si fue devuelto, mostrar bloque de entrega histórico */}
                  {r.estado === "devuelto" && (
                    <div
                      data-testid={`reporte-devolucion-info-${r.id}`}
                      className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-emerald-300">
                        <span>✓ Entregado a: {r.entregado_a || "Propietario acreditado"}</span>
                        {r.fecha_devolucion && (
                          <span className="font-mono text-[10px]">
                            Fecha entrega: {r.fecha_devolucion.slice(0, 16).replace("T", " ")}
                          </span>
                        )}
                      </div>
                      {r.ultima_nota && <div className="mt-0.5 text-[11px] text-emerald-100/80">{r.ultima_nota}</div>}
                    </div>
                  )}

                  {r.tenant_storage_path && (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                      Storage Tenant: <code className="text-sky-300/90">{r.tenant_storage_path}</code>
                      {r.ahorro_compresion_pct ? ` · Compresión WebP -${r.ahorro_compresion_pct}%` : ""}
                    </div>
                  )}
                </div>

                {/* Botones de acción */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {accion && accion.k === "resguardo" && (
                    <Button data-testid={`avanzar-${r.id}`} size="sm" onClick={() => cambiarEstado(r.id, "resguardo")}>
                      {accion.l}
                    </Button>
                  )}
                  {accion && accion.k === "devuelto" && (
                    <Button
                      data-testid={`avanzar-${r.id}`}
                      size="sm"
                      onClick={() => setDevolviendoReporte(r)}
                    >
                      {accion.l}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setLightboxReporte(r)}>
                    <ZoomIn className="h-3.5 w-3.5" /> Ver foto grande
                  </Button>
                  {r.estado !== "cerrado" && r.estado !== "devuelto" && (
                    <Button data-testid={`cerrar-${r.id}`} size="sm" variant="secondary" onClick={() => cambiarEstado(r.id, "cerrado")}>
                      Cerrar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal para registrar entrega formal del objeto */}
      {devolviendoReporte && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-emerald-500/40 bg-[#14161B] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="text-sm font-bold text-emerald-300">Registrar Devolución de Objeto</div>
              <button onClick={() => setDevolviendoReporte(null)} className="text-muted-foreground hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{devolviendoReporte.descripcion}</p>
            <Input
              value={datosEntrega.entregado_a}
              onChange={(e) => setDatosEntrega((p) => ({ ...p, entregado_a: e.target.value }))}
              placeholder="Nombre de quien recibe (con INE) *"
              className="h-9 text-xs"
              data-testid="reporte-entregado-a"
            />
            <Input
              value={datosEntrega.telefono_receptor}
              onChange={(e) => setDatosEntrega((p) => ({ ...p, telefono_receptor: e.target.value }))}
              placeholder="Teléfono del propietario"
              className="h-9 text-xs"
            />
            <Input
              value={datosEntrega.nota}
              onChange={(e) => setDatosEntrega((p) => ({ ...p, nota: e.target.value }))}
              placeholder="Observaciones de entrega (ej. Firmó bitácora en central)"
              className="h-9 text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setDevolviendoReporte(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                data-testid="confirmar-devolucion-btn"
                onClick={() =>
                  cambiarEstado(devolviendoReporte.id, "devuelto", {
                    entregado_a: datosEntrega.entregado_a || "Propietario acreditado",
                    telefono_receptor: datosEntrega.telefono_receptor,
                    nota: datosEntrega.nota || "Entregado en central",
                  })
                }
              >
                Confirmar Devolución
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox para ver evidencia fotográfica en tamaño completo */}
      {lightboxReporte && (
        <div
          className="fixed inset-0 z-[750] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setLightboxReporte(null)}
        >
          <div
            className="max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#14161B] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-foreground">
                  Evidencia Fotográfica — Unidad {lightboxReporte.unidad?.numero_economico || lightboxReporte.operador_placa}
                </div>
                <div className="text-[11px] text-emerald-300">
                  Archivo WebP Verificado · Carpeta Tenant: {lightboxReporte.tenant_storage_path || lightboxReporte.storage_path}
                </div>
              </div>
              <button onClick={() => setLightboxReporte(null)} className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={fileUrl(lightboxReporte.foto_url) || "/assets/drivers/driver-01.jpg"}
              alt="Evidencia ampliada"
              className="max-h-[70vh] w-full object-contain bg-black"
            />
            <div className="space-y-1 p-4 text-xs">
              <div className="font-semibold text-foreground">{lightboxReporte.descripcion}</div>
              <div className="text-muted-foreground">
                Reportado por {lightboxReporte.operador_nombre} · {lightboxReporte.timestamp?.slice(0, 16).replace("T", " ")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Chat ---------------- */
function ChatPanel({ liveMessage }) {
  const [convos, setConvos] = useState(null);
  const [error, setError] = useState(null);
  const [activo, setActivo] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");

  const loadConvos = useCallback(() => {
    setError(null);
    termApi.get("/conversaciones").then((r) => setConvos(r.data)).catch(() => setError("No se pudieron cargar las conversaciones"));
  }, []);
  useEffect(() => { loadConvos(); }, [loadConvos]);

  const abrir = async (oid) => {
    setActivo(oid);
    const { data } = await termApi.get(`/mensajes?operador_id=${oid}`);
    setMensajes(data);
  };

  useEffect(() => {
    if (!liveMessage) return;
    loadConvos();
    if (activo && liveMessage.operador_id === activo) {
      setMensajes((m) => (m.some((x) => x.id === liveMessage.id) ? m : [...m, liveMessage]));
    }
  }, [liveMessage, activo, loadConvos]);

  const enviar = async () => {
    if (!texto.trim() || !activo) return;
    const t = texto;
    setTexto("");
    await termApi.post("/mensajes", { operador_id: activo, remitente: "terminal", texto: t });
  };

  if (activo) {
    const convo = convos?.find((c) => c.operador_id === activo);
    return (
      <div className="flex h-full flex-col">
        <button onClick={() => setActivo(null)} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-3 w-3 rotate-180" /> Conversaciones
        </button>
        <div className="mb-2 text-sm font-semibold text-foreground">{convo?.operador_nombre || "Operador"}</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-testid="chat-mensajes">
          {mensajes.map((m) => (
            <div key={m.id} className={`flex ${m.remitente === "terminal" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.remitente === "terminal" ? "bg-brand text-brand-contrast" : "bg-secondary text-foreground"
              }`}>
                {m.texto}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            data-testid="chat-input"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Escribe un mensaje…"
            className="input-inset border-border text-foreground"
          />
          <Button data-testid="chat-enviar" onClick={enviar} size="icon" aria-label="Enviar mensaje">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <ErrorState description={error} onRetry={loadConvos} />}
      {!error && convos === null && <LoadingState rows={3} />}
      {!error && convos !== null && convos.length === 0 && (
        <EmptyState icon={MessageSquare} title="No hay conversaciones" description="El chat con los conductores aparecerá aquí." />
      )}
      {!error && convos !== null && convos.map((c) => (
        <button
          key={c.operador_id}
          data-testid={`convo-${c.operador_id}`}
          onClick={() => abrir(c.operador_id)}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-border"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand-bright">
            {c.operador_nombre?.[0] || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{c.operador_nombre}</div>
            <div className="truncate text-xs text-muted-foreground">
              {c.ultimo_remitente === "terminal" ? "Tú: " : ""}{c.ultimo_texto}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ============================================================================
 * PLANIFICADOR DE RUTA COLECTIVA (Con Trazado Punto a Punto Automático sobre el Sentido de la Calle)
 * ========================================================================== */
function RutasPanel({
  rutas,
  onRutasChanged,
  drawingMode,
  onStartDrawing,
  onStopDrawing,
  drawnPoints = [],
  routeWaypoints = [],
  routingSegmentLoading = false,
  onUndoDrawnPoint,
  onClearDrawnPoints,
}) {
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#10B981");
  const [tarifaColectiva, setTarifaColectiva] = useState("15");
  const [frecuenciaMin, setFrecuenciaMin] = useState("10");
  const [horario, setHorario] = useState("05:30 - 22:00");
  const [paradasTxt, setParadasTxt] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const isDrawingRuta = drawingMode === "ruta";

  const activarDibujoRuta = () => {
    if (isDrawingRuta) {
      onStopDrawing?.();
    } else {
      onStartDrawing?.("ruta");
      toast.info("Selecciona de punto a punto en el mapa: la línea se trazará automáticamente sobre el sentido de la calle.");
    }
  };

  const crear = async () => {
    if (!nombre.trim()) {
      toast.error("Ingresa el nombre de la ruta colectiva");
      return;
    }
    const paradas = paradasTxt
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await termApi.post("/rutas", {
      nombre: nombre.trim(),
      color_hex: color,
      es_colectiva: true,
      tarifa_colectiva: Number(tarifaColectiva) || 15,
      frecuencia_min: Number(frecuenciaMin) || 10,
      horario: horario || "05:30 - 22:00",
      paradas,
      descripcion: descripcion || undefined,
      trazo: drawnPoints,
    });
    setNombre("");
    setParadasTxt("");
    setDescripcion("");
    onClearDrawnPoints?.();
    onStopDrawing?.();
    toast.success("Ruta colectiva guardada con su trazo vial en el mapa");
    onRutasChanged?.();
  };

  const actualizar = async (id, patch) => {
    await termApi.put(`/rutas/${id}`, patch);
    onRutasChanged?.();
  };

  const eliminar = async (id) => {
    await termApi.delete(`/rutas/${id}`);
    toast.success("Ruta eliminada");
    onRutasChanged?.();
  };

  return (
    <div className="space-y-4" data-testid="planificador-rutas-panel">
      <div className="space-y-3 rounded-2xl border border-brand/30 bg-surface-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-brand-bright">
              Planificador de Ruta Colectiva
            </div>
            <div className="text-[11px] text-muted-foreground">
              Selecciona de punto a punto y la línea se marca automáticamente sobre el sentido de la calle
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant={isDrawingRuta ? "primary" : "secondary"}
            data-testid="dibujar-ruta-mapa-btn"
            onClick={activarDibujoRuta}
          >
            <Pencil className="h-3.5 w-3.5" />
            {isDrawingRuta ? `Trazando (${drawnPoints.length} pts)` : "Dibujar en mapa"}
          </Button>
        </div>

        {/* Controles activos de dibujo punto a punto sobre sentido vial */}
        {isDrawingRuta && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-emerald-300">
              <span className="inline-flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5" />
                Trazado Punto a Punto (Sentido Vial Automático)
              </span>
              <span className="font-mono text-[11px]">
                {routeWaypoints.length || (drawnPoints.length > 0 ? 1 : 0)} paradas · {drawnPoints.length} pts viales
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-100/85">
              {routingSegmentLoading
                ? "Calculando línea sobre el sentido de la calle…"
                : "Haz clic en el punto de inicio y luego en cada punto siguiente hasta el punto de finalización: la ruta se ajusta sola a las calles."}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onUndoDrawnPoint}
                disabled={drawnPoints.length === 0 || routingSegmentLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" /> Deshacer tramo
              </button>
              <button
                type="button"
                onClick={onClearDrawnPoints}
                disabled={drawnPoints.length === 0 || routingSegmentLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-300 disabled:opacity-40"
              >
                Limpiar trazo
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            data-testid="ruta-color-nueva"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-secondary"
          />
          <Input
            data-testid="ruta-nombre-nueva"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la ruta colectiva (ej. Ruta Centro — Pakal-Ná)"
            className="input-inset h-9 border-border text-xs text-foreground"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Tarifa Colectiva ($)</label>
            <Input
              type="number"
              value={tarifaColectiva}
              onChange={(e) => setTarifaColectiva(e.target.value)}
              placeholder="15"
              className="mt-0.5 h-8 font-mono text-xs"
              data-testid="ruta-tarifa-input"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Frecuencia (min)</label>
            <Input
              type="number"
              value={frecuenciaMin}
              onChange={(e) => setFrecuenciaMin(e.target.value)}
              placeholder="10"
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Horario</label>
            <Input
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              placeholder="05:30 - 22:00"
              className="mt-0.5 h-8 text-xs"
            />
          </div>
        </div>

        <Input
          value={paradasTxt}
          onChange={(e) => setParadasTxt(e.target.value)}
          placeholder="Paradas separadas por coma (ej. Parque Central, ADO, Estación Tren Maya)"
          className="h-8 text-xs"
          data-testid="ruta-paradas-input"
        />

        <Button data-testid="ruta-crear" onClick={crear} className="w-full">
          <Plus className="h-4 w-4" /> Guardar Ruta Colectiva ({drawnPoints.length} puntos en mapa)
        </Button>
      </div>

      {rutas.length === 0 && <EmptyState icon={RouteIcon} title="Sin rutas" description="Crea rutas colectivas para agrupar la flota." />}
      <div className="space-y-2.5">
        {rutas.map((r) => (
          <div key={r.id} data-testid={`ruta-row-${r.id}`} className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={r.color_hex}
                onChange={(e) => actualizar(r.id, { color_hex: e.target.value })}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-secondary"
              />
              <Input
                defaultValue={r.nombre}
                onBlur={(e) => e.target.value !== r.nombre && actualizar(r.id, { nombre: e.target.value })}
                className="input-inset h-8 flex-1 border-border text-xs font-bold text-foreground"
              />
              <button
                type="button"
                onClick={() => eliminar(r.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-500/15 hover:text-rose-400"
                title="Eliminar ruta"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono font-bold text-emerald-400">
                Tarifa colectiva: ${r.tarifa_colectiva ?? 15} MXN
              </span>
              <span>Horario: {r.horario || "05:30 - 22:00"}</span>
              <span className="font-mono text-sky-300">
                {(r.trazo || []).length} pts trazados
              </span>
            </div>
            {Array.isArray(r.paradas) && r.paradas.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {r.paradas.map((p, idx) => (
                  <span key={idx} className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] text-foreground/85">
                    {idx + 1}. {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * PESTAÑA COLONIAS / CUADRANTES (Herramienta de Dibujo en Mapa + Ocultación
 * Temporal de Flota + Configuración de Precios por Zona Delimitante)
 * ========================================================================== */
function ColoniasPanel({
  colonias = [],
  onColoniasChanged,
  drawingMode,
  onStartDrawing,
  onStopDrawing,
  drawnPoints = [],
  onUndoDrawnPoint,
  onClearDrawnPoints,
}) {
  const [nombre, setNombre] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [color, setColor] = useState("#10B981");
  const [tarifaBase, setTarifaBase] = useState("45");
  const [tarifaNocturna, setTarifaNocturna] = useState("60");
  const [tarifaSalida, setTarifaSalida] = useState("50");
  const [callesPrincipales, setCallesPrincipales] = useState("");
  const [puntosClave, setPuntosClave] = useState("");

  const isDrawingColonia = drawingMode === "colonia";

  const toggleDibujarCuadrante = () => {
    if (isDrawingColonia) {
      onStopDrawing?.();
    } else {
      onStartDrawing?.("colonia");
      toast.info("Modo edición de cuadrante activo: la flota se ocultó temporalmente para despejar el mapa.");
    }
  };

  const guardarColonia = async () => {
    if (!nombre.trim()) {
      toast.error("Ingresa el nombre de la colonia o cuadrante");
      return;
    }
    if (drawnPoints.length < 3) {
      toast.error("Marca al menos 3 vértices en el mapa para cerrar el polígono del cuadrante");
      return;
    }
    try {
      await termApi.post("/colonias", {
        nombre: nombre.trim(),
        subtitulo: subtitulo.trim() || "Cuadrante Tarifario Delimitado",
        color,
        tarifa_base: Number(tarifaBase) || 45,
        tarifa_nocturna: Number(tarifaNocturna) || 60,
        tarifa_salida: Number(tarifaSalida) || 50,
        calles_principales: callesPrincipales,
        puntos_clave: puntosClave,
        poligono: drawnPoints,
      });
      toast.success("Cuadrante y precios delimitantes guardados en el mapa");
      setNombre("");
      setSubtitulo("");
      setCallesPrincipales("");
      setPuntosClave("");
      onClearDrawnPoints?.();
      onStopDrawing?.();
      onColoniasChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo guardar el cuadrante");
    }
  };

  const actualizarPrecioZona = async (col, patch) => {
    try {
      await termApi.put(`/colonias/${col.id}`, {
        nombre: col.nombre,
        subtitulo: col.subtitulo || "",
        color: col.color || "#10B981",
        tarifa_base: col.tarifa_base ?? 40,
        tarifa_nocturna: col.tarifa_nocturna ?? 55,
        tarifa_salida: col.tarifa_salida ?? 45,
        poligono: col.poligono || [],
        limites: col.limites || {},
        calles_principales: col.calles_principales || "",
        puntos_clave: col.puntos_clave || "",
        ...patch,
      });
      toast.success(`Tarifa de zona "${col.nombre}" actualizada`);
      onColoniasChanged?.();
    } catch {
      toast.error("No se pudo actualizar la colonia");
    }
  };

  const eliminarColonia = async (id) => {
    try {
      await termApi.delete(`/colonias/${id}`);
      toast.success("Cuadrante eliminado");
      onColoniasChanged?.();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-4" data-testid="colonias-cuadrantes-panel">
      {/* Herramienta de dibujo de límites de cuadrante en el mapa */}
      <div className="space-y-3 rounded-2xl border border-emerald-500/35 bg-surface-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-emerald-400">
              Editor de Cuadrantes y Precios Delimitantes
            </div>
            <div className="text-[11px] text-muted-foreground">
              Dibuja los límites sobre el mapa. Los vehículos se ocultan automáticamente mientras dibujas.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant={isDrawingColonia ? "primary" : "secondary"}
            data-testid="dibujar-colonia-mapa-btn"
            onClick={toggleDibujarCuadrante}
          >
            {isDrawingColonia ? <EyeOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {isDrawingColonia ? "Salir de edición" : "Dibujar cuadrante"}
          </Button>
        </div>

        {isDrawingColonia && (
          <div
            data-testid="modo-edicion-cuadrante-banner"
            className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs"
          >
            <div className="flex items-center justify-between font-bold text-amber-300">
              <span className="flex items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5" /> Flota oculta temporalmente para trazo limpio
              </span>
              <span className="font-mono">{drawnPoints.length} vértices</span>
            </div>
            <p className="mt-1 text-[11px] text-amber-100/85">
              Haz clic en las esquinas del cuadrante o colonia en el mapa (mínimo 3 puntos) y asigna su tarifa delimitante abajo.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onUndoDrawnPoint}
                disabled={drawnPoints.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" /> Deshacer vértice
              </button>
              <button
                type="button"
                onClick={onClearDrawnPoints}
                disabled={drawnPoints.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-300 disabled:opacity-40"
              >
                Reiniciar polígono
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-secondary"
          />
          <Input
            data-testid="colonia-nombre-input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de Colonia o Cuadrante (ej. Cuadrante Norte Pakal-Ná)"
            className="h-9 flex-1 text-xs"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Tarifa Base Día ($)</label>
            <Input
              type="number"
              data-testid="colonia-tarifa-base-input"
              value={tarifaBase}
              onChange={(e) => setTarifaBase(e.target.value)}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Tarifa Nocturna ($)</label>
            <Input
              type="number"
              data-testid="colonia-tarifa-nocturna-input"
              value={tarifaNocturna}
              onChange={(e) => setTarifaNocturna(e.target.value)}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Salida de Zona ($)</label>
            <Input
              type="number"
              value={tarifaSalida}
              onChange={(e) => setTarifaSalida(e.target.value)}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
        </div>

        <Input
          value={callesPrincipales}
          onChange={(e) => setCallesPrincipales(e.target.value)}
          placeholder="Calles delimitantes (ej. Av. Juárez a Periférico Norte)"
          className="h-8 text-xs"
        />

        <Button data-testid="colonia-guardar-btn" onClick={guardarColonia} className="w-full">
          <Plus className="h-4 w-4" /> Guardar Cuadrante y Tarifa de Zona ({drawnPoints.length} vértices)
        </Button>
      </div>

      {/* Lista de colonias / cuadrantes con edición rápida de precios delimitantes */}
      <div className="space-y-2.5">
        {colonias.map((col) => (
          <div key={col.id || col.nombre} className="space-y-2 rounded-xl border border-white/[0.08] bg-[#17191E] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ background: col.color || "#10B981" }} />
                <div>
                  <div className="text-xs font-bold text-foreground">{col.nombre}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {col.subtitulo || "Cuadrante Tarifario"} · {(col.poligono || []).length} vértices
                  </div>
                </div>
              </div>
              {col.id && (
                <button
                  type="button"
                  onClick={() => eliminarColonia(col.id)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-rose-500/15 hover:text-rose-400"
                  title="Eliminar cuadrante"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-lg bg-black/30 p-1.5">
                <label className="block text-[9px] uppercase text-muted-foreground">Base Día ($)</label>
                <input
                  type="number"
                  defaultValue={col.tarifa_base ?? 40}
                  onBlur={(e) =>
                    Number(e.target.value) !== (col.tarifa_base ?? 40) &&
                    actualizarPrecioZona(col, { tarifa_base: Number(e.target.value) })
                  }
                  className="mt-0.5 w-full bg-transparent font-mono text-xs font-black text-emerald-400 outline-none"
                />
              </div>
              <div className="rounded-lg bg-black/30 p-1.5">
                <label className="block text-[9px] uppercase text-muted-foreground">Nocturna ($)</label>
                <input
                  type="number"
                  defaultValue={col.tarifa_nocturna ?? 55}
                  onBlur={(e) =>
                    Number(e.target.value) !== (col.tarifa_nocturna ?? 55) &&
                    actualizarPrecioZona(col, { tarifa_nocturna: Number(e.target.value) })
                  }
                  className="mt-0.5 w-full bg-transparent font-mono text-xs font-black text-amber-300 outline-none"
                />
              </div>
              <div className="rounded-lg bg-black/30 p-1.5">
                <label className="block text-[9px] uppercase text-muted-foreground">Salida ($)</label>
                <input
                  type="number"
                  defaultValue={col.tarifa_salida ?? 45}
                  onBlur={(e) =>
                    Number(e.target.value) !== (col.tarifa_salida ?? 45) &&
                    actualizarPrecioZona(col, { tarifa_salida: Number(e.target.value) })
                  }
                  className="mt-0.5 w-full bg-transparent font-mono text-xs font-black text-sky-300 outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * CREADOR DE TARIFA AVANZADO (Con Configuración de Horario, Recargo Nocturno,
 * Lluvia, Km Extra, Parada Extra y Zona Delimitada)
 * ========================================================================== */
function TarifasPanel({ colonias = [] }) {
  const [tarifas, setTarifas] = useState(null);
  const [error, setError] = useState(null);
  const [f, setF] = useState({
    nombre: "",
    monto: "",
    horario_tipo: "todo_el_dia",
    hora_inicio: "06:00",
    hora_fin: "22:00",
    recargo_nocturno: "15",
    recargo_lluvia: "10",
    costo_km_extra: "8",
    costo_parada_extra: "15",
    zona_nombre: "",
    descripcion: "",
  });

  const load = useCallback(() => {
    setError(null);
    termApi.get("/tarifas").then((r) => setTarifas(r.data)).catch(() => setError("No se pudieron cargar las tarifas"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const crear = async () => {
    if (!f.nombre || !f.monto) {
      toast.error("Nombre y precio base requeridos");
      return;
    }
    await termApi.post("/tarifas", {
      nombre: f.nombre,
      monto: Number(f.monto),
      tipo: "fijo",
      orden: (tarifas?.length || 0) + 1,
      horario_tipo: f.horario_tipo,
      hora_inicio: f.hora_inicio,
      hora_fin: f.hora_fin,
      recargo_nocturno: Number(f.recargo_nocturno) || 0,
      recargo_lluvia: Number(f.recargo_lluvia) || 0,
      costo_km_extra: Number(f.costo_km_extra) || 0,
      costo_parada_extra: Number(f.costo_parada_extra) || 0,
      zona_nombre: f.zona_nombre || null,
      descripcion: f.descripcion || null,
      activa: true,
    });
    toast.success("Tarifa configurada con horarios y recargos");
    setF((prev) => ({ ...prev, nombre: "", monto: "", descripcion: "" }));
    load();
  };

  const actualizar = async (t, patch) => {
    await termApi.put(`/tarifas/${t.id}`, {
      nombre: t.nombre,
      monto: t.monto,
      tipo: t.tipo || "fijo",
      orden: t.orden || 0,
      horario_tipo: t.horario_tipo || "todo_el_dia",
      hora_inicio: t.hora_inicio || "06:00",
      hora_fin: t.hora_fin || "22:00",
      recargo_nocturno: t.recargo_nocturno || 0,
      recargo_lluvia: t.recargo_lluvia || 0,
      costo_km_extra: t.costo_km_extra || 0,
      costo_parada_extra: t.costo_parada_extra || 0,
      zona_nombre: t.zona_nombre || null,
      ...patch,
    });
    load();
  };

  const eliminar = async (id) => {
    await termApi.delete(`/tarifas/${id}`);
    toast.success("Tarifa eliminada");
    load();
  };

  return (
    <div className="space-y-4" data-testid="creador-tarifas-panel">
      <div className="space-y-3 rounded-2xl border border-brand/30 bg-surface-2 p-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-brand-bright">
            Creador de Tarifa Programada
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" /> Horarios y Recargos
          </span>
        </div>

        <div className="flex gap-2">
          <Input
            value={f.nombre}
            onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))}
            placeholder="Nombre de tarifa (ej. Nocturna Especial / Zona Hotelera)"
            className="input-inset h-9 flex-1 border-border text-xs text-foreground"
            data-testid="tarifa-nombre"
          />
          <Input
            type="number"
            value={f.monto}
            onChange={(e) => setF((p) => ({ ...p, monto: e.target.value }))}
            placeholder="$ Base"
            className="input-inset mono-num h-9 w-24 border-border text-xs text-foreground"
            data-testid="tarifa-monto"
          />
        </div>

        {/* Horario y Zona Delimitante */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Modalidad de Horario</label>
            <select
              data-testid="tarifa-horario-tipo"
              value={f.horario_tipo}
              onChange={(e) => {
                const ht = e.target.value;
                setF((p) => ({
                  ...p,
                  horario_tipo: ht,
                  hora_inicio: ht === "nocturno" ? "22:00" : ht === "hora_pico" ? "07:00" : "06:00",
                  hora_fin: ht === "nocturno" ? "05:59" : ht === "hora_pico" ? "09:30" : "22:00",
                }));
              }}
              className="mt-0.5 h-8 w-full rounded-lg border border-white/10 bg-[#1B1E24] px-2 text-xs text-foreground"
            >
              <option value="todo_el_dia">Todo el día (24 hrs)</option>
              <option value="diurno">Horario Diurno</option>
              <option value="nocturno">Horario Nocturno</option>
              <option value="hora_pico">Hora Pico / Demanda Alta</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Cuadrante / Zona Vinculada</label>
            <select
              value={f.zona_nombre}
              onChange={(e) => setF((p) => ({ ...p, zona_nombre: e.target.value }))}
              className="mt-0.5 h-8 w-full rounded-lg border border-white/10 bg-[#1B1E24] px-2 text-xs text-foreground"
            >
              <option value="">General (Todo el sitio)</option>
              {colonias.map((c) => (
                <option key={c.id || c.nombre} value={c.nombre}>
                  {c.nombre} (${c.tarifa_base ?? 40})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Hora Inicio</label>
            <Input
              type="time"
              data-testid="tarifa-hora-inicio"
              value={f.hora_inicio}
              onChange={(e) => setF((p) => ({ ...p, hora_inicio: e.target.value }))}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Hora Fin</label>
            <Input
              type="time"
              data-testid="tarifa-hora-fin"
              value={f.hora_fin}
              onChange={(e) => setF((p) => ({ ...p, hora_fin: e.target.value }))}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
        </div>

        {/* Recargos y extras configurables */}
        <div className="grid grid-cols-4 gap-1.5">
          <div>
            <label className="text-[9px] font-semibold text-muted-foreground">+ Nocturno ($)</label>
            <Input
              type="number"
              value={f.recargo_nocturno}
              onChange={(e) => setF((p) => ({ ...p, recargo_nocturno: e.target.value }))}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[9px] font-semibold text-muted-foreground">+ Lluvia ($)</label>
            <Input
              type="number"
              value={f.recargo_lluvia}
              onChange={(e) => setF((p) => ({ ...p, recargo_lluvia: e.target.value }))}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[9px] font-semibold text-muted-foreground">Km Extra ($)</label>
            <Input
              type="number"
              value={f.costo_km_extra}
              onChange={(e) => setF((p) => ({ ...p, costo_km_extra: e.target.value }))}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[9px] font-semibold text-muted-foreground">Parada ($)</label>
            <Input
              type="number"
              value={f.costo_parada_extra}
              onChange={(e) => setF((p) => ({ ...p, costo_parada_extra: e.target.value }))}
              className="mt-0.5 h-8 font-mono text-xs"
            />
          </div>
        </div>

        <Button data-testid="tarifa-crear" onClick={crear} className="w-full">
          <Plus className="h-4 w-4" /> Crear Tarifa Configurada
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} />}
      {!error && tarifas === null && <LoadingState rows={2} />}
      {!error && tarifas !== null && tarifas.length === 0 && (
        <EmptyState icon={DollarSign} title="Sin tarifas" description="Define tarifas con horarios y recargos para el despacho." />
      )}
      <div className="space-y-2">
        {tarifas !== null && tarifas.map((t) => (
          <div key={t.id} data-testid={`tarifa-row-${t.id}`} className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <Input
                defaultValue={t.nombre}
                onBlur={(e) => e.target.value !== t.nombre && actualizar(t, { nombre: e.target.value })}
                className="input-inset h-8 flex-1 border-border text-xs font-bold text-foreground"
              />
              <Input
                type="number"
                defaultValue={t.monto}
                onBlur={(e) => Number(e.target.value) !== t.monto && actualizar(t, { monto: Number(e.target.value) })}
                className="input-inset mono-num h-8 w-20 border-border text-xs font-bold text-emerald-400"
              />
              <ConfirmAction
                title={`Eliminar tarifa "${t.nombre}"`}
                description="Los servicios nuevos ya no podrán usar esta tarifa."
                confirmLabel="Eliminar"
                onConfirm={() => eliminar(t.id)}
                trigger={
                  <button
                    data-testid={`tarifa-del-${t.id}`}
                    aria-label={`Eliminar tarifa ${t.nombre}`}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 font-mono text-sky-300">
                <Clock className="h-2.5 w-2.5" /> {t.hora_inicio || "00:00"} – {t.hora_fin || "23:59"} ({t.horario_tipo || "todo_el_dia"})
              </span>
              {t.zona_nombre && (
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                  Zona: {t.zona_nombre}
                </span>
              )}
              {Number(t.recargo_nocturno) > 0 && <span>+Nocturno ${t.recargo_nocturno}</span>}
              {Number(t.recargo_lluvia) > 0 && <span>+Lluvia ${t.recargo_lluvia}</span>}
              {Number(t.costo_km_extra) > 0 && <span>Km extra ${t.costo_km_extra}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

