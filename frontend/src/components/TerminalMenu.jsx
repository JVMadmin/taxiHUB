import { useEffect, useState, useCallback } from "react";
import { api, BACKEND_URL, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  PhoneCall, Users, UserSquare, Package, MessageSquare, Route as RouteIcon,
  X, Plus, Check, Send, ChevronDown, ChevronRight, ClipboardList, DollarSign, Trash2,
} from "lucide-react";

const SECTIONS = [
  { id: "servicio", label: "Asignar servicio", icon: PhoneCall },
  { id: "servicios", label: "Servicios de hoy", icon: ClipboardList },
  { id: "operadores", label: "Operadores", icon: Users },
  { id: "clientes", label: "Clientes", icon: UserSquare },
  { id: "reportes", label: "Objetos reportados", icon: Package },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "rutas", label: "Rutas", icon: RouteIcon },
  { id: "tarifas", label: "Tarifas", icon: DollarSign },
];

export function TerminalMenu({ operadores, rutas, onRutasChanged, onDataChanged, onOpenServicio, liveMessage, liveReporte }) {
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
        className={`absolute top-24 z-[600] flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/85 p-2 backdrop-blur-md transition-all duration-300 ${active ? "right-[392px]" : "right-4"}`}
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            data-testid={`menu-${s.id}`}
            onClick={() => open(s.id)}
            title={s.label}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              active === s.id ? "bg-emerald-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <s.icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {/* Panel deslizable */}
      <div
        className={`absolute right-0 top-0 z-[590] h-full w-[380px] max-w-[90vw] transform border-l border-zinc-800 bg-zinc-950/95 backdrop-blur-md transition-transform duration-300 ${
          active ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {active && (
          <div data-testid={`panel-${active}`} className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-200">
                {SECTIONS.find((s) => s.id === active)?.label}
              </h2>
              <button data-testid="panel-close" onClick={() => setActive(null)} className="text-zinc-400 hover:text-zinc-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {active === "servicios" && <ServiciosPanel />}
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
  const lista = Object.values(operadores);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ nombre: "", telefono: "", placa: "", usuario: "", contrasena: "", ruta_asignada: "libre" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const crear = async () => {
    if (!f.nombre || !f.usuario || !f.contrasena) { toast.error("Nombre, usuario y contraseña requeridos"); return; }
    try {
      await api.post("/operadores", { ...f, ruta_asignada: f.ruta_asignada === "libre" ? null : f.ruta_asignada });
      toast.success("Operador creado");
      setF({ nombre: "", telefono: "", placa: "", usuario: "", contrasena: "", ruta_asignada: "libre" });
      setNuevo(false); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo crear"); }
  };
  return (
    <div className="space-y-2">
      <Button data-testid="nuevo-operador-btn" onClick={() => setNuevo((v) => !v)} className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
        <Plus className="mr-1 h-4 w-4" /> Nuevo operador
      </Button>
      {nuevo && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3" data-testid="form-operador">
          <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="op-nombre" />
          <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="Teléfono" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="op-telefono" />
          <Input value={f.placa} onChange={(e) => set("placa", e.target.value)} placeholder="Placa / Unidad" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="op-placa" />
          <Input value={f.usuario} onChange={(e) => set("usuario", e.target.value)} placeholder="Usuario" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="op-usuario" />
          <Input type="password" value={f.contrasena} onChange={(e) => set("contrasena", e.target.value)} placeholder="Contraseña" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="op-contrasena" />
          <select value={f.ruta_asignada} onChange={(e) => set("ruta_asignada", e.target.value)} className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-100" data-testid="op-ruta">
            <option value="libre">Taxi libre (sin ruta)</option>
            {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <Button data-testid="op-guardar" onClick={crear} className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400">Guardar</Button>
        </div>
      )}
      {lista.map((o) => (
        <div key={o.id} data-testid={`op-row-${o.id}`} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ESTADO_COLORS[o.estado] }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-100">{o.nombre}</div>
            <div className="truncate text-xs text-zinc-500">{o.placa} · {nombreRuta(o.ruta_asignada)}</div>
          </div>
          <span className="text-xs text-zinc-400">{ESTADO_LABEL[o.estado]}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Clientes ---------------- */
function ClientesPanel() {
  const [clientes, setClientes] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [historial, setHistorial] = useState({});
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ nombre: "", telefono: "" });

  const load = useCallback(() => api.get("/clientes").then((r) => setClientes(r.data)), []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!historial[id]) {
      const { data } = await api.get(`/clientes/${id}`);
      setHistorial((h) => ({ ...h, [id]: data.historial_servicios || [] }));
    }
  };
  const crear = async () => {
    if (!f.nombre || !f.telefono) { toast.error("Nombre y teléfono requeridos"); return; }
    await api.post("/clientes", f);
    toast.success("Cliente creado");
    setF({ nombre: "", telefono: "" }); setNuevo(false); load();
  };

  return (
    <div className="space-y-2">
      <Button data-testid="nuevo-cliente-btn" onClick={() => setNuevo((v) => !v)} className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
        <Plus className="mr-1 h-4 w-4" /> Nuevo cliente
      </Button>
      {nuevo && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3" data-testid="form-cliente">
          <Input value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="cli-nombre" />
          <Input value={f.telefono} onChange={(e) => setF((p) => ({ ...p, telefono: e.target.value }))} placeholder="Teléfono" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="cli-telefono" />
          <Button data-testid="cli-guardar" onClick={crear} className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400">Guardar</Button>
        </div>
      )}
      {clientes.length === 0 && <Empty>No hay clientes registrados</Empty>}
      {clientes.map((c) => (
        <div key={c.id} data-testid={`cliente-row-${c.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900">
          <button onClick={() => toggle(c.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
            {expanded === c.id ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-100">{c.nombre}</div>
              <div className="truncate text-xs text-zinc-500">{c.telefono}</div>
            </div>
          </button>
          {expanded === c.id && (
            <div className="border-t border-zinc-800 px-3 py-2">
              <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Historial de servicios</div>
              {(historial[c.id] || []).length === 0 && <div className="text-xs text-zinc-600">Sin servicios</div>}
              {(historial[c.id] || []).map((s) => (
                <div key={s.id} className="border-b border-zinc-800/60 py-1.5 text-xs text-zinc-300 last:border-0">
                  {s.origen?.texto} → {s.destino?.texto} <span className="text-zinc-500">· {s.estado}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ServiciosPanel() {
  const [servicios, setServicios] = useState([]);
  useEffect(() => { api.get("/servicios/hoy").then((r) => setServicios(r.data)); }, []);
  const COLORS = { pendiente: "#eab308", asignado: "#3b82f6", en_curso: "#a855f7", completado: "#22c55e", cancelado: "#ef4444" };
  return (
    <div className="space-y-2">
      {servicios.length === 0 && <Empty>No hay servicios hoy</Empty>}
      {servicios.map((s) => (
        <div key={s.id} data-testid={`servicio-hoy-${s.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-zinc-100">{s.origen_texto || s.origen?.texto || "—"} → {s.destino_texto || s.destino?.texto || "—"}</div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: (COLORS[s.estado] || "#6b7280") + "22", color: COLORS[s.estado] || "#9ca3af" }}>{s.estado}</span>
          </div>
          <div className="text-xs text-zinc-500">
            {s.operador_nombre || "Sin asignar"}
            {s.costo != null ? ` · $${s.costo}` : ""}
            {s.tipo === "operador" ? " · reportado por taxista" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Reportes ---------------- */
function ReportesPanel({ liveReporte }) {
  const [reportes, setReportes] = useState([]);
  const load = useCallback(() => api.get("/reportes").then((r) => setReportes(r.data)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveReporte) load(); }, [liveReporte, load]);

  const resolver = async (id) => {
    await api.patch(`/reportes/${id}/resolver`);
    toast.success("Reporte marcado como resuelto");
    load();
  };

  return (
    <div className="space-y-3">
      {reportes.length === 0 && <Empty>No hay objetos reportados</Empty>}
      {reportes.map((r) => (
        <div key={r.id} data-testid={`reporte-row-${r.id}`} className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
          <img
            src={`${BACKEND_URL}${r.foto_url}`}
            alt="objeto"
            className="h-16 w-16 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-zinc-100">{r.descripcion || "Sin descripción"}</div>
            <div className="text-xs text-zinc-500">{r.operador_nombre} · {r.operador_placa}</div>
            <div className="text-xs text-zinc-600">{timeAgo(r.timestamp)}</div>
            {r.estado === "pendiente" ? (
              <Button data-testid={`resolver-${r.id}`} size="sm" onClick={() => resolver(r.id)} className="mt-1.5 h-7 bg-emerald-500 text-xs text-zinc-950 hover:bg-emerald-400">
                <Check className="mr-1 h-3 w-3" /> Marcar resuelto
              </Button>
            ) : (
              <span className="mt-1.5 inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-emerald-400">Resuelto</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Chat ---------------- */
function ChatPanel({ liveMessage }) {
  const [convos, setConvos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");

  const loadConvos = useCallback(() => api.get("/conversaciones").then((r) => setConvos(r.data)), []);
  useEffect(() => { loadConvos(); }, [loadConvos]);

  const abrir = async (oid) => {
    setActivo(oid);
    const { data } = await api.get(`/mensajes?operador_id=${oid}`);
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
    await api.post("/mensajes", { operador_id: activo, remitente: "terminal", texto: t });
  };

  if (activo) {
    const convo = convos.find((c) => c.operador_id === activo);
    return (
      <div className="flex h-full flex-col">
        <button onClick={() => setActivo(null)} className="mb-2 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100">
          <ChevronRight className="h-3 w-3 rotate-180" /> Conversaciones
        </button>
        <div className="mb-2 text-sm font-semibold text-zinc-100">{convo?.operador_nombre || "Operador"}</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-testid="chat-mensajes">
          {mensajes.map((m) => (
            <div key={m.id} className={`flex ${m.remitente === "terminal" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.remitente === "terminal" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-100"
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
            className="bg-zinc-800 border-zinc-700 text-zinc-100"
          />
          <Button data-testid="chat-enviar" onClick={enviar} size="icon" className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {convos.length === 0 && <Empty>No hay conversaciones</Empty>}
      {convos.map((c) => (
        <button
          key={c.operador_id}
          data-testid={`convo-${c.operador_id}`}
          onClick={() => abrir(c.operador_id)}
          className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left hover:border-zinc-700"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-400">
            {c.operador_nombre?.[0] || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-100">{c.operador_nombre}</div>
            <div className="truncate text-xs text-zinc-500">
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
    await api.post("/rutas", { nombre, color_hex: color });
    setNombre(""); setColor("#00b894");
    toast.success("Ruta creada");
    onRutasChanged();
  };

  const actualizar = async (id, patch) => {
    await api.put(`/rutas/${id}`, patch);
    onRutasChanged();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Nueva ruta</div>
        <div className="flex items-center gap-2">
          <input
            data-testid="ruta-color-nueva"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-800"
          />
          <Input
            data-testid="ruta-nombre-nueva"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la ruta"
            className="bg-zinc-800 border-zinc-700 text-zinc-100"
          />
          <Button data-testid="ruta-crear" onClick={crear} size="icon" className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {rutas.map((r) => (
          <div key={r.id} data-testid={`ruta-row-${r.id}`} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
            <input
              type="color"
              value={r.color_hex}
              onChange={(e) => actualizar(r.id, { color_hex: e.target.value })}
              className="h-8 w-8 shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-800"
            />
            <Input
              defaultValue={r.nombre}
              onBlur={(e) => e.target.value !== r.nombre && actualizar(r.id, { nombre: e.target.value })}
              className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Tarifas ---------------- */
function TarifasPanel() {
  const [tarifas, setTarifas] = useState([]);
  const [f, setF] = useState({ nombre: "", monto: "" });
  const load = useCallback(() => api.get("/tarifas").then((r) => setTarifas(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const crear = async () => {
    if (!f.nombre || !f.monto) { toast.error("Nombre y precio requeridos"); return; }
    await api.post("/tarifas", { nombre: f.nombre, monto: Number(f.monto), orden: tarifas.length + 1 });
    setF({ nombre: "", monto: "" }); load();
  };
  const actualizar = async (t, patch) => { await api.put(`/tarifas/${t.id}`, { nombre: t.nombre, monto: t.monto, tipo: t.tipo || "fijo", orden: t.orden || 0, ...patch }); load(); };
  const eliminar = async (id) => { await api.delete(`/tarifas/${id}`); load(); };
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Nueva tarifa</div>
        <div className="flex gap-2">
          <Input value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" className="h-8 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="tarifa-nombre" />
          <Input type="number" value={f.monto} onChange={(e) => setF((p) => ({ ...p, monto: e.target.value }))} placeholder="$" className="h-8 w-20 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" data-testid="tarifa-monto" />
          <Button data-testid="tarifa-crear" onClick={crear} size="icon" className="h-8 w-9 bg-emerald-500 text-zinc-950 hover:bg-emerald-400"><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      {tarifas.map((t) => (
        <div key={t.id} data-testid={`tarifa-row-${t.id}`} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <Input defaultValue={t.nombre} onBlur={(e) => e.target.value !== t.nombre && actualizar(t, { nombre: e.target.value })} className="h-8 flex-1 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" />
          <Input type="number" defaultValue={t.monto} onBlur={(e) => Number(e.target.value) !== t.monto && actualizar(t, { monto: Number(e.target.value) })} className="h-8 w-20 border-zinc-700 bg-zinc-800 text-sm text-zinc-100" />
          <button data-testid={`tarifa-del-${t.id}`} onClick={() => eliminar(t.id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }) {
  return <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">{children}</div>;
}
