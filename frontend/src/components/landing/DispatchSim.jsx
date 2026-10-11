import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Play, Pause, Zap } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

export const UNITS = [
  { id: "TX-101", x: 28, y: 36, status: "libre", driver: "Carlos M.", speed: "32 km/h" },
  { id: "TX-104", x: 62, y: 28, status: "ocupado", driver: "Roberto G.", speed: "40 km/h" },
  { id: "TX-108", x: 46, y: 58, status: "libre", driver: "Miguel A.", speed: "28 km/h" },
  { id: "TX-112", x: 74, y: 64, status: "libre", driver: "Jorge L.", speed: "35 km/h" },
  { id: "TX-119", x: 22, y: 68, status: "ocupado", driver: "Luis F.", speed: "44 km/h" },
  { id: "TX-125", x: 53, y: 42, status: "libre", driver: "Fernando R.", speed: "30 km/h" },
];

export const HOTSPOTS = [
  { key: "1", name: "Terminal ADO", eta: "2 min", unit: "TX-101" },
  { key: "2", name: "Hospital General", eta: "3 min", unit: "TX-125" },
  { key: "3", name: "Mercado Central", eta: "1 min", unit: "TX-108" },
  { key: "4", name: "Zona Arqueológica", eta: "4 min", unit: "TX-112" },
];

export function DispatchSim() {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState(HOTSPOTS[0]);
  const [pulse, setPulse] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (paused || reduce) return;
    const t = setInterval(() => setTick((v) => (v + 1) % 100), 2000);
    return () => clearInterval(t);
  }, [paused, reduce]);

  const dispatch = (poi) => {
    setSelected(poi);
    setPulse(true);
    setTimeout(() => setPulse(false), 2400);
  };

  return (
    <section
      id="simulador"
      aria-labelledby="sim-title"
      className="border-y border-slate-200/80 bg-slate-50/70 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <Reveal>
            <Eyebrow>Simulador interactivo</Eyebrow>
            <h2 id="sim-title" className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Pruébalo ahora: despacho en 1 clic.
            </h2>
            <p className="mt-3 max-w-xl text-slate-600">
              Presiona cualquier punto caliente para asignar automáticamente la unidad más cercana y disparar el aviso por WhatsApp.
            </p>
          </Reveal>

          <button
            type="button"
            data-testid={LANDING.simulatorPause}
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            {paused ? <Play className="h-3.5 w-3.5 text-emerald-600" /> : <Pause className="h-3.5 w-3.5 text-slate-500" />}
            <span>{paused ? "Reanudar radar" : "Pausar radar"}</span>
          </button>
        </div>

        {/* Panel del Simulador Diurno */}
        <div
          data-testid={LANDING.simulator}
          className="mt-8 rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>RADAR DE FLOTA EN VIVO</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-slate-500">
              <span>Unidades activas: <strong className="text-slate-900">25</strong></span>
              <span>·</span>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Respuesta: 1.2s
              </span>
            </div>
          </div>

          {/* Mapa diurno táctico estilizado */}
          <div className="relative mt-4 h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-[#F1F5F9] sm:h-80">
            {/* Cuadrícula limpia de mapa */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(15, 23, 42, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(15, 23, 42, 0.08) 1px, transparent 1px)",
                backgroundSize: "36px 36px",
              }}
            />

            {/* Anillos concéntricos de radar */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/20" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/30" />

            {/* Calles viales estilizadas en gris claro */}
            <svg className="absolute inset-0 h-full w-full opacity-30" aria-hidden="true">
              <line x1="0" y1="90" x2="100%" y2="90" stroke="#64748B" strokeWidth="4" />
              <line x1="0" y1="210" x2="100%" y2="210" stroke="#64748B" strokeWidth="4" />
              <line x1="30%" y1="0" x2="30%" y2="100%" stroke="#64748B" strokeWidth="3" />
              <line x1="70%" y1="0" x2="70%" y2="100%" stroke="#64748B" strokeWidth="3" />
            </svg>

            {/* Marcadores de Taxis Diurnos */}
            {UNITS.map((u, i) => {
              const dx = ((tick + i * 5) % 7) - 3;
              const dy = ((tick + i * 9) % 7) - 3;
              const isTarget = selected.unit === u.id;
              return (
                <div
                  key={u.id}
                  style={{ left: `${u.x + (reduce ? 0 : dx)}%`, top: `${u.y + (reduce ? 0 : dy)}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ease-out"
                >
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold shadow-md ${
                      isTarget && pulse
                        ? "bg-emerald-600 text-white ring-4 ring-emerald-300"
                        : u.status === "libre"
                        ? "bg-white text-emerald-800 border-2 border-emerald-500"
                        : "bg-white text-amber-800 border-2 border-amber-500"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${isTarget && pulse ? "bg-white" : u.status === "libre" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span>#{u.id}</span>
                  </div>
                </div>
              );
            })}

            {/* Notificación flotante de despacho */}
            <AnimatePresence>
              {pulse && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-emerald-300 bg-white/95 px-4 py-3 shadow-xl text-slate-900"
                >
                  <div>
                    <div className="flex items-center gap-2 font-bold text-emerald-700 text-sm">
                      <Zap className="h-4 w-4" />
                      <span>#{selected.unit} asignado a {selected.name}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Auto-respuesta enviada por WhatsApp con placas y tiempo estimado ({selected.eta}).
                    </p>
                  </div>
                  <span className="hidden sm:inline-block rounded-md bg-emerald-100 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-800">
                    EN CAMINO
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Botonera de Puntos Calientes (1-Clic) */}
          <div className="mt-5">
            <div className="mb-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              Botonera rápida de puntos calientes:
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HOTSPOTS.map((poi) => {
                const active = selected.key === poi.key;
                return (
                  <button
                    key={poi.key}
                    type="button"
                    onClick={() => dispatch(poi)}
                    className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
                      active
                        ? "border-emerald-500 bg-emerald-50/70 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">
                        [{poi.key}]
                      </span>
                      <span className="text-emerald-700 font-bold">{poi.eta}</span>
                    </div>
                    <span className="mt-1 font-bold text-sm text-slate-900 truncate">{poi.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
