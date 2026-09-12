import { useEffect, useRef } from "react";
import { Navigation, Flag, MapPin, Copy, Crosshair, Shapes, X } from "lucide-react";

/**
 * MapContextMenu — Menú contextual flotante al hacer clic derecho en el mapa.
 * Proporciona atajos rápidos para despachadores: iniciar servicio, fijar destino,
 * marcar puntos clave, copiar GPS e identificar colonia.
 */
export function MapContextMenu({
  isOpen,
  position,
  latlng,
  onClose,
  onSetOrigen,
  onSetDestino,
  onMarcarPunto,
  onCopiarCoordenadas,
  onCentrar,
  onIdentificarColonia,
  coloniaCercana,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("pointerdown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position || !latlng) return null;

  const pad = 12;
  const menuWidth = 240;
  const menuHeight = 290;
  const left = Math.min(position.x, window.innerWidth - menuWidth - pad);
  const top = Math.min(position.y, window.innerHeight - menuHeight - pad);

  return (
    <div
      ref={menuRef}
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-[9999] w-60 select-none overflow-hidden rounded-2xl border border-white/10 bg-surface/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 text-foreground"
      data-testid="map-context-menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header con coordenadas y colonia */}
      <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-bright">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{coloniaCercana || "Palenque, Chiapas"}</span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          title="Cerrar menú"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Opciones operativas principales */}
      <div className="py-1 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => { onSetOrigen(latlng); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200 transition-colors"
          data-testid="context-origen-btn"
        >
          <Navigation className="h-3.5 w-3.5 text-emerald-400" />
          <span>Iniciar servicio aquí (Origen)</span>
        </button>

        <button
          type="button"
          onClick={() => { onSetDestino(latlng); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 transition-colors"
          data-testid="context-destino-btn"
        >
          <Flag className="h-3.5 w-3.5 text-rose-400" />
          <span>Fijar como destino</span>
        </button>

        <button
          type="button"
          onClick={() => { onMarcarPunto(latlng); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 transition-colors"
          data-testid="context-marcar-btn"
        >
          <MapPin className="h-3.5 w-3.5 text-amber-400" />
          <span>Marcar referencia</span>
        </button>
      </div>

      <div className="h-px bg-white/10 my-0.5" />

      {/* Acciones de mapa y utilidades */}
      <div className="pt-0.5 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => { onCentrar(latlng); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <Crosshair className="h-3.5 w-3.5 text-sky-400" />
          <span>Centrar mapa aquí</span>
        </button>

        <button
          type="button"
          onClick={() => { onIdentificarColonia(latlng); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <Shapes className="h-3.5 w-3.5 text-indigo-400" />
          <span>Ver límites de colonia</span>
        </button>

        <button
          type="button"
          onClick={() => { onCopiarCoordenadas(latlng); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          data-testid="context-copy-btn"
        >
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Copiar coordenadas GPS</span>
        </button>
      </div>
    </div>
  );
}

export default MapContextMenu;
