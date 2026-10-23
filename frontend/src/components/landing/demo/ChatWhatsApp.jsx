import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MapPin, RotateCcw, Send } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { T } from "../motion";

/*
 * Conversación de WhatsApp tal como la ve la operadora en la Terminal (datos de demostración).
 * El visitante hace de operadora: cada acción avanza el guion; las respuestas del cliente y
 * la confirmación automática llegan solas, como en la central real (respuesta automática al
 * despachar, plantilla de whatsapp_module).
 */
const hora = (min) => `14:${String(min).padStart(2, "0")}`;
const GUION = [
  {
    accion: null,
    llegan: [{ quien: "cliente", texto: "Buenas tardes, ¿me pueden mandar un taxi?", hora: hora(2) }],
  },
  {
    accion: "Responder: “Con gusto, compártanos su ubicación”",
    envia: { quien: "central", texto: "¡Con gusto! Compártanos su ubicación, por favor.", hora: hora(2) },
    llegan: [{ quien: "cliente", ubicacion: "Av. Juárez, Centro · Palenque", hora: hora(3) }],
  },
  {
    accion: "Crear el servicio con esa ubicación y despachar",
    envia: { quien: "sistema", texto: "Servicio creado desde la ubicación compartida · ofrecido a la unidad más cercana" },
    llegan: [
      { quien: "sistema", texto: "La unidad 104 aceptó el servicio" },
      {
        quien: "central",
        auto: true,
        texto: "¡Hola María! Tu unidad *104* ya va en camino a tu ubicación. Lo conduce *Patricia Vela* y llega en aprox. *3 min*. 🚕",
        hora: hora(3),
      },
      { quien: "cliente", texto: "Perfecto, gracias 🙌", hora: hora(4) },
    ],
  },
];

// *negritas* al estilo WhatsApp
const conNegritas = (t) => t.split(/(\*[^*]+\*)/g).map((p, i) => (p.startsWith("*") && p.endsWith("*") ? <b key={i}>{p.slice(1, -1)}</b> : p));

export function ChatWhatsApp() {
  const reduce = useReducedMotion();
  const [paso, setPaso] = useState(0);
  const [mensajes, setMensajes] = useState([]);
  const [escribiendo, setEscribiendo] = useState(false);
  const cajaRef = useRef(null);
  const timers = useRef([]);

  const llegar = (lista) => {
    let espera = 0;
    lista.forEach((m, i) => {
      espera += reduce ? 0 : m.quien === "cliente" ? 1100 : 750;
      timers.current.push(
        setTimeout(() => {
          setMensajes((ms) => [...ms, m]);
          if (i === lista.length - 1) setEscribiendo(false);
        }, espera)
      );
    });
    if (lista.length && !reduce) setEscribiendo(true);
  };

  useEffect(() => {
    llegar(GUION[0].llegan);
    const t = timers.current;
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = cajaRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [mensajes, escribiendo, reduce]);

  const siguiente = GUION[paso + 1];
  const actuar = () => {
    if (!siguiente || escribiendo) return;
    setMensajes((ms) => [...ms, siguiente.envia]);
    setPaso((p) => p + 1);
    llegar(siguiente.llegan);
  };
  const reiniciar = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMensajes([]);
    setPaso(0);
    llegar(GUION[0].llegan);
  };

  return (
    <div className="grid h-full bg-[#050B12] md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden flex-col border-r border-[rgba(148,172,204,0.12)] bg-[#07101A] md:flex" aria-label="Conversaciones">
        <div className="border-b border-[rgba(148,172,204,0.12)] p-4">
          <div className="text-[13px] font-semibold">WhatsApp de la central</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[#4ADE80]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" aria-hidden="true" /> Vinculado por QR
          </div>
        </div>
        {[
          { n: "María", t: mensajes.length ? (mensajes[mensajes.length - 1].texto || "Ubicación") : "…", activo: true },
          { n: "+52 916 ··· ·· 48", t: "¡Gracias, ya llegó!" },
          { n: "Hotel en La Cañada", t: "¿Tienen unidad para 6 personas?" },
        ].map((c) => (
          <div key={c.n} className={`border-b border-[rgba(148,172,204,0.08)] px-4 py-3 ${c.activo ? "bg-[#0F1926]" : ""}`}>
            <div className="text-[12.5px] font-semibold">{c.n}</div>
            <div className="truncate text-[11.5px] text-[#8A9BB0]">{c.t}</div>
          </div>
        ))}
        <p className="mt-auto p-4 text-[11px] leading-relaxed text-[#8A9BB0]">Conversaciones de demostración.</p>
      </aside>

      <div className="flex min-h-[420px] flex-col md:min-h-0">
        <div className="flex items-center gap-3 border-b border-[rgba(148,172,204,0.12)] px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#142235] text-[12px] font-semibold" aria-hidden="true">M</span>
          <div>
            <div className="text-[13px] font-semibold">María (cliente de demostración)</div>
            <div className="ld-mono text-[10.5px] text-[#8A9BB0]">+52 916 ··· ·· 21</div>
          </div>
        </div>

        <div ref={cajaRef} className="ld-chat-mensajes" data-testid={LANDING.waMensajes} aria-live="polite">
          <AnimatePresence initial={false}>
            {mensajes.map((m, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: T.comp }}
                className={`ld-burbuja ld-burbuja--${m.quien}`}
              >
                {m.auto && <span className="ld-mono mb-1 block text-[10px] uppercase tracking-[0.1em] text-[#4ADE80]">Respuesta automática</span>}
                {m.ubicacion ? (
                  <span className="flex items-center gap-2">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#142235]" aria-hidden="true">
                      <MapPin className="h-5 w-5 text-[#FFE600]" />
                    </span>
                    <span>
                      <b className="block text-[13px]">Ubicación compartida</b>
                      <span className="text-[12px] text-[#B7C4D4]">{m.ubicacion}</span>
                    </span>
                  </span>
                ) : (
                  conNegritas(m.texto)
                )}
                {m.hora && <small>{m.hora}{m.quien === "central" ? " ✓✓" : ""}</small>}
              </motion.div>
            ))}
          </AnimatePresence>
          {escribiendo && (
            <div className="ld-burbuja ld-burbuja--cliente ld-mono text-[12px] text-[#8A9BB0]" aria-hidden="true">escribiendo…</div>
          )}
        </div>

        <div className="border-t border-[rgba(148,172,204,0.12)] p-3">
          {siguiente ? (
            <button
              type="button"
              data-testid={LANDING.waAccion}
              onClick={actuar}
              disabled={escribiendo}
              className="ld-btn ld-btn--primario ld-btn--chico w-full justify-between text-left"
            >
              <span className="truncate">{siguiente.accion}</span>
              <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" data-testid={LANDING.waAccion} onClick={reiniciar} className="ld-btn ld-btn--secundario ld-btn--chico w-full">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Repetir la conversación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
