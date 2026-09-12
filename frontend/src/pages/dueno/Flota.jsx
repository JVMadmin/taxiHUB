import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { duenoApi } from "@/lib/api";
import { cn, resolveVehicleImage } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { SmoothTaxiMarker } from "@/components/maps/SmoothTaxiMarker";
import { precargarTilesPalenque } from "@/lib/PalenqueTileCache";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Input } from "@/components/ui/input";
import {
  Car,
  Search,
  User,
  Layers,
  Satellite,
  Crosshair,
  Route as RouteIcon,
  X,
} from "lucide-react";

const CENTER = [17.5099, -91.9847]; // Palenque, Chiapas
const STREET_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_REF = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

function FollowController({ target, follow }) {
  const map = useMap();
  const prevKey = useRef("");
  useEffect(() => {
    if (!follow || !target || target.lat == null || target.lng == null) return;
    const key = `${target.lat.toFixed(5)},${target.lng.toFixed(5)}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [follow, target, map]);
  return null;
}

function SizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function vehiculoToOperador(v) {
  if (!v) return null;
  return {
    id: v.conductor?.id || v.id,
    vehiculo_id: v.id,
    nombre: v.conductor?.nombre || `Unidad ${v.numero_economico}`,
    placa: v.placa || v.numero_economico,
    estado: v.conductor?.estado || v.estado || "fuera_de_servicio",
    lat: v.lat,
    lng: v.lng,
    gps_heading: v.gps_heading || 0,
    gps_speed: v.gps_speed || 0,
    foto_url: v.conductor?.foto_url || v.foto_url,
    ultima_actualizacion: v.conductor?.ultima_actualizacion || v.ultima_actualizacion,
    vehiculo: {
      marca: v.marca,
      modelo: v.modelo,
      color: v.color,
      numero_economico: v.numero_economico,
      foto_url: v.foto_url,
      tipo_vehiculo: v.tipo_vehiculo,
    },
    servicios_realizados: v.servicios_realizados || 0,
    servicios_hoy: v.servicios_hoy || 0,
    servicio_activo: v.servicio_activo,
    track: v.track,
  };
}

const ESTADO_BADGE = {
  libre: { bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400", label: "Libre" },
  en_servicio: { bg: "bg-amber-500/20 text-amber-300 border-amber-500/30", dot: "bg-amber-400", label: "En servicio" },
  ocupado: { bg: "bg-rose-500/20 text-rose-300 border-rose-500/30", dot: "bg-rose-400", label: "Ocupado" },
  fuera_de_servicio: { bg: "bg-slate-500/20 text-slate-300 border-slate-500/30", dot: "bg-slate-400", label: "Desconectado" },
};

export function Flota({ liveSignal }) {
  const [vehiculos, setVehiculos] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [follow, setFollow] = useState(true);
  const [mapLayer, setMapLayer] = useState("calles");

  const load = useCallback(() => {
    setError(null);
    duenoApi
      .get("/dueno/flota")
      .then((r) => setVehiculos(r.data))
      .catch(() => setError("No se pudo cargar la flota"));
  }, []);

  useEffect(() => {
    load();
    precargarTilesPalenque();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (liveSignal) load();
  }, [liveSignal, load]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q || !vehiculos) return vehiculos || [];
    return vehiculos.filter(
      (v) =>
        v.numero_economico?.toLowerCase().includes(q) ||
        v.placa?.toLowerCase().includes(q) ||
        v.conductor?.nombre?.toLowerCase().includes(q) ||
        v.modelo?.toLowerCase().includes(q)
    );
  }, [vehiculos, busqueda]);

  // Seleccionar automáticamente el primer vehículo con GPS o el primero de la lista
  useEffect(() => {
    if (vehiculos && vehiculos.length > 0 && !selectedId) {
      const conGps = vehiculos.find((v) => v.lat != null && v.lng != null);
      setSelectedId(conGps ? conGps.id : vehiculos[0].id);
    }
  }, [vehiculos, selectedId]);

  const selectedVehiculo = useMemo(
    () => (vehiculos || []).find((v) => v.id === selectedId),
    [vehiculos, selectedId]
  );

  const selectedOp = useMemo(
    () => vehiculoToOperador(selectedVehiculo),
    [selectedVehiculo]
  );

  const center = useMemo(() => {
    if (selectedVehiculo?.lat != null && selectedVehiculo?.lng != null) {
      return [selectedVehiculo.lat, selectedVehiculo.lng];
    }
    const conGps = (vehiculos || []).find((v) => v.lat != null && v.lng != null);
    return conGps ? [conGps.lat, conGps.lng] : CENTER;
  }, [selectedVehiculo, vehiculos]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!vehiculos) return <LoadingState rows={4} className="p-6" />;

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-8rem)] min-h-[620px]" data-testid="dueno-flota">
      {/* 1. SECCIÓN SUPERIOR: Carrusel de Vehículos de la Flota (Mismo Tamaño) */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-[#17191E]/90 p-3 shadow-xl backdrop-blur-md shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-brand-bright" />
            <h1 className="text-base font-extrabold text-foreground">Tu flota en operación</h1>
            <span className="rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-bold text-brand-bright">
              {vehiculos.length} {vehiculos.length === 1 ? "unidad" : "unidades"}
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar unidad, placa o chofer…"
              className="input-inset h-8 border-border pl-8 text-xs bg-[#13151A] text-foreground"
            />
          </div>
        </div>

        {/* Carrusel horizontal */}
        {visibles.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No se encontraron vehículos que coincidan con la búsqueda.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 pt-0.5 custom-scrollbar">
            {visibles.map((v) => {
              const isSelected = selectedId === v.id;
              const estadoKey = v.conductor?.estado || v.estado || "fuera_de_servicio";
              const badge = ESTADO_BADGE[estadoKey] || ESTADO_BADGE.fuera_de_servicio;
              const tieneGps = v.lat != null && v.lng != null;

              return (
                <div
                  key={v.id}
                  onClick={() => {
                    setSelectedId(v.id);
                    setFollow(true);
                  }}
                  className={cn(
                    "group relative flex min-w-[210px] max-w-[230px] shrink-0 cursor-pointer flex-col justify-between rounded-xl border p-2.5 transition-all duration-200 select-none",
                    isSelected
                      ? "border-brand bg-brand/10 shadow-lg shadow-brand/15 ring-1 ring-brand"
                      : "border-white/[0.08] bg-[#13151A]/80 hover:border-white/20 hover:bg-[#1C1F26]"
                  )}
                >
                  {/* Unidad y Estado */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-black text-amber-400">
                        #{v.numero_economico || v.placa}
                      </span>
                      {tieneGps && (
                        <span className="flex h-2 w-2 relative" title="GPS en vivo">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                        badge.bg
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", badge.dot)} />
                      {badge.label}
                    </span>
                  </div>

                  {/* Imagen del vehículo con altura uniforme */}
                  <div className="my-1 flex h-16 w-full items-center justify-center rounded-lg bg-black/30 p-1 border border-white/[0.04]">
                    <img
                      src={resolveVehicleImage(v)}
                      alt={v.modelo || "Vehículo"}
                      className="h-full w-full object-contain transition-transform group-hover:scale-105 duration-200"
                    />
                  </div>

                  {/* Datos del modelo, chofer y servicios de hoy */}
                  <div className="mt-1 space-y-1">
                    <div className="truncate text-xs font-bold text-foreground">
                      {v.marca || ""} {v.modelo || "Taxi"}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                      <User className="h-3 w-3 shrink-0 text-brand-bright" />
                      <span className="truncate font-medium text-slate-200">
                        {v.conductor?.nombre || "Sin chofer"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/[0.06] font-mono">
                      <span className="text-emerald-400 font-bold">
                        ⚡ {v.servicios_hoy ?? 0} hoy
                      </span>
                      <span className="text-muted-foreground">
                        {v.servicios_realizados ?? 0} tot.
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. SECCIÓN PRINCIPAL: El Mapa ocupa todo el resto del espacio */}
      <div className="relative flex-1 min-h-[440px] w-full overflow-hidden rounded-2xl border border-border/80 bg-[#13151A] shadow-2xl">
        {/* Controles flotantes superiores */}
        <div className="absolute left-3 top-3 z-[450] flex flex-wrap items-center gap-2">
          {/* Toggle Satelital / Calles OSM */}
          <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-surface/90 p-1 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMapLayer("calles")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                mapLayer === "calles" ? "bg-brand/20 text-brand-bright font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="h-3.5 w-3.5" /> Calles (OSM)
            </button>
            <button
              type="button"
              onClick={() => setMapLayer("satelite")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                mapLayer === "satelite" ? "bg-brand/20 text-brand-bright font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Satellite className="h-3.5 w-3.5" /> Satélite
            </button>
          </div>

          {/* Botón de Seguimiento Activo con Cámara */}
          {selectedVehiculo?.lat != null && (
            <button
              type="button"
              onClick={() => setFollow((f) => !f)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs shadow-2xl transition-all select-none backdrop-blur-md",
                follow
                  ? "border-emerald-400/80 bg-[#13151A] text-white font-black ring-1 ring-emerald-500/50 shadow-emerald-950/50"
                  : "border-white/15 bg-[#17191E]/95 text-slate-200 hover:text-white hover:border-white/30 font-bold"
              )}
            >
              <Crosshair className={cn("h-4 w-4 shrink-0", follow ? "text-emerald-400 animate-spin" : "text-slate-400")} />
              <span className={cn("tracking-tight font-extrabold", follow ? "text-white" : "text-slate-200")}>
                {follow ? "Seguimiento activo (Cámara fija)" : "Activar seguimiento"}
              </span>
              {follow && (
                <span className="flex h-2 w-2 relative ml-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                </span>
              )}
            </button>
          )}
        </div>

        {/* Mapa Leaflet interactivo */}
        <MapContainer
          center={center}
          zoom={14}
          zoomControl={false}
          className="h-full w-full"
        >
          {mapLayer === "satelite" ? (
            <>
              <TileLayer url={SATELLITE_TILES} attribution="Tiles &copy; Esri" maxNativeZoom={18} keepBuffer={6} />
              <TileLayer url={SATELLITE_REF} maxNativeZoom={18} keepBuffer={6} />
            </>
          ) : (
            <TileLayer
              url={STREET_TILES}
              attribution="&copy; OpenStreetMap"
              maxZoom={20}
              maxNativeZoom={19}
              keepBuffer={6}
            />
          )}

          <ZoomControl position="bottomright" />
          <SizeInvalidator />
          <FollowController target={selectedOp} follow={follow} />

          {/* Trayecto reciente del vehículo seleccionado */}
          {selectedVehiculo?.track && selectedVehiculo.track.length > 1 && (
            <Polyline
              positions={selectedVehiculo.track.map((p) => [p.lat, p.lng])}
              pathOptions={{
                color: "#4F5DFF",
                weight: 4,
                opacity: 0.75,
                dashArray: "6 6",
              }}
            />
          )}

          {/* Marcadores oficiales 60fps con asset taxi-operador */}
          {visibles
            .filter((v) => v.lat != null && v.lng != null)
            .map((v) => {
              const op = vehiculoToOperador(v);
              return (
                <SmoothTaxiMarker
                  key={v.id}
                  op={op}
                  selected={selectedId === v.id}
                  onSelect={() => {
                    setSelectedId(v.id);
                    setFollow(true);
                  }}
                />
              );
            })}
        </MapContainer>

        {/* HUD Flotante con Ficha Completa del Vehículo Seleccionado */}
        {selectedVehiculo && (
          <div className="bezel-shell absolute bottom-4 left-4 z-[450] w-84 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/15 bg-[#17191E]/95 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200 text-foreground">
            {/* Header del HUD */}
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5 mb-2.5">
              <div className="flex items-center gap-2.5">
                {selectedVehiculo.conductor?.foto_url ? (
                  <img
                    src={selectedVehiculo.conductor.foto_url}
                    alt={selectedVehiculo.conductor.nombre}
                    className="h-10 w-10 rounded-full object-cover border-2 border-brand shadow"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/20 font-bold text-brand-bright text-sm">
                    {selectedVehiculo.conductor?.nombre?.[0] || "T"}
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-white">
                    {selectedVehiculo.conductor?.nombre || "Sin chofer asignado"}
                  </div>
                  <div className="font-mono text-xs font-extrabold text-amber-400">
                    Unidad #{selectedVehiculo.numero_economico || selectedVehiculo.placa}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                title="Cerrar panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Detalles del auto y estadísticas del turno */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Vehículo:</span>
                <span className="font-semibold text-foreground">
                  {selectedVehiculo.marca} {selectedVehiculo.modelo || "Taxi"} ({selectedVehiculo.color || "Blanco"})
                </span>
              </div>

              <div className="flex items-center justify-between text-muted-foreground">
                <span>Placas:</span>
                <span className="font-mono font-bold text-foreground">
                  {selectedVehiculo.placa || "S/P"}
                </span>
              </div>

              {/* Estadísticas del turno: Servicios hoy vs Histórico */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
                  <div className="font-mono text-base font-extrabold text-emerald-400">
                    {selectedVehiculo.servicios_hoy ?? 0}
                  </div>
                  <div className="text-[10px] text-emerald-300 font-semibold uppercase tracking-wider">
                    Servicios hoy
                  </div>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
                  <div className="font-mono text-base font-extrabold text-foreground">
                    {selectedVehiculo.servicios_realizados ?? 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Histórico total
                  </div>
                </div>
              </div>

              {/* Servicio activo si está en curso */}
              {selectedVehiculo.servicio_activo && (
                <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-[11px]">
                  <div className="flex items-center gap-1 font-bold text-amber-300">
                    <RouteIcon className="h-3.5 w-3.5" /> Servicio en curso
                  </div>
                  <div className="mt-1 text-slate-200 truncate">
                    {selectedVehiculo.servicio_activo.origen?.texto || "Origen"} → {selectedVehiculo.servicio_activo.destino?.texto || "Destino"}
                  </div>
                </div>
              )}

              {/* Estado GPS y velocidad */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-white/5">
                <span>Telemetría:</span>
                <span className="text-slate-300 font-medium">
                  {Math.round((selectedVehiculo.gps_speed || 0) * 3.6)} km/h · {timeAgo(selectedVehiculo.conductor?.ultima_actualizacion || selectedVehiculo.ultima_actualizacion)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Flota;
