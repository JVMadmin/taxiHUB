import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./OperadorApp.css";
import { api, getToken, logoutOperador, ESTADO_COLORS, ESTADO_LABEL, SERVICIO_LABEL, BACKEND_URL, WS_BASE, subirEvidenciaTurno } from "@/lib/api";
import { elapsed, timeAgo } from "@/lib/time";
import { cn, iniciales, fileUrl } from "@/lib/utils";
import { distM, fmtDist, fmtDuration, bearing } from "@/lib/geo";
import { useRouting } from "@/hooks/useRouting";
import { pointIcon, pillCarIcon, taxiRoleAssetIcon } from "@/lib/taxiIcon";
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
import { VehicleImage } from "@/components/VehicleImage";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Car, Power, LogOut, MapPin, Bell, Package, MessageSquare, Send, X,
  PlayCircle, StopCircle, Check, LocateFixed, Navigation as NavIcon, Wallet,
  Clock, Flag, User, AlertTriangle, Gauge, Fuel, Mic, Settings,
  Camera, ShieldCheck, Banknote, Satellite, RefreshCw, Volume2, Layers,
  Play, Crosshair, ChevronDown, Loader2, Box,
} from "lucide-react";
import { DriverMap3D, webglDisponible } from "@/components/maps/DriverMap3D";
import { DRIVER } from "@/constants/testIds";
import { applyMode } from "@/lib/theme";
import { puenteNativo, activarKeepAliveAudio, sonarAlertaOferta, hablarVoz, detenerVoz, anunciarServicioEntrante, probarAudioVoz, reconocimientoDisponible, crearReconocimiento, clasificarComandoOferta, pedirPermisoNotificaciones, mostrarNotificacion, vibrar, resolverSitioAproximado } from "@/lib/voz";
import { iniciarGpsSegundoPlano, detenerGpsSegundoPlano, enviarUbicacionRobusta, obtenerEstadoGps, vaciarColaOffline, obtenerColaOffline } from "@/lib/backgroundGps";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

const fmtMoney2 = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

// lib/backgroundGps llama con rutas "/api/..." y `body` en texto (estilo fetch); `api` (axios)
// ya trae el prefijo /api y espera `data`. Sin este adaptador el GPS iba a /api/api/... (404).
const gpsApiFetch = async (url, { body, ...opts } = {}) => {
  const resp = await api({
    url: url.replace(/^\/api(?=\/)/, ""),
    data: typeof body === "string" ? JSON.parse(body) : body,
    ...opts,
  });
  return resp?.data;
};

// Rumbo confiable del taxi. El del GPS solo vale en movimiento (≥ 1.5 m/s); si no, se usa el
// desplazamiento real desde el último punto de referencia (≥ 8 m). Parado, el ruido del GPS
// hacía girar el taxi al azar: se conserva el último rumbo bueno.
function rumboFiable(ancla, c, previo) {
  const h = Number(c.heading);
  if (c.heading != null && Number.isFinite(h) && c.speed != null && c.speed >= 1.5) {
    return { heading: h, ancla: c };
  }
  if (ancla) {
    const d = distM(ancla, c);
    if (d != null && d >= 8) return { heading: bearing(ancla.lat, ancla.lng, c.lat, c.lng), ancla: c };
    return { heading: previo ?? null, ancla };
  }
  return { heading: null, ancla: c };
}

const LOC_INTERVAL = 8000; // 8s intervalo de reporte GPS en primer plano

const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_REF = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const STREET_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const STREET_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Fallback por-tile si una capa falla
const FALLBACK_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TAXI_ASSET = "/assets/vehicles/taxihub-taxi-azul.png";
const MARCH_LOGO = "/assets/vehicles/march.png";
const DEMO_DRIVER_AVATARS = {
  op1: "/assets/drivers/driver-01.jpg",
  op2: "/assets/drivers/driver-02.jpg",
  op3: "/assets/drivers/driver-03.jpg",
  op4: "/assets/drivers/driver-04.jpg",
  op5: "/assets/drivers/driver-05.jpg",
};

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
        Sin conexión a Internet. Reconectandoâ€¦
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
  const [chatServicioId, setChatServicioId] = useState(null);
  const chatServicioRef = useRef(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const notificarServicioRef = useRef(null);
  const anunciadoServicioIdRef = useRef(null);
  const [chatText, setChatText] = useState("");
  const [chatUploading, setChatUploading] = useState(false);
  const [chatImagePreview, setChatImagePreview] = useState(null);
  const chatFileInputRef = useRef(null);
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
  const anclaRumboRef = useRef(null); // último punto desde el que se midió el rumbo
  const [wsState, setWsState] = useState("reconnecting");
  const [gpsStale, setGpsStale] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [recenterN, setRecenterN] = useState(0);
  // Modo nocturno prioritario: default oscuro salvo que el usuario elija claro.
  const [driverLight, setDriverLight] = useState(() => localStorage.getItem("driver_mode") === "claro");
  const ignoreInitialModeEvent = useRef(true);
  const [mapLayer, setMapLayer] = useState(() => localStorage.getItem("driver_map_layer") || "calles");
  const toggleMapLayer = () => {
    const next = mapLayer === "satelite" ? "calles" : "satelite";
    setMapLayer(next);
    localStorage.setItem("driver_map_layer", next);
    toast.info(next === "satelite" ? "Modo Satelital con calles y lugares activado" : "Modo Calles de Palenque activado");
  };
  // Mapa 3D (MapLibre) por defecto si hay WebGL; el chofer puede volver al mapa plano.
  const [webgl] = useState(() => webglDisponible());
  const [mapa3d, setMapa3d] = useState(() => localStorage.getItem("driver_map_3d") !== "0");
  const toggleMapa3d = () => {
    const next = !mapa3d;
    setMapa3d(next);
    localStorage.setItem("driver_map_3d", next ? "1" : "0");
    toast.info(next ? "Vista 3D activada" : "Vista plana activada");
  };
  const rutaColor = driverLight ? "#059669" : "#10b981";
  const driverAvatar = op?.foto_url ? fileUrl(op.foto_url) : DEMO_DRIVER_AVATARS[op?.usuario] || "/assets/drivers/default-driver.svg";

  // ---- Ajustes del operador (voz IA, comandos de voz, notificaciones, GPS) ----
  const [ajustesOpen, setAjustesOpen] = useState(false);
  const [diagnosticoOpen, setDiagnosticoOpen] = useState(false);
  const [diagnosticoData, setDiagnosticoData] = useState(null);
  const [diagnosticoLoading, setDiagnosticoLoading] = useState(false);

  const abrirDiagnostico = async () => {
    setDiagnosticoOpen(true);
    setDiagnosticoLoading(true);
    try {
      const { data } = await api.get("/operadores/diagnostico-gps");
      setDiagnosticoData(data);
    } catch {
      setDiagnosticoData(null);
    } finally {
      setDiagnosticoLoading(false);
    }
  };

  const forzarSyncCola = async () => {
    const res = await vaciarColaOffline({
      operadorId: op?.id,
      apiFetch: gpsApiFetch,
    });
    if (res?.ok) {
      toast.success(`Cola sincronizada (${res.procesados} puntos enviados)`);
      abrirDiagnostico();
    } else {
      toast.info("No hay puntos pendientes o sin conexión.");
    }
  };

  const [vozOn, setVozOn] = useState(() => localStorage.getItem("driver_voz") !== "off");
  const [comandosVozOn, setComandosVozOn] = useState(() => localStorage.getItem("driver_comandos_voz") !== "off");
  const [notifOn, setNotifOn] = useState(() => localStorage.getItem("driver_notif") !== "off");
  const [gpsFondoOn, setGpsFondoOn] = useState(() => localStorage.getItem("driver_gps_fondo") !== "off");
  const [micEscuchando, setMicEscuchando] = useState(false);
  const micRef = useRef(null);
  const servicioRef = useRef(null);
  const chatServicioActivoRef = useRef(null);
  const accionesRef = useRef({});
  const vozOnRef = useRef(vozOn);
  const notifOnRef = useRef(notifOn);
  const comandosVozOnRef = useRef(comandosVozOn);
  const gpsFondoOnRef = useRef(gpsFondoOn);
  const opRef = useRef(null);
  useEffect(() => { vozOnRef.current = vozOn; notifOnRef.current = notifOn; comandosVozOnRef.current = comandosVozOn; gpsFondoOnRef.current = gpsFondoOn; });
  useEffect(() => { servicioRef.current = servicio; }, [servicio]);
  useEffect(() => { opRef.current = op; });
  useEffect(() => { accionesRef.current = { aceptarOferta, rechazarOferta }; });

  useEffect(() => {
    const onMode = (event) => {
      if (ignoreInitialModeEvent.current) {
        ignoreInitialModeEvent.current = false;
        return;
      }
      const light = event.detail === "claro";
      setDriverLight(light);
      localStorage.setItem("driver_mode", light ? "claro" : "oscuro");
    };
    window.addEventListener("app:mode", onMode);
    return () => window.removeEventListener("app:mode", onMode);
  }, []);

  // Solicitar permisos nativos de notificación y ubicación al abrir la app en Android
  useEffect(() => {
    puenteNativo()?.requestAllPermissions?.();
  }, []);

  // Adaptación nativa de la barra de estado en Android
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Promesas: el try/catch no atrapa su rechazo. setBackgroundColor no existe en Android 15+.
      StatusBar.setStyle({ style: driverLight ? Style.Light : Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: driverLight ? "#F4F7F6" : "#050B12" }).catch(() => {});
    }
  }, [driverLight]);

  // Manejo contextual del botón Atrás en Android (cierra modales o drawers antes de minimizar)
  useEffect(() => {
    const onHwBack = (e) => {
      if (chatOpen) {
        e.preventDefault();
        setChatOpen(false);
      } else if (ajustesOpen) {
        e.preventDefault();
        setAjustesOpen(false);
      } else if (diagnosticoOpen) {
        e.preventDefault();
        setDiagnosticoOpen(false);
      } else if (iniciarOpen) {
        e.preventDefault();
        setIniciarOpen(false);
      }
    };
    window.addEventListener("app:hardwareBack", onHwBack);
    return () => window.removeEventListener("app:hardwareBack", onHwBack);
  }, [chatOpen, ajustesOpen, diagnosticoOpen, iniciarOpen]);

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

  // Wake Lock: mantiene la pantalla activa en turno.
  // Segundo plano web: con la app oculta los navegadores limitan temporizadores
  // y GPS; se mantiene el intervalo y se avisa con notificación persistente.
  // Seguimiento real con pantalla apagada requiere la APK nativa (Capacitor).
  useEffect(() => {
    let lock = null;
    const req = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch (_) {} };
    if (enOperacion) req();
    const onVis = () => {
      if (!enOperacion) return;
      if (document.visibilityState === "visible") {
        req();
      } else if (gpsFondoOnRef.current && notifOnRef.current) {
        mostrarNotificacion({
          titulo: "GPS activo en segundo plano",
          cuerpo: "Sigues en operación. Vuelve a la app para ver el mapa.",
          tag: "taxihub-gps-fondo",
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); try { lock?.release(); } catch (_) {} };
  }, [enOperacion]);

  const transmitirUbicacion = useCallback(async (punto, id) => {
    const opId = id || op?.id;
    if (!opId) return;
    try {
      await enviarUbicacionRobusta(punto, {
        operadorId: opId,
        apiFetch: gpsApiFetch,
      });
    } catch (_) {}
  }, [op]);

  const sendLocation = useCallback((id) => {
    if (!navigator.geolocation) {
      if (lastPosRef.current) transmitirUbicacion(lastPosRef.current, id);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const c = {
          lat, lng,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          client_ts: new Date().toISOString(),
        };
        const r = rumboFiable(anclaRumboRef.current, c, lastPosRef.current?.heading);
        c.heading = r.heading;
        anclaRumboRef.current = r.ancla;
        lastPosRef.current = c;
        setCoords(c);
        setGpsStale(false);
        await transmitirUbicacion(c, id);
      },
      (err) => {
        setGpsStale(true);
        // Fallback: reportar presencia activa con última ubicación conocida o coordenadas default
        const fallback = lastPosRef.current || { lat: 17.5099, lng: -91.9847 };
        transmitirUbicacion({ ...fallback, client_ts: new Date().toISOString() }, id);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
    );
  }, [transmitirUbicacion]);

  // Envío automático de ubicación + Servicio en 2º plano (Android Foreground Service + Audio KeepAlive)
  useEffect(() => {
    if (enOperacion && op) {
      activarKeepAliveAudio(true);
      sendLocation(op.id);
      timerRef.current = setInterval(() => sendLocation(op.id), LOC_INTERVAL);
      iniciarGpsSegundoPlano({
        onLocation: async (loc) => {
          const c = {
            lat: loc.lat,
            lng: loc.lng,
            accuracy: loc.accuracy,
            speed: loc.speed,
            heading: loc.heading,
            client_ts: loc.client_ts || new Date().toISOString(),
            fromBackgroundService: true,
          };
          const r = rumboFiable(anclaRumboRef.current, c, lastPosRef.current?.heading);
          c.heading = r.heading;
          anclaRumboRef.current = r.ancla;
          lastPosRef.current = c;
          setCoords(c);
          setGpsStale(false);
          await transmitirUbicacion(c, op.id);
        },
      });
    } else {
      activarKeepAliveAudio(false);
      detenerGpsSegundoPlano();
    }
    return () => {
      clearInterval(timerRef.current);
      detenerGpsSegundoPlano();
    };
  }, [enOperacion, op, sendLocation, transmitirUbicacion]);

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

  // Sincronización periódica de servicios activos (resiliencia si WS parpadea)
  useEffect(() => {
    if (!enOperacion || !op?.id) return;
    const t = setInterval(async () => {
      try {
        const { data: items } = await api.get("/servicios/mis-activos");
        if (Array.isArray(items)) {
          if (items.length === 0) {
            if (servicioRef.current && ["ofrecido", "asignado"].includes(servicioRef.current.estado)) {
              setServicio(null);
              setOp((p) => ({ ...p, estado: "libre" }));
            }
          } else {
            const primero = items.find((s) => s.tipo !== "operador") || items[0];
            if (primero && (!servicioRef.current || servicioRef.current.id !== primero.id || servicioRef.current.estado !== primero.estado)) {
              if (primero.tipo === "operador") {
                setServicioPropio(primero);
              } else {
                setServicio(primero);
                if (primero.estado === "ofrecido" && (!servicioRef.current || servicioRef.current.id !== primero.id)) {
                  notificarServicioRef.current?.(primero);
                }
              }
            }
          }
        }
      } catch (_) {}
    }, 10000);
    return () => clearInterval(t);
  }, [enOperacion, op?.id]);

  // WebSocket: recibe asignación de servicios + estado de conexión.
  // Latido: "ping" cada 25 s; si en 70 s no llega "pong" la conexión está muerta (en redes
  // móviles se corta sin avisar y la app seguía "en línea" sin recibir ofertas) y se reconecta.
  useEffect(() => {
    if (!op) return;
    let closed = false;
    let retry;
    let latido;
    let ultimoPong = 0;
    let servidorConPong = false; // un servidor sin latido (versión anterior) nunca contesta
    const connect = () => {
      clearTimeout(retry);
      clearInterval(latido);
      setWsState(navigator.onLine ? "reconnecting" : "offline");
      const ws = new WebSocket(`${WS_BASE}/ws/operador/${op.id}?token=${encodeURIComponent(getToken() || "")}`);
      wsRef.current = ws;
      ws.onopen = () => {
        setWsState(navigator.onLine ? "online" : "reconnecting");
        ultimoPong = Date.now();
        latido = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (servidorConPong && Date.now() - ultimoPong > 70000) {
            ws.close();
            return;
          }
          try { ws.send("ping"); } catch (_) { /* onclose reconecta */ }
        }, 25000);
      };
      ws.onclose = (ev) => {
        clearInterval(latido);
        if (wsRef.current !== ws) return; // conexión vieja reemplazada al volver a la app
        setWsState((s) => (navigator.onLine ? "reconnecting" : "offline"));
        if (ev.code === 1008) {
          logoutOperador();
          navigate("/login");
          return;
        }
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "pong") {
          ultimoPong = Date.now();
          servidorConPong = true;
          return;
        }
        if (msg.type === "nuevo_servicio") {
          setServicio(msg.servicio);
          setServicioPropio(null);
          toast.info("🚕 Nuevo servicio asignado");
          notificarServicioRef.current?.(msg.servicio);
        } else if (msg.type === "servicio_actualizado") {
          const s = msg.servicio;
          if (["cancelado", "completado", "vencido", "rechazado"].includes(s?.estado)) {
            if (servicioRef.current?.id === s.id) {
              setServicio(null);
              setOp((p) => ({ ...p, estado: "libre" }));
              detenerEscucha();
              toast.info(s.estado === "cancelado" ? "El servicio fue cancelado" : "Servicio completado, quedas libre");
            }
          }
        } else if (msg.type === "destino_alcanzado") {
          toast.success("Servicio completado", { description: "Destino alcanzado. Quedas disponible." });
          if (vozOnRef.current) hablarVoz("Destino alcanzado. Servicio completado, quedas disponible.");
          if (notifOnRef.current) mostrarNotificacion({ titulo: "Servicio completado", cuerpo: "Destino alcanzado. Quedas disponible.", tag: "taxihub-destino" });
        } else if (msg.type === "mensaje") {
          if (!msg.servicio_id || msg.servicio_id === chatServicioRef.current) {
            setChatMsgs((m) => (m.some((x) => x.id === msg.mensaje.id) ? m : [...m, msg.mensaje]));
          }
          if (msg.mensaje.remitente === "terminal") {
            toast.info("💬 Mensaje de la central");
            if (vozOnRef.current) hablarVoz(`Mensaje de la central: ${msg.mensaje.texto || ""}`, { alertaPrevia: true });
            if (notifOnRef.current) mostrarNotificacion({ titulo: "Mensaje de la central", cuerpo: msg.mensaje.texto || "", tag: "taxihub-chat" });
          }
        }
      };
    };
    connect();
    const onOnline = () => setWsState("reconnecting");
    const onOffline = () => setWsState("offline");
    // Al volver a la app (pantalla encendida, desde otra app o desde la notificación):
    // reconectar si el socket murió en segundo plano y revisar si hay una oferta pendiente.
    const alVolver = () => {
      if (closed) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        const viejo = wsRef.current;
        wsRef.current = null;
        try { viejo?.close(); } catch (_) { /* noop */ }
        connect();
      }
      api.get("/servicios/mis-activos").then(({ data }) => {
        const oferta = (data || []).find((s) => s.estado === "ofrecido");
        if (oferta && servicioRef.current?.id !== oferta.id) {
          setServicio(oferta);
          notificarServicioRef.current?.(oferta);
        }
      }).catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === "visible") alVolver(); };
    document.addEventListener("visibilitychange", onVisible);
    const reanudar = Capacitor.isNativePlatform() ? CapApp.addListener("resume", alVolver) : null;
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(latido);
      wsRef.current?.close();
      document.removeEventListener("visibilitychange", onVisible);
      reanudar?.then((h) => h.remove()).catch(() => {});
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
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

  // ---- Turno (F6 + Evidencias de Combustible, Entrega de Unidad y Liquidación de Cuota) ----
  const [turno, setTurno] = useState(null);
  const [kmModalOpen, setKmModalOpen] = useState(false);
  const [kmInput, setKmInput] = useState("");
  const [kmMode, setKmMode] = useState("iniciar"); // iniciar | finalizar
  const [turnoHist, setTurnoHist] = useState([]);
  const [turnoCombustible, setTurnoCombustible] = useState("1/2");
  const [turnoEvidenciaUrl, setTurnoEvidenciaUrl] = useState(null);
  const [turnoEvidenciaUploading, setTurnoEvidenciaUploading] = useState(false);
  const [entregaUnidadConfirmada, setEntregaUnidadConfirmada] = useState(true);
  const [entregaA, setEntregaA] = useState("Dueño / Socio");
  const [cuotaEntregada, setCuotaEntregada] = useState("");
  const [metodoPagoCuota, setMetodoPagoCuota] = useState("efectivo");
  const [notasEntrega, setNotasEntrega] = useState("");
  const turnoEvidenciaRef = useRef(null);

  const cargarTurno = useCallback(async () => {
    try {
      const { data } = await api.get("/turnos/activo");
      setTurno(data.turno);
    } catch { /* sin turno */ }
  }, []);

  useEffect(() => { if (op) cargarTurno(); }, [op, cargarTurno]);

  const handleSubirEvidenciaTurno = async (file) => {
    if (!file) return;
    setTurnoEvidenciaUploading(true);
    try {
      const data = await subirEvidenciaTurno(file, kmMode === "iniciar" ? "inicio_turno" : "fin_turno");
      setTurnoEvidenciaUrl(data.evidencia_url);
      toast.success("Evidencia fotográfica subida");
    } catch {
      toast.error("No se pudo subir la foto de evidencia");
    } finally {
      setTurnoEvidenciaUploading(false);
    }
  };

  const confirmarKm = async () => {
    const km = kmInput.trim() !== "" ? parseFloat(kmInput) : null;
    if (kmInput.trim() !== "" && (!Number.isFinite(km) || km < 0)) {
      toast.error("Escribe un kilometraje válido o déjalo vacío");
      return;
    }

    if (kmMode === "finalizar") {
      if (servicio && ["asignado", "en_curso"].includes(servicio.estado)) {
        toast.error("No puedes finalizar turno con un servicio en curso", {
          description: "Completa o cancela el viaje activo antes de cerrar la jornada.",
        });
        return;
      }
      if (km !== null && turno?.odometro_inicio != null && km < turno.odometro_inicio) {
        toast.error("El kilometraje final no puede ser menor al inicial");
        return;
      }
    }

    try {
      if (kmMode === "iniciar") {
        const { data } = await api.post("/turnos/iniciar", {
          odometro_km: km,
          combustible_inicio: turnoCombustible,
          foto_evidencia_inicio_url: turnoEvidenciaUrl || null,
        });
        setTurno(data.turno);
        await cambiarEstado("libre");
        const me = await api.get("/auth/me");
        setOp(me.data);
        setInicio(me.data.inicio_operacion || null);
        toast.success("Turno iniciado", {
          description: `Km iniciales: ${km ?? "N/R"} · Combustible: ${turnoCombustible}`,
        });
      } else {
        const montoCuota = cuotaEntregada !== "" ? parseFloat(cuotaEntregada) : (turno?.cuota_diaria || op?.vehiculo?.cuota_diaria || 0);
        const { data } = await api.post("/turnos/finalizar", {
          odometro_km: km,
          combustible_fin: turnoCombustible,
          foto_evidencia_fin_url: turnoEvidenciaUrl || null,
          entrega_unidad_confirmada: entregaUnidadConfirmada,
          entrega_a: entregaA,
          cuota_entregada: Number.isFinite(montoCuota) ? montoCuota : 0,
          metodo_pago_cuota: metodoPagoCuota,
          notas_entrega: notasEntrega || null,
        });
        setTurno(null);
        setTurnoHist((h) => [data.turno, ...h]);
        setOp((p) => ({ ...p, estado: "fuera_de_servicio" }));
        setInicio(null);
        toast.success("Turno cerrado y entrega registrada", {
          description: `Recorriste ${data.turno.km_recorridos} km · Cuota reportada: $${Number.isFinite(montoCuota) ? montoCuota : 0}`,
          duration: 6000,
        });
      }
      setKmModalOpen(false);
      setKmInput("");
      setTurnoEvidenciaUrl(null);
    } catch (e) {
      const detalle = e.response?.data?.detail || "";
      if (e.response?.status === 409 && kmMode === "finalizar" && /turno activo/i.test(detalle)) {
        setTurno(null);
        const ok = await cambiarEstado("fuera_de_servicio");
        if (ok) { setInicio(null); toast("Saliste de operación"); }
        setKmModalOpen(false);
        setKmInput("");
        return;
      }
      toast.error(detalle || "No se pudo registrar el turno");
    }
  };

  const pedirKm = (mode) => {
    setKmMode(mode);
    setKmInput("");
    setTurnoCombustible("1/2");
    setTurnoEvidenciaUrl(null);
    setEntregaUnidadConfirmada(true);
    setEntregaA("Dueño / Socio");
    const cuotaRef = turno?.cuota_diaria || op?.vehiculo?.cuota_diaria || 350;
    setCuotaEntregada(String(cuotaRef));
    setMetodoPagoCuota("efectivo");
    setNotasEntrega("");
    setKmModalOpen(true);
  };

  // ---- Combustible (F12 premium §27/§29): carga + ticket + historial ----
  const [combOpen, setCombOpen] = useState(false);
  const [combForm, setCombForm] = useState({
    fecha: new Date().toISOString().slice(0, 10), litros: "", costo: "",
    odometro_km: "", estacion: "",
  });
  const [combTicket, setCombTicket] = useState(null);
  const [combSaving, setCombSaving] = useState(false);
  const [combHist, setCombHist] = useState([]);
  const combFileRef = useRef(null);

  const abrirCombustible = async () => {
    setCombOpen(true);
    try {
      const { data } = await api.get("/combustible/mis-cargas");
      setCombHist(data.cargas || []);
    } catch { setCombHist([]); }
  };

  const guardarCarga = async () => {
    const litros = parseFloat(combForm.litros);
    const costo = parseFloat(combForm.costo);
    const km = parseFloat(combForm.odometro_km);
    if (!combForm.fecha || !Number.isFinite(litros) || litros <= 0 || !Number.isFinite(costo) || !Number.isFinite(km)) {
      toast.error("Completa litros, costo y kilometraje");
      return;
    }
    setCombSaving(true);
    try {
      const fd = new FormData();
      fd.append("fecha", combForm.fecha);
      fd.append("litros", String(litros));
      fd.append("costo", String(costo));
      fd.append("odometro_km", String(km));
      if (combForm.estacion) fd.append("estacion", combForm.estacion);
      if (combTicket) fd.append("ticket", combTicket);
      const idempotencyKey = `comb_${op?.id || "op"}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      fd.append("idempotency_key", idempotencyKey);
      const { data } = await api.post("/combustible", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data?.duplicado) {
        toast.info("Carga previa detectada (sin duplicado)");
      } else {
        toast.success("Carga registrada con éxito", { description: `${litros} L · ${fmtMoney2(costo)}` });
      }
      setCombForm((f) => ({ ...f, litros: "", costo: "", estacion: "" }));
      setCombTicket(null);
      const res = await api.get("/combustible/mis-cargas");
      setCombHist(res.data.cargas || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo registrar la carga");
    } finally {
      setCombSaving(false);
    }
  };

  const entrar = async () => { pedirKm("iniciar"); };
  const salir = async () => {
    // Sin turno (estado legacy de una sesión anterior, o cambio manual desde
    // la terminal): salida directa sin captura de km â€” no hay nada que cerrar.
    if (!turno) {
      const ok = await cambiarEstado("fuera_de_servicio");
      if (ok) {
        setInicio(null);
        toast("Saliste de operación");
      }
      return;
    }
    pedirKm("finalizar");
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

  const abrirChat = async (servicioId = null) => {
    setChatOpen(true);
    setChatServicioId(servicioId);
    chatServicioRef.current = servicioId;
    const { data } = await api.get(servicioId ? `/servicios/${servicioId}/mensajes` : `/mensajes?operador_id=${op.id}`);
    setChatMsgs(data);
  };
  const enviarChat = async () => {
    if (!chatText.trim()) return;
    const t = chatText; setChatText("");
    if (chatServicioId) await api.post(`/servicios/${chatServicioId}/mensajes`, { texto: t });
    else await api.post("/mensajes", { operador_id: op.id, remitente: "operador", texto: t });
  };
  const handleChatImagePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setChatUploading(true);
      const fd = new FormData();
      fd.append("foto", file);
      if (chatText.trim()) fd.append("texto", chatText.trim());
      let res;
      if (chatServicioId) {
        res = await api.post(`/servicios/${chatServicioId}/mensajes/foto`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        fd.append("operador_id", op.id);
        fd.append("remitente", "operador");
        res = await api.post("/mensajes/foto", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setChatMsgs((prev) => (prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
      setChatText("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo subir la imagen");
    } finally {
      setChatUploading(false);
      if (chatFileInputRef.current) chatFileInputRef.current.value = "";
    }
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
    detenerEscucha();
    try {
      await api.post(`/servicios/${servicio.id}/aceptar`);
      await actualizarServicio();
      setOp((p) => ({ ...p, estado: "ocupado" }));
      toast.success("Servicio aceptado");
    } catch (e) { toast.error(e.response?.data?.detail || "No se pudo aceptar"); setServicio(null); }
  };
  const rechazarOferta = async () => {
    detenerEscucha();
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

  // ---- Voz IA + comandos de voz + notificaciones (tiempo real) ----
  const detenerEscucha = () => {
    micRef.current?.detener?.();
    micRef.current = null;
    setMicEscuchando(false);
  };

  const ejecutarComando = (texto) => {
    const accion = clasificarComandoOferta(texto);
    if (!accion) {
      toast("No te entendí", { description: `Dime "aceptar" o "rechazar" (escuché: ${texto.slice(0, 40)})` });
      return;
    }
    detenerEscucha();
    const s = servicioRef.current;
    if (!s) return;
    if (accion === "aceptar" || accion === "confirmar") {
      api.post(`/servicios/${s.id}/aceptar`)
        .then(() => api.get(`/servicios/${s.id}`))
        .then(({ data }) => { setServicio(data); setOp((p) => ({ ...p, estado: "ocupado" })); })
        .then(() => toast.success("Servicio aceptado"))
        .catch(() => { toast.error("No se pudo aceptar"); setServicio(null); });
    } else {
      api.post(`/servicios/${s.id}/rechazar`)
        .then(() => { setServicio(null); toast("Oferta rechazada"); })
        .catch(() => toast.error("No se pudo rechazar"));
    }
  };

  // Micrófono manual (botón en la oferta) o automático tras la voz IA.
  const escucharComandoOferta = useCallback((auto = false) => {
    if (!reconocimientoDisponible()) {
      toast.error("Tu navegador no soporta comandos de voz");
      return;
    }
    if (micRef.current) { micRef.current.detener(); micRef.current = null; }
    setMicEscuchando(true);
    if (!auto) toast.info("Escuchando… di “aceptar” o “rechazar”");
    micRef.current = crearReconocimiento({
      onFinal: manejarComandoOferta,
      onEnd: () => { micRef.current = null; setMicEscuchando(false); },
      onError: () => { micRef.current = null; setMicEscuchando(false); },
    }) || null;
    if (!micRef.current) setMicEscuchando(false);
  }, []);

  const getUnidadTxt = () => opRef.current?.placa || opRef.current?.vehiculo?.numero_economico;

  // Responde por voz a la pregunta del conductor sobre la distancia.
  const decirDistancia = () => {
    const s = servicioRef.current;
    const my = lastPosRef.current;
    const o = s?.origen;
    if (!s || !my || o?.lat == null) return;
    const m = distM({ lat: my.lat, lng: my.lng }, { lat: o.lat, lng: o.lng });
    if (m == null) return;
    const kmTxt = fmtDist(m).replace(" m ", " metros ").replace(" km", " kilómetros");
    const min = Math.max(1, Math.round(m / (25_000 / 3600)));
    const sitio = resolverSitioAproximado(o.texto, o);
    hablarVoz(`Estás a ${kmTxt} de ${sitio}, unos ${min} minuto${min === 1 ? "" : "s"}. Confirma para aceptar.`);
  };

  // Distancia si el conductor lo pregunta durante la escucha de la oferta.
  const manejarComandoOferta = (texto) => {
    if (clasificarComandoOferta(texto) === "distancia") {
      decirDistancia();
      micRef.current = null;
      setMicEscuchando(true);
      micRef.current = crearReconocimiento({
        onFinal: manejarComandoOferta,
        onEnd: () => { micRef.current = null; setMicEscuchando(false); },
        onError: () => { micRef.current = null; setMicEscuchando(false); },
      }) || null;
      return;
    }
    ejecutarComando(texto);
  };

  const notificarServicio = (s) => {
    if (!s || s.estado !== "ofrecido") return;
    if (anunciadoServicioIdRef.current === s.id) return;
    anunciadoServicioIdRef.current = s.id;

    const unidadTxt = getUnidadTxt() ? `Unidad ${getUnidadTxt()}` : "Taxi libre";
    const origenRaw = s?.origen?.texto || (s?.origen?.lat ? `${s.origen.lat}, ${s.origen.lng}` : "Ubicación en mapa");
    const destinoTxt = s?.destino?.texto || "";
    const distKm = ofertaDist ? (ofertaDist.m / 1000) : null;

    // Obtener sitio aproximado de calle/esquina o POI (sin coordenadas numéricas)
    const origenSitio = resolverSitioAproximado(origenRaw, s?.origen);
    const destinoSitio = destinoTxt ? resolverSitioAproximado(destinoTxt, s?.destino) : "";

    // Despertar la pantalla para que el chofer vea la oferta de inmediato
    if (typeof navigator !== "undefined" && navigator.wakeLock) {
      navigator.wakeLock.request("screen").catch(() => {});
    }

    if (vozOnRef.current) {
      anunciarServicioEntrante({
        origen: origenSitio,
        destino: destinoSitio,
        coordsOrigen: s?.origen,
        coordsDestino: s?.destino,
        distanciaKm: distKm,
      });
      vibrar([200, 100, 200, 100, 300]);
      // Tras terminar el anuncio (~4.5s), auto-escuchar el comando si está activo.
      if (comandosVozOnRef.current) setTimeout(() => {
        if (servicioRef.current?.estado === "ofrecido") escucharComandoOferta(true);
      }, 4500);
    } else {
      sonarAlertaOferta();
      vibrar([200, 100, 200]);
    }
    if (notifOnRef.current) {
      mostrarNotificacion({
        titulo: `${unidadTxt}: nuevo servicio`,
        cuerpo: `Pasajero en ${origenSitio}${destinoSitio ? ` → ${destinoSitio}` : ""}`,
        tag: "taxihub-oferta",
      });
    }
  };
  notificarServicioRef.current = notificarServicio;

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

  const ofertaRecibidaAtRef = useRef(null);
  const ultimoServicioOfrecidoIdRef = useRef(null);

  useEffect(() => {
    if (servicio?.estado === "ofrecido") {
      if (servicio.id !== ultimoServicioOfrecidoIdRef.current) {
        ultimoServicioOfrecidoIdRef.current = servicio.id;
        ofertaRecibidaAtRef.current = Date.now();
      }
    } else {
      ultimoServicioOfrecidoIdRef.current = null;
      ofertaRecibidaAtRef.current = null;
    }
  }, [servicio]);

  // Cuenta regresiva de la oferta: duración que fija el servidor (`oferta_ttl_s`),
  // medida desde que llegó al teléfono para ser inmune a desfases de reloj.
  const ofertaTotalMs = (Number(servicio?.oferta_ttl_s) || 45) * 1000;
  const ofertaExpira = useMemo(() => {
    if (!servicio || servicio.estado !== "ofrecido") return null;
    const inicio = ofertaRecibidaAtRef.current || Date.now();
    const transcurrido = now.getTime() - inicio;
    const restante = ofertaTotalMs - transcurrido;
    return restante > 0 ? restante : 0;
  }, [servicio, now, ofertaTotalMs]);

  useEffect(() => {
    if (ofertaExpira === 0 && servicio?.estado === "ofrecido") {
      setServicio(null);
      setOp((p) => ({ ...p, estado: "libre" }));
      detenerEscucha();
      toast("Oferta expirada", { description: "La solicitud fue reasignada." });
      if (vozOnRef.current) hablarVoz("La oferta expiró. Fue reasignada.");
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

  // Puntos del mapa 3D: mismos criterios que los marcadores del mapa Leaflet.
  const puntosMapa = useMemo(() => {
    const pts = [];
    if (navegacion && navTarget) {
      pts.push({ pos: navTarget, texto: navegacion.tipo === "cliente" ? "Cliente" : "Destino", color: navegacion.tipo === "cliente" ? "#22c55e" : "#ef4444" });
    } else {
      if (servicio?.origen?.lat != null && servicio.estado === "asignado") pts.push({ pos: [servicio.origen.lat, servicio.origen.lng], texto: "Cliente", color: "#22c55e" });
      if (servicio?.destino?.lat != null && servicio.estado === "en_curso") pts.push({ pos: [servicio.destino.lat, servicio.destino.lng], texto: "Destino", color: "#ef4444" });
    }
    return pts;
  }, [navegacion, navTarget, servicio]);

  if (!op) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-brand" />
        <span className="text-sm">Cargando tu turnoâ€¦</span>
      </div>
    );
  }

  return (
    <div className={cn("taxi-driver-shell", driverLight ? "taxi-driver-light" : "taxi-driver-dark")}>
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
        {webgl && mapa3d ? (
          <DriverMap3D
            center={mapCenter}
            driverPos={driverPos}
            heading={coords?.heading}
            puntos={puntosMapa}
            rutaLatLngs={ruta.latlngs}
            boundsPoints={boundsPoints}
            capa={mapLayer}
            modo3d
            recenterN={recenterN}
          />
        ) : (
        <MapContainer center={mapCenter} zoom={15} zoomControl={false} markerZoomAnimation={false} className="h-full w-full">
          {mapLayer === "satelite" ? (
            <>
              <TileLayer
                url={SATELLITE_TILES}
                attribution="Tiles &copy; Esri World Imagery"
                errorTileUrl={FALLBACK_TILE}
                maxNativeZoom={18}
                keepBuffer={4}
              />
              <TileLayer
                url={SATELLITE_REF}
                maxNativeZoom={18}
                keepBuffer={4}
              />
            </>
          ) : (
            <TileLayer
              url={STREET_TILES}
              attribution={STREET_ATTR}
              errorTileUrl={FALLBACK_TILE}
              maxZoom={20}
              maxNativeZoom={19}
              keepBuffer={4}
            />
          )}
          <RouteBounds points={boundsPoints} />
          <RecenterController n={recenterN} target={driverPos || mapCenter} />
          {driverPos && (
              <Marker position={driverPos} icon={taxiRoleAssetIcon({ heading: coords.heading, size: "sm" })} />
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
            <>
              <Polyline positions={ruta.latlngs} pathOptions={{ color: "#03070C", weight: 9, opacity: 0.85, lineCap: "round", lineJoin: "round" }} />
              <Polyline positions={ruta.latlngs} pathOptions={{ color: "#FFE600", weight: 5.5, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
              <Polyline positions={ruta.latlngs} pathOptions={{ color: "#FFFFFF", weight: 2, opacity: 0.85, dashArray: "6, 12", lineCap: "round" }} />
            </>
          )}
        </MapContainer>
        )}
      </div>

      {/* 1. HEADER FLOTANTE SIMPLIFICADO */}
      <div className="absolute top-12 left-4 right-4 z-[500] flex items-center justify-between bg-[#0C1520]/90 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-lg border border-white/5 pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => profileRef.current?.click()} data-testid="perfil-foto-btn" className="block focus:outline-none">
              <img src={driverAvatar} alt="Conductor" className="w-11 h-11 rounded-full object-cover ring-2 ring-brand" />
            </button>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-brand rounded-full ring-2 ring-[#0C1520]"></span>
          </div>
          <div>
            <h2 className="text-sm font-bold leading-tight text-white">{op.nombre}</h2>
            <span className="text-xs text-zinc-400 font-medium">Unidad {op.placa || "TX-101"}</span>
          </div>
        </div>
        
        {/* Métricas compactas en lugar de ocupar espacio abajo */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-xs font-mono text-brand bg-brand/15 px-2.5 py-1 rounded-full font-semibold">
              ⏱ {inicio ? elapsed(inicio) : "--:--:--"}
            </div>
            <span className="text-[10px] text-zinc-500 block mt-0.5">{turno?.odometro_inicio ? `${turno.odometro_inicio} km • ` : ""}{coords ? "GPS OK" : "Sin GPS"}</span>
          </div>
          <ModeToggle
            compact
            claro={driverLight}
            onToggle={() => {
              const nextLight = !driverLight;
              setDriverLight(nextLight);
              try { localStorage.setItem("driver_mode", nextLight ? "claro" : "oscuro"); } catch {}
              applyMode(nextLight ? "claro" : "oscuro");
            }}
          />
          <button
            data-testid="driver-ajustes-btn"
            onClick={() => setAjustesOpen(true)}
            title="Ajustes y cerrar sesión"
            aria-label="Ajustes y cerrar sesión"
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. BOTONES FLOTANTES DEL MAPA (Derecha) */}
      <div className="absolute right-4 top-32 z-[500] flex flex-col gap-2 pointer-events-auto">
        <button
          data-testid="recentrar-mapa-btn"
          onClick={() => setRecenterN((n) => n + 1)}
          className="w-10 h-10 bg-[#0C1520]/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg border border-white/5 text-zinc-300 hover:text-white transition active:scale-95"
          title="Centrar en mi ubicación"
        >
          <Crosshair className="h-5 w-5" />
        </button>
        <button
          data-testid="cambiar-capa-mapa-btn"
          onClick={toggleMapLayer}
          className="w-10 h-10 bg-[#0C1520]/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg border border-white/5 text-zinc-300 hover:text-white transition active:scale-95"
          title={mapLayer === "satelite" ? "Cambiar a Calles" : "Cambiar a Satélite"}
        >
          <Layers className="h-4 w-4" />
        </button>
        {webgl && (
          <button
            data-testid={DRIVER.mapa3dToggle}
            onClick={toggleMapa3d}
            aria-pressed={mapa3d}
            className={`w-10 h-10 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg border transition active:scale-95 text-[11px] font-black ${mapa3d ? "bg-brand text-[#04120c] border-brand" : "bg-[#0C1520]/90 text-zinc-300 border-white/5 hover:text-white"}`}
            title={mapa3d ? "Cambiar a vista plana" : "Cambiar a vista 3D"}
          >
            {mapa3d ? "3D" : <Box className="h-4 w-4" />}
          </button>
        )}
        {navegacion && (
          <div data-testid="ruta-info" className="bg-[#0C1520]/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/5 text-center shadow-lg">
            <div className="text-xs font-mono font-bold text-brand">{fmtDist(ruta.distance_m)}</div>
            <div className="text-[9px] uppercase tracking-wide text-zinc-400">{fmtDuration(ruta.duration_s)}</div>
          </div>
        )}
      </div>

      {/* ================= BOTTOM SHEET por estado ================= */}
      {/* 1) Fuera de operación: bienvenida */}
      <BottomSheet open={!enOperacion} dismissible={false} testId="driver-sheet-home">
        <div className="flex flex-col items-center pb-2 text-center text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15">
            <Car className="h-7 w-7 text-brand" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-white">Tu turno aún no empieza</h2>
          <p className="mt-1 text-sm text-zinc-400">Conéctate para recibir solicitudes de la central.</p>
        </div>
        <button
          data-testid="entrar-operacion-btn"
          onClick={entrar}
          className="mt-4 w-full bg-brand hover:bg-brand-strong text-[#050B12] font-extrabold text-base py-3.5 rounded-2xl shadow-[0_0_24px_rgba(255,230,0,0.35)] flex items-center justify-center gap-2 transition"
        >
          <Power className="h-5 w-5" /> Entrar en operación
        </button>
      </BottomSheet>

      {/* 2) En operación, sin servicio activo: Bottom Sheet Moderno */}
      <BottomSheet open={enOperacion && !servicio && !servicioPropio} dismissible={false} testId="driver-sheet-home">
        <div className="bg-[#0A121D] -mx-4 -my-4 px-5 pt-3 pb-6 rounded-t-3xl shadow-[0_-10px_30px_rgba(0,0,0,0.6)] border-t border-white/10 text-white">
          {/* Tirador para deslizar (Drag Handle) */}
          <div className="w-10 h-1.5 bg-zinc-700 rounded-full mx-auto mb-4"></div>

          {/* Selector de Estado Tipo Segmented Control */}
          <div className="grid grid-cols-4 gap-1.5 bg-[#121D2B] p-1.5 rounded-2xl mb-4" data-testid="estado-buttons">
            <button
              data-testid="estado-libre"
              onClick={() => cambiarEstado("libre")}
              className={op.estado === "libre" ? "bg-[#22C55E] text-[#03140A] font-bold text-xs py-2.5 rounded-xl shadow-sm transition" : "text-zinc-400 hover:text-white text-xs font-medium py-2.5 rounded-xl flex items-center justify-center gap-1 transition"}
            >
              Disponible
            </button>
            <button
              data-testid="estado-ocupado"
              onClick={() => cambiarEstado("ocupado")}
              className={op.estado === "ocupado" ? "bg-rose-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition" : "text-zinc-400 hover:text-white text-xs font-medium py-2.5 rounded-xl flex items-center justify-center gap-1 transition"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Ocupado
            </button>
            <button
              data-testid="estado-no_disponible"
              onClick={() => cambiarEstado("no_disponible")}
              className={op.estado === "no_disponible" ? "bg-amber-400 text-black font-bold text-xs py-2.5 rounded-xl shadow-sm transition" : "text-zinc-400 hover:text-white text-xs font-medium py-2.5 rounded-xl flex items-center justify-center gap-1 transition"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Pausado
            </button>
            <button
              data-testid="estado-averiado"
              onClick={() => cambiarEstado("averiado")}
              className={op.estado === "averiado" ? "bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition" : "text-zinc-400 hover:text-white text-xs font-medium py-2.5 rounded-xl flex items-center justify-center gap-1 transition"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Averiado
            </button>
          </div>

          {/* Selector de Ruta (Más estilizado) */}
          <div className="mb-4">
            <div className="flex items-center justify-between bg-[#121D2B] px-4 py-2.5 rounded-xl border border-white/5 cursor-pointer">
              <div className="flex-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 block font-semibold">Modalidad / Ruta</span>
                <Select value={op.ruta_asignada || "libre"} onValueChange={seleccionarRuta}>
                  <SelectTrigger data-testid="ruta-select" className="bg-transparent border-none text-zinc-200 text-sm font-medium p-0 h-auto focus:ring-0 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121D2B] border-zinc-700 text-white">
                    <SelectItem value="libre" className="focus:bg-[#13202F]">Servicio de Sitio (Libre)</SelectItem>
                    {rutas.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="focus:bg-[#13202F]">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color_hex }} />
                          {r.nombre}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* CTA Principal: Iniciar Servicio */}
          <button
            data-testid="iniciar-servicio-btn"
            onClick={() => setIniciarOpen(true)}
            className="w-full bg-brand hover:bg-brand-strong active:scale-[0.99] text-[#050B12] font-extrabold text-base py-3.5 rounded-2xl shadow-[0_0_24px_rgba(255,230,0,0.35)] flex items-center justify-center gap-2 mb-4 transition"
          >
            <Play className="h-4 w-4 fill-current mr-2" /> Iniciar servicio en calle
          </button>

          {/* Herramientas Rápidas + Botón de desconexión discreto */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/5 text-center">
            <button data-testid="reportar-objeto-btn" onClick={() => fileRef.current?.click()} className="bg-[#121D2B] hover:bg-[#13202F] py-2.5 rounded-xl text-xs text-zinc-300 flex flex-col items-center gap-1 transition">
              <Package className="h-4 w-4" /> <span>Objeto</span>
            </button>
            <button data-testid="abrir-chat-btn" onClick={abrirChat} className="bg-[#121D2B] hover:bg-[#13202F] py-2.5 rounded-xl text-xs text-zinc-300 flex flex-col items-center gap-1 transition">
              <MessageSquare className="h-4 w-4" /> <span>Central</span>
            </button>
            <button data-testid="combustible-btn" onClick={() => setCombOpen(true)} className="bg-[#121D2B] hover:bg-[#13202F] py-2.5 rounded-xl text-xs text-zinc-300 flex flex-col items-center gap-1 transition">
              <Fuel className="h-4 w-4" /> <span>Gasto</span>
            </button>
            <button data-testid="salir-operacion-btn" onClick={salir} className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 py-2.5 rounded-xl text-xs text-rose-400 flex flex-col items-center gap-1 font-medium transition">
              <Power className="h-4 w-4" /> <span>Turno</span>
            </button>
          </div>
        </div>
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

            {/* Comando de voz: aceptar/rechazar hablando */}
            <button
              type="button"
              data-testid="driver-mic-oferta"
              onClick={() => escucharComandoOferta()}
              className={`mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors ${
                micEscuchando
                  ? "border-brand bg-brand/15 text-brand-bright animate-pulse"
                  : "border-border bg-surface-2 text-foreground hover:border-brand/50"
              }`}
            >
              <Mic className={`h-4 w-4 ${micEscuchando ? "text-brand-bright" : ""}`} />
              {micEscuchando ? "Escuchando… di “aceptar” o “rechazar”" : "Responder con voz"}
            </button>
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
            {/* Navegación externa opcional (F6): Google Maps con las coords */}
            {navegacion && (
              <a
                data-testid="abrir-google-maps"
                href={`https://www.google.com/maps/dir/?api=1&destination=${navegacion.dest.lat},${navegacion.dest.lng}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm font-bold text-foreground transition-colors hover:bg-secondary/60"
              >
                <NavIcon className="h-4 w-4 text-brand-bright" /> Abrir en Google Maps
              </a>
            )}
            {!servicio.conductor_en_origen && (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    const { data } = await api.post(`/servicios/${servicio.id}/llegada-origen`);
                    setServicio(data);
                    toast.success("Pasajero notificado de tu llegada");
                  } catch (e) {
                    toast.error(e.response?.data?.detail || "No se pudo avisar llegada");
                  }
                }}
                className="mt-2 w-full border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
              >
                <Bell className="h-4 w-4" /> Avisar al pasajero: Ya estoy en el punto
              </Button>
            )}
            <Button data-testid="iniciar-viaje-btn" onClick={iniciarViaje} size="lg" className="mt-2.5 w-full">
              <NavIcon className="h-5 w-5" /> {servicio.conductor_en_origen ? "Iniciar viaje (Pasajero a bordo)" : "Llegué al cliente / Iniciar viaje"}
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
            {/* Navegación externa opcional (F6): Google Maps con las coords.
                Nota: con la auto-finalización por geofence (F5), el viaje se
                cierra solo al llegar; este botón es ayuda visual, no requisito. */}
            {navegacion && (
              <a
                data-testid="abrir-google-maps-destino"
                href={`https://www.google.com/maps/dir/?api=1&destination=${navegacion.dest.lat},${navegacion.dest.lng}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm font-bold text-foreground transition-colors hover:bg-secondary/60"
              >
                <NavIcon className="h-4 w-4 text-brand-bright" /> Abrir en Google Maps
              </a>
            )}
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
              <div><span className="text-muted-foreground">Origen:</span> {servicio.origen?.texto || "â€”"}</div>
              <div><span className="text-muted-foreground">Destino:</span> {servicio.destino?.texto || "â€”"}</div>
            </div>
          </div>
        )}

        {servicio && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Package className="h-4 w-4" /> Reportar
            </Button>
            <Button variant="secondary" onClick={() => abrirChat(servicio.id)}>
              <MessageSquare className="h-4 w-4" /> Chat cliente
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
              <div>{servicioPropio.origen_texto || "Sin origen"} â†’ {servicioPropio.destino_texto || "Sin destino"}</div>
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

      {/* Overlay: combustible del taxista (F12 premium) */}
      {combOpen && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-2 sm:p-4 sm:items-center" data-testid="comb-overlay">
          <div className="max-h-[92vh] max-h-[92dvh] w-full max-w-lg sm:max-w-xl md:max-w-2xl animate-slide-up overflow-y-auto rounded-2xl border border-border bg-card p-4 elev-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Fuel className="h-5 w-5 text-brand-bright" /> Combustible
              </h3>
              <button onClick={() => setCombOpen(false)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Input data-testid="comb-fecha" type="date" value={combForm.fecha} onChange={(e) => setCombForm((f) => ({ ...f, fecha: e.target.value }))} className="input-inset border-border" />
                <Input data-testid="comb-litros" type="number" step="0.1" value={combForm.litros} onChange={(e) => setCombForm((f) => ({ ...f, litros: e.target.value }))} placeholder="Litros" className="input-inset mono-num border-border" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input data-testid="comb-costo" type="number" value={combForm.costo} onChange={(e) => setCombForm((f) => ({ ...f, costo: e.target.value }))} placeholder="Importe $" className="input-inset mono-num border-border" />
                <Input data-testid="comb-odometro" type="number" value={combForm.odometro_km} onChange={(e) => setCombForm((f) => ({ ...f, odometro_km: e.target.value }))} placeholder="Kilometraje" className="input-inset mono-num border-border" />
              </div>
              <Input data-testid="comb-estacion" value={combForm.estacion} onChange={(e) => setCombForm((f) => ({ ...f, estacion: e.target.value }))} placeholder="Estación (opcional)" className="input-inset border-border" />
              <input ref={combFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                     onChange={(e) => setCombTicket(e.target.files?.[0] || null)} />
              <button
                type="button"
                data-testid="comb-ticket-btn"
                onClick={() => combFileRef.current?.click()}
                className={cn("flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-semibold transition-colors",
                  combTicket ? "border-brand/50 bg-brand/10 text-brand-bright" : "border-border text-muted-foreground hover:text-foreground")}
              >
                <Fuel className="h-4 w-4" /> {combTicket ? `Ticket: ${combTicket.name.slice(0, 24)}` : "Subir fotografía del ticket"}
              </button>
              <Button data-testid="comb-guardar" onClick={guardarCarga} disabled={combSaving} size="lg" className="w-full">
                {combSaving ? "Guardando…" : "Guardar carga"}
              </Button>
            </div>

            {combHist.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Mis cargas</div>
                <div className="space-y-1.5" data-testid="comb-historial">
                  {combHist.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
                      <div>
                        <div className="font-semibold text-foreground">{c.litros} L · {fmtMoney2(c.costo)}</div>
                        <div className="text-[10px] text-muted-foreground">{c.fecha} · {c.odometro_km?.toLocaleString("es-MX")} km{c.estacion ? ` · ${c.estacion}` : ""}</div>
                      </div>
                      {c.ticket_url && (
                        <a href={`${BACKEND_URL}${c.ticket_url}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-brand-bright underline">
                          Ticket
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overlay: iniciar servicio */}
      {iniciarOpen && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-2 sm:p-4 sm:items-center" data-testid="iniciar-overlay">
          <div className="max-h-[90vh] max-h-[90dvh] w-full max-w-lg sm:max-w-xl md:max-w-2xl animate-slide-up overflow-y-auto rounded-2xl border border-border bg-card p-4 elev-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
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

      {/* Overlay: kilometraje, evidencia de combustible, entrega de unidad y liquidación de cuota */}
      {kmModalOpen && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 sm:items-center" data-testid="km-overlay">
          <div className="w-full max-w-lg sm:max-w-xl md:max-w-2xl max-h-[90vh] max-h-[90dvh] overflow-y-auto animate-slide-up rounded-2xl border border-border bg-card p-4 elev-3 space-y-3.5 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-brand-bright" />
                <h3 className="text-base font-bold text-foreground">
                  {kmMode === "iniciar" ? "Iniciar turno y recibir unidad" : "Cerrar / Entregar turno y liquidar"}
                </h3>
              </div>
              <button type="button" onClick={() => setKmModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {kmMode === "iniciar"
                ? "Registra kilometraje, nivel de combustible y foto de evidencia al recibir la unidad."
                : "Registra kilometraje final, evidencia de combustible, entrega de unidad y efectivo/cuota del turno."}
            </p>

            {/* 1. Odómetro */}
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                1. Kilometraje del tablero (Odómetro) *
              </label>
              <Input
                data-testid="km-input"
                type="number"
                inputMode="decimal"
                autoFocus
                value={kmInput}
                onChange={(e) => setKmInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmarKm(); }}
                placeholder={kmMode === "iniciar" ? "Km actuales del tablero" : "Km finales del tablero"}
                className="input-inset mono-num border-border text-lg text-foreground"
              />
              {kmMode === "finalizar" && turno && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Km iniciales del turno: <b className="mono-num text-foreground">{turno.odometro_inicio} km</b>
                </div>
              )}
            </div>

            {/* 2. Nivel de Combustible + Evidencia Fotográfica */}
            <div className="rounded-xl border border-border bg-surface-2/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground">
                  <Fuel className="h-3.5 w-3.5 text-amber-400" />
                  2. Nivel de combustible ({kmMode === "iniciar" ? "Recepción" : "Entrega"})
                </span>
                <span className="mono-num text-xs font-bold text-amber-400">{turnoCombustible}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5" data-testid="turno-combustible-selector">
                {["1/4", "1/2", "3/4", "Lleno"].map((niv) => (
                  <button
                    key={niv}
                    type="button"
                    data-testid={`turno-comb-${niv}`}
                    onClick={() => setTurnoCombustible(niv)}
                    className={cn(
                      "rounded-lg border py-1.5 text-xs font-bold transition-all",
                      turnoCombustible === niv
                        ? "border-amber-400 bg-amber-500/20 text-amber-300 shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {niv}
                  </button>
                ))}
              </div>

              <input
                ref={turnoEvidenciaRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleSubirEvidenciaTurno(e.target.files?.[0])}
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  data-testid="turno-subir-evidencia-btn"
                  disabled={turnoEvidenciaUploading}
                  onClick={() => turnoEvidenciaRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand/50 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand-bright hover:bg-brand/20 transition-colors"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {turnoEvidenciaUploading
                    ? "Subiendo evidencia…"
                    : turnoEvidenciaUrl
                    ? "✓ Foto de tablero/combustible lista (Cambiar)"
                    : "Subir foto de tablero / combustible"}
                </button>
              </div>
            </div>

            {/* 3. Al cerrar turno: Confirmar entrega de unidad + Efectivo / Cuota */}
            {kmMode === "finalizar" && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 space-y-3" data-testid="turno-liquidacion-section">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-300">
                    <ShieldCheck className="h-4 w-4 text-amber-400" />
                    3. Entrega de Unidad y Efectivo / Cuota
                  </span>
                  {(turno?.cuota_diaria || op?.vehiculo?.cuota_diaria) && (
                    <span className="mono-num text-[11px] font-bold text-amber-400">
                      Cuota fijada: ${turno?.cuota_diaria || op?.vehiculo?.cuota_diaria}
                    </span>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="turno-confirmar-entrega-check"
                    checked={entregaUnidadConfirmada}
                    onChange={(e) => setEntregaUnidadConfirmada(e.target.checked)}
                    className="h-4 w-4 rounded accent-amber-400"
                  />
                  <span>Confirmo entrega física de la unidad sin novedades</span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                      Se entrega unidad a:
                    </label>
                    <select
                      data-testid="turno-entrega-a-select"
                      value={entregaA}
                      onChange={(e) => setEntregaA(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                    >
                      <option value="Dueño / Socio">Dueño / Socio</option>
                      <option value="Relevo (Siguiente turno)">Relevo (Siguiente turno)</option>
                      <option value="Base Central">Base Central</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                      Método de entrega:
                    </label>
                    <select
                      data-testid="turno-metodo-cuota-select"
                      value={metodoPagoCuota}
                      onChange={(e) => setMetodoPagoCuota(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                    >
                      <option value="efectivo">Efectivo en mano</option>
                      <option value="transferencia">Transferencia / Depósito</option>
                      <option value="pendiente">Pendiente de liquidar</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    <Banknote className="h-3.5 w-3.5 text-amber-400" />
                    Efectivo / Cuota entregada ($ MXN):
                  </label>
                  <Input
                    data-testid="turno-cuota-input"
                    type="number"
                    inputMode="decimal"
                    value={cuotaEntregada}
                    onChange={(e) => setCuotaEntregada(e.target.value)}
                    placeholder="Monto entregado ($)"
                    className="input-inset mono-num border-border text-sm font-bold text-amber-300"
                  />
                </div>

                <Input
                  data-testid="turno-notas-entrega-input"
                  value={notasEntrega}
                  onChange={(e) => setNotasEntrega(e.target.value)}
                  placeholder="Observaciones de la unidad o turno (opcional)"
                  className="input-inset border-border text-xs text-foreground"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button data-testid="km-cancelar" variant="secondary" onClick={() => setKmModalOpen(false)}>Cancelar</Button>
              <Button data-testid="km-confirmar" onClick={confirmarKm}>
                {kmMode === "iniciar" ? "Iniciar turno" : "Confirmar y Cerrar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay: confirmar reporte */}
      {pendingFile && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-2 sm:p-4 sm:items-center" data-testid="reporte-overlay">
          <div className="max-h-[90vh] max-h-[90dvh] w-full max-w-lg sm:max-w-xl md:max-w-2xl animate-slide-up overflow-y-auto rounded-2xl border border-border bg-card p-4 elev-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
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
        <div className="fixed inset-0 z-[900] flex flex-col bg-[#0D0F14]/95 backdrop-blur-md" data-testid="chat-overlay">
          <div className="mx-auto flex h-full w-full max-w-lg sm:max-w-xl md:max-w-2xl flex-col p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top,0.75rem))] pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">{chatServicioId ? "Chat con el pasajero" : "Chat con la central"}</h3>
                <span className="text-xs text-zinc-400">Canal directo en tiempo real</span>
              </div>
              <button data-testid="chat-cerrar" onClick={() => setChatOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1" data-testid="chat-op-mensajes">
              {chatMsgs.length === 0 && <div className="mt-8 text-center text-xs text-zinc-500">Aún no hay mensajes en esta conversación</div>}
              {chatMsgs.map((m) => (
                <div key={m.id} className={`flex ${m.remitente === "operador" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs shadow-md ${m.remitente === "operador" ? "bg-brand text-[#050B12] font-medium" : "bg-[#121D2B] text-zinc-100 border border-white/10"}`}>
                    {m.imagen_url && (
                      <img
                        src={m.imagen_url}
                        alt="Adjunto"
                        className="mb-1 max-h-52 w-full rounded-xl object-cover cursor-pointer hover:opacity-95 transition border border-white/15"
                        onClick={() => setChatImagePreview(m.imagen_url)}
                      />
                    )}
                    {m.texto ? <div>{m.texto}</div> : null}
                    <div className={`text-[9px] mt-1 ${m.remitente === "operador" ? "text-slate-950/70" : "text-zinc-500"} text-right`}>{timeAgo(m.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
            <input type="file" ref={chatFileInputRef} accept="image/*" className="hidden" onChange={handleChatImagePick} />
            <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                disabled={chatUploading}
                onClick={() => chatFileInputRef.current?.click()}
                className="w-10 h-10 rounded-xl bg-[#121D2B] hover:bg-[#182840] border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition shrink-0"
                title="Adjuntar foto"
              >
                {chatUploading ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Camera className="h-4 w-4" />}
              </button>
              <Input
                data-testid="chat-op-input"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarChat()}
                placeholder="Escribe un mensaje…"
                className="bg-[#121D2B] border-white/10 text-white placeholder-zinc-500 rounded-xl h-10 text-xs"
              />
              <button
                data-testid="chat-op-enviar"
                onClick={enviarChat}
                className="w-10 h-10 rounded-xl bg-brand hover:bg-brand-strong text-[#050B12] flex items-center justify-center transition shrink-0 shadow-[0_0_16px_rgba(255,230,0,0.35)]"
                aria-label="Enviar mensaje"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {chatImagePreview && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setChatImagePreview(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setChatImagePreview(null)}
              className="absolute -top-11 right-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={chatImagePreview}
              alt="Foto ampliada"
              className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}

      {/* Overlay: Ajustes del operador (voz IA, comandos, notificaciones, GPS, sesión) */}
      {ajustesOpen && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-2 sm:p-4 sm:items-center" data-testid="driver-ajustes">
          <div className="max-h-[90vh] max-h-[90dvh] w-full max-w-lg sm:max-w-xl md:max-w-2xl animate-slide-up overflow-y-auto rounded-2xl border border-border bg-card p-4 elev-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Settings className="h-5 w-5 text-brand-bright" /> Ajustes
              </h3>
              <button onClick={() => setAjustesOpen(false)} aria-label="Cerrar ajustes" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-2">
              <AjusteFila
                testId="driver-ajuste-noche"
                titulo="Modo nocturno"
                descripcion="Tema oscuro prioritario para conducir de noche"
                activo={!driverLight}
                onToggle={() => {
                  // Set directo (no solo evento): el listener ignora el primer
                  // app:mode y el tap quedaría sin efecto visible.
                  const nextLight = !driverLight;
                  setDriverLight(nextLight);
                  try { localStorage.setItem("driver_mode", nextLight ? "claro" : "oscuro"); } catch {}
                  applyMode(nextLight ? "claro" : "oscuro");
                }}
              />
              <AjusteFila
                testId="driver-ajuste-voz"
                titulo="Voz IA"
                descripcion="La asistente anuncia servicios, mensajes y avisos"
                activo={vozOn}
                onToggle={() => { const v = !vozOn; setVozOn(v); localStorage.setItem("driver_voz", v ? "on" : "off"); if (v) hablarVoz("Voz activada. Te avisaré de cada servicio."); else detenerVoz(); }}
              />
              <AjusteFila
                testId="driver-ajuste-comandos"
                titulo="Comandos de voz"
                descripcion={reconocimientoDisponible() ? "Di “aceptar” o “rechazar” al llegar una oferta" : "No soportado por este navegador"}
                activo={comandosVozOn}
                onToggle={() => { const v = !comandosVozOn; setComandosVozOn(v); localStorage.setItem("driver_comandos_voz", v ? "on" : "off"); if (!v) detenerEscucha(); }}
              />
              <AjusteFila
                testId="driver-ajuste-notif"
                titulo="Notificaciones"
                descripcion="Aviso del sistema al llegar un servicio"
                activo={notifOn}
                onToggle={async () => {
                  const v = !notifOn;
                  setNotifOn(v);
                  localStorage.setItem("driver_notif", v ? "on" : "off");
                  if (v) {
                    const p = await pedirPermisoNotificaciones();
                    if (p !== "granted") toast.error("Activa el permiso de notificaciones en el navegador");
                  }
                }}
              />
              <AjusteFila
                testId="driver-ajuste-gps"
                titulo="GPS en segundo plano"
                descripcion="Mantiene el envío de ubicación con la app oculta (pantalla apagada requiere la APK)"
                activo={gpsFondoOn}
                onToggle={() => { const v = !gpsFondoOn; setGpsFondoOn(v); localStorage.setItem("driver_gps_fondo", v ? "on" : "off"); }}
              />

              <button
                type="button"
                onClick={() => {
                  setAjustesOpen(false);
                  abrirDiagnostico();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-brand/40"
              >
                <span className="flex items-center gap-2.5">
                  <Satellite className="h-4 w-4 text-brand-bright" />
                  <div>
                    <span className="block text-sm font-bold text-foreground">Diagnóstico GPS y Satélites</span>
                    <span className="block text-xs text-muted-foreground">Ver señal, precisión y cola offline</span>
                  </div>
                </span>
                <span className="text-xs font-bold text-brand-bright">Ver</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  probarAudioVoz();
                  toast.success("Emitiendo tono de despacho y prueba de voz...");
                }}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-brand/40"
              >
                <span className="flex items-center gap-2.5">
                  <Volume2 className="h-4 w-4 text-amber-400" />
                  <div>
                    <span className="block text-sm font-bold text-foreground">Probar Audio y Chime de Alerta</span>
                    <span className="block text-xs text-muted-foreground">Verificar altavoz y volumen de despacho</span>
                  </div>
                </span>
                <span className="text-xs font-bold text-amber-400">Probar</span>
              </button>
            </div>

            <Button
              data-testid="driver-logout-ajustes"
              variant="destructive"
              size="lg"
              onClick={logout}
              className="mt-4 w-full"
            >
              <LogOut className="h-5 w-5" /> Cerrar sesión
            </Button>
          </div>
        </div>
      )}

      {/* Overlay: Diagnóstico GPS en vivo */}
      {diagnosticoOpen && (
        <div className="fixed inset-0 z-[950] flex items-end justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 sm:items-center" data-testid="diagnostico-gps-overlay">
          <div className="max-h-[90vh] max-h-[90dvh] w-full max-w-lg sm:max-w-xl md:max-w-2xl animate-slide-up overflow-y-auto rounded-2xl border border-border bg-card p-4 elev-3 space-y-3.5 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Satellite className="h-5 w-5 text-brand-bright" />
                <h3 className="text-base font-bold text-foreground">Diagnóstico de Telemetría GPS</h3>
              </div>
              <button onClick={() => setDiagnosticoOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {diagnosticoLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
                Consultando telemetría del satélite y servidor…
              </div>
            ) : diagnosticoData ? (
              <div className="space-y-3 text-xs">
                {/* Tarjeta de estado de señal */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      "h-3 w-3 rounded-full animate-ping-soft",
                      diagnosticoData.gps.calidad_senal === "excelente" ? "bg-emerald-400" :
                      diagnosticoData.gps.calidad_senal === "buena" ? "bg-emerald-500" :
                      diagnosticoData.gps.calidad_senal === "degradada" ? "bg-amber-400" : "bg-destructive"
                    )} />
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Calidad de Enlace GPS</div>
                      <div className="text-sm font-extrabold capitalize text-foreground">
                        {diagnosticoData.gps.calidad_senal}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Último reporte</div>
                    <div className="mono-num font-bold text-foreground">
                      {diagnosticoData.gps.segundos_desde_reporte != null
                        ? `hace ${diagnosticoData.gps.segundos_desde_reporte}s`
                        : "Sin datos"}
                    </div>
                  </div>
                </div>

                {/* Grid de telemetría */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border bg-surface-2/60 p-2.5 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">Precisión estimada</div>
                    <div className="mono-num text-sm font-bold text-brand-bright">
                      {diagnosticoData.gps.accuracy != null ? `±${Math.round(diagnosticoData.gps.accuracy)} m` : "N/D"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2/60 p-2.5 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">Velocidad en ruta</div>
                    <div className="mono-num text-sm font-bold text-foreground">
                      {diagnosticoData.gps.speed != null ? `${Math.round(diagnosticoData.gps.speed * 3.6)} km/h` : "0 km/h"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2/60 p-2.5 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">Cola local offline</div>
                    <div className="mono-num text-sm font-bold text-foreground">
                      {obtenerColaOffline().length} puntos en cola
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2/60 p-2.5 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">Batería dispositivo</div>
                    <div className="mono-num text-sm font-bold text-foreground">
                      {diagnosticoData.gps.battery != null ? `${Math.round(diagnosticoData.gps.battery * 100)}%` : "100%"}
                    </div>
                  </div>
                </div>

                {/* Botones de acción técnica */}
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" onClick={probarAudioVoz} className="flex-1 text-xs">
                    <Mic className="h-3.5 w-3.5 mr-1" /> Probar Voz y Chime
                  </Button>
                  <Button variant="secondary" onClick={forzarSyncCola} className="flex-1 text-xs">
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sincronizar Cola
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-destructive">
                No se pudo conectar con el servicio de telemetría.
              </div>
            )}

            <Button onClick={() => setDiagnosticoOpen(false)} size="lg" className="w-full">
              Cerrar Diagnóstico
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AjusteFila({ testId, titulo, descripcion, activo, onToggle }) {
  return (
    <button
      type="button"
      data-testid={testId}
      role="switch"
      aria-checked={activo}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
    >
      <span className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        activo ? "bg-brand" : "bg-secondary"
      )}>
        <span className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          activo ? "left-[22px]" : "left-0.5"
        )} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">{titulo}</span>
        <span className="block truncate text-xs text-muted-foreground">{descripcion}</span>
      </span>
      <span className={cn("text-xs font-bold", activo ? "text-brand-bright" : "text-muted-foreground")}>
        {activo ? "ON" : "OFF"}
      </span>
    </button>
  );
}
