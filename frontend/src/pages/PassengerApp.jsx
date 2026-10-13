import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./PassengerApp.css";
import { Capacitor } from "@capacitor/core";
import { api, pasApi, WS_BASE, BACKEND_URL, logoutPassenger, savePassengerAuth } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn, iniciales, metodoPago } from "@/lib/utils";
import { PASSENGER } from "@/constants/testIds";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { ServicioBadge } from "@/components/StatusBadge";
import { ModeToggle } from "@/components/ModeToggle";
import { pointIcon, taxiRoleAssetIcon } from "@/lib/taxiIcon";
import { useRouting } from "@/hooks/useRouting";
import { fmtDist, fmtDuration, bearing, puntoAdelanteEnRuta } from "@/lib/geo";
import { RoutePolyline } from "@/components/RoutePolyline";
import { VehicleImage } from "@/components/VehicleImage";
import { toast } from "sonner";
import {
  Car,
  MapPin,
  Navigation,
  LogOut,
  Clock,
  User,
  Phone,
  History,
  Home,
  Mail,
  Wallet,
  Locate,
  Check,
  Flag,
  Menu,
  MessageCircle,
  ChevronRight,
  Star,
  X,
  ArrowLeft,
  Send,
  Layers,
  Search,
  Sparkles,
  ShieldCheck,
  Edit3,
  CreditCard,
  Banknote,
  Users,
} from "lucide-react";

const CENTER = [17.5099, -91.9847];
const STREET_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ROADS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const FALLBACK_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MARCH_LOGO = "/assets/vehicles/march.png";

const PALENQUE_QUICK_POIS = [
  { id: "q_parque", label: "Parque Central", texto: "Parque Central de Palenque, Centro", lat: 17.5094, lng: -91.9818 },
  { id: "q_mercado", label: "Mercado Municipal", texto: "Mercado Municipal Guadalupe, Centro", lat: 17.5081, lng: -91.9835 },
  { id: "q_ado", label: "Terminal ADO", texto: "Terminal de Autobuses ADO Palenque", lat: 17.5122, lng: -91.9879 },
  { id: "q_tren", label: "Estación Tren Maya", texto: "Estación Tren Maya Palenque, Pakal-Ná", lat: 17.5376, lng: -91.9698 },
  { id: "q_canada", label: "La Cañada", texto: "Zona Hotelera La Cañada, Palenque", lat: 17.512, lng: -91.9905 },
  { id: "q_hospital", label: "Hospital General", texto: "Hospital General de Palenque, Periférico Sur", lat: 17.5023, lng: -91.9821 },
  { id: "q_ruinas", label: "Zona Arqueológica", texto: "Zona Arqueológica de Palenque", lat: 17.4848, lng: -92.0456 },
];

const QUICK_CHAT_PHRASES = [
  "Ya estoy afuera en el punto",
  "Salgo en 1 minuto, por favor",
  "Estoy frente a la entrada principal",
  "¿En qué parte te encuentras?",
];

function notifyPassengerNative(title, body, speakText = null) {
  try {
    if (typeof window !== "undefined" && window.TaxiHubNative) {
      if (speakText && typeof window.TaxiHubNative.speakServiceAlert === "function") {
        window.TaxiHubNative.speakServiceAlert(speakText, title, body);
        return;
      }
      if (typeof window.TaxiHubNative.vibrateAlert === "function") {
        window.TaxiHubNative.vibrateAlert();
      }
    }
    if (speakText && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speakText);
      u.lang = "es-MX";
      u.rate = 1.02;
      window.speechSynthesis.speak(u);
    }
  } catch (_) {
    /* ignore audio errors */
  }
}

function MapClick({ onPick }) {
  useMapEvents({
    click: (e) => onPick({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }),
  });
  return null;
}

function MapViewportController({ points, focusPoint }) {
  const map = useMap();
  const prevKeyRef = useRef("");

  useEffect(() => {
    if (!map) return;
    const valid = (points || []).filter((p) => p && p.lat != null && p.lng != null);
    if (valid.length >= 2) {
      const key = valid.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
      if (key !== prevKeyRef.current) {
        prevKeyRef.current = key;
        try {
          const bounds = valid.map((p) => [p.lat, p.lng]);
          map.fitBounds(bounds, { paddingTopLeft: [40, 90], paddingBottomRight: [40, 260], maxZoom: 16 });
        } catch (_) {}
      }
    } else if (focusPoint && focusPoint.lat != null && focusPoint.lng != null) {
      const key = `single:${focusPoint.lat.toFixed(4)},${focusPoint.lng.toFixed(4)}`;
      if (key !== prevKeyRef.current) {
        prevKeyRef.current = key;
        try {
          map.setView([focusPoint.lat, focusPoint.lng], 15, { animate: true });
        } catch (_) {}
      }
    }
  }, [map, points, focusPoint]);

  return null;
}

function PassengerTileLayers({ mapStyle }) {
  if (mapStyle === "satelite") {
    return (
      <>
        <TileLayer
          key="sat-base"
          url={SATELLITE_TILES}
          attribution="Tiles &copy; Esri"
          errorTileUrl={FALLBACK_TILE}
          maxNativeZoom={18}
        />
        <TileLayer key="sat-roads" url={SATELLITE_ROADS} maxNativeZoom={18} opacity={0.9} />
        <TileLayer key="sat-labels" url={SATELLITE_LABELS} maxNativeZoom={18} opacity={0.95} />
      </>
    );
  }
  return (
    <TileLayer
      key="street-base"
      url={STREET_TILES}
      attribution="&copy; OpenStreetMap"
      errorTileUrl={FALLBACK_TILE}
      maxNativeZoom={19}
    />
  );
}

function BrandLogo({ className }) {
  return (
    <div className={cn("taxi-passenger-brand-wrap", className)}>
      <img src={MARCH_LOGO} alt="TaxiHUB" className="taxi-passenger-logo-img" />
      <div className="taxi-passenger-brand-text">
        <strong>
          TAXI<span>HUB</span>
        </strong>
        <small>Pasajero · Palenque</small>
      </div>
    </div>
  );
}

function AuthScreen({
  modo,
  setModo,
  lUser,
  setLUser,
  lPass,
  setLPass,
  rForm,
  setRForm,
  login,
  registrar,
  isNativePlatform,
}) {
  return (
    <div className="taxi-passenger-auth">
      <div className="taxi-passenger-auth-orb" />
      <div className="taxi-passenger-auth-card">
        <form
          onSubmit={modo === "login" ? login : registrar}
          data-testid="pas-login-form"
          className="taxi-passenger-auth-form"
        >
          <div className="taxi-passenger-auth-inner">
            <div className="flex justify-center mb-3">
              <BrandLogo className="taxi-passenger-logo-centered" />
            </div>
            <div className="taxi-passenger-auth-badge">
              <ShieldCheck className="w-3.5 h-3.5" /> Radio Taxis Palenque · Servicio Verificado
            </div>
            <div className="taxi-passenger-auth-heading">
              <h1>{modo === "login" ? "Bienvenido a bordo" : "Crea tu cuenta de pasajero"}</h1>
              <p>
                {modo === "login"
                  ? "Solicita tu unidad segura con tarifa oficial y seguimiento satelital en vivo."
                  : "Regístrate en segundos para pedir taxis certificados en Palenque."}
              </p>
            </div>
            <div className="taxi-passenger-auth-fields">
              {modo === "registro" && (
                <>
                  <label className="taxi-passenger-field">
                    <span>Nombre completo</span>
                    <Input
                      data-testid="pas-reg-nombre"
                      value={rForm.nombre}
                      onChange={(e) => setRForm((f) => ({ ...f, nombre: e.target.value }))}
                      placeholder="Ej. Ana Laura Gómez"
                    />
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="taxi-passenger-field">
                      <span>Teléfono celular</span>
                      <Input
                        data-testid="pas-reg-telefono"
                        value={rForm.telefono}
                        onChange={(e) => setRForm((f) => ({ ...f, telefono: e.target.value }))}
                        placeholder="916 123 4567"
                      />
                    </label>
                    <label className="taxi-passenger-field">
                      <span>Correo (opcional)</span>
                      <Input
                        data-testid="pas-reg-correo"
                        type="email"
                        value={rForm.correo || ""}
                        onChange={(e) => setRForm((f) => ({ ...f, correo: e.target.value }))}
                        placeholder="correo@ejemplo.com"
                      />
                    </label>
                  </div>
                </>
              )}
              <label className="taxi-passenger-field">
                <span>Usuario</span>
                <Input
                  data-testid="pas-usuario"
                  value={modo === "login" ? lUser : rForm.usuario}
                  onChange={(e) =>
                    modo === "login"
                      ? setLUser(e.target.value)
                      : setRForm((f) => ({ ...f, usuario: e.target.value }))
                  }
                  placeholder="Tu nombre de usuario"
                  autoCapitalize="none"
                />
              </label>
              <label className="taxi-passenger-field">
                <span>Contraseña</span>
                <Input
                  data-testid="pas-contrasena"
                  type="password"
                  value={modo === "login" ? lPass : rForm.contrasena}
                  onChange={(e) =>
                    modo === "login"
                      ? setLPass(e.target.value)
                      : setRForm((f) => ({ ...f, contrasena: e.target.value }))
                  }
                  placeholder="••••••"
                />
              </label>
              <Button data-testid="pas-submit" type="submit" className="taxi-passenger-primary-button">
                {modo === "login" ? "Iniciar sesión" : "Crear cuenta y continuar"}
              </Button>
              <button
                type="button"
                data-testid="pas-toggle-modo"
                onClick={() => setModo(modo === "login" ? "registro" : "login")}
                className="taxi-passenger-auth-switch"
              >
                {modo === "login"
                  ? "¿Nuevo en TaxiHUB? Crea tu cuenta gratis"
                  : "¿Ya tienes cuenta? Inicia sesión aquí"}
              </button>
            </div>
            {!isNativePlatform && (
              <div className="taxi-passenger-auth-links">
                <a href="/login">App del operador</a>
                <span>·</span>
                <a href="/terminal/login">Terminal</a>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PassengerApp() {
  const [auth, setAuth] = useState(() => getFromStore());
  const [view, setView] = useState("viaje"); // viaje | solicitar | historial | perfil
  const [menuOpen, setMenuOpen] = useState(false);
  const [modo, setModo] = useState("login"); // login | registro
  const [lUser, setLUser] = useState("");
  const [lPass, setLPass] = useState("");
  const [rForm, setRForm] = useState({ nombre: "", telefono: "", correo: "", usuario: "", contrasena: "" });

  const [servicio, setServicio] = useState(null); // viaje activo
  const [taxiPos, setTaxiPos] = useState(null); // ubicación WS del taxi
  const [misServicios, setMisServicios] = useState([]);

  // Selección de origen y destino
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [origenTexto, setOrigenTexto] = useState("");
  const [destinoTexto, setDestinoTexto] = useState("");
  const [activeSearchField, setActiveSearchField] = useState(null); // "origen" | "destino" | null
  const [searchResults, setSearchResults] = useState([]);
  const [searchingGeo, setSearchingGeo] = useState(false);

  // Cotización en tiempo real y preferencias del viaje
  const [cotizacion, setCotizacion] = useState(null);
  const [cotizando, setCotizando] = useState(false);
  const [tiposVehiculo, setTiposVehiculo] = useState([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [metodoPagoSel, setMetodoPagoSel] = useState("cash"); // "cash" | "transferencia"
  const [notasPasajero, setNotasPasajero] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Chat en tiempo real con el conductor
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatText, setChatText] = useState("");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const chatOpenRef = useRef(false);

  // Calificación al finalizar viaje
  const [ratingService, setRatingService] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

  // Edición de perfil del pasajero
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [perfilForm, setPerfilForm] = useState({ nombre: "", telefono: "", correo: "", contrasena: "" });
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  // Estilo de mapa (calles vs satélite híbrido con nombres de calles)
  const [mapStyle, setMapStyle] = useState(() => localStorage.getItem("pas_map_style") || "calles");
  const [passengerLight, setPassengerLight] = useState(
    () => localStorage.getItem("passenger_mode") === "claro"
  );
  const ignoreInitialModeEvent = useRef(true);
  const wsRef = useRef(null);
  const prevEstadoRef = useRef(null);
  const prevEnOrigenRef = useRef(false);

  const isNativePlatform = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      (Boolean(window.Capacitor?.isNativePlatform?.()) ||
        Capacitor.isNativePlatform() ||
        process.env.REACT_APP_NATIVE_ROLE === "pasajero")
    );
  }, []);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnreadChatCount(0);
  }, [chatOpen]);

  // Solicitar permisos nativos en Android al iniciar
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.TaxiHubNative?.requestRequiredPermissions) {
        window.TaxiHubNative.requestRequiredPermissions();
      }
    } catch (_) {}
  }, []);

  // Gestión del botón físico Atrás en Android
  useEffect(() => {
    const onHardwareBack = (e) => {
      if (chatOpen) {
        e.preventDefault();
        setChatOpen(false);
        return;
      }
      if (menuOpen) {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (ratingService) {
        e.preventDefault();
        setRatingService(null);
        return;
      }
      if (view !== "viaje") {
        e.preventDefault();
        setView("viaje");
      }
    };
    window.addEventListener("app:hardwareBack", onHardwareBack);
    return () => window.removeEventListener("app:hardwareBack", onHardwareBack);
  }, [chatOpen, menuOpen, ratingService, view]);

  useEffect(() => {
    const onMode = (event) => {
      if (ignoreInitialModeEvent.current) {
        ignoreInitialModeEvent.current = false;
        return;
      }
      const light = event.detail === "claro";
      setPassengerLight(light);
      localStorage.setItem("passenger_mode", light ? "claro" : "oscuro");
    };
    window.addEventListener("app:mode", onMode);
    return () => window.removeEventListener("app:mode", onMode);
  }, []);

  function getFromStore() {
    const d = localStorage.getItem("pas_data");
    return d ? JSON.parse(d) : null;
  }

  const toggleMapStyle = () => {
    const next = mapStyle === "calles" ? "satelite" : "calles";
    setMapStyle(next);
    localStorage.setItem("pas_map_style", next);
  };

  const reverseGeocodePunto = useCallback(async (lat, lng, target) => {
    try {
      const { data } = await pasApi.get("/geo/reverse", { params: { lat, lng } });
      if (data?.label) {
        if (target === "origen") setOrigenTexto(data.label);
        else if (target === "destino") setDestinoTexto(data.label);
      }
    } catch (_) {}
  }, []);

  const cargarViaje = useCallback(async () => {
    try {
      const { data } = await pasApi.get("/clientes/me/viaje-activo");
      if (data.servicio) setServicio(data.servicio);
      else setServicio(null);
    } catch (_) {
      /* sin token o expirado */
    }
  }, []);

  const cargarHistorial = useCallback(async () => {
    try {
      const { data } = await pasApi.get("/clientes/me/servicios");
      setMisServicios(data);
    } catch (_) {
      /* ignore */
    }
  }, []);

  // Notificaciones sonoras/voz cuando cambia el estado del servicio activo
  useEffect(() => {
    if (!servicio) {
      prevEstadoRef.current = null;
      prevEnOrigenRef.current = false;
      return;
    }
    const prevEst = prevEstadoRef.current;
    const curEst = servicio.estado;
    const curEnOrigen = Boolean(servicio.conductor_en_origen);

    if (prevEst && prevEst !== curEst) {
      if (curEst === "asignado" && servicio.taxi) {
        const unidad = servicio.taxi.numero_economico || "asignada";
        const chofer = servicio.taxi.nombre_conductor || "Tu conductor";
        toast.success(`¡Unidad ${unidad} confirmada! ${chofer} va en camino.`);
        notifyPassengerNative(
          "Taxi confirmado",
          `${chofer} (${unidad}) va en camino por ti`,
          `Tu taxi unidad ${unidad} ha aceptado el viaje y va en camino.`
        );
      } else if (curEst === "en_curso") {
        toast.success("Tu viaje ha iniciado. ¡Buen camino!");
      }
    }
    if (!prevEnOrigenRef.current && curEnOrigen && curEst === "asignado") {
      toast.info("¡Tu taxi ha llegado al punto de encuentro!");
      notifyPassengerNative(
        "Tu taxi está afuera",
        "El conductor ha llegado al punto de encuentro",
        "Tu taxi ha llegado al punto de encuentro."
      );
    }
    prevEstadoRef.current = curEst;
    prevEnOrigenRef.current = curEnOrigen;
  }, [servicio]);

  // Conexión WS del pasajero (solo recibe su propio viaje / taxi)
  useEffect(() => {
    if (!auth) return;
    let closed = false;
    const connect = () => {
      const ws = new WebSocket(
        `${WS_BASE}/ws/pasajero/${auth.id}?token=${encodeURIComponent(localStorage.getItem("pas_token") || "")}`
      );
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === "servicio") {
          if (m.servicio?.estado === "completado") {
            if (!m.servicio.calificacion_conductor) setRatingService(m.servicio);
            setServicio(null);
            setTaxiPos(null);
            cargarHistorial();
            toast.success("¡Has llegado a tu destino! Gracias por viajar con TaxiHUB.");
          } else if (m.servicio?.estado === "cancelado") {
            setServicio(null);
            setTaxiPos(null);
            cargarHistorial();
            toast("El servicio fue cancelado");
          } else {
            setServicio(m.servicio);
          }
        } else if (m.type === "ubicacion") {
          setTaxiPos({ lat: m.lat, lng: m.lng, ts: m.ts, heading: m.gps_heading });
        } else if (m.type === "mensaje") {
          setChatMsgs((messages) =>
            messages.some((item) => item.id === m.mensaje?.id) ? messages : [...messages, m.mensaje]
          );
          if (m.mensaje?.remitente !== "pasajero" && !chatOpenRef.current) {
            setUnreadChatCount((c) => c + 1);
            toast(`Mensaje del conductor: ${m.mensaje?.texto || ""}`);
            notifyPassengerNative("Mensaje del conductor", m.mensaje?.texto || "Nuevo mensaje");
          }
        }
      };
      ws.onclose = (ev) => {
        if (ev.code === 1008) {
          logoutPassenger();
          setAuth(null);
          return;
        }
        if (!closed) setTimeout(connect, 3000);
      };
    };
    connect();
    cargarViaje();
    cargarHistorial();
    const poll = setInterval(cargarViaje, 8000);
    return () => {
      closed = true;
      clearInterval(poll);
      wsRef.current?.close();
    };
  }, [auth, cargarViaje, cargarHistorial]);

  // Catálogo de tipos de vehículo
  useEffect(() => {
    pasApi
      .get("/tipos-vehiculo")
      .then((r) => {
        const activos = (r.data || []).filter((t) => t.activo);
        setTiposVehiculo(activos);
      })
      .catch(() => {});
  }, []);

  // Cotización dinámica en tiempo real cada vez que hay origen y destino
  useEffect(() => {
    if (!auth || !pickup || !dropoff) {
      setCotizacion(null);
      return;
    }
    let cancelled = false;
    setCotizando(true);
    pasApi
      .post("/servicios/cotizar", {
        origen: { lat: pickup.lat, lng: pickup.lng, texto: origenTexto || "Mi ubicación" },
        destino: { lat: dropoff.lat, lng: dropoff.lng, texto: destinoTexto || "Destino seleccionado" },
        tipo_vehiculo_preferido_id: tipoSeleccionado || null,
        metodo_pago: metodoPagoSel,
      })
      .then(({ data }) => {
        if (!cancelled) {
          setCotizacion(data);
          if (!tipoSeleccionado && data.categorias?.length > 0) {
            setTipoSeleccionado(data.categorias[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCotizando(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, pickup, dropoff, tipoSeleccionado, metodoPagoSel, origenTexto, destinoTexto]);

  // Autocompletado de calles/referencias de Palenque
  useEffect(() => {
    if (!auth || !activeSearchField) return;
    const q = activeSearchField === "origen" ? origenTexto : destinoTexto;
    if (!q || q.trim().length < 2) {
      setSearchResults(PALENQUE_QUICK_POIS);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingGeo(true);
      try {
        const { data } = await pasApi.get("/geo/search", { params: { q: q.trim(), limit: 6 } });
        setSearchResults(data?.resultados || []);
      } catch (_) {
        setSearchResults(PALENQUE_QUICK_POIS);
      } finally {
        setSearchingGeo(false);
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [auth, activeSearchField, origenTexto, destinoTexto]);

  const login = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/clientes/login", { usuario: lUser, contrasena: lPass });
      savePassengerAuth(data.token, data.cliente);
      setAuth(data.cliente);
      toast.success(`Hola, ${data.cliente.nombre}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo iniciar sesión");
    }
  };

  const registrar = async (e) => {
    e.preventDefault();
    if (!rForm.nombre || !rForm.usuario || !rForm.contrasena || !rForm.telefono) {
      toast.error("Completa nombre, teléfono, usuario y contraseña");
      return;
    }
    try {
      const { data } = await api.post("/clientes", rForm);
      savePassengerAuth(data.token, data.cliente);
      setAuth(data.cliente);
      toast.success("Cuenta creada con éxito");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo crear la cuenta");
    }
  };

  const salir = () => {
    logoutPassenger();
    setAuth(null);
    setServicio(null);
  };

  const usarMiUbicacion = useCallback(() => {
    if (!navigator.geolocation) {
      const fallback = { lat: 17.5094, lng: -91.9818 };
      setPickup(fallback);
      setOrigenTexto("Parque Central de Palenque, Centro");
      toast.info("Ubicación fijada en Centro de Palenque");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
        };
        setPickup(coords);
        reverseGeocodePunto(coords.lat, coords.lng, "origen");
        toast.success("Ubicación actual detectada");
      },
      () => {
        const fallback = { lat: 17.5094, lng: -91.9818 };
        setPickup(fallback);
        setOrigenTexto("Parque Central de Palenque, Centro");
        toast.info("Usando punto de referencia en Palenque Centro");
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, [reverseGeocodePunto]);

  const handleMapPick = useCallback(
    (coords) => {
      if (!pickup) {
        setPickup(coords);
        reverseGeocodePunto(coords.lat, coords.lng, "origen");
      } else {
        setDropoff(coords);
        reverseGeocodePunto(coords.lat, coords.lng, "destino");
      }
      setActiveSearchField(null);
    },
    [pickup, reverseGeocodePunto]
  );

  const seleccionarResultadoGeo = (item, field) => {
    const coords = { lat: +Number(item.lat).toFixed(6), lng: +Number(item.lng).toFixed(6) };
    const texto = item.texto || (item.sublabel ? `${item.label}, ${item.sublabel.split(",")[0]}` : item.label);
    if (field === "origen") {
      setPickup(coords);
      setOrigenTexto(texto);
    } else {
      setDropoff(coords);
      setDestinoTexto(texto);
    }
    setActiveSearchField(null);
  };

  const categoriaActiva = useMemo(() => {
    const cats = cotizacion?.categorias?.length ? cotizacion.categorias : tiposVehiculo;
    if (!cats?.length) return null;
    return cats.find((c) => c.id === tipoSeleccionado) || cats[0];
  }, [cotizacion, tiposVehiculo, tipoSeleccionado]);

  const costoFinalEstimado = useMemo(() => {
    if (categoriaActiva?.costo_estimado != null) return categoriaActiva.costo_estimado;
    if (cotizacion?.costo_estimado != null) return cotizacion.costo_estimado;
    return null;
  }, [categoriaActiva, cotizacion]);

  const solicitar = async () => {
    if (!pickup || !dropoff) {
      toast.error("Marca tu origen y tu destino en el mapa o buscador");
      return;
    }
    setGuardando(true);
    try {
      const { data } = await pasApi.post("/servicios", {
        origen: {
          lat: pickup.lat,
          lng: pickup.lng,
          texto: origenTexto?.trim() || "Mi ubicación en Palenque",
        },
        destino: {
          lat: dropoff.lat,
          lng: dropoff.lng,
          texto: destinoTexto?.trim() || "Destino seleccionado",
        },
        costo: costoFinalEstimado,
        tarifa_id: cotizacion?.tarifa_id || null,
        metodo_pago: metodoPagoSel,
        tipo_vehiculo_preferido_id: tipoSeleccionado || null,
        notas_pasajero: notasPasajero.trim() || null,
      });
      setServicio(data.servicio);
      setPickup(null);
      setDropoff(null);
      setOrigenTexto("");
      setDestinoTexto("");
      setNotasPasajero("");
      setCotizacion(null);
      setView("viaje");
      toast.success("Solicitud enviada · Contactando a la unidad más cercana");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo solicitar el taxi");
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = async () => {
    if (!servicio?.id) return;
    try {
      await pasApi.post(`/servicios/${servicio.id}/cancelar`, { motivo: "Cancelado por el pasajero" });
      setServicio(null);
      setTaxiPos(null);
      cargarHistorial();
      toast.success("Viaje cancelado");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo cancelar");
    }
  };

  const abrirChat = async () => {
    if (!servicio?.id) return;
    try {
      const { data } = await pasApi.get(`/servicios/${servicio.id}/mensajes`);
      setChatMsgs(data);
      setChatOpen(true);
      setUnreadChatCount(0);
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo abrir el chat");
    }
  };

  const enviarChat = async (textoOverride = null) => {
    const raw = textoOverride != null ? textoOverride : chatText;
    if (!raw.trim() || !servicio?.id) return;
    const texto = raw.trim();
    if (textoOverride == null) setChatText("");
    try {
      const { data } = await pasApi.post(`/servicios/${servicio.id}/mensajes", { texto }`.replace('", { texto }', ""));
      // Safe fallback if template above isn't used:
    } catch (_) {}
  };

  const enviarMensajeChat = async (textoOverride = null) => {
    const raw = typeof textoOverride === "string" ? textoOverride : chatText;
    if (!raw.trim() || !servicio?.id) return;
    const texto = raw.trim();
    if (typeof textoOverride !== "string") setChatText("");
    try {
      const { data } = await pasApi.post(`/servicios/${servicio.id}/mensajes`, { texto });
      setChatMsgs((messages) =>
        messages.some((item) => item.id === data.id) ? messages : [...messages, data]
      );
    } catch (err) {
      if (typeof textoOverride !== "string") setChatText(texto);
      toast.error(err.response?.data?.detail || "No se pudo enviar el mensaje");
    }
  };

  const enviarCalificacion = async () => {
    if (!ratingService?.id) return;
    try {
      await pasApi.post(`/servicios/${ratingService.id}/calificacion`, {
        puntuacion: ratingValue,
        comentario: ratingComment.trim() || null,
      });
      setRatingService(null);
      setRatingComment("");
      cargarHistorial();
      toast.success("¡Gracias por calificar a tu conductor!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo guardar la calificación");
    }
  };

  const iniciarEdicionPerfil = () => {
    setPerfilForm({
      nombre: auth?.nombre || "",
      telefono: auth?.telefono || "",
      correo: auth?.correo || "",
      contrasena: "",
    });
    setEditandoPerfil(true);
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    setGuardandoPerfil(true);
    try {
      const payload = {
        nombre: perfilForm.nombre.trim(),
        telefono: perfilForm.telefono.trim(),
        correo: perfilForm.correo.trim(),
      };
      if (perfilForm.contrasena.trim()) {
        payload.contrasena = perfilForm.contrasena.trim();
      }
      const { data } = await pasApi.put("/clientes/me", payload);
      const token = localStorage.getItem("pas_token");
      savePassengerAuth(token, data);
      setAuth(data);
      setEditandoPerfil(false);
      toast.success("Perfil actualizado correctamente");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo actualizar el perfil");
    } finally {
      setGuardandoPerfil(false);
    }
  };

  // Posición en vivo del taxi (WS) o instantánea del servicio
  const taxiActual = useMemo(
    () =>
      (taxiPos && { lat: taxiPos.lat, lng: taxiPos.lng }) ||
      (servicio?.taxi?.lat != null ? { lat: servicio.taxi.lat, lng: servicio.taxi.lng } : null),
    [taxiPos, servicio]
  );

  // Cuando el servicio está "asignado", la ruta activa del taxi es hacia el ORIGEN (recogida).
  // Cuando está "en_curso", la ruta activa del taxi es hacia el DESTINO.
  const puntoObjetivoTaxi = useMemo(() => {
    if (!servicio) return null;
    if (servicio.estado === "asignado" && servicio.origen?.lat != null) {
      return servicio.origen;
    }
    if (servicio.destino?.lat != null) {
      return servicio.destino;
    }
    return null;
  }, [servicio]);

  const rutaViaje = useRouting(
    servicio?.origen?.lat != null ? servicio.origen : null,
    servicio?.destino?.lat != null ? servicio.destino : null,
    { enabled: !!servicio && view === "viaje", client: pasApi }
  );

  const rutaDelTaxi = useRouting(taxiActual, puntoObjetivoTaxi, {
    enabled: !!taxiActual && !!puntoObjetivoTaxi && !!servicio && view === "viaje",
    client: pasApi,
  });

  const taxiHeading = useMemo(() => {
    if (taxiPos?.heading != null) return taxiPos.heading;
    if (!taxiActual) return 0;
    const o = { lat: taxiActual.lat, lng: taxiActual.lng };
    if (rutaDelTaxi.latlngs?.length > 1) {
      const ahead = puntoAdelanteEnRuta(o, rutaDelTaxi.latlngs, 120);
      if (ahead) return ahead.brg;
    }
    if (puntoObjetivoTaxi?.lat != null) {
      return bearing(o.lat, o.lng, puntoObjetivoTaxi.lat, puntoObjetivoTaxi.lng);
    }
    return 0;
  }, [taxiPos, taxiActual, rutaDelTaxi.latlngs, puntoObjetivoTaxi]);

  const rutaPreview = useRouting(pickup, dropoff, {
    enabled: !!pickup && !!dropoff,
    client: pasApi,
  });

  if (!auth) {
    return (
      <AuthScreen
        modo={modo}
        setModo={setModo}
        lUser={lUser}
        setLUser={setLUser}
        lPass={lPass}
        setLPass={setLPass}
        rForm={rForm}
        setRForm={setRForm}
        login={login}
        registrar={registrar}
        isNativePlatform={isNativePlatform}
      />
    );
  }

  const mapCenter = pickup || (taxiActual && [taxiActual.lat, taxiActual.lng]) || CENTER;
  const mapaFullscreen = view === "viaje" || view === "solicitar";
  const listaCategorias = cotizacion?.categorias?.length ? cotizacion.categorias : tiposVehiculo;

  const pasoActualViaje = (() => {
    if (!servicio) return 0;
    if (servicio.estado === "pendiente") return 1;
    if (servicio.estado === "ofrecido") return 2;
    if (servicio.estado === "asignado" && !servicio.conductor_en_origen) return 3;
    if (servicio.estado === "asignado" && servicio.conductor_en_origen) return 4;
    if (servicio.estado === "en_curso") return 5;
    return 1;
  })();

  const tituloEstadoViaje = (() => {
    if (!servicio) return "";
    if (servicio.estado === "pendiente") return "Buscando unidades disponibles";
    if (servicio.estado === "ofrecido") return "Esperando confirmación del conductor";
    if (servicio.estado === "asignado" && servicio.conductor_en_origen)
      return "¡Tu taxi está en el punto de encuentro!";
    if (servicio.estado === "asignado") return "Conductor confirmado · En camino por ti";
    if (servicio.estado === "en_curso") return "En viaje hacia tu destino";
    return "Servicio activo";
  })();

  return (
    <div
      className={cn(
        "taxi-passenger-shell",
        passengerLight ? "taxi-passenger-light" : "taxi-passenger-dark"
      )}
    >
      {!mapaFullscreen ? (
        <header className="taxi-passenger-page-header">
          <button
            type="button"
            data-testid={PASSENGER.menuOpen}
            className="taxi-passenger-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu />
          </button>
          <BrandLogo />
          <div className="taxi-passenger-header-actions">
            <ModeToggle />
            <button
              data-testid="pas-logout"
              onClick={salir}
              className="taxi-passenger-icon-button"
              title="Salir"
              aria-label="Salir"
            >
              <LogOut />
            </button>
          </div>
        </header>
      ) : (
        <div className="taxi-passenger-floating-header">
          <button
            type="button"
            data-testid={PASSENGER.menuOpen}
            className="taxi-passenger-menu-button taxi-passenger-glass-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu />
          </button>
          <div className="taxi-passenger-glass-pill">
            <BrandLogo className="taxi-passenger-logo-floating" />
          </div>
          <div className="taxi-passenger-header-actions">
            <button
              type="button"
              data-testid={PASSENGER.mapaModoToggle}
              onClick={toggleMapStyle}
              className="taxi-passenger-icon-button taxi-passenger-glass-btn"
              title={mapStyle === "calles" ? "Cambiar a vista Satélite" : "Cambiar a vista Calles"}
              aria-label="Cambiar modo de mapa"
            >
              <Layers />
            </button>
            <ModeToggle />
            <button
              data-testid="pas-logout"
              onClick={salir}
              className="taxi-passenger-icon-button taxi-passenger-glass-btn"
              title="Salir"
              aria-label="Salir"
            >
              <LogOut />
            </button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "taxi-passenger-content",
          mapaFullscreen ? "taxi-passenger-map-view" : "taxi-passenger-document-view",
          (view === "solicitar" || !!servicio) && "taxi-passenger-immersive-view"
        )}
      >
        {view === "viaje" &&
          (!servicio ? (
            <div className="taxi-passenger-empty-trip" data-testid="pas-sin-viaje">
              <div className="taxi-passenger-map-layer">
                <MapContainer
                  center={pickup ? [pickup.lat, pickup.lng] : CENTER}
                  zoom={15}
                  zoomControl={false}
                  markerZoomAnimation={false}
                  className="h-full w-full"
                >
                  <PassengerTileLayers mapStyle={mapStyle} />
                  <MapViewportController focusPoint={pickup} />
                  {pickup && (
                    <Marker
                      position={[pickup.lat, pickup.lng]}
                      icon={pointIcon("Mi ubicación", "#10b981")}
                    />
                  )}
                </MapContainer>
              </div>

              <button
                onClick={usarMiUbicacion}
                aria-label="Usar mi ubicación"
                data-testid="pas-centrar-mapa"
                className="taxi-passenger-locate-button"
              >
                <Locate />
              </button>

              <div className="taxi-passenger-home-sheet">
                <div className="taxi-passenger-sheet-handle">
                  <span aria-hidden="true" />
                </div>
                <div className="taxi-passenger-sheet-inner">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="taxi-passenger-section-heading">
                        Hola, {auth.nombre?.split(" ")[0] || "Pasajero"} 👋
                      </div>
                      <p className="taxi-passenger-section-copy">
                        ¿A dónde te llevamos hoy en Palenque?
                      </p>
                    </div>
                    <span className="taxi-passenger-tenant-badge">Radio Taxis Palenque</span>
                  </div>

                  <button
                    data-testid="pas-abrir-solicitar"
                    onClick={() => {
                      if (!pickup) usarMiUbicacion();
                      setView("solicitar");
                    }}
                    className="taxi-passenger-destination-field"
                  >
                    <span>
                      <Search />
                    </span>
                    <span className="font-semibold">¿A dónde vas? Buscar calle o destino…</span>
                    <ChevronRight />
                  </button>

                  {/* Destinos frecuentes en Palenque con 1 toque */}
                  <div className="taxi-passenger-quick-chips">
                    {PALENQUE_QUICK_POIS.slice(0, 5).map((poi) => (
                      <button
                        key={poi.id}
                        type="button"
                        onClick={() => {
                          if (!pickup) {
                            setPickup({ lat: 17.5094, lng: -91.9818 });
                            setOrigenTexto("Parque Central de Palenque, Centro");
                          }
                          setDropoff({ lat: poi.lat, lng: poi.lng });
                          setDestinoTexto(poi.texto);
                          setView("solicitar");
                        }}
                        className="taxi-passenger-poi-chip"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{poi.label}</span>
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      usarMiUbicacion();
                      setView("solicitar");
                    }}
                    className="taxi-passenger-location-button"
                    data-testid="pas-inicio-mi-ubicacion"
                  >
                    <Navigation /> Fijar mi ubicación actual y elegir destino
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="taxi-passenger-active-trip" data-testid="pas-viaje-inmersivo">
              <div className="taxi-passenger-map-layer">
                <MapContainer
                  center={mapCenter}
                  zoom={15}
                  zoomControl={false}
                  markerZoomAnimation={false}
                  className="h-full w-full"
                >
                  <PassengerTileLayers mapStyle={mapStyle} />
                  <MapViewportController
                    points={[servicio.origen, servicio.destino, taxiActual].filter(Boolean)}
                  />
                  {/* Ruta plan del viaje (origen → destino) */}
                  {rutaViaje.latlngs?.length > 1 && (
                    <Polyline
                      positions={rutaViaje.latlngs}
                      pathOptions={{
                        color: "#38bdf8",
                        weight: 4,
                        opacity: 0.65,
                        dashArray: "8 10",
                      }}
                    />
                  )}
                  {/* Tramo en vivo del taxi hacia origen (asignado) o hacia destino (en_curso) */}
                  {rutaDelTaxi.latlngs?.length > 1 && (
                    <>
                      <Polyline
                        positions={rutaDelTaxi.latlngs}
                        pathOptions={{
                          color: "#0b0b0d",
                          weight: 9,
                          opacity: 0.55,
                          lineCap: "round",
                        }}
                      />
                      <RoutePolyline
                        positions={rutaDelTaxi.latlngs}
                        className="th-route-flow"
                        pathOptions={{
                          color: "#10b981",
                          weight: 5,
                          opacity: 0.96,
                          dashArray: "1 12",
                          lineCap: "round",
                        }}
                      />
                    </>
                  )}
                  {servicio.origen?.lat != null && (
                    <Marker
                      position={[servicio.origen.lat, servicio.origen.lng]}
                      icon={pointIcon("Origen", "#10b981")}
                    />
                  )}
                  {servicio.destino?.lat != null && (
                    <Marker
                      position={[servicio.destino.lat, servicio.destino.lng]}
                      icon={pointIcon("Destino", "#ef4444")}
                    />
                  )}
                  {(taxiPos || servicio.taxi) && taxiActual && (
                    <Marker
                      position={[taxiActual.lat, taxiActual.lng]}
                      icon={taxiRoleAssetIcon({ heading: taxiHeading, size: "md" })}
                    >
                      <Popup>
                        <div className="text-sm font-medium">
                          Tu taxi
                          {servicio.taxi?.numero_economico
                            ? ` · ${servicio.taxi.numero_economico}`
                            : ""}
                          <br />
                          {timeAgo(taxiPos?.ts || servicio.taxi?.ultima_actualizacion)}
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>

              <section className="taxi-passenger-trip-summary" aria-label="Resumen del viaje">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <ServicioBadge estado={servicio.estado} />
                  {servicio.tarifa_nombre && (
                    <span className="text-xs font-semibold opacity-75">
                      {servicio.tarifa_nombre}
                    </span>
                  )}
                </div>
                <h1>{tituloEstadoViaje}</h1>

                {/* Barra de progreso de 5 etapas */}
                <div className="taxi-passenger-stepper" data-testid={PASSENGER.stepTracker}>
                  {[
                    { step: 1, label: "Solicitud" },
                    { step: 2, label: "Oferta" },
                    { step: 3, label: "Asignado" },
                    { step: 4, label: "En punto" },
                    { step: 5, label: "En viaje" },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className={cn(
                        "taxi-passenger-step",
                        pasoActualViaje >= item.step && "taxi-passenger-step-active",
                        pasoActualViaje === item.step && "taxi-passenger-step-current"
                      )}
                    >
                      <span className="taxi-passenger-step-dot" />
                      <small>{item.label}</small>
                    </div>
                  ))}
                </div>

                <div className="taxi-passenger-route-summary">
                  <div className="taxi-passenger-route-rail" aria-hidden="true">
                    <span className="taxi-passenger-route-dot taxi-passenger-route-dot-origin" />
                    <span />
                    <span className="taxi-passenger-route-dot taxi-passenger-route-dot-destination" />
                  </div>
                  <div className="taxi-passenger-route-copy">
                    <div>
                      <small>Punto de recogida</small>
                      <strong>
                        {servicio.origen_texto || servicio.origen?.texto || "Mi ubicación"}
                      </strong>
                    </div>
                    <div>
                      <small>Destino</small>
                      <strong>
                        {servicio.destino_texto ||
                          servicio.destino?.texto ||
                          "Destino seleccionado"}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="taxi-passenger-eta">
                  <strong>
                    {rutaDelTaxi.duration_s != null
                      ? fmtDuration(rutaDelTaxi.duration_s)
                      : servicio.taxi?.eta_origen_min != null
                        ? `${servicio.taxi.eta_origen_min} min`
                        : servicio.taxi
                          ? "En ruta"
                          : "Buscando…"}
                  </strong>
                  <span>
                    {rutaDelTaxi.distance_m != null
                      ? `${servicio.estado === "asignado" ? "Distancia del taxi a ti" : "Restante a destino"} · ${fmtDist(rutaDelTaxi.distance_m)}`
                      : servicio.estado === "ofrecido"
                        ? "Notificando al conductor más cercano para que acepte tu viaje"
                        : "Localizando unidades libres en tu zona"}
                  </span>
                </div>
              </section>

              <div data-testid="pas-viaje-sheet" className="taxi-passenger-driver-sheet">
                <div className="taxi-passenger-sheet-handle">
                  <span aria-hidden="true" />
                </div>
                <div className="taxi-passenger-sheet-inner">
                  {servicio.taxi ? (
                    <div data-testid="pas-taxi-card">
                      <div className="taxi-passenger-driver-row">
                        <div className="taxi-passenger-driver-avatar">
                          {servicio.taxi.foto_url ? (
                            <img
                              src={
                                servicio.taxi.foto_url.startsWith("http")
                                  ? servicio.taxi.foto_url
                                  : `${BACKEND_URL}${servicio.taxi.foto_url}`
                              }
                              alt={servicio.taxi.nombre_conductor || "Conductor"}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            iniciales(servicio.taxi.nombre_conductor)
                          )}
                        </div>
                        <div className="taxi-passenger-driver-copy">
                          <strong>{servicio.taxi.nombre_conductor}</strong>
                          <span>
                            {[
                              servicio.taxi.vehiculo?.marca,
                              servicio.taxi.vehiculo?.modelo,
                              servicio.taxi.vehiculo?.color,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Unidad Certificada"}{" "}
                            · Económico {servicio.taxi.numero_economico || "—"}
                          </span>
                          <span className="taxi-passenger-plate">
                            Placa: {servicio.taxi.vehiculo?.placa || servicio.taxi.numero_economico || "CH-TX"}
                          </span>
                        </div>
                        <div className="taxi-passenger-rating">
                          <Star fill="currentColor" />{" "}
                          <b>{servicio.taxi.calificacion_promedio ?? "4.9"}</b>
                        </div>
                      </div>
                      {servicio.taxi.vehiculo && (
                        <div className="taxi-passenger-vehicle-thumb" data-testid="pas-vehiculo-img">
                          <VehicleImage
                            vehiculo={servicio.taxi.vehiculo}
                            alt="Vehículo del servicio"
                            className="taxi-passenger-vehicle-thumb-img"
                            imgClassName="p-0.5"
                          />
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">
                              {servicio.taxi.vehiculo.tipo_vehiculo?.nombre || "Taxi estándar"}
                            </span>
                            <small className="opacity-75">
                              Unidad verificada · Radio Taxis Palenque
                            </small>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="taxi-passenger-searching">
                      <div className="taxi-passenger-searching-icon">
                        <Car />
                      </div>
                      <div>
                        <strong>
                          {servicio.estado === "ofrecido"
                            ? "Esperando aceptación de la unidad más cercana…"
                            : "Buscando un taxi disponible…"}
                        </strong>
                        <span>
                          {servicio.estado === "ofrecido"
                            ? "La oferta ya fue enviada al conductor. Si no acepta, reasignaremos automáticamente al siguiente taxi cercano."
                            : "Conectando con la flota activa de Radio Taxis Palenque."}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="taxi-passenger-trip-meta">
                    {(rutaDelTaxi.distance_m != null || servicio.distancia_m != null) && (
                      <span>
                        <Navigation />{" "}
                        {fmtDist(rutaDelTaxi.distance_m ?? servicio.distancia_m)}
                      </span>
                    )}
                    <span>
                      <Wallet /> {metodoPago(servicio.metodo_pago)}
                    </span>
                    {servicio.taxi && (taxiPos || servicio.taxi.lat != null) && (
                      <span>
                        <Clock /> {timeAgo(taxiPos?.ts || servicio.taxi?.ultima_actualizacion)}
                      </span>
                    )}
                  </div>
                  {servicio.costo != null && (
                    <div className="taxi-passenger-cost">
                      <span>Tarifa estimada del viaje</span>
                      <strong>${servicio.costo} MXN</strong>
                    </div>
                  )}

                  <div className="taxi-passenger-trip-actions">
                    {servicio.taxi?.telefono && (
                      <a
                        href={`tel:${servicio.taxi.telefono}`}
                        data-testid="pas-llamar"
                        className="taxi-passenger-action taxi-passenger-action-call"
                        aria-label="Llamar al conductor"
                      >
                        <Phone />
                        <span>Llamar</span>
                      </a>
                    )}
                    {servicio.taxi && (
                      <button
                        type="button"
                        data-testid={PASSENGER.chatOpen}
                        onClick={abrirChat}
                        className="taxi-passenger-action taxi-passenger-action-chat relative"
                        aria-label="Abrir chat"
                      >
                        <MessageCircle />
                        <span>Chat con conductor</span>
                        {unreadChatCount > 0 && (
                          <span
                            data-testid={PASSENGER.chatBadge}
                            className="taxi-passenger-chat-unread"
                          >
                            {unreadChatCount}
                          </span>
                        )}
                      </button>
                    )}
                    {["pendiente", "ofrecido", "asignado", "en_curso"].includes(
                      servicio.estado
                    ) && (
                      <button
                        data-testid="pas-cancelar"
                        onClick={cancelar}
                        className="taxi-passenger-action taxi-passenger-action-cancel"
                      >
                        <X />
                        <span>Cancelar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

        {view === "solicitar" && (
          <div className="taxi-passenger-request-view" data-testid="pas-solicitar-inmersivo">
            <div className="taxi-passenger-map-layer">
              <MapContainer
                center={pickup ? [pickup.lat, pickup.lng] : CENTER}
                zoom={15}
                zoomControl={false}
                markerZoomAnimation={false}
                className="h-full w-full"
              >
                <PassengerTileLayers mapStyle={mapStyle} />
                <MapViewportController
                  points={[pickup, dropoff].filter(Boolean)}
                  focusPoint={pickup || dropoff}
                />
                <MapClick onPick={handleMapPick} />
                {pickup && (
                  <Marker
                    position={[pickup.lat, pickup.lng]}
                    icon={pointIcon("Origen", "#10b981")}
                    draggable={true}
                    eventHandlers={{
                      dragend: (e) => {
                        const ll = e.target.getLatLng();
                        const c = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
                        setPickup(c);
                        reverseGeocodePunto(c.lat, c.lng, "origen");
                      },
                    }}
                  />
                )}
                {dropoff && (
                  <Marker
                    position={[dropoff.lat, dropoff.lng]}
                    icon={pointIcon("Destino", "#ef4444")}
                    draggable={true}
                    eventHandlers={{
                      dragend: (e) => {
                        const ll = e.target.getLatLng();
                        const c = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
                        setDropoff(c);
                        reverseGeocodePunto(c.lat, c.lng, "destino");
                      },
                    }}
                  />
                )}
                {rutaPreview.latlngs?.length > 1 && (
                  <Polyline
                    positions={rutaPreview.latlngs}
                    pathOptions={{
                      color: "#10b981",
                      weight: 5,
                      opacity: 0.9,
                      dashArray: "1 12",
                      lineCap: "round",
                    }}
                  />
                )}
              </MapContainer>
            </div>

            <button
              onClick={usarMiUbicacion}
              aria-label="Usar mi ubicación"
              data-testid="pas-centrar-mapa"
              className="taxi-passenger-locate-button taxi-passenger-request-locate"
            >
              <Locate />
            </button>

            {!pickup && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-[10] flex justify-center px-4">
                <div className="taxi-passenger-map-hint">
                  <MapPin /> Toca el mapa o escribe tu punto de partida
                </div>
              </div>
            )}
            {pickup && !dropoff && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-[10] flex justify-center px-4">
                <div className="taxi-passenger-map-hint">
                  <Flag /> Toca el mapa o elige a dónde vas
                </div>
              </div>
            )}

            <div data-testid="pas-solicitar-sheet" className="taxi-passenger-request-sheet">
              <div className="taxi-passenger-sheet-handle">
                <span aria-hidden="true" />
              </div>
              <div className="taxi-passenger-sheet-inner">
                <div className="flex items-center justify-between mb-2">
                  <div className="taxi-passenger-section-heading">Planifica tu viaje</div>
                  <button
                    type="button"
                    onClick={() => setView("viaje")}
                    className="text-xs font-semibold opacity-70 hover:opacity-100"
                  >
                    Cerrar
                  </button>
                </div>

                {/* Buscadores duales de Origen y Destino con autocompletado */}
                <div className="taxi-passenger-search-box">
                  <div className="taxi-passenger-search-row">
                    <span className="taxi-passenger-pin-dot taxi-passenger-pin-origin" />
                    <input
                      data-testid={PASSENGER.origenInput}
                      value={origenTexto}
                      onFocus={() => setActiveSearchField("origen")}
                      onChange={(e) => {
                        setOrigenTexto(e.target.value);
                        setActiveSearchField("origen");
                      }}
                      placeholder="Punto de partida (toca el mapa o busca calle)"
                      className="taxi-passenger-search-input"
                    />
                    <button
                      type="button"
                      data-testid="pas-mi-ubicacion"
                      onClick={usarMiUbicacion}
                      title="Usar mi GPS actual"
                      className="taxi-passenger-gps-inline-btn"
                    >
                      <Locate className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="taxi-passenger-search-divider" />
                  <div className="taxi-passenger-search-row">
                    <span className="taxi-passenger-pin-dot taxi-passenger-pin-dest" />
                    <input
                      data-testid={PASSENGER.destinoInput}
                      value={destinoTexto}
                      onFocus={() => setActiveSearchField("destino")}
                      onChange={(e) => {
                        setDestinoTexto(e.target.value);
                        setActiveSearchField("destino");
                      }}
                      placeholder="¿A dónde vas? (Mercado, Tren Maya, Colonia…)"
                      className="taxi-passenger-search-input"
                    />
                    {destinoTexto && (
                      <button
                        type="button"
                        onClick={() => {
                          setDestinoTexto("");
                          setDropoff(null);
                        }}
                        className="taxi-passenger-gps-inline-btn"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sugerencias de autocompletado en vivo */}
                {activeSearchField && (
                  <div className="taxi-passenger-autocomplete-list">
                    <div className="flex items-center justify-between px-2 py-1 text-[11px] opacity-65">
                      <span>
                        {searchingGeo
                          ? "Buscando en Palenque…"
                          : `Sugerencias para ${activeSearchField === "origen" ? "origen" : "destino"}`}
                      </span>
                      <button type="button" onClick={() => setActiveSearchField(null)}>
                        Ocultar
                      </button>
                    </div>
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => seleccionarResultadoGeo(item, activeSearchField)}
                        className="taxi-passenger-autocomplete-item"
                      >
                        <MapPin className="w-4 h-4 shrink-0 text-emerald-500" />
                        <div className="min-w-0 flex-1 text-left">
                          <div className="font-semibold text-xs truncate">{item.label}</div>
                          <div className="text-[11px] opacity-65 truncate">
                            {item.sublabel || item.texto || "Palenque, Chiapas"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Chips rápidos cuando falta origen o destino */}
                {(!pickup || !dropoff) && !activeSearchField && (
                  <div className="mt-2.5">
                    {pickup && !dropoff && (
                      <div className="taxi-passenger-marked-point mb-2" data-testid="pas-pickup-info">
                        <MapPin /> Origen: {origenTexto || "Punto marcado en el mapa"}
                      </div>
                    )}
                    <div className="taxi-passenger-subheading mb-1.5">
                      {!pickup ? "Puntos frecuentes de recogida" : "Destinos rápidos en Palenque"}
                    </div>
                    <div className="taxi-passenger-quick-chips">
                      {PALENQUE_QUICK_POIS.map((poi) => (
                        <button
                          key={poi.id}
                          type="button"
                          onClick={() =>
                            seleccionarResultadoGeo(poi, !pickup ? "origen" : "destino")
                          }
                          className="taxi-passenger-poi-chip"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{poi.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pickup && dropoff && (
                  <>
                    {/* Resumen de ruta y cotización oficial del tenant */}
                    <div
                      className="taxi-passenger-quote-banner"
                      data-testid={PASSENGER.cotizacionCard}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <Sparkles className="w-4 h-4 text-emerald-500" />
                          <span>
                            {cotizacion?.tarifa_nombre || "Tarifa Oficial Radio Taxis Palenque"}
                          </span>
                        </div>
                        {costoFinalEstimado != null && (
                          <span className="taxi-passenger-quote-price">
                            ${costoFinalEstimado} MXN
                          </span>
                        )}
                      </div>
                      <div className="taxi-passenger-preview-meta mt-1.5 pt-1.5">
                        {(rutaPreview.distance_m != null || cotizacion?.distancia_m != null) && (
                          <span>
                            <Navigation />{" "}
                            {fmtDist(rutaPreview.distance_m ?? cotizacion?.distancia_m)}
                          </span>
                        )}
                        {(rutaPreview.duration_s != null || cotizacion?.duracion_s != null) && (
                          <span>
                            <Clock /> ≈
                            {fmtDuration(rutaPreview.duration_s ?? cotizacion?.duracion_s)}
                          </span>
                        )}
                        {cotizacion?.unidades_libres_total != null && (
                          <span>
                            <Car /> {cotizacion.unidades_libres_total} taxis libres
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Categorías de vehículo con tarifa estimada, capacidad y ETA */}
                    {listaCategorias.length > 0 && (
                      <div className="mt-3">
                        <div className="taxi-passenger-subheading">
                          Elige categoría de vehículo
                        </div>
                        <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1.5">
                          {listaCategorias.map((t) => {
                            const isSelected = tipoSeleccionado === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                data-testid={`pas-tipo-${t.id}`}
                                onClick={() =>
                                  setTipoSeleccionado((cur) => (cur === t.id ? null : t.id))
                                }
                                className={cn(
                                  "taxi-passenger-vehicle-option",
                                  isSelected ? "taxi-passenger-vehicle-option-selected" : ""
                                )}
                              >
                                <VehicleImage
                                  vehiculo={{ tipo_vehiculo: t, imagen_resuelta: t.imagen_url }}
                                  className="taxi-passenger-vehicle-image"
                                  imgClassName="p-1"
                                />
                                <div className="p-2 flex flex-col gap-0.5 w-full">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-xs truncate">{t.nombre}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] opacity-75">
                                    <span className="inline-flex items-center gap-0.5">
                                      <Users className="w-3 h-3" /> {t.capacidad || 4}
                                    </span>
                                    {t.eta_min != null && <span>~{t.eta_min} min</span>}
                                  </div>
                                  {t.costo_estimado != null && (
                                    <div className="text-xs font-extrabold text-emerald-500 mt-0.5">
                                      ${t.costo_estimado} MXN
                                    </div>
                                  )}
                                </div>
                                {isSelected && (
                                  <span className="taxi-passenger-vehicle-check">
                                    <Check />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Selector de método de pago y nota de referencia */}
                    <div className="grid grid-cols-2 gap-2 mt-2.5">
                      <button
                        type="button"
                        data-testid={PASSENGER.metodoPagoEfectivo}
                        onClick={() => setMetodoPagoSel("cash")}
                        className={cn(
                          "taxi-passenger-pay-option",
                          metodoPagoSel === "cash" && "taxi-passenger-pay-option-active"
                        )}
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Efectivo</span>
                      </button>
                      <button
                        type="button"
                        data-testid={PASSENGER.metodoPagoTransferencia}
                        onClick={() => setMetodoPagoSel("transferencia")}
                        className={cn(
                          "taxi-passenger-pay-option",
                          metodoPagoSel === "transferencia" && "taxi-passenger-pay-option-active"
                        )}
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Transferencia</span>
                      </button>
                    </div>

                    <Input
                      value={notasPasajero}
                      onChange={(e) => setNotasPasajero(e.target.value)}
                      placeholder="Referencia para el chofer (ej. portón blanco, llevo maleta)"
                      className="taxi-passenger-destination-input mt-2.5"
                    />

                    <div className="taxi-passenger-request-actions">
                      <Button
                        data-testid="pas-limpiar"
                        variant="ghost"
                        onClick={() => {
                          setPickup(null);
                          setDropoff(null);
                          setOrigenTexto("");
                          setDestinoTexto("");
                          setTipoSeleccionado(null);
                          setCotizacion(null);
                        }}
                      >
                        Limpiar
                      </Button>
                      <Button
                        data-testid="pas-solicitar"
                        onClick={solicitar}
                        loading={guardando}
                        size="lg"
                        className="taxi-passenger-primary-button"
                      >
                        <MapPin />{" "}
                        {guardando
                          ? "Solicitando unidad…"
                          : costoFinalEstimado != null
                            ? `Confirmar taxi · $${costoFinalEstimado} MXN`
                            : "Solicitar taxi"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {view === "historial" && (
          <div className="taxi-passenger-history" data-testid="pas-historial">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-extrabold">Mis viajes en Palenque</h2>
              <span className="text-xs opacity-70">{misServicios.length} registros</span>
            </div>
            {misServicios.length === 0 && (
              <EmptyState
                icon={History}
                title="Sin viajes aún"
                description="Tu historial de viajes solicitados aparecerá aquí."
              />
            )}
            {misServicios.map((s) => (
              <div key={s.id} className="taxi-passenger-history-item">
                <div className="min-w-0 flex-1">
                  <div className="taxi-passenger-history-route">
                    {s.origen_texto || s.origen?.texto || "Origen"} →{" "}
                    {s.destino_texto || s.destino?.texto || "Destino"}
                  </div>
                  <div className="taxi-passenger-history-meta">
                    <Clock />
                    <span>{timeAgo(s.timestamp_creacion)}</span>
                    {s.costo != null && <strong className="ml-1">${s.costo} MXN</strong>}
                    {s.operador_nombre && (
                      <span className="ml-1">
                        · {s.operador_placa || "Taxi"} ({s.operador_nombre})
                      </span>
                    )}
                  </div>
                  {s.calificacion_conductor?.puntuacion && (
                    <div className="inline-flex items-center gap-1 text-amber-500 text-xs font-bold mt-1">
                      <Star className="w-3.5 h-3.5" fill="currentColor" />
                      <span>{s.calificacion_conductor.puntuacion} / 5</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <ServicioBadge estado={s.estado} />
                  {s.estado === "completado" && !s.calificacion_conductor && (
                    <button
                      type="button"
                      onClick={() => {
                        setRatingService({
                          id: s.id,
                          taxi: { nombre_conductor: s.operador_nombre || "tu conductor" },
                        });
                        setRatingValue(5);
                      }}
                      className="text-[11px] font-bold text-emerald-500 underline"
                    >
                      Calificar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "perfil" && (
          <div className="taxi-passenger-profile" data-testid="pas-perfil">
            <div className="taxi-passenger-profile-card">
              <div className="taxi-passenger-profile-avatar">{iniciales(auth.nombre)}</div>
              <div className="taxi-passenger-profile-name">{auth.nombre}</div>
              <div className="taxi-passenger-profile-date">
                Pasajero verificado · Radio Taxis Palenque
              </div>
            </div>
            <div className="taxi-passenger-profile-stats">
              <div>
                <strong>{misServicios.length}</strong>
                <span>Viajes totales</span>
              </div>
              <div>
                <strong>
                  {misServicios.filter((s) => s.estado === "completado").length}
                </strong>
                <span>Completados</span>
              </div>
            </div>

            {!editandoPerfil ? (
              <div className="taxi-passenger-profile-details">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                    Datos de tu cuenta
                  </span>
                  <button
                    type="button"
                    data-testid={PASSENGER.perfilEditarBtn}
                    onClick={iniciarEdicionPerfil}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar perfil
                  </button>
                </div>
                <div>
                  <User />
                  <span>{auth.nombre}</span>
                </div>
                <div>
                  <Phone />
                  <span>{auth.telefono || "Sin teléfono registrado"}</span>
                </div>
                <div>
                  <Mail />
                  <span>{auth.correo || "Sin correo registrado"}</span>
                </div>
              </div>
            ) : (
              <form onSubmit={guardarPerfil} className="taxi-passenger-profile-details">
                <div className="text-xs font-bold uppercase tracking-wider opacity-60">
                  Editar información personal
                </div>
                <label className="taxi-passenger-field">
                  <span>Nombre completo</span>
                  <Input
                    data-testid={PASSENGER.perfilNombreInput}
                    value={perfilForm.nombre}
                    onChange={(e) => setPerfilForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </label>
                <label className="taxi-passenger-field">
                  <span>Teléfono</span>
                  <Input
                    data-testid={PASSENGER.perfilTelefonoInput}
                    value={perfilForm.telefono}
                    onChange={(e) => setPerfilForm((f) => ({ ...f, telefono: e.target.value }))}
                  />
                </label>
                <label className="taxi-passenger-field">
                  <span>Correo electrónico</span>
                  <Input
                    data-testid={PASSENGER.perfilCorreoInput}
                    value={perfilForm.correo}
                    onChange={(e) => setPerfilForm((f) => ({ ...f, correo: e.target.value }))}
                  />
                </label>
                <label className="taxi-passenger-field">
                  <span>Nueva contraseña (opcional)</span>
                  <Input
                    type="password"
                    value={perfilForm.contrasena}
                    onChange={(e) => setPerfilForm((f) => ({ ...f, contrasena: e.target.value }))}
                    placeholder="Dejar vacío para conservar actual"
                  />
                </label>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditandoPerfil(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    data-testid={PASSENGER.perfilGuardarBtn}
                    loading={guardandoPerfil}
                    className="taxi-passenger-primary-button flex-1"
                  >
                    Guardar cambios
                  </Button>
                </div>
              </form>
            )}

            <Button
              data-testid="pas-logout-perfil"
              onClick={salir}
              variant="secondary"
              className="taxi-passenger-secondary-button"
            >
              <LogOut /> Cerrar sesión
            </Button>
          </div>
        )}
      </div>

      {/* Navegación inferior fija */}
      <nav className="taxi-passenger-bottom-nav" data-testid="pas-nav-mobile">
        {[
          ["viaje", "Inicio", Home],
          ["solicitar", "Solicitar", Navigation],
          ["historial", "Historial", History],
          ["perfil", "Perfil", User],
        ].map(([id, lbl, Icon]) => (
          <button
            key={id}
            data-testid={`pas-tab-${id}`}
            onClick={() => setView(id)}
            className={cn(
              "taxi-passenger-nav-item",
              view === id ? "taxi-passenger-nav-item-active" : ""
            )}
          >
            <Icon /> {lbl}
          </button>
        ))}
      </nav>

      {menuOpen && (
        <div className="taxi-passenger-menu-layer" data-testid="pas-menu-layer">
          <button
            type="button"
            className="taxi-passenger-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside className="taxi-passenger-menu-drawer">
            <div className="taxi-passenger-menu-heading">
              <BrandLogo />
              <button
                type="button"
                data-testid={PASSENGER.menuClose}
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
              >
                <X />
              </button>
            </div>
            <div className="taxi-passenger-menu-user">
              <span>{iniciales(auth.nombre)}</span>
              <div>
                <strong>{auth.nombre}</strong>
                <small>{auth.telefono || "Pasajero Radio Taxis Palenque"}</small>
              </div>
            </div>
            <div className="taxi-passenger-menu-links">
              {[
                ["viaje", "Inicio y seguimiento", Home],
                ["solicitar", "Solicitar un taxi", Navigation],
                ["historial", "Historial de viajes", History],
                ["perfil", "Mi perfil", User],
              ].map(([id, label, Icon]) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => {
                    setView(id);
                    setMenuOpen(false);
                  }}
                  className={view === id ? "taxi-passenger-menu-link-active" : ""}
                >
                  <Icon />
                  <span>{label}</span>
                  <ChevronRight />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="taxi-passenger-menu-logout"
              onClick={() => {
                setMenuOpen(false);
                salir();
              }}
            >
              <LogOut /> Cerrar sesión
            </button>
          </aside>
        </div>
      )}

      {chatOpen && servicio && (
        <div className="taxi-passenger-chat-layer" data-testid="pas-chat-layer">
          <section className="taxi-passenger-chat-panel">
            <header>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Cerrar chat"
              >
                <ArrowLeft />
              </button>
              <div>
                <strong>Chat directo con tu conductor</strong>
                <span>
                  {servicio.taxi?.nombre_conductor || "Conductor asignado"} ·{" "}
                  {servicio.taxi?.numero_economico || "En servicio"}
                </span>
              </div>
              <MessageCircle />
            </header>
            <div className="taxi-passenger-chat-messages">
              {chatMsgs.length === 0 && (
                <p className="taxi-passenger-chat-empty">
                  Envía un mensaje directo a tu chofer para coordinar tu punto de encuentro.
                </p>
              )}
              {chatMsgs.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "taxi-passenger-chat-bubble",
                    message.remitente === "pasajero" && "taxi-passenger-chat-bubble-self"
                  )}
                >
                  <strong className="text-[10px] opacity-75">
                    {message.remitente === "pasajero"
                      ? "Tú"
                      : servicio.taxi?.nombre_conductor || "Conductor"}
                  </strong>
                  <span>{message.texto}</span>
                  <small>{timeAgo(message.timestamp)}</small>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 pt-1">
              {QUICK_CHAT_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => enviarMensajeChat(phrase)}
                  className="taxi-passenger-poi-chip shrink-0 text-[11px]"
                >
                  {phrase}
                </button>
              ))}
            </div>
            <div className="taxi-passenger-chat-compose">
              <Input
                data-testid={PASSENGER.chatInput}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarMensajeChat()}
                placeholder="Escribe un mensaje al conductor…"
              />
              <button
                type="button"
                data-testid={PASSENGER.chatSend}
                onClick={() => enviarMensajeChat()}
                aria-label="Enviar mensaje"
              >
                <Send />
              </button>
            </div>
          </section>
        </div>
      )}

      {ratingService && (
        <div className="taxi-passenger-rating-layer" data-testid={PASSENGER.ratingSheet}>
          <section className="taxi-passenger-rating-sheet">
            <div className="taxi-passenger-sheet-handle">
              <span />
            </div>
            <div className="taxi-passenger-rating-avatar">
              {iniciales(ratingService.taxi?.nombre_conductor || "Conductor")}
            </div>
            <h2>¿Cómo estuvo tu viaje?</h2>
            <p>
              Tu calificación para{" "}
              <strong>{ratingService.taxi?.nombre_conductor || "tu conductor"}</strong> ayuda a
              mantener la calidad de Radio Taxis Palenque.
            </p>
            <div
              className="taxi-passenger-rating-stars"
              role="radiogroup"
              aria-label="Calificación del conductor"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setRatingValue(value)}
                  aria-label={`${value} estrellas`}
                  aria-pressed={ratingValue === value}
                >
                  <Star fill={ratingValue >= value ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <Input
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Deja un comentario opcional sobre el servicio…"
            />
            <Button
              data-testid={PASSENGER.ratingSubmit}
              onClick={enviarCalificacion}
              className="taxi-passenger-primary-button"
            >
              Enviar calificación
            </Button>
            <button
              type="button"
              className="taxi-passenger-rating-skip"
              onClick={() => setRatingService(null)}
            >
              Omitir por ahora
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
