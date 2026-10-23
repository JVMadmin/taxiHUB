import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Inbox, Send, UserX, RotateCcw, SkipForward, CheckCircle2, Car } from "lucide-react";
import { ESTADOS_SERVICIO } from "@/design/status";
import { LANDING } from "@/constants/testIds";
import { flota, nombreZona, OFERTA_DEMO_S, OFERTA_REAL_S } from "./flota";
import { useServicio } from "./useFlota";

const PASOS = [
  { fase: ["pendiente"], txt: "Pedido" },
  { fase: ["ofertando", "sin_unidades"], txt: "Oferta" },
  { fase: ["asignado"], txt: "Asignado" },
  { fase: ["en_curso"], txt: "Viaje" },
  { fase: ["completado"], txt: "Listo" },
];
const indicePaso = (fase) => PASOS.findIndex((p) => p.fase.includes(fase));

const ANUNCIO = {
  inactivo: "Demostración de despacho lista.",
  pendiente: "Llegó un pedido nuevo por WhatsApp.",
  ofertando: "Oferta enviada a la unidad más cercana.",
  sin_unidades: "Ninguna unidad aceptó; el pedido queda pendiente.",
  asignado: "La unidad aceptó y va por el cliente.",
  en_curso: "El cliente subió: viaje en curso.",
  completado: "Servicio completado.",
};

function useMetrosAlCliente(fase) {
  const [m, setM] = useState(null);
  useEffect(() => {
    if (fase !== "asignado") {
      setM(null);
      return undefined;
    }
    const leer = () => setM(flota.metrosAlCliente());
    leer();
    const id = setInterval(leer, 400);
    return () => clearInterval(id);
  }, [fase]);
  return m;
}

const minutos = (metros, velMs) => Math.max(1, Math.round(metros / Math.max(velMs, 5) / 60));

export function HojaDespacho() {
  const reduce = useReducedMotion();
  const s = useServicio();
  const metros = useMetrosAlCliente(s.fase);
  const unidad = s.unidadId ? flota.porId.get(s.unidadId) : null;
  const actual = s.candidatos[s.idx];
  const paso = indicePaso(s.fase);
  const zona = s.recogida ? nombreZona(s.recogida.pista) : "";

  return (
    <div className="ld-hoja" aria-label="Despacho de un pedido de demostración">
      <div className="ld-hoja-cab">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">Despacho</span>
          <span className="ld-mono text-[10px] uppercase tracking-[0.1em] text-[#8A9BB0]">Pedido de demostración</span>
        </div>
        <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="Avance del servicio">
          {PASOS.map((p, i) => (
            <li key={p.txt} className="text-center">
              <span
                className="block h-1 rounded-full transition-colors duration-300"
                style={{ background: i <= paso && paso >= 0 ? "#FFE600" : "rgba(148,172,204,0.18)" }}
              />
              <span className={`mt-1.5 block text-[10.5px] ${i === paso ? "text-[#FFE600]" : "text-[#8A9BB0]"}`}>{p.txt}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="ld-hoja-cuerpo" data-testid={LANDING.despachoFase} data-fase={s.fase}>
        <p className="sr-only" aria-live="polite">{ANUNCIO[s.fase]}</p>

        {s.fase === "inactivo" && (
          <div>
            <Inbox className="h-6 w-6 text-[#FFE600]" aria-hidden="true" />
            <h3 className="ld-h3 mt-3">Llega un pedido</h3>
            <p className="ld-cuerpo mt-2">
              Entra por llamada, WhatsApp o la app del pasajero y se ubica en el mapa. Despáchalo como lo haría tu
              operadora.
            </p>
            <button type="button" data-testid={LANDING.despachoNuevo} onClick={() => flota.nuevoPedido()} className="ld-btn ld-btn--primario mt-5 w-full">
              Recibir un pedido de ejemplo
            </button>
          </div>
        )}

        {s.fase === "pendiente" && (
          <div>
            <span className="ld-estado" style={{ "--c": ESTADOS_SERVICIO.pendiente.color }}>Pendiente · WhatsApp</span>
            <dl className="mt-3">
              <div className="ld-dato"><dt>Cliente</dt><dd>María (demo)</dd></div>
              <div className="ld-dato"><dt>Recoger en</dt><dd>{zona}</dd></div>
              <div className="ld-dato"><dt>Destino</dt><dd>Zona Arqueológica</dd></div>
              <div className="ld-dato"><dt>Pago</dt><dd>Efectivo</dd></div>
            </dl>
            <button type="button" data-testid={LANDING.despachoOfrecer} onClick={() => flota.ofrecer()} className="ld-btn ld-btn--primario mt-5 w-full">
              <Send className="h-4 w-4" aria-hidden="true" /> Ofrecer a la más cercana
            </button>
            <p className="mt-3 text-[12px] text-[#8A9BB0]">El pin amarillo del mapa es el cliente.</p>
          </div>
        )}

        {(s.fase === "ofertando" || s.fase === "sin_unidades") && (
          <div>
            <h3 className="ld-h3">{s.fase === "ofertando" ? "Ofreciendo el servicio" : "Ninguna unidad aceptó"}</h3>
            <p className="ld-cuerpo mt-1.5 text-[13px]">
              Unidades libres ordenadas por distancia en calle. La oferta va a una a la vez.
            </p>
            <ul className="mt-3 grid gap-2">
              {s.candidatos.map((c, i) => {
                const estado = s.fase === "sin_unidades" || i < s.idx ? "paso" : i === s.idx ? "actual" : "espera";
                return (
                  <li key={c.id} className="ld-candidato" data-estado={estado}>
                    <Car className="h-4 w-4 text-[#8A9BB0]" aria-hidden="true" />
                    <span>
                      <strong>Unidad {c.id}</strong>
                      <span className="ld-mono block text-[11px] text-[#8A9BB0]">{Math.round(c.metros)} m por calle</span>
                    </span>
                    <span className="text-[11.5px] text-[#B7C4D4]">
                      {estado === "actual" ? "Oferta enviada" : estado === "paso" ? "No respondió" : "En espera"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {s.fase === "ofertando" && (
              <>
                <div className="ld-oferta-barra mt-3" aria-hidden="true">
                  <span key={`${s.idx}-${actual?.id}`} style={{ animationDuration: `${OFERTA_DEMO_S}s` }} />
                </div>
                <p className="mt-2 text-[11.5px] text-[#8A9BB0]">
                  En tu central la oferta dura {OFERTA_REAL_S} s (ajustable). Aquí, {OFERTA_DEMO_S} s.
                </p>
                <div className="mt-4 grid gap-2">
                  <button type="button" data-testid={LANDING.despachoRechazar} onClick={() => flota.rechazarOferta()} className="ld-btn ld-btn--secundario ld-btn--chico">
                    <UserX className="h-4 w-4" aria-hidden="true" /> Simular que no responde
                  </button>
                  {reduce && (
                    <button type="button" data-testid={LANDING.despachoAvanzar} onClick={() => flota.adelantarHastaCambio()} className="ld-btn ld-btn--fantasma">
                      <SkipForward className="h-4 w-4" aria-hidden="true" /> Siguiente paso
                    </button>
                  )}
                </div>
              </>
            )}
            {s.fase === "sin_unidades" && (
              <>
                <p className="mt-3 text-[12.5px] text-[#B7C4D4]">
                  En la central real el pedido queda pendiente y TaxiHUB lo vuelve a ofrecer cada 10 segundos.
                </p>
                <div className="mt-4 grid gap-2">
                  <button type="button" onClick={() => flota.ofrecer()} className="ld-btn ld-btn--primario ld-btn--chico">Volver a ofrecer</button>
                  <button type="button" data-testid={LANDING.despachoReiniciar} onClick={() => flota.nuevoPedido()} className="ld-btn ld-btn--secundario ld-btn--chico">Otro pedido</button>
                </div>
              </>
            )}
          </div>
        )}

        {s.fase === "asignado" && unidad && (
          <div>
            <span className="ld-estado" style={{ "--c": ESTADOS_SERVICIO.asignado.color }}>Asignado</span>
            <h3 className="ld-h3 mt-3">La unidad {unidad.id} aceptó</h3>
            <dl className="mt-2">
              <div className="ld-dato"><dt>Chofer</dt><dd>{unidad.chofer}</dd></div>
              <div className="ld-dato"><dt>Le faltan</dt><dd className="ld-mono">{metros == null ? "—" : `${Math.round(metros)} m`}</dd></div>
              <div className="ld-dato"><dt>Llega en</dt><dd className="ld-mono">~{metros == null ? "—" : minutos(metros, unidad.velActual)} min</dd></div>
            </dl>
            <div className="ld-mensaje-wa">
              <span className="ld-mono mb-1 block text-[10px] uppercase tracking-[0.1em] text-[#4ADE80]">Respuesta automática por WhatsApp</span>
              ¡Hola María! Tu unidad <b>{unidad.id}</b> ya va en camino a tu ubicación. Lo conduce <b>{unidad.chofer}</b> y llega en aprox.{" "}
              <b>{metros == null ? "—" : minutos(metros, unidad.velActual)} min</b>. 🚕
            </div>
            {reduce && (
              <button type="button" data-testid={LANDING.despachoAvanzar} onClick={() => flota.adelantarHastaCambio()} className="ld-btn ld-btn--fantasma mt-3">
                <SkipForward className="h-4 w-4" aria-hidden="true" /> Siguiente paso
              </button>
            )}
          </div>
        )}

        {s.fase === "en_curso" && unidad && (
          <div>
            <span className="ld-estado" style={{ "--c": ESTADOS_SERVICIO.en_curso.color }}>En curso</span>
            <h3 className="ld-h3 mt-3">Cliente a bordo</h3>
            <p className="ld-cuerpo mt-2">
              La unidad {unidad.id} pasa a <span style={{ color: "#F4544C" }}>ocupada</span> en el mapa de todas las
              operadoras. El viaje queda en el historial del día.
            </p>
            {reduce && (
              <button type="button" data-testid={LANDING.despachoAvanzar} onClick={() => flota.adelantarHastaCambio()} className="ld-btn ld-btn--fantasma mt-3">
                <SkipForward className="h-4 w-4" aria-hidden="true" /> Siguiente paso
              </button>
            )}
          </div>
        )}

        {s.fase === "completado" && (
          <div>
            <CheckCircle2 className="h-6 w-6 text-[#22C55E]" aria-hidden="true" />
            <h3 className="ld-h3 mt-3">Servicio completado</h3>
            <p className="ld-cuerpo mt-2">
              La unidad {unidad?.id} vuelve a estar <span style={{ color: "#22C55E" }}>disponible</span> para el
              siguiente pedido. {s.rechazos > 0 && `Antes, ${s.rechazos} unidad${s.rechazos > 1 ? "es no respondieron" : " no respondió"} y la oferta pasó a la siguiente.`}
            </p>
            <button type="button" data-testid={LANDING.despachoReiniciar} onClick={() => flota.nuevoPedido()} className="ld-btn ld-btn--primario mt-5 w-full">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Repetir con otro pedido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
