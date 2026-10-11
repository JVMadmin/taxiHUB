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
    body: "La operadora ve la flota en tiempo real sobre el mapa de Palenque, despacha desde el menú contextual o con atajos de teclado (F2, 1–6) y asigna la unidad libre más cercana.",
    img: "terminal",
    alt: "Terminal real de despacho con mapa y unidades en vivo",
    w: 1440, h: 900,
  },
  {
    icon: Smartphone,
    tag: "App del chofer · Android nativa",
    title: "GPS continuo y ofertas por voz, sin tocar el teléfono.",
    body: "Servicio de segundo plano activo con la pantalla apagada, síntesis de voz IA para lectura de viajes y registro de fotos de odómetro y combustible al abrir y cerrar turno.",
    img: "operador",
    alt: "App real del operador en Android con mapa y turno activo",
    w: 390, h: 844,
  },
  {
    icon: Building2,
    tag: "Panel del socio · Android y web",
    title: "El dueño fija la cuota, audita y confirma el efectivo.",
    body: "Control de cuota diaria por vehículo, auditoría de fotografías del tablero al cierre de turno y confirmación de recepción de liquidaciones en tiempo real.",
    img: "socio",
    alt: "Panel real del socio y concesionario dueño de flota",
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
        className={portrait ? "mx-auto block h-auto max-h-[560px] w-auto rounded-xl shadow-lg border border-slate-200" : "block h-auto w-full rounded-lg object-cover"}
      />
    </picture>
  );
}

function Frame({ children }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl shadow-slate-200/80">
      <div className="overflow-hidden rounded-xl bg-slate-50">{children}</div>
    </div>
  );
}

function StepText({ s, i, active }) {
  const Icon = s.icon;
  return (
    <div className={`transition-opacity duration-300 ${active ? "opacity-100" : "opacity-40"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${active ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm" : "border-slate-200 bg-white text-slate-400"}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-200">
          {String(i + 1).padStart(2, "0")} · {s.tag}
        </span>
      </div>
      <h3 className="font-display mt-4 text-2xl font-extrabold leading-snug text-slate-900">{s.title}</h3>
      <p className="mt-3 max-w-md text-base leading-relaxed text-slate-600">{s.body}</p>
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

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (!sticky) return;
    const idx = Math.min(STEPS.length - 1, Math.max(0, Math.floor(latest * STEPS.length)));
    setActive(idx);
  });

  return (
    <section id="producto" aria-labelledby="story-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>El producto real</Eyebrow>
        <h2 id="story-title" className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
          Tres herramientas sincronizadas en tiempo real.
        </h2>
        <p className="mt-3 text-base text-slate-600">
          La central despacha, el chofer recibe por voz y el dueño supervisa sus ingresos diarios desde cualquier lugar.
        </p>
      </Reveal>

      {sticky ? (
        <div ref={ref} className="relative mt-16 h-[280vh]">
          <div className="sticky top-24 grid grid-cols-12 items-center gap-10">
            <div className="col-span-5 space-y-12">
              {STEPS.map((s, i) => (
                <div key={s.img} data-testid={`${LANDING.storyStep}-${i + 1}`}>
                  <StepText s={s} i={i} active={active === i} />
                </div>
              ))}
            </div>

            <div className="relative col-span-7">
              <Frame>
                <div className="relative grid">
                  {STEPS.map((s, i) => (
                    <motion.div
                      key={s.img}
                      aria-hidden={active !== i}
                      className="col-start-1 row-start-1 flex items-center justify-center p-1"
                      initial={false}
                      animate={{ opacity: active === i ? 1 : 0, scale: active === i ? 1 : 0.98 }}
                      transition={{ duration: 0.4, ease: EASE }}
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
            <Reveal key={s.img} className="grid items-center gap-8 md:grid-cols-2" data-testid={`${LANDING.storyStep}-${i + 1}`}>
              <StepText s={s} i={i} active />
              <Frame><Shot s={s} eager={false} /></Frame>
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
