import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { Monitor, Smartphone, Building2 } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { EASE, Eyebrow, Reveal, useMediaQuery } from "./motion";

const STEPS = [
  {
    icon: Monitor,
    tag: "Terminal de la operadora · Windows y web",
    title: "Todas las unidades en un mapa, un clic para despachar.",
    body: "La operadora ve la flota en tiempo real, despacha desde el menú contextual del mapa o con atajos de teclado (F2, 1–6) y asigna la unidad libre más cercana.",
    img: "terminal",
    alt: "Terminal de despacho con mapa de unidades",
    w: 1440, h: 900,
  },
  {
    icon: Smartphone,
    tag: "App del chofer · Android",
    title: "GPS continuo y ofertas por voz, sin tocar el teléfono.",
    body: "Ubicación con la pantalla apagada, lectura de viajes con voz IA y fotos de odómetro y combustible al abrir y cerrar turno.",
    img: "operador",
    alt: "App del operador con mapa y estado de turno",
    w: 390, h: 844,
  },
  {
    icon: Building2,
    tag: "Panel del socio · Android y web",
    title: "El dueño fija la cuota, audita y confirma el efectivo.",
    body: "Cuota diaria por unidad, fotos del tablero al cierre del turno y confirmación de recepción de efectivo, todo desde su propio panel.",
    img: "socio",
    alt: "Panel del socio dueño de flota",
    w: 1440, h: 900,
  },
];

function Shot({ s, eager }) {
  const portrait = s.h > s.w;
  return (
    <picture>
      <source srcSet={`/landing/${s.img}.webp`} type="image/webp" />
      <img
        src={`/landing/${s.img}.png`}
        width={s.w}
        height={s.h}
        alt={s.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={portrait ? "mx-auto block h-auto max-h-[560px] w-auto rounded-[1.4rem]" : "block h-auto w-full"}
      />
    </picture>
  );
}

function Frame({ children }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-2">
      <div className="overflow-hidden rounded-[1.4rem] bg-[#0B0D10]">{children}</div>
    </div>
  );
}

function StepText({ s, i, active }) {
  const Icon = s.icon;
  return (
    <div className={`transition-opacity duration-300 ${active ? "opacity-100" : "opacity-45"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${active ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/[0.04] text-[#9CA0AA]"}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#B4B8C2]">{String(i + 1).padStart(2, "0")} · {s.tag}</span>
      </div>
      <h3 className="font-display mt-4 text-2xl font-bold leading-snug text-white">{s.title}</h3>
      <p className="mt-3 max-w-md text-[#B4B8C2]">{s.body}</p>
    </div>
  );
}

export function ProductStory() {
  const reduce = useReducedMotion();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const sticky = desktop && !reduce;
  const ref = useRef(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const i = Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)));
    setActive((cur) => (cur === i ? cur : i));
  });

  return (
    <section id="producto" aria-labelledby="producto-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>El producto</Eyebrow>
        <h2 id="producto-title" className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
          Tres aplicaciones, una sola central.
        </h2>
        <p className="mt-4 text-[#B4B8C2]">
          Capturas reales de TaxiHUB funcionando con datos de demostración.
        </p>
      </Reveal>

      {sticky ? (
        <div ref={ref} className="mt-12 h-[260vh]">
          <div className="sticky top-28 grid grid-cols-12 items-center gap-10">
            <div className="col-span-5">
              <div className="space-y-10">
                {STEPS.map((s, i) => (
                  <div key={s.img} data-testid={`${LANDING.storyStep}-${i + 1}`} aria-current={active === i}>
                    <StepText s={s} i={i} active={active === i} />
                  </div>
                ))}
              </div>
            </div>
            <div className="relative col-span-7">
              <Frame>
                <div className="relative grid">
                  {STEPS.map((s, i) => (
                    <motion.div
                      key={s.img}
                      aria-hidden={active !== i}
                      className="col-start-1 row-start-1 flex items-center justify-center"
                      initial={false}
                      animate={{ opacity: active === i ? 1 : 0, scale: active === i ? 1 : 0.985 }}
                      transition={{ duration: 0.5, ease: EASE }}
                    >
                      <Shot s={s} eager={i === 0} />
                    </motion.div>
                  ))}
                </div>
              </Frame>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-12 grid gap-14">
          {STEPS.map((s, i) => (
            <Reveal key={s.img} className="grid items-center gap-6 md:grid-cols-2" data-testid={`${LANDING.storyStep}-${i + 1}`}>
              <StepText s={s} i={i} active />
              <Frame><Shot s={s} eager={false} /></Frame>
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
