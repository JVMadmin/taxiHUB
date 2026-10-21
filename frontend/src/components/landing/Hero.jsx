import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, MapPin, MessageCircle, Navigation } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { EASE, scrollToId } from "./motion";
import { abrirWhatsAppVentas } from "./Contact";

const FACTS = [
  { icon: MapPin, k: "Toda la flota en un mapa", v: "Ubicación en vivo de cada unidad" },
  { icon: Navigation, k: "Navegación 3D para el chofer", v: "Ruta al cliente y voz al recibir el viaje" },
  { icon: MessageCircle, k: "WhatsApp de tu central", v: "Pedidos y respuestas desde la terminal" },
];

export function Hero() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);

  const fade = (d = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay: d, ease: EASE },
        };

  return (
    <section id="inicio" ref={ref} className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
      <div className="mx-auto max-w-3xl text-center">
        <motion.div {...fade(0)} className="l-chip mx-auto">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 l-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Software de despacho para centrales de taxi
        </motion.div>

        <motion.h1
          {...fade(0.08)}
          className="font-display mt-6 text-[2.6rem] font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl"
        >
          Que ningún pasajero
          <br className="hidden sm:block" />{" "}
          <span className="bg-gradient-to-b from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
            se quede sin taxi.
          </span>
        </motion.h1>

        <motion.p {...fade(0.16)} className="l-texto mx-auto mt-6 max-w-2xl sm:text-xl">
          Ve todas tus unidades en un mapa, asigna la más cercana en segundos y avisa al pasajero por WhatsApp.
          El chofer recibe el viaje por voz y llega con navegación 3D; el dueño cobra su cuota sin cuentas en papel.
        </motion.p>

        <motion.div {...fade(0.24)} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-testid={LANDING.ctaDemo}
            onClick={() => abrirWhatsAppVentas("Hola TaxiHUB, quiero una demostración para mi central de taxis.")}
            className="l-btn l-btn-primario"
          >
            Pide tu demo por WhatsApp
          </button>
          <a
            href="#producto"
            onClick={(e) => { e.preventDefault(); scrollToId("producto", reduce); }}
            className="l-btn l-btn-secundario"
          >
            Ver el producto
            <ArrowDown className="h-4 w-4 text-[#a1a6b2]" aria-hidden="true" />
          </a>
        </motion.div>

        <motion.div {...fade(0.3)} className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm">
          <button
            type="button"
            data-testid={LANDING.ctaTerminal}
            onClick={() => navigate("/terminal/login")}
            className="min-h-[40px] font-semibold text-[#a1a6b2] underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
          >
            Entrar a la Central de Despacho
          </button>
          <button
            type="button"
            data-testid={LANDING.ctaDueno}
            onClick={() => navigate("/dueno/login")}
            className="min-h-[40px] font-semibold text-[#a1a6b2] underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
          >
            Panel Socio / Dueño
          </button>
        </motion.div>
      </div>

      {/* Terminal real en video (bucle silencioso) */}
      <motion.div style={reduce ? undefined : { y, scale }} {...fade(0.2)} className="relative mt-14 sm:mt-20">
        <div className="l-ventana">
          <div className="flex items-center gap-2 px-3 pb-2 pt-1" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 truncate rounded-md bg-white/5 px-3 py-0.5 font-mono text-[11px] text-[#a1a6b2]">
              taxihub.cloud/terminal
            </span>
          </div>
          <div className="overflow-hidden rounded-[14px] bg-black">
            <video
              data-testid={LANDING.heroVideo}
              className="block h-auto w-full"
              width="1440"
              height="900"
              poster="/landing/hero-terminal.webp"
              autoPlay={!reduce}
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Terminal real de TaxiHUB con la flota moviéndose en vivo sobre el mapa de Palenque"
            >
              <source src="/landing/hero-terminal.webm" type="video/webm" />
              <source src="/landing/hero-terminal.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </motion.div>

      <motion.ul {...fade(0.36)} className="mt-14 grid gap-6 sm:grid-cols-3">
        {FACTS.map(({ icon: Icon, k, v }) => (
          <li key={k} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
              <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[15px] font-bold text-white">{k}</div>
              <div className="text-sm text-[#a1a6b2]">{v}</div>
            </div>
          </li>
        ))}
      </motion.ul>
    </section>
  );
}
