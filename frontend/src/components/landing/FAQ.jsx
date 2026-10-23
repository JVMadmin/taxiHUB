import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LANDING } from "@/constants/testIds";
import { DUR, EASE_IO, Etiqueta, Reveal } from "./motion";

const PREGUNTAS = [
  {
    p: "¿Cobran comisión por cada viaje?",
    r: "No. Pagas $99 MXN al mes por cada unidad activa, más un pago único de implementación. Lo que cobra el chofer por el viaje no pasa por TaxiHUB.",
  },
  {
    p: "¿Qué equipo necesito para empezar?",
    r: "Para la central, una computadora con navegador (también hay versión para Windows). Para choferes, pasajeros y socios, un celular Android con datos. Todo funciona por internet.",
  },
  {
    p: "¿Puedo usar el WhatsApp que ya tiene mi central?",
    r: "Sí. Se vincula con un código QR, como WhatsApp Web, y los mensajes llegan a la Terminal. Recomendamos un número dedicado a la central, no uno personal.",
  },
  {
    p: "¿Qué pasa si un chofer no contesta la oferta?",
    r: "La oferta tiene un tiempo límite que tú configuras (60 segundos por defecto). Si no la acepta, pasa sola a la siguiente unidad libre más cercana. Si nadie la toma, el pedido queda pendiente y se vuelve a ofrecer.",
  },
  {
    p: "¿Mis datos se mezclan con los de otras centrales?",
    r: "No. Cada central trabaja en su propio sitio: sus unidades, choferes, clientes y servicios solo los ve su gente.",
  },
  {
    p: "¿Funciona sin internet?",
    r: "No. Despacho, ubicación y avisos son en tiempo real y necesitan conexión. Si un celular pierde señal, en la Terminal se ve que su ubicación dejó de actualizarse.",
  },
  {
    p: "¿Cuánto tarda la implementación?",
    r: "Depende del tamaño de tu flota y de tu ciudad. Incluye cargar tu mapa con colonias, tarifas y puntos frecuentes, dar de alta unidades y choferes, y capacitar a tus operadoras. Te damos fechas al cotizar.",
  },
];

export function FAQ() {
  const reduce = useReducedMotion();
  const [abierta, setAbierta] = useState(0);

  return (
    <section id="preguntas" aria-labelledby="faq-titulo" className="ld-seccion">
      <div className="ld-contenedor grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal>
          <Etiqueta>Preguntas frecuentes</Etiqueta>
          <h2 id="faq-titulo" className="ld-h2 mt-4">Lo que nos preguntan antes de empezar.</h2>
          <p className="ld-lead mt-5">¿Tienes otra duda? Escríbenos por WhatsApp y te respondemos.</p>
        </Reveal>

        <div className="border-t border-[rgba(148,172,204,0.12)]">
          {PREGUNTAS.map((q, i) => {
            const abiertaEsta = abierta === i;
            return (
              <div key={q.p} className="ld-faq-item" data-testid={`${LANDING.faqItem}-${i}`}>
                <h3>
                  <button
                    type="button"
                    id={`faq-b-${i}`}
                    className="ld-faq-boton"
                    aria-expanded={abiertaEsta}
                    aria-controls={`faq-r-${i}`}
                    onClick={() => setAbierta(abiertaEsta ? -1 : i)}
                  >
                    {q.p}
                    <span className="ld-faq-signo" aria-hidden="true" />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {abiertaEsta && (
                    <motion.div
                      id={`faq-r-${i}`}
                      role="region"
                      aria-labelledby={`faq-b-${i}`}
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1, transition: { duration: DUR.comp, ease: EASE_IO } }}
                      exit={{ height: 0, opacity: 0, transition: { duration: DUR.micro + 0.04, ease: EASE_IO } }}
                      className="overflow-hidden"
                    >
                      <p className="ld-cuerpo max-w-[46rem] pb-6 text-[15px]">{q.r}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
