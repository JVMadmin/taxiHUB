import { useEffect, useMemo, useRef, useState, useCallback, useDeferredValue, startTransition } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./Terminal.css";
import { useNavigate } from "react-router-dom";
import { termApi, WS_BASE, BACKEND_URL, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { distM, fmtDist, fmtDuration, bearing, puntoAdelanteEnRuta } from "@/lib/geo";
import { pointIcon, taxiStateAssetIcon, routeArrowIcon } from "@/lib/taxiIcon";
import { useRouting } from "@/hooks/useRouting";
import { ServicioModal } from "@/components/ServicioModal";
import { TerminalMenu } from "@/components/TerminalMenu";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ModeToggle } from "@/components/ModeToggle";
import { DraggablePanel } from "@/components/DraggablePanel";
import { TerminalDisplayControls } from "@/components/TerminalDisplayControls";
import { RoutePolyline } from "@/components/RoutePolyline";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { EstadoBadge } from "@/components/StatusBadge";
import { ServiciosPanel } from "@/components/ServiciosPanel";
import { VehicleImage } from "@/components/VehicleImage";
import { getTerminalToken, getTerminalUser, logoutTerminal } from "@/pages/TerminalLogin";
import { useMode } from "@/hooks/useMode";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  PhoneCall, Filter, Car, Search, LogOut, Clock,
  LocateFixed, Navigation as NavIcon, ClipboardList, X, LayoutPanelLeft, Truck, User, Route as RouteIcon,
  Menu as MenuIcon, Plus, Minus,
} from "lucide-react";

const CENTER = [17.5099, -91.9847]; // Palenque, Chiapas
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function MapClick({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

// Expone la instancia del mapa (zoom desde el dock móvil).
function MapRefBridge({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

// Sigue al taxi seleccionado cuando `follow` está activo.
function FollowController({ target, follow }) {
  const map = useMap();
  const prevKey = useRef("");
  useEffect(() => {
    if (!follow || !target) return;
    const key = `${target.lat?.toFixed(5)},${target.lng?.toFixed(5)}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.9 });
  }, [follow, target, map]);
  return null;
}

// Reloj en vivo del centro de operaciones.
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const INDICADORES = [
  { estado: "libre", label: "Disponibles", color: "#22c55e" },
  { estado: "ocupado", label: "Ocupados", color: "#ef4444" },
  { estado: "no_disponible", label: "Pausados", color: "#eab308" },
  { estado: "fuera_de_servicio", label: "Offline", color: "#6b7280" },
  { estado: "averiado", label: "Averiados", color: "#a855f7" },
];

export default function Terminal() {
  const [operadores, setOperadores] = useState({});
  const [rutas, setRutas] = useState([]);
  const [filtroRuta, setFiltroRuta] = useState("todas");
  const [connected, setConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDeferred = useDeferredValue(busqueda);
  const [, setTick] = useState(0);
  const [liveMessage, setLiveMessage] = useState(null);
  const [liveReporte, setLiveReporte] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [follow, setFollow] = useState(false);
  const [track, setTrack] = useState(null);       // historial de recorrido del taxi seleccionado
  const [showTrack, setShowTrack] = useState(false);
  const [serviciosOpen, setServiciosOpen] = useState(() => window.innerWidth >= 1024);
  const [servicioFilterOp, setServicioFilterOp] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [servicioSignal, setServicioSignal] = useState(0);
  const [adminSection, setAdminSection] = useState(null);
  const mapRef = useRef(null);
  const wsRef = useRef(null);
  const now = useClock();
  const mode = useMode();
  const tiles = mode === "claro" ? LIGHT_TILES : DARK_TILES;
  const trackColor = mode === "claro" ? "#6b7280" : "#94a3b8";

  // Transparencia de la interfaz (slider Ajustes de pantalla).
  const [uiAlpha, setUiAlpha] = useState(() => {
    const v = parseFloat(localStorage.getItem("th_ui_alpha") || "");
    return Number.isFinite(v) ? Math.min(0.95, Math.max(0.4, v)) : 0.85;
  });
  useEffect(() => { localStorage.setItem("th_ui_alpha", String(uiAlpha)); }, [uiAlpha]);

  // Ruta del servicio activo del taxi seleccionado (ruta real OSRM).
  const [verRutaServicio, setVerRutaServicio] = useState(true);
  const [servicioActivo, setServicioActivo] = useState(null);

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
    setAdminSection(null);
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
  useEffect(() => { termApi.get("/config/logo").then((r) => setLogo(r.data.foto_url || null)).catch(() => {}); }, []);
  const subirTermFoto = async (file) => {
    if (!file || !termUser) return;
    const fd = new FormData(); fd.append("foto", file);
    const { data } = await termApi.post(`/perfil/usuarios_terminal/${termUser.id}/foto`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    setTermFoto(data.foto_url);
    localStorage.setItem("term_data", JSON.stringify({ ...termUser, foto_url: data.foto_url }));
    toast.success("Foto actualizada");
  };

  const upsert = useCallback((op) => {
    setOperadores((prev) => ({ ...prev, [op.id]: { ...prev[op.id], ...op } }));
  }, []);

  const load = useCallback(async () => {
    if (!getTerminalToken()) return;
    try {
      const [ops, rts] = await Promise.all([termApi.get("/operadores"), termApi.get("/rutas")]);
      const map = {};
      ops.data.forEach((o) => { map[o.id] = o; });
      setOperadores(map);
      setRutas(rts.data);
    } catch { /* sin sesión: se redirige al login */ }
  }, []);

  useEffect(() => { if (getTerminalToken()) load(); }, [load]);

  // WebSocket en vivo
  useEffect(() => {
    if (!getTerminalToken()) return;
    let closed = false;
    let timer;
    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/terminal?token=${encodeURIComponent(getTerminalToken() || "")}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ubicacion") {
          startTransition(() => setOperadores((prev) => prev[msg.operador_id]
            ? { ...prev, [msg.operador_id]: { ...prev[msg.operador_id], lat: msg.lat, lng: msg.lng, ultima_actualizacion: msg.ts } }
            : prev));
        } else if (msg.type === "estado") {
          startTransition(() => setOperadores((prev) => prev[msg.operador_id]
            ? { ...prev, [msg.operador_id]: { ...prev[msg.operador_id], estado: msg.estado } }
            : prev));
        } else if (msg.type === "servicio") {
          setServicioSignal((n) => n + 1);
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

  // Indicadores en tiempo real
  const counts = useMemo(() => {
    const c = {};
    INDICADORES.forEach((i) => { c[i.estado] = 0; });
    lista.forEach((o) => { if (c[o.estado] != null) c[o.estado] += 1; });
    return c;
  }, [lista]);

  const visiblesBuscados = useMemo(() => {
    const q = busquedaDeferred.trim().toLowerCase();
    if (!q) return visibles;
    return visibles.filter((o) =>
      o.nombre.toLowerCase().includes(q) || (o.placa || "").toLowerCase().includes(q)
    );
  }, [visibles, busquedaDeferred]);

  const selectedOp = selectedId ? operadores[selectedId] : null;

  // Historial de recorrido del taxi seleccionado (Fase 10), refrescado en vivo.
  useEffect(() => {
    setTrack(null);
    setShowTrack(false);
    if (!selectedId) return;
    let cancelled = false;
    const loadTrack = () => {
      termApi.get(`/operadores/${selectedId}/track`).then((r) => {
        if (!cancelled) setTrack(r.data.track || []);
      }).catch(() => {});
    };
    loadTrack();
    const t = setInterval(loadTrack, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, [selectedId]);

  // Servicio activo del taxi seleccionado (asignado/en_curso) → ruta a destino.
  useEffect(() => {
    if (!selectedId) { setServicioActivo(null); return; }
    let cancelled = false;
    const f = () => termApi.get("/servicios/hoy").then((r) => {
      if (cancelled) return;
      const all = r.data || [];
      const sv = all.find((s) =>
        s.operador_asignado_id === selectedId && ["asignado", "en_curso"].includes(s.estado)
      ) || null;
      setServicioActivo(sv);
    }).catch(() => {});
    f();
    const t = setInterval(f, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, [selectedId, servicioSignal]);

  // Ruta real (OSRM) desde la posición del taxi seleccionado hasta su destino.
  const servicioDestino = servicioActivo?.destino?.lat != null ? servicioActivo.destino : null;
  const rutaOrigen = useMemo(
    () => (selectedOp?.lat != null ? { lat: selectedOp.lat, lng: selectedOp.lng } : null),
    [selectedOp?.lat, selectedOp?.lng]
  );
  const rutaServicio = useRouting(
    rutaOrigen,
    servicioDestino,
    { enabled: !!selectedOp && !!servicioActivo && verRutaServicio && !!servicioDestino, client: termApi }
  );

  // Rumbo del taxi seleccionado: apunta al siguiente tramo de la ruta a destino.
  const destinoHeading = useMemo(() => {
    const origen = selectedOp?.lat != null ? { lat: selectedOp.lat, lng: selectedOp.lng } : null;
    if (origen && rutaServicio.latlngs?.length > 1) {
      const ahead = puntoAdelanteEnRuta(origen, rutaServicio.latlngs, 150);
      if (ahead) return ahead.brg;
    }
    if (origen && servicioDestino) return bearing(origen.lat, origen.lng, servicioDestino.lat, servicioDestino.lng);
    if (selectedOp?.gps_heading != null) return selectedOp.gps_heading;
    return 0;
  }, [selectedOp, rutaServicio.latlngs, servicioDestino]);

  const trackStats = useMemo(() => {
    if (!track || track.length < 2) return null;
    let dist = 0;
    for (let i = 1; i < track.length; i++) dist += distM(track[i - 1], track[i]) || 0;
    const t0 = new Date(track[0].ts).getTime();
    const t1 = new Date(track[track.length - 1].ts).getTime();
    return { dist, dur: (t1 - t0) / 1000, points: track.length };
  }, [track]);

  const nombreRuta = (id) => rutas.find((r) => r.id === id)?.nombre || "Taxi libre";

  const hora = now.toLocaleTimeString("es-MX", { hour12: false });

  return (
    <div className="taxi-terminal-shell relative h-screen w-screen overflow-hidden bg-background" style={{ "--ui-alpha": uiAlpha }}>
      {/* MAPA (elemento principal, a pantalla completa) */}
      <div className="absolute inset-0 z-0" data-testid="terminal-map">
        <MapContainer center={CENTER} zoom={13} zoomControl={false} className="h-full w-full">
          <TileLayer
            url={tiles}
            attribution="&copy; OpenStreetMap &copy; CARTO"
            subdomains="abcd"
          />
          <ZoomControl position="bottomleft" />
          <MapClick onClick={onMapClick} />
          <MapRefBridge mapRef={mapRef} />
          <FollowController target={selectedOp} follow={follow} />
          {coords.origen && <Marker position={[coords.origen.lat, coords.origen.lng]} icon={pointIcon("Origen", "#22c55e")} />}
          {coords.destino && <Marker position={[coords.destino.lat, coords.destino.lng]} icon={pointIcon("Destino", "#ef4444")} />}
          {showTrack && track && track.length > 1 && (
            <Polyline
              positions={track.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: trackColor, weight: 3, opacity: 0.55, dashArray: "4 6" }}
            />
          )}
          {/* Ruta real (OSRM) del servicio activo del taxi seleccionado */}
          {verRutaServicio && servicioActivo && rutaServicio.latlngs && rutaServicio.latlngs.length > 1 && (
            <>
              <Polyline positions={rutaServicio.latlngs} pathOptions={{ color: "#0b0b0d", weight: 10, opacity: 0.55, lineCap: "round" }} />
              <RoutePolyline
                positions={rutaServicio.latlngs}
                className="th-route-flow"
                pathOptions={{ color: "#22c55e", weight: 5, opacity: 0.95, dashArray: "1 14", lineCap: "round" }}
              />
              {servicioDestino && (
                <Marker position={[servicioDestino.lat, servicioDestino.lng]} icon={pointIcon("Destino", "#ef4444", { size: "lg" })}>
                  <Popup>
                    <div className="min-w-[140px] text-sm">
                      <div className="font-semibold text-foreground">Destino del servicio</div>
                      {servicioActivo.destino?.texto && <div className="mt-0.5 text-xs text-muted-foreground">{servicioActivo.destino.texto}</div>}
                      {rutaServicio.distance_m != null && (
                        <div className="mt-1.5 rounded-lg bg-secondary/70 px-2 py-1 text-center">
                          <span className="mono-num font-bold text-emerald-400">{fmtDist(rutaServicio.distance_m)}</span>
                          <span className="mx-1 text-muted-foreground">·</span>
                          <span className="mono-num font-bold text-foreground">{fmtDuration(rutaServicio.duration_s)}</span>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          )}
          {/* Indicador de dirección: flecha pulsando N metros adelante en la ruta */}
          {verRutaServicio && servicioActivo && rutaServicio.latlngs?.length > 1 && selectedOp?.lat != null && (() => {
            const ahead = puntoAdelanteEnRuta({ lat: selectedOp.lat, lng: selectedOp.lng }, rutaServicio.latlngs, 180);
            return ahead ? <Marker position={[ahead.lat, ahead.lng]} icon={routeArrowIcon()} /> : null;
          })()}
          {visibles.map((o) => (
            <Marker
              key={o.id}
              position={[o.lat, o.lng]}
              icon={taxiStateAssetIcon(o.estado, {
                label: o.placa,
                selected: selectedId === o.id,
                heading: o.id === selectedId ? destinoHeading : (o.gps_heading || 0),
              })}
              eventHandlers={{ click: () => { setSelectedId(o.id); setFollow(false); } }}
            >
              <Popup>
                <div className="min-w-[200px] text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{o.nombre}</span>
                    <EstadoBadge estado={o.estado} />
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    <div>Unidad: {o.vehiculo?.numero_economico || o.placa || "—"}</div>
                    <div>Ruta: {nombreRuta(o.ruta_asignada)}</div>
                    <div>GPS: {timeAgo(o.ultima_actualizacion)}</div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* HEADER — Instrument Cluster (consola unificada) */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-3 sm:p-4">
        <div className="bezel-shell pointer-events-auto">
          <div className="flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-1.5">
            {/* Identidad + estado del sistema */}
            <BrandMark size="sm" />
            <div className="hidden min-w-0 md:block">
              <BrandWordmark sub="Centro de operaciones" />
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-semibold text-foreground/85">
                  <LocateFixed className="h-3 w-3 text-brand-bright" />
                  Sitio: {termUser?.sitio_id ? termUser.sitio_id : "Principal"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" />
                  Sistema operativo
                </span>
                <span className="inline-flex items-center gap-1 font-mono mono-num text-foreground/85">
                  <Clock className="h-3 w-3" /> {hora}
                </span>
              </div>
            </div>

            {/* Indicadores de flota integrados en la consola */}
            <div className="mx-2 hidden h-9 w-px bg-border lg:block" />
            <div className="hidden items-center gap-4 lg:flex">
              {INDICADORES.map((i) => (
                <div key={i.estado} className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full" style={{ background: i.color }} />
                    <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: i.color }} />
                  </span>
                  <div className="leading-tight">
                    <div className="mono-num text-base font-bold" style={{ color: i.color }}>{counts[i.estado] || 0}</div>
                    <div className="text-[10px] text-muted-foreground">{i.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Acciones + perfil */}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setServiciosOpen((v) => !v)}
                data-testid="servicios-tray-toggle"
                title="Servicios"
                aria-label="Servicios"
                className={cn("th-3d hidden h-10 w-10 items-center justify-center rounded-xl transition-colors lg:flex",
                  serviciosOpen ? "bg-brand text-brand-contrast" : "text-foreground/80 hover:bg-secondary/60")}
              >
                <ClipboardList className="th-icon-3d h-5 w-5" />
              </button>
              <Button
                data-testid="nueva-llamada-btn"
                onClick={abrirNuevaLlamada}
                size="sm"
                className="hidden lg:inline-flex"
              >
                <PhoneCall className="th-icon-3d h-4 w-4" /> Nueva llamada
              </Button>
              <div className="hidden lg:contents">
                <ThemeSwitcher />
                <ModeToggle />
                <TerminalDisplayControls alpha={uiAlpha} onChange={setUiAlpha} />
              </div>
              <div className="flex items-center gap-2 border-l border-border pl-2.5">
                <button
                  onClick={() => termFotoRef.current?.click()}
                  data-testid="term-foto-btn"
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-brand/15"
                  title="Cambiar foto"
                >
                  {termFoto ? <img src={`${BACKEND_URL}${termFoto}`} alt="perfil" className="h-full w-full object-cover" />
                    : logo ? <img src={`${BACKEND_URL}${logo}`} alt="logo" className="h-full w-full object-contain p-0.5" />
                    : <Car className="h-5 w-5 text-brand-bright" />}
                </button>
                <input ref={termFotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => subirTermFoto(e.target.files?.[0])} />
                <div className="hidden sm:block">
                  <div className="text-sm font-bold leading-none text-foreground">{termUser?.nombre || "Operadora"}</div>
                  <div className="mt-1.5">
                    <ConnectionBadge state={connected ? "online" : "reconnecting"} />
                  </div>
                </div>
              </div>
              <button data-testid="terminal-logout" onClick={salirTerminal} title="Salir" aria-label="Salir" className="th-3d flex h-10 w-10 items-center justify-center rounded-xl text-foreground/80 hover:bg-secondary/60">
                <LogOut className="th-icon-3d h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Indicadores compactos (móvil) */}
        <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto lg:hidden">
          {INDICADORES.map((i) => (
            <span key={i.estado} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card/85 px-2.5 py-1 text-[11px] text-foreground/85 ring-1 ring-border">
              <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
              <span className="mono-num font-bold" style={{ color: i.color }}>{counts[i.estado] || 0}</span>
              {i.label}
            </span>
          ))}
        </div>
      </header>

      {/* Dock inferior (móvil/tablet): acciones principales + zoom */}
      <div
        data-testid="terminal-mobile-dock"
        className={cn(
          "pointer-events-auto absolute inset-x-3 bottom-3 z-[560] lg:hidden",
          (serviciosOpen || sidebarOpen || adminSection || selectedOp) && "hidden"
        )}
      >
        <div className="bezel-shell flex items-center gap-2 px-2 py-2">
          <Button
            data-testid="dock-nueva-llamada"
            onClick={abrirNuevaLlamada}
            size="sm"
            className="flex-1"
          >
            <PhoneCall className="th-icon-3d h-4 w-4" /> Llamada
          </Button>
          <div className="flex flex-col items-center gap-0.5">
            <button onClick={() => mapRef.current?.zoomIn()} data-testid="dock-zoom-in" aria-label="Acercar" className="th-3d flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 hover:bg-secondary/60">
              <Plus className="th-icon-3d h-4 w-4" />
            </button>
            <button onClick={() => mapRef.current?.zoomOut()} data-testid="dock-zoom-out" aria-label="Alejar" className="th-3d flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 hover:bg-secondary/60">
              <Minus className="th-icon-3d h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setServiciosOpen((v) => !v)}
            data-testid="dock-servicios"
            aria-label="Servicios"
            className={cn("th-3d flex h-11 w-11 items-center justify-center rounded-xl",
              serviciosOpen ? "bg-brand text-brand-contrast" : "text-foreground/80 hover:bg-secondary/60")}
          >
            <ClipboardList className="th-icon-3d h-5 w-5" />
          </button>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            data-testid="dock-flota"
            aria-label="Panel de flota"
            className={cn("th-3d flex h-11 w-11 items-center justify-center rounded-xl",
              sidebarOpen ? "bg-brand text-brand-contrast" : "text-foreground/80 hover:bg-secondary/60")}
          >
            <LayoutPanelLeft className="th-icon-3d h-5 w-5" />
          </button>
          <button
            onClick={() => setAdminSection((s) => (s ? null : "operadores"))}
            data-testid="dock-menu"
            aria-label="Menú de administración"
            className={cn("th-3d flex h-11 w-11 items-center justify-center rounded-xl",
              adminSection ? "bg-brand text-brand-contrast" : "text-foreground/80 hover:bg-secondary/60")}
          >
            <MenuIcon className="th-icon-3d h-5 w-5" />
          </button>
        </div>
      </div>

      {picking && (
        <div className="absolute left-1/2 top-32 z-[700] -translate-x-1/2 animate-slide-down rounded-full border border-brand bg-card/95 px-4 py-2 text-sm text-brand-bright backdrop-blur lg:top-24" data-testid="picking-banner">
          Haz clic en el mapa para marcar el {picking}
          <button className="ml-3 text-muted-foreground underline" onClick={() => { setPicking(null); setModalOpen(true); }}>cancelar</button>
        </div>
      )}

      {/* Panel lateral flotante: filtro + lista */}
      {sidebarOpen && (
        <DraggablePanel
          dragKey="sidebar"
          className="absolute bottom-4 left-4 top-[124px] z-[500] w-72 max-w-[calc(100vw-2rem)] lg:top-[104px]"
        >
          <aside
            data-testid="terminal-sidebar"
            className="bezel-shell flex h-full flex-col animate-slide-down"
          >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Truck className="h-3.5 w-3.5" /> Flota en operación
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground lg:hidden" aria-label="Cerrar panel de flota"><X className="h-4 w-4" /></button>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Filter className="h-3 w-3" /> Filtrar por ruta
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  data-testid="filtro-todas"
                  onClick={() => setFiltroRuta("todas")}
                  className={cn("chip", filtroRuta === "todas" && "chip-active")}
                >
                  Todas
                </button>
                {rutas.map((r) => (
                  <button
                    key={r.id}
                    data-testid={`filtro-ruta-${r.id}`}
                    onClick={() => setFiltroRuta(r.id)}
                    className={cn("chip", filtroRuta === r.id && "chip-active")}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color_hex }} />
                    {r.nombre}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Taxis activos</span>
                <span className="mono-num text-muted-foreground">{visiblesBuscados.length}</span>
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  data-testid="buscar-taxi"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o unidad"
                  className="input-inset h-8 border-border pl-8 text-xs text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-1.5">
                {visiblesBuscados.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No hay taxis en operación
                  </div>
                )}
                {visiblesBuscados.map((o) => (
                  <button
                    key={o.id}
                    data-testid={`operador-item-${o.id}`}
                    onClick={() => { setSelectedId(o.id); setFollow(false); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                      selectedId === o.id
                        ? "border-brand/50 bg-brand/10"
                        : "border-border bg-card/40 hover:border-border"
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: ESTADO_COLORS[o.estado] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm text-foreground">{o.nombre}</div>
                        <div className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(o.ultima_actualizacion)}</div>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {o.vehiculo?.numero_economico || o.placa} · {ESTADO_LABEL[o.estado]}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Leyenda */}
            <div className="grid grid-cols-2 gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
              {Object.entries(ESTADO_LABEL).map(([k, label]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: ESTADO_COLORS[k] }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </aside>
        </DraggablePanel>
      )}

      {/* Tray de servicios (dispatcher) */}
      <div className={cn(
        "absolute bottom-4 z-[520] transition-all duration-300 ease-motion",
        "left-4 right-4 mx-auto w-[400px] max-w-[calc(100vw-2rem)]",
        serviciosOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      )}>
        <DraggablePanel dragKey="tray">
          <div className="bezel-shell flex h-[340px] flex-col overflow-hidden">
          <div className="flex items-center justify-between rounded-[var(--radius)] border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-brand" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              Servicios
            </div>
            <div className="flex items-center gap-2">
              {servicioFilterOp && (
                <button
                  onClick={() => setServicioFilterOp(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand-bright hover:bg-brand/25"
                  data-testid="servicio-filtro-limpiar"
                >
                  Taxi {servicioFilterOp.placa || servicioFilterOp.id?.slice(-4)} <X className="h-3 w-3" />
                </button>
              )}
              <button onClick={() => setServiciosOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar servicios"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="servicios-tray">
            <ServiciosPanel reloadSignal={servicioSignal} filterOperadorId={servicioFilterOp?.id} />
          </div>
          </div>
        </DraggablePanel>
      </div>

      {/* Panel del taxi seleccionado — Mission Card */}
      {selectedOp && (
        <DraggablePanel
          dragKey="mission"
          className={cn(
            "absolute inset-x-3 z-[540] w-[300px] max-w-[calc(100vw-2rem)] lg:inset-x-auto lg:right-16",
            serviciosOpen ? "top-[124px] lg:top-[104px]" : "bottom-4"
          )}
        >
          <div data-testid="taxi-detail-panel" className="bezel-shell animate-slide-up">
          <div className="max-h-[calc(100vh-118px)] overflow-y-auto rounded-[var(--radius)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {selectedOp.vehiculo && (
                  <VehicleImage vehiculo={selectedOp.vehiculo} className="h-12 w-16 shrink-0 rounded-lg border border-border bg-surface-3" imgClassName="p-1" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-mono text-lg font-extrabold tracking-tight text-foreground">
                    {selectedOp.vehiculo?.numero_economico
                      ? `UNIDAD ${selectedOp.vehiculo.numero_economico}`
                      : selectedOp.placa}
                  </div>
                  <div className="mt-1.5">
                    <EstadoBadge estado={selectedOp.estado} pulse />
                  </div>
                </div>
              </div>
              <button onClick={() => { setSelectedId(null); setFollow(false); }} className="shrink-0 text-muted-foreground hover:text-foreground" data-testid="taxi-detail-close" aria-label="Cerrar detalle del taxi">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-foreground/90">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="font-medium">{selectedOp.nombre}</span>
              </div>
              {selectedOp.vehiculo && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {[selectedOp.vehiculo.marca, selectedOp.vehiculo.modelo].filter(Boolean).join(" ")}
                  {selectedOp.vehiculo.placa ? ` · ${selectedOp.vehiculo.placa}` : ""}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <RouteIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {nombreRuta(selectedOp.ruta_asignada)}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-border bg-card/60 p-2.5 text-center">
              <div className="data-cell">
                <span className="data-cell-label">Precisión</span>
                <span className="data-cell-value">{selectedOp.gps_accuracy != null ? `${Math.round(selectedOp.gps_accuracy)} m` : "—"}</span>
              </div>
              <div className="data-cell">
                <span className="data-cell-label">Velocidad</span>
                <span className="data-cell-value">{selectedOp.gps_speed != null ? `${Math.round(selectedOp.gps_speed * 3.6)} km/h` : "—"}</span>
              </div>
              <div className="data-cell">
                <span className="data-cell-label">GPS</span>
                <span className="data-cell-value text-emerald-400">{timeAgo(selectedOp.ultima_actualizacion)}</span>
              </div>
            </div>

            {trackStats && (
              <div className="mt-3 rounded-xl border border-border bg-card/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Recorrido en vivo</span>
                  <button
                    data-testid="ver-recorrido-btn"
                    onClick={() => setShowTrack((s) => !s)}
                    className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors",
                      showTrack ? "border-brand/50 bg-brand/10 text-brand-bright" : "border-border text-foreground/85 hover:border-border")}
                  >
                    {showTrack ? "Ocultar" : "Ver recorrido"}
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><b className="mono-num text-foreground">{fmtDist(trackStats.dist)}</b> recorridos</span>
                  <span><b className="mono-num text-foreground">{fmtDuration(trackStats.dur)}</b> ventana</span>
                  <span><b className="mono-num text-foreground">{trackStats.points}</b> puntos</span>
                </div>
              </div>
            )}

            {/* Ruta al destino del servicio activo */}
            {servicioActivo && (
              <div className="mt-3 rounded-xl border border-border surface-ui p-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <RouteIcon className="h-3 w-3" /> Ruta a destino
                  </span>
                  {servicioDestino ? (
                    <button
                      data-testid="terminal-ruta-toggle"
                      onClick={() => setVerRutaServicio((v) => !v)}
                      className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors",
                        verRutaServicio ? "border-brand/50 bg-brand/10 text-brand-bright" : "border-border text-foreground/85 hover:border-border")}
                    >
                      {verRutaServicio ? "Ocultar" : "Ver ruta"}
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">sin coordenadas</span>
                  )}
                </div>
                {servicioDestino && (
                  <>
                    <div className="mt-2 flex items-center gap-2 text-xs text-foreground/85">
                      <NavIcon className="h-3.5 w-3.5 shrink-0 text-brand-bright" />
                      <span className="truncate">{servicioActivo.destino?.texto || "Destino marcado en el mapa"}</span>
                    </div>
                    {rutaServicio.distance_m != null && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span><b className="mono-num text-emerald-400">{fmtDist(rutaServicio.distance_m)}</b> faltante</span>
                        <span><b className="mono-num text-foreground">{fmtDuration(rutaServicio.duration_s)}</b> ETA</span>
                        <span className="mono-num text-muted-foreground">{rutaServicio.provider === "osrm" ? "rutas reales" : "línea recta"}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                data-testid="seguir-taxi-btn"
                onClick={() => setFollow((f) => !f)}
                variant={follow ? "primary" : "secondary"}
                size="sm"
              >
                <NavIcon className="h-4 w-4" />
                {follow ? "Siguiendo" : "Seguir taxi"}
              </Button>
              <Button
                data-testid="ver-servicio-btn"
                onClick={() => { setServiciosOpen(true); setServicioFilterOp(selectedOp); }}
                variant="secondary"
                size="sm"
              >
                <ClipboardList className="h-4 w-4" /> Ver servicio
              </Button>
            </div>
          </div>
          </div>
        </DraggablePanel>
      )}

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
        active={adminSection}
        onActiveChange={setAdminSection}
        operadores={operadores}
        rutas={rutas}
        onRutasChanged={load}
        onDataChanged={load}
        onOpenServicio={abrirNuevaLlamada}
        liveMessage={liveMessage}
        liveReporte={liveReporte}
        servicioSignal={servicioSignal}
      />
    </div>
  );
}
