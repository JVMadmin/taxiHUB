import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MessageCircle, Smartphone, BadgePercent, Play } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { CentralDemo } from "./demo/CentralDemo";
import { abrirWhatsAppVentas } from "./Contact";
import { DUR, EASE, scrollToId, useInclinacion } from "./motion";

// Solo capacidades verificables del producto (nada de métricas inventadas).
const CONFIANZA = [
  { icono: BadgePercent, texto: "Sin comisión por viaje" },
  { icono: Smartphone, texto: "Apps Android de chofer, pasajero y socio" },
  { icono: MessageCircle, texto: "WhatsApp de la central integrado" },
];

const LINEAS = [
  { texto: "Tu flota en movimiento,", clase: "" },
  { texto: "siempre conectada.", clase: "ld-amarillo" },
];

export function Hero() {
  const reduce = useReducedMotion();
  const { estilo, eventos } = useInclinacion({ grados: 3, px: 5 });

  // Coreografía: etiqueta → titular por líneas → texto → CTA → confianza; el producto entra
  // en paralelo con profundidad y, al asentarse, el mapa activa sus unidades.
  const cont = { oculto: {}, visible: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } } };
  const item = reduce
    ? { oculto: { opacity: 1 }, visible: { opacity: 1 } }
    : { oculto: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: DUR.entrada, ease: EASE } } };
  const linea = reduce
    ? { oculto: { y: 0 }, visible: { y: 0 } }
    : { oculto: { y: "105%" }, visible: { y: 0, transition: { duration: 0.85, ease: EASE } } };
  const producto = reduce
    ? { oculto: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        oculto: { opacity: 0, y: 46, rotateX: 9, scale: 0.97 },
        visible: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { duration: 1.05, ease: EASE, delay: 0.3 } },
      };
  const telefono = reduce
    ? { oculto: { opacity: 1 }, visible: { opacity: 1 } }
    : { oculto: { opacity: 0, y: 40, x: -12 }, visible: { opacity: 1, y: 0, x: 0, transition: { duration: 0.9, ease: EASE, delay: 0.7 } } };

  return (
    <section id="inicio" aria-labelledby="hero-titulo" className="relative overflow-hidden pb-16 pt-28 sm:pt-32 lg:pb-24 lg:pt-36">
      {/* Luz ambiental muy tenue detrás del producto (sin elementos flotantes). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-8%] top-[18%] h-[38rem] w-[52rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,230,0,0.09),transparent)]" />
        <div className="absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(60rem_30rem_at_30%_-10%,rgba(56,107,170,0.16),transparent)]" />
      </div>

      <div className="ld-contenedor relative grid items-center gap-14 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] xl:gap-8">
        <motion.div variants={cont} initial="oculto" animate="visible">
          <motion.div variants={item}>
            <span className="ld-pildora">
              <span className="ld-punto-vivo" aria-hidden="true" />
              Software de despacho para centrales de taxi
            </span>
          </motion.div>

          <h1 id="hero-titulo" className="ld-h1 mt-6">
            {LINEAS.map((l) => (
              <span key={l.texto} className="block overflow-hidden pb-[0.06em]">
                <motion.span variants={linea} className={`block ${l.clase}`}>
                  {l.texto}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p variants={item} className="ld-lead mt-6 max-w-[34rem]">
            Despacho, mapa en vivo de tus unidades, WhatsApp de la central y las apps de chofer, pasajero y socio en
            una sola plataforma hecha para la operación diaria de un sitio de taxis.
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              data-testid={LANDING.ctaDemo}
              onClick={() => abrirWhatsAppVentas("Hola TaxiHUB, quiero una demostración para mi central de taxis.")}
              className="ld-btn ld-btn--primario"
            >
              Pide tu demo por WhatsApp
              <ArrowRight className="ld-flecha h-4 w-4" aria-hidden="true" />
            </button>
            <a
              href="#producto"
              data-testid={LANDING.ctaExplorar}
              onClick={(e) => {
                e.preventDefault();
                scrollToId("producto", reduce);
              }}
              className="ld-btn ld-btn--secundario"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Explorar el producto
            </a>
          </motion.div>

          <motion.ul variants={item} className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[0.9rem] text-[#B7C4D4]">
            {CONFIANZA.map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex items-center gap-2">
                <Icono className="h-4 w-4 text-[#FFE600]" aria-hidden="true" />
                {texto}
              </li>
            ))}
          </motion.ul>
        </motion.div>

        {/* Producto: Terminal interactiva + app del chofer (captura real) */}
        <div className="ld-hero-producto relative xl:pl-16" style={{ perspective: 1600 }}>
          <motion.div variants={producto} initial="oculto" animate="visible" style={estilo} {...eventos} className="relative xl:-mr-[72px]">
            <div className="ld-tableta">
              <div className="ld-tableta-pantalla h-[430px] max-sm:h-auto lg:h-[470px]">
                <CentralDemo entrada />
              </div>
            </div>
            <motion.figure
              variants={telefono}
              initial="oculto"
              animate="visible"
              className="absolute -bottom-11 -left-16 hidden w-[150px] xl:block"
              style={{ transform: "translateZ(40px)" }}
            >
              <div className="ld-telefono">
                <img
                  src="/landing/operador.webp"
                  width="390"
                  height="844"
                  alt="App del chofer de TaxiHUB: servicio asignado con navegación 3D hacia el cliente"
                  decoding="async"
                />
              </div>
              <figcaption className="ld-mono mt-3 text-center text-[10.5px] uppercase tracking-[0.12em] text-[#8A9BB0]">
                App del chofer · captura real
              </figcaption>
            </motion.figure>
          </motion.div>
          <p className="mt-4 text-center text-[12.5px] text-[#8A9BB0] xl:ml-[120px] xl:mt-5 xl:text-right">
            Toca una unidad en el mapa o en la lista. Unidades y choferes de demostración sobre calles reales de Palenque.
          </p>
        </div>
      </div>
    </section>
  );
}
