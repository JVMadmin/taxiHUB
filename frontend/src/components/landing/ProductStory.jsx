import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Smartphone, Building2, Volume2, CheckCircle2 } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { EASE, Eyebrow, Reveal } from "./motion";

const STEPS = [
  {
    id: "terminal",
    icon: Monitor,
    tag: "Central de despacho · Web y Windows",
    title: "Toda tu flota en un mapa, y el viaje asignado en segundos.",
    body: "La operadora ve cada unidad en vivo sobre el mapa de su ciudad, toma la llamada o el WhatsApp y asigna la unidad libre más cercana con un clic o con atajos de teclado.",
    img: "terminal",
    alt: "Central de despacho real de TaxiHUB con las unidades de Palenque en el mapa",
    w: 1440,
    h: 900,
    aspect: "landscape",
    highlights: [
      "Mapa con calles, satélite y colonias de tu ciudad",
      "Asignación por cercanía GPS o elección manual de la unidad",
      "Atajos de teclado: F2 nueva llamada, 1–6 elegir unidad",
      "WhatsApp de la central dentro de la misma pantalla",
    ],
  },
  {
    id: "operador",
    icon: Smartphone,
    tag: "App del chofer · Android",
    title: "Navegación 3D al cliente y el viaje leído en voz alta.",
    body: "El chofer recibe la oferta con voz, la acepta con un toque y sigue la ruta en un mapa 3D con distancia y tiempo de llegada. Su ubicación se sigue enviando aunque apague la pantalla.",
    img: "operador",
    alt: "App real del chofer con navegación 3D hacia el cliente en Palenque",
    w: 390,
    h: 844,
    aspect: "portrait",
    highlights: [
      "Mapa 3D con edificios y relieve que gira con el taxi",
      "Lectura del viaje por voz: no tiene que mirar la pantalla",
      "GPS en segundo plano con la pantalla apagada",
      "Fotos de odómetro y gasolina al abrir y cerrar turno",
    ],
  },
  {
    id: "socio",
    icon: Building2,
    tag: "Panel del socio · Web y Android",
    title: "El dueño ve sus ingresos del día y dónde está cada unidad.",
    body: "Cada socio revisa sus taxis en el mapa, los servicios e ingresos del día, fija la cuota por turno y confirma el efectivo recibido, sin cuentas en papel.",
    img: "socio",
    alt: "Panel real del socio con servicios e ingresos del día",
    w: 1440,
    h: 900,
    aspect: "landscape",
    highlights: [
      "Ingresos y servicios del día por unidad",
      "Cuota por turno y confirmación del efectivo recibido",
      "Fotos del tablero al inicio y cierre de cada turno",
      "Mantenimiento y gastos de cada vehículo",
    ],
  },
];

export function ProductStory() {
  const [active, setActive] = useState(0);
  const current = STEPS[active];

  return (
    <section id="producto" aria-labelledby="story-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <Reveal className="max-w-2xl">
        <Eyebrow>El producto real</Eyebrow>
        <h2 id="story-title" className="font-display l-titulo mt-3">
          Tres apps, una sola operación.
        </h2>
        <p className="l-texto mt-4">
          La central despacha, el chofer llega y el dueño cobra: todos ven lo mismo, en tiempo real.
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
                  ? "border-emerald-400/50 bg-emerald-400/10 text-white"
                  : "border-white/10 bg-white/[0.03] text-[#a1a6b2] hover:border-white/20 hover:bg-white/[0.06]"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                  isSelected
                    ? "border-emerald-300 bg-emerald-500 text-[#02130c]"
                    : "border-white/10 bg-white/5 text-[#a1a6b2]"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Paso {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-sm font-bold text-white">{s.tag.split("·")[0].trim()}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Contenedor principal con vista activa */}
      <div className="l-card mt-8 p-6 sm:p-10">
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
              <div className="l-chip font-mono">
                <current.icon className="h-4 w-4" />
                <span>{current.tag}</span>
              </div>

              <h3 className="font-display text-2xl font-extrabold leading-tight sm:text-[2rem]">
                {current.title}
              </h3>

              <p className="l-texto">
                {current.body}
              </p>

              {/* Lista de características clave */}
              <div className="space-y-3 pt-2">
                {current.highlights.map((h, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="text-sm font-medium text-[#d4d7de]">{h}</span>
                  </div>
                ))}
              </div>

              {current.id === "operador" && (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] p-4 text-xs leading-relaxed text-sky-100/90">
                  <div className="font-bold flex items-center gap-1.5 text-white mb-1">
                    <Volume2 className="h-4 w-4 text-sky-300" /> Lectura por voz en altavoz
                  </div>
                  Cuando la central asigna un viaje, la app reproduce automáticamente por voz:{" "}
                  <em>"Nuevo servicio: Terminal ADO a la Zona Arqueológica"</em> sin que el chofer quite la vista del camino.
                </div>
              )}
            </div>

            {/* Columna de visualización: Mockup enmarcado según formato */}
            <div className="lg:col-span-7 flex justify-center">
              {current.aspect === "portrait" ? (
                /* Marco auténtico de teléfono móvil Android para la app del chofer */
                <div className="l-telefono relative mx-auto w-full max-w-[310px]">
                  {/* Bocina / cámara superior */}
                  <div className="absolute left-1/2 top-4 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />
                  {/* Pantalla del teléfono */}
                  <div className="overflow-hidden rounded-[36px] bg-black">
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
                </div>
              ) : (
                /* Marco de monitor / ventana de escritorio para Terminal y Socio */
                <div className="l-ventana w-full">
                  <div className="overflow-hidden rounded-[14px] bg-black">
                    <div className="flex items-center gap-2 px-3 py-2" aria-hidden="true">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                      <span className="ml-3 truncate rounded-md bg-white/5 px-3 py-0.5 font-mono text-[11px] text-[#a1a6b2]">
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
