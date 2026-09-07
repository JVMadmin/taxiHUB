import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { duenoApi } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { pillCarIcon } from "@/lib/taxiIcon";
import { useMode } from "@/hooks/useMode";
import { EstadoBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { Map as MapIcon, User, X, Layers, Satellite } from "lucide-react";

const CENTER = [17.5099, -91.9847];
const DARK_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LIGHT_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_REF = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const FALLBACK_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function Mapa({ liveSignal }) {
  const [vehiculos, setVehiculos] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mapLayer, setMapLayer] = useState("calles");
  const mode = useMode();
  const tiles = mode === "claro" ? LIGHT_TILES : DARK_TILES;

  const load = useCallback(() => {
    setError(null);
    duenoApi.get("/dueno/flota").then((r) => setVehiculos(r.data)).catch(() => setError("No se pudo cargar el mapa de flota"));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  const visibles = useMemo(() => (vehiculos || []).filter((v) => v.lat != null && v.lng != null), [vehiculos]);
  const center = visibles[0] ? [visibles[0].lat, visibles[0].lng] : CENTER;

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!vehiculos) return <LoadingState rows={1} className="h-[60vh]" />;
  if (visibles.length === 0) {
    return <EmptyState icon={MapIcon} title="Sin ubicación en vivo" description="Ninguno de tus vehículos está reportando GPS en este momento." />;
  }

  return (
    <div className="relative h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-border lg:h-[calc(100vh-6rem)]" data-testid="dueno-mapa">
      {/* Toggle Satelital / Calles */}
      <div className="absolute right-3 top-3 z-[450] flex items-center gap-1 rounded-xl border border-border/80 bg-surface/90 p-1 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={() => setMapLayer("calles")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${mapLayer === "calles" ? "bg-brand/20 text-brand-bright font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Layers className="h-3.5 w-3.5" /> Calles
        </button>
        <button
          type="button"
          onClick={() => setMapLayer("satelite")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${mapLayer === "satelite" ? "bg-brand/20 text-brand-bright font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Satellite className="h-3.5 w-3.5" /> Satélite
        </button>
      </div>

      <MapContainer center={center} zoom={13} zoomControl={false} markerZoomAnimation={false} className="h-full w-full">
        {mapLayer === "satelite" ? (
          <>
            <TileLayer url={SATELLITE_TILES} attribution="Tiles &copy; Esri World Imagery" maxNativeZoom={18} />
            <TileLayer url={SATELLITE_REF} maxNativeZoom={18} />
          </>
        ) : (
          <TileLayer url={tiles} attribution="Tiles &copy; Esri" errorTileUrl={FALLBACK_TILE} maxNativeZoom={16} />
        )}
        {visibles.map((v) => (
          <Marker
            key={v.id}
            position={[v.lat, v.lng]}
            icon={pillCarIcon(null, { color: v.conductor ? "#10b981" : "#6b7280", label: v.numero_economico, selected: selected?.id === v.id, heading: v.gps_heading || 0 })}
            eventHandlers={{ click: () => setSelected(v) }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{v.numero_economico}</div>
                <div className="text-xs text-muted-foreground">{v.conductor?.nombre || "Sin conductor"}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {selected && (
        <div className="bezel-shell absolute right-3 top-3 z-[500] w-72 max-w-[calc(100vw-1.5rem)]" data-testid="dueno-mapa-panel">
          <div className="rounded-[var(--radius)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-base font-extrabold text-foreground">{selected.numero_economico}</div>
                {selected.conductor && <div className="mt-1"><EstadoBadge estado={selected.conductor.estado} pulse /></div>}
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            {selected.conductor ? (
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex items-center gap-2 text-foreground"><User className="h-3.5 w-3.5 text-muted-foreground" /> {selected.conductor.nombre}</div>
                <div className="text-xs text-muted-foreground">GPS: {timeAgo(selected.ultima_actualizacion)}</div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground">Sin conductor asignado.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Mapa;
