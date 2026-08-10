import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate } from "react-router-dom";
import { api, WS_BASE, BACKEND_URL, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { taxiIcon, colorForOperador } from "@/lib/taxiIcon";
import { ServicioModal } from "@/components/ServicioModal";
import { TerminalMenu } from "@/components/TerminalMenu";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { getTerminalToken, getTerminalUser, logoutTerminal } from "@/pages/TerminalLogin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Radio, PhoneCall, Filter, Car, Search, LogOut } from "lucide-react";

const CENTER = [17.5099, -91.9847]; // Palenque, Chiapas
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

function MapClick({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}
const pointIcon = (label, color) =>
  L.divIcon({
    className: "", iconSize: [1, 1], iconAnchor: [0, 0],
    html: `<div style="transform:translate(-50%,-100%)"><div style="background:${color};color:#0a0a0a;font-weight:800;border:2px solid #0a0a0a;border-radius:8px;padding:2px 7px;font-size:11px">${label}</div></div>`,
  });

export default function Terminal() {
  const [operadores, setOperadores] = useState({}); // keyed by id
  const [rutas, setRutas] = useState([]);
  const [filtroRuta, setFiltroRuta] = useState("todas");
  const [connected, setConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [, setTick] = useState(0);
  const [liveMessage, setLiveMessage] = useState(null);
  const [liveReporte, setLiveReporte] = useState(null);
  const wsRef = useRef(null);

  // Refresca los "hace X seg" cada 5s
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const navigate = useNavigate();
  useEffect(() => { if (!getTerminalToken()) navigate("/terminal/login"); }, [navigate]);

  const [servicioForm, setServicioForm] = useState({ cliente_nombre: "", cliente_telefono: "", origen: "", destino: "", operador_id: "" });
  const [coords, setCoords] = useState({ origen: null, destino: null });
  const [picking, setPicking] = useState(null);

  const abrirNuevaLlamada = () => {
    setServicioForm({ cliente_nombre: "", cliente_telefono: "", origen: "", destino: "", operador_id: "" });
    setCoords({ origen: null, destino: null });
    setModalOpen(true);
  };
  const pedirPunto = (which) => { setModalOpen(false); setPicking(which); toast.info(`Haz clic en el mapa para marcar el ${which}`); };
  const onMapClick = (latlng) => {
    if (!picking) return;
    setCoords((c) => ({ ...c, [picking]: { lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6) } }));
    setPicking(null); setModalOpen(true);
  };
  const clearPick = (which) => setCoords((c) => ({ ...c, [which]: null }));
  const salirTerminal = () => { logoutTerminal(); navigate("/terminal/login"); };

  const termUser = getTerminalUser();
  const [logo, setLogo] = useState(null);
  const [termFoto, setTermFoto] = useState(termUser?.foto_url || null);
  const termFotoRef = useRef(null);
  useEffect(() => { api.get("/config/logo").then((r) => setLogo(r.data.foto_url || null)).catch(() => {}); }, []);
  const subirTermFoto = async (file) => {
    if (!file || !termUser) return;
    const fd = new FormData(); fd.append("foto", file);
    const { data } = await api.post(`/perfil/usuarios_terminal/${termUser.id}/foto`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    setTermFoto(data.foto_url);
    localStorage.setItem("term_data", JSON.stringify({ ...termUser, foto_url: data.foto_url }));
    toast.success("Foto actualizada");
  };

  const upsert = useCallback((op) => {
    setOperadores((prev) => ({ ...prev, [op.id]: { ...prev[op.id], ...op } }));
  }, []);

  const load = useCallback(async () => {
    const [ops, rts] = await Promise.all([api.get("/operadores"), api.get("/rutas")]);
    const map = {};
    ops.data.forEach((o) => { map[o.id] = o; });
    setOperadores(map);
    setRutas(rts.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // WebSocket en vivo
  useEffect(() => {
    let closed = false;
    let timer;
    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/terminal`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ubicacion") {
          setOperadores((prev) => prev[msg.operador_id]
            ? { ...prev, [msg.operador_id]: { ...prev[msg.operador_id], lat: msg.lat, lng: msg.lng, ultima_actualizacion: msg.ts } }
            : prev);
        } else if (msg.type === "estado") {
          setOperadores((prev) => prev[msg.operador_id]
            ? { ...prev, [msg.operador_id]: { ...prev[msg.operador_id], estado: msg.estado } }
            : prev);
        } else if (msg.type === "servicio") {
          toast.info("Servicio actualizado en el sistema");
        } else if (msg.type === "mensaje") {
          setLiveMessage(msg.mensaje);
        } else if (msg.type === "reporte") {
          setLiveReporte(msg.reporte);
          toast.info("🎒 Nuevo objeto reportado");
        }
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
  }, []);

  const lista = useMemo(() => Object.values(operadores), [operadores]);

  const rutaSel = useMemo(
    () => (filtroRuta === "todas" ? null : rutas.find((r) => r.id === filtroRuta)),
    [filtroRuta, rutas]
  );

  const visibles = useMemo(() => {
    return lista.filter((o) => {
      if (o.lat == null || o.lng == null) return false;
      if (o.estado === "fuera_de_servicio") return false;
      if (filtroRuta !== "todas" && o.ruta_asignada !== filtroRuta) return false;
      return true;
    });
  }, [lista, filtroRuta]);

  const operadoresLibres = useMemo(
    () => lista.filter((o) => o.estado === "libre"),
    [lista]
  );

  const visiblesBuscados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return visibles;
    return visibles.filter((o) =>
      o.nombre.toLowerCase().includes(q) || (o.placa || "").toLowerCase().includes(q)
    );
  }, [visibles, busqueda]);

  const nombreRuta = (id) => rutas.find((r) => r.id === id)?.nombre || "Taxi libre";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      {/* MAPA (elemento principal, a pantalla completa) */}
      <div className="absolute inset-0 z-0" data-testid="terminal-map">
        <MapContainer center={CENTER} zoom={13} zoomControl={false} className="h-full w-full">
          <TileLayer
            url={DARK_TILES}
            attribution='&copy; OpenStreetMap &copy; CARTO'
            subdomains="abcd"
          />
          <MapClick onClick={onMapClick} />
          {coords.origen && <Marker position={[coords.origen.lat, coords.origen.lng]} icon={pointIcon("Origen", "#22c55e")} />}
          {coords.destino && <Marker position={[coords.destino.lat, coords.destino.lng]} icon={pointIcon("Destino", "#ef4444")} />}
          {visibles.map((o) => (
            <Marker
              key={o.id}
              position={[o.lat, o.lng]}
              icon={taxiIcon(colorForOperador(o, rutaSel?.color_hex), o.placa)}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{o.nombre}</div>
                  <div>Unidad: {o.placa}</div>
                  <div>Estado: {ESTADO_LABEL[o.estado]}</div>
                  <div>Ruta: {nombreRuta(o.ruta_asignada)}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Barra superior flotante */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-center justify-between p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/85 px-3 py-2.5 backdrop-blur-md">
          <button onClick={() => termFotoRef.current?.click()} data-testid="term-foto-btn" className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-emerald-500/15">
            {termFoto ? <img src={`${BACKEND_URL}${termFoto}`} alt="perfil" className="h-full w-full object-cover" />
              : logo ? <img src={`${BACKEND_URL}${logo}`} alt="logo" className="h-full w-full object-contain p-0.5" />
              : <Car className="h-5 w-5 text-emerald-400" />}
          </button>
          <input ref={termFotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => subirTermFoto(e.target.files?.[0])} />
          <div>
            <h1 className="text-sm font-bold leading-none text-zinc-50">{termUser?.nombre || "Terminal"}</h1>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <Radio className={`h-3 w-3 ${connected ? "text-emerald-400" : "text-zinc-600"}`} />
              {connected ? "En vivo" : "Reconectando..."}
            </div>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/85 p-1 backdrop-blur-md">
          <Button
            data-testid="nueva-llamada-btn"
            onClick={abrirNuevaLlamada}
            className="bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <PhoneCall className="mr-2 h-4 w-4" /> Nueva llamada
          </Button>
          <ThemeSwitcher />
          <button data-testid="terminal-logout" onClick={salirTerminal} title="Salir" className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {picking && (
        <div className="absolute left-1/2 top-20 z-[700] -translate-x-1/2 rounded-full border border-emerald-500 bg-zinc-900/95 px-4 py-2 text-sm text-emerald-300 backdrop-blur" data-testid="picking-banner">
          Haz clic en el mapa para marcar el {picking}
          <button className="ml-3 text-zinc-400 underline" onClick={() => { setPicking(null); setModalOpen(true); }}>cancelar</button>
        </div>
      )}

      {/* Panel lateral flotante: filtro + lista */}
      <aside
        data-testid="terminal-sidebar"
        className="absolute bottom-4 left-4 top-24 z-[500] flex w-72 flex-col gap-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/85 p-3 backdrop-blur-md"
      >
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            <Filter className="h-3.5 w-3.5" /> Filtrar por ruta
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              data-testid="filtro-todas"
              onClick={() => setFiltroRuta("todas")}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filtroRuta === "todas"
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              Todas
            </button>
            {rutas.map((r) => (
              <button
                key={r.id}
                data-testid={`filtro-ruta-${r.id}`}
                onClick={() => setFiltroRuta(r.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  filtroRuta === r.id
                    ? "border-zinc-100 bg-zinc-800 text-zinc-50"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color_hex }} />
                {r.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-zinc-800" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Taxis activos ({visiblesBuscados.length})
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <Input
              data-testid="buscar-taxi"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o unidad"
              className="h-8 border-zinc-700 bg-zinc-800/70 pl-8 text-xs text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-1.5">
            {visiblesBuscados.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-500">
                No hay taxis en operación
              </div>
            )}
            {visiblesBuscados.map((o) => (
              <div
                key={o.id}
                data-testid={`operador-item-${o.id}`}
                className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-2.5 py-2"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: ESTADO_COLORS[o.estado] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm text-zinc-100">{o.nombre}</div>
                    <div className="shrink-0 text-[10px] text-zinc-500">{timeAgo(o.ultima_actualizacion)}</div>
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {o.placa} · {ESTADO_LABEL[o.estado]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leyenda */}
        <div className="grid grid-cols-2 gap-1 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
          {Object.entries(ESTADO_LABEL).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: ESTADO_COLORS[k] }} />
              {label}
            </div>
          ))}
        </div>
      </aside>

      <ServicioModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        operadoresLibres={operadoresLibres}
        onCreated={() => load()}
        form={servicioForm}
        setForm={setServicioForm}
        coords={coords}
        onPick={pedirPunto}
        onClearPick={clearPick}
      />

      <TerminalMenu
        operadores={operadores}
        rutas={rutas}
        onRutasChanged={load}
        onDataChanged={load}
        onOpenServicio={abrirNuevaLlamada}
        liveMessage={liveMessage}
        liveReporte={liveReporte}
      />
    </div>
  );
}
