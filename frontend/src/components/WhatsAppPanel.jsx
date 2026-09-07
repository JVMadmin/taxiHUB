import { useCallback, useEffect, useMemo, useState } from "react";
import { termApi } from "@/lib/api";
import { distM } from "@/lib/geo";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Send,
  ArrowLeft,
  MessageCircle,
  Search,
  Navigation,
  Plus,
  Check,
  Zap,
  Clock,
  AlertCircle
} from "@/design/icons";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

const QUICK_REPLIES = [
  "🚕 Ya va un taxi en camino",
  "📍 ¿Confirmas tu ubicación exacta?",
  "⏱ Tiempo estimado: 5 minutos",
  "✅ Tu unidad ha sido asignada",
  "👋 Hola, ¿en qué podemos ayudarte?",
];

/**
 * Calcula el nivel de urgencia según la antigüedad del mensaje.
 * < 2 min: normal (muted)
 * 2 - 5 min: advertencia (ámbar)
 * > 5 min: urgente (rojo con etiqueta de atención)
 */
function getUrgency(ts) {
  if (!ts) return { level: "normal", color: "#9CA0AA", isUrgent: false };
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = diffMs / 60000;
  if (diffMin > 5) {
    return { level: "urgent", color: "#F4544C", isUrgent: true, label: "URGENTE" };
  }
  if (diffMin >= 2) {
    return { level: "warning", color: "#FFB224", isWarning: true, label: null };
  }
  return { level: "normal", color: "#9CA0AA", isNormal: true, label: null };
}

/**
 * WhatsAppPanel — Centro de despacho conversacional
 * Prioridad #1: Autodetección de ubicaciones compartidas, cálculo inmediato
 * del taxi libre más cercano con distancia y ETA, botón de despacho en 1 clic,
 * chips de respuestas rápidas y semáforos de urgencia.
 */
export function WhatsAppPanel({ onVerMapa, onCrearServicio, taxisLibres = [], onAssigned }) {
  const [convs, setConvs] = useState(null);
  const [error, setError] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [taxiListo, setTaxiListo] = useState(null); // {mensaje, conversacion} → modal/lista cercanos
  const [asignando, setAsignando] = useState(null); // operador_id en vuelo

  const load = useCallback(async () => {
    try {
      const { data } = await termApi.get("/wa/conversaciones");
      setConvs(data);
      setError(null);
    } catch {
      setError("No se pudieron cargar las conversaciones");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    if (e) e.preventDefault();
    if (!respuesta.trim() || !abierta) return;
    try {
      await termApi.post(`/wa/conversaciones/${abierta.id}/reply`, { texto: respuesta.trim() });
      setRespuesta("");
      await abrir(abierta);
      load();
      toast.success("Mensaje enviado");
    } catch {
      toast.error("No se pudo enviar la respuesta");
    }
  };

  // Taxis libres ordenados por distancia a la ubicación de taxiListo
  const cercanos = useMemo(() => {
    if (!taxiListo?.mensaje?.lat) return [];
    return taxisLibres
      .map((t) => ({
        ...t,
        dist:
          t.lat != null
            ? distM({ lat: t.lat, lng: t.lng }, { lat: taxiListo.mensaje.lat, lng: taxiListo.mensaje.lng })
            : null,
      }))
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity))
      .slice(0, 4);
  }, [taxiListo, taxisLibres]);

  // Despacho directo a un operador con origen en la ubicación indicada
  const crearYAsignar = async (op, contextOverride) => {
    const context = contextOverride || taxiListo;
    if (!context?.mensaje?.lat) return;
    setAsignando(op.id);
    try {
      const { data: created } = await termApi.post("/servicios", {
        cliente_nombre: context.conversacion?.cliente_nombre || "Cliente WhatsApp",
        cliente_telefono: context.conversacion?.cliente_telefono || "",
        origen: {
          texto: "Ubicación WhatsApp",
          lat: context.mensaje.lat,
          lng: context.mensaje.lng,
        },
        destino: {},
      });
      const sid = created.servicio.id;
      await termApi.post(`/servicios/${sid}/asignar`, { operador_id: op.id });
      toast.success(`Servicio despachado a unidad ${op.placa || op.nombre}`);
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
    return (
      (c.cliente_nombre || "").toLowerCase().includes(q) ||
      (c.cliente_telefono || "").includes(q)
    );
  });

  /* ---------- 1. Lista de conversaciones ---------- */
  if (!abierta) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="wa-lista">
        {/* Buscador de conversaciones */}
        <div className="relative mb-3 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#9CA0AA]" />
          <input
            data-testid="wa-buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o teléfono…"
            className="h-9 w-full rounded-xl border border-white/[0.08] bg-[#17191E] pl-9 pr-3 text-xs text-[#F5F5F7] placeholder:text-[#9CA0AA]/60 focus:border-[#4F5DFF] focus:outline-none focus:ring-1 focus:ring-[#4F5DFF] transition-all"
          />
        </div>

        {/* Lista con scroll */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 custom-scrollbar">
          {convsFiltradas.length === 0 && (
            <EmptyState
              icon={MessageCircle}
              title="Sin conversaciones"
              description="Los mensajes entrantes de WhatsApp aparecerán aquí en tiempo real."
            />
          )}
          {convsFiltradas.map((c) => {
            const um = c.ultimo_mensaje || {};
            const conUbicacion = um.lat != null;
            const urg = getUrgency(um.ts || c.actualizada_en);

            return (
              <button
                key={c.id}
                data-testid="wa-conversacion"
                onClick={() => abrir(c)}
                className="group relative flex w-full flex-col gap-1.5 rounded-[16px] border border-white/[0.06] bg-[#17191E] p-3 text-left transition-all hover:border-[#4F5DFF]/40 hover:bg-[#1B1E24] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:translate-y-px"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar iniciales */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4F5DFF]/15 text-xs font-bold text-[#4F5DFF] transition-transform group-hover:scale-105">
                    {(c.cliente_nombre || "?").slice(0, 2).toUpperCase()}
                  </div>

                  {/* Nombre y teléfono */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-sm font-semibold text-[#F5F5F7]">
                        {c.cliente_nombre || "Cliente WhatsApp"}
                      </span>
                      {/* Semáforo de tiempo/urgencia */}
                      {urg.isUrgent ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#F4544C]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#F4544C] border border-[#F4544C]/30 animate-pulse">
                          <AlertCircle className="h-3 w-3" />
                          {timeAgo(um.ts || c.actualizada_en)}
                        </span>
                      ) : (
                        <span
                          className="shrink-0 text-[10px] font-medium"
                          style={{ color: urg.color }}
                        >
                          {timeAgo(um.ts || c.actualizada_en)}
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-1">
                      <div className="flex min-w-0 items-center gap-1 text-xs text-[#9CA0AA]">
                        {conUbicacion && (
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#7CFC3C]" />
                        )}
                        <span className="truncate">
                          {um.texto || (conUbicacion ? "Ubicación compartida" : "—")}
                        </span>
                      </div>
                      {conUbicacion && (
                        <span className="shrink-0 rounded-full bg-[#7CFC3C]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#7CFC3C]">
                          GPS
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------- 2. Conversación activa (Chat + Despacho Asistido) ---------- */
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="wa-chat">
      {/* Botón volver */}
      <button
        data-testid="wa-volver"
        onClick={() => {
          setAbierta(null);
          setTaxiListo(null);
        }}
        className="mb-2 inline-flex shrink-0 items-center gap-1.5 self-start text-xs font-semibold text-[#9CA0AA] hover:text-[#F5F5F7] transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Conversaciones
      </button>

      {/* Encabezado del cliente con status */}
      <div className="mb-2.5 flex shrink-0 items-center gap-3 rounded-[16px] border border-white/[0.06] bg-[#17191E] p-3 shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4F5DFF]/15 text-sm font-bold text-[#4F5DFF]">
          {(abierta.cliente_nombre || "?").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <div className="truncate text-sm font-bold text-[#F5F5F7]">
              {abierta.cliente_nombre || "Cliente WhatsApp"}
            </div>
            <span className="text-[10px] text-[#9CA0AA]">
              {abierta.mensajes?.length ?? 0} mensajes
            </span>
          </div>
          <div className="truncate text-xs text-[#9CA0AA]">{abierta.cliente_telefono}</div>
        </div>
      </div>

      {/* Lista expandida de taxis cercanos (al pulsar Crear Servicio / Ver más taxis) */}
      {taxiListo && (
        <div
          className="mb-2.5 shrink-0 rounded-[16px] border border-[#4F5DFF]/40 bg-[#17191E] p-3 shadow-lg"
          data-testid="wa-cercanos"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#4F5DFF]">
              <Navigation className="h-3.5 w-3.5" /> Taxis más cercanos
            </span>
            <button
              onClick={() => setTaxiListo(null)}
              className="text-[10px] text-[#9CA0AA] hover:text-[#F5F5F7] underline"
            >
              Cerrar
            </button>
          </div>
          <div className="space-y-1.5">
            {cercanos.map((t, i) => {
              const etaMin =
                t.dist != null ? Math.max(1, Math.ceil(t.dist / (25 * 1000 / 60))) : null;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#1B1E24] px-3 py-2"
                >
                  <span className="w-4 text-center text-[10px] font-bold text-[#9CA0AA]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#7CFC3C]" />
                      <span className="truncate text-xs font-bold text-[#F5F5F7]">
                        {t.placa || t.nombre}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-[#9CA0AA]">{t.nombre}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="mono-num text-xs font-bold text-[#F5F5F7]">
                      {t.dist != null
                        ? t.dist >= 1000
                          ? `${(t.dist / 1000).toFixed(1)} km`
                          : `${Math.round(t.dist)} m`
                        : "—"}
                    </span>
                    {etaMin && (
                      <div className="text-[10px] font-medium text-[#7CFC3C]">~{etaMin} min</div>
                    )}
                  </div>
                  <button
                    data-testid={`wa-asignar-${t.id}`}
                    disabled={asignando !== null}
                    onClick={() => crearYAsignar(t)}
                    className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#4F5DFF] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-[#3D49D6] transition-all disabled:opacity-50"
                  >
                    {asignando === t.id ? (
                      "…"
                    ) : (
                      <>
                        <Check className="h-3 w-3" /> ASIGNAR
                      </>
                    )}
                  </button>
                </div>
              );
            })}
            {cercanos.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/[0.08] p-3 text-center text-xs text-[#9CA0AA]">
                No hay unidades disponibles en este momento.
              </div>
            )}
          </div>
          <button
            data-testid="wa-formulario-completo"
            onClick={() => {
              const cb = taxiListo;
              setTaxiListo(null);
              onCrearServicio?.(cb);
            }}
            className="mt-2.5 w-full text-center text-[11px] font-medium text-[#9CA0AA] underline hover:text-[#F5F5F7] transition-colors"
          >
            Abrir formulario completo de servicio…
          </button>
        </div>
      )}

      {/* Lista de mensajes */}
      <div
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5 custom-scrollbar"
        data-testid="wa-mensajes"
      >
        {(abierta.mensajes || []).map((m, i) => {
          const esCliente = m.de === "cliente";
          const conUbicacion = m.lat != null;
          const urg = getUrgency(m.ts);

          // Si el mensaje tiene ubicación, calculamos el taxi libre más cercano
          let masCercano = null;
          let masCercanoEta = null;
          if (conUbicacion && taxisLibres.length > 0) {
            const taxisConDist = taxisLibres
              .map((t) => ({
                ...t,
                dist:
                  t.lat != null
                    ? distM({ lat: t.lat, lng: t.lng }, { lat: m.lat, lng: m.lng })
                    : null,
              }))
              .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
            masCercano = taxisConDist[0];
            if (masCercano?.dist != null) {
              masCercanoEta = Math.max(1, Math.ceil(masCercano.dist / (25 * 1000 / 60)));
            }
          }

          return (
            <div
              key={i}
              className={cn("flex", esCliente ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2.5 transition-all",
                  esCliente
                    ? "rounded-bl-sm border border-white/[0.06] bg-[#17191E] text-[#F5F5F7]"
                    : "rounded-br-sm border border-[#4F5DFF]/30 bg-[#1E2235] text-[#F5F5F7]"
                )}
              >
                {/* Texto del mensaje */}
                {m.texto && (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.texto}</div>
                )}

                {/* Tarjeta de ubicación compartida */}
                {conUbicacion && (
                  <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#111318]/70 p-2.5">
                    <div className="flex items-center justify-between gap-1.5 text-xs font-semibold text-[#7CFC3C]">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> Ubicación GPS recibida
                      </span>
                      <span className="mono-num text-[10px] text-[#9CA0AA]">
                        {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
                      </span>
                    </div>

                    {/* Botón de Despacho Inmediato en 1 clic asistido */}
                    {masCercano && (
                      <div className="mt-2.5 rounded-lg border border-[#4F5DFF]/30 bg-[#4F5DFF]/10 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F5F5F7]">
                            <span className="h-2 w-2 rounded-full bg-[#7CFC3C] shadow-[0_0_6px_#7CFC3C]" />
                            <span>
                              Sugerido: <strong className="text-[#7CFC3C]">{masCercano.placa || masCercano.nombre}</strong>
                            </span>
                          </div>
                          <div className="mono-num text-[11px] text-[#DDE1FF]">
                            {masCercano.dist >= 1000
                              ? `${(masCercano.dist / 1000).toFixed(1)} km`
                              : `${Math.round(masCercano.dist)} m`}{" "}
                            · ~{masCercanoEta} min
                          </div>
                        </div>

                        {/* Botón principal: 1 solo clic para despachar */}
                        <button
                          data-testid={`wa-asignar-${masCercano.id}`}
                          disabled={asignando !== null}
                          onClick={() =>
                            crearYAsignar(masCercano, {
                              mensaje: m,
                              conversacion: abierta,
                            })
                          }
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#4F5DFF] py-2 text-xs font-bold text-white shadow-[0_2px_12px_rgba(79,93,255,0.3)] transition-all hover:bg-[#3D49D6] active:translate-y-px disabled:opacity-50"
                        >
                          {asignando === masCercano.id ? (
                            "Despachando…"
                          ) : (
                            <>
                              <Zap className="h-3.5 w-3.5 text-yellow-300" />
                              DESPACHAR A UNIDAD #{masCercano.placa || masCercano.nombre}
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Acciones secundarias: Ver en mapa y Ver más opciones */}
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button
                        data-testid="wa-ver-mapa"
                        onClick={() => onVerMapa?.({ mensaje: m })}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-[#1B1E24] px-2.5 py-1.5 text-[11px] font-medium text-[#9CA0AA] hover:bg-[#22252C] hover:text-[#F5F5F7] transition-all"
                      >
                        <MapPin className="h-3 w-3" /> Ver en mapa
                      </button>
                      <button
                        data-testid="wa-marcar-mapa"
                        onClick={() => setTaxiListo({ mensaje: m, conversacion: abierta })}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-[#1B1E24] px-2.5 py-1.5 text-[11px] font-medium text-[#9CA0AA] hover:border-[#4F5DFF]/40 hover:bg-[#22252C] hover:text-[#F5F5F7] transition-all"
                      >
                        <Plus className="h-3 w-3" /> Ver más taxis
                      </button>
                    </div>
                  </div>
                )}

                {/* Pie del mensaje: semáforo de tiempo */}
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px]">
                  {urg.isUrgent && (
                    <span className="flex items-center gap-0.5 font-bold text-[#F4544C]">
                      <Clock className="h-2.5 w-2.5" /> URGENTE
                    </span>
                  )}
                  <span style={{ color: urg.color }}>{timeAgo(m.ts)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chips de Respuestas Rápidas */}
      <div className="mt-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto py-1 px-0.5 no-scrollbar">
          {QUICK_REPLIES.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setRespuesta(chip)}
              className="shrink-0 rounded-full border border-white/[0.08] bg-[#17191E] px-2.5 py-1 text-[11px] font-medium text-[#9CA0AA] transition-all hover:border-[#4F5DFF]/40 hover:bg-[#1B1E24] hover:text-[#F5F5F7] active:scale-95"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Barra de envío de respuesta */}
      <form
        onSubmit={responder}
        className="mt-1.5 flex shrink-0 items-center gap-2 border-t border-white/[0.06] pt-2"
      >
        <input
          data-testid="wa-respuesta"
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          placeholder="Escribir mensaje o seleccionar respuesta rápida…"
          className="h-10 flex-1 rounded-xl border border-white/[0.08] bg-[#17191E] px-3.5 text-xs text-[#F5F5F7] placeholder:text-[#9CA0AA]/60 focus:border-[#4F5DFF] focus:outline-none focus:ring-1 focus:ring-[#4F5DFF] transition-all"
        />
        <button
          type="submit"
          data-testid="wa-enviar"
          disabled={!respuesta.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4F5DFF] text-white shadow-[0_2px_10px_rgba(79,93,255,0.3)] transition-all hover:bg-[#3D49D6] disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default WhatsAppPanel;
