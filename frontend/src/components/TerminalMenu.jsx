import { useEffect, useState, useCallback } from "react";
import { termApi, BACKEND_URL, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  PhoneCall, Users, UserSquare, Package, MessageSquare, Route as RouteIcon,
  X, Plus, Check, Send, ChevronDown, ChevronRight, ClipboardList, DollarSign,
  Trash2, Truck, Search, Pencil, Layers, Camera, EyeOff, Eye,
} from "lucide-react";
import { ServiciosPanel } from "@/components/ServiciosPanel";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EstadoBadge } from "@/components/StatusBadge";
import { ConfirmAction } from "@/components/ConfirmAction";
import { VehicleImage } from "@/components/VehicleImage";

const SECTIONS = [
  { id: "servicio", label: "Asignar servicio", icon: PhoneCall },
  { id: "servicios", label: "Servicios de hoy", icon: ClipboardList },
  { id: "vehiculos", label: "Vehículos / Flota", icon: Truck },
  { id: "tipos-vehiculo", label: "Tipos de vehículo", icon: Layers },
  { id: "operadores", label: "Operadores", icon: Users },
  { id: "clientes", label: "Clientes", icon: UserSquare },
  { id: "reportes", label: "Objetos reportados", icon: Package },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "rutas", label: "Rutas", icon: RouteIcon },
  { id: "tarifas", label: "Tarifas", icon: DollarSign },
];

export function TerminalMenu({ operadores, rutas, onRutasChanged, onDataChanged, onOpenServicio, liveMessage, liveReporte, servicioSignal }) {
  const [active, setActive] = useState(null);

  const open = (id) => {
    if (id === "servicio") { onOpenServicio(); return; }
    setActive((a) => (a === id ? null : id));
  };

  return (
    <>
      {/* Rail de iconos (derecha) */}
      <div
        data-testid="terminal-menu-rail"
        className={`bezel-shell absolute top-[124px] z-[600] transition-all duration-300 ease-motion lg:top-24 ${active ? "right-[408px]" : "right-3 sm:right-4"}`}
      >
        <div className="flex flex-col gap-1.5 rounded-[var(--radius)] p-1.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              data-testid={`menu-${s.id}`}
              onClick={() => open(s.id)}
              title={s.label}
              aria-label={s.label}
              className={cn("th-3d flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                active === s.id ? "bg-brand text-brand-contrast" : "text-foreground/80 hover:bg-secondary/60")}
            >
              <s.icon className="th-icon-3d h-5 w-5" />
            </button>
          ))}
        </div>
      </div>

      {/* Panel deslizable */}
      <div
        className={`absolute right-0 top-0 z-[590] h-full w-[400px] max-w-[92vw] transform border-l border-border transition-transform duration-300 ease-motion ${
          active ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ background: "hsl(240 5% 9% / var(--ui-alpha,0.95))", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      >
        {active && (
          <div data-testid={`panel-${active}`} className="flex h-full animate-fade-in flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15">
                  {(() => { const I = SECTIONS.find((s) => s.id === active)?.icon; return I ? <I className="h-4 w-4 text-brand-bright" /> : null; })()}
                </span>
                {SECTIONS.find((s) => s.id === active)?.label}
              </h2>
              <button data-testid="panel-close" onClick={() => setActive(null)} aria-label="Cerrar panel" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {active === "servicios" && <ServiciosPanel reloadSignal={servicioSignal} />}
              {active === "vehiculos" && <VehiculosPanel operadores={operadores} />}
              {active === "tipos-vehiculo" && <TiposVehiculoPanel />}
              {active === "operadores" && <OperadoresPanel operadores={operadores} rutas={rutas} onChanged={onDataChanged} />}
              {active === "clientes" && <ClientesPanel />}
              {active === "reportes" && <ReportesPanel liveReporte={liveReporte} />}
              {active === "chat" && <ChatPanel liveMessage={liveMessage} />}
              {active === "rutas" && <RutasPanel rutas={rutas} onRutasChanged={onRutasChanged} />}
              {active === "tarifas" && <TarifasPanel />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

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
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ESTADO_COLORS[o.estado] }} />
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
                <div className="truncate text-xs text-muted-foreground">
                  {op ? `Conductor: ${op.nombre}` : "Sin conductor asignado"}
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

/* ---------------- Reportes ---------------- */
function ReportesPanel({ liveReporte }) {
  const [reportes, setReportes] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    termApi.get("/reportes").then((r) => setReportes(r.data)).catch(() => setError("No se pudieron cargar los reportes"));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveReporte) load(); }, [liveReporte, load]);

  const resolver = async (id) => {
    await termApi.patch(`/reportes/${id}/resolver`);
    toast.success("Reporte marcado como resuelto");
    load();
  };

  return (
    <div className="space-y-3">
      {error && <ErrorState description={error} onRetry={load} />}
      {!error && reportes === null && <LoadingState rows={3} />}
      {!error && reportes !== null && reportes.length === 0 && (
        <EmptyState icon={Package} title="No hay objetos reportados" description="Los reportes de objetos olvidados aparecerán aquí." />
      )}
      {!error && reportes !== null && reportes.map((r) => (
        <div key={r.id} data-testid={`reporte-row-${r.id}`} className="flex gap-3 rounded-xl border border-border bg-surface-2 p-2.5">
          <img
            src={`${BACKEND_URL}${r.foto_url}`}
            alt="objeto"
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-foreground">{r.descripcion || "Sin descripción"}</div>
            <div className="text-xs text-muted-foreground">{r.operador_nombre} · {r.operador_placa}</div>
            <div className="text-xs text-muted-foreground">{timeAgo(r.timestamp)}</div>
            {r.estado === "pendiente" ? (
              <Button data-testid={`resolver-${r.id}`} size="sm" onClick={() => resolver(r.id)} className="mt-1.5">
                <Check className="h-3 w-3" /> Marcar resuelto
              </Button>
            ) : (
              <span className="mt-1.5 inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">Resuelto</span>
            )}
          </div>
        </div>
      ))}
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

/* ---------------- Rutas ---------------- */
function RutasPanel({ rutas, onRutasChanged }) {
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#00b894");

  const crear = async () => {
    if (!nombre.trim()) return;
    await termApi.post("/rutas", { nombre, color_hex: color });
    setNombre(""); setColor("#00b894");
    toast.success("Ruta creada");
    onRutasChanged();
  };

  const actualizar = async (id, patch) => {
    await termApi.put(`/rutas/${id}`, patch);
    onRutasChanged();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-2 p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Nueva ruta</div>
        <div className="flex items-center gap-2">
          <input
            data-testid="ruta-color-nueva"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded border border-border bg-secondary"
          />
          <Input
            data-testid="ruta-nombre-nueva"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la ruta"
            className="input-inset border-border text-foreground"
          />
          <Button data-testid="ruta-crear" onClick={crear} size="icon" aria-label="Crear ruta">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {rutas.length === 0 && <EmptyState icon={RouteIcon} title="Sin rutas" description="Crea rutas colectivas para agrupar la flota." />}
      <div className="space-y-2">
        {rutas.map((r) => (
          <div key={r.id} data-testid={`ruta-row-${r.id}`} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
            <input
              type="color"
              value={r.color_hex}
              onChange={(e) => actualizar(r.id, { color_hex: e.target.value })}
              className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-secondary"
            />
            <Input
              defaultValue={r.nombre}
              onBlur={(e) => e.target.value !== r.nombre && actualizar(r.id, { nombre: e.target.value })}
              className="input-inset h-8 border-border text-sm text-foreground"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Tarifas ---------------- */
function TarifasPanel() {
  const [tarifas, setTarifas] = useState(null);
  const [error, setError] = useState(null);
  const [f, setF] = useState({ nombre: "", monto: "" });
  const load = useCallback(() => {
    setError(null);
    termApi.get("/tarifas").then((r) => setTarifas(r.data)).catch(() => setError("No se pudieron cargar las tarifas"));
  }, []);
  useEffect(() => { load(); }, [load]);
  const crear = async () => {
    if (!f.nombre || !f.monto) { toast.error("Nombre y precio requeridos"); return; }
    await termApi.post("/tarifas", { nombre: f.nombre, monto: Number(f.monto), orden: (tarifas?.length || 0) + 1 });
    setF({ nombre: "", monto: "" }); load();
  };
  const actualizar = async (t, patch) => { await termApi.put(`/tarifas/${t.id}`, { nombre: t.nombre, monto: t.monto, tipo: t.tipo || "fijo", orden: t.orden || 0, ...patch }); load(); };
  const eliminar = async (id) => { await termApi.delete(`/tarifas/${id}`); toast.success("Tarifa eliminada"); load(); };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface-2 p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Nueva tarifa</div>
        <div className="flex gap-2">
          <Input value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" className="input-inset h-8 border-border text-sm text-foreground" data-testid="tarifa-nombre" />
          <Input type="number" value={f.monto} onChange={(e) => setF((p) => ({ ...p, monto: e.target.value }))} placeholder="$" className="input-inset mono-num h-8 w-20 border-border text-sm text-foreground" data-testid="tarifa-monto" />
          <Button data-testid="tarifa-crear" onClick={crear} size="icon" aria-label="Crear tarifa"><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      {error && <ErrorState description={error} onRetry={load} />}
      {!error && tarifas === null && <LoadingState rows={2} />}
      {!error && tarifas !== null && tarifas.length === 0 && (
        <EmptyState icon={DollarSign} title="Sin tarifas" description="Define tarifas para el inicio rápido del servicio." />
      )}
      {tarifas !== null && tarifas.map((t) => (
        <div key={t.id} data-testid={`tarifa-row-${t.id}`} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <Input defaultValue={t.nombre} onBlur={(e) => e.target.value !== t.nombre && actualizar(t, { nombre: e.target.value })} className="input-inset h-8 flex-1 border-border text-sm text-foreground" />
          <Input type="number" defaultValue={t.monto} onBlur={(e) => Number(e.target.value) !== t.monto && actualizar(t, { monto: Number(e.target.value) })} className="input-inset mono-num h-8 w-20 border-border text-sm text-foreground" />
          <ConfirmAction
            title={`Eliminar tarifa "${t.nombre}"`}
            description="Los servicios nuevos ya no podrán usar esta tarifa."
            confirmLabel="Eliminar"
            onConfirm={() => eliminar(t.id)}
            trigger={
              <button data-testid={`tarifa-del-${t.id}`} aria-label={`Eliminar tarifa ${t.nombre}`} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            }
          />
        </div>
      ))}
    </div>
  );
}
