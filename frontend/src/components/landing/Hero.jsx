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
  const y = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);

  const fade = (delay) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease: EASE } };

  return (
    <section id="inicio" ref={ref} className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 md:pb-28 md:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <motion.p {...fade(0)} className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-300">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="l-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            $99 MXN al mes por unidad
          </motion.p>

          <motion.h1 {...fade(0.08)} className="font-display mt-6 text-[2.5rem] font-extrabold leading-[1.05] text-white sm:text-5xl lg:text-[3.4rem]">
            Tu central de taxis, despachando desde <span className="text-emerald-400">un solo mapa</span>.
          </motion.h1>

          <motion.p {...fade(0.16)} className="mt-6 max-w-lg text-lg leading-relaxed text-[#B4B8C2]">
            TaxiHUB une la terminal de la operadora, la app del chofer y el panel del socio:
            despacho en tiempo real, WhatsApp sin costo por mensaje y liquidación diaria de cuotas.
          </motion.p>

          <motion.div {...fade(0.24)} className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#contacto"
              onClick={(e) => { e.preventDefault(); scrollToId("contacto", reduce); }}
              className="inline-flex min-h-[52px] items-center rounded-full bg-emerald-500 px-7 text-base font-bold text-[#04130D] transition-colors duration-200 hover:bg-emerald-400"
            >
              Solicitar demo
            </a>
            <a
              href="#producto"
              onClick={(e) => { e.preventDefault(); scrollToId("producto", reduce); }}
              className="inline-flex min-h-[52px] items-center gap-2 rounded-full border border-white/15 px-6 text-base font-semibold text-white transition-colors duration-200 hover:bg-white/[0.07]"
            >
              Ver el producto
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </motion.div>

          <motion.div {...fade(0.3)} className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <button
              type="button"
              data-testid={LANDING.ctaTerminal}
              onClick={() => navigate("/terminal")}
              className="min-h-[44px] font-medium text-[#B4B8C2] underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
            >
              Entrar a Central de Despacho
            </button>
            <button
              type="button"
              data-testid={LANDING.ctaDueno}
              onClick={() => navigate("/dueno/login")}
              className="min-h-[44px] font-medium text-[#B4B8C2] underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
            >
              Panel Socio / Dueño
            </button>
          </motion.div>

          <motion.ul {...fade(0.36)} className="mt-8 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {FACTS.map(({ icon: Icon, k, v }) => (
              <li key={k} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                <div>
                  <div className="text-sm font-bold text-white">{k}</div>
                  <div className="text-[13px] leading-snug text-[#9CA0AA]">{v}</div>
                </div>
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          style={reduce ? undefined : { y, scale }}
          {...fade(0.2)}
          className="lg:col-span-7"
        >
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-2 shadow-[0_40px_120px_-40px_rgba(16,185,129,0.35)]">
            <div className="overflow-hidden rounded-[1.4rem] bg-[#0B0D10]">
              <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-3 truncate font-mono text-[11px] text-[#9CA0AA]">taxihub.cloud/terminal</span>
              </div>
              <picture>
                <source srcSet="/landing/terminal.webp" type="image/webp" />
                <img
                  src="/landing/terminal.png"
                  width="1440"
                  height="900"
                  alt="Terminal de despacho de TaxiHUB: mapa con las unidades de la central y panel de flota"
                  fetchpriority="high"
                  decoding="async"
                  className="block h-auto w-full"
                />
              </picture>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
