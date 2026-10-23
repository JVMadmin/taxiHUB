import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, Radio, MessageCircle, MapPin } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { EASE, scrollToId } from "./motion";

const FACTS = [
  { icon: Radio, k: "Multi-sitio", v: "Cada central en su propio entorno aislado" },
  { icon: MessageCircle, k: "WhatsApp por QR", v: "Sin costo por mensaje" },
  { icon: MapPin, k: "GPS 24/7", v: "Con la pantalla apagada" },
];

export function Hero() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 40]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.98]);

  const fade = (d = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay: d, ease: EASE },
        };

  return (
    <section id="inicio" ref={ref} className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
      <div className="grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <motion.div {...fade(0)} className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-amber-400 l-ping" aria-hidden="true" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Radiodespacho Satelital en Tiempo Real
            </span>
          </motion.div>

          <motion.h1
            {...fade(0.1)}
            className="font-display mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-5xl xl:text-6xl"
          >
            Tu central de taxis,{" "}
            <span className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
              sin perder viajes.
            </span>
          </motion.h1>

          <motion.p {...fade(0.18)} className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
            Plataforma integral con aplicación nativa de Windows para la operadora, respuestas automáticas de WhatsApp sin pagar API por mensaje, GPS continuo en Android y liquidación diaria para dueños de flota.
          </motion.p>

          <motion.div {...fade(0.24)} className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#contacto"
              onClick={(e) => { e.preventDefault(); scrollToId("contacto", reduce); }}
              className="inline-flex min-h-[48px] items-center rounded-full bg-amber-400 px-6 text-sm font-bold text-slate-950 shadow-md shadow-amber-400/25 transition-all hover:bg-amber-300 active:scale-[0.98]"
            >
              Solicitar demo
            </a>
            <a
              href="#producto"
              onClick={(e) => { e.preventDefault(); scrollToId("producto", reduce); }}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50"
            >
              Ver el producto
              <ArrowDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </a>
          </motion.div>

          <motion.div {...fade(0.3)} className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <button
              type="button"
              data-testid={LANDING.ctaTerminal}
              onClick={() => navigate("/terminal/login")}
              className="min-h-[40px] font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900"
            >
              Entrar a Central de Despacho
            </button>
            <button
              type="button"
              data-testid={LANDING.ctaDueno}
              onClick={() => navigate("/dueno/login")}
              className="min-h-[40px] font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900"
            >
              Panel Socio / Dueño
            </button>
          </motion.div>

          <motion.ul {...fade(0.36)} className="mt-8 grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {FACTS.map(({ icon: Icon, k, v }) => (
              <li key={k} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
                <div>
                  <div className="text-sm font-bold text-slate-900">{k}</div>
                  <div className="text-xs text-slate-500">{v}</div>
                </div>
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Captura Real del Producto con marco de ventana diurno */}
        <motion.div
          style={reduce ? undefined : { y, scale }}
          {...fade(0.2)}
          className="lg:col-span-7"
        >
          <div className="rounded-2xl border border-slate-200/90 bg-white p-2 shadow-2xl shadow-slate-200/80">
            <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50">
              <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white px-4 py-2.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="ml-3 truncate font-mono text-[11px] text-slate-500 bg-slate-100 px-3 py-0.5 rounded-md border border-slate-200">
                  taxihub.cloud/terminal
                </span>
              </div>
              <picture>
                <source srcSet="/landing/terminal.webp" type="image/webp" />
                <img
                  src="/landing/terminal.png"
                  width="1440"
                  height="900"
                  alt="Terminal real de despacho de TaxiHUB: mapa con las unidades de la central y panel de flota"
                  fetchpriority="high"
                  decoding="async"
                  className="block h-auto w-full object-cover"
                />
              </picture>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
