import { useEffect, useMemo, useRef, useState, useCallback, useDeferredValue, startTransition } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, CircleMarker, ZoomControl, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./Terminal.css";
import { useNavigate } from "react-router-dom";
import { termApi, WS_BASE, BACKEND_URL, ESTADO_COLORS, ESTADO_LABEL, fetchSitioConfig } from "@/lib/api";
import { applySitioBranding } from "@/lib/theme";
import { timeAgo } from "@/lib/time";
import { cn, fileUrl } from "@/lib/utils";
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
import { SmoothTaxiMarker } from "@/components/maps/SmoothTaxiMarker";
import { ColoniasLayer, getColoniaAt } from "@/components/maps/ColoniasLayer";
import { MapContextMenu } from "@/components/maps/MapContextMenu";
import { precargarTilesPalenque } from "@/lib/PalenqueTileCache";
import { Layers, Satellite, ChevronRight, ChevronLeft, Eye, EyeOff, Shapes, X, Zap, Flame } from "lucide-react";
import { toast } from "sonner";

const CENTER = [17.5099, -91.9847]; // Palenque, Chiapas

const FALLBACK_POIS = [
  { id: "poi_ado", nombre: "Terminal ADO", referencia: "Av. Juárez s/n", lat: 17.5139, lng: -91.9856 },
  { id: "poi_hospital", nombre: "Hospital General", referencia: "Sur Periférico", lat: 17.5077, lng: -91.9800 },
  { id: "poi_tren_maya", nombre: "Tren Maya", referencia: "Blvd. Aeropuerto", lat: 17.5359, lng: -91.9592 },
  { id: "poi_parque", nombre: "Parque Central", referencia: "Av. Hidalgo Centro", lat: 17.5096, lng: -91.9818 },
  { id: "poi_mercado", nombre: "Mercado Municipal", referencia: "Zona Comercial", lat: 17.5080, lng: -91.9835 },
  { id: "poi_zona_arq", nombre: "Zona Arqueológica", referencia: "Carretera Ruinas", lat: 17.4840, lng: -92.0458 },
];

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

const STREET_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const STREET_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function MapEventsHandler({ onClick, onContextMenu }) {
  useMapEvents({
    click: (e) => onClick(e.latlng),
    contextmenu: (e) => {
      e.originalEvent.preventDefault();
      onContextMenu({
        position: { x: e.originalEvent.clientX, y: e.originalEvent.clientY },
        latlng: e.latlng,
      });
    },
  });
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

/** Calcula flechas direccionales sobre un trazo [[lat, lng], ...] para mostrar el sentido de la calle */
function buildDirectionalArrows(points = [], maxArrows = 10) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const d = distM({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) || 0;
    if (d < 8) continue;
    segments.push({
      lat: (a[0] + b[0]) / 2,
      lng: (a[1] + b[1]) / 2,
      heading: bearing(a[0], a[1], b[0], b[1]),
      dist: d,
    });
  }
  if (segments.length <= maxArrows) return segments;
  const step = Math.max(1, Math.floor(segments.length / maxArrows));
  return segments.filter((_, idx) => idx % step === 0).slice(0, maxArrows);
}

/** Concatena segmentos viales [[lat, lng], ...] sin duplicar vértices de unión */
function flattenRouteSegments(waypoints, segments) {
  if (!segments || segments.length === 0) {
    return waypoints.length > 0 ? [waypoints[0]] : [];
  }
  const out = [];
  segments.forEach((seg, idx) => {
    if (!Array.isArray(seg) || seg.length === 0) return;
    if (idx === 0) {
      out.push(...seg);
    } else {
      out.push(...seg.slice(1));
    }
  });
  return out;
}

export default function Terminal() {
  const [operadores, setOperadores] = useState({});
  const [rutas, setRutas] = useState([]);
  const [colonias, setColonias] = useState([]);
  const [avisosActivos, setAvisosActivos] = useState([]);
  const [drawingMode, setDrawingMode] = useState(null); // null | "ruta" | "colonia"
  const [drawnPoints, setDrawnPoints] = useState([]);
  const [routeWaypoints, setRouteWaypoints] = useState([]);
  const [routingSegmentLoading, setRoutingSegmentLoading] = useState(false);
  const routeWaypointsRef = useRef([]);
  const routeSegmentsRef = useRef([]);

  const [filtroRuta, setFiltroRuta] = useState("todas");
  const [connected, setConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDeferred = useDeferredValue(busqueda);
  const [liveMessage, setLiveMessage] = useState(null);
  const [liveReporte, setLiveReporte] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [follow, setFollow] = useState(false);
  const [track, setTrack] = useState(null);       // historial de recorrido del taxi seleccionado
  const [showTrack, setShowTrack] = useState(false);
  const [servicioFilterOp, setServicioFilterOp] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [mapLayer, setMapLayer] = useState("calles"); // "calles" | "satelite"
  const [mostrarColonias, setMostrarColonias] = useState(false);
  const [mostrarFlota, setMostrarFlota] = useState(true);
  const [serviciosHoyList, setServiciosHoyList] = useState([]);

  const [servicioSignal, setServicioSignal] = useState(0);
  const [adminSection, setAdminSection] = useState(null);
  const [choferExpedienteId, setChoferExpedienteId] = useState(null);
  const [gotoTarget, setGotoTarget] = useState(null);
  const [puntoBuscado, setPuntoBuscado] = useState(null);
  const mapRef = useRef(null);
  const wsRef = useRef(null);
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

  const navigate = useNavigate();
  useEffect(() => { if (!getTerminalToken()) navigate("/terminal/login"); }, [navigate]);

  const [servicioForm, setServicioForm] = useState({ cliente_nombre: "", cliente_telefono: "" });
  const [coords, setCoords] = useState({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
  const [picking, setPicking] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const handleClearDrawnPoints = useCallback(() => {
    routeWaypointsRef.current = [];
    routeSegmentsRef.current = [];
    setRouteWaypoints([]);
    setDrawnPoints([]);
    setRoutingSegmentLoading(false);
  }, []);

  const handleUndoDrawnPoint = useCallback(() => {
    if (drawingMode === "ruta") {
      if (routeWaypointsRef.current.length <= 1) {
        handleClearDrawnPoints();
        return;
      }
      routeWaypointsRef.current = routeWaypointsRef.current.slice(0, -1);
      routeSegmentsRef.current = routeSegmentsRef.current.slice(0, -1);
      setRouteWaypoints([...routeWaypointsRef.current]);
      setDrawnPoints(flattenRouteSegments(routeWaypointsRef.current, routeSegmentsRef.current));
      return;
    }
    setDrawnPoints((p) => p.slice(0, -1));
  }, [drawingMode, handleClearDrawnPoints]);

  const handleStartDrawing = useCallback((mode) => {
    setDrawingMode(mode);
    handleClearDrawnPoints();
    if (mode === "colonia") {
      setMostrarColonias(true);
      toast.info("Modo edición de cuadrante activo — la flota se ocultó temporalmente. Haz clic en el mapa para trazar los vértices.");
    } else if (mode === "ruta") {
      toast.info("Selecciona de punto a punto en el mapa: la línea se marcará automáticamente sobre el sentido de la calle.");
    }
  }, [handleClearDrawnPoints]);

  const handleStopDrawing = useCallback(() => {
    setDrawingMode(null);
    setRoutingSegmentLoading(false);
  }, []);

  useEffect(() => {
    if (adminSection !== "rutas" && adminSection !== "colonias" && drawingMode) {
      setDrawingMode(null);
      setRoutingSegmentLoading(false);
    }
  }, [adminSection, drawingMode]);

  const handleLimpiarPuntos = () => {
    setCoords({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
    setPuntoBuscado(null);
    toast.info("Puntos del mapa borrados");
  };

  const handleSetOrigen = (latlng) => {
    const col = getColoniaAt(latlng.lat, latlng.lng, colonias);
    const desc = col ? `${col.nombre}` : `Punto en mapa (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
    setCoords((c) => ({ ...c, origen: { lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6) }, origenTexto: desc, tarifaSugerida: col?.tarifa_base ? Number(col.tarifa_base) : null }));
    setModalOpen(true);
    toast.success("Origen establecido para nuevo servicio", { description: col?.tarifa_base ? `${desc} · Tarifa zona $${col.tarifa_base}` : desc });
  };

  const handleSetDestino = (latlng) => {
    const col = getColoniaAt(latlng.lat, latlng.lng, colonias);
    const desc = col ? `${col.nombre}` : `Destino (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
    setCoords((c) => ({ ...c, destino: { lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6) }, destinoTexto: desc }));
    toast.success("Destino fijado en el mapa", { description: desc });
  };

  const handleMarcarPunto = (latlng) => {
    const col = getColoniaAt(latlng.lat, latlng.lng, colonias);
    setPuntoBuscado({
      lat: latlng.lat,
      lng: latlng.lng,
      label: col ? col.nombre : "Punto Marcado",
    });
    toast.info("Punto de referencia marcado en el mapa");
  };

  const handleCopiarCoordenadas = (latlng) => {
    navigator.clipboard?.writeText(`${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
    toast.success("Coordenadas GPS copiadas al portapapeles");
  };

  const handleCentrar = (latlng) => {
    mapRef.current?.flyTo([latlng.lat, latlng.lng], 16, { duration: 0.8 });
  };

  const handleIdentificarColonia = (latlng) => {
    const col = getColoniaAt(latlng.lat, latlng.lng, colonias);
    if (col) {
      setMostrarColonias(true);
      toast.info(`📍 ${col.nombre}`, {
        description: `Tarifa base: $${col.tarifa_base ?? 35} · Noche: $${col.tarifa_nocturna ?? 45}`,
        duration: 6000,
      });
    } else {
      toast.info("Ubicación en zona periférica de Palenque");
    }
  };

  const abrirNuevaLlamada = useCallback(() => {
    setServicioForm({ cliente_nombre: "", cliente_telefono: "" });
    setCoords({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
    setAdminSection(null);
    setModalOpen(true);
  }, []);

  const pedirPunto = (which) => { setModalOpen(false); setPicking(which); toast.info(`Haz clic en el mapa para marcar el ${which}`); };

  const traceRoutePointToPoint = useCallback(async (pt) => {
    const curWaypoints = routeWaypointsRef.current;
    if (curWaypoints.length === 0) {
      routeWaypointsRef.current = [pt];
      routeSegmentsRef.current = [];
      setRouteWaypoints([pt]);
      setDrawnPoints([pt]);
      return;
    }
    const prevPt = curWaypoints[curWaypoints.length - 1];
    const nextWaypoints = [...curWaypoints, pt];
    routeWaypointsRef.current = nextWaypoints;
    setRouteWaypoints(nextWaypoints);
    setRoutingSegmentLoading(true);
    try {
      const { data } = await termApi.post("/routing/route", {
        origen: { lat: prevPt[0], lng: prevPt[1] },
        destino: { lat: pt[0], lng: pt[1] },
        modo_vial: true,
      });
      const coordsGeo = data?.geometry?.coordinates;
      const segLatLngs =
        Array.isArray(coordsGeo) && coordsGeo.length >= 2
          ? coordsGeo.map(([lng, lat]) => [Number(Number(lat).toFixed(6)), Number(Number(lng).toFixed(6))])
          : [prevPt, pt];
      routeSegmentsRef.current = [...routeSegmentsRef.current, segLatLngs];
    } catch {
      routeSegmentsRef.current = [...routeSegmentsRef.current, [prevPt, pt]];
    } finally {
      setDrawnPoints(flattenRouteSegments(routeWaypointsRef.current, routeSegmentsRef.current));
      setRoutingSegmentLoading(false);
    }
  }, []);

  const onMapClick = useCallback((latlng) => {
    const pt = [Number(latlng.lat.toFixed(6)), Number(latlng.lng.toFixed(6))];
    if (drawingMode === "ruta") {
      traceRoutePointToPoint(pt);
      return;
    }
    if (drawingMode === "colonia") {
      setDrawnPoints((prev) => [...prev, pt]);
      return;
    }
    if (!picking) return;
    setCoords((c) => ({ ...c, [picking]: { lat: pt[0], lng: pt[1] } }));
    setPicking(null);
    setModalOpen(true);
  }, [drawingMode, picking, traceRoutePointToPoint]);

  const clearPick = (which) => setCoords((c) => ({ ...c, [which]: null }));
  const salirTerminal = () => { logoutTerminal(); navigate("/terminal/login"); };

  const termUser = getTerminalUser();
  const [logo, setLogo] = useState(null);
  const [sitioConfig, setSitioConfig] = useState(null);
  const [termFoto, setTermFoto] = useState(termUser?.foto_url || null);
  const termFotoRef = useRef(null);

  useEffect(() => {
    termApi.get("/config/logo").then((r) => {
      if (r.data?.foto_url) setLogo(r.data.foto_url);
    }).catch(() => {});
    fetchSitioConfig().then((cfg) => {
      if (!cfg) return;
      setSitioConfig(cfg);
      applySitioBranding(cfg);
      if (cfg.logo_url) setLogo(cfg.logo_url);
      if (cfg.map_center_lat && cfg.map_center_lng && mapRef.current) {
        mapRef.current.setView([cfg.map_center_lat, cfg.map_center_lng], 13);
      }
    }).catch(() => {});
  }, []);

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
      const [ops, rts, svs, cols, avs] = await Promise.all([
        termApi.get("/operadores"),
        termApi.get("/rutas"),
        termApi.get("/servicios/hoy").catch(() => ({ data: [] })),
        termApi.get("/colonias").catch(() => ({ data: [] })),
        termApi.get("/avisos/activos").catch(() => ({ data: [] })),
      ]);
      const map = {};
      ops.data.forEach((o) => { map[o.id] = o; });
      setOperadores(map);
      setRutas(rts.data);
      setServiciosHoyList(svs.data || []);
      setColonias(cols.data || []);
      setAvisosActivos(avs.data || []);
    } catch (e) {
      // Token inválido/revocado: no quedarse en pantalla vacía — mandar al login.
      if (e?.response?.status === 401) { logoutTerminal(); navigate("/terminal/login"); }
    }
  }, [navigate]);

  useEffect(() => { if (getTerminalToken()) load(); }, [load]);

  // Actualizar lista de servicios de hoy cuando cambia servicioSignal (WebSocket)
  useEffect(() => {
    if (!getTerminalToken() || !servicioSignal) return;
    termApi.get("/servicios/hoy").then((r) => setServiciosHoyList(r.data || [])).catch(() => {});
  }, [servicioSignal]);

  // Contador de servicios realizados hoy por cada operador (completados hoy)
  const serviciosHoyCounts = useMemo(() => {
    const countsMap = {};
    (serviciosHoyList || []).forEach((s) => {
      if (s.operador_asignado_id && s.estado === "completado") {
        countsMap[s.operador_asignado_id] = (countsMap[s.operador_asignado_id] || 0) + 1;
      }
    });
    return countsMap;
  }, [serviciosHoyList]);

  // Precarga fluida de teselas de Palenque para zoom in/out sin lag ni parpadeo
  useEffect(() => {
    precargarTilesPalenque();
  }, []);

  // WebSocket en vivo con batching de ubicaciones para fluidez a 60 FPS
  useEffect(() => {
    if (!getTerminalToken()) return;
    let closed = false;
    let timer;
    const pendingLocations = {};
    let flushTimer = null;

    const flushLocations = () => {
      flushTimer = null;
      const entries = Object.values(pendingLocations);
      if (entries.length === 0) return;
      for (const k of Object.keys(pendingLocations)) delete pendingLocations[k];
      startTransition(() => {
        setOperadores((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const msg of entries) {
            const op = next[msg.operador_id];
            if (!op) continue;
            changed = true;
            next[msg.operador_id] = {
              ...op,
              lat: msg.lat,
              lng: msg.lng,
              gps_heading: msg.gps_heading != null ? msg.gps_heading : op.gps_heading,
              gps_speed: msg.gps_speed != null ? msg.gps_speed : op.gps_speed,
              sentido_direccion: msg.sentido_direccion || op.sentido_direccion,
              ultima_actualizacion: msg.ts,
            };
          }
          return changed ? next : prev;
        });
      });
    };

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/terminal?token=${encodeURIComponent(getTerminalToken() || "")}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = (ev) => {
        setConnected(false);
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
          pendingLocations[msg.operador_id] = msg;
          if (!flushTimer) {
            flushTimer = setTimeout(flushLocations, 140);
          }
        } else if (msg.type === "estado") {
          startTransition(() => setOperadores((prev) => prev[msg.operador_id]
            ? { ...prev, [msg.operador_id]: { ...prev[msg.operador_id], estado: msg.estado } }
            : prev));
        } else if (msg.type === "servicio") {
          setServicioSignal((n) => n + 1);
        } else if (msg.type === "mensaje") {
          setLiveMessage(msg.mensaje);
        } else if (msg.type === "wa_mensaje") {
          setServicioSignal((n) => n + 1);
          toast.info(`💬 WhatsApp de ${msg.cliente_nombre || msg.cliente_telefono || "Cliente"}`, {
            description: msg.mensaje?.texto || "📍 Ubicación GPS compartida",
            action: {
              label: "Abrir",
              onClick: () => setAdminSection("whatsapp"),
            },
          });
        } else if (msg.type === "reporte") {
          setLiveReporte(msg.reporte);
          toast.info("🎒 Nuevo objeto reportado");
        } else if (msg.type === "aviso_sistema") {
          if (msg.aviso) setAvisosActivos((prev) => [msg.aviso, ...prev]);
          toast.warning(`📢 Aviso de Sistema: ${msg.aviso?.titulo || "Notificación"}`, {
            description: msg.aviso?.mensaje || "",
            duration: 8000,
          });
        } else if (msg.type === "destino_alcanzado") {
          setServicioSignal((n) => n + 1);
          toast.success("Destino alcanzado — servicio completado automáticamente", {
            description: "El taxi volvió a disponible.",
            duration: 5000,
          });
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (flushTimer) clearTimeout(flushTimer);
      wsRef.current?.close();
    };
  }, [navigate]);

  // Atajos de teclado globales en la Terminal (F2 = Nueva llamada, W = WhatsApp, S = Servicios, Esc = Cerrar)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      if (modalOpen) return; // DespachoModal maneja sus propios atajos 1-6 / Enter / Esc
      if (e.key === "F2") {
        e.preventDefault();
        abrirNuevaLlamada();
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setAdminSection((s) => (s === "whatsapp" ? null : "whatsapp"));
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setAdminSection((s) => (s === "servicios" ? null : "servicios"));
      } else if (e.key === "Escape") {
        if (contextMenu) setContextMenu(null);
        else if (drawingMode) setDrawingMode(null);
        else if (picking) setPicking(null);
        else if (selectedId) { setSelectedId(null); setFollow(false); }
        else if (adminSection) setAdminSection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, abrirNuevaLlamada, contextMenu, drawingMode, picking, selectedId, adminSection]);

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

  // Taxi libre más cercano al punto de clic derecho (o al origen del borrador)
  const encontrarTaxiMasCercano = useCallback((pt) => {
    if (!pt || operadoresLibres.length === 0) return null;
    const ordenados = operadoresLibres
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => ({ ...t, dist: distM({ lat: pt.lat, lng: pt.lng }, { lat: t.lat, lng: t.lng }) }))
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
    return ordenados[0] || null;
  }, [operadoresLibres]);

  // Despacho instantáneo en 1 clic sin abrir modal (desde clic derecho, HUD o Punto Caliente)
  const handleDespachoRapido = useCallback(async (latlng, opOverride = null, origenLabel = null, tarifaSugerida = null) => {
    const op = opOverride || encontrarTaxiMasCercano(latlng);
    if (!op) {
      toast.error("No hay unidades libres disponibles en este momento");
      return;
    }
    const col = getColoniaAt(latlng.lat, latlng.lng, colonias);
    const textoOrigen = origenLabel || (col ? col.nombre : `Punto en mapa (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`);
    const destData = coords.destino && coords.destino.lat != null
      ? { texto: coords.destinoTexto || "Destino marcado en mapa", lat: coords.destino.lat, lng: coords.destino.lng }
      : { texto: "A indicaciones del cliente (Sin destino fijo)" };

    try {
      const payload = {
        cliente_nombre: servicioForm.cliente_nombre || "Despacho Rápido",
        cliente_telefono: servicioForm.cliente_telefono || "",
        origen: { texto: textoOrigen, lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6) },
        destino: destData,
      };
      const tarifaFinal = tarifaSugerida ?? (col?.tarifa_base ? Number(col.tarifa_base) : null);
      if (tarifaFinal) payload.costo = Number(tarifaFinal);
      const { data: created } = await termApi.post("/servicios", payload);
      await termApi.post(`/servicios/${created.servicio.id}/asignar`, { operador_id: op.id });
      toast.success(`⚡ Despacho en 1 clic → Unidad ${op.placa || op.nombre}`, {
        description: `Origen: ${textoOrigen}${tarifaFinal ? ` · Tarifa $${tarifaFinal}` : ""}`,
      });
      setCoords({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
      setPuntoBuscado(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo despachar el servicio rápido");
    }
  }, [encontrarTaxiMasCercano, colonias, coords.destino, coords.destinoTexto, servicioForm, load]);

  const puntosCalientes = useMemo(() => {
    const list = sitioConfig?.puntos_calientes;
    return Array.isArray(list) && list.length > 0 ? list : FALLBACK_POIS;
  }, [sitioConfig]);

  const handleSelectPuntoCaliente = (poi, despachoDirecto = false) => {
    const pt = { lat: Number(poi.lat), lng: Number(poi.lng) };
    setGotoTarget({ ...pt, label: poi.nombre });
    if (despachoDirecto) {
      handleDespachoRapido(pt, null, poi.nombre, null);
      return;
    }
    setCoords((c) => ({
      ...c,
      origen: pt,
      origenTexto: poi.nombre,
      tarifaSugerida: null,
    }));
    setModalOpen(true);
  };

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

  const nombreRuta = useCallback((id) => rutas.find((r) => r.id === id)?.nombre || "Taxi libre", [rutas]);

  const initialHora = useMemo(() => new Date().toLocaleTimeString("es-MX", { hour12: false }), []);

  const drawnRouteArrows = useMemo(
    () => (drawingMode === "ruta" && drawnPoints.length > 1 ? buildDirectionalArrows(drawnPoints, 12) : []),
    [drawingMode, drawnPoints]
  );

  return (
    <div className="taxi-terminal-shell flex h-screen w-screen overflow-hidden bg-background" style={{ "--ui-alpha": uiAlpha }}>
      {/* SIDEBAR IZQUIERDA — flota fija con pestaña flotante de colapso rápido */}
      {sidebarOpen && (
        <aside
          data-testid="terminal-sidebar"
          className="surface-ui relative z-[400] hidden w-64 shrink-0 animate-fade-in flex-col border-r border-border bg-card md:flex"
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
            serviciosHoyCounts={serviciosHoyCounts}
          />
          {/* Pestaña flotante en el borde central para colapsar rápidamente la barra */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="surface-ui absolute -right-3.5 top-1/2 -translate-y-1/2 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-surface/95 text-muted-foreground shadow-lg backdrop-blur hover:bg-surface-2 hover:text-foreground transition-all"
            title="Ocultar barra lateral de flota"
            aria-label="Ocultar barra lateral"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </aside>
      )}

      {/* Overlay móvil de la sidebar */}
      {sidebarOpen && (
        <div className="surface-ui absolute inset-y-0 left-0 z-[560] w-64 max-w-[85vw] border-r border-border bg-card shadow-2xl md:hidden">
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
            serviciosHoyCounts={serviciosHoyCounts}
          />
        </div>
      )}

      {/* ÁREA DE MAPA (protagonista) */}
      <div className="relative min-w-0 flex-1">
        {/* Botón lateral de Flota centrado verticalmente a la izquierda (nunca sobre ninguna barra) */}
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="surface-ui absolute left-3 top-1/2 -translate-y-1/2 z-[510] flex items-center gap-2 rounded-xl border border-[#4F5DFF]/60 bg-[#17191E]/95 px-3.5 py-2 text-xs font-bold text-foreground shadow-[0_6px_20px_rgba(79,93,255,0.35)] backdrop-blur-md transition-all hover:scale-105 hover:bg-[#4F5DFF] hover:text-white"
            title="Mostrar panel lateral de flota"
            data-testid="expand-sidebar-btn"
          >
            <ChevronRight className="h-4 w-4 text-brand-bright" />
            <span>Flota ({visibles.length})</span>
          </button>
        )}

        {/* Controles inferiores separados: Selector de Capas del Mapa + Visibilidad de Pines */}
        <div className="pointer-events-none absolute bottom-5 left-14 z-[450] flex flex-wrap items-center gap-2">
          <div className="surface-ui pointer-events-auto flex items-center gap-1 rounded-xl border border-border/80 bg-surface/95 p-1 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMapLayer("calles")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                mapLayer === "calles"
                  ? "bg-brand/20 text-brand-bright font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
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
                mapLayer === "satelite"
                  ? "bg-brand/20 text-brand-bright font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
              data-testid="layer-satelite-btn"
            >
              <Satellite className="h-3.5 w-3.5" /> Satélite
            </button>
            <button
              type="button"
              onClick={() => setMostrarColonias((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                mostrarColonias
                  ? "bg-indigo-500/25 text-indigo-300 font-semibold border border-indigo-500/40 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
              data-testid="layer-colonias-btn"
              title="Activar vista delimitada de colonias por colores"
            >
              <Shapes className="h-3.5 w-3.5" /> Colonias
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMostrarFlota((v) => !v)}
            className={cn(
              "surface-ui pointer-events-auto flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xl backdrop-blur-md transition-colors",
              mostrarFlota
                ? "border-border/80 bg-surface/95 text-emerald-400 hover:bg-emerald-500/15"
                : "border-amber-500/40 bg-amber-500/20 text-amber-300"
            )}
            data-testid="toggle-flota-btn"
            title={mostrarFlota ? "Ocultar unidades en el mapa" : "Mostrar unidades en el mapa"}
          >
            {mostrarFlota ? (
              <>
                <Eye className="h-3.5 w-3.5 text-emerald-400" />
                <span>Unidades en mapa ({visibles.length})</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                <span>Unidades ocultas</span>
              </>
            )}
          </button>
        </div>

        <div className="absolute inset-0 z-0" data-testid="terminal-map">
          <MapContainer
            center={CENTER}
            zoom={13}
            zoomControl={false}
            zoomAnimation={true}
            markerZoomAnimation={true}
            wheelDebounceTime={40}
            preferCanvas={true}
            className="h-full w-full"
          >
          {mapLayer === "satelite" ? (
            <>
              <TileLayer
                url={SATELLITE_TILES}
                attribution="Tiles &copy; Esri World Imagery"
                maxNativeZoom={18}
                keepBuffer={6}
              />
              <TileLayer
                url={SATELLITE_REF}
                maxNativeZoom={18}
                keepBuffer={6}
              />
            </>
          ) : TILESERVER_URL ? (
            <MaplibreVectorTileLayer
              styleUrl={VECTOR_STYLE_URL}
            />
          ) : (
            <TileLayer
              url={STREET_TILES}
              attribution={STREET_ATTR}
              maxZoom={20}
              maxNativeZoom={19}
              keepBuffer={6}
            />
          )}
          <ZoomControl position="bottomleft" />
          <MapEventsHandler
            onClick={(latlng) => { setContextMenu(null); onMapClick(latlng); }}
            onContextMenu={setContextMenu}
          />
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
            return ahead ? <Marker position={[ahead.lat, ahead.lng]} icon={routeArrowIcon(ahead.brg, PALETA.primary)} /> : null;
          })()}
          {/* Rutas colectivas trazadas en el mapa con sentido vial */}
          {rutas.filter((r) => Array.isArray(r.trazo) && r.trazo.length > 1 && (filtroRuta === "todas" || filtroRuta === r.id)).map((r) => {
            const routeColor = r.color_hex || r.color || "#10b981";
            const arrows = buildDirectionalArrows(r.trazo, 8);
            return (
              <span key={`ruta-trazo-wrap-${r.id}`}>
                <Polyline
                  positions={r.trazo}
                  pathOptions={{ color: "#090d16", weight: 7, opacity: 0.45, lineCap: "round" }}
                />
                <Polyline
                  key={`ruta-trazo-${r.id}`}
                  positions={r.trazo}
                  pathOptions={{ color: routeColor, weight: 4, opacity: 0.9, dashArray: "8 6", lineCap: "round" }}
                >
                  <Popup>
                    <div className="text-xs">
                      <div className="font-bold text-foreground">{r.nombre}</div>
                      <div className="text-muted-foreground">{r.sentido || "Ruta Colectiva (Sentido Vial)"} · Tarifa ${r.tarifa_colectiva ?? r.tarifa_base ?? 15}</div>
                    </div>
                  </Popup>
                </Polyline>
                {arrows.map((arr, idx) => (
                  <Marker
                    key={`ruta-arrow-${r.id}-${idx}`}
                    position={[arr.lat, arr.lng]}
                    icon={routeArrowIcon(arr.heading, routeColor)}
                    interactive={false}
                  />
                ))}
              </span>
            );
          })}
          {/* Vista previa de trazo en vivo punto a punto sobre el sentido de la calle */}
          {drawingMode === "ruta" && drawnPoints.length > 1 && (
            <>
              <Polyline
                positions={drawnPoints}
                pathOptions={{ color: "#090d16", weight: 9, opacity: 0.65, lineCap: "round", lineJoin: "round" }}
              />
              <Polyline
                positions={drawnPoints}
                pathOptions={{ color: "#10b981", weight: 5, opacity: 0.98, lineCap: "round", lineJoin: "round" }}
              />
              <RoutePolyline
                positions={drawnPoints}
                className="th-route-flow"
                pathOptions={{ color: "#a7f3d0", weight: 3, opacity: 0.9, dashArray: "1 14", lineCap: "round" }}
              />
              {drawnRouteArrows.map((arr, idx) => (
                <Marker
                  key={`drawn-route-arrow-${idx}`}
                  position={[arr.lat, arr.lng]}
                  icon={routeArrowIcon(arr.heading, "#10b981")}
                  interactive={false}
                />
              ))}
            </>
          )}
          {drawingMode === "colonia" && drawnPoints.length >= 2 && (
            <Polygon
              positions={drawnPoints}
              pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.28, weight: 3, dashArray: "5 5" }}
            />
          )}
          {/* Marcadores de puntos de parada en el Planificador de Ruta (Inicio -> Paradas -> Punto de Finalización) */}
          {drawingMode === "ruta" && (routeWaypoints.length > 0 ? routeWaypoints : drawnPoints).map((pt, idx, arr) => (
            <CircleMarker
              key={`draw-waypoint-${idx}`}
              center={pt}
              radius={idx === 0 || idx === arr.length - 1 ? 8 : 6}
              pathOptions={{
                color: "#ffffff",
                fillColor: idx === 0 ? "#10b981" : idx === arr.length - 1 ? "#4F5DFF" : "#0ea5e9",
                fillOpacity: 1,
                weight: 2.5,
              }}
            />
          ))}
          {drawingMode === "ruta" && routeWaypoints.length >= 1 && (
            <Marker
              position={routeWaypoints[0]}
              icon={pointIcon("Inicio de Ruta", "#10b981", { size: "sm" })}
              interactive={false}
            />
          )}
          {drawingMode === "ruta" && routeWaypoints.length >= 2 && (
            <Marker
              position={routeWaypoints[routeWaypoints.length - 1]}
              icon={pointIcon("Punto Final", "#4F5DFF", { size: "sm" })}
              interactive={false}
            />
          )}
          {drawingMode === "colonia" && drawnPoints.map((pt, idx) => (
            <CircleMarker
              key={`draw-pt-${idx}`}
              center={pt}
              radius={6}
              pathOptions={{ color: "#ffffff", fillColor: "#f59e0b", fillOpacity: 1, weight: 2 }}
            />
          ))}
          {(mostrarColonias || drawingMode === "colonia") && <ColoniasLayer customColonias={colonias} />}
          {(mostrarFlota && drawingMode !== "colonia") && visibles.map((o) => (
            <SmoothTaxiMarker
              key={o.id}
              op={o}
              selected={selectedId === o.id}
              destinoHeading={destinoHeading}
              onSelect={() => { setSelectedId(o.id); setFollow(false); }}
              serviciosHoy={serviciosHoyCounts[o.id] || 0}
            />
          ))}
        </MapContainer>
      </div>

      {/* TOPBAR — consola del Command Center (DS 2.0) + Botonera de Puntos Calientes + Buscador integrado */}
      <OpsTopbar
        termUser={termUser}
        sitioConfig={sitioConfig}
        avisosActivos={avisosActivos}
        logo={logo ? fileUrl(logo) : null}
        termFoto={termFoto ? fileUrl(termFoto) : null}
        onFotoClick={() => termFotoRef.current?.click()}
        fotoInput={
          <input ref={termFotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => subirTermFoto(e.target.files?.[0])} />
        }
        connected={connected}
        counts={counts}
        hora={initialHora}
        serviciosOpen={adminSection === "servicios"}
        onToggleServicios={() => setAdminSection((s) => (s === "servicios" ? null : "servicios"))}
        onNuevaLlamada={abrirNuevaLlamada}
        uiAlpha={uiAlpha}
        onAlphaChange={setUiAlpha}
        onLogout={salirTerminal}
      >
        {/* Fila inferior del Topbar: Puntos Calientes + Buscador Geográfico sin solapamiento */}
        <div className="pointer-events-none flex flex-col gap-1.5 xl:flex-row xl:items-center xl:justify-between">
          <div
            className="surface-ui pointer-events-auto hidden items-center gap-1.5 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#13151A]/90 px-2.5 py-1 shadow-xl backdrop-blur-md lg:flex no-scrollbar"
            data-testid="puntos-calientes-bar"
          >
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-400 pr-1 border-r border-white/10">
              <Flame className="h-3 w-3" /> Puntos Calientes:
            </span>
            {puntosCalientes.map((poi, idx) => (
              <div
                key={poi.id || idx}
                className="inline-flex shrink-0 items-center rounded-lg border border-white/[0.07] bg-white/[0.03] hover:border-brand/50 hover:bg-brand/10 transition-all"
              >
                <button
                  type="button"
                  data-testid={`poi-btn-${poi.id || idx}`}
                  onClick={() => handleSelectPuntoCaliente(poi, false)}
                  className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold text-foreground/90 hover:text-foreground"
                  title={`${poi.nombre}${poi.referencia ? ` (${poi.referencia})` : ""} — Clic para abrir despacho en este origen`}
                >
                  <span>{poi.nombre}</span>
                </button>
                <button
                  type="button"
                  data-testid={`poi-1clic-${poi.id || idx}`}
                  onClick={() => handleSelectPuntoCaliente(poi, true)}
                  className="border-l border-white/[0.08] px-1.5 py-0.5 text-amber-400 hover:bg-emerald-500/25 hover:text-emerald-300 rounded-r-lg transition-colors"
                  title={`⚡ Despachar de inmediato el taxi libre más cercano a ${poi.nombre} (1 clic)`}
                >
                  <Zap className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="pointer-events-none flex justify-center xl:w-[360px] xl:shrink-0">
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
        </div>
      </OpsTopbar>

      {picking && (
        <div className="absolute left-1/2 top-36 z-[700] -translate-x-1/2 animate-slide-down rounded-full border border-brand bg-card/95 px-4 py-2 text-sm text-brand-bright backdrop-blur lg:top-32" data-testid="picking-banner">
          Haz clic en el mapa para marcar el {picking}
          <button className="ml-3 text-muted-foreground underline" onClick={() => { setPicking(null); setModalOpen(true); }}>cancelar</button>
        </div>
      )}

      {drawingMode && (
        <div
          className="surface-ui absolute left-1/2 top-44 z-[710] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/60 bg-[#13151A]/95 px-4 py-1.5 text-xs font-semibold text-amber-300 shadow-2xl backdrop-blur-md lg:top-36"
          data-testid="drawing-banner"
        >
          <span>
            {drawingMode === "colonia"
              ? `✏️ Delimitando cuadrante (${drawnPoints.length} vértices) · Flota oculta temporalmente`
              : routingSegmentLoading
                ? "🛣️ Trazando automáticamente sobre el sentido de la calle…"
                : `🛣️ Trazando ruta punto a punto sobre sentido vial (${routeWaypoints.length || (drawnPoints.length > 0 ? 1 : 0)} paradas · ${drawnPoints.length} pts)`}
          </span>
          {drawnPoints.length > 0 && (
            <button
              type="button"
              onClick={handleUndoDrawnPoint}
              className="rounded-lg bg-white/10 px-2 py-0.5 text-[11px] text-foreground hover:bg-white/20"
            >
              Deshacer
            </button>
          )}
          <button
            type="button"
            onClick={handleStopDrawing}
            className="rounded-lg bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-500"
          >
            Listo
          </button>
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
            "absolute inset-x-3 z-[540] w-[285px] max-w-[calc(100vw-2rem)] lg:inset-x-auto lg:right-16",
            adminSection ? "top-[128px] lg:top-[142px]" : "bottom-4"
          )}
        >
          <MissionCard
            op={{ ...selectedOp, rutaNombre: nombreRuta(selectedOp.ruta_asignada) }}
            serviciosHoy={serviciosHoyCounts[selectedOp.id] || 0}
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

        {/* HUD Flotante: Servicio en borrador y control de puntos */}
        {(coords.origen || coords.destino) && (
          <div className="surface-ui absolute top-4 left-1/2 -translate-x-1/2 z-[800] flex items-center gap-2 rounded-2xl border border-white/15 bg-[#13151A]/95 px-4 py-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              {coords.origen ? (
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="max-w-[150px] truncate">{coords.origenTexto || "Origen marcado"}</span>
                </span>
              ) : (
                <span className="text-muted-foreground/70 italic text-[11px]">Clic derecho p/ Origen</span>
              )}
              <span className="text-muted-foreground/50 font-bold">&rarr;</span>
              {coords.destino ? (
                <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0" />
                  <span className="max-w-[150px] truncate">{coords.destinoTexto || "Destino marcado"}</span>
                </span>
              ) : (
                <span className="text-muted-foreground/70 italic text-[11px]">Sin destino fijo</span>
              )}
            </div>

            <div className="h-4 w-px bg-white/10 mx-1" />

            {coords.origen && (
              <button
                type="button"
                data-testid="hud-despacho-1clic-btn"
                onClick={() => handleDespachoRapido(coords.origen, null, coords.origenTexto, coords.tarifaSugerida)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-950/50"
                title="Asignar de inmediato al taxi libre más cercano sin abrir modal"
              >
                <Zap className="h-3.5 w-3.5 text-amber-300" /> 1-Clic Cercano
              </button>
            )}

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30"
              title="Abrir formulario de despacho y elegir unidad"
            >
              Elegir Taxi
            </button>

            <button
              type="button"
              onClick={handleLimpiarPuntos}
              className="flex items-center gap-1 rounded-xl bg-white/5 p-1.5 text-muted-foreground hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
              title="Borrar puntos y cancelar borrador"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <MapContextMenu
        isOpen={!!contextMenu}
        position={contextMenu?.position}
        latlng={contextMenu?.latlng}
        coloniaCercana={contextMenu?.latlng ? getColoniaAt(contextMenu.latlng.lat, contextMenu.latlng.lng, colonias)?.nombre : null}
        onClose={() => setContextMenu(null)}
        onSetOrigen={handleSetOrigen}
        onSetDestino={handleSetDestino}
        onDespachoRapido={(latlng, op) => handleDespachoRapido(latlng, op)}
        taxiMasCercano={contextMenu?.latlng ? encontrarTaxiMasCercano(contextMenu.latlng) : null}
        onMarcarPunto={handleMarcarPunto}
        onCopiarCoordenadas={handleCopiarCoordenadas}
        onCentrar={handleCentrar}
        onIdentificarColonia={handleIdentificarColonia}
        hasPuntosMarcados={!!(coords.origen || coords.destino || puntoBuscado)}
        onLimpiarPuntos={handleLimpiarPuntos}
      />

        <DespachoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          coords={coords}
          setCoords={setCoords}
          pedirPunto={pedirPunto}
          operadoresLibres={operadoresLibres}
          serviciosHoyPorOperador={serviciosHoyCounts}
          initialCliente={servicioForm}
          onCreated={() => {
            setCoords({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
            setPuntoBuscado(null);
            load();
          }}
        />

      <TerminalMenu
        active={adminSection}
        onActiveChange={setAdminSection}
        operadores={operadores}
        operadoresLibres={operadoresLibres}
        serviciosHoyPorOperador={serviciosHoyCounts}
        rutas={rutas}
        onRutasChanged={load}
        colonias={colonias}
        onColoniasChanged={load}
        drawingMode={drawingMode}
        onStartDrawing={handleStartDrawing}
        onStopDrawing={handleStopDrawing}
        drawnPoints={drawnPoints}
        routeWaypoints={routeWaypoints}
        routingSegmentLoading={routingSegmentLoading}
        onUndoDrawnPoint={handleUndoDrawnPoint}
        onClearDrawnPoints={handleClearDrawnPoints}
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
