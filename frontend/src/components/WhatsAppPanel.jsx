import { useCallback, useEffect, useMemo, useState } from "react";
import { termApi } from "@/lib/api";
import { distM } from "@/lib/geo";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { MapPin, Send, ArrowLeft, MessageCircle, Search, Navigation, Plus, Check } from "@/design/icons";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

/**
 * WhatsAppPanel premium (F5) — estilo WhatsApp Web adaptado al despacho.
 * Dos columnas: conversaciones (con búsqueda) | chat con encabezado.
 * Ubicaciones recibidas → [VER EN MAPA] y [CREAR SERVICIO] con TAXIS MÁS
 * CERCANOS ordenados por distancia; la operadora pulsa [ASIGNAR] y decide.
 */
export function WhatsAppPanel({ onVerMapa, onCrearServicio, taxisLibres = [], onAssigned }) {
  const [convs, setConvs] = useState(null);
  const [error, setError] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [taxiListo, setTaxiListo] = useState(null);      // {mensaje, conversacion} → mostrar cercanos
  const [asignando, setAsignando] = useState(null);      // operador_id en vuelo

  const load = useCallback(async () => {
    try {
      const { data } = await termApi.get("/wa/conversaciones");
      setConvs(data);
      setError(null);
    } catch {
      setError("No se pudieron cargar las conversaciones");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const abrir = useCallback(async (c) => {
    try {
      const { data } = await termApi.get(`/wa/conversaciones/${c.id}`);
      setAbierta(data);
      setTaxiListo(null);
    } catch {
      toast.error("No se pudo abrir la conversación");
    }
  }, []);

  const responder = async (e) => {
    e.preventDefault();
    if (!respuesta.trim() || !abierta) return;
    try {
      await termApi.post(`/wa/conversaciones/${abierta.id}/reply`, { texto: respuesta.trim() });
      setRespuesta("");
      await abrir(abierta);
      load();
    } catch {
      toast.error("No se pudo enviar la respuesta");
    }
  };

  // Taxis libres más cercanos a la ubicación marcada (§16): distancia + estado.
  const cercanos = useMemo(() => {
    if (!taxiListo) return [];
    return taxisLibres
      .map((t) => ({
        ...t,
        dist: t.lat != null ? distM({ lat: t.lat, lng: t.lng }, { lat: taxiListo.mensaje.lat, lng: taxiListo.mensaje.lng }) : null,
      }))
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity))
      .slice(0, 4);
  }, [taxiListo, taxisLibres]);

  const crearYAsignar = async (op) => {
    if (!taxiListo) return;
    setAsignando(op.id);
    try {
      const { data: created } = await termApi.post("/servicios", {
        cliente_nombre: taxiListo.conversacion.cliente_nombre || "Cliente WhatsApp",
        cliente_telefono: taxiListo.conversacion.cliente_telefono || "",
        origen: {
          texto: "Ubicación de WhatsApp",
          lat: taxiListo.mensaje.lat,
          lng: taxiListo.mensaje.lng,
        },
        destino: {},
      });
      const sid = created.servicio.id;
      await termApi.post(`/servicios/${sid}/asignar`, { operador_id: op.id });
      toast.success(`Servicio asignado a ${op.placa || op.nombre}`);
      setTaxiListo(null);
      onAssigned?.(sid, op);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo asignar el servicio");
    } finally {
      setAsignando(null);
    }
  };

  if (error) return <EmptyState icon={MessageCircle} title="WhatsApp" description={error} />;
  if (convs === null) return <LoadingState label="Cargando conversaciones…" />;

  const convsFiltradas = (convs || []).filter((c) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (c.cliente_nombre || "").toLowerCase().includes(q)
      || (c.cliente_telefono || "").includes(q);
  });

  /* ---------- Lista de conversaciones ---------- */
  if (!abierta) {
    return (
      <div className="flex h-full min-h-0" data-testid="wa-lista">
        <div className="flex min-h-0 w-full flex-col">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              data-testid="wa-buscar"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar conversación…"
              className="input-inset h-8 w-full rounded-lg border border-border pl-8 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {convsFiltradas.length === 0 && (
              <EmptyState icon={MessageCircle} title="Sin conversaciones" description="Los mensajes del proveedor oficial de WhatsApp aparecerán aquí." />
            )}
            {convsFiltradas.map((c) => {
              const um = c.ultimo_mensaje || {};
              const conUbicacion = um.lat != null;
              return (
                <button
                  key={c.id}
                  data-testid="wa-conversacion"
                  onClick={() => abrir(c)}
                  className="w-full rounded-xl border border-border bg-surface-2 p-3 text-left transition-colors hover:border-brand/40"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-bright">
                      {(c.cliente_nombre || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-foreground">{c.cliente_nombre}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(um.ts || c.actualizada_en)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {conUbicacion && <MapPin className="h-3 w-3 shrink-0 text-brand-bright" />}
                        <span className="truncate">{um.texto || (conUbicacion ? "📍 Ubicación compartida" : "—")}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Chat + taxis cercanos ---------- */
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="wa-chat">
      <button
        data-testid="wa-volver"
        onClick={() => { setAbierta(null); setTaxiListo(null); }}
        className="mb-2 inline-flex shrink-0 items-center gap-1.5 self-start text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Conversaciones
      </button>

      {/* Encabezado estilo WhatsApp Web */}
      <div className="mb-2 flex shrink-0 items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand-bright">
          {(abierta.cliente_nombre || "?").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-foreground">{abierta.cliente_nombre}</div>
          <div className="truncate text-[11px] text-muted-foreground">{abierta.cliente_telefono} · {abierta.mensajes?.length ?? 0} mensajes</div>
        </div>
      </div>

      {/* TAXIS MÁS CERCANOS (§16) — aparecen al pulsar Crear servicio */}
      {taxiListo && (
        <div className="mb-2 shrink-0 rounded-xl border border-brand/40 bg-brand/5 p-3" data-testid="wa-cercanos">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-brand-bright">
              <Navigation className="h-3.5 w-3.5" /> TAXIS MÁS CERCANOS
            </span>
            <button onClick={() => setTaxiListo(null)} className="text-[10px] text-muted-foreground underline">cancelar</button>
          </div>
          <div className="space-y-1.5">
            {cercanos.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
                <span className="w-4 text-center text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-foreground">{t.placa || t.nombre}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{t.nombre}</div>
                </div>
                <span className="mono-num shrink-0 text-xs font-bold text-brand-bright">
                  {t.dist != null ? (t.dist >= 1000 ? `${(t.dist / 1000).toFixed(1)} km` : `${Math.round(t.dist)} m`) : "—"}
                </span>
                <button
                  data-testid={`wa-asignar-${t.id}`}
                  disabled={asignando !== null}
                  onClick={() => crearYAsignar(t)}
                  className="th-btn th-btn-primary shrink-0 !px-2.5 !py-1 !text-[10px]"
                >
                  {asignando === t.id ? "…" : <><Check className="h-3 w-3" /> ASIGNAR</>}
                </button>
              </div>
            ))}
            {cercanos.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
                No hay taxis disponibles cerca ahora.
              </div>
            )}
          </div>
          <button
            data-testid="wa-formulario-completo"
            onClick={() => { const cb = taxiListo; setTaxiListo(null); onCrearServicio?.(cb); }}
            className="mt-2 w-full text-center text-[10px] text-muted-foreground underline hover:text-foreground"
          >
            Abrir formulario completo…
          </button>
        </div>
      )}

      {/* Mensajes */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5" data-testid="wa-mensajes">
        {(abierta.mensajes || []).map((m, i) => {
          const esCliente = m.de === "cliente";
          const conUbicacion = m.lat != null;
          return (
            <div key={i} className={esCliente ? "flex justify-start" : "flex justify-end"}>
              <div className={
                esCliente
                  ? "max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-3 py-2"
                  : "max-w-[85%] rounded-2xl rounded-br-sm border border-brand/30 bg-brand/15 px-3 py-2"
              }>
                {m.texto && <div className="text-sm text-foreground">{m.texto}</div>}
                {conUbicacion && (
                  <>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-brand-bright">
                      <MapPin className="h-3.5 w-3.5" /> UBICACIÓN RECIBIDA
                      <span className="mono-num font-normal text-muted-foreground">
                        {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <button
                        data-testid="wa-ver-mapa"
                        onClick={() => onVerMapa?.({ mensaje: m })}
                        className="th-btn th-btn-ghost !px-2 !py-1 !text-[10px]"
                      >
                        <MapPin className="h-3 w-3" /> Ver en mapa
                      </button>
                      <button
                        data-testid="wa-marcar-mapa"
                        onClick={() => setTaxiListo({ mensaje: m, conversacion: abierta })}
                        className="th-btn th-btn-primary !px-2 !py-1 !text-[10px]"
                      >
                        <Plus className="h-3 w-3" /> Crear servicio
                      </button>
                    </div>
                  </>
                )}
                <div className="mt-1 text-right text-[9px] text-muted-foreground/60">{timeAgo(m.ts)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={responder} className="mt-2 flex shrink-0 items-center gap-2 border-t border-border pt-2">
        <input
          data-testid="wa-respuesta"
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          placeholder="Responder… (vía proveedor oficial)"
          className="input-inset h-9 flex-1 rounded-lg border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button type="submit" data-testid="wa-enviar" disabled={!respuesta.trim()} className="th-btn th-btn-primary !h-9 !w-9 !p-0" aria-label="Enviar">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default WhatsAppPanel;
