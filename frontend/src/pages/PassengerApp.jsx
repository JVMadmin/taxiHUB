import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, pasApi, WS_BASE, logoutPassenger, savePassengerAuth } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn, iniciales, metodoPago } from "@/lib/utils";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { EmptyState } from "@/components/EmptyState";
import { ServicioBadge } from "@/components/StatusBadge";
import { ModeToggle } from "@/components/ModeToggle";
import { pointIcon, pillCarIcon } from "@/lib/taxiIcon";
import { useRouting } from "@/hooks/useRouting";
import { fmtDist, fmtDuration, bearing, puntoAdelanteEnRuta } from "@/lib/geo";
import { RoutePolyline } from "@/components/RoutePolyline";
import { VehicleImage } from "@/components/VehicleImage";
import { toast } from "sonner";
import { Car, MapPin, Navigation, LogOut, Clock, User, Phone, KeyRound, History, Home, Mail, Wallet, Locate, Check, Flag } from "lucide-react";
import { useMode } from "@/hooks/useMode";

const CENTER = [17.5099, -91.9847];
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function MapClick({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }) });
  return null;
}

function AuthScreen({ modo, setModo, lUser, setLUser, lPass, setLPass, rForm, setRForm, login, registrar }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-brand/10 blur-[100px]" />
      <div className="relative w-full max-w-sm">
        <form
          onSubmit={modo === "login" ? login : registrar}
          data-testid="pas-login-form"
          className="bezel-shell w-full"
        >
          <div className="rounded-[var(--radius)] bg-card/85 p-7">
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <BrandMark size="lg" />
              <BrandWordmark sub="taxiHUB Passenger" className="mt-1" />
              <p className="text-sm text-muted-foreground">{modo === "login" ? "Inicia sesión para pedir tu taxi" : "Crea tu cuenta"}</p>
            </div>
            <div className="grid gap-4">
              {modo === "registro" && (
                <>
                  <div className="grid gap-1.5"><Label className="text-foreground/90"><User className="mr-1 inline h-3 w-3" />Nombre</Label>
                    <Input data-testid="pas-reg-nombre" value={rForm.nombre} onChange={(e) => setRForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo" className="input-inset border-border text-foreground" /></div>
                  <div className="grid gap-1.5"><Label className="text-foreground/90"><Phone className="mr-1 inline h-3 w-3" />Teléfono</Label>
                    <Input data-testid="pas-reg-telefono" value={rForm.telefono} onChange={(e) => setRForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono" className="input-inset border-border text-foreground" /></div>
                </>
              )}
              <div className="grid gap-1.5"><Label className="text-foreground/90"><User className="mr-1 inline h-3 w-3" />Usuario</Label>
                <Input data-testid="pas-usuario" value={modo === "login" ? lUser : rForm.usuario}
                  onChange={(e) => modo === "login" ? setLUser(e.target.value) : setRForm((f) => ({ ...f, usuario: e.target.value }))}
                  placeholder="usuario" autoCapitalize="none" className="input-inset border-border text-foreground" /></div>
              <div className="grid gap-1.5"><Label className="text-foreground/90"><KeyRound className="mr-1 inline h-3 w-3" />Contraseña</Label>
                <Input data-testid="pas-contrasena" type="password" value={modo === "login" ? lPass : rForm.contrasena}
                  onChange={(e) => modo === "login" ? setLPass(e.target.value) : setRForm((f) => ({ ...f, contrasena: e.target.value }))}
                  placeholder="••••••" className="input-inset border-border text-foreground" /></div>
              <Button data-testid="pas-submit" type="submit" className="mt-2 w-full">
                {modo === "login" ? "Entrar" : "Crear cuenta"}
              </Button>
              <button type="button" data-testid="pas-toggle-modo" onClick={() => setModo(modo === "login" ? "registro" : "login")}
                className="text-center text-xs text-muted-foreground hover:text-foreground">
                {modo === "login" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta, iniciar sesión"}
              </button>
            </div>
            <div className="mt-4 flex justify-center gap-3 text-xs text-muted-foreground">
              <a href="/login" className="hover:text-foreground">App del operador</a>
              <span>·</span>
              <a href="/terminal/login" className="hover:text-foreground">Terminal</a>
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
  const wsRef = useRef(null);
  const mode = useMode();
  const tiles = mode === "claro" ? LIGHT_TILES : DARK_TILES;

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
          if (m.servicio?.estado === "cancelado" || m.servicio?.estado === "completado") setServicio(null);
          else { setServicio(m.servicio); setTaxiPos(null); }
        } else if (m.type === "ubicacion") {
          setTaxiPos({ lat: m.lat, lng: m.lng, ts: m.ts });
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
    <div className="min-h-screen bg-background text-foreground">
      {!mapaFullscreen ? (
        <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <div>
              <div className="text-base font-bold leading-tight">{auth.nombre}</div>
              <div className="text-xs text-muted-foreground">Pasajero</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <button data-testid="pas-logout" onClick={salir} className="th-3d flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60" title="Salir" aria-label="Salir"><LogOut className="th-icon-3d h-4 w-4" /></button>
          </div>
        </header>
      ) : (
        <div className="fixed inset-x-0 top-0 z-[500] mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2.5 rounded-full border border-border bg-card/90 py-1.5 pl-1.5 pr-3.5 shadow-lg backdrop-blur">
            <BrandMark size="sm" />
            <div className="leading-tight">
              <div className="text-xs font-bold text-foreground">{auth.nombre}</div>
              <div className="text-[10px] text-muted-foreground">Pasajero</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <button data-testid="pas-logout" onClick={salir} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-lg backdrop-blur hover:text-foreground" title="Salir" aria-label="Salir"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <div className={cn("mx-auto w-full max-w-md", mapaFullscreen ? "relative h-screen overflow-hidden" : "p-5 pb-24")}>
        {view === "viaje" && (
          !servicio ? (
            <div className="relative h-full w-full" data-testid="pas-sin-viaje">
              <div className="absolute inset-0 z-0">
                <MapContainer center={pickup || CENTER} zoom={14} zoomControl={false} className="h-full w-full">
                  <TileLayer url={tiles} attribution="&copy; OSM &copy; CARTO" subdomains="abcd" />
                  {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pointIcon("Mi ubicación", "#22c55e")} />}
                </MapContainer>
              </div>

              <button onClick={usarMiUbicacion} aria-label="Usar mi ubicación" data-testid="pas-centrar-mapa"
                className="th-3d absolute bottom-[196px] right-4 z-[10] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur">
                <Locate className="h-5 w-5" />
              </button>

              <div className="absolute inset-x-0 bottom-0 z-[10] rounded-t-3xl border-t border-border bg-background/95 pb-24 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                <div className="mx-auto mt-2.5 flex w-12 justify-center"><span className="h-1 w-12 rounded-full bg-secondary" aria-hidden="true" /></div>
                <div className="px-5 pb-1 pt-2">
                  <div className="text-lg font-extrabold text-foreground">¿A dónde vamos?</div>
                  <p className="mt-1 text-xs text-muted-foreground">Elige tu destino y buscamos un taxi disponible cerca de ti.</p>
                  <button
                    data-testid="pas-abrir-solicitar"
                    onClick={() => setView("solicitar")}
                    className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-brand/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15"><MapPin className="h-4 w-4 text-brand-bright" /></span>
                    <span className="text-sm text-muted-foreground">¿A dónde vas?</span>
                  </button>
                  <Button variant="secondary" onClick={() => { usarMiUbicacion(); setView("solicitar"); }} className="mt-2.5 w-full" data-testid="pas-inicio-mi-ubicacion">
                    <Navigation className="mr-2 h-4 w-4" /> Usar mi ubicación actual
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative h-full w-full overflow-hidden" data-testid="pas-viaje-inmersivo">
              {/* Leaflet crea sus propios panes con z-index hasta 1000 (marcadores, popups,
                  controles); sin esta envoltura position+z-0 no forman su propio stacking
                  context y esos panes pintan por encima del chip/sheet de abajo aunque
                  tengan un z-[10] mayor en apariencia. Mismo patrón que Terminal.jsx. */}
              <div className="absolute inset-0 z-0">
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
                    <Marker position={[taxiActual.lat, taxiActual.lng]} icon={pillCarIcon(null, { heading: taxiHeading, selected: true, size: "lg", color: "#10b981", testId: "pas-taxi-3d" })}>
                      <Popup>
                        <div className="text-sm">Tu taxi{servicio.taxi?.numero_economico ? ` · ${servicio.taxi.numero_economico}` : ""}<br />{timeAgo(taxiPos?.ts || servicio.taxi?.ultima_actualizacion)}</div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>

              {/* Chip de estado flotante sobre el mapa (debajo del header flotante) */}
              <div className="pointer-events-none absolute inset-x-0 top-16 z-[10] flex justify-end px-4">
                <ServicioBadge
                  estado={servicio.estado}
                  className="pointer-events-auto border-border bg-card/85 px-3.5 py-2 text-xs shadow-lg backdrop-blur"
                />
              </div>

              {/* Sheet inferior anclado al contenedor del mapa (no al viewport, para no tapar la nav) */}
              <div
                data-testid="pas-viaje-sheet"
                className="absolute inset-x-0 bottom-0 z-[10] rounded-t-3xl border-t border-border bg-background/95 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <div className="mx-auto mt-2.5 flex w-12 justify-center">
                  <span className="h-1 w-12 rounded-full bg-secondary" aria-hidden="true" />
                </div>
                <div className="px-5 pb-20 pt-2">
                  {servicio.taxi ? (
                    <div data-testid="pas-taxi-card">
                      {servicio.taxi.vehiculo && (
                        <VehicleImage
                          vehiculo={servicio.taxi.vehiculo}
                          alt={[servicio.taxi.vehiculo.marca, servicio.taxi.vehiculo.modelo].filter(Boolean).join(" ")}
                          className="mb-3 h-24 w-full rounded-xl border border-border bg-gradient-to-b from-surface-2 to-surface-3"
                          imgClassName="p-2.5"
                          data-testid="pas-taxi-imagen"
                        />
                      )}
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-bright to-brand-strong text-base font-extrabold text-brand-contrast">
                          {iniciales(servicio.taxi.nombre_conductor)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-extrabold text-foreground">{servicio.taxi.nombre_conductor}</div>
                          <div className="mono-num mt-1 inline-block rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {servicio.taxi.numero_economico}
                          </div>
                        </div>
                        {rutaDelTaxi.duration_s != null && (
                          <div className="shrink-0 text-right">
                            <div className="mono-num text-xl font-extrabold text-brand-bright">{fmtDuration(rutaDelTaxi.duration_s)}</div>
                            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Llegada</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                        <Car className="h-5 w-5 animate-pulse text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">Buscando un taxi disponible…</div>
                        <div className="text-xs text-muted-foreground">Te avisamos en cuanto se asigne uno.</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-4 border-t border-border/80 pt-3 text-xs text-muted-foreground">
                    {rutaDelTaxi.distance_m != null && (
                      <span className="inline-flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5" /> {fmtDist(rutaDelTaxi.distance_m)}</span>
                    )}
                    <span className="inline-flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> {metodoPago(servicio.metodo_pago)}</span>
                    {servicio.taxi && (taxiPos || servicio.taxi.lat != null) && (
                      <span className="ml-auto inline-flex items-center gap-1.5"><Clock className="h-3 w-3" /> {timeAgo(taxiPos?.ts || servicio.taxi?.ultima_actualizacion)}</span>
                    )}
                  </div>
                  {servicio.costo != null && <div className="mt-2 text-sm text-muted-foreground">Costo: ${servicio.costo}</div>}

                  <div className="mt-3 flex items-center gap-2.5">
                    {servicio.taxi?.telefono && (
                      <a
                        href={`tel:${servicio.taxi.telefono}`}
                        data-testid="pas-llamar"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-foreground hover:bg-secondary/70"
                        aria-label="Llamar al conductor"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                    {["pendiente", "ofrecido", "asignado", "en_curso"].includes(servicio.estado) && (
                      <Button data-testid="pas-cancelar" onClick={cancelar} variant="destructive" className="flex-1">
                        Cancelar viaje
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {view === "solicitar" && (
          <div className="relative h-full w-full" data-testid="pas-solicitar-inmersivo">
            <div className="absolute inset-0 z-0">
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
              className={cn("th-3d absolute right-4 z-[10] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur",
                pickup && dropoff ? "bottom-[336px]" : "bottom-[196px]")}>
              <Locate className="h-5 w-5" />
            </button>

            {!pickup && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-[10] flex justify-center px-4">
                <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3.5 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
                  <MapPin className="h-3.5 w-3.5" /> Toca el mapa para marcar tu origen
                </div>
              </div>
            )}
            {pickup && !dropoff && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-[10] flex justify-center px-4">
                <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3.5 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
                  <Flag className="h-3.5 w-3.5" /> Ahora toca el mapa para marcar tu destino
                </div>
              </div>
            )}

            <div
              data-testid="pas-solicitar-sheet"
              className="absolute inset-x-0 bottom-0 z-[10] max-h-[75%] overflow-y-auto rounded-t-3xl border-t border-border bg-background/95 pb-24 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            >
              <div className="mx-auto mt-2.5 flex w-12 justify-center"><span className="h-1 w-12 rounded-full bg-secondary" aria-hidden="true" /></div>
              <div className="px-5 pb-1 pt-2">
                {!pickup && (
                  <>
                    <div className="text-lg font-extrabold text-foreground">¿A dónde vamos?</div>
                    <p className="mt-1 text-xs text-muted-foreground">Marca tu origen en el mapa o usa tu ubicación actual.</p>
                    <Button variant="secondary" onClick={usarMiUbicacion} className="mt-3 w-full" data-testid="pas-mi-ubicacion">
                      <Navigation className="mr-2 h-4 w-4" /> Usar mi ubicación actual
                    </Button>
                  </>
                )}

                {pickup && !dropoff && (
                  <>
                    <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2.5 text-sm text-brand-bright" data-testid="pas-pickup-info">
                      <MapPin className="h-4 w-4 shrink-0" /> Origen marcado
                    </div>
                    <p className="mt-2.5 text-xs text-muted-foreground">Toca el mapa para marcar tu destino.</p>
                    <Button variant="ghost" size="sm" onClick={() => setPickup(null)} className="mt-1">Cambiar origen</Button>
                  </>
                )}

                {pickup && dropoff && (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm text-foreground/90">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400"><MapPin className="h-3 w-3" /></span>
                        Mi ubicación
                      </div>
                      <div className="flex items-center gap-2 text-sm text-foreground/90">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-400"><Flag className="h-3 w-3" /></span>
                        {destinoTexto || "Destino marcado"}
                      </div>
                    </div>

                    {(rutaPreview.distance_m != null || rutaPreview.duration_s != null) && (
                      <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
                        {rutaPreview.distance_m != null && (
                          <span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3" /> {fmtDist(rutaPreview.distance_m)}</span>
                        )}
                        {rutaPreview.duration_s != null && (
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> ≈{fmtDuration(rutaPreview.duration_s)}</span>
                        )}
                      </div>
                    )}

                    {tiposVehiculo.length > 0 && (
                      <div className="mt-4">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Elige tu vehículo</div>
                        <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1">
                          {tiposVehiculo.map((t) => (
                            <button
                              key={t.id}
                              data-testid={`pas-tipo-${t.id}`}
                              onClick={() => setTipoSeleccionado((cur) => (cur === t.id ? null : t.id))}
                              className={cn(
                                "relative flex w-28 shrink-0 flex-col overflow-hidden rounded-xl border text-left transition-colors",
                                tipoSeleccionado === t.id ? "border-brand bg-brand/10" : "border-border bg-card hover:border-brand/30"
                              )}
                            >
                              <VehicleImage
                                vehiculo={{ tipo_vehiculo: t, imagen_resuelta: t.imagen_url }}
                                className="h-14 w-full bg-gradient-to-b from-surface-2 to-surface-3"
                                imgClassName="p-1.5"
                              />
                              <span className="truncate px-2 py-1.5 text-[11px] font-semibold text-foreground">{t.nombre}</span>
                              {tipoSeleccionado === t.id && (
                                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-brand-contrast">
                                  <Check className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <Input value={destinoTexto} onChange={(e) => setDestinoTexto(e.target.value)} placeholder="Nombre del destino (opcional)"
                      className="input-inset mt-3 border-border text-foreground" />

                    <div className="mt-3 flex items-center gap-2">
                      <Button data-testid="pas-limpiar" variant="ghost" onClick={() => { setPickup(null); setDropoff(null); setDestinoTexto(""); setTipoSeleccionado(null); }}>
                        Limpiar
                      </Button>
                      <Button data-testid="pas-solicitar" onClick={solicitar} loading={guardando} size="lg" className="flex-1">
                        <MapPin className="h-5 w-5" /> {guardando ? "Solicitando..." : "Solicitar taxi"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {view === "historial" && (
          <div className="space-y-2" data-testid="pas-historial">
            {misServicios.length === 0 && (
              <EmptyState icon={History} title="Sin viajes aún" description="Tu historial de viajes aparecerá aquí." />
            )}
            {misServicios.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">
                    {s.origen?.texto || "—"} → {s.destino?.texto || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />{timeAgo(s.timestamp_creacion)}{s.costo != null ? ` · $${s.costo}` : ""}
                  </div>
                </div>
                <ServicioBadge estado={s.estado} />
              </div>
            ))}
          </div>
        )}

        {view === "perfil" && (
          <div className="space-y-4" data-testid="pas-perfil">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 p-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-bright to-brand-strong text-xl font-extrabold text-brand-contrast">
                {iniciales(auth.nombre)}
              </div>
              <div className="mt-1 text-lg font-bold text-foreground">{auth.nombre}</div>
              <div className="text-xs text-muted-foreground">Pasajero desde {auth.creado ? new Date(auth.creado).toLocaleDateString("es-MX", { year: "numeric", month: "long" }) : "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card/60 p-3 text-center">
                <div className="mono-num text-xl font-extrabold text-foreground">{misServicios.length}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Viajes totales</div>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-3 text-center">
                <div className="mono-num text-xl font-extrabold text-foreground">{misServicios.filter((s) => s.estado === "cancelado").length}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cancelados</div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
              <div className="flex items-center gap-2.5 text-sm">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-foreground/90">{auth.nombre}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-foreground/90">{auth.telefono || "Sin teléfono registrado"}</span>
              </div>
              {auth.correo && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-foreground/90">{auth.correo}</span>
                </div>
              )}
            </div>
            <Button data-testid="pas-logout-perfil" onClick={salir} variant="secondary" className="w-full">
              <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
            </Button>
          </div>
        )}
      </div>

      {/* Navegación inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-[500] mx-auto flex w-full max-w-md border-t border-border bg-background/95 backdrop-blur" data-testid="pas-nav-mobile">
        {[
          ["viaje", "Inicio", Home],
          ["solicitar", "Solicitar", Navigation],
          ["historial", "Historial", History],
          ["perfil", "Perfil", User],
        ].map(([id, lbl, Icon]) => (
          <button key={id} data-testid={`pas-tab-${id}`} onClick={() => setView(id)}
            className={cn("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors",
              view === id ? "text-brand-bright" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" /> {lbl}
          </button>
        ))}
      </nav>
    </div>
  );
}
