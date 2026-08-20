import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { duenoApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { distM, fmtDist, fmtDuration } from "@/lib/geo";
import { timeAgo } from "@/lib/time";
import { pointIcon, car3dIcon } from "@/lib/taxiIcon";
import { useMode } from "@/hooks/useMode";
import { VehicleCard } from "@/components/VehicleCard";
import { VehicleImage } from "@/components/VehicleImage";
import { EstadoBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Car, Search, ArrowLeft, User, Route as RouteIcon } from "lucide-react";

const CENTER = [17.5099, -91.9847];
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function VehicleDetail({ vehiculoId, onBack }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const mode = useMode();
  const tiles = mode === "claro" ? LIGHT_TILES : DARK_TILES;

  const load = useCallback(() => {
    setError(null);
    duenoApi.get(`/dueno/flota/${vehiculoId}`)
      .then((r) => setV(r.data))
      .catch(() => setError("No se pudo cargar el detalle del vehículo"));
  }, [vehiculoId]);

  useEffect(() => { setV(null); load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!v) return <LoadingState rows={3} />;

  const trackStats = (() => {
    if (!v.track || v.track.length < 2) return null;
    let dist = 0;
    for (let i = 1; i < v.track.length; i++) dist += distM(v.track[i - 1], v.track[i]) || 0;
    const t0 = new Date(v.track[0].ts).getTime();
    const t1 = new Date(v.track[v.track.length - 1].ts).getTime();
    return { dist, dur: (t1 - t0) / 1000 };
  })();

  return (
    <div className="space-y-4" data-testid="dueno-vehiculo-detalle">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
        <ArrowLeft className="h-4 w-4" /> Volver a la flota
      </button>

      <VehicleImage vehiculo={v} className="aspect-[16/9] w-full rounded-2xl border border-border bg-gradient-to-b from-surface-2 to-surface-3" imgClassName="p-6" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-lg font-extrabold text-foreground">{v.numero_economico}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {v.tipo_vehiculo?.nombre ? `${v.tipo_vehiculo.nombre} · ` : ""}
            {[v.marca, v.modelo, v.anio, v.color].filter(Boolean).join(" · ") || "Sin datos del vehículo"}
            {v.placa ? ` · ${v.placa}` : ""}
          </div>
        </div>
        {v.conductor && <EstadoBadge estado={v.conductor.estado} pulse />}
      </div>

      {v.conductor ? (
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-foreground"><User className="h-4 w-4 text-muted-foreground" /> {v.conductor.nombre}</div>
          <div className="mt-1 text-xs text-muted-foreground">{v.conductor.telefono || "Sin teléfono registrado"} · GPS {timeAgo(v.conductor.ultima_actualizacion)}</div>
        </div>
      ) : (
        <EmptyState icon={User} title="Sin conductor asignado" description="Este vehículo no tiene un conductor activo." />
      )}

      {v.lat != null && (
        <div className="h-64 overflow-hidden rounded-xl border border-border">
          <MapContainer center={[v.lat, v.lng]} zoom={14} className="h-full w-full">
            <TileLayer url={tiles} attribution="&copy; OSM &copy; CARTO" subdomains="abcd" />
            {v.track?.length > 1 && (
              <Polyline positions={v.track.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#94a3b8", weight: 3, opacity: 0.6, dashArray: "4 6" }} />
            )}
            <Marker position={[v.lat, v.lng]} icon={car3dIcon("#10b981", { heading: 0, size: "lg" })} />
            {v.servicio_activo?.destino?.lat != null && (
              <Marker position={[v.servicio_activo.destino.lat, v.servicio_activo.destino.lng]} icon={pointIcon("Destino", "#ef4444")} />
            )}
          </MapContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="mono-num text-lg font-bold text-foreground">{v.servicios_realizados}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Servicios realizados</div>
        </div>
        {trackStats && (
          <>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="mono-num text-lg font-bold text-foreground">{fmtDist(trackStats.dist)}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recorrido reciente</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="mono-num text-lg font-bold text-foreground">{fmtDuration(trackStats.dur)}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ventana</div>
            </div>
          </>
        )}
      </div>

      {v.servicio_activo && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-bright">
            <RouteIcon className="h-3.5 w-3.5" /> Servicio en curso
          </div>
          <div className="mt-1.5 text-sm text-foreground">
            {v.servicio_activo.origen?.texto || "—"} → {v.servicio_activo.destino?.texto || "—"}
          </div>
        </div>
      )}
    </div>
  );
}

export function Flota({ liveSignal }) {
  const [vehiculos, setVehiculos] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(() => {
    setError(null);
    duenoApi.get("/dueno/flota").then((r) => setVehiculos(r.data)).catch(() => setError("No se pudo cargar la flota"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q || !vehiculos) return vehiculos || [];
    return vehiculos.filter((v) =>
      v.numero_economico?.toLowerCase().includes(q) ||
      v.placa?.toLowerCase().includes(q) ||
      v.conductor?.nombre?.toLowerCase().includes(q)
    );
  }, [vehiculos, busqueda]);

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]" data-testid="dueno-flota">
      <div className={cn("space-y-3", selectedId && "hidden lg:block")}>
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Tu flota</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{vehiculos?.length ?? "…"} vehículos registrados</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar unidad, placa o conductor…"
            className="input-inset h-9 border-border pl-8 text-sm" />
        </div>
        {error && <ErrorState description={error} onRetry={load} />}
        {!error && !vehiculos && <LoadingState rows={4} />}
        {!error && vehiculos && visibles.length === 0 && (
          <EmptyState icon={Car} title="Sin vehículos" description="Aún no tienes vehículos registrados en tu flota." />
        )}
        <div className="space-y-3">
          {visibles.map((v) => (
            <VehicleCard key={v.id} vehiculo={v} onClick={() => setSelectedId(v.id)}
              testId={`dueno-vehiculo-${v.id}`}
              className={selectedId === v.id ? "border-brand/50 bg-brand/5" : undefined} />
          ))}
        </div>
      </div>

      <div className={cn(!selectedId && "hidden lg:flex lg:items-center lg:justify-center")}>
        {selectedId ? (
          <VehicleDetail vehiculoId={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <EmptyState icon={Car} title="Selecciona un vehículo" description="Elige un taxi de la lista para ver su detalle, ubicación y servicios." />
        )}
      </div>
    </div>
  );
}

export default Flota;
