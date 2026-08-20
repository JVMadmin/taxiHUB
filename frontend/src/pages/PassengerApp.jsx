import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./PassengerApp.css";
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
import { Car, MapPin, Navigation, LogOut, Clock, User, Phone, History, Home, Mail, Wallet, Locate, Check, Flag, Menu, MessageCircle, ChevronRight, Star, X, ArrowLeft, Send } from "lucide-react";

const CENTER = [17.5099, -91.9847];
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function MapClick({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }) });
  return null;
}

function AuthScreen({ modo, setModo, lUser, setLUser, lPass, setLPass, rForm, setRForm, login, registrar }) {
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
            <div className="taxi-passenger-logo taxi-passenger-logo-centered">
              <Car aria-hidden="true" />
              <span>Taxi<span>HUB</span></span>
            </div>
            <div className="taxi-passenger-auth-heading">
              <h1>{modo === "login" ? "Bienvenido" : "Crea tu cuenta"}</h1>
              <p>{modo === "login" ? "Pide un taxi en pocos segundos." : "Viaja con TaxiHUB."}</p>
            </div>
            <div className="taxi-passenger-auth-fields">
              {modo === "registro" && (
                <>
                  <label className="taxi-passenger-field"><span>Nombre</span>
                    <Input data-testid="pas-reg-nombre" value={rForm.nombre} onChange={(e) => setRForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo" /></label>
                  <label className="taxi-passenger-field"><span>Teléfono</span>
                    <Input data-testid="pas-reg-telefono" value={rForm.telefono} onChange={(e) => setRForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono" /></label>
                </>
              )}
              <label className="taxi-passenger-field"><span>Usuario</span>
                <Input data-testid="pas-usuario" value={modo === "login" ? lUser : rForm.usuario}
                  onChange={(e) => modo === "login" ? setLUser(e.target.value) : setRForm((f) => ({ ...f, usuario: e.target.value }))}
                  placeholder="usuario" autoCapitalize="none" /></label>
              <label className="taxi-passenger-field"><span>Contraseña</span>
                <Input data-testid="pas-contrasena" type="password" value={modo === "login" ? lPass : rForm.contrasena}
                  onChange={(e) => modo === "login" ? setLPass(e.target.value) : setRForm((f) => ({ ...f, contrasena: e.target.value }))}
                  placeholder="••••••" /></label>
              <Button data-testid="pas-submit" type="submit" className="taxi-passenger-primary-button">
                {modo === "login" ? "Entrar" : "Crear cuenta"}
              </Button>
              <button type="button" data-testid="pas-toggle-modo" onClick={() => setModo(modo === "login" ? "registro" : "login")}
                className="taxi-passenger-auth-switch">
                {modo === "login" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta, iniciar sesión"}
              </button>
            </div>
            <div className="taxi-passenger-auth-links">
              <a href="/login">App del operador</a>
              <span>·</span>
              <a href="/terminal/login">Terminal</a>
            </div>
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
  const [rForm, setRForm] = useState({ nombre: "", telefono: "", usuario: "", contrasena: "" });
  const [servicio, setServicio] = useState(null);       // viaje activo
  const [taxiPos, setTaxiPos] = useState(null);          // ubicación WS del taxi
  const [misServicios, setMisServicios] = useState([]);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [destinoTexto, setDestinoTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [tiposVehiculo, setTiposVehiculo] = useState([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatText, setChatText] = useState("");
  const [ratingService, setRatingService] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const wsRef = useRef(null);
  const [passengerLight, setPassengerLight] = useState(() => localStorage.getItem("passenger_mode") !== "oscuro");
  const ignoreInitialModeEvent = useRef(true);
  const tiles = passengerLight ? LIGHT_TILES : DARK_TILES;

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

  const cargarViaje = useCallback(async () => {
    try {
      const { data } = await pasApi.get("/clientes/me/viaje-activo");
      if (data.servicio) setServicio(data.servicio);
      else setServicio(null);
    } catch (_) { /* sin token o expirado */ }
  }, []);

  const cargarHistorial = useCallback(async () => {
    try {
      const { data } = await pasApi.get("/clientes/me/servicios");
      setMisServicios(data);
    } catch (_) { /* ignore */ }
  }, []);

  // Conexión WS del pasajero (solo recibe su propio viaje / taxi)
  useEffect(() => {
    if (!auth) return;
    let closed = false;
    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/pasajero/${auth.id}?token=${encodeURIComponent(localStorage.getItem("pas_token") || "")}`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === "servicio") {
          if (m.servicio?.estado === "completado") {
            if (!m.servicio.calificacion_conductor) setRatingService(m.servicio);
            setServicio(null);
          } else if (m.servicio?.estado === "cancelado") setServicio(null);
          else { setServicio(m.servicio); setTaxiPos(null); }
        } else if (m.type === "ubicacion") {
          setTaxiPos({ lat: m.lat, lng: m.lng, ts: m.ts });
        } else if (m.type === "mensaje") {
          setChatMsgs((messages) => messages.some((item) => item.id === m.mensaje?.id) ? messages : [...messages, m.mensaje]);
        }
      };
      ws.onclose = () => { if (!closed) setTimeout(connect, 3000); };
    };
    connect();
    cargarViaje();
    cargarHistorial();
    const poll = setInterval(cargarViaje, 10000);
    return () => { closed = true; clearInterval(poll); wsRef.current?.close(); };
  }, [auth, cargarViaje, cargarHistorial]);

  // Catálogo de tipos de vehículo (lectura pública) para el paso "elige tu vehículo".
  useEffect(() => {
    pasApi.get("/tipos-vehiculo").then((r) => setTiposVehiculo(r.data.filter((t) => t.activo))).catch(() => {});
  }, []);

  const login = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/clientes/login", { usuario: lUser, contrasena: lPass });
      savePassengerAuth(data.token, data.cliente);
      setAuth(data.cliente);
      toast.success(`Hola, ${data.cliente.nombre}`);
    } catch (err) { toast.error(err.response?.data?.detail || "No se pudo iniciar sesión"); }
  };
  const registrar = async (e) => {
    e.preventDefault();
    if (!rForm.nombre || !rForm.usuario || !rForm.contrasena) { toast.error("Completa nombre, usuario y contraseña"); return; }
    try {
      const { data } = await api.post("/clientes", rForm);
      savePassengerAuth(data.token, data.cliente);
      setAuth(data.cliente);
      toast.success("Cuenta creada");
    } catch (err) { toast.error(err.response?.data?.detail || "No se pudo crear la cuenta"); }
  };
  const salir = () => { logoutPassenger(); setAuth(null); setServicio(null); };

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) { toast.error("Tu navegador no soporta geolocalización"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPickup({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }),
      () => toast.error("No se pudo obtener tu ubicación"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const solicitar = async () => {
    if (!pickup || !dropoff) { toast.error("Marca tu ubicación y tu destino en el mapa"); return; }
    setGuardando(true);
    try {
      const { data } = await pasApi.post("/servicios", {
        origen: { lat: pickup.lat, lng: pickup.lng, texto: "Mi ubicación" },
        destino: { lat: dropoff.lat, lng: dropoff.lng, texto: destinoTexto || "Destino seleccionado" },
        tipo_vehiculo_preferido_id: tipoSeleccionado || null,
      });
      setServicio(data.servicio);
      setPickup(null); setDropoff(null); setDestinoTexto(""); setTipoSeleccionado(null);
      setView("viaje");
      toast.success("Taxi solicitado, buscamos disponibilidad");
    } catch (err) { toast.error(err.response?.data?.detail || "No se pudo solicitar el taxi"); }
    finally { setGuardando(false); }
  };

  const cancelar = async () => {
    try {
      await pasApi.post(`/servicios/${servicio.id}/cancelar`, { motivo: "Cancelado por el pasajero" });
      setServicio(null); setTaxiPos(null);
      toast.success("Viaje cancelado");
    } catch (err) { toast.error(err.response?.data?.detail || "No se pudo cancelar"); }
  };

  const abrirChat = async () => {
    if (!servicio?.id) return;
    try {
      const { data } = await pasApi.get(`/servicios/${servicio.id}/mensajes`);
      setChatMsgs(data);
      setChatOpen(true);
    } catch (err) { toast.error(err.response?.data?.detail || "No se pudo abrir el chat"); }
  };

  const enviarChat = async () => {
    if (!chatText.trim() || !servicio?.id) return;
    const texto = chatText.trim();
    setChatText("");
    try {
      const { data } = await pasApi.post(`/servicios/${servicio.id}/mensajes`, { texto });
      setChatMsgs((messages) => messages.some((item) => item.id === data.id) ? messages : [...messages, data]);
    } catch (err) {
      setChatText(texto);
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
      toast.success("Gracias por calificar a tu conductor");
    } catch (err) { toast.error(err.response?.data?.detail || "No se pudo guardar la calificación"); }
  };

  // Posición en vivo del taxi (WS) o instantánea del servicio.
  const taxiActual = useMemo(
    () => (taxiPos && { lat: taxiPos.lat, lng: taxiPos.lng })
      || (servicio?.taxi?.lat != null ? { lat: servicio.taxi.lat, lng: servicio.taxi.lng } : null),
    [taxiPos, servicio]
  );

  // Ruta real (OSRM) del viaje completo y del tramo en vivo taxi → destino.
  const rutaViaje = useRouting(
    servicio?.origen?.lat != null ? servicio.origen : null,
    servicio?.destino?.lat != null ? servicio.destino : null,
    { enabled: !!servicio && view === "viaje", client: pasApi }
  );
  const rutaDelTaxi = useRouting(
    taxiActual,
    servicio?.destino?.lat != null ? servicio.destino : null,
    { enabled: !!taxiActual && !!servicio && view === "viaje", client: pasApi }
  );

  // Rumbo del coche: hacia el siguiente tramo de la ruta a destino.
  const taxiHeading = useMemo(() => {
    if (!taxiActual) return 0;
    const o = { lat: taxiActual.lat, lng: taxiActual.lng };
    if (rutaDelTaxi.latlngs?.length > 1) {
      const ahead = puntoAdelanteEnRuta(o, rutaDelTaxi.latlngs, 120);
      if (ahead) return ahead.brg;
    }
    if (servicio?.destino?.lat != null) {
      return bearing(o.lat, o.lng, servicio.destino.lat, servicio.destino.lng);
    }
    return 0;
  }, [taxiActual, rutaDelTaxi.latlngs, servicio]);

  // Vista previa de ruta en "Solicitar taxi" (ambos puntos marcados).
  const rutaPreview = useRouting(pickup, dropoff, { enabled: !!pickup && !!dropoff, client: pasApi });

  if (!auth) {
    return (
      <AuthScreen
        modo={modo} setModo={setModo}
        lUser={lUser} setLUser={setLUser} lPass={lPass} setLPass={setLPass}
        rForm={rForm} setRForm={setRForm}
        login={login} registrar={registrar}
      />
    );
  }

  const mapCenter = pickup || (taxiPos && { lat: taxiPos.lat, lng: taxiPos.lng }) || CENTER;
  // El mapa domina la pantalla en Inicio (sin viaje) y Solicitar — el header y la
  // altura de contenido cambian de "documento con padding" a "capa sobre el mapa".
  const mapaFullscreen = view === "viaje" || view === "solicitar";

  return (
    <div className={cn("taxi-passenger-shell", passengerLight ? "taxi-passenger-light" : "taxi-passenger-dark")}>
      {!mapaFullscreen ? (
        <header className="taxi-passenger-page-header">
          <button type="button" data-testid={PASSENGER.menuOpen} className="taxi-passenger-menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button>
          <div className="taxi-passenger-logo">
            <Car aria-hidden="true" />
            <span>Taxi<span>HUB</span></span>
          </div>
          <div className="taxi-passenger-header-actions">
            <ModeToggle />
            <button data-testid="pas-logout" onClick={salir} className="taxi-passenger-icon-button" title="Salir" aria-label="Salir"><LogOut /></button>
          </div>
        </header>
      ) : (
        <div className="taxi-passenger-floating-header">
          <button type="button" data-testid={PASSENGER.menuOpen} className="taxi-passenger-menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button>
          <div className="taxi-passenger-logo taxi-passenger-logo-floating">
            <Car aria-hidden="true" />
            <span>Taxi<span>HUB</span></span>
          </div>
          <div className="taxi-passenger-header-actions">
            <ModeToggle />
            <button data-testid="pas-logout" onClick={salir} className="taxi-passenger-icon-button" title="Salir" aria-label="Salir"><LogOut /></button>
          </div>
        </div>
      )}

      <div className={cn("taxi-passenger-content", mapaFullscreen ? "taxi-passenger-map-view" : "taxi-passenger-document-view", (view === "solicitar" || !!servicio) && "taxi-passenger-immersive-view")}>
        {view === "viaje" && (
          !servicio ? (
            <div className="taxi-passenger-empty-trip" data-testid="pas-sin-viaje">
              <div className="taxi-passenger-map-layer">
                <MapContainer center={pickup || CENTER} zoom={14} zoomControl={false} className="h-full w-full">
                  <TileLayer url={tiles} attribution="&copy; OSM &copy; CARTO" subdomains="abcd" />
                  {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pointIcon("Mi ubicación", "#22c55e")} />}
                </MapContainer>
              </div>

              <button onClick={usarMiUbicacion} aria-label="Usar mi ubicación" data-testid="pas-centrar-mapa"
                className="taxi-passenger-locate-button">
                <Locate />
              </button>

              <div className="taxi-passenger-home-sheet">
                <div className="taxi-passenger-sheet-handle"><span aria-hidden="true" /></div>
                <div className="taxi-passenger-sheet-inner">
                  <div className="taxi-passenger-section-heading">¿A dónde vamos?</div>
                  <p className="taxi-passenger-section-copy">Elige tu destino y buscamos un taxi disponible cerca de ti.</p>
                  <button
                    data-testid="pas-abrir-solicitar"
                    onClick={() => setView("solicitar")}
                    className="taxi-passenger-destination-field"
                  >
                    <span><MapPin /></span>
                    <span>¿A dónde vas?</span>
                    <ChevronRight />
                  </button>
                  <Button variant="secondary" onClick={() => { usarMiUbicacion(); setView("solicitar"); }} className="taxi-passenger-location-button" data-testid="pas-inicio-mi-ubicacion">
                    <Navigation /> Usar mi ubicación actual
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="taxi-passenger-active-trip" data-testid="pas-viaje-inmersivo">
              {/* Leaflet crea sus propios panes con z-index hasta 1000 (marcadores, popups,
                  controles); sin esta envoltura position+z-0 no forman su propio stacking
                  context y esos panes pintan por encima del chip/sheet de abajo aunque
                  tengan un z-[10] mayor en apariencia. Mismo patrón que Terminal.jsx. */}
              <div className="taxi-passenger-map-layer">
                <MapContainer center={mapCenter} zoom={14} zoomControl={false} className="h-full w-full">
                  <TileLayer url={tiles} attribution="&copy; OSM &copy; CARTO" subdomains="abcd" />
                  {/* Ruta plan del viaje (origen → destino) */}
                  {rutaViaje.latlngs?.length > 1 && (
                    <Polyline positions={rutaViaje.latlngs} pathOptions={{ color: "#94a3b8", weight: 3, opacity: 0.6, dashArray: "6 10" }} />
                  )}
                  {/* Tramo en vivo taxi → destino (resaltado, fluye hacia donde va) */}
                  {rutaDelTaxi.latlngs?.length > 1 && (
                    <>
                      <Polyline positions={rutaDelTaxi.latlngs} pathOptions={{ color: "#0b0b0d", weight: 9, opacity: 0.55, lineCap: "round" }} />
                      <RoutePolyline
                        positions={rutaDelTaxi.latlngs}
                        className="th-route-flow"
                        pathOptions={{ color: "#10b981", weight: 4.5, opacity: 0.95, dashArray: "1 12", lineCap: "round" }}
                      />
                    </>
                  )}
                  {servicio.origen?.lat != null && <Marker position={[servicio.origen.lat, servicio.origen.lng]} icon={pointIcon("Origen", "#22c55e")} />}
                  {servicio.destino?.lat != null && <Marker position={[servicio.destino.lat, servicio.destino.lng]} icon={pointIcon("Destino", "#ef4444")} />}
                  {(taxiPos || servicio.taxi) && taxiActual && (
                    <Marker position={[taxiActual.lat, taxiActual.lng]} icon={taxiRoleAssetIcon({ heading: taxiHeading, size: "md" })}>
                      <Popup>
                        <div className="text-sm">Tu taxi{servicio.taxi?.numero_economico ? ` · ${servicio.taxi.numero_economico}` : ""}<br />{timeAgo(taxiPos?.ts || servicio.taxi?.ultima_actualizacion)}</div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>

              <section className="taxi-passenger-trip-summary" aria-label="Resumen del viaje">
                <h1>{servicio.taxi ? "Tu viaje está en camino" : "Buscando tu taxi"}</h1>
                <div className="taxi-passenger-route-summary">
                  <div className="taxi-passenger-route-rail" aria-hidden="true"><span className="taxi-passenger-route-dot taxi-passenger-route-dot-origin" /><span /><span className="taxi-passenger-route-dot taxi-passenger-route-dot-destination" /></div>
                  <div className="taxi-passenger-route-copy">
                    <div><small>Origen</small><strong>{servicio.origen?.texto || "Mi ubicación"}</strong></div>
                    <div><small>Destino</small><strong>{servicio.destino?.texto || "Destino seleccionado"}</strong></div>
                  </div>
                </div>
                <div className="taxi-passenger-eta">
                  <strong>{rutaDelTaxi.duration_s != null ? fmtDuration(rutaDelTaxi.duration_s) : servicio.taxi ? "—" : "..."}</strong>
                  <span>{rutaDelTaxi.distance_m != null ? `Llegada estimada · ${fmtDist(rutaDelTaxi.distance_m)}` : "Estamos buscando disponibilidad cerca de ti"}</span>
                </div>
              </section>

              {/* Chip de estado flotante sobre el mapa (debajo del header flotante) */}
              <div className="taxi-passenger-status-chip">
                <ServicioBadge
                  estado={servicio.estado}
                  className="pointer-events-auto"
                />
              </div>

              {/* Sheet inferior anclado al contenedor del mapa (no al viewport, para no tapar la nav) */}
              <div
                data-testid="pas-viaje-sheet"
                className="taxi-passenger-driver-sheet"
              >
                <div className="taxi-passenger-sheet-handle">
                  <span aria-hidden="true" />
                </div>
                <div className="taxi-passenger-sheet-inner">
                  {servicio.taxi ? (
<div data-testid="pas-taxi-card">
                        <div className="taxi-passenger-driver-row">
                          <div className="taxi-passenger-driver-avatar">
                            {servicio.taxi.foto_url ? <img src={`${BACKEND_URL}${servicio.taxi.foto_url}`} alt="" /> : iniciales(servicio.taxi.nombre_conductor)}
                          </div>
                          <div className="taxi-passenger-driver-copy">
                            <strong>{servicio.taxi.nombre_conductor}</strong>
                            <span>{[servicio.taxi.vehiculo?.marca, servicio.taxi.vehiculo?.modelo].filter(Boolean).join(" ") || "Taxi registrado"} · {servicio.taxi.numero_economico || "—"}</span>
                            <span className="taxi-passenger-plate">{servicio.taxi.placa || "Disponible"}</span>
                          </div>
                          <div className="taxi-passenger-rating"><Star fill="currentColor" /> <b>{servicio.taxi.calificacion_promedio ?? "Nuevo"}</b></div>
                        </div>
                        {servicio.taxi.vehiculo && (
                          <div className="taxi-passenger-vehicle-thumb" data-testid="pas-vehiculo-img">
                            <VehicleImage
                              vehiculo={servicio.taxi.vehiculo}
                              alt="Vehículo del servicio"
                              className="taxi-passenger-vehicle-thumb-img"
                              imgClassName="p-0.5"
                            />
                            <span>{servicio.taxi.vehiculo.tipo_vehiculo?.nombre || "Vehículo"}</span>
                          </div>
                        )}
                      </div>
                  ) : (
                    <div className="taxi-passenger-searching">
                      <div className="taxi-passenger-searching-icon"><Car /></div>
                      <div>
                        <strong>Buscando un taxi disponible…</strong>
                        <span>Te avisamos en cuanto se asigne uno.</span>
                      </div>
                    </div>
                  )}

                  <div className="taxi-passenger-trip-meta">
                    {rutaDelTaxi.distance_m != null && (
                      <span><Navigation /> {fmtDist(rutaDelTaxi.distance_m)}</span>
                    )}
                    <span><Wallet /> {metodoPago(servicio.metodo_pago)}</span>
                    {servicio.taxi && (taxiPos || servicio.taxi.lat != null) && (
                      <span><Clock /> {timeAgo(taxiPos?.ts || servicio.taxi?.ultima_actualizacion)}</span>
                    )}
                  </div>
                  {servicio.costo != null && <div className="taxi-passenger-cost">Costo estimado <strong>${servicio.costo}</strong></div>}

                  <div className="taxi-passenger-trip-actions">
                    {servicio.taxi?.telefono && (
                      <a
                        href={`tel:${servicio.taxi.telefono}`}
                        data-testid="pas-llamar"
                        className="taxi-passenger-action taxi-passenger-action-call"
                        aria-label="Llamar al conductor"
                      ><Phone /><span>Llamar</span></a>
                    )}
                    {servicio.taxi && <button type="button" data-testid={PASSENGER.chatOpen} onClick={abrirChat} className="taxi-passenger-action taxi-passenger-action-chat" aria-label="Abrir chat"><MessageCircle /><span>Chat</span></button>}
                    {["pendiente", "ofrecido", "asignado", "en_curso"].includes(servicio.estado) && (
                      <button data-testid="pas-cancelar" onClick={cancelar} className="taxi-passenger-action taxi-passenger-action-cancel"><X /><span>Cancelar</span></button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {view === "solicitar" && (
          <div className="taxi-passenger-request-view" data-testid="pas-solicitar-inmersivo">
            <div className="taxi-passenger-map-layer">
              <MapContainer center={pickup || CENTER} zoom={14} zoomControl={false} className="h-full w-full">
                <TileLayer url={tiles} attribution="&copy; OSM &copy; CARTO" subdomains="abcd" />
                <MapClick onPick={(c) => !pickup ? setPickup(c) : setDropoff(c)} />
                {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pointIcon("Origen", "#22c55e")} />}
                {dropoff && <Marker position={[dropoff.lat, dropoff.lng]} icon={pointIcon("Destino", "#ef4444")} />}
                {rutaPreview.latlngs?.length > 1 && (
                  <Polyline positions={rutaPreview.latlngs} pathOptions={{ color: "#22c55e", weight: 4, opacity: 0.85, dashArray: "1 12", lineCap: "round" }} />
                )}
              </MapContainer>
            </div>

            <button onClick={usarMiUbicacion} aria-label="Usar mi ubicación" data-testid="pas-centrar-mapa"
              className="taxi-passenger-locate-button taxi-passenger-request-locate">
              <Locate />
            </button>

            {!pickup && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-[10] flex justify-center px-4">
                <div className="taxi-passenger-map-hint">
                  <MapPin /> Toca el mapa para marcar tu origen
                </div>
              </div>
            )}
            {pickup && !dropoff && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-[10] flex justify-center px-4">
                <div className="taxi-passenger-map-hint">
                  <Flag /> Ahora toca el mapa para marcar tu destino
                </div>
              </div>
            )}

            <div
              data-testid="pas-solicitar-sheet"
              className="taxi-passenger-request-sheet"
            >
              <div className="taxi-passenger-sheet-handle"><span aria-hidden="true" /></div>
              <div className="taxi-passenger-sheet-inner">
                {!pickup && (
                  <>
                    <div className="taxi-passenger-section-heading">¿A dónde vamos?</div>
                    <p className="taxi-passenger-section-copy">Marca tu origen en el mapa o usa tu ubicación actual.</p>
                    <Button variant="secondary" onClick={usarMiUbicacion} className="taxi-passenger-location-button" data-testid="pas-mi-ubicacion">
                      <Navigation /> Usar mi ubicación actual
                    </Button>
                  </>
                )}

                {pickup && !dropoff && (
                  <>
                    <div className="taxi-passenger-marked-point" data-testid="pas-pickup-info">
                      <MapPin /> Origen marcado
                    </div>
                    <p className="taxi-passenger-section-copy">Toca el mapa para marcar tu destino.</p>
                    <Button variant="ghost" size="sm" onClick={() => setPickup(null)} className="mt-1">Cambiar origen</Button>
                  </>
                )}

                {pickup && dropoff && (
                  <>
                      <div className="taxi-passenger-request-points">
                      <div>
                        <span><MapPin /></span>
                        Mi ubicación
                      </div>
                      <div>
                        <span><Flag /></span>
                        {destinoTexto || "Destino marcado"}
                      </div>
                    </div>

                    {(rutaPreview.distance_m != null || rutaPreview.duration_s != null) && (
                      <div className="taxi-passenger-preview-meta">
                        {rutaPreview.distance_m != null && (
                          <span><Navigation /> {fmtDist(rutaPreview.distance_m)}</span>
                        )}
                        {rutaPreview.duration_s != null && (
                          <span><Clock /> ≈{fmtDuration(rutaPreview.duration_s)}</span>
                        )}
                      </div>
                    )}

                    {tiposVehiculo.length > 0 && (
                      <div className="mt-4">
                        <div className="taxi-passenger-subheading">Elige tu vehículo</div>
                        <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1">
                          {tiposVehiculo.map((t) => (
                            <button
                              key={t.id}
                              data-testid={`pas-tipo-${t.id}`}
                              onClick={() => setTipoSeleccionado((cur) => (cur === t.id ? null : t.id))}
                              className={cn(
                                 "taxi-passenger-vehicle-option",
                                 tipoSeleccionado === t.id ? "taxi-passenger-vehicle-option-selected" : ""
                              )}
                            >
                              <VehicleImage
                                vehiculo={{ tipo_vehiculo: t, imagen_resuelta: t.imagen_url }}
                                 className="taxi-passenger-vehicle-image"
                                imgClassName="p-1.5"
                              />
                               <span>{t.nombre}</span>
                              {tipoSeleccionado === t.id && (
                                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-brand-contrast">
                                   <Check />
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <Input value={destinoTexto} onChange={(e) => setDestinoTexto(e.target.value)} placeholder="Nombre del destino (opcional)"
                      className="taxi-passenger-destination-input" />

                    <div className="taxi-passenger-request-actions">
                      <Button data-testid="pas-limpiar" variant="ghost" onClick={() => { setPickup(null); setDropoff(null); setDestinoTexto(""); setTipoSeleccionado(null); }}>
                        Limpiar
                      </Button>
                      <Button data-testid="pas-solicitar" onClick={solicitar} loading={guardando} size="lg" className="taxi-passenger-primary-button">
                        <MapPin /> {guardando ? "Solicitando..." : "Solicitar taxi"}
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
            {misServicios.length === 0 && (
              <EmptyState icon={History} title="Sin viajes aún" description="Tu historial de viajes aparecerá aquí." />
            )}
            {misServicios.map((s) => (
              <div key={s.id} className="taxi-passenger-history-item">
                <div>
                  <div className="taxi-passenger-history-route">
                    {s.origen?.texto || "—"} → {s.destino?.texto || "—"}
                  </div>
                  <div className="taxi-passenger-history-meta">
                    <Clock />{timeAgo(s.timestamp_creacion)}{s.costo != null ? ` · $${s.costo}` : ""}
                  </div>
                </div>
                <ServicioBadge estado={s.estado} />
              </div>
            ))}
          </div>
        )}

        {view === "perfil" && (
          <div className="taxi-passenger-profile" data-testid="pas-perfil">
            <div className="taxi-passenger-profile-card">
              <div className="taxi-passenger-profile-avatar">
                {iniciales(auth.nombre)}
              </div>
              <div className="taxi-passenger-profile-name">{auth.nombre}</div>
              <div className="taxi-passenger-profile-date">Pasajero desde {auth.creado ? new Date(auth.creado).toLocaleDateString("es-MX", { year: "numeric", month: "long" }) : "—"}</div>
            </div>
            <div className="taxi-passenger-profile-stats">
              <div>
                <strong>{misServicios.length}</strong>
                <span>Viajes totales</span>
              </div>
              <div>
                <strong>{misServicios.filter((s) => s.estado === "cancelado").length}</strong>
                <span>Cancelados</span>
              </div>
            </div>
            <div className="taxi-passenger-profile-details">
              <div>
                <User />
                <span>{auth.nombre}</span>
              </div>
              <div>
                <Phone />
                <span>{auth.telefono || "Sin teléfono registrado"}</span>
              </div>
              {auth.correo && (
                <div>
                  <Mail />
                  <span>{auth.correo}</span>
                </div>
              )}
            </div>
            <Button data-testid="pas-logout-perfil" onClick={salir} variant="secondary" className="taxi-passenger-secondary-button">
              <LogOut /> Cerrar sesión
            </Button>
          </div>
        )}
      </div>

      {/* Navegación inferior */}
      <nav className="taxi-passenger-bottom-nav" data-testid="pas-nav-mobile">
        {[
          ["viaje", "Inicio", Home],
          ["solicitar", "Solicitar", Navigation],
          ["historial", "Historial", History],
          ["perfil", "Perfil", User],
        ].map(([id, lbl, Icon]) => (
          <button key={id} data-testid={`pas-tab-${id}`} onClick={() => setView(id)}
             className={cn("taxi-passenger-nav-item", view === id ? "taxi-passenger-nav-item-active" : "")}>
             <Icon /> {lbl}
          </button>
        ))}
      </nav>

      {menuOpen && (
        <div className="taxi-passenger-menu-layer" data-testid="pas-menu-layer">
          <button type="button" className="taxi-passenger-menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />
          <aside className="taxi-passenger-menu-drawer">
            <div className="taxi-passenger-menu-heading">
              <div className="taxi-passenger-logo"><Car aria-hidden="true" /><span>Taxi<span>HUB</span></span></div>
              <button type="button" data-testid={PASSENGER.menuClose} onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button>
            </div>
            <div className="taxi-passenger-menu-user"><span>{iniciales(auth.nombre)}</span><div><strong>{auth.nombre}</strong><small>Pasajero</small></div></div>
            <div className="taxi-passenger-menu-links">
              {[["viaje", "Inicio", Home], ["solicitar", "Solicitar taxi", Navigation], ["historial", "Historial de viajes", History], ["perfil", "Mi perfil", User]].map(([id, label, Icon]) => (
                <button type="button" key={id} onClick={() => { setView(id); setMenuOpen(false); }} className={view === id ? "taxi-passenger-menu-link-active" : ""}><Icon /><span>{label}</span><ChevronRight /></button>
              ))}
            </div>
            <button type="button" className="taxi-passenger-menu-logout" onClick={() => { setMenuOpen(false); salir(); }}><LogOut /> Cerrar sesión</button>
          </aside>
        </div>
      )}

      {chatOpen && servicio && (
        <div className="taxi-passenger-chat-layer" data-testid="pas-chat-layer">
          <section className="taxi-passenger-chat-panel">
            <header><button type="button" onClick={() => setChatOpen(false)} aria-label="Cerrar chat"><ArrowLeft /></button><div><strong>Chat del viaje</strong><span>{servicio.taxi?.nombre_conductor || "Tu conductor"}</span></div><MessageCircle /></header>
            <div className="taxi-passenger-chat-messages">
              {chatMsgs.length === 0 && <p className="taxi-passenger-chat-empty">Escribe al conductor para coordinar tu recogida.</p>}
              {chatMsgs.map((message) => <div key={message.id} className={cn("taxi-passenger-chat-bubble", message.remitente === "pasajero" && "taxi-passenger-chat-bubble-self")}><span>{message.texto}</span><small>{timeAgo(message.timestamp)}</small></div>)}
            </div>
            <div className="taxi-passenger-chat-compose"><Input data-testid={PASSENGER.chatInput} value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviarChat()} placeholder="Escribe un mensaje..." /><button type="button" data-testid={PASSENGER.chatSend} onClick={enviarChat} aria-label="Enviar mensaje"><Send /></button></div>
          </section>
        </div>
      )}

      {ratingService && (
        <div className="taxi-passenger-rating-layer" data-testid={PASSENGER.ratingSheet}>
          <section className="taxi-passenger-rating-sheet">
            <div className="taxi-passenger-sheet-handle"><span /></div>
            <div className="taxi-passenger-rating-avatar">{iniciales(ratingService.taxi?.nombre_conductor || "Conductor")}</div>
            <h2>¿Cómo fue tu viaje?</h2>
            <p>Califica a {ratingService.taxi?.nombre_conductor || "tu conductor"}.</p>
            <div className="taxi-passenger-rating-stars" role="radiogroup" aria-label="Calificación del conductor">
              {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setRatingValue(value)} aria-label={`${value} estrellas`} aria-pressed={ratingValue === value}><Star fill={ratingValue >= value ? "currentColor" : "none"} /></button>)}
            </div>
            <Input value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} placeholder="Cuéntanos algo sobre el viaje (opcional)" />
            <Button data-testid={PASSENGER.ratingSubmit} onClick={enviarCalificacion} className="taxi-passenger-primary-button">Enviar calificación</Button>
            <button type="button" className="taxi-passenger-rating-skip" onClick={() => setRatingService(null)}>Ahora no</button>
          </section>
        </div>
      )}
    </div>
  );
}
