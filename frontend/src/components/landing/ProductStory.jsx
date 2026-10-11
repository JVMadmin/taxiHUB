import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Smartphone, Building2, Volume2, MapPin, Camera, Zap, CheckCircle2 } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { EASE, Eyebrow, Reveal } from "./motion";

const STEPS = [
  {
    id: "terminal",
    icon: Monitor,
    tag: "Terminal Central · Windows y Web",
    title: "Todas las unidades en un mapa, un clic para despachar.",
    body: "La operadora ve la flota en tiempo real sobre el mapa de Palenque, despacha desde el menú contextual o con atajos de teclado (F2, 1–6) y asigna la unidad libre más cercana automáticamente.",
    img: "terminal",
    alt: "Terminal real de despacho con mapa y unidades en vivo",
    w: 1440,
    h: 900,
    aspect: "landscape",
    highlights: [
      "Mapa interactivo de Palenque con capas de satélite y calles",
      "Asignación automática por cercanía GPS o 1-clic manual",
      "Atajos de teclado instantáneos (F2 nueva llamada, 1-6 asignar)",
      "WhatsApp integrado por código QR sin costo por mensaje",
    ],
  },
  {
    id: "operador",
    icon: Smartphone,
    tag: "App del Chofer · Android Nativa",
    title: "GPS continuo y ofertas por voz, sin tocar el teléfono.",
    body: "Diseñada específicamente para los taxistas: servicio de segundo plano activo con la pantalla apagada en el bolsillo, síntesis de voz IA que lee el destino al instante y fotos de odómetro y combustible al abrir y cerrar turno.",
    img: "operador",
    alt: "App real del operador en Android con mapa y turno activo",
    w: 390,
    h: 844,
    aspect: "portrait",
    highlights: [
      "GPS en 2° plano continuo con pantalla apagada en el bolsillo",
      "Síntesis de voz IA: lee destino y detalles sin mirar la pantalla",
      "Fotos obligatorias de odómetro y gasolina para auditar turnos",
      "Aceptación rápida en 1 toque y navegación directa",
    ],
  },
  {
    id: "socio",
    icon: Building2,
    tag: "Panel del Socio · Android y Web",
    title: "El dueño fija la cuota, audita y confirma el efectivo.",
    body: "Control integral de cada vehículo de la concesión: cuota diaria configurada, auditoría de fotografías del tablero al cierre de turno y confirmación de recepción de liquidaciones en tiempo real.",
    img: "socio",
    alt: "Panel real del socio y concesionario dueño de flota",
    w: 1440,
    h: 900,
    aspect: "landscape",
    highlights: [
      "Monitoreo de recaudación y cuotas fijadas por unidad",
      "Auditoría fotográfica del tablero al inicio y fin de jornada",
      "Registro de gastos de mantenimiento y liquidaciones en efectivo",
      "Acceso web y móvil seguro para inversionistas",
    ],
  },
];

export function ProductStory() {
  const [active, setActive] = useState(0);
  const current = STEPS[active];

  return (
    <section id="producto" aria-labelledby="story-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>El producto real</Eyebrow>
        <h2 id="story-title" className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
          Tres herramientas sincronizadas en tiempo real.
        </h2>
        <p className="mt-3 text-base text-slate-600">
          La central despacha en segundos, el chofer recibe las ofertas por voz y el dueño supervisa sus unidades e ingresos diarios.
        </p>
      </Reveal>

      {/* Selector de pestañas interactivas */}
      <div className="mt-10 flex flex-wrap gap-3" role="tablist" aria-label="Herramientas del sistema">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isSelected = active === i;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={isSelected}
              data-testid={`${LANDING.storyStep}-${i + 1}`}
              onClick={() => setActive(i)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50/80 text-emerald-950 shadow-md ring-2 ring-emerald-500/20"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                  isSelected
                    ? "border-emerald-400 bg-emerald-600 text-white shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Paso {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-sm font-bold text-slate-900">{s.tag.split("·")[0].trim()}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Contenedor principal con vista activa */}
      <div className="mt-8 rounded-3xl border border-slate-200/90 bg-slate-50/50 p-6 shadow-xl sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="grid items-center gap-8 lg:grid-cols-12"
          >
            {/* Columna de información y beneficios */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1 font-mono text-xs font-bold text-emerald-800 shadow-xs">
                <current.icon className="h-4 w-4 text-emerald-600" />
                <span>{current.tag}</span>
              </div>

              <h3 className="font-display text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
                {current.title}
              </h3>

              <p className="text-base leading-relaxed text-slate-600">
                {current.body}
              </p>

              {/* Lista de características clave */}
              <div className="space-y-3 pt-2">
                {current.highlights.map((h, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-sm font-medium text-slate-700">{h}</span>
                  </div>
                ))}
              </div>

              {current.id === "operador" && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-xs leading-relaxed text-sky-900">
                  <div className="font-bold flex items-center gap-1.5 text-sky-950 mb-1">
                    <Volume2 className="h-4 w-4 text-sky-600" /> Lectura por voz en altavoz
                  </div>
                  Cuando la central asigna un viaje, la app reproduce automáticamente por voz:{" "}
                  <em>"Nuevo servicio: Calle Central a Pakal-Ná, tarifa cuarenta pesos"</em> sin que el chofer desvíe la mirada del volante.
                </div>
              )}
            </div>

            {/* Columna de visualización: Mockup enmarcado según formato */}
            <div className="lg:col-span-7 flex justify-center">
              {current.aspect === "portrait" ? (
                /* Marco auténtico de teléfono móvil Android para la app del chofer */
                <div className="relative mx-auto w-full max-w-[320px] rounded-[38px] border-[8px] border-slate-900 bg-slate-950 p-2 shadow-2xl shadow-slate-900/25 ring-1 ring-slate-800">
                  {/* Bocina / cámara superior */}
                  <div className="mx-auto mb-2 h-4 w-28 rounded-full bg-slate-900 flex items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-slate-800" />
                  </div>
                  {/* Pantalla del teléfono */}
                  <div className="overflow-hidden rounded-[26px] bg-slate-900">
                    <picture>
                      <source srcSet={`/landing/${current.img}.webp`} type="image/webp" />
                      <img
                        src={`/landing/${current.img}.png`}
                        width={current.w}
                        height={current.h}
                        alt={current.alt}
                        loading="eager"
                        decoding="async"
                        className="block h-auto w-full object-cover"
                      />
                    </picture>
                  </div>
                  {/* Barra de inicio inferior */}
                  <div className="mx-auto mt-2 h-1 w-20 rounded-full bg-slate-700" />
                </div>
              ) : (
                /* Marco de monitor / ventana de escritorio para Terminal y Socio */
                <div className="w-full rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl shadow-slate-200/80">
                  <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50">
                    <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white px-4 py-2.5" aria-hidden="true">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span className="ml-3 truncate font-mono text-[11px] text-slate-500 bg-slate-100 px-3 py-0.5 rounded-md border border-slate-200">
                        taxihub.cloud/{current.id === "terminal" ? "terminal" : "dueno"}
                      </span>
                    </div>
                    <picture>
                      <source srcSet={`/landing/${current.img}.webp`} type="image/webp" />
                      <img
                        src={`/landing/${current.img}.png`}
                        width={current.w}
                        height={current.h}
                        alt={current.alt}
                        loading="eager"
                        decoding="async"
                        className="block h-auto w-full object-cover"
                      />
                    </picture>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
