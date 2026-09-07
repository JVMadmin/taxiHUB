import { useEffect, useMemo, useRef, useState } from "react";
import { termApi } from "@/lib/api";
import { distM } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { Search, MapPin, Flag, X, Navigation, Check, Phone, User } from "@/design/icons";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** Buscador geográfico embebido (usa /geo/search igual que MapSearch). */
function GeoInput({ placeholder, onPick }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) { setRes(null); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const { data } = await termApi.get("/geo/search", { params: { q: query, limit: 6 } });
        setRes(data.resultados || []);
        setOpen(true);
      } catch { setRes([]); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#1B1E24] px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-[#9CA0AA]" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-[#F5F5F7] outline-none placeholder:text-[#9CA0AA]/60"
        />
        {res !== null && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[#4F5DFF] border-t-transparent" />}
      </div>
      {open && res !== null && res.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#17191E] shadow-2xl">
          {res.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onPick(r); setQ(`${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}`); setOpen(false); }}
              className="block w-full border-b border-white/[0.06] px-3 py-2 text-left last:border-0 hover:bg-[#4F5DFF]/15"
            >
              <div className="truncate text-sm font-semibold text-[#F5F5F7]">{r.label}</div>
              {r.sublabel && <div className="truncate text-[11px] text-[#9CA0AA]">{r.sublabel}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * DespachoModal (F6 premium §17) — centro de despacho paso a paso:
 *   1 Origen* (buscar o marcar en mapa)
 *   2 Destino (opcional)
 *   3 Cliente (opcional — secundario)
 *   4 TAXIS LIBRES más cercanos con [ASIGNAR] — la operadora decide.
 * `picking`/onMapClick los maneja Terminal (banner + clic en mapa).
 */
export function DespachoModal({ open, onClose, coords, setCoords, pedirPunto, operadoresLibres, onCreated }) {
  const [cliente, setCliente] = useState({ nombre: "", telefono: "" });
  const [asignando, setAsignando] = useState(null);
  const [clienteOpen, setClienteOpen] = useState(false);

  const cercanos = useMemo(() => {
    if (!coords.origen) return [];
    return operadoresLibres
      .map((t) => ({ ...t, dist: distM({ lat: coords.origen.lat, lng: coords.origen.lng }, { lat: t.lat, lng: t.lng }) }))
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
  }, [coords.origen, operadoresLibres]);

  if (!open) return null;

  const asignar = async (op) => {
    setAsignando(op.id);
    try {
      const { data: created } = await termApi.post("/servicios", {
        cliente_nombre: cliente.nombre || "Servicio de llamada",
        cliente_telefono: cliente.telefono || "",
        origen: { texto: coords.origenTexto || "Origen marcado en mapa", lat: coords.origen.lat, lng: coords.origen.lng },
        destino: coords.destino
          ? { texto: coords.destinoTexto || "Destino marcado en mapa", lat: coords.destino.lat, lng: coords.destino.lng }
          : {},
      });
      await termApi.post(`/servicios/${created.servicio.id}/asignar`, { operador_id: op.id });
      toast.success(`Servicio asignado a ${op.placa || op.nombre}`);
      setCliente({ nombre: "", telefono: "" });
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo asignar el servicio");
    } finally {
      setAsignando(null);
    }
  };

  const inputCls = "input-inset border-border text-foreground";

  return (
    <div className="fixed inset-0 z-[880] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="despacho-overlay">
      <div className="flex max-h-[90vh] w-full max-w-xl animate-scale-in flex-col rounded-2xl border border-white/[0.06] bg-[#17191E] shadow-2xl">
        {/* Encabezado */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-base font-bold text-[#F5F5F7]">
            <Phone className="h-4 w-4 text-[#4F5DFF]" /> Nueva llamada
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#9CA0AA] hover:text-[#F5F5F7] transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
          {/* PASO 1 — Origen */}
          <section data-testid="despacho-origen">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4F5DFF] text-[10px] font-extrabold text-white">1</span>
              <span className="text-xs font-bold uppercase tracking-wide text-[#F5F5F7]">¿Dónde está el servicio?</span>
              {coords.origen && (
                <span className="mono-num ml-auto text-[10px] text-[#7CFC3C]">
                  {coords.origen.lat.toFixed(5)}, {coords.origen.lng.toFixed(5)}
                </span>
              )}
            </div>
            <GeoInput placeholder="Buscar calle, colonia, hotel o referencia…" onPick={(r) => setCoords((c) => ({ ...c, origen: { lat: r.lat, lng: r.lng }, origenTexto: `${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}` }))} />
            <button
              type="button"
              data-testid="despacho-marcar-origen"
              onClick={() => pedirPunto("origen")}
              className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#4F5DFF] hover:text-[#3D49D6] transition-colors"
            >
              <MapPin className="h-3.5 w-3.5" /> Marcar en mapa
            </button>
          </section>

          {/* PASO 2 — Destino (opcional) */}
          <section data-testid="despacho-destino">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1B1E24] border border-white/[0.08] text-[10px] font-extrabold text-[#9CA0AA]">2</span>
              <span className="text-xs font-bold uppercase tracking-wide text-[#9CA0AA]">Destino (opcional)</span>
              {coords.destino && (
                <button type="button" onClick={() => setCoords((c) => ({ ...c, destino: null, destinoTexto: null }))} className="ml-auto text-[10px] text-[#9CA0AA] underline hover:text-[#F5F5F7]">
                  quitar
                </button>
              )}
            </div>
            {!coords.destino ? (
              <>
                <GeoInput placeholder="Buscar destino…" onPick={(r) => setCoords((c) => ({ ...c, destino: { lat: r.lat, lng: r.lng }, destinoTexto: `${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}` }))} />
                <button
                  type="button"
                  data-testid="despacho-marcar-destino"
                  onClick={() => pedirPunto("destino")}
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#9CA0AA] hover:text-[#F5F5F7] transition-colors"
                >
                  <Flag className="h-3.5 w-3.5" /> Marcar en mapa
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#1B1E24] px-3 py-2 text-sm text-[#F5F5F7]">
                <Flag className="h-4 w-4 shrink-0 text-[#4F5DFF]" />
                <span className="truncate">{coords.destinoTexto || `${coords.destino.lat.toFixed(5)}, ${coords.destino.lng.toFixed(5)}`}</span>
              </div>
            )}
          </section>

          {/* PASO 3 — Cliente (opcional, secundario §17) */}
          <section data-testid="despacho-cliente">
            <button type="button" onClick={() => setClienteOpen((v) => !v)} className="flex w-full items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1B1E24] border border-white/[0.08] text-[10px] font-extrabold text-[#9CA0AA]">3</span>
              <span className="text-xs font-bold uppercase tracking-wide text-[#9CA0AA]">Datos del cliente (opcional)</span>
              <span className="ml-auto text-[10px] text-[#9CA0AA] underline hover:text-[#F5F5F7]">{clienteOpen ? "ocultar" : "agregar"}</span>
            </button>
            {clienteOpen && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="relative">
                  <User className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#9CA0AA]" />
                  <Input data-testid="despacho-cliente" value={cliente.nombre} onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))} placeholder="Cliente" className="input-inset border-white/[0.08] bg-[#1B1E24] text-[#F5F5F7] pl-8" />
                </div>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#9CA0AA]" />
                  <Input data-testid="despacho-telefono" value={cliente.telefono} onChange={(e) => setCliente((c) => ({ ...c, telefono: e.target.value }))} placeholder="Teléfono" className="input-inset border-white/[0.08] bg-[#1B1E24] text-[#F5F5F7] pl-8" />
                </div>
              </div>
            )}
          </section>

          {/* PASO 4 — Taxis libres más cercanos */}
          <section data-testid="despacho-taxis">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1B1E24] border border-white/[0.08] text-[10px] font-extrabold text-[#9CA0AA]">4</span>
              <span className="text-xs font-bold uppercase tracking-wide text-[#F5F5F7]">Taxis libres más cercanos</span>
              <span className="mono-num ml-auto text-[10px] text-[#9CA0AA]">{coords.origen ? cercanos.length : "—"}</span>
            </div>
            {!coords.origen ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] p-3 text-center text-xs text-[#9CA0AA]">
                Marca el origen para ver los taxis libres cercanos.
              </div>
            ) : cercanos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] p-3 text-center text-xs text-[#9CA0AA]">
                No hay taxis libres en este momento.
              </div>
            ) : (
              <div className="space-y-1.5">
                {cercanos.slice(0, 6).map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#1B1E24] px-3 py-2">
                    <span className="w-4 text-center text-[10px] font-bold text-[#9CA0AA]">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-[#F5F5F7]">{t.placa || t.nombre}</div>
                      <div className="truncate text-[10px] text-[#9CA0AA]">{t.nombre} · {t.vehiculo ? [t.vehiculo.marca, t.vehiculo.modelo].filter(Boolean).join(" ") : "—"}</div>
                    </div>
                    <span className="mono-num shrink-0 text-xs font-bold text-[#7CFC3C]">
                      {t.dist != null ? (t.dist >= 1000 ? `${(t.dist / 1000).toFixed(1)} km` : `${Math.round(t.dist)} m`) : "—"}
                    </span>
                    <Button
                      data-testid={`despacho-asignar-${t.id}`}
                      size="sm"
                      className="shrink-0 !px-3"
                      disabled={asignando !== null}
                      onClick={() => asignar(t)}
                    >
                      {asignando === t.id ? "…" : <><Check className="h-3.5 w-3.5" /> Asignar</>}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default DespachoModal;
