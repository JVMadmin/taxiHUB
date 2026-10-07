import { useEffect, useMemo, useRef, useState } from "react";
import { termApi } from "@/lib/api";
import { distM } from "@/lib/geo";
import { semaforoServiciosStyle } from "@/lib/taxiIcon";
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
export function DespachoModal({ open, onClose, coords, setCoords, pedirPunto, operadoresLibres, serviciosHoyPorOperador = {}, onCreated, initialCliente }) {
  const [cliente, setCliente] = useState({ nombre: "", telefono: "" });
  const [asignando, setAsignando] = useState(null);
  const [clienteOpen, setClienteOpen] = useState(false);

  useEffect(() => {
    if (open && initialCliente && (initialCliente.cliente_nombre || initialCliente.cliente_telefono)) {
      setCliente({
        nombre: initialCliente.cliente_nombre || "",
        telefono: initialCliente.cliente_telefono || "",
      });
      setClienteOpen(true);
    }
  }, [open, initialCliente]);

  const cercanos = useMemo(() => {
    if (!coords.origen) return [];
    return operadoresLibres
      .map((t) => ({ ...t, dist: distM({ lat: coords.origen.lat, lng: coords.origen.lng }, { lat: t.lat, lng: t.lng }) }))
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
  }, [coords.origen, operadoresLibres]);

  const asignar = async (op, options = {}) => {
    if (!op || asignando !== null) return;
    setAsignando(op.id);
    try {
      const tieneDestCoords = coords.destino && coords.destino.lat != null;
      const sinDestExplicito = options.sinDestino || (!tieneDestCoords && !coords.destinoTexto);
      const destData = tieneDestCoords
        ? { texto: coords.destinoTexto || "Destino marcado en mapa", lat: coords.destino.lat, lng: coords.destino.lng }
        : coords.destinoTexto
        ? { texto: coords.destinoTexto }
        : { texto: "A indicaciones del cliente (Sin destino fijo)" };

      const payload = {
        cliente_nombre: cliente.nombre || "Servicio de llamada",
        cliente_telefono: cliente.telefono || "",
        origen: { texto: coords.origenTexto || "Origen marcado en mapa", lat: coords.origen.lat, lng: coords.origen.lng },
        destino: destData,
      };
      if (coords.tarifaSugerida) {
        payload.costo = Number(coords.tarifaSugerida);
      }

      const { data: created } = await termApi.post("/servicios", payload);
      await termApi.post(`/servicios/${created.servicio.id}/asignar`, { operador_id: op.id });
      toast.success(`Servicio asignado a ${op.placa || op.nombre}`, {
        description: sinDestExplicito ? "Destino: A indicaciones directas del cliente" : destData.texto,
      });
      setCliente({ nombre: "", telefono: "" });
      setCoords?.({ origen: null, destino: null, origenTexto: null, destinoTexto: null });
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo asignar el servicio");
    } finally {
      setAsignando(null);
    }
  };

  // Eliminado el modal bloqueante: si no hay destino fijo, despacha directo "A indicaciones del cliente"
  const handleIntentarAsignar = (op) => {
    const tieneDest = (coords.destino && coords.destino.lat != null) || !!coords.destinoTexto;
    asignar(op, { sinDestino: !tieneDest });
  };

  // Atajos de teclado dentro del modal: 1-6 asigna taxi #1-#6, Enter asigna el #1, Esc cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!coords.origen || cercanos.length === 0 || asignando !== null) return;
      if (e.key >= "1" && e.key <= "6") {
        const idx = parseInt(e.key, 10) - 1;
        if (cercanos[idx]) {
          e.preventDefault();
          handleIntentarAsignar(cercanos[idx]);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleIntentarAsignar(cercanos[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, coords.origen, cercanos, asignando]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[880] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="despacho-overlay">
      <div className="flex max-h-[90vh] w-full max-w-xl animate-scale-in flex-col rounded-2xl border border-white/[0.06] bg-[#17191E] shadow-2xl">
        {/* Encabezado */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <h3 className="flex items-center gap-2 text-base font-bold text-[#F5F5F7]">
              <Phone className="h-4 w-4 text-[#4F5DFF]" /> Nueva llamada
            </h3>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-[#9CA0AA]">
              Teclas 1-6 / Enter = Despacho directo
            </span>
          </div>
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
                  {coords.origenTexto ? `${coords.origenTexto} · ` : ""}{coords.origen.lat.toFixed(4)}, {coords.origen.lng.toFixed(4)}
                </span>
              )}
            </div>
            <GeoInput placeholder="Buscar calle, colonia, hotel o referencia…" onPick={(r) => setCoords((c) => ({ ...c, origen: { lat: r.lat, lng: r.lng }, origenTexto: `${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}` }))} />
            <div className="mt-1.5 flex items-center justify-between">
              <button
                type="button"
                data-testid="despacho-marcar-origen"
                onClick={() => pedirPunto("origen")}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#4F5DFF] hover:text-[#3D49D6] transition-colors"
              >
                <MapPin className="h-3.5 w-3.5" /> Marcar en mapa
              </button>
              {coords.tarifaSugerida && (
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  Tarifa base sugerida: ${coords.tarifaSugerida}
                </span>
              )}
            </div>
          </section>

          {/* PASO 2 — Destino (opcional, sin modal bloqueante) */}
          <section data-testid="despacho-destino">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1B1E24] border border-white/[0.08] text-[10px] font-extrabold text-[#9CA0AA]">2</span>
              <span className="text-xs font-bold uppercase tracking-wide text-[#9CA0AA]">Destino (opcional)</span>
              {(coords.destino || coords.destinoTexto) && (
                <button type="button" onClick={() => setCoords((c) => ({ ...c, destino: null, destinoTexto: null }))} className="ml-auto text-[10px] text-[#9CA0AA] underline hover:text-[#F5F5F7]">
                  quitar
                </button>
              )}
            </div>
            {!coords.destino && !coords.destinoTexto ? (
              <>
                <GeoInput placeholder="Buscar destino (o deja vacío para indicaciones del cliente)…" onPick={(r) => setCoords((c) => ({ ...c, destino: { lat: r.lat, lng: r.lng }, destinoTexto: `${r.label}${r.sublabel ? `, ${r.sublabel}` : ""}` }))} />
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    data-testid="despacho-marcar-destino"
                    onClick={() => pedirPunto("destino")}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#9CA0AA] hover:text-[#F5F5F7] transition-colors"
                  >
                    <Flag className="h-3.5 w-3.5" /> Marcar en mapa
                  </button>
                  <button
                    type="button"
                    data-testid="despacho-sin-destino-btn"
                    onClick={() => setCoords((c) => ({ ...c, destino: null, destinoTexto: "A indicaciones del cliente (Sin destino fijo)" }))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                  >
                    ⚡ Sin destino fijo (A indicaciones — activo por defecto al asignar)
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#1B1E24] px-3 py-2 text-sm text-[#F5F5F7]">
                <Flag className="h-4 w-4 shrink-0 text-[#4F5DFF]" />
                <span className="truncate">{coords.destinoTexto || (coords.destino?.lat ? `${coords.destino.lat.toFixed(5)}, ${coords.destino.lng.toFixed(5)}` : "Destino fijado")}</span>
                <button
                  type="button"
                  onClick={() => setCoords((c) => ({ ...c, destino: null, destinoTexto: null }))}
                  className="ml-auto text-[11px] text-muted-foreground hover:text-rose-400 p-1"
                  title="Quitar destino"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
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
                Marca el origen o elige un Punto Caliente para ver los taxis libres cercanos.
              </div>
            ) : cercanos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] p-3 text-center text-xs text-[#9CA0AA]">
                No hay taxis libres en este momento.
              </div>
            ) : (
              <div className="space-y-1.5">
                {cercanos.slice(0, 6).map((t, i) => {
                  const svHoy = serviciosHoyPorOperador[t.id] ?? t.servicios_hoy ?? 0;
                  const sem = semaforoServiciosStyle(svHoy);
                  return (
                    <div key={t.id} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#1B1E24] px-3 py-2">
                      <span
                        title={`Atajo de teclado: presiona ${i + 1}`}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.06] font-mono text-[10px] font-bold text-[#7CFC3C]"
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-[#F5F5F7]">{t.placa || t.nombre}</span>
                          <span
                            data-testid={`despacho-taxi-servicios-${t.id}`}
                            style={{ background: sem.bg, color: sem.text, borderColor: sem.border }}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-black leading-none shadow-sm"
                            title={`Servicios hoy: ${sem.count} (${sem.nivel})`}
                          >
                            {sem.count} hoy
                          </span>
                        </div>
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
                        onClick={() => handleIntentarAsignar(t)}
                      >
                        {asignando === t.id ? "…" : <><Check className="h-3.5 w-3.5" /> Asignar</>}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default DespachoModal;
