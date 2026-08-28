import { useMap } from "react-leaflet";
import { Plus, Minus, LocateFixed } from "@/design/icons";
import { cn } from "@/lib/utils";

/**
 * MapControls — cluster de controles flotantes del mapa (zoom + centrar).
 * `onLocate` opcional: si se proporciona se muestra el botón de ubicación.
 * Posición controlada por CSS (clase del consumidor); estilo del Design System.
 */
export function MapControls({ onLocate, className }) {
  const map = useMap();
  const btn = "th-map-ctl";
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button type="button" aria-label="Acercar" data-testid="map-zoom-in" className={btn} onClick={() => map.zoomIn()}>
        <Plus size={16} strokeWidth={2.5} />
      </button>
      <button type="button" aria-label="Alejar" data-testid="map-zoom-out" className={btn} onClick={() => map.zoomOut()}>
        <Minus size={16} strokeWidth={2.5} />
      </button>
      {onLocate && (
        <button type="button" aria-label="Centrar en mi ubicación" data-testid="map-locate" className={btn} onClick={onLocate}>
          <LocateFixed size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

export default MapControls;
