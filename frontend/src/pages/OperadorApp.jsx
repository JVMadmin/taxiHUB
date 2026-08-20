import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, getToken, logoutOperador, ESTADO_COLORS, ESTADO_LABEL, SERVICIO_LABEL, BACKEND_URL } from "@/lib/api";
import { elapsed, timeAgo } from "@/lib/time";
import { cn, iniciales } from "@/lib/utils";
import { distM, fmtDist, fmtDuration, bearing } from "@/lib/geo";
import { useRouting } from "@/hooks/useRouting";
import { pointIcon, pillCarIcon } from "@/lib/taxiIcon";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ModeToggle } from "@/components/ModeToggle";
import { DriverStatusPill } from "@/components/StatusBadge";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { GpsBadge } from "@/components/GpsBadge";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmAction } from "@/components/ConfirmAction";
import { BottomSheet } from "@/components/BottomSheet";
import { useMode } from "@/hooks/useMode";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Car, Power, LogOut, MapPin, Bell, Package, MessageSquare, Send, X,
  PlayCircle, StopCircle, Check, LocateFixed, Navigation as NavIcon, Wallet,
  Clock, Flag, User, AlertTriangle,
} from "lucide-react";

const LOC_INTERVAL = 9000; // 8-10s
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function ClienteAvatar({ nombre, className }) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-bright to-brand-strong text-sm font-extrabold text-brand-contrast",
        className
      )}
    >
      {iniciales(nombre)}
    </div>
  );
}

// Ajusta los límites del mapa a un set de puntos (una vez por cambio real).
function RouteBounds({ points }) {
  const map = useMap();
  const ref = useRef("");
  useEffect(() => {
    if (!points || points.length < 2) return;
    const key = points.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join("|");
    if (key === ref.current) return;
    ref.current = key;
    map.fitBounds(points, { padding: [70, 90], maxZoom: 16 });
  }, [points, map]);
  return null;
}

// Recentra el mapa cuando `n` cambia (botón "centrar en mi ubicación").
function RecenterController({ n, target }) {
  const map = useMap();
  const prevN = useRef(0);
  useEffect(() => {
    if (n !== prevN.current) {
      prevN.current = n;
      if (n > 0 && target) {
        map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6 });
      }
    }
  }, [n, target, map]);
  return null;
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[900] flex justify-center p-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-destructive/50 bg-destructive/95 px-4 py-1.5 text-xs font-bold text-destructive-foreground shadow-lg animate-slide-down">
        <AlertTriangle className="h-3.5 w-3.5" />
        Sin conexión a Internet. Reconectando…
      </div>
    </div>
  );
}

export default function OperadorApp() {
  const navigate = useNavigate();
  const [op, setOp] = useState(null);
  const [rutas, setRutas] = useState([]);
  const [coords, setCoords] = useState(null);
  const [servicio, setServicio] = useState(null);
  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const fileRef = useRef(null);
  const [inicio, setInicio] = useState(null);
  const [, setSec] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatText, setChatText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [reportDesc, setReportDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [servicioPropio, setServicioPropio] = useState(null);
  const [iniciarOpen, setIniciarOpen] = useState(false);
  const [iniciarForm, setIniciarForm] = useState({ origen_texto: "", destino_texto: "", costo: "" });
  const [tarifas, setTarifas] = useState([]);
  const [logo, setLogo] = useState(null);
  const profileRef = useRef(null);
  const lastPosRef = useRef(null);
  const [wsState, setWsState] = useState("reconnecting");
  const [gpsStale, setGpsStale] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [recenterN, setRecenterN] = useState(0);
  const mode = useMode();
  const tiles = mode === "claro" ? LIGHT_TILES : DARK_TILES;
  const rutaColor = mode === "claro" ? "#059669" : "#10b981";

  const enOperacion = op && op.estado !== "fuera_de_servicio";

  // Reloj para el contador de la oferta
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cronómetro de operación
  useEffect(() => {
    if (!enOperacion) return;
    const t = setInterval(() => setSec((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [enOperacion]);

  // Carga inicial
  useEffect(() => {
    if (!getToken()) { navigate("/login"); return; }
    Promise.all([
      api.get("/auth/me"), api.get("/rutas"), api.get("/tarifas"), api.get("/config/logo"),
      api.get("/servicios/mis-activos"),
    ])
      .then(([me, rt, tf, lg, activos]) => {
        setOp(me.data);
        setRutas(rt.data);
        setTarifas(tf.data);
        setLogo(lg.data.foto_url || null);
        setInicio(me.data.inicio_operacion || null);
        const items = activos.data || [];
        if (items.length) {
          const propio = items.find((s) => s.tipo === "operador");
          if (propio) setServicioPropio(propio);
          else setServicio(items[0]);
        }
      })
      .catch(() => { logoutOperador(); navigate("/login"); });
  }, [navigate]);

  // Wake Lock: mantiene la pantalla activa en turno
  useEffect(() => {
    let lock = null;
    const req = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch (_) {} };
    if (enOperacion) req();
    const onVis = () => { if (enOperacion && document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); try { lock?.release(); } catch (_) {} };
  }, [enOperacion]);

  const sendLocation = useCallback((id) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const c = { lat, lng, accuracy: pos.coords.accuracy, speed: pos.coords.speed, heading: pos.coords.heading };
        setCoords(c);
        setGpsStale(false);
        // Rumbo estimado si el dispositivo no lo da
        if (lastPosRef.current) {
          c.heading = c.heading ?? bearing(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
        }
        lastPosRef.current = c;
        try {
          await api.post(`/operadores/${id}/ubicacion`, {
            lat, lng, accuracy: pos.coords.accuracy ?? null,
            speed: pos.coords.speed ?? null, heading: pos.coords.heading ?? null,
          });
        } catch (_) {}
      },
      (err) => { setGpsStale(true); toast.error("No se pudo obtener tu ubicación: " + err.message); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
    );
  }, []);

  // Envío automático de ubicación mientras está en operación
  useEffect(() => {
    if (enOperacion && op) {
      sendLocation(op.id);
      timerRef.current = setInterval(() => sendLocation(op.id), LOC_INTERVAL);
    }
    return () => clearInterval(timerRef.current);
  }, [enOperacion, op, sendLocation]);

  // Vigila que el GPS se esté actualizando (stale si no llega)
  useEffect(() => {
    if (!enOperacion) return;
    const t = setInterval(() => {
      if (!lastPosRef.current) return;
      const stale = Date.now() - new Date(lastPosRef.current.ts || Date.now()).getTime() > 15000;
      setGpsStale((s) => s || stale);
    }, 8000);
    return () => clearInterval(t);
  }, [enOperacion]);

  // WebSocket: recibe asignación de servicios + estado de conexión
  useEffect(() => {
    if (!op) return;
    let closed = false;
    let retry;
    const connect = () => {
      setWsState(navigator.onLine ? "reconnecting" : "offline");
      const WS_BASE = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws") + "/api";
      const ws = new WebSocket(`${WS_BASE}/ws/operador/${op.id}?token=${encodeURIComponent(getToken() || "")}`);
      wsRef.current = ws;
      ws.onopen = () => setWsState(navigator.onLine ? "online" : "reconnecting");
      ws.onclose = () => {
        setWsState((s) => (navigator.onLine ? "reconnecting" : "offline"));
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "nuevo_servicio") {
          setServicio(msg.servicio);
          setServicioPropio(null);
          toast.info("🚕 Nuevo servicio asignado");
        } else if (msg.type === "mensaje") {
          setChatMsgs((m) => (m.some((x) => x.id === msg.mensaje.id) ? m : [...m, msg.mensaje]));
          if (msg.mensaje.remitente === "terminal") toast.info("💬 Mensaje de la central");
        }
      };
    };
    connect();
    const onOnline = () => setWsState("reconnecting");
    const onOffline = () => setWsState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { closed = true; clearTimeout(retry); wsRef.current?.close(); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [op]);

  const cambiarEstado = async (estado) => {
    try {
      await api.patch(`/operadores/${op.id}/estado`, { estado });
      setOp((p) => ({ ...p, estado }));
      return true;
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo cambiar el estado");
      return false;
    }
  };

  const entrar = async () => {
    await cambiarEstado("libre");
    const me = await api.get("/auth/me");
    setOp(me.data); setInicio(me.data.inicio_operacion || null);
    toast.success("Estás en operación");
  };
  const salir = async () => {
    clearInterval(timerRef.current);
    setInicio(null);
    const ok = await cambiarEstado("fuera_de_servicio");
    if (ok) toast("Saliste de operación");
  };

  const seleccionarRuta = async (rutaId) => {
    const val = rutaId === "libre" ? null : rutaId;
    await api.put(`/operadores/${op.id}`, { ruta_asignada: val });
    setOp((p) => ({ ...p, ruta_asignada: val }));
  };

  const logout = () => { logoutOperador(); navigate("/login"); };

  const subirFoto = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("foto", file);
    const { data } = await api.post(`/perfil/operadores/${op.id}/foto`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    setOp((p) => ({ ...p, foto_url: data.foto_url }));
    toast.success("Foto actualizada");
  };

  const abrirChat = async () => {
    setChatOpen(true);
    const { data } = await api.get(`/mensajes?operador_id=${op.id}`);
    setChatMsgs(data);
  };
  const enviarChat = async () => {
    if (!chatText.trim()) return;
    const t = chatText; setChatText("");
    await api.post("/mensajes", { operador_id: op.id, remitente: "operador", texto: t });
  };
  const enviarReporte = async () => {
    if (!pendingFile) return;
    const fd = new FormData();
    fd.append("operador_id", op.id);
    if (reportDesc) fd.append("descripcion", reportDesc);
    fd.append("foto", pendingFile);
    setUploading(true);
    try {
      await api.post("/reportes", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Objeto reportado a la central");
      setPendingFile(null); setReportDesc("");
    } catch (_) {
      toast.error("No se pudo enviar el reporte");
    } finally { setUploading(false); }
  };

  const crearServicio = async ({ tarifa_id = null, costo = null }) => {
    const { data } = await api.post(`/operadores/${op.id}/servicio`, {
      origen_texto: iniciarForm.origen_texto || null,
      destino_texto: iniciarForm.destino_texto || null,
      costo, tarifa_id,
    });
    setServicioPropio(data);
    setOp((p) => ({ ...p, estado: "ocupado" }));
    setIniciarOpen(false);
    setIniciarForm({ origen_texto: "", destino_texto: "", costo: "" });
    toast.success("Servicio iniciado");
  };
  const iniciarConTarifa = (t) => crearServicio({ tarifa_id: t.id, costo: t.monto });
  const iniciarLibre = () => {
    if (!iniciarForm.costo) { toast.error("Escribe un monto"); return; }
    crearServicio({ costo: Number(iniciarForm.costo) });
  };
  const terminarServicio = async () => {
    await api.post(`/servicios/${servicioPropio.id}/terminar`);
    setServicioPropio(null);
    setOp((p) => ({ ...p, estado: "libre" }));
    toast.success("Servicio terminado");
  };

  // Flujo digital: oferta -> aceptar/rechazar -> iniciar -> terminar
  const actualizarServicio = async () => {
    const { data } = await api.get(`/servicios/${servicio.id}`);
    setServicio(data);
  };
  const aceptarOferta = async () => {
    try {
      await api.post(`/servicios/${servicio.id}/aceptar`);
      await actualizarServicio();
      setOp((p) => ({ ...p, estado: "ocupado" }));
      toast.success("Servicio aceptado");
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo aceptar"); setServicio(null); }
  };
  const rechazarOferta = async () => {
    try {
      await api.post(`/servicios/${servicio.id}/rechazar`);
      setServicio(null);
      toast("Oferta rechazada");
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo rechazar"); }
  };
  const iniciarViaje = async () => {
    const { data } = await api.post(`/servicios/${servicio.id}/iniciar`);
    setServicio(data);
    toast.success("Viaje iniciado, en camino");
  };
  const terminarAjeno = async () => {
    try {
      await api.post(`/servicios/${servicio.id}/terminar`);
      setServicio(null);
      setOp((p) => ({ ...p, estado: "libre" }));
      toast.success("Viaje terminado");
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo terminar"); }
  };

  // ---- Navegación GPS (Fase 9D/9E) ----
  const navegacion = useMemo(() => {
    if (!servicio || !coords) return null;
    if (servicio.estado === "asignado") {
      const d = servicio.origen;
      if (d?.lat == null || d?.lng == null) return null;
      return { dest: { lat: d.lat, lng: d.lng }, texto: d.texto || "Ubicación del cliente", tipo: "cliente" };
    }
    if (servicio.estado === "en_curso") {
      const d = servicio.destino;
      if (d?.lat == null || d?.lng == null) return null;
      return { dest: { lat: d.lat, lng: d.lng }, texto: d.texto || "Destino final", tipo: "destino" };
    }
    return null;
  }, [servicio, coords]);

  const ruta = useRouting(
    coords ? { lat: coords.lat, lng: coords.lng } : null,
    navegacion?.dest || null,
    { enabled: !!navegacion && !!coords }
  );

  const ofertaDist = useMemo(() => {
    if (!servicio || servicio.estado !== "ofrecido" || !coords) return null;
    const o = servicio.origen;
    if (o?.lat == null || o?.lng == null) return null;
    const m = distM({ lat: coords.lat, lng: coords.lng }, { lat: o.lat, lng: o.lng });
    return m != null ? { m, min: Math.round(m / (25_000 / 3600)) } : null;
  }, [servicio, coords]);

  // Cuenta regresiva de la oferta
  const ofertaExpira = useMemo(() => {
    if (!servicio || servicio.estado !== "ofrecido" || !servicio.expira_en) return null;
    const ms = new Date(servicio.expira_en).getTime() - now.getTime();
    return ms > 0 ? ms : 0;
  }, [servicio, now]);

  useEffect(() => {
    if (ofertaExpira === 0 && servicio?.estado === "ofrecido") {
      setServicio(null);
      toast("Oferta expirada", { description: "La solicitud fue reasignada." });
    }
  }, [ofertaExpira, servicio]);

  // Puntos del mapa de navegación (estables entre renders)
  const driverPos = useMemo(
    () => (coords ? [coords.lat, coords.lng] : null),
    [coords]
  );
  const navTarget = useMemo(
    () => (navegacion ? [navegacion.dest.lat, navegacion.dest.lng] : null),
    [navegacion]
  );
  const boundsPoints = useMemo(() => {
    const pts = [];
    if (driverPos) pts.push(driverPos);
    if (navTarget) pts.push(navTarget);
    if (ruta.latlngs && ruta.latlngs.length > 1) pts.push(ruta.latlngs[0], ruta.latlngs[ruta.latlngs.length - 1]);
    return pts;
  }, [driverPos, navTarget, ruta.latlngs]);

  const mapCenter = useMemo(() => {
    if (coords) return [coords.lat, coords.lng];
    if (servicio?.origen?.lat != null) return [servicio.origen.lat, servicio.origen.lng];
    return [17.5099, -91.9847];
  }, [coords, servicio]);

  if (!op) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-brand" />
        <span className="text-sm">Cargando tu turno…</span>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <OfflineBanner />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
      />

      {/* MAPA de navegación (elemento principal) */}
      <div className="absolute inset-0 z-0" data-testid="driver-map">
        <MapContainer center={mapCenter} zoom={15} zoomControl={false} className="h-full w-full">
          <TileLayer url={tiles} attribution="&copy; OSM &copy; CARTO" subdomains="abcd" />
          <RouteBounds points={boundsPoints} />
          <RecenterController n={recenterN} target={driverPos || mapCenter} />
          {driverPos && (
            <Marker position={driverPos} icon={pillCarIcon(op.estado, { heading: coords.heading, size: "lg" })} />
          )}
          {navegacion && navTarget && (
            <Marker position={navTarget} icon={pointIcon(navegacion.tipo === "cliente" ? "Cliente" : "Destino", navegacion.tipo === "cliente" ? "#22c55e" : "#ef4444", { size: "lg" })} />
          )}
          {servicio?.origen?.lat != null && servicio.estado === "asignado" && (
            <Marker position={[servicio.origen.lat, servicio.origen.lng]} icon={pointIcon("Cliente", "#22c55e", { size: "lg" })} />
          )}
          {servicio?.destino?.lat != null && servicio.estado === "en_curso" && (
            <Marker position={[servicio.destino.lat, servicio.destino.lng]} icon={pointIcon("Destino", "#ef4444", { size: "lg" })} />
          )}
          {ruta.latlngs && ruta.latlngs.length > 1 && (
            <Polyline positions={ruta.latlngs} pathOptions={{ color: rutaColor, weight: 5, opacity: 0.85 }} />
          )}
        </MapContainer>
      </div>

      {/* HEADER */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="bezel-shell pointer-events-auto">
            <div className="flex items-center gap-3 rounded-[var(--radius)] py-1 pl-1 pr-3">
              <button onClick={() => profileRef.current?.click()} data-testid="perfil-foto-btn"
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[10px] bg-brand/15">
                {op.foto_url ? <img src={`${BACKEND_URL}${op.foto_url}`} alt="perfil" className="h-full w-full object-cover" />
                  : logo ? <img src={`${BACKEND_URL}${logo}`} alt="logo" className="h-full w-full object-contain p-1" />
                  : <Car className="h-6 w-6 text-brand-bright" />}
              </button>
              <input ref={profileRef} type="file" accept="image/*" className="hidden" onChange={(e) => subirFoto(e.target.files?.[0])} />
              <div>
                <div className="text-lg font-extrabold leading-tight text-foreground">{op.nombre}</div>
                <div className="text-sm text-muted-foreground">Unidad {op.placa}</div>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <div className="bezel-shell">
              <div className="flex items-center gap-1 rounded-[var(--radius)] p-1">
                <ModeToggle />
                <ThemeSwitcher />
                <Button
                  data-testid="logout-btn"
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="th-3d"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="th-icon-3d h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <ConnectionBadge state={wsState} />
              <GpsBadge active={enOperacion && !!coords} stale={gpsStale} accuracy={coords?.accuracy} />
            </div>
          </div>
        </div>
      </header>

      {/* Estado del conductor SIEMPRE visible */}
      {enOperacion && (
        <div className="pointer-events-none absolute left-1/2 top-[76px] z-[500] -translate-x-1/2">
          <DriverStatusPill estado={op.estado} />
        </div>
      )}

      {/* Botón recentrar + badge de ruta activa */}
      <div className="pointer-events-auto absolute right-3 top-[118px] z-[500] flex flex-col gap-2 items-end">
        <button
          data-testid="recentrar-mapa-btn"
          onClick={() => setRecenterN((n) => n + 1)}
          className="bezel-shell th-3d flex h-11 w-11 items-center justify-center text-foreground"
          title="Centrar en mi ubicación"
        >
          <LocateFixed className="th-icon-3d h-5 w-5" />
        </button>
        {navegacion && (
          <div data-testid="ruta-info" className="bezel-shell px-3 py-2 text-center">
            <div className="mono-num text-sm font-bold text-brand-bright">{fmtDist(ruta.distance_m)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{fmtDuration(ruta.duration_s)} ETA</div>
          </div>
        )}
      </div>

      {/* ================= BOTTOM SHEET por estado ================= */}
      {/* Persistentes (dismissible=false): reflejan el estado actual, no hay
          acción de "cerrar" válida mientras ese estado sigue siendo cierto. */}

      {/* 1) Fuera de operación: bienvenida */}
      <BottomSheet open={!enOperacion} dismissible={false} testId="driver-sheet-home">
        <div className="flex flex-col items-center pb-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15">
            <Car className="h-7 w-7 text-brand-bright" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-foreground">Tu turno aún no empieza</h2>
          <p className="mt-1 text-sm text-muted-foreground">Conéctate para recibir solicitudes de la central.</p>
        </div>
        <Button data-testid="entrar-operacion-btn" onClick={entrar} size="lg" className="mt-4 w-full">
          <Power className="h-6 w-6" /> Entrar en operación
        </Button>
      </BottomSheet>

      {/* 2) En operación, sin servicio activo */}
      <BottomSheet open={enOperacion && !servicio && !servicioPropio} dismissible={false} testId="driver-sheet-home">
        {/* Estado actual */}
        <div data-testid="estado-actual" className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full" style={{ background: ESTADO_COLORS[op.estado] }} />
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: ESTADO_COLORS[op.estado] }} />
          </span>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Disponibilidad</div>
            <div className="text-base font-bold" style={{ color: ESTADO_COLORS[op.estado] }}>{ESTADO_LABEL[op.estado]}</div>
          </div>
          {inicio && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">En operación</div>
              <div data-testid="tiempo-operacion" className="mono-num font-mono text-base font-bold text-brand-bright">{elapsed(inicio)}</div>
            </div>
          )}
        </div>

        {/* Botones de estado */}
        <div className="mt-3" data-testid="estado-buttons">
          <div className="grid grid-cols-4 gap-2">
            {["libre", "ocupado", "no_disponible", "averiado"].map((e) => {
              const active = op.estado === e;
              return (
                <button
                  key={e}
                  data-testid={`estado-${e}`}
                  onClick={() => cambiarEstado(e)}
                  aria-pressed={active}
                  className="flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-bold transition-all"
                  style={{
                    borderColor: active ? ESTADO_COLORS[e] : "hsl(var(--border))",
                    background: active ? ESTADO_COLORS[e] + "22" : "transparent",
                    color: active ? ESTADO_COLORS[e] : "hsl(var(--muted-foreground))",
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: ESTADO_COLORS[e] }} />
                  {ESTADO_LABEL[e]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ruta */}
        <div className="mt-3">
          <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Ruta (colectivo)</div>
          <Select value={op.ruta_asignada || "libre"} onValueChange={seleccionarRuta}>
            <SelectTrigger data-testid="ruta-select" className="bg-card border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground">
              <SelectItem value="libre" className="focus:bg-secondary">Taxi libre (sin ruta)</SelectItem>
              {rutas.map((r) => (
                <SelectItem key={r.id} value={r.id} className="focus:bg-secondary">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color_hex }} />
                    {r.nombre}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Iniciar servicio */}
        <Button data-testid="iniciar-servicio-btn" onClick={() => setIniciarOpen(true)} size="lg" className="mt-4 w-full">
          <PlayCircle className="h-5 w-5" /> Iniciar servicio
        </Button>

        {/* Acciones */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button data-testid="reportar-objeto-btn" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Package className="h-4 w-4" /> Reportar objeto
          </Button>
          <Button data-testid="abrir-chat-btn" variant="secondary" onClick={abrirChat}>
            <MessageSquare className="h-4 w-4" /> Chat central
          </Button>
        </div>

        {/* Salir de operación */}
        <button
          data-testid="salir-operacion-btn"
          onClick={salir}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 text-sm font-bold text-destructive transition-colors hover:bg-destructive/20"
        >
          <Power className="h-4 w-4" /> Salir de operación
        </button>
      </BottomSheet>

      {/* 3) Servicio digital (oferta / en camino / en curso) */}
      <BottomSheet open={!!(enOperacion && servicio)} dismissible={false} testId="driver-sheet-servicio">
        {servicio && servicio.estado === "ofrecido" && (
          <div data-testid="offer-card" className="animate-scale-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-brand-bright">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-brand" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                </span>
                NUEVO SERVICIO
              </div>
              <span className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-[10px] font-bold text-brand-bright">Solicitud</span>
            </div>

            {ofertaDist && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-surface-2 p-2.5 text-center">
                  <div className="mono-num font-mono text-lg font-extrabold text-foreground">{fmtDist(ofertaDist.m)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Distancia</div>
                </div>
                <div className="rounded-xl border border-border bg-surface-2 p-2.5 text-center">
                  <div className="mono-num font-mono text-lg font-extrabold text-foreground">{fmtDuration(ofertaDist.min * 60)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ETA</div>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
              {servicio.cliente_nombre && (
                <div className="mb-2.5 flex items-center gap-2.5">
                  <ClienteAvatar nombre={servicio.cliente_nombre} />
                  <div>
                    <div className="text-sm font-bold text-foreground">{servicio.cliente_nombre}</div>
                    {servicio.cliente_telefono && <div className="text-xs text-muted-foreground">{servicio.cliente_telefono}</div>}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Origen</div>
                  <div className="font-medium text-foreground">{servicio.origen?.texto || "Ubicación marcada en mapa"}</div>
                </div>
              </div>
              {servicio.destino?.texto && (
                <div className="mt-2 flex items-start gap-2 text-sm">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Destino</div>
                    <div className="text-foreground/85">{servicio.destino.texto}</div>
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" /> {servicio.metodo_pago === "card" ? "Tarjeta" : "Efectivo"}</span>
                {servicio.costo != null && <span className="inline-flex items-center gap-1">${servicio.costo}</span>}
              </div>
            </div>

            {/* Cuenta regresiva */}
            <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Clock className="h-3.5 w-3.5" /> Oferta expira en:
              </span>
              <span data-testid="offer-countdown" className="mono-num font-mono text-sm font-extrabold text-amber-300">
                {fmtDuration(Math.ceil((ofertaExpira ?? 0) / 1000))}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button data-testid="rechazar-servicio-btn" onClick={rechazarOferta} variant="secondary" size="lg"
                className="border-destructive/40 text-destructive hover:bg-destructive/10">
                <X className="h-5 w-5" /> Rechazar
              </Button>
              <Button data-testid="aceptar-servicio-btn" onClick={aceptarOferta} size="lg">
                <Check className="h-5 w-5" /> Aceptar
              </Button>
            </div>
          </div>
        )}

        {servicio && servicio.estado === "asignado" && (
          <div data-testid="ruta-card-cliente" className="animate-slide-up">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15"><MapPin className="h-4 w-4 text-brand-bright" /></span>
              Ir por el cliente
            </div>
            <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3">
              {servicio.cliente_nombre && (
                <div className="mb-2.5 flex items-center gap-2.5">
                  <ClienteAvatar nombre={servicio.cliente_nombre} />
                  <div>
                    <div className="text-sm font-bold text-foreground">{servicio.cliente_nombre}</div>
                    {servicio.cliente_telefono && <div className="text-xs text-muted-foreground">{servicio.cliente_telefono}</div>}
                  </div>
                </div>
              )}
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cliente en</div>
              <div className="text-sm font-medium text-foreground">{servicio.origen?.texto || "Ubicación marcada en mapa"}</div>
              {navegacion && (
                <div className="mt-2 flex items-center gap-4 text-sm">
                  <span className="mono-num inline-flex items-center gap-1 font-mono font-bold text-brand-bright"><NavIcon className="h-3.5 w-3.5" /> {fmtDist(ruta.distance_m)}</span>
                  <span className="mono-num inline-flex items-center gap-1 font-mono font-bold text-brand-bright"><Clock className="h-3.5 w-3.5" /> {fmtDuration(ruta.duration_s)}</span>
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {servicio.metodo_pago && <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" /> {servicio.metodo_pago === "card" ? "Tarjeta" : "Efectivo"}</span>}
                {servicio.costo != null && <span>Costo: ${servicio.costo}</span>}
              </div>
            </div>
            <Button data-testid="iniciar-viaje-btn" onClick={iniciarViaje} size="lg" className="mt-3 w-full">
              <NavIcon className="h-5 w-5" /> Llegué al cliente
            </Button>
          </div>
        )}

        {servicio && servicio.estado === "en_curso" && (
          <div data-testid="ruta-card-destino" className="animate-slide-up">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15"><Flag className="h-4 w-4 text-brand-bright" /></span>
              Llevando al destino
            </div>
            <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Destino</div>
              <div className="text-sm font-medium text-foreground">{servicio.destino?.texto || "Ubicación marcada en mapa"}</div>
              {navegacion && (
                <div className="mt-2 flex items-center gap-4 text-sm">
                  <span className="mono-num inline-flex items-center gap-1 font-mono font-bold text-brand-bright"><NavIcon className="h-3.5 w-3.5" /> {fmtDist(ruta.distance_m)}</span>
                  <span className="mono-num inline-flex items-center gap-1 font-mono font-bold text-brand-bright"><Clock className="h-3.5 w-3.5" /> {fmtDuration(ruta.duration_s)}</span>
                </div>
              )}
              {servicio.costo != null && <div className="mt-1 text-xs text-muted-foreground">Costo: ${servicio.costo}</div>}
            </div>
            <ConfirmAction
              title="¿Finalizar el viaje?"
              description="Marca el servicio como terminado y vuelve a estar disponible."
              confirmLabel="Finalizar"
              onConfirm={terminarAjeno}
              trigger={
                <Button data-testid="terminar-viaje-btn" variant="destructive" size="lg" className="mt-3 w-full">
                  <StopCircle className="h-5 w-5" /> Finalizar viaje
                </Button>
              }
            />
          </div>
        )}

        {servicio && !["ofrecido", "asignado", "en_curso"].includes(servicio.estado) && (
          <div data-testid="servicio-asignado" className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-bright">
              <Bell className="h-4 w-4" /> {SERVICIO_LABEL[servicio.estado] || "Servicio"}
            </div>
            <div className="text-sm text-foreground/90">
              <div><span className="text-muted-foreground">Origen:</span> {servicio.origen?.texto || "—"}</div>
              <div><span className="text-muted-foreground">Destino:</span> {servicio.destino?.texto || "—"}</div>
            </div>
          </div>
        )}

        {servicio && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Package className="h-4 w-4" /> Reportar
            </Button>
            <Button variant="secondary" onClick={abrirChat}>
              <MessageSquare className="h-4 w-4" /> Chat central
            </Button>
          </div>
        )}
      </BottomSheet>

      {/* 4) Servicio propio */}
      <BottomSheet open={!!(enOperacion && !servicio && servicioPropio)} dismissible={false} testId="driver-sheet-propio">
        <div data-testid="servicio-propio" className="rounded-xl border border-brand/40 bg-brand/10 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-brand-bright">
            <PlayCircle className="h-4 w-4" /> Servicio en curso
          </div>
          {servicioPropio && (
            <div className="text-sm text-foreground/90">
              <div>{servicioPropio.origen_texto || "Sin origen"} → {servicioPropio.destino_texto || "Sin destino"}</div>
              {servicioPropio.costo != null && <div className="mt-1 text-muted-foreground">Costo: ${servicioPropio.costo}</div>}
              <div className="mt-1 text-xs text-muted-foreground">Comenzó {timeAgo(servicioPropio.timestamp_creacion)}</div>
            </div>
          )}
          <ConfirmAction
            title="¿Terminar el servicio?"
            description="El pasaje se cierra y quedas disponible para la siguiente solicitud."
            confirmLabel="Terminar"
            onConfirm={terminarServicio}
            trigger={
              <Button data-testid="terminar-servicio-btn" variant="destructive" size="lg" className="mt-3 w-full">
                <StopCircle className="h-5 w-5" /> Terminar servicio
              </Button>
            }
          />
        </div>
      </BottomSheet>

      {/* Overlay: iniciar servicio */}
      {iniciarOpen && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-4 sm:items-center" data-testid="iniciar-overlay">
          <div className="w-full max-w-md animate-slide-up rounded-2xl border border-border bg-card p-4 elev-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground"><PlayCircle className="h-5 w-5 text-brand-bright" /> Iniciar servicio</h3>
              <button onClick={() => setIniciarOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2" data-testid="tarifa-buttons">
                {tarifas.map((t) => (
                  <button key={t.id} data-testid={`tarifa-${t.id}`} onClick={() => iniciarConTarifa(t)}
                    className="rounded-xl border border-border bg-surface-2 px-3 py-4 text-left transition-transform active:scale-95 hover:border-brand">
                    <div className="text-sm font-semibold text-foreground">{t.nombre}</div>
                    <div className="text-lg font-bold text-brand-bright">${t.monto}</div>
                  </button>
                ))}
                {tarifas.length === 0 && (
                  <EmptyState icon={Wallet} title="Sin tarifas configuradas" className="col-span-2 py-6" description="Usa el precio libre para iniciar." />
                )}
              </div>
              <div className="flex gap-2">
                <Input data-testid="iniciar-costo" type="number" value={iniciarForm.costo} onChange={(e) => setIniciarForm((f) => ({ ...f, costo: e.target.value }))} placeholder="Precio libre $" className="input-inset mono-num border-border text-foreground" />
                <Button data-testid="iniciar-libre" onClick={iniciarLibre} className="shrink-0">Iniciar</Button>
              </div>
              <div className="pt-1 text-xs uppercase tracking-wide text-muted-foreground">Origen / destino (opcional)</div>
              <Input data-testid="iniciar-origen" value={iniciarForm.origen_texto} onChange={(e) => setIniciarForm((f) => ({ ...f, origen_texto: e.target.value }))} placeholder="Origen (colonia/calle)" className="input-inset border-border text-foreground" />
              <Input data-testid="iniciar-destino" value={iniciarForm.destino_texto} onChange={(e) => setIniciarForm((f) => ({ ...f, destino_texto: e.target.value }))} placeholder="Destino (colonia/calle)" className="input-inset border-border text-foreground" />
            </div>
          </div>
        </div>
      )}

      {/* Overlay: confirmar reporte */}
      {pendingFile && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-4 sm:items-center" data-testid="reporte-overlay">
          <div className="w-full max-w-md animate-slide-up rounded-2xl border border-border bg-card p-4 elev-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Reportar objeto olvidado</h3>
              <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <img src={URL.createObjectURL(pendingFile)} alt="preview" className="mb-3 max-h-56 w-full rounded-lg object-cover" />
            <Input
              data-testid="reporte-descripcion"
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              className="input-inset mb-3 border-border text-foreground"
            />
            <Button data-testid="reporte-enviar" onClick={enviarReporte} loading={uploading} className="w-full">
              {uploading ? "Enviando…" : "Enviar reporte"}
            </Button>
          </div>
        </div>
      )}

      {/* Overlay: chat */}
      {chatOpen && (
        <div className="fixed inset-0 z-[900] flex flex-col bg-background" data-testid="chat-overlay">
          <div className="mx-auto flex h-full w-full max-w-md flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Chat con la central</h3>
              <button data-testid="chat-cerrar" onClick={() => setChatOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-testid="chat-op-mensajes">
              {chatMsgs.length === 0 && <div className="mt-6 text-center text-xs text-muted-foreground">Aún no hay mensajes</div>}
              {chatMsgs.map((m) => (
                <div key={m.id} className={`flex ${m.remitente === "operador" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.remitente === "operador" ? "bg-brand text-brand-contrast" : "bg-secondary text-foreground"}`}>
                    {m.texto}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                data-testid="chat-op-input"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarChat()}
                placeholder="Escribe un mensaje…"
                className="input-inset border-border text-foreground"
              />
              <Button data-testid="chat-op-enviar" onClick={enviarChat} size="icon" aria-label="Enviar mensaje">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
