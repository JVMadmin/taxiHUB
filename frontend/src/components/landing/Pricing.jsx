import { Minus, Plus, Check } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

export const PRECIO_UNIDAD_MXN = 99;
const fmt = (n) => new Intl.NumberFormat("es-MX").format(n);

export function Pricing({ units, setUnits }) {
  const clamp = (n) => Math.max(1, Math.min(999, Math.round(Number(n) || 1)));
  const total = units * PRECIO_UNIDAD_MXN;

  return (
    <section id="precio" aria-labelledby="precio-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid items-start gap-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <Eyebrow>Precio</Eyebrow>
          <h2 id="precio-title" className="font-display l-titulo mt-3">
            Solo pagas por unidad activa.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#a1a6b2]">
            Un precio fijo por unidad para cooperativas, agrupaciones y sitios de radio taxi. Sin comisiones por viaje.
          </p>

          <div className="mt-6 space-y-3">
            {[
"WhatsApp de la central por QR, sin costo por mensaje",
"Todas las terminales de despacho que necesites",
"App para todos tus choferes y socios",
"Mapa de tu ciudad con tus puntos frecuentes",
            ].map((feature, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-sm text-[#d4d7de]">
                <Check className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 text-xs text-amber-100/90">
            <strong className="font-bold">Pago único de implementación inicial:</strong> Incluye la carga personalizada del mapa de tu ciudad, el alta de tus sitios y colonias con tarifas oficiales, y la capacitación directa a tus despachadoras.
          </div>
        </Reveal>

        {/* Tarjeta Calculadora Diurna */}
        <Reveal delay={0.1} className="lg:col-span-7">
          <div
            data-testid={LANDING.priceCard}
            className="rounded-3xl border-2 border-emerald-500/30 bg-white/[0.03] p-7 sm:p-9 "
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.08] pb-6">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-300 bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/25">
                  Plan Central
                </span>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-4xl sm:text-5xl font-extrabold text-white">
                    $99
                  </span>
                  <span className="font-mono text-sm font-semibold text-[#8b909c]">
                    MXN / mes por unidad
                  </span>
                </div>
              </div>
            </div>

            {/* Selector de Unidades */}
            <div className="mt-7">
              <label htmlFor="units-input" className="block text-xs font-bold uppercase tracking-wider text-[#d4d7de]">
                Calcula el costo para tu flota:
              </label>

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setUnits((u) => clamp(u - 5))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#d4d7de] hover:bg-white/10 transition-colors"
                  aria-label="Restar 5 unidades"
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="flex-1">
                  <input
                    id="units-input"
                    type="number"
                    min="1"
                    max="999"
                    value={units}
                    onChange={(e) => setUnits(clamp(e.target.value))}
                    data-testid={LANDING.priceUnits}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-center font-mono text-2xl font-extrabold text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setUnits((u) => clamp(u + 5))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#d4d7de] hover:bg-white/10 transition-colors"
                  aria-label="Sumar 5 unidades"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Slider interactivo */}
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
                className="mt-4 w-full accent-emerald-400"
              />
            </div>

            {/* Total estimado */}
            <div
              data-testid={LANDING.priceTotal}
              className="mt-7 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5 flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-emerald-200 block">Total mensual estimado:</span>
                <span className="font-mono text-xs text-[#8b909c]">{units} unidades activas</span>
              </div>
              <div className="text-right">
                <div className="font-display font-mono text-3xl sm:text-4xl font-extrabold text-emerald-300">
                  ${fmt(total)} <span className="text-sm font-semibold text-emerald-200">MXN</span>
                </div>
              </div>
            </div>

            <a
              href="#contacto"
              className="mt-6 block w-full rounded-xl bg-emerald-500 py-3.5 text-center text-sm font-bold text-[#02130c]  transition-all hover:bg-emerald-400 active:scale-[0.98]"
            >
              Solicitar cotización e instalación
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
