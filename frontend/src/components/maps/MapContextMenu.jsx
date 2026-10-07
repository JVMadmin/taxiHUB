import { useEffect, useRef } from "react";
import { Navigation, Flag, MapPin, Copy, Crosshair, Shapes, X, RotateCcw, Zap } from "lucide-react";

/**
 * MapContextMenu — Menú contextual flotante al hacer clic derecho en el mapa.
 * Proporciona atajos rápidos para despachadores: despacho en 1 clic a la unidad
 * más cercana, iniciar servicio, fijar destino, marcar puntos clave, copiar GPS.
 */
export function MapContextMenu({
  isOpen,
  position,
  latlng,
  onClose,
  onSetOrigen,
  onSetDestino,
  onDespachoRapido,
  taxiMasCercano,
  onMarcarPunto,
  onCopiarCoordenadas,
  onCentrar,
  onIdentificarColonia,
  coloniaCercana,
  hasPuntosMarcados = false,
  onLimpiarPuntos,
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
  const menuWidth = 256;
  const menuHeight = 330;
  const left = Math.min(position.x, window.innerWidth - menuWidth - pad);
  const top = Math.min(position.y, window.innerHeight - menuHeight - pad);

  return (
    <div
      ref={menuRef}
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-[9999] w-64 select-none overflow-hidden rounded-2xl border border-white/10 bg-surface/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 text-foreground"
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
        {onDespachoRapido && taxiMasCercano && (
          <button
            type="button"
            onClick={() => { onDespachoRapido(latlng, taxiMasCercano); onClose(); }}
            className="flex w-full items-center justify-between gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-2 text-left text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 transition-all mb-0.5 shadow-sm"
            data-testid="context-despacho-rapido-btn"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Zap className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="truncate">Despachar #{taxiMasCercano.placa || taxiMasCercano.nombre}</span>
            </span>
            {taxiMasCercano.dist != null && (
              <span className="mono-num shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-emerald-300">
                {taxiMasCercano.dist >= 1000 ? `${(taxiMasCercano.dist / 1000).toFixed(1)}km` : `${Math.round(taxiMasCercano.dist)}m`}
              </span>
            )}
          </button>
        )}
        {hasPuntosMarcados && (
          <button
            type="button"
            onClick={() => { onLimpiarPuntos?.(); onClose(); }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 transition-colors border border-amber-500/20 bg-amber-500/5 mb-1"
            data-testid="context-limpiar-btn"
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
            <span>Limpiar puntos del mapa</span>
          </button>
        )}
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
