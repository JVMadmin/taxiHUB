import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { duenoApi } from "@/lib/api";
import { cn, resolveVehicleImage } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { SmoothTaxiMarker } from "@/components/maps/SmoothTaxiMarker";
import { precargarTilesPalenque } from "@/lib/PalenqueTileCache";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import {
  Map as MapIcon,
  User,
  X,
  Layers,
  Satellite,
  Crosshair,
  Route as RouteIcon,
  Car,
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

export function Mapa({ liveSignal }) {
  const [vehiculos, setVehiculos] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [follow, setFollow] = useState(true);
  const [mapLayer, setMapLayer] = useState("calles");

  const load = useCallback(() => {
    setError(null);
    duenoApi
      .get("/dueno/flota")
      .then((r) => setVehiculos(r.data))
      .catch(() => setError("No se pudo cargar el mapa de flota"));
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

  const visibles = useMemo(
    () => (vehiculos || []).filter((v) => v.lat != null && v.lng != null),
    [vehiculos]
  );

  const selectedOp = useMemo(
    () => (selected ? vehiculoToOperador(selected) : null),
    [selected]
  );

  const center = useMemo(() => {
    if (selected?.lat != null && selected?.lng != null) {
      return [selected.lat, selected.lng];
    }
    return visibles[0] ? [visibles[0].lat, visibles[0].lng] : CENTER;
  }, [selected, visibles]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!vehiculos) return <LoadingState rows={1} className="h-[70vh]" />;
  if (visibles.length === 0) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Sin ubicación en vivo"
        description="Ninguno de tus vehículos está reportando GPS en este momento."
      />
    );
  }

  return (
    <div
      className="relative h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-border/80 bg-[#13151A] shadow-2xl"
      data-testid="dueno-mapa"
    >
      {/* 1. Selector rápido de vehículos de la flota en la parte superior */}
      <div className="absolute left-3 top-3 z-[450] flex flex-wrap items-center gap-2 max-w-[calc(100vw-6rem)]">
        {/* Chips de vehículos */}
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border/80 bg-[#17191E]/95 p-1.5 shadow-xl backdrop-blur-md max-w-[65vw] custom-scrollbar">
          {visibles.map((v) => {
            const isSel = selected?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setSelected(v);
                  setFollow(true);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-all",
                  isSel
                    ? "bg-brand text-white shadow-md shadow-brand/25"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
                )}
              >
                <span className="font-mono text-amber-400">#{v.numero_economico || v.placa}</span>
                <span className="truncate max-w-[100px]">{v.conductor?.nombre?.split(" ")[0] || v.modelo}</span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    v.conductor?.estado === "libre" ? "bg-emerald-400" : "bg-amber-400"
                  )}
                />
              </button>
            );
          })}
        </div>

        {/* Toggle Satelital / Calles OSM */}
        <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-[#17191E]/95 p-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMapLayer("calles")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              mapLayer === "calles"
                ? "bg-brand/20 text-brand-bright font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" /> Calles (OSM)
          </button>
          <button
            type="button"
            onClick={() => setMapLayer("satelite")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              mapLayer === "satelite"
                ? "bg-brand/20 text-brand-bright font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Satellite className="h-3.5 w-3.5" /> Satélite
          </button>
        </div>

        {/* Botón de Seguimiento activo con cámara */}
        {selected?.lat != null && (
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold shadow-xl backdrop-blur-md transition-all",
              follow
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                : "border-border/80 bg-[#17191E]/95 text-muted-foreground hover:text-foreground"
            )}
          >
            <Crosshair className={cn("h-3.5 w-3.5", follow && "animate-spin")} />
            <span>{follow ? "Seguimiento activo" : "Centrar vehículo"}</span>
            {follow && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
        )}
      </div>

      {/* 2. Mapa interactivo de pantalla completa */}
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

        {/* Marcadores 60fps con asset oficial taxi-operador */}
        {visibles.map((v) => {
          const op = vehiculoToOperador(v);
          return (
            <SmoothTaxiMarker
              key={v.id}
              op={op}
              selected={selected?.id === v.id}
              onSelect={() => {
                setSelected(v);
                setFollow(true);
              }}
            />
          );
        })}
      </MapContainer>

      {/* 3. Ficha flotante completa al seleccionar un taxi (mismo sistema de la terminal) */}
      {selected && (
        <div
          className="bezel-shell absolute bottom-4 left-4 z-[450] w-84 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/15 bg-[#17191E]/95 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200 text-foreground"
          data-testid="dueno-mapa-panel"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2.5">
              {selected.conductor?.foto_url ? (
                <img
                  src={selected.conductor.foto_url}
                  alt={selected.conductor.nombre}
                  className="h-10 w-10 rounded-full object-cover border-2 border-brand shadow"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/20 font-bold text-brand-bright text-sm">
                  {selected.conductor?.nombre?.[0] || "T"}
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-white">
                  {selected.conductor?.nombre || "Sin chofer asignado"}
                </div>
                <div className="font-mono text-xs font-extrabold text-amber-400">
                  Unidad #{selected.numero_economico || selected.placa}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              title="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Estadísticas de turno y vehículo */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Vehículo:</span>
              <span className="font-semibold text-foreground">
                {selected.marca} {selected.modelo || "Taxi"} ({selected.color || "Blanco"})
              </span>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
              <span>Placas:</span>
              <span className="font-mono font-bold text-foreground">
                {selected.placa || "S/P"}
              </span>
            </div>

            {/* Cuadrícula de Servicios de Turno */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
                <div className="font-mono text-base font-extrabold text-emerald-400">
                  {selected.servicios_hoy ?? 0}
                </div>
                <div className="text-[10px] text-emerald-300 font-semibold uppercase tracking-wider">
                  Servicios hoy
                </div>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
                <div className="font-mono text-base font-extrabold text-foreground">
                  {selected.servicios_realizados ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Histórico total
                </div>
              </div>
            </div>

            {/* Servicio activo si está en curso */}
            {selected.servicio_activo && (
              <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-[11px]">
                <div className="flex items-center gap-1 font-bold text-amber-300">
                  <RouteIcon className="h-3.5 w-3.5" /> Servicio en curso
                </div>
                <div className="mt-1 text-slate-200 truncate">
                  {selected.servicio_activo.origen?.texto || "Origen"} → {selected.servicio_activo.destino?.texto || "Destino"}
                </div>
              </div>
            )}

            {/* Telemetría GPS */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-white/5">
              <span>Telemetría:</span>
              <span className="text-slate-300 font-medium">
                {Math.round((selected.gps_speed || 0) * 3.6)} km/h · {timeAgo(selected.conductor?.ultima_actualizacion || selected.ultima_actualizacion)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Mapa;
