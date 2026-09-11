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
import { PALETA } from "@/design/status";
import { useRouting } from "@/hooks/useRouting";
import { ServicioModal } from "@/components/ServicioModal";
import { DespachoModal } from "@/components/ops/DespachoModal";
import { TerminalMenu } from "@/components/TerminalMenu";
import { DraggablePanel } from "@/components/DraggablePanel";
import { RoutePolyline } from "@/components/RoutePolyline";
import { getTerminalToken, getTerminalUser, logoutTerminal } from "@/pages/TerminalLogin";
import { useMode } from "@/hooks/useMode";
import { OpsTopbar } from "@/components/ops/OpsTopbar";
import { FleetPanel } from "@/components/ops/FleetPanel";
import { MissionCard } from "@/components/ops/MissionCard";
import { OpsMobileDock } from "@/components/ops/OpsMobileDock";
import { INDICADORES } from "@/components/ops/indicadores";
import { MapSearch } from "@/components/maps/MapSearch";
import { RecorridoGradiente } from "@/components/maps/RecorridoGradiente";
import { MaplibreVectorTileLayer } from "@/components/maps/MaplibreVectorTileLayer";
import { Layers, Satellite, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

const CENTER = [17.5099, -91.9847]; // Palenque, Chiapas

// Capa Satelital (Esri World Imagery alta resolución + etiquetas de lugares)
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_REF = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

// Vector Tiles vía TileServer-GL / MapLibre GL
// Si REACT_APP_TILESERVER_URL está configurado (ej. en el VPS con docker-compose.geo.yml), usa ese estilo local.
// Por defecto usa OpenFreeMap Liberty (vector tiles globales de OpenStreetMap de alta velocidad, 100% libres, sin API key).
const TILESERVER_URL = process.env.REACT_APP_TILESERVER_URL;
const VECTOR_STYLE_URL = TILESERVER_URL
  ? `${TILESERVER_URL}/styles/basic-preview/style.json`
  : "https://tiles.openfreemap.org/styles/liberty";

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

// Vuela a una ubicación (resultado del MapSearch).
function GotoController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 1.0 });
  }, [target, map]);
  return null;
}

// Invalida el tamaño del mapa cuando su contenedor cambia (split view,
// paneles que abren/cierran) — evita tiles desalineadas o huecos.
function SizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (!window.ResizeObserver) return;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
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
  const [servicioFilterOp, setServicioFilterOp] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [mapLayer, setMapLayer] = useState("calles"); // "calles" | "satelite"
  const userInteractedRef = useRef(false);

  // Auto-colapso de la sidebar a los 5s de inactividad inicial
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!userInteractedRef.current && window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const [servicioSignal, setServicioSignal] = useState(0);
  const [adminSection, setAdminSection] = useState(null);
  const [choferExpedienteId, setChoferExpedienteId] = useState(null);
  const [gotoTarget, setGotoTarget] = useState(null);
  const [puntoBuscado, setPuntoBuscado] = useState(null);
  const mapRef = useRef(null);
  const wsRef = useRef(null);
  const now = useClock();
  const mode = useMode();
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

  const [servicioForm, setServicioForm] = useState({ cliente_nombre: "", cliente_telefono: "" });
  const [coords, setCoords] = useState({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
  const [picking, setPicking] = useState(null);

  const abrirNuevaLlamada = () => {
    setServicioForm({ cliente_nombre: "", cliente_telefono: "" });
    setCoords({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
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
    } catch (e) {
      // Token inválido/revocado: no quedarse en pantalla vacía — mandar al login.
      if (e?.response?.status === 401) { logoutTerminal(); navigate("/terminal/login"); }
    }
  }, [navigate]);

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
      ws.onclose = (ev) => {
        setConnected(false);
        // Token inválido/revocado (p.ej. backend reiniciado con otro JWT_SECRET):
        // reintentar es inútil — forzar re-login.
        if (ev.code === 1008) {
          logoutTerminal();
          navigate("/terminal/login");
          return;
        }
        if (!closed) timer = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ubicacion") {
          startTransition(() => setOperadores((prev) => {
            const op = prev[msg.operador_id];
            if (!op) return prev;
            return {
              ...prev,
              [msg.operador_id]: {
                ...op,
                lat: msg.lat,
                lng: msg.lng,
                gps_heading: msg.gps_heading != null ? msg.gps_heading : op.gps_heading,
                gps_speed: msg.gps_speed != null ? msg.gps_speed : op.gps_speed,
                sentido_direccion: msg.sentido_direccion || op.sentido_direccion,
                ultima_actualizacion: msg.ts,
              },
            };
          }));
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
        } else if (msg.type === "destino_alcanzado") {
          // Auto-finalización por geofence (F5): aviso discreto, sin acción requerida.
          setServicioSignal((n) => n + 1);
          toast.success("Destino alcanzado — servicio completado automáticamente", {
            description: "El taxi volvió a disponible.",
            duration: 5000,
          });
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

  // Historial de recorrido del taxi seleccionado (proyectado a calle real + fallback crudo)
  useEffect(() => {
    setTrack(null);
    setShowTrack(false);
    if (!selectedId) return;
    let cancelled = false;
    const loadTrack = () => {
      termApi.get(`/operadores/${selectedId}/recorrido-ajustado`).then((r) => {
        if (!cancelled) setTrack(r.data.track || []);
      }).catch(() => {
        termApi.get(`/operadores/${selectedId}/track`).then((r) => {
          if (!cancelled) setTrack(r.data.track || []);
        }).catch(() => {});
      });
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
    <div className="taxi-terminal-shell flex h-screen w-screen overflow-hidden bg-background" style={{ "--ui-alpha": uiAlpha }}>
      {/* SIDEBAR IZQUIERDA — flota fija (split view premium, ya no flota sobre el mapa) */}
      {sidebarOpen && (
        <aside
          data-testid="terminal-sidebar"
          className="relative z-[400] hidden w-72 shrink-0 animate-fade-in flex-col border-r border-border bg-card md:flex"
        >
          <FleetPanel
            rutas={rutas}
            filtroRuta={filtroRuta}
            onFiltroRuta={setFiltroRuta}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            visibles={visiblesBuscados}
            selectedId={selectedId}
            onSelect={(o) => { setSelectedId(o.id); setFollow(false); }}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>
      )}

      {/* Overlay móvil de la sidebar */}
      {sidebarOpen && (
        <div className="absolute inset-y-0 left-0 z-[560] w-72 max-w-[85vw] border-r border-border bg-card shadow-2xl md:hidden">
          <FleetPanel
            rutas={rutas}
            filtroRuta={filtroRuta}
            onFiltroRuta={setFiltroRuta}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            visibles={visiblesBuscados}
            selectedId={selectedId}
            onSelect={(o) => { setSelectedId(o.id); setFollow(false); }}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Botón flotante para reabrir la sidebar de flota cuando está colapsada */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => { userInteractedRef.current = true; setSidebarOpen(true); }}
          className="absolute left-3 top-24 z-[450] hidden items-center gap-2 rounded-xl border border-border/80 bg-surface/90 px-3 py-2 text-xs font-semibold text-foreground shadow-2xl backdrop-blur transition-all hover:border-brand/50 hover:bg-surface-2 md:flex"
          title="Expandir panel de flota"
          data-testid="expand-sidebar-btn"
        >
          <ChevronRight className="h-4 w-4 text-brand-bright" />
          <span>Flota ({visibles.length})</span>
        </button>
      )}

      {/* ÁREA DE MAPA (protagonista) */}
      <div className="relative min-w-0 flex-1">
        {/* Toggle de capa de mapa: Calles vs Satélite */}
        <div className="absolute bottom-20 right-3 lg:bottom-auto lg:top-24 lg:right-20 z-[450] flex items-center gap-1 rounded-xl border border-border/80 bg-surface/90 p-1 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => setMapLayer("calles")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              mapLayer === "calles" ? "bg-brand/20 text-brand-bright font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="layer-calles-btn"
          >
            <Layers className="h-3.5 w-3.5" /> Calles
          </button>
          <button
            type="button"
            onClick={() => setMapLayer("satelite")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              mapLayer === "satelite" ? "bg-brand/20 text-brand-bright font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="layer-satelite-btn"
          >
            <Satellite className="h-3.5 w-3.5" /> Satélite
          </button>
        </div>

        <div className="absolute inset-0 z-0" data-testid="terminal-map">
          <MapContainer
            center={CENTER}
            zoom={13}
            zoomControl={false}
            zoomAnimation={true}
            markerZoomAnimation={false}
            wheelDebounceTime={40}
            className="h-full w-full"
          >
          {mapLayer === "satelite" ? (
            <>
              <TileLayer
                url={SATELLITE_TILES}
                attribution="Tiles &copy; Esri World Imagery"
                maxNativeZoom={18}
              />
              <TileLayer
                url={SATELLITE_REF}
                maxNativeZoom={18}
              />
            </>
          ) : (
            <MaplibreVectorTileLayer
              styleUrl={VECTOR_STYLE_URL}
            />
          )}
          <ZoomControl position="bottomleft" />
          <MapClick onClick={onMapClick} />
          <MapRefBridge mapRef={mapRef} />
          <FollowController target={selectedOp} follow={follow} />
          <GotoController target={gotoTarget} />
          <SizeInvalidator />
          {puntoBuscado && <Marker position={[puntoBuscado.lat, puntoBuscado.lng]} icon={pointIcon(puntoBuscado.label, PALETA.info, { size: "lg" })} />}
          {coords.origen && <Marker position={[coords.origen.lat, coords.origen.lng]} icon={pointIcon("Origen", PALETA.primary)} />}
          {coords.destino && <Marker position={[coords.destino.lat, coords.destino.lng]} icon={pointIcon("Destino", PALETA.danger)} />}
          {showTrack && track && track.length > 1 && (
            <RecorridoGradiente track={track} estado={selectedOp?.estado} />
          )}
          {/* Ruta real (OSRM) del servicio activo del taxi seleccionado */}
          {verRutaServicio && servicioActivo && rutaServicio.latlngs && rutaServicio.latlngs.length > 1 && (
            <>
              <Polyline positions={rutaServicio.latlngs} pathOptions={{ color: "#0b0b0d", weight: 10, opacity: 0.55, lineCap: "round" }} />
              <RoutePolyline
                positions={rutaServicio.latlngs}
                className="th-route-flow"
                pathOptions={{ color: PALETA.primary, weight: 5, opacity: 0.95, dashArray: "1 14", lineCap: "round" }}
              />
              {servicioDestino && (
                <Marker position={[servicioDestino.lat, servicioDestino.lng]} icon={pointIcon("Destino", PALETA.danger, { size: "lg" })}>
                  <Popup>
                    <div className="min-w-[140px] text-sm">
                      <div className="font-semibold text-foreground">Destino del servicio</div>
                      {servicioActivo.destino?.texto && <div className="mt-0.5 text-xs text-muted-foreground">{servicioActivo.destino.texto}</div>}
                      {rutaServicio.distance_m != null && (
                        <div className="mt-1.5 rounded-lg bg-secondary/70 px-2 py-1 text-center">
                          <span className="mono-num font-semibold text-emerald-400">{fmtDist(rutaServicio.distance_m)}</span>
                          <span className="mx-1 text-muted-foreground">·</span>
                          <span className="mono-num font-semibold text-foreground">{fmtDuration(rutaServicio.duration_s)}</span>
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
              zIndexOffset={selectedId === o.id ? 1000 : 0}
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
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold" style={{ color: ESTADO_COLORS[o.estado] }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: ESTADO_COLORS[o.estado] }} />
                      {ESTADO_LABEL[o.estado]}
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    <div>Unidad: {o.vehiculo?.numero_economico || o.placa || "—"}</div>
                    <div>Ruta: {nombreRuta(o.ruta_asignada)}</div>
                    {o.descripcion_sentido && (
                      <div className="text-emerald-400/90 font-medium">Sentido: {o.descripcion_sentido}</div>
                    )}
                    <div>GPS: {timeAgo(o.ultima_actualizacion)} ({Math.round(o.gps_heading || 0)}°)</div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* TOPBAR — consola del Command Center (DS 2.0) */}
      <OpsTopbar
        termUser={termUser}
        logo={logo ? `${BACKEND_URL}${logo}` : null}
        termFoto={termFoto ? `${BACKEND_URL}${termFoto}` : null}
        onFotoClick={() => termFotoRef.current?.click()}
        fotoInput={
          <input ref={termFotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => subirTermFoto(e.target.files?.[0])} />
        }
        connected={connected}
        counts={counts}
        hora={hora}
        serviciosOpen={adminSection === "servicios"}
        onToggleServicios={() => setAdminSection((s) => (s === "servicios" ? null : "servicios"))}
        onNuevaLlamada={abrirNuevaLlamada}
        uiAlpha={uiAlpha}
        onAlphaChange={setUiAlpha}
        onLogout={salirTerminal}
      />

      {/* Buscador geográfico global (F4) — centrado bajo la consola */}
      <div className="pointer-events-none absolute inset-x-0 top-[124px] z-[490] flex justify-center px-3 lg:top-[104px]">
        <MapSearch
          className="w-full max-w-md"
          onGoto={(r) => { setGotoTarget(r); setPuntoBuscado(r); }}
          onPickOrigen={(r) => {
            setCoords((c) => ({ ...c, origen: { lat: r.lat, lng: r.lng }, origenTexto: `${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}` }));
            setPuntoBuscado(null);
            setModalOpen(true);
          }}
          onPickDestino={(r) => {
            setCoords((c) => ({ ...c, destino: { lat: r.lat, lng: r.lng }, destinoTexto: `${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}` }));
            setPuntoBuscado(null);
            setModalOpen(true);
          }}
        />
      </div>

      {picking && (
        <div className="absolute left-1/2 top-32 z-[700] -translate-x-1/2 animate-slide-down rounded-full border border-brand bg-card/95 px-4 py-2 text-sm text-brand-bright backdrop-blur lg:top-24" data-testid="picking-banner">
          Haz clic en el mapa para marcar el {picking}
          <button className="ml-3 text-muted-foreground underline" onClick={() => { setPicking(null); setModalOpen(true); }}>cancelar</button>
        </div>
      )}

      {/* Dock inferior (móvil/tablet) */}
      <OpsMobileDock
        onNuevaLlamada={abrirNuevaLlamada}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        serviciosOpen={adminSection === "servicios"}
        onToggleServicios={() => setAdminSection((s) => (s === "servicios" ? null : "servicios"))}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        adminSection={adminSection}
        onToggleAdmin={() => setAdminSection((s) => (s ? null : "operadores"))}
        hidden={adminSection || sidebarOpen || selectedOp}
      />

      {/* Panel del taxi seleccionado — panel contextual (único flotante, solo cuando hay selección) */}
      {selectedOp && (
        <DraggablePanel
          dragKey="mission"
          className={cn(
            "absolute inset-x-3 z-[540] w-[300px] max-w-[calc(100vw-2rem)] lg:inset-x-auto lg:right-16",
            adminSection ? "top-[124px] lg:top-[104px]" : "bottom-4"
          )}
        >
          <MissionCard
            op={{ ...selectedOp, rutaNombre: nombreRuta(selectedOp.ruta_asignada) }}
            trackStats={trackStats}
            showTrack={showTrack}
            onToggleTrack={() => setShowTrack((s) => !s)}
            servicioActivo={servicioActivo}
            servicioDestino={servicioDestino}
            rutaServicio={rutaServicio}
            verRutaServicio={verRutaServicio}
            onToggleRuta={() => setVerRutaServicio((v) => !v)}
            follow={follow}
            onToggleFollow={() => setFollow((f) => !f)}
            onVerServicio={() => { setAdminSection("servicios"); setServicioFilterOp(selectedOp); }}
            onVerExpediente={() => { setChoferExpedienteId(selectedOp.id); setAdminSection("choferes"); }}
            onClose={() => { setSelectedId(null); setFollow(false); }}
          />
        </DraggablePanel>
      )}
      </div>

        <DespachoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          coords={coords}
          setCoords={setCoords}
          pedirPunto={pedirPunto}
          operadoresLibres={operadoresLibres}
          onCreated={() => load()}
        />

      <TerminalMenu
        active={adminSection}
        onActiveChange={setAdminSection}
        operadores={operadores}
        operadoresLibres={operadoresLibres}
        rutas={rutas}
        onRutasChanged={load}
        onDataChanged={load}
        onOpenServicio={abrirNuevaLlamada}
        onVerWaMapa={({ mensaje }) => {
          // §16/§47: ver la ubicación sin abrir formularios — solo mapa + pin.
          setGotoTarget({ lat: mensaje.lat, lng: mensaje.lng });
          setPuntoBuscado({ lat: mensaje.lat, lng: mensaje.lng, label: "Ubicación de WhatsApp" });
        }}
        onMarkWaLocation={({ conversacion, mensaje }) => {
          // Flujo WhatsApp→servicio (F4): la ubicación recibida se convierte
          // en origen del servicio; la operadora decide y asigna manualmente.
          setGotoTarget({ lat: mensaje.lat, lng: mensaje.lng });
          setPuntoBuscado({ lat: mensaje.lat, lng: mensaje.lng, label: conversacion.cliente_nombre });
          setServicioForm({
            cliente_nombre: conversacion.cliente_nombre || "",
            cliente_telefono: conversacion.cliente_telefono || "",
          });
          setCoords((c) => ({
            ...c,
            origen: { lat: mensaje.lat, lng: mensaje.lng },
            origenTexto: "Ubicación de WhatsApp",
          }));
          setModalOpen(true);
        }}
        onAssigned={() => { setAdminSection("servicios"); load(); }}
        choferExpedienteId={choferExpedienteId}
        liveMessage={liveMessage}
        liveReporte={liveReporte}
        servicioSignal={servicioSignal}
      />
    </div>
  );
}
