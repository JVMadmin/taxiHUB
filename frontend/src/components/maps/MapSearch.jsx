import { useEffect, useRef, useState } from "react";
import { Search, MapPin, X, CornerDownLeft, Flag, Navigation } from "@/design/icons";
import { termApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const ICONO_TIPO = {
  highway: "🛣️", amenity: "📍", railway: "🚉", place: "🏘️",
  shop: "🏪", tourism: "🏨", leisure: "🌳", building: "🏢",
};

/**
 * MapSearch — buscador geográfico global del Centro de Operaciones (F4).
 * Consulta /geo/search (Photon vía backend, sesgo a la zona de operación).
 *
 * Al elegir un resultado: centra el mapa (flyTo) y expone acciones
 * "Usar como origen" / "Usar como destino" vía onPickOrigen/onPickDestino.
 */
export function MapSearch({ onGoto, onPickOrigen, onPickDestino, className }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);   // null = cerrado; [] = sin resultados
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // resultado elegido (acciones origen/destino)
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const timerRef = useRef(null);

  // Búsqueda con debounce (350 ms)
  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) { setResults(null); setLoading(false); return; }
    setLoading(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const { data } = await termApi.get("/geo/search", { params: { q: query, limit: 8 } });
        setResults(data.resultados || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timerRef.current);
  }, [q]);

  // Cierra al hacer clic fuera
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const elegir = (r) => {
    setSelected(r);
    setOpen(false);
    setQ(r.label);
    onGoto?.(r);
  };

  const pick = (which) => {
    if (!selected) return;
    (which === "origen" ? onPickOrigen : onPickDestino)?.(selected);
    setSelected(null);
  };

  const reset = () => { setQ(""); setResults(null); setSelected(null); setOpen(false); };

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative transition-all duration-300 ease-out",
        open || selected || q ? "opacity-100 shadow-2xl" : "opacity-45 hover:opacity-100 focus-within:opacity-100 shadow-md",
        className
      )}
      data-testid="map-search"
    >
      <div
        className={cn(
          "bezel-shell pointer-events-auto backdrop-blur-md transition-all duration-300",
          open || selected || q
            ? "bg-card/95 border-border shadow-2xl"
            : "bg-card/40 hover:bg-card/90 focus-within:bg-card/95 border-border/50 hover:border-border"
        )}
      >
        <div className="flex items-center gap-2 rounded-[var(--radius)] px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            data-testid="map-search-input"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar calle, colonia, hotel, referencia…"
            className="h-8 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Buscar ubicación en el mapa"
          />
          {loading && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />}
          {!loading && q && (
            <button onClick={reset} aria-label="Limpiar búsqueda" className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Acciones del resultado seleccionado */}
      {selected && (
        <div className="absolute inset-x-0 top-full z-[600] mt-1.5 animate-slide-down rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur" data-testid="map-search-actions">
          <div className="flex items-center gap-2 px-1.5 pb-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-brand-bright" />
            <span className="truncate">{selected.label}{selected.sublabel ? ` · ${selected.sublabel}` : ""}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              data-testid="map-search-usar-origen"
              onClick={() => pick("origen")}
              className="th-btn th-btn-primary !py-1.5 !text-xs"
            >
              <Navigation className="h-3.5 w-3.5" /> Usar como origen
            </button>
            <button
              data-testid="map-search-usar-destino"
              onClick={() => pick("destino")}
              className="th-btn th-btn-ghost !py-1.5 !text-xs"
            >
              <Flag className="h-3.5 w-3.5" /> Usar como destino
            </button>
          </div>
        </div>
      )}

      {/* Dropdown de resultados */}
      {open && !selected && results !== null && (
        <div className="absolute inset-x-0 top-full z-[600] mt-1.5 max-h-[340px] animate-slide-down overflow-y-auto rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur" data-testid="map-search-results">
          {results.length === 0 && !loading && (
            <div className="p-3 text-center text-xs text-muted-foreground">Sin resultados para «{q}»</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              data-testid="map-search-result"
              onClick={() => elegir(r)}
              className="flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-brand/10"
            >
              <span className="mt-0.5 text-base leading-none">{ICONO_TIPO[r.tipo] || "📍"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{r.label}</span>
                {r.sublabel && <span className="block truncate text-[11px] text-muted-foreground">{r.sublabel}</span>}
              </span>
              <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MapSearch;
