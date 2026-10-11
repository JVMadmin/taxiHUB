import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Pause, Play, Send } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { EASE, Eyebrow, Reveal } from "./motion";

// Datos de demostración: la simulación NO es telemetría real y así se rotula.
const UNITS = [
  { id: "TX-101", x: 26, y: 40, status: "libre" },
  { id: "TX-104", x: 60, y: 30, status: "ocupado" },
  { id: "TX-108", x: 44, y: 62, status: "libre" },
  { id: "TX-112", x: 70, y: 56, status: "libre" },
  { id: "TX-119", x: 18, y: 66, status: "ocupado" },
  { id: "TX-125", x: 54, y: 44, status: "libre" },
];

const POIS = [
  { key: "1", name: "Terminal ADO", eta: "2 min", unit: "TX-101", x: 14, y: 22 },
  { key: "2", name: "Hospital General", eta: "3 min", unit: "TX-125", x: 80, y: 20 },
  { key: "3", name: "Mercado Central", eta: "1 min", unit: "TX-108", x: 46, y: 80 },
  { key: "4", name: "Zona Arqueológica", eta: "4 min", unit: "TX-112", x: 86, y: 74 },
];

export function DispatchSim() {
  const reduce = useReducedMotion();
  const boxRef = useRef(null);
  const inView = useInView(boxRef, { margin: "-20% 0px" });
  const [paused, setPaused] = useState(!!reduce);
  const [tick, setTick] = useState(0);
  const [assign, setAssign] = useState(null);

  useEffect(() => { if (reduce) setPaused(true); }, [reduce]);

  useEffect(() => {
    if (paused || !inView) return undefined;
    const t = setInterval(() => setTick((n) => (n + 1) % 1000), 1600);
    return () => clearInterval(t);
  }, [paused, inView]);

  const dispatch = (poi) => {
    setAssign({ poi, at: Date.now() });
  };

  const onKey = (e) => {
    const poi = POIS.find((p) => p.key === e.key);
    if (poi) { e.preventDefault(); dispatch(poi); }
  };

  const pos = (u, i) => {
    if (assign && assign.poi.unit === u.id) return { left: assign.poi.x, top: assign.poi.y, jx: 0, jy: 0 };
    const jx = paused ? 0 : (((tick + i * 7) % 5) - 2) * 1.2;
    const jy = paused ? 0 : (((tick + i * 11) % 5) - 2) * 1.2;
    return { left: u.x, top: u.y, jx, jy };
  };

  return (
    <section aria-labelledby="sim-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <Eyebrow>Pruébalo</Eyebrow>
          <h2 id="sim-title" className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Despacha una unidad con un clic.
          </h2>
          <p className="mt-4 text-[#B4B8C2]">
            Así se siente la botonera de puntos calientes de la operadora. Elige un destino
            (o pulsa <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white">1</kbd>–<kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white">4</kbd>) y mira cómo se asigna la unidad libre más cercana.
          </p>
          <p className="mt-3 text-sm text-[#9CA0AA]">Simulación de demostración con datos de ejemplo.</p>
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-8">
          <div
            ref={boxRef}
            data-testid={LANDING.simulator}
            tabIndex={0}
            onKeyDown={onKey}
            role="group"
            aria-label="Simulador interactivo de despacho. Pulsa 1 a 4 para despachar a un punto."
            className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-2 outline-offset-4"
          >
            <div className="rounded-[1.4rem] bg-[#0B0D10] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
                <span className="font-mono text-xs font-medium uppercase tracking-wider text-[#B4B8C2]">Demo · {UNITS.length} unidades de ejemplo</span>
                <button
                  type="button"
                  data-testid={LANDING.simulatorPause}
                  onClick={() => setPaused((p) => !p)}
                  aria-pressed={paused}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/[0.07]"
                >
                  {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
                  {paused ? "Reanudar movimiento" : "Pausar movimiento"}
                </button>
              </div>

              <div className="l-grid-bg relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#07090D]">
                {POIS.map((p) => (
                  <div key={p.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-hidden="true">
                    <span className={`block h-3 w-3 rounded-full border-2 ${assign?.poi.key === p.key ? "border-emerald-400 bg-emerald-400" : "border-white/40 bg-transparent"}`} />
                    <span className="absolute left-4 top-1/2 hidden -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-[#9CA0AA] sm:block">{p.name}</span>
                  </div>
                ))}

                {UNITS.map((u, i) => {
                  const { left, top, jx, jy } = pos(u, i);
                  const chosen = assign?.poi.unit === u.id;
                  return (
                    <div
                      key={u.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        transform: `translate3d(${jx}px, ${jy}px, 0) translate(-50%, -50%)`,
                        transition: reduce ? "none" : "left 1.2s cubic-bezier(.32,.72,0,1), top 1.2s cubic-bezier(.32,.72,0,1), transform 1.4s cubic-bezier(.32,.72,0,1)",
                      }}
                    >
                      <div
                        className={`flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] font-semibold ${
                          chosen
                            ? "bg-emerald-400 text-[#04130D] ring-4 ring-emerald-400/25"
                            : u.status === "libre"
                            ? "border border-emerald-500/50 bg-[#0B0D10]/90 text-emerald-300"
                            : "border border-amber-500/50 bg-[#0B0D10]/90 text-amber-300"
                        }`}
                      >
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {u.id}
                      </div>
                    </div>
                  );
                })}

                <div className="pointer-events-none absolute inset-x-3 bottom-3" aria-live="polite">
                  <AnimatePresence mode="wait">
                    {assign && (
                      <motion.div
                        key={assign.at}
                        initial={reduce ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-[#0B0D10]/95 px-4 py-2.5 text-xs"
                      >
                        <span className="flex items-center gap-2 font-semibold text-emerald-300">
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          {assign.poi.unit} despachada a {assign.poi.name}
                        </span>
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-300">ETA {assign.poi.eta}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {POIS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => dispatch(p)}
                    aria-pressed={assign?.poi.key === p.key}
                    className={`min-h-[56px] rounded-xl border px-3 py-2 text-left transition-colors duration-200 ${
                      assign?.poi.key === p.key
                        ? "border-emerald-500/60 bg-emerald-500/15 text-white"
                        : "border-white/10 bg-white/[0.03] text-[#B4B8C2] hover:border-white/25 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center justify-between font-mono text-[10px]">
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-white">{p.key}</span>
                      <span className="text-emerald-300">{p.eta}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs font-bold text-white">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
